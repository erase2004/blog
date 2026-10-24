// Feeds: `/feed/` (RSS) and `/feed/atom/` stay (ticket 12); the comments
// feed redirects to `/feed/`, and the feeds of each post, page, category and
// tag (`…/feed/`) redirect to that post, page or archive (ticket 13).
import type { UrlSource } from '../mapping-table.ts';
import { TAXONOMY_BASES } from './taxonomies.ts';

export const feeds: UrlSource = ({ site, entries }) => ({
	urls: [
		{ url: '/feed/', expect: 'file' },
		{ url: '/feed/atom/', expect: 'file' },
		{ url: '/comments/feed/', expect: 'redirect', location: '/feed/' },
		...[
			...entries.map(({ url }) => url),
			...Object.entries(TAXONOMY_BASES).flatMap(([taxonomy, base]) =>
				site.usedTerms(taxonomy).map((term) => `${base}${term.slug}/`),
			),
		].map((url) => ({ url: `${url}feed/`, expect: 'redirect' as const, location: url })),
	],
});
