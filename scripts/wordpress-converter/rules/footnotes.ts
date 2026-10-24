// Footnotes → GFM footnotes `[^n]` (ticket 08). Two kinds exist:
// - `[ref]…[/ref]` shortcodes (Footnotes plugin, 2021–22 posts and a page);
// - Gutenberg footnotes: `<sup data-fn="ID">` references in the text, the
//   texts in the post's `footnotes` metadata (JSON), listed where the
//   core/footnotes block is.
// Until ticket 08 they stay in the output as wp-unconverted markers; the
// footnotes block's marker lists the texts, so none is lost meanwhile.
import type { Rule } from '../rule.ts';

export const footnotes: Rule = {
	blocks: {
		'core/footnotes': (block, context) => {
			const [json] = context.entry && context.site ? context.site.meta(context.entry.id, 'footnotes') : [];
			const notes = json ? (JSON.parse(json) as { id: string; content: string }[]) : [];
			const list = notes.map(({ id, content }) => `<li id="${id}">${content}</li>`).join('');
			return context.unconverted(block, notes.length > 0 ? `<ol class="wp-block-footnotes">${list}</ol>` : undefined);
		},
	},
	elements: {
		'sup[data-fn]': (element, context) => context.unconvertedInline('sup[data-fn]', element.toString()),
	},
	shortcodes: {
		ref: (shortcode, context) => context.unconvertedInline('[ref]', shortcode.source),
	},
};
