// The URL checker's expected list: every URL the WordPress site had, with what
// the new site must answer for it.
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadExpectedUrls } from '../../scripts/url-checker/expected-urls';

const snapshotDir = fileURLToPath(
	new URL('../fixtures/wordpress-sitemap-2026-10-24/', import.meta.url),
);

describe('expected URLs from the sitemap snapshot', () => {
	it('include the 88 indexed pages, as UTF-8 paths', () => {
		const pages = loadExpectedUrls({ sitemapDir: snapshotDir })
			.filter((expected) => expected.expect === 'page')
			.map((expected) => expected.url);

		expect(pages).toHaveLength(88);
		expect(pages).toEqual(
			expect.arrayContaining([
				'/',
				'/2026/01/23/acgn-museum-ssg/',
				'/2021/09/30/第一篇文章/',
				'/about/contact/',
				'/category/技術/',
				'/tag/book☆walker/',
			]),
		);
		expect(pages.filter((url) => url.startsWith('/tag/'))).toHaveLength(57);
	});

	it('include each image URL once, redirected to wherever the build puts the new image', () => {
		const images = loadExpectedUrls({ sitemapDir: snapshotDir }).filter((expected) =>
			expected.url.startsWith('/wp-content/uploads/'),
		);

		// The snapshot lists 772 images; 11 of them appear in two posts.
		expect(images).toHaveLength(761);
		expect(images).toContainEqual({ url: '/wp-content/uploads/2026/01/fcp-01.png', expect: 'redirect' });
		expect(images).toContainEqual({
			url: '/wp-content/uploads/2025/05/夜行巴士-Ave-Mujica.jpg',
			expect: 'redirect',
		});
		expect(images.every((image) => image.expect === 'redirect' && !('location' in image))).toBe(true);
	});

	it('include robots.txt and the sitemap it names; the old sub-sitemaps move to /sitemap.xml', () => {
		const expected = loadExpectedUrls({ sitemapDir: snapshotDir });

		expect(expected).toEqual(
			expect.arrayContaining([
				{ url: '/robots.txt', expect: 'file' },
				{ url: '/sitemap.xml', expect: 'file' },
				{ url: '/addl-sitemap.xml', expect: 'redirect', location: '/sitemap.xml' },
				{ url: '/post-sitemap.xml', expect: 'redirect', location: '/sitemap.xml' },
				{ url: '/page-sitemap.xml', expect: 'redirect', location: '/sitemap.xml' },
				{ url: '/category-sitemap.xml', expect: 'redirect', location: '/sitemap.xml' },
				{ url: '/post_tag-sitemap.xml', expect: 'redirect', location: '/sitemap.xml' },
			]),
		);
	});
});

describe('expected URLs that never existed', () => {
	it("are one that must answer 404, and the 404 page's own URL, which must not be a page of its own", () => {
		const notFound = loadExpectedUrls({ sitemapDir: snapshotDir }).filter(
			(expected) => expected.expect === 'not-found',
		);

		expect(notFound).toEqual([
			{ url: '/url-checker/no-such-page/', expect: 'not-found' },
			{ url: '/404/', expect: 'not-found' },
		]);
	});
});

describe('expected URLs from the old-URL mapping table', () => {
	it('are added to the snapshot URLs', () => {
		const mappingTable = {
			urls: [
				{ url: '/?p=1854', expect: 'redirect', location: '/2026/01/23/acgn-museum-ssg/' },
				{ url: '/2021/09/', expect: 'page' },
				{ url: '/feed/', expect: 'file' },
				{ url: '/wp-admin/', expect: 'not-found' },
				{ url: '/2021/09/30/%e7%ac%ac%e4%b8%80%e7%af%87%e6%96%87%e7%ab%a0/feed/', expect: 'redirect' },
			],
		};

		const expected = loadExpectedUrls({ sitemapDir: snapshotDir, mappingTable });

		expect(expected).toEqual(
			expect.arrayContaining([
				{ url: '/?p=1854', expect: 'redirect', location: '/2026/01/23/acgn-museum-ssg/' },
				{ url: '/2021/09/', expect: 'page' },
				{ url: '/feed/', expect: 'file' },
				{ url: '/wp-admin/', expect: 'not-found' },
				{ url: '/2021/09/30/第一篇文章/feed/', expect: 'redirect' },
				{ url: '/2021/09/30/第一篇文章/', expect: 'page' },
			]),
		);
	});

	it('keep a location on another site as a full URL, and one on this site as a path', () => {
		const mappingTable = {
			urls: [
				{
					url: '/wp-content/uploads/2025/05/a.mp4',
					expect: 'redirect',
					location: 'https://media.aniya.moe/videos/a/a.mp4',
				},
				{ url: '/?p=1', expect: 'redirect', location: 'https://aniya.moe/2021/09/30/%E7%AC%AC/' },
			],
		};

		const expected = loadExpectedUrls({ sitemapDir: snapshotDir, mappingTable });

		expect(expected).toEqual(
			expect.arrayContaining([
				{
					url: '/wp-content/uploads/2025/05/a.mp4',
					expect: 'redirect',
					location: 'https://media.aniya.moe/videos/a/a.mp4',
				},
				{ url: '/?p=1', expect: 'redirect', location: '/2021/09/30/第/' },
			]),
		);
	});

	it('must each say what the site answers, and give a location only for a redirect', () => {
		const load = (entry: object) => () => loadExpectedUrls({ sitemapDir: snapshotDir, mappingTable: { urls: [entry] } });

		expect(load({ url: '/a/', expect: 'moved' })).toThrow('urls[0]: needs "url" and "expect"');
		expect(load({ url: '/a/', expect: 'page', location: '/b/' })).toThrow('urls[0]: "location" is a string, and only for "redirect"');
	});

	it('must not contradict the sitemap snapshot', () => {
		const mappingTable = { urls: [{ url: '/about/', expect: 'redirect', location: '/' }] };

		expect(() => loadExpectedUrls({ sitemapDir: snapshotDir, mappingTable })).toThrow(
			'/about/',
		);
	});
});
