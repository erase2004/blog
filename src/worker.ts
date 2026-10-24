// The site's Worker. Cloudflare runs it only for the home page URL, `/`
// (wrangler.jsonc, `assets.run_worker_first`), to answer the query-string
// URLs WordPress had, which `_redirects` rules cannot match; every other
// request is a static asset request that never reaches it.
//
//   /?p=ID, /?page_id=ID   301 to the post or page with that WordPress ID
//
// An ID WordPress never gave out gets the 404 page, as on WordPress.
// Anything else at `/` is the home page.
import { content } from './data/old-url-map.json';

type Env = {
	/** The site's static assets (wrangler.jsonc, `assets.binding`). */
	ASSETS: { fetch(request: Request): Promise<Response> };
};

/** Post and page URLs by WordPress ID, from the old-URL mapping table. */
const permalinks = new Map(content.map(({ wordpressId, url }) => [String(wordpressId), url]));

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url);
		for (const key of ['p', 'page_id']) {
			const id = url.searchParams.get(key);
			if (id === null) continue;
			const permalink = permalinks.get(id);
			return permalink ? Response.redirect(new URL(permalink, url).href, 301) : notFound(url, env);
		}
		return env.ASSETS.fetch(request);
	},
};

/** The 404 page, with HTTP 404, as the assets answer every URL that has no file. */
async function notFound(url: URL, env: Env): Promise<Response> {
	const page = await env.ASSETS.fetch(new Request(new URL('/404/', url)));
	return new Response(page.body, { status: 404, headers: page.headers });
}
