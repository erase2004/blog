// YouTube embeds (core/embed) become the lightweight <YouTube> component,
// which shows the thumbnail and loads the player only when clicked.
import { describe, expect, it } from 'vitest';
import { convertContent } from '../../scripts/wordpress-converter/content';
import { loadWordPress } from '../../scripts/wordpress-converter/wordpress';
import { compileMdx } from '../support/render-markdown';
import { meta, post, wordpressTables } from './fixtures';

const paragraphBlock = (html: string) => `<!-- wp:paragraph -->\n<p>${html}</p>\n<!-- /wp:paragraph -->`;

const embedBlock = (url: string, provider = 'youtube') => `<!-- wp:embed {"url":"${url}","type":"video","providerNameSlug":"${provider}","responsive":true,"className":"wp-embed-aspect-16-9 wp-has-aspect-ratio"} -->
<figure class="wp-block-embed is-type-video is-provider-${provider} wp-block-embed-${provider} wp-embed-aspect-16-9 wp-has-aspect-ratio"><div class="wp-block-embed__wrapper">
${url}
</div></figure>
<!-- /wp:embed -->`;

/** Converts post 442 with this content; WordPress cached the embed's player (oEmbed) in its metadata. */
function convertPost(content: string) {
	const tables = wordpressTables();
	const post442 = tables.wp_posts!.find((row) => row.ID === '442')!;
	post442.post_content = content;
	tables.wp_postmeta!.push(
		meta(
			442,
			'_oembed_523d455759f06585954c077f174bcb65',
			'<iframe title="TVアニメ『Summer Pockets』第1弾PV" width="840" height="473" src="https://www.youtube.com/embed/x3_Pcru8SS8?feature=oembed" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>',
		),
		meta(442, '_oembed_time_523d455759f06585954c077f174bcb65', '1748398270'),
	);
	const site = loadWordPress(tables);
	return convertContent(content, { entry: site.post(442), site });
}

describe('YouTube embeds', () => {
	it('become the YouTube component, titled as WordPress titled the player, in an MDX file', () => {
		const content = `${paragraphBlock('前')}\n\n${embedBlock('https://www.youtube.com/watch?v=x3_Pcru8SS8')}\n\n${paragraphBlock('後')}`;

		const converted = convertPost(content);

		expect(converted).toMatchObject({
			markdown: [
				"import YouTube from '../../components/YouTube.astro';",
				'',
				'前',
				'',
				'<YouTube id="x3_Pcru8SS8" title="TVアニメ『Summer Pockets』第1弾PV" />',
				'',
				'後',
				'',
			].join('\n'),
			mdx: true,
			unconverted: [],
		});
		expect(() => compileMdx(converted.markdown)).not.toThrow();
	});

	it('of other sites stay visibly marked', () => {
		const block = embedBlock('https://vimeo.com/76979871', 'vimeo');

		const { markdown, unconverted } = convertContent(block);

		expect(markdown).toBe(`\`\`\`html title="wp-unconverted: core/embed"\n${block}\n\`\`\`\n`);
		expect(unconverted).toEqual([{ kind: 'core/embed', source: block }]);
	});
});
