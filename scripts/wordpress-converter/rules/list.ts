// Lists (core/list, with or without core/list-item blocks inside) become
// Markdown lists, keeping their numbering and nesting.
import { blockHtml } from '../blocks.ts';
import { findElement, type HTMLElement, isElement, type Node, tagOf } from '../html.ts';
import type { Context, Rule } from '../rule.ts';

export const list: Rule = {
	blocks: {
		'core/list': (block, context) => {
			const element = findElement(context.parse(blockHtml(block)), 'ul', 'ol');
			return element ? markdownList(element, context) : context.unconverted(block);
		},
	},
};

function markdownList(element: HTMLElement, context: Context): string {
	const ordered = tagOf(element) === 'ol';
	const items = element.childNodes.filter((node): node is HTMLElement => isElement(node) && tagOf(node) === 'li');
	return items
		.map((item, index) => {
			const marker = ordered ? `${index + 1}.` : '-';
			const indent = ' '.repeat(marker.length + 1);
			const isList = (node: Node) => isElement(node) && ['ul', 'ol'].includes(tagOf(node));
			const text = context.inline(item.childNodes.filter((node) => !isList(node)));
			const nested = item.childNodes
				.filter(isList)
				.map((nestedList) => markdownList(nestedList as HTMLElement, context));
			const lines = [text, ...nested].join('\n').split('\n');
			return lines
				.map((line, i) => (i === 0 ? `${marker} ${line}`.trimEnd() : line === '' ? '' : `${indent}${line}`))
				.join('\n');
		})
		.join('\n');
}
