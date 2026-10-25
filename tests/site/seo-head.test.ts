// What each page tells search engines and social platforms in its head, and
// GA4.
// The site is built and served once for all the files of tests/site/
// (global-setup.ts).
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'node-html-parser';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { browser, get, siteUrl } from './site';

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
		readFileSync(fileURLToPath(new URL('../fixtures/wordpress-head-2026-10-24/heads.json', import.meta.url)), 'utf8'),
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

	describe('GA4', () => {
		/**
		 * A browser in which the built site is at `origin`: the local server
		 * answers for it. Google's script is not loaded for real: every other
		 * site answers with an empty script, and the requests are recorded.
		 */
		async function siteAt(origin: string) {
			const context = await (await browser()).newContext();
			const outside: string[] = [];
			const errors: Error[] = [];
			await context.route(
				() => true,
				async (route) => {
					const url = new URL(route.request().url());
					if (url.origin === siteUrl) {
						return route.continue();
					}
					if (url.origin === origin) {
						// Redirects not followed here: the browser follows them, at `origin`.
						const local = new URL(url.pathname + url.search, siteUrl).href;
						return route.fulfill({ response: await route.fetch({ url: local, maxRedirects: 0 }) });
					}
					outside.push(url.href);
					return route.fulfill({ contentType: 'text/javascript', body: '' });
				},
			);
			const page = await context.newPage();
			page.on('pageerror', (error) => errors.push(error));
			return {
				/** The other sites' URLs the pages requested. */
				outside,
				/** Uncaught errors of the pages' scripts. */
				errors,
				/** Opens `path` at `origin`; returns what it told gtag.js, the commands queued in dataLayer, if any. */
				async open(path: string, { referer }: { referer?: string } = {}) {
					await page.goto(new URL(path, origin).href, { waitUntil: 'load', referer });
					return page.evaluate(() =>
						(window as unknown as { dataLayer?: IArguments[] }).dataLayer?.map((command) => Array.from(command)),
					);
				},
				async close() {
					// Images may still be loading through route.fetch().
					await context.unrouteAll({ behavior: 'ignoreErrors' });
					await context.close();
				},
			};
		}

		it('every kind of page on aniya.moe counts its visit in the GA4 property of the WordPress site, G-NWNYVH87N4', async () => {
			const site = await siteAt('https://aniya.moe');
			try {
				const paths = ['/', '/page/2/', '/2021/11/30/電子紙閱讀器使用心得/', '/about/contact/', '/tag/vue/', '/2025/05/', '/no-such-page/'];
				const configs: Record<string, unknown> = {};
				for (const path of paths) {
					configs[path] = (await site.open(path))?.filter(([name]) => name === 'config');
				}

				expect(configs).toEqual(Object.fromEntries(paths.map((path) => [path, [['config', 'G-NWNYVH87N4']]])));
				expect(site.outside).toContain('https://www.googletagmanager.com/gtag/js?id=G-NWNYVH87N4');
				expect(site.errors).toEqual([]);
			} finally {
				await site.close();
			}
		}, 60_000);

		// For finding old URLs that still need a redirect (ticket 21).
		it('the 404 page tells GA4 which URL was asked for, and the page linking to it: a page_not_found event', async () => {
			const site = await siteAt('https://aniya.moe');
			try {
				const events = async (path: string, referer?: string) =>
					(await site.open(path, { referer }))?.filter(([name]) => name === 'event');

				// The URLs as the browser has them, percent-encoded.
				expect(await events('/2021/11/30/不存在的文章/?from=link', 'https://aniya.moe/2021/11/30/電子紙閱讀器使用心得/')).toEqual([
					[
						'event',
						'page_not_found',
						{
							page_location: encodeURI('https://aniya.moe/2021/11/30/不存在的文章/?from=link'),
							page_referrer: encodeURI('https://aniya.moe/2021/11/30/電子紙閱讀器使用心得/'),
						},
					],
				]);
				// Typed in, or from a bookmark: no referrer.
				expect(await events('/no-such-page/')).toEqual([
					['event', 'page_not_found', { page_location: 'https://aniya.moe/no-such-page/' }],
				]);
				expect(await events('/2021/11/30/電子紙閱讀器使用心得/')).toEqual([]);
				expect(site.errors).toEqual([]);
			} finally {
				await site.close();
			}
		}, 60_000);

		// Visits to a preview deployment, or to the site run locally, are not
		// readers' visits: they would count in the same GA4 property.
		it('pages on any other host send nothing to GA4: a preview URL, a local server', async () => {
			for (const origin of ['https://aniya-moe.example.workers.dev', siteUrl]) {
				const site = await siteAt(origin);
				try {
					for (const path of ['/', '/2021/11/30/電子紙閱讀器使用心得/', '/no-such-page/']) {
						expect(await site.open(path), `${origin}${path}`).toBeUndefined();
					}
					// Posts load giscus, for their comments.
					expect(site.outside.filter((url) => /\.google/.test(new URL(url).hostname)), origin).toEqual([]);
					expect(site.errors, origin).toEqual([]);
				} finally {
					await site.close();
				}
			}
		}, 60_000);
	});

	// It is served at every unknown URL; WordPress's 404 page had no canonical
	// URL either (aniya.moe, 2026-10-24).
	it.each(['/no-such-page/', '/2021/11/30/no-such-post/'])('the 404 page at %s names no canonical URL', async (path) => {
		const html = parse(await (await get(path)).text());

		expect(html.querySelector('head link[rel="canonical"]')?.getAttribute('href')).toBeUndefined();
		expect(html.querySelector('head meta[property="og:url"]')?.getAttribute('content')).toBeUndefined();
	});

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

		// The posts that had no social image of their own on WordPress: AIOSEO
		// gave them night.png.
		it('of every post that had night.png on WordPress is its first image, or night.png if it shows none', async () => {
			const posts = wordpress.filter(
				({ path, ogImage }) => /^\/\d{4}\//.test(path) && ogImage === 'https://aniya.moe/wp-content/uploads/2021/09/night.png',
			);
			const sources: Record<string, [string, string]> = {};
			for (const { path } of posts) {
				const img = parse(await (await get(path)).text()).querySelector('main article .prose img');
				sources[path] = [(await socialImage(path)).source, img ? sourceOf(img.getAttribute('src')!) : 'none'];
			}

			expect(posts).toHaveLength(11);
			const fallback = Object.entries(sources).filter(([, [, first]]) => first === 'none');
			expect(fallback.map(([, [image]]) => image)).toEqual(Array(3).fill(expect.stringMatching(/^night\./)));
			for (const [path, [image, first]] of Object.entries(sources).filter(([, [, first]]) => first !== 'none')) {
				expect(image, path).toBe(first);
			}
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
