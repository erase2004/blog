import type { AstroIntegration } from 'astro';
import { appendRedirects } from './redirects-file';

/**
 * Makes the 404 page's own URL, `/404/`, answer HTTP 404 too.
 *
 * Workers static assets serve `404.html` with HTTP 404 for every URL that has
 * no file (`not_found_handling: "404-page"`). But with
 * `html_handling: "force-trailing-slash"`, `404.html` is also a page of its
 * own at `/404/`, served with HTTP 200 (and `/404`, `/404.html` redirect
 * there): an indexable copy of the 404 page. `_redirects` rules apply first,
 * and a proxy (200) rule serves what another path has; the path it names has
 * no file, so `/404/` gets the 404 page with HTTP 404, as every other unknown
 * URL does. One static rule.
 */
export default function notFoundPage(): AstroIntegration {
	return {
		name: 'not-found-page',
		hooks: {
			'astro:build:done': async ({ dir }) => {
				await appendRedirects(dir, ['/404/ /404/no-such-page/ 200']);
			},
		},
	};
}
