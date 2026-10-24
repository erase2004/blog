// The WordPress site as read from its backup: posts (of every type), their
// metadata, options, terms, users and the SEO plugin's settings.
import type { Row, Tables } from './sql-dump.ts';

/** The tables the converter reads from the dump. */
export const WORDPRESS_TABLES = [
	'wp_aioseo_posts',
	'wp_options',
	'wp_postmeta',
	'wp_posts',
	'wp_term_relationships',
	'wp_term_taxonomy',
	'wp_terms',
	'wp_users',
] as const;

/** A row of wp_posts, of any post type (post, page, attachment, envira, …). */
export type Post = {
	id: number;
	type: string;
	status: string;
	title: string;
	/** `post_name` as stored: lowercase percent-encoded for non-ASCII slugs. */
	name: string;
	/** `post_name` decoded to UTF-8, as it appears in URLs and content file names. */
	slug: string;
	parent: number;
	author: number;
	/** `post_date_gmt`. */
	published: Date;
	/** `post_date`: the publish time as the site's local time, `YYYY-MM-DD HH:MM:SS`. */
	publishedLocal: string;
	/** `post_modified_gmt`. */
	modified: Date;
	content: string;
	excerpt: string;
	mimeType: string;
	guid: string;
};

export type Term = {
	id: number;
	taxonomy: string;
	name: string;
	/** Decoded to UTF-8, as it appears in URLs. */
	slug: string;
};

export type User = { id: number; login: string; nicename: string; displayName: string };

export type WordPressSite = {
	/** The tables read from the dump, for whatever the typed views below leave out. */
	tables: Tables;
	option(name: string): string | undefined;
	post(id: number): Post | undefined;
	/** All rows of wp_posts with the given post type, by ID. */
	posts(type: string): Post[];
	/** Published posts and pages, by ID. */
	entries(): Post[];
	/** Values of a post's metadata key, in the order WordPress stored them. */
	meta(postId: number, key: string): string[];
	/** The terms of a taxonomy (`category`, `post_tag`) given to a post. */
	termsOf(postId: number, taxonomy: string): Term[];
	/** All terms of a taxonomy, by slug. */
	terms(taxonomy: string): Term[];
	/** The terms of a taxonomy given to at least one published post, by slug. */
	usedTerms(taxonomy: string): Term[];
	/** The published posts a term is given to, by ID. */
	postsWith(term: Term): Post[];
	user(id: number): User | undefined;
	/** The row of wp_aioseo_posts for a post. */
	seo(postId: number): Row | undefined;
};

export function loadWordPress(tables: Tables): WordPressSite {
	const rows = (table: string) => {
		const found = tables[table];
		if (!found) throw new Error(`The WordPress tables lack ${table}`);
		return found;
	};
	const number = (value: string | null) => Number(value);
	const text = (value: string | null) => value ?? '';

	const options = new Map(rows('wp_options').map((row) => [text(row.option_name), text(row.option_value)]));

	const posts = new Map<number, Post>();
	for (const row of rows('wp_posts')) {
		const post: Post = {
			id: number(row.ID),
			type: text(row.post_type),
			status: text(row.post_status),
			title: text(row.post_title),
			name: text(row.post_name),
			slug: decodeSlug(text(row.post_name)),
			parent: number(row.post_parent),
			author: number(row.post_author),
			published: gmtDate(row.post_date_gmt),
			publishedLocal: text(row.post_date),
			modified: gmtDate(row.post_modified_gmt),
			content: text(row.post_content),
			excerpt: text(row.post_excerpt),
			mimeType: text(row.post_mime_type),
			guid: text(row.guid),
		};
		posts.set(post.id, post);
	}
	const byId = (a: { id: number }, b: { id: number }) => a.id - b.id;
	const sortedPosts = [...posts.values()].sort(byId);
	const isEntry = (post: Post) => post.status === 'publish' && (post.type === 'post' || post.type === 'page');

	const meta = new Map<string, string[]>();
	for (const row of [...rows('wp_postmeta')].sort((a, b) => number(a.meta_id) - number(b.meta_id))) {
		const key = `${row.post_id} ${row.meta_key}`;
		meta.set(key, [...(meta.get(key) ?? []), text(row.meta_value)]);
	}

	const terms = new Map<number, Term>();
	const names = new Map(rows('wp_terms').map((row) => [number(row.term_id), row]));
	for (const row of rows('wp_term_taxonomy')) {
		const term = names.get(number(row.term_id))!;
		terms.set(number(row.term_taxonomy_id), {
			id: number(row.term_id),
			taxonomy: text(row.taxonomy),
			name: text(term.name),
			slug: decodeSlug(text(term.slug)),
		});
	}
	const termsByPost = new Map<number, Term[]>();
	const postsByTerm = new Map<Term, Post[]>();
	for (const row of rows('wp_term_relationships')) {
		const post = posts.get(number(row.object_id));
		const term = terms.get(number(row.term_taxonomy_id))!;
		termsByPost.set(number(row.object_id), [...(termsByPost.get(number(row.object_id)) ?? []), term]);
		if (post && isEntry(post)) postsByTerm.set(term, [...(postsByTerm.get(term) ?? []), post].sort(byId));
	}

	const users = new Map(
		rows('wp_users').map((row) => [
			number(row.ID),
			{ id: number(row.ID), login: text(row.user_login), nicename: text(row.user_nicename), displayName: text(row.display_name) },
		]),
	);
	const seo = new Map(rows('wp_aioseo_posts').map((row) => [number(row.post_id), row]));

	const bySlug = (a: Term, b: Term) => Buffer.compare(Buffer.from(a.slug), Buffer.from(b.slug));
	return {
		tables,
		option: (name) => options.get(name),
		post: (id) => posts.get(id),
		posts: (type) => sortedPosts.filter((post) => post.type === type),
		entries: () => sortedPosts.filter(isEntry),
		meta: (postId, key) => meta.get(`${postId} ${key}`) ?? [],
		termsOf: (postId, taxonomy) => (termsByPost.get(postId) ?? []).filter((term) => term.taxonomy === taxonomy),
		terms: (taxonomy) => [...terms.values()].filter((term) => term.taxonomy === taxonomy).sort(bySlug),
		usedTerms: (taxonomy) => [...postsByTerm.keys()].filter((term) => term.taxonomy === taxonomy).sort(bySlug),
		postsWith: (term) => postsByTerm.get(term) ?? [],
		user: (id) => users.get(id),
		seo: (postId) => seo.get(postId),
	};
}

/** WordPress keeps non-ASCII slugs lowercase percent-encoded. */
export function decodeSlug(name: string): string {
	try {
		return decodeURIComponent(name);
	} catch {
		return name;
	}
}

function gmtDate(value: string | null): Date {
	return new Date(`${(value ?? '').replace(' ', 'T')}Z`);
}
