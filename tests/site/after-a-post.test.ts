// What comes after a post: share links, related posts, comments.
// The site is built and served once for all the files of tests/site/
// (global-setup.ts).
import { parse } from 'node-html-parser';
import { describe, expect, it } from 'vitest';
import { get } from './site';

describe('after a post', () => {
	/** The section of the post page's main column under the given heading. */
	async function section(path: string, heading: string) {
		const response = await get(path);
		expect(response.status, path).toBe(200);
		return parse(await response.text())
			.querySelectorAll('main section')
			.find((element) => element.querySelector('h2')?.text.trim() === heading);
	}

	describe('share links', () => {
		/** Each share link: its text, the page it opens, and the parameters it passes (query and fragment), decoded. */
		async function shareLinks(path: string) {
			const share = await section(path, '分享此文');
			expect(share, path).toBeDefined();
			return share!.querySelectorAll('a').map((link) => {
				const url = new URL(link.getAttribute('href')!);
				const params = [...url.searchParams, ...new URLSearchParams(url.hash.slice(1))];
				return {
					name: link.text.trim(),
					page: `${url.origin}${url.pathname}`,
					params: Object.fromEntries(params.map(([name, value]) => [name, decodeURI(value)])),
				};
			});
		}

		// The platforms and their order are those of the WordPress site's Jetpack
		// sharing buttons (aniya.moe, 2026-10-24).
		it("link to each platform's share page with the post's URL and title", async () => {
			const url = 'https://aniya.moe/2021/11/30/電子紙閱讀器使用心得/';
			const title = '電子紙閱讀器使用心得';
			const media = decodeURI(
				parse(await (await get('/2021/11/30/電子紙閱讀器使用心得/')).text())
					.querySelector('head meta[property="og:image"]')!
					.getAttribute('content')!,
			);

			expect(await shareLinks('/2021/11/30/電子紙閱讀器使用心得/')).toEqual([
				{ name: 'Threads', page: 'https://www.threads.com/intent/post', params: { url, text: title } },
				{ name: 'Facebook', page: 'https://www.facebook.com/sharer/sharer.php', params: { u: url } },
				{ name: 'X', page: 'https://x.com/intent/tweet', params: { url, text: title } },
				{ name: 'Mastodon', page: 'https://share.joinmastodon.org/', params: { text: `${title} ${url}` } },
				{ name: 'LinkedIn', page: 'https://www.linkedin.com/sharing/share-offsite/', params: { url } },
				{ name: 'Reddit', page: 'https://www.reddit.com/submit', params: { url, title } },
				{
					name: 'Tumblr',
					page: 'https://www.tumblr.com/widgets/share/tool',
					params: { posttype: 'link', canonicalUrl: url, content: url, title },
				},
				{ name: 'Pinterest', page: 'https://www.pinterest.com/pin/create/button/', params: { url, media, description: title } },
				{ name: 'Telegram', page: 'https://t.me/share/url', params: { url, text: title } },
				{ name: 'WhatsApp', page: 'https://wa.me/', params: { text: `${title} ${url}` } },
			]);
		});

		it('are plain links: no scripts or frames from the platforms', async () => {
			const share = await section('/2021/11/30/電子紙閱讀器使用心得/', '分享此文');

			expect(share?.querySelectorAll('a')).toHaveLength(10);
			expect(share?.querySelectorAll('script, iframe')).toHaveLength(0);
		});

		// The og:image: the post's own social image, its first image, or night.png.
		it.each(['/2025/12/05/2025-koebitai/', '/2021/11/30/電子紙閱讀器使用心得/', '/2021/09/30/第一篇文章/'])(
			'on %s pin the image of its link previews on Pinterest',
			async (path) => {
				const pinterest = (await shareLinks(path)).find(({ name }) => name === 'Pinterest');
				const ogImage = parse(await (await get(path)).text())
					.querySelector('head meta[property="og:image"]')
					?.getAttribute('content');
				const image = await get(new URL(pinterest!.params.media!).pathname);

				expect(pinterest!.params.media).toBe(decodeURI(ogImage!));
				expect(image.status).toBe(200);
			},
		);
	});

	describe('comments', () => {
		// The repository and category IDs are giscus's for erase2004/blog and its
		// Comments discussion category (ticket 02).
		it("are giscus, in Chinese, with one discussion per post, found by the post's path", async () => {
			const comments = await section('/2021/11/30/電子紙閱讀器使用心得/', '留言');
			const giscus = comments?.querySelector('script[src="https://giscus.app/client.js"]');

			expect(giscus?.attributes).toMatchObject({
				'data-repo': 'erase2004/blog',
				'data-repo-id': 'R_kgDOVVonIg',
				'data-category': 'Comments',
				'data-category-id': 'DIC_kwDOVVonIs4DJfJF',
				'data-lang': 'zh-TW',
				// The path as written, not as the browser encodes it: the same
				// discussion whichever percent-encoding a reader's URL has.
				'data-mapping': 'specific',
				'data-term': '2021/11/30/電子紙閱讀器使用心得/',
				// Found by the term's hash, not by GitHub's fuzzy title search.
				'data-strict': '1',
			});
		});
	});

	describe('related posts', () => {
		/** The posts the related posts link to, as UTF-8 paths, in order. */
		async function relatedPosts(path: string): Promise<string[] | undefined> {
			return (await section(path, '相關文章'))
				?.querySelectorAll('a')
				.map((link) => decodeURI(link.getAttribute('href')!));
		}

		// Expected values worked out by hand from the posts' tags.
		it('are the 3 posts that share the most tags with it, newer first among equals', async () => {
			// Day 3's tags: ざつ旅, ゆゆゆ, 沙彌島, 瀨居島, 瀨戶內國際藝術祭, 聖地巡禮, 高松.
			// Day 4 and Day 2 share 4 of them, Day 5 shares 3, the others 2 or fewer.
			expect(await relatedPosts('/2025/05/17/travel-setonaikai-2025-day3/')).toEqual([
				'/2025/05/17/travel-setonaikai-2025-day4/',
				'/2025/05/17/travel-setonaikai-2025-day2/',
				'/2025/05/17/travel-setonaikai-2025-day5/',
			]);
		});

		it('are made up with posts of the same category when too few share its tags', async () => {
			// No other post has 第一篇文章's tag (murmur); 閒聊 has 3 other posts.
			expect(await relatedPosts('/2021/09/30/第一篇文章/')).toEqual([
				'/2025/12/05/2025-koebitai/',
				'/2022/03/11/alpha-camp推特專案開發紀錄/',
				'/2021/11/30/電子紙閱讀器使用心得/',
			]);
		});
	});
});
