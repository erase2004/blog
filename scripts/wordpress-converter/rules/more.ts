// The "more" tag (core/more, `<!--more-->`) is left out: listings use the
// manual excerpt or the description instead of the text before it.
import type { Rule } from '../rule.ts';

export const more: Rule = {
	blocks: { 'core/more': () => '' },
};
