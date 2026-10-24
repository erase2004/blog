// How wide the images in a post's body are shown, for their `sizes`
// attribute, so that browsers load an image as wide as the post's column
// rather than as the screen: Markdown images (through contentImageSizes) and
// the Compare slider's. Follows the layout in src/styles/global.css
// (`.sheet`): keep the two in step.

/**
 * The width of the main column (`.prose`), by screen width: phones (the
 * sheet's padding, --gutter, on both sides), tablets (the sheet's margins and
 * padding), and beside the sidebar (padding, gap, --sidebar-width), up to
 * --page-width.
 */
export const CONTENT_IMAGE_SIZES = [
	'(max-width: 40rem) calc(100vw - 2rem)',
	'(max-width: 64rem) calc(100vw - 6.5rem)',
	'(max-width: 72rem) calc(100vw - 26.5rem)',
	'45.5rem',
].join(', ');

type Element = { properties?: Record<string, unknown> };
type Context = { setProperty(node: Element, name: string, value: unknown): void };

/**
 * A plugin for Astro's Markdown processor (Sätteri; markdown.processor in
 * astro.config.mjs) giving the images of Markdown and MDX files the column's
 * `sizes`, unless they have their own. It runs before Astro turns the images
 * into responsive ones, which keeps the `sizes` it finds.
 */
export const contentImageSizes = {
	name: 'content-image-sizes',
	element: {
		filter: ['img'],
		visit(node: Element, context: Context) {
			if (node.properties?.sizes === undefined) context.setProperty(node, 'sizes', CONTENT_IMAGE_SIZES);
		},
	},
};
