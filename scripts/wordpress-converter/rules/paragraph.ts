// Paragraphs (core/paragraph) become Markdown paragraphs; empty ones are left
// out. Alignment and font-size classes are dropped.
import { findElement } from '../html.ts';
import type { Rule } from '../rule.ts';

export const paragraph: Rule = {
	blocks: {
		'core/paragraph': (block, context) => {
			const p = findElement(context.parse(block.innerHTML), 'p');
			return p ? context.inline(p.childNodes) : context.unconverted(block);
		},
	},
};
