// Renders Markdown the way Astro does (Sätteri, with GFM and smart
// punctuation, Astro's defaults), and checks that it also compiles as MDX.
import { markdownToHtml, mdxToJs } from 'satteri';

const features = { gfm: true, smartPunctuation: true };

/** The HTML a reader gets for this Markdown in an .md file. */
export function renderMarkdown(markdown: string): string {
	return markdownToHtml(markdown, { features }).html.trim();
}

/** Throws unless this Markdown is also valid MDX. */
export function compileMdx(markdown: string): void {
	mdxToJs(markdown, { features });
}
