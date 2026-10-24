// Test-only Worker (tests/site-serving.test.ts): run in place of the site's
// Worker with the project's wrangler.jsonc, it answers every request that
// reaches it itself, so a response shows whether the Worker ran at all.
export default {
	fetch: () => new Response('the Worker ran', { headers: { 'x-test-worker': 'ran' } }),
};
