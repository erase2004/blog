// Builds the real site (astro.config.mjs) into <outDir>, plus one test-only
// page at <probePath>, so URL behaviour below the root can be tested whatever
// content the site has. Runs in its own process so Astro's Vite does not share
// a process with Vitest.
//
// Usage: node tests/support/build-site.mjs <outDir> <probePath>
import { build } from 'astro';
import { fileURLToPath } from 'node:url';

const [outDir, probePath] = process.argv.slice(2);
if (!outDir || !probePath) {
	throw new Error('usage: node tests/support/build-site.mjs <outDir> <probePath>');
}

await build({
	root: fileURLToPath(new URL('../../', import.meta.url)),
	outDir,
	logLevel: 'warn',
	integrations: [
		{
			name: 'test-probe-page',
			hooks: {
				'astro:config:setup': ({ injectRoute }) => {
					injectRoute({
						pattern: probePath,
						entrypoint: fileURLToPath(new URL('../fixtures/probe-page.astro', import.meta.url)),
					});
				},
			},
		},
	],
});
