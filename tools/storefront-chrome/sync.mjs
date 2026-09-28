// Copies the site chrome's styling into site/chrome/chrome.css for the storefront.
//
//   node tools/storefront-chrome/sync.mjs
//
// The storefront at /store draws this site's header and footer from
// /partials/header.html and /partials/footer.html, but its only stylesheet from
// this site is /partials/chrome.css, which is site/chrome/chrome.css plus the
// inventory template's `css` field. A brand page also carries three things
// inline that never reach it:
//
//   1. the site-wide Custom code CSS (site/custom-code.json)
//   2. the CSS of components the template places (the Site footer)
//   3. the node styles set on the template's header and footer nodes
//
// Without them /store shows the right markup unstyled. The platform build does
// not publish them yet, so this copies them in between the markers below. It is
// a copy: re-run it after editing the header, footer, template or Custom code,
// then rebuild. Brand pages inline the same rules later in the cascade, so the
// copy does not change how they look.

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseTemplates, resolveTemplate, componentCode, documentStyles } from '../../renderer/index.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SITE = join(ROOT, 'site');
const CHROME = join(SITE, 'chrome', 'chrome.css');
const BEGIN = '/* === BEGIN storefront chrome copy (tools/storefront-chrome/sync.mjs) — do not edit by hand === */';
const END = '/* === END storefront chrome copy === */';

const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));
const jsonIn = (dir) => readdirSync(dir).filter((f) => f.endsWith('.json'));

const sections = {};
for (const f of jsonIn(join(SITE, 'sections'))) {
  const entry = readJson(join(SITE, 'sections', f));
  const id = entry.id || f.replace(/\.json$/, '');
  sections[id] = { ...entry, id };
}
const templates = parseTemplates(
  Object.fromEntries(jsonIn(join(SITE, 'templates')).map((f) => [f, readJson(join(SITE, 'templates', f))])),
);
const template = resolveTemplate({ kind: 'inventory' }, templates).template;
if (!template) throw new Error('No template covers inventory pages; nothing to copy.');

const ctx = { sections };
const customCss = readJson(join(SITE, 'custom-code.json')).css || '';
const parts = [
  ['Site-wide Custom code CSS', customCss],
  [`Components placed by the "${template.name}" template`, componentCode([template.nodes], ctx).css],
  [`Node styles of the "${template.name}" template`, documentStyles([template.nodes], ctx)],
].filter(([, css]) => css && css.trim());

const block = [BEGIN, ...parts.map(([label, css]) => `/* --- ${label} --- */\n${css.trim()}`), END].join('\n\n');

const current = readFileSync(CHROME, 'utf8');
const start = current.indexOf(BEGIN);
const end = current.indexOf(END);
const base = start === -1 ? current.trimEnd() : current.slice(0, start).trimEnd();
const tail = start === -1 || end === -1 ? '' : current.slice(end + END.length).trim();
writeFileSync(CHROME, `${base}\n\n${block}\n${tail ? `\n${tail}\n` : ''}`);
console.log(`site/chrome/chrome.css: copied ${parts.map(([l, c]) => `${l} (${c.length} bytes)`).join(', ')}`);
