// Archives: lists of posts at their WordPress URLs, `POSTS_PER_PAGE` posts a
// page, newest first. The first page is the archive's own URL, later pages
// are `<archive URL>page/N/`.
import { getCollection } from 'astro:content';
import { SITE_DESCRIPTION, SITE_TITLE } from '../consts';
import { formatSiteDate, getPosts, type Post, siteDate, type Term, termPath } from './content';

/** WordPress's `posts_per_page`. */
export const POSTS_PER_PAGE = 10;

/** A list of posts at one URL. */
export interface Archive {
	/** The URL of its first page, e.g. `/category/技術/`. */
	path: string;
	/** What it lists, in a few words, e.g. `技術`, `2025`: the text of links to it. */
	name: string;
	/** The `<title>` of its first page. */
	title: string;
	/** The meta description of its first page. */
	description: string;
	/** What the list is, e.g. `分類: 技術`. */
	heading: string;
	/** Newest first. */
	posts: Post[];
}

/** One page of an archive. */
export interface ArchivePage {
	archive: Archive;
	path: string;
	title: string;
	description: string;
	/** From 1. */
	number: number;
	/** The number of pages in the archive. */
	count: number;
	posts: Post[];
	/** The path of the page with newer posts, if any. */
	newer?: string;
	/** The path of the page with older posts, if any. */
	older?: string;
}

/** An archive's pages; an archive without posts still has one. */
export function archivePages(archive: Archive): ArchivePage[] {
	const count = Math.max(1, Math.ceil(archive.posts.length / POSTS_PER_PAGE));
	const path = (number: number) => (number === 1 ? archive.path : `${archive.path}page/${number}/`);
	return Array.from({ length: count }, (_, index) => {
		const number = index + 1;
		const suffix = number === 1 ? '' : ` - Page ${number}`;
		return {
			archive,
			path: path(number),
			title: archive.title + suffix,
			description: archive.description + suffix,
			number,
			count,
			posts: archive.posts.slice(index * POSTS_PER_PAGE, number * POSTS_PER_PAGE),
			newer: number > 1 ? path(number - 1) : undefined,
			older: number < count ? path(number + 1) : undefined,
		};
	});
}

/**
 * The route parameter of a page below the archive's own URL: none for the
 * first page, `page/N` for the others.
 */
function pageParam(page: ArchivePage): string | undefined {
	return page.number === 1 ? undefined : `page/${page.number}`;
}

/**
 * Every page of the category archives, or of the tag archives, as the
 * routes `/category/[slug]/[...page]` and `/tag/[slug]/[...page]` list them
 * (getStaticPaths()).
 */
export async function termArchiveRoutes(collection: Term['collection']) {
	const archives = collection === 'categories' ? await categoryArchives() : await tagArchives();
	return archives.flatMap((archive) =>
		archivePages(archive).map((page) => ({ params: { slug: archive.id, page: pageParam(page) }, props: { page } })),
	);
}

/** The home page `/`: every post. */
export async function homeArchive(): Promise<Archive> {
	return {
		path: '/',
		name: '首頁',
		title: `${SITE_TITLE} - ${SITE_DESCRIPTION}`,
		description: SITE_DESCRIPTION,
		heading: SITE_TITLE,
		posts: await getPosts(),
	};
}

/** The archive of a category or tag. */
export interface TermArchive extends Archive {
	/** The category's or tag's ID, the slug in its URL: `技術`. */
	id: string;
}

/** `/category/<slug>/` of each category that has posts, by name. */
export async function categoryArchives(): Promise<TermArchive[]> {
	return termArchives('categories', '分類');
}

/** `/tag/<slug>/` of each tag that has posts, by name. */
export async function tagArchives(): Promise<TermArchive[]> {
	return termArchives('tags', '標籤');
}

/**
 * The date archives `/YYYY/`, `/YYYY/MM/` and `/YYYY/MM/DD/` of the dates
 * that have posts, in the site's time zone, as the post URLs; titles as
 * WordPress wrote them.
 */
export async function dateArchives(): Promise<Archive[]> {
	return [...(await yearArchives()), ...(await monthArchives()), ...(await dayArchives())];
}

/** `/YYYY/` of each year that has posts, newest first. */
export async function yearArchives(): Promise<Archive[]> {
	return groupPosts(await getPosts(), (post) => {
		const { year } = siteDate(post.data.published);
		return {
			path: `/${year}/`,
			name: year,
			title: `${year} - ${SITE_TITLE}`,
			description: `${year} 年的文章`,
			heading: `年份: ${year} 年`,
		};
	});
}

async function monthArchives(): Promise<Archive[]> {
	return groupPosts(await getPosts(), (post) => {
		const { year, month } = siteDate(post.data.published);
		const name = `${year} 年 ${Number(month)} 月`;
		return {
			path: `/${year}/${month}/`,
			name,
			title: `${Number(month)} 月, ${year} - ${SITE_TITLE}`,
			description: `${name}的文章`,
			heading: `月份: ${name}`,
		};
	});
}

async function dayArchives(): Promise<Archive[]> {
	return groupPosts(await getPosts(), (post) => {
		const { year, month, day } = siteDate(post.data.published);
		const name = formatSiteDate(post.data.published);
		return {
			path: `/${year}/${month}/${day}/`,
			name,
			title: `${name} - ${SITE_TITLE}`,
			description: `${name}的文章`,
			heading: `日期: ${name}`,
		};
	});
}

/** The posts grouped into archives by `archiveOf`, keeping their order. */
function groupPosts(posts: Post[], archiveOf: (post: Post) => Omit<Archive, 'posts'>): Archive[] {
	const archives = new Map<string, Archive>();
	for (const post of posts) {
		const archive = archiveOf(post);
		const existing = archives.get(archive.path) ?? { ...archive, posts: [] };
		existing.posts.push(post);
		archives.set(archive.path, existing);
	}
	return [...archives.values()];
}

async function termArchives(collection: Term['collection'], label: string): Promise<TermArchive[]> {
	const posts = await getPosts();
	return (await getCollection(collection))
		.map(({ id, data: { name } }) => ({
			id,
			path: termPath({ collection, id }),
			name,
			title: `${name} - ${SITE_TITLE}`,
			description: `${label}「${name}」的文章`,
			heading: `${label}: ${name}`,
			posts: posts.filter((post) => post.data[collection].some((term) => term.id === id)),
		}))
		.filter((archive) => archive.posts.length > 0)
		.sort((a, b) => byName(a.name, b.name));
}

/**
 * The order WordPress listed terms in (`strnatcasecmp` on the names): ASCII
 * letters ignoring case, everything else by code point.
 */
function byName(a: string, b: string): number {
	const key = (name: string) => name.replace(/[A-Z]/g, (letter) => letter.toLowerCase());
	return key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0;
}
