// The preview alias a branch's Worker versions are uploaded under (CI): the
// alias names the preview URL `https://<alias>-<worker>.<subdomain>.workers.dev`.
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { previewAlias } from '../scripts/preview-alias';

const script = fileURLToPath(new URL('../scripts/preview-alias.ts', import.meta.url));

describe('node scripts/preview-alias.ts <branch>', () => {
	it("prints the branch's alias for the Worker that wrangler.jsonc names", () => {
		const output = execFileSync(
			process.execPath,
			[script, 'feature/a-very-long-branch-name-that-goes-on-and-on-past-the-dns-label-limit'],
			{ encoding: 'utf8' },
		);

		// Cut to fit "-aniya-moe".
		expect(output).toBe('feature-a-very-long-branch-name-that-goes-on-and-761a\n');
	});
});

describe('the preview alias of a branch', () => {
	it('is the branch name with each slash turned into a hyphen', () => {
		expect(previewAlias('feature/wordpress-migration', 'aniya-moe')).toBe('feature-wordpress-migration');
	});

	it('has only lowercase letters, digits and single hyphens between them', () => {
		expect(previewAlias('Fix/Bug_#12', 'aniya-moe')).toBe('fix-bug-12');
		expect(previewAlias('feature//a--b..c', 'aniya-moe')).toBe('feature-a-b-c');
		expect(previewAlias('-fix/', 'aniya-moe')).toBe('fix');
		expect(previewAlias('feature/中文-slug', 'aniya-moe')).toBe('feature-slug');
	});

	it('starts with a letter', () => {
		expect(previewAlias('123-hotfix', 'aniya-moe')).toBe('branch-123-hotfix');
	});

	it('tells branches apart by a hash of their name when nothing else of it is left', () => {
		expect(previewAlias('功能/中文', 'aniya-moe')).toBe('branch-e0e1');
	});

	describe('of a long branch name', () => {
		const branch = 'feature/a-very-long-branch-name-that-goes-on-and-on-past-the-dns-label-limit';

		it('is cut short and ends with a hash of the name, so that "<alias>-<worker>" fits a DNS label (63 characters)', () => {
			const alias = previewAlias(branch, 'aniya-moe');

			expect(alias).toBe('feature-a-very-long-branch-name-that-goes-on-and-761a');
			expect(`${alias}-aniya-moe`).toHaveLength(63);
		});

		it('is cut shorter for a longer Worker name', () => {
			expect(previewAlias(branch, 'w'.repeat(50))).toBe('feature-761a');
		});

		it('has no hyphen left before the hash where the cut falls after one', () => {
			expect(previewAlias(`${'x'.repeat(47)}/${'y'.repeat(20)}`, 'aniya-moe')).toBe(`${'x'.repeat(47)}-8eb1`);
		});
	});
});
