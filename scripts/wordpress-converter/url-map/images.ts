// Images (ticket 06): the old upload paths and the attachment page of each
// moved image redirect to the image Astro makes of it. Its new URL has a
// hash only known after the build, so `images` names the image file, and the
// build turns that into `_redirects` rules (src/integrations/image-redirects.ts).
import type { UrlSource } from '../mapping-table.ts';
import { type MovedImage, mediaLibrary } from '../media-library.ts';
import type { Post, WordPressSite } from '../wordpress.ts';

const UPLOADS = '/wp-content/uploads/';

export const images: UrlSource = ({ site, entries }) => {
	const entryUrls = new Map(entries.map(({ post, url }) => [post.id, url]));
	const moved = mediaLibrary(site).images.map((image) => ({
		wordpressId: image.attachment.id,
		file: image.path,
		uploads: oldUploadUrls(image),
		attachmentPage: attachmentPage(image.attachment, site, entryUrls),
	}));
	// Images nothing uses do not move (spec): their files and attachment pages answer 404.
	const orphans = mediaLibrary(site).orphans.map(({ attachment, file, original }) => ({
		wordpressId: attachment.id,
		uploads: [`${UPLOADS}${file}`, ...(original ? [`${UPLOADS}${original}`] : [])],
		attachmentPage: attachmentPage(attachment, site, entryUrls),
	}));
	// Every attachment also had /?attachment_id=ID, which WordPress redirected
	// to its attachment page; the Worker answers it (src/worker.ts).
	const oldUrls = ({ wordpressId, uploads, attachmentPage: page }: { wordpressId: number; uploads: string[]; attachmentPage: string }) => [
		...new Set([...uploads, page, `/?attachment_id=${wordpressId}`]),
	];
	return {
		sections: { images: moved, unusedImages: orphans },
		urls: [
			...moved.flatMap((image) => oldUrls(image).map((url) => ({ url, expect: 'redirect' as const }))),
			...orphans.flatMap((image) => oldUrls(image).map((url) => ({ url, expect: 'not-found' as const }))),
		],
	};
};

/**
 * Where WordPress had the image: the file it served, the original of a large
 * image it scaled down, and the name AIOSEO's image sitemap listed for an
 * image of a post (its removeImageDimensions() drops `-WxH` and `-scaled`
 * anywhere in the name).
 */
function oldUploadUrls(image: MovedImage): string[] {
	const served = `${UPLOADS}${image.file}`;
	const urls = [served, ...(image.original ? [`${UPLOADS}${image.original}`] : [])];
	if (image.usedBy.length > 0) urls.push(served.replace(/(-[0-9]*x[0-9]*|-scaled)/g, ''));
	return [...new Set(urls)];
}

/**
 * The URL of an attachment's page, as get_attachment_link() made it: under
 * the published post or page it was uploaded to (`attachment/<slug>` for a
 * numeric slug), at the top level when it was uploaded to none, and
 * `/?attachment_id=ID` when uploaded to something without a pretty URL, such
 * as an Envira gallery.
 */
function attachmentPage(attachment: Post, site: WordPressSite, entryUrls: Map<number, string>): string {
	if (attachment.parent === 0 || !site.post(attachment.parent)) return `/${attachment.slug}/`;
	const parentUrl = entryUrls.get(attachment.parent);
	if (!parentUrl) return `/?attachment_id=${attachment.id}`;
	return `${parentUrl}${/^[0-9]+$/.test(attachment.slug) ? 'attachment/' : ''}${attachment.slug}/`;
}
