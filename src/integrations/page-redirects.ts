import type { AstroIntegration } from 'astro';
import { expectedUrls } from '../lib/old-url-map';
import { appendRedirects, type RedirectRule } from './redirects-file';

/**
 * The feed of each post, page, category and tag, `<URL>feed/`, redirects to
 * `<URL>`, with or without its trailing slash: dynamic rules for all of
 * them (`/feed/` itself does not match).
 */
const FEED_RULES: RedirectRule[] = [
	{ from: '/*/feed/', to: '/:splat/', status: 301 },
	{ from: '/*/feed', to: '/:splat/', status: 301 },
];
const isFeedOf = (url: string, location: string) => url === `${location}feed/`;

/**
 * Redirects the old URLs that the mapping table sends to a page of the site
 * (or a feed, or the sitemap): old slugs, the author page, the comments feed,
 * the old sitemaps, and the feeds of posts, pages and archives. The old URLs
 * of images and of the videos and the PDF have integrations of their own
 * (image-redirects.ts, media-redirects.ts).
 *
 * Adds a static `<old URL> <new URL> 301` rule to `_redirects` for each, and
 * one for the URL without its trailing slash, which WordPress redirected to
 * the URL with it; then the dynamic rules for the feeds. Not URLs with a
 * query string: the Worker answers them (src/worker.ts).
 *
 * Static rules count towards the 2,000 a Worker may have, dynamic ones
 * towards 100, and every rule after the first dynamic one counts as dynamic:
 * keep this integration after the others that write `_redirects`.
 */
export default function pageRedirects(): AstroIntegration {
	return {
		name: 'page-redirects',
		hooks: {
			'astro:build:done': async ({ dir, logger }) => {
				const redirects = expectedUrls().flatMap((entry) =>
					entry.expect === 'redirect' && entry.location?.startsWith('/') ? [{ url: entry.url, location: entry.location }] : [],
				);
				const rules = redirects
					.filter(({ url, location }) => !url.includes('?') && !isFeedOf(url, location))
					.flatMap(({ url, location }) =>
						(url.endsWith('/') ? [url, url.slice(0, -1)] : [url]).map((from): RedirectRule => ({ from, to: location, status: 301 })),
					);
				const feeds = redirects.filter(({ url, location }) => isFeedOf(url, location)).length;

				await appendRedirects(dir, [...rules, ...FEED_RULES]);
				logger.info(
					`added ${rules.length} rules for old URLs, and ${FEED_RULES.length} dynamic rules for ${feeds} feeds, to _redirects`,
				);
			},
		},
	};
}
