// Footnotes become GFM footnotes `[^n]`, numbered in the order they appear,
// with their texts at the end of the file. Two kinds exist: `[ref]…[/ref]`
// shortcodes (the Footnotes plugin, 2021–22) and Gutenberg footnotes, whose
// texts are in the post's `footnotes` metadata.
import { describe, expect, it } from 'vitest';
import { convertContent } from '../../scripts/wordpress-converter/content';
import { loadWordPress } from '../../scripts/wordpress-converter/wordpress';
import { compileMdx, renderMarkdown } from '../support/render-markdown';
import { meta, post, wordpressTables } from './fixtures';

const paragraphBlock = (html: string) => `<!-- wp:paragraph -->\n<p>${html}</p>\n<!-- /wp:paragraph -->`;

/** Converts a post with this content and these Gutenberg footnotes in its metadata. */
function convertPost(content: string, notes: { id: string; content: string }[]) {
	const tables = wordpressTables();
	tables.wp_posts!.push(post({ ID: 419, post_name: 'next-js-app-route-and-cloud-cdn-cache', post_content: content }));
	tables.wp_postmeta!.push(meta(419, 'footnotes', JSON.stringify(notes)));
	const site = loadWordPress(tables);
	return convertContent(content, { entry: site.post(419), site });
}

const sup = (id: string, n: number) =>
	`<sup data-fn="${id}" class="fn"><a id="${id}-link" href="#${id}">${n}</a></sup>`;

describe('Gutenberg footnotes', () => {
	it('become GFM footnotes, with their texts from the post metadata at the end', () => {
		const content = `${paragraphBlock(
			`Next.js 的 Vary header ${sup('90e39d4c-b413-460c-b74c-1f9e33ba2f0f', 1)}，cache key 的 header ${sup('d50384b6-d8ee-4ab3-bd7a-dfe7fafccd0e', 2)}。`,
		)}

<!-- wp:list -->
<ul class="wp-block-list"><!-- wp:list-item -->
<li><em>Next-URL</em> 會作為在 Intercepting Routes${sup('a7805dd0-74e1-4b06-83df-fc66858a6a2c', 3)} 情境下使用。</li>
<!-- /wp:list-item --></ul>
<!-- /wp:list -->

${paragraphBlock('')}

<!-- wp:footnotes /-->`;
		const notes = [
			{
				content:
					'Vary header 的數值，更多可以參考 <a href="https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Vary" target="_blank" rel="noopener nofollow" title="">Vary - HTTP | MDN</a>',
				id: '90e39d4c-b413-460c-b74c-1f9e33ba2f0f',
			},
			{
				content:
					'<a href="https://cloud.google.com/cdn/docs/caching#non-cacheable_content" target="_blank" rel="noopener nofollow" title="">Non-cacheable content base on origin headers | Cloud CDN</a>',
				id: 'd50384b6-d8ee-4ab3-bd7a-dfe7fafccd0e',
			},
			{
				content:
					'<a href="https://nextjs.org/docs/app/building-your-application/routing/intercepting-routes" target="_blank" rel="noopener nofollow" title="">Routing: Intercepting Routes | Next.js</a> ',
				id: 'a7805dd0-74e1-4b06-83df-fc66858a6a2c',
			},
		];

		const { markdown, unconverted } = convertPost(content, notes);

		expect(markdown).toBe(
			[
				'Next.js 的 Vary header [^1]，cache key 的 header [^2]。',
				'',
				'- *Next-URL* 會作為在 Intercepting Routes[^3] 情境下使用。',
				'',
				'[^1]: Vary header 的數值，更多可以參考 [Vary - HTTP | MDN](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Vary)',
				'[^2]: [Non-cacheable content base on origin headers | Cloud CDN](https://cloud.google.com/cdn/docs/caching#non-cacheable_content)',
				'[^3]: [Routing: Intercepting Routes | Next.js](https://nextjs.org/docs/app/building-your-application/routing/intercepting-routes)',
				'',
			].join('\n'),
		);
		expect(unconverted).toEqual([]);
		expect(renderMarkdown(markdown)).toContain(
			'<li id="user-content-fn-3">\n<p><a href="https://nextjs.org/docs/app/building-your-application/routing/intercepting-routes">Routing: Intercepting Routes | Next.js</a> <a href="#user-content-fnref-3" data-footnote-backref=""',
		);
	});

	it('stop the conversion when one is never referenced in the text, rather than lose it', () => {
		const content = `${paragraphBlock(`一${sup('1e48c1c2', 1)}`)}\n\n<!-- wp:footnotes /-->`;
		const notes = [
			{ content: '註一', id: '1e48c1c2' },
			{ content: '註二', id: '90a4d1a6' },
		];

		expect(() => convertPost(content, notes)).toThrow('post 419: footnote 90a4d1a6 is never referenced');
	});

	it('stay visibly marked where the post metadata lacks their text', () => {
		const reference = sup('a7805dd0-74e1-4b06-83df-fc66858a6a2c', 13);

		const { markdown, unconverted } = convertPost(paragraphBlock(`問題${reference}。`), []);

		expect(markdown).toBe(`問題\`wp-unconverted: ${reference}\`。\n`);
		expect(unconverted).toEqual([{ kind: 'sup[data-fn]', source: reference }]);
	});
});

describe('[ref] footnotes', () => {
	it('become GFM footnotes, numbered in order, their texts at the end', () => {
		const html = `${paragraphBlock(
			'無法藉由操作來導引到修復畫面解決這個問題[ref]<a rel="noreferrer noopener" href="https://thegeekpage.com/visual-c-runtime-library-error/" target="_blank">Fix Microsoft Visual C++ Runtime Library Error in Windows 10/11</a>[/ref]。',
		)}

<!-- wp:list {"ordered":true} -->
<ol><li>由於電子紙的運作原理[ref]<a rel="noreferrer noopener" href="https://tw.eink.com/electronic-ink.html" data-type="URL" data-id="https://tw.eink.com/electronic-ink.html" target="_blank">E Ink 元太科技│電子墨水技術</a>[/ref]，顯示畫面不會被蓋過。</li></ol>
<!-- /wp:list -->

${paragraphBlock('阿毛[ref]阿毛系列為昱泉國際的幼教光碟產品[/ref]')}`;

		const markdown = convertContent(html).markdown;

		expect(markdown).toBe(
			[
				'無法藉由操作來導引到修復畫面解決這個問題[^1]。',
				'',
				'1. 由於電子紙的運作原理[^2]，顯示畫面不會被蓋過。',
				'',
				'阿毛[^3]',
				'',
				'[^1]: [Fix Microsoft Visual C++ Runtime Library Error in Windows 10/11](https://thegeekpage.com/visual-c-runtime-library-error/)',
				'[^2]: [E Ink 元太科技│電子墨水技術](https://tw.eink.com/electronic-ink.html)',
				'[^3]: 阿毛系列為昱泉國際的幼教光碟產品',
				'',
			].join('\n'),
		);
		expect(() => compileMdx(markdown)).not.toThrow();
	});

	it('link to their texts, and the texts link back', () => {
		const markdown = convertContent(
			paragraphBlock('一[ref]註一[/ref]二[ref]<a href="https://example.com/">註二</a>[/ref]'),
		).markdown;

		const html = renderMarkdown(markdown);

		expect(html).toContain(
			'<p>一<sup><a href="#user-content-fn-1" id="user-content-fnref-1" data-footnote-ref aria-describedby="footnote-label">1</a></sup>' +
				'二<sup><a href="#user-content-fn-2" id="user-content-fnref-2" data-footnote-ref aria-describedby="footnote-label">2</a></sup></p>',
		);
		expect(html).toContain(
			'<li id="user-content-fn-1">\n<p>註一 <a href="#user-content-fnref-1" data-footnote-backref=""',
		);
		expect(html).toContain(
			'<li id="user-content-fn-2">\n<p><a href="https://example.com/">註二</a> <a href="#user-content-fnref-2" data-footnote-backref=""',
		);
	});
});
