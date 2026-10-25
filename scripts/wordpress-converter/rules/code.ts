// Code blocks (core/code, written with the Code Syntax Block plugin) become
// fenced code for Expressive Code: the language is kept, and the `title`
// attribute becomes the file name title.
//   <pre title="src/router/index.js" class="wp-block-code"><code lang="javascript" …>
//   → ```javascript title="src/router/index.js"
import { findElement, parseHtml } from '../html.ts';
import { codeBlock } from '../markdown.ts';
import type { Rule } from '../rule.ts';

/** Prism's language names (the plugin's) that Shiki (Expressive Code's) calls otherwise. */
const SHIKI_LANGUAGES: Record<string, string> = { markup: 'html' };

export const code: Rule = {
	blocks: {
		'core/code': (block, context) => {
			// Not context.parse(): text that looks like a shortcode is code here.
			const pre = findElement(parseHtml(block.innerHTML), 'pre');
			const element = pre && findElement(parseHtml(pre.innerHTML), 'code');
			if (!element) return context.unconverted(block);
			const lang = element.getAttribute('lang');
			const language = lang && (SHIKI_LANGUAGES[lang] ?? lang);
			const title = pre.getAttribute('title');
			const info = [language, title && `title="${title}"`].filter(Boolean).join(' ');
			return codeBlock(element.text, info);
		},
	},
};
