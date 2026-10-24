// Old slugs and old dates of posts (`_wp_old_slug`, `_wp_old_date`):
// WordPress redirected `/<date>/<old slug>/` and `/<old date>/<slug>/` to the
// current URL (wp_old_slug_redirect).
import { SITE_TIMEZONE } from '../../../src/consts.ts';
import { localParts } from '../frontmatter.ts';
import type { UrlSource } from '../mapping-table.ts';
import { decodeSlug } from '../wordpress.ts';

export const oldSlugs: UrlSource = ({ site, entries }) => ({
	urls: entries
		.filter(({ post }) => post.type === 'post')
		.flatMap(({ post, url }) => {
			const { year, month, day } = localParts(post.published, SITE_TIMEZONE);
			const slugs = site
				.meta(post.id, '_wp_old_slug')
				.map(decodeSlug)
				.filter((slug) => slug !== post.slug)
				.map((slug) => `/${year}/${month}/${day}/${slug}/`);
			const dates = site.meta(post.id, '_wp_old_date').map((date) => `/${date.replaceAll('-', '/')}/${post.slug}/`);
			return [...slugs, ...dates]
				.filter((old) => old !== url)
				.map((old) => ({ url: old, expect: 'redirect' as const, location: url }));
		}),
});
