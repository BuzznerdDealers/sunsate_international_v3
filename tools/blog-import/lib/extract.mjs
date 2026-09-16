/**
 * Turning one public post page into a record.
 *
 * Two sources, in order of trust:
 *
 *  1. The REST payload, when discovery got one. `content.rendered` is the post
 *     body exactly as the editor saved it — no theme chrome ever enters it, so
 *     nothing has to be stripped and nothing can be stripped by mistake.
 *  2. The rendered HTML page. Then the body has to be found inside a themed
 *     document, and everything the theme wrapped around it removed.
 *
 * Nothing here rewrites prose. Stripping removes whole elements that are not
 * the article — navigation, share bars, related-post widgets, scripts. The text
 * that survives is the text that was published.
 */

import {
  parse, findAll, findAllWhere, findWhere, find, text, hasClass,
  classList, remove, serialize, walk, isElement, decodeEntities,
} from './html.mjs';
import { canonicalUrl, slugFromUrl } from './discover.mjs';

/* ------------------------------------------------------------- page metadata */

function metaContent(doc, matcher) {
  for (const node of findAll(doc, 'meta')) {
    const name = (node.attrs.name || node.attrs.property || node.attrs.itemprop || '').toLowerCase();
    if (matcher(name)) return decodeEntities(node.attrs.content || '').trim();
  }
  return '';
}

function linkHref(doc, rel) {
  const node = findAll(doc, 'link').find(
    (n) => String(n.attrs.rel || '').toLowerCase().split(/\s+/).includes(rel),
  );
  return node ? node.attrs.href || '' : '';
}

/** Every JSON-LD block on the page, flattened out of any @graph. */
export function jsonLdNodes(doc) {
  const out = [];
  for (const node of findAll(doc, 'script')) {
    const type = String(node.attrs.type || '').toLowerCase();
    if (!type.includes('ld+json')) continue;
    const raw = node.children.map((c) => (c.type === 'text' ? c.value : '')).join('');
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      continue;
    }
    const queue = Array.isArray(parsed) ? [...parsed] : [parsed];
    while (queue.length) {
      const item = queue.shift();
      if (!item || typeof item !== 'object') continue;
      if (Array.isArray(item['@graph'])) queue.push(...item['@graph']);
      out.push(item);
    }
  }
  return out;
}

const ARTICLE_TYPES = /(BlogPosting|NewsArticle|Article|Report)/i;

function articleLd(doc) {
  return jsonLdNodes(doc).find((n) => {
    const type = n['@type'];
    const types = Array.isArray(type) ? type.join(' ') : String(type || '');
    return ARTICLE_TYPES.test(types);
  }) || null;
}

/* ------------------------------------------------------------ chrome removal */

/**
 * Whole elements that are never article content. Matched on tag, then on the
 * id/class vocabulary WordPress themes have converged on. Each entry removes a
 * subtree, so nothing is half-deleted.
 */
const DROP_TAGS = new Set([
  'script', 'style', 'noscript', 'iframe', 'header', 'footer', 'nav',
  'form', 'aside', 'template', 'svg', 'button', 'ins', 'dialog',
]);

const DROP_PATTERNS = [
  // Site chrome
  /^(site-)?(header|footer|nav|navigation|masthead|topbar|top-bar|menu)([-_]|$)/,
  /(^|[-_])(breadcrumb|skip-link|screen-reader-text|sr-only)([-_]|$)/,
  // Divi / Elementor / theme furniture
  /^et[-_](pb[-_])?(menu|top|header|footer|social|post[-_]meta[-_]bar)/,
  /^elementor-(location-header|location-footer)/,
  // Engagement widgets
  /(^|[-_])(share|sharing|social-share|addtoany|sharedaddy|jp-relatedposts)([-_]|$)/,
  /(^|[-_])(related|recommended|more-posts|you-may-also|prev-next|post-nav|pagination|pager)([-_]|$)/,
  /(^|[-_])(comment|comments|respond|reply-title|disqus)([-_]|$)/,
  /(^|[-_])(sidebar|widget-area|widget|secondary)([-_]|$)/,
  /(^|[-_])(author-(box|bio|info))([-_]|$)/,
  // Dealer / marketing furniture
  /(^|[-_])(cta-bar|contact-(bar|form|section|cta)|newsletter|subscribe|signup|optin)([-_]|$)/,
  /(^|[-_])(dealer|inventory|vehicle|showroom|hours|location)-(widget|module|bar|strip)([-_]|$)/,
  // Consent and advertising
  /(^|[-_])(cookie|consent|gdpr|ccpa)([-_]|$)/,
  /(^|[-_])(ad|ads|advert|advertisement|adsense|sponsor|promo-banner)([-_]|$)/,
  // Tracking pixels and tag managers
  /(^|[-_])(gtm|google-tag|analytics|pixel|tracking|hotjar|facebook-jssdk)([-_]|$)/,
];

function isChrome(node) {
  if (DROP_TAGS.has(node.tag)) return true;
  const tokens = [...classList(node), String(node.attrs.id || '')]
    .filter(Boolean)
    .map((t) => t.toLowerCase());
  if (tokens.some((t) => DROP_PATTERNS.some((re) => re.test(t)))) return true;
  if (node.attrs.role && /^(navigation|banner|contentinfo|complementary|search|dialog)$/i.test(node.attrs.role)) {
    return true;
  }
  if (node.attrs['aria-hidden'] === 'true' && !find(node, 'img')) return true;
  return false;
}

/** Remove the source site's chrome from a subtree, reporting what went. */
export function stripChrome(root) {
  const removed = [];
  let pass = 0;
  // Repeated passes: removing a wrapper can expose another one underneath.
  while (pass++ < 6) {
    const victim = findWhere(root, (n) => n !== root && isChrome(n));
    if (!victim) break;
    removed.push({
      tag: victim.tag,
      id: victim.attrs.id || null,
      class: victim.attrs.class || null,
    });
    remove(victim);
    if (removed.length > 400) break;
  }
  // A second sweep for tracking pixels that survive as bare images.
  for (const img of findAll(root, 'img')) {
    const src = img.attrs.src || img.attrs['data-src'] || '';
    if (/facebook\.com\/tr|google-analytics|doubleclick|\/pixel|1x1\.(gif|png)/i.test(src)) {
      removed.push({ tag: 'img', id: null, class: 'tracking-pixel' });
      remove(img);
    }
  }
  return removed;
}

/**
 * Attributes worth keeping. Everything else is the old theme's styling hooks,
 * its lazy-loader state and its analytics tagging — none of which means
 * anything on the new platform and all of which would follow the content
 * around forever if it were kept.
 */
const KEEP_ATTRS = {
  a: ['href', 'title'],
  img: ['src', 'alt', 'width', 'height'],
  th: ['colspan', 'rowspan', 'scope'],
  td: ['colspan', 'rowspan'],
  ol: ['start', 'type'],
  time: ['datetime'],
};

export function cleanAttributes(root) {
  for (const node of walk(root)) {
    if (!isElement(node) || node.tag === '#root') continue;
    const keep = KEEP_ATTRS[node.tag] || [];
    // A lazy-loaded image keeps its real source in a data- attribute; promote
    // it before the data- attributes are dropped, or the image is lost.
    if (node.tag === 'img') {
      const lazy = node.attrs['data-src'] || node.attrs['data-lazy-src'] || node.attrs['data-original'];
      if (lazy && (!node.attrs.src || /placeholder|blank|data:image/i.test(node.attrs.src))) {
        node.attrs.src = lazy;
      }
      if (!node.attrs.src && node.attrs.srcset) {
        node.attrs.src = String(node.attrs.srcset).split(',')[0].trim().split(/\s+/)[0];
      }
    }
    for (const name of Object.keys(node.attrs)) {
      if (!keep.includes(name)) delete node.attrs[name];
    }
  }
}

/* --------------------------------------------------------- finding the body */

const BODY_HINTS = [
  (n) => hasClass(n, 'entry-content'),
  (n) => hasClass(n, 'post-content'),
  (n) => hasClass(n, 'et_pb_post_content'),
  (n) => hasClass(n, 'elementor-widget-theme-post-content'),
  (n) => n.attrs.itemprop === 'articleBody',
  (n) => hasClass(n, 'article-body') || hasClass(n, 'article-content'),
  (n) => n.tag === 'article',
  (n) => n.tag === 'main',
];

/** Rough measure of how much prose a subtree holds, used to break ties. */
function proseWeight(node) {
  let score = 0;
  for (const p of findAll(node, 'p')) score += text(p).length;
  for (const tag of ['h2', 'h3', 'h4', 'ul', 'ol', 'table']) score += findAll(node, tag).length * 40;
  return score;
}

export function findArticleBody(doc) {
  for (const hint of BODY_HINTS) {
    const candidates = findAllWhere(doc, hint);
    if (!candidates.length) continue;
    const best = candidates.sort((a, b) => proseWeight(b) - proseWeight(a))[0];
    if (proseWeight(best) > 120) return best;
  }
  // Nothing matched a known container: take the densest block on the page.
  const blocks = findAllWhere(doc, (n) => ['div', 'section', 'article', 'main'].includes(n.tag));
  const best = blocks.sort((a, b) => proseWeight(b) - proseWeight(a))[0];
  return best && proseWeight(best) > 120 ? best : null;
}

/* ------------------------------------------------------------------ dates */

export function normaliseDate(value) {
  if (!value) return '';
  const raw = String(value).trim();
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    const y = parsed.getUTCFullYear();
    if (y > 1990 && y < 2100) {
      return `${y}-${String(parsed.getUTCMonth() + 1).padStart(2, '0')}-${String(
        parsed.getUTCDate(),
      ).padStart(2, '0')}`;
    }
  }
  return '';
}

function firstDate(doc, ld) {
  const candidates = [
    ld && ld.datePublished,
    metaContent(doc, (n) => n === 'article:published_time'),
    metaContent(doc, (n) => n === 'datepublished' || n === 'publishdate'),
  ];
  for (const node of findAll(doc, 'time')) {
    if (node.attrs.datetime) candidates.push(node.attrs.datetime);
  }
  for (const node of findAllWhere(doc, (n) => hasClass(n, 'published') || hasClass(n, 'entry-date'))) {
    candidates.push(node.attrs.datetime || text(node));
  }
  for (const candidate of candidates) {
    const date = normaliseDate(candidate);
    if (date) return date;
  }
  return '';
}

/* --------------------------------------------------------------- category */

function firstCategory(doc, ld) {
  if (ld && ld.articleSection) {
    return String(Array.isArray(ld.articleSection) ? ld.articleSection[0] : ld.articleSection).trim();
  }
  const tagged = metaContent(doc, (n) => n === 'article:section');
  if (tagged) return tagged;
  const link = findAllWhere(
    doc,
    (n) => n.tag === 'a' && /\/category\//i.test(String(n.attrs.href || '')),
  )[0];
  if (link) return text(link);
  const bodyClass = classList(find(doc, 'body') || { attrs: {} })
    .map((c) => c.match(/^category-(.+)$/))
    .find(Boolean);
  if (bodyClass) {
    return bodyClass[1].replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }
  return '';
}

/* ----------------------------------------------------------------- author */

function firstAuthor(doc, ld) {
  const fromLd = ld && ld.author;
  if (fromLd) {
    const one = Array.isArray(fromLd) ? fromLd[0] : fromLd;
    if (typeof one === 'string') return one;
    if (one && one.name) return String(one.name);
  }
  const meta = metaContent(doc, (n) => n === 'author' || n === 'article:author');
  if (meta && !/^https?:/i.test(meta)) return meta;
  const rel = findAllWhere(doc, (n) => n.tag === 'a' && /author/i.test(String(n.attrs.rel || '')))[0];
  if (rel) return text(rel);
  const byline = findAllWhere(doc, (n) => hasClass(n, 'author') || hasClass(n, 'byline'))[0];
  if (byline) return text(byline).replace(/^by\s+/i, '').trim();
  return '';
}

/* ------------------------------------------------------------------ images */

function featuredImage(doc, ld) {
  const candidates = [];
  if (ld && ld.image) {
    const one = Array.isArray(ld.image) ? ld.image[0] : ld.image;
    candidates.push(typeof one === 'string' ? one : one && one.url);
  }
  candidates.push(metaContent(doc, (n) => n === 'og:image' || n === 'twitter:image'));
  const wpImage = findAllWhere(doc, (n) => n.tag === 'img' && hasClass(n, 'wp-post-image'))[0];
  if (wpImage) candidates.push(wpImage.attrs.src || wpImage.attrs['data-src']);
  return candidates.find(Boolean) || '';
}

/* ------------------------------------------------------------- the record */

/**
 * Build the extracted record for one post.
 *
 * `rest` is the REST payload when discovery had one. The page HTML is still
 * read either way, because the meta title and description live in the document
 * head rather than in the post record.
 */
export function extractPost({ url, html, rest = null }) {
  const doc = parse(html);
  const ld = articleLd(doc);
  const warnings = [];

  const canonical = canonicalUrl(linkHref(doc, 'canonical') || url, url) || url;

  const title =
    (rest && rest.title && decodeEntities(stripTags(rest.title.rendered || ''))) ||
    (ld && typeof ld.headline === 'string' && ld.headline) ||
    text(find(doc, 'h1') || { children: [] }) ||
    metaContent(doc, (n) => n === 'og:title') ||
    '';

  const metaTitle = text(find(doc, 'title') || { children: [] });
  const metaDescription =
    metaContent(doc, (n) => n === 'description') ||
    metaContent(doc, (n) => n === 'og:description') ||
    '';

  const date = normaliseDate(rest && rest.date_gmt) || normaliseDate(rest && rest.date) || firstDate(doc, ld);
  if (!date) warnings.push('no publication date found');

  let category = '';
  if (rest && rest._embedded && Array.isArray(rest._embedded['wp:term'])) {
    const terms = rest._embedded['wp:term'].flat().filter((t) => t && t.taxonomy === 'category');
    const named = terms.find((t) => t.name && !/^uncategori[sz]ed$/i.test(t.name));
    if (named) category = named.name;
  }
  if (!category) category = firstCategory(doc, ld);

  let author = '';
  if (rest && rest._embedded && Array.isArray(rest._embedded.author)) {
    author = (rest._embedded.author[0] && rest._embedded.author[0].name) || '';
  }
  if (!author) author = firstAuthor(doc, ld);

  // The body: REST content is already chrome-free, so it is only cleaned.
  let bodyRoot;
  let source;
  if (rest && rest.content && typeof rest.content.rendered === 'string' && rest.content.rendered.trim()) {
    bodyRoot = parse(rest.content.rendered);
    source = 'rest-api';
  } else {
    const found = findArticleBody(doc);
    if (!found) {
      warnings.push('could not find the article body on the page');
      bodyRoot = parse('');
      source = 'none';
    } else {
      bodyRoot = found;
      source = 'page';
    }
  }

  const removedChrome = stripChrome(bodyRoot);
  // Relative hrefs and srcs mean nothing once the content has moved, so every
  // one is resolved against the post it came from before anything else reads
  // them. Images are localised later; links stay pointing at the source until
  // somebody decides where they should go on the new site.
  absolutise(bodyRoot, canonical);
  // The h1 belongs to the post record, not the body: the new platform renders
  // the title itself, so leaving it here would print it twice.
  for (const h1 of findAll(bodyRoot, 'h1')) remove(h1);
  cleanAttributes(bodyRoot);

  const images = [];
  for (const img of findAll(bodyRoot, 'img')) {
    const src = canonicalUrl(img.attrs.src || '', canonical);
    if (!src) continue;
    images.push({ src, alt: decodeEntities(img.attrs.alt || '') });
  }

  const links = [];
  for (const anchor of findAll(bodyRoot, 'a')) {
    const href = anchor.attrs.href;
    if (!href || /^(#|mailto:|tel:|javascript:)/i.test(href)) continue;
    const absolute = canonicalUrl(href, canonical);
    if (absolute) links.push({ href: absolute, text: text(anchor) });
  }

  const featured = canonicalUrl(featuredImage(doc, ld), canonical) || '';
  const bodyText = text(bodyRoot);
  if (bodyText.length < 200) warnings.push(`article body is only ${bodyText.length} characters`);

  const excerpt =
    (rest && rest.excerpt && decodeEntities(stripTags(rest.excerpt.rendered || '')).trim()) ||
    metaDescription ||
    firstParagraph(bodyRoot);

  return {
    sourceUrl: canonical,
    slug: (rest && rest.slug) || slugFromUrl(canonical),
    title: title.trim(),
    metaTitle,
    metaDescription,
    date,
    category,
    author,
    excerpt: excerpt.trim(),
    featuredImage: featured,
    images,
    links,
    bodyHtml: serialize(bodyRoot),
    bodyRoot,
    bodyTextLength: bodyText.length,
    extractedVia: source,
    removedChrome,
    warnings,
  };
}

/** Resolve every href and src in a subtree against the post's own URL. */
export function absolutise(root, base) {
  for (const node of walk(root)) {
    if (!isElement(node)) continue;
    if (node.tag === 'a' && node.attrs.href && !/^(#|mailto:|tel:)/i.test(node.attrs.href)) {
      const absolute = canonicalUrl(node.attrs.href, base);
      if (absolute) node.attrs.href = absolute;
    }
    if (node.tag === 'img' && node.attrs.src) {
      const absolute = canonicalUrl(node.attrs.src, base);
      if (absolute) node.attrs.src = absolute;
    }
  }
}

function stripTags(html) {
  return String(html).replace(/<[^>]*>/g, '');
}

function firstParagraph(root) {
  for (const p of findAll(root, 'p')) {
    const value = text(p);
    if (value.length > 60) return value.length > 300 ? `${value.slice(0, 297)}...` : value;
  }
  return '';
}
