// The site's feeds, /feed/ (RSS 2.0) and /feed/atom/ (Atom): the newest
// posts, full text, as WordPress's feeds had them.
import { createHash } from 'node:crypto';
import { getContainerRenderer as mdxRenderer } from '@astrojs/mdx/container-renderer';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { loadRenderers } from 'astro:container';
import { render } from 'astro:content';
import { SITE_DESCRIPTION, SITE_TITLE } from '../consts';
import { getPosts, type Post, postPath } from './content';
import { feedHtml } from './feed-html';

/** WordPress's `posts_per_rss`. */
const FEED_POSTS = 10;

/** The RSS 2.0 feed at /feed/. */
export async function rssFeed(site: URL): Promise<string> {
	const items = await Promise.all(
		(await feedPosts()).map(async (post) => [
			'<item>',
			`<title>${escapeXml(post.data.title)}</title>`,
			`<link>${escapeXml(new URL(postPath(post), site).href)}</link>`,
			`<content:encoded>${escapeXml(await postHtml(post, site))}</content:encoded>`,
			'</item>',
		]),
	);
	return [
		'<?xml version="1.0" encoding="UTF-8"?>',
		'<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">',
		'<channel>',
		`<title>${escapeXml(SITE_TITLE)}</title>`,
		`<link>${escapeXml(site.href)}</link>`,
		`<description>${escapeXml(SITE_DESCRIPTION)}</description>`,
		...items.flat(),
		'</channel>',
		'</rss>',
		'',
	].join('\n');
}

async function feedPosts(): Promise<Post[]> {
	return (await getPosts()).slice(0, FEED_POSTS);
}

/** The post's content, as HTML for feed readers. */
async function postHtml(post: Post, site: URL): Promise<string> {
	const { Content } = await render(post);
	return feedContent(Content, {
		postUrl: new URL(postPath(post), site),
		// Unique to the post, and only ASCII whatever its slug.
		idPrefix: `post-${createHash('sha256').update(post.id).digest('hex').slice(0, 8)}-`,
	});
}

/**
 * The content of a Markdown or MDX file (its `Content` component), as HTML
 * for feed readers (see feed-html.ts): components become what they render on
 * the server, without their scripts.
 */
export async function feedContent(
	Content: Parameters<AstroContainer['renderToString']>[0],
	options: Parameters<typeof feedHtml>[1],
): Promise<string> {
	// MDX content needs MDX's renderer; Markdown content needs none.
	const container = await AstroContainer.create({ renderers: await loadRenderers([mdxRenderer()]) });
	return feedHtml(await container.renderToString(Content), options);
}

function escapeXml(text: string): string {
	return text.replace(/[<>&'"]/g, (character) => `&#${character.charCodeAt(0)};`);
}
