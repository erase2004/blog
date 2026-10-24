// Date archives `/YYYY/`, `/YYYY/MM/`, `/YYYY/MM/DD/` of the dates that have
// posts (in the site's time zone), with their pages beyond the first: kept
// where they were (ticket 11).
import { SITE_TIMEZONE } from '../../../src/consts.ts';
import { localParts } from '../frontmatter.ts';
import { paginated, type UrlSource } from '../mapping-table.ts';

export const dateArchives: UrlSource = ({ site, entries }) => {
	const counts = new Map<string, number>();
	for (const { post } of entries.filter(({ post }) => post.type === 'post')) {
		const { year, month, day } = localParts(post.published, SITE_TIMEZONE);
		for (const archive of [`/${year}/`, `/${year}/${month}/`, `/${year}/${month}/${day}/`]) {
			counts.set(archive, (counts.get(archive) ?? 0) + 1);
		}
	}
	return { urls: [...counts].flatMap(([archive, count]) => paginated(archive, count, site)) };
};
