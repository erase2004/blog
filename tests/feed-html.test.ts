// Post HTML as feed readers get it (src/lib/feed-html.ts), for markup the
// site's posts do not have yet; tests/site-serving.test.ts checks the real
// feeds.
import { parse } from 'node-html-parser';
import { describe, expect, it } from 'vitest';
import { feedHtml } from '../src/lib/feed-html';

const POST_URL = new URL('https://aniya.moe/2025/05/17/travel-setonaikai-2025-day8/');

function forFeed(html: string) {
	return parse(feedHtml(html, { postUrl: POST_URL, idPrefix: 'post-1-' }));
}

describe('post HTML for feeds', () => {
	it('has what a custom element (a web component, which needs its script) contains, in its place', () => {
		const html = forFeed(
			'<figure><img-comparison-slider>' +
				'<img slot="first" src="/_astro/a.webp" alt="實景">' +
				'<img slot="second" src="/_astro/b.webp" alt="動畫">' +
				'</img-comparison-slider><figcaption>對照</figcaption></figure>',
		);

		expect(html.querySelectorAll('figure > img').map((img) => img.getAttribute('src'))).toEqual([
			'https://aniya.moe/_astro/a.webp',
			'https://aniya.moe/_astro/b.webp',
		]);
		expect(html.querySelector('figcaption')?.text).toBe('對照');
		expect(html.toString()).not.toContain('img-comparison-slider');
	});
});
