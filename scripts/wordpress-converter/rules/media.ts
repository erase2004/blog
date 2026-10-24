// Videos (core/video) and the PDF (core/file) → their files on R2, served
// from media.aniya.moe/<videos|files>/<post slug>/ (see media-files.ts).
// Videos stay HTML <video> elements, which mean the same in .md and .mdx.
import { findElement } from '../html.ts';
import { mediaFileAt } from '../media-files.ts';
import type { Context, Rule } from '../rule.ts';

export const media: Rule = {
	blocks: {
		// A link to the file; the block's download button, a second link to it, is left out.
		'core/file': (block, context) => {
			const link = findElement(context.parse(block.innerHTML), 'a');
			const file = mediaFileOf(link?.getAttribute('href'), context);
			if (!link || !file) return context.unconverted(block);
			link.setAttribute('href', file.url);
			return context.inline([link]);
		},
		'core/video': (block, context) => {
			const nodes = context.parse(block.innerHTML);
			const video = findElement(nodes, 'video');
			const file = mediaFileOf(video?.getAttribute('src'), context);
			if (!video || !file) return context.unconverted(block);
			const flags = BOOLEAN_ATTRIBUTES.filter((name) => video.hasAttribute(name));
			const preload = video.getAttribute('preload') ?? 'metadata';
			const caption = findElement(nodes, 'figcaption');
			const captionHtml = caption ? context.rawHtml(caption.childNodes).trim() : '';
			return [
				'<figure>',
				`<video ${[...flags, `preload="${preload}"`, `src="${file.url}"`].join(' ')}></video>`,
				...(captionHtml ? [`<figcaption>${captionHtml}</figcaption>`] : []),
				'</figure>',
			].join('\n');
		},
	},
};

/** Gutenberg's video block writes these when set; `preload` defaults to `metadata` there and is written otherwise. */
const BOOLEAN_ATTRIBUTES = ['controls', 'autoplay', 'loop', 'muted', 'playsinline'];

function mediaFileOf(href: string | undefined, context: Context) {
	return href && context.site ? mediaFileAt(context.site, context.url(href)) : undefined;
}
