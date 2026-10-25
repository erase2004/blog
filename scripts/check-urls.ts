// URL checker: checks every URL the WordPress site had against a build output
// directory or a live site, and holds the results against the pending list.
//
//   node scripts/check-urls.ts build [<dir>]     a build output directory (default: dist)
//   node scripts/check-urls.ts http <base-url>   a live site, e.g. a preview URL
//
// --prune-pending takes the entries that now pass, or are not expected URLs,
// off the pending list. Exits with 1 when the check fails, 2 on bad usage.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { oldUrlMap } from '../src/lib/old-url-map.ts';
import { checkUrls, formatReport, prunePendingList } from './url-checker/check.ts';
import { loadExpectedUrls } from './url-checker/expected-urls.ts';
import { PENDING_LIST_FILE, SITEMAP_SNAPSHOT_DIR } from './url-checker/settings.ts';
import { buildOutput, httpSite, type Target } from './url-checker/targets.ts';

const USAGE = 'usage: node scripts/check-urls.ts (build [<dir>] | http <base-url>) [--prune-pending]';
const root = fileURLToPath(new URL('../', import.meta.url));

function fail(message: string): never {
	console.error(message);
	process.exit(2);
}

const { positionals, values } = (() => {
	try {
		return parseArgs({ allowPositionals: true, options: { 'prune-pending': { type: 'boolean' } } });
	} catch (error) {
		return fail(`${(error as Error).message}\n${USAGE}`);
	}
})();
const [mode, where, ...extra] = positionals;
if (extra.length > 0) fail(USAGE);

let target: Target;
if (mode === 'build') {
	const dir = where === undefined ? join(root, 'dist') : resolve(where);
	if (!existsSync(dir)) fail(`no build output at ${dir}; run \`npm run build\` first`);
	target = buildOutput(dir);
} else if (mode === 'http' && where !== undefined && URL.canParse(where)) {
	target = httpSite(where);
} else {
	fail(USAGE);
}

const pendingListFile = join(root, PENDING_LIST_FILE);
const pendingList = readFileSync(pendingListFile, 'utf8');
const report = await checkUrls({
	expected: loadExpectedUrls({ sitemapDir: join(root, SITEMAP_SNAPSHOT_DIR), mappingTable: oldUrlMap }),
	target,
	pendingList,
});
console.log(formatReport(report, PENDING_LIST_FILE));

let ok = report.ok;
if (values['prune-pending'] && report.nowPassing.length + report.notExpected.length > 0) {
	writeFileSync(pendingListFile, prunePendingList(pendingList, report));
	console.log(
		`\nTook ${report.nowPassing.length + report.notExpected.length} entries off ${PENDING_LIST_FILE}.`,
	);
	ok = report.failing.length === 0 && report.pendingListProblems.length === 0;
}
process.exit(ok ? 0 : 1);
