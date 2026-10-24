// The videos and the PDF on R2 (ticket 07), as the `media` section of the
// old-URL mapping table lists them (written by the WordPress converter, see
// scripts/wordpress-converter/url-map/media.ts). Read by the upload and
// verification scripts and by the `_redirects` rules made at build time.
import { readFileSync } from 'node:fs';

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

export function readMediaTable(mappingTableFile: string): MediaFile[] {
	const table = JSON.parse(readFileSync(mappingTableFile, 'utf8')) as { media?: unknown };
	if (!Array.isArray(table.media)) throw new Error(`${mappingTableFile}: expected a "media" array`);
	return table.media.map((entry: Record<string, unknown>, index) => {
		const fields = { upload: 'string', url: 'string', contentType: 'string', bytes: 'number' };
		for (const [name, type] of Object.entries(fields)) {
			if (typeof entry[name] !== type) throw new Error(`${mappingTableFile}: media[${index}] needs "${name}" (${type})`);
		}
		return entry as MediaFile;
	});
}

/** The old URLs that redirect to the file on R2: its upload path and its attachment page. */
export function oldUrls(file: MediaFile): string[] {
	return file.attachmentPage ? [file.upload, file.attachmentPage] : [file.upload];
}
