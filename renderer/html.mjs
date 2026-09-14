// HTML primitives shared by every block. Zero dependencies: this module is
// imported by the static Vercel build, by the dashboard canvas and by the
// Vendure plugin's validation pass, so it may not reach for a DOM or Node API.

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Escape text for interpolation into element content or a double-quoted attribute. */
export function esc(value) {
  if (value == null) return '';
  return String(value).replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

/**
 * Serialize an attribute map. `false`, `null` and `undefined` drop the
 * attribute entirely; `true` renders it bare.
 */
export function attrs(map) {
  const out = [];
  for (const [key, value] of Object.entries(map || {})) {
    if (value == null || value === false) continue;
    if (value === true) {
      out.push(key);
      continue;
    }
    out.push(`${key}="${esc(value)}"`);
  }
  return out.length ? ' ' + out.join(' ') : '';
}

/**
 * Analytics tagging attributes. Shift Digital browser-tag certification needs a
 * stable hook on exactly the elements the AI rewrites most often, so blocks emit
 * these structurally rather than relying on the model to remember them.
 */
export function tagAttrs(el, intent) {
  return { 'data-bz-el': el, 'data-bz-intent': intent || null };
}

/** A safe heading level. Blocks take the level as a prop so a page has one h1. */
export function heading(level, text, opts = {}) {
  const n = Math.min(6, Math.max(1, Number(level) || 2));
  if (!text) return '';
  return `<h${n}${attrs({ class: opts.class })}>${opts.raw ? text : esc(text)}</h${n}>`;
}

/**
 * An `<img>` that always carries the attributes the SEO floor requires. A block
 * with no image renders a labelled placeholder rather than a broken image, so a
 * page in progress still builds.
 */
export function image(img, opts = {}) {
  const src = img && typeof img === 'object' ? img.src : img;
  if (!src) {
    return `<div class="bz-photo bz-photo--empty"${attrs({ 'aria-hidden': 'true' })}>${esc(
      opts.placeholder || 'Photo',
    )}</div>`;
  }
  return `<img${attrs({
    src: resolveAssetUrl(src, opts.ctx),
    alt: (img && img.alt) || opts.alt || '',
    width: (img && img.width) || opts.width || 1200,
    height: (img && img.height) || opts.height || 800,
    loading: opts.eager ? 'eager' : 'lazy',
    decoding: opts.eager ? 'sync' : 'async',
    class: opts.class,
  })} />`;
}

/** Join rendered children, dropping empties. */
export function join(parts, sep = '\n') {
  return (parts || []).filter((p) => p != null && p !== '').join(sep);
}

/** `class` string built from truthy entries. */
export function cls(...names) {
  return names.filter(Boolean).join(' ');
}

/**
 * Serialize props into a single attribute the hydration client reads back.
 * Single-quoted JSON with escaped quotes, so the payload survives HTML parsing
 * without needing a second script tag per widget.
 */
export function jsonAttr(value) {
  return esc(JSON.stringify(value == null ? null : value));
}

/** Internal link, prefix-aware. External links get rel="noopener". */
export function href(url, ctx) {
  const raw = String(url || '#');
  if (/^(https?:|mailto:|tel:|#)/i.test(raw)) return raw;
  if (!raw.startsWith('/')) return raw;
  // The storefront prefix is preserved, never stripped: links authored as
  // /store/... stay /store/... so the Vercel rewrite hits the Remix mount.
  if (ctx && ctx.storefrontPrefix && raw === '/inventory') return `/${ctx.storefrontPrefix}`;
  return raw;
}

/** Is this URL off-site? */
export function isExternal(url) {
  return /^https?:/i.test(String(url || ''));
}

/**
 * A file the published site serves from `public/` — photos, icons, fonts.
 *
 * Root-relative on the live site (`/images/truck.jpg`) so Vercel can copy the
 * folder into `dist/` and the URL just works. In the dashboard those same
 * paths resolve against the admin origin and 404, which is why `assetBase`
 * exists: the editor prefixes them, the build does not.
 */
const ASSET_EXT = /\.(?:avif|bmp|eot|gif|ico|jpe?g|mp4|otf|png|svg|ttf|webm|webp|woff2?|pdf)(?:[?#]|$)/i;

export function isSiteAssetPath(path, ctx) {
  if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//')) return false;
  const prefix = `/${(ctx && ctx.storefrontPrefix) || 'store'}`;
  if (path === prefix || path.startsWith(`${prefix}/`)) return false;
  return ASSET_EXT.test(path);
}

/**
 * Prefix a site-relative asset so the dashboard can fetch it. Absolute, data,
 * and non-asset paths (a page link, `/store/…`) pass through unchanged. With
 * no `assetBase` this is the identity, which is what the Vercel build needs.
 */
export function resolveAssetUrl(src, ctx) {
  if (typeof src !== 'string' || !src) return src;
  if (!ctx || !ctx.assetBase) return src;
  if (!isSiteAssetPath(src, ctx)) return src;
  return `${String(ctx.assetBase).replace(/\/$/, '')}${src}`;
}

/**
 * Rewrite root-relative asset URLs inside already-rendered HTML or CSS.
 *
 * `image()` is not the only emitter: `@font-face`, node `background-image`,
 * custom widget CSS and `customHtml` all carry `/images/…` and `/fonts/…`
 * verbatim. One pass at the document boundary, rather than threading ctx
 * through every helper, is what keeps those working in the editor.
 */
export function rewriteAssetUrls(text, ctx) {
  if (text == null || text === '' || !ctx || !ctx.assetBase) return text;
  const input = String(text);
  const withCss = input.replace(/url\(\s*(['"]?)(\/[^"')\s]+)\1\s*\)/gi, (full, quote, path) => {
    const resolved = resolveAssetUrl(path, ctx);
    if (resolved === path) return full;
    return `url(${quote}${resolved}${quote})`;
  });
  return withCss.replace(
    /(\s(?:src|href|poster)\s*=\s*["'])(\/[^"']+)/gi,
    (_, prefix, path) => `${prefix}${resolveAssetUrl(path, ctx)}`,
  );
}
