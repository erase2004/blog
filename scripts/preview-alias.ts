// The preview alias CI uploads a branch's Worker versions under
// (`wrangler versions upload --preview-alias`).
//
//   node scripts/preview-alias.ts <branch>
//
// prints the alias of <branch> for the Worker that wrangler.jsonc names.
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

/** The longest a DNS label may be. */
const MAX_LABEL_LENGTH = 63;

/** Hex digits of the branch name's SHA-256 that tell apart names cut to the same alias. */
const HASH_LENGTH = 4;

/**
 * The preview alias for the Worker versions uploaded from `branch`: the
 * version gets the preview URL `https://<alias>-<workerName>.<subdomain>.workers.dev`
 * as well as its own.
 *
 * Cloudflare takes an alias of lowercase letters, digits and hyphens, that
 * starts with a letter and ends with a letter or digit, and `<alias>-<workerName>`
 * must fit a DNS label (wrangler's own alias generator, `generatePreviewAlias()`
 * in wrangler 4.152.0, checks the same). So the branch name is lowercased, each
 * run of other characters becomes one hyphen, and a name that is too long is cut
 * short and ends with a hash of the branch name.
 */
export function previewAlias(branch: string, workerName: string): string {
	let alias = branch
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '');
	if (alias === '') alias = `branch-${hash(branch)}`;
	else if (!/^[a-z]/.test(alias)) alias = `branch-${alias}`;

	const maxLength = MAX_LABEL_LENGTH - workerName.length - 1;
	if (alias.length <= maxLength) return alias;
	const kept = alias.slice(0, maxLength - HASH_LENGTH - 1).replace(/-$/, '');
	return `${kept}-${hash(branch)}`;
}

function hash(text: string): string {
	return createHash('sha256').update(text).digest('hex').slice(0, HASH_LENGTH);
}

if (import.meta.main) {
	const [branch, ...extra] = process.argv.slice(2);
	if (!branch || extra.length > 0) {
		console.error('usage: node scripts/preview-alias.ts <branch>');
		process.exit(2);
	}
	// wrangler reads its own config file (JSON with comments).
	const { experimental_readRawConfig } = await import('wrangler');
	const { rawConfig } = experimental_readRawConfig({
		config: fileURLToPath(new URL('../wrangler.jsonc', import.meta.url)),
	});
	if (!rawConfig.name) throw new Error('wrangler.jsonc names no Worker');
	console.log(previewAlias(branch, rawConfig.name));
}
