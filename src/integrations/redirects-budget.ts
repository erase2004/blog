import type { AstroIntegration } from 'astro';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

/** What Cloudflare Workers static assets apply of a `_redirects` file. */
const MAX_STATIC_RULES = 2000;
const MAX_DYNAMIC_RULES = 100;

/**
 * Fails the build when `_redirects` has more rules than Workers static assets
 * apply. Beyond the limits wrangler skips rules with only a warning, so old
 * URLs would quietly answer 404. Keep this integration after every
 * integration that writes `_redirects`.
 */
export default function redirectsBudget(): AstroIntegration {
	return {
		name: 'redirects-budget',
		hooks: {
			'astro:build:done': async ({ dir, logger }) => {
				const text = await readFile(fileURLToPath(new URL('_redirects', dir)), 'utf8').catch(() => '');
				const { staticRules, dynamicRules } = countRedirectRules(text);
				const format = (count: number) => count.toLocaleString('en');
				const over = [
					staticRules > MAX_STATIC_RULES && `${format(staticRules)} static rules (at most ${format(MAX_STATIC_RULES)})`,
					dynamicRules > MAX_DYNAMIC_RULES && `${format(dynamicRules)} dynamic rules (at most ${format(MAX_DYNAMIC_RULES)})`,
				].filter(Boolean);
				if (over.length > 0) {
					throw new Error(`_redirects has ${over.join(' and ')}: Cloudflare would skip the rest`);
				}
				logger.info(`_redirects: ${format(staticRules)} static rules, ${format(dynamicRules)} dynamic rules`);
			},
		},
	};
}

/**
 * Counts rules the way wrangler's parseRedirects() does: a rule whose source
 * has `*` or a `:placeholder` is dynamic, and so is every rule after it.
 */
function countRedirectRules(text: string): { staticRules: number; dynamicRules: number } {
	let staticRules = 0;
	let dynamicRules = 0;
	for (const rawLine of text.split('\n')) {
		const line = rawLine.trim();
		if (line === '' || line.startsWith('#')) continue;
		const [from = ''] = line.split(/\s+/);
		if (dynamicRules === 0 && !from.includes('*') && !/:[A-Za-z]\w*/.test(from)) {
			staticRules++;
		} else {
			dynamicRules++;
		}
	}
	return { staticRules, dynamicRules };
}
