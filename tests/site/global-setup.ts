// Builds the site once, with the test-only pages, and serves it once with
// `wrangler dev`, the same way Cloudflare Workers static assets will serve
// it, for all the test files of the `site` project (vitest.config.ts): two
// Astro builds of this project at the same time break each other. Also
// starts the one Chromium their browser tests use.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import type { TestProject } from 'vitest/node';
import { startWranglerDev } from '../support/wrangler-dev';
import { CONVERTED_FEED_ITEM, PROBE_PATH, WIDGETS_PATH } from './test-pages';

declare module 'vitest' {
	export interface ProvidedContext {
		/** What site.ts gives the test files. */
		site: {
			/** Origin of the server, e.g. `http://127.0.0.1:54321` (no trailing slash). */
			url: string;
			/** The build output it serves. */
			outDir: string;
			/** Where to connect to the browser (playwright's `connect()`). */
			browserEndpoint: string;
		};
	}
}

const buildScript = fileURLToPath(new URL('../support/build-site.mjs', import.meta.url));

export default async function setup(project: TestProject): Promise<() => Promise<void>> {
	const outDir = mkdtempSync(join(tmpdir(), 'aniya-moe-site-'));
	const cleanups: (() => unknown)[] = [() => rmSync(outDir, { recursive: true, force: true })];
	const teardown = async () => {
		for (const cleanup of cleanups.reverse()) await cleanup();
	};
	try {
		// Making the webp images of 769 photos takes minutes the first time;
		// later builds take them from Astro's cache (node_modules/.astro).
		execFileSync(
			process.execPath,
			[
				buildScript,
				outDir,
				PROBE_PATH,
				WIDGETS_PATH,
				// CONVERTED.md and CONVERTED.mdx.
				'/converted/[format]/=converted-content.astro',
				`${CONVERTED_FEED_ITEM}index.html=converted-feed-item.ts`,
			],
			{ stdio: 'inherit' },
		);
		const server = await startWranglerDev({ assetsDir: outDir });
		cleanups.push(() => server.stop());
		// Headless Chromium jumps where a page asks for a smooth scroll, unless
		// told not to: the 回到頂部 button's tests watch the page scroll.
		const browser = await chromium.launchServer({ args: ['--enable-smooth-scrolling'] });
		cleanups.push(() => browser.close());
		project.provide('site', { url: server.url, outDir, browserEndpoint: browser.wsEndpoint() });
	} catch (error) {
		await teardown();
		throw error;
	}
	return teardown;
}
