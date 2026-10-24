// The expected list: every URL the WordPress site had, and what the new site
// must answer for it. Two sources:
//   - the sitemap snapshot taken before the move (fixed, never changes);
//   - the old-URL mapping table, generated from the WordPress backup by the
//     converter (scripts/wordpress-converter/).
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { NOT_FOUND_PAGE_URL, NOT_FOUND_PROBE_URL, SITE_ORIGIN } from './settings.ts';

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

const KINDS = new Set(['page', 'file', 'redirect', 'not-found']);

export function loadExpectedUrls({
	sitemapDir,
	mappingTableFile,
}: {
	sitemapDir: string;
	mappingTableFile?: string;
}): ExpectedUrl[] {
	const expected = new Map<string, { entry: ExpectedUrl; source: string }>();
	const add = (entry: ExpectedUrl, source: string) => {
		const existing = expected.get(entry.url);
		if (existing && !isDeepStrictEqual(existing.entry, entry)) {
			throw new Error(
				`Conflicting expectations for ${entry.url}: ${JSON.stringify(existing.entry)} ` +
					`(${existing.source}) and ${JSON.stringify(entry)} (${source})`,
			);
		}
		expected.set(entry.url, existing ?? { entry, source });
	};

	add({ url: NOT_FOUND_PROBE_URL, expect: 'not-found' }, 'url checker');
	add({ url: NOT_FOUND_PAGE_URL, expect: 'not-found' }, 'url checker');
	for (const entry of fromSitemapSnapshot(sitemapDir)) add(entry, 'sitemap snapshot');
	if (mappingTableFile !== undefined && existsSync(mappingTableFile)) {
		for (const entry of fromMappingTable(mappingTableFile)) add(entry, mappingTableFile);
	}
	return [...expected.values()].map(({ entry }) => entry);
}

function fromSitemapSnapshot(sitemapDir: string): ExpectedUrl[] {
	const expected: ExpectedUrl[] = [{ url: '/robots.txt', expect: 'file' }];
	// robots.txt names the sitemap index; the new site keeps the index's URL for
	// its own sitemap, and every old sub-sitemap redirects there.
	const robots = readFileSync(join(sitemapDir, 'robots.txt'), 'utf8');
	for (const [, sitemapUrl] of robots.matchAll(/^Sitemap:\s*(\S+)/gim)) {
		const sitemapIndex = toPath(sitemapUrl!);
		expected.push({ url: sitemapIndex, expect: 'file' });
		const index = readFileSync(join(sitemapDir, fileName(sitemapIndex)), 'utf8');
		for (const subSitemap of locs(index, 'loc').map(toPath)) {
			expected.push({ url: subSitemap, expect: 'redirect', location: sitemapIndex });
			const xml = readFileSync(join(sitemapDir, fileName(subSitemap)), 'utf8');
			for (const [, entry] of xml.matchAll(/<url>([\s\S]*?)<\/url>/g)) {
				expected.push({ url: toPath(locs(entry!, 'loc')[0]!), expect: 'page' });
				for (const image of locs(entry!, 'image:loc').map(toPath)) {
					expected.push({ url: image, expect: 'redirect' });
				}
			}
		}
	}
	return expected;
}

/**
 * Reads the part of the old-URL mapping table the checker needs, a `urls`
 * array of entries shaped like `ExpectedUrl`:
 *
 *   { "urls": [
 *     { "url": "/?p=1854", "expect": "redirect", "location": "/2026/01/23/acgn-museum-ssg/" },
 *     { "url": "/wp-content/uploads/2026/01/fcp-01.png", "expect": "redirect" },
 *     { "url": "/2026/01/", "expect": "page" },
 *     { "url": "/feed/", "expect": "file" },
 *     { "url": "/wp-admin/", "expect": "not-found" }
 *   ] }
 *
 * `url` and `location` are paths, in UTF-8 or percent-encoded; a `location` on
 * another site is a full URL. The table's other keys (`content`, and the
 * sections later tickets add) hold the facts behind these URLs and are
 * ignored here; see scripts/wordpress-converter/mapping-table.ts.
 */
function fromMappingTable(file: string): ExpectedUrl[] {
	const table = JSON.parse(readFileSync(file, 'utf8')) as { urls?: unknown };
	if (!Array.isArray(table.urls)) {
		throw new Error(`${file}: expected a "urls" array`);
	}
	return table.urls.map((entry: Record<string, unknown>, index) => {
		const where = `${file}: urls[${index}]`;
		if (typeof entry.url !== 'string' || !KINDS.has(entry.expect as string)) {
			throw new Error(`${where}: needs "url" and "expect" (one of ${[...KINDS].join(', ')})`);
		}
		const url = toPath(entry.url);
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
			location: location.origin === SITE_ORIGIN ? toPath(entry.location) : location.href,
		};
	});
}

/** The snapshot keeps each sitemap under its URL's last path segment. */
function fileName(path: string): string {
	return path.slice(path.lastIndexOf('/') + 1);
}

function locs(xml: string, tag: string): string[] {
	const pattern = new RegExp(`<${tag}>\\s*<!\\[CDATA\\[(.*?)\\]\\]>\\s*</${tag}>`, 'g');
	return [...xml.matchAll(pattern)].map(([, loc]) => loc!);
}

/** `https://aniya.moe/%E6%8A%80/?a=1` and `/技/?a=1` both become `/技/?a=1`. */
function toPath(url: string): string {
	const { pathname, search } = new URL(url, SITE_ORIGIN);
	return decodeURI(pathname) + search;
}
