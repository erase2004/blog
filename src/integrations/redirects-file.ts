import { appendFile, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

/**
 * Adds rules to the end of the build's `_redirects`, after the rules other
 * integrations wrote; nothing is overwritten. Every integration that writes
 * `_redirects` goes through here, and redirects-budget.ts checks the total.
 */
export async function appendRedirects(dir: URL, rules: string[]): Promise<void> {
	const file = fileURLToPath(new URL('_redirects', dir));
	const existing = await readFile(file, 'utf8').catch(() => '');
	const separator = existing === '' || existing.endsWith('\n') ? '' : '\n';
	await appendFile(file, separator + rules.map((rule) => `${rule}\n`).join(''));
}
