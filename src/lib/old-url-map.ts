// The old-URL mapping table, src/data/old-url-map.json: what became of every
// URL the WordPress site had, written by `npm run convert-wordpress` (see
// scripts/wordpress-converter/mapping-table.ts). Everything that reads the
// table reads it here: the `_redirects` integrations, the Worker, the URL
// checker and the R2 media scripts.
//
// The table is imported, not read from disk, so that the Worker has it too:
// Node (which runs the scripts as they are, so imports here name their file
// extensions), Vite and esbuild (wrangler) all take a JSON import with
// `type: 'json'`.
import { SITE_ORIGIN } from '../consts.ts';
import json from '../data/old-url-map.json' with { type: 'json' };

/** What the new site must answer for an old URL. */
export type ExpectedUrl = {
	/** Path (plus query string, if any), with non-ASCII characters as UTF-8, e.g. `/category/技術/`. */
	url: string;
} & (
	| /** HTTP 200 with an HTML page. */
	{ expect: 'page' }
	| /** HTTP 200 with any content (robots.txt, sitemap, feeds). */
	{ expect: 'file' }
	| /**
	 * HTTP 301 to `location`, or, without `location`, to any URL on the same
	 * site that answers 200 (e.g. an image whose new URL is only known after
	 * the build).
	 */
	{ expect: 'redirect'; location?: string }
	| /** HTTP 404. */
	{ expect: 'not-found' }
);

/** A post or page: its WordPress ID, and its URL on both sites. */
export interface ContentEntry {
	wordpressId: number;
	type: 'post' | 'page';
	title: string;
	/** UTF-8: `/2021/09/30/第一篇文章/`. */
	url: string;
	/** Its content file, from the project root. */
	file: string;
	oldSlugs: string[];
	oldDates: string[];
}

/** An image that moved to the uniform image directory. */
export interface MovedImage {
	/** The attachment's ID on WordPress. */
	wordpressId: number;
	/** Where it is now, from the project root: `src/assets/images/<slug>/<file>`. */
	file: string;
	/** The URL paths WordPress served it at (the file, its `-scaled` copy, …), UTF-8; the first is its file's. */
	uploads: string[];
	/** Its attachment page; `/?attachment_id=ID` for an image that had no other. */
	attachmentPage: string;
}

/** An image nothing used, which did not move: its old URLs answer 404. */
export interface UnusedImage {
	wordpressId: number;
	uploads: string[];
	attachmentPage?: string;
}

/** A video or the PDF, moved to R2 (ticket 07). */
export type MediaFile = {
	/** The attachment's ID on WordPress. */
	wordpressId: number;
	/** The post or page the file belongs to; its folder on R2 is named after it. */
	post: string;
	/** The old URL path of the file, UTF-8: `/wp-content/uploads/2025/05/20250426_103131827.mp4`. */
	upload: string;
	/** The old URL of its attachment page, if it had one. */
	attachmentPage?: string;
	/** Its URL on R2, UTF-8: `https://media.aniya.moe/videos/travel-setonaikai-2025-day7/20250426_103131827.mp4`. */
	url: string;
	contentType: string;
	bytes: number;
};

/** The table's sections. `urls` is checked by expectedUrls(), `media` by mediaFiles(). */
export interface OldUrlMap {
	content: ContentEntry[];
	images: MovedImage[];
	unusedImages: UnusedImage[];
	media: unknown;
	urls: unknown;
}

export const oldUrlMap = json as unknown as OldUrlMap;

const KINDS = new Set(['page', 'file', 'redirect', 'not-found']);

/**
 * The table's `urls`: every old URL the table names, with what the new site
 * must answer for it. `url` and `location` are paths, in UTF-8 or
 * percent-encoded in the table, and UTF-8 here; a `location` on another site
 * is a full URL:
 *
 *   { "urls": [
 *     { "url": "/?p=1854", "expect": "redirect", "location": "/2026/01/23/acgn-museum-ssg/" },
 *     { "url": "/wp-content/uploads/2026/01/fcp-01.png", "expect": "redirect" },
 *     { "url": "/2026/01/", "expect": "page" },
 *     { "url": "/feed/", "expect": "file" },
 *     { "url": "/wp-admin/", "expect": "not-found" }
 *   ] }
 *
 * Throws on an entry of another shape. `table` is for tests.
 */
export function expectedUrls(table: { urls?: unknown } = oldUrlMap): ExpectedUrl[] {
	if (!Array.isArray(table.urls)) {
		throw new Error('the old-URL mapping table has no "urls" array');
	}
	return table.urls.map((entry: Record<string, unknown>, index) => {
		const where = `the old-URL mapping table's urls[${index}]`;
		if (typeof entry.url !== 'string' || !KINDS.has(entry.expect as string)) {
			throw new Error(`${where}: needs "url" and "expect" (one of ${[...KINDS].join(', ')})`);
		}
		const url = sitePath(entry.url);
		if (entry.location === undefined) {
			return { url, expect: entry.expect } as ExpectedUrl;
		}
		if (entry.expect !== 'redirect' || typeof entry.location !== 'string') {
			throw new Error(`${where}: "location" is a string, and only for "redirect"`);
		}
		const location = new URL(entry.location, SITE_ORIGIN);
		return {
			url,
			expect: 'redirect',
			location: location.origin === SITE_ORIGIN ? sitePath(entry.location) : location.href,
		};
	});
}

/** The table's `media`: the videos and the PDF on R2. Throws on an entry without the fields the scripts need. */
export function mediaFiles(table: { media?: unknown } = oldUrlMap): MediaFile[] {
	if (!Array.isArray(table.media)) throw new Error('the old-URL mapping table has no "media" array');
	return table.media.map((entry: Record<string, unknown>, index) => {
		const fields = { upload: 'string', url: 'string', contentType: 'string', bytes: 'number' };
		for (const [name, type] of Object.entries(fields)) {
			if (typeof entry[name] !== type) {
				throw new Error(`the old-URL mapping table's media[${index}] needs "${name}" (${type})`);
			}
		}
		return entry as MediaFile;
	});
}

/** The old URLs of a moved image or of a file on R2: its upload paths, then its attachment page if it had one. */
export function oldUrlsOf(file: MovedImage | UnusedImage | MediaFile): string[] {
	const uploads = 'uploads' in file ? file.uploads : [file.upload];
	return file.attachmentPage ? [...uploads, file.attachmentPage] : uploads;
}

/** The URL of each post and page, by its WordPress ID. */
export function permalinks(): Map<string, string> {
	return new Map(oldUrlMap.content.map(({ wordpressId, url }) => [String(wordpressId), url]));
}

/** The URL WordPress served each attachment's file at (moved or not), by the attachment's ID. */
export function attachmentFiles(): Map<string, string> {
	return new Map([
		...[...oldUrlMap.images, ...oldUrlMap.unusedImages].map(({ wordpressId, uploads }) => [String(wordpressId), uploads[0]!] as const),
		...mediaFiles().map(({ wordpressId, upload }) => [String(wordpressId), upload] as const),
	]);
}

/** `https://aniya.moe/%E6%8A%80/?a=1` and `/技/?a=1` both become `/技/?a=1`. */
function sitePath(url: string): string {
	const { pathname, search } = new URL(url, SITE_ORIGIN);
	return decodeURI(pathname) + search;
}
