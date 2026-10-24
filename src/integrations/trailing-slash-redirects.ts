import type { AstroIntegration } from 'astro';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { appendRedirects } from './redirects-file';

/**
 * Adds a `/<path> /<path>/ 301` rule to `_redirects` for every
 * `<path>/index.html` in the build: the pages, and the feeds.
 *
 * Workers static assets already redirect `/<path>` to `/<path>/`
 * (`html_handling: "force-trailing-slash"`), but with HTTP 307. The WordPress
 * site answered these with 301, and `_redirects` rules are applied before
 * html_handling, so one static rule per page keeps the 301. Each rule counts
 * towards the 2,000 static `_redirects` rules a Worker may have.
 */
export default function trailingSlashRedirects(): AstroIntegration {
	return {
		name: 'trailing-slash-redirects',
		hooks: {
			'astro:build:done': async ({ dir, logger }) => {
				// Not the home page (index.html), nor the 404 page, written as 404.html.
				const rules = readdirSync(fileURLToPath(dir), { recursive: true, encoding: 'utf8' })
					.map((file) => file.replaceAll('\\', '/'))
					.filter((file) => file.endsWith('/index.html'))
					.map((file) => file.slice(0, -'index.html'.length))
					.sort()
					.map((path) => `/${path.slice(0, -1)} /${path} 301`);

				await appendRedirects(dir, rules);
				logger.info(`added ${rules.length} trailing-slash rules to _redirects`);
			},
		},
	};
}
