/**
 * Paging through the blog: nine posts a page, newest first, and the two links
 * that step between pages.
 *
 * A dealer site is static, so there is no query at request time. The build
 * writes one HTML file per page instead, each from the offset slice the query
 * would have returned — `LIMIT 9 OFFSET (page - 1) * 9` — and the page count
 * follows the posts, so the fortieth post adds a fifth page with nobody
 * touching the site.
 *
 * Page 1 keeps the address it always had; page N lives under it at `/page/N`,
 * because a path is a file a static host can serve and `?page=N` is not. The
 * wording and direction are the WordPress convention dealers know: "« Older
 * Entries" steps back in time (page N + 1) and "Next Entries »" forward
 * (page N − 1). An end with nowhere to go shows the label as plain text rather
 * than a link to itself, which is what `aria-disabled` on a `<span>` says.
 */

import { attrs, esc, href } from './html.mjs';

export const POSTS_PER_PAGE = 9;

/** How many pages `total` posts fill. Never zero: an empty blog is one empty page. */
export function postsPageCount(total, perPage = POSTS_PER_PAGE) {
  return Math.max(1, Math.ceil(Math.max(0, Number(total) || 0) / perPage));
}

/** A requested page number, held inside 1…totalPages. */
export function clampPostsPage(page, totalPages) {
  const n = Math.floor(Number(page) || 1);
  return Math.min(Math.max(1, n), Math.max(1, totalPages));
}

/** The posts on one page: the offset slice, without touching the rest. */
export function postsPageSlice(posts, page, perPage = POSTS_PER_PAGE) {
  const offset = (Math.max(1, page) - 1) * perPage;
  return (Array.isArray(posts) ? posts : []).slice(offset, offset + perPage);
}

/** `/blog` → `/blog` for page 1, `/blog/page/2` for page 2. The home page pages under `/page/N`. */
export function pagedPath(path, page) {
  const base = String(path || '/').replace(/\/+$/, '');
  return page <= 1 ? base || '/' : `${base}/page/${page}`;
}

/** The file a paged address is written to: `blog/index.html` → `blog/page/2/index.html`. */
export function pagedOut(out, page) {
  const file = String(out || 'index.html');
  if (page <= 1) return file;
  const dir = file.replace(/(^|\/)index\.html$/, '');
  return `${dir ? `${dir}/` : ''}page/${page}/index.html`;
}

/**
 * The older / newer links under the grid, or nothing for a blog that fits on
 * one page — two disabled controls and "Page 1 of 1" say nothing a reader needs.
 * `total`, when given, is how many posts the pages hold between them.
 */
export function renderPager({ page, totalPages, pagePath, total = null }, ctx = {}) {
  if (!(totalPages > 1)) return '';
  const current = clampPostsPage(page, totalPages);
  const step = (label, target, rel, cls) =>
    target
      ? `<a class="bz-pager__link ${cls}" href="${esc(href(pagedPath(pagePath, target), ctx))}"${attrs({ rel })}>${esc(label)}</a>`
      : `<span class="bz-pager__link ${cls}" aria-disabled="true">${esc(label)}</span>`;
  // The whole blog's count rides on the pager, because a page's own cards are
  // only nine of it: a heading that says "64 articles" reads it from here.
  return `<nav class="bz-pager" aria-label="Blog pages"${attrs({
    'data-bz-posts-total': total == null ? null : String(total),
  })}>${step(
    '« Older Entries',
    current < totalPages ? current + 1 : null,
    'next',
    'bz-pager__older',
  )}<span class="bz-pager__status">Page ${current} of ${totalPages}</span>${step(
    'Next Entries »',
    current > 1 ? current - 1 : null,
    'prev',
    'bz-pager__newer',
  )}</nav>`;
}

/** `<link rel="prev|next">` for a paged document's head, absolute against `origin`. */
export function pagerHeadLinks({ page, totalPages, pagePath, origin = '' }) {
  if (!(totalPages > 1)) return '';
  const links = [];
  if (page > 1) links.push(`<link rel="prev" href="${esc(origin + pagedPath(pagePath, page - 1))}" />`);
  if (page < totalPages) links.push(`<link rel="next" href="${esc(origin + pagedPath(pagePath, page + 1))}" />`);
  return links.map((l) => `\n${l}`).join('');
}

/* ---------------------------------------------------------- posts as rows */

/**
 * `Air Brakes` → `air-brakes`, `Parts & Service` → `parts-and-service`. The key a
 * topic chip filters on, derived rather than typed so a retitled topic keeps
 * matching its chip.
 */
export function topicKeyOf(topic) {
  return String(topic || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** `2026-07-15` → `Jul 15, 2026`, read in UTC so the build server's zone cannot move the day. */
function cardDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value || '');
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
}

const EXCERPT_LENGTH = 210;
// A paragraph shorter than this is a label ("QUICK ANSWER") or an aside, not
// the opening of the post.
const EXCERPT_MIN = 80;

const plain = (html) =>
  String(html || '')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&rsquo;/g, '’')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();

function firstParagraph(nodes) {
  for (const node of Array.isArray(nodes) ? nodes : []) {
    if (!node || typeof node !== 'object') continue;
    if (node.type === 'text') {
      const text = plain(node.props && node.props.text);
      if (text.length >= EXCERPT_MIN) return text;
    }
    const inner = firstParagraph(node.children);
    if (inner) return inner;
  }
  return '';
}

/**
 * A card's teaser: the post's own `excerpt` when it has one, else its opening
 * paragraph cut at a word near 210 characters, else its description.
 */
export function postExcerpt(post) {
  if (post && post.excerpt) return String(post.excerpt);
  const text = firstParagraph(post && (post.nodes || post.blocks)) || plain(post && post.body);
  if (!text) return String((post && post.description) || '');
  if (text.length <= EXCERPT_LENGTH) return text;
  const cut = text.slice(0, EXCERPT_LENGTH);
  const space = cut.lastIndexOf(' ');
  return `${(space > EXCERPT_LENGTH * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,;:.–—-]+$/, '')}…`;
}

/**
 * The `posts` data source's rows: published posts, newest first, in the field
 * names a component binds to. `config.topic` keeps one topic (by name or key),
 * `config.limit` caps the list, and `config.paginate` hands back the build's
 * current page of nine — the same slice a paged Latest posts block draws.
 */
export function postRows(posts, config = {}, { blogBasePath = '/blog', postsPage = 1 } = {}) {
  const base = String(blogBasePath || '/blog').replace(/\/+$/, '');
  let list = (Array.isArray(posts) ? posts : []).filter(
    (p) => p && p.slug && p.title && (p.status ?? 'published') === 'published',
  );
  const topic = config && config.topic ? topicKeyOf(config.topic) : '';
  if (topic) list = list.filter((p) => topicKeyOf(p.topic) === topic);
  const paginate = config && (config.paginate === true || config.paginate === 'true');
  if (paginate) list = postsPageSlice(list, clampPostsPage(postsPage, postsPageCount(list.length)));
  const limit = Number(config && config.limit);
  if (limit > 0) list = list.slice(0, limit);
  return list.map((p) => ({
    slug: p.slug,
    title: p.title,
    href: `${base}/${p.slug}`,
    date: cardDate(p.date),
    dateISO: String(p.date || '').slice(0, 10),
    excerpt: postExcerpt(p),
    topic: p.topic || '',
    topicKey: topicKeyOf(p.topic),
    coverImage: p.coverImage ? { src: p.coverImage, alt: p.title } : { src: '', alt: '' },
  }));
}
