// The URL checker's verdicts. One small fixture site is checked two ways: as a
// build output directory, and over HTTP while `wrangler dev` serves the same
// directory with the project's wrangler.jsonc. Both must reach the same
// verdicts.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
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
	head: { canonical?: string | null; title?: string | null; description?: string | null } = {},
): string {
	const {
		canonical = `https://aniya.moe${encodeURI(path)}`,
		title = `${path} - TsukiStudio`,
		description = `About ${path}`,
	} = head;
	return `<!doctype html>
<html lang="zh-TW">
	<head>
		<meta charset="utf-8" />
		${canonical === null ? '' : `<link rel="canonical" href="${canonical}" />`}
		${title === null ? '' : `<title>${title}</title>`}
		${description === null ? '' : `<meta name="description" content="${description}" />`}
	</head>
	<body><p>${path}</p></body>
</html>
`;
}

const fixtureSite: Record<string, string> = {
	'index.html': page('/'),
	'ok/index.html': page('/ok/'),
	'wrong-canonical/index.html': page('/wrong-canonical/', { canonical: 'https://aniya.moe/ok/' }),
	'no-title/index.html': page('/no-title/', { title: null }),
	'no-description/index.html': page('/no-description/', { description: null }),
	'no-slash-rule/index.html': page('/no-slash-rule/'),
	'中文/index.html': page('/中文/'),
	'混/index.html': page('/混/'),
	'img/new.png': 'not really a PNG',
	'robots.txt': 'User-agent: *\n',
	'404.html': '<!doctype html><title>404</title>',
	_redirects: [
		'/ok /ok/ 301',
		'/wrong-canonical /wrong-canonical/ 301',
		'/no-title /no-title/ 301',
		'/no-description /no-description/ 301',
		'/中文 /中文/ 301',
		'/混 /混/ 301',
		'/%e6%b7%b7/ /ok/ 301',
		'/old/ /ok/ 301',
		'/old-elsewhere/ /no-title/ 301',
		'/temporary/ /ok/ 302',
		'/wp-content/uploads/old.png /img/new.png 301',
		'/wp-content/uploads/dangling.png /img/missing.png 301',
		'/wp-content/uploads/video.mp4 https://media.aniya.moe/videos/a/video.mp4 301',
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

	it('passes a URL that must not exist when it answers 404', async () => {
		const report = await check([
			{ url: '/no-such-page/', expect: 'not-found' },
			{ url: '/ok/', expect: 'not-found' },
		]);

		expect(report.results).toEqual([
			{ url: '/no-such-page/', outcome: 'pass', problems: [] },
			{ url: '/ok/', outcome: 'fail', problems: ['expected HTTP 404, got 200'] },
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
