import type { AstroIntegration } from 'astro';
import { fileURLToPath } from 'node:url';
import { fromMappingTable } from '../../scripts/url-checker/expected-urls.ts';
import { MAPPING_TABLE_FILE } from '../../scripts/url-checker/settings.ts';
import { appendRedirects } from './redirects-file';

/**
 * Adds a `<old URL> <new URL> 301` rule to `_redirects` for each old URL the
 * mapping table redirects to a given URL of the site: the author page, the
 * sitemaps, the comments feed, old slugs. Not those with a query string (the
 * Worker answers them, src/worker.ts), nor the feeds of posts, pages and
 * archives (`<URL>feed/` → `<URL>`). Each rule counts towards the 2,000
 * static `_redirects` rules a Worker may have.
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
					.filter(({ url, location }) => !url.includes('?') && url !== `${location}feed/`)
					.map(({ url, location }) => `${encodeURI(url)} ${encodeURI(location)} 301`);

				await appendRedirects(dir, rules);
				logger.info(`added ${rules.length} rules for old URLs of pages and files to _redirects`);
			},
		},
	};
}
