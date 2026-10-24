// The images of the uniform image directory (src/assets/images/), and the
// URL each one has on the site.
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
 * The image's own URL: the webp Astro makes of it at its full size. It is the
 * `src` of the image in a post (Markdown images) and the largest size the
 * post offers; old image URLs redirect here.
 */
export async function imageUrl(image: ImageMetadata): Promise<string> {
	return (await getImage({ src: image, layout: 'none' })).src;
}
