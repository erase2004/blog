// Content collections. The frontmatter is checked at build time: a wrong or
// missing field fails the build.
import { defineCollection, reference } from 'astro:content';
import { file, glob } from 'astro/loaders';
import { z } from 'astro/zod';

/** A post's or page's ID is its file path without the extension. */
const generateId = ({ entry }: { entry: string }) => entry.replace(/\.mdx?$/, '');

/** A URL path segment: no slashes, no whitespace. */
const slug = z.string().regex(/^[^/\s]+$/, 'A slug is one URL path segment');

const posts = defineCollection({
	loader: glob({ base: './src/content/posts', pattern: '**/*.{md,mdx}', generateId }),
	schema: ({ image }) =>
		z
			.object({
				title: z.string(),
				/** The last segment of the post's URL, `/YYYY/MM/DD/<slug>/`. */
				slug,
				/** The publish time; the URL date is its date in Asia/Taipei. */
				published: z.coerce.date(),
				/** The last update. */
				updated: z.coerce.date(),
				categories: z.array(reference('categories')).min(1),
				tags: z.array(reference('tags')).default([]),
				/** The summary shown in listings; the meta description when there is no `description`. */
				excerpt: z.string().optional(),
				/** The meta description (AIOSEO's custom description). */
				description: z.string().optional(),
				/** The og:image (AIOSEO's custom social image): an image of src/assets/images/, relative to the file. */
				socialImage: image().optional(),
				/** Drafts are left out of production builds. */
				draft: z.boolean().default(false),
				wordpressId: z.number().int().optional(),
			})
			.refine((post) => post.description || post.excerpt, {
				message: 'A post needs a description or an excerpt (its meta description)',
			}),
});

const pages = defineCollection({
	loader: glob({ base: './src/content/pages', pattern: '**/*.{md,mdx}', generateId }),
	schema: z.object({
		title: z.string(),
		slug,
		/** The path of the parent page (`about` for `/about/contact/`); none for top-level pages. */
		parent: z.string().regex(/^[^/\s]+(\/[^/\s]+)*$/).optional(),
		updated: z.coerce.date(),
		description: z.string(),
		wordpressId: z.number().int().optional(),
	}),
});

/** Categories and tags; the ID is the slug in their archive URL. */
const term = z.object({ id: slug, name: z.string() });
const categories = defineCollection({ loader: file('src/data/categories.json'), schema: term });
const tags = defineCollection({ loader: file('src/data/tags.json'), schema: term });

export const collections = { posts, pages, categories, tags };
