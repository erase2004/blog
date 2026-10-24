// What a page tells search engines and social platforms about itself, beyond
// its title and description: the image of its link previews (og:image), and
// its structured data (JSON-LD).
import type { ImageMetadata } from 'astro';
import { getImage } from 'astro:assets';
import { SITE_AUTHOR, SITE_DESCRIPTION, SITE_TITLE } from '../consts';
import type { Post } from './content';
import { firstImage, imageAt } from './images';

/**
 * What a post or page tells about itself as an article (`article:*`). Posts
 * are BlogPostings in the structured data; pages, which have no publish
 * time, are not.
 */
export interface Article {
	/** Its title, as shown (`displayTitle()`). */
	headline: string;
	/** None for pages. */
	published?: Date;
	modified: Date;
	/** The names of its categories. */
	categories?: string[];
	/** The names of its tags. */
	tags?: string[];
}

/** A step of a breadcrumb trail. */
export interface Breadcrumb {
	name: string;
	/** E.g. `/category/旅遊/`. */
	path: string;
}

/** The og:image of pages without an image of their own: AIOSEO's default, the site image. */
const DEFAULT_SOCIAL_IMAGE = 'src/assets/images/site/night.png';

/** The widest og:image: the size Facebook and X show link previews at. */
const SOCIAL_IMAGE_WIDTH = 1200;

/**
 * The image of a post's link previews: its own social image (AIOSEO's custom
 * one), else the first image in the post, else the site image. For any other
 * page, the site image.
 */
export async function socialImage(post?: Post): Promise<ImageMetadata> {
	return post?.data.socialImage ?? (post && (await firstImage(post))) ?? imageAt(DEFAULT_SOCIAL_IMAGE);
}

/** An og:image file: its URL path, size and media type. */
export interface SocialImageFile {
	src: string;
	width: number;
	height: number;
	type: 'image/jpeg' | 'image/png';
}

/**
 * The file of an image for link previews: a JPEG, or a PNG for a PNG, at most
 * `SOCIAL_IMAGE_WIDTH` wide. Not webp, which not every platform takes.
 */
export async function socialImageFile(image: ImageMetadata): Promise<SocialImageFile> {
	const format = image.format === 'png' ? 'png' : 'jpg';
	const width = Math.min(image.width, SOCIAL_IMAGE_WIDTH);
	const file = await getImage({ src: image, format, width, layout: 'none' });
	return {
		src: file.src,
		width: Number(file.attributes.width),
		height: Number(file.attributes.height),
		type: format === 'png' ? 'image/png' : 'image/jpeg',
	};
}

/**
 * The page's structured data, a schema.org graph: the site (WebSite) and its
 * author (Person) on every page; on pages below the home page, the trail to
 * them from the home page (BreadcrumbList); on a post, the post itself
 * (BlogPosting).
 */
export function structuredData({
	site,
	url,
	description,
	image,
	article,
	breadcrumbs = [],
}: {
	/** The site's origin, `https://aniya.moe/`. */
	site: URL;
	/** The page's canonical URL. */
	url: URL;
	description: string;
	image: SocialImageFile;
	article?: Article;
	/** The trail below the home page, ending with the page itself; none for the home page. */
	breadcrumbs?: Breadcrumb[];
}): object {
	const website = { '@id': new URL('#website', site).href };
	const author = { '@id': new URL('#author', site).href };
	const graph: object[] = [
		{
			'@type': 'WebSite',
			...website,
			url: site.href,
			name: SITE_TITLE,
			description: SITE_DESCRIPTION,
			inLanguage: 'zh-TW',
			publisher: author,
		},
		{
			'@type': 'Person',
			...author,
			name: SITE_AUTHOR.name,
			// WordPress's author page, /author/erase2004/, redirects there.
			url: new URL('/about/', site).href,
			sameAs: [SITE_AUTHOR.mastodon],
		},
	];
	if (breadcrumbs.length > 0) {
		graph.push({
			'@type': 'BreadcrumbList',
			'@id': new URL('#breadcrumbs', url).href,
			itemListElement: [{ name: '首頁', path: '/' }, ...breadcrumbs].map(({ name, path }, index) => ({
				'@type': 'ListItem',
				position: index + 1,
				name,
				item: new URL(path, site).href,
			})),
		});
	}
	if (article?.published) {
		graph.push({
			'@type': 'BlogPosting',
			'@id': new URL('#post', url).href,
			url: url.href,
			mainEntityOfPage: url.href,
			headline: article.headline,
			description,
			image: { '@type': 'ImageObject', url: new URL(image.src, site).href, width: image.width, height: image.height },
			datePublished: article.published.toISOString(),
			dateModified: article.modified.toISOString(),
			author,
			publisher: author,
			isPartOf: website,
			inLanguage: 'zh-TW',
			articleSection: article.categories ?? [],
			keywords: article.tags ?? [],
		});
	}
	return { '@context': 'https://schema.org', '@graph': graph };
}

/** JSON for a `<script>` element: `<` escaped, so no text in it can end the element. */
export function scriptJson(data: object): string {
	return JSON.stringify(data).replaceAll('<', String.raw`\u003c`);
}
