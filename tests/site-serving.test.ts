// Builds the site and serves it with `wrangler dev`, the same way Cloudflare
// Workers static assets will serve it, then checks what readers and crawlers
// get back over HTTP, and what HTML readers get for converted content.
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'node-html-parser';
import { type Browser, chromium } from 'playwright';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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
});

describe('SEO head', () => {
	/** What WordPress's head had on a page of its sitemap (aniya.moe, 2026-10-24). */
	type WordPressHead = {
		path: string;
		title: string;
		description: string | null;
		ogType: string | null;
		publishedTime: string | null;
		modifiedTime: string | null;
	};
	const wordpress: WordPressHead[] = JSON.parse(
		readFileSync(fileURLToPath(new URL('./fixtures/wordpress-head-2026-10-24/heads.json', import.meta.url)), 'utf8'),
	).pages;

	async function head(path: string) {
		const response = await get(path);
		expect(response.status, path).toBe(200);
		return parse(await response.text()).querySelector('head')!;
	}

	it('every page of the WordPress sitemap has the title WordPress gave it', async () => {
		const titles: Record<string, string | undefined> = {};
		for (const { path } of wordpress) {
			titles[path] = (await head(path)).querySelector('title')?.text;
		}

		expect(titles).toEqual(Object.fromEntries(wordpress.map(({ path, title }) => [path, title])));
	});

	// WordPress had none on category and tag archives; theirs are new (ticket 11).
	it('every page of the WordPress sitemap that had a meta description there has the same one', async () => {
		const described = wordpress.filter(({ description }) => description !== null);
		const descriptions: Record<string, string | undefined> = {};
		for (const { path } of described) {
			descriptions[path] = (await head(path)).querySelector('meta[name="description"]')?.getAttribute('content');
		}

		expect(described).toHaveLength(28);
		expect(descriptions).toEqual(Object.fromEntries(described.map(({ path, description }) => [path, description])));
	});

	/** The instant of a time in a meta tag, to compare times written in different time zones. */
	const instant = (time: string | null | undefined) => (time ? new Date(time).toISOString() : time);

	it('every post has the publish and update times WordPress had, as an article', async () => {
		const posts = wordpress.filter(({ path }) => /^\/\d{4}\/\d{2}\/\d{2}\//.test(path));
		const times: Record<string, unknown> = {};
		for (const { path } of posts) {
			const page = await head(path);
			const meta = (property: string) => page.querySelector(`meta[property="${property}"]`)?.getAttribute('content');
			times[path] = {
				type: meta('og:type'),
				published: instant(meta('article:published_time')),
				modified: instant(meta('article:modified_time')),
			};
		}

		expect(posts).toHaveLength(22);
		// 3 scheduled posts were last edited before they went out; like the
		// update date the post shows, their update time is their publish time.
		expect(times).toEqual(
			Object.fromEntries(
				posts.map(({ path, ogType, publishedTime, modifiedTime }) => [
					path,
					{
						type: ogType,
						published: instant(publishedTime),
						modified: instant(modifiedTime! < publishedTime! ? publishedTime : modifiedTime),
					},
				]),
			),
		);
	});

	it('every page (about, contact, …) has the update time WordPress had, as an article', async () => {
		const pages = wordpress.filter(({ path }) => ['/about/', '/about/autobiography/', '/about/contact/', '/policy/', '/subscribe/'].includes(path));
		const times: Record<string, unknown> = {};
		for (const { path } of pages) {
			const page = await head(path);
			const meta = (property: string) => page.querySelector(`meta[property="${property}"]`)?.getAttribute('content');
			times[path] = { type: meta('og:type'), modified: instant(meta('article:modified_time')) };
		}

		expect(pages).toHaveLength(5);
		expect(times).toEqual(
			Object.fromEntries(pages.map(({ path, ogType, modifiedTime }) => [path, { type: ogType, modified: instant(modifiedTime) }])),
		);
	});

	it('a post has its tags and its author', async () => {
		const page = await head('/2021/11/30/電子紙閱讀器使用心得/');

		const tags = page.querySelectorAll('meta[property="article:tag"]').map((meta) => meta.getAttribute('content'));
		expect(tags.sort()).toEqual(['BOOK☆WALKER', 'E Ink', 'HyRead', 'e-book']);
		expect(page.querySelector('meta[name="author"]')?.getAttribute('content')).toBe('Tsuki');
	});

	// One page of each kind: home, home page 2, post, page, category, tag and
	// date archives, and the 404 page.
	it.each([
		'/',
		'/page/2/',
		'/2021/11/30/電子紙閱讀器使用心得/',
		'/about/contact/',
		'/category/技術/',
		'/tag/vue/',
		'/2025/05/',
		'/no-such-page/',
	])('%s says it is in Taiwanese Mandarin, on TsukiStudio, by the Mastodon account', async (path) => {
		const html = parse(await (await get(path)).text());
		const meta = (key: string) =>
			html.querySelector(`head meta[property="${key}"], head meta[name="${key}"]`)?.getAttribute('content');

		expect({
			lang: html.querySelector('html')?.getAttribute('lang'),
			locale: meta('og:locale'),
			siteName: meta('og:site_name'),
			fediverseCreator: meta('fediverse:creator'),
		}).toEqual({
			lang: 'zh-TW',
			locale: 'zh_TW',
			siteName: 'TsukiStudio - 生活點滴紀錄',
			fediverseCreator: '@erase2004@g0v.social',
		});
	});

	it('every kind of page counts its visit in the GA4 property of the WordPress site, G-NWNYVH87N4', async () => {
		const browser = await chromium.launch();
		try {
			const context = await browser.newContext();
			// Google's script is not loaded for real: only that the page asks for it.
			const outside: string[] = [];
			await context.route(
				(url) => url.origin !== server!.url,
				(route) => {
					outside.push(route.request().url());
					return route.fulfill({ contentType: 'text/javascript', body: '' });
				},
			);
			const page = await context.newPage();
			const paths = ['/', '/page/2/', '/2021/11/30/電子紙閱讀器使用心得/', '/about/contact/', '/tag/vue/', '/2025/05/', '/no-such-page/'];
			const configs: Record<string, unknown> = {};
			for (const path of paths) {
				await page.goto(new URL(path, server!.url).href, { waitUntil: 'load' });
				// What the page told gtag.js: its commands, queued in dataLayer.
				configs[path] = await page.evaluate(() =>
					((window as unknown as { dataLayer?: IArguments[] }).dataLayer ?? [])
						.map((command) => Array.from(command))
						.filter(([name]) => name === 'config'),
				);
			}

			expect(configs).toEqual(Object.fromEntries(paths.map((path) => [path, [['config', 'G-NWNYVH87N4']]])));
			expect(outside).toContain('https://www.googletagmanager.com/gtag/js?id=G-NWNYVH87N4');
		} finally {
			await browser.close();
		}
	}, 60_000);

	it('link previews on X are summary cards, as on WordPress', async () => {
		for (const path of ['/', '/2021/11/30/電子紙閱讀器使用心得/', '/about/']) {
			const card = (await head(path)).querySelector('meta[name="twitter:card"]')?.getAttribute('content');
			expect(card, path).toBe('summary');
		}
	});

	describe('site icon', () => {
		/** The size and type of the image the site serves at a URL. */
		async function served(url: string) {
			const response = await get(new URL(url, 'https://aniya.moe').pathname);
			const { width, height } = await sharp(Buffer.from(await response.arrayBuffer())).metadata();
			return { status: response.status, type: response.headers.get('content-type'), size: `${width}x${height}` };
		}

		// The icons of the WordPress site, in the sizes it had (aniya.moe, 2026-10-24).
		it.each(['/', '/2021/11/30/電子紙閱讀器使用心得/', '/about/contact/', '/no-such-page/'])(
			'%s links the icons WordPress had: 32 and 192px, 180px for iOS, 270px for Windows tiles',
			async (path) => {
				const html = parse(await (await get(path)).text());
				const icons = await Promise.all(
					html.querySelectorAll('head link[rel="icon"], head link[rel="apple-touch-icon"]').map(async (link) => ({
						rel: link.getAttribute('rel'),
						sizes: link.getAttribute('sizes') ?? null,
						...(await served(link.getAttribute('href')!)),
					})),
				);
				const tile = html.querySelector('head meta[name="msapplication-TileImage"]')?.getAttribute('content');

				expect(icons).toEqual([
					{ rel: 'icon', sizes: '32x32', status: 200, type: 'image/png', size: '32x32' },
					{ rel: 'icon', sizes: '192x192', status: 200, type: 'image/png', size: '192x192' },
					{ rel: 'apple-touch-icon', sizes: null, status: 200, type: 'image/png', size: '180x180' },
				]);
				expect(await served(tile!)).toEqual({ status: 200, type: 'image/png', size: '270x270' });
			},
		);

		it('is at /favicon.ico too, for browsers and feed readers that look there', async () => {
			const response = await get('/favicon.ico');
			const ico = Buffer.from(await response.arrayBuffer());

			expect(response.status).toBe(200);
			expect(response.headers.get('content-type')).toBe('image/vnd.microsoft.icon');
			// An ICO file (type 1) with one 32 × 32 image.
			expect([ico.readUInt16LE(2), ico.readUInt16LE(4), ico[6], ico[7]]).toEqual([1, 1, 32, 32]);
		});
	});

	// As AIOSEO wrote them (aniya.moe, 2026-10-24).
	it.each([
		['/', 'max-image-preview:large'],
		['/2021/11/30/電子紙閱讀器使用心得/', 'max-image-preview:large'],
		['/about/', 'max-image-preview:large'],
		['/2025/05/', 'max-image-preview:large'],
		['/page/2/', 'noindex, nofollow, max-image-preview:large'],
		['/no-such-page/', 'noindex'],
	])('%s has one robots meta tag: %s', async (path, robots) => {
		const tags = parse(await (await get(path)).text()).querySelectorAll('meta[name="robots"]');

		expect(tags.map((tag) => tag.getAttribute('content'))).toEqual([robots]);
	});

	describe('structured data (JSON-LD)', () => {
		/** The page's JSON-LD graph, by `@type`. */
		async function graph(path: string): Promise<Record<string, Record<string, unknown>>> {
			const scripts = (await head(path)).querySelectorAll('script[type="application/ld+json"]');
			expect(scripts).toHaveLength(1);
			const data = JSON.parse(scripts[0]!.text);
			expect(data['@context']).toBe('https://schema.org');
			return Object.fromEntries(data['@graph'].map((node: Record<string, unknown>) => [node['@type'], node]));
		}

		/** A breadcrumb trail as names and UTF-8 URLs. */
		const trail = (breadcrumbs: Record<string, unknown> | undefined) =>
			(breadcrumbs?.itemListElement as { position: number; name: string; item: string }[]).map(
				({ position, name, item }) => [position, name, decodeURI(item)],
			);

		it('every page names the site and its author', async () => {
			for (const path of ['/', '/2021/11/30/電子紙閱讀器使用心得/', '/about/contact/', '/tag/vue/']) {
				const nodes = await graph(path);

				expect(nodes.WebSite, path).toMatchObject({
					url: 'https://aniya.moe/',
					name: 'TsukiStudio',
					description: '生活點滴紀錄',
					inLanguage: 'zh-TW',
					publisher: { '@id': nodes.Person?.['@id'] },
				});
				expect(nodes.Person, path).toMatchObject({
					name: 'Tsuki',
					url: 'https://aniya.moe/about/',
					sameAs: ['https://g0v.social/@erase2004'],
				});
			}
		});

		it('a post is a BlogPosting by the author, with its image, times, category and tags', async () => {
			const path = '/2021/11/30/電子紙閱讀器使用心得/';
			const nodes = await graph(path);
			const ogImage = (await head(path)).querySelector('meta[property="og:image"]')?.getAttribute('content');

			expect(nodes.BlogPosting).toMatchObject({
				headline: '電子紙閱讀器使用心得',
				description: '購入電子閱讀器的考量，以及購入 HyRead Gaze Note 後的，使用一段時間後的體驗心得',
				inLanguage: 'zh-TW',
				author: { '@id': nodes.Person?.['@id'] },
				publisher: { '@id': nodes.Person?.['@id'] },
				image: { '@type': 'ImageObject', url: ogImage },
				articleSection: ['閒聊'],
			});
			expect(decodeURI(nodes.BlogPosting?.url as string)).toBe(`https://aniya.moe${path}`);
			expect(instant(nodes.BlogPosting?.datePublished as string)).toBe('2021-11-30T08:46:07.000Z');
			expect(instant(nodes.BlogPosting?.dateModified as string)).toBe('2022-04-06T05:46:11.000Z');
			expect((nodes.BlogPosting?.keywords as string[]).sort()).toEqual(['BOOK☆WALKER', 'E Ink', 'HyRead', 'e-book']);
		});

		it('a post, a page and an archive have their breadcrumb trail from the home page', async () => {
			expect(trail((await graph('/2025/05/17/travel-setonaikai-2025-day4/')).BreadcrumbList)).toEqual([
				[1, '首頁', 'https://aniya.moe/'],
				[2, '旅遊', 'https://aniya.moe/category/旅遊/'],
				[3, '遊記 – 岡山 / 香川 / 德島八日遊 – Day 4', 'https://aniya.moe/2025/05/17/travel-setonaikai-2025-day4/'],
			]);
			expect(trail((await graph('/about/contact/')).BreadcrumbList)).toEqual([
				[1, '首頁', 'https://aniya.moe/'],
				[2, '關於我', 'https://aniya.moe/about/'],
				[3, '聯絡方式', 'https://aniya.moe/about/contact/'],
			]);
			expect(trail((await graph('/tag/book☆walker/')).BreadcrumbList)).toEqual([
				[1, '首頁', 'https://aniya.moe/'],
				[2, 'BOOK☆WALKER', 'https://aniya.moe/tag/book☆walker/'],
			]);
		});

		it('only posts are BlogPostings, and the home page has no breadcrumb trail', async () => {
			expect(Object.keys(await graph('/')).sort()).toEqual(['Person', 'WebSite']);
			expect(Object.keys(await graph('/about/')).sort()).toEqual(['BreadcrumbList', 'Person', 'WebSite']);
		});
	});

	describe('og:image', () => {
		/**
		 * The source image of an image the site serves: Astro names each size and
		 * format of an image `/_astro/<name>.<hash of the source>_<hash of the
		 * size and format>.<format>`.
		 */
		const sourceOf = (path: string) => basename(path).replace(/_[^_]+$/, '');

		/** The page's og:image: what the head says, and what the site serves there. */
		async function socialImage(path: string) {
			const page = await head(path);
			const meta = (property: string) => page.querySelector(`meta[property="${property}"]`)?.getAttribute('content');
			const url = new URL(meta('og:image')!);
			const response = await get(url.pathname);
			const file = await sharp(Buffer.from(await response.arrayBuffer())).metadata();
			return {
				origin: url.origin,
				source: sourceOf(url.pathname),
				status: response.status,
				type: response.headers.get('content-type'),
				declared: { type: meta('og:image:type'), width: Number(meta('og:image:width')), height: Number(meta('og:image:height')) },
				actual: { width: file.width, height: file.height },
			};
		}

		/** The source of the first image in a post's text. */
		async function firstImageSource(path: string) {
			const img = parse(await (await get(path)).text()).querySelector('main article .prose img')!;
			return sourceOf(img.getAttribute('src')!);
		}

		it("of a post is its own social image (AIOSEO's), as a JPEG or PNG at most 1200px wide", async () => {
			const image = await socialImage('/2025/05/17/travel-setonaikai-2025-day4/');

			expect(image).toMatchObject({ origin: 'https://aniya.moe', status: 200, type: 'image/jpeg' });
			expect(image.source).toMatch(/^MixCollage-16-May-2025-05-01-PM-1795\./);
			expect(image.declared).toEqual({ type: 'image/jpeg', ...image.actual });
			expect(image.actual.width).toBe(1200);
		});

		it('of a post without a social image of its own is the first image in the post', async () => {
			const path = '/2021/11/30/電子紙閱讀器使用心得/';
			const image = await socialImage(path);

			expect(image).toMatchObject({ origin: 'https://aniya.moe', status: 200, type: 'image/jpeg' });
			expect(image.source).toBe(await firstImageSource(path));
			expect(image.source).toMatch(/^01\./);
			expect(image.declared).toEqual({ type: 'image/jpeg', ...image.actual });
		});

		it('of a PNG stays a PNG', async () => {
			const path = '/2022/03/25/vue-router-named-views/';
			const image = await socialImage(path);

			expect(image).toMatchObject({ status: 200, type: 'image/png', source: await firstImageSource(path) });
			expect(image.declared).toEqual({ type: 'image/png', ...image.actual });
		});

		it.each(['/2021/09/30/第一篇文章/', '/about/', '/', '/category/技術/', '/2025/05/'])(
			'of %s, which has no image of its own, is the site image night.png',
			async (path) => {
				const image = await socialImage(path);

				expect(image).toMatchObject({ origin: 'https://aniya.moe', status: 200, type: 'image/png' });
				expect(image.source).toMatch(/^night\./);
				expect(image.declared).toEqual({ type: 'image/png', width: 512, height: 512 });
				expect(image.actual).toEqual({ width: 512, height: 512 });
			},
		);
	});
});
