// The images of the uniform image directory (src/assets/images/), and the
// URL each one has on the site.
import type { ImageMetadata } from 'astro';
import { getImage } from 'astro:assets';
import { imageReferences } from './image-references';

const images = import.meta.glob<{ default: ImageMetadata }>('/src/assets/images/**/*');

/** An image of the uniform image directory, by its path from the project root: `src/assets/images/site/night.png`. */
export async function imageAt(file: string): Promise<ImageMetadata> {
	const load = images[`/${file}`];
	if (!load) throw new Error(`There is no image ${file}`);
	return (await load()).default;
}

/**
 * The first image of the uniform image directory that a post's or page's
 * content shows: the first image readers see, a Markdown image or one a
 * component (a slider, a gallery) shows. None if it shows none.
 */
export async function firstImage(entry: { filePath?: string; body?: string }): Promise<ImageMetadata | undefined> {
	const [file] = imagesIn(entry);
	return file === undefined ? undefined : imageAt(file);
}

/**
 * The image's own URL: the webp Astro makes of it at its full size. It is the
 * `src` of the image in a post (Markdown images) and the largest size the
 * post offers; old image URLs redirect here.
 */
export async function imageUrl(image: ImageMetadata): Promise<string> {
	return (await getImage({ src: image, layout: 'none' })).src;
}

/**
 * The images of the uniform image directory that a post's or page's content
 * shows, by path from the project root, each once (see imageReferences()).
 * Its `socialImage` is not among them unless the content shows it too.
 */
export function imagesIn(entry: { filePath?: string; body?: string }): string[] {
	// Paths elsewhere, e.g. in a code block, are not the site's images.
	return imageReferences(entry).filter((path) => `/${path}` in images);
}
