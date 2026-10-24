// Code blocks (core/code) → fenced code with the language kept and the
// `title` attribute as Expressive Code's file name title (ticket 08):
//   <pre title="src/router/index.js" class="wp-block-code"><code lang="javascript" …>
// Until then they stay in the output as wp-unconverted markers.
import type { Rule } from '../rule.ts';

export const code: Rule = {
	blocks: {
		'core/code': (block, context) => context.unconverted(block),
	},
};
