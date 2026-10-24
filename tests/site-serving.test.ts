// Builds the site and serves it with `wrangler dev`, the same way Cloudflare
// Workers static assets will serve it, then checks what readers and crawlers
// get back over HTTP, and what HTML readers get for converted content.
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'node-html-parser';
import { type Browser, type BrowserContext, type BrowserContextOptions, chromium, type Page } from 'playwright';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { startWranglerDev, type WranglerDev } from './support/wrangler-dev';

const buildScript = fileURLToPath(new URL('./support/build-site.mjs', import.meta.url));
const urlChecker = fileURLToPath(new URL('../scripts/check-urls.ts', import.meta.url));

// Test-only pages the build script adds next to the site's real pages: a
// plain page, and one with the sidebar widgets.
const PROBE_PATH = '/probe/';
const WIDGETS_PATH = '/widgets/';
// Test-only pages with what the WordPress converter writes, in an .md and an
// .mdx file (tests/fixtures/converted-content.*).
const CONVERTED = { md: '/converted/md/', mdx: '/converted/mdx/' };

let outDir: string;
let server: WranglerDev | undefined;

beforeAll(async () => {
	outDir = mkdtempSync(join(tmpdir(), 'aniya-moe-site-'));
	execFileSync(
		process.execPath,
		[buildScript, outDir, PROBE_PATH, WIDGETS_PATH, '/converted/[format]/=converted-content.astro'],
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

	/** The image a browser loads for a srcset/sizes image on a screen this wide, at this pixel density (HTML's selection, simplified). */
	function chosenImage(img: ReturnType<typeof parse>, screenWidth: number, density: number): string {
		const candidates = img
			.getAttribute('srcset')!
			.split(',')
			.map((candidate) => candidate.trim().split(/\s+/))
			.map(([url, descriptor]) => ({ url: url!, width: Number.parseInt(descriptor!, 10) }))
			.sort((a, b) => a.width - b.width);
		// `(min-width: Wpx) Wpx, 100vw`: on a narrower screen the image is as wide as the screen.
		const [, maxWidth] = /\(min-width: (\d+)px\)/.exec(img.getAttribute('sizes')!)!;
		const slotWidth = Math.min(screenWidth, Number(maxWidth));
		return (candidates.find(({ width }) => width >= slotWidth * density) ?? candidates.at(-1)!).url;
	}

	it('in posts are webp in several widths, so that a phone loads one as wide as its screen', async () => {
		const img = parse(await (await get(POST)).text()).querySelector('img[alt="頁面預覽"]')!;
		const onPhone = chosenImage(img, 390, 2);
		const onDesktop = chosenImage(img, 1920, 1);

		// The original is a 1280 × 960 PNG.
		expect(img.getAttribute('width')).toBe('1280');
		expect(onPhone).not.toBe(onDesktop);
		for (const url of [onPhone, onDesktop]) {
			const response = await get(url);
			expect(response.status).toBe(200);
			expect(response.headers.get('content-type')).toBe('image/webp');
		}
		const phoneImage = await (await get(onPhone)).arrayBuffer();
		const desktopImage = await (await get(onDesktop)).arrayBuffer();
		expect(phoneImage.byteLength).toBeLessThan(desktopImage.byteLength / 2);
	});

	it('at their old URLs redirect to the image the post shows', async () => {
		const img = parse(await (await get(POST)).text()).querySelector('img[alt="頁面預覽"]')!;

		for (const old of ['/wp-content/uploads/2022/03/preview-1.png', `${POST}preview-1/`]) {
			const response = await get(old);
			expect(response.status).toBe(301);
			expect(new URL(response.headers.get('location')!, server!.url).pathname).toBe(img.getAttribute('src'));
		}
	});
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

	it.each(PAGES)('%s has the site footer, with the hidden rel="me" link that verifies the Mastodon account', async (path) => {
		const footer = (await html(path)).querySelectorAll('footer').find((element) => !element.closest('main'));
		const mastodon = footer?.querySelector('a[href="https://g0v.social/@erase2004"]');

		expect(footer?.text).toContain('TsukiStudio');
		// As on the WordPress site: in the HTML, for Mastodon's profile link
		// verification, but not shown, focused or read out.
		expect(mastodon?.getAttribute('rel')?.split(/\s+/)).toContain('me');
		expect(mastodon?.hasAttribute('hidden')).toBe(true);
	});

	it.each(PAGES)('%s has a 回到頂部 button', async (path) => {
		const buttons = (await html(path))
			.querySelectorAll('button')
			.filter((button) => (button.getAttribute('aria-label') ?? button.text).trim() === '回到頂部');

		expect(buttons).toHaveLength(1);
		expect(buttons[0].getAttribute('type')).toBe('button');
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

	describe('the 回到頂部 button', () => {
		const LONG_POST = '/2021/11/30/電子紙閱讀器使用心得/';
		const DESKTOP = { width: 1280, height: 720 };

		let browser: Browser | undefined;
		let context: BrowserContext | undefined;

		beforeAll(async () => {
			// Headless Chromium jumps where a page asks for a smooth scroll, unless told not to.
			browser = await chromium.launch({ args: ['--enable-smooth-scrolling'] });
		}, 60_000);

		afterEach(async () => {
			await context?.close();
		});

		afterAll(async () => {
			await browser?.close();
		});

		/** The long post, in a fresh browser tab with these options; only the site itself loads. */
		async function openLongPost(options: BrowserContextOptions = {}) {
			context = await browser!.newContext({ viewport: DESKTOP, ...options });
			await context.route((url) => url.origin !== server!.url, (route) => route.abort());
			const page = await context.newPage();
			await page.goto(new URL(LONG_POST, server!.url).href, { waitUntil: 'load' });
			return { page, button: page.getByRole('button', { name: '回到頂部' }) };
		}

		/** Lets the page react to what just happened: scroll events come with the next frame. */
		async function settle(page: Page) {
			await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
		}

		/** Scrolls to `screens` screen heights down the page, and lets the page react. */
		async function scrollDown(page: Page, screens: number) {
			await page.evaluate((screens) => window.scrollTo({ top: screens * window.innerHeight, behavior: 'instant' }), screens);
			await settle(page);
		}

		/** Clicks the button; where the page was, and where it scrolls through until it is back at the top. */
		async function clickAndFollowTheScroll(page: Page) {
			const from = await page.evaluate(() => {
				const positions: number[] = [];
				Object.assign(window, { positions });
				addEventListener('scroll', () => positions.push(window.scrollY));
				return window.scrollY;
			});
			await page.getByRole('button', { name: '回到頂部' }).click();
			await page.waitForFunction(() => window.scrollY === 0, undefined, { timeout: 5_000 });
			const positions = await page.evaluate(() => (window as unknown as { positions: number[] }).positions);
			return { from, positions };
		}

		/** Whether the element `locator` finds has the keyboard focus. */
		const isFocused = (locator: ReturnType<Page['locator']>) =>
			locator.evaluate((element) => element === document.activeElement);

		/** WCAG 2's contrast ratio between two `rgb(r, g, b)` colours. */
		function contrast(...colours: string[]) {
			const luminance = (colour: string) => {
				const [r, g, b] = colour.match(/\d+(\.\d+)?/g)!.slice(0, 3).map((value) => {
					const channel = Number(value) / 255;
					return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
				});
				return 0.2126 * r + 0.7152 * g + 0.0722 * b;
			};
			const [lighter, darker] = colours.map(luminance).sort((a, b) => b - a);
			return (lighter + 0.05) / (darker + 0.05);
		}

		it('is hidden at the top of the page, and shows once the reader has scrolled down more than a screen', async () => {
			const { page, button } = await openLongPost();

			expect(await button.isVisible()).toBe(false);
			await scrollDown(page, 0.5);
			expect(await button.isVisible()).toBe(false);
			await scrollDown(page, 1.5);
			expect(await button.isVisible()).toBe(true);
			await scrollDown(page, 0);
			expect(await button.isVisible()).toBe(false);
		}, 30_000);

		it('never shows without JavaScript, which it needs to work', async () => {
			const { page, button } = await openLongPost({ javaScriptEnabled: false });

			// No animation frames to wait for: without JavaScript the page runs none.
			const scrolled = await page.evaluate(() => {
				window.scrollTo({ top: 3 * window.innerHeight, behavior: 'instant' });
				return window.scrollY;
			});

			expect(scrolled).toBeGreaterThan(2 * DESKTOP.height);
			expect(await button.isVisible()).toBe(false);
		}, 30_000);

		it('sits at the bottom right of the screen: a white arrow on the frame colour, #1a1a1a', async () => {
			const { page, button } = await openLongPost();
			await scrollDown(page, 3);

			const box = (await button.boundingBox())!;
			expect(DESKTOP.width - (box.x + box.width)).toBeLessThanOrEqual(32);
			expect(DESKTOP.height - (box.y + box.height)).toBeLessThanOrEqual(32);
			// Big enough to hit with a finger (WCAG 2.5.5's 44px).
			expect(box.width).toBeGreaterThanOrEqual(44);
			expect(box.height).toBeGreaterThanOrEqual(44);
			const colours = await button.evaluate((element) => ({
				background: getComputedStyle(element).backgroundColor,
				arrow: getComputedStyle(element.querySelector('svg path')!).stroke,
			}));
			expect(colours).toEqual({ background: 'rgb(26, 26, 26)', arrow: 'rgb(255, 255, 255)' });
			// WCAG AA, even held to the 4.5:1 of text.
			expect(contrast(colours.background, colours.arrow)).toBeGreaterThanOrEqual(4.5);
		}, 30_000);

		it('is reached with Tab after the sidebar, shows a clear focus ring, and works with Enter', async () => {
			const { page, button } = await openLongPost();
			await page.locator('aside a').last().focus();
			await settle(page);

			await page.keyboard.press('Tab');

			expect(await isFocused(button)).toBe(true);
			const ring = await button.evaluate((element) => {
				const style = getComputedStyle(element);
				return { style: style.outlineStyle, width: parseFloat(style.outlineWidth), colour: style.outlineColor };
			});
			expect(ring.style).toBe('solid');
			expect(ring.width).toBeGreaterThanOrEqual(2);
			// WCAG's 3:1 for focus indicators, on the white page and on the dark frame.
			expect(contrast(ring.colour, 'rgb(255, 255, 255)')).toBeGreaterThanOrEqual(3);
			expect(contrast(ring.colour, 'rgb(26, 26, 26)')).toBeGreaterThanOrEqual(3);
			await page.keyboard.press('Enter');
			await page.waitForFunction(() => window.scrollY === 0, undefined, { timeout: 5_000 });
		}, 30_000);

		it('scrolls smoothly back to the top when clicked', async () => {
			const { page } = await openLongPost();
			await scrollDown(page, 3);

			const { from, positions } = await clickAndFollowTheScroll(page);

			// On the way up, not straight there.
			expect(from).toBeGreaterThan(2 * DESKTOP.height);
			expect(positions.filter((y) => y > 0 && y < from).length).toBeGreaterThan(1);
		}, 30_000);

		it('jumps straight to the top for readers who ask for reduced motion', async () => {
			const { page } = await openLongPost({ reducedMotion: 'reduce' });
			await scrollDown(page, 3);

			const { positions } = await clickAndFollowTheScroll(page);

			expect(positions).toEqual([0]);
		}, 30_000);

		it('moves the keyboard focus to the start of the page at once: Tab goes on from there', async () => {
			const { page, button } = await openLongPost();
			await scrollDown(page, 3);
			await button.focus();
			await settle(page);
			// Where the focus is when the page starts to move, while the button is
			// still shown: not left on the button, to be lost when it hides.
			await page.evaluate(() => {
				const focusWhenMoving = new Promise((done) =>
					addEventListener('scroll', () => done(document.activeElement?.tagName), { once: true }),
				);
				Object.assign(window, { focusWhenMoving });
			});

			await page.keyboard.press('Enter');
			await page.waitForFunction(() => window.scrollY === 0, undefined, { timeout: 5_000 });

			expect(await page.evaluate(() => (window as unknown as { focusWhenMoving: Promise<string> }).focusWhenMoving)).toBe(
				'BODY',
			);
			await page.keyboard.press('Tab');
			// The first thing on the page to Tab to.
			expect(await isFocused(page.getByRole('link', { name: '跳到主要內容' }))).toBe(true);
		}, 30_000);

		describe('on a phone', () => {
			const PHONE = { width: 320, height: 640 };

			/** What the button covers: the text and the things to click or watch under it. */
			async function coveredByTheButton(page: Page) {
				return page.evaluate(() => {
					const button = document.querySelector('button[aria-label="回到頂部"]')!.getBoundingClientRect();
					const overlaps = (rect: DOMRect) =>
						rect.width > 0 &&
						rect.height > 0 &&
						rect.left < button.right &&
						rect.right > button.left &&
						rect.top < button.bottom &&
						rect.bottom > button.top;
					const covered: string[] = [];
					const texts = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
					for (let text = texts.nextNode(); text; text = texts.nextNode()) {
						if (!text.textContent!.trim()) continue;
						const range = document.createRange();
						range.selectNodeContents(text);
						if ([...range.getClientRects()].some(overlaps)) covered.push(`text: ${text.textContent!.trim().slice(0, 40)}`);
					}
					for (const element of document.querySelectorAll('a, button, input, select, textarea, iframe, img, video')) {
						if (element.closest('button[aria-label="回到頂部"]')) continue;
						if (overlaps(element.getBoundingClientRect())) covered.push(element.outerHTML.slice(0, 80));
					}
					return covered;
				});
			}

			it('at the end of the page, covers no text or link, and does not make the page scroll sideways', async () => {
				const { page, button } = await openLongPost({ viewport: PHONE });
				await page.evaluate(() =>
					window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }),
				);
				await settle(page);

				expect(await button.isVisible()).toBe(true);
				expect(await coveredByTheButton(page)).toEqual([]);
				expect(
					await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth),
				).toBeLessThanOrEqual(0);
			}, 30_000);

			// WCAG 2.4.11: what has the keyboard focus is not hidden under it.
			it('never covers the link being Tabbed to', async () => {
				const { page } = await openLongPost({ viewport: PHONE });

				// Tab through the page, from the top to the button.
				const covered: string[] = [];
				let reachedTheButton = false;
				for (let presses = 0; presses < 300 && !reachedTheButton; presses++) {
					await page.keyboard.press('Tab');
					await settle(page);
					const focus = await page.evaluate(() => {
						const focused = document.activeElement!;
						const button = document.querySelector<HTMLButtonElement>('button[aria-label="回到頂部"]')!;
						if (focused === button) return { onTheButton: true };
						if (button.hidden) return { onTheButton: false };
						const [a, b] = [focused.getBoundingClientRect(), button.getBoundingClientRect()];
						const overlaps = a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
						return { onTheButton: false, covered: overlaps ? focused.outerHTML.slice(0, 80) : undefined };
					});
					reachedTheButton = focus.onTheButton;
					if (focus.covered) covered.push(focus.covered);
				}

				expect(reachedTheButton).toBe(true);
				expect(covered).toEqual([]);
			}, 60_000);
		});
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
});
