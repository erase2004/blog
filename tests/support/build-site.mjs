// Builds the real site (astro.config.mjs) into <outDir>, plus test-only pages:
// one at <probePath>, so URL behaviour below the root can be tested whatever
// content the site has, and the sidebar widgets at <widgetsPath>. Runs in its
// own process so Astro's Vite does not share a process with Vitest.
//
// Usage: node tests/support/build-site.mjs <outDir> <probePath> <widgetsPath> [<path>=<fixture> ...]
// Each <path>=<fixture> adds more test-only pages: <path> (with parameters,
// if the .astro page in tests/fixtures/ has getStaticPaths()).
import { build } from 'astro';
import { fileURLToPath } from 'node:url';

const [outDir, probePath, widgetsPath, ...pages] = process.argv.slice(2);
if (!outDir || !probePath || !widgetsPath) {
	throw new Error('usage: node tests/support/build-site.mjs <outDir> <probePath> <widgetsPath> [<path>=<fixture> ...]');
}

const fixture = (name) => fileURLToPath(new URL(`../fixtures/${name}`, import.meta.url));

// Build as `astro build` does. Vitest leaves its own `import.meta.env` in the
// environment (NODE_ENV and MODE `test`, PROD empty, …), which Astro would
// take for the site's: the site would be built as not for production.
for (const name of ['NODE_ENV', 'MODE', 'PROD', 'DEV', 'SSR', 'BASE_URL']) {
	delete process.env[name];
}

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
					for (const page of pages) {
						const [pattern, name] = page.split('=');
						injectRoute({ pattern, entrypoint: fixture(name) });
					}
				},
			},
		},
	],
});
