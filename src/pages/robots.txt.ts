// /robots.txt: crawlers may read everything, and find the sitemap here.
// WordPress's kept them out of /wp-admin/, which the new site does not have.
import type { APIRoute } from 'astro';

export const GET: APIRoute = ({ site }) =>
	new Response(['User-agent: *', 'Allow: /', '', `Sitemap: ${new URL('/sitemap.xml', site).href}`, ''].join('\n'), {
		headers: { 'Content-Type': 'text/plain; charset=utf-8' },
	});
