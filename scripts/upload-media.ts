// Uploads the videos and the PDF listed in the `media` section of the
// old-URL mapping table from the WordPress backup to the R2 bucket, with
// wrangler. Files already on R2 with the same content and type are skipped,
// so it can be run again until everything is there.
//
//   node scripts/upload-media.ts [--dry-run] [--force] [--backup <dir>]
//
// --dry-run prints the wrangler command for each file it would upload and
// uploads nothing; it needs no credentials. Otherwise wrangler authenticates
// with CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID from the environment.
// --force uploads every file. Exits with 1 when the upload fails, 2 on bad usage.
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { mediaFiles } from '../src/lib/old-url-map.ts';
import { MEDIA_BUCKET, WORDPRESS_BACKUP_DIR } from './r2-media/settings.ts';
import { uploadMedia } from './r2-media/upload.ts';

const USAGE = 'usage: node scripts/upload-media.ts [--dry-run] [--force] [--backup <dir>]';
const root = fileURLToPath(new URL('../', import.meta.url));
const wranglerBin = join(root, 'node_modules/wrangler/bin/wrangler.js');

const { values } = (() => {
	try {
		return parseArgs({
			options: { 'dry-run': { type: 'boolean' }, force: { type: 'boolean' }, backup: { type: 'string' } },
		});
	} catch (error) {
		console.error(`${(error as Error).message}\n${USAGE}`);
		process.exit(2);
	}
})();

async function wrangler(args: string[]): Promise<void> {
	const child = spawn(process.execPath, [wranglerBin, ...args], { cwd: root, stdio: 'inherit' });
	const [code] = (await once(child, 'exit')) as [number | null];
	if (code !== 0) throw new Error(`wrangler ${args.slice(0, 4).join(' ')} exited with code ${code}`);
}

const ok = await uploadMedia({
	files: mediaFiles(),
	backupDir: resolve(values.backup ?? WORDPRESS_BACKUP_DIR),
	bucket: MEDIA_BUCKET,
	dryRun: values['dry-run'] ?? false,
	force: values.force ?? false,
	env: process.env,
	wrangler,
	log: (line) => console.log(line),
});
if (ok && !values['dry-run']) console.log('Check them with `npm run verify-media`.');
process.exit(ok ? 0 : 1);
