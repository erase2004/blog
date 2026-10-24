// The 404 page: what every URL without a page answers with.
// The site is built and served once for all the files of tests/site/
// (global-setup.ts).
import { parse } from 'node-html-parser';
import { describe, expect, it } from 'vitest';
import { BROWSER_TEST_TIMEOUT, get, openPage } from './site';

describe('the 404 page', () => {
	// The site header with the menu and the sidebar with its search box are
	// tested with the other kinds of page under `layout`.
	async function main() {
		const response = await get('/2021/11/30/no-such-post/');
		expect(response.status).toBe(404);
		return parse(await response.text()).querySelector('main')!;
	}

	it('lists the 5 newest posts, newest first', async () => {
		const latest = (await main())
			.querySelectorAll('section')
			.find((section) => section.querySelector('h2')?.text.trim() === '最新文章');

		expect(latest?.querySelectorAll('a').map((link) => [link.text.trim(), decodeURI(link.getAttribute('href')!)])).toEqual([
			['從 SSR 到 SSG：ACGN 股市歷史博物館 7 萬頁靜態化的實戰轉型紀錄', '/2026/01/23/acgn-museum-ssg/'],
			['另類日本生活體驗，一個月的瀨戶內藝術祭小蝦隊志工經驗談', '/2025/12/05/2025-koebitai/'],
			['遊記 – 岡山 / 香川 / 德島八日遊 – Day 8', '/2025/05/17/travel-setonaikai-2025-day8/'],
			['遊記 – 岡山 / 香川 / 德島八日遊 – Day 7', '/2025/05/17/travel-setonaikai-2025-day7/'],
			['遊記 – 岡山 / 香川 / 德島八日遊 – Day 6', '/2025/05/17/travel-setonaikai-2025-day6/'],
		]);
	});

	it('links back to the home page', async () => {
		expect((await main()).querySelectorAll('a[href="/"]').map((link) => link.text.trim())).toEqual(['回到首頁']);
	});

	it("has a search box in the main column that shows the posts found as the reader types, apart from the sidebar's", async () => {
		const { page, close } = await openPage('/2021/11/30/no-such-post/');
		try {
			page.setDefaultTimeout(10_000);
			const box = page.locator('main [role="search"]');
			await box.locator('input').fill('電磁筆');
			const found = box.locator('a[href]');
			await found.first().waitFor();

			expect(decodeURI(await found.first().evaluate((link) => (link as HTMLAnchorElement).pathname))).toBe(
				'/2021/11/30/電子紙閱讀器使用心得/',
			);
			// The sidebar's search box is another one: it stays empty.
			expect(await page.locator('aside #search input').inputValue()).toBe('');
			expect(await page.locator('aside #search a[href]').count()).toBe(0);
		} finally {
			await close();
		}
	}, BROWSER_TEST_TIMEOUT);
});
