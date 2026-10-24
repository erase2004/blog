// Columns (core/columns, core/column) are flattened: their blocks follow one
// another. The site has one, a single full-width column.
import type { Rule } from '../rule.ts';

export const columns: Rule = {
	blocks: {
		'core/columns': (block, context) => context.blocks(block.innerBlocks),
		'core/column': (block, context) => context.blocks(block.innerBlocks),
	},
};
