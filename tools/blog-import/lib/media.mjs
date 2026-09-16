/**
 * Bringing the article's images across.
 *
 * The brief is explicit that the new site must not depend on the old site's
 * image URLs, and the reason is not tidiness: the old site is managed by
 * somebody else, and the day it is switched off every image in every migrated
 * post breaks at once. So every image is downloaded into this repo's own
 * public/ folder and the body is rewritten to point at the local copy.
 *
 * An image that cannot be fetched is reported, not invented. The post still
 * imports, the report names the image, and the body keeps the original URL so
 * a person can see what was meant to be there.
 */

import { mkdirSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { findAll, walk, isElement } from './html.mjs';

const EXT_BY_TYPE = {
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'image/avif': '.avif',
  'image/svg+xml': '.svg',
};

/** WordPress appends -400x250 to a resized copy; the bare name is the original. */
export function preferOriginal(url) {
  try {
    const parsed = new URL(url);
    parsed.pathname = parsed.pathname.replace(/-\d{2,4}x\d{2,4}(?=\.[a-z0-9]+$)/i, '');
    return parsed.toString();
  } catch {
    return url;
  }
}

export function localName(url, contentType = '') {
  let base = 'image';
  let ext = '';
  try {
    const path = new URL(url).pathname;
    let last = path.split('/').filter(Boolean).pop() || '';
    // %20 and friends are part of the filename, not characters to slugify.
    try {
      last = decodeURIComponent(last);
    } catch {
      /* a malformed escape stays as it is */
    }
    const dot = last.lastIndexOf('.');
    if (dot > 0) {
      base = last.slice(0, dot);
      ext = last.slice(dot).toLowerCase();
    } else if (last) {
      base = last;
    }
  } catch {
    /* fall through to the defaults */
  }
  if (!/^\.(jpe?g|png|gif|webp|avif|svg)$/i.test(ext)) {
    ext = EXT_BY_TYPE[String(contentType).split(';')[0].trim().toLowerCase()] || '.jpg';
  }
  base = base.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
  if (!base) base = 'image';
  // A short hash of the full URL keeps two different images that happen to
  // share a filename from overwriting each other.
  const stamp = createHash('sha1').update(url).digest('hex').slice(0, 6);
  return `${base}-${stamp}${ext}`;
}

const MAX_BYTES = 12 * 1024 * 1024;

/**
 * Download every image for one post and rewrite the body to the local copies.
 * Returns what was saved, what was already there and what could not be had.
 */
export async function localiseImages({
  fetcher,
  post,
  publicDir,
  publicPrefix = '/img/blog',
  slug,
  dryRun = false,
  log = () => {},
}) {
  const saved = [];
  const missing = [];
  const map = new Map();

  const sources = new Set();
  if (post.featuredImage) sources.add(post.featuredImage);
  for (const img of post.images) sources.add(img.src);

  for (const src of sources) {
    // Ask for the full-size original first; a theme thumbnail is a crop.
    const candidates = [...new Set([preferOriginal(src), src])];
    let stored = null;
    let reason = '';

    for (const candidate of candidates) {
      try {
        const res = await fetcher.binary(candidate);
        if (!res.body || !res.body.length) {
          reason = 'empty response';
          continue;
        }
        if (res.body.length > MAX_BYTES) {
          reason = `image is ${(res.body.length / 1048576).toFixed(1)}MB, over the ${
            MAX_BYTES / 1048576
          }MB limit`;
          continue;
        }
        if (!/^image\//i.test(res.contentType) && !/\.(jpe?g|png|gif|webp|avif|svg)$/i.test(candidate)) {
          reason = `not an image (${res.contentType || 'unknown type'})`;
          continue;
        }
        const name = localName(candidate, res.contentType);
        const dir = join(publicDir, slug);
        const file = join(dir, name);
        const publicPath = `${publicPrefix}/${slug}/${name}`;
        if (!dryRun) {
          mkdirSync(dir, { recursive: true });
          // Re-running a migration should not rewrite bytes that are already
          // on disk and identical.
          if (!existsSync(file) || statSync(file).size !== res.body.length) {
            writeFileSync(file, res.body);
          }
        }
        stored = { source: src, fetched: candidate, path: publicPath, bytes: res.body.length };
        break;
      } catch (err) {
        reason = err.message;
      }
    }

    if (stored) {
      saved.push(stored);
      map.set(src, stored.path);
      log(`    image ok  ${stored.path} (${(stored.bytes / 1024).toFixed(0)}KB)`);
    } else {
      missing.push({ source: src, reason: reason || 'could not be downloaded' });
      log(`    image MISSING ${src} — ${reason}`);
    }
  }

  // Rewrite the body in place. An image that failed keeps its original URL so
  // the gap is visible rather than silent.
  for (const node of walk(post.bodyRoot)) {
    if (!isElement(node, 'img')) continue;
    const local = map.get(node.attrs.src);
    if (local) node.attrs.src = local;
  }

  return {
    saved,
    missing,
    featuredLocal: post.featuredImage ? map.get(post.featuredImage) || null : null,
    map,
  };
}
