// Which images of the uniform image directory a post's source shows, and in
// what order: the first is the post's og:image when it has none of its own.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { imageReferences } from '../src/lib/image-references';

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');

describe('the images a post shows', () => {
	it('are in reading order: a slider before a Markdown image comes first, its before image left of the divider', () => {
		const post = { filePath: 'src/content/posts/compare-before-image.mdx', body: fixture('compare-before-image.mdx') };

		expect(imageReferences(post)).toEqual([
			'src/assets/images/travel-setonaikai-2025-day2/ydmk705.jpg',
			'src/assets/images/travel-setonaikai-2025-day2/pi_20250421_063159.jpg',
			'src/assets/images/travel-setonaikai-2025-day2/20250421_070312897.jpg',
		]);
	});
});
