// WordPress's own sitemap index redirects to the new sitemap (ticket 13).
// AIOSEO's sub-sitemaps come from the sitemap snapshot, not from here.
import type { UrlSource } from '../mapping-table.ts';

export const sitemaps: UrlSource = () => ({
	urls: [{ url: '/wp-sitemap.xml', expect: 'redirect', location: '/sitemap.xml' }],
});
