// Before/after sliders: Jetpack image-compare blocks, and the copies of their
// markup pasted as Custom HTML blocks, become the <Compare> component.
import { describe, expect, it } from 'vitest';
import { convertContent } from '../../scripts/wordpress-converter/content';
import { loadWordPress } from '../../scripts/wordpress-converter/wordpress';
import { compileMdx } from '../support/render-markdown';
import { addAttachments, attachment, post, wordpressTables } from './fixtures';

const paragraphBlock = (html: string) => `<!-- wp:paragraph -->\n<p>${html}</p>\n<!-- /wp:paragraph -->`;

// As in the backup (post 552, 遊記 Day 2): the image URLs in the block's
// attributes partly go through Photon (i0.wp.com); its HTML has the uploads.
const yuyuyuBusStop = `<!-- wp:jetpack/image-compare {"imageBefore":{"id":1226,"url":"https://i0.wp.com/aniya.moe/wp-content/uploads/2025/05/ydmk705.jpg?ssl=1","alt":"","width":1920,"height":1080},"imageAfter":{"id":554,"url":"https://i0.wp.com/aniya.moe/wp-content/uploads/2025/05/pi_20250421_063159.jpg?ssl=1","alt":"","width":1920,"height":1080},"caption":"\\u003ca href=\\u0022https://yuyuyu.tv/season1/\\u0022 target=\\u0022_blank\\u0022 rel=\\u0022noopener\\u0022 title=\\u0022\\u0022\\u003e結城友奈は勇者である\\u003c/a\\u003e中出現的公車站"} -->
<figure class="wp-block-jetpack-image-compare"><div class="juxtapose" data-mode="horizontal"><img id="1226" src="https://aniya.moe/wp-content/uploads/2025/05/ydmk705.jpg" alt="" width="1920" height="1080" class="image-compare__image-before"/><img id="554" src="https://aniya.moe/wp-content/uploads/2025/05/pi_20250421_063159.jpg" alt="" width="1920" height="1080" class="image-compare__image-after"/></div><figcaption><a href="https://yuyuyu.tv/season1/" target="_blank" rel="noopener" title="">結城友奈は勇者である</a>中出現的公車站</figcaption></figure>
<!-- /wp:jetpack/image-compare -->`;

// A copy of a slider's markup pasted as a Custom HTML block (post 701, Day 3).
const yuyuyuObservationDeck = `<!-- wp:html -->
<figure class="wp-block-jetpack-image-compare"><div class="juxtapose" data-mode="horizontal"><img id="1762" src="https://aniya.moe/wp-content/uploads/2025/05/8a6a5bf6243acbe99900d2e8417652e7.jpg" alt="" width="1624" height="915" class="image-compare__image-before"/><img id="727" src="https://aniya.moe/wp-content/uploads/2025/05/pi_20250422_104948.jpg" alt="" width="1920" height="1080" class="image-compare__image-after"/></div><figcaption>結城友奈は勇者である中出現的展望台</figcaption></figure>
<!-- /wp:html -->`;

/** Converts post 552 (遊記 Day 2) with this content, the sliders' images in the media library. */
function convertPost(content: string) {
	const image = (id: number, name: string) =>
		attachment({ id, parent: 552, slug: name, file: `2025/05/${name}.jpg` });
	const tables = addAttachments(
		wordpressTables(),
		image(1226, 'ydmk705'),
		image(554, 'pi_20250421_063159'),
		image(1762, '8a6a5bf6243acbe99900d2e8417652e7'),
		image(727, 'pi_20250422_104948'),
	);
	tables.wp_posts!.push(
		post({
			ID: 552,
			post_date: '2025-05-17 10:00:00',
			post_date_gmt: '2025-05-17 02:00:00',
			post_modified_gmt: '2025-05-17 02:00:00',
			post_name: 'travel-setonaikai-2025-day2',
			post_content: content,
		}),
	);
	const site = loadWordPress(tables);
	return convertContent(content, { entry: site.post(552), site });
}

describe('before/after sliders', () => {
	it('become the Compare component of their two images, the before image first, with their caption, in an MDX file', () => {
		const converted = convertPost(`${paragraphBlock('前')}\n\n${yuyuyuBusStop}\n\n${paragraphBlock('後')}`);

		expect(converted).toMatchObject({
			markdown: [
				"import Compare from '../../components/Compare.astro';",
				"import compare1After from '../../assets/images/travel-setonaikai-2025-day2/pi_20250421_063159.jpg';",
				"import compare1Before from '../../assets/images/travel-setonaikai-2025-day2/ydmk705.jpg';",
				'',
				'前',
				'',
				'<Compare before={compare1Before} after={compare1After}>[結城友奈は勇者である](https://yuyuyu.tv/season1/)中出現的公車站</Compare>',
				'',
				'後',
				'',
			].join('\n'),
			mdx: true,
			unconverted: [],
		});
		expect(() => compileMdx(converted.markdown)).not.toThrow();
	});

	it('pasted as Custom HTML become the Compare component too, each slider with its own images', () => {
		const converted = convertPost(`${yuyuyuBusStop}\n\n${yuyuyuObservationDeck}`);

		expect(converted).toMatchObject({
			markdown: [
				"import Compare from '../../components/Compare.astro';",
				"import compare1After from '../../assets/images/travel-setonaikai-2025-day2/pi_20250421_063159.jpg';",
				"import compare1Before from '../../assets/images/travel-setonaikai-2025-day2/ydmk705.jpg';",
				"import compare2After from '../../assets/images/travel-setonaikai-2025-day2/pi_20250422_104948.jpg';",
				"import compare2Before from '../../assets/images/travel-setonaikai-2025-day2/8a6a5bf6243acbe99900d2e8417652e7.jpg';",
				'',
				'<Compare before={compare1Before} after={compare1After}>[結城友奈は勇者である](https://yuyuyu.tv/season1/)中出現的公車站</Compare>',
				'',
				'<Compare before={compare2Before} after={compare2After}>結城友奈は勇者である中出現的展望台</Compare>',
				'',
			].join('\n'),
			mdx: true,
			unconverted: [],
		});
		expect(() => compileMdx(converted.markdown)).not.toThrow();
	});

	it('keep the ruby annotations in their captions as HTML', () => {
		// Post 947 (Day 5): the reading is in <rp>, as written.
		const block = yuyuyuBusStop.replace(
			/<figcaption>.*<\/figcaption>/,
			'<figcaption>Ave Mujica 中，<ruby>豊川<br><rp>（<small>とがわ</small>）</rp></ruby>祥子所停留的公車站</figcaption>',
		);

		const { markdown } = convertPost(block);

		expect(markdown).toContain(
			'<Compare before={compare1Before} after={compare1After}>Ave Mujica 中，<ruby>豊川<br /><rp>（<small>とがわ</small>）</rp></ruby>祥子所停留的公車站</Compare>',
		);
		expect(() => compileMdx(markdown)).not.toThrow();
	});

	it('are the only Custom HTML the converter takes: other Custom HTML stays visibly marked', () => {
		const block = '<!-- wp:html -->\n<div class="note">自訂 HTML</div>\n<!-- /wp:html -->';

		const { markdown, unconverted } = convertPost(block);

		expect(markdown).toBe(`\`\`\`html title="wp-unconverted: core/html"\n${block}\n\`\`\`\n`);
		expect(unconverted).toEqual([{ kind: 'core/html', source: block }]);
	});
});
