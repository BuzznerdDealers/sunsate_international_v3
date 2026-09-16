/**
 * Specs for the blog migration.
 *
 *   node --test tools/blog-import/test/
 *
 * The end-to-end path is exercised against the fixture source site; these cover
 * the pieces where a quiet wrong answer would be expensive — a parser that
 * unbalances on a tracking script, a stripper that eats the article, a store
 * that overwrites a post somebody wrote by hand.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { parse, find, findAll, text, serialize } from '../lib/html.mjs';
import { parseRobots, isAllowed, Fetcher, describeNetworkError } from '../lib/http.mjs';
import { canonicalUrl, slugFromUrl } from '../lib/discover.mjs';
import { extractPost, stripChrome, normaliseDate, findArticleBody } from '../lib/extract.mjs';
import { toNodes, inlineHtml } from '../lib/blocks.mjs';
import { preferOriginal, localName } from '../lib/media.mjs';
import { readExistingPosts, writePost, safeSlug, contentHash } from '../lib/store.mjs';

/* ------------------------------------------------------------------ parser */

test('a script body never unbalances the tree', () => {
  const doc = parse('<div class="a"><p>Kept</p><script>if (x < 1) { y = "</div>"; }</script><p>Also kept</p></div>');
  const div = find(doc, 'div');
  assert.equal(findAll(div, 'p').length, 2);
  assert.equal(text(findAll(div, 'p')[1]), 'Also kept');
});

test('unclosed paragraphs and list items close themselves', () => {
  const doc = parse('<p>One<p>Two<ul><li>a<li>b</ul>');
  assert.deepEqual(findAll(doc, 'p').map(text), ['One', 'Two']);
  assert.deepEqual(findAll(doc, 'li').map(text), ['a', 'b']);
});

test('a stray closing tag does not throw away the rest of the document', () => {
  const doc = parse('<div><p>Before</p></section><p>After</p></div>');
  assert.deepEqual(findAll(doc, 'p').map(text), ['Before', 'After']);
});

test('entities are decoded once, and re-escaped on the way out', () => {
  const doc = parse('<p>Tom &amp; Jerry &mdash; &#8220;quoted&#8221; &nbsp;end</p>');
  assert.equal(text(find(doc, 'p')), 'Tom & Jerry — "quoted" end'.replace('"', '“').replace('"', '”'));
  assert.equal(serialize(find(doc, 'p')).includes('&amp;'), true);
});

test('unquoted and empty attributes parse', () => {
  const doc = parse('<img src=photo.jpg alt="A photo" loading=lazy hidden>');
  const img = find(doc, 'img');
  assert.equal(img.attrs.src, 'photo.jpg');
  assert.equal(img.attrs.alt, 'A photo');
  assert.equal(img.attrs.hidden, '');
});

/* ------------------------------------------------------------------ robots */

test('robots.txt: the longest matching rule wins', () => {
  const rules = parseRobots(
    'User-agent: *\nDisallow: /wp-admin/\nAllow: /wp-admin/admin-ajax.php\n',
    'BuzzNerd-BlogMigration/1.0',
  );
  assert.equal(isAllowed(rules, '/blogs/'), true);
  assert.equal(isAllowed(rules, '/wp-admin/options.php'), false);
  assert.equal(isAllowed(rules, '/wp-admin/admin-ajax.php'), true);
});

test('robots.txt: a group naming us beats the * group', () => {
  const rules = parseRobots(
    'User-agent: *\nDisallow: /\n\nUser-agent: buzznerd-blogmigration\nDisallow: /private/\n',
    'BuzzNerd-BlogMigration/1.0',
  );
  assert.equal(isAllowed(rules, '/blogs/'), true);
  assert.equal(isAllowed(rules, '/private/x'), false);
});

/* ------------------------------------------------------- read-only promise */

test('the fetcher refuses every method but GET and HEAD', async () => {
  const fetcher = new Fetcher();
  for (const method of ['POST', 'PUT', 'DELETE', 'PATCH']) {
    await assert.rejects(
      () => fetcher._raw('https://example.test/', method),
      /only ever reads the source site/,
    );
  }
});

test('an egress denial is named as one, not as a dead host', () => {
  const message = describeNetworkError(
    { message: 'fetch failed', cause: { message: 'CONNECT tunnel failed, response 403' } },
    'https://www.sunstateintl.com/blogs/',
  );
  assert.match(message, /egress policy/);
  assert.match(message, /www\.sunstateintl\.com/);
});

/* --------------------------------------------------------------- discovery */

test('URLs normalise for comparison without losing meaning', () => {
  assert.equal(
    canonicalUrl('https://x.test/a-post/?utm_source=nl#top', 'https://x.test/'),
    'https://x.test/a-post',
  );
  assert.equal(canonicalUrl('/rel/post/', 'https://x.test/blogs/'), 'https://x.test/rel/post');
  assert.equal(canonicalUrl('javascript:void(0)', 'https://x.test/'), null);
  assert.equal(slugFromUrl('https://x.test/Some-Post/'), 'some-post');
});

/* -------------------------------------------------------------- extraction */

const THEMED = `<!DOCTYPE html><html><head>
<title>A Post | Old Site</title>
<meta name="description" content="The meta description.">
<link rel="canonical" href="https://old.test/a-post/">
<script type="application/ld+json">{"@type":"BlogPosting","headline":"A Post","datePublished":"2026-03-04","articleSection":"Service","author":{"@type":"Person","name":"Dana Reed"}}</script>
</head><body>
<div id="cookie-consent-banner">Cookies</div>
<header id="main-header"><nav><a href="/">Home</a></nav></header>
<article>
  <h1 class="entry-title">A Post</h1>
  <div class="entry-content">
    <p>Real body copy that belongs to the article and should survive.</p>
    <div class="addtoany_share_save_container"><a href="#">Share</a></div>
    <h2>A heading</h2>
    <p>More real copy, long enough to count as prose for the density check.</p>
    <div class="dealer-inventory-widget"><a href="/inventory/">Browse inventory</a></div>
    <img src="/wp-content/uploads/a.jpg" data-src="/wp-content/uploads/a.jpg" class="lazyload" alt="A photo">
    <script>gtag('event','x');</script>
  </div>
  <section class="related-posts"><a href="/other/">Other</a></section>
  <div id="comments"><form><textarea></textarea></form></div>
</article>
<aside id="sidebar"><div class="widget">Categories</div></aside>
<footer id="main-footer"><a href="/contact-us/">Contact</a></footer>
</body></html>`;

test('the article body is found, and the theme around it is not', () => {
  const post = extractPost({ url: 'https://old.test/a-post/', html: THEMED });
  assert.equal(post.title, 'A Post');
  assert.match(post.bodyHtml, /Real body copy/);
  assert.match(post.bodyHtml, /More real copy/);
  for (const chrome of ['Share', 'Browse inventory', 'Other', 'Contact', 'Cookies', 'Categories', 'gtag']) {
    assert.ok(!post.bodyHtml.includes(chrome), `"${chrome}" should have been stripped`);
  }
});

test('the h1 is dropped from the body — the post record owns the title', () => {
  const post = extractPost({ url: 'https://old.test/a-post/', html: THEMED });
  assert.ok(!/<h1/.test(post.bodyHtml));
});

test('metadata comes off the page even when there is no REST payload', () => {
  const post = extractPost({ url: 'https://old.test/a-post/', html: THEMED });
  assert.equal(post.date, '2026-03-04');
  assert.equal(post.category, 'Service');
  assert.equal(post.author, 'Dana Reed');
  assert.equal(post.metaTitle, 'A Post | Old Site');
  assert.equal(post.metaDescription, 'The meta description.');
  assert.equal(post.slug, 'a-post');
  assert.equal(post.extractedVia, 'page');
});

test('relative image and link URLs are resolved against the post', () => {
  const post = extractPost({ url: 'https://old.test/a-post/', html: THEMED });
  assert.equal(post.images[0].src, 'https://old.test/wp-content/uploads/a.jpg');
});

test('the old theme’s classes and lazy-load attributes do not come across', () => {
  const post = extractPost({ url: 'https://old.test/a-post/', html: THEMED });
  assert.ok(!post.bodyHtml.includes('lazyload'));
  assert.ok(!post.bodyHtml.includes('data-src'));
  assert.ok(!post.bodyHtml.includes('class='));
});

test('a REST payload is preferred over the rendered page', () => {
  const post = extractPost({
    url: 'https://old.test/a-post/',
    html: THEMED,
    rest: {
      slug: 'a-post',
      title: { rendered: 'A Post &amp; More' },
      content: { rendered: '<p>The canonical body from the API, which is long enough to pass.</p>' },
      date_gmt: '2026-03-04T12:00:00',
      _embedded: { author: [{ name: 'API Author' }], 'wp:term': [[{ taxonomy: 'category', name: 'Fleet' }]] },
    },
  });
  assert.equal(post.title, 'A Post & More');
  assert.equal(post.extractedVia, 'rest-api');
  assert.equal(post.category, 'Fleet');
  assert.equal(post.author, 'API Author');
  assert.match(post.bodyHtml, /canonical body from the API/);
  // The head still supplies what the post record cannot.
  assert.equal(post.metaDescription, 'The meta description.');
});

test('chrome nested inside the body is removed without taking the prose', () => {
  const root = parse(
    '<div><p>Keep me</p><div class="social-share"><a href="#">x</a></div>'
    + '<div class="newsletter-signup">Sign up</div><p>Keep me too</p></div>',
  );
  const removed = stripChrome(root);
  assert.equal(removed.length, 2);
  assert.match(serialize(root), /Keep me/);
  assert.match(serialize(root), /Keep me too/);
  assert.ok(!serialize(root).includes('Sign up'));
});

test('a page with no recognisable body reports it rather than inventing one', () => {
  const post = extractPost({ url: 'https://old.test/empty/', html: '<html><body><div>hi</div></body></html>' });
  assert.equal(post.extractedVia, 'none');
  assert.ok(post.warnings.some((w) => /could not find the article body/.test(w)));
});

test('dates normalise from every shape WordPress emits', () => {
  assert.equal(normaliseDate('2026-07-30T09:00:00-04:00'), '2026-07-30');
  assert.equal(normaliseDate('July 30, 2026'), '2026-07-30');
  assert.equal(normaliseDate(''), '');
  assert.equal(normaliseDate('not a date'), '');
});

/* ------------------------------------------------------------------ blocks */

test('inline formatting survives; everything else is unwrapped, not dropped', () => {
  const p = find(parse('<p>A <strong>b</strong> <em>c</em> <span class="x">d</span> <a href="/l">e</a></p>'), 'p');
  assert.equal(inlineHtml(p), 'A <strong>b</strong> <em>c</em> d <a href="/l">e</a>');
});

test('the article maps onto real blocks, in order', () => {
  const body = parse(
    '<div><p>One</p><p>Two</p><h2>H</h2><ul><li>a</li></ul>'
    + '<figure><img src="/i.jpg" alt="I"><figcaption>Cap</figcaption></figure>'
    + '<table><tr><td>T</td></tr></table><ol><li>n</li></ol><hr><p>End</p></div>',
  );
  const { nodes, notes } = toNodes(body, { idPrefix: 'x' });
  const blocks = nodes[0].children[0].children[0].children;
  assert.deepEqual(
    blocks.map((b) => b.type),
    ['text', 'heading', 'prose-list', 'image', 'customHtml', 'prose-list', 'divider', 'text'],
  );
  // Consecutive paragraphs merge into one text block, blank-line separated.
  assert.equal(blocks[0].props.text, 'One\n\nTwo');
  assert.equal(blocks[2].props.ordered, false);
  assert.equal(blocks[5].props.ordered, true);
  assert.equal(blocks[3].props.caption, 'Cap');
  assert.ok(notes.some((n) => /table/.test(n)));
});

test('every node the mapper emits has a unique id', () => {
  const body = parse('<div><p>a</p><h2>b</h2><p>c</p><ul><li>d</li></ul><h3>e</h3><p>f</p></div>');
  const { nodes } = toNodes(body, { idPrefix: 'x' });
  const ids = [];
  const walkIds = (list) => {
    for (const n of list) {
      ids.push(n.id);
      if (n.children) walkIds(n.children);
    }
  };
  walkIds(nodes);
  assert.equal(new Set(ids).size, ids.length);
});

test('an empty body produces no nodes, so the caller can fail the post', () => {
  const { nodes } = toNodes(parse('<div></div>'), { idPrefix: 'x' });
  assert.equal(nodes.length, 0);
});

/* ------------------------------------------------------------------- media */

test('a WordPress thumbnail resolves to its original', () => {
  assert.equal(
    preferOriginal('https://x.test/uploads/2026/07/photo-400x250.jpg'),
    'https://x.test/uploads/2026/07/photo.jpg',
  );
  assert.equal(preferOriginal('https://x.test/uploads/photo.jpg'), 'https://x.test/uploads/photo.jpg');
});

test('local filenames are safe, and two images never collide', () => {
  const a = localName('https://x.test/a/photo.jpg');
  const b = localName('https://x.test/b/photo.jpg');
  assert.match(a, /^photo-[0-9a-f]{6}\.jpg$/);
  assert.notEqual(a, b);
  assert.match(localName('https://x.test/Odd%20Name!.PNG'), /^odd-name-[0-9a-f]{6}\.png$/);
});

/* ------------------------------------------------------------------- store */

function tempPosts(seed = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'blog-import-'));
  for (const [name, record] of Object.entries(seed)) {
    writeFileSync(join(dir, name), JSON.stringify(record));
  }
  return dir;
}

const POST = {
  sourceUrl: 'https://old.test/a-post',
  slug: 'a-post',
  title: 'A Post',
  date: '2026-03-04',
  bodyHtml: '<p>Body</p>',
  links: [],
};

function record(overrides = {}) {
  return {
    slug: 'a-post',
    title: 'A Post',
    status: 'draft',
    migration: { sourceUrl: POST.sourceUrl, contentHash: contentHash(POST) },
    ...overrides,
  };
}

test('a post imported before is skipped, not imported twice', () => {
  const dir = tempPosts({ 'a-post.json': record() });
  const result = writePost({
    post: POST,
    record: record(),
    postsDir: dir,
    existing: readExistingPosts(dir),
  });
  assert.equal(result.outcome, 'duplicate');
  assert.equal(result.changed, false);
});

test('a source that changed since the import says so', () => {
  const dir = tempPosts({
    'a-post.json': record({ migration: { sourceUrl: POST.sourceUrl, contentHash: 'stale' } }),
  });
  const result = writePost({
    post: POST,
    record: record(),
    postsDir: dir,
    existing: readExistingPosts(dir),
  });
  assert.equal(result.outcome, 'duplicate');
  assert.equal(result.changed, true);
  assert.match(result.detail, /--refresh/);
});

test('a post this tool did not write is never overwritten by default', () => {
  const dir = tempPosts({ 'a-post.json': { slug: 'a-post', title: 'Hand written', status: 'published' } });
  const result = writePost({
    post: POST,
    record: record(),
    postsDir: dir,
    existing: readExistingPosts(dir),
  });
  assert.equal(result.outcome, 'conflict');
  assert.match(result.detail, /--overwrite-stubs/);
  assert.equal(JSON.parse(readFileSync(join(dir, 'a-post.json'), 'utf8')).title, 'Hand written');
});

test('--overwrite-stubs replaces it, and what replaces it is a draft', () => {
  const dir = tempPosts({ 'a-post.json': { slug: 'a-post', title: 'Hand written', status: 'published' } });
  const result = writePost({
    post: POST,
    record: record(),
    postsDir: dir,
    existing: readExistingPosts(dir),
    overwriteStubs: true,
  });
  assert.equal(result.outcome, 'updated');
  const written = JSON.parse(readFileSync(join(dir, 'a-post.json'), 'utf8'));
  assert.equal(written.title, 'A Post');
  assert.equal(written.status, 'draft');
});

test('a dry run writes nothing', () => {
  const dir = tempPosts();
  const result = writePost({
    post: POST,
    record: record(),
    postsDir: dir,
    existing: readExistingPosts(dir),
    dryRun: true,
  });
  assert.equal(result.outcome, 'dry-run');
  assert.equal(existsSync(join(dir, 'a-post.json')), false);
});

test('slugs are made safe without losing the original where it is usable', () => {
  assert.equal(safeSlug('when-to-schedule-alignment', 'X'), 'when-to-schedule-alignment');
  assert.equal(safeSlug('', 'A Post: Part Two'), 'a-post-part-two');
  assert.equal(safeSlug('Ünsafe/Slug', 'X'), 'nsafe-slug');
});
