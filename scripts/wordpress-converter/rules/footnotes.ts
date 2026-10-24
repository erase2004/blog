// Footnotes → GFM footnotes `[^n]`, numbered in the order they appear in the
// post, their texts listed at the end of the file. Two kinds exist:
// - `[ref]…[/ref]` shortcodes (Footnotes plugin, 2021–22 posts and a page);
// - Gutenberg footnotes: `<sup data-fn="ID">` references in the text, the
//   texts in the post's `footnotes` metadata (JSON), listed where the
//   core/footnotes block is. The block itself is left out: the site lists
//   the footnotes at the end of the post.
import type { Context, Rule } from '../rule.ts';

/** The footnotes of the file being converted. */
type Footnotes = {
	/** Their texts as Markdown; footnote n is texts[n - 1]. */
	texts: string[];
	/** Numbers of the Gutenberg footnotes referenced so far, by ID. */
	numbers: Map<string, number>;
};

const STATE = Symbol('footnotes');

function footnotesOf(context: Context): Footnotes {
	let footnotes = context.document.state.get(STATE) as Footnotes | undefined;
	if (!footnotes) {
		footnotes = { texts: [], numbers: new Map() };
		context.document.state.set(STATE, footnotes);
	}
	return footnotes;
}

/** A reference to a new footnote with this text (Markdown); returns its number. */
function addFootnote(context: Context, text: string): number {
	const { texts } = footnotesOf(context);
	texts.push(text);
	return texts.length;
}

/** The Gutenberg footnotes of the post (HTML), by ID, in the order WordPress lists them. */
function gutenbergFootnotes(context: Context): Map<string, string> {
	const [json] = context.entry && context.site ? context.site.meta(context.entry.id, 'footnotes') : [];
	const notes = json ? (JSON.parse(json) as { id: string; content: string }[]) : [];
	return new Map(notes.map(({ id, content }) => [id, content]));
}

export const footnotes: Rule = {
	blocks: {
		'core/footnotes': () => '',
	},
	elements: {
		'sup[data-fn]': (element, context) => {
			const id = element.getAttribute('data-fn')!;
			const { numbers } = footnotesOf(context);
			if (!numbers.has(id)) {
				const content = gutenbergFootnotes(context).get(id);
				if (content === undefined) return context.unconvertedInline('sup[data-fn]', element.toString());
				numbers.set(id, addFootnote(context, context.inline(content)));
			}
			return `[^${numbers.get(id)}]`;
		},
	},
	shortcodes: {
		ref: (shortcode, context) => `[^${addFootnote(context, context.inline(shortcode.content ?? ''))}]`,
	},
	finish: (context) => {
		const { texts, numbers } = footnotesOf(context);
		for (const id of gutenbergFootnotes(context).keys()) {
			if (!numbers.has(id)) throw new Error(`${context.entry!.type} ${context.entry!.id}: footnote ${id} is never referenced`);
		}
		if (texts.length === 0) return;
		context.document.footer.push(texts.map((text, i) => `[^${i + 1}]: ${text}`).join('\n'));
	},
};
