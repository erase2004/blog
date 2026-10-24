// Posts and pages, and the URLs they have: the same as on WordPress.
import { type CollectionEntry, getCollection } from 'astro:content';
import { SITE_TIMEZONE } from '../consts';

export type Post = CollectionEntry<'posts'>;
export type Page = CollectionEntry<'pages'>;

/** The posts to publish, newest first. Drafts are only left out of production builds. */
export async function getPosts(): Promise<Post[]> {
	const posts = await getCollection('posts', ({ data }) => !(import.meta.env.PROD && data.draft));
	await checkTerms(posts);
	return posts.sort((a, b) => b.data.published.getTime() - a.data.published.getTime());
}

/**
 * Fails the build for a category or tag that is not in src/data/: Astro
 * only logs references to entries that do not exist.
 */
async function checkTerms(posts: Post[]): Promise<void> {
	const ids = {
		categories: new Set((await getCollection('categories')).map(({ id }) => id)),
		tags: new Set((await getCollection('tags')).map(({ id }) => id)),
	};
	for (const post of posts) {
		for (const { collection, id } of [...post.data.categories, ...post.data.tags]) {
			if (!ids[collection].has(id)) {
				throw new Error(`Post ${post.id} has ${collection} "${id}", which is not in src/data/${collection}.json`);
			}
		}
	}
}

export async function getPages(): Promise<Page[]> {
	return getCollection('pages');
}

/** The date of an instant in the site's time zone, zero-padded: `{ year: '2021', month: '09', day: '30' }`. */
export function siteDate(date: Date): { year: string; month: string; day: string } {
	const parts = new Intl.DateTimeFormat('en-US', {
		timeZone: SITE_TIMEZONE,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
	}).formatToParts(date);
	const part = (type: string) => parts.find((p) => p.type === type)!.value;
	return { year: part('year'), month: part('month'), day: part('day') };
}

/** A date as WordPress showed it (its `date_format`, `Y 年 n 月 j 日`): `2021 年 9 月 30 日`. */
export function formatSiteDate(date: Date): string {
	const { year, month, day } = siteDate(date);
	return `${year} 年 ${Number(month)} 月 ${Number(day)} 日`;
}

/** `/YYYY/MM/DD/<slug>/`, the date being the publish date in Asia/Taipei, as WordPress permalinks were. */
export function postPath(post: Post): string {
	const { year, month, day } = siteDate(post.data.published);
	return `/${year}/${month}/${day}/${post.data.slug}/`;
}

/** `/<parent path>/<slug>/`, e.g. `/about/contact/`. */
export function pagePath(page: Page): string {
	return `/${page.data.parent ? `${page.data.parent}/` : ''}${page.data.slug}/`;
}

/**
 * When a post was last updated, as readers are told: its `updated` time, or
 * its publish time for a scheduled post last edited before it went out.
 */
export function postUpdated(post: Post): Date {
	const { published, updated } = post.data;
	return updated > published ? updated : published;
}

/** The meta description of a post: its own description, else its excerpt. */
export function postDescription(post: Post): string {
	return post.data.description ?? post.data.excerpt!;
}
