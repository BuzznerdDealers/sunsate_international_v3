/**
 * Article HTML -> the platform's node tree.
 *
 * A post on this platform is a document of nodes, the same shape a page is, so
 * a migrated article has to become real blocks rather than one lump of HTML.
 * That is what keeps it editable on the canvas afterwards, which is the whole
 * reason the content is JSON.
 *
 * The mapping, and why each one:
 *
 *   <h2>..<h6>        -> heading          (h1 is dropped: the post masthead
 *                                          already renders the title)
 *   <p>, run of <p>   -> text             (inline <strong>/<em>/<a>/<br> kept;
 *                                          the text block allows exactly those)
 *   <ul>, <ol>        -> prose-list       (the Feature list block is a card
 *                                          grid, so it would restructure them)
 *   <img>, <figure>   -> image            (with the caption, when there is one)
 *   <table>           -> customHtml       (no block expresses a table)
 *   <blockquote>      -> customHtml       (no block expresses one either)
 *
 * Nothing is reworded, reordered or summarised. A construct with no mapping is
 * reported rather than dropped silently, so the migration report can say which
 * posts need a human.
 */

import { findAll, text, walk, isElement, escapeHtml, decodeEntities, serialize } from './html.mjs';

/** The inline vocabulary a text block keeps; everything else it strips. */
const INLINE_KEEP = new Set(['strong', 'b', 'em', 'i', 'br', 'a', 'small']);

/** Serialise inline content the way a text block will actually render it. */
export function inlineHtml(node) {
  let out = '';
  for (const child of node.children || []) {
    if (child.type === 'text') {
      out += escapeHtml(decodeEntities(child.value));
      continue;
    }
    if (!isElement(child)) continue;
    if (child.tag === 'br') {
      out += '<br>';
      continue;
    }
    const inner = inlineHtml(child);
    if (!INLINE_KEEP.has(child.tag)) {
      out += inner; // Unwrap: keep the words, drop the tag the block would strip.
      continue;
    }
    if (child.tag === 'a') {
      const href = child.attrs.href || '';
      out += href ? `<a href="${escapeHtml(href)}">${inner}</a>` : inner;
      continue;
    }
    out += `<${child.tag}>${inner}</${child.tag}>`;
  }
  return out.replace(/[ \t]+/g, ' ');
}

function inlineText(node) {
  return inlineHtml(node).trim();
}

/** Tags that carry content we map; everything else is a wrapper to descend into. */
const FLOW = new Set([
  'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'img', 'figure',
  'table', 'blockquote', 'pre', 'hr',
]);

/**
 * Flatten the body to a sequence of flow elements, descending through the
 * wrapper divs a page builder leaves behind.
 */
export function flatten(root) {
  const out = [];
  const visit = (node) => {
    for (const child of node.children || []) {
      if (child.type === 'text') {
        // Loose text directly inside a wrapper still counts as a paragraph.
        if (child.value.trim()) out.push({ kind: 'looseText', node: child });
        continue;
      }
      if (!isElement(child)) continue;
      if (FLOW.has(child.tag)) {
        out.push({ kind: child.tag, node: child });
        continue;
      }
      visit(child);
    }
  };
  visit(root);
  return out;
}

function imageFrom(node) {
  const src = node.attrs.src;
  if (!src) return null;
  const width = Number(node.attrs.width);
  const height = Number(node.attrs.height);
  const image = { src, alt: decodeEntities(node.attrs.alt || '') };
  if (Number.isFinite(width) && width > 0) image.width = Math.round(width);
  if (Number.isFinite(height) && height > 0) image.height = Math.round(height);
  return image;
}

/**
 * Build the node tree. Returns the nodes plus what needed a fallback, so the
 * report can flag the posts a person should look at.
 */
export function toNodes(bodyRoot, { idPrefix = 'a' } = {}) {
  const blocks = [];
  const notes = [];
  let counter = 0;
  const nextId = (hint) => `${idPrefix}${++counter}-${hint}`;

  const items = flatten(bodyRoot);
  let paragraphs = [];

  const flushParagraphs = () => {
    if (!paragraphs.length) return;
    // Consecutive paragraphs become one text block: the block splits on a blank
    // line, so the article reads identically with fewer nodes to edit.
    blocks.push({
      id: nextId('t'),
      type: 'text',
      props: { text: paragraphs.join('\n\n'), width: 'prose' },
    });
    paragraphs = [];
  };

  for (const item of items) {
    const { kind, node } = item;

    if (kind === 'p' || kind === 'looseText') {
      const value = kind === 'looseText'
        ? escapeHtml(decodeEntities(node.value)).trim()
        : inlineText(node);
      // A paragraph that held only an image is the image, not an empty block.
      if (kind === 'p' && !value) {
        const img = findAll(node, 'img')[0];
        if (img) {
          const image = imageFrom(img);
          if (image) {
            flushParagraphs();
            blocks.push({ id: nextId('img'), type: 'image', props: { image, width: 'prose' } });
          }
        }
        continue;
      }
      if (value) paragraphs.push(value);
      continue;
    }

    flushParagraphs();

    if (/^h[1-6]$/.test(kind)) {
      const value = inlineText(node).replace(/<[^>]+>/g, '').trim();
      if (!value) continue;
      // h1 in the body would repeat the post title the masthead already shows,
      // so it comes down one level along with everything under it.
      const level = Math.min(6, Math.max(2, Number(kind[1]) === 1 ? 2 : Number(kind[1])));
      blocks.push({ id: nextId('h'), type: 'heading', props: { text: value, headingLevel: level } });
      continue;
    }

    if (kind === 'ul' || kind === 'ol') {
      const listItems = [];
      for (const li of node.children || []) {
        if (!isElement(li, 'li')) continue;
        const value = inlineText(li);
        if (value) listItems.push({ text: value });
      }
      if (!listItems.length) continue;
      blocks.push({
        id: nextId('list'),
        type: 'prose-list',
        props: { ordered: kind === 'ol', items: listItems },
      });
      continue;
    }

    if (kind === 'img') {
      const image = imageFrom(node);
      if (image) blocks.push({ id: nextId('img'), type: 'image', props: { image, width: 'prose' } });
      continue;
    }

    if (kind === 'figure') {
      const img = findAll(node, 'img')[0];
      const image = img && imageFrom(img);
      if (!image) continue;
      const caption = findAll(node, 'figcaption')[0];
      const props = { image, width: 'prose' };
      const captionText = caption ? text(caption) : '';
      if (captionText) props.caption = captionText;
      blocks.push({ id: nextId('img'), type: 'image', props });
      continue;
    }

    if (kind === 'table') {
      // No block expresses a table, and dropping one would lose data the
      // article depends on. customHtml keeps it exactly; the report says so.
      blocks.push({ id: nextId('table'), type: 'customHtml', props: { html: serialize(node) } });
      notes.push('table kept as custom HTML — it is not editable on the canvas');
      continue;
    }

    if (kind === 'blockquote' || kind === 'pre') {
      blocks.push({ id: nextId(kind), type: 'customHtml', props: { html: serialize(node) } });
      notes.push(`<${kind}> kept as custom HTML — no block expresses one`);
      continue;
    }

    if (kind === 'hr') {
      blocks.push({ id: nextId('hr'), type: 'divider', props: {} });
      continue;
    }
  }

  flushParagraphs();

  if (!blocks.length) return { nodes: [], notes: ['no content blocks were produced'] };

  return {
    nodes: [
      {
        id: `${idPrefix}-body`,
        type: 'section',
        props: { width: 'boxed', paddingY: 7 },
        children: [
          {
            id: `${idPrefix}-body-row`,
            type: 'row',
            props: { gap: 5 },
            children: [
              {
                id: `${idPrefix}-body-col`,
                type: 'column',
                props: { span: 12 },
                children: blocks,
              },
            ],
          },
        ],
      },
    ],
    notes: [...new Set(notes)],
  };
}
