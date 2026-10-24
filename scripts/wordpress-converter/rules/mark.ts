// Highlighted text (`<mark style=… class=…>`, WordPress's highlight and text
// color tools) becomes a plain <mark>: one highlighter style for the whole
// site, set by the layout, instead of each mark's own colours.
import type { Rule } from '../rule.ts';

export const mark: Rule = {
	elements: {
		mark: (element, context) => `<mark>${context.inline(element.childNodes)}</mark>`,
	},
};
