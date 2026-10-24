// Checks the videos and the PDF on R2 the way a browser fetches them: each
// URL answers 200 with the file's type and size, and a range request from
// the middle of the file (what a <video> sends when seeking) answers 206
// with that range.
import type { MediaFile } from '../../src/lib/old-url-map.ts';

export type VerifyResult = { url: string; problems: string[] };

/** Bytes asked for in the range request. */
const RANGE_LENGTH = 1024;

export async function verifyMedia(files: MediaFile[]): Promise<VerifyResult[]> {
	const results: VerifyResult[] = [];
	for (const file of files) {
		const problems = await fileProblems(file).catch((error: Error) => [`request failed: ${error.message}`]);
		results.push({ url: file.url, problems });
	}
	return results;
}

async function fileProblems(file: MediaFile): Promise<string[]> {
	const problems: string[] = [];
	const whole = await get(file.url);
	await whole.body?.cancel();
	if (whole.status !== 200) return [`expected HTTP 200, got ${whole.status}`];
	const contentType = whole.headers.get('content-type');
	if (contentType !== file.contentType) problems.push(`expected Content-Type ${file.contentType}, got ${contentType}`);
	const length = whole.headers.get('content-length');
	if (length !== String(file.bytes)) problems.push(`expected Content-Length ${file.bytes}, got ${length}`);

	const start = Math.floor(file.bytes / 2);
	const end = Math.min(start + RANGE_LENGTH, file.bytes) - 1;
	const range = `bytes=${start}-${end}`;
	const part = await get(file.url, { Range: range });
	const body = Buffer.from(await part.arrayBuffer());
	const where = `Range: ${range}`;
	if (part.status !== 206) {
		problems.push(`${where}: expected HTTP 206, got ${part.status}`);
	} else {
		const contentRange = part.headers.get('content-range');
		if (contentRange !== `bytes ${start}-${end}/${file.bytes}`) {
			problems.push(`${where}: expected Content-Range bytes ${start}-${end}/${file.bytes}, got ${contentRange}`);
		}
		if (body.length !== end - start + 1) problems.push(`${where}: expected ${end - start + 1} bytes, got ${body.length}`);
	}
	return problems;
}

function get(url: string, headers: Record<string, string> = {}): Promise<Response> {
	return fetch(url, { headers, redirect: 'manual', signal: AbortSignal.timeout(60_000) });
}
