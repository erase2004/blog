# Project conventions

What the code and config don't say on their own: the invariants, the reasons behind them, and the gotchas earlier sessions paid for. The decision history (in Traditional Chinese, written for the owner's blog) is `docs/migration-log.md`. The original plan is `.scratch/wordpress-migration/spec.md`.

## Content

- The Markdown in `src/content/posts/` and `src/content/pages/` is the **source of truth**. Edit it by hand.
- `scripts/wordpress-converter/` produced it once from the WordPress SQL backup and is kept as history and for its tests. `npm run convert-wordpress` refuses to run unless given `-- --overwrite-content`, because a run empties both folders and rewrites them from the backup.
- `D:\wordpress-backup` is read-only.

## Old URLs

Every URL the WordPress site had must keep working: answer 200, 301 to its new place, or 404 on purpose. The **URL checker** is the gate for any change that touches paths, redirects, the Worker or the build output:

- `npm run check-urls -- build` simulates Cloudflare's asset server on `dist/`.
- `npm run check-urls -- http <base>` checks a running site (`npm run preview` locally, a preview URL, or `https://aniya.moe`, which adds the www redirect and HSTS).
- The expected URLs come from the sitemap snapshot `tests/fixtures/wordpress-sitemap-2026-10-24/` plus the mapping table `src/data/old-url-map.json`, read through `src/lib/old-url-map.ts`.
- `scripts/url-checker/pending.txt` is a ratchet: a listed URL may fail; one that starts passing must leave the list.

## `_redirects`

- Every rule goes through the typed `RedirectRule` and `appendRedirects()` in `src/integrations/redirects-file.ts`, which encodes paths in one place. `redirectsBudget()` stays the **last** integration in `astro.config.mjs`. It fails the build above Cloudflare's limits of 2,000 static and 100 dynamic rules.
- Headroom is small: the build log prints the counts. Attachment pages without a trailing slash were left out for that reason.
- Dynamic rules (`*`, `:placeholder`) go after all static rules: Cloudflare counts every rule after the first dynamic one as dynamic.
- Cloudflare matches a rule's source against the raw request path. A source written with uppercase escapes matches only uppercase-encoded requests, and one with lowercase escapes only lowercase-encoded ones. WordPress linked Chinese paths in lowercase encoding, so every non-ASCII old URL also gets a lowercase rule built with `lowercaseEncoded()`. A request that matches no rule and isn't in canonical encoding gets a **307** to the canonical form.
- `html_handling: "force-trailing-slash"` answers slashless paths with 307, so the 301s for slashless pages come from `trailing-slash-redirects.ts`.

## Worker

`src/worker.ts` runs only for `/` (`run_worker_first: ["/"]`) and answers WordPress's query-string URLs (`?p=`, `?page_id=`, `?attachment_id=`). Every other request is a static asset request: free, and outside the Worker's daily request limit. Keep new behaviour static whenever `_redirects` or the build can express it.

## Images and media

- Images live in `src/assets/images/<post slug>/` (shared ones in the earliest post's folder, site-wide ones in `site/`), and Astro serves them as responsive webp.
- `imageUrl()` / `imageAt()` in `src/lib/images.ts` give the full-size webp URL that the old upload paths redirect to. The sitemap and og:image use them too.
- Anything that renders post content (pages, feeds) passes `components={{ img: MarkdownImage }}`.
- Videos and the PDF live on R2 at `https://media.aniya.moe/videos/<post slug>/` and `…/files/<post slug>/`. Uploading needs credentials, so only the owner does it (`npm run upload-media`, then `npm run verify-media`).

## Markdown pipeline

- The processor is Sätteri (`satteri({...})` in `astro.config.mjs`). Add Markdown plugins through `satteri()`; setting `markdown.remarkPlugins` switches Astro to the remark processor.
- `expressiveCode()` stays before `mdx()` in the integrations list.

## Tests

- Vitest has two projects: `unit` and `site`. The `site` tests (`tests/site/`) share one build, one server and one Chromium through `tests/site/global-setup.ts`; reach them through `tests/site/site.ts`.
- Run one Astro build at a time. Two concurrent builds of this project corrupt each other's `.astro/` output, which is why every build-based test lives in `tests/site/`.
- Test builds are production builds, GA4 tag included, so Playwright tests block external requests.
- To render a `.md`/`.mdx` fixture, wrap it in an `.astro` page: `injectRoute()` treats a Markdown file as an endpoint.
- A cold build makes about 1,300 webp files and takes about 4 minutes. `node_modules/.astro/assets` caches them, and CI restores that cache.

## Checks

- `npm run check` type-checks the site, `scripts/` and `tests/` (`astro check`). Scripts run on Node's type stripping, so they use erasable syntax only (`erasableSyntaxOnly`).
- Commits follow Conventional Commits (`commitlint.config.mjs`, run by the `commit-msg` hook). Branches follow Conventional Branch 1.1.0, `<type>/<description>` (`scripts/branch-name.ts`, run by the `pre-push` hook). CI's `Conventions` job runs both.
- The husky hooks run in a checkout or worktree only after `npm ci` there has created `.husky/_`.

## Git and GitHub

- `main` takes changes only through a PR whose `Build`, `Test`, `Deploy` and `Conventions` checks pass. Merging a PR is the owner's call.
- Commits are GPG-signed, and gpg-agent can ask for the passphrase through pinentry. Run `git commit` under a timeout (about 120 s). If it times out, report the waiting pinentry to the owner; keep signing on.
- An agent worktree starts from `main` on an auto-named `worktree-agent-…` branch. Rename it to a Conventional Branch name first (the `pre-push` hook rejects the auto name). When the work belongs on another branch, merge that branch in and check the base with `git log -1`.
- `draft.md` at the repo root is the owner's private draft and stays untracked.

## Deploys

- `.github/workflows/ci-cd.yml`: every push builds, runs the URL checker and the tests, then deploys. `main` goes to the production Worker `aniya-moe`; other branches become preview versions (`<alias>-aniya-moe.erase2004.workers.dev`, which Cloudflare marks `noindex`). The deploy is checked again over HTTP.
- `aniya.moe` is a Custom Domain added in the Cloudflare dashboard, not in `wrangler.jsonc`. `wrangler deploy` leaves dashboard domains alone while the config lists none. If you add a custom domain to `wrangler.jsonc`, wrangler replaces the whole domain state with the config's list, so the list must include `aniya.moe`.
- `.github/workflows/production-check.yml` runs the URL checker against `https://aniya.moe` every Sunday.
- Cloudflare credentials live in GitHub Secrets and the owner's own `wrangler login`. Deploy by pushing; roll back with `wrangler rollback`.
- Right after a deploy uploads new assets, a few of them can answer 500 at some edge locations for up to about 20 minutes. Retry before treating it as a bug.

## Windows shell

The machine runs Windows with Git Bash. Its console code page mangles non-ASCII text in command arguments and output:

- Look up DNS with DNS-over-HTTPS JSON: `curl -s "https://cloudflare-dns.com/dns-query?name=<name>&type=<type>" -H "accept: application/dns-json"`.
- Handle URLs or text with Chinese characters in a Node script, and read results from a UTF-8 file rather than the console.
- `grep -P` fails under the default locale. Use `grep -E`, or Node.
