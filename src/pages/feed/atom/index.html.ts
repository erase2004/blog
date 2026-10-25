// /feed/atom/: the Atom feed. Written as feed/atom/index.html, the file
// Cloudflare serves for /feed/atom/; public/_headers gives it its Atom
// Content-Type.
import type { APIRoute } from 'astro';
import { atomFeed } from '../../../lib/feeds';

export const GET: APIRoute = async ({ site }) =>
	new Response(await atomFeed(site!), { headers: { 'Content-Type': 'application/atom+xml; charset=utf-8' } });
