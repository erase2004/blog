// Every integration that writes _redirects adds its rules through
// appendRedirects(): after the rules already there, written the same way.
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { appendRedirects } from '../src/integrations/redirects-file';

let dir: string;
beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), 'aniya-moe-redirects-file-'));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const redirects = () => readFileSync(join(dir, '_redirects'), 'utf8');

describe('rules added to _redirects', () => {
	it('come after the rules already there', async () => {
		writeFileSync(join(dir, '_redirects'), '/a /b/ 301');

		await appendRedirects(pathToFileURL(`${dir}/`), [{ from: '/c', to: '/d/', status: 301 }]);

		expect(redirects()).toBe('/a /b/ 301\n/c /d/ 301\n');
	});

	it('have their paths percent-encoded, whatever characters they have', async () => {
		await appendRedirects(pathToFileURL(`${dir}/`), [
			{ from: '/category/技術', to: '/category/技術/', status: 301 },
			{ from: '/wp-content/uploads/2025/05/瀨戶內國際藝術祭-2025-3.pdf', to: 'https://media.aniya.moe/files/a/瀨戶內國際藝術祭-2025-3.pdf', status: 301 },
			{ from: '/*/feed/', to: '/:splat/', status: 301 },
			{ from: '/404/', to: '/404/no-such-page/', status: 200 },
		]);

		expect(redirects().split('\n')).toEqual([
			'/category/%E6%8A%80%E8%A1%93 /category/%E6%8A%80%E8%A1%93/ 301',
			'/wp-content/uploads/2025/05/%E7%80%A8%E6%88%B6%E5%85%A7%E5%9C%8B%E9%9A%9B%E8%97%9D%E8%A1%93%E7%A5%AD-2025-3.pdf ' +
				'https://media.aniya.moe/files/a/%E7%80%A8%E6%88%B6%E5%85%A7%E5%9C%8B%E9%9A%9B%E8%97%9D%E8%A1%93%E7%A5%AD-2025-3.pdf 301',
			'/*/feed/ /:splat/ 301',
			'/404/ /404/no-such-page/ 200',
			'',
		]);
	});

	// Cloudflare matches a rule's source against the request's own path, so a
	// source in lowercase escapes matches the requests WordPress's links make.
	it('keep the percent-escapes a path already has as they are written', async () => {
		await appendRedirects(pathToFileURL(`${dir}/`), [
			{ from: '/category/%e6%8a%80%e8%a1%93/', to: '/category/技術/', status: 301 },
			{ from: '/tag/book%e2%98%86walker/', to: '/tag/book%E2%98%86walker/', status: 301 },
		]);

		expect(redirects().split('\n')).toEqual([
			'/category/%e6%8a%80%e8%a1%93/ /category/%E6%8A%80%E8%A1%93/ 301',
			'/tag/book%e2%98%86walker/ /tag/book%E2%98%86walker/ 301',
			'',
		]);
	});
});
