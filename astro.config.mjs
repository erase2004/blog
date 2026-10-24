// @ts-check

import mdx from '@astrojs/mdx';
import { defineConfig, fontProviders } from 'astro/config';
import imageRedirects from './src/integrations/image-redirects';
import redirectsBudget from './src/integrations/redirects-budget';
import trailingSlashRedirects from './src/integrations/trailing-slash-redirects';

// https://astro.build/config
export default defineConfig({
	site: 'https://aniya.moe',
	// Every URL ends with "/", as on the WordPress site; each page is written
	// as <path>/index.html.
	trailingSlash: 'always',
	build: { format: 'directory' },
	// Images become webp in several widths (srcset), up to their own width;
	// the browser picks the one that fits the screen.
	image: { layout: 'constrained' },
	// redirectsBudget() checks the _redirects the others wrote: keep it last.
	integrations: [mdx(), trailingSlashRedirects(), imageRedirects(), redirectsBudget()],
	fonts: [
		{
			provider: fontProviders.local(),
			name: 'Atkinson',
			cssVariable: '--font-atkinson',
			fallbacks: ['sans-serif'],
			options: {
				variants: [
					{
						src: ['./src/assets/fonts/atkinson-regular.woff'],
						weight: 400,
						style: 'normal',
						display: 'swap',
					},
					{
						src: ['./src/assets/fonts/atkinson-bold.woff'],
						weight: 700,
						style: 'normal',
						display: 'swap',
					},
				],
			},
		},
	],
});
