// The images of the uniform image directory (src/assets/images/) that a
// post's or page's Markdown or MDX source names.
import { posix } from 'node:path';

/** A path to an image of the directory, relative to a content file: `../../assets/images/<slug>/<file>`. */
const IMAGE_PATH = /(?:\.\.\/)+assets\/images\/[^\n"'()<>]+?\.(?:avif|gif|jpe?g|png|svg|webp)\b/gi;
const IS_IMAGE_PATH = new RegExp(`^${IMAGE_PATH.source}$`, 'i');

/** An MDX import of a file, at the top of the file: `import compare1Before from '../../assets/images/…';`. */
const IMPORT = /^import\s+([\w$]+)\s+from\s+(['"])(.+?)\2;?[^\S\n]*$/gm;

/**
 * The paths, from the project root, of the images a post's or page's source
 * names, each once, in reading order: where the reader comes to them, the
 * first being the first image of the post. A Markdown image or a gallery's
 * photo (`import('…')`) is where its path is; an image an MDX file imports
 * for a component (a slider's) is where the component uses it
 * (`before={compare1Before}`), not at the import at the top of the file.
 *
 * Paths that are not of an image of the directory (in a code block, say)
 * are not left out here: imagesIn() in images.ts keeps only the images
 * there are.
 */
export function imageReferences({ filePath, body = '' }: { filePath?: string; body?: string }): string[] {
	if (filePath === undefined) return [];
	const dir = posix.dirname(filePath.replaceAll('\\', '/'));
	const found: { at: number; path: string }[] = [];

	const imports = [...body.matchAll(IMPORT)];
	for (const { 1: name, 3: path } of imports) {
		if (!IS_IMAGE_PATH.test(path!)) continue;
		const use = new RegExp(`\\{\\s*${name!.replaceAll('$', '\\$')}\\s*\\}`).exec(body);
		// An image imported but not used comes after the others.
		found.push({ at: use?.index ?? Number.POSITIVE_INFINITY, path: path! });
	}
	const inImport = (at: number) => imports.some(({ index, 0: line }) => at >= index && at < index + line.length);
	for (const { index, 0: path } of body.matchAll(IMAGE_PATH)) {
		if (!inImport(index)) found.push({ at: index, path });
	}

	const paths = found.sort((a, b) => a.at - b.at).map(({ path }) => posix.join(dir, decodeURI(path)));
	return [...new Set(paths)];
}
