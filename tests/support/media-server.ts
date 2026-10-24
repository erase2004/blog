// A local stand-in for the R2 bucket's custom domain (media.aniya.moe): serves
// the objects put in it by path, with the headers R2 sends (Content-Type,
// Content-Length, an ETag that is the MD5 of a single-part upload) and
// single-range requests answered with 206.
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

export type StoredObject = { body: Buffer; contentType: string };

export interface MediaServer {
	/** Origin, e.g. `http://127.0.0.1:54321` (no trailing slash). */
	url: string;
	/** Objects by key (the URL path without its leading slash, decoded). */
	objects: Map<string, StoredObject>;
	/** When true, answers range requests with the whole object and 200, as a server without range support does. */
	ignoreRanges: boolean;
	stop(): Promise<void>;
}

export async function startMediaServer(): Promise<MediaServer> {
	const objects = new Map<string, StoredObject>();
	const state = { ignoreRanges: false };
	const server = createServer((request, response) => {
		const { pathname } = new URL(request.url ?? '/', 'http://localhost');
		const object = objects.get(decodeURIComponent(pathname.slice(1)));
		if (!object) {
			response.writeHead(404, { 'Content-Type': 'text/plain' }).end('Object Not Found');
			return;
		}
		const headers = {
			'Content-Type': object.contentType,
			ETag: `"${createHash('md5').update(object.body).digest('hex')}"`,
			'Accept-Ranges': 'bytes',
		};
		const range = /^bytes=(\d+)-(\d*)$/.exec(request.headers.range ?? '');
		let status = 200;
		let body = object.body;
		const extra: Record<string, string> = {};
		if (range && !state.ignoreRanges) {
			const start = Number(range[1]);
			const end = Math.min(range[2] ? Number(range[2]) : object.body.length - 1, object.body.length - 1);
			status = 206;
			body = object.body.subarray(start, end + 1);
			extra['Content-Range'] = `bytes ${start}-${end}/${object.body.length}`;
		}
		response.writeHead(status, { ...headers, ...extra, 'Content-Length': String(body.length) });
		response.end(request.method === 'HEAD' ? undefined : body);
	});
	server.listen(0, '127.0.0.1');
	await once(server, 'listening');
	const { port } = server.address() as AddressInfo;
	return {
		url: `http://127.0.0.1:${port}`,
		objects,
		get ignoreRanges() {
			return state.ignoreRanges;
		},
		set ignoreRanges(value) {
			state.ignoreRanges = value;
		},
		stop: async () => {
			server.closeAllConnections();
			server.close();
			await once(server, 'close');
		},
	};
}
