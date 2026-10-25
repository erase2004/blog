// The `_redirects` rules for the moved images: each old upload path and
// attachment page in the mapping table's `images` section → the image Astro
// made of the file (its URL has a hash, so the rules are made at build time),
// also in the lowercase percent-encoding WordPress linked them with.
// Built as a page, a JSON list of rules, so that it can use Astro's images;
// the image-redirects integration moves them into _redirects.
import type { APIRoute } from 'astro';
import { imageAt, imageUrl } from '../lib/images';
import { oldUrlMap, oldUrlsOf } from '../lib/old-url-map';
import { lowercaseEncoded, type RedirectRule } from './redirects-file';

export const prerender = true;

export const GET: APIRoute = async () => {
	const rules: RedirectRule[] = [];
	for (const image of oldUrlMap.images) {
		// Astro gives the URL percent-encoded; rules take UTF-8.
		const to = decodeURI(await imageUrl(await imageAt(image.file)));
		// Query strings (/?attachment_id=) are the Worker's to answer.
		for (const old of oldUrlsOf(image).filter((path) => !path.includes('?'))) {
			for (const from of [old, lowercaseEncoded(old)].filter((path) => path !== null)) {
				rules.push({ from, to, status: 301 });
			}
		}
	}
	return new Response(JSON.stringify(rules));
};
