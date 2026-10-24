// The pages of the home page beyond the first, `/page/N/` (ticket 11); the
// first page past the last answered 404 on WordPress and still does.
import { paginated, type UrlSource } from '../mapping-table.ts';

export const homePagination: UrlSource = ({ site, entries }) => {
	const pages = paginated('/', entries.filter(({ post }) => post.type === 'post').length, site);
	return { urls: [...pages.slice(1), { url: `/page/${pages.length + 1}/`, expect: 'not-found' }] };
};
