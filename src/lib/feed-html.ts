// A post's HTML as feed readers get it: they show it on their own, away
// from the site, often several posts on one page.
import { type HTMLElement, parse } from 'node-html-parser';

/** Attributes that name other elements by ID. */
const ID_REFERENCES = ['aria-describedby', 'aria-labelledby'];

/**
 * What only works with the site's scripts and stylesheets, e.g. the ones
 * Expressive Code puts in the first code block, and its copy button.
 */
const SITE_ONLY = 'script, style, link, button, template';

/**
 * `html`, rendered at `postUrl`, for a feed:
 *   - without scripts, stylesheets, and the controls, custom elements, data
 *     attributes and inline styles that work with them;
 *   - every link and image URL is absolute, links within the post
 *     (footnotes) included: they go to the place on the post page;
 *   - every ID starts with `idPrefix`, and so do the ARIA references to them
 *     (the footnote references' label), so that the IDs of posts shown
 *     together differ (footnote 1 of each post is `user-content-fn-1`).
 */
export function feedHtml(html: string, { postUrl, idPrefix }: { postUrl: URL; idPrefix: string }): string {
	const root = parse(html, { comment: false });
	for (const element of root.querySelectorAll(SITE_ONLY)) element.remove();
	// Data attributes, a quarter of a feed's size, are for the site's scripts
	// and stylesheets; inline styles only set the stylesheets' variables.
	for (const element of root.querySelectorAll('*')) {
		for (const name of Object.keys(element.attributes)) {
			if (name.startsWith('data-') || name === 'style') element.removeAttribute(name);
		}
	}
	// Custom elements (web components) are nothing without their scripts:
	// what they contain takes their place.
	for (const element of root.querySelectorAll('*').filter(({ rawTagName }) => rawTagName.includes('-'))) {
		element.replaceWith(...element.childNodes);
	}

	// Links within the post (`#user-content-fn-1`) too: readers resolve them
	// differently, but all of them follow a link to the post page.
	const absolute = (url: string) => new URL(url, postUrl).href;
	for (const element of root.querySelectorAll('[href], [src], [poster], [srcset]')) {
		for (const name of ['href', 'src', 'poster']) {
			const url = element.getAttribute(name);
			if (url !== undefined) setAttribute(element, name, absolute(url));
		}
		const srcset = element.getAttribute('srcset');
		if (srcset !== undefined) setAttribute(element, 'srcset', mapSrcset(srcset, absolute));
	}
	for (const element of root.querySelectorAll('[id]')) {
		setAttribute(element, 'id', idPrefix + element.id);
	}
	for (const name of ID_REFERENCES) {
		for (const element of root.querySelectorAll(`[${name}]`)) {
			const ids = element.getAttribute(name)!.split(/\s+/).filter(Boolean);
			setAttribute(element, name, ids.map((id) => idPrefix + id).join(' '));
		}
	}
	return root.toString();
}

/** A `srcset` with each candidate's URL replaced; `a.webp 640w, b.webp 1280w`. */
function mapSrcset(srcset: string, replace: (url: string) => string): string {
	return srcset
		.split(',')
		.map((candidate) => {
			const [url, ...descriptors] = candidate.trim().split(/\s+/);
			return [replace(url!), ...descriptors].join(' ');
		})
		.join(', ');
}

/** Sets an attribute to a value: node-html-parser escapes its quotes, but not its `&`. */
function setAttribute(element: HTMLElement, name: string, value: string): void {
	element.setAttribute(name, value.replaceAll('&', '&amp;'));
}
