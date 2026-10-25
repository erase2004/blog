// What the built site answers for its URLs, served by `wrangler dev` as
// Cloudflare Workers static assets will serve it: pages and their trailing
// slash, old URLs in lowercase percent-encoding, unknown URLs, WordPress's
// query-string URLs and the Worker that answers them, and the URL checker
// over the whole site.
// The site is built and served once for all the files of tests/site/
// (global-setup.ts).
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'node-html-parser';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startWranglerDev, type WranglerDev } from '../support/wrangler-dev';
import { get, outDir, siteUrl } from './site';
import { PROBE_PATH } from './test-pages';

const urlChecker = fileURLToPath(new URL('../../scripts/check-urls.ts', import.meta.url));

describe('build output', () => {
	it('writes each page as <path>/index.html', () => {
		expect(existsSync(join(outDir, 'probe', 'index.html'))).toBe(true);
	});
});

describe('trailing slash', () => {
	it('page URLs without the trailing slash are 301-redirected to the slashed URL', async () => {
		const response = await get(PROBE_PATH.slice(0, -1));

		expect(response.status).toBe(301);
		expect(new URL(response.headers.get('location')!, siteUrl).pathname).toBe(PROBE_PATH);
	});

	it('page URLs with the trailing slash are served directly', async () => {
		const response = await get(PROBE_PATH);

		expect(response.status).toBe(200);
	});

	it('_redirects only adds the trailing slash for URLs that are pages', () => {
		const addsSlash = readFileSync(join(outDir, '_redirects'), 'utf8')
			.split('\n')
			.map((line) => line.trim().split(/\s+/))
			.filter(([from, to]) => from !== undefined && to === `${from}/`);

		const targetsWithoutPage = addsSlash
			.map(([, to]) => to!)
			.filter((to) => !existsSync(join(outDir, decodeURI(to), 'index.html')));
		expect(addsSlash.length).toBeGreaterThan(0);
		expect(targetsWithoutPage).toEqual([]);
	});
});

// WordPress wrote non-ASCII paths percent-encoded in lowercase in canonicals
// and links; without rules of their own, Workers static assets would 307
// them to the uppercase form.
describe('old URLs in lowercase percent-encoding', () => {
	it.each([
		['/2021/09/30/%e7%ac%ac%e4%b8%80%e7%af%87%e6%96%87%e7%ab%a0/', '/2021/09/30/%E7%AC%AC%E4%B8%80%E7%AF%87%E6%96%87%E7%AB%A0/'],
		['/category/%e6%8a%80%e8%a1%93/', '/category/%E6%8A%80%E8%A1%93/'],
		['/tag/book%e2%98%86walker/', '/tag/book%E2%98%86walker/'],
	])('of a page, %s, 301 to the page', async (path, page) => {
		const response = await get(path);

		expect(response.status).toBe(301);
		expect(response.headers.get('location')).toBe(page);
		expect((await get(page)).status).toBe(200);
	});

	it.each([
		// The old slug.
		[
			'/2026/01/23/%e5%be%9e-ssr-%e5%88%b0-ssg%ef%bc%9aacgn-%e8%82%a1%e5%b8%82%e6%ad%b7%e5%8f%b2%e5%8d%9a%e7%89%a9%e9%a4%a8-7-%e8%90%ac%e9%a0%81%e9%9d%9c%e6%85%8b%e5%8c%96%e7%9a%84%e5%af%a6%e6%88%b0%e8%bd%89%e5%9e%8b/',
			'/2026/01/23/acgn-museum-ssg/',
		],
		// The PDF's upload path and attachment page.
		...[
			'/wp-content/uploads/2025/05/%e7%80%a8%e6%88%b6%e5%85%a7%e5%9c%8b%e9%9a%9b%e8%97%9d%e8%a1%93%e7%a5%ad-2025-3.pdf',
			'/2025/05/17/travel-setonaikai-2025-prologue/%e7%80%a8%e6%88%b6%e5%85%a7%e5%9c%8b%e9%9a%9b%e8%97%9d%e8%a1%93%e7%a5%ad-2025-3/',
		].map((path) => [
			path,
			'https://media.aniya.moe/files/travel-setonaikai-2025-prologue/%E7%80%A8%E6%88%B6%E5%85%A7%E5%9C%8B%E9%9A%9B%E8%97%9D%E8%A1%93%E7%A5%AD-2025-3.pdf',
		]),
	])('that redirect, %s, 301 straight to where they redirect', async (path, location) => {
		const response = await get(path);

		expect(response.status).toBe(301);
		expect(response.headers.get('location')).toBe(location);
	});

	// The new images' URLs have a hash: where the uppercase form redirects.
	it.each([
		// With a zero-width space after 池田港.
		'/wp-content/uploads/2025/05/%e6%b1%a0%e7%94%b0%e6%b8%af%e2%80%8b-2-Ave-Mujica.jpg',
		'/2025/05/17/travel-setonaikai-2025-day5/%e6%b1%a0%e7%94%b0%e6%b8%af-2-ave-mujica/',
	])('of an image, %s, 301 straight to the new image', async (path) => {
		const uppercase = await get(path.replace(/%[0-9a-f]{2}/g, (escape) => escape.toUpperCase()));
		const response = await get(path);

		expect(uppercase.status).toBe(301);
		expect(response.status).toBe(301);
		expect(response.headers.get('location')).toBe(uppercase.headers.get('location'));
		expect((await get(response.headers.get('location')!)).status).toBe(200);
	});

	// The feeds' dynamic rule keeps the request's escapes: two 301s, for a
	// feed search engines do not index.
	it('of a feed 301 to its page in lowercase, which 301s to the page', async () => {
		const feed = await get('/category/%e6%8a%80%e8%a1%93/feed/');
		const page = await get(feed.headers.get('location')!);

		expect([feed.status, feed.headers.get('location')]).toEqual([301, '/category/%e6%8a%80%e8%a1%93/']);
		expect([page.status, page.headers.get('location')]).toEqual([301, '/category/%E6%8A%80%E8%A1%93/']);
	});
});

describe('unknown URLs', () => {
	it('answer with HTTP 404 and the 404 page', async () => {
		const response = await get('/no-such-page/');

		expect(response.status).toBe(404);
		expect(await response.text()).toBe(readFileSync(join(outDir, '404.html'), 'utf8'));
	});

	// Workers static assets would serve dist/404.html at /404/ with HTTP 200,
	// as a page of its own; /404 and /404.html redirect to /404/.
	it.each(['/404/', '/404', '/404.html'])("the 404 page's own URL %s ends in HTTP 404 too", async (path) => {
		const response = await fetch(new URL(path, siteUrl));

		expect(response.status).toBe(404);
		expect(await response.text()).toBe(readFileSync(join(outDir, '404.html'), 'utf8'));
	});
});

describe('WordPress query-string URLs', () => {
	/** Where a redirect goes: a path on the site itself (not on aniya.moe), with its query string. */
	function redirectTarget(response: Response) {
		const target = new URL(response.headers.get('location')!, response.url);
		return { origin: target.origin, path: decodeURI(target.pathname) + target.search };
	}

	// WordPress redirected /?p=ID and /?page_id=ID of every post and page to it
	// (redirect_canonical()); the IDs are those of the WordPress backup.
	it.each([
		['/?p=30', '/2021/09/30/第一篇文章/'],
		['/?page_id=30', '/2021/09/30/第一篇文章/'],
		['/?p=1854', '/2026/01/23/acgn-museum-ssg/'],
		['/?page_id=86', '/about/'],
		['/?p=85', '/about/contact/'],
	])('%s redirects to the post or page with that ID', async (path, location) => {
		const response = await get(path);

		expect(response.status).toBe(301);
		expect(redirectTarget(response)).toEqual({ origin: siteUrl, path: location });
	});

	// 1887 is the first ID WordPress never gave out; WordPress answered it with 404.
	it.each(['/?p=1887', '/?page_id=1887'])('%s, an ID that was never a post or page, answers with HTTP 404 and the 404 page', async (path) => {
		const response = await get(path);

		expect(response.status).toBe(404);
		expect(await response.text()).toBe(readFileSync(join(outDir, '404.html'), 'utf8'));
	});

	// WordPress redirected /?attachment_id=ID of any attachment to its
	// attachment page, which redirected to the file.
	it('/?attachment_id=ID of a moved image redirects to the photo at full size, as its post links it', async () => {
		// Uploaded to an Envira gallery of Day 2: this was its only attachment page.
		const post = parse(await (await get('/2025/05/17/travel-setonaikai-2025-day2/')).text());
		const photo = post
			.querySelectorAll('main figure.gallery li a')
			.map((link) => link.getAttribute('href')!)
			.find((href) => href.includes('/20250421_133752943.'));

		const response = await get('/?attachment_id=639');

		expect(photo).toBeDefined();
		expect(response.status).toBe(301);
		expect(redirectTarget(response)).toEqual({ origin: siteUrl, path: photo });
	});

	it('/?attachment_id=ID of a video redirects to the video on R2', async () => {
		const response = await get('/?attachment_id=1403');

		expect(response.status).toBe(301);
		expect(response.headers.get('location')).toBe(
			'https://media.aniya.moe/videos/travel-setonaikai-2025-day7/20250426_103131827.mp4',
		);
	});

	// 21 is an image nothing used, which did not move; 1887 was never an ID.
	it.each(['/?attachment_id=21', '/?attachment_id=1887'])('%s answers with HTTP 404 and the 404 page', async (path) => {
		const response = await get(path);

		expect(response.status).toBe(404);
		expect(await response.text()).toBe(readFileSync(join(outDir, '404.html'), 'utf8'));
	});

	it.each(['/', '/?utm_source=mastodon'])('%s, without any of them, is the home page', async (path) => {
		const response = await get(path);

		expect(response.status).toBe(200);
		expect(await response.text()).toBe(readFileSync(join(outDir, 'index.html'), 'utf8'));
	});
});

describe('the Worker', () => {
	// Each request that reaches the Worker counts towards the Workers free
	// plan's daily limit; requests the static assets answer are free. A Worker
	// that answers everything itself, in place of the site's, shows which
	// requests wrangler.jsonc sends to it.
	let marking: WranglerDev | undefined;
	beforeAll(async () => {
		const script = fileURLToPath(new URL('../fixtures/marking-worker.ts', import.meta.url));
		marking = await startWranglerDev({ assetsDir: outDir, script });
	}, 120_000);
	afterAll(async () => {
		await marking?.stop();
	});

	async function reachesWorker(path: string) {
		const response = await fetch(new URL(path, marking!.url), { redirect: 'manual' });
		await response.body?.cancel();
		return response.headers.get('x-test-worker') === 'ran';
	}

	it.each(['/', '/?p=30', '/?page_id=86', '/?attachment_id=639', '/?utm_source=mastodon'])('runs for the home page URL: %s', async (path) => {
		expect(await reachesWorker(path)).toBe(true);
	});

	it.each([
		// Pages, files and their trailing-slash redirects.
		'/about/',
		'/about',
		'/index.html',
		'/2021/09/30/第一篇文章/',
		'/feed/',
		'/sitemap.xml',
		'/favicon.ico',
		// Old URLs that _redirects rules answer.
		'/wp-content/uploads/2022/03/preview-1.png',
		'/2021/09/30/第一篇文章/feed/',
		'/2021/09/30/第一篇文章/feed',
		'/author/erase2004/',
		'/author/erase2004',
		// Unknown URLs, which get the 404 page.
		'/no-such-page/',
		'/no-such-page',
		'/wp-admin/',
		'/404/',
		// A query string below the home page.
		'/about/?p=30',
	])('does not run for any other URL: %s', async (path) => {
		expect(await reachesWorker(path)).toBe(false);
	});
});

describe('the URL checker', () => {
	// The committed pending list must name exactly the expected URLs this
	// build does not answer correctly yet, in both modes.
	function runUrlChecker(...args: string[]) {
		const { status, stdout, stderr } = spawnSync(process.execPath, [urlChecker, ...args], {
			encoding: 'utf8',
		});
		return { status, output: stdout + stderr };
	}

	it('passes on the build output', () => {
		expect(runUrlChecker('build', outDir)).toMatchObject({ status: 0 });
	}, 60_000);

	it('passes over HTTP', () => {
		expect(runUrlChecker('http', siteUrl)).toMatchObject({ status: 0 });
	}, 120_000);
});
