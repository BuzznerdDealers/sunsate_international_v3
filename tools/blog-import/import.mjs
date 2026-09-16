#!/usr/bin/env node
/**
 * Blog migration — public website to this repo's Blog system.
 *
 * Reads a live WordPress blog over HTTP, the way any visitor does, and writes
 * each post into site/blog/posts/ as a draft. It never signs in anywhere,
 * never touches the source site with anything but GET, and never publishes.
 *
 *   node tools/blog-import/import.mjs --test           # 3 posts, full detail
 *   node tools/blog-import/import.mjs --all            # the whole archive
 *   node tools/blog-import/import.mjs --retry          # only what failed
 *   node tools/blog-import/import.mjs --all --dry-run  # extract, write nothing
 *
 * The full run is gated: --all refuses to start until a --test run has passed,
 * because a migration that gets the body selector wrong is far cheaper to find
 * out about over three posts than over ninety.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Fetcher, describeNetworkError } from './lib/http.mjs';
import { discoverAll, canonicalUrl } from './lib/discover.mjs';
import { extractPost } from './lib/extract.mjs';
import { toNodes } from './lib/blocks.mjs';
import { localiseImages } from './lib/media.mjs';
import {
  readExistingPosts, buildRecord, writePost, safeSlug, draftUrl,
} from './lib/store.mjs';
import { emptyReport, writeReport, readReport, summarise } from './lib/report.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..');

const DEFAULTS = {
  archiveUrl: 'https://www.sunstateintl.com/blogs/',
  postsDir: join(REPO, 'site', 'blog', 'posts'),
  publicDir: join(REPO, 'public', 'img', 'blog'),
  publicPrefix: '/img/blog',
  workDir: join(REPO, 'tools', 'blog-import', '.work'),
  testCount: 3,
  delayMs: 750,
};

function parseArgs(argv) {
  const args = {
    mode: null,
    dryRun: false,
    overwriteStubs: false,
    refresh: false,
    noCache: false,
    limit: null,
    url: DEFAULTS.archiveUrl,
    delayMs: DEFAULTS.delayMs,
    strategies: null,
    testCount: DEFAULTS.testCount,
    postsDir: null,
    publicDir: null,
    workDir: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const value = () => argv[++i];
    if (arg === '--test') args.mode = 'test';
    else if (arg === '--all') args.mode = 'all';
    else if (arg === '--retry') args.mode = 'retry';
    else if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--overwrite-stubs') args.overwriteStubs = true;
    else if (arg === '--refresh') args.refresh = true;
    else if (arg === '--no-cache') args.noCache = true;
    else if (arg === '--url') args.url = value();
    else if (arg === '--limit') args.limit = Number(value());
    else if (arg === '--test-count') args.testCount = Number(value());
    else if (arg === '--delay') args.delayMs = Number(value());
    else if (arg === '--strategies') args.strategies = String(value()).split(',').map((s) => s.trim());
    else if (arg === '--posts-dir') args.postsDir = resolve(value());
    else if (arg === '--public-dir') args.publicDir = resolve(value());
    else if (arg === '--work-dir') args.workDir = resolve(value());
    else if (arg === '--help' || arg === '-h') args.mode = 'help';
    else throw new Error(`unknown option ${arg}`);
  }
  return args;
}

const HELP = `Blog migration — public website to this repo's Blog system.

  --test                  Import ${DEFAULTS.testCount} posts and print the full before/after for each.
                          Must pass before --all will run.
  --all                   Import the whole archive.
  --retry                 Re-attempt only the posts that failed in the last run.
  --dry-run               Do everything except write posts and images.
  --refresh               Re-import posts already imported, updating them.
  --overwrite-stubs       Replace existing posts this tool did not create.
  --url <archive>         Source archive page. Default: ${DEFAULTS.archiveUrl}
  --limit <n>             Stop after n posts.
  --test-count <n>        How many posts --test imports. Default: ${DEFAULTS.testCount}
  --delay <ms>            Pause between requests to the source. Default: ${DEFAULTS.delayMs}
  --strategies a,b,c      Discovery strategies: rest-api, sitemap, archive.
  --no-cache              Ignore the on-disk response cache.
  --posts-dir <path>      Where post records are written. Default: site/blog/posts
  --public-dir <path>     Where images are written. Default: public/img/blog
  --work-dir <path>       Cache, gate and report.json. Default: tools/blog-import/.work

The source site is only ever read: GET and HEAD, robots.txt honoured, one
request at a time. Imported posts are always drafts.
`;

const log = (msg = '') => process.stdout.write(`${msg}\n`);

function truncate(value, n) {
  const text = String(value ?? '');
  return text.length > n ? `${text.slice(0, n - 1)}…` : text;
}

/* --------------------------------------------------------------- one post */

async function importOne({ url, rest, fetcher, options, existing, report }) {
  let post;
  try {
    const page = await fetcher.text(url);
    post = extractPost({ url, html: page.body, rest });
  } catch (err) {
    const reason = err.status
      ? `could not be fetched (HTTP ${err.status})`
      : describeNetworkError(err, url);
    report.failed.push({ sourceUrl: url, title: null, reason });
    return { outcome: 'failed', reason };
  }

  if (!post.title) {
    const reason = 'no title could be found on the page';
    report.failed.push({ sourceUrl: url, title: null, reason });
    return { outcome: 'failed', reason };
  }

  const slug = safeSlug(post.slug, post.title);

  const images = await localiseImages({
    fetcher,
    post,
    publicDir: options.publicDir,
    publicPrefix: options.publicPrefix,
    slug,
    dryRun: options.dryRun,
    log: options.verbose ? log : () => {},
  });

  const { nodes, notes } = toNodes(post.bodyRoot, { idPrefix: 'a' });

  if (!nodes.length) {
    const reason = 'no article content could be extracted from the page';
    report.failed.push({ sourceUrl: url, title: post.title, reason });
    report.missingContent.push({ sourceUrl: url, title: post.title, reason });
    return { outcome: 'failed', reason, post };
  }

  const record = buildRecord({
    post,
    nodes,
    slug,
    featuredLocal: images.featuredLocal,
    images,
    status: 'draft',
  });

  const result = writePost({
    post,
    record,
    postsDir: options.postsDir,
    existing,
    overwriteStubs: options.overwriteStubs,
    refresh: options.refresh,
    dryRun: options.dryRun,
  });

  const entry = {
    sourceUrl: post.sourceUrl,
    slug: result.slug,
    file: result.file,
    title: post.title,
    date: post.date,
    category: post.category,
    author: post.author || null,
    draftUrl: draftUrl(result.slug),
    blocks: nodes[0].children[0].children[0].children.length,
    images: images.saved.length,
    extractedVia: post.extractedVia,
    detail: result.detail,
  };

  if (result.outcome === 'duplicate') {
    report.duplicates.push({ ...entry, detail: result.detail });
    return { outcome: 'duplicate', post, record, result };
  }
  if (result.outcome === 'conflict') {
    report.conflicts.push({ ...entry, detail: result.detail });
    report.needsReview.push({
      slug: result.slug,
      sourceUrl: post.sourceUrl,
      reason: result.detail,
    });
    return { outcome: 'conflict', post, record, result };
  }

  if (result.outcome === 'updated') report.updated.push(entry);
  else report.imported.push(entry);

  // Record everything a person should look at, but that did not stop the import.
  if (images.missing.length) {
    report.missingImages.push({ slug: result.slug, sourceUrl: url, images: images.missing });
  }
  if (!post.date) {
    report.needsReview.push({ slug: result.slug, sourceUrl: url, reason: 'no publication date found' });
  }
  if (!post.category) {
    report.needsReview.push({ slug: result.slug, sourceUrl: url, reason: 'no category found' });
  }
  if (post.bodyTextLength < 400) {
    report.needsReview.push({
      slug: result.slug,
      sourceUrl: url,
      reason: `article body is short (${post.bodyTextLength} characters) — check the extraction`,
    });
  }
  for (const note of notes) {
    report.needsReview.push({ slug: result.slug, sourceUrl: url, reason: note });
  }
  if (result.replaced) {
    report.needsReview.push({ slug: result.slug, sourceUrl: url, reason: result.detail });
  }

  return { outcome: result.outcome, post, record, result, images, nodes };
}

/* ---------------------------------------------------------- test-run detail */

function printTestDetail(index, { post, record, result, images, nodes }) {
  const blocks = nodes[0].children[0].children[0].children;
  log('');
  log(`${'═'.repeat(78)}`);
  log(`TEST POST ${index}`);
  log(`${'═'.repeat(78)}`);
  log('');
  log('SOURCE');
  log(`  Old blog URL      ${post.sourceUrl}`);
  log('');
  log('EXTRACTED');
  log(`  Title             ${post.title}`);
  log(`  Date              ${post.date || '(none found)'}`);
  log(`  Category          ${post.category || '(none found)'}`);
  log(`  Author            ${post.author || '(none found)'}`);
  log(`  Slug              ${post.slug}`);
  log(`  Meta title        ${truncate(post.metaTitle, 66) || '(none)'}`);
  log(`  Meta description  ${truncate(post.metaDescription, 66) || '(none)'}`);
  log(`  Extracted via     ${post.extractedVia}`);
  log(`  Body              ${post.bodyTextLength} characters of text`);
  log(`  Chrome removed    ${post.removedChrome.length} element(s): ${
    truncate(post.removedChrome.map((r) => r.class || r.id || r.tag).join(', '), 60) || '—'
  }`);
  log(`  Images found      ${post.images.length} in body${
    post.featuredImage ? ' + 1 featured' : ''
  }`);
  for (const img of post.images.slice(0, 6)) log(`                    ${img.src}`);
  log(`  Links found       ${post.links.length}`);
  log('');
  log('  Content (first 400 characters of the extracted body):');
  for (const line of wrap(stripTags(post.bodyHtml), 72)) log(`    ${line}`);
  log('');
  log('NEW');
  log(`  Record            site/blog/posts/${result.file}`);
  log(`  Status            ${record.status}  (not on the live site until published)`);
  log(`  Draft URL         ${draftUrl(result.slug)}  (once published)`);
  log(`  Imported title    ${record.title}`);
  log(`  Imported date     ${record.date}`);
  log(`  Imported category ${record.topic || '—'}`);
  log(`  Cover image       ${record.coverImage || '—'}`);
  log(`  Imported content  ${blocks.length} block(s):`);
  for (const block of blocks) {
    log(`                    ${block.type.padEnd(11)} ${truncate(blockPreview(block), 50)}`);
  }
  log(`  Imported images   ${images.saved.length} copied into public${DEFAULTS.publicPrefix}/${result.slug}/`);
  for (const img of images.saved) log(`                    ${img.path}`);
  if (images.missing.length) {
    log(`  MISSING images    ${images.missing.length}`);
    for (const img of images.missing) log(`                    ${img.source} — ${img.reason}`);
  }
}

function blockPreview(block) {
  const p = block.props || {};
  if (p.text) return stripTags(p.text);
  if (p.items) return p.items.map((i) => stripTags(i.text || i.label || '')).join(' · ');
  if (p.image) return p.image.src;
  if (p.html) return stripTags(p.html);
  return '';
}

function stripTags(html) {
  return String(html).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function wrap(text, width, max = 400) {
  const clipped = text.length > max ? `${text.slice(0, max)}…` : text;
  const lines = [];
  let line = '';
  for (const word of clipped.split(/\s+/)) {
    if ((line + word).length > width) {
      lines.push(line.trimEnd());
      line = '';
    }
    line += `${word} `;
  }
  if (line.trim()) lines.push(line.trimEnd());
  return lines;
}

/* -------------------------------------------------------------------- main */

async function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    log(`${err.message}\n\n${HELP}`);
    process.exit(2);
  }
  if (!args.mode || args.mode === 'help') {
    log(HELP);
    process.exit(args.mode ? 0 : 2);
  }

  const options = {
    ...DEFAULTS,
    postsDir: args.postsDir || DEFAULTS.postsDir,
    publicDir: args.publicDir || DEFAULTS.publicDir,
    workDir: args.workDir || DEFAULTS.workDir,
    dryRun: args.dryRun,
    overwriteStubs: args.overwriteStubs,
    refresh: args.refresh,
    verbose: args.mode === 'test',
  };
  const archiveUrl = canonicalUrl(args.url, args.url) || args.url;
  const gatePath = join(options.workDir, 'test-passed.json');
  const reportJson = join(options.workDir, 'report.json');
  const reportMd = args.workDir
    ? join(options.workDir, 'migration-report.md')
    : join(REPO, 'tools', 'blog-import', 'migration-report.md');

  if (args.noCache && existsSync(join(options.workDir, 'cache'))) {
    rmSync(join(options.workDir, 'cache'), { recursive: true, force: true });
  }

  // The gate. A full migration is a lot of writes; it waits for a passing test.
  if (args.mode === 'all') {
    const gate = existsSync(gatePath) ? JSON.parse(readFileSync(gatePath, 'utf8')) : null;
    if (!gate || gate.archiveUrl !== archiveUrl || !gate.passed) {
      log('');
      log('  The full migration is gated behind a passing test import.');
      log('');
      log(`  Run this first:   node tools/blog-import/import.mjs --test --url ${archiveUrl}`);
      log('  Check the three posts it prints, then re-run with --all.');
      log('');
      process.exit(3);
    }
    log(`Test import passed at ${gate.at} — proceeding with the full archive.`);
  }

  const fetcher = new Fetcher({
    delayMs: args.delayMs,
    cacheDir: join(options.workDir, 'cache'),
    log,
  });

  const report = emptyReport({ archiveUrl, mode: args.mode });
  const existing = readExistingPosts(options.postsDir);

  /* ---- what are we importing? ---- */

  let targets = [];
  if (args.mode === 'retry') {
    const previous = readReport(reportJson);
    if (!previous || !previous.failed.length) {
      log('Nothing to retry: the last report has no failed imports.');
      process.exit(0);
    }
    targets = previous.failed.map((f) => ({ url: f.sourceUrl, rest: null, via: ['retry'] }));
    report.discovery.attempts.push({ strategy: 'retry', ok: true });
    log(`Retrying ${targets.length} failed import(s) from the last run.`);
  } else {
    log(`Discovering posts from ${archiveUrl}`);
    let discovery;
    try {
      discovery = await discoverAll(fetcher, archiveUrl, { log, strategies: args.strategies });
    } catch (err) {
      log('');
      log(`  Discovery failed: ${describeNetworkError(err, archiveUrl)}`);
      log('');
      process.exit(4);
    }
    report.discovery.attempts = discovery.attempts;
    targets = discovery.urls;
    if (!targets.length) {
      log('');
      log('  No posts were discovered.');
      for (const attempt of discovery.attempts) {
        log(`    ${attempt.strategy}: ${attempt.ok ? 'no posts' : attempt.reason}`);
      }
      log('');
      writeReport(report, { jsonPath: reportJson, mdPath: reportMd });
      process.exit(5);
    }
  }

  report.discovery.discovered = targets.length;
  report.discovery.urls = targets.map((t) => t.url);
  log('');
  log(`Discovered ${targets.length} blog post URL(s).`);

  const limit = args.mode === 'test' ? args.testCount : args.limit || targets.length;
  const slice = targets.slice(0, limit);
  log(`Importing ${slice.length}${args.dryRun ? ' (dry run — nothing will be written)' : ''}.`);

  /* ---- import ---- */

  let index = 0;
  for (const target of slice) {
    index++;
    if (args.mode !== 'test') log(`  [${index}/${slice.length}] ${target.url}`);
    const outcome = await importOne({
      url: target.url,
      rest: target.rest || null,
      fetcher,
      options,
      existing,
      report,
    });
    if (args.mode === 'test') {
      if (outcome.outcome === 'failed') {
        log('');
        log(`TEST POST ${index} FAILED — ${target.url}`);
        log(`  ${outcome.reason}`);
      } else if (outcome.outcome === 'duplicate' || outcome.outcome === 'conflict') {
        log('');
        log(`TEST POST ${index} SKIPPED — ${target.url}`);
        log(`  ${outcome.result.detail}`);
      } else {
        printTestDetail(index, outcome);
      }
    } else if (outcome.outcome !== 'imported' && outcome.outcome !== 'updated') {
      log(`        ${outcome.outcome}: ${outcome.reason || outcome.result?.detail || ''}`);
    }
  }

  /* ---- report ---- */

  report.stats.requests = fetcher.stats.requests;
  report.stats.cacheHits = fetcher.stats.cacheHits;
  writeReport(report, { jsonPath: reportJson, mdPath: reportMd });
  const s = summarise(report);

  log('');
  log('─'.repeat(78));
  log('MIGRATION REPORT');
  log('─'.repeat(78));
  log(`  Blog URLs discovered           ${s.discovered}`);
  log(`  Successfully imported          ${s.imported}`);
  if (s.updated) log(`  Updated                        ${s.updated}`);
  log(`  Failed imports                 ${s.failed}`);
  log(`  Duplicate posts                ${s.duplicates}`);
  log(`  Slug conflicts (untouched)     ${s.conflicts}`);
  log(`  Missing images                 ${s.missingImages} across ${s.postsWithMissingImages} post(s)`);
  log(`  Missing content                ${s.missingContent}`);
  log(`  Requiring manual review        ${s.needsReview}`);
  log('');
  for (const failure of report.failed) {
    log(`  FAILED  ${failure.sourceUrl}`);
    log(`          ${failure.title || '(no title)'}`);
    log(`          ${failure.reason}`);
  }
  if (report.failed.length) log(`\n  Retry them with:  node tools/blog-import/import.mjs --retry\n`);
  log(`  Full report: ${reportMd.replace(`${REPO}/`, '')}`);
  log('');

  /* ---- the gate ---- */

  if (args.mode === 'test') {
    const passed = s.imported + s.updated > 0 && s.failed === 0;
    mkdirSync(options.workDir, { recursive: true });
    writeFileSync(
      gatePath,
      `${JSON.stringify(
        { passed, archiveUrl, at: new Date().toISOString(), imported: s.imported, failed: s.failed },
        null,
        2,
      )}\n`,
    );
    if (passed) {
      log('  TEST IMPORT PASSED.');
      log('  Review the three drafts above, then run the full migration:');
      log(`    node tools/blog-import/import.mjs --all --url ${archiveUrl}`);
    } else {
      log('  TEST IMPORT DID NOT PASS — the full migration stays blocked.');
      log('  Fix what the report names above and run --test again.');
      process.exitCode = 1;
    }
    log('');
  }

  if (report.failed.length && args.mode !== 'test') process.exitCode = 1;
}

main().catch((err) => {
  log('');
  log(`  Migration stopped: ${err && err.stack ? err.stack : err}`);
  process.exit(1);
});
