// Builds the real site (astro.config.mjs) into <outDir>, plus one test-only
// page at <probePath>, so URL behaviour below the root can be tested whatever
// content the site has. Runs in its own process so Astro's Vite does not share
// a process with Vitest.
//
// Usage: node tests/support/build-site.mjs <outDir> <probePath> [<path>=<fixture> ...]
// Each <path>=<fixture> adds more test-only pages: <path> (with parameters,
// if the .astro page in tests/fixtures/ has getStaticPaths()).
import { build } from 'astro';
import { fileURLToPath } from 'node:url';

const [outDir, probePath, ...pages] = process.argv.slice(2);
if (!outDir || !probePath) {
	throw new Error('usage: node tests/support/build-site.mjs <outDir> <probePath> [<path>=<fixture> ...]');
}

const fixture = (file) => fileURLToPath(new URL(`../fixtures/${file}`, import.meta.url));

await build({
	root: fileURLToPath(new URL('../../', import.meta.url)),
	outDir,
	logLevel: 'warn',
	integrations: [
		{
			name: 'test-probe-page',
			hooks: {
				'astro:config:setup': ({ injectRoute }) => {
					injectRoute({ pattern: probePath, entrypoint: fixture('probe-page.astro') });
					for (const page of pages) {
						const [pattern, file] = page.split('=');
						injectRoute({ pattern, entrypoint: fixture(file) });
					}
				},
			},
		},
	],
});
