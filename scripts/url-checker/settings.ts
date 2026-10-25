// Settings of the URL checker. Paths are relative to the project root.

/** The production origin (src/consts.ts); every page's canonical URL must be on it. */
export { SITE_ORIGIN } from '../../src/consts.ts';

/**
 * What the production site must do beyond answering each expected URL,
 * checked only in HTTP mode against SITE_ORIGIN (preview URLs and local
 * servers have neither):
 *
 * - `www` redirects to it (a Cloudflare Redirect Rule): each of these paths
 *   must 301 to the same path and query string on SITE_ORIGIN;
 * - every response keeps browsers on HTTPS with a Strict-Transport-Security
 *   header fit for the HSTS preload list, which aniya.moe is on: max-age of
 *   at least a year, includeSubDomains and preload (hstspreload.org).
 */
export const PRODUCTION = {
	wwwOrigin: 'https://www.aniya.moe',
	wwwPaths: ['/', '/2021/09/30/第一篇文章/', '/?p=30'],
	hstsMinMaxAge: 31_536_000,
};

/**
 * Every page's `<title>`, as on WordPress: `<name> - TsukiStudio`, or the
 * home page's `TsukiStudio - 生活點滴紀錄`; the pages after the first of a
 * list add ` - Page N`.
 */
export const TITLE_FORMAT = {
	pattern: /^(?:.+ - TsukiStudio|TsukiStudio - 生活點滴紀錄)(?: - Page \d+)?$/,
	description: '"<name> - TsukiStudio" or "TsukiStudio - 生活點滴紀錄"',
};

/** Sitemap snapshot taken from WordPress before the move. Never changes. */
export const SITEMAP_SNAPSHOT_DIR = 'tests/fixtures/wordpress-sitemap-2026-10-24';

/** Expected URLs that are allowed to fail for now, one per line. */
export const PENDING_LIST_FILE = 'scripts/url-checker/pending.txt';

/** A URL that never existed on either site; it must answer 404. */
export const NOT_FOUND_PROBE_URL = '/url-checker/no-such-page/';

/**
 * The title of the site's 404 page, which every URL that must not exist
 * answers with (besides HTTP 404).
 */
export const NOT_FOUND_PAGE_TITLE = '找不到頁面 - TsukiStudio';

/**
 * The 404 page's own URL: Workers static assets would serve dist/404.html
 * there with HTTP 200, as a page of its own. It must answer 404 too.
 */
export const NOT_FOUND_PAGE_URL = '/404/';

/**
 * What a request for a non-ASCII path written with lowercase percent-encoding
 * (`/category/%e6%8a%80%e8%a1%93/`) must get. WordPress wrote its paths that
 * way in canonicals and links, so it is the form search engines know. Unless
 * a `_redirects` rule matches the request, Workers static assets answer it
 * with a 307 to the uppercase form (measured on the preview URL in ticket
 * 19), and only a rule whose source is in lowercase escapes matches it: the
 * site has one for each old URL with a non-ASCII path (lowercaseEncoded() in
 * src/integrations/redirects-file.ts).
 *
 * - `'301-to-final-target'`: a 301 straight to where the URL ends up: for a
 *   page (or file), its own URL in the very encoding that answers 200; for a
 *   URL that redirects, where the URL itself redirects. Two exceptions. That
 *   location passes in any encoding, as everywhere else, because the feeds'
 *   dynamic rule keeps the request's escapes: a feed 301s to its page in
 *   lowercase, which 301s on. And a URL that must not exist has nowhere to
 *   go: it may get the 307 to itself in uppercase, which answers 404.
 * - `'as-expected-or-recase-redirect'`: what the URL's expectation asks for
 *   (e.g. 200 for a page), or a redirect of any status to the same path in a
 *   different percent-encoding case: what the site gets without those rules,
 *   should the 2,000 static rules run short.
 */
export const LOWERCASE_PERCENT_ENCODED_PATHS: LowercasePercentEncodedPaths = '301-to-final-target';

export type LowercasePercentEncodedPaths = '301-to-final-target' | 'as-expected-or-recase-redirect';
