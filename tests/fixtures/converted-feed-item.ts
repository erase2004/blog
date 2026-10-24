// Test-only file (tests/support/build-site.mjs): converted-content.mdx, the
// MDX the WordPress converter writes, as the feeds give it to feed readers.
import type { APIRoute } from 'astro';
import { feedContent } from '../../src/lib/feeds';
import { Content } from './converted-content.mdx';

export const GET: APIRoute = async () =>
	new Response(
		await feedContent(Content, { postUrl: new URL('https://aniya.moe/converted/mdx/'), idPrefix: 'post-mdx-' }),
	);
