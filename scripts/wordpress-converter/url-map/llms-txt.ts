// AIOSEO's llms.txt, for AI crawlers: the new site writes its own (ticket 12).
import type { UrlSource } from '../mapping-table.ts';

export const llmsTxt: UrlSource = () => ({
	urls: [{ url: '/llms.txt', expect: 'file' }],
});
