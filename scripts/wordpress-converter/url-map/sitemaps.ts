// Sitemaps: the new site's sitemap is at the URL of AIOSEO's sitemap index,
// `/sitemap.xml` (ticket 12). The sitemaps that index listed, and
// WordPress's own sitemap index, redirect to it (ticket 13).
import type { UrlSource } from '../mapping-table.ts';

const SITEMAP = '/sitemap.xml';

/** The sitemaps AIOSEO's index listed (sitemap snapshot, 2026-10-24): one per post type and taxonomy, and its additional pages. */
const AIOSEO_SITEMAPS = ['addl', 'post', 'page', 'category', 'post_tag'].map((name) => `/${name}-sitemap.xml`);

export const sitemaps: UrlSource = () => ({
	urls: [
		{ url: SITEMAP, expect: 'file' },
		...['/wp-sitemap.xml', ...AIOSEO_SITEMAPS].map((url) => ({ url, expect: 'redirect' as const, location: SITEMAP })),
	],
});
