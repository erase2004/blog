// @ts-check

import { satteri } from '@astrojs/markdown-satteri';
import mdx from '@astrojs/mdx';
import expressiveCode, { pluginFramesTexts } from 'astro-expressive-code';
import { defineConfig } from 'astro/config';
import imageRedirects from './src/integrations/image-redirects';
import mediaRedirects from './src/integrations/media-redirects';
import notFoundPage from './src/integrations/not-found-page';
import oldUrlRedirects from './src/integrations/old-url-redirects';
import pagefindIndex from './src/integrations/pagefind';
import redirectsBudget from './src/integrations/redirects-budget';
import trailingSlashRedirects from './src/integrations/trailing-slash-redirects';
import { contentImageSizes } from './src/lib/image-sizes';

// Expressive Code has no Chinese texts of its own.
pluginFramesTexts.addLocale('zh-TW', {
	terminalWindowFallbackTitle: '終端機視窗',
	copyButtonTooltip: '複製到剪貼簿',
	copyButtonCopied: '已複製！',
});

// https://astro.build/config
export default defineConfig({
	site: 'https://aniya.moe',
	// Every URL ends with "/", as on the WordPress site; each page is written
	// as <path>/index.html.
	trailingSlash: 'always',
	build: { format: 'directory' },
	markdown: {
		// Astro's default Markdown processor and features, with the GFM
		// footnotes section labelled in Chinese, and the images of posts sized
		// for the post's column.
		processor: satteri({
			features: {
				gfm: { footnotes: { label: '註腳', backLabel: '回到內文的註腳 {reference}' } },
				smartPunctuation: true,
			},
			hastPlugins: [contentImageSizes],
		}),
	},
	// Images become webp in several widths (srcset), up to their own width;
	// the browser picks the one that fits the column they are shown in.
	image: { layout: 'constrained' },
	// Expressive Code highlights code blocks (and must come before MDX). One
	// dark theme, like the site's dark header, whatever the reader's system
	// colour scheme: the site itself has only a light one.
	// redirectsBudget() checks the _redirects the others wrote: keep it last.
	integrations: [
		expressiveCode({ defaultLocale: 'zh-TW', themes: ['github-dark'] }),
		mdx(),
		mediaRedirects(),
		trailingSlashRedirects(),
		imageRedirects(),
		notFoundPage(),
		oldUrlRedirects(),
		pagefindIndex(),
		redirectsBudget(),
	],
});
