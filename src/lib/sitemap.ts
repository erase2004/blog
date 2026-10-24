// /sitemap.xml: what search engines should index, as WordPress's sitemaps
// listed it: the home page, posts, pages, categories and tags, with the
// images of each. Not the date archives (indexable, but never in the
// sitemap) nor the pages after the first of a list (noindex).
import { type Archive, categoryArchives, homeArchive, tagArchives } from './archives';
import { getPages, getPosts, type Page, pagePath, type Post, postPath, postUpdated } from './content';
import { imageAt, imagesIn, imageUrl } from './images';

interface SitemapEntry {
	path: string;
	/** When it last changed, if known. */
	updated?: Date;
	/** The images of the uniform image directory it shows (see imagesIn()). */
	images: string[];
}

/** The sitemap of the site at `site`. */
export async function sitemap(site: URL): Promise<string> {
	const archives = [await homeArchive(), ...(await categoryArchives()), ...(await tagArchives())];
	const entries: SitemapEntry[] = [
		...archives.map(archiveEntry),
		...(await getPosts()).map(postEntry),
		...(await getPages()).map(pageEntry),
	];
	const urls = await Promise.all(
		entries.map(async ({ path, updated, images }) => [
			'<url>',
			`<loc>${escapeXml(new URL(path, site).href)}</loc>`,
			...(updated ? [`<lastmod>${updated.toISOString()}</lastmod>`] : []),
			...(await Promise.all(
				images.map(
					async (file) =>
						`<image:image><image:loc>${escapeXml(new URL(await imageUrl(await imageAt(file)), site).href)}</image:loc></image:image>`,
				),
			)),
			'</url>',
		]),
	);
	return [
		'<?xml version="1.0" encoding="UTF-8"?>',
		'<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" ' +
			'xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">',
		...urls.flat(),
		'</urlset>',
		'',
	].join('\n');
}

/** A list of posts changes when one of its posts does. */
function archiveEntry({ path, posts }: Archive): SitemapEntry {
	return { path, updated: new Date(Math.max(...posts.map((post) => postUpdated(post).getTime()))), images: [] };
}

function postEntry(post: Post): SitemapEntry {
	return { path: postPath(post), updated: postUpdated(post), images: imagesIn(post) };
}

function pageEntry(page: Page): SitemapEntry {
	return { path: pagePath(page), updated: page.data.updated, images: imagesIn(page) };
}

function escapeXml(text: string): string {
	const entities: Record<string, string> = { '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' };
	return text.replace(/[<>&'"]/g, (character) => entities[character]!);
}
