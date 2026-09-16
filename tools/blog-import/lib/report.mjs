/**
 * The migration report.
 *
 * Written in two forms on every run: report.json, which the --retry pass reads
 * back so a failed import can be tried again without re-crawling anything, and
 * report.md, which is the thing a person actually reads.
 *
 * A failure is only useful if it says what to do about it, so every failed
 * entry carries the source URL, the title when one was recovered, and the
 * reason in plain words.
 */

import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';

export function emptyReport({ archiveUrl, mode }) {
  return {
    tool: 'blog-import',
    startedAt: new Date().toISOString(),
    finishedAt: null,
    archiveUrl,
    mode,
    discovery: { attempts: [], discovered: 0, urls: [] },
    imported: [],
    updated: [],
    failed: [],
    duplicates: [],
    conflicts: [],
    missingImages: [],
    missingContent: [],
    needsReview: [],
    stats: {},
  };
}

export function summarise(report) {
  return {
    discovered: report.discovery.discovered,
    imported: report.imported.length,
    updated: report.updated.length,
    failed: report.failed.length,
    duplicates: report.duplicates.length,
    conflicts: report.conflicts.length,
    postsWithMissingImages: report.missingImages.length,
    missingImages: report.missingImages.reduce((n, p) => n + p.images.length, 0),
    missingContent: report.missingContent.length,
    needsReview: report.needsReview.length,
  };
}

export function writeReport(report, { jsonPath, mdPath }) {
  report.finishedAt = new Date().toISOString();
  report.stats = { ...report.stats, ...summarise(report) };
  for (const path of [jsonPath, mdPath]) if (path) mkdirSync(dirname(path), { recursive: true });
  if (jsonPath) writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
  if (mdPath) writeFileSync(mdPath, renderMarkdown(report));
  return report;
}

export function readReport(path) {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

function table(rows, headers) {
  if (!rows.length) return '_None._\n';
  const esc = (v) => String(v ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
  const head = `| ${headers.join(' | ')} |`;
  const rule = `|${headers.map(() => '---').join('|')}|`;
  const body = rows.map((r) => `| ${r.map(esc).join(' | ')} |`).join('\n');
  return `${head}\n${rule}\n${body}\n`;
}

export function renderMarkdown(report) {
  const s = summarise(report);
  const lines = [];

  lines.push('# Blog migration report');
  lines.push('');
  lines.push(`- **Source archive:** ${report.archiveUrl}`);
  lines.push(`- **Mode:** ${report.mode}`);
  lines.push(`- **Started:** ${report.startedAt}`);
  lines.push(`- **Finished:** ${report.finishedAt}`);
  lines.push('');

  lines.push('## Totals');
  lines.push('');
  lines.push(
    table(
      [
        ['Blog URLs discovered', s.discovered],
        ['Successfully imported', s.imported],
        ['Updated (re-import with --refresh)', s.updated],
        ['Failed imports', s.failed],
        ['Duplicates skipped', s.duplicates],
        ['Slug conflicts left untouched', s.conflicts],
        ['Posts with missing images', `${s.postsWithMissingImages} (${s.missingImages} image(s))`],
        ['Posts with missing content', s.missingContent],
        ['Posts requiring manual review', s.needsReview],
      ],
      ['Measure', 'Count'],
    ),
  );

  lines.push('## Discovery');
  lines.push('');
  lines.push(
    table(
      report.discovery.attempts.map((a) => [
        a.strategy,
        a.ok ? 'ok' : 'unavailable',
        a.pages != null ? `${a.pages} page(s)` : '',
        a.reason || '',
      ]),
      ['Strategy', 'Result', 'Pages', 'Note'],
    ),
  );

  lines.push('## Imported');
  lines.push('');
  lines.push(
    table(
      report.imported.map((p) => [p.title, p.slug, p.date, p.category || '—', p.draftUrl]),
      ['Title', 'Slug', 'Date', 'Category', 'Draft URL (once published)'],
    ),
  );

  lines.push('## Failed imports');
  lines.push('');
  lines.push(
    table(
      report.failed.map((f) => [f.sourceUrl, f.title || '—', f.reason]),
      ['Source URL', 'Title', 'Reason'],
    ),
  );
  if (report.failed.length) {
    lines.push('');
    lines.push('Retry just these, without re-crawling the archive:');
    lines.push('');
    lines.push('```bash');
    lines.push('npm run blog:import -- --retry');
    lines.push('```');
  }
  lines.push('');

  lines.push('## Duplicates skipped');
  lines.push('');
  lines.push(
    table(
      report.duplicates.map((d) => [d.sourceUrl, d.slug, d.detail]),
      ['Source URL', 'Existing post', 'Reason'],
    ),
  );

  lines.push('## Slug conflicts');
  lines.push('');
  lines.push(
    table(
      report.conflicts.map((c) => [c.sourceUrl, c.slug, c.detail]),
      ['Source URL', 'Slug', 'What happened'],
    ),
  );

  lines.push('## Missing images');
  lines.push('');
  lines.push(
    table(
      report.missingImages.flatMap((p) => p.images.map((i) => [p.slug, i.source, i.reason])),
      ['Post', 'Image URL', 'Reason'],
    ),
  );

  lines.push('## Missing content');
  lines.push('');
  lines.push(
    table(
      report.missingContent.map((m) => [m.sourceUrl, m.title || '—', m.reason]),
      ['Source URL', 'Title', 'Reason'],
    ),
  );

  lines.push('## Requiring manual review');
  lines.push('');
  lines.push(
    table(
      report.needsReview.map((r) => [r.slug || '—', r.sourceUrl, r.reason]),
      ['Post', 'Source URL', 'Why'],
    ),
  );

  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push(
    'Every imported post is a **draft**. `scripts/build.mjs` skips any post whose status is not '
    + '`published`, so nothing here is on the live site until somebody publishes it from '
    + 'Posts in the dashboard.',
  );
  lines.push('');

  return `${lines.join('\n')}\n`;
}
