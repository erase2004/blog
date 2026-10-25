// The videos and the PDF, which moved to R2 (ticket 07; see media-files.ts):
// their old upload paths and their attachment pages redirect to their new
// URL. The `media` section lists them for scripts/upload-media.ts and
// scripts/verify-media.ts, and for the `_redirects` rules made at build time
// (src/integrations/media-redirects.ts).
import type { ConvertedEntry } from '../convert.ts';
import type { UrlSource } from '../mapping-table.ts';
import { mediaFiles } from '../media-files.ts';
import type { Post } from '../wordpress.ts';

export const media: UrlSource = ({ site, entries }) => {
	const files = mediaFiles(site).map(({ attachment, owner, upload, url, bytes }) => ({
		wordpressId: attachment.id,
		post: entries.find(({ post }) => post.id === owner.id)!.url,
		upload,
		attachmentPage: attachmentPage(attachment, entries),
		url,
		contentType: attachment.mimeType,
		bytes,
	}));
	// /?attachment_id=ID too, which WordPress redirected to the attachment page
	// (the Worker answers it, src/worker.ts).
	return {
		sections: { media: files },
		urls: files.flatMap(({ wordpressId, upload, attachmentPage, url }) =>
			[upload, ...(attachmentPage ? [attachmentPage] : []), `/?attachment_id=${wordpressId}`].map((old) => ({
				url: old,
				expect: 'redirect' as const,
				location: url,
			})),
		),
	};
};

/**
 * The URL of an attachment's page, as WordPress's get_attachment_link() made
 * it: under the post it was uploaded to, or at the top level for one uploaded
 * without a post. WordPress redirected these pages to the file. An attachment
 * of a post that is not published only had a `?attachment_id=` URL.
 */
function attachmentPage(attachment: Post, entries: ConvertedEntry[]): string | undefined {
	if (attachment.parent === 0) return `/${attachment.slug}/`;
	const parent = entries.find(({ post }) => post.id === attachment.parent);
	return parent ? `${parent.url}${attachment.slug}/` : undefined;
}
