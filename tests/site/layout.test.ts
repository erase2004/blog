// What every page has around its content: the site header and menu, the
// sidebar, the footer, the 回到頂部 button.
// The site is built and served once for all the files of tests/site/
// (global-setup.ts).
import { readdirSync } from 'node:fs';
import { parse } from 'node-html-parser';
import type { BrowserContextOptions, Page } from 'playwright';
import { afterEach, describe, expect, it } from 'vitest';
import { get, openPage, outDir, siteUrl } from './site';

describe('layout', () => {
	// One page of each kind the layout wraps: home, home page 2, post, page,
	// category, tag and date archives, and the 404 page.
	const PAGES = [
		'/',
		'/page/2/',
		'/2021/11/30/電子紙閱讀器使用心得/',
		'/about/contact/',
		'/category/技術/',
		'/tag/vue/',
		'/2025/05/',
		'/no-such-page/',
	];

	async function html(path: string) {
		return parse(await (await get(path)).text());
	}

	/** The site header: the page's `header` outside `main`. */
	function siteHeader(page: ReturnType<typeof parse>) {
		return page.querySelectorAll('header').find((header) => !header.closest('main'));
	}

	it.each(PAGES)('%s has the site name, linking to the home page, and the tagline in the site header', async (path) => {
		const header = siteHeader(await html(path));

		const home = header?.querySelector('a[href="/"]');
		expect(home?.text.trim()).toBe('TsukiStudio');
		expect(header?.text).toContain('生活點滴紀錄');
	});

	// The WordPress menu (aniya.moe, 2026-10-24): 首頁, 關於我 (with 我的故事 and
	// 聯絡方式 under it), 訂閱, 隱私權政策.
	it.each(PAGES)('%s has the six links of the WordPress menu, in its order, in the site header', async (path) => {
		const links = siteHeader(await html(path))
			?.querySelectorAll('nav a')
			.map((link) => [link.text.trim(), decodeURI(link.getAttribute('href')!)]);

		expect(links).toEqual([
			['首頁', '/'],
			['關於我', '/about/'],
			['我的故事', '/about/autobiography/'],
			['聯絡方式', '/about/contact/'],
			['訂閱', '/subscribe/'],
			['隱私權政策', '/policy/'],
		]);
	});

	it('the menu marks the link to the page being read', async () => {
		const current = async (path: string) =>
			siteHeader(await html(path))
				?.querySelectorAll('nav a[aria-current="page"]')
				.map((link) => link.text.trim());

		expect(await current('/')).toEqual(['首頁']);
		expect(await current('/about/contact/')).toEqual(['聯絡方式']);
		expect(await current('/page/2/')).toEqual([]);
		expect(await current('/2021/11/30/電子紙閱讀器使用心得/')).toEqual([]);
	});

	// As in the WordPress sidebar: categories, then years, then the tag cloud.
	it.each(PAGES)('%s has the sidebar, beside the main column, with the categories, years and tag cloud', async (path) => {
		const page = await html(path);
		const sidebar = page.querySelector('aside');
		const linksUnder = (heading: string) =>
			sidebar
				?.querySelectorAll('section')
				.find((section) => section.querySelector('h2')?.text.trim() === heading)
				?.querySelectorAll('a')
				.map((link) => decodeURI(link.getAttribute('href')!));

		expect(page.querySelector('main')).not.toBeNull();
		expect(sidebar?.closest('main')).toBeFalsy();
		const headings = sidebar?.querySelectorAll('h2').map((heading) => heading.text.trim());
		expect(headings?.filter((heading) => ['分類', '年份', '標籤'].includes(heading))).toEqual(['分類', '年份', '標籤']);
		expect(linksUnder('分類')).toEqual(['/category/技術/', '/category/旅遊/', '/category/閒聊/']);
		expect(linksUnder('年份')).toEqual(['/2026/', '/2025/', '/2022/', '/2021/']);
		expect(linksUnder('標籤')).toHaveLength(57);
	});

	// As in the WordPress sidebar, the search box comes first.
	it.each(PAGES)('%s has the search box first in the sidebar', async (path) => {
		const first = (await html(path)).querySelector('aside section');

		expect(first?.querySelector('h2')?.text.trim()).toBe('搜尋');
		expect(first?.querySelector('pagefind-searchbox')).not.toBeNull();
	});

	it.each(PAGES)('%s has the site footer, with the hidden rel="me" link that verifies the Mastodon account', async (path) => {
		const footer = (await html(path)).querySelectorAll('footer').find((element) => !element.closest('main'));
		const mastodon = footer?.querySelector('a[href="https://g0v.social/@erase2004"]');

		expect(footer?.text).toContain('TsukiStudio');
		// As on the WordPress site: in the HTML, for Mastodon's profile link
		// verification, but not shown, focused or read out.
		expect(mastodon?.getAttribute('rel')?.split(/\s+/)).toContain('me');
		expect(mastodon?.hasAttribute('hidden')).toBe(true);
	});

	it.each(PAGES)('%s has a 回到頂部 button', async (path) => {
		const buttons = (await html(path))
			.querySelectorAll('button')
			.filter((button) => (button.getAttribute('aria-label') ?? button.text).trim() === '回到頂部');

		expect(buttons).toHaveLength(1);
		expect(buttons[0].getAttribute('type')).toBe('button');
	});

	describe('a post', () => {
		/** Each date the post shows, by its label: the text and the instant of its `<time>`. */
		async function postDates(path: string) {
			const article = (await html(path)).querySelector('main article');
			return Object.fromEntries(
				article!.querySelectorAll('dt').map((term) => {
					const time = term.nextElementSibling?.querySelector('time');
					return [
						term.text.trim(),
						{ text: time?.text.trim(), instant: new Date(time?.getAttribute('datetime') ?? NaN).toISOString() },
					];
				}),
			);
		}

		// Expected values: post_date and post_modified in the WordPress database
		// (Asia/Taipei), in its date_format `Y 年 n 月 j 日`.
		it('shows when it was published and last updated', async () => {
			expect(await postDates('/2021/11/30/電子紙閱讀器使用心得/')).toEqual({
				發布日期: { text: '2021 年 11 月 30 日', instant: '2021-11-30T08:46:07.000Z' },
				最後更新: { text: '2022 年 4 月 6 日', instant: '2022-04-06T05:46:11.000Z' },
			});
		});

		it('shows dates in Taipei time', async () => {
			// Updated 2025-03-26 00:42 in Taipei: still the 25th in UTC.
			expect(await postDates('/2025/03/25/next-js-app-route-and-cloud-cdn-cache/')).toMatchObject({
				最後更新: { text: '2025 年 3 月 26 日', instant: '2025-03-25T16:42:18.000Z' },
			});
		});

		it('scheduled, and last edited before it went out, shows its publish date as the last update', async () => {
			// Edited 2025-05-16 20:19, published 2025-05-17 09:30.
			expect(await postDates('/2025/05/17/travel-setonaikai-2025-day1/')).toEqual({
				發布日期: { text: '2025 年 5 月 17 日', instant: '2025-05-17T01:30:00.000Z' },
				最後更新: { text: '2025 年 5 月 17 日', instant: '2025-05-17T01:30:00.000Z' },
			});
		});
	});

	describe('on a phone', () => {
		// WCAG's reflow width: content fits 320 CSS pixels without scrolling sideways.
		const PHONE = { width: 320, height: 640 };

		/** Every post, as UTF-8 paths, from the build output. */
		function postPaths(): string[] {
			return readdirSync(outDir, { recursive: true, encoding: 'utf8' })
				.map((file) => file.replaceAll('\\', '/'))
				.filter((file) => /^\d{4}\/\d{2}\/\d{2}\/[^/]+\/index\.html$/.test(file))
				.map((file) => `/${file.slice(0, -'index.html'.length)}`);
		}

		it('no page scrolls sideways: every post and page, and each kind of listing', async () => {
			const posts = postPaths();
			expect(posts).toHaveLength(22);
			const paths = [
				...['/', '/page/2/', '/category/旅遊/', '/tag/vue/', '/2025/', '/2025/05/17/', '/no-such-page/'],
				...['/about/', '/about/autobiography/', '/about/contact/', '/subscribe/', '/policy/'],
				...posts,
			];
			const { page, close } = await openPage(paths[0]!, { viewport: PHONE });

			const overflowing: Record<string, unknown> = {};
			for (const path of paths) {
				await page.goto(new URL(path, siteUrl).href, { waitUntil: 'load' });
				const overflow = await page.evaluate(() => {
					const width = document.documentElement.clientWidth;
					if (document.documentElement.scrollWidth <= width) return null;
					// The innermost elements that reach past the right edge, to say what to
					// fix; not those inside something that scrolls or clips them.
					const clipped = (element: Element) => {
						for (let parent = element.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
							if (getComputedStyle(parent).overflowX !== 'visible') return true;
						}
						return false;
					};
					const wide = [...document.body.querySelectorAll('*')].filter(
						(element) => element.getBoundingClientRect().right > width + 1 && !clipped(element),
					);
					const innermost = wide.filter((element) => !wide.some((other) => other !== element && element.contains(other)));
					return {
						scrollWidth: document.documentElement.scrollWidth,
						elements: innermost.slice(0, 5).map((element) => element.outerHTML.slice(0, 120)),
					};
				});
				if (overflow) overflowing[path] = overflow;
			}
			await close();

			expect(overflowing).toEqual({});
		}, 120_000);
	});

	describe('the 回到頂部 button', () => {
		const LONG_POST = '/2021/11/30/電子紙閱讀器使用心得/';
		const DESKTOP = { width: 1280, height: 720 };

		let close: (() => Promise<void>) | undefined;

		afterEach(async () => {
			await close?.();
		});

		/** The long post, in a fresh browser tab with these options. */
		async function openLongPost(options: BrowserContextOptions = {}) {
			const opened = await openPage(LONG_POST, { viewport: DESKTOP, ...options });
			close = opened.close;
			return { page: opened.page, button: opened.page.getByRole('button', { name: '回到頂部' }) };
		}

		/** Lets the page react to what just happened: scroll events come with the next frame. */
		async function settle(page: Page) {
			await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
		}

		/** Scrolls to `screens` screen heights down the page, and lets the page react. */
		async function scrollDown(page: Page, screens: number) {
			await page.evaluate((screens) => window.scrollTo({ top: screens * window.innerHeight, behavior: 'instant' }), screens);
			await settle(page);
		}

		/**
		 * Clicks the button; where the page was, and where it scrolls through
		 * until it is back at the top. Followed from the click on: before it,
		 * the page may still move a little (as images load, say).
		 */
		async function clickAndFollowTheScroll(page: Page) {
			type Followed = { from: number; positions: number[] };
			await page.evaluate(() => {
				const followed: Followed = { from: Number.NaN, positions: [] };
				Object.assign(window, { followed });
				// Capturing, so before the button's own click handler starts the scroll.
				addEventListener(
					'click',
					() => {
						followed.from = window.scrollY;
						addEventListener('scroll', () => followed.positions.push(window.scrollY));
					},
					{ capture: true, once: true },
				);
			});
			await page.getByRole('button', { name: '回到頂部' }).click();
			await page.waitForFunction(() => window.scrollY === 0, undefined, { timeout: 5_000 });
			// A jump is at the top at once, but its scroll event comes with the next frame.
			await settle(page);
			return page.evaluate(() => (window as unknown as { followed: Followed }).followed);
		}

		/** Whether the element `locator` finds has the keyboard focus. */
		const isFocused = (locator: ReturnType<Page['locator']>) =>
			locator.evaluate((element) => element === document.activeElement);

		/** WCAG 2's contrast ratio between two `rgb(r, g, b)` colours. */
		function contrast(...colours: string[]) {
			const luminance = (colour: string) => {
				const [r, g, b] = colour.match(/\d+(\.\d+)?/g)!.slice(0, 3).map((value) => {
					const channel = Number(value) / 255;
					return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
				});
				return 0.2126 * r + 0.7152 * g + 0.0722 * b;
			};
			const [lighter, darker] = colours.map(luminance).sort((a, b) => b - a);
			return (lighter + 0.05) / (darker + 0.05);
		}

		it('is hidden at the top of the page, and shows once the reader has scrolled down more than a screen', async () => {
			const { page, button } = await openLongPost();

			expect(await button.isVisible()).toBe(false);
			await scrollDown(page, 0.5);
			expect(await button.isVisible()).toBe(false);
			await scrollDown(page, 1.5);
			expect(await button.isVisible()).toBe(true);
			await scrollDown(page, 0);
			expect(await button.isVisible()).toBe(false);
		}, 30_000);

		it('never shows without JavaScript, which it needs to work', async () => {
			const { page, button } = await openLongPost({ javaScriptEnabled: false });

			// No animation frames to wait for: without JavaScript the page runs none.
			const scrolled = await page.evaluate(() => {
				window.scrollTo({ top: 3 * window.innerHeight, behavior: 'instant' });
				return window.scrollY;
			});

			expect(scrolled).toBeGreaterThan(2 * DESKTOP.height);
			expect(await button.isVisible()).toBe(false);
		}, 30_000);

		it('sits at the bottom right of the screen: a white arrow on the frame colour, #1a1a1a', async () => {
			const { page, button } = await openLongPost();
			await scrollDown(page, 3);

			const box = (await button.boundingBox())!;
			expect(DESKTOP.width - (box.x + box.width)).toBeLessThanOrEqual(32);
			expect(DESKTOP.height - (box.y + box.height)).toBeLessThanOrEqual(32);
			// Big enough to hit with a finger (WCAG 2.5.5's 44px).
			expect(box.width).toBeGreaterThanOrEqual(44);
			expect(box.height).toBeGreaterThanOrEqual(44);
			const colours = await button.evaluate((element) => ({
				background: getComputedStyle(element).backgroundColor,
				arrow: getComputedStyle(element.querySelector('svg path')!).stroke,
			}));
			expect(colours).toEqual({ background: 'rgb(26, 26, 26)', arrow: 'rgb(255, 255, 255)' });
			// WCAG AA, even held to the 4.5:1 of text.
			expect(contrast(colours.background, colours.arrow)).toBeGreaterThanOrEqual(4.5);
		}, 30_000);

		it('is reached with Tab after the sidebar, shows a clear focus ring, and works with Enter', async () => {
			const { page, button } = await openLongPost();
			await page.locator('aside a').last().focus();
			await settle(page);

			await page.keyboard.press('Tab');

			expect(await isFocused(button)).toBe(true);
			const ring = await button.evaluate((element) => {
				const style = getComputedStyle(element);
				return { style: style.outlineStyle, width: parseFloat(style.outlineWidth), colour: style.outlineColor };
			});
			expect(ring.style).toBe('solid');
			expect(ring.width).toBeGreaterThanOrEqual(2);
			// WCAG's 3:1 for focus indicators, on the white page and on the dark frame.
			expect(contrast(ring.colour, 'rgb(255, 255, 255)')).toBeGreaterThanOrEqual(3);
			expect(contrast(ring.colour, 'rgb(26, 26, 26)')).toBeGreaterThanOrEqual(3);
			await page.keyboard.press('Enter');
			await page.waitForFunction(() => window.scrollY === 0, undefined, { timeout: 5_000 });
		}, 30_000);

		it('scrolls smoothly back to the top when clicked', async () => {
			const { page } = await openLongPost();
			await scrollDown(page, 3);

			const { from, positions } = await clickAndFollowTheScroll(page);

			// On the way up, not straight there.
			expect(from).toBeGreaterThan(2 * DESKTOP.height);
			expect(positions.filter((y) => y > 0 && y < from).length).toBeGreaterThan(1);
		}, 30_000);

		it('jumps straight to the top for readers who ask for reduced motion', async () => {
			const { page } = await openLongPost({ reducedMotion: 'reduce' });
			await scrollDown(page, 3);

			const { positions } = await clickAndFollowTheScroll(page);

			expect(positions).toEqual([0]);
		}, 30_000);

		it('moves the keyboard focus to the start of the page at once: Tab goes on from there', async () => {
			const { page, button } = await openLongPost();
			await scrollDown(page, 3);
			await button.focus();
			await settle(page);
			// Where the focus is when the page starts to move, while the button is
			// still shown: not left on the button, to be lost when it hides.
			await page.evaluate(() => {
				const focusWhenMoving = new Promise((done) =>
					addEventListener('scroll', () => done(document.activeElement?.tagName), { once: true }),
				);
				Object.assign(window, { focusWhenMoving });
			});

			await page.keyboard.press('Enter');
			await page.waitForFunction(() => window.scrollY === 0, undefined, { timeout: 5_000 });

			expect(await page.evaluate(() => (window as unknown as { focusWhenMoving: Promise<string> }).focusWhenMoving)).toBe(
				'BODY',
			);
			await page.keyboard.press('Tab');
			// The first thing on the page to Tab to.
			expect(await isFocused(page.getByRole('link', { name: '跳到主要內容' }))).toBe(true);
		}, 30_000);

		describe('on a phone', () => {
			const PHONE = { width: 320, height: 640 };

			/** What the button covers: the text and the things to click or watch under it. */
			async function coveredByTheButton(page: Page) {
				return page.evaluate(() => {
					const button = document.querySelector('button[aria-label="回到頂部"]')!.getBoundingClientRect();
					const overlaps = (rect: DOMRect) =>
						rect.width > 0 &&
						rect.height > 0 &&
						rect.left < button.right &&
						rect.right > button.left &&
						rect.top < button.bottom &&
						rect.bottom > button.top;
					const covered: string[] = [];
					const texts = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
					for (let text = texts.nextNode(); text; text = texts.nextNode()) {
						if (!text.textContent!.trim()) continue;
						const range = document.createRange();
						range.selectNodeContents(text);
						if ([...range.getClientRects()].some(overlaps)) covered.push(`text: ${text.textContent!.trim().slice(0, 40)}`);
					}
					for (const element of document.querySelectorAll('a, button, input, select, textarea, iframe, img, video')) {
						if (element.closest('button[aria-label="回到頂部"]')) continue;
						if (overlaps(element.getBoundingClientRect())) covered.push(element.outerHTML.slice(0, 80));
					}
					return covered;
				});
			}

			it('at the end of the page, covers no text or link, and does not make the page scroll sideways', async () => {
				const { page, button } = await openLongPost({ viewport: PHONE });
				await page.evaluate(() =>
					window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }),
				);
				await settle(page);

				expect(await button.isVisible()).toBe(true);
				expect(await coveredByTheButton(page)).toEqual([]);
				expect(
					await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth),
				).toBeLessThanOrEqual(0);
			}, 30_000);

			// WCAG 2.4.11: what has the keyboard focus is not hidden under it.
			it('never covers the link being Tabbed to', async () => {
				const { page } = await openLongPost({ viewport: PHONE });

				// Tab through the page, from the top to the button.
				const covered: string[] = [];
				let reachedTheButton = false;
				for (let presses = 0; presses < 300 && !reachedTheButton; presses++) {
					await page.keyboard.press('Tab');
					await settle(page);
					const focus = await page.evaluate(() => {
						const focused = document.activeElement!;
						const button = document.querySelector<HTMLButtonElement>('button[aria-label="回到頂部"]')!;
						if (focused === button) return { onTheButton: true };
						if (button.hidden) return { onTheButton: false };
						const [a, b] = [focused.getBoundingClientRect(), button.getBoundingClientRect()];
						const overlaps = a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
						return { onTheButton: false, covered: overlaps ? focused.outerHTML.slice(0, 80) : undefined };
					});
					reachedTheButton = focus.onTheButton;
					if (focus.covered) covered.push(focus.covered);
				}

				expect(reachedTheButton).toBe(true);
				expect(covered).toEqual([]);
			}, 60_000);
		});
	});
});
