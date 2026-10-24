// Videos (core/video) and the PDF (core/file) → files on R2, served from
// media.aniya.moe/<kind>/<post slug>/ (ticket 07). Until then they stay in
// the output as wp-unconverted markers.
import type { Rule } from '../rule.ts';

export const media: Rule = {
	blocks: {
		'core/file': (block, context) => context.unconverted(block),
		'core/video': (block, context) => context.unconverted(block),
	},
};
