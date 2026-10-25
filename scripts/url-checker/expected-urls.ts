// The expected list: every URL the WordPress site had, and what the new site
// must answer for it. Two sources:
//   - the sitemap snapshot taken before the move (fixed, never changes);
//   - the old-URL mapping table, generated from the WordPress backup by the
//     converter (scripts/wordpress-converter/), read in src/lib/old-url-map.ts.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { type ExpectedUrl, expectedUrls } from '../../src/lib/old-url-map.ts';
import { NOT_FOUND_PAGE_URL, NOT_FOUND_PROBE_URL, SITE_ORIGIN } from './settings.ts';

export type { ExpectedUrl };

/**
 * The URLs of the snapshot, then those of the mapping table (`oldUrlMap`, or
 * a table of a test's own), if given.
 */
export function loadExpectedUrls({
	sitemapDir,
	mappingTable,
}: {
	sitemapDir: string;
	mappingTable?: { urls?: unknown };
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
	if (mappingTable !== undefined) {
		for (const entry of expectedUrls(mappingTable)) add(entry, 'old-URL mapping table');
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
