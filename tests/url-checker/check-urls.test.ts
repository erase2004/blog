// The URL checker's verdicts. One small fixture site is checked two ways: as a
// build output directory, and over HTTP while `wrangler dev` serves the same
// directory with the project's wrangler.jsonc. Both must reach the same
// verdicts.
import { once } from 'node:events';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
	checkUrls,
	formatReport,
	prunePendingList,
	type Report,
} from '../../scripts/url-checker/check';
import type { ExpectedUrl } from '../../scripts/url-checker/expected-urls';
import { buildOutput, httpSite, type Target } from '../../scripts/url-checker/targets';
import { startWranglerDev, type WranglerDev } from '../support/wrangler-dev';

/** An HTML page whose head is right for `path`, unless `head` says otherwise. */
function page(
	path: string,
	head: {
		canonical?: string | null;
		title?: string | null;
		description?: string | null;
		ogImage?: string | null;
	} = {},
): string {
	const {
		canonical = `https://aniya.moe${encodeURI(path)}`,
		title = `${path} - TsukiStudio`,
		description = `About ${path}`,
		ogImage = 'https://aniya.moe/img/new.png',
	} = head;
	return `<!doctype html>
<html lang="zh-TW">
	<head>
		<meta charset="utf-8" />
		${canonical === null ? '' : `<link rel="canonical" href="${canonical}" />`}
		${title === null ? '' : `<title>${title}</title>`}
		${description === null ? '' : `<meta name="description" content="${description}" />`}
		${ogImage === null ? '' : `<meta property="og:image" content="${ogImage}" />`}
	</head>
	<body><p>${path}</p></body>
</html>
`;
}

/** A 404 page with this title and robots meta tag. */
function notFoundPage({ title, robots }: { title: string; robots: string | null }): string {
	return `<!doctype html>
<html lang="zh-TW">
	<head>
		<meta charset="utf-8" />
		<title>${title}</title>
		${robots === null ? '' : `<meta name="robots" content="${robots}" />`}
	</head>
	<body><h1>${title}</h1></body>
</html>
`;
}

const fixtureSite: Record<string, string> = {
	'index.html': page('/'),
	'ok/index.html': page('/ok/'),
	'wrong-canonical/index.html': page('/wrong-canonical/', { canonical: 'https://aniya.moe/ok/' }),
	'no-title/index.html': page('/no-title/', { title: null }),
	'no-description/index.html': page('/no-description/', { description: null }),
	'home-title/index.html': page('/home-title/', { title: 'TsukiStudio - 生活點滴紀錄' }),
	'later-page-title/index.html': page('/later-page-title/', { title: 'TsukiStudio - 生活點滴紀錄 - Page 2' }),
	'bad-title/index.html': page('/bad-title/', { title: 'About bad-title' }),
	'no-og-image/index.html': page('/no-og-image/', { ogImage: null }),
	'missing-og-image/index.html': page('/missing-og-image/', { ogImage: 'https://aniya.moe/img/missing.png' }),
	'webp-og-image/index.html': page('/webp-og-image/', { ogImage: 'https://aniya.moe/img/new.webp' }),
	'relative-og-image/index.html': page('/relative-og-image/', { ogImage: '/img/new.png' }),
	'no-slash-rule/index.html': page('/no-slash-rule/'),
	'中文/index.html': page('/中文/'),
	'混/index.html': page('/混/'),
	'img/new.png': 'not really a PNG',
	'img/new.webp': 'not really a webp',
	'robots.txt': 'User-agent: *\n',
	'404.html': notFoundPage({ title: '找不到頁面 - TsukiStudio', robots: 'noindex' }),
	// Workers static assets serve the nearest 404.html up the tree: below
	// these folders, other 404 pages than the site's.
	'elsewhere/404.html': notFoundPage({ title: 'Not Found', robots: 'noindex' }),
	'indexable/404.html': notFoundPage({ title: '找不到頁面 - TsukiStudio', robots: null }),
	_redirects: [
		'/ok /ok/ 301',
		'/wrong-canonical /wrong-canonical/ 301',
		'/no-title /no-title/ 301',
		'/no-description /no-description/ 301',
		'/home-title /home-title/ 301',
		'/later-page-title /later-page-title/ 301',
		'/bad-title /bad-title/ 301',
		'/no-og-image /no-og-image/ 301',
		'/missing-og-image /missing-og-image/ 301',
		'/webp-og-image /webp-og-image/ 301',
		'/relative-og-image /relative-og-image/ 301',
		'/中文 /中文/ 301',
		'/混 /混/ 301',
		'/%e6%b7%b7/ /ok/ 301',
		'/old/ /ok/ 301',
		'/old-elsewhere/ /no-title/ 301',
		'/temporary/ /ok/ 302',
		'/wp-content/uploads/old.png /img/new.png 301',
		'/wp-content/uploads/dangling.png /img/missing.png 301',
		'/wp-content/uploads/video.mp4 https://media.aniya.moe/videos/a/video.mp4 301',
		// Proxy rules: served as the other path is.
		'/proxied/ /ok/ 200',
		'/proxied-to-nothing/ /nowhere/ 200',
		// Dynamic rules come last; Workers try them after all static rules.
		'/tag/:tag/feed/ /tag/:tag/ 301',
		'/archive/* /ok/ 301',
	].join('\n'),
};

let siteDir: string;
let server: WranglerDev | undefined;
const targets: Record<string, () => Target> = {
	'build output': () => buildOutput(siteDir),
	HTTP: () => httpSite(server!.url),
};

beforeAll(async () => {
	siteDir = mkdtempSync(join(tmpdir(), 'url-checker-site-'));
	for (const [file, content] of Object.entries(fixtureSite)) {
		mkdirSync(dirname(join(siteDir, file)), { recursive: true });
		writeFileSync(join(siteDir, file), content);
	}
	server = await startWranglerDev({ assetsDir: siteDir });
}, 120_000);

afterAll(async () => {
	await server?.stop();
	rmSync(siteDir, { recursive: true, force: true });
});

function outcomes(report: Report): Record<string, string> {
	return Object.fromEntries(report.results.map(({ url, outcome }) => [url, outcome]));
}

describe.each(Object.keys(targets))('checking the %s', (targetName) => {
	const check = (
		expected: ExpectedUrl[],
		options: Partial<Parameters<typeof checkUrls>[0]> = {},
	) => checkUrls({ expected, target: targets[targetName]!(), pendingList: '', ...options });

	it('passes a page that is served, and fails one that is not', async () => {
		const report = await check([
			{ url: '/ok/', expect: 'page' },
			{ url: '/missing/', expect: 'page' },
		]);

		expect(outcomes(report)).toEqual({ '/ok/': 'pass', '/missing/': 'fail' });
	});

	it("fails a page whose canonical URL is not the page's own URL", async () => {
		const report = await check([{ url: '/wrong-canonical/', expect: 'page' }]);

		expect(report.results).toEqual([
			{
				url: '/wrong-canonical/',
				outcome: 'fail',
				problems: [expect.stringContaining('canonical')],
			},
		]);
	});

	it('fails a page without a <title>', async () => {
		const report = await check([{ url: '/no-title/', expect: 'page' }]);

		expect(report.results).toEqual([
			{ url: '/no-title/', outcome: 'fail', problems: [expect.stringContaining('<title>')] },
		]);
	});

	it('fails a page without a meta description', async () => {
		const report = await check([{ url: '/no-description/', expect: 'page' }]);

		expect(report.results).toEqual([
			{
				url: '/no-description/',
				outcome: 'fail',
				problems: [expect.stringContaining('description')],
			},
		]);
	});

	it('passes the titles of the site: `<name> - TsukiStudio`, the home page, and later pages of a list', async () => {
		const report = await check([
			{ url: '/ok/', expect: 'page' },
			{ url: '/home-title/', expect: 'page' },
			{ url: '/later-page-title/', expect: 'page' },
		]);

		expect(outcomes(report)).toEqual({ '/ok/': 'pass', '/home-title/': 'pass', '/later-page-title/': 'pass' });
	});

	it('fails a page whose title is not in the format of the site', async () => {
		const report = await check([{ url: '/bad-title/', expect: 'page' }]);

		expect(report.results).toEqual([
			{
				url: '/bad-title/',
				outcome: 'fail',
				problems: ['title "About bad-title" is not "<name> - TsukiStudio" or "TsukiStudio - 生活點滴紀錄"'],
			},
		]);
	});

	it('fails a page without an og:image, or whose og:image is not a JPEG or PNG on the site that answers 200', async () => {
		const report = await check([
			{ url: '/no-og-image/', expect: 'page' },
			{ url: '/missing-og-image/', expect: 'page' },
			{ url: '/webp-og-image/', expect: 'page' },
			{ url: '/relative-og-image/', expect: 'page' },
		]);

		expect(report.results).toEqual([
			{ url: '/no-og-image/', outcome: 'fail', problems: ['no og:image'] },
			{
				url: '/missing-og-image/',
				outcome: 'fail',
				problems: ['og:image https://aniya.moe/img/missing.png answers HTTP 404'],
			},
			{
				url: '/webp-og-image/',
				outcome: 'fail',
				problems: ['og:image https://aniya.moe/img/new.webp is not a JPEG or PNG'],
			},
			{
				url: '/relative-og-image/',
				outcome: 'fail',
				problems: ['og:image /img/new.png is not a URL on https://aniya.moe'],
			},
		]);
	});

	it('fails a page whose URL without the trailing slash is not 301-redirected to it', async () => {
		// Without a _redirects rule, Workers static assets add the slash with a 307.
		const report = await check([{ url: '/no-slash-rule/', expect: 'page' }]);

		expect(report.results).toEqual([
			{
				url: '/no-slash-rule/',
				outcome: 'fail',
				problems: [expect.stringMatching(/^\/no-slash-rule: expected HTTP 301, got 307/)],
			},
		]);
	});

	it('passes a 301 to the expected location, and fails a redirect elsewhere or with another status', async () => {
		const report = await check([
			{ url: '/old/', expect: 'redirect', location: '/ok/' },
			{ url: '/old-elsewhere/', expect: 'redirect', location: '/ok/' },
			{ url: '/temporary/', expect: 'redirect', location: '/ok/' },
		]);

		expect(report.results).toEqual([
			{ url: '/old/', outcome: 'pass', problems: [] },
			{
				url: '/old-elsewhere/',
				outcome: 'fail',
				problems: ['expected a redirect to /ok/, got /no-title/'],
			},
			{ url: '/temporary/', outcome: 'fail', problems: ['expected HTTP 301, got 302 to /ok/'] },
		]);
	});

	it('passes a 301 to the expected location on another site', async () => {
		const report = await check([
			{
				url: '/wp-content/uploads/video.mp4',
				expect: 'redirect',
				location: 'https://media.aniya.moe/videos/a/video.mp4',
			},
			{ url: '/wp-content/uploads/video.mp4', expect: 'redirect', location: '/videos/a/video.mp4' },
		]);

		expect(report.results.map(({ outcome }) => outcome)).toEqual(['pass', 'fail']);
	});

	it('follows _redirects rules with placeholders and splats', async () => {
		const report = await check([
			{ url: '/tag/中文/feed/', expect: 'redirect', location: '/tag/中文/' },
			{ url: '/archive/2021/09/', expect: 'redirect', location: '/ok/' },
		]);

		expect(outcomes(report)).toEqual({ '/tag/中文/feed/': 'pass', '/archive/2021/09/': 'pass' });
	});

	it('follows _redirects proxy (200) rules: the URL answers as the path it is proxied to', async () => {
		const report = await check([
			{ url: '/proxied/', expect: 'file' },
			{ url: '/proxied-to-nothing/', expect: 'not-found' },
			{ url: '/proxied-to-nothing/', expect: 'file' },
		]);

		expect(report.results.map(({ outcome }) => outcome)).toEqual(['pass', 'pass', 'fail']);
	});

	it('passes a 301 with no given location only when its target answers 200', async () => {
		const report = await check([
			{ url: '/wp-content/uploads/old.png', expect: 'redirect' },
			{ url: '/wp-content/uploads/dangling.png', expect: 'redirect' },
		]);

		expect(report.results).toEqual([
			{ url: '/wp-content/uploads/old.png', outcome: 'pass', problems: [] },
			{
				url: '/wp-content/uploads/dangling.png',
				outcome: 'fail',
				problems: ['redirects to /img/missing.png, which answers HTTP 404'],
			},
		]);
	});

	it('passes a file that is served, with no HTML head to check', async () => {
		const report = await check([
			{ url: '/robots.txt', expect: 'file' },
			{ url: '/sitemap.xml', expect: 'file' },
		]);

		expect(outcomes(report)).toEqual({ '/robots.txt': 'pass', '/sitemap.xml': 'fail' });
	});

	it('passes a URL that must not exist when it answers 404 with the 404 page', async () => {
		const report = await check([
			{ url: '/no-such-page/', expect: 'not-found' },
			{ url: '/ok/', expect: 'not-found' },
		]);

		expect(report.results).toEqual([
			{ url: '/no-such-page/', outcome: 'pass', problems: [] },
			{ url: '/ok/', outcome: 'fail', problems: ['expected HTTP 404, got 200'] },
		]);
	});

	it('fails a URL that answers 404 with another page than the 404 page, or with a 404 page search engines may index', async () => {
		const report = await check([
			{ url: '/elsewhere/missing/', expect: 'not-found' },
			{ url: '/indexable/missing/', expect: 'not-found' },
		]);

		expect(report.results).toEqual([
			{
				url: '/elsewhere/missing/',
				outcome: 'fail',
				problems: ['expected the 404 page, titled "找不到頁面 - TsukiStudio"; got "Not Found"'],
			},
			{ url: '/indexable/missing/', outcome: 'fail', problems: ['the 404 page is not noindex'] },
		]);
	});

	describe('a non-ASCII URL', () => {
		it('is also requested with lowercase percent-encoding, as WordPress wrote it', async () => {
			const report = await check([{ url: '/中文/', expect: 'page' }], {
				lowercasePercentEncodedPaths: 'as-expected',
			});

			// Workers static assets redirect it to the uppercase form.
			expect(report.results).toEqual([
				{
					url: '/中文/',
					outcome: 'fail',
					problems: [expect.stringMatching(/^\/%e4%b8%ad%e6%96%87\/: expected HTTP 200, got 307/)],
				},
			]);
		});

		it('by default may answer the lowercase form with a redirect to the same path in uppercase', async () => {
			const report = await check([{ url: '/中文/', expect: 'page' }]);

			expect(outcomes(report)).toEqual({ '/中文/': 'pass' });
		});

		it('fails when the lowercase form redirects to a different path', async () => {
			// _redirects keeps a lowercase escape as written, so this rule matches only the lowercase form.
			const report = await check([{ url: '/混/', expect: 'page' }]);

			expect(report.results).toEqual([
				{
					url: '/混/',
					outcome: 'fail',
					problems: [expect.stringMatching(/^\/%e6%b7%b7\/: expected HTTP 200, got 301/)],
				},
			]);
		});
	});
});

describe('the pending list', () => {
	const check = (expected: ExpectedUrl[], pendingList: string) =>
		checkUrls({ expected, target: buildOutput(siteDir), pendingList });

	it('lets the URLs on it fail, but no others', async () => {
		const report = await check(
			[
				{ url: '/ok/', expect: 'page' },
				{ url: '/missing/', expect: 'page' },
				{ url: '/also-missing/', expect: 'page' },
			],
			'/missing/\n',
		);

		expect(report.ok).toBe(false);
		expect(report.failing.map(({ url }) => url)).toEqual(['/also-missing/']);
	});

	it('passes the check when only URLs on it fail', async () => {
		const report = await check(
			[
				{ url: '/ok/', expect: 'page' },
				{ url: '/missing/', expect: 'page' },
			],
			'/missing/\n',
		);

		expect(report.ok).toBe(true);
	});

	it('fails the check when a URL on it passes, so that it gets taken off', async () => {
		const report = await check(
			[
				{ url: '/ok/', expect: 'page' },
				{ url: '/missing/', expect: 'page' },
			],
			'/missing/\n/ok/\n',
		);

		expect(report.ok).toBe(false);
		expect(report.nowPassing).toEqual(['/ok/']);
	});

	it('fails the check on an entry that is not an expected URL', async () => {
		const report = await check([{ url: '/missing/', expect: 'page' }], '/missing/\n/typo/\n');

		expect(report.ok).toBe(false);
		expect(report.notExpected).toEqual(['/typo/']);
	});

	it('must stay sorted, without duplicates', async () => {
		const report = await check(
			[
				{ url: '/a/', expect: 'page' },
				{ url: '/b/', expect: 'page' },
			],
			'/b/\n/a/\n/a/\n',
		);

		expect(report.ok).toBe(false);
		expect(report.pendingListProblems).toEqual([
			'line 2: /a/ must come before /b/ (sort the list, as `LC_ALL=C sort` does)',
			'line 3: /a/ is listed twice',
		]);
	});

	it('may group its entries with blank lines and # comments', async () => {
		const report = await check(
			[
				{ url: '/a/', expect: 'page' },
				{ url: '/b/', expect: 'page' },
			],
			'# Allowed to fail for now.\n\n/a/\n\n# Another group\n/b/\n',
		);

		expect(report.ok).toBe(true);
	});

	it('leaves alone an entry the target cannot check', async () => {
		const report = await check([{ url: '/?p=1854', expect: 'redirect', location: '/ok/' }], '/?p=1854\n');

		expect(report.ok).toBe(true);
	});

	it('is named in the printed report, with the entries to take off it', async () => {
		const report = await check(
			[
				{ url: '/ok/', expect: 'page' },
				{ url: '/missing/', expect: 'page' },
			],
			'/ok/\n/typo/\n',
		);

		const text = formatReport(report, 'pending.txt');

		expect(text).toContain('take these lines off pending.txt');
		expect(text).toMatch(/\n {2}\/ok\/\n/);
		expect(text).toMatch(/\n {2}\/typo\/\n?/);
		expect(text).toMatch(/\n {2}\/missing\/\n {6}expected HTTP 200, got 404/);
	});

	it('is pruned by deleting only the lines of entries that pass or are not expected', async () => {
		const pendingList = '# Allowed to fail for now.\n\n/a/\n/ok/\n\n/typo/\n/zz/\n';
		const report = await check(
			[
				{ url: '/a/', expect: 'page' },
				{ url: '/ok/', expect: 'page' },
				{ url: '/zz/', expect: 'page' },
			],
			pendingList,
		);

		expect(prunePendingList(pendingList, report)).toBe('# Allowed to fail for now.\n\n/a/\n\n/zz/\n');
	});
});

describe('checking the production site', () => {
	// Local servers stand in for https://aniya.moe and https://www.aniya.moe.
	// The site answers /hsts/<name> with the HSTS header of that name.
	const HSTS: Record<string, string | null> = {
		ok: 'max-age=31536000; includeSubDomains; preload',
		none: null,
		'no-preload': 'max-age=31536000; includeSubDomains',
		'no-subdomains': 'max-age=31536000; preload',
		short: 'max-age=86400; includeSubDomains; preload',
	};
	/** How the www stand-in answers: as it should, or as a wrong redirect rule would. */
	let wwwAnswers: 'same URL' | 'home page' | 'temporary' = 'same URL';
	let site: StandIn;
	let www: StandIn;

	beforeAll(async () => {
		site = await startStandIn((url) => {
			const name = url.pathname.replace(/^\/hsts\//, '');
			const hsts = name in HSTS ? HSTS[name] : HSTS.ok;
			return { status: 200, headers: hsts ? { 'Strict-Transport-Security': hsts } : {} };
		});
		www = await startStandIn((url) => {
			const target = new URL(wwwAnswers === 'home page' ? '/' : url.pathname + url.search, site.url).href;
			return { status: wwwAnswers === 'temporary' ? 302 : 301, headers: { Location: target } };
		});
	});

	afterAll(async () => {
		await Promise.all([site?.close(), www?.close()]);
	});

	const check = (expected: ExpectedUrl[], target = httpSite(site.url, { asProduction: { wwwOrigin: www.url } })) =>
		checkUrls({ expected, target, pendingList: '' });

	it('passes when www redirects every URL to the same URL on the site, and responses keep browsers on HTTPS', async () => {
		wwwAnswers = 'same URL';
		const report = await check([{ url: '/hsts/ok', expect: 'file' }]);

		expect(outcomes(report)).toEqual({
			'/hsts/ok': 'pass',
			[`${www.url}/`]: 'pass',
			[`${www.url}/2021/09/30/第一篇文章/`]: 'pass',
			[`${www.url}/?p=30`]: 'pass',
		});
		expect(report.ok).toBe(true);
	});

	it('fails www URLs that do not 301 to the same URL on the site', async () => {
		wwwAnswers = 'home page';
		const toHome = await check([]);
		wwwAnswers = 'temporary';
		const temporary = await check([]);

		expect(toHome.results.map(({ url, problems }) => [url, problems])).toEqual([
			[`${www.url}/`, []],
			[
				`${www.url}/2021/09/30/第一篇文章/`,
				[`expected a redirect to ${site.url}${encodeURI('/2021/09/30/第一篇文章/')}, got ${site.url}/`],
			],
			[`${www.url}/?p=30`, [`expected a redirect to ${site.url}/?p=30, got ${site.url}/`]],
		]);
		expect(temporary.results.map(({ problems }) => problems[0])).toEqual(
			Array(3).fill(expect.stringMatching(/^expected HTTP 301, got 302/)),
		);
		expect(temporary.ok).toBe(false);
	});

	// What the HSTS preload list asks of a domain on it (hstspreload.org).
	it('fails every response without HSTS for the preload list: a year or more, subdomains too, and preload', async () => {
		wwwAnswers = 'same URL';
		const report = await check(Object.keys(HSTS).map((name) => ({ url: `/hsts/${name}`, expect: 'file' as const })));
		const needs = 'expected Strict-Transport-Security with max-age of at least 31536000, includeSubDomains and preload';

		expect(report.results.filter(({ url }) => url.startsWith('/')).map(({ url, problems }) => [url, problems])).toEqual([
			['/hsts/ok', []],
			['/hsts/none', [`${needs}; got none`]],
			['/hsts/no-preload', [`${needs}; got "max-age=31536000; includeSubDomains"`]],
			['/hsts/no-subdomains', [`${needs}; got "max-age=31536000; preload"`]],
			['/hsts/short', [`${needs}; got "max-age=86400; includeSubDomains; preload"`]],
		]);
	});

	it('are the checks of https://aniya.moe only: not of preview URLs or local servers', async () => {
		const report = await check([{ url: '/hsts/none', expect: 'file' }], httpSite(site.url));

		expect(httpSite('https://aniya.moe').production).toEqual({ origin: 'https://aniya.moe', wwwOrigin: 'https://www.aniya.moe' });
		expect(httpSite('https://aniya-moe.example.workers.dev').production).toBeUndefined();
		expect(outcomes(report)).toEqual({ '/hsts/none': 'pass' });
	});
});

type StandIn = { url: string; close(): Promise<void> };

/** A local HTTP server answering every request with `answer`'s status and headers, and an empty body. */
async function startStandIn(
	answer: (url: URL) => { status: number; headers: Record<string, string> },
): Promise<StandIn> {
	const server = createServer((request, response) => {
		const { status, headers } = answer(new URL(request.url ?? '/', 'http://localhost'));
		response.writeHead(status, headers).end();
	});
	server.listen(0, '127.0.0.1');
	await once(server, 'listening');
	const { port } = server.address() as AddressInfo;
	return {
		url: `http://127.0.0.1:${port}`,
		close: async () => {
			server.closeAllConnections();
			server.close();
			await once(server, 'close');
		},
	};
}

describe('checking the build output only', () => {
	it('skips URLs with a query string, which only the Worker answers', async () => {
		const report = await checkUrls({
			expected: [{ url: '/?p=1854', expect: 'redirect', location: '/ok/' }],
			target: buildOutput(siteDir),
			pendingList: '',
		});

		expect(report.results).toEqual([
			{ url: '/?p=1854', outcome: 'skip', problems: [expect.stringContaining('HTTP mode')] },
		]);
	});
});
