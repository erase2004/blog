import type { AstroIntegration } from 'astro';
import { readFile, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { appendRedirects } from './redirects-file';

/** Where the rules are built; the file is gone from the build output once they are in _redirects. */
const RULES_PATH = 'image-redirect-rules.txt';

/**
 * Redirects the old URLs of the moved images (upload paths and attachment
 * pages, from the old-URL mapping table) to the images Astro made of them.
 * Those URLs have a hash known only once the images are built, so the rules
 * are built as a page (image-redirect-rules.ts), then moved into _redirects.
 * About 1,600 static rules.
 */
export default function imageRedirects(): AstroIntegration {
	return {
		name: 'image-redirects',
		hooks: {
			'astro:config:setup': ({ injectRoute }) => {
				injectRoute({
					pattern: `/${RULES_PATH}`,
					entrypoint: new URL('./image-redirect-rules.ts', import.meta.url),
					prerender: true,
				});
			},
			'astro:build:done': async ({ dir, logger }) => {
				const file = fileURLToPath(new URL(RULES_PATH, dir));
				const rules = (await readFile(file, 'utf8')).split('\n').filter((rule) => rule !== '');
				await rm(file);
				await appendRedirects(dir, rules);
				logger.info(`added ${rules.length} image rules to _redirects`);
			},
		},
	};
}
