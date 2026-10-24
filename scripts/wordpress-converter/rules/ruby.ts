// Ruby annotations (`<ruby>`) stay HTML, as written.
import type { Rule } from '../rule.ts';

export const ruby: Rule = {
	elements: {
		ruby: (element, context) => context.rawHtml([element]),
	},
};
