// Checking the videos and the PDF on R2 as a browser fetches them: the whole
// file, and a part of it (a <video> seeks with range requests). A local HTTP
// server stands in for media.aniya.moe.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { MediaFile } from '../../scripts/r2-media/media-table';
import { verifyMedia } from '../../scripts/r2-media/verify';
import { type MediaServer, startMediaServer } from '../support/media-server';

let server: MediaServer;

beforeAll(async () => {
	server = await startMediaServer();
});

afterAll(async () => {
	await server.stop();
});

const VIDEO = Buffer.alloc(5000, 'v');
const PDF = Buffer.from('pdf bytes');

function mediaFiles(): MediaFile[] {
	return [
		{
			wordpressId: 459,
			post: '/2025/05/17/travel-setonaikai-2025-prologue/',
			upload: '/wp-content/uploads/2025/05/瀨戶內國際藝術祭-2025-3.pdf',
			url: `${server.url}/files/travel-setonaikai-2025-prologue/瀨戶內國際藝術祭-2025-3.pdf`,
			contentType: 'application/pdf',
			bytes: PDF.length,
		},
		{
			wordpressId: 1403,
			post: '/2025/05/17/travel-setonaikai-2025-day7/',
			upload: '/wp-content/uploads/2025/05/20250426_103131827.mp4',
			url: `${server.url}/videos/travel-setonaikai-2025-day7/20250426_103131827.mp4`,
			contentType: 'video/mp4',
			bytes: VIDEO.length,
		},
	];
}

function putBoth() {
	server.objects.clear();
	server.ignoreRanges = false;
	server.objects.set('files/travel-setonaikai-2025-prologue/瀨戶內國際藝術祭-2025-3.pdf', {
		body: PDF,
		contentType: 'application/pdf',
	});
	server.objects.set('videos/travel-setonaikai-2025-day7/20250426_103131827.mp4', { body: VIDEO, contentType: 'video/mp4' });
}

describe('verifying the files on R2', () => {
	it('passes when each answers 200 with its type and size, and a range request with 206 and that range', async () => {
		putBoth();

		const results = await verifyMedia(mediaFiles());

		expect(results).toEqual([
			{ url: mediaFiles()[0]!.url, problems: [] },
			{ url: mediaFiles()[1]!.url, problems: [] },
		]);
	});

	it('reports a file that is missing, or served with another type or size', async () => {
		putBoth();
		server.objects.delete('files/travel-setonaikai-2025-prologue/瀨戶內國際藝術祭-2025-3.pdf');
		server.objects.set('videos/travel-setonaikai-2025-day7/20250426_103131827.mp4', {
			body: VIDEO.subarray(1),
			contentType: 'application/octet-stream',
		});

		const [pdf, video] = await verifyMedia(mediaFiles());

		expect(pdf!.problems).toContain('expected HTTP 200, got 404');
		expect(video!.problems).toEqual(
			expect.arrayContaining([
				'expected Content-Type video/mp4, got application/octet-stream',
				`expected Content-Length ${VIDEO.length}, got ${VIDEO.length - 1}`,
			]),
		);
	});

	it('reports a server that answers range requests with the whole file', async () => {
		putBoth();
		server.ignoreRanges = true;

		const [, video] = await verifyMedia(mediaFiles());

		expect(video!.problems).toEqual([`Range: bytes=2500-3523: expected HTTP 206, got 200`]);
	});
});
