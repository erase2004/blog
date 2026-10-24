// Embeds (core/embed): the two YouTube videos → the lightweight YouTube
// component (src/components/YouTube.astro), which shows the thumbnail and
// loads the player only when clicked. The player's title is the one WordPress
// gave it: the oEmbed response it cached in the post's metadata.
import { findElement, parseHtml } from '../html.ts';
import type { Context, Rule } from '../rule.ts';

/** The import in a post (src/content/posts/<slug>.mdx). */
const IMPORT = "import YouTube from '../../components/YouTube.astro';";

export const youtube: Rule = {
	blocks: {
		'core/embed': (block, context) => {
			const id = block.attrs.providerNameSlug === 'youtube' ? videoId(block.attrs.url) : null;
			if (!id) return context.unconverted(block);
			context.document.imports.add(IMPORT);
			const title = playerTitle(id, context);
			return `<YouTube id="${id}"${title ? ` title="${title}"` : ''} />`;
		},
	},
};

/** `https://www.youtube.com/watch?v=x3_Pcru8SS8` → `x3_Pcru8SS8`. */
function videoId(url: unknown): string | null {
	return typeof url === 'string' ? new URL(url).searchParams.get('v') : null;
}

/** The title of the player WordPress embedded, from its oEmbed cache (`_oembed_<hash>` metadata). */
function playerTitle(id: string, context: Context): string | undefined {
	const { entry, site } = context;
	if (!entry || !site) return undefined;
	const cached = (site.tables.wp_postmeta ?? [])
		.filter((row) => row.post_id === String(entry.id) && /^_oembed_[0-9a-f]{32}$/.test(row.meta_key ?? ''))
		.sort((a, b) => Number(a.meta_id) - Number(b.meta_id));
	for (const row of cached) {
		const iframe = findElement(parseHtml(row.meta_value ?? ''), 'iframe');
		if (iframe?.getAttribute('src')?.includes(`/embed/${id}?`)) return iframe.getAttribute('title');
	}
	return undefined;
}
