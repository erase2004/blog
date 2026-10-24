import type { AstroIntegration } from 'astro';
import { fileURLToPath } from 'node:url';
import * as pagefind from 'pagefind';

/**
 * Writes the Pagefind search index of the built site to `/pagefind/`, with
 * the search box's scripts and styles (src/components/Search.astro).
 *
 * Only what is marked `data-pagefind-body` is indexed: the text of posts and
 * pages, not the listings that repeat their titles and excerpts. The index is
 * Traditional Chinese (zh-TW), the site's language: Pagefind's extended
 * release, which the npm package runs, splits Chinese text into words.
 */
export default function pagefindIndex(): AstroIntegration {
	return {
		name: 'pagefind',
		hooks: {
			'astro:build:done': async ({ dir, logger }) => {
				const site = fileURLToPath(dir);
				try {
					// One index, in the site's language, whatever a page's <html lang> says.
					const { index, errors } = await pagefind.createIndex({ forceLanguage: 'zh-TW' });
					if (!index) throw new Error(errors.join('\n'));
					const added = await index.addDirectory({ path: site });
					if (added.errors.length > 0) throw new Error(added.errors.join('\n'));
					const written = await index.writeFiles({ outputPath: fileURLToPath(new URL('pagefind/', dir)) });
					if (written.errors.length > 0) throw new Error(written.errors.join('\n'));
					logger.info(`wrote the search index (read ${added.page_count} pages)`);
				} finally {
					await pagefind.close();
				}
			},
		},
	};
}
