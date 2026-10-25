// Site-wide settings, most of them carried over from the WordPress site.

/**
 * The site's origin, where WordPress was: canonical URLs, feeds and the
 * sitemap are on it (`site` in astro.config.mjs). The URL checker and the
 * WordPress converter use it too, so this file imports nothing.
 */
export const SITE_ORIGIN = 'https://aniya.moe';

export const SITE_TITLE = 'TsukiStudio';
export const SITE_DESCRIPTION = '生活點滴紀錄';

/** The site's author: WordPress's display name, and the Mastodon account (`fediverse:creator`). */
export const SITE_AUTHOR = {
	name: 'Tsuki',
	fediverse: '@erase2004@g0v.social',
	mastodon: 'https://g0v.social/@erase2004',
};

/** The Google Analytics 4 property the WordPress site sent its visits to (MonsterInsights). */
export const GA4_MEASUREMENT_ID = 'G-NWNYVH87N4';

/**
 * The WordPress site's time zone (its `timezone_string`). Post URLs carry the
 * publish date in this time zone, as WordPress permalinks did.
 */
export const SITE_TIMEZONE = 'Asia/Taipei';
