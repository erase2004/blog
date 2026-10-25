// Where the converted posts and pages are written: posts in one directory,
// named after their slug; pages in the hierarchy of their parent pages.
import type { Post, WordPressSite } from './wordpress.ts';

export const POSTS_DIR = 'src/content/posts';
export const PAGES_DIR = 'src/content/pages';

/** The slugs from the top-level page down to this page. */
export function pagePath(page: Post, site: WordPressSite): string[] {
	const parent = page.parent === 0 ? undefined : site.post(page.parent);
	return parent ? [...pagePath(parent, site), page.slug] : [page.slug];
}

/** The directory of a post's or page's content file, relative to the project root. */
export function contentDirectory(entry: Post, site: WordPressSite): string {
	if (entry.type === 'post') return POSTS_DIR;
	return [PAGES_DIR, ...pagePath(entry, site).slice(0, -1).map(fileName)].join('/');
}

/** A slug as a file name; fails for characters Windows does not allow in file names. */
export function fileName(slug: string): string {
	if (/[<>:"/\\|?*]/.test(slug)) throw new Error(`The slug ${slug} cannot be a file name`);
	return slug;
}
