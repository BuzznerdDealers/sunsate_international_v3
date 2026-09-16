/**
 * The guarantee under test is the one the Blog page got wrong: a card is a view
 * of one post record, so no field a card shows can come from another post, and
 * changing one post can only change that post's card.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, cpSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { byNewest, cardFor, cardSlug, countLabel, formatCardDate } from '../sync-lib.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../../..');
const BASE = '/blog/posts';

const post = (slug, over = {}) => ({
  slug,
  title: `Title ${slug}`,
  date: '2026-07-30',
  description: `Excerpt ${slug}`,
  status: 'published',
  coverImage: `/img/${slug}.jpg`,
  topic: 'Service',
  nodes: [],
  ...over,
});

test('a card carries its own post and nothing of any other', () => {
  const a = cardFor(post('a'), BASE);
  const b = cardFor(post('b', { topic: 'Parts', date: '2026-01-02', title: 'B' }), BASE);

  assert.equal(a.image.src, '/img/a.jpg');
  assert.equal(b.image.src, '/img/b.jpg');
  assert.equal(a.url, '/blog/posts/a');
  assert.equal(b.url, '/blog/posts/b');
  for (const key of Object.keys(a)) assert.notEqual(a[key], b[key], `${key} is shared between two posts`);
});

test('changing one post changes that post’s card only', () => {
  const posts = [post('a'), post('b'), post('c')];
  const before = posts.map((p) => cardFor(p, BASE));

  posts[0].coverImage = '/img/a-replaced.jpg';
  const after = posts.map((p) => cardFor(p, BASE));

  assert.equal(after[0].image.src, '/img/a-replaced.jpg');
  assert.deepEqual(after[1], before[1]);
  assert.deepEqual(after[2], before[2]);
});

test('a post with no featured image gets no image key, so the card draws its placeholder', () => {
  const card = cardFor(post('a', { coverImage: null }), BASE);
  assert.equal('image' in card, false);
});

test('the card is bound by slug, and falls back to the slug in its link', () => {
  assert.equal(cardSlug({ slug: 'a', url: '/blog/posts/b' }), 'a');
  assert.equal(cardSlug({ url: '/blog/posts/b' }), 'b');
  assert.equal(cardSlug({ url: '/blog/posts/b/' }), 'b');
  assert.equal(cardSlug({}), '');
});

test('dates render in UTC, and the count agrees in number', () => {
  assert.equal(formatCardDate('2026-07-30'), 'Jul 30, 2026');
  assert.equal(formatCardDate('2026-01-01'), 'Jan 1, 2026');
  assert.equal(formatCardDate(null), '');
  assert.equal(countLabel(1), '1 article');
  assert.equal(countLabel(4), '4 articles');
});

test('--all orders the archive newest first', () => {
  const posts = [post('a', { date: '2026-01-02' }), post('b', { date: '2026-07-30' })];
  assert.deepEqual(posts.sort(byNewest).map((p) => p.slug), ['b', 'a']);
});

/* ----------------------------------------------------------- the whole tool */

function scratchRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'blog-sync-'));
  mkdirSync(join(dir, 'tools'), { recursive: true });
  mkdirSync(join(dir, 'site/blog/posts'), { recursive: true });
  mkdirSync(join(dir, 'site/pages/blog'), { recursive: true });
  cpSync(join(REPO, 'tools/blog-sync'), join(dir, 'tools/blog-sync'), { recursive: true });
  writeFileSync(join(dir, 'site/blog/settings.json'), JSON.stringify({ enabled: true, basePath: BASE }));
  for (const slug of ['a', 'b', 'c']) {
    writeFileSync(join(dir, `site/blog/posts/${slug}.json`), JSON.stringify(post(slug)));
  }
  const page = {
    version: 2,
    nodes: [
      {
        id: 'bl-posts',
        type: 'section',
        props: { behaviour: 'filter' },
        children: [
          {
            id: 'r',
            type: 'row',
            props: {},
            children: [
              {
                id: 'c',
                type: 'column',
                props: { span: 12 },
                children: [
                  { id: 'bp-count', type: 'result-count', props: { template: '{n} articles', initial: '9 articles' } },
                  // The drifted state this tool exists to end: a card holding
                  // another post's title and a thumbnail of its own.
                  {
                    id: 'bp-list',
                    type: 'post-cards',
                    props: {
                      posts: [
                        { slug: 'a', title: 'Title c', date: 'wrong', url: '/blog/posts/a', excerpt: 'x', image: { src: '/img/c.jpg', alt: 'c' } },
                        { slug: 'b', title: 'Title b', date: 'wrong', url: '/blog/posts/b', excerpt: 'x' },
                      ],
                    },
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  };
  writeFileSync(join(dir, 'site/pages/blog/page.json'), JSON.stringify(page, null, 2));
  return dir;
}

const run = (dir, args) =>
  execFileSync(process.execPath, [join(dir, 'tools/blog-sync/sync.mjs'), ...args], { encoding: 'utf8' });

const cardsOf = (dir) => {
  const page = JSON.parse(readFileSync(join(dir, 'site/pages/blog/page.json'), 'utf8'));
  const col = page.nodes[0].children[0].children[0];
  return {
    cards: col.children[1].props.posts,
    count: col.children[0].props.initial,
  };
};

test('sync repairs a drifted card from its own record and leaves the selection alone', () => {
  const dir = scratchRepo();
  try {
    run(dir, ['--quiet']);
    const { cards, count } = cardsOf(dir);
    assert.deepEqual(cards.map((c) => c.slug), ['a', 'b']);
    assert.equal(cards[0].title, 'Title a');
    assert.equal(cards[0].image.src, '/img/a.jpg');
    assert.equal(cards[0].date, 'Jul 30, 2026');
    assert.equal(cards[1].image.src, '/img/b.jpg');
    assert.equal(count, '2 articles');
    run(dir, ['--check', '--quiet']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('--check fails once a card stops matching its record', () => {
  const dir = scratchRepo();
  try {
    run(dir, ['--quiet']);
    const file = join(dir, 'site/blog/posts/a.json');
    writeFileSync(file, JSON.stringify(post('a', { coverImage: '/img/a-new.jpg' })));
    assert.throws(() => run(dir, ['--check', '--quiet']), /drifted/);

    run(dir, ['--quiet']);
    const { cards } = cardsOf(dir);
    assert.equal(cards[0].image.src, '/img/a-new.jpg');
    assert.equal(cards[1].image.src, '/img/b.jpg'); // untouched
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('--all shows every published post, newest first, and skips drafts', () => {
  const dir = scratchRepo();
  try {
    writeFileSync(join(dir, 'site/blog/posts/c.json'), JSON.stringify(post('c', { date: '2026-09-01' })));
    writeFileSync(join(dir, 'site/blog/posts/b.json'), JSON.stringify(post('b', { status: 'draft' })));
    run(dir, ['--all', '--quiet']);
    assert.deepEqual(cardsOf(dir).cards.map((c) => c.slug), ['c', 'a']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a card naming a post that does not exist is an error, not a blank card', () => {
  const dir = scratchRepo();
  try {
    rmSync(join(dir, 'site/blog/posts/a.json'));
    assert.throws(() => run(dir, ['--quiet']), /has no record/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
