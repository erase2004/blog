// Builds the site and serves it with `wrangler dev`, the same way Cloudflare
// Workers static assets will serve it, then checks what readers and crawlers
// get back over HTTP, and what HTML readers get for converted content.
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { parse } from 'node-html-parser';
import { type Browser, type BrowserContextOptions, chromium, type Locator } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startWranglerDev, type WranglerDev } from './support/wrangler-dev';

const buildScript = fileURLToPath(new URL('./support/build-site.mjs', import.meta.url));
const urlChecker = fileURLToPath(new URL('../scripts/check-urls.ts', import.meta.url));

// Test-only pages the build script adds next to the site's real pages: a
// plain page, and one with the sidebar widgets.
const PROBE_PATH = '/probe/';
const WIDGETS_PATH = '/widgets/';
// Test-only pages with what the WordPress converter writes, in an .md and an
// .mdx file (tests/fixtures/converted-content.*), and the .mdx file as the
// feeds give it to feed readers.
const CONVERTED = { md: '/converted/md/', mdx: '/converted/mdx/' };
const CONVERTED_FEED_ITEM = '/converted/feed-item/';

let outDir: string;
let server: WranglerDev | undefined;

beforeAll(async () => {
	outDir = mkdtempSync(join(tmpdir(), 'aniya-moe-site-'));
	execFileSync(
		process.execPath,
		[
			buildScript,
			outDir,
			PROBE_PATH,
			WIDGETS_PATH,
			'/converted/[format]/=converted-content.astro',
			`${CONVERTED_FEED_ITEM}index.html=converted-feed-item.ts`,
		],
		{ stdio: 'inherit' },
	);
	server = await startWranglerDev({ assetsDir: outDir });
	// Making the webp images of 769 photos takes minutes the first time;
	// later builds take them from Astro's cache (node_modules/.astro).
}, 600_000);

afterAll(async () => {
	await server?.stop();
	rmSync(outDir, { recursive: true, force: true });
});

function get(path: string): Promise<Response> {
	return fetch(new URL(path, server!.url), { redirect: 'manual' });
}

// A browser, for what only a browser decides: which image of a srcset it
// loads, what JavaScript does. Started when first needed; tests using it get
// more time than the default 5 seconds.
let sharedBrowser: Promise<Browser> | undefined;
const BROWSER_TEST_TIMEOUT = 60_000;

afterAll(async () => {
	await (await sharedBrowser)?.close();
});

/**
 * A page of the site opened in a browser window of this size and pixel
 * density, with the JavaScript it loaded (files and inline scripts). Only the
 * site itself is reached: no YouTube thumbnails or videos from R2.
 */
async function openPage(path: string, viewport = { width: 1280, height: 800 }, deviceScaleFactor = 1) {
	sharedBrowser ??= chromium.launch();
	const context = await (await sharedBrowser).newContext({ viewport, deviceScaleFactor });
	await context.route((url) => url.origin !== server!.url, (route) => route.abort());
	const page = await context.newPage();
	const scriptFiles: Promise<string>[] = [];
	page.on('response', (response) => {
		if (response.request().resourceType() === 'script') scriptFiles.push(response.text());
	});
	await page.goto(new URL(path, server!.url).href, { waitUntil: 'load' });
	return {
		page,
		scripts: async () => [...(await Promise.all(scriptFiles)), ...(await page.locator('script:not([src])').allTextContents())],
		close: () => context.close(),
	};
}

/**
 * How wide the image `selector` matches is shown on the page, in device
 * pixels, and how wide the file of its srcset the browser loaded is.
 */
async function loadedImage(page: Awaited<ReturnType<typeof openPage>>['page'], selector: string) {
	const image = page.locator(selector).first();
	await image.scrollIntoViewIfNeeded();
	await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.complete && img.currentSrc !== '')).toBe(true);
	return image.evaluate((img: HTMLImageElement) => {
		const candidates = img.srcset.split(',').map((candidate) => {
			const [url, descriptor] = candidate.trim().split(/\s+/);
			return { url: new URL(url!, document.baseURI).href, width: Number.parseInt(descriptor!, 10) };
		});
		return {
			shown: img.getBoundingClientRect().width * devicePixelRatio,
			loaded: candidates.find(({ url }) => url === img.currentSrc)!.width,
			url: img.currentSrc,
			widths: candidates.map(({ width }) => width),
		};
	});
}

describe('build output', () => {
	it('writes each page as <path>/index.html', () => {
		expect(existsSync(join(outDir, 'probe', 'index.html'))).toBe(true);
	});
});

describe('trailing slash', () => {
	it('page URLs without the trailing slash are 301-redirected to the slashed URL', async () => {
		const response = await get(PROBE_PATH.slice(0, -1));

		expect(response.status).toBe(301);
		expect(new URL(response.headers.get('location')!, server!.url).pathname).toBe(PROBE_PATH);
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

describe('unknown URLs', () => {
	it('answer with HTTP 404 and the 404 page', async () => {
		const response = await get('/no-such-page/');

		expect(response.status).toBe(404);
		expect(await response.text()).toBe(readFileSync(join(outDir, '404.html'), 'utf8'));
	});
});

describe('images', () => {
	const POST = '/2022/03/25/vue-router-named-views/';

	// Wide screens, a laptop with a high-density screen, phones.
	it.each([
		[{ width: 1920, height: 1080 }, 1],
		[{ width: 1440, height: 900 }, 1],
		[{ width: 1280, height: 800 }, 2],
		[{ width: 820, height: 1180 }, 2],
		[{ width: 390, height: 844 }, 3],
		[{ width: 360, height: 780 }, 2],
	])('in posts are webp in several widths, of which a %o screen at %ix loads one as wide as the post’s column', async (viewport, density) => {
		const { page, close } = await openPage(POST, viewport, density);
		const { shown, loaded, url, widths } = await loadedImage(page, 'main img[alt="頁面預覽"]');
		await close();

		// The original is a 1280 × 960 PNG.
		expect(Math.max(...widths)).toBe(1280);
		// Browsers may settle for a file a little narrower than the image is shown.
		expect(loaded).toBeGreaterThanOrEqual(0.8 * Math.min(shown, Math.max(...widths)));
		expect(loaded).toBeLessThanOrEqual(Math.max(1.25 * shown, Math.min(...widths)));
		const response = await get(url);
		expect(response.status).toBe(200);
		expect(response.headers.get('content-type')).toBe('image/webp');
	}, BROWSER_TEST_TIMEOUT);

	// A post in Markdown, and one in MDX (it has galleries), whose images MDX makes.
	it.each([
		[POST, '頁面預覽', ['/wp-content/uploads/2022/03/preview-1.png', `${POST}preview-1/`]],
		[
			'/2025/05/17/travel-setonaikai-2025-day2/',
			'JR 四國 2700 柴聯車與其排氣管',
			['/wp-content/uploads/2025/05/20250421_070312897-scaled.jpg', '/2025/05/17/travel-setonaikai-2025-day2/20250421_070312897/'],
		],
	])('at their old URLs redirect to the image the post shows (%s)', async (path, alt, oldUrls) => {
		const img = parse(await (await get(path)).text()).querySelector(`main img[alt="${alt}"]`)!;

		for (const old of oldUrls) {
			const response = await get(old);
			expect(response.status).toBe(301);
			expect(new URL(response.headers.get('location')!, server!.url).pathname).toBe(img.getAttribute('src'));
		}
	});
});

describe('galleries', () => {
	const DAY_2 = '/2025/05/17/travel-setonaikai-2025-day2/';

	/** The galleries of a post: for each, its photos' links. */
	async function galleries(path: string) {
		const page = parse(await (await get(path)).text());
		return page.querySelectorAll('main figure.gallery').map((gallery) => gallery.querySelectorAll('li a'));
	}

	// The photos of the 83 Envira galleries (their block JSON) and the 3 core
	// gallery blocks in the WordPress backup, by post: 514 in all.
	it.each([
		['/2025/05/17/travel-setonaikai-2025-prologue/', [2, 5]],
		['/2025/05/17/travel-setonaikai-2025-day1/', [1]],
		[DAY_2, [2, 2, 3, 5, 7, 3, 4, 3, 3, 5, 3, 4]],
		['/2025/05/17/travel-setonaikai-2025-day3/', [3, 6, 3, 3, 2]],
		['/2025/05/17/travel-setonaikai-2025-day4/', [2, 6, 6, 5, 4, 3, 5, 2, 7, 3, 3, 3, 10, 4]],
		['/2025/05/17/travel-setonaikai-2025-day5/', [39, 2, 3, 16, 2, 3, 18, 7, 3, 4, 5, 4, 3]],
		['/2025/05/17/travel-setonaikai-2025-day6/', [3, 4, 3, 7, 10, 8, 4, 2]],
		['/2025/05/17/travel-setonaikai-2025-day7/', [3, 3, 5, 39, 12, 5, 6, 4, 3, 6, 3, 3, 25, 2, 27, 11, 8, 6, 2, 2]],
		['/2025/05/17/travel-setonaikai-2025-day8/', [8, 4, 7, 4, 9, 7, 5, 6]],
		['/2025/12/05/2025-koebitai/', [3]],
		['/2026/01/23/acgn-museum-ssg/', [2]],
		['/2022/03/30/靜態網站導入-webpack-進行重構/', [2]],
	])('%s shows the photos of its galleries, as many as WordPress did', async (path, photos) => {
		expect((await galleries(path)).map((links) => links.length)).toEqual(photos);
	});

	it('link each photo to the photo at full size, where its old URL redirects', async () => {
		const [first] = await galleries(DAY_2);
		const old = await get('/wp-content/uploads/2025/05/20250421_081608666-scaled.jpg');

		expect(old.status).toBe(301);
		expect(first![0]!.getAttribute('href')).toBe(new URL(old.headers.get('location')!, server!.url).pathname);
	});

	it('open a photo in a lightbox, which goes to the next and previous photo, shows captions, and closes', async () => {
		const { page, close } = await openPage(DAY_2);
		const first = page.locator('main figure.gallery').first().locator('a').first();
		const caption = () => page.locator('.pswp .pswp__caption').textContent();

		await first.click();
		await expect.poll(caption).toBe('店家外面的照片');
		// The photo itself, at full size or the lightbox's smaller size.
		const href = (await first.getAttribute('href'))!;
		const photos = page.locator('.pswp img.pswp__img');
		const showsPhoto = () =>
			photos.evaluateAll((images: HTMLImageElement[], url) => images.some((img) => img.currentSrc !== '' && (img.srcset.includes(url) || img.src.endsWith(url))), href);
		await expect.poll(showsPhoto).toBe(true);
		await page.keyboard.press('ArrowRight');
		await expect.poll(caption).toBe('店家內部的照片，可以看到有 Summer Pockets 的週邊與繪圖');
		await page.keyboard.press('ArrowLeft');
		await expect.poll(caption).toBe('店家外面的照片');
		await page.keyboard.press('Escape');
		await expect.poll(() => page.locator('.pswp').count()).toBe(0);
		await close();
	}, BROWSER_TEST_TIMEOUT);

	it('load their JavaScript only on pages with a gallery', async () => {
		const scriptsOf = async (path: string) => {
			const { scripts, close } = await openPage(path);
			const loaded = await scripts();
			await close();
			return loaded;
		};
		const lightbox = (scripts: string[]) => scripts.some((script) => script.includes('pswp'));

		expect(lightbox(await scriptsOf(DAY_2))).toBe(true);
		expect(lightbox(await scriptsOf('/2022/03/25/vue-router-named-views/'))).toBe(false);
	}, BROWSER_TEST_TIMEOUT);

	it.each([
		[{ width: 1440, height: 900 }, 1],
		[{ width: 390, height: 844 }, 3],
	])('show small images of the photos on a %o screen at %ix, not the photos at full size', async (viewport, density) => {
		const { page, close } = await openPage(DAY_2, viewport, density);
		const { shown, loaded } = await loadedImage(page, 'main figure.gallery img');
		await close();

		// The photo is 2560 × 1920.
		expect(loaded).toBeLessThanOrEqual(2 * shown);
		expect(loaded).toBeGreaterThanOrEqual(0.6 * shown);
	}, BROWSER_TEST_TIMEOUT);
});

// The expected post lists are what the WordPress site listed on the same
// URLs (aniya.moe, 2026-10-24).
describe('archives', () => {
	/** The posts a listing page links to, as UTF-8 paths, in order. */
	async function listedPosts(path: string): Promise<string[]> {
		const response = await get(path);
		expect(response.status, path).toBe(200);
		return parse(await response.text())
			.querySelectorAll('main article a[rel="bookmark"]')
			.map((link) => decodeURI(link.getAttribute('href')!));
	}

	it('a category archive lists the posts in the category, newest first', async () => {
		expect(await listedPosts('/category/閒聊/')).toEqual([
			'/2025/12/05/2025-koebitai/',
			'/2022/03/11/alpha-camp推特專案開發紀錄/',
			'/2021/11/30/電子紙閱讀器使用心得/',
			'/2021/09/30/第一篇文章/',
		]);
	});

	it('a tag archive lists the posts with the tag, whatever characters its slug has', async () => {
		expect(await listedPosts('/tag/book☆walker/')).toEqual(['/2021/11/30/電子紙閱讀器使用心得/']);
		expect(await listedPosts('/tag/ざつ旅/')).toEqual([
			'/2025/05/17/travel-setonaikai-2025-day4/',
			'/2025/05/17/travel-setonaikai-2025-day3/',
		]);
	});

	it('date archives list the posts of a year, a month and a day', async () => {
		expect(await listedPosts('/2021/')).toEqual([
			'/2021/11/30/電子紙閱讀器使用心得/',
			'/2021/10/21/開啟隱藏的windows音效設定/',
			'/2021/10/20/修正visual-c-runtime安裝問題/',
			'/2021/09/30/第一篇文章/',
		]);
		expect(await listedPosts('/2022/03/')).toEqual([
			'/2022/03/30/靜態網站導入-webpack-進行重構/',
			'/2022/03/25/vue-router-named-views/',
			'/2022/03/24/vue-router-nested-routes/',
			'/2022/03/11/alpha-camp推特專案開發紀錄/',
			'/2022/03/09/讓android手機畫面顯示在windows電腦上/',
		]);
		expect(await listedPosts('/2025/05/17/')).toEqual([
			'/2025/05/17/travel-setonaikai-2025-day8/',
			'/2025/05/17/travel-setonaikai-2025-day7/',
			'/2025/05/17/travel-setonaikai-2025-day6/',
			'/2025/05/17/travel-setonaikai-2025-day5/',
			'/2025/05/17/travel-setonaikai-2025-day4/',
			'/2025/05/17/travel-setonaikai-2025-day3/',
			'/2025/05/17/travel-setonaikai-2025-day2/',
			'/2025/05/17/travel-setonaikai-2025-day1/',
			'/2025/05/17/travel-setonaikai-2025-prologue/',
		]);
	});

	it('an archive with more than 10 posts goes on at <archive>/page/2/', async () => {
		expect(await listedPosts('/2025/')).toEqual([
			'/2025/12/05/2025-koebitai/',
			'/2025/05/17/travel-setonaikai-2025-day8/',
			'/2025/05/17/travel-setonaikai-2025-day7/',
			'/2025/05/17/travel-setonaikai-2025-day6/',
			'/2025/05/17/travel-setonaikai-2025-day5/',
			'/2025/05/17/travel-setonaikai-2025-day4/',
			'/2025/05/17/travel-setonaikai-2025-day3/',
			'/2025/05/17/travel-setonaikai-2025-day2/',
			'/2025/05/17/travel-setonaikai-2025-day1/',
			'/2025/05/17/travel-setonaikai-2025-prologue/',
		]);
		expect(await listedPosts('/2025/page/2/')).toEqual(['/2025/03/25/next-js-app-route-and-cloud-cdn-cache/']);
		expect((await get('/2025/page/3/')).status).toBe(404);
	});

	it('the home page lists the 10 newest posts, and /page/N/ the older ones', async () => {
		const home = await listedPosts('/');
		expect(home).toHaveLength(10);
		expect(home[0]).toBe('/2026/01/23/acgn-museum-ssg/');
		expect(home[9]).toBe('/2025/05/17/travel-setonaikai-2025-day1/');
		expect(await listedPosts('/page/2/')).toEqual([
			'/2025/05/17/travel-setonaikai-2025-prologue/',
			'/2025/03/25/next-js-app-route-and-cloud-cdn-cache/',
			'/2022/05/05/專案開發遇到的問題整理-2022-05-05/',
			'/2022/03/30/靜態網站導入-webpack-進行重構/',
			'/2022/03/25/vue-router-named-views/',
			'/2022/03/24/vue-router-nested-routes/',
			'/2022/03/11/alpha-camp推特專案開發紀錄/',
			'/2022/03/09/讓android手機畫面顯示在windows電腦上/',
			'/2021/11/30/電子紙閱讀器使用心得/',
			'/2021/10/21/開啟隱藏的windows音效設定/',
		]);
		expect(await listedPosts('/page/3/')).toEqual([
			'/2021/10/20/修正visual-c-runtime安裝問題/',
			'/2021/09/30/第一篇文章/',
		]);
		expect((await get('/page/4/')).status).toBe(404);
	});

	it('pages after the first are noindex, nofollow; first pages, date archives included, are indexable', async () => {
		/** The directives of the page's robots meta tags. */
		async function robots(path: string): Promise<string[]> {
			return parse(await (await get(path)).text())
				.querySelectorAll('head meta[name="robots"]')
				.flatMap((meta) => meta.getAttribute('content')!.split(',').map((directive) => directive.trim()));
		}

		for (const path of ['/page/2/', '/page/3/', '/2025/page/2/']) {
			expect(await robots(path), path).toEqual(expect.arrayContaining(['noindex', 'nofollow']));
		}
		for (const path of ['/', '/2025/', '/2025/05/', '/2025/05/17/', '/category/技術/', '/tag/vue/']) {
			expect(await robots(path), path).not.toContain('noindex');
		}
	});

	it('have the titles WordPress gave them', async () => {
		const titles: Record<string, string> = {};
		for (const path of [
			'/',
			'/page/3/',
			'/category/技術/',
			'/tag/book☆walker/',
			'/2025/',
			'/2025/page/2/',
			'/2025/05/',
			'/2025/05/17/',
		]) {
			titles[path] = parse(await (await get(path)).text()).querySelector('title')!.text;
		}
		expect(titles).toEqual({
			'/': 'TsukiStudio - 生活點滴紀錄',
			'/page/3/': 'TsukiStudio - 生活點滴紀錄 - Page 3',
			'/category/技術/': '技術 - TsukiStudio',
			'/tag/book☆walker/': 'BOOK☆WALKER - TsukiStudio',
			'/2025/': '2025 - TsukiStudio',
			'/2025/page/2/': '2025 - TsukiStudio - Page 2',
			'/2025/05/': '5 月, 2025 - TsukiStudio',
			'/2025/05/17/': '2025 年 5 月 17 日 - TsukiStudio',
		});
	});
});

// Expected values from the WordPress sidebar (aniya.moe, 2026-10-24).
describe('sidebar widgets', () => {
	async function widget(id: string) {
		const response = await get(WIDGETS_PATH);
		return parse(await response.text()).querySelector(`#${id}`)!;
	}

	/** Each list item's link, and the post count after it. */
	async function countedLinks(id: string) {
		return (await widget(id)).querySelectorAll('li').map((item) => {
			const link = item.querySelector('a')!;
			return {
				text: link.text.trim(),
				href: decodeURI(link.getAttribute('href')!),
				count: Number(item.text.match(/\((\d+)\)/)?.[1]),
			};
		});
	}

	it('the category list links to each category that has posts, with its post count', async () => {
		expect(await countedLinks('categories')).toEqual([
			{ text: '技術', href: '/category/技術/', count: 9 },
			{ text: '旅遊', href: '/category/旅遊/', count: 10 },
			{ text: '閒聊', href: '/category/閒聊/', count: 4 },
		]);
	});

	it('the year list links to each year that has posts, newest first, with its post count', async () => {
		expect(await countedLinks('years')).toEqual([
			{ text: '2026', href: '/2026/', count: 1 },
			{ text: '2025', href: '/2025/', count: 11 },
			{ text: '2022', href: '/2022/', count: 6 },
			{ text: '2021', href: '/2021/', count: 4 },
		]);
	});

	it('the tag cloud links to every tag that has posts, by name, bigger the more posts it has', async () => {
		const cloud = (await widget('tags')).querySelectorAll('a').map((link) => ({
			text: link.text.trim(),
			href: decodeURI(link.getAttribute('href')!),
			size: Number(link.getAttribute('style')?.match(/font-size:\s*([\d.]+)pt/)?.[1]),
		}));

		expect(cloud).toHaveLength(57);
		expect(cloud).toContainEqual(expect.objectContaining({ text: 'BOOK☆WALKER', href: '/tag/book☆walker/' }));
		// WordPress showed 30 of the tags (ties picked arbitrarily), 10pt to 16pt.
		const wordpress: [string, number][] = [
			['Astro', 10],
			['Ave Mujica', 10],
			['SSG', 10],
			['Summer Pockets', 14.430769230769],
			['Tailwind CSS', 10],
			['Vue', 11.661538461538],
			['Vue Router', 11.661538461538],
			['Website Optimization', 10],
			['Windows', 12.769230769231],
			['からかい上手の高木さん', 10],
			['こえび隊', 10],
			['ざつ旅', 11.661538461538],
			['ゆゆゆ', 11.661538461538],
			['丸龜', 11.661538461538],
			['女木島', 10],
			['小蝦隊', 10],
			['小豆島', 10],
			['岡山', 12.769230769231],
			['德島', 11.661538461538],
			['推しが武道館いってくれたら死ぬ', 10],
			['沙彌島', 10],
			['瀨居島', 10],
			['瀨戶內國際藝術祭', 15.538461538462],
			['犬島', 10],
			['男木島', 11.661538461538],
			['直島', 10],
			['聖地巡禮', 16],
			['香川', 10],
			['高松', 15.076923076923],
			['鳴門', 10],
		];
		const shown = new Set(wordpress.map(([text]) => text));
		expect(cloud.filter(({ text }) => shown.has(text)).map(({ text, size }) => [text, size])).toEqual(
			wordpress.map(([text, size]) => [text, expect.closeTo(size, 2)]),
		);
	});
});

describe('layout', () => {
	// One page of each kind the layout wraps: home, home page 2, post, page,
	// category, tag and date archives, and the 404 page.
	const PAGES = [
		'/',
		'/page/2/',
		'/2021/11/30/電子紙閱讀器使用心得/',
		'/about/contact/',
		'/category/技術/',
		'/tag/vue/',
		'/2025/05/',
		'/no-such-page/',
	];

	async function html(path: string) {
		return parse(await (await get(path)).text());
	}

	/** The site header: the page's `header` outside `main`. */
	function siteHeader(page: ReturnType<typeof parse>) {
		return page.querySelectorAll('header').find((header) => !header.closest('main'));
	}

	it.each(PAGES)('%s has the site name, linking to the home page, and the tagline in the site header', async (path) => {
		const header = siteHeader(await html(path));

		const home = header?.querySelector('a[href="/"]');
		expect(home?.text.trim()).toBe('TsukiStudio');
		expect(header?.text).toContain('生活點滴紀錄');
	});

	// The WordPress menu (aniya.moe, 2026-10-24): 首頁, 關於我 (with 我的故事 and
	// 聯絡方式 under it), 訂閱, 隱私權政策.
	it.each(PAGES)('%s has the six links of the WordPress menu, in its order, in the site header', async (path) => {
		const links = siteHeader(await html(path))
			?.querySelectorAll('nav a')
			.map((link) => [link.text.trim(), decodeURI(link.getAttribute('href')!)]);

		expect(links).toEqual([
			['首頁', '/'],
			['關於我', '/about/'],
			['我的故事', '/about/autobiography/'],
			['聯絡方式', '/about/contact/'],
			['訂閱', '/subscribe/'],
			['隱私權政策', '/policy/'],
		]);
	});

	it('the menu marks the link to the page being read', async () => {
		const current = async (path: string) =>
			siteHeader(await html(path))
				?.querySelectorAll('nav a[aria-current="page"]')
				.map((link) => link.text.trim());

		expect(await current('/')).toEqual(['首頁']);
		expect(await current('/about/contact/')).toEqual(['聯絡方式']);
		expect(await current('/page/2/')).toEqual([]);
		expect(await current('/2021/11/30/電子紙閱讀器使用心得/')).toEqual([]);
	});

	// As in the WordPress sidebar: categories, then years, then the tag cloud.
	it.each(PAGES)('%s has the sidebar, beside the main column, with the categories, years and tag cloud', async (path) => {
		const page = await html(path);
		const sidebar = page.querySelector('aside');
		const linksUnder = (heading: string) =>
			sidebar
				?.querySelectorAll('section')
				.find((section) => section.querySelector('h2')?.text.trim() === heading)
				?.querySelectorAll('a')
				.map((link) => decodeURI(link.getAttribute('href')!));

		expect(page.querySelector('main')).not.toBeNull();
		expect(sidebar?.closest('main')).toBeFalsy();
		const headings = sidebar?.querySelectorAll('h2').map((heading) => heading.text.trim());
		expect(headings?.filter((heading) => ['分類', '年份', '標籤'].includes(heading))).toEqual(['分類', '年份', '標籤']);
		expect(linksUnder('分類')).toEqual(['/category/技術/', '/category/旅遊/', '/category/閒聊/']);
		expect(linksUnder('年份')).toEqual(['/2026/', '/2025/', '/2022/', '/2021/']);
		expect(linksUnder('標籤')).toHaveLength(57);
	});

	it.each(PAGES)('%s has the site footer, with the rel="me" link that verifies the Mastodon account', async (path) => {
		const footer = (await html(path)).querySelectorAll('footer').find((element) => !element.closest('main'));

		expect(footer?.text).toContain('TsukiStudio');
		// As on the WordPress site, for Mastodon's profile link verification.
		expect(footer?.querySelector('a[href="https://g0v.social/@erase2004"]')?.getAttribute('rel')).toContain('me');
	});

	describe('a post', () => {
		/** Each date the post shows, by its label: the text and the instant of its `<time>`. */
		async function postDates(path: string) {
			const article = (await html(path)).querySelector('main article');
			return Object.fromEntries(
				article!.querySelectorAll('dt').map((term) => {
					const time = term.nextElementSibling?.querySelector('time');
					return [
						term.text.trim(),
						{ text: time?.text.trim(), instant: new Date(time?.getAttribute('datetime') ?? NaN).toISOString() },
					];
				}),
			);
		}

		// Expected values: post_date and post_modified in the WordPress database
		// (Asia/Taipei), in its date_format `Y 年 n 月 j 日`.
		it('shows when it was published and last updated', async () => {
			expect(await postDates('/2021/11/30/電子紙閱讀器使用心得/')).toEqual({
				發布日期: { text: '2021 年 11 月 30 日', instant: '2021-11-30T08:46:07.000Z' },
				最後更新: { text: '2022 年 4 月 6 日', instant: '2022-04-06T05:46:11.000Z' },
			});
		});

		it('shows dates in Taipei time', async () => {
			// Updated 2025-03-26 00:42 in Taipei: still the 25th in UTC.
			expect(await postDates('/2025/03/25/next-js-app-route-and-cloud-cdn-cache/')).toMatchObject({
				最後更新: { text: '2025 年 3 月 26 日', instant: '2025-03-25T16:42:18.000Z' },
			});
		});

		it('scheduled, and last edited before it went out, shows its publish date as the last update', async () => {
			// Edited 2025-05-16 20:19, published 2025-05-17 09:30.
			expect(await postDates('/2025/05/17/travel-setonaikai-2025-day1/')).toEqual({
				發布日期: { text: '2025 年 5 月 17 日', instant: '2025-05-17T01:30:00.000Z' },
				最後更新: { text: '2025 年 5 月 17 日', instant: '2025-05-17T01:30:00.000Z' },
			});
		});
	});

	describe('on a phone', () => {
		// WCAG's reflow width: content fits 320 CSS pixels without scrolling sideways.
		const PHONE = { width: 320, height: 640 };

		let browser: Browser | undefined;

		beforeAll(async () => {
			browser = await chromium.launch();
		}, 60_000);

		afterAll(async () => {
			await browser?.close();
		});

		/** Every post, as UTF-8 paths, from the build output. */
		function postPaths(): string[] {
			return readdirSync(outDir, { recursive: true, encoding: 'utf8' })
				.map((file) => file.replaceAll('\\', '/'))
				.filter((file) => /^\d{4}\/\d{2}\/\d{2}\/[^/]+\/index\.html$/.test(file))
				.map((file) => `/${file.slice(0, -'index.html'.length)}`);
		}

		it('no page scrolls sideways: every post and page, and each kind of listing', async () => {
			const posts = postPaths();
			expect(posts).toHaveLength(22);
			const paths = [
				...['/', '/page/2/', '/category/旅遊/', '/tag/vue/', '/2025/', '/2025/05/17/', '/no-such-page/'],
				...['/about/', '/about/autobiography/', '/about/contact/', '/subscribe/', '/policy/'],
				...posts,
			];
			const context = await browser!.newContext({ viewport: PHONE });
			// Only the site itself: no YouTube thumbnails or videos from R2.
			await context.route((url) => url.origin !== server!.url, (route) => route.abort());
			const page = await context.newPage();

			const overflowing: Record<string, unknown> = {};
			for (const path of paths) {
				await page.goto(new URL(path, server!.url).href, { waitUntil: 'load' });
				const overflow = await page.evaluate(() => {
					const width = document.documentElement.clientWidth;
					if (document.documentElement.scrollWidth <= width) return null;
					// The innermost elements that reach past the right edge, to say what to
					// fix; not those inside something that scrolls or clips them.
					const clipped = (element: Element) => {
						for (let parent = element.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
							if (getComputedStyle(parent).overflowX !== 'visible') return true;
						}
						return false;
					};
					const wide = [...document.body.querySelectorAll('*')].filter(
						(element) => element.getBoundingClientRect().right > width + 1 && !clipped(element),
					);
					const innermost = wide.filter((element) => !wide.some((other) => other !== element && element.contains(other)));
					return {
						scrollWidth: document.documentElement.scrollWidth,
						elements: innermost.slice(0, 5).map((element) => element.outerHTML.slice(0, 120)),
					};
				});
				if (overflow) overflowing[path] = overflow;
			}
			await context.close();

			expect(overflowing).toEqual({});
		}, 120_000);
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
		expect(runUrlChecker('http', server!.url)).toMatchObject({ status: 0 });
	}, 120_000);
});

describe('converted content', () => {
	/** A built page; <pre> is parsed as elements too (Expressive Code puts its lines in it). */
	const page = (path: string) =>
		parse(readFileSync(join(outDir, path, 'index.html'), 'utf8'), { blockTextElements: { script: true, style: true } });

	describe('code blocks', () => {
		it.each(Object.entries(CONVERTED))('in %s are highlighted by Expressive Code, titled with their file name', (_, path) => {
			const block = page(path).querySelector('.expressive-code');

			expect(block?.querySelector('figcaption .title')?.text).toBe('src/router/index.js');
			expect(block?.querySelector('pre')?.getAttribute('data-language')).toBe('javascript');
			expect(block?.querySelectorAll('pre code span[style]').length).toBeGreaterThan(0);
		});

		it('have a copy button that speaks Chinese', () => {
			const button = page(CONVERTED.md).querySelector('.expressive-code .copy button');

			expect(button?.getAttribute('title')).toBe('複製到剪貼簿');
			expect(button?.getAttribute('data-copied')).toBe('已複製！');
		});
	});

	describe('footnotes', () => {
		it.each(Object.entries(CONVERTED))('in %s link to their texts, which link back', (_, path) => {
			const html = page(path);
			const reference = html.querySelector('a[data-footnote-ref]');

			expect(reference?.text).toBe('1');
			expect(reference?.getAttribute('href')).toBe('#user-content-fn-1');
			const backReference = html.getElementById('user-content-fn-1')?.querySelector('a[data-footnote-backref]');
			expect(backReference?.getAttribute('href')).toBe(`#${reference?.id}`);
			expect(backReference?.getAttribute('aria-label')).toBe('回到內文的註腳 1');
		});

		it('are listed under a heading in Chinese, for screen readers', () => {
			const heading = page(CONVERTED.md).getElementById('footnote-label');

			expect(heading?.text).toBe('註腳');
			expect(heading?.classList.contains('sr-only')).toBe(true);
		});
	});

	describe('YouTube embeds', () => {
		it('show the thumbnail, linked to the video, and no player until clicked', () => {
			const html = page(CONVERTED.mdx);
			const link = html.querySelector('a[href="https://www.youtube.com/watch?v=x3_Pcru8SS8"]');

			expect(link?.querySelector('img')?.getAttribute('src')).toBe('https://i.ytimg.com/vi/x3_Pcru8SS8/hqdefault.jpg');
			expect(link?.text).toContain('TVアニメ『Summer Pockets』第1弾PV');
			expect(html.querySelectorAll('iframe')).toHaveLength(0);
		});
	});

	describe('before/after sliders', () => {
		it('show the before image left of the divider and the after image right of it, as webp in several widths, with their caption', () => {
			const figure = page(CONVERTED.mdx).querySelector('img-comparison-slider')?.closest('figure');
			const image = (slot: string) => figure?.querySelector(`img-comparison-slider [slot="${slot}"] img`);

			expect(image('first')?.getAttribute('src')).toMatch(/\/ydmk705\.[^/]+\.webp$/);
			expect(image('second')?.getAttribute('src')).toMatch(/\/pi_20250421_063159\.[^/]+\.webp$/);
			for (const slot of ['first', 'second']) {
				expect(image(slot)?.getAttribute('srcset')?.split(',').length).toBeGreaterThan(1);
			}
			expect(figure?.querySelector('figcaption')?.text).toBe('結城友奈は勇者である中出現的公車站');
			expect(figure?.querySelector('figcaption a')?.getAttribute('href')).toBe('https://yuyuyu.tv/season1/');
		});

		// The sliders in the WordPress backup: jetpack/image-compare blocks, plus
		// the copies of their markup pasted as Custom HTML (wp:html) blocks.
		it.each([
			['/2025/05/17/travel-setonaikai-2025-day2/', 6 + 0],
			['/2025/05/17/travel-setonaikai-2025-day3/', 7 + 2],
			['/2025/05/17/travel-setonaikai-2025-day4/', 11 + 2],
			['/2025/05/17/travel-setonaikai-2025-day5/', 17 + 2],
			['/2025/05/17/travel-setonaikai-2025-day6/', 12 + 0],
			['/2025/05/17/travel-setonaikai-2025-day8/', 19 + 2],
		])('%s has the %i sliders it had on WordPress', (path, sliders) => {
			const html = page(path);

			expect(html.querySelectorAll('main img-comparison-slider')).toHaveLength(sliders);
			expect(html.querySelectorAll('main img-comparison-slider [slot] img')).toHaveLength(2 * sliders);
		});

		describe('in a browser', () => {
			let browser: Browser | undefined;

			beforeAll(async () => {
				browser = await chromium.launch();
			}, 60_000);

			afterAll(async () => {
				await browser?.close();
			});

			/** A page with the slider in view, once its script has run; only the site itself loads. */
			async function openSlider(options: BrowserContextOptions = {}) {
				const context = await browser!.newContext(options);
				await context.route((url) => url.origin !== server!.url, (route) => route.abort());
				const page = await context.newPage();
				await page.goto(new URL(CONVERTED.mdx, server!.url).href);
				const slider = page.locator('img-comparison-slider');
				await slider.scrollIntoViewIfNeeded();
				await expect.poll(() => slider.evaluate((element) => element.classList.contains('rendered'))).toBe(true);
				return { context, page, slider, box: (await slider.boundingBox())! };
			}

			/** Where the divider is, in percent of the slider's width from its left edge. */
			const dividerAt = async (slider: Locator) =>
				Math.round(await slider.evaluate((element) => (element as HTMLElement & { value: number }).value));

			it('the divider starts in the middle and follows the mouse when dragged', async () => {
				const { context, page, slider, box } = await openSlider();
				const y = box.y + box.height / 2;

				expect(await dividerAt(slider)).toBe(50);
				await page.mouse.move(box.x + box.width / 2, y);
				await page.mouse.down();
				await page.mouse.move(box.x + box.width / 4, y, { steps: 5 });
				await page.mouse.up();

				expect(await dividerAt(slider)).toBe(25);
				await context.close();
			});

			it('the divider follows a finger dragging it sideways on a phone', async () => {
				const { context, page, slider, box } = await openSlider({ viewport: { width: 390, height: 844 }, hasTouch: true });
				const cdp = await context.newCDPSession(page);
				const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', x?: number) =>
					cdp.send('Input.dispatchTouchEvent', {
						type,
						touchPoints: x === undefined ? [] : [{ x, y: box.y + box.height / 2 }],
					});

				await touch('touchStart', box.x + box.width / 2);
				for (const at of [0.55, 0.6, 0.65, 0.7, 0.75]) await touch('touchMove', box.x + box.width * at);
				await touch('touchEnd');

				expect(await dividerAt(slider)).toBe(75);
				await context.close();
			});

			it('load their script only on pages that have a slider', async () => {
				const context = await browser!.newContext();
				await context.route((url) => url.origin !== server!.url, (route) => route.abort());
				const page = await context.newPage();
				const sliderScriptRan = async (path: string) => {
					await page.goto(new URL(path, server!.url).href, { waitUntil: 'load' });
					return page.evaluate(() => customElements.get('img-comparison-slider') !== undefined);
				};

				expect(await sliderScriptRan(CONVERTED.mdx)).toBe(true);
				expect(await sliderScriptRan('/2025/05/17/travel-setonaikai-2025-day2/')).toBe(true);
				expect(await sliderScriptRan(CONVERTED.md)).toBe(false);
				expect(await sliderScriptRan('/2025/05/17/travel-setonaikai-2025-day1/')).toBe(false);
				expect(await sliderScriptRan('/2021/11/30/電子紙閱讀器使用心得/')).toBe(false);
				await context.close();
			});
		});
	});
});

/** HTML, with <pre> parsed as elements too (Expressive Code puts its lines in it). */
function parseHtml(html: string) {
	return parse(html, { blockTextElements: { script: true, style: true } });
}

/** An XML document as objects; elements named in `lists` are always arrays. */
function parseXml(xml: string, lists: string[] = []) {
	expect(XMLValidator.validate(xml), 'well-formed XML').toBe(true);
	return new XMLParser({
		ignoreAttributes: false,
		attributeNamePrefix: '@',
		// Character references such as &#60; too.
		htmlEntities: true,
		isArray: (name) => lists.includes(name),
	}).parse(xml);
}

// Expected values from the WordPress feeds (aniya.moe/feed/ and /feed/atom/,
// 2026-10-24): the same 10 newest posts, full text.
describe('feeds', () => {
	const NEWEST_POSTS = [
		'https://aniya.moe/2026/01/23/acgn-museum-ssg/',
		'https://aniya.moe/2025/12/05/2025-koebitai/',
		'https://aniya.moe/2025/05/17/travel-setonaikai-2025-day8/',
		'https://aniya.moe/2025/05/17/travel-setonaikai-2025-day7/',
		'https://aniya.moe/2025/05/17/travel-setonaikai-2025-day6/',
		'https://aniya.moe/2025/05/17/travel-setonaikai-2025-day5/',
		'https://aniya.moe/2025/05/17/travel-setonaikai-2025-day4/',
		'https://aniya.moe/2025/05/17/travel-setonaikai-2025-day3/',
		'https://aniya.moe/2025/05/17/travel-setonaikai-2025-day2/',
		'https://aniya.moe/2025/05/17/travel-setonaikai-2025-day1/',
	];

	async function rss() {
		return parseXml(await (await get('/feed/')).text(), ['item', 'category']).rss;
	}

	it('/feed/ is an RSS 2.0 feed of the 10 newest posts, newest first', async () => {
		const response = await get('/feed/');

		expect(response.status).toBe(200);
		expect(response.headers.get('content-type')).toBe('application/rss+xml; charset=utf-8');
		const feed = await rss();
		expect(feed['@version']).toBe('2.0');
		expect(feed.channel.title).toBe('TsukiStudio');
		expect(feed.channel.description).toBe('生活點滴紀錄');
		expect(feed.channel.item.map((item: { link: string }) => item.link)).toEqual(NEWEST_POSTS);
	});

	// Feed readers tell items apart by GUID: new GUIDs would show the 10 posts
	// as new posts again.
	it('/feed/ keeps the GUIDs WordPress gave the items, and their dates and categories', async () => {
		const feed = await rss();
		const [newest] = feed.channel.item;

		expect(feed.channel.item.map((item: { guid: { '#text': string } }) => item.guid['#text'])).toEqual(
			[1854, 1797, 1590, 1331, 1158, 947, 767, 701, 552, 493].map((id) => `https://aniya.moe/?p=${id}`),
		);
		expect(newest).toMatchObject({
			title: '從 SSR 到 SSG：ACGN 股市歷史博物館 7 萬頁靜態化的實戰轉型紀錄',
			guid: { '@isPermaLink': 'false' },
			pubDate: 'Fri, 23 Jan 2026 10:00:00 +0000',
			'dc:creator': 'Tsuki',
			category: ['技術', 'Astro', 'SSG', 'Website Optimization'],
		});
		expect(feed.channel.lastBuildDate).toBe('Fri, 23 Jan 2026 10:01:26 +0000');
		expect(feed.channel.language).toBe('zh-TW');
		expect(feed.channel['atom:link']).toMatchObject({ '@href': 'https://aniya.moe/feed/', '@rel': 'self' });
	});

	/** The text a reader reads: whitespace runs as one space. */
	const readableText = (html: ReturnType<typeof parseHtml> | undefined | null) => html?.text.replace(/\s+/g, ' ').trim();

	it('/feed/ has the full text of each post, as the post page has it', async () => {
		for (const item of (await rss()).channel.item) {
			const page = parseHtml(await (await get(new URL(item.link).pathname)).text());

			expect(readableText(parseHtml(item['content:encoded'])), item.link).toBe(
				readableText(page.querySelector('main article .prose')),
			);
		}
	});

	it('/feed/ items show the image files the post pages show', async () => {
		for (const item of (await rss()).channel.item) {
			const page = parseHtml(await (await get(new URL(item.link).pathname)).text());
			const sources = (html: ReturnType<typeof parseHtml> | null) =>
				new Set(html?.querySelectorAll('img').map((img) => new URL(img.getAttribute('src')!, 'https://aniya.moe/').href));

			expect(sources(parseHtml(item['content:encoded'])), item.link).toEqual(
				sources(page.querySelector('main article .prose')),
			);
		}
	});

	/** Every URL a feed item's HTML links to or loads, by attribute. */
	function urlsIn(html: ReturnType<typeof parseHtml>) {
		const attribute = (selector: string, name: string) =>
			html.querySelectorAll(selector).map((element) => element.getAttribute(name)!);
		return {
			links: attribute('a[href]', 'href'),
			images: [
				...attribute('img[src], video[src], source[src]', 'src'),
				...attribute('video[poster]', 'poster'),
				...attribute('img[srcset], source[srcset]', 'srcset').flatMap((srcset) =>
					srcset.split(',').map((candidate) => candidate.trim().split(/\s+/)[0]!),
				),
			],
		};
	}

	it('/feed/ links and loads images by absolute URLs, which work', async () => {
		const sameSite = new Set<string>();
		for (const item of (await rss()).channel.item) {
			const { links, images } = urlsIn(parseHtml(item['content:encoded']));

			// Fragment links (footnotes) stay within the item.
			const relative = [...links.filter((link) => !link.startsWith('#')), ...images].filter(
				(url) => !/^(https?|mailto):/.test(url),
			);
			expect(relative, item.link).toEqual([]);
			expect(images.length + links.length, item.link).toBeGreaterThan(0);
			for (const url of [...links, ...images].filter((url) => url.startsWith('https://aniya.moe/'))) {
				sameSite.add(new URL(url).pathname);
			}
		}

		const broken: Record<string, number> = {};
		const paths = [...sameSite];
		while (paths.length > 0) {
			await Promise.all(
				paths.splice(0, 20).map(async (path) => {
					const { status } = await fetch(new URL(path, server!.url), { method: 'HEAD', redirect: 'manual' });
					if (status !== 200) broken[decodeURI(path)] = status;
				}),
			);
		}
		expect(sameSite.size).toBeGreaterThan(100);
		expect(broken).toEqual({});
	}, 120_000);

	// A reader may show several items on one page: footnote 1 of one post must
	// not jump to footnote 1 of another.
	it('/feed/ items share no element IDs, and their fragment links stay within the item', async () => {
		const seen = new Map<string, string>();
		const shared: string[] = [];
		let fragmentLinks = 0;
		for (const item of (await rss()).channel.item) {
			const html = parseHtml(item['content:encoded']);
			const ids = html.querySelectorAll('[id]').map((element) => element.id);
			for (const id of ids) {
				if (seen.has(id)) shared.push(`${id} (${seen.get(id)}, ${item.link})`);
				seen.set(id, item.link);
			}
			const targets = urlsIn(html)
				.links.filter((link) => link.startsWith('#'))
				.map((link) => decodeURIComponent(link.slice(1)));
			expect(targets.filter((target) => !ids.includes(target)), item.link).toEqual([]);
			fragmentLinks += targets.length;
		}

		expect(shared).toEqual([]);
		// The footnotes of 2025-koebitai, at least.
		expect(fragmentLinks).toBeGreaterThan(4);
	});

	// Feed readers run no scripts and load no stylesheets of the site.
	it('/feed/ items have no scripts, stylesheets, or controls and data attributes for them', async () => {
		for (const item of (await rss()).channel.item) {
			const html = parseHtml(item['content:encoded']);

			expect(html.querySelectorAll('script, style, link, button').map(({ tagName }) => tagName), item.link).toEqual([]);
			const dataAttributes = html
				.querySelectorAll('*')
				.flatMap((element) => Object.keys(element.attributes).filter((name) => name.startsWith('data-')));
			expect(new Set(dataAttributes), item.link).toEqual(new Set());
		}
	});

	it('give MDX posts as plain HTML: a YouTube embed is its thumbnail, linked to the video', () => {
		const html = parseHtml(readFileSync(join(outDir, CONVERTED_FEED_ITEM, 'index.html'), 'utf8'));

		const link = html.querySelector('a[href="https://www.youtube.com/watch?v=x3_Pcru8SS8"]');
		expect(link?.querySelector('img')?.getAttribute('src')).toBe('https://i.ytimg.com/vi/x3_Pcru8SS8/hqdefault.jpg');
		expect(link?.text).toContain('TVアニメ『Summer Pockets』第1弾PV');
		expect(html.querySelector('.expressive-code pre')?.text).toContain("const routes = [{ path: '/nested' }]");
		expect(html.querySelector('sup > a')?.getAttribute('href')).toBe('#post-mdx-user-content-fn-1');
		expect(html.querySelectorAll('script, style, link, button').map(({ tagName }) => tagName)).toEqual([]);
	});

	// As WordPress answered them (aniya.moe, 2026-10-24).
	it.each(['/feed/', '/feed/atom/'])('%s is kept out of search results, and without its trailing slash 301-redirects to it', async (path) => {
		expect((await get(path)).headers.get('x-robots-tag')).toBe('noindex, follow');
		const slashless = await get(path.slice(0, -1));
		expect(slashless.status).toBe(301);
		expect(new URL(slashless.headers.get('location')!, server!.url).pathname).toBe(path);
	});

	it.each(['/', '/page/2/', '/2021/11/30/電子紙閱讀器使用心得/', '/about/contact/', '/tag/vue/', '/2025/05/', '/no-such-page/'])(
		'%s links to both feeds in its head, for browsers and feed readers to find',
		async (path) => {
			const head = parseHtml(await (await get(path)).text()).querySelector('head');
			const feeds = head
				?.querySelectorAll('link[rel="alternate"]')
				.map((link) => [link.getAttribute('type'), link.getAttribute('href')]);

			expect(feeds).toEqual([
				['application/rss+xml', 'https://aniya.moe/feed/'],
				['application/atom+xml', 'https://aniya.moe/feed/atom/'],
			]);
		},
	);

	it('/feed/atom/ is an Atom feed of the same posts, with the same full text and WordPress’s entry IDs', async () => {
		const response = await get('/feed/atom/');

		expect(response.status).toBe(200);
		expect(response.headers.get('content-type')).toBe('application/atom+xml; charset=utf-8');
		const atom = parseXml(await response.text(), ['entry', 'link', 'category']).feed;
		expect(atom).toMatchObject({
			'@xmlns': 'http://www.w3.org/2005/Atom',
			'@xml:lang': 'zh-TW',
			id: 'https://aniya.moe/feed/atom/',
			title: { '#text': 'TsukiStudio' },
			subtitle: { '#text': '生活點滴紀錄' },
			updated: '2026-01-23T10:01:26Z',
		});
		expect(atom.link).toContainEqual(expect.objectContaining({ '@rel': 'self', '@href': 'https://aniya.moe/feed/atom/' }));
		const alternate = (entry: { link: { '@rel': string; '@href': string }[] }) =>
			entry.link.find((link) => link['@rel'] === 'alternate')?.['@href'];
		expect(atom.entry.map(alternate)).toEqual(NEWEST_POSTS);
		expect(atom.entry[1]).toMatchObject({
			id: 'https://aniya.moe/?p=1797',
			author: { name: 'Tsuki' },
			published: '2025-12-05T10:00:00Z',
			updated: '2025-12-05T12:02:43Z',
			category: ['旅遊', '閒聊', 'こえび隊', '小蝦隊', '瀨戶內國際藝術祭'].map((term) => ({ '@term': term })),
		});
		const rssItems = (await rss()).channel.item;
		atom.entry.forEach((entry: { content: { '@type': string; '#text': string } }, index: number) => {
			expect(entry.content['@type']).toBe('html');
			expect(entry.content['#text'], alternate(entry as never)).toBe(rssItems[index]['content:encoded']);
		});
	});
});

// Expected values from WordPress's sitemaps (tests/fixtures/wordpress-sitemap-2026-10-24/).
describe('sitemap', () => {
	const SNAPSHOT_DIR = fileURLToPath(new URL('./fixtures/wordpress-sitemap-2026-10-24/', import.meta.url));

	/** Each page a sitemap lists, as a UTF-8 path, with the URLs of its images. */
	function sitemapPages(xml: string): Map<string, string[]> {
		const urlset = parseXml(xml, ['url', 'image:image']).urlset;
		return new Map(
			urlset.url.map((url: { loc: string; 'image:image'?: { 'image:loc': string }[] }) => [
				decodeURI(new URL(url.loc.trim()).pathname),
				(url['image:image'] ?? []).map((image) => image['image:loc'].trim()),
			]),
		);
	}

	/** The pages WordPress's sub-sitemaps listed, with their images. */
	function wordpressPages(): Map<string, string[]> {
		const index = readFileSync(join(SNAPSHOT_DIR, 'sitemap.xml'), 'utf8');
		const subSitemaps = [...index.matchAll(/<loc><!\[CDATA\[(.*?)\]\]><\/loc>/g)].map(([, loc]) => loc!.split('/').pop()!);
		return new Map(subSitemaps.flatMap((file) => [...sitemapPages(readFileSync(join(SNAPSHOT_DIR, file), 'utf8'))]));
	}

	async function newSitemap() {
		const response = await get('/sitemap.xml');
		expect(response.status).toBe(200);
		expect(response.headers.get('content-type')).toMatch(/xml/);
		return sitemapPages(await response.text());
	}

	it('lists the home page, posts, pages, categories and tags WordPress listed, and no date archives or later pages', async () => {
		const listed = [...(await newSitemap()).keys()];

		expect(listed.sort()).toEqual([...wordpressPages().keys()].sort());
		expect(listed).toHaveLength(88);
		expect(listed.filter((path) => /^\/\d{4}\/(\d{2}\/(\d{2}\/)?)?$|\/page\/\d+\/$/.test(path))).toEqual([]);
	});

	// WordPress also listed the one featured image (the prologue's), which
	// Twenty Sixteen showed above the post; the new post page does not show it
	// (it is only the post's og:image).
	const FEATURED_IMAGE = 'https://aniya.moe/wp-content/uploads/2025/05/highlight.jpg';

	it('lists under each post the new URLs of the images WordPress listed for it, but the featured image', async () => {
		const listed = await newSitemap();
		// An old image URL's new URL is where it redirects to.
		const newUrl = async (old: string) => {
			const response = await get(new URL(old).pathname);
			expect(response.status, old).toBe(301);
			return new URL(response.headers.get('location')!, 'https://aniya.moe/').href;
		};

		const expected: Record<string, string[]> = {};
		const actual: Record<string, string[]> = {};
		let count = 0;
		for (const [path, images] of wordpressPages()) {
			const shown = images.filter((image) => image !== FEATURED_IMAGE);
			expected[path] = (await Promise.all(shown.map(newUrl))).sort();
			actual[path] = [...(listed.get(path) ?? [])].sort();
			count += shown.length;
		}
		expect(actual).toEqual(expected);
		expect(count).toBe(771);
	}, 120_000);
});

describe('robots.txt', () => {
	it('names the sitemap, and keeps crawlers out of nothing now that there is no /wp-admin/', async () => {
		const response = await get('/robots.txt');

		expect(response.status).toBe(200);
		expect(response.headers.get('content-type')).toMatch(/^text\/plain/);
		const robots = await response.text();
		expect(robots).toMatch(/^User-agent: \*$/m);
		expect(robots).toMatch(/^Sitemap: https:\/\/aniya\.moe\/sitemap\.xml$/m);
		expect(robots).not.toMatch(/wp-admin/);
		expect(robots).not.toMatch(/^Disallow: *\S/im);
	});
});

// Expected values from WordPress's llms.txt (made by AIOSEO; aniya.moe/llms.txt,
// 2026-10-24): 22 posts, 5 pages, 3 categories, 57 tags.
describe('llms.txt', () => {
	/** The links under each `## ` heading of a Markdown file. */
	function linksBySection(markdown: string): Record<string, { text: string; url: string }[]> {
		const sections: Record<string, { text: string; url: string }[]> = {};
		let section: { text: string; url: string }[] = [];
		for (const line of markdown.split('\n')) {
			const heading = /^## (.+)$/.exec(line);
			if (heading) sections[heading[1]!] = section = [];
			const link = /^- \[(.+?)\]\((\S+?)\)/.exec(line);
			if (link) section.push({ text: link[1]!, url: link[2]! });
		}
		return sections;
	}

	it('names the site, and links to the sitemap and to every post, page, category and tag', async () => {
		const response = await get('/llms.txt');

		expect(response.status).toBe(200);
		expect(response.headers.get('content-type')).toMatch(/^text\/plain/);
		const markdown = await response.text();
		expect(markdown.split('\n').slice(0, 3)).toEqual(['# TsukiStudio', '', '> 生活點滴紀錄']);
		const sections = linksBySection(markdown);
		expect(Object.fromEntries(Object.entries(sections).map(([heading, links]) => [heading, links.length]))).toEqual({
			Sitemaps: 1,
			文章: 22,
			頁面: 5,
			分類: 3,
			標籤: 57,
		});
		expect(sections['文章']![0]).toEqual({
			text: '從 SSR 到 SSG：ACGN 股市歷史博物館 7 萬頁靜態化的實戰轉型紀錄',
			url: 'https://aniya.moe/2026/01/23/acgn-museum-ssg/',
		});
		const broken = [];
		for (const { url } of Object.values(sections).flat()) {
			const { status } = await get(new URL(url).pathname);
			if (status !== 200) broken.push(`${decodeURI(url)}: ${status}`);
		}
		expect(broken).toEqual([]);
	});
});
