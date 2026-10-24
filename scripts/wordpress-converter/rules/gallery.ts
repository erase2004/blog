// Galleries → <Gallery> (ticket 09): Envira galleries
// (envira/envira-gallery, image list in the block's JSON attributes; the
// block's HTML is only an `[envira-gallery id='…']` shortcode) and core
// gallery blocks. Until then they stay in the output as wp-unconverted
// markers.
import type { Rule } from '../rule.ts';

export const gallery: Rule = {
	blocks: {
		'core/gallery': (block, context) => context.unconverted(block),
		'envira/envira-gallery': (block, context) => context.unconverted(block),
	},
	shortcodes: {
		'envira-gallery': (shortcode, context) => context.unconvertedInline('[envira-gallery]', shortcode.source),
	},
};
