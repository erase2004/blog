// Converting the whole site from the tables of the WordPress backup: one
// content file per published post and page, the category and tag data, and
// the old-URL mapping table.
import { describe, expect, it } from 'vitest';
import { convertWordPress } from '../../scripts/wordpress-converter/convert';
import { meta, post, wordpressTables } from './fixtures';

const files = () => convertWordPress(wordpressTables()).files;

/** The frontmatter lines of a file, by key. */
function frontmatterOf(file: string | undefined): Record<string, string> {
	const [, block = ''] = /^---\n([\s\S]*?)\n---\n/.exec(file ?? '') ?? [];
	return Object.fromEntries(block.split('\n').map((line) => [line.slice(0, line.indexOf(':')), line.slice(line.indexOf(':') + 2)]));
}

describe('posts', () => {
	it('become Markdown files named after their slug, with frontmatter', () => {
		expect(files()['src/content/posts/第一篇文章.md']).toBe(`---
title: "第一篇文章"
slug: "第一篇文章"
published: 2021-09-30T16:23:17+08:00
updated: 2022-04-06T13:51:27+08:00
categories: ["閒聊"]
tags: ["book☆walker", "murmur"]
excerpt: "使用第一篇文章來確立建立本 blog 的目的。"
draft: false
wordpressId: 30
---

這裡會作為存放整理過的生活紀錄。
`);
	});

	it('carry the AIOSEO description and social image, where they are set', () => {
		const output = files();

		expect(frontmatterOf(output['src/content/posts/travel-setonaikai-2025-prologue.md'])).toMatchObject({
			description: '"在三月下旬某日準備下一季要看的動畫新番清單時，就決定了這次旅行。"',
			// AIOSEO uses the featured image here.
			socialImage: '"/wp-content/uploads/2025/05/highlight.jpg"',
		});
		expect(frontmatterOf(output['src/content/posts/acgn-museum-ssg.md'])).toMatchObject({
			description: '"記錄一個大型網站從 SSR 轉為 SSG 的完整過程。"',
			socialImage: '"/wp-content/uploads/2026/01/heroimage.png"',
		});
		// AIOSEO's default title and description templates, written out, are not custom settings.
		const namedViews = frontmatterOf(output['src/content/posts/vue-router-named-views.md']);
		expect(namedViews).not.toHaveProperty('description');
		expect(namedViews).not.toHaveProperty('socialImage');
	});

	it('are published at their time in Asia/Taipei, which also gives the date in their URL', () => {
		const output = files();

		// 2022-03-24 23:30 UTC
		expect(frontmatterOf(output['src/content/posts/vue-router-named-views.md']).published).toBe(
			'2022-03-25T07:30:00+08:00',
		);
		expect(JSON.parse(output['src/data/old-url-map.json']!).content).toContainEqual(
			expect.objectContaining({ wordpressId: 255, url: '/2022/03/25/vue-router-named-views/' }),
		);
	});

	it('cannot be converted when their local and UTC publish times disagree in Asia/Taipei', () => {
		const tables = wordpressTables();
		tables.wp_posts!.push(
			post({
				ID: 2000,
				post_date: '2022-03-25 07:30:00',
				post_date_gmt: '2022-03-25 07:30:00',
				post_modified_gmt: '2022-03-25 07:30:00',
				post_name: 'utc',
			}),
		);

		expect(() => convertWordPress(tables)).toThrow('Post 2000: post_date_gmt in Asia/Taipei is not its post_date');
	});

	it('have their Gutenberg footnotes as GFM footnotes, the texts taken from the post metadata', () => {
		const file = files()['src/content/posts/acgn-museum-ssg.md']!;

		expect(file).toMatch(
			/\n記錄一個大型網站從 SSR 轉為 SSG 的完整過程。\[\^1\]\n\n\[\^1\]: \[瀬戸内海で濃霧発生\]\(https:\/\/weathernews\.jp\/s\/topics\/202504\/190065\/\)\n$/,
		);
	});
});

describe('pages', () => {
	it('become Markdown files at their place in the page hierarchy, with frontmatter', () => {
		expect(files()['src/content/pages/about/contact.md']).toBe(`---
title: "聯絡方式"
slug: "contact"
parent: "about"
updated: 2021-10-03T21:23:38+08:00
description: "你可以依照聯絡目的，參考以下的聯絡方式。 職缺相關 LinkedIn CakeResume E-mail 日常"
wordpressId: 85
---

你可以依照聯絡目的，參考以下的聯絡方式。

## 職缺相關

- [LinkedIn](https://www.linkedin.com/in/tsukiakiba)
- [CakeResume](https://www.cakeresume.com/me/erase2004)
- [E-mail](mailto:erase2004+job@gmail.com)

## 日常

- [Plurk](https://www.plurk.com/LegoMania)
- [Twitter](https://twitter.com/erase2004)
- [E-mail](mailto:erase2004@gmail.com)
`);
		expect(frontmatterOf(files()['src/content/pages/about.md'])).not.toHaveProperty('parent');
	});

	it('get the meta description WordPress made from their content (live site, 2026-10-24)', () => {
		const output = files();

		expect(frontmatterOf(output['src/content/pages/about.md']).description).toBe('"我的故事 聯絡方式"');
		expect(frontmatterOf(output['src/content/pages/subscribe.md']).description).toBe(
			'"你可以使用以下連結訂閱feed： https://aniya.moe/feed/ (RSS 2.0) http"',
		);
	});
});

describe('categories and tags', () => {
	it('are listed in data files, those that published posts have, with their slugs as IDs', () => {
		const output = files();

		expect(output['src/data/categories.json']).toBe(
			'[\n\t{"id":"技術","name":"技術"},\n\t{"id":"旅遊","name":"旅遊"},\n\t{"id":"閒聊","name":"閒聊"}\n]\n',
		);
		expect(JSON.parse(output['src/data/tags.json']!)).toEqual([
			{ id: 'astro', name: 'Astro' },
			{ id: 'book☆walker', name: 'BOOK☆WALKER' },
			{ id: 'murmur', name: 'murmur' },
			{ id: 'vue-router', name: 'Vue Router' },
		]);
	});
});

describe('the old-URL mapping table', () => {
	type Expected = { url: string; expect: string; location?: string };
	const tableOf = (output = files()) => JSON.parse(output['src/data/old-url-map.json']!);
	const urlsOf = (output = files()) => tableOf(output).urls as Expected[];

	it('lists each post and page with its WordPress ID, URL, file, old slugs and old dates', () => {
		expect(tableOf().content).toEqual([
			{
				wordpressId: 30,
				type: 'post',
				title: '第一篇文章',
				url: '/2021/09/30/第一篇文章/',
				file: 'src/content/posts/第一篇文章.md',
				oldSlugs: [],
				oldDates: [],
			},
			expect.objectContaining({ wordpressId: 85, type: 'page', url: '/about/contact/', file: 'src/content/pages/about/contact.md' }),
			expect.objectContaining({ wordpressId: 86, url: '/about/' }),
			expect.objectContaining({ wordpressId: 131, url: '/subscribe/' }),
			expect.objectContaining({ wordpressId: 255 }),
			expect.objectContaining({ wordpressId: 442 }),
			expect.objectContaining({
				wordpressId: 1854,
				url: '/2026/01/23/acgn-museum-ssg/',
				oldSlugs: ['從-ssr-到-ssg：acgn'],
				oldDates: [],
			}),
		]);
	});

	it('keeps posts, pages and the home page where they were', () => {
		expect(urlsOf()).toEqual(
			expect.arrayContaining(
				['/', '/2021/09/30/第一篇文章/', '/2026/01/23/acgn-museum-ssg/', '/about/', '/about/contact/', '/subscribe/'].map(
					(url) => ({ url, expect: 'page' }),
				),
			),
		);
	});

	it('redirects ?p=ID and ?page_id=ID of every post and page to it, and answers others with 404', () => {
		expect(urlsOf()).toEqual(
			expect.arrayContaining([
				{ url: '/?p=30', expect: 'redirect', location: '/2021/09/30/第一篇文章/' },
				{ url: '/?page_id=30', expect: 'redirect', location: '/2021/09/30/第一篇文章/' },
				{ url: '/?page_id=85', expect: 'redirect', location: '/about/contact/' },
				{ url: '/?p=85', expect: 'redirect', location: '/about/contact/' },
				// The first ID WordPress never gave out.
				{ url: '/?p=1902', expect: 'not-found' },
				{ url: '/?page_id=1902', expect: 'not-found' },
			]),
		);
		expect(urlsOf().filter(({ url }) => url.startsWith('/?'))).toHaveLength(2 * 7 + 2);
	});

	it('redirects old slugs and old dates to the current URL', () => {
		const tables = wordpressTables();
		tables.wp_postmeta!.push(meta(255, '_wp_old_date', '2022-03-24'));

		expect(urlsOf(convertWordPress(tables).files)).toEqual(
			expect.arrayContaining([
				{ url: '/2026/01/23/從-ssr-到-ssg：acgn/', expect: 'redirect', location: '/2026/01/23/acgn-museum-ssg/' },
				{
					url: '/2022/03/24/vue-router-named-views/',
					expect: 'redirect',
					location: '/2022/03/25/vue-router-named-views/',
				},
			]),
		);
	});

	it('keeps the category and tag archives that have posts; empty ones answer 404', () => {
		const urls = urlsOf();

		expect(urls).toEqual(
			expect.arrayContaining([
				{ url: '/category/技術/', expect: 'page' },
				{ url: '/category/旅遊/', expect: 'page' },
				{ url: '/category/閒聊/', expect: 'page' },
				{ url: '/category/uncategorized/', expect: 'not-found' },
				{ url: '/tag/astro/', expect: 'page' },
				{ url: '/tag/book☆walker/', expect: 'page' },
				{ url: '/tag/murmur/', expect: 'page' },
				{ url: '/tag/vue-router/', expect: 'page' },
			]),
		);
		expect(urls.filter(({ url }) => /^\/(category|tag)\/[^/]+\/$/.test(url))).toHaveLength(3 + 1 + 4);
	});

	it('keeps the date archives that have posts', () => {
		const archives = urlsOf()
			.filter(({ url }) => /^\/\d{4}\/(\d{2}\/)?(\d{2}\/)?$/.test(url))
			.map(({ url, expect }) => `${url} ${expect}`);

		expect(archives).toEqual([
			'/2021/ page',
			'/2021/09/ page',
			'/2021/09/30/ page',
			'/2022/ page',
			'/2022/03/ page',
			'/2022/03/25/ page',
			'/2025/ page',
			'/2025/05/ page',
			'/2025/05/17/ page',
			'/2026/ page',
			'/2026/01/ page',
			'/2026/01/23/ page',
		]);
	});

	it('keeps the pages of the home page and of archives with more posts than fit one page', () => {
		// posts_per_page is 2 in this backup; two more posts on 2025-05-17, in 旅遊 too.
		const tables = wordpressTables();
		for (const [id, minute] of [
			[493, 30],
			[552, 45],
		] as const) {
			tables.wp_posts!.push(
				post({
					ID: id,
					post_date: `2025-05-17 09:${minute}:00`,
					post_date_gmt: `2025-05-17 01:${minute}:00`,
					post_modified_gmt: '2025-05-20 04:26:42',
					post_name: `travel-setonaikai-2025-day${id}`,
				}),
			);
			tables.wp_term_relationships!.push({ object_id: String(id), term_taxonomy_id: '45', term_order: '0' });
		}

		const urls = urlsOf(convertWordPress(tables).files);

		expect(urls).toEqual(
			expect.arrayContaining([
				{ url: '/page/2/', expect: 'page' },
				{ url: '/page/3/', expect: 'page' },
				{ url: '/page/4/', expect: 'not-found' },
				{ url: '/2025/page/2/', expect: 'page' },
				{ url: '/2025/05/page/2/', expect: 'page' },
				{ url: '/2025/05/17/page/2/', expect: 'page' },
				{ url: '/category/旅遊/page/2/', expect: 'page' },
			]),
		);
		expect(urls.filter(({ url }) => url.includes('/page/'))).toHaveLength(7);
	});

	it('keeps the RSS and Atom feeds, and redirects the other feeds to what they were the feed of', () => {
		expect(urlsOf()).toEqual(
			expect.arrayContaining([
				{ url: '/feed/', expect: 'file' },
				{ url: '/feed/atom/', expect: 'file' },
				{ url: '/comments/feed/', expect: 'redirect', location: '/feed/' },
				{ url: '/2021/09/30/第一篇文章/feed/', expect: 'redirect', location: '/2021/09/30/第一篇文章/' },
				{ url: '/about/contact/feed/', expect: 'redirect', location: '/about/contact/' },
				{ url: '/category/技術/feed/', expect: 'redirect', location: '/category/技術/' },
				{ url: '/tag/book☆walker/feed/', expect: 'redirect', location: '/tag/book☆walker/' },
			]),
		);
		expect(urlsOf().filter(({ url }) => url.endsWith('/feed/'))).toHaveLength(2 + 7 + 3 + 4);
	});

	it('redirects the author page to the about page, and the WordPress sitemap to the sitemap', () => {
		expect(urlsOf()).toEqual(
			expect.arrayContaining([
				{ url: '/author/erase2004/', expect: 'redirect', location: '/about/' },
				{ url: '/wp-sitemap.xml', expect: 'redirect', location: '/sitemap.xml' },
			]),
		);
	});

	it('answers the WordPress system paths with 404', () => {
		expect(urlsOf()).toEqual(
			expect.arrayContaining(
				['/wp-admin/', '/wp-json/', '/wp-login.php', '/xmlrpc.php'].map((url) => ({ url, expect: 'not-found' })),
			),
		);
	});

	it('is written one entry per line, URLs in code point order', () => {
		const lines = files()['src/data/old-url-map.json']!.split('\n');
		const urlLines = lines.slice(lines.indexOf('\t"urls": [') + 1, -3);

		expect(urlLines.every((line) => /^\t\t\{"url":".*\}(,)?$/.test(line))).toBe(true);
		const urls = urlLines.map((line) => JSON.parse(line.replace(/,$/, '')).url as string);
		expect(urls).toEqual([...urls].sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b))));
	});
});

describe('what is not published', () => {
	it('is not converted: drafts, revisions, attachments and other post types', () => {
		expect(Object.keys(files()).filter((file) => file.startsWith('src/content/')).sort()).toEqual([
			'src/content/pages/about.md',
			'src/content/pages/about/contact.md',
			'src/content/pages/subscribe.md',
			'src/content/posts/acgn-museum-ssg.md',
			'src/content/posts/travel-setonaikai-2025-prologue.md',
			'src/content/posts/vue-router-named-views.md',
			'src/content/posts/第一篇文章.md',
		]);
	});
});

describe('the same backup', () => {
	it('gives the same files, whatever order its rows come in', () => {
		const shuffled = wordpressTables();
		for (const rows of Object.values(shuffled)) rows.reverse();
		shuffled.wp_postmeta!.push(meta(30, '_edit_lock', '1649223087:1'));

		expect(convertWordPress(shuffled).files).toEqual(files());
	});
});
