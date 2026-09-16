# Blog migration — public website into this site's Blog

Migrates a client's existing blog from their **live public website** into
`site/blog/posts/`, using nothing but ordinary HTTP reads.

No CMS login. No WordPress admin. No database. No hosting access. The source
site is treated as read-only and is never written to, in any way.

```bash
# 1. Test import — three posts, printed in full. Required before the full run.
node tools/blog-import/import.mjs --test --url https://www.sunstateintl.com/blogs/

# 2. Read what it printed. If the three posts look right:
node tools/blog-import/import.mjs --all --url https://www.sunstateintl.com/blogs/

# 3. Anything that failed:
node tools/blog-import/import.mjs --retry
```

`npm run blog:test`, `npm run blog:import` and `npm run blog:retry` are the same
three commands.

---

## What it guarantees

**The source site is only ever read.** `lib/http.mjs` is the one module that can
open a socket, and it throws on any method other than `GET` or `HEAD` before a
request is made — there is no code path that can POST, log in, publish, or
delete anything on the source. It fetches `robots.txt` once and honours it, makes
one request at a time with a pause between them, and caches every response on
disk so a re-run or a retry costs the source site nothing.

**Nothing is published.** Every imported post is written with
`"status": "draft"`. That is not a label: `scripts/build.mjs` skips any post
whose status is not `published`, so a draft is absent from the built site, the
blog index, the sitemap, `llms.txt` and every `postsList` teaser until a person
publishes it from **Posts** in the dashboard.

**Nothing is imported twice.** Each record carries a `migration` block naming the
source URL it came from. A second run recognises its own work and skips it. A
post whose file exists but carries no `migration` block was written by somebody
else — it is reported and left alone unless you pass `--overwrite-stubs`.

**Nothing is rewritten.** This is a migration, not a content task. Text is moved,
not reworded, reordered, summarised or expanded. What is *removed* is whole
elements that are not the article — see below.

---

## How posts are discovered

Three public routes, all tried, results merged. Each is a complete answer on its
own; together they survive a site that has one of them switched off.

| Strategy | What it reads | Why it is first choice or fallback |
|---|---|---|
| `rest-api` | `/wp-json/wp/v2/posts?_embed` | Public on a stock WordPress. Returns body, date, slug, category, author and featured image **as data**, so nothing is guessed from theme markup. |
| `sitemap` | `/wp-sitemap.xml`, `/sitemap_index.xml`, … | Lists every indexable post, including ones the archive has paged past. |
| `archive` | The archive page, then its "Older Entries" link, page after page | The route that still works when the other two are disabled. This is the crawl in the brief. |

Restrict them with `--strategies archive` if you want only the crawl.

## What is extracted

Title · full body · publication date · category · author · featured image ·
in-article images · article links · URL slug · meta title · meta description.

Where each comes from, in order of trust: the REST payload, then the page's
JSON-LD (`BlogPosting`), then Open Graph and `<meta>` tags, then the rendered
markup (`<time datetime>`, `rel="author"`, `/category/` links, `entry-title`).

## What is removed

Whole elements, never words. Matched on tag, then on the id/class vocabulary
WordPress themes have converged on, repeatedly until nothing matches:

header · footer · nav · breadcrumbs · sidebars and widget areas · share bars
(AddToAny, Sharedaddy, Jetpack) · related/recommended post blocks · comments and
comment forms · author boxes · newsletter and contact CTAs · dealer/inventory
widgets · cookie and consent banners · advertisements · `<script>`, `<style>`,
`<iframe>`, `<form>` · Google Tag Manager and analytics snippets · tracking
pixels (1×1 images, `facebook.com/tr`, DoubleClick).

Every surviving element is also stripped of attributes that meant something only
on the old site: theme classes, ids, inline styles, lazy-loader state and
analytics tagging. A lazy-loaded image's real `data-src` is promoted to `src`
first, so the image is not lost with the attribute.

## What is preserved, and as what

The body becomes a real node tree, not a lump of HTML, because that is what makes
it editable on the canvas afterwards.

| In the article | Becomes |
|---|---|
| `<h2>`…`<h6>` | `heading` block at the same level |
| `<h1>` | dropped — the post masthead already renders the title |
| `<p>`, runs of them | `text` block (a run merges into one, blank-line separated) |
| `<strong> <b> <em> <i> <a> <br> <small>` | kept inline — exactly what a `text` block allows |
| other inline tags | unwrapped: the words stay, the tag goes |
| `<ul>`, `<ol>` | `prose-list` — a coded widget added for this, because the platform's `list` block is a card grid and would restructure the article |
| `<img>`, `<figure>` + `<figcaption>` | `image` block, with the caption |
| `<table>` | `customHtml` — no block expresses a table. Reported for review. |
| `<blockquote>`, `<pre>` | `customHtml`, same reason. Reported. |
| `<hr>` | `divider` |

## Images

Every image — featured and in-article — is downloaded into
`public/img/blog/<slug>/` and the body is rewritten to the local copy, so the new
site never depends on the old site's URLs. WordPress's resized copies are
resolved back to the original (`photo-400x250.jpg` → `photo.jpg`) and the crop is
only used if the original is gone. Filenames are slugified and carry a short hash
of the source URL, so two different images named `photo.jpg` cannot collide.

An image that cannot be fetched does not fail the post. It is named in the report
under **Missing images**, and the body keeps the original URL so the gap is
visible rather than silent.

## The migration report

Written on every run, in two forms:

- `tools/blog-import/migration-report.md` — the one to read.
- `tools/blog-import/.work/report.json` — what `--retry` reads back.

It counts URLs discovered, imported, failed, duplicate, slug conflicts, missing
images, missing content and posts requiring manual review; and for every failure
gives the **source URL**, the **title** where one was recovered, and the
**reason**.

A post is flagged for review when it has no date, no category, a suspiciously
short body, a table or blockquote that had to become custom HTML, or when it
replaced a file that already existed.

## Options

| | |
|---|---|
| `--test` | Import 3 posts and print source → extracted → new for each. Required before `--all`. |
| `--all` | Import the whole archive. Refuses to run until a test import has passed for that URL. |
| `--retry` | Re-attempt only the posts that failed last run. No re-crawl. |
| `--dry-run` | Do everything except write posts and images. |
| `--refresh` | Re-import posts already imported, updating them in place. |
| `--overwrite-stubs` | Replace existing posts this tool did not create. They become drafts, so they leave the live site until republished. |
| `--url <archive>` | Source archive page. |
| `--limit <n>` · `--test-count <n>` | How many posts. |
| `--delay <ms>` | Pause between requests to the source. Default 750. |
| `--strategies rest-api,sitemap,archive` | Which discovery routes to use. |
| `--no-cache` | Ignore the on-disk response cache. |
| `--posts-dir` · `--public-dir` · `--work-dir` | Write somewhere other than the repo. |

## Testing it without a live site

`fixtures/source-site.mjs` is a synthetic WordPress + Divi site — paged archive,
themed post pages wrapped in all the chrome above, lazy-loaded images, a REST
API, a sitemap, robots.txt. **Its article text is filler written for the fixture
and is not anybody's content.**

```bash
node tools/blog-import/fixtures/source-site.mjs --port 8099 &
node tools/blog-import/import.mjs --test --url http://localhost:8099/blogs/ --delay 0 \
  --posts-dir /tmp/mig/posts --public-dir /tmp/mig/img --work-dir /tmp/mig/work

# no REST API, so it must crawl the archive and strip theme chrome
node -e "import('./tools/blog-import/fixtures/source-site.mjs').then(m=>m.createFixtureServer({restApi:false}).listen(8098))" &
```

Specs: `node --test tools/blog-import/test/*.spec.mjs`

## After the migration

1. Open **Posts** in the dashboard. Every imported post is there as a draft.
2. Check a few against the live original — especially any the report flagged.
3. Publish the ones you want live.

Categories land on each post's `topic` field, which is what the Blog page's topic
chips filter on. A category that is not already a chip needs adding to the chip
list on that page (**Pages → Blog**), or its posts will only show under "All".

## Limits worth knowing

- **Links inside articles still point at the old site.** They are resolved to
  absolute URLs so they keep working, but deciding which should become new-site
  pages is a judgement call the tool does not make. The report counts them per
  post.
- **Tables and blockquotes become custom HTML.** They render correctly and keep
  their content, but they are not editable on the canvas.
- **Comments are not migrated.**
- **Redirects from the old URLs are not set up.** The slug is preserved, so the
  new path is `/blog/posts/<slug>` where the old one was `/<slug>/`; whoever
  cuts the domain over should map those.
