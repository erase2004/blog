// Galleries become the <Gallery> component (src/components/Gallery.astro):
// the 83 Envira galleries, whose image list is the JSON in their block, and
// the 3 core gallery blocks. Each image is the moved file, imported from the
// post's image folder; captions stay.
import { describe, expect, it } from 'vitest';
import { convertContent } from '../../scripts/wordpress-converter/content';
import { loadWordPress } from '../../scripts/wordpress-converter/wordpress';
import { compileMdx } from '../support/render-markdown';
import { addAttachments, attachment, post, wordpressTables } from './fixtures';

const paragraphBlock = (html: string) => `<!-- wp:paragraph -->\n<p>${html}</p>\n<!-- /wp:paragraph -->`;

/** Day 2 of the travel posts with this content, and the attachments it uses. */
function convertInPost(html: string, ...attachments: ReturnType<typeof attachment>[]) {
	const tables = addAttachments(wordpressTables(), ...attachments);
	tables.wp_posts!.push(
		post({
			ID: 552,
			post_date: '2025-05-17 09:02:00',
			post_date_gmt: '2025-05-17 01:02:00',
			post_modified_gmt: '2025-05-20 04:24:58',
			post_title: '遊記 - 岡山 / 香川 / 德島八日遊 - Day 2',
			post_name: 'travel-setonaikai-2025-day2',
			post_content: html,
		}),
	);
	const site = loadWordPress(tables);
	return convertContent(html, { entry: site.post(552), site });
}

// Uploaded to the Envira gallery (post 572), as Envira does.
const shopOutside = attachment({
	id: 571,
	parent: 572,
	slug: '20250421_081608666',
	file: '2025/05/20250421_081608666-scaled.jpg',
	original: '20250421_081608666.jpg',
	sizes: ['20250421_081608666-1024x768.jpg'],
});
const shopInside = attachment({
	id: 570,
	parent: 572,
	slug: '20250421_081320309',
	file: '2025/05/20250421_081320309-scaled.jpg',
	original: '20250421_081320309.jpg',
});

const FOLDER = '../../assets/images/travel-setonaikai-2025-day2';
const IMPORT = "import Gallery from '../../components/Gallery.astro';";

describe('Envira galleries', () => {
	it('become the Gallery component, with the images of the block’s JSON in order, captioned with their titles', () => {
		const gallery = `<!-- wp:envira/envira-gallery {"galleryId":572,"title":"直島 \\u0026#8211; イワタコンフェクト","columns":"0","row_height":200,"margins":"custom","custom_margins":8,"lazyload_enabled":1,"lightbox_theme":"base","images":[{"status":"active","src":"https://aniya.moe/wp-content/uploads/2025/05/20250421_081608666-scaled.jpg","title":"店家外面的照片","link":"https://aniya.moe/wp-content/uploads/2025/05/20250421_081608666-scaled.jpg","alt":"","caption":"","thumb":"","id":571,"height":224.4360902255639,"width":298.5},{"status":"active","src":"https://aniya.moe/wp-content/uploads/2025/05/20250421_081320309-scaled.jpg","title":"店家內部的照片，可以看到有 Summer Pockets 的週邊與繪圖","link":"https://aniya.moe/wp-content/uploads/2025/05/20250421_081320309-scaled.jpg","alt":"","caption":"","thumb":"","id":570,"height":224.4360902255639,"width":298.5}]} -->
<div class="wp-block-envira-envira-gallery">[envira-gallery id='572']</div>
<!-- /wp:envira/envira-gallery -->`;

		const converted = convertInPost(
			`${paragraphBlock('前')}\n\n${gallery}\n\n${paragraphBlock('後')}`,
			shopOutside,
			shopInside,
		);

		expect(converted).toMatchObject({
			markdown: [
				IMPORT,
				'',
				'前',
				'',
				'<Gallery',
				'\timages={[',
				`\t\t{ src: import('${FOLDER}/20250421_081608666.jpg'), caption: '店家外面的照片' },`,
				`\t\t{ src: import('${FOLDER}/20250421_081320309.jpg'), caption: '店家內部的照片，可以看到有 Summer Pockets 的週邊與繪圖' },`,
				'\t]}',
				'/>',
				'',
				'後',
				'',
			].join('\n'),
			mdx: true,
			unconverted: [],
		});
		expect(() => compileMdx(converted.markdown)).not.toThrow();
	});

	it('keep the alternative text of images that have one', () => {
		const gallery = `<!-- wp:envira/envira-gallery {"galleryId":1877,"title":"ACGN 歷史博物館 \\u0026#8211; 公司頁效能對照","columns":"2","row_height":150,"margins":"custom","lightbox_enabled":1,"lazyload_enabled":1,"lightbox_theme":"base","images":[{"status":"active","src":"https://aniya.moe/wp-content/uploads/2026/01/company-ssr.png","title":"股票市場公司頁","link":"https://aniya.moe/wp-content/uploads/2026/01/company-ssr.png","alt":"股票市場公司頁的 PageSpeed Insights 測試結果","caption":"","thumb":"","id":1878,"height":841,"width":981}]} -->
<div class="wp-block-envira-envira-gallery">[envira-gallery id='1877']</div>
<!-- /wp:envira/envira-gallery -->`;

		const { markdown } = convertInPost(
			gallery,
			attachment({ id: 1878, parent: 1877, slug: 'company-ssr', file: '2026/01/company-ssr.png', mime: 'image/png' }),
		);

		expect(markdown).toContain(
			`{ src: import('${FOLDER}/company-ssr.png'), alt: '股票市場公司頁的 PageSpeed Insights 測試結果', caption: '股票市場公司頁' },`,
		);
	});
});

describe('core gallery blocks', () => {
	const screenshot = (id: number, name: string, size: string) =>
		attachment({ id, parent: 552, slug: name.toLowerCase(), file: `2025/05/${name}.png`, mime: 'image/png', sizes: [`${name}-${size}.png`] });

	it('become the Gallery component, with their images’ alternative texts and captions', () => {
		const { markdown, unconverted } = convertInPost(
			`<!-- wp:gallery {"linkTo":"none","align":"center"} -->
<figure class="wp-block-gallery aligncenter has-nested-images columns-default is-cropped"><!-- wp:image {"id":474,"sizeSlug":"large","linkDestination":"none"} -->
<figure class="wp-block-image size-large"><img src="https://aniya.moe/wp-content/uploads/2025/05/Screenshot_20250508-003312-519x1024.png" alt="官方 App 的「メニュー」畫面" class="wp-image-474"/><figcaption class="wp-element-caption">官方 App 的「メニュー」畫面</figcaption></figure>
<!-- /wp:image -->

<!-- wp:image {"id":475,"sizeSlug":"large","linkDestination":"none"} -->
<figure class="wp-block-image size-large"><img src="https://aniya.moe/wp-content/uploads/2025/05/Screenshot_20250508-003355-518x1024.png" alt="App 畫面" class="wp-image-475"/><figcaption class="wp-element-caption">蓋章清單的頁面</figcaption></figure>
<!-- /wp:image --></figure>
<!-- /wp:gallery -->`,
			screenshot(474, 'Screenshot_20250508-003312', '519x1024'),
			screenshot(475, 'Screenshot_20250508-003355', '518x1024'),
		);

		expect(markdown).toBe(
			[
				IMPORT,
				'',
				'<Gallery',
				'\timages={[',
				`\t\t{ src: import('${FOLDER}/Screenshot_20250508-003312.png'), caption: '官方 App 的「メニュー」畫面' },`,
				`\t\t{ src: import('${FOLDER}/Screenshot_20250508-003355.png'), alt: 'App 畫面', caption: '蓋章清單的頁面' },`,
				'\t]}',
				'/>',
				'',
			].join('\n'),
		);
		expect(unconverted).toEqual([]);
	});

	it('keep the caption of the whole gallery, links included, under it', () => {
		const converted = convertInPost(
			`<!-- wp:gallery {"linkTo":"none","align":"center"} -->
<figure class="wp-block-gallery aligncenter has-nested-images columns-default is-cropped"><!-- wp:image {"id":500,"sizeSlug":"large","linkDestination":"none"} -->
<figure class="wp-block-image size-large"><img src="https://aniya.moe/wp-content/uploads/2025/05/岡山駅前桃太郎像-神推.jpg" alt="推しが武道館いってくれたら死ぬ中出現的桃太郎像" class="wp-image-500"/></figure>
<!-- /wp:image --><figcaption class="blocks-gallery-caption wp-element-caption">原本要在岡山站東出口拍的桃太郎像，出自<a href="https://oshibudo.com/" target="_blank" rel="noopener" title="">推しが武道館いってくれたら死ぬ</a>第三集</figcaption></figure>
<!-- /wp:gallery -->`,
		);

		// The prologue, published before day 2, uses the image too: it is in the prologue's folder.
		expect(converted.markdown).toBe(
			[
				IMPORT,
				'',
				'<Gallery',
				'\timages={[',
				"\t\t{ src: import('../../assets/images/travel-setonaikai-2025-prologue/岡山駅前桃太郎像-神推.jpg'), alt: '推しが武道館いってくれたら死ぬ中出現的桃太郎像' },",
				'\t]}',
				'>',
				'原本要在岡山站東出口拍的桃太郎像，出自[推しが武道館いってくれたら死ぬ](https://oshibudo.com/)第三集',
				'</Gallery>',
				'',
			].join('\n'),
		);
		expect(() => compileMdx(converted.markdown)).not.toThrow();
	});
});
