/**
 * Projecting a blog post record onto a Blog page card.
 *
 * One blog is one record: site/blog/posts/<slug>.json. Everything a card shows
 * — its topic, date, title, link, excerpt and thumbnail — is that record's, read
 * through the card's `slug`. Nothing here invents a value, and nothing here
 * writes back to a record: a card is a view of a post, never a second copy of
 * one, which is why setting a post's featured image can only ever change that
 * post's card and that post's page.
 */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** `2026-07-30` -> `Jul 30, 2026`, in UTC so the day never shifts under a timezone. */
export function formatCardDate(value) {
  if (!value) return '';
  const d = new Date(`${String(value).slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return String(value);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}

/** The slug a card is bound to: its own `slug`, or the last segment of its link. */
export function cardSlug(card) {
  if (card && typeof card.slug === 'string' && card.slug.trim()) return card.slug.trim();
  const url = card && typeof card.url === 'string' ? card.url : '';
  const path = url.split(/[?#]/)[0].replace(/\/+$/, '');
  return path ? (path.split('/').pop() ?? '') : '';
}

export function postPath(post, basePath) {
  return `${String(basePath || '/blog/posts').replace(/\/+$/, '')}/${post.slug}`;
}

/**
 * The card a post makes. Key order matches what the widget declares, so a synced
 * page.json diffs as a value change rather than a reshuffle.
 *
 * `image` is omitted entirely when the post has no featured image — the widget
 * draws its placeholder in the same box, so adding one later moves nothing.
 */
export function cardFor(post, basePath) {
  const card = {
    slug: post.slug,
    topic: post.topic || '',
    date: formatCardDate(post.date),
    title: post.title || '',
    url: postPath(post, basePath),
    excerpt: post.description || '',
  };
  if (post.coverImage) {
    card.image = { src: post.coverImage, alt: post.title || '' };
  }
  return card;
}

/** `4 articles`, and `1 article`. */
export function countLabel(n) {
  return `${n} ${n === 1 ? 'article' : 'articles'}`;
}

export function isPublished(post) {
  return (post?.status ?? 'published') === 'published';
}

/** Newest first, then by slug so equal dates keep a stable order. */
export function byNewest(a, b) {
  const d = String(b.date || '').localeCompare(String(a.date || ''));
  return d !== 0 ? d : String(a.slug || '').localeCompare(String(b.slug || ''));
}

/** Walk a node tree, parents before children. */
export function* walk(nodes) {
  for (const node of nodes ?? []) {
    if (!node || typeof node !== 'object') continue;
    yield node;
    yield* walk(node.children);
  }
}

export function findByType(nodes, type) {
  for (const node of walk(nodes)) if (node.type === type) return node;
  return null;
}
