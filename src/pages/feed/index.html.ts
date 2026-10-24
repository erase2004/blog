// /feed/: the RSS 2.0 feed. Written as feed/index.html, the file Cloudflare
// serves for /feed/; public/_headers gives it its RSS Content-Type.
import type { APIRoute } from 'astro';
import { rssFeed } from '../../lib/feeds';

export const GET: APIRoute = async ({ site }) =>
	new Response(await rssFeed(site!), { headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' } });
