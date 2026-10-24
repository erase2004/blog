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
 * The image's own URL: the webp Astro makes of it at its full size. It is the
 * `src` of the image in a post (Markdown images) and the largest size the
 * post offers; old image URLs redirect here.
 */
export async function imageUrl(image: ImageMetadata): Promise<string> {
	return (await getImage({ src: image, layout: 'none' })).src;
}

/**
 * The images of the uniform image directory that a post's or page's content
 * shows, by path from the project root, each once, in the order its source
 * names them: Markdown images and MDX imports name them by a path relative
 * to the file (`../../assets/images/<slug>/<file>`). Its `socialImage` is not
 * among them unless the content shows it too.
 */
export function imagesIn({ filePath, body }: { filePath?: string; body?: string }): string[] {
	const dir = posix.dirname(filePath!);
	const paths = [...(body ?? '').matchAll(/[^\s'"()<>]*assets\/images\/[^\s'"()<>]+/g)].map(([path]) =>
		posix.join(dir, path),
	);
	// Paths elsewhere, e.g. in a code block, are not the site's images.
	return [...new Set(paths)].filter((path) => `/${path}` in images);
}
