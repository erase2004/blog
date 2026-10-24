// What the test files of the `site` project share: the site global-setup.ts
// built once and serves with `wrangler dev`, and a browser to open its pages
// in.
import { type Browser, type BrowserContextOptions, chromium } from 'playwright';
import { afterAll, inject } from 'vitest';

const site = inject('site');

/** Origin of the server, e.g. `http://127.0.0.1:54321` (no trailing slash). */
export const siteUrl = site.url;

/** The build output the server serves. */
export const outDir = site.outDir;

/** What the server answers for `path`, redirects not followed. */
export function get(path: string): Promise<Response> {
	return fetch(new URL(path, siteUrl), { redirect: 'manual' });
}

// A browser, for what only a browser decides: which image of a srcset it
// loads, what JavaScript does. One Chromium for every test file (started by
// global-setup.ts), connected to when a file first needs it; each test opens
// its own context. Tests using it get more time than the default 5 seconds.
export const BROWSER_TEST_TIMEOUT = 60_000;

let connected: Promise<Browser> | undefined;

export function browser(): Promise<Browser> {
	connected ??= chromium.connect(site.browserEndpoint);
	return connected;
}

afterAll(async () => {
	// Leaves the browser running for the other files: only the connection ends.
	await (await connected)?.close();
});

/**
 * A page of the site opened in a new browser context with these options (by
 * default a 1280 × 800 window), with the JavaScript it loaded (files and
 * inline scripts). Only the site itself is reached: no YouTube thumbnails or
 * videos from R2.
 */
export async function openPage(path: string, options: BrowserContextOptions = {}) {
	const context = await (await browser()).newContext({ viewport: { width: 1280, height: 800 }, ...options });
	await context.route((url) => url.origin !== siteUrl, (route) => route.abort());
	const page = await context.newPage();
	const scriptFiles: Promise<string>[] = [];
	page.on('response', (response) => {
		if (response.request().resourceType() === 'script') scriptFiles.push(response.text());
	});
	await page.goto(new URL(path, siteUrl).href, { waitUntil: 'load' });
	return {
		context,
		page,
		scripts: async () => [...(await Promise.all(scriptFiles)), ...(await page.locator('script:not([src])').allTextContents())],
		close: () => context.close(),
	};
}
