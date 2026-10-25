// The test-only pages that global-setup.ts builds next to the site's real
// pages (tests/support/build-site.mjs adds them).

/** A plain page, so that URL behaviour below the root can be tested whatever content the site has. */
export const PROBE_PATH = '/probe/';

/** The sidebar widgets on their own (tests/fixtures/widgets-page.astro). */
export const WIDGETS_PATH = '/widgets/';

/** What the WordPress converter writes, in an .md and an .mdx file (tests/fixtures/converted-content.*). */
export const CONVERTED = { md: '/converted/md/', mdx: '/converted/mdx/' };

/** The .mdx file as the feeds give it to feed readers (tests/fixtures/converted-feed-item.ts). */
export const CONVERTED_FEED_ITEM = '/converted/feed-item/';
