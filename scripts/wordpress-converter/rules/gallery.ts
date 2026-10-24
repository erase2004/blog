// Galleries → the Gallery component (src/components/Gallery.astro), which
// lays the images out in rows and opens them in a lightbox (ticket 09); each
// image is the moved file, imported from the content file (imageSource()).
// Envira galleries (envira/envira-gallery) list their images as JSON in the
// block's attributes, the same list, in the same order, Envira kept in the
// gallery's metadata (_eg_gallery_data); the block's HTML is only an
// `[envira-gallery id='…']` shortcode. Each image's Envira title is the
// caption its lightbox showed. Core gallery blocks (core/gallery) hold
// core/image blocks, and may have a caption of their own. The shortcode on
// its own, outside its block, is not in the backup: it stays a marker.
import { decodeEntities, findElement } from '../html.ts';
import type { Context, Rule } from '../rule.ts';
import { imageSource } from './images.ts';

/** The import in a post (src/content/posts/<slug>.mdx). */
const IMPORT = "import Gallery from '../../components/Gallery.astro';";

/** An image of a gallery, as the Gallery component takes it; `src` is its old URL. */
type GalleryImage = { src: string; alt?: string; caption?: string };

export const gallery: Rule = {
	blocks: {
		// Its images are core/image blocks; a caption of the whole gallery follows them.
		'core/gallery': (block, context) => {
			const images = block.innerBlocks.map((image) => {
				const nodes = context.parse(image.innerHTML);
				const img = findElement(nodes, 'img');
				return {
					src: img?.getAttribute('src') ?? '',
					alt: (img?.getAttribute('alt') ?? '').trim(),
					caption: findElement(nodes, 'figcaption')?.text.trim(),
				};
			});
			const caption = findElement(context.parse(block.innerHTML), 'figcaption');
			return galleryComponent(images, context, caption && context.inline(caption.childNodes));
		},
		'envira/envira-gallery': (block, context) => {
			const images = block.attrs.images as { src: string; alt?: string; title?: string }[];
			const text = (value = '') => decodeEntities(value).trim();
			return galleryComponent(
				images.map((image) => ({ src: image.src, alt: text(image.alt), caption: text(image.title) })),
				context,
			);
		},
	},
	shortcodes: {
		'envira-gallery': (shortcode, context) => context.unconvertedInline('[envira-gallery]', shortcode.source),
	},
};

/** The Gallery component; a caption of the whole gallery (inline Markdown) is its content. */
function galleryComponent(images: GalleryImage[], context: Context, caption?: string): string {
	context.document.imports.add(IMPORT);
	const items = images.map(({ src, alt, caption }) => {
		const props = [`src: import(${jsString(imageSource(src, context))})`];
		// Without alternative text of its own, the component describes the image with its caption.
		if (alt && alt !== caption) props.push(`alt: ${jsString(alt)}`);
		if (caption) props.push(`caption: ${jsString(caption)}`);
		return `\t\t{ ${props.join(', ')} },`;
	});
	const start = ['<Gallery', '\timages={[', ...items, '\t]}'];
	return [...start, ...(caption ? ['>', caption, '</Gallery>'] : ['/>'])].join('\n');
}

/** A JavaScript string literal of `text`, in single quotes (with JSON's escapes, which JavaScript shares). */
function jsString(text: string): string {
	return `'${JSON.stringify(text).slice(1, -1).replaceAll('\\"', '"').replaceAll("'", "\\'")}'`;
}
