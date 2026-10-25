// Images (core/image, and <img> inside text) → Markdown images of the files
// in the uniform image directory, src/assets/images/<post slug>/ (ticket 06),
// which Astro turns into responsive webp images. Whatever URL WordPress wrote
// (a size such as `-1024x768`, Photon `i0.wp.com`) points at the original
// upload. A caption or an id the text links to (`#image-3`) makes it a
// <figure>.
import { findElement, type HTMLElement, isElement } from '../html.ts';
import { escapeText } from '../markdown.ts';
import { relativeImagePath } from '../media-library.ts';
import type { Context, Rule } from '../rule.ts';

export const images: Rule = {
	blocks: {
		'core/image': (block, context) => {
			const nodes = context.parse(block.innerHTML);
			const img = findElement(nodes, 'img');
			if (!img || !context.site) return context.unconverted(block);
			const caption = findElement(nodes, 'figcaption');
			// The block's outer element (<figure>, or <div> in old blocks) carries the id.
			const id = nodes.find(isElement)?.getAttribute('id');
			if (!caption && !id) return markdownImage(img, context);
			return [
				id ? `<figure id="${id}">` : '<figure>',
				'',
				markdownImage(img, context),
				'',
				...(caption ? [`<figcaption>${context.rawHtml(caption.childNodes).trim()}</figcaption>`] : []),
				'</figure>',
			].join('\n');
		},
	},
	elements: {
		img: (element, context) =>
			context.site ? markdownImage(element, context) : context.unconvertedInline('img', element.toString()),
	},
};

/**
 * The path of the moved image an upload URL refers to, relative to the
 * content file being converted; for Markdown images and MDX imports.
 */
export function imageSource(url: string, context: Context): string {
	const { entry, site } = context;
	if (!entry || !site) throw new Error(`Images need the post they are in: ${url}`);
	return relativeImagePath(url, entry, site);
}

function markdownImage(img: HTMLElement, context: Context): string {
	const alt = escapeText((img.getAttribute('alt') ?? '').trim());
	return `![${alt}](${imageSource(img.getAttribute('src') ?? '', context)})`;
}
