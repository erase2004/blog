// Searching the site: the Pagefind index and the search boxes.
// The site is built and served once for all the files of tests/site/
// (global-setup.ts).
import type { Page } from 'playwright';
import { describe, expect, it } from 'vitest';
import { get, openPage } from './site';

describe('search', () => {
	/** Opens the home page in the browser and runs `use` on it. */
	async function onHomePage<T>(use: (page: Page) => Promise<T>): Promise<T> {
		const { page, close } = await openPage('/');
		page.setDefaultTimeout(10_000);
		try {
			return await use(page);
		} finally {
			await close();
		}
	}

	describe('index', () => {
		/** Every page the index finds for `query`, best match first, as UTF-8 paths (Pagefind's own search API). */
		function search(query: string): Promise<string[]> {
			return onHomePage((page) =>
				page.evaluate(async (query) => {
					// Not `import()` itself: Vitest would rewrite it before the browser gets it.
					const pagefind = await new Function('return import("/pagefind/pagefind.js")')();
					const { results } = await pagefind.search(query);
					const found: { url: string }[] = await Promise.all(results.map((result: any) => result.data()));
					return found.map(({ url }) => decodeURI(url));
				}, query),
			);
		}

		it('is in Traditional Chinese', async () => {
			const entry = await (await get('/pagefind/pagefind-entry.json')).json();

			// Language tags are case-insensitive.
			expect(Object.keys(entry.languages).map((language) => language.toLowerCase())).toEqual(['zh-tw']);
		});

		it('finds a post by a Chinese word in its text, first', async () => {
			// 電磁筆 is only in the text of this post, between other Chinese words.
			// Posts with parts of it (筆記型電腦, 筆直) come after.
			expect((await search('電磁筆'))[0]).toBe('/2021/11/30/電子紙閱讀器使用心得/');
		}, 30_000);

		it('has the text of posts and pages only, not the listings or related posts that repeat their titles', async () => {
			// Only in the 9 travel posts, starting with their titles; listings and
			// other posts' related posts show those titles too.
			expect((await search('遊記')).sort()).toEqual([
				'/2025/05/17/travel-setonaikai-2025-day1/',
				'/2025/05/17/travel-setonaikai-2025-day2/',
				'/2025/05/17/travel-setonaikai-2025-day3/',
				'/2025/05/17/travel-setonaikai-2025-day4/',
				'/2025/05/17/travel-setonaikai-2025-day5/',
				'/2025/05/17/travel-setonaikai-2025-day6/',
				'/2025/05/17/travel-setonaikai-2025-day7/',
				'/2025/05/17/travel-setonaikai-2025-day8/',
				'/2025/05/17/travel-setonaikai-2025-prologue/',
			]);
		}, 30_000);
	});

	it('the sidebar search box shows the posts found as the reader types', async () => {
		const found = await onHomePage(async (page) => {
			const box = page.locator('aside #search');
			await box.locator('input').fill('電磁筆');
			const links = box.locator('a[href]');
			await links.first().waitFor();
			return links.evaluateAll((links) => links.map((link) => decodeURI((link as HTMLAnchorElement).pathname)));
		});

		expect(found[0]).toBe('/2021/11/30/電子紙閱讀器使用心得/');
	}, 30_000);

	it('the sidebar search box speaks Chinese only', async () => {
		await onHomePage(async (page) => {
			const box = page.locator('aside #search');
			await box.locator('input').fill('龘龘');

			// Pagefind's zh-TW text for "no results for 龘龘".
			await expect.poll(() => box.innerText(), { timeout: 10_000 }).toContain('找不到 龘龘 的相關結果');
			// No English words.
			expect(await box.innerText()).not.toMatch(/[a-z]{3,}/i);
		});
	}, 30_000);
});
