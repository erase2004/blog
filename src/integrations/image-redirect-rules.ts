// The `_redirects` rules for the moved images: each old upload path and
// attachment page in the mapping table's `images` section → the image Astro
// made of the file (its URL has a hash, so the rules are made at build time).
// Built as a page so that it can use Astro's images; the image-redirects
// integration moves it into _redirects.
import type { APIRoute } from 'astro';
import table from '../data/old-url-map.json';
import { imageAt, imageUrl } from '../lib/images';

export const prerender = true;

export const GET: APIRoute = async () => {
	const rules: string[] = [];
	for (const { file, uploads, attachmentPage } of table.images) {
		const url = await imageUrl(await imageAt(file));
		// Query strings (/?attachment_id=) are the Worker's to answer.
		for (const old of [...uploads, attachmentPage].filter((path) => !path.includes('?'))) {
			rules.push(`${encodeURI(old)} ${url} 301`);
		}
	}
	return new Response(rules.map((rule) => `${rule}\n`).join(''));
};
