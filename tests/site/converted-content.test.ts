// What readers get for what the WordPress converter writes: code blocks,
// footnotes, YouTube embeds, before/after sliders.
// The site is built and served once for all the files of tests/site/
// (global-setup.ts).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'node-html-parser';
import type { BrowserContextOptions, Locator } from 'playwright';
import { describe, expect, it } from 'vitest';
import { oldUrlMap } from '../../src/lib/old-url-map';
import { get, openPage, outDir, siteUrl } from './site';
import { CONVERTED } from './test-pages';

describe('converted content', () => {
	/** A built page; <pre> is parsed as elements too (Expressive Code puts its lines in it). */
	const page = (path: string) =>
		parse(readFileSync(join(outDir, path, 'index.html'), 'utf8'), { blockTextElements: { script: true, style: true } });

	describe('code blocks', () => {
		it.each(Object.entries(CONVERTED))('in %s are highlighted by Expressive Code, titled with their file name', (_, path) => {
			const block = page(path).querySelector('.expressive-code');

			expect(block?.querySelector('figcaption .title')?.text).toBe('src/router/index.js');
			expect(block?.querySelector('pre')?.getAttribute('data-language')).toBe('javascript');
			expect(block?.querySelectorAll('pre code span[style]').length).toBeGreaterThan(0);
		});

		it('have a copy button that speaks Chinese', () => {
			const button = page(CONVERTED.md).querySelector('.expressive-code .copy button');

			expect(button?.getAttribute('title')).toBe('複製到剪貼簿');
			expect(button?.getAttribute('data-copied')).toBe('已複製！');
		});
	});

	describe('footnotes', () => {
		it.each(Object.entries(CONVERTED))('in %s link to their texts, which link back', (_, path) => {
			const html = page(path);
			const reference = html.querySelector('a[data-footnote-ref]');

			expect(reference?.text).toBe('1');
			expect(reference?.getAttribute('href')).toBe('#user-content-fn-1');
			const backReference = html.getElementById('user-content-fn-1')?.querySelector('a[data-footnote-backref]');
			expect(backReference?.getAttribute('href')).toBe(`#${reference?.id}`);
			expect(backReference?.getAttribute('aria-label')).toBe('回到內文的註腳 1');
		});

		it('are listed under a heading in Chinese, for screen readers', () => {
			const heading = page(CONVERTED.md).getElementById('footnote-label');

			expect(heading?.text).toBe('註腳');
			expect(heading?.classList.contains('sr-only')).toBe(true);
		});
	});

	describe('YouTube embeds', () => {
		it('show the thumbnail, linked to the video, and no player until clicked', () => {
			const html = page(CONVERTED.mdx);
			const link = html.querySelector('a[href="https://www.youtube.com/watch?v=x3_Pcru8SS8"]');

			expect(link?.querySelector('img')?.getAttribute('src')).toBe('https://i.ytimg.com/vi/x3_Pcru8SS8/hqdefault.jpg');
			expect(link?.text).toContain('TVアニメ『Summer Pockets』第1弾PV');
			expect(html.querySelectorAll('iframe')).toHaveLength(0);
		});
	});

	describe('before/after sliders', () => {
		it('show the before image left of the divider and the after image right of it, as webp in several widths, with their caption', () => {
			const figure = page(CONVERTED.mdx).querySelector('img-comparison-slider')?.closest('figure');
			const image = (slot: string) => figure?.querySelector(`img-comparison-slider [slot="${slot}"] img`);

			expect(image('first')?.getAttribute('src')).toMatch(/\/ydmk705\.[^/]+\.webp$/);
			expect(image('second')?.getAttribute('src')).toMatch(/\/pi_20250421_063159\.[^/]+\.webp$/);
			for (const slot of ['first', 'second']) {
				expect(image(slot)?.getAttribute('srcset')?.split(',').length).toBeGreaterThan(1);
			}
			expect(figure?.querySelector('figcaption')?.text).toBe('結城友奈は勇者である中出現的公車站');
			expect(figure?.querySelector('figcaption a')?.getAttribute('href')).toBe('https://yuyuyu.tv/season1/');
		});

		// The sliders in the WordPress backup: jetpack/image-compare blocks, plus
		// the copies of their markup pasted as Custom HTML (wp:html) blocks.
		const SLIDERS: [string, number][] = [
			['/2025/05/17/travel-setonaikai-2025-day2/', 6 + 0],
			['/2025/05/17/travel-setonaikai-2025-day3/', 7 + 2],
			['/2025/05/17/travel-setonaikai-2025-day4/', 11 + 2],
			['/2025/05/17/travel-setonaikai-2025-day5/', 17 + 2],
			['/2025/05/17/travel-setonaikai-2025-day6/', 12 + 0],
			['/2025/05/17/travel-setonaikai-2025-day8/', 19 + 2],
		];

		it.each(SLIDERS)('%s has the %i sliders it had on WordPress', (path, sliders) => {
			const html = page(path);

			expect(html.querySelectorAll('main img-comparison-slider')).toHaveLength(sliders);
			expect(html.querySelectorAll('main img-comparison-slider [slot] img')).toHaveLength(2 * sliders);
		});

		// An old image URL redirects to the image at full size; the sliders show
		// that file, not another copy of the photo made just for them.
		it('show each image at full size as the file its old URLs redirect to', async () => {
			const path = (url: string) => new URL(url, siteUrl).pathname;
			const targets = new Set<string>();
			const olds = oldUrlMap.images.map(({ uploads }) => uploads[0]!);
			while (olds.length > 0) {
				await Promise.all(
					olds.splice(0, 20).map(async (old) => {
						const response = await get(old);
						expect(response.status, old).toBe(301);
						targets.add(path(response.headers.get('location')!));
					}),
				);
			}

			const shown = new Set<string>();
			const problems: Record<string, string> = {};
			for (const [post] of SLIDERS) {
				for (const img of page(post).querySelectorAll('main img-comparison-slider [slot] img')) {
					const src = path(img.getAttribute('src')!);
					const [widest] = img
						.getAttribute('srcset')!
						.split(',')
						.map((candidate) => candidate.trim().split(/\s+/))
						.sort(([, a], [, b]) => Number.parseInt(b!, 10) - Number.parseInt(a!, 10));
					shown.add(src);
					if (path(widest![0]!) !== src) problems[decodeURI(src)] = `the widest in its srcset is ${widest![0]}`;
					else if (!targets.has(src)) problems[decodeURI(src)] = 'no old URL redirects to it';
				}
			}

			expect(problems).toEqual({});
			expect(shown.size).toBe(151);
		}, 60_000);

		describe('in a browser', () => {
			/** A page with the slider in view, once its script has run. */
			async function openSlider(options: BrowserContextOptions = {}) {
				const { context, page } = await openPage(CONVERTED.mdx, options);
				const slider = page.locator('img-comparison-slider');
				await slider.scrollIntoViewIfNeeded();
				await expect.poll(() => slider.evaluate((element) => element.classList.contains('rendered'))).toBe(true);
				return { context, page, slider, box: (await slider.boundingBox())! };
			}

			/** Where the divider is, in percent of the slider's width from its left edge. */
			const dividerAt = async (slider: Locator) =>
				Math.round(await slider.evaluate((element) => (element as HTMLElement & { value: number }).value));

			it('the divider starts in the middle and follows the mouse when dragged', async () => {
				const { context, page, slider, box } = await openSlider();
				const y = box.y + box.height / 2;

				expect(await dividerAt(slider)).toBe(50);
				await page.mouse.move(box.x + box.width / 2, y);
				await page.mouse.down();
				await page.mouse.move(box.x + box.width / 4, y, { steps: 5 });
				await page.mouse.up();

				expect(await dividerAt(slider)).toBe(25);
				await context.close();
			});

			it('the divider follows a finger dragging it sideways on a phone', async () => {
				const { context, page, slider, box } = await openSlider({ viewport: { width: 390, height: 844 }, hasTouch: true });
				const cdp = await context.newCDPSession(page);
				const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', x?: number) =>
					cdp.send('Input.dispatchTouchEvent', {
						type,
						touchPoints: x === undefined ? [] : [{ x, y: box.y + box.height / 2 }],
					});

				await touch('touchStart', box.x + box.width / 2);
				for (const at of [0.55, 0.6, 0.65, 0.7, 0.75]) await touch('touchMove', box.x + box.width * at);
				await touch('touchEnd');

				expect(await dividerAt(slider)).toBe(75);
				await context.close();
			});

			it('load their script only on pages that have a slider', async () => {
				const { page, close } = await openPage(CONVERTED.mdx);
				const sliderScriptRan = async (path: string) => {
					await page.goto(new URL(path, siteUrl).href, { waitUntil: 'load' });
					return page.evaluate(() => customElements.get('img-comparison-slider') !== undefined);
				};

				expect(await sliderScriptRan(CONVERTED.mdx)).toBe(true);
				expect(await sliderScriptRan('/2025/05/17/travel-setonaikai-2025-day2/')).toBe(true);
				expect(await sliderScriptRan(CONVERTED.md)).toBe(false);
				expect(await sliderScriptRan('/2025/05/17/travel-setonaikai-2025-day1/')).toBe(false);
				expect(await sliderScriptRan('/2021/11/30/電子紙閱讀器使用心得/')).toBe(false);
				await close();
			});
		});
	});
});
