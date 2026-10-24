// Uploads the videos and the PDF from the WordPress backup to the R2 bucket,
// one `wrangler r2 object put` per file. A file whose object is already
// there with the same content (its ETag is the MD5 of a single-part upload,
// which is what wrangler makes) and type is skipped, so running it again only
// uploads what is missing or different.
import { createHash } from 'node:crypto';
import { createReadStream, statSync } from 'node:fs';
import { join } from 'node:path';
import type { MediaFile } from './media-table.ts';

export type UploadOptions = {
	files: MediaFile[];
	/** The folder holding the backup's `wp-content`. */
	backupDir: string;
	bucket: string;
	/** Only print what would be uploaded. */
	dryRun: boolean;
	/** Upload every file, even those already on R2. */
	force: boolean;
	/** Where wrangler takes its credentials from. */
	env: Record<string, string | undefined>;
	/** Runs wrangler with these arguments; rejects when it fails. */
	wrangler: (args: string[]) => Promise<void>;
	log: (line: string) => void;
};

/** The environment variables wrangler authenticates with when it runs without a login. */
export const CREDENTIALS = ['CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID'];

type Step = { file: MediaFile; source: string; key: string; upload: boolean; reason: string; args: string[] };

/**
 * Returns whether the run succeeded: every file is on R2 now or, in a dry
 * run, every file could be checked. Nothing is uploaded when a file in the
 * backup is missing or not the size the mapping table says.
 */
export async function uploadMedia(options: UploadOptions): Promise<boolean> {
	const { files, backupDir, bucket, dryRun, force, log } = options;
	const sources = files.map((file) => join(backupDir, ...file.upload.split('/')));
	const problems = files.flatMap((file, index) => sourceProblems(sources[index]!, file));
	if (!dryRun) {
		problems.push(...CREDENTIALS.filter((name) => !options.env[name]).map((name) => `${name} is not set`));
	}
	if (problems.length > 0) {
		log(['Nothing was uploaded:', ...problems.map((problem) => `  ${problem}`)].join('\n'));
		return false;
	}

	const steps: Step[] = [];
	for (const [index, file] of files.entries()) {
		const source = sources[index]!;
		const key = objectKey(file.url);
		const args = ['r2', 'object', 'put', `${bucket}/${key}`, '--file', source, '--content-type', file.contentType, '--remote'];
		const reason = force ? 'forced' : await differenceOnR2(file, await md5(source));
		steps.push({ file, source, key, upload: reason !== null, reason: reason ?? 'already on R2', args });
	}

	const uploads = steps.filter((step) => step.upload);
	for (const step of steps) {
		log(`${step.upload ? 'upload' : 'skip  '}  ${step.file.url} (${step.reason})`);
		log(`        wrangler ${step.args.map(quote).join(' ')}`);
	}
	const skipped = steps.length - uploads.length;
	if (dryRun) {
		log(`\nDry run: would upload ${uploads.length} files, ${skipped} already on R2. Nothing was uploaded.`);
		return true;
	}
	for (const [done, step] of uploads.entries()) {
		log(`\nUploading ${step.source} to ${bucket}/${step.key}`);
		try {
			await options.wrangler(step.args);
		} catch (error) {
			log(`\nUpload failed: ${(error as Error).message}`);
			log(`Uploaded ${done} of ${uploads.length} files; run again to upload the rest.`);
			return false;
		}
	}
	log(`\nUploaded ${uploads.length} files, ${skipped} already on R2.`);
	return true;
}

function sourceProblems(source: string, file: MediaFile): string[] {
	const stats = statSync(source, { throwIfNoEntry: false });
	if (!stats?.isFile()) return [`${source} does not exist`];
	if (stats.size !== file.bytes) return [`${source} is ${stats.size} bytes, the mapping table says ${file.bytes}`];
	return [];
}

/** Why the file must be uploaded: what differs on R2, or null when its object there is the same. */
async function differenceOnR2(file: MediaFile, localMd5: string): Promise<string | null> {
	// The query string keeps this check out of the URL's cache at Cloudflare's edge.
	const url = new URL(file.url);
	url.searchParams.set('upload-check', String(Date.now()));
	let response: Response;
	try {
		response = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(30_000) });
	} catch (error) {
		return `could not check R2: ${(error as Error).message}`;
	}
	if (response.status !== 200) return `R2 answers HTTP ${response.status}`;
	const etag = response.headers.get('etag')?.replace(/^W\//, '').replaceAll('"', '');
	if (etag !== localMd5) return 'different content on R2';
	const contentType = response.headers.get('content-type');
	if (contentType !== file.contentType) return `Content-Type on R2 is ${contentType}`;
	return null;
}

async function md5(file: string): Promise<string> {
	const hash = createHash('md5');
	for await (const chunk of createReadStream(file)) hash.update(chunk as Buffer);
	return hash.digest('hex');
}

/** The object's key in the bucket: the path of its URL, decoded. */
function objectKey(url: string): string {
	return decodeURIComponent(new URL(url).pathname.slice(1));
}

function quote(arg: string): string {
	return /[\s"]/.test(arg) ? `"${arg.replaceAll('"', '\\"')}"` : arg;
}
