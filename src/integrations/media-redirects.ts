import type { AstroIntegration } from 'astro';
import { mediaFiles, oldUrlsOf } from '../lib/old-url-map';
import { appendRedirects, lowercaseEncoded, type RedirectRule } from './redirects-file';

/**
 * Adds a `<old URL> <URL on R2> 301` rule to `_redirects` for each old URL of
 * the videos and the PDF (upload path and attachment page), from the `media`
 * section of the old-URL mapping table, and one for each old URL in the
 * lowercase percent-encoding WordPress linked it with (lowercaseEncoded()).
 * Each rule counts towards the 2,000 static `_redirects` rules a Worker may
 * have; rules after the first dynamic one count as dynamic, so dynamic rules
 * must be added after these.
 */
export default function mediaRedirects(): AstroIntegration {
	return {
		name: 'media-redirects',
		hooks: {
			'astro:build:done': async ({ dir, logger }) => {
				const rules = mediaFiles().flatMap((file) =>
					oldUrlsOf(file)
						.flatMap((old) => [old, lowercaseEncoded(old)].filter((from) => from !== null))
						.map((from): RedirectRule => ({ from, to: file.url, status: 301 })),
				);

				await appendRedirects(dir, rules);
				logger.info(`added ${rules.length} rules for the videos and the PDF on R2 to _redirects`);
			},
		},
	};
}
