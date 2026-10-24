// WordPress converter: reads the SQL backup of the WordPress site and writes
// the new site's content files, the category and tag data, and the old-URL
// mapping table, and copies the images the content uses from the backup's
// uploads directory. Running it again on the same backup writes the same
// bytes, so generated files that conflict in a merge are resolved by running it.
//
//   node scripts/convert-wordpress.ts [<dump.sql> [<uploads dir>]]   (defaults: settings.ts)
//
// The content directories are emptied first, and the image directory made to
// hold exactly the images the content uses: until the manual review (ticket
// 18) every file in them comes from the converter. The backup is only read.
import { copyFileSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { convertWordPress, PAGES_DIR, POSTS_DIR } from './wordpress-converter/convert.ts';
import { IMAGES_DIR } from './wordpress-converter/media-library.ts';
import { WORDPRESS_DUMP, WORDPRESS_UPLOADS } from './wordpress-converter/settings.ts';
import { readSqlDump } from './wordpress-converter/sql-dump.ts';
import { WORDPRESS_TABLES } from './wordpress-converter/wordpress.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
const [dumpArgument, uploadsArgument, ...extra] = process.argv.slice(2);
if (extra.length > 0) {
	console.error('usage: node scripts/convert-wordpress.ts [<dump.sql> [<uploads dir>]]');
	process.exit(2);
}
const dump = resolve(dumpArgument ?? WORDPRESS_DUMP);
const uploadsDir = resolve(uploadsArgument ?? WORDPRESS_UPLOADS);

const tables = readSqlDump(readFileSync(dump, 'utf8'), WORDPRESS_TABLES);
const { files, unconverted, images } = convertWordPress(tables, { source: basename(dump) });

for (const dir of [POSTS_DIR, PAGES_DIR]) rmSync(join(root, dir), { recursive: true, force: true });
for (const [file, content] of Object.entries(files)) {
	mkdirSync(dirname(join(root, file)), { recursive: true });
	writeFileSync(join(root, file), content);
}
const copied = syncImages(new Map(images.map(({ upload, file }) => [join(root, file), join(uploadsDir, upload)])));

const count = (dir: string) => Object.keys(files).filter((file) => file.startsWith(`${dir}/`)).length;
console.log(`Converted ${basename(dump)}: ${count(POSTS_DIR)} posts, ${count(PAGES_DIR)} pages, ${Object.keys(files).length} files.`);
console.log(`Images: ${images.length} in ${IMAGES_DIR} (${copied} copied from ${uploadsDir}).`);
const byKind = new Map<string, Set<string>>();
for (const { file, kind } of unconverted) byKind.set(kind, (byKind.get(kind) ?? new Set()).add(file));
const kinds = [...byKind].sort(([a], [b]) => a.localeCompare(b, 'en'));
if (kinds.length > 0) {
	console.log('\nLeft as wp-unconverted markers (kind: markers in files):');
	for (const [kind, inFiles] of kinds) {
		const markers = unconverted.filter((item) => item.kind === kind).length;
		console.log(`  ${kind}: ${markers} in ${inFiles.size} files`);
	}
}

/**
 * Makes the image directory hold exactly these files (destination → source).
 * A file already there with the source's size and time is not copied again,
 * so a rerun leaves the 300-odd MB alone. Returns how many were copied.
 */
function syncImages(wanted: Map<string, string>): number {
	const dir = join(root, IMAGES_DIR);
	mkdirSync(dir, { recursive: true });
	for (const entry of readdirSync(dir, { recursive: true, withFileTypes: true })) {
		const path = join(entry.parentPath, entry.name);
		if (entry.isFile() && !wanted.has(path)) rmSync(path);
	}
	let copied = 0;
	for (const [to, from] of wanted) {
		const source = statSync(from);
		const existing = statSync(to, { throwIfNoEntry: false });
		if (existing && existing.size === source.size && Math.abs(existing.mtimeMs - source.mtimeMs) < 1000) continue;
		mkdirSync(dirname(to), { recursive: true });
		copyFileSync(from, to);
		utimesSync(to, source.atime, source.mtime);
		copied++;
	}
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const path = join(dir, entry.name);
		if (entry.isDirectory() && readdirSync(path).length === 0) rmSync(path, { recursive: true });
	}
	return copied;
}
