// Buttons (core/buttons, core/button) become plain links, one per paragraph;
// the new layout decides how they look.
import { findElement } from '../html.ts';
import type { Rule } from '../rule.ts';

export const buttons: Rule = {
	blocks: {
		'core/buttons': (block, context) => context.blocks(block.innerBlocks),
		'core/button': (block, context) => {
			const link = findElement(context.parse(block.innerHTML), 'a');
			return link ? context.inline([link]) : context.unconverted(block);
		},
	},
};
