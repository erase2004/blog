// Writing Markdown that means exactly what the WordPress HTML meant, in both
// .md and .mdx files (tickets 09 and 10 turn some posts into MDX, where `{`,
// `}` and `<` are syntax).

/** Unicode whitespace and punctuation as CommonMark (and the Markdown engine Astro uses) classify them. */
const WHITESPACE = /^[\s\u00a0]$/u;
const PUNCTUATION = /^[\p{P}\p{S}]$/u;

// Emphasis is written with placeholders first, and settled once the whole run
// of text is known, because whether `**` works depends on the characters
// around it (see `settleEmphasis`).
const OPEN = { em: '\uE000', strong: '\uE002' } as const;
const CLOSE = { em: '\uE001', strong: '\uE003' } as const;
/** A hard line break (`<br>`), settled with the emphasis. */
export const HARD_BREAK = '\uE004';
const PLACEHOLDER = /[\uE000-\uE004]/;

/** `content` marked as emphasis (`em`) or strong emphasis (`strong`). */
export function emphasis(kind: 'em' | 'strong', content: string): string {
	// Markdown emphasis cannot start or end with whitespace: keep it outside.
	const [, before, inner, after] = /^(\s*)([\s\S]*?)(\s*)$/.exec(content)!;
	if (inner === '') return content;
	return `${before}${OPEN[kind]}${inner}${CLOSE[kind]}${after}`;
}

/** Text as Markdown that shows exactly that text. */
export function escapeText(text: string): string {
	let out = '';
	for (let i = 0; i < text.length; i++) {
		const char = text[i]!;
		if ('\\`*[]<{}~'.includes(char)) {
			out += `\\${char}`;
		} else if (char === '_') {
			// Only an underscore between two word characters cannot be emphasis.
			const wordy = (c: string | undefined) => c !== undefined && !WHITESPACE.test(c) && !PUNCTUATION.test(c);
			out += wordy(text[i - 1]) && wordy(text[i + 1]) ? '_' : '\\_';
		} else if (char === '&' && /^&(#[0-9]+|#x[0-9a-f]+|[a-z][a-z0-9]*);/i.test(text.slice(i))) {
			out += '\\&';
		} else if (char === '\u00a0') {
			out += '&nbsp;';
		} else {
			out += char;
		}
	}
	return out;
}

/**
 * Settles emphasis and line breaks, and makes sure no line of `markdown` is
 * read as a heading, list item, quote or rule.
 */
export function finishInline(markdown: string): string {
	const settled = settleEmphasis(markdown.replace(/ {2,}/g, ' '));
	return settled
		.replace(new RegExp(`^[ ${HARD_BREAK}]+|[ ${HARD_BREAK}]+$`, 'g'), '')
		.replace(new RegExp(` *${HARD_BREAK}+ *`, 'g'), '\\\n')
		.split('\n')
		.map(escapeLineStart)
		.join('\n');
}

function escapeLineStart(line: string): string {
	if (/^[#>+=-]/.test(line)) return `\\${line}`;
	return line.replace(/^(\d{1,9})([.)])(?= |$)/, '$1\\$2');
}

/**
 * Turns each emphasis placeholder pair into `*`/`**`, or into `<em>`/`<strong>`
 * where CommonMark would not read the asterisks as emphasis: a delimiter run
 * next to punctuation on the inside must have whitespace or punctuation on the
 * outside, which fails for e.g. `這是**「重要」**的`.
 */
function settleEmphasis(text: string): string {
	const chars = [...text];
	const open: { kind: 'em' | 'strong'; at: number }[] = [];
	const replacement = new Map<number, string>();
	chars.forEach((char, at) => {
		for (const kind of ['em', 'strong'] as const) {
			if (char === OPEN[kind]) open.push({ kind, at });
			if (char === CLOSE[kind]) {
				const start = open.pop()!;
				const markdown =
					canOpen(chars[start.at - 1], chars[start.at + 1]) && canClose(chars[at - 1], chars[at + 1]);
				const [opening, closing] = markdown
					? kind === 'em'
						? ['*', '*']
						: ['**', '**']
					: [`<${kind}>`, `</${kind}>`];
				replacement.set(start.at, opening);
				replacement.set(at, closing);
			}
		}
	});
	return chars.map((char, at) => replacement.get(at) ?? char).join('');
}

type Side = 'whitespace' | 'punctuation' | 'other' | 'delimiter';

function side(char: string | undefined): Side {
	if (char === undefined || char === '\n' || char === HARD_BREAK || WHITESPACE.test(char)) return 'whitespace';
	if (PLACEHOLDER.test(char)) return 'delimiter';
	return PUNCTUATION.test(char) ? 'punctuation' : 'other';
}

/** A left-flanking delimiter run (CommonMark 6.2), not touching another one. */
function canOpen(before: string | undefined, after: string | undefined): boolean {
	const [b, a] = [side(before), side(after)];
	if (b === 'delimiter' || a === 'delimiter' || a === 'whitespace') return false;
	return a === 'other' || b === 'whitespace' || b === 'punctuation';
}

/** A right-flanking delimiter run, not touching another one. */
function canClose(before: string | undefined, after: string | undefined): boolean {
	const [b, a] = [side(before), side(after)];
	if (b === 'delimiter' || a === 'delimiter' || b === 'whitespace') return false;
	return b === 'other' || a === 'whitespace' || a === 'punctuation';
}

/** `content` as an inline code span. */
export function inlineCode(content: string): string {
	const text = content.replace(/\s+/g, ' ');
	const fence = '`'.repeat(longestRun(text, '`') + 1);
	const pad = text.startsWith('`') || text.endsWith('`') || /^ .* $/.test(text) ? ' ' : '';
	return `${fence}${pad}${text}${pad}${fence}`;
}

/** `content` as a fenced code block with the given info string. */
export function codeBlock(content: string, info: string): string {
	const fence = '`'.repeat(Math.max(3, longestRun(content, '`') + 1));
	return `${fence}${info}\n${content.replace(/\n$/, '')}\n${fence}`;
}

function longestRun(text: string, char: string): number {
	let longest = 0;
	let current = 0;
	for (const c of text) {
		current = c === char ? current + 1 : 0;
		longest = Math.max(longest, current);
	}
	return longest;
}
