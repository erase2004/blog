// Posts and pages: kept at their WordPress URL. The `content` section lists
// each one's WordPress ID, URL, file, and the old slugs and dates WordPress
// redirected from (see old-slugs.ts).
import type { UrlSource } from '../mapping-table.ts';
import { decodeSlug } from '../wordpress.ts';

export const content: UrlSource = ({ site, entries }) => ({
	sections: {
		content: entries.map(({ post, url, file }) => ({
			wordpressId: post.id,
			type: post.type,
			title: post.title,
			url,
			file,
			oldSlugs: [...new Set(site.meta(post.id, '_wp_old_slug').map(decodeSlug))]
				.filter((slug) => slug !== post.slug)
				.sort(),
			oldDates: [...new Set(site.meta(post.id, '_wp_old_date'))].sort(),
		})),
	},
	urls: [{ url: '/', expect: 'page' }, ...entries.map(({ url }) => ({ url, expect: 'page' as const }))],
});
