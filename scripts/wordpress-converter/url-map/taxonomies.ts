// Category and tag archives, `/category/<slug>/` and `/tag/<slug>/`, with
// their pages beyond the first: kept where they were (ticket 11). Terms
// without published posts (未分類) are not generated and answer 404.
import { paginated, type UrlSource } from '../mapping-table.ts';

export const TAXONOMY_BASES = { category: '/category/', post_tag: '/tag/' } as const;

export const taxonomies: UrlSource = ({ site }) => ({
	urls: Object.entries(TAXONOMY_BASES).flatMap(([taxonomy, base]) => {
		const used = site.usedTerms(taxonomy);
		const unused = site.terms(taxonomy).filter((term) => !used.includes(term));
		return [
			...used.flatMap((term) => paginated(`${base}${term.slug}/`, site.postsWith(term).length, site)),
			...unused.map((term) => ({ url: `${base}${term.slug}/`, expect: 'not-found' as const })),
		];
	}),
});
