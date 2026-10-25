// A small WordPress site as the converter reads it from the backup: rows of
// the tables it uses, taken from the real backup and trimmed. Each helper
// fills in the columns a test does not care about.
import { createHash } from 'node:crypto';
import type { Row, Tables } from '../../scripts/wordpress-converter/sql-dump';

type Values = Record<string, string | number | null>;

const strings = (values: Values): Row =>
	Object.fromEntries(Object.entries(values).map(([key, value]) => [key, value === null ? null : String(value)]));

export function post(values: Values): Row {
	return strings({
		ID: 0,
		post_author: 1,
		post_date: '0000-00-00 00:00:00',
		post_date_gmt: '0000-00-00 00:00:00',
		post_content: '',
		post_title: '',
		post_excerpt: '',
		post_status: 'publish',
		comment_status: 'open',
		ping_status: 'open',
		post_password: '',
		post_name: '',
		to_ping: '',
		pinged: '',
		post_modified: '0000-00-00 00:00:00',
		post_modified_gmt: '0000-00-00 00:00:00',
		post_content_filtered: '',
		post_parent: 0,
		guid: '',
		menu_order: 0,
		post_type: 'post',
		post_mime_type: '',
		comment_count: 0,
		...values,
	});
}

export function seo(values: Values): Row {
	return strings({
		post_id: 0,
		title: null,
		description: null,
		og_image_type: 'default',
		og_image_custom_url: null,
		og_image_url: null,
		...values,
	});
}

/**
 * A row of post metadata. Its meta_id (WordPress's order of a post's
 * metadata, which the converter keeps) comes from what the row holds, so the
 * same call always makes the same row, whichever rows other tests made first.
 */
export const meta = (postId: number, key: string, value: string): Row =>
	strings({
		meta_id: createHash('sha256').update(JSON.stringify([postId, key, value])).digest().readUInt32BE(0),
		post_id: postId,
		meta_key: key,
		meta_value: value,
	});

/** A value in PHP's serialize() format, the way WordPress stores array metadata; string lengths in bytes. */
export function phpSerialize(value: unknown): string {
	if (typeof value === 'string') return `s:${Buffer.byteLength(value)}:"${value}";`;
	if (typeof value === 'number') return `i:${value};`;
	const entries = Object.entries(value as object);
	return `a:${entries.length}:{${entries.map(([key, item]) => phpSerialize(key) + phpSerialize(item)).join('')}}`;
}

/**
 * An uploaded file of the media library: its attachment row, the file
 * WordPress serves (`_wp_attached_file`), and the metadata naming the sizes
 * WordPress made of it and, for a large image it scaled down, the original.
 */
export function attachment({
	id,
	parent = 0,
	slug,
	file,
	mime = 'image/jpeg',
	sizes = [],
	original,
}: {
	id: number;
	parent?: number;
	slug: string;
	file: string;
	mime?: string;
	/** File names of the sizes, e.g. `x-1024x768.jpg`. */
	sizes?: string[];
	/** The original file name of a scaled image, e.g. `x.jpg` for `x-scaled.jpg`. */
	original?: string;
}): { post: Row; meta: Row[] } {
	const metadata = {
		width: 2560,
		height: 1920,
		file,
		filesize: 100000,
		sizes: Object.fromEntries(sizes.map((size, i) => [`size-${i}`, { file: size, width: 300, height: 225 }])),
		...(original ? { original_image: original } : {}),
	};
	return {
		post: post({
			ID: id,
			post_type: 'attachment',
			post_status: 'inherit',
			post_parent: parent,
			post_name: slug,
			post_mime_type: mime,
			guid: `https://aniya.moe/wp-content/uploads/${file}`,
		}),
		meta: [meta(id, '_wp_attached_file', file), meta(id, '_wp_attachment_metadata', phpSerialize(metadata))],
	};
}

/** Adds attachments to the tables. */
export function addAttachments(tables: Tables, ...attachments: { post: Row; meta: Row[] }[]): Tables {
	for (const { post: row, meta: rows } of attachments) {
		tables.wp_posts!.push(row);
		tables.wp_postmeta!.push(...rows);
	}
	return tables;
}

const paragraph = (html: string) => `<!-- wp:paragraph -->\n<p>${html}</p>\n<!-- /wp:paragraph -->`;

const image = (src: string) =>
	`<!-- wp:image {"sizeSlug":"large"} -->\n<figure class="wp-block-image size-large"><img src="${src}" alt=""/></figure>\n<!-- /wp:image -->`;

/** The media library: images posts use, one nothing uses, the site's own images. */
function mediaLibrary() {
	return [
		// The featured image of post 442, its AIOSEO social image.
		attachment({ id: 443, parent: 442, slug: 'highlight', file: '2025/05/highlight.jpg', sizes: ['highlight-1024x683.jpg'] }),
		// The AIOSEO social image of post 1854.
		attachment({ id: 1884, parent: 1854, slug: 'heroimage', file: '2026/01/heroimage.png', mime: 'image/png' }),
		attachment({
			id: 256,
			parent: 255,
			slug: 'preview-1',
			file: '2022/03/preview-1.png',
			mime: 'image/png',
			sizes: ['preview-1-1024x768.png'],
		}),
		// Used by posts 442 and 1854.
		attachment({
			id: 846,
			parent: 442,
			slug: 'si_20250418_220750_23',
			file: '2025/05/si_20250418_220750_23-scaled.jpg',
			original: 'si_20250418_220750_23.jpg',
		}),
		// Used by post 255; AIOSEO's sitemap listed it as puru-1.jpg.
		attachment({ id: 1244, parent: 255, slug: 'puru-1536x864', file: '2025/05/puru-1536x864-1.jpg' }),
		// Numeric slugs get `attachment/` in their attachment page's URL.
		attachment({ id: 312, parent: 30, slug: '32', file: '2022/04/32.png', mime: 'image/png', sizes: ['32-1024x576.png'] }),
		attachment({
			id: 500,
			parent: 442,
			slug: '%e5%b2%a1%e5%b1%b1%e9%a7%85%e5%89%8d%e6%a1%83%e5%a4%aa%e9%83%8e%e5%83%8f-%e7%a5%9e%e6%8e%a8',
			file: '2025/05/岡山駅前桃太郎像-神推.jpg',
		}),
		// Uploaded to an Envira gallery: its attachment page is /?attachment_id=639.
		attachment({ id: 639, parent: 655, slug: '20250421_133752943', file: '2025/05/20250421_133752943-scaled.jpg', original: '20250421_133752943.jpg' }),
		// Not used by any post.
		attachment({
			id: 138,
			parent: 30,
			slug: 'snipaste_2021-10-21_16-04-26',
			file: '2021/10/Snipaste_2021-10-21_16-04-26.png',
			mime: 'image/png',
		}),
		// The site's own images: AIOSEO's default social image, the theme's header image, the site icon.
		attachment({ id: 41, slug: 'night', file: '2021/09/night.png', mime: 'image/png', sizes: ['night-300x300.png'] }),
		attachment({ id: 28, slug: 'cropped-akiba07-scaled-3-jpg', file: '2021/09/cropped-akiba07-scaled-3.jpg' }),
		attachment({ id: 42, slug: 'cropped-night-png', file: '2021/09/cropped-night.png', mime: 'image/png' }),
	];
}

/** The options that name site-wide images, trimmed: AIOSEO's (JSON) and the theme's (PHP serialized). */
function imageOptions(): Row[] {
	const night = 'https:\\/\\/aniya.moe\\/wp-content\\/uploads\\/2021\\/09\\/night.png';
	const header = 'https://aniya.moe/wp-content/uploads/2021/09/cropped-akiba07-scaled-3.jpg';
	return [
		{ option_name: 'stylesheet', option_value: 'twentysixteen' },
		{
			option_name: 'aioseo_options',
			option_value: `{"social":{"facebook":{"general":{"defaultImageSourcePosts":"default","defaultImagePosts":"${night}"}},"twitter":{"general":{"defaultImagePosts":"${night}"}}}}`,
		},
		{
			option_name: 'theme_mods_twentysixteen',
			option_value: phpSerialize({ custom_css_post_id: 539, header_image: header, background_color: '1a1a1a' }),
		},
		{ option_name: 'site_icon', option_value: '42' },
		{ option_name: 'jetpack_site_icon_url', option_value: 'https://aniya.moe/wp-content/uploads/2021/09/cropped-night.png' },
	].map((row, i) => ({ option_id: String(100 + i), ...row, autoload: 'yes' }));
}

/** The site: four posts, three pages, the media library, and rows the converter must leave alone. */
export function wordpressTables(): Tables {
	const tables = addAttachments(tablesWithoutMedia(), ...mediaLibrary());
	tables.wp_options!.push(...imageOptions());
	return tables;
}

function tablesWithoutMedia(): Tables {
	return {
		wp_options: [
			{ option_id: '1', option_name: 'home', option_value: 'https://aniya.moe', autoload: 'yes' },
			{ option_id: '2', option_name: 'timezone_string', option_value: 'Asia/Taipei', autoload: 'yes' },
			{ option_id: '3', option_name: 'posts_per_page', option_value: '2', autoload: 'yes' },
			{
				option_id: '4',
				option_name: 'permalink_structure',
				option_value: '/%year%/%monthnum%/%day%/%postname%/',
				autoload: 'yes',
			},
		],
		wp_users: [strings({ ID: 1, user_login: 'erase2004', user_nicename: 'erase2004', display_name: 'Tsuki' })],
		wp_posts: [
			post({
				ID: 30,
				post_date: '2021-09-30 16:23:17',
				post_date_gmt: '2021-09-30 08:23:17',
				post_modified: '2022-04-06 13:51:27',
				post_modified_gmt: '2022-04-06 05:51:27',
				post_title: '第一篇文章',
				post_name: '%e7%ac%ac%e4%b8%80%e7%af%87%e6%96%87%e7%ab%a0',
				post_excerpt: '使用第一篇文章來確立建立本 blog 的目的。',
				post_content: paragraph('這裡會作為存放整理過的生活紀錄。'),
				guid: 'https://aniya.moe/?p=30',
			}),
			// Published at 07:30 in Taipei, still the day before in UTC.
			post({
				ID: 255,
				post_date: '2022-03-25 07:30:00',
				post_date_gmt: '2022-03-24 23:30:00',
				post_modified: '2022-04-06 13:32:32',
				post_modified_gmt: '2022-04-06 05:32:32',
				post_title: 'Vue Router - Named Views',
				post_name: 'vue-router-named-views',
				post_excerpt: '使用範例專案來講解 Vue Router 中，Named Views 的使用方法。',
				post_content: [
					paragraph('Named Views'),
					image('https://aniya.moe/wp-content/uploads/2022/03/preview-1-1024x768.png'),
					image('https://aniya.moe/wp-content/uploads/2025/05/puru-1536x864-1.jpg'),
					image('https://aniya.moe/wp-content/uploads/2022/04/32-1024x576.png'),
				].join('\n\n'),
			}),
			post({
				ID: 442,
				post_date: '2025-05-17 09:00:00',
				post_date_gmt: '2025-05-17 01:00:00',
				post_modified: '2025-05-16 22:37:25',
				post_modified_gmt: '2025-05-16 14:37:25',
				post_title: '遊記 - 岡山 / 香川 / 德島八日遊 - 前言',
				post_name: 'travel-setonaikai-2025-prologue',
				post_content: [
					paragraph('在三月下旬某日準備下一季要看的動畫新番清單時。'),
					image('https://i0.wp.com/aniya.moe/wp-content/uploads/2025/05/si_20250418_220750_23.jpg?ssl=1'),
					image('https://aniya.moe/wp-content/uploads/2025/05/%E5%B2%A1%E5%B1%B1%E9%A7%85%E5%89%8D%E6%A1%83%E5%A4%AA%E9%83%8E%E5%83%8F-%E7%A5%9E%E6%8E%A8.jpg'),
					image('https://aniya.moe/wp-content/uploads/2025/05/20250421_133752943-scaled.jpg'),
				].join('\n\n'),
			}),
			post({
				ID: 1854,
				post_date: '2026-01-23 18:00:00',
				post_date_gmt: '2026-01-23 10:00:00',
				post_modified: '2026-01-23 18:01:26',
				post_modified_gmt: '2026-01-23 10:01:26',
				post_title: '從 SSR 到 SSG：ACGN 股市歷史博物館 7 萬頁靜態化的實戰轉型紀錄',
				post_name: 'acgn-museum-ssg',
				post_content: [
					image('https://aniya.moe/wp-content/uploads/2025/05/si_20250418_220750_23-scaled.jpg'),
					paragraph(
						'記錄一個大型網站從 SSR 轉為 SSG 的完整過程。<sup data-fn="1e48c1c2-1de0" class="fn"><a id="1e48c1c2-1de0-link" href="#1e48c1c2-1de0">1</a></sup>',
					),
					'<!-- wp:footnotes /-->',
				].join('\n\n'),
			}),
			post({
				ID: 86,
				post_type: 'page',
				post_date: '2021-10-03 20:50:48',
				post_date_gmt: '2021-10-03 12:50:48',
				post_modified: '2021-10-03 21:13:03',
				post_modified_gmt: '2021-10-03 13:13:03',
				post_title: '關於我',
				post_name: 'about',
				post_content: `<!-- wp:buttons -->
<div class="wp-block-buttons"><!-- wp:button -->
<div class="wp-block-button"><a class="wp-block-button__link" href="https://aniya.moe/about/autobiography/">我的故事</a></div>
<!-- /wp:button -->

<!-- wp:button -->
<div class="wp-block-button"><a class="wp-block-button__link" href="http://aniya.moe/about/contact/">聯絡方式</a></div>
<!-- /wp:button --></div>
<!-- /wp:buttons -->

${paragraph('')}`,
				guid: 'https://aniya.moe/?page_id=86',
			}),
			post({
				ID: 85,
				post_type: 'page',
				post_parent: 86,
				post_date: '2021-10-03 21:11:07',
				post_date_gmt: '2021-10-03 13:11:07',
				post_modified: '2021-10-03 21:23:38',
				post_modified_gmt: '2021-10-03 13:23:38',
				post_title: '聯絡方式',
				post_name: 'contact',
				post_content: `${paragraph('你可以依照聯絡目的，參考以下的聯絡方式。')}

<!-- wp:heading -->
<h2>職缺相關</h2>
<!-- /wp:heading -->

<!-- wp:list -->
<ul><li><a rel="noreferrer noopener" href="https://www.linkedin.com/in/tsukiakiba" data-type="URL" data-id="https://www.linkedin.com/in/tsukiakiba" target="_blank">LinkedIn</a></li><li><a rel="noreferrer noopener" href="https://www.cakeresume.com/me/erase2004" data-type="URL" data-id="https://www.cakeresume.com/me/erase2004" target="_blank">CakeResume</a></li><li><a href="mailto:erase2004+job@gmail.com" target="_blank" rel="noreferrer noopener">E-mail</a></li></ul>
<!-- /wp:list -->

<!-- wp:heading -->
<h2>日常</h2>
<!-- /wp:heading -->

<!-- wp:list -->
<ul><li><a rel="noreferrer noopener" href="https://www.plurk.com/LegoMania" target="_blank">Plurk</a></li><li><a rel="noreferrer noopener" href="https://twitter.com/erase2004" target="_blank">Twitter</a></li><li><a href="mailto:erase2004@gmail.com" target="_blank" rel="noreferrer noopener">E-mail</a></li></ul>
<!-- /wp:list -->

<!-- wp:shortcode -->
[lmt-post-modified-info]
<!-- /wp:shortcode -->

${paragraph('')}`,
				guid: 'https://aniya.moe/?page_id=85',
			}),
			post({
				ID: 131,
				post_type: 'page',
				post_date: '2021-10-21 14:55:42',
				post_date_gmt: '2021-10-21 06:55:42',
				post_modified: '2021-10-21 14:55:42',
				post_modified_gmt: '2021-10-21 06:55:42',
				post_title: '訂閱',
				post_name: 'subscribe',
				post_content: `${paragraph('你可以使用以下連結訂閱feed：')}

<!-- wp:list -->
<ul><li><a href="https://aniya.moe/feed/" target="_blank" rel="noreferrer noopener">https://aniya.moe/feed/</a> (RSS 2.0)</li><li><a href="https://aniya.moe/feed/atom/" target="_blank" rel="noreferrer noopener">https://aniya.moe/feed/atom/</a> (Atom 1.0)</li></ul>
<!-- /wp:list -->

${paragraph('')}`,
			}),
			// Not published content: left alone.
			post({ ID: 1900, post_type: 'revision', post_status: 'inherit', post_parent: 30, post_name: '30-revision-v1' }),
			post({ ID: 1901, post_status: 'draft', post_title: '草稿', post_name: '' }),
			post({ ID: 655, post_type: 'envira', post_name: 'naoshima' }),
			post({ ID: 48, post_type: 'nav_menu_item', post_name: '48' }),
		],
		wp_postmeta: [
			meta(1854, '_wp_old_slug', '%e5%be%9e-ssr-%e5%88%b0-ssg%ef%bc%9aacgn'),
			meta(442, '_thumbnail_id', '443'),
			meta(
				1854,
				'footnotes',
				'[{"content":"<a href=\\"https://weathernews.jp/s/topics/202504/190065/\\">瀬戸内海で濃霧発生</a>","id":"1e48c1c2-1de0"}]',
			),
			// Old dates of other post types do not make old URLs.
			meta(48, '_wp_old_date', '2021-09-29'),
			meta(655, '_wp_old_date', '2025-05-09'),
		],
		wp_terms: [
			strings({ term_id: 1, name: '未分類', slug: 'uncategorized', term_group: 0 }),
			strings({ term_id: 2, name: 'Navbar', slug: 'navbar', term_group: 0 }),
			strings({ term_id: 4, name: '閒聊', slug: '%e9%96%92%e8%81%8a', term_group: 0 }),
			strings({ term_id: 5, name: 'murmur', slug: 'murmur', term_group: 0 }),
			strings({ term_id: 6, name: '技術', slug: '%e6%8a%80%e8%a1%93', term_group: 0 }),
			strings({ term_id: 14, name: 'BOOK☆WALKER', slug: 'book%e2%98%86walker', term_group: 0 }),
			strings({ term_id: 24, name: 'Vue Router', slug: 'vue-router', term_group: 0 }),
			strings({ term_id: 45, name: '旅遊', slug: '%e6%97%85%e9%81%8a', term_group: 0 }),
			strings({ term_id: 73, name: 'Astro', slug: 'astro', term_group: 0 }),
		],
		wp_term_taxonomy: [
			strings({ term_taxonomy_id: 1, term_id: 1, taxonomy: 'category', description: '', parent: 0, count: 0 }),
			strings({ term_taxonomy_id: 2, term_id: 2, taxonomy: 'nav_menu', description: '', parent: 0, count: 6 }),
			strings({ term_taxonomy_id: 4, term_id: 4, taxonomy: 'category', description: '', parent: 0, count: 1 }),
			strings({ term_taxonomy_id: 5, term_id: 5, taxonomy: 'post_tag', description: '', parent: 0, count: 1 }),
			strings({ term_taxonomy_id: 6, term_id: 6, taxonomy: 'category', description: '', parent: 0, count: 2 }),
			strings({ term_taxonomy_id: 14, term_id: 14, taxonomy: 'post_tag', description: '', parent: 0, count: 1 }),
			strings({ term_taxonomy_id: 24, term_id: 24, taxonomy: 'post_tag', description: '', parent: 0, count: 1 }),
			strings({ term_taxonomy_id: 45, term_id: 45, taxonomy: 'category', description: '', parent: 0, count: 1 }),
			strings({ term_taxonomy_id: 73, term_id: 73, taxonomy: 'post_tag', description: '', parent: 0, count: 1 }),
		],
		wp_term_relationships: [
			strings({ object_id: 30, term_taxonomy_id: 4, term_order: 0 }),
			strings({ object_id: 30, term_taxonomy_id: 5, term_order: 0 }),
			strings({ object_id: 30, term_taxonomy_id: 14, term_order: 0 }),
			strings({ object_id: 255, term_taxonomy_id: 6, term_order: 0 }),
			strings({ object_id: 255, term_taxonomy_id: 24, term_order: 0 }),
			strings({ object_id: 442, term_taxonomy_id: 45, term_order: 0 }),
			strings({ object_id: 1854, term_taxonomy_id: 6, term_order: 0 }),
			strings({ object_id: 1854, term_taxonomy_id: 73, term_order: 0 }),
			strings({ object_id: 48, term_taxonomy_id: 2, term_order: 0 }),
			// The draft's terms do not count.
			strings({ object_id: 1901, term_taxonomy_id: 1, term_order: 0 }),
		],
		wp_aioseo_posts: [
			seo({
				post_id: 442,
				description: '在三月下旬某日準備下一季要看的動畫新番清單時，就決定了這次旅行。',
				og_image_type: 'featured',
				og_image_url: 'https://aniya.moe/wp-content/uploads/2025/05/highlight.jpg',
			}),
			seo({
				post_id: 1854,
				description: '記錄一個大型網站從 SSR 轉為 SSG 的完整過程。',
				og_image_type: 'custom_image',
				og_image_custom_url: 'https://aniya.moe/wp-content/uploads/2026/01/heroimage.png',
			}),
			// AIOSEO's defaults written out are not custom settings.
			seo({ post_id: 255, title: '#post_title #separator_sa #site_title', description: '#post_excerpt' }),
			seo({ post_id: 30 }),
		],
	};
}
