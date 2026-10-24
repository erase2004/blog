// The site's Worker. Cloudflare runs it only for the home page URL, `/`
// (wrangler.jsonc, `assets.run_worker_first`), to answer the query-string
// URLs WordPress had, which `_redirects` rules cannot match; every other
// request is a static asset request that never reaches it.
//
//   /?p=ID, /?page_id=ID   301 to the post or page with that WordPress ID
//   /?attachment_id=ID     what the attachment's old file URL answers: a 301
//                          to the image Astro made of it, or to the video or
//                          PDF on R2 (_redirects rules); the 404 page for an
//                          image that did not move
//
// An ID WordPress never gave out gets the 404 page, as on WordPress.
// Anything else at `/` is the home page. The IDs come from the old-URL
// mapping table.
import { attachmentFiles, permalinks } from './lib/old-url-map';

type Env = {
	/** The site's static assets (wrangler.jsonc, `assets.binding`). */
	ASSETS: { fetch(request: Request): Promise<Response> };
};

/** Post and page URLs, by WordPress ID. */
const permalinkById = permalinks();

/** The URL WordPress served each attachment's file at, by attachment ID. */
const attachmentFileById = attachmentFiles();

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url);
		const assets = (path: string) =>
			env.ASSETS.fetch(new Request(new URL(path, url), { method: request.method, redirect: 'manual' }));
		// The 404 page, with HTTP 404, as the assets answer every URL that has no file.
		const notFound = async () => {
			const page = await assets('/404/');
			return new Response(page.body, { status: 404, headers: page.headers });
		};

		const postId = url.searchParams.get('p') ?? url.searchParams.get('page_id');
		if (postId !== null) {
			const permalink = permalinkById.get(postId);
			return permalink ? Response.redirect(new URL(permalink, url).href, 301) : notFound();
		}
		const attachmentId = url.searchParams.get('attachment_id');
		if (attachmentId !== null) {
			const file = attachmentFileById.get(attachmentId);
			return file ? assets(file) : notFound();
		}
		return env.ASSETS.fetch(request);
	},
};
