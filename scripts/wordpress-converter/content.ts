// Converts the Gutenberg content of one post or page to Markdown, by handing
// each block, HTML element and shortcode to the rule registered for it in
// rules/index.ts. Whatever no rule converts stays in the output as a visible
// `wp-unconverted` marker, so nothing is lost silently.
import { type Block, parseBlocks } from './blocks.ts';
import { type HTMLElement, isElement, isText, type Node, outerHtml, parseHtml, rawHtml, tagOf } from './html.ts';
import { codeBlock, emphasis, escapeText, finishInline, HARD_BREAK, inlineCode } from './markdown.ts';
import { type Context, type DocumentParts, type Rule, type Shortcode, UNCONVERTED } from './rule.ts';
import * as registered from './rules/index.ts';
import { SITE_ORIGIN } from './settings.ts';
import { siteRelative } from './site-urls.ts';
import type { Post, WordPressSite } from './wordpress.ts';

export type ConvertedContent = {
	/** The file body: MDX imports (if any), the converted blocks, the footer. */
	markdown: string;
	/** Whether the file must be MDX. */
	mdx: boolean;
	/** What was kept as `wp-unconverted` markers. */
	unconverted: { kind: string; source: string }[];
};

type Registry = {
	blocks: Map<string, NonNullable<Rule['blocks']>[string]>;
	elements: Map<string, NonNullable<Rule['elements']>[string]>;
	shortcodes: Map<string, NonNullable<Rule['shortcodes']>[string]>;
	finishers: NonNullable<Rule['finish']>[];
};

/** The registry of rules/index.ts, checked for two rules claiming the same block, element or shortcode. */
export function createRegistry(rules: Rule[] = Object.values(registered)): Registry {
	const registry: Registry = { blocks: new Map(), elements: new Map(), shortcodes: new Map(), finishers: [] };
	for (const rule of rules) {
		for (const kind of ['blocks', 'elements', 'shortcodes'] as const) {
			for (const [key, convert] of Object.entries(rule[kind] ?? {})) {
				if (registry[kind].has(key)) throw new Error(`Two rules convert ${kind} "${key}"`);
				registry[kind].set(key, convert as never);
			}
		}
		if (rule.finish) registry.finishers.push(rule.finish);
	}
	return registry;
}

const defaultRegistry = createRegistry();

/** The shortcodes the rules handle (the ones WordPress had registered and the content uses). */
export function shortcodeNames(): string[] {
	return [...defaultRegistry.shortcodes.keys()];
}

export function convertContent(
	html: string,
	{ entry, site, registry = defaultRegistry }: { entry?: Post; site?: WordPressSite; registry?: Registry } = {},
): ConvertedContent {
	const unconverted: ConvertedContent['unconverted'] = [];
	const document: DocumentParts = { imports: new Set(), footer: [], mdx: false, state: new Map() };
	const shortcodes = new Map<number, Shortcode>();
	const siteOrigin = site?.option('home') ?? SITE_ORIGIN;

	const context: Context = {
		entry,
		site,
		document,
		blocks: (blocks) =>
			blocks
				.map((block) => convertBlock(block).trim())
				.filter((markdown) => markdown !== '')
				.join('\n\n'),
		parse: (fragment) => parseHtml(extractShortcodes(fragment)),
		inline: (content) => finishInline(inlineNodes(nodesOf(content))),
		rawHtml: (content) => rawHtml(nodesOf(content), context.url),
		emphasis: (kind, nodes) => emphasis(kind, inlineNodes(nodes)),
		lineBreak: HARD_BREAK,
		url: (href) => siteRelative(href, siteOrigin),
		unconverted: (block, details) => {
			const kind = block.name ?? 'freeform HTML';
			unconverted.push({ kind, source: block.source });
			const content = details === undefined ? block.source : `${block.source}\n${details}`;
			return codeBlock(content, `html title="${UNCONVERTED}: ${kind}"`);
		},
		unconvertedInline: (kind, source) => {
			unconverted.push({ kind, source });
			return inlineCode(`${UNCONVERTED}: ${source}`);
		},
	};

	function nodesOf(content: string | Node[]): Node[] {
		return typeof content === 'string' ? context.parse(content) : content;
	}

	function convertBlock(block: Block): string {
		if (block.name === null) return context.unconverted(block);
		const convert = registry.blocks.get(block.name);
		return convert ? convert(block, context) : context.unconverted(block);
	}

	function inlineNodes(nodes: Node[]): string {
		return nodes
			.map((node) => {
				if (isText(node)) return escapeText(node.text.replace(/[ \t\n\r\f]+/g, ' '));
				if (!isElement(node)) return '';
				if (tagOf(node) === SHORTCODE_TAG) {
					const shortcode = shortcodes.get(Number(node.getAttribute('data-n')))!;
					return registry.shortcodes.get(shortcode.name)!(shortcode, context);
				}
				return convertElement(node);
			})
			.join('');
	}

	function convertElement(element: HTMLElement): string {
		const tag = tagOf(element);
		const byAttribute = Object.keys(element.attributes)
			.map((attribute) => registry.elements.get(`${tag}[${attribute}]`))
			.find((convert) => convert !== undefined);
		const convert = byAttribute ?? registry.elements.get(tag);
		return convert ? convert(element, context) : context.unconvertedInline(tag, outerHtml(element));
	}

	/** Replaces the registered shortcodes in `fragment` with `<wp-shortcode data-n="…">` placeholders. */
	function extractShortcodes(fragment: string): string {
		if (registry.shortcodes.size === 0) return fragment;
		const names = [...registry.shortcodes.keys()].map((name) => name.replace(/[-]/g, '\\-')).join('|');
		// [name attributes]content[/name], or [name attributes] alone (WordPress's get_shortcode_regex, simplified).
		const pattern = new RegExp(`\\[(${names})(?![\\w-])([^\\]]*?)(?:\\/\\]|\\](?:([\\s\\S]*?)\\[\\/\\1\\])?)`, 'g');
		return fragment.replace(pattern, (source, name: string, attributes: string, content?: string) => {
			const n = shortcodes.size;
			shortcodes.set(n, { name, attributes: shortcodeAttributes(attributes), content: content ?? null, source });
			return `<${SHORTCODE_TAG} data-n="${n}"></${SHORTCODE_TAG}>`;
		});
	}

	const body = context.blocks(parseBlocks(html));
	for (const finish of registry.finishers) finish(context);
	const imports = [...document.imports].sort().join('\n');
	const markdown = [imports, body, ...document.footer].filter((part) => part !== '').join('\n\n');
	return {
		markdown: markdown === '' ? '' : `${markdown}\n`,
		mdx: document.mdx || document.imports.size > 0,
		unconverted,
	};
}

const SHORTCODE_TAG = 'wp-shortcode';

function shortcodeAttributes(text: string): Record<string, string> {
	const attributes: Record<string, string> = {};
	for (const [, name, double, single, bare] of text.matchAll(/([\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|(\S+))/g)) {
		attributes[name!.toLowerCase()] = double ?? single ?? bare ?? '';
	}
	return attributes;
}
