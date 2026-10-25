// Branch names follow Conventional Branch 1.1.0 (https://conventionalbranch.org):
// the pre-push hook and CI check them. Valid and invalid names are the
// specification's own examples where it has them.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { isConventionalBranch } from '../scripts/branch-name';

const script = fileURLToPath(new URL('../scripts/branch-name.ts', import.meta.url));
const run = (...branches: string[]) => spawnSync(process.execPath, [script, ...branches], { encoding: 'utf8' });

describe('node scripts/branch-name.ts <branch>...', () => {
	it('passes Conventional Branch names, silently', () => {
		const { status, stdout, stderr } = run('main', 'chore/guardrail-checks');

		expect(status).toBe(0);
		expect(stdout).toBe('');
		expect(stderr).toBe('');
	});

	it('fails a name that is not one, naming it and the rules', () => {
		const { status, stderr } = run('chore/guardrail-checks', 'worktree-agent-a87110e8cf69251de');

		expect(status).toBe(1);
		expect(stderr).toContain('"worktree-agent-a87110e8cf69251de" is not a Conventional Branch name');
		expect(stderr).not.toContain('"chore/guardrail-checks"');
		expect(stderr).toContain('<type>/<description>');
		expect(stderr).toContain('https://conventionalbranch.org');
	});
});

describe('a Conventional Branch name', () => {
	it.each([
		// Trunk branches take no prefix.
		'main',
		'master',
		'develop',
		// <type>/<description>, the aliases feat/ and fix/ included.
		'feature/add-login-page',
		'feat/add-login-page',
		'bugfix/fix-header-bug',
		'fix/header-bug',
		'hotfix/security-patch',
		'chore/update-dependencies',
		'feature/issue-123-new-login',
		// Dots, for version numbers, in any description.
		'release/v1.2.0',
		'chore/upgrade-node-v20.11',
		// The prefixes of AI agents (1.1.0).
		'ai/refactor-auth-flow',
		'claude/security-patch',
		'codex/optimize-query',
		'copilot/add-login-page',
		'cursor/fix-header-bug',
	])('can be %s', (name) => {
		expect(isConventionalBranch(name)).toBe(true);
	});

	it.each([
		// Lowercase only.
		'Feature/Add-Login',
		'Main',
		// No consecutive hyphens or dots, none at the start or end of the description, no hyphen next to a dot.
		'feature/new--login',
		'feature/-new-login',
		'feature/new-login-',
		'release/v1..2',
		'release/.v1',
		'release/v1.2.0.',
		'release/v1.-2.0',
		// Letters, digits, hyphens and dots only.
		'fix/header bug',
		'fix/header_bug',
		'feature/a/b',
		'feature/中文',
		// A type of the specification, and a description after it.
		'unknown/some-task',
		'docs/update-readme',
		'feature/',
		'feature',
		// What Claude Code names an agent's worktree branch.
		'worktree-agent-a87110e8cf69251de',
	])('cannot be %s', (name) => {
		expect(isConventionalBranch(name)).toBe(false);
	});
});
