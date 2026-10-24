// HTML parsing and the raw HTML the converter keeps (tables, <ruby>), written
// so that it means the same in .md and .mdx files.
import { type HTMLElement, type Node, NodeType, parse, type TextNode } from 'node-html-parser';

export type { HTMLElement, Node };

/** The nodes of an HTML fragment; `<pre>`, `<script>` and `<style>` keep their content as raw text. */
export function parseHtml(html: string): Node[] {
	return parse(html, { lowerCaseTagName: true }).childNodes;
}

export function isElement(node: Node): node is HTMLElement {
	return node.nodeType === NodeType.ELEMENT_NODE;
}

export function isText(node: Node): node is TextNode {
	return node.nodeType === NodeType.TEXT_NODE;
}

/** The lowercase tag name of an element. */
export function tagOf(element: HTMLElement): string {
	return element.rawTagName.toLowerCase();
}

/** The first element in `nodes` (depth first) with one of the given tag names. */
export function findElement(nodes: Node[], ...tags: string[]): HTMLElement | undefined {
	for (const node of nodes) {
		if (!isElement(node)) continue;
		if (tags.includes(tagOf(node))) return node;
		const found = findElement(node.childNodes, ...tags);
		if (found) return found;
	}
	return undefined;
}

/** Text with HTML character references (`&amp;`, `&#8211;`) decoded. */
export function decodeEntities(text: string): string {
	return text.includes('&') ? parse(text.replaceAll('<', '&lt;')).text : text;
}

/** The element's own HTML as it was written. */
export function outerHtml(element: HTMLElement): string {
	return element.toString();
}

const VOID_ELEMENTS = new Set(['area', 'br', 'col', 'hr', 'img', 'input', 'source', 'track', 'wbr']);

/** Attributes kept on raw HTML; WordPress classes, styles and data attributes are dropped. */
const KEPT_ATTRIBUTES = ['href', 'title', 'colspan', 'rowspan', 'lang'];

/**
 * Nodes as raw HTML. Void elements are self-closed and characters that are
 * syntax in Markdown or MDX are written as character references, so the HTML
 * means the same in an .md HTML block, inline in a paragraph, and in MDX.
 */
export function rawHtml(nodes: Node[], url: (href: string) => string): string {
	return nodes
		.map((node) => {
			if (isText(node)) return escapeHtmlText(node.text);
			if (!isElement(node)) return '';
			const tag = tagOf(node);
			const attributes = KEPT_ATTRIBUTES.flatMap((name) => {
				const value = node.getAttribute(name);
				if (value === undefined || (name === 'title' && value === '')) return [];
				return [` ${name}="${escapeAttribute(name === 'href' ? url(value) : value)}"`];
			}).join('');
			if (VOID_ELEMENTS.has(tag)) return `<${tag}${attributes} />`;
			return `<${tag}${attributes}>${rawHtml(node.childNodes, url)}</${tag}>`;
		})
		.join('');
}

const HTML_TEXT_ESCAPES: Record<string, string> = {
	'&': '&amp;',
	'<': '&lt;',
	'>': '&gt;',
	'\u00a0': '&nbsp;',
	// Markdown and MDX syntax.
	'*': '&#42;',
	_: '&#95;',
	'[': '&#91;',
	']': '&#93;',
	'`': '&#96;',
	'~': '&#126;',
	'\\': '&#92;',
	'{': '&#123;',
	'}': '&#125;',
};

function escapeHtmlText(text: string): string {
	return text.replace(/[&<>\u00a0*_[\]`~\\{}]/g, (char) => HTML_TEXT_ESCAPES[char]!);
}

function escapeAttribute(value: string): string {
	return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');
}
