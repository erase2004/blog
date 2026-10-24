// Builds the site and serves it with `wrangler dev`, the same way Cloudflare
// Workers static assets will serve it, then checks what readers and crawlers
// get back over HTTP.
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'node-html-parser';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startWranglerDev, type WranglerDev } from './support/wrangler-dev';

const buildScript = fileURLToPath(new URL('./support/build-site.mjs', import.meta.url));
const urlChecker = fileURLToPath(new URL('../scripts/check-urls.ts', import.meta.url));

// A test-only page the build script adds next to the site's real pages.
const PROBE_PATH = '/probe/';

let outDir: string;
let server: WranglerDev | undefined;

beforeAll(async () => {
	outDir = mkdtempSync(join(tmpdir(), 'aniya-moe-site-'));
	execFileSync(process.execPath, [buildScript, outDir, PROBE_PATH], { stdio: 'inherit' });
	server = await startWranglerDev({ assetsDir: outDir });
	// Making the webp images of 769 photos takes minutes the first time;
	// later builds take them from Astro's cache (node_modules/.astro).
}, 600_000);

afterAll(async () => {
	await server?.stop();
	rmSync(outDir, { recursive: true, force: true });
});

function get(path: string): Promise<Response> {
	return fetch(new URL(path, server!.url), { redirect: 'manual' });
}

describe('build output', () => {
	it('writes each page as <path>/index.html', () => {
		expect(existsSync(join(outDir, 'probe', 'index.html'))).toBe(true);
	});
});

describe('trailing slash', () => {
	it('page URLs without the trailing slash are 301-redirected to the slashed URL', async () => {
		const response = await get(PROBE_PATH.slice(0, -1));

		expect(response.status).toBe(301);
		expect(new URL(response.headers.get('location')!, server!.url).pathname).toBe(PROBE_PATH);
	});

	it('page URLs with the trailing slash are served directly', async () => {
		const response = await get(PROBE_PATH);

		expect(response.status).toBe(200);
	});

	it('_redirects only adds the trailing slash for URLs that are pages', () => {
		const addsSlash = readFileSync(join(outDir, '_redirects'), 'utf8')
			.split('\n')
			.map((line) => line.trim().split(/\s+/))
			.filter(([from, to]) => from !== undefined && to === `${from}/`);

		const targetsWithoutPage = addsSlash
			.map(([, to]) => to!)
			.filter((to) => !existsSync(join(outDir, decodeURI(to), 'index.html')));
		expect(addsSlash.length).toBeGreaterThan(0);
		expect(targetsWithoutPage).toEqual([]);
	});
});

describe('unknown URLs', () => {
	it('answer with HTTP 404 and the 404 page', async () => {
		const response = await get('/no-such-page/');

		expect(response.status).toBe(404);
		expect(await response.text()).toBe(readFileSync(join(outDir, '404.html'), 'utf8'));
	});
});

describe('images', () => {
	const POST = '/2022/03/25/vue-router-named-views/';

	/** The image a browser loads for a srcset/sizes image on a screen this wide, at this pixel density (HTML's selection, simplified). */
	function chosenImage(img: ReturnType<typeof parse>, screenWidth: number, density: number): string {
		const candidates = img
			.getAttribute('srcset')!
			.split(',')
			.map((candidate) => candidate.trim().split(/\s+/))
			.map(([url, descriptor]) => ({ url: url!, width: Number.parseInt(descriptor!, 10) }))
			.sort((a, b) => a.width - b.width);
		// `(min-width: Wpx) Wpx, 100vw`: on a narrower screen the image is as wide as the screen.
		const [, maxWidth] = /\(min-width: (\d+)px\)/.exec(img.getAttribute('sizes')!)!;
		const slotWidth = Math.min(screenWidth, Number(maxWidth));
		return (candidates.find(({ width }) => width >= slotWidth * density) ?? candidates.at(-1)!).url;
	}

	it('in posts are webp in several widths, so that a phone loads one as wide as its screen', async () => {
		const img = parse(await (await get(POST)).text()).querySelector('img[alt="頁面預覽"]')!;
		const onPhone = chosenImage(img, 390, 2);
		const onDesktop = chosenImage(img, 1920, 1);

		// The original is a 1280 × 960 PNG.
		expect(img.getAttribute('width')).toBe('1280');
		expect(onPhone).not.toBe(onDesktop);
		for (const url of [onPhone, onDesktop]) {
			const response = await get(url);
			expect(response.status).toBe(200);
			expect(response.headers.get('content-type')).toBe('image/webp');
		}
		const phoneImage = await (await get(onPhone)).arrayBuffer();
		const desktopImage = await (await get(onDesktop)).arrayBuffer();
		expect(phoneImage.byteLength).toBeLessThan(desktopImage.byteLength / 2);
	});

	it('at their old URLs redirect to the image the post shows', async () => {
		const img = parse(await (await get(POST)).text()).querySelector('img[alt="頁面預覽"]')!;

		for (const old of ['/wp-content/uploads/2022/03/preview-1.png', `${POST}preview-1/`]) {
			const response = await get(old);
			expect(response.status).toBe(301);
			expect(new URL(response.headers.get('location')!, server!.url).pathname).toBe(img.getAttribute('src'));
		}
	});
});

describe('the URL checker', () => {
	// The committed pending list must name exactly the expected URLs this
	// build does not answer correctly yet, in both modes.
	function runUrlChecker(...args: string[]) {
		const { status, stdout, stderr } = spawnSync(process.execPath, [urlChecker, ...args], {
			encoding: 'utf8',
		});
		return { status, output: stdout + stderr };
	}

	it('passes on the build output', () => {
		expect(runUrlChecker('build', outDir)).toMatchObject({ status: 0 });
	}, 60_000);

	it('passes over HTTP', () => {
		expect(runUrlChecker('http', server!.url)).toMatchObject({ status: 0 });
	}, 120_000);
});
