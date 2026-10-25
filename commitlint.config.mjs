// @ts-check

// Conventional Commits, checked by commitlint: the commit-msg hook
// (.husky/commit-msg) and the Conventions job in CI. The conventional
// config, relaxed only where this repo's history departs from it on purpose.
export default {
	extends: ['@commitlint/config-conventional'],
	rules: {
		// A body is written one line per paragraph, for the reader's viewer to wrap.
		'body-max-line-length': [0],
		// A subject may start with a name that is capitalized (`feat(seo): GA4, …`);
		// Start Case, PascalCase and UPPER CASE subjects still fail.
		'subject-case': [2, 'never', ['start-case', 'pascal-case', 'upper-case']],
	},
};
