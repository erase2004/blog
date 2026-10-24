// /sitemap.xml, where WordPress's sitemap index was; robots.txt names it.
import type { APIRoute } from 'astro';
import { sitemap } from '../lib/sitemap';

export const GET: APIRoute = async ({ site }) =>
	new Response(await sitemap(site!), { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
