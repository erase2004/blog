// Checks the videos and the PDF on R2, at the URLs in the `media` section of
// the old-URL mapping table: each answers 200 with its type and size, and a
// range request (what a <video> sends when seeking) answers 206.
//
//   node scripts/verify-media.ts
//
// Exits with 1 when a file fails a check. Whether the old URLs redirect to
// these is the URL checker's job (`npm run check-urls`).
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readMediaTable } from './r2-media/media-table.ts';
import { verifyMedia } from './r2-media/verify.ts';
import { MAPPING_TABLE_FILE } from './url-checker/settings.ts';

if (process.argv.length > 2) {
	console.error('usage: node scripts/verify-media.ts');
	process.exit(2);
}

const root = fileURLToPath(new URL('../', import.meta.url));
const results = await verifyMedia(readMediaTable(join(root, MAPPING_TABLE_FILE)));
for (const { url, problems } of results) {
	console.log(`${problems.length === 0 ? 'ok    ' : 'FAILED'}  ${url}`);
	for (const problem of problems) console.log(`        ${problem}`);
}
const failed = results.filter(({ problems }) => problems.length > 0).length;
console.log(`\n${results.length - failed} of ${results.length} files on R2 pass.`);
process.exit(failed === 0 ? 0 : 1);
