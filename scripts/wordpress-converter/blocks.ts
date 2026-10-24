// Parses Gutenberg block markup (`<!-- wp:name {attrs} -->…<!-- /wp:name -->`)
// into a tree, the way WordPress's own block-serialization-default-parser does.

export type Block = {
	/** `core/paragraph`, `envira/envira-gallery`, …; null for HTML outside any block. */
	name: string | null;
	attrs: Record<string, unknown>;
	innerBlocks: Block[];
	/** The block's own HTML, without its inner blocks. */
	innerHTML: string;
	/** The block's own HTML in pieces; each `null` is where an inner block goes. */
	innerContent: (string | null)[];
	/** The block exactly as it is written in the post, delimiters included. */
	source: string;
};

// Attribute JSON never contains "-->": Gutenberg escapes "--", "<" and ">".
const DELIMITER =
	/<!--\s+(\/)?wp:([a-z][a-z0-9_-]*\/)?([a-z][a-z0-9_-]*)\s+(\{[\s\S]*?\}\s+)?(\/)?-->/g;

type Open = { block: Block; start: number };

/** The blocks of a post's content; HTML outside blocks that is only whitespace is dropped. */
export function parseBlocks(document: string): Block[] {
	const output: Block[] = [];
	const stack: Open[] = [];
	let offset = 0;

	const addFreeform = (end: number) => {
		const html = document.slice(offset, end);
		if (html.trim() !== '') output.push(newBlock(null, {}, html, [html], html));
	};
	const addInner = (block: Block, start: number) => {
		const parent = stack.at(-1)!;
		const html = document.slice(offset, start);
		if (html !== '') parent.block.innerContent.push(html);
		parent.block.innerContent.push(null);
		parent.block.innerHTML += html;
		parent.block.innerBlocks.push(block);
	};

	for (const match of document.matchAll(DELIMITER)) {
		const [whole, closer, namespace, localName, attrsJson, selfClosing] = match;
		const start = match.index;
		const end = start + whole.length;
		const name = `${namespace ?? 'core/'}${localName}`;

		if (closer) {
			const open = stack.pop();
			if (!open || open.block.name !== name) {
				throw new Error(`Unexpected <!-- /wp:${localName} --> at offset ${start}`);
			}
			const html = document.slice(offset, start);
			if (html !== '' || open.block.innerContent.length === 0) open.block.innerContent.push(html);
			open.block.innerHTML += html;
			open.block.source = document.slice(open.start, end);
			offset = end;
			if (stack.length === 0) {
				output.push(open.block);
			} else {
				// The parent's HTML before this block was already taken when it opened.
				const parent = stack.at(-1)!;
				parent.block.innerContent.push(null);
				parent.block.innerBlocks.push(open.block);
			}
			continue;
		}

		const attrs = attrsJson ? (JSON.parse(attrsJson) as Record<string, unknown>) : {};
		if (stack.length === 0) addFreeform(start);
		if (selfClosing) {
			const block = newBlock(name, attrs, '', [], whole);
			if (stack.length === 0) {
				output.push(block);
			} else {
				addInner(block, start);
			}
			offset = end;
			continue;
		}

		if (stack.length > 0) {
			// Take the parent's HTML up to here; the inner block's place is added when it closes.
			const parent = stack.at(-1)!;
			const html = document.slice(offset, start);
			if (html !== '') parent.block.innerContent.push(html);
			parent.block.innerHTML += html;
		}
		stack.push({ block: newBlock(name, attrs, '', [], ''), start });
		offset = end;
	}
	if (stack.length > 0) {
		throw new Error(`<!-- wp:${stack.at(-1)!.block.name} --> is never closed`);
	}
	addFreeform(document.length);
	return output;
}

/** The block's HTML with its inner blocks' HTML in place (the delimiters left out). */
export function blockHtml(block: Block): string {
	let next = 0;
	return block.innerContent
		.map((piece) => piece ?? blockHtml(block.innerBlocks[next++]!))
		.join('');
}

function newBlock(
	name: string | null,
	attrs: Record<string, unknown>,
	innerHTML: string,
	innerContent: (string | null)[],
	source: string,
): Block {
	return { name, attrs, innerBlocks: [], innerHTML, innerContent, source };
}
