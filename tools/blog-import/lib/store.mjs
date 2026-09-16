/**
 * Writing a migrated post into this site's Blog system, and refusing to write
 * it twice.
 *
 * A post here is site/blog/posts/<slug>.json. Two rules from the brief shape
 * everything below:
 *
 *  - Imports are DRAFTS. `status: "draft"` is not decoration: scripts/build.mjs
 *    skips any post whose status is not "published", so a draft is absent from
 *    the built site, the blog index, the sitemap and every postsList teaser
 *    until a person publishes it. Nothing is published by importing.
 *  - The same source URL is never imported twice. Each record carries a
 *    `migration` block naming where it came from, so a re-run recognises its
 *    own work rather than guessing from the slug.
 *
 * A file that exists WITHOUT that block is somebody else's — a hand-written
 * post, or one of the stubs this repo already had. Those are never overwritten
 * by default; they are reported for review.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

export const TOOL_ID = 'blog-import';

export function readExistingPosts(postsDir) {
  const bySlug = new Map();
  const bySourceUrl = new Map();
  if (!existsSync(postsDir)) return { bySlug, bySourceUrl };
  for (const file of readdirSync(postsDir)) {
    if (!file.endsWith('.json')) continue;
    let record;
    try {
      record = JSON.parse(readFileSync(join(postsDir, file), 'utf8'));
    } catch {
      continue;
    }
    const slug = record.slug || file.replace(/\.json$/, '');
    bySlug.set(slug, { file, record });
    const source = record.migration && record.migration.sourceUrl;
    if (source) bySourceUrl.set(source, { file, record, slug });
  }
  return { bySlug, bySourceUrl };
}

/** Content fingerprint, so a re-run can tell "already imported" from "changed". */
export function contentHash(post) {
  return createHash('sha256')
    .update([post.title, post.date, post.bodyHtml].join('\n--\n'))
    .digest('hex')
    .slice(0, 16);
}

/** A slug safe as a filename and as a URL segment. */
export function safeSlug(slug, title) {
  const base = String(slug || '')
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (base) return base.slice(0, 120);
  return (
    String(title || 'post')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 120) || 'post'
  );
}

/**
 * Build the post record. Everything the brief asks to preserve is kept on the
 * record itself; `migration` holds what only the migration cares about.
 */
export function buildRecord({ post, nodes, slug, featuredLocal, images, status = 'draft' }) {
  const record = {
    slug,
    title: post.title,
    date: post.date,
    description: post.excerpt || post.metaDescription || '',
    status,
    coverImage: featuredLocal || post.featuredImage || null,
    topic: post.category || '',
    nodes,
  };
  if (post.metaTitle) record.metaTitle = post.metaTitle;
  if (post.metaDescription) record.metaDescription = post.metaDescription;
  if (post.author) record.author = post.author;
  record.migration = {
    tool: TOOL_ID,
    sourceUrl: post.sourceUrl,
    sourceSlug: post.slug,
    importedAt: new Date().toISOString(),
    extractedVia: post.extractedVia,
    contentHash: contentHash(post),
    images: images.saved.map((i) => ({ from: i.source, to: i.path })),
    missingImages: images.missing,
    externalLinks: post.links.length,
  };
  return record;
}

/**
 * Decide what to do with one extracted post, and do it.
 * Returns { outcome, ... } where outcome is one of:
 *   imported | duplicate | conflict | updated | dry-run
 */
export function writePost({
  post,
  record,
  postsDir,
  existing,
  overwriteStubs = false,
  refresh = false,
  dryRun = false,
}) {
  const priorBySource = existing.bySourceUrl.get(post.sourceUrl);
  if (priorBySource && !refresh) {
    const changed = priorBySource.record.migration.contentHash !== record.migration.contentHash;
    return {
      outcome: 'duplicate',
      file: priorBySource.file,
      slug: priorBySource.slug,
      changed,
      detail: changed
        ? 'already imported from this URL, and the source has changed since — re-run with --refresh to update it'
        : 'already imported from this URL',
    };
  }

  const priorBySlug = existing.bySlug.get(record.slug);
  if (priorBySlug && !priorBySlug.record.migration && !overwriteStubs) {
    return {
      outcome: 'conflict',
      file: priorBySlug.file,
      slug: record.slug,
      detail:
        `site/blog/posts/${priorBySlug.file} already exists and was not created by this tool `
        + `(status: ${priorBySlug.record.status || 'published'}). Left untouched. `
        + 'Re-run with --overwrite-stubs to replace it with the migrated content.',
    };
  }

  const file = `${record.slug}.json`;
  if (!dryRun) {
    mkdirSync(postsDir, { recursive: true });
    writeFileSync(join(postsDir, file), `${JSON.stringify(record, null, 2)}\n`);
  }
  const replaced = Boolean(priorBySlug);
  return {
    outcome: dryRun ? 'dry-run' : replaced ? 'updated' : 'imported',
    file,
    slug: record.slug,
    replaced,
    detail: replaced
      ? `replaced the existing ${file} (it becomes a draft, so it leaves the live site until published)`
      : '',
  };
}

/** Where a draft will live once it is published. */
export function draftUrl(slug, { blogBasePath = '/blog/posts', siteUrl = '' } = {}) {
  return `${siteUrl}${blogBasePath}/${slug}`;
}
