import type { AstroIntegration } from 'astro';
import { existsSync } from 'node:fs';
import { appendFile, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

/**
 * Adds a `/<page> /<page>/ 301` rule to `_redirects` for every built page.
 *
 * Workers static assets already redirect `/<page>` to `/<page>/`
 * (`html_handling: "force-trailing-slash"`), but with HTTP 307. The WordPress
 * site answered these with 301, and `_redirects` rules are applied before
 * html_handling, so one static rule per page keeps the 301. Each rule counts
 * towards the 2,000 static `_redirects` rules a Worker may have.
 */
export default function trailingSlashRedirects(): AstroIntegration {
	return {
		name: 'trailing-slash-redirects',
		hooks: {
			'astro:build:done': async ({ dir, pages, logger }) => {
				// Only pages written as <path>/index.html; e.g. the 404 page is
				// reported as "404/" but written as 404.html.
				const rules = pages
					.map(({ pathname }) => pathname)
					.filter((pathname) => pathname !== '' && pathname.endsWith('/'))
					.filter((pathname) => existsSync(fileURLToPath(new URL(`${pathname}index.html`, dir))))
					.map((pathname) => `/${pathname.slice(0, -1)} /${pathname} 301\n`);

				const file = fileURLToPath(new URL('_redirects', dir));
				const existing = await readFile(file, 'utf8').catch(() => '');
				const separator = existing === '' || existing.endsWith('\n') ? '' : '\n';
				await appendFile(file, separator + rules.join(''));
				logger.info(`added ${rules.length} trailing-slash rules to _redirects`);
			},
		},
	};
}
