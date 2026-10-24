// The build fails when _redirects has more rules than Cloudflare Workers
// static assets apply: 2,000 static and 100 dynamic ones. Beyond that,
// wrangler skips rules with only a warning, and old URLs would quietly 404.
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { AstroIntegrationLogger } from 'astro';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import redirectsBudget from '../src/integrations/redirects-budget';

let dir: string;
beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), 'aniya-moe-redirects-'));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const logger = { info: () => {}, warn: () => {} } as unknown as AstroIntegrationLogger;

/** Runs the check on a build output whose _redirects has these lines. */
async function checkBuild(lines: string[]): Promise<void> {
	writeFileSync(join(dir, '_redirects'), `${lines.join('\n')}\n`);
	const hook = redirectsBudget().hooks['astro:build:done']!;
	await hook({ dir: pathToFileURL(`${dir}/`), logger } as never);
}

const staticRules = (count: number, from = 0) =>
	Array.from({ length: count }, (_, i) => `/old/${from + i} /new/${from + i}/ 301`);

describe('the _redirects budget', () => {
	it('lets a build with 2,000 static and 100 dynamic rules pass', async () => {
		const dynamic = Array.from({ length: 100 }, (_, i) => `/feeds/${i}/:slug/feed/ /feeds/${i}/:slug/ 301`);

		await expect(checkBuild(['# comments and blank lines are no rules', '', ...staticRules(2000), ...dynamic])).resolves.toBeUndefined();
	});

	it('fails a build with more than 2,000 static rules', async () => {
		await expect(checkBuild(staticRules(2001))).rejects.toThrow(/2,001 static rules.*2,000/);
	});

	it('counts every rule after the first dynamic one as dynamic, as Cloudflare does', async () => {
		const lines = ['/feed/:slug/ /:slug/ 301', ...staticRules(100)];

		await expect(checkBuild(lines)).rejects.toThrow(/101 dynamic rules.*100/);
	});
});
