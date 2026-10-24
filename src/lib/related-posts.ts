// The related posts shown after a post: as many as Jetpack showed (3).
import type { Post } from './content';

const COUNT = 3;

/**
 * The posts most related to `post` among `posts`: those that share the most
 * tags with it; among equals, those that share more of its categories, then
 * the newer.
 */
export function relatedPosts(post: Post, posts: Post[]): Post[] {
	const shared = (field: 'tags' | 'categories') => {
		const ids = new Set(post.data[field].map(({ id }) => id));
		return (other: Post) => other.data[field].filter(({ id }) => ids.has(id)).length;
	};
	const sharedTags = shared('tags');
	const sharedCategories = shared('categories');

	return posts
		.filter((other) => other.id !== post.id)
		.map((other) => ({ other, tags: sharedTags(other), categories: sharedCategories(other) }))
		.sort(
			(a, b) =>
				b.tags - a.tags ||
				b.categories - a.categories ||
				b.other.data.published.getTime() - a.other.data.published.getTime(),
		)
		.slice(0, COUNT)
		.map(({ other }) => other);
}
