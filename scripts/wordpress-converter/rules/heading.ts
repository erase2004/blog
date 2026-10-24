// Headings (core/heading) become Markdown headings of the same level; their
// inline styles are dropped.
import { findElement, tagOf } from '../html.ts';
import type { Rule } from '../rule.ts';

export const heading: Rule = {
	blocks: {
		'core/heading': (block, context) => {
			const h = findElement(context.parse(block.innerHTML), 'h1', 'h2', 'h3', 'h4', 'h5', 'h6');
			if (!h) return context.unconverted(block);
			// A trailing "#" would be read as the heading's closing sequence.
			const text = context.inline(h.childNodes).replace(/#$/, '\\#');
			return `${'#'.repeat(Number(tagOf(h)[1]))} ${text}`;
		},
	},
};
