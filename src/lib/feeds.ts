// The site's feeds, /feed/ (RSS 2.0) and /feed/atom/ (Atom): the newest
// posts, full text, as WordPress's feeds had them.
import { createHash } from 'node:crypto';
import { getContainerRenderer as mdxRenderer } from '@astrojs/mdx/container-renderer';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { loadRenderers } from 'astro:container';
import { getEntries, render } from 'astro:content';
import MarkdownImage from '../components/MarkdownImage.astro';
import { SITE_DESCRIPTION, SITE_TITLE } from '../consts';
import { getPosts, type Post, postDescription, postPath, postUpdated } from './content';
import { feedHtml } from './feed-html';
import { cdata, escapeXml } from './xml';

/** WordPress's `posts_per_rss`. */
const FEED_POSTS = 10;

/** The WordPress site's only author (user erase2004), by the name its feeds gave. */
const AUTHOR = 'Tsuki';

/** A post, as both feeds give it. */
interface FeedEntry {
	title: string;
	/** Absolute. */
	url: string;
	/**
	 * What feed readers tell posts apart by. WordPress's (`https://aniya.moe/?p=1854`)
	 * for its posts, so readers do not take them for new posts; the post URL
	 * for posts written since.
	 */
	id: string;
	published: Date;
	updated: Date;
	/** The names of its categories, then of its tags. */
	terms: string[];
	summary: string;
	/** The full post, as HTML for feed readers. */
	content: string;
}

/** The RSS 2.0 feed at /feed/. */
export async function rssFeed(site: URL): Promise<string> {
	const { entries, updated } = await feed(site);
	return [
		'<?xml version="1.0" encoding="UTF-8"?>',
		'<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" ' +
			'xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:atom="http://www.w3.org/2005/Atom">',
		'<channel>',
		`<title>${escapeXml(SITE_TITLE)}</title>`,
		`<atom:link href="${escapeXml(new URL('/feed/', site).href)}" rel="self" type="application/rss+xml" />`,
		`<link>${escapeXml(site.href)}</link>`,
		`<description>${escapeXml(SITE_DESCRIPTION)}</description>`,
		`<lastBuildDate>${rfc822(updated)}</lastBuildDate>`,
		'<language>zh-TW</language>',
		...entries.flatMap((entry) => [
			'<item>',
			`<title>${escapeXml(entry.title)}</title>`,
			`<link>${escapeXml(entry.url)}</link>`,
			`<dc:creator>${escapeXml(AUTHOR)}</dc:creator>`,
			`<pubDate>${rfc822(entry.published)}</pubDate>`,
			...entry.terms.map((term) => `<category>${escapeXml(term)}</category>`),
			`<guid isPermaLink="false">${escapeXml(entry.id)}</guid>`,
			`<description>${escapeXml(entry.summary)}</description>`,
			`<content:encoded>${cdata(entry.content)}</content:encoded>`,
			'</item>',
		]),
		'</channel>',
		'</rss>',
		'',
	].join('\n');
}

/** The Atom feed at /feed/atom/. */
export async function atomFeed(site: URL): Promise<string> {
	const { entries, updated } = await feed(site);
	const self = new URL('/feed/atom/', site).href;
	return [
		'<?xml version="1.0" encoding="UTF-8"?>',
		'<feed xmlns="http://www.w3.org/2005/Atom" xml:lang="zh-TW">',
		`<title type="text">${escapeXml(SITE_TITLE)}</title>`,
		`<subtitle type="text">${escapeXml(SITE_DESCRIPTION)}</subtitle>`,
		`<updated>${rfc3339(updated)}</updated>`,
		`<link rel="alternate" type="text/html" href="${escapeXml(site.href)}" />`,
		`<id>${escapeXml(self)}</id>`,
		`<link rel="self" type="application/atom+xml" href="${escapeXml(self)}" />`,
		...entries.flatMap((entry) => [
			'<entry>',
			`<author><name>${escapeXml(AUTHOR)}</name><uri>${escapeXml(new URL('/about/', site).href)}</uri></author>`,
			`<title type="text">${escapeXml(entry.title)}</title>`,
			`<link rel="alternate" type="text/html" href="${escapeXml(entry.url)}" />`,
			`<id>${escapeXml(entry.id)}</id>`,
			`<updated>${rfc3339(entry.updated)}</updated>`,
			`<published>${rfc3339(entry.published)}</published>`,
			...entry.terms.map((term) => `<category scheme="${escapeXml(site.href)}" term="${escapeXml(term)}" />`),
			`<summary type="text">${escapeXml(entry.summary)}</summary>`,
			`<content type="html" xml:base="${escapeXml(entry.url)}">${cdata(entry.content)}</content>`,
			'</entry>',
		]),
		'</feed>',
		'',
	].join('\n');
}

/** The newest posts, and when the latest change to any post was made (WordPress's `lastBuildDate`). */
async function feed(site: URL): Promise<{ entries: FeedEntry[]; updated: Date }> {
	const posts = await getPosts();
	const updated = new Date(Math.max(...posts.map((post) => postUpdated(post).getTime())));
	return { entries: await Promise.all(posts.slice(0, FEED_POSTS).map((post) => feedEntry(post, site))), updated };
}

async function feedEntry(post: Post, site: URL): Promise<FeedEntry> {
	const url = new URL(postPath(post), site);
	const terms = [...(await getEntries(post.data.categories)), ...(await getEntries(post.data.tags))];
	const { Content } = await render(post);
	return {
		title: post.data.title,
		url: url.href,
		id: post.data.wordpressId === undefined ? url.href : new URL(`/?p=${post.data.wordpressId}`, site).href,
		published: post.data.published,
		updated: postUpdated(post),
		terms: terms.map(({ data }) => data.name),
		summary: postDescription(post),
		content: await feedContent(Content, {
			postUrl: url,
			// Unique to the post, and only ASCII whatever its slug.
			idPrefix: `post-${createHash('sha256').update(post.id).digest('hex').slice(0, 8)}-`,
		}),
	};
}

/**
 * The content of a Markdown or MDX file (its `Content` component), rendered
 * as the post page renders it, as HTML for feed readers (see feed-html.ts):
 * components become what they render on the server, without their scripts.
 */
export async function feedContent(
	Content: Parameters<AstroContainer['renderToString']>[0],
	options: Parameters<typeof feedHtml>[1],
): Promise<string> {
	// MDX content needs MDX's renderer; Markdown content needs none.
	const container = await AstroContainer.create({ renderers: await loadRenderers([mdxRenderer()]) });
	// The post page's components (src/pages/[year]/[month]/[day]/[slug].astro),
	// so that images are the same files.
	const html = await container.renderToString(Content, { props: { components: { img: MarkdownImage } } });
	return feedHtml(html, options);
}

/** RSS's date format, as WordPress wrote it: `Fri, 23 Jan 2026 10:00:00 +0000`. */
function rfc822(date: Date): string {
	return date.toUTCString().replace(/GMT$/, '+0000');
}

/** Atom's date format, as WordPress wrote it: `2026-01-23T10:01:26Z`. */
function rfc3339(date: Date): string {
	return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
}
