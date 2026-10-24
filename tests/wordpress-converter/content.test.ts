// Converting a post's Gutenberg content to Markdown. Each conversion rule has
// at least one fixture: a block as it appears in the WordPress backup, and the
// Markdown it must become.
import { describe, expect, it } from 'vitest';
import { convertContent, createRegistry } from '../../scripts/wordpress-converter/content';
import type { Rule } from '../../scripts/wordpress-converter/rule';
import * as rules from '../../scripts/wordpress-converter/rules/index';
import { compileMdx, renderMarkdown } from '../support/render-markdown';

const markdownOf = (html: string) => convertContent(html).markdown;

const paragraphBlock = (html: string) => `<!-- wp:paragraph -->\n<p>${html}</p>\n<!-- /wp:paragraph -->`;

describe('paragraphs', () => {
	it('become Markdown paragraphs, with bold and italic text', () => {
		const html = `<!-- wp:paragraph -->
<p>選擇這樣的形式是基於「<strong>希望這些紀錄能長存，以供自己未來再次使用</strong>」的考量，<em>Next-URL</em> 也一樣。</p>
<!-- /wp:paragraph -->

<!-- wp:paragraph -->
<p>第二段</p>
<!-- /wp:paragraph -->`;

		expect(markdownOf(html)).toBe(
			'選擇這樣的形式是基於「**希望這些紀錄能長存，以供自己未來再次使用**」的考量，*Next-URL* 也一樣。\n\n第二段\n',
		);
	});

	it('are left out when empty', () => {
		const html = `<!-- wp:paragraph -->
<p>你可以使用以下連結訂閱feed：</p>
<!-- /wp:paragraph -->

<!-- wp:paragraph -->
<p></p>
<!-- /wp:paragraph -->`;

		expect(markdownOf(html)).toBe('你可以使用以下連結訂閱feed：\n');
	});
});

describe('headings', () => {
	it('become Markdown headings of the same level, without their inline styles', () => {
		const html = `<!-- wp:heading -->
<h2>我們是誰</h2>
<!-- /wp:heading -->

<!-- wp:heading {"level":3} -->
<h3 class="wp-block-heading">webpack 5</h3>
<!-- /wp:heading -->

<!-- wp:heading {"level":4,"style":{"typography":{"textTransform":"lowercase","letterSpacing":"0px","lineHeight":"0"}}} -->
<h4 style="line-height:0;text-transform:lowercase;letter-spacing:0px">．babel-loader</h4>
<!-- /wp:heading -->`;

		expect(markdownOf(html)).toBe('## 我們是誰\n\n### webpack 5\n\n#### ．babel-loader\n');
	});
});

describe('lists', () => {
	it('become Markdown lists', () => {
		const html = `<!-- wp:list -->
<ul><li>由於網站清單和圖片清單資料都抽出來獨立成檔案來管理。</li><li>圖片顯示區塊有要載入圖片的<strong>主要顏色</strong>作墊底顯示。</li></ul>
<!-- /wp:list -->`;

		expect(markdownOf(html)).toBe(
			'- 由於網站清單和圖片清單資料都抽出來獨立成檔案來管理。\n- 圖片顯示區塊有要載入圖片的**主要顏色**作墊底顯示。\n',
		);
	});

	it('keep their numbering and nesting', () => {
		const html = `<!-- wp:list {"ordered":true} -->
<ol><li>瞭解彼此</li><li>確立團隊和助教的互動原則：<ol><li>團隊成員會設一個停損點</li><li>每天回報下述內容：<ol><li>昨天進度</li><li>今天要做的事情</li></ol></li></ol></li><li>發放作業</li></ol>
<!-- /wp:list -->`;

		const markdown = markdownOf(html);

		expect(markdown).toBe(
			[
				'1. 瞭解彼此',
				'2. 確立團隊和助教的互動原則：',
				'   1. 團隊成員會設一個停損點',
				'   2. 每天回報下述內容：',
				'      1. 昨天進度',
				'      2. 今天要做的事情',
				'3. 發放作業',
				'',
			].join('\n'),
		);
		expect(renderMarkdown(markdown).replace(/\n/g, '')).toBe(
			'<ol><li>瞭解彼此</li><li>確立團隊和助教的互動原則：<ol><li>團隊成員會設一個停損點</li>' +
				'<li>每天回報下述內容：<ol><li>昨天進度</li><li>今天要做的事情</li></ol></li></ol></li><li>發放作業</li></ol>',
		);
	});

	it('made of list-item blocks become Markdown lists too', () => {
		const html = `<!-- wp:list {"ordered":true} -->
<ol class="wp-block-list"><!-- wp:list-item -->
<li>與藝術家一起製作作品、展覽場地的維護</li>
<!-- /wp:list-item -->

<!-- wp:list-item -->
<li>藝術作品的接待導覽</li>
<!-- /wp:list-item --></ol>
<!-- /wp:list -->`;

		expect(markdownOf(html)).toBe('1. 與藝術家一起製作作品、展覽場地的維護\n2. 藝術作品的接待導覽\n');
	});
});

describe('separators', () => {
	it('become thematic breaks', () => {
		const html = `${paragraphBlock('前')}

<!-- wp:separator {"className":"is-style-dots"} -->
<hr class="wp-block-separator has-alpha-channel-opacity is-style-dots"/>
<!-- /wp:separator -->

${paragraphBlock('後')}`;

		expect(markdownOf(html)).toBe('前\n\n---\n\n後\n');
	});
});

describe('the "more" tag', () => {
	it('is left out', () => {
		const html = `${paragraphBlock('摘要')}

<!-- wp:more -->
<!--more-->
<!-- /wp:more -->

${paragraphBlock('內文')}`;

		expect(markdownOf(html)).toBe('摘要\n\n內文\n');
	});
});

describe('the last-modified-info shortcode', () => {
	it('is left out; the layout shows when a post was last updated', () => {
		const html = `${paragraphBlock('你可以依照聯絡目的，參考以下的聯絡方式。')}

<!-- wp:shortcode -->
[lmt-post-modified-info]
<!-- /wp:shortcode -->`;

		expect(markdownOf(html)).toBe('你可以依照聯絡目的，參考以下的聯絡方式。\n');
	});
});

describe('links', () => {
	it('become Markdown links, dropping WordPress attributes but keeping titles', () => {
		const markdown = markdownOf(
			paragraphBlock(
				'參考<a href="https://medium.com/doflowy/scrum-de6c837ee6cc">資料</a>與 ' +
					'<a rel="noreferrer noopener" href="https://hanamizuki.tw/proactive/" data-type="URL" data-id="https://hanamizuki.tw/proactive/" target="_blank" title="">PRO</a>、' +
					'<a href="https://example.com/a_(b)" title="說明 &quot;x&quot;">括號</a>、<a href="#image-3" data-type="internal" data-id="#image-3">圖3</a>',
			),
		);

		expect(markdown).toBe(
			'參考[資料](https://medium.com/doflowy/scrum-de6c837ee6cc)與 [PRO](https://hanamizuki.tw/proactive/)、' +
				'[括號](<https://example.com/a_(b)> "說明 \\"x\\"")、[圖3](#image-3)\n',
		);
		expect(renderMarkdown(markdown)).toBe(
			'<p>參考<a href="https://medium.com/doflowy/scrum-de6c837ee6cc">資料</a>與 <a href="https://hanamizuki.tw/proactive/">PRO</a>、' +
				'<a href="https://example.com/a_(b)" title="說明 &quot;x&quot;">括號</a>、<a href="#image-3">圖3</a></p>',
		);
	});

	it('to the site itself become site-relative, with non-ASCII paths readable', () => {
		const markdown = markdownOf(
			paragraphBlock(
				'<a href="https://aniya.moe/feed/" target="_blank" rel="noreferrer noopener">https://aniya.moe/feed/</a> ' +
					'<a href="http://aniya.moe/about/contact/">聯絡方式</a> ' +
					'<a href="https://aniya.moe/2021/09/30/%e7%ac%ac%e4%b8%80%e7%af%87%e6%96%87%e7%ab%a0/#top">第一篇</a> ' +
					'<a href="https://aniya.moe">首頁</a> <a href="https://aniya.moe.example.com/x">別站</a>',
			),
		);

		expect(markdown).toBe(
			'[https://aniya.moe/feed/](/feed/) [聯絡方式](/about/contact/) [第一篇](/2021/09/30/第一篇文章/#top) ' +
				'[首頁](/) [別站](https://aniya.moe.example.com/x)\n',
		);
	});
});

describe('buttons', () => {
	it('become one link per paragraph', () => {
		const html = `<!-- wp:buttons -->
<div class="wp-block-buttons"><!-- wp:button -->
<div class="wp-block-button"><a class="wp-block-button__link" href="https://aniya.moe/about/autobiography/">我的故事</a></div>
<!-- /wp:button -->

<!-- wp:button -->
<div class="wp-block-button"><a class="wp-block-button__link" href="http://aniya.moe/about/contact/">聯絡方式</a></div>
<!-- /wp:button --></div>
<!-- /wp:buttons -->`;

		expect(markdownOf(html)).toBe('[我的故事](/about/autobiography/)\n\n[聯絡方式](/about/contact/)\n');
	});
});

describe('columns', () => {
	it('are flattened into their blocks', () => {
		const html = `<!-- wp:columns -->
<div class="wp-block-columns"><!-- wp:column {"width":"100%"} -->
<div class="wp-block-column" style="flex-basis:100%">${paragraphBlock('前者是處理在 JavaScript 檔案中的載入處理。')}

${paragraphBlock('後者是輸出成獨立的檔案。')}</div>
<!-- /wp:column --></div>
<!-- /wp:columns -->`;

		expect(markdownOf(html)).toBe('前者是處理在 JavaScript 檔案中的載入處理。\n\n後者是輸出成獨立的檔案。\n');
	});
});

describe('tables', () => {
	it('stay HTML, without WordPress classes, valid in Markdown and MDX', () => {
		const html = `<!-- wp:table -->
<figure class="wp-block-table"><table class="has-fixed-layout"><tbody><tr><td>變動內容</td><td>調整內容</td><td class="has-text-align-left" data-align="left">調整參考</td></tr><tr><td>增加產品補貨設定</td><td>1. 藉由 <em>arena</em> 的 <em>winner_list</em> 欄位<br>2. 計算 {total} &amp; *x*</td><td class="has-text-align-left" data-align="left"><a href="https://github.com/erase2004/museum-tools/blob/main/039.js?a=1&amp;b=2" target="_blank" rel="noopener nofollow" title="">mongo script</a></td></tr></tbody></table></figure>
<!-- /wp:table -->`;

		const markdown = markdownOf(html);

		expect(markdown).toBe(
			[
				'<table>',
				'<tbody>',
				'<tr><td>變動內容</td><td>調整內容</td><td>調整參考</td></tr>',
				'<tr><td>增加產品補貨設定</td><td>1. 藉由 <em>arena</em> 的 <em>winner&#95;list</em> 欄位<br />2. 計算 &#123;total&#125; &amp; &#42;x&#42;</td>' +
					'<td><a href="https://github.com/erase2004/museum-tools/blob/main/039.js?a=1&amp;b=2">mongo script</a></td></tr>',
				'</tbody>',
				'</table>',
				'',
			].join('\n'),
		);
		expect(renderMarkdown(markdown)).toBe(markdown.trim());
		expect(() => compileMdx(markdown)).not.toThrow();
	});
});

describe('highlighted text', () => {
	it('becomes <mark>, all in one highlighter style', () => {
		const markdown = markdownOf(
			paragraphBlock(
				'路徑為 <mark style="background-color:rgba(0, 0, 0, 0)" class="has-inline-color has-medium-gray-color">/nested</mark> 與 ' +
					'<mark style="background-color:#fcb900" class="has-inline-color">*重點*</mark>',
			),
		);

		expect(markdown).toBe('路徑為 <mark>/nested</mark> 與 <mark>\\*重點\\*</mark>\n');
		expect(renderMarkdown(markdown)).toBe('<p>路徑為 <mark>/nested</mark> 與 <mark>*重點*</mark></p>');
	});
});

describe('ruby annotations', () => {
	it('stay HTML', () => {
		const markdown = markdownOf(
			paragraphBlock('Ave Mujica 中，<ruby>豊川<br><rp>（<small>とがわ</small>）</rp></ruby>祥子所停留的公車站'),
		);

		expect(markdown).toBe('Ave Mujica 中，<ruby>豊川<br /><rp>（<small>とがわ</small>）</rp></ruby>祥子所停留的公車站\n');
		expect(renderMarkdown(markdown)).toBe(
			'<p>Ave Mujica 中，<ruby>豊川<br /><rp>（<small>とがわ</small>）</rp></ruby>祥子所停留的公車站</p>',
		);
	});
});

describe('superscript and line breaks', () => {
	it('stay what they were', () => {
		const html = `<!-- wp:paragraph {"align":"center","fontSize":"small"} -->
<p class="has-text-align-center has-small-font-size"><sup><em>各個島嶼的蓋章紀錄</em></sup></p>
<!-- /wp:paragraph -->

${paragraphBlock('第一行<br>第二行<br>')}`;

		const markdown = markdownOf(html);

		expect(markdown).toBe('<sup>*各個島嶼的蓋章紀錄*</sup>\n\n第一行\\\n第二行\n');
		expect(renderMarkdown(markdown)).toBe('<p><sup><em>各個島嶼的蓋章紀錄</em></sup></p>\n<p>第一行<br>\n第二行</p>');
	});
});

describe('blocks left for later tickets', () => {
	// One of each kind the backup has; converted by tickets 06–10.
	const blocks = {
		'core/image': `<!-- wp:image {"id":422,"sizeSlug":"full","linkDestination":"none","align":"center"} -->
<figure class="wp-block-image aligncenter size-full"><img src="https://aniya.moe/wp-content/uploads/2025/03/Snipaste_2025-03-25_15-59-21.png" alt="" class="wp-image-422"/><figcaption class="wp-element-caption">在 CDN 項目中的設定</figcaption></figure>
<!-- /wp:image -->`,
		'core/gallery': `<!-- wp:gallery {"linkTo":"none","align":"center"} -->
<figure class="wp-block-gallery aligncenter has-nested-images columns-default is-cropped"><!-- wp:image {"id":500,"sizeSlug":"large","linkDestination":"none"} -->
<figure class="wp-block-image size-large"><img src="https://aniya.moe/wp-content/uploads/2025/05/岡山駅前桃太郎像-神推-1024x576.jpg" alt="桃太郎像" class="wp-image-500"/></figure>
<!-- /wp:image --><figcaption class="blocks-gallery-caption wp-element-caption">原本要拍的桃太郎像</figcaption></figure>
<!-- /wp:gallery -->`,
		'envira/envira-gallery': `<!-- wp:envira/envira-gallery {"galleryId":572,"title":"直島 \\u0026#8211; イワタコンフェクト","columns":"0","images":[{"status":"active","src":"https://aniya.moe/wp-content/uploads/2025/05/20250421_081608666-scaled.jpg","title":"店家外面的照片","id":571}]} -->
<div class="wp-block-envira-envira-gallery">[envira-gallery id='572']</div>
<!-- /wp:envira/envira-gallery -->`,
		'jetpack/image-compare': `<!-- wp:jetpack/image-compare {"imageBefore":{"id":1237,"url":"https://i0.wp.com/aniya.moe/wp-content/uploads/2025/05/minato-2.jpg?ssl=1","alt":"","width":1200,"height":675},"imageAfter":{"id":562,"url":"https://i0.wp.com/aniya.moe/wp-content/uploads/2025/05/pi_20250421_084628.jpg?ssl=1","alt":"","width":1920,"height":1080},"caption":"Summer Pockets 裡的鳥白島的港口"} -->
<figure class="wp-block-jetpack-image-compare"><div class="juxtapose" data-mode="horizontal"><img id="1237" src="https://aniya.moe/wp-content/uploads/2025/05/minato-2.jpg" alt="" width="1200" height="675" class="image-compare__image-before"/><img id="562" src="https://aniya.moe/wp-content/uploads/2025/05/pi_20250421_084628.jpg" alt="" width="1920" height="1080" class="image-compare__image-after"/></div><figcaption>Summer Pockets 裡的鳥白島的港口</figcaption></figure>
<!-- /wp:jetpack/image-compare -->`,
		'core/html': `<!-- wp:html -->
<figure class="wp-block-jetpack-image-compare"><div class="juxtapose" data-mode="horizontal"><img id="1762" src="https://aniya.moe/wp-content/uploads/2025/05/8a6a5bf6243acbe99900d2e8417652e7.jpg" alt="" width="1624" height="915" class="image-compare__image-before"/><img id="727" src="https://aniya.moe/wp-content/uploads/2025/05/pi_20250422_104948.jpg" alt="" width="1920" height="1080" class="image-compare__image-after"/></div><figcaption>結城友奈は勇者である中出現的展望台</figcaption></figure>
<!-- /wp:html -->`,
		'core/quote': `<!-- wp:quote -->
<blockquote class="wp-block-quote"><p>No rule converts quotes: the site has none.</p></blockquote>
<!-- /wp:quote -->`,
	};

	it.each(Object.entries(blocks))('keep %s as it was, visibly marked', (name, block) => {
		const { markdown, unconverted } = convertContent(`${paragraphBlock('前')}\n\n${block}\n\n${paragraphBlock('後')}`);

		expect(markdown).toBe(`前\n\n\`\`\`html title="wp-unconverted: ${name}"\n${block}\n\`\`\`\n\n後\n`);
		expect(unconverted).toEqual([{ kind: name, source: block }]);
		expect(renderMarkdown(markdown)).toContain('<pre><code class="language-html">&lt;!-- wp:');
		expect(() => compileMdx(markdown)).not.toThrow();
	});

	it('keep HTML outside any block, visibly marked', () => {
		const { markdown, unconverted } = convertContent('<p>classic editor text</p>');

		expect(markdown).toBe('```html title="wp-unconverted: freeform HTML"\n<p>classic editor text</p>\n```\n');
		expect(unconverted).toHaveLength(1);
	});

	it('use longer fences when the block itself has backticks', () => {
		const block = '<!-- wp:quote -->\n<blockquote><p>```</p></blockquote>\n<!-- /wp:quote -->';

		expect(markdownOf(block)).toBe(`\`\`\`\`html title="wp-unconverted: core/quote"\n${block}\n\`\`\`\`\n`);
	});
});

describe('text left for later tickets', () => {
	// Images inside text (ticket 06).
	const pieces = {
		img: '<img class="wp-image-496" style="width: 48px;" src="https://aniya.moe/wp-content/uploads/2025/05/25251efc7b05ba337e25294a5a690e92_w48_h46.jpeg" alt="">',
	};

	it.each(Object.entries(pieces))('keeps %s as it was, visibly marked', (kind, piece) => {
		const { markdown, unconverted } = convertContent(paragraphBlock(`問題${piece}。`));

		expect(markdown).toBe(`問題\`wp-unconverted: ${piece}\`。\n`);
		expect(unconverted).toEqual([{ kind, source: piece }]);
		expect(() => compileMdx(markdown)).not.toThrow();
	});
});

describe('conversion rules', () => {
	it('convert what they claim: blocks, elements inside text and shortcodes', () => {
		const quote: Rule = {
			blocks: { 'core/quote': (block, context) => `> ${context.inline(block.innerHTML)}` },
			elements: { 'span[lang]': (element, context) => `<span lang="ja">${context.inline(element.childNodes)}</span>` },
			shortcodes: { year: (shortcode) => shortcode.attributes.of ?? '2026' },
		};
		const registry = createRegistry([...Object.values(rules), quote]);

		const { markdown } = convertContent(
			`<!-- wp:quote --><span lang="ja">引用</span> [year of="2025"]<!-- /wp:quote -->`,
			{ registry },
		);

		expect(markdown).toBe('> <span lang="ja">引用</span> 2025\n');
	});

	it('can make the file MDX with imports, and add to its end once all blocks are converted', () => {
		const component: Rule = {
			blocks: {
				'core/quote': (_block, context) => {
					context.document.imports.add("import Quote from '../../components/Quote.astro';");
					context.document.state.set('quotes', ((context.document.state.get('quotes') as number) ?? 0) + 1);
					return '<Quote />';
				},
			},
			finish: (context) => {
				context.document.footer.push(`${context.document.state.get('quotes')} quotes`);
			},
		};
		const registry = createRegistry([...Object.values(rules), component]);

		const converted = convertContent(
			`<!-- wp:quote --><!-- /wp:quote -->\n\n${paragraphBlock('文字')}\n\n<!-- wp:quote --><!-- /wp:quote -->`,
			{ registry },
		);

		expect(converted).toMatchObject({
			markdown: "import Quote from '../../components/Quote.astro';\n\n<Quote />\n\n文字\n\n<Quote />\n\n2 quotes\n",
			mdx: true,
		});
	});

	it('may not claim what another rule claims', () => {
		const another: Rule = { blocks: { 'core/paragraph': () => '' } };

		expect(() => createRegistry([...Object.values(rules), another])).toThrow('core/paragraph');
	});
});

describe('bold and italic text', () => {
	it('is written as HTML where Markdown asterisks would not be read as emphasis', () => {
		// CommonMark does not take `**` between 是 and 「 as the start of bold text.
		const markdown = markdownOf(paragraphBlock('這是<strong>「重要」</strong>的，<em>「也是」</em>。'));

		expect(markdown).toBe('這是<strong>「重要」</strong>的，*「也是」*。\n');
		expect(renderMarkdown(markdown)).toBe('<p>這是<strong>「重要」</strong>的，<em>「也是」</em>。</p>');
	});

	it('keeps surrounding spaces outside the emphasis', () => {
		const markdown = markdownOf(paragraphBlock('從<strong> 程式與功能 </strong>清單'));

		expect(renderMarkdown(markdown)).toBe('<p>從 <strong>程式與功能</strong> 清單</p>');
	});

	it('works nested and side by side', () => {
		const markdown = markdownOf(paragraphBlock('<strong>a <em>b</em></strong><em>c</em>'));

		expect(renderMarkdown(markdown)).toBe('<p><strong>a <em>b</em></strong><em>c</em></p>');
	});
});

describe('text', () => {
	it('shows Markdown and MDX syntax characters literally', () => {
		const text = String.raw`a*b* _c_ install_all.bat [note] \ ~d~ <x> {y} &amp;lt; # 1. `;
		const markdown = markdownOf(paragraphBlock(text.replaceAll('<', '&lt;').replaceAll('>', '&gt;')));

		expect(renderMarkdown(markdown)).toBe(
			String.raw`<p>a*b* _c_ install_all.bat [note] \ ~d~ &lt;x&gt; {y} &amp;lt; # 1.</p>`,
		);
		expect(() => compileMdx(markdown)).not.toThrow();
	});

	it('is not read as a heading, list or quote at the start of a line', () => {
		for (const start of ['# 標題', '- 項目', '+ 項目', '1. 項目', '> 引用', '- - -']) {
			const markdown = markdownOf(paragraphBlock(start));

			expect(renderMarkdown(markdown)).toBe(`<p>${start.replace('>', '&gt;')}</p>`);
		}
	});

	it('keeps non-breaking spaces and collapses other whitespace', () => {
		const markdown = markdownOf(paragraphBlock('a&nbsp;b \n  c'));

		expect(markdown).toBe('a&nbsp;b c\n');
	});
});
