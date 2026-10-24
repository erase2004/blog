// `/?p=ID` and `/?page_id=ID`: WordPress redirected both, for any post or
// page ID, to its permalink (redirect_canonical), and answered IDs it never
// gave out with 404. The new site does the same in its Worker (ticket 13).
import type { UrlSource } from '../mapping-table.ts';

export const queryIds: UrlSource = ({ site, entries }) => {
	const unusedId = Math.max(...(site.tables.wp_posts ?? []).map((row) => Number(row.ID))) + 1;
	return {
		urls: [
			...entries.flatMap(({ post, url }) =>
				['p', 'page_id'].map((key) => ({ url: `/?${key}=${post.id}`, expect: 'redirect' as const, location: url })),
			),
			{ url: `/?p=${unusedId}`, expect: 'not-found' },
			{ url: `/?page_id=${unusedId}`, expect: 'not-found' },
		],
	};
};
