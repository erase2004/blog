// The videos and the PDF of the WordPress site (the attachments with a video/*
// or application/pdf type). They move to R2 (ticket 07) and are served from
// media.aniya.moe/videos/<post slug>/<file name> (videos) and
// media.aniya.moe/files/<post slug>/<file name> (the PDF), the post being the
// one whose content uses the file.
import { MEDIA_ORIGIN } from './settings.ts';
import type { Post, WordPressSite } from './wordpress.ts';

export type MediaFile = {
	attachment: Post;
	/** Its old URL path, UTF-8: `/wp-content/uploads/2025/05/20250426_103131827.mp4`. */
	upload: string;
	/** The post or page the file belongs to. */
	owner: Post;
	/** Its new URL, UTF-8: `https://media.aniya.moe/videos/travel-setonaikai-2025-day7/20250426_103131827.mp4`. */
	url: string;
	/** Its size, as WordPress recorded it on upload. */
	bytes: number;
};

const UPLOADS_PATH = '/wp-content/uploads/';

const filesBySite = new WeakMap<WordPressSite, MediaFile[]>();

/** The site's media files, by attachment ID. */
export function mediaFiles(site: WordPressSite): MediaFile[] {
	let files = filesBySite.get(site);
	if (!files) {
		files = site
			.posts('attachment')
			.filter(({ mimeType }) => mimeType.startsWith('video/') || mimeType === 'application/pdf')
			.map((attachment) => mediaFile(attachment, site));
		filesBySite.set(site, files);
	}
	return files;
}

/** The media file at an old URL path (`/wp-content/uploads/…`, UTF-8), if there is one. */
export function mediaFileAt(site: WordPressSite, path: string): MediaFile | undefined {
	return mediaFiles(site).find((file) => file.upload === path);
}

function mediaFile(attachment: Post, site: WordPressSite): MediaFile {
	const [file] = site.meta(attachment.id, '_wp_attached_file');
	if (!file) throw new Error(`Attachment ${attachment.id} has no _wp_attached_file`);
	const upload = `${UPLOADS_PATH}${file}`;
	const owner = ownerOf(upload, attachment, site);
	const folder = attachment.mimeType.startsWith('video/') ? 'videos' : 'files';
	const name = file.slice(file.lastIndexOf('/') + 1);
	// _wp_attachment_metadata is a serialized PHP array: …s:8:"filesize";i:894493;…
	const [, bytes] = /s:8:"filesize";i:(\d+);/.exec(site.meta(attachment.id, '_wp_attachment_metadata')[0] ?? '') ?? [];
	if (!bytes) throw new Error(`Attachment ${attachment.id} has no filesize in _wp_attachment_metadata`);
	return { attachment, upload, owner, url: `${MEDIA_ORIGIN}/${folder}/${owner.slug}/${name}`, bytes: Number(bytes) };
}

/**
 * The published post or page whose content uses the file; for a file no post
 * uses, the one it was uploaded to.
 */
function ownerOf(upload: string, attachment: Post, site: WordPressSite): Post {
	const users = site.entries().filter((entry) => uses(entry.content, upload));
	if (users.length > 1) {
		throw new Error(`${upload} is used by more than one post: ${users.map(({ id }) => id).join(', ')}`);
	}
	const owner = users[0] ?? site.entries().find(({ id }) => id === attachment.parent);
	if (!owner) throw new Error(`${upload} is used by no post, and was not uploaded to a published one`);
	return owner;
}

/** Whether HTML links to the old URL path, written in UTF-8 or percent-encoded. */
function uses(html: string, upload: string): boolean {
	const text = html.replace(/(?:%[0-9a-f]{2})+/gi, (escapes) => {
		try {
			return decodeURIComponent(escapes);
		} catch {
			return escapes;
		}
	});
	const escaped = upload.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	return new RegExp(`${escaped}(?![\\w.-])`).test(text);
}
