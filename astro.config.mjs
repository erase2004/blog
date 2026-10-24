// @ts-check

import { satteri } from '@astrojs/markdown-satteri';
import mdx from '@astrojs/mdx';
import expressiveCode, { pluginFramesTexts } from 'astro-expressive-code';
import { defineConfig, fontProviders } from 'astro/config';
import mediaRedirects from './src/integrations/media-redirects';
import trailingSlashRedirects from './src/integrations/trailing-slash-redirects';

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
		// footnotes section labelled in Chinese.
		processor: satteri({
			features: {
				gfm: { footnotes: { label: '註腳', backLabel: '回到內文的註腳 {reference}' } },
				smartPunctuation: true,
			},
		}),
	},
	// Expressive Code highlights code blocks (and must come before MDX).
	integrations: [expressiveCode({ defaultLocale: 'zh-TW' }), mdx(), mediaRedirects(), trailingSlashRedirects()],
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
