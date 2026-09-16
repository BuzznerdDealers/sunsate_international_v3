/**
 * A very small HTML parser — enough to walk an article, not enough to render one.
 *
 * The repo has no dependencies and this tool keeps that promise, so this is a
 * tokenizer plus a tree builder rather than a wrapper around cheerio. It handles
 * what real WordPress output throws at a migration: void elements, unclosed <p>
 * and <li>, attributes with and without quotes, comments, <script>/<style>
 * bodies that must never be parsed as markup, and entities left alone until the
 * text is read out.
 *
 * It is deliberately forgiving. A migration that throws on the first malformed
 * tag migrates nothing; one that recovers gets the article and reports what it
 * could not read.
 */

const VOID = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr',
]);

/** Elements that implicitly close an open sibling of the same kind. */
const CLOSES_SELF = new Set(['p', 'li', 'dt', 'dd', 'option', 'tr', 'td', 'th', 'thead', 'tbody']);

const RAW_TEXT = new Set(['script', 'style', 'textarea', 'title']);

/** Block-level tags that implicitly close an open <p>, as a browser would. */
const CLOSES_P = new Set([
  'address', 'article', 'aside', 'blockquote', 'details', 'div', 'dl', 'fieldset',
  'figcaption', 'figure', 'footer', 'form', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'header', 'hr', 'main', 'nav', 'ol', 'p', 'pre', 'section', 'table', 'ul',
]);

const ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  ndash: '–', mdash: '—', hellip: '…', rsquo: '’',
  lsquo: '‘', ldquo: '“', rdquo: '”', middot: '·',
  bull: '•', copy: '©', reg: '®', trade: '™',
  deg: '°', eacute: 'é', times: '×', frac12: '½',
};

/** Decode the entities that actually turn up in body copy. */
export function decodeEntities(text) {
  return String(text).replace(/&(#x?[0-9a-f]+|[a-z][a-z0-9]*);/gi, (whole, body) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X'
        ? parseInt(body.slice(2), 16)
        : parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : whole;
    }
    const hit = ENTITIES[body.toLowerCase()];
    return hit === undefined ? whole : hit;
  });
}

function parseAttrs(source) {
  const attrs = {};
  const re = /([^\s"'=<>/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let m;
  while ((m = re.exec(source))) {
    const name = m[1].toLowerCase();
    const raw = m[2] ?? m[3] ?? m[4] ?? '';
    attrs[name] = decodeEntities(raw);
  }
  return attrs;
}

/**
 * Parse a document or fragment into a tree of
 * `{ type: 'element', tag, attrs, children }` and `{ type: 'text', value }`.
 */
export function parse(html) {
  const root = { type: 'element', tag: '#root', attrs: {}, children: [], parent: null };
  let open = root;
  const source = String(html ?? '');
  let i = 0;

  const push = (node) => {
    node.parent = open;
    open.children.push(node);
  };
  const addText = (value) => {
    if (value) push({ type: 'text', value, children: [] });
  };
  /** Walk up to the nearest ancestor with this tag, or stay put if there is none. */
  const closeTo = (tag) => {
    let node = open;
    while (node && node !== root) {
      if (node.tag === tag) return node.parent;
      node = node.parent;
    }
    return null;
  };

  while (i < source.length) {
    const lt = source.indexOf('<', i);
    if (lt === -1) {
      addText(source.slice(i));
      break;
    }
    addText(source.slice(i, lt));

    if (source.startsWith('<!--', lt)) {
      const end = source.indexOf('-->', lt + 4);
      i = end === -1 ? source.length : end + 3;
      continue;
    }
    if (source.startsWith('<!', lt) || source.startsWith('<?', lt)) {
      const end = source.indexOf('>', lt);
      i = end === -1 ? source.length : end + 1;
      continue;
    }

    const gt = source.indexOf('>', lt);
    if (gt === -1) {
      addText(source.slice(lt));
      break;
    }
    const inner = source.slice(lt + 1, gt);

    if (inner[0] === '/') {
      const tag = inner.slice(1).trim().toLowerCase();
      const parent = closeTo(tag);
      // A stray </div> with nothing open to match is dropped, not fatal.
      if (parent) open = parent;
      i = gt + 1;
      continue;
    }

    const selfClosing = inner.endsWith('/');
    const body = selfClosing ? inner.slice(0, -1) : inner;
    const space = body.search(/\s/);
    const tag = (space === -1 ? body : body.slice(0, space)).toLowerCase();
    if (!tag) {
      addText(source.slice(lt, gt + 1));
      i = gt + 1;
      continue;
    }
    const attrs = space === -1 ? {} : parseAttrs(body.slice(space));

    // <p>one<p>two — the first closes when the second opens.
    if (CLOSES_SELF.has(tag) && open.tag === tag) open = open.parent;
    // <p>one<ul>… — a block-level tag closes an open paragraph too, which is
    // what keeps a list out of the paragraph that precedes it.
    if (CLOSES_P.has(tag) && open.tag === 'p') open = open.parent;

    const node = { type: 'element', tag, attrs, children: [], parent: open };
    open.children.push(node);

    if (VOID.has(tag) || selfClosing) {
      i = gt + 1;
      continue;
    }

    if (RAW_TEXT.has(tag)) {
      // Everything up to the matching close tag is text, never markup — this is
      // what stops a `</div>` inside a tracking script from unbalancing the tree.
      const close = new RegExp(`</${tag}\\s*>`, 'i');
      const rest = source.slice(gt + 1);
      const hit = rest.match(close);
      const end = hit ? hit.index : rest.length;
      // The body is kept even for <script>: a post's JSON-LD lives in one and
      // is the most reliable source of its date, category and author. Nothing
      // executes it, and stripChrome removes every <script> from the article
      // before the body is serialised.
      node.children.push({ type: 'text', value: rest.slice(0, end), children: [], parent: node });
      i = gt + 1 + end + (hit ? hit[0].length : 0);
      continue;
    }

    open = node;
    i = gt + 1;
  }

  return root;
}

/** Depth-first walk, parents before children. */
export function* walk(node) {
  yield node;
  for (const child of node.children || []) yield* walk(child);
}

export function isElement(node, tag) {
  return node && node.type === 'element' && (!tag || node.tag === tag);
}

/** Every element with this tag, in document order. */
export function findAll(root, tag) {
  const out = [];
  for (const node of walk(root)) if (isElement(node, tag)) out.push(node);
  return out;
}

export function find(root, tag) {
  return findAll(root, tag)[0] || null;
}

export function classList(node) {
  return String((node.attrs && node.attrs.class) || '').trim().split(/\s+/).filter(Boolean);
}

export function hasClass(node, name) {
  return classList(node).includes(name);
}

/** First element matching a predicate, in document order. */
export function findWhere(root, test) {
  for (const node of walk(root)) if (isElement(node) && test(node)) return node;
  return null;
}

export function findAllWhere(root, test) {
  const out = [];
  for (const node of walk(root)) if (isElement(node) && test(node)) out.push(node);
  return out;
}

/** Visible text of a subtree, entities decoded and whitespace collapsed. */
export function text(node) {
  let out = '';
  for (const n of walk(node)) if (n.type === 'text') out += n.value;
  return decodeEntities(out).replace(/\s+/g, ' ').trim();
}

/** Remove a node from its parent. */
export function remove(node) {
  const siblings = node.parent && node.parent.children;
  if (!siblings) return;
  const at = siblings.indexOf(node);
  if (at !== -1) siblings.splice(at, 1);
}

const ESCAPE = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"]/g, (c) => ESCAPE[c]);
}

/** Serialise a subtree back to HTML. Used for the fragments kept verbatim. */
export function serialize(node) {
  if (node.type === 'text') return escapeHtml(decodeEntities(node.value));
  if (node.tag === '#root') return node.children.map(serialize).join('');
  const attrs = Object.entries(node.attrs || {})
    .map(([k, v]) => (v === '' ? ` ${k}` : ` ${k}="${escapeHtml(v)}"`))
    .join('');
  if (VOID.has(node.tag)) return `<${node.tag}${attrs}>`;
  return `<${node.tag}${attrs}>${node.children.map(serialize).join('')}</${node.tag}>`;
}
