import { appendFile, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

/**
 * A `_redirects` rule. `from` is a path of the site; `to` is a path, or a
 * full URL on another site (R2). Both are in UTF-8, as the mapping table and
 * the build's file names have them, not percent-encoded; a dynamic rule
 * writes `*` and `:placeholder`s as Cloudflare reads them.
 */
export interface RedirectRule {
	from: string;
	to: string;
	/** 301 redirects to `to`; 200 answers `from` with what `to` has (a proxy rule). */
	status: 200 | 301;
}

/**
 * Adds rules to the end of the build's `_redirects`, after the rules other
 * integrations wrote; nothing is overwritten. Every integration that writes
 * `_redirects` goes through here, and redirects-budget.ts checks the total.
 *
 * Paths are written percent-encoded (encodeURI()), however their characters:
 * Cloudflare reads UTF-8 and these escapes the same way (it turns both into
 * uppercase escapes), and one way for every rule keeps the file alike.
 */
export async function appendRedirects(dir: URL, rules: RedirectRule[]): Promise<void> {
	const file = fileURLToPath(new URL('_redirects', dir));
	const existing = await readFile(file, 'utf8').catch(() => '');
	const separator = existing === '' || existing.endsWith('\n') ? '' : '\n';
	const lines = rules.map(({ from, to, status }) => `${encodeURI(from)} ${encodeURI(to)} ${status}\n`);
	await appendFile(file, separator + lines.join(''));
}
