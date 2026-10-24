// WordPress converter: reads the SQL backup of the WordPress site and writes
// the new site's content files, the category and tag data, and the old-URL
// mapping table. Running it again on the same backup writes the same bytes,
// so generated files that conflict in a merge are resolved by running it.
//
//   node scripts/convert-wordpress.ts [<dump.sql>]   (default: settings.ts)
//
// The content directories are emptied first: until the manual review
// (ticket 18) every file in them comes from the converter.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { convertWordPress, PAGES_DIR, POSTS_DIR } from './wordpress-converter/convert.ts';
import { WORDPRESS_DUMP } from './wordpress-converter/settings.ts';
import { readSqlDump } from './wordpress-converter/sql-dump.ts';
import { WORDPRESS_TABLES } from './wordpress-converter/wordpress.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
const [dumpArgument, ...extra] = process.argv.slice(2);
if (extra.length > 0) {
	console.error('usage: node scripts/convert-wordpress.ts [<dump.sql>]');
	process.exit(2);
}
const dump = resolve(dumpArgument ?? WORDPRESS_DUMP);

const tables = readSqlDump(readFileSync(dump, 'utf8'), WORDPRESS_TABLES);
const { files, unconverted } = convertWordPress(tables, { source: basename(dump) });

for (const dir of [POSTS_DIR, PAGES_DIR]) rmSync(join(root, dir), { recursive: true, force: true });
for (const [file, content] of Object.entries(files)) {
	mkdirSync(dirname(join(root, file)), { recursive: true });
	writeFileSync(join(root, file), content);
}

const count = (dir: string) => Object.keys(files).filter((file) => file.startsWith(`${dir}/`)).length;
console.log(`Converted ${basename(dump)}: ${count(POSTS_DIR)} posts, ${count(PAGES_DIR)} pages, ${Object.keys(files).length} files.`);
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
