// Branch names follow Conventional Branch 1.1.0 (https://conventionalbranch.org):
// the pre-push hook (.husky/pre-push) and the Conventions job in CI check them.
//
//   node scripts/branch-name.ts <branch>...
//
// exits 1, naming each branch whose name is not one.

/** The long-lived branches, which take no prefix. */
const TRUNK_BRANCHES = ['main', 'master', 'develop'];

/** What a branch is for, or which AI agent made it; feat and fix are aliases of feature and bugfix. */
const TYPES = ['feature', 'feat', 'bugfix', 'fix', 'hotfix', 'release', 'chore', 'ai', 'claude', 'codex', 'copilot', 'cursor'];

/** Lowercase letters and digits, with single dots between them (version numbers). */
const SEGMENT = '[a-z0-9]+(?:\\.[a-z0-9]+)*';

/** The specification's grammar: its regex in spec.json. */
const BRANCH_NAME = new RegExp(`^(?:${TRUNK_BRANCHES.join('|')}|(?:${TYPES.join('|')})/${SEGMENT}(?:-${SEGMENT})*)$`);

/**
 * Whether `name` is a Conventional Branch name: a trunk branch, or
 * `<type>/<description>`, the description being words of lowercase letters
 * and digits joined by single hyphens, with dots allowed inside words.
 */
export function isConventionalBranch(name: string): boolean {
	return BRANCH_NAME.test(name);
}

if (import.meta.main) {
	const branches = process.argv.slice(2);
	if (branches.length === 0) {
		console.error('usage: node scripts/branch-name.ts <branch>...');
		process.exit(2);
	}
	const invalid = branches.filter((branch) => !isConventionalBranch(branch));
	if (invalid.length > 0) {
		for (const branch of invalid) console.error(`"${branch}" is not a Conventional Branch name.`);
		console.error(`
A branch is ${TRUNK_BRANCHES.join(', ')}, or <type>/<description> (Conventional Branch 1.1.0, https://conventionalbranch.org):
  type: ${TYPES.join(', ')}
  description: lowercase letters and digits, words joined by single hyphens, dots only inside words (release/v1.2.0)
Rename a local branch with: git branch -m <type>/<description>`);
		process.exit(1);
	}
}
