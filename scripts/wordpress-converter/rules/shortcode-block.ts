// Shortcode blocks (core/shortcode): their text is converted like a
// paragraph's, so each shortcode in it goes to the rule registered for it.
import type { Rule } from '../rule.ts';

export const shortcodeBlock: Rule = {
	blocks: { 'core/shortcode': (block, context) => context.inline(block.innerHTML) },
};
