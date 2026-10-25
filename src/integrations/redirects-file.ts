import { appendFile, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

/**
 * A `_redirects` rule. `from` is a path of the site; `to` is a path, or a
 * full URL on another site (R2). Both are in UTF-8, as the mapping table and
 * the build's file names have them, not percent-encoded; a dynamic rule
 * writes `*` and `:placeholder`s as Cloudflare reads them. Percent-escapes a
 * path does have are kept as written: Cloudflare matches a source against the
 * request's path as sent, so `/%e6%8a%80/` matches only requests written with
 * lowercase escapes.
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
 * Paths are written percent-encoded (encodePath()), however their characters:
 * Cloudflare reads UTF-8 and these escapes the same way (it turns both into
 * uppercase escapes), and one way for every rule keeps the file alike.
 */
export async function appendRedirects(dir: URL, rules: RedirectRule[]): Promise<void> {
	const file = fileURLToPath(new URL('_redirects', dir));
	const existing = await readFile(file, 'utf8').catch(() => '');
	const separator = existing === '' || existing.endsWith('\n') ? '' : '\n';
	const lines = rules.map(({ from, to, status }) => `${encodePath(from)} ${encodePath(to)} ${status}\n`);
	await appendFile(file, separator + lines.join(''));
}

/**
 * A non-ASCII path percent-encoded in lowercase, as WordPress wrote it in
 * canonicals and links (`/category/技術/` → `/category/%e6%8a%80%e8%a1%93/`),
 * which makes it the form search engines know; null for a path that has no
 * such form. Browsers send the UTF-8 path in uppercase escapes, and a rule
 * matches only the form its source has, so an old URL needs a rule from this
 * form too: without one, Workers static assets answer it with a temporary
 * redirect (307) to the uppercase form, which may redirect again.
 */
export function lowercaseEncoded(path: string): string | null {
	const encoded = encodeURI(path);
	const lowercase = encoded.replace(/%[0-9A-F]{2}/g, (escape) => escape.toLowerCase());
	return lowercase === encoded ? null : lowercase;
}

/** encodeURI(), except that the percent-escapes `path` already has stay as written, as Cloudflare reads them. */
function encodePath(path: string): string {
	return path
		.split(/(%[0-9A-Fa-f]{2})/)
		.map((part, index) => (index % 2 === 1 ? part : encodeURI(part)))
		.join('');
}
