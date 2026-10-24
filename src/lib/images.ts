// The images of the uniform image directory (src/assets/images/), and the
// URL each one has on the site.
import { posix } from 'node:path';
import type { ImageMetadata } from 'astro';
import { getImage } from 'astro:assets';

const images = import.meta.glob<{ default: ImageMetadata }>('/src/assets/images/**/*');

/** An image of the uniform image directory, by its path from the project root: `src/assets/images/site/night.png`. */
export async function imageAt(file: string): Promise<ImageMetadata> {
	const load = images[`/${file}`];
	if (!load) throw new Error(`There is no image ${file}`);
	return (await load()).default;
}

/**
 * The first image of the uniform image directory that a post's or page's
 * Markdown (or MDX) source refers to, by a path relative to the file: the
 * first image readers see, unless an MDX file imports images for a
 * component before a Markdown image. None if it refers to none.
 */
export async function firstImage(entry: { filePath?: string; body?: string }): Promise<ImageMetadata | undefined> {
	const path = /(?:\.\.\/)+assets\/images\/[^\n"'()<>]+?\.(?:avif|gif|jpe?g|png|svg|webp)\b/i.exec(entry.body ?? '')?.[0];
	if (path === undefined || entry.filePath === undefined) return undefined;
	return imageAt(posix.join(posix.dirname(entry.filePath.replaceAll('\\', '/')), decodeURI(path)));
}

/**
 * The image's own URL: the webp Astro makes of it at its full size. It is the
 * `src` of the image in a post (Markdown images) and the largest size the
 * post offers; old image URLs redirect here.
 */
export async function imageUrl(image: ImageMetadata): Promise<string> {
	return (await getImage({ src: image, layout: 'none' })).src;
}
