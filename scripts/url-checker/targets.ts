// What the checker sends requests to: a build output directory, or a live site
// over HTTP. Both answer a request path with a Reply.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

export type Reply = {
	/** The absolute URL that was requested. */
	url: URL;
	status: number;
	location: string | null;
	/** The body, for HTML responses; null otherwise. */
	body: string | null;
};

export interface Target {
	/** Shown in the report, e.g. `build output dist`. */
	name: string;
	/** Why this target cannot answer for `requestPath`, if it cannot. */
	cannotCheck?(requestPath: string): string | null;
	/** `requestPath` is sent exactly as given, e.g. `/%e4%b8%ad/`. */
	get(requestPath: string): Promise<Reply>;
}

export function httpSite(baseUrl: string): Target {
	return {
		name: baseUrl,
		async get(requestPath) {
			const url = new URL(requestPath, baseUrl);
			const response = await fetch(url, {
				redirect: 'manual',
				signal: AbortSignal.timeout(30_000),
			});
			let body: string | null = null;
			if (response.headers.get('content-type')?.includes('html')) {
				body = await response.text();
			} else {
				await response.body?.cancel();
			}
			return { url, status: response.status, location: response.headers.get('location'), body };
		},
	};
}

const BUILD_ORIGIN = 'https://build-output.invalid';

/**
 * Answers requests the way Cloudflare Workers static assets would serve `dir`
 * with this project's wrangler.jsonc (`html_handling: "force-trailing-slash"`,
 * `not_found_handling: "404-page"`), including `_redirects`. A port of the
 * asset worker in workers-shared (bundled in miniflare as
 * `workers/assets/assets.worker.js`); the tests check it against `wrangler dev`.
 */
export function buildOutput(dir: string): Target {
	// Asset paths are case-sensitive, also where the file system is not.
	const files = new Set(
		readdirSync(dir, { recursive: true, withFileTypes: true })
			.filter((entry) => entry.isFile())
			.map((entry) => `/${relative(dir, join(entry.parentPath, entry.name)).replaceAll('\\', '/')}`)
			.filter((path) => !['/_redirects', '/_headers', '/.assetsignore'].includes(path)),
	);
	const exists: Exists = (path) => (files.has(path) ? path : null);
	const redirectsFile = join(dir, '_redirects');
	const redirects = parseRedirects(
		existsSync(redirectsFile) ? readFileSync(redirectsFile, 'utf8') : '',
	);

	return {
		name: `build output ${dir}`,
		cannotCheck(requestPath) {
			return requestPath.includes('?')
				? 'query strings are answered by the Worker; check this URL in HTTP mode'
				: null;
		},
		async get(requestPath) {
			const url = new URL(requestPath, BUILD_ORIGIN);
			const reply = (status: number, location: string | null = null, file: string | null = null) => ({
				url,
				status,
				location,
				body: file?.endsWith('.html') ? readFileSync(join(dir, file), 'utf8') : null,
			});

			const rule = matchRedirect(redirects, url.pathname);
			if (rule && rule.status !== 200) {
				return reply(rule.status, redirectLocation(rule.to, url));
			}
			// A proxy (200) rule answers with whatever the path it names has.
			const pathname = rule ? new URL(rule.to, url).pathname : url.pathname;
			const decodedPath = decodePath(pathname);
			const intent = forceTrailingSlash(decodedPath, exists);
			if (!intent) {
				return reply(404);
			}
			const destination = encodePath(intent.redirect ?? decodedPath);
			if (intent.redirect !== null || destination !== pathname) {
				return reply(307, destination + url.search);
			}
			return reply(intent.asset.status, null, intent.asset.file);
		},
	};
}

type RedirectRule = { to: string; status: number };

type Redirects = {
	/** Keyed by the normalized source path, matched against the raw request path. */
	static: Map<string, RedirectRule>;
	/** Rules with `*` or `:placeholder`, and every rule after the first of those, in file order. */
	dynamic: { pattern: RegExp; rule: RedirectRule }[];
};

function matchRedirect(redirects: Redirects, pathname: string): RedirectRule | undefined {
	const staticRule = redirects.static.get(pathname);
	if (staticRule) return staticRule;
	for (const { pattern, rule } of redirects.dynamic) {
		const match = pattern.exec(pathname);
		if (!match) continue;
		let to = rule.to;
		for (const [name, value] of Object.entries(match.groups ?? {})) {
			to = to.replaceAll(`:${name}`, value);
		}
		to = to.trim();
		return { status: rule.status, to: /^\w+:\/\//.test(to) ? to : to.replace(/\/+/g, '/') };
	}
	return undefined;
}

const PLACEHOLDER = /:[A-Za-z]\w*/;

function sourcePattern(source: string): RegExp {
	const escape = (text: string) => text.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
	const pattern = source
		.split('*')
		.map(escape)
		.join('(?<splat>.*)')
		.replace(new RegExp(PLACEHOLDER, 'g'), (placeholder) => `(?<${placeholder.slice(1)}>[^/]+)`);
	return new RegExp(`^${pattern}$`);
}

function parseRedirects(text: string): Redirects {
	const redirects: Redirects = { static: new Map(), dynamic: [] };
	const seen = new Set<string>();
	for (const rawLine of text.split('\n')) {
		const line = rawLine.trim();
		if (line === '' || line.startsWith('#')) continue;
		const tokens = line.replace(/\s+#.*$/, '').split(/\s+/);
		if (tokens.length < 2 || tokens.length > 3) continue;
		const [from, to, status = '302'] = tokens as [string, string, string?];
		if (!from.startsWith('/') || !PERMITTED_STATUSES.has(Number(status))) continue;
		const source = normalizePath(from);
		if (seen.has(source)) continue;
		seen.add(source);
		const absolute = /^https:\/\/+(?<host>[^/]+)\/?(?<path>.*)/.exec(to);
		// Wrangler skips proxy rules to other sites.
		if (status === '200' && absolute) continue;
		const rule = {
			to: absolute
				? `https://${absolute.groups!.host}${normalizePath(absolute.groups!.path!, true)}`
				: normalizePath(to, true),
			status: Number(status),
		};
		if (redirects.dynamic.length === 0 && !source.includes('*') && !PLACEHOLDER.test(source)) {
			redirects.static.set(source, rule);
		} else {
			redirects.dynamic.push({ pattern: sourcePattern(source), rule });
		}
	}
	return redirects;
}

const PERMITTED_STATUSES = new Set([200, 301, 302, 303, 307, 308]);

/** How wrangler normalizes a `_redirects` path: WHATWG URL encoding; existing escapes stay as written. */
function normalizePath(path: string, withSearchAndHash = false): string {
	const url = new URL(`//${path.startsWith('/') ? path : `/${path}`}`, 'relative://');
	return url.pathname + (withSearchAndHash ? url.search + url.hash : '');
}

function redirectLocation(to: string, request: URL): string {
	const destination = new URL(to, request);
	const search = destination.search || request.search;
	if (destination.origin === request.origin) {
		return `${destination.pathname}${search}${destination.hash}`;
	}
	const suffixLength = destination.search.length + destination.hash.length;
	const base = destination.href.slice(0, destination.href.length - suffixLength);
	return `${base}${search}${destination.hash}`;
}

/** Returns an identifier of the file at a decoded path, or null. */
type Exists = (path: string) => string | null;

type Intent =
	| { asset: { file: string; status: number }; redirect: null }
	| { asset: null; redirect: string };

const asset = (file: string, status = 200): Intent => ({ asset: { file, status }, redirect: null });

function forceTrailingSlash(path: string, exists: Exists, skipRedirects = false): Intent | null {
	const safeRedirect = (file: string, destination: string): Intent | null => {
		if (skipRedirects || exists(destination)) return null;
		const intent = forceTrailingSlash(destination, exists, true);
		return intent?.asset && intent.asset.file === exists(file)
			? { asset: null, redirect: destination }
			: null;
	};
	const exact = exists(path);
	let found: Intent | null = null;
	let file: string | null;

	if (path.endsWith('/index')) {
		if (exact) return asset(exact);
		found =
			safeRedirect(`${path}.html`, path.slice(0, -5)) ??
			safeRedirect(`${path.slice(0, -6)}.html`, path.slice(0, -5));
	} else if (path.endsWith('/index.html')) {
		found =
			safeRedirect(path, path.slice(0, -10)) ??
			safeRedirect(`${path.slice(0, -11)}.html`, path.slice(0, -10));
	} else if (path.endsWith('/')) {
		if ((file = exists(`${path}index.html`))) return asset(file);
		if ((file = exists(`${path.slice(0, -1)}.html`))) return asset(file);
	} else if (path.endsWith('.html')) {
		if ((found = safeRedirect(path, `${path.slice(0, -5)}/`))) return found;
		if (exact) return asset(exact);
		found = safeRedirect(`${path.slice(0, -5)}/index.html`, `${path.slice(0, -5)}/`);
	}
	if (found) return found;
	if (exact) return asset(exact);
	return (
		safeRedirect(`${path}.html`, `${path}/`) ??
		safeRedirect(`${path}/index.html`, `${path}/`) ??
		notFoundPage(path, exists)
	);
}

/** `not_found_handling: "404-page"`: the nearest 404.html up the tree, with status 404. */
function notFoundPage(path: string, exists: Exists): Intent | null {
	for (let dir = path; dir; ) {
		dir = dir.slice(0, dir.lastIndexOf('/'));
		const file = exists(`${dir}/404.html`);
		if (file) return asset(file, 404);
	}
	return null;
}

function decodePath(pathname: string): string {
	return pathname
		.split('/')
		.map((segment) => {
			try {
				return decodeURIComponent(segment);
			} catch {
				return segment;
			}
		})
		.join('/')
		.replace(/\/+/g, '/');
}

function encodePath(pathname: string): string {
	return pathname
		.split('/')
		.map((segment) => encodeURIComponent(segment))
		.join('/');
}
