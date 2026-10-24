import type { AstroIntegration } from 'astro';
import { fileURLToPath } from 'node:url';
import { oldUrls, readMediaTable } from '../../scripts/r2-media/media-table.ts';
import { MAPPING_TABLE_FILE } from '../../scripts/url-checker/settings.ts';
import { appendRedirects } from './redirects-file';

/**
 * Adds a `<old URL> <URL on R2> 301` rule to `_redirects` for each old URL of
 * the videos and the PDF (upload path and attachment page), from the `media`
 * section of the old-URL mapping table. Each rule counts towards the 2,000
 * static `_redirects` rules a Worker may have; rules after the first dynamic
 * one count as dynamic, so dynamic rules must be added after these.
 */
export default function mediaRedirects(): AstroIntegration {
	let root: URL;
	return {
		name: 'media-redirects',
		hooks: {
			'astro:config:done': ({ config }) => {
				root = config.root;
			},
			'astro:build:done': async ({ dir, logger }) => {
				const files = readMediaTable(fileURLToPath(new URL(MAPPING_TABLE_FILE, root)));
				const rules = files.flatMap((file) =>
					oldUrls(file).map((old) => `${encodeURI(old)} ${encodeURI(file.url)} 301`),
				);

				await appendRedirects(dir, rules);
				logger.info(`added ${rules.length} rules for the videos and the PDF on R2 to _redirects`);
			},
		},
	};
}
