// Images (core/image, and <img> inside text) → images in the uniform image
// directory, src/assets/images/<post slug>/ (ticket 06). Photon URLs
// (i0.wp.com) and thumbnails (-WxH) point at the original upload. Some image
// blocks carry an id the text links to (`<div id="image-3">`, `#image-3`).
// Until then they stay in the output as wp-unconverted markers.
import type { Rule } from '../rule.ts';

export const images: Rule = {
	blocks: {
		'core/image': (block, context) => context.unconverted(block),
	},
	elements: {
		img: (element, context) => context.unconvertedInline('img', element.toString()),
	},
};
