// The interface of a conversion rule: one module under rules/ per concern
// (paragraphs, lists, images, galleries, …), registered in rules/index.ts.
import type { Block } from './blocks.ts';
import type { HTMLElement, Node } from './html.ts';
import type { Post, WordPressSite } from './wordpress.ts';

export type Rule = {
	/**
	 * Gutenberg blocks this rule converts, by block name (`core/paragraph`,
	 * `envira/envira-gallery`). Returns Markdown; '' leaves the block out.
	 */
	blocks?: Record<string, (block: Block, context: Context) => string>;
	/**
	 * HTML elements inside text (paragraphs, headings, list items, captions),
	 * by tag name, or `tag[attribute]` for the elements that have that
	 * attribute (`sup[data-fn]`), which takes precedence. Returns inline Markdown.
	 */
	elements?: Record<string, (element: HTMLElement, context: Context) => string>;
	/** Shortcodes inside text, by name (`ref` for `[ref]…[/ref]`). Returns inline Markdown. */
	shortcodes?: Record<string, (shortcode: Shortcode, context: Context) => string>;
	/** Runs once all blocks of a post or page are converted, e.g. to add footnote definitions. */
	finish?: (context: Context) => void;
};

export type Shortcode = {
	name: string;
	attributes: Record<string, string>;
	/** The HTML between `[name]` and `[/name]`; null for a shortcode without a closing tag. */
	content: string | null;
	/** The shortcode as written. */
	source: string;
};

/** What a rule gets to work with while converting one post or page. */
export type Context = {
	/** The post or page being converted (undefined when converting loose HTML, as in tests). */
	readonly entry: Post | undefined;
	/** Everything read from the WordPress backup (undefined when converting loose HTML). */
	readonly site: WordPressSite | undefined;
	/** Parts of the output file besides the converted blocks. */
	readonly document: DocumentParts;
	/** Blocks as Markdown, separated by blank lines. */
	blocks(blocks: Block[]): string;
	/** An HTML fragment as nodes; shortcodes registered by rules become `<wp-shortcode>` elements. */
	parse(html: string): Node[];
	/** Text content (HTML or nodes) as inline Markdown, trimmed. */
	inline(content: string | Node[]): string;
	/** Text content as raw HTML that means the same in .md and .mdx files (for tables, `<ruby>`). */
	rawHtml(content: string | Node[]): string;
	/** Nodes as emphasis (`em`) or strong emphasis (`strong`). */
	emphasis(kind: 'em' | 'strong', nodes: Node[]): string;
	/** Inline Markdown for a line break (`<br>`). */
	readonly lineBreak: string;
	/** A link target: absolute URLs of the site itself become site-relative paths. */
	url(href: string): string;
	/** Keeps a block the converter cannot convert (yet) visibly in the output. */
	unconverted(block: Block, details?: string): string;
	/** Keeps text content the converter cannot convert (yet) visibly in the output. */
	unconvertedInline(kind: string, source: string): string;
};

export type DocumentParts = {
	/** MDX import lines; any import makes the file MDX. */
	imports: Set<string>;
	/** Markdown added after the converted blocks, e.g. footnote definitions. */
	footer: string[];
	/** Makes the file MDX even without imports. */
	mdx: boolean;
	/** Per-file state for rules; each rule keys it with something it owns. */
	state: Map<unknown, unknown>;
};

/** Markers left for what was not converted, by kind (block name, `[ref]`, `img`, …). */
export const UNCONVERTED = 'wp-unconverted';
