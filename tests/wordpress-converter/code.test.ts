// Code blocks (core/code, written with the Code Syntax Block plugin) become
// fenced code that Expressive Code highlights: the language is kept, and the
// `title` attribute becomes the file name title.
import { describe, expect, it } from 'vitest';
import { convertContent } from '../../scripts/wordpress-converter/content';
import { compileMdx, renderMarkdown } from '../support/render-markdown';

const markdownOf = (html: string) => convertContent(html).markdown;

describe('code blocks', () => {
	it('become fenced code with their language, and their title as the file name', () => {
		const html = `<!-- wp:code {"lineNumbers":false} -->
<pre title="src/router/index.js" class="wp-block-code"><code lang="javascript" class="language-javascript">{ // Nested Route 的 Route 物件
  path: '/nested',
  component: () =&gt; import('@/views/NestedRoute.vue'),
}</code></pre>
<!-- /wp:code -->`;

		const markdown = markdownOf(html);

		expect(markdown).toBe(
			[
				'```javascript title="src/router/index.js"',
				'{ // Nested Route 的 Route 物件',
				"  path: '/nested',",
				"  component: () => import('@/views/NestedRoute.vue'),",
				'}',
				'```',
				'',
			].join('\n'),
		);
		expect(() => compileMdx(markdown)).not.toThrow();
	});

	it('call Prism\'s "markup" by the name Expressive Code knows, html', () => {
		const html = `<!-- wp:code -->
<pre title="src/App.vue" class="wp-block-code"><code lang="markup" class="language-markup">&lt;router-link
  :to="{name: 'nested'}"
  &lt;!-- 用 class 屬性進行設定 --&gt;
&gt;</code></pre>
<!-- /wp:code -->`;

		expect(markdownOf(html)).toBe(
			[
				'```html title="src/App.vue"',
				'<router-link',
				`  :to="{name: 'nested'}"`,
				'  <!-- 用 class 屬性進行設定 -->',
				'>',
				'```',
				'',
			].join('\n'),
		);
	});

	it('without a title have none, and keep text that looks like a shortcode or Markdown as it is', () => {
		const html = `<!-- wp:code -->
<pre id="block-12f870b2-b51e-4f4d-b905-841bbcf07bc4" class="wp-block-code"><code lang="typescript" class="language-typescript">const a = '[ref]x[/ref] *b* \`c\`';
\`\`\`</code></pre>
<!-- /wp:code -->`;

		const markdown = markdownOf(html);

		expect(markdown).toBe("````typescript\nconst a = '[ref]x[/ref] *b* `c`';\n```\n````\n");
		expect(renderMarkdown(markdown)).toBe(
			'<pre><code class="language-typescript">const a = \'[ref]x[/ref] *b* `c`\';\n```\n</code></pre>',
		);
	});
});
