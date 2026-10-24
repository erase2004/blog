// Tables (core/table) stay HTML: the site's one table has no header row and
// line breaks in its cells, which a Markdown table cannot hold. WordPress
// classes and the <figure> around it are dropped; one row per line.
import { findElement, type HTMLElement, isElement, tagOf } from '../html.ts';
import type { Context, Rule } from '../rule.ts';

export const table: Rule = {
	blocks: {
		'core/table': (block, context) => {
			const element = findElement(context.parse(block.innerHTML), 'table');
			return element ? tableHtml(element, context) : context.unconverted(block);
		},
	},
};

function tableHtml(element: HTMLElement, context: Context): string {
	const lines = ['<table>'];
	for (const section of children(element)) {
		const tag = tagOf(section);
		if (tag === 'tr') {
			lines.push(context.rawHtml([section]));
			continue;
		}
		lines.push(`<${tag}>`, ...children(section).map((row) => context.rawHtml([row])), `</${tag}>`);
	}
	lines.push('</table>');
	return lines.join('\n');
}

function children(element: HTMLElement): HTMLElement[] {
	return element.childNodes.filter(isElement);
}
