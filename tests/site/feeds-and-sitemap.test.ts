// What feed readers and crawlers read: the feeds, the sitemap, robots.txt and
// llms.txt.
// The site is built and served once for all the files of tests/site/
// (global-setup.ts).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { parse } from 'node-html-parser';
import { describe, expect, it } from 'vitest';
import { get, outDir, siteUrl } from './site';
import { CONVERTED_FEED_ITEM } from './test-pages';

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
		// WordPress's titles turn " - " into an en dash (wptexturize).
		expect(feed.channel.item[2].title).toBe('遊記 – 岡山 / 香川 / 德島八日遊 – Day 8');
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

			const relative = [...links, ...images].filter((url) => !/^(https?|mailto):/.test(url));
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
					const { status } = await fetch(new URL(path, siteUrl), { method: 'HEAD', redirect: 'manual' });
					if (status !== 200) broken[decodeURI(path)] = status;
				}),
			);
		}
		expect(sameSite.size).toBeGreaterThan(100);
		expect(broken).toEqual({});
	}, 120_000);

	// A reader may show several items on one page: footnote 1 of one post must
	// not be footnote 1 of another. Readers resolve links within an item
	// differently (against the item's URL, the feed's, or not at all); a link
	// to the footnote on the post page works in all of them.
	it('/feed/ items share no element IDs, and their footnote links go to the footnotes on the post page', async () => {
		const seen = new Map<string, string>();
		const shared: string[] = [];
		const missing: string[] = [];
		let footnoteLinks = 0;
		for (const item of (await rss()).channel.item) {
			const html = parseHtml(item['content:encoded']);
			for (const id of html.querySelectorAll('[id]').map((element) => element.id)) {
				if (seen.has(id)) shared.push(`${id} (${seen.get(id)}, ${item.link})`);
				seen.set(id, item.link);
			}
			const page = parseHtml(await (await get(new URL(item.link).pathname)).text());
			for (const link of html.querySelectorAll('a[href*="#"]').map((a) => new URL(a.getAttribute('href')!))) {
				if (link.origin + link.pathname !== item.link) continue;
				footnoteLinks++;
				if (!page.getElementById(decodeURIComponent(link.hash.slice(1)))) missing.push(link.href);
			}
		}

		expect(shared).toEqual([]);
		expect(missing).toEqual([]);
		// The footnotes of 2025-koebitai, at least.
		expect(footnoteLinks).toBeGreaterThan(4);
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
		expect(html.querySelector('sup > a')?.getAttribute('href')).toBe('https://aniya.moe/converted/mdx/#user-content-fn-1');
		expect(html.querySelectorAll('script, style, link, button').map(({ tagName }) => tagName)).toEqual([]);
	});

	// As WordPress answered them (aniya.moe, 2026-10-24).
	it.each(['/feed/', '/feed/atom/'])('%s is kept out of search results, and without its trailing slash 301-redirects to it', async (path) => {
		expect((await get(path)).headers.get('x-robots-tag')).toBe('noindex, follow');
		const slashless = await get(path.slice(0, -1));
		expect(slashless.status).toBe(301);
		expect(new URL(slashless.headers.get('location')!, siteUrl).pathname).toBe(path);
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
	const SNAPSHOT_DIR = fileURLToPath(new URL('../fixtures/wordpress-sitemap-2026-10-24/', import.meta.url));

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
