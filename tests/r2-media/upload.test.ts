// Uploading the videos and the PDF to R2 with wrangler. A temporary folder
// stands in for the WordPress backup, a local HTTP server for media.aniya.moe,
// and a recording function for wrangler.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { MediaFile } from '../../src/lib/old-url-map';
import { uploadMedia } from '../../scripts/r2-media/upload';
import { type MediaServer, startMediaServer } from '../support/media-server';

let backupDir: string;
let server: MediaServer;

const VIDEO = Buffer.from('video bytes');
const PDF = Buffer.from('pdf bytes, a few more');

beforeAll(async () => {
	backupDir = mkdtempSync(join(tmpdir(), 'aniya-moe-backup-'));
	mkdirSync(join(backupDir, 'wp-content/uploads/2025/05'), { recursive: true });
	writeFileSync(join(backupDir, 'wp-content/uploads/2025/05/20250426_103131827.mp4'), VIDEO);
	writeFileSync(join(backupDir, 'wp-content/uploads/2025/05/瀨戶內國際藝術祭-2025-3.pdf'), PDF);
	server = await startMediaServer();
});

afterAll(async () => {
	await server.stop();
	rmSync(backupDir, { recursive: true, force: true });
});

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
			attachmentPage: '/20250426_103131827/',
			url: `${server.url}/videos/travel-setonaikai-2025-day7/20250426_103131827.mp4`,
			contentType: 'video/mp4',
			bytes: VIDEO.length,
		},
	];
}

function run(options: { dryRun?: boolean; force?: boolean; env?: Record<string, string>; files?: MediaFile[] } = {}) {
	const lines: string[] = [];
	const wranglerCalls: string[][] = [];
	const result = uploadMedia({
		files: options.files ?? mediaFiles(),
		backupDir,
		bucket: 'media',
		dryRun: options.dryRun ?? false,
		force: options.force ?? false,
		env: options.env ?? { CLOUDFLARE_API_TOKEN: 'token', CLOUDFLARE_ACCOUNT_ID: 'account' },
		wrangler: async (args) => {
			wranglerCalls.push(args);
		},
		log: (line) => lines.push(line),
	});
	return result.then((ok) => ({ ok, output: lines.join('\n'), wranglerCalls }));
}

const putArgs = (key: string, file: string, contentType: string) => [
	'r2',
	'object',
	'put',
	`media/${key}`,
	'--file',
	join(backupDir, file),
	'--content-type',
	contentType,
	'--remote',
];

describe('a dry run', () => {
	it('prints the wrangler command for each file it would upload, and uploads nothing, without credentials', async () => {
		server.objects.clear();

		const { ok, output, wranglerCalls } = await run({ dryRun: true, env: {} });

		expect(ok).toBe(true);
		expect(wranglerCalls).toEqual([]);
		for (const args of [
			putArgs(
				'files/travel-setonaikai-2025-prologue/瀨戶內國際藝術祭-2025-3.pdf',
				'wp-content/uploads/2025/05/瀨戶內國際藝術祭-2025-3.pdf',
				'application/pdf',
			),
			putArgs(
				'videos/travel-setonaikai-2025-day7/20250426_103131827.mp4',
				'wp-content/uploads/2025/05/20250426_103131827.mp4',
				'video/mp4',
			),
		]) {
			expect(output).toContain(`wrangler ${args.map((arg) => (/\s/.test(arg) ? `"${arg}"` : arg)).join(' ')}`);
		}
		expect(output).toContain('Dry run: would upload 2 files, 0 already on R2. Nothing was uploaded.');
	});
});

describe('an upload', () => {
	it('puts each file with wrangler, skipping those already on R2 with the same content and type', async () => {
		server.objects.clear();
		server.objects.set('videos/travel-setonaikai-2025-day7/20250426_103131827.mp4', { body: VIDEO, contentType: 'video/mp4' });

		const { ok, output, wranglerCalls } = await run();

		expect(ok).toBe(true);
		expect(wranglerCalls).toEqual([
			putArgs(
				'files/travel-setonaikai-2025-prologue/瀨戶內國際藝術祭-2025-3.pdf',
				'wp-content/uploads/2025/05/瀨戶內國際藝術祭-2025-3.pdf',
				'application/pdf',
			),
		]);
		expect(output).toContain('Uploaded 1 files, 1 already on R2.');
	});

	it('puts a file again when its object on R2 differs in content or type', async () => {
		server.objects.clear();
		server.objects.set('videos/travel-setonaikai-2025-day7/20250426_103131827.mp4', {
			body: Buffer.from('an older upload'),
			contentType: 'video/mp4',
		});
		server.objects.set('files/travel-setonaikai-2025-prologue/瀨戶內國際藝術祭-2025-3.pdf', {
			body: PDF,
			contentType: 'application/octet-stream',
		});

		const { wranglerCalls } = await run();

		expect(wranglerCalls.map((args) => args[3])).toEqual([
			'media/files/travel-setonaikai-2025-prologue/瀨戶內國際藝術祭-2025-3.pdf',
			'media/videos/travel-setonaikai-2025-day7/20250426_103131827.mp4',
		]);
	});

	it('puts every file with --force', async () => {
		server.objects.clear();
		server.objects.set('videos/travel-setonaikai-2025-day7/20250426_103131827.mp4', { body: VIDEO, contentType: 'video/mp4' });

		const { wranglerCalls } = await run({ force: true });

		expect(wranglerCalls).toHaveLength(2);
	});
});

describe('nothing is uploaded', () => {
	it('when a file is missing from the backup, or not the size WordPress recorded', async () => {
		server.objects.clear();
		const [pdf, video] = mediaFiles();
		const files = [{ ...pdf!, bytes: PDF.length + 1 }, video!, { ...video!, upload: '/wp-content/uploads/2025/05/missing.mp4' }];

		for (const dryRun of [true, false]) {
			const { ok, output, wranglerCalls } = await run({ files, dryRun });

			expect(ok).toBe(false);
			expect(wranglerCalls).toEqual([]);
			expect(output).toContain(
				`${join(backupDir, 'wp-content/uploads/2025/05/瀨戶內國際藝術祭-2025-3.pdf')} is ${PDF.length} bytes, the mapping table says ${PDF.length + 1}`,
			);
			expect(output).toContain(`${join(backupDir, 'wp-content/uploads/2025/05/missing.mp4')} does not exist`);
		}
	});

	it('without the credentials wrangler needs', async () => {
		server.objects.clear();

		const { ok, output, wranglerCalls } = await run({ env: { CLOUDFLARE_ACCOUNT_ID: 'account' } });

		expect(ok).toBe(false);
		expect(wranglerCalls).toEqual([]);
		expect(output).toContain('CLOUDFLARE_API_TOKEN is not set');
	});

	it('after wrangler fails: the files after it are left for the next run', async () => {
		server.objects.clear();
		const lines: string[] = [];
		const calls: string[][] = [];

		const ok = await uploadMedia({
			files: mediaFiles(),
			backupDir,
			bucket: 'media',
			dryRun: false,
			force: false,
			env: { CLOUDFLARE_API_TOKEN: 'token', CLOUDFLARE_ACCOUNT_ID: 'account' },
			wrangler: async (args) => {
				calls.push(args);
				throw new Error('wrangler exited with code 1');
			},
			log: (line) => lines.push(line),
		});

		expect(ok).toBe(false);
		expect(calls).toHaveLength(1);
		expect(lines.join('\n')).toContain('wrangler exited with code 1');
	});
});
