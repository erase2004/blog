import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		projects: [
			{
				test: {
					name: 'unit',
					include: ['tests/**/*.test.ts'],
					exclude: [...configDefaults.exclude, 'tests/site/**'],
				},
			},
			{
				test: {
					// The built site, served by wrangler dev: global-setup.ts builds
					// and serves it once for all these files, and only when one of
					// them runs.
					name: 'site',
					include: ['tests/site/**/*.test.ts'],
					globalSetup: ['tests/site/global-setup.ts'],
					// One file at a time, after the unit tests: they share one server
					// (the URL checker's thousands of requests would slow the others
					// down) and their browser tests watch timings.
					fileParallelism: false,
				},
			},
		],
	},
});
