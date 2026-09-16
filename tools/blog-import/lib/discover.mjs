/**
 * Finding every post URL, without asking the source platform for anything
 * private.
 *
 * Three public routes, tried in this order and merged. Each is a complete
 * answer on its own; together they cover the ways a WordPress site can be
 * configured to hide posts from one of them.
 *
 *  1. The REST API at /wp-json/wp/v2/posts. Public and read-only on a stock
 *     WordPress, and by far the most reliable: it returns the post body,
 *     date, slug, categories, author and featured image as data, so nothing
 *     has to be inferred from a theme's markup. Some sites disable it.
 *  2. The XML sitemap. Yoast, Rank Math and core all publish one; it lists
 *     every indexable post including ones the archive has paged past.
 *  3. Crawling the archive page and following its "Older Entries" link, which
 *     is the route that works when the first two are switched off.
 *
 * Whatever is found, the result is the same shape: a list of absolute post
 * URLs, each tagged with how it was discovered.
 */

import { parse, findAll, findAllWhere, text, hasClass, decodeEntities } from './html.mjs';

/** Normalise for comparison: no fragment, no trailing slash, no tracking query. */
export function canonicalUrl(url, base) {
  let parsed;
  try {
    parsed = new URL(url, base);
  } catch {
    return null;
  }
  if (!/^https?:$/.test(parsed.protocol)) return null;
  parsed.hash = '';
  for (const key of [...parsed.searchParams.keys()]) {
    if (/^(utm_|fbclid|gclid|et_blog|replytocom)/i.test(key)) parsed.searchParams.delete(key);
  }
  parsed.search = parsed.searchParams.toString() ? `?${parsed.searchParams}` : '';
  if (parsed.pathname.length > 1) parsed.pathname = parsed.pathname.replace(/\/+$/, '');
  return parsed.toString();
}

export function slugFromUrl(url) {
  try {
    const path = new URL(url).pathname.replace(/\/+$/, '');
    const last = path.split('/').filter(Boolean).pop() || '';
    return last.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
  } catch {
    return '';
  }
}

/** Paths that are never a post, however they are linked. */
const NOT_A_POST = /\/(wp-admin|wp-login|wp-json|feed|author|tag|category|page|comment-page-\d+|cdn-cgi)(\/|$)/i;

function looksLikePost(url, archiveUrl) {
  const parsed = new URL(url);
  const archive = new URL(archiveUrl);
  if (parsed.host !== archive.host) return false;
  if (NOT_A_POST.test(parsed.pathname)) return false;
  if (/\.(jpe?g|png|gif|webp|svg|pdf|zip|mp4|avif)$/i.test(parsed.pathname)) return false;
  const depth = parsed.pathname.split('/').filter(Boolean).length;
  if (depth === 0) return false;
  // The archive itself, and its paged variants, are not posts.
  if (parsed.pathname.replace(/\/+$/, '') === archive.pathname.replace(/\/+$/, '')) return false;
  return true;
}

/* ------------------------------------------------------------- 1. REST API */

export async function discoverViaRestApi(fetcher, archiveUrl, { log = () => {} } = {}) {
  const origin = new URL(archiveUrl).origin;
  const found = [];
  let page = 1;
  for (;;) {
    const url = `${origin}/wp-json/wp/v2/posts?per_page=100&page=${page}&_embed=1&orderby=date&order=desc`;
    let res;
    try {
      res = await fetcher.text(url);
    } catch (err) {
      if (page === 1) throw err;
      break; // Past the last page WordPress answers 400; that is the end.
    }
    let batch;
    try {
      batch = JSON.parse(res.body);
    } catch {
      throw new Error('the REST API did not return JSON');
    }
    if (!Array.isArray(batch) || !batch.length) break;
    for (const post of batch) {
      if (!post || !post.link) continue;
      found.push({ url: canonicalUrl(post.link, origin), via: 'rest-api', rest: post });
    }
    log(`  rest-api page ${page}: ${batch.length} post(s)`);
    if (batch.length < 100) break;
    page++;
    if (page > 100) break;
  }
  return found;
}

/* -------------------------------------------------------------- 2. Sitemap */

const SITEMAP_CANDIDATES = [
  '/wp-sitemap.xml',
  '/sitemap_index.xml',
  '/sitemap.xml',
  '/post-sitemap.xml',
];

export async function discoverViaSitemap(fetcher, archiveUrl, { log = () => {} } = {}) {
  const origin = new URL(archiveUrl).origin;
  const seen = new Set();
  const posts = [];

  const readSitemap = async (url, depth = 0) => {
    if (depth > 3 || seen.has(url)) return;
    seen.add(url);
    let body;
    try {
      ({ body } = await fetcher.text(url));
    } catch {
      return;
    }
    const isIndex = /<sitemapindex/i.test(body);
    const locs = [...body.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) =>
      decodeEntities(m[1]),
    );
    if (isIndex) {
      for (const loc of locs) {
        // Only the sitemaps that can hold posts are worth opening.
        if (/(post|blog|article)/i.test(loc) || locs.length <= 4) await readSitemap(loc, depth + 1);
      }
      return;
    }
    for (const loc of locs) {
      const canonical = canonicalUrl(loc, origin);
      if (canonical && looksLikePost(canonical, archiveUrl)) {
        posts.push({ url: canonical, via: 'sitemap' });
      }
    }
    log(`  sitemap ${url}: ${locs.length} url(s)`);
  };

  for (const path of SITEMAP_CANDIDATES) {
    await readSitemap(`${origin}${path}`);
    if (posts.length) break;
  }
  return posts;
}

/* ------------------------------------------------- 3. Archive + pagination */

/** Anchor text or rel that means "the next page of the archive". */
function isPagerLink(node) {
  const label = text(node).toLowerCase();
  const rel = String(node.attrs.rel || '').toLowerCase();
  if (rel.includes('next')) return true;
  if (hasClass(node, 'next') || hasClass(node, 'nextpostslink')) return true;
  return /older (entries|posts)|next page|next\s*[»›→]|^[»›→]$/.test(label);
}

export async function discoverViaArchive(fetcher, archiveUrl, { log = () => {}, maxPages = 200 } = {}) {
  const origin = new URL(archiveUrl).origin;
  const posts = [];
  const seenPages = new Set();
  const seenPosts = new Set();
  let pageUrl = canonicalUrl(archiveUrl, origin);
  let pages = 0;

  while (pageUrl && !seenPages.has(pageUrl) && pages < maxPages) {
    seenPages.add(pageUrl);
    pages++;
    const { body, url: landed } = await fetcher.text(pageUrl);
    const doc = parse(body);

    // Prefer the links inside article/entry containers: on a Divi or stock
    // archive those are the post cards, and taking them first keeps sidebar
    // and footer links out of the result.
    const articles = findAllWhere(
      doc,
      (n) =>
        n.tag === 'article' ||
        hasClass(n, 'entry') ||
        hasClass(n, 'et_pb_post') ||
        hasClass(n, 'post'),
    );
    const scopes = articles.length ? articles : [doc];
    let before = posts.length;
    for (const scope of scopes) {
      for (const anchor of findAll(scope, 'a')) {
        const href = anchor.attrs.href;
        if (!href) continue;
        const canonical = canonicalUrl(href, landed || pageUrl);
        if (!canonical || seenPosts.has(canonical)) continue;
        if (!looksLikePost(canonical, archiveUrl)) continue;
        seenPosts.add(canonical);
        posts.push({ url: canonical, via: 'archive' });
      }
    }
    log(`  archive page ${pages}: ${posts.length - before} new post link(s) — ${pageUrl}`);

    const next = findAll(doc, 'a').find(isPagerLink);
    const nextUrl = next && next.attrs.href
      ? canonicalUrl(next.attrs.href, landed || pageUrl)
      : null;
    pageUrl = nextUrl && !seenPages.has(nextUrl) ? nextUrl : null;
  }

  return { posts, pages };
}

/* ----------------------------------------------------------------- combine */

/**
 * Run every available strategy and merge. A URL found by more than one keeps
 * the richest record (the REST payload, when there is one).
 */
export async function discoverAll(fetcher, archiveUrl, { log = () => {}, strategies } = {}) {
  const wanted = strategies && strategies.length ? strategies : ['rest-api', 'sitemap', 'archive'];
  const byUrl = new Map();
  const attempts = [];

  const record = (list) => {
    for (const item of list) {
      if (!item.url) continue;
      const existing = byUrl.get(item.url);
      if (!existing) byUrl.set(item.url, { ...item, via: [item.via] });
      else {
        existing.via.push(item.via);
        if (item.rest && !existing.rest) existing.rest = item.rest;
      }
    }
  };

  for (const strategy of wanted) {
    const started = Date.now();
    try {
      log(`discovery: ${strategy}`);
      if (strategy === 'rest-api') record(await discoverViaRestApi(fetcher, archiveUrl, { log }));
      else if (strategy === 'sitemap') record(await discoverViaSitemap(fetcher, archiveUrl, { log }));
      else if (strategy === 'archive') {
        const { posts, pages } = await discoverViaArchive(fetcher, archiveUrl, { log });
        record(posts);
        attempts.push({ strategy, ok: true, pages, ms: Date.now() - started });
        continue;
      }
      attempts.push({ strategy, ok: true, ms: Date.now() - started });
    } catch (err) {
      log(`  ${strategy} unavailable: ${err.message}`);
      attempts.push({ strategy, ok: false, reason: err.message, ms: Date.now() - started });
    }
  }

  const urls = [...byUrl.values()].filter((item) => looksLikePost(item.url, archiveUrl));
  return { urls, attempts };
}
