// The WordPress media library, and which of its images move to the new site
// (ticket 06): those that published posts and pages use, in their content
// (galleries and compare sliders included) or as their AIOSEO social image,
// and those the whole site uses (AIOSEO's default social image, the theme's
// header image). Each moved image goes to src/assets/images/<folder>/<file
// name>: the folder named after the first post (in publish order) that uses
// it, or `site` for the site's own images; the file name the one WordPress
// served, without the `-scaled` WordPress adds to large images it scaled down.
import { posix } from 'node:path';
import { contentDirectory } from './content-files.ts';
import { seoSettings } from './seo.ts';
import type { Post, WordPressSite } from './wordpress.ts';

export const IMAGES_DIR = 'src/assets/images';
/** The folder of the images the whole site uses. */
export const SITE_IMAGES_FOLDER = 'site';
const UPLOADS = '/wp-content/uploads/';

/** A file of the media library: an attachment and the files WordPress made of it. */
export type Upload = {
	attachment: Post;
	/** The file WordPress served (`_wp_attached_file`), relative to the uploads directory: `2025/05/x-scaled.jpg`. */
	file: string;
	/** The original of an image WordPress scaled down, relative to the uploads directory: `2025/05/x.jpg`. */
	original?: string;
	/** Every file WordPress made of it, relative to the uploads directory: the file, the original, the sizes (`x-1024x768.jpg`). */
	variants: string[];
};

/** An image that moves to the new site. */
export type MovedImage = Upload & {
	/** Where it goes, relative to the project root: `src/assets/images/<folder>/<file name>`. */
	path: string;
	/** The published posts and pages that use it, in publish order; none for some of the site's own images. */
	usedBy: Post[];
};

export type MediaLibrary = {
	/** The images that move, by path. */
	images: MovedImage[];
	/** The images of the media library that do not move: nothing uses them. By attachment ID. */
	orphans: Upload[];
	/**
	 * The moved image an upload URL refers to: in any form WordPress wrote it
	 * (absolute, site-relative, through Photon `i0.wp.com`, percent-encoded)
	 * and for any of its variants (a size, the scaled file, the original).
	 */
	image(url: string): MovedImage | undefined;
};

const libraries = new WeakMap<WordPressSite, MediaLibrary>();

/** The media library of a site (worked out once per site). */
export function mediaLibrary(site: WordPressSite): MediaLibrary {
	let library = libraries.get(site);
	if (!library) libraries.set(site, (library = readMediaLibrary(site)));
	return library;
}

function readMediaLibrary(site: WordPressSite): MediaLibrary {
	const host = new URL(site.option('home')!).host.replace(/^www\./, '');
	const uploads = site
		.posts('attachment')
		.map((attachment) => upload(attachment, site))
		.filter((item): item is Upload => item !== undefined);
	const byVariant = new Map<string, Upload>();
	for (const item of uploads) {
		for (const variant of item.variants) byVariant.set(variant, item);
	}
	// A file WordPress served is always its own attachment's.
	for (const item of uploads) byVariant.set(item.file, item);
	const find = (url: string) => {
		const path = uploadPath(url, host);
		return path === undefined ? undefined : byVariant.get(path);
	};

	const users = new Map<Upload, Post[]>();
	const entries = [...site.entries()].sort((a, b) => a.published.getTime() - b.published.getTime() || a.id - b.id);
	for (const entry of entries) {
		const { socialImage } = seoSettings(entry, site);
		for (const url of [...uploadUrls(entry.content, host), ...(socialImage ? [socialImage] : [])]) {
			const item = find(url);
			if (!item) throw new Error(`${entry.type} ${entry.id} uses ${url}, which is not in the media library`);
			if (!item.attachment.mimeType.startsWith('image/')) continue;
			const used = users.get(item) ?? [];
			if (!used.includes(entry)) users.set(item, [...used, entry]);
		}
	}

	const siteImages = new Set<Upload>();
	for (const url of siteImageUrls(site, host)) {
		const item = find(url);
		if (!item) throw new Error(`The site uses ${url}, which is not in the media library`);
		siteImages.add(item);
	}

	const images = new Map<Upload, MovedImage>();
	const paths = new Map<string, Upload>();
	for (const item of [...siteImages, ...users.keys()]) {
		const usedBy = users.get(item) ?? [];
		const folder = siteImages.has(item) ? SITE_IMAGES_FOLDER : usedBy[0]!.slug;
		if (folder === SITE_IMAGES_FOLDER && !siteImages.has(item)) {
			throw new Error(`The images of ${usedBy[0]!.type} ${usedBy[0]!.id} would go to the folder of the site's own images`);
		}
		const path = `${IMAGES_DIR}/${folder}/${imageName(item.file)}`;
		// Windows file names ignore case.
		const other = paths.get(path.toLowerCase());
		if (other && other !== item) throw new Error(`${other.file} and ${item.file} would both be ${path}`);
		paths.set(path.toLowerCase(), item);
		images.set(item, { ...item, path, usedBy });
	}
	return {
		images: [...images.values()].sort((a, b) => Buffer.compare(Buffer.from(a.path), Buffer.from(b.path))),
		orphans: uploads.filter((item) => item.attachment.mimeType.startsWith('image/') && !images.has(item)),
		image: (url) => {
			const item = find(url);
			return item && images.get(item);
		},
	};
}

/**
 * The path of the moved image an upload URL refers to, relative to the
 * content file of `entry`: for Markdown images, MDX imports, frontmatter.
 */
export function relativeImagePath(url: string, entry: Post, site: WordPressSite): string {
	const image = mediaLibrary(site).image(url);
	if (!image) throw new Error(`${entry.type} ${entry.id}: ${url} is not an image that moves to the new site`);
	return posix.relative(contentDirectory(entry, site), image.path);
}

function upload(attachment: Post, site: WordPressSite): Upload | undefined {
	const [file] = site.meta(attachment.id, '_wp_attached_file');
	if (!file) return undefined;
	const dir = file.includes('/') ? file.slice(0, file.lastIndexOf('/') + 1) : '';
	const [metadata = ''] = site.meta(attachment.id, '_wp_attachment_metadata');
	const [originalName] = phpStrings(metadata, 'original_image');
	const original = originalName === undefined ? undefined : dir + originalName;
	const sizes = phpStrings(metadata, 'file')
		.filter((name) => !name.includes('/'))
		.map((name) => dir + name);
	return { attachment, file, original, variants: [...new Set([file, ...(original ? [original] : []), ...sizes])] };
}

/** The file name of a moved image: the one WordPress served, without `-scaled`. */
function imageName(file: string): string {
	return file.slice(file.lastIndexOf('/') + 1).replace(/-scaled(?=\.[^.]+$)/, '');
}

/** The upload URLs in the settings for the whole site: AIOSEO's (default social image) and the theme's (header image). */
function siteImageUrls(site: WordPressSite, host: string): string[] {
	const settings = [site.option('aioseo_options'), site.option(`theme_mods_${site.option('stylesheet')}`)];
	// AIOSEO keeps its settings as JSON, with slashes escaped.
	return uploadUrls(settings.join('\n').replaceAll('\\/', '/'), host);
}

/** The upload URLs of the site in some HTML (or block attributes): absolute, protocol-relative or through Photon. */
function uploadUrls(html: string, host: string): string[] {
	const pattern = new RegExp(
		`(?:https?:)?//(?:i[0-9]\\.wp\\.com/)?(?:www\\.)?${escapeRegExp(host)}/wp-content/uploads/[^\\s"'<>()\\\\?#]+`,
		'gi',
	);
	return [...new Set(html.match(pattern) ?? [])];
}

/** The path of an upload URL under the uploads directory, decoded: `2025/05/岡山.jpg`; undefined for other URLs. */
function uploadPath(url: string, host: string): string | undefined {
	const pattern = new RegExp(
		`^(?:(?:https?:)?//(?:i[0-9]\\.wp\\.com/)?(?:www\\.)?${escapeRegExp(host)})?${UPLOADS}([^?#]+)`,
		'i',
	);
	const match = pattern.exec(url);
	if (!match) return undefined;
	try {
		return decodeURIComponent(match[1]!);
	} catch {
		return match[1];
	}
}

/**
 * The string values stored under `key` anywhere in a value in PHP's
 * serialize() format (`s:4:"file";s:12:"x-300x200.jpg";`). String lengths
 * there count bytes, so the values are read as UTF-8 bytes.
 */
function phpStrings(serialized: string, key: string): string[] {
	const bytes = Buffer.from(serialized);
	const marker = Buffer.from(`s:${Buffer.byteLength(key)}:"${key}";s:`);
	const values: string[] = [];
	for (let at = bytes.indexOf(marker); at !== -1; at = bytes.indexOf(marker, at + 1)) {
		const lengthStart = at + marker.length;
		const quote = bytes.indexOf(':"', lengthStart);
		const length = Number(bytes.subarray(lengthStart, quote).toString());
		values.push(bytes.subarray(quote + 2, quote + 2 + length).toString());
	}
	return values;
}

function escapeRegExp(text: string): string {
	return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
