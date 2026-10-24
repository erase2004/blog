// Builds the real site (astro.config.mjs) into <outDir>, plus test-only pages:
// one at <probePath>, so URL behaviour below the root can be tested whatever
// content the site has, and the sidebar widgets at <widgetsPath>. Runs in its
// own process so Astro's Vite does not share a process with Vitest.
//
// Usage: node tests/support/build-site.mjs <outDir> <probePath> <widgetsPath>
import { build } from 'astro';
import { fileURLToPath } from 'node:url';

const [outDir, probePath, widgetsPath] = process.argv.slice(2);
if (!outDir || !probePath || !widgetsPath) {
	throw new Error('usage: node tests/support/build-site.mjs <outDir> <probePath> <widgetsPath>');
}

const fixture = (name) => fileURLToPath(new URL(`../fixtures/${name}`, import.meta.url));

await build({
	root: fileURLToPath(new URL('../../', import.meta.url)),
	outDir,
	logLevel: 'warn',
	integrations: [
		{
			name: 'test-pages',
			hooks: {
				'astro:config:setup': ({ injectRoute }) => {
					injectRoute({ pattern: probePath, entrypoint: fixture('probe-page.astro') });
					injectRoute({ pattern: widgetsPath, entrypoint: fixture('widgets-page.astro') });
				},
			},
		},
	],
});
