import type { AstroIntegration } from 'astro';
import { fileURLToPath } from 'node:url';
import { fromMappingTable } from '../../scripts/url-checker/expected-urls.ts';
import { MAPPING_TABLE_FILE } from '../../scripts/url-checker/settings.ts';
import { appendRedirects } from './redirects-file';

/**
 * The feed of each post, page, category and tag, `<URL>feed/`, redirects to
 * `<URL>`, with or without its trailing slash: dynamic rules for all of
 * them (`/feed/` itself does not match).
 */
const FEED_RULES = ['/*/feed/ /:splat/ 301', '/*/feed /:splat/ 301'];
const isFeedOf = (url: string, location: string) => url === `${location}feed/`;

/**
 * Adds `_redirects` rules for the old URLs the mapping table redirects to a
 * given URL of the site: a static `<old URL> <new URL> 301` rule for each
 * (the author page, the sitemaps, the comments feed, old slugs), and one for
 * the URL without its trailing slash, which WordPress redirected to the URL
 * with it; then the dynamic rules for the feeds. Not URLs with a query
 * string: the Worker answers them (src/worker.ts).
 *
 * Static rules count towards the 2,000 a Worker may have, dynamic ones
 * towards 100, and every rule after the first dynamic one counts as dynamic:
 * keep this integration after the others that write `_redirects`.
 */
export default function oldUrlRedirects(): AstroIntegration {
	let root: URL;
	return {
		name: 'old-url-redirects',
		hooks: {
			'astro:config:done': ({ config }) => {
				root = config.root;
			},
			'astro:build:done': async ({ dir, logger }) => {
				const redirects = fromMappingTable(fileURLToPath(new URL(MAPPING_TABLE_FILE, root))).flatMap((entry) =>
					entry.expect === 'redirect' && entry.location?.startsWith('/') ? [{ url: entry.url, location: entry.location }] : [],
				);
				const rules = redirects
					.filter(({ url, location }) => !url.includes('?') && !isFeedOf(url, location))
					.flatMap(({ url, location }) => (url.endsWith('/') ? [url, url.slice(0, -1)] : [url]).map((from) => ({ from, location })))
					.map(({ from, location }) => `${encodeURI(from)} ${encodeURI(location)} 301`);
				const feeds = redirects.filter(({ url, location }) => isFeedOf(url, location)).length;

				await appendRedirects(dir, [...rules, ...FEED_RULES]);
				logger.info(
					`added ${rules.length} rules for old URLs, and ${FEED_RULES.length} dynamic rules for ${feeds} feeds, to _redirects`,
				);
			},
		},
	};
}
