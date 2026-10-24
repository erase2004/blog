// /llms.txt (https://llmstxt.org/), for AI crawlers: the site in Markdown, a
// link to everything the sitemap lists. WordPress's (made by AIOSEO) had the
// same sections.
import type { APIRoute } from 'astro';
import { SITE_DESCRIPTION, SITE_TITLE } from '../consts';
import { categoryArchives, tagArchives } from '../lib/archives';
import { getPages, getPosts, pagePath, postDescription, postPath } from '../lib/content';

export const GET: APIRoute = async ({ site }) => {
	const link = (text: string, path: string, notes?: string) =>
		`- [${text.replace(/[[\]]/g, '\\$&')}](${new URL(path, site).href})${notes ? `: ${notes.replace(/\s+/g, ' ')}` : ''}`;
	const section = (heading: string, links: string[]) => [`## ${heading}`, '', ...links, ''];
	const lines = [
		`# ${SITE_TITLE}`,
		'',
		`> ${SITE_DESCRIPTION}`,
		'',
		...section('Sitemaps', [link('XML Sitemap', '/sitemap.xml', '網站上所有公開、可索引的網址')]),
		...section(
			'文章',
			(await getPosts()).map((post) => link(post.data.title, postPath(post), postDescription(post))),
		),
		...section(
			'頁面',
			(await getPages()).map((page) => link(page.data.title, pagePath(page), page.data.description)),
		),
		...section('分類', (await categoryArchives()).map(({ name, path }) => link(name, path))),
		...section('標籤', (await tagArchives()).map(({ name, path }) => link(name, path))),
	];
	return new Response(lines.join('\n'), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};
