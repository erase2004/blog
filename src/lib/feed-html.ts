// A post's HTML as feed readers get it: they show it on their own, away
// from the site, often several posts on one page.
import { parse } from 'node-html-parser';

/** Attributes that name other elements by ID. */
const ID_REFERENCES = ['aria-describedby', 'aria-labelledby'];

/**
 * What only works with the site's scripts and stylesheets, e.g. the ones
 * Expressive Code puts in the first code block, and its copy button.
 */
const SITE_ONLY = 'script, style, link, button, template';

/**
 * `html`, rendered at `postUrl`, for a feed:
 *   - without scripts, stylesheets, and controls, custom elements and data
 *     attributes for them;
 *   - every link and image URL is absolute;
 *   - every ID starts with `idPrefix`, and so do the links to them (`#…`),
 *     so that the IDs of posts shown together differ (footnote 1 of each
 *     post is `user-content-fn-1`).
 */
export function feedHtml(html: string, { postUrl, idPrefix }: { postUrl: URL; idPrefix: string }): string {
	const root = parse(html, { comment: false });
	for (const element of root.querySelectorAll(SITE_ONLY)) element.remove();
	// Data attributes are for the site's scripts and stylesheets, and a quarter
	// of a feed's size.
	for (const element of root.querySelectorAll('*')) {
		for (const name of Object.keys(element.attributes).filter((name) => name.startsWith('data-'))) {
			element.removeAttribute(name);
		}
	}
	// Custom elements (web components) are nothing without their scripts:
	// what they contain takes their place.
	for (const element of root.querySelectorAll('*').filter(({ rawTagName }) => rawTagName.includes('-'))) {
		element.replaceWith(...element.childNodes);
	}
	const absolute = (url: string) => (url.startsWith('#') ? `#${idPrefix}${url.slice(1)}` : new URL(url, postUrl).href);
	for (const element of root.querySelectorAll('[href], [src], [poster], [srcset]')) {
		for (const name of ['href', 'src', 'poster']) {
			const url = element.getAttribute(name);
			if (url !== undefined) element.setAttribute(name, absolute(url));
		}
		const srcset = element.getAttribute('srcset');
		if (srcset !== undefined) element.setAttribute('srcset', mapSrcset(srcset, absolute));
	}
	for (const element of root.querySelectorAll('[id]')) {
		element.id = idPrefix + element.id;
	}
	for (const name of ID_REFERENCES) {
		for (const element of root.querySelectorAll(`[${name}]`)) {
			const ids = element.getAttribute(name)!.split(/\s+/).filter(Boolean);
			element.setAttribute(name, ids.map((id) => idPrefix + id).join(' '));
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
