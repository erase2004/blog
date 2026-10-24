// Bold, italic, superscript and line breaks inside text.
import type { Rule } from '../rule.ts';

export const formatting: Rule = {
	elements: {
		strong: (element, context) => context.emphasis('strong', element.childNodes),
		em: (element, context) => context.emphasis('em', element.childNodes),
		sup: (element, context) => `<sup>${context.inline(element.childNodes)}</sup>`,
		br: (_element, context) => context.lineBreak,
	},
};
