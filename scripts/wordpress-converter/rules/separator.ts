// Separators (core/separator) become thematic breaks; their styles (wide,
// dots) are dropped.
import type { Rule } from '../rule.ts';

export const separator: Rule = {
	blocks: { 'core/separator': () => '---' },
};
