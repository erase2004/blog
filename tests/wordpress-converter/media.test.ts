// Videos and the PDF: their files move to R2 and are served from
// media.aniya.moe, in a folder named after the post they belong to; the
// content points there, and their old URLs redirect there.
import { describe, expect, it } from 'vitest';
import { convertWordPress } from '../../scripts/wordpress-converter/convert';
import { compileMdx, renderMarkdown } from '../support/render-markdown';
import { meta, post, wordpressTables } from './fixtures';

/** The fixture site with the backup's videos and PDF (rows taken from the real backup, trimmed). */
function tablesWithMedia() {
	const tables = wordpressTables();
	const attachment = (id: number, parent: number, name: string, file: string, mimeType: string, filesize: number) => {
		tables.wp_posts!.push(
			post({
				ID: id,
				post_type: 'attachment',
				post_status: 'inherit',
				post_parent: parent,
				post_name: name,
				post_mime_type: mimeType,
				guid: `https://aniya.moe/wp-content/uploads/${file}`,
			}),
		);
		tables.wp_postmeta!.push(
			meta(id, '_wp_attached_file', file),
			meta(id, '_wp_attachment_metadata', `a:2:{s:7:"bitrate";i:489823;s:8:"filesize";i:${filesize};}`),
		);
	};
	const addContent = (id: number, html: string) => {
		const row = tables.wp_posts!.find((candidate) => candidate.ID === String(id))!;
		row.post_content = `${row.post_content}\n\n${html}`;
	};

	attachment(1859, 1854, 'round-switch-01', '2026/01/round-switch-01.mp4', 'video/mp4', 894493);
	addContent(
		1854,
		`<!-- wp:video {"id":1859,"loop":true,"muted":true} -->
<figure class="wp-block-video"><video controls loop muted src="https://aniya.moe/wp-content/uploads/2026/01/round-switch-01.mp4"></video><figcaption class="wp-element-caption">在不同賽季間切換瀏覽「初音未來」這家公司的資訊</figcaption></figure>
<!-- /wp:video -->`,
	);
	// Uploaded to the post, which then used another upload of it.
	attachment(1873, 1854, 'virtualized-view-01', '2026/01/virtualized-view-01.mp4', 'video/mp4', 475720);
	attachment(
		459,
		442,
		'%e7%80%a8%e6%88%b6%e5%85%a7%e5%9c%8b%e9%9a%9b%e8%97%9d%e8%a1%93%e7%a5%ad-2025-3',
		'2025/05/瀨戶內國際藝術祭-2025-3.pdf',
		'application/pdf',
		662258,
	);
	addContent(
		442,
		`<!-- wp:file {"id":459,"href":"https://aniya.moe/wp-content/uploads/2025/05/瀨戶內國際藝術祭-2025-3.pdf","displayPreview":false} -->
<div class="wp-block-file"><a id="wp-block-file--media-e5b93318-a9f8-4846-993b-4e16fa60939f" href="https://aniya.moe/wp-content/uploads/2025/05/瀨戶內國際藝術祭-2025-3.pdf" target="_blank" rel="noreferrer noopener">瀨戶內國際藝術祭 2025 旅遊計畫</a><a href="https://aniya.moe/wp-content/uploads/2025/05/瀨戶內國際藝術祭-2025-3.pdf" class="wp-block-file__button wp-element-button" download aria-describedby="wp-block-file--media-e5b93318-a9f8-4846-993b-4e16fa60939f">下載</a></div>
<!-- /wp:file -->`,
	);
	// Uploaded without a post, then used in one.
	attachment(1403, 0, '20250426_103131827', '2025/05/20250426_103131827.mp4', 'video/mp4', 80852912);
	tables.wp_posts!.push(
		post({
			ID: 1331,
			post_date: '2025-05-17 09:07:00',
			post_date_gmt: '2025-05-17 01:07:00',
			post_modified_gmt: '2025-05-20 04:26:42',
			post_title: '遊記 - 岡山 / 香川 / 德島八日遊 - Day 7',
			post_name: 'travel-setonaikai-2025-day7',
			post_content: `<!-- wp:video {"id":1403,"align":"center"} -->
<figure class="wp-block-video aligncenter"><video controls src="https://aniya.moe/wp-content/uploads/2025/05/20250426_103131827.mp4"></video><figcaption class="wp-element-caption">影片：鳴門漩渦</figcaption></figure>
<!-- /wp:video -->`,
		}),
	);
	return tables;
}

const filesWithMedia = () => convertWordPress(tablesWithMedia()).files;

describe('videos', () => {
	it('play from R2, from a folder named after their post, keeping their caption, loop and muted', () => {
		const file = filesWithMedia()['src/content/posts/acgn-museum-ssg.md']!;

		const video = [
			'<figure>',
			'<video controls loop muted preload="metadata" src="https://media.aniya.moe/videos/acgn-museum-ssg/round-switch-01.mp4"></video>',
			'<figcaption>在不同賽季間切換瀏覽「初音未來」這家公司的資訊</figcaption>',
			'</figure>',
		].join('\n');
		expect(file).toContain(`\n\n${video}\n`);
		const body = file.slice(file.indexOf('\n---\n') + 5);
		expect(renderMarkdown(body)).toContain(video);
		expect(() => compileMdx(body)).not.toThrow();
	});

	it('stay visibly marked when their file is not an attachment of the site', () => {
		const tables = tablesWithMedia();
		const block = `<!-- wp:video {"align":"center"} -->
<figure class="wp-block-video aligncenter"><video controls src="https://example.com/elsewhere.mp4"></video></figure>
<!-- /wp:video -->`;
		tables.wp_posts!.find(({ ID }) => ID === '255')!.post_content = block;

		expect(convertWordPress(tables).files['src/content/posts/vue-router-named-views.md']).toContain(
			`\`\`\`html title="wp-unconverted: core/video"\n${block}\n\`\`\``,
		);
	});
});

describe('the PDF', () => {
	it('becomes a link to R2, in the files folder of its post, keeping its file name', () => {
		const file = filesWithMedia()['src/content/posts/travel-setonaikai-2025-prologue.md']!;

		expect(file).toContain(
			'\n\n[瀨戶內國際藝術祭 2025 旅遊計畫](https://media.aniya.moe/files/travel-setonaikai-2025-prologue/瀨戶內國際藝術祭-2025-3.pdf)\n',
		);
		// The download button was a second link to the same file.
		expect(file).not.toContain('下載');
		expect(renderMarkdown(file.slice(file.indexOf('\n---\n') + 5))).toContain(
			'<a href="https://media.aniya.moe/files/travel-setonaikai-2025-prologue/%E7%80%A8%E6%88%B6%E5%85%A7%E5%9C%8B%E9%9A%9B%E8%97%9D%E8%A1%93%E7%A5%AD-2025-3.pdf">瀨戶內國際藝術祭 2025 旅遊計畫</a>',
		);
	});
});

describe('the old-URL mapping table', () => {
	type Expected = { url: string; expect: string; location?: string };
	const tableOf = (output = filesWithMedia()) => JSON.parse(output['src/data/old-url-map.json']!);
	const urlsOf = (output = filesWithMedia()) => tableOf(output).urls as Expected[];

	it('lists each file: its old URL and attachment page, its post, its new URL, type and size', () => {
		expect(tableOf().media).toEqual([
			{
				wordpressId: 459,
				post: '/2025/05/17/travel-setonaikai-2025-prologue/',
				upload: '/wp-content/uploads/2025/05/瀨戶內國際藝術祭-2025-3.pdf',
				attachmentPage: '/2025/05/17/travel-setonaikai-2025-prologue/瀨戶內國際藝術祭-2025-3/',
				url: 'https://media.aniya.moe/files/travel-setonaikai-2025-prologue/瀨戶內國際藝術祭-2025-3.pdf',
				contentType: 'application/pdf',
				bytes: 662258,
			},
			{
				wordpressId: 1403,
				post: '/2025/05/17/travel-setonaikai-2025-day7/',
				upload: '/wp-content/uploads/2025/05/20250426_103131827.mp4',
				attachmentPage: '/20250426_103131827/',
				url: 'https://media.aniya.moe/videos/travel-setonaikai-2025-day7/20250426_103131827.mp4',
				contentType: 'video/mp4',
				bytes: 80852912,
			},
			expect.objectContaining({ wordpressId: 1859, bytes: 894493 }),
			expect.objectContaining({ wordpressId: 1873, post: '/2026/01/23/acgn-museum-ssg/' }),
		]);
	});

	it('redirects the old upload paths of the files to R2', () => {
		expect(urlsOf()).toContainEqual({
			url: '/wp-content/uploads/2026/01/round-switch-01.mp4',
			expect: 'redirect',
			location: 'https://media.aniya.moe/videos/acgn-museum-ssg/round-switch-01.mp4',
		});
	});

	it('moves files no post uses as well, into the folder of the post they were uploaded to', () => {
		expect(urlsOf()).toContainEqual({
			url: '/wp-content/uploads/2026/01/virtualized-view-01.mp4',
			expect: 'redirect',
			location: 'https://media.aniya.moe/videos/acgn-museum-ssg/virtualized-view-01.mp4',
		});
	});

	it('redirects their attachment pages to R2 too, as WordPress redirected them to the file (live site, 2026-10-24)', () => {
		expect(urlsOf()).toEqual(
			expect.arrayContaining([
				// Under the post it was uploaded to.
				{
					url: '/2026/01/23/acgn-museum-ssg/round-switch-01/',
					expect: 'redirect',
					location: 'https://media.aniya.moe/videos/acgn-museum-ssg/round-switch-01.mp4',
				},
				{
					url: '/2025/05/17/travel-setonaikai-2025-prologue/瀨戶內國際藝術祭-2025-3/',
					expect: 'redirect',
					location: 'https://media.aniya.moe/files/travel-setonaikai-2025-prologue/瀨戶內國際藝術祭-2025-3.pdf',
				},
				// Uploaded without a post: at the top level, and in the folder of the post that uses it.
				{
					url: '/20250426_103131827/',
					expect: 'redirect',
					location: 'https://media.aniya.moe/videos/travel-setonaikai-2025-day7/20250426_103131827.mp4',
				},
			]),
		);
	});

	it('redirects /?attachment_id=ID of the files to R2, as WordPress redirected it to the attachment page', () => {
		expect(urlsOf()).toEqual(
			expect.arrayContaining([
				{
					url: '/?attachment_id=1859',
					expect: 'redirect',
					location: 'https://media.aniya.moe/videos/acgn-museum-ssg/round-switch-01.mp4',
				},
				{
					url: '/?attachment_id=459',
					expect: 'redirect',
					location: 'https://media.aniya.moe/files/travel-setonaikai-2025-prologue/瀨戶內國際藝術祭-2025-3.pdf',
				},
			]),
		);
	});
});
