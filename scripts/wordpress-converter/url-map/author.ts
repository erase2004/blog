// The author archive of each author with published posts redirects to the
// about page (ticket 13).
import type { UrlSource } from '../mapping-table.ts';

const ABOUT_PAGE = '/about/';

export const author: UrlSource = ({ site, entries }) => {
	if (!entries.some(({ url }) => url === ABOUT_PAGE)) throw new Error(`There is no ${ABOUT_PAGE} page to send authors to`);
	const authors = [...new Set(entries.filter(({ post }) => post.type === 'post').map(({ post }) => post.author))];
	return {
		urls: authors.map((id) => {
			const user = site.user(id);
			if (!user) throw new Error(`Author ${id} is not in wp_users`);
			return { url: `/author/${user.nicename}/`, expect: 'redirect' as const, location: ABOUT_PAGE };
		}),
	};
};
