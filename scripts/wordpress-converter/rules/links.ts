// Links become Markdown links. Links to the site itself become site-relative
// (`https://aniya.moe/about/` → `/about/`); target, rel and data attributes
// are dropped, non-empty titles kept.
import type { Rule } from '../rule.ts';

export const links: Rule = {
	elements: {
		a: (element, context) => {
			const text = context.inline(element.childNodes);
			const href = element.getAttribute('href');
			if (!href) return text;
			const title = element.getAttribute('title');
			const titlePart = title ? ` "${title.replace(/["\\]/g, '\\$&')}"` : '';
			return `[${text}](${destination(context.url(href))}${titlePart})`;
		},
	},
};

function destination(url: string): string {
	if (!/[\s()<>]/.test(url)) return url;
	return `<${url.replaceAll('<', '%3C').replaceAll('>', '%3E')}>`;
}
