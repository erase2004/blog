// Converts the WordPress site, as read from its backup, into the files of the
// new site: one content file per published post and page, the category and
// tag data, and the old-URL mapping table. Same tables in, same files out.
import { SITE_TIMEZONE } from '../../src/consts.ts';
import { MAPPING_TABLE_FILE } from '../url-checker/settings.ts';
import { convertContent, shortcodeNames } from './content.ts';
import { type FrontmatterValue, frontmatter, localParts } from './frontmatter.ts';
import { decodeEntities } from './html.ts';
import { mappingTable } from './mapping-table.ts';
import { descriptionFromContent, seoSettings } from './seo.ts';
import { SITE_ORIGIN } from './settings.ts';
import type { Tables } from './sql-dump.ts';
import { loadWordPress, type Post, type WordPressSite } from './wordpress.ts';

export const POSTS_DIR = 'src/content/posts';
export const PAGES_DIR = 'src/content/pages';
export const CATEGORIES_FILE = 'src/data/categories.json';
export const TAGS_FILE = 'src/data/tags.json';

export type ConvertedEntry = {
	post: Post;
	/** The URL on the new site, the same as on WordPress: `/2021/09/30/第一篇文章/`, `/about/contact/`. */
	url: string;
	/** The content file, relative to the project root. */
	file: string;
};

export type ConversionOutput = {
	/** File contents by path relative to the project root. */
	files: Record<string, string>;
	/** What was left as wp-unconverted markers, by file. */
	unconverted: { file: string; kind: string }[];
};

export function convertWordPress(tables: Tables, { source = 'the WordPress backup' } = {}): ConversionOutput {
	const site = loadWordPress(tables);
	checkSettings(site);
	const files: Record<string, string> = {};
	const unconverted: ConversionOutput['unconverted'] = [];
	const entries: ConvertedEntry[] = [];

	for (const post of site.entries()) {
		for (const [field, date] of Object.entries({ post_date_gmt: post.published, post_modified_gmt: post.modified })) {
			if (Number.isNaN(date.getTime())) throw new Error(`${post.type} ${post.id} has no valid ${field}`);
		}
		const isPost = post.type === 'post';
		const url = isPost ? postUrl(post) : `/${pagePath(post, site).join('/')}/`;
		const converted = convertContent(post.content, { entry: post, site });
		const extension = converted.mdx ? 'mdx' : 'md';
		const file = isPost
			? `${POSTS_DIR}/${fileName(post.slug)}.${extension}`
			: `${PAGES_DIR}/${pagePath(post, site).map(fileName).join('/')}.${extension}`;
		const fields = isPost ? postFrontmatter(post, site) : pageFrontmatter(post, site);
		files[file] = `${frontmatter(fields, SITE_TIMEZONE)}\n${converted.markdown}`;
		unconverted.push(...converted.unconverted.map(({ kind }) => ({ file, kind })));
		entries.push({ post, url, file });
	}

	for (const [file, taxonomy] of [
		[CATEGORIES_FILE, 'category'],
		[TAGS_FILE, 'post_tag'],
	] as const) {
		const terms = site.usedTerms(taxonomy).map((term) => ({ id: term.slug, name: decodeEntities(term.name) }));
		files[file] = `[\n${terms.map((term) => `\t${JSON.stringify(term)}`).join(',\n')}\n]\n`;
	}
	files[MAPPING_TABLE_FILE] = mappingTable({ site, entries }, source);
	return { files, unconverted };
}

function postFrontmatter(post: Post, site: WordPressSite): [string, FrontmatterValue][] {
	const slugs = (taxonomy: string) =>
		site
			.termsOf(post.id, taxonomy)
			.map((term) => term.slug)
			.sort((a, b) => Buffer.compare(Buffer.from(a.toLowerCase()), Buffer.from(b.toLowerCase())));
	const { description, socialImage } = seoSettings(post, site);
	return [
		['title', decodeEntities(post.title)],
		['slug', post.slug],
		['published', post.published],
		['updated', post.modified],
		['categories', slugs('category')],
		['tags', slugs('post_tag')],
		['excerpt', decodeEntities(post.excerpt).trim() || undefined],
		['description', description],
		['socialImage', socialImage],
		['draft', false],
		['wordpressId', post.id],
	];
}

function pageFrontmatter(post: Post, site: WordPressSite): [string, FrontmatterValue][] {
	const parent = pagePath(post, site).slice(0, -1).join('/');
	const { description, socialImage } = seoSettings(post, site);
	if (socialImage) throw new Error(`page ${post.id}: pages have no social image field`);
	return [
		['title', decodeEntities(post.title)],
		['slug', post.slug],
		['parent', parent || undefined],
		['updated', post.modified],
		['description', description ?? descriptionFromContent(post.content, shortcodeNames())],
		['wordpressId', post.id],
	];
}

/** The slugs from the top-level page down to this page. */
function pagePath(page: Post, site: WordPressSite): string[] {
	const parent = page.parent === 0 ? undefined : site.post(page.parent);
	return parent ? [...pagePath(parent, site), page.slug] : [page.slug];
}

/** A slug as a file name; fails for characters Windows does not allow in file names. */
function fileName(slug: string): string {
	if (/[<>:"/\\|?*]/.test(slug)) throw new Error(`The slug ${slug} cannot be a file name`);
	return slug;
}

/** The converter relies on these WordPress settings; a backup with others needs the converter changed. */
function checkSettings(site: WordPressSite): void {
	const expected = {
		home: SITE_ORIGIN,
		timezone_string: SITE_TIMEZONE,
		permalink_structure: '/%year%/%monthnum%/%day%/%postname%/',
	};
	for (const [name, value] of Object.entries(expected)) {
		if (site.option(name) !== value) {
			throw new Error(`WordPress option ${name} is ${site.option(name)}, the converter expects ${value}`);
		}
	}
}

/** A post's URL: its publish date in the site's time zone, as in WordPress permalinks, and its slug. */
export function postUrl(post: Post): string {
	const { year, month, day, hour, minute, second } = localParts(post.published, SITE_TIMEZONE);
	if (`${year}-${month}-${day} ${hour}:${minute}:${second}` !== post.publishedLocal) {
		throw new Error(`Post ${post.id}: post_date_gmt in ${SITE_TIMEZONE} is not its post_date`);
	}
	return `/${year}/${month}/${day}/${post.slug}/`;
}
