// The images of posts and their galleries: which file of a srcset a browser
// loads, where old image URLs redirect, the lightbox.
// The site is built and served once for all the files of tests/site/
// (global-setup.ts).
import { parse } from 'node-html-parser';
import type { Page } from 'playwright';
import { describe, expect, it } from 'vitest';
import { BROWSER_TEST_TIMEOUT, get, openPage, siteUrl } from './site';

/**
 * How wide the image `selector` matches is shown on the page, in device
 * pixels, and how wide the file of its srcset the browser loaded is.
 */
async function loadedImage(page: Page, selector: string) {
	const image = page.locator(selector).first();
	await image.scrollIntoViewIfNeeded();
	await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.complete && img.currentSrc !== '')).toBe(true);
	return image.evaluate((img: HTMLImageElement) => {
		const candidates = img.srcset.split(',').map((candidate) => {
			const [url, descriptor] = candidate.trim().split(/\s+/);
			return { url: new URL(url!, document.baseURI).href, width: Number.parseInt(descriptor!, 10) };
		});
		return {
			shown: img.getBoundingClientRect().width * devicePixelRatio,
			loaded: candidates.find(({ url }) => url === img.currentSrc)!.width,
			url: img.currentSrc,
			widths: candidates.map(({ width }) => width),
		};
	});
}

describe('images', () => {
	const POST = '/2022/03/25/vue-router-named-views/';

	// Wide screens, a laptop with a high-density screen, phones.
	it.each([
		[{ width: 1920, height: 1080 }, 1],
		[{ width: 1440, height: 900 }, 1],
		[{ width: 1280, height: 800 }, 2],
		[{ width: 820, height: 1180 }, 2],
		[{ width: 390, height: 844 }, 3],
		[{ width: 360, height: 780 }, 2],
	])('in posts are webp in several widths, of which a %o screen at %ix loads one as wide as the post’s column', async (viewport, density) => {
		const { page, close } = await openPage(POST, { viewport, deviceScaleFactor: density });
		const { shown, loaded, url, widths } = await loadedImage(page, 'main img[alt="頁面預覽"]');
		await close();

		// The original is a 1280 × 960 PNG.
		expect(Math.max(...widths)).toBe(1280);
		// Browsers may settle for a file a little narrower than the image is shown.
		expect(loaded).toBeGreaterThanOrEqual(0.8 * Math.min(shown, Math.max(...widths)));
		expect(loaded).toBeLessThanOrEqual(Math.max(1.25 * shown, Math.min(...widths)));
		const response = await get(url);
		expect(response.status).toBe(200);
		expect(response.headers.get('content-type')).toBe('image/webp');
	}, BROWSER_TEST_TIMEOUT);

	// A post in Markdown, and one in MDX (it has galleries), whose images MDX makes.
	it.each([
		[POST, '頁面預覽', ['/wp-content/uploads/2022/03/preview-1.png', `${POST}preview-1/`]],
		[
			'/2025/05/17/travel-setonaikai-2025-day2/',
			'JR 四國 2700 柴聯車與其排氣管',
			['/wp-content/uploads/2025/05/20250421_070312897-scaled.jpg', '/2025/05/17/travel-setonaikai-2025-day2/20250421_070312897/'],
		],
	])('at their old URLs redirect to the image the post shows (%s)', async (path, alt, oldUrls) => {
		const img = parse(await (await get(path)).text()).querySelector(`main img[alt="${alt}"]`)!;

		for (const old of oldUrls) {
			const response = await get(old);
			expect(response.status).toBe(301);
			expect(new URL(response.headers.get('location')!, siteUrl).pathname).toBe(img.getAttribute('src'));
		}
	});
});

describe('galleries', () => {
	const DAY_2 = '/2025/05/17/travel-setonaikai-2025-day2/';

	/** The galleries of a post: for each, its photos' links. */
	async function galleries(path: string) {
		const page = parse(await (await get(path)).text());
		return page.querySelectorAll('main figure.gallery').map((gallery) => gallery.querySelectorAll('li a'));
	}

	// The photos of the 83 Envira galleries (their block JSON) and the 3 core
	// gallery blocks in the WordPress backup, by post: 514 in all.
	it.each([
		['/2025/05/17/travel-setonaikai-2025-prologue/', [2, 5]],
		['/2025/05/17/travel-setonaikai-2025-day1/', [1]],
		[DAY_2, [2, 2, 3, 5, 7, 3, 4, 3, 3, 5, 3, 4]],
		['/2025/05/17/travel-setonaikai-2025-day3/', [3, 6, 3, 3, 2]],
		['/2025/05/17/travel-setonaikai-2025-day4/', [2, 6, 6, 5, 4, 3, 5, 2, 7, 3, 3, 3, 10, 4]],
		['/2025/05/17/travel-setonaikai-2025-day5/', [39, 2, 3, 16, 2, 3, 18, 7, 3, 4, 5, 4, 3]],
		['/2025/05/17/travel-setonaikai-2025-day6/', [3, 4, 3, 7, 10, 8, 4, 2]],
		['/2025/05/17/travel-setonaikai-2025-day7/', [3, 3, 5, 39, 12, 5, 6, 4, 3, 6, 3, 3, 25, 2, 27, 11, 8, 6, 2, 2]],
		['/2025/05/17/travel-setonaikai-2025-day8/', [8, 4, 7, 4, 9, 7, 5, 6]],
		['/2025/12/05/2025-koebitai/', [3]],
		['/2026/01/23/acgn-museum-ssg/', [2]],
		['/2022/03/30/靜態網站導入-webpack-進行重構/', [2]],
	])('%s shows the photos of its galleries, as many as WordPress did', async (path, photos) => {
		expect((await galleries(path)).map((links) => links.length)).toEqual(photos);
	});

	it('link each photo to the photo at full size, where its old URL redirects', async () => {
		const [first] = await galleries(DAY_2);
		const old = await get('/wp-content/uploads/2025/05/20250421_081608666-scaled.jpg');

		expect(old.status).toBe(301);
		expect(first![0]!.getAttribute('href')).toBe(new URL(old.headers.get('location')!, siteUrl).pathname);
	});

	it('open a photo in a lightbox, which goes to the next and previous photo, shows captions, and closes', async () => {
		const { page, close } = await openPage(DAY_2);
		const first = page.locator('main figure.gallery').first().locator('a').first();
		const caption = () => page.locator('.pswp .pswp__caption').textContent();

		await first.click();
		await expect.poll(caption).toBe('店家外面的照片');
		// The photo itself, at full size or the lightbox's smaller size.
		const href = (await first.getAttribute('href'))!;
		const photos = page.locator('.pswp img.pswp__img');
		const showsPhoto = () =>
			photos.evaluateAll((images: HTMLImageElement[], url) => images.some((img) => img.currentSrc !== '' && (img.srcset.includes(url) || img.src.endsWith(url))), href);
		await expect.poll(showsPhoto).toBe(true);
		await page.keyboard.press('ArrowRight');
		await expect.poll(caption).toBe('店家內部的照片，可以看到有 Summer Pockets 的週邊與繪圖');
		await page.keyboard.press('ArrowLeft');
		await expect.poll(caption).toBe('店家外面的照片');
		await page.keyboard.press('Escape');
		await expect.poll(() => page.locator('.pswp').count()).toBe(0);
		await close();
	}, BROWSER_TEST_TIMEOUT);

	it('load their JavaScript only on pages with a gallery', async () => {
		const scriptsOf = async (path: string) => {
			const { scripts, close } = await openPage(path);
			const loaded = await scripts();
			await close();
			return loaded;
		};
		const lightbox = (scripts: string[]) => scripts.some((script) => script.includes('pswp'));

		expect(lightbox(await scriptsOf(DAY_2))).toBe(true);
		expect(lightbox(await scriptsOf('/2022/03/25/vue-router-named-views/'))).toBe(false);
	}, BROWSER_TEST_TIMEOUT);

	it.each([
		[{ width: 1440, height: 900 }, 1],
		[{ width: 390, height: 844 }, 3],
	])('show small images of the photos on a %o screen at %ix, not the photos at full size', async (viewport, density) => {
		const { page, close } = await openPage(DAY_2, { viewport, deviceScaleFactor: density });
		const { shown, loaded } = await loadedImage(page, 'main figure.gallery img');
		await close();

		// The photo is 2560 × 1920.
		expect(loaded).toBeLessThanOrEqual(2 * shown);
		expect(loaded).toBeGreaterThanOrEqual(0.6 * shown);
	}, BROWSER_TEST_TIMEOUT);
});
