#!/usr/bin/env node
/**
 * Blog sync — rewrite the Blog page's cards from the blog's own post records.
 *
 *   node tools/blog-sync/sync.mjs            # rewrite the cards from the records
 *   node tools/blog-sync/sync.mjs --check    # fail if a card has drifted from its record
 *   node tools/blog-sync/sync.mjs --all      # show every published post, newest first
 *
 * The Blog page holds a `post-cards` node whose `posts` list used to carry a
 * second copy of each post: its own title, date, topic, excerpt, link and
 * thumbnail, kept level with `site/blog/posts/<slug>.json` by hand. Two copies of
 * one blog is the bug the whole file exists to remove — a thumbnail set on a card
 * never reached the post's page, because the page reads the record and the card
 * read itself.
 *
 * Now a card carries one authored value, its `slug`, which says *which* post it
 * shows and in what order. Everything else is projected from that post's record
 * on every run, so the card and `/blog/posts/<slug>` cannot disagree: the image a
 * dealer sets on Posts is the image both draw, and it belongs to that post alone.
 *
 * `--check` runs in `npm run check`, so a hand-edit that reintroduces the drift
 * fails the build instead of shipping quietly.
 */

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { byNewest, cardFor, cardSlug, countLabel, findByType, isPublished, walk } from './sync-lib.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

const argv = process.argv.slice(2);
const has = (flag) => argv.includes(flag);
const CHECK = has('--check');
const ALL = has('--all');
const QUIET = has('--quiet');

const PAGE = join(ROOT, 'site/pages/blog/page.json');
const POSTS_DIR = join(ROOT, 'site/blog/posts');
const SETTINGS = join(ROOT, 'site/blog/settings.json');

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
const problems = [];
const notes = [];

/* --------------------------------------------------------------- the records */

const settings = readJson(SETTINGS);
const basePath = settings.basePath || '/blog/posts';

const posts = new Map();
for (const file of readdirSync(POSTS_DIR).filter((f) => f.endsWith('.json')).sort()) {
  const post = readJson(join(POSTS_DIR, file));
  const slug = post.slug || file.replace(/\.json$/, '');
  if (post.slug && post.slug !== file.replace(/\.json$/, '')) {
    problems.push(`site/blog/posts/${file}: slug "${post.slug}" does not match the filename.`);
  }
  posts.set(slug, { ...post, slug });
}

/* ------------------------------------------- the category line inside a post */

// The post page's masthead is composed by the build from the record's date and
// title; the category is the record's to render, and it does so through the
// `intro-eyebrow` block. That block is the post's own field written twice, so it
// is projected from `topic` here for the same reason a card is — retopic a post
// on Posts and its page follows, instead of keeping the old word.
const rewrittenPosts = [];
for (const [slug, post] of posts) {
  const block = [...walk(post.nodes)].find((n) => n.id === 'intro-eyebrow');
  if (!block || block.type !== 'text') continue;
  const topic = post.topic || '';
  if ((block.props?.text ?? '') === topic) continue;
  if (CHECK) {
    problems.push(
      `site/blog/posts/${slug}.json: the category line reads "${block.props?.text ?? ''}" but the post's topic is "${topic}". Run: npm run blog:sync`,
    );
  } else {
    block.props = { ...block.props, text: topic };
    rewrittenPosts.push([slug, post]);
  }
}
for (const [slug, post] of rewrittenPosts) {
  writeFileSync(join(POSTS_DIR, `${slug}.json`), JSON.stringify(post, null, 2));
  notes.push(`site/blog/posts/${slug}.json: category line set to "${post.topic || ''}".`);
}

/* ------------------------------------------------------------------ the page */

const page = readJson(PAGE);
const list = findByType(page.nodes, 'post-cards');
if (!list) {
  console.error('site/pages/blog/page.json: no post-cards node — nothing to sync.');
  process.exit(1);
}
const counter = findByType(page.nodes, 'result-count');
const chips = findByType(page.nodes, 'filter-pills');

/* --------------------------------------------------------------- the mapping */

// Which posts the page shows, and in what order, is the page's to decide: a
// dealer picks them on Pages → Blog. --all hands that decision back to the
// archive so every published post appears, newest first.
let slugs;
if (ALL) {
  slugs = [...posts.values()].filter(isPublished).sort(byNewest).map((p) => p.slug);
} else {
  slugs = (list.props?.posts ?? []).map(cardSlug);
}

const cards = [];
for (const slug of slugs) {
  if (!slug) {
    problems.push('site/pages/blog/page.json: a card names no post. Give it a slug.');
    continue;
  }
  const post = posts.get(slug);
  if (!post) {
    problems.push(
      `site/pages/blog/page.json: card "${slug}" has no record at site/blog/posts/${slug}.json.`,
    );
    continue;
  }
  if (!isPublished(post)) {
    problems.push(
      `site/pages/blog/page.json: card "${slug}" is a ${post.status} post, so its page is not built. Publish it in Posts or drop the card.`,
    );
    continue;
  }
  cards.push(cardFor(post, basePath));
}

// A topic with no chip is only reachable under "All" — worth saying, never fatal.
if (chips) {
  const values = new Set((chips.props?.options ?? []).map((o) => o.value));
  for (const card of cards) {
    if (card.topic && !values.has(card.topic)) {
      notes.push(
        `"${card.topic}" (${card.slug}) has no topic chip on the Blog page, so the post only shows under "All".`,
      );
    }
  }
}
for (const card of cards) {
  if (!card.image) notes.push(`${card.slug}: no featured image yet — the card draws its placeholder.`);
}

if (problems.length) {
  for (const p of problems) console.error(`  ✗ ${p}`);
  process.exit(1);
}

/* ------------------------------------------------------------------- writing */

const before = JSON.stringify({ posts: list.props?.posts ?? [], count: counter?.props?.initial });
list.props = { ...list.props, posts: cards };
if (counter) counter.props = { ...counter.props, initial: countLabel(cards.length) };
const after = JSON.stringify({ posts: cards, count: counter?.props?.initial });
const drifted = before !== after;

if (CHECK) {
  if (drifted) {
    console.error(
      'site/pages/blog/page.json: the Blog cards have drifted from site/blog/posts/.\n' +
        'A card shows a post; it does not hold its own copy of one. Run:\n\n' +
        '  npm run blog:sync\n',
    );
    process.exit(1);
  }
  if (!QUIET) console.log(`blog:sync — ${cards.length} card(s) match their post records.`);
} else {
  if (drifted) writeFileSync(PAGE, `${JSON.stringify(page, null, 2)}\n`);
  if (!QUIET) {
    console.log(
      drifted
        ? `blog:sync — wrote ${cards.length} card(s) to site/pages/blog/page.json.`
        : `blog:sync — ${cards.length} card(s) already match their post records.`,
    );
    for (const card of cards) {
      console.log(`  · ${card.slug} — ${card.topic || 'no topic'} · ${card.date} · ${card.image ? 'image' : 'placeholder'}`);
    }
  }
}

if (!QUIET) for (const n of notes) console.log(`  · ${n}`);
