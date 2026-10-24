// Checks every expected URL against a target, then holds the results against
// the pending list.
import { parse } from 'node-html-parser';
import type { ExpectedUrl } from './expected-urls.ts';
import {
	LOWERCASE_PERCENT_ENCODED_PATHS,
	type LowercasePercentEncodedPaths,
	NOT_FOUND_PAGE_TITLE,
	PRODUCTION,
	SITE_ORIGIN,
	TITLE_FORMAT,
} from './settings.ts';
import { fetchReply, type Production, type Reply, type Target } from './targets.ts';

const CONCURRENT_URLS = 8;

export type UrlResult = {
	url: string;
	outcome: 'pass' | 'fail' | 'skip';
	/** Why the URL failed or was skipped; empty when it passed. */
	problems: string[];
};

export type Report = {
	target: string;
	results: UrlResult[];
	/** Failed, and not on the pending list. */
	failing: UrlResult[];
	/** On the pending list, but passed: take them off the list. */
	nowPassing: string[];
	/** On the pending list, but not expected URLs: take them off the list. */
	notExpected: string[];
	/** What is wrong with the pending list's order. */
	pendingListProblems: string[];
	/** True when the check passes as a whole. */
	ok: boolean;
};

export async function checkUrls({
	expected,
	target,
	pendingList,
	lowercasePercentEncodedPaths = LOWERCASE_PERCENT_ENCODED_PATHS,
}: {
	expected: ExpectedUrl[];
	target: Target;
	pendingList: string;
	lowercasePercentEncodedPaths?: LowercasePercentEncodedPaths;
}): Promise<Report> {
	const check = async (entry: ExpectedUrl): Promise<UrlResult> => {
		const skipReason = target.cannotCheck?.(toRequestPath(entry.url));
		if (skipReason) {
			return { url: entry.url, outcome: 'skip', problems: [skipReason] };
		}
		const problems = await checkUrl(entry, target, lowercasePercentEncodedPaths).catch(
			(error: Error) => [`request failed: ${error.message}`],
		);
		return { url: entry.url, outcome: problems.length === 0 ? 'pass' : 'fail', problems };
	};
	// A few URLs at a time, keeping the results in the order of `expected`.
	const results: UrlResult[] = new Array(expected.length);
	let next = 0;
	const worker = async () => {
		while (next < expected.length) {
			const index = next++;
			results[index] = await check(expected[index]!);
		}
	};
	await Promise.all(Array.from({ length: CONCURRENT_URLS }, worker));
	if (target.production) {
		results.push(...(await wwwResults(target.production)));
	}

	const entries = pendingEntries(pendingList);
	const pending = new Set(entries.map(({ url }) => url));
	const failing = results.filter(({ url, outcome }) => outcome === 'fail' && !pending.has(url));
	const nowPassing = results
		.filter(({ url, outcome }) => outcome === 'pass' && pending.has(url))
		.map(({ url }) => url);
	const checkedUrls = new Set(results.map(({ url }) => url));
	const notExpected = [...pending].filter((url) => !checkedUrls.has(url));
	const pendingListProblems = orderProblems(entries);
	return {
		target: target.name,
		results,
		failing,
		nowPassing,
		notExpected,
		pendingListProblems,
		ok:
			failing.length === 0 &&
			nowPassing.length === 0 &&
			notExpected.length === 0 &&
			pendingListProblems.length === 0,
	};
}

/** The report as printed by the command line. */
export function formatReport(report: Report, pendingListFile: string): string {
	const count = (outcome: UrlResult['outcome']) =>
		report.results.filter((result) => result.outcome === outcome).length;
	const pendingFailures = count('fail') - report.failing.length;
	const lines = [
		`URL check of ${report.target}: ${count('pass')} passed, ${pendingFailures} failed as pending, ` +
			`${count('skip')} skipped, ${report.failing.length} failed`,
	];
	const section = (heading: string, items: string[]) => {
		if (items.length > 0) lines.push('', heading, ...items);
	};
	section(
		`Failed, and not on the pending list ${pendingListFile}:`,
		report.failing.flatMap(({ url, problems }) => [
			`  ${url}`,
			...problems.map((problem) => `      ${problem}`),
		]),
	);
	const takeOff = `take these lines off ${pendingListFile} (or rerun with --prune-pending)`;
	section(`Passing now; ${takeOff}:`, report.nowPassing.map((url) => `  ${url}`));
	section(`Not expected URLs; ${takeOff}:`, report.notExpected.map((url) => `  ${url}`));
	section(
		`Out of order in ${pendingListFile}:`,
		report.pendingListProblems.map((problem) => `  ${problem}`),
	);
	return lines.join('\n');
}

/**
 * The pending list without the entries the report says to take off. Only
 * those lines are deleted; everything else stays byte for byte.
 */
export function prunePendingList(pendingList: string, report: Report): string {
	const remove = new Set([...report.nowPassing, ...report.notExpected]);
	return pendingList
		.split('\n')
		.filter((line) => !remove.has(line.trim()))
		.join('\n');
}

type PendingEntry = { url: string; line: number };

/** The URLs on the pending list: one per line; blank lines and `#` comments are ignored. */
function pendingEntries(pendingList: string): PendingEntry[] {
	return pendingList
		.split('\n')
		.map((text, index) => ({ url: text.trim(), line: index + 1 }))
		.filter(({ url }) => url !== '' && !url.startsWith('#'));
}

/**
 * The entries must be in strictly increasing code point order (the order of
 * `LC_ALL=C sort`), so that parallel edits of the list touch separate lines.
 */
function orderProblems(entries: PendingEntry[]): string[] {
	const problems: string[] = [];
	for (let i = 1; i < entries.length; i++) {
		const { url, line } = entries[i]!;
		const previous = entries[i - 1]!.url;
		const order = Buffer.compare(Buffer.from(previous), Buffer.from(url));
		if (order === 0) {
			problems.push(`line ${line}: ${url} is listed twice`);
		} else if (order > 0) {
			problems.push(
				`line ${line}: ${url} must come before ${previous} (sort the list, as \`LC_ALL=C sort\` does)`,
			);
		}
	}
	return problems;
}

async function checkUrl(
	entry: ExpectedUrl,
	target: Target,
	lowercasePercentEncodedPaths: LowercasePercentEncodedPaths,
): Promise<string[]> {
	const requestPath = toRequestPath(entry.url);
	const reply = await target.get(requestPath);
	const problems = await replyProblems(entry, reply, target);
	if (problems.length === 0 && entry.expect === 'page') {
		problems.push(...(await headProblems(entry, reply, target)));
	}
	if (target.production) {
		problems.push(...hstsProblems(reply));
	}

	// Non-ASCII paths as WordPress wrote them in canonicals and links.
	const lowercase = requestPath.replace(/%[0-9A-F]{2}/g, (escape) => escape.toLowerCase());
	if (lowercase !== requestPath) {
		const lowercaseReply = await target.get(lowercase);
		const acceptRecase = lowercasePercentEncodedPaths === 'as-expected-or-recase-redirect';
		if (!(acceptRecase && isRecaseRedirect(lowercaseReply))) {
			const lowercaseProblems = await replyProblems(entry, lowercaseReply, target);
			problems.push(...lowercaseProblems.map((problem) => `${lowercase}: ${problem}`));
		}
	}

	if (entry.expect === 'page' && requestPath !== '/' && requestPath.endsWith('/')) {
		const slashless = requestPath.slice(0, -1);
		const slashlessProblems = redirectProblems(await target.get(slashless), requestPath);
		problems.push(...slashlessProblems.map((problem) => `${decodeURI(slashless)}: ${problem}`));
	}
	return problems;
}

/** What the expectation itself asks of a reply, apart from the HTML head. */
async function replyProblems(entry: ExpectedUrl, reply: Reply, target: Target): Promise<string[]> {
	switch (entry.expect) {
		case 'redirect':
			if (entry.location !== undefined) {
				return redirectProblems(reply, entry.location);
			}
			return redirectToAnyPageProblems(reply, target);
		case 'not-found':
			return reply.status === 404 ? notFoundPageProblems(reply) : [`expected HTTP 404, got ${reply.status}`];
		case 'page':
		case 'file':
			return reply.status === 200 ? [] : [`expected HTTP 200, got ${reply.status}`];
	}
}

/** The body of a 404 must be the site's 404 page, which search engines must not index. */
function notFoundPageProblems(reply: Reply): string[] {
	const head = parse(reply.body ?? '').querySelector('head');
	const title = head?.querySelector('title')?.text.trim();
	if (title !== NOT_FOUND_PAGE_TITLE) {
		return [`expected the 404 page, titled "${NOT_FOUND_PAGE_TITLE}"; got ${title ? `"${title}"` : 'no <title>'}`];
	}
	const robots = head
		?.querySelectorAll('meta[name="robots"]')
		.flatMap((meta) => (meta.getAttribute('content') ?? '').split(',').map((directive) => directive.trim()));
	return robots?.includes('noindex') ? [] : ['the 404 page is not noindex'];
}

/** A 301 to a URL of the same site that answers 200. */
async function redirectToAnyPageProblems(reply: Reply, target: Target): Promise<string[]> {
	if (reply.status !== 301 || reply.location === null) {
		return [`expected HTTP 301, got ${reply.status}`];
	}
	const location = new URL(reply.location, reply.url);
	if (location.origin !== reply.url.origin) {
		return [`redirects to ${reply.location}, outside the site; the expected location must be given`];
	}
	const { status } = await target.get(location.pathname + location.search);
	return status === 200 ? [] : [`redirects to ${reply.location}, which answers HTTP ${status}`];
}

/**
 * The production site's www URLs (PRODUCTION.wwwPaths on its www origin),
 * each of which must 301 to the same URL on the site. Reported under their
 * full URL, e.g. `https://www.aniya.moe/`.
 */
async function wwwResults({ origin, wwwOrigin }: Production): Promise<UrlResult[]> {
	return Promise.all(
		PRODUCTION.wwwPaths.map(async (path) => {
			const requestPath = toRequestPath(path);
			const problems = await fetchReply(new URL(requestPath, wwwOrigin)).then(
				(reply) => redirectProblems(reply, new URL(requestPath, origin).href),
				(error: Error) => [`request failed: ${error.message}`],
			);
			return { url: `${wwwOrigin}${path}`, outcome: problems.length === 0 ? 'pass' : 'fail', problems };
		}),
	);
}

/** A Strict-Transport-Security header the HSTS preload list takes (see PRODUCTION in settings.ts). */
function hstsProblems(reply: Reply): string[] {
	const directives = (reply.hsts ?? '').split(';').map((directive) => directive.trim().toLowerCase());
	const maxAge = Number(directives.find((directive) => directive.startsWith('max-age='))?.slice('max-age='.length));
	if (maxAge >= PRODUCTION.hstsMinMaxAge && directives.includes('includesubdomains') && directives.includes('preload')) {
		return [];
	}
	return [
		`expected Strict-Transport-Security with max-age of at least ${PRODUCTION.hstsMinMaxAge}, includeSubDomains ` +
			`and preload; got ${reply.hsts === null ? 'none' : `"${reply.hsts}"`}`,
	];
}

/** A redirect to the requested path itself, only with its percent-escapes in another case. */
function isRecaseRedirect(reply: Reply): boolean {
	if (reply.status < 300 || reply.status > 399 || reply.location === null) return false;
	const location = new URL(reply.location, reply.url);
	const upper = (path: string) => path.replace(/%[0-9a-f]{2}/gi, (escape) => escape.toUpperCase());
	return (
		location.origin === reply.url.origin &&
		location.search === reply.url.search &&
		location.pathname !== reply.url.pathname &&
		upper(location.pathname) === upper(reply.url.pathname)
	);
}

/** The path and query as a browser sends them: non-ASCII characters percent-encoded. */
function toRequestPath(url: string): string {
	const { pathname, search } = new URL(url, SITE_ORIGIN);
	return pathname + search;
}

/** A 301 to `location`: a path on the checked site, or a full URL on another site. */
function redirectProblems(reply: Reply, location: string): string[] {
	if (reply.status !== 301) {
		return [`expected HTTP 301, got ${reply.status}${reply.location ? ` to ${reply.location}` : ''}`];
	}
	const actual = reply.location === null ? null : new URL(reply.location, reply.url);
	if (actual === null || !sameUrl(actual, new URL(location, reply.url))) {
		return [`expected a redirect to ${location}, got ${reply.location ?? 'no Location'}`];
	}
	return [];
}

/** Spot checks of a page's HTML head. */
async function headProblems(entry: ExpectedUrl, reply: Reply, target: Target): Promise<string[]> {
	const problems: string[] = [];
	const head = parse(reply.body ?? '').querySelector('head');
	const canonical = head?.querySelector('link[rel="canonical"]')?.getAttribute('href');
	const ownUrl = new URL(entry.url, SITE_ORIGIN);
	if (!canonical || !URL.canParse(canonical) || !sameUrl(new URL(canonical), ownUrl)) {
		problems.push(`canonical URL is ${canonical || 'missing'}, expected ${ownUrl.href}`);
	}
	const title = head?.querySelector('title')?.text.trim();
	if (!title) {
		problems.push('no <title>');
	} else if (!TITLE_FORMAT.pattern.test(title)) {
		problems.push(`title "${title}" is not ${TITLE_FORMAT.description}`);
	}
	if (!head?.querySelector('meta[name="description"]')?.getAttribute('content')?.trim()) {
		problems.push('no meta description');
	}
	const ogImage = head?.querySelector('meta[property="og:image"]')?.getAttribute('content')?.trim();
	problems.push(...(await socialImageProblems(ogImage, target)));
	return problems;
}

/**
 * The og:image must be a full URL on the site, of a JPEG or PNG (the formats
 * every social platform takes), that answers 200.
 */
async function socialImageProblems(ogImage: string | undefined, target: Target): Promise<string[]> {
	if (!ogImage) return ['no og:image'];
	const url = URL.canParse(ogImage) ? new URL(ogImage) : null;
	if (url?.origin !== SITE_ORIGIN) return [`og:image ${ogImage} is not a URL on ${SITE_ORIGIN}`];
	if (!/\.(?:jpe?g|png)$/i.test(url.pathname)) return [`og:image ${ogImage} is not a JPEG or PNG`];
	const { status } = await target.get(url.pathname);
	return status === 200 ? [] : [`og:image ${ogImage} answers HTTP ${status}`];
}

/** Equal, treating different percent-encodings of the same character as equal. */
function sameUrl(a: URL, b: URL): boolean {
	const decode = (path: string) => {
		try {
			return decodeURI(path);
		} catch {
			return path;
		}
	};
	return a.origin === b.origin && decode(a.pathname) === decode(b.pathname) && a.search === b.search;
}
