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
 */
export function renderPager({ page, totalPages, pagePath }, ctx = {}) {
  if (!(totalPages > 1)) return '';
  const current = clampPostsPage(page, totalPages);
  const step = (label, target, rel, cls) =>
    target
      ? `<a class="bz-pager__link ${cls}" href="${esc(href(pagedPath(pagePath, target), ctx))}"${attrs({ rel })}>${esc(label)}</a>`
      : `<span class="bz-pager__link ${cls}" aria-disabled="true">${esc(label)}</span>`;
  return `<nav class="bz-pager" aria-label="Blog pages">${step(
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
