// What a post's or page's All in One SEO settings say about its meta
// description and social image, and the description AIOSEO makes from the
// content when none is set.
import { decodeEntities } from './html.ts';
import { siteRelative } from './content.ts';
import type { Post, WordPressSite } from './wordpress.ts';

/** AIOSEO's templates for these post types, as the site was set up; written out, they are no custom setting. */
const DEFAULT_TEMPLATES = {
	title: ['#post_title #separator_sa #site_title'],
	description: ['#post_excerpt', '#post_content'],
};

export type SeoSettings = {
	/** The custom meta description. */
	description?: string;
	/** The custom social image (og:image), as the old upload path. */
	socialImage?: string;
};

export function seoSettings(post: Post, site: WordPressSite): SeoSettings {
	const row = site.seo(post.id);
	if (!row) return {};
	const where = `${post.type} ${post.id}`;
	const custom = (field: 'title' | 'description') => {
		const value = decodeEntities(row[field] ?? '').trim();
		if (value === '' || DEFAULT_TEMPLATES[field].includes(value)) return undefined;
		if (/#[a-z_]+/.test(value) || field === 'title') {
			throw new Error(`${where}: AIOSEO ${field} "${value}" is not supported by the converter`);
		}
		return value;
	};
	custom('title');

	const home = site.option('home')!;
	let socialImage: string | undefined;
	switch (row.og_image_type) {
		case null:
		case 'default':
			break;
		case 'custom_image':
			socialImage = siteRelative(row.og_image_custom_url ?? '', home);
			break;
		case 'featured': {
			const [thumbnail] = site.meta(post.id, '_thumbnail_id');
			const [file] = thumbnail ? site.meta(Number(thumbnail), '_wp_attached_file') : [];
			if (!file) throw new Error(`${where}: AIOSEO uses the featured image, but there is none`);
			socialImage = `/wp-content/uploads/${file}`;
			break;
		}
		default:
			throw new Error(`${where}: AIOSEO social image type ${row.og_image_type} is not supported by the converter`);
	}
	return { description: custom('description'), socialImage };
}

/** Block-level tags; WordPress's wpautop puts blank lines around them before AIOSEO strips all tags. */
const BLOCK_TAG =
	/<\/?(?:table|thead|tfoot|caption|col|colgroup|tbody|tr|td|th|div|dl|dd|dt|ul|ol|li|pre|form|map|area|blockquote|address|style|p|h[1-6]|hr|fieldset|legend|section|article|aside|hgroup|header|footer|nav|figure|figcaption|details|menu|summary)\b[^>]*>/gi;

/**
 * The meta description AIOSEO made from a post's content (its `#post_content`
 * tag, the default for pages): images, figures and embeds removed,
 * shortcodes removed, tags stripped, whitespace collapsed, first 55
 * characters (zh_TW counts characters, not words).
 */
export function descriptionFromContent(content: string, shortcodes: string[]): string {
	const names = shortcodes.map((name) => name.replaceAll('-', '\\-')).join('|');
	const text = content
		.replace(/(<figure.*?\/figure>|<img.*?\/>|<div.*?class="wp-block-embed__wrapper".*?>.*?<\/div>)/gs, '')
		.replace(new RegExp(`\\[(${names})(?![\\w-])[^\\]]*\\](?:[\\s\\S]*?\\[\\/\\1\\])?`, 'g'), '')
		.replace(/<!--[\s\S]*?-->/g, '')
		.replace(BLOCK_TAG, '\n\n')
		.replace(/<[^>]*>/g, '')
		.replace(/[\n\r\t ]+/g, ' ')
		.trim();
	return decodeEntities([...text].slice(0, 55).join('')).trim();
}
