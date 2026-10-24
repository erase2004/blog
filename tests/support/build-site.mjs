// Builds the real site (astro.config.mjs) into the directory given as the
// first argument. Runs in its own process so Astro's Vite does not share a
// process with Vitest.
//
// Usage: node tests/support/build-site.mjs <outDir>
import { build } from 'astro';
import { fileURLToPath } from 'node:url';

const [outDir] = process.argv.slice(2);
if (!outDir) {
	throw new Error('usage: node tests/support/build-site.mjs <outDir>');
}

await build({
	root: fileURLToPath(new URL('../../', import.meta.url)),
	outDir,
	logLevel: 'warn',
});
