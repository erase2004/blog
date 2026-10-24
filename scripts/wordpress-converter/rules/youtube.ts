// Embeds (core/embed): the two YouTube videos → the lightweight YouTube
// component (ticket 08). Until then they stay in the output as
// wp-unconverted markers.
import type { Rule } from '../rule.ts';

export const youtube: Rule = {
	blocks: {
		'core/embed': (block, context) => context.unconverted(block),
	},
};
