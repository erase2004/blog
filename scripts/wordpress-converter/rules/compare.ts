// Before/after sliders → the Compare component (src/components/Compare.astro),
// its two images imported from the uniform image directory: the Jetpack
// image-compare blocks (jetpack/image-compare), and the copies of their markup
// pasted as Custom HTML blocks (core/html; all 8 on the site are). Both have
// the same HTML: the two images (`image-compare__image-before`/`-after`) and
// the caption. The image URLs in the blocks' attributes (partly Photon,
// i0.wp.com) are not needed. Custom HTML that is not a slider stays marked.
import type { Block } from '../blocks.ts';
import { findElement, type HTMLElement, isElement, type Node } from '../html.ts';
import type { Context, Rule } from '../rule.ts';
import { imageSource } from './images.ts';

/** The import in a post (src/content/posts/<slug>.mdx). */
const IMPORT = "import Compare from '../../components/Compare.astro';";

/** Key of this rule's state: how many sliders the file has so far. */
const SLIDERS = Symbol('compare sliders');

export const compare: Rule = {
	blocks: {
		'core/html': slider,
		'jetpack/image-compare': slider,
	},
};

function slider(block: Block, context: Context): string {
	const nodes = context.parse(block.innerHTML);
	const before = elementWithClass(nodes, 'image-compare__image-before');
	const after = elementWithClass(nodes, 'image-compare__image-after');
	if (!before || !after || !context.site) return context.unconverted(block);

	const n = ((context.document.state.get(SLIDERS) as number | undefined) ?? 0) + 1;
	context.document.state.set(SLIDERS, n);
	const names = { before: `compare${n}Before`, after: `compare${n}After` };
	context.document.imports.add(IMPORT);
	context.document.imports.add(imageImport(names.before, before, context));
	context.document.imports.add(imageImport(names.after, after, context));

	// The images have no alt text on the site.
	const caption = findElement(nodes, 'figcaption');
	const children = caption ? context.inline(caption.childNodes) : '';
	return `<Compare before={${names.before}} after={${names.after}}>${children}</Compare>`;
}

/** `import <name> from '<the moved image, relative to the content file>';` */
function imageImport(name: string, img: HTMLElement, context: Context): string {
	const path = imageSource(img.getAttribute('src') ?? '', context);
	return `import ${name} from '${path.replace(/['\\]/g, '\\$&')}';`;
}

/** The first element in `nodes` (depth first) that has this class. */
function elementWithClass(nodes: Node[], className: string): HTMLElement | undefined {
	for (const node of nodes) {
		if (!isElement(node)) continue;
		if (node.classList.contains(className)) return node;
		const found = elementWithClass(node.childNodes, className);
		if (found) return found;
	}
	return undefined;
}
