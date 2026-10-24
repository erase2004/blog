// Before/after sliders → <Compare> (ticket 10): Jetpack image-compare blocks
// (jetpack/image-compare, image URLs partly as i0.wp.com Photon URLs) and the
// copies of their markup pasted as Custom HTML blocks (core/html; every
// core/html block on the site is one). Until then they stay in the output as
// wp-unconverted markers.
import type { Rule } from '../rule.ts';

export const compare: Rule = {
	blocks: {
		'core/html': (block, context) => context.unconverted(block),
		'jetpack/image-compare': (block, context) => context.unconverted(block),
	},
};
