// Live dealer data behind a designed list.
//
// A component's `list` prop takes typed rows, and `repeat` draws one node per
// row. That is the whole answer for a list the dealer authors — brand logos,
// perks, anything editorial. It is the wrong answer for the facts the platform
// already holds, because typed rows are a copy: the addresses go stale the day a
// rooftop moves and nothing says they have.
//
// The alternative on offer until now was a `widget` node, which is live and
// owns its own markup. So a dealer wanting live data got the platform's card,
// and a dealer wanting their card got dead data. Every site here has resolved
// that the same way — the widget rendered with its list hidden in CSS for the
// map alone, and the real tiles hand-fed from a typed list beside it.
//
// A data source closes that. The placement points a list prop at a source
// instead of typing rows, the platform resolves it on publish exactly as it
// resolves a widget's snapshot, and `repeat` draws the dealer's design over live
// rows. The design stays theirs; the facts stay the platform's.
//
// This catalogue is the contract. Vendure resolves `widget` and reads `path` out
// of the answer, so the `fields` below are the names a component may bind to and
// the two sides have to agree — the same coupling widget markup already has with
// its resolver, and `npm run schemas` carries it into the block catalogue.

/** The field an overlay row matches on, and the fields the source owns. */
export const DATA_SOURCES = [
  {
    id: 'locations',
    label: 'Locations',
    description:
      'Every active rooftop, from Admin → Locations. Opening a branch adds a card to every list built on this.',
    widget: 'locations-map',
    path: 'locations',
    match: 'slug',
    config: ['locationSlug', 'pagePathPrefix'],
    fields: [
      { key: 'id', type: 'text', label: 'Id' },
      { key: 'name', type: 'text', label: 'Name' },
      { key: 'slug', type: 'text', label: 'Slug' },
      { key: 'href', type: 'url', label: 'Page link' },
      { key: 'streetAddress', type: 'text', label: 'Street address' },
      { key: 'city', type: 'text', label: 'City' },
      { key: 'region', type: 'text', label: 'State / region' },
      { key: 'postalCode', type: 'text', label: 'Postal code' },
      { key: 'country', type: 'text', label: 'Country' },
      { key: 'latitude', type: 'number', label: 'Latitude' },
      { key: 'longitude', type: 'number', label: 'Longitude' },
      { key: 'phone', type: 'text', label: 'Phone' },
      { key: 'phoneUrl', type: 'url', label: 'Phone link' },
      { key: 'email', type: 'text', label: 'Email' },
      { key: 'mapUrl', type: 'url', label: 'Directions link' },
      // A card's pill rows. They read as editorial and are not: each one is a
      // dealer record on the location's own screens in Admin, so binding to
      // them is what stops "Curbside pickup" outliving the day it was true.
      // One string apiece, because a binding resolves to a scalar.
      { key: 'num', type: 'text', label: 'Position in the list' },
      { key: 'brands', type: 'text', label: 'Brands carried' },
      { key: 'services', type: 'text', label: 'Services offered' },
      { key: 'perks', type: 'text', label: 'Service options' },
      // Machine keys for a `filter` behaviour's data- attributes. Display copy
      // would only ever match a control's value by accident.
      { key: 'brandKeys', type: 'text', label: 'Brand keys (for filtering)' },
      { key: 'perkKeys', type: 'text', label: 'Service option keys (for filtering)' },
      { key: 'perk1', type: 'text', label: 'First service option' },
      { key: 'perk2', type: 'text', label: 'Second service option' },
      { key: 'perk3', type: 'text', label: 'Third service option' },
      { key: 'departments', type: 'text', label: 'Departments' },
      { key: 'hours', type: 'text', label: 'Opening hours' },
      { key: 'phone2', type: 'text', label: 'Second phone' },
      { key: 'phone2Url', type: 'url', label: 'Second phone link' },
      { key: 'phone3', type: 'text', label: 'Third phone' },
      { key: 'phone3Url', type: 'url', label: 'Third phone link' },
      // The rooftop's place in the organisation, for a design that sections or
      // filters branches by region. `group` is the name a dealer typed in Admin
      // for their own reasons, so it is published copy — `groupKey` is its slug,
      // for a `filter` behaviour's data- attributes.
      { key: 'group', type: 'text', label: 'Group' },
      { key: 'groupKey', type: 'text', label: 'Group key (for filtering)' },
      // Edited on Admin → Locations → the rooftop, not typed into a page: one
      // authored location page stands for every branch, so a photo on the page
      // would be the same photo on all of them.
      { key: 'photo', type: 'image', label: 'Photo' },
      // The same facts as `brands`, `services`, `perks`, `departments` and
      // `hours` above, kept as lists instead of joined into one string apiece.
      // Those stay, because sites are bound to them; reach for these whenever
      // the design wants tiles, pills, rows or a table rather than a sentence.
      {
        key: 'brandRows',
        type: 'list',
        label: 'Brands (one row each)',
        fields: [
          { key: 'name', type: 'text', label: 'Name' },
          { key: 'key', type: 'text', label: 'Filter value' },
        ],
      },
      {
        key: 'serviceRows',
        type: 'list',
        label: 'Services (one row each)',
        fields: [
          { key: 'name', type: 'text', label: 'Name' },
          { key: 'description', type: 'text', label: 'Description' },
        ],
      },
      {
        key: 'perkRows',
        type: 'list',
        label: 'Service options (one row each)',
        fields: [
          { key: 'label', type: 'text', label: 'Label' },
          { key: 'key', type: 'text', label: 'Filter value' },
        ],
      },
      {
        key: 'departmentRows',
        type: 'list',
        label: 'Departments (one row each)',
        fields: [
          { key: 'name', type: 'text', label: 'Name' },
          { key: 'key', type: 'text', label: 'Code' },
          { key: 'phone', type: 'text', label: 'Phone' },
          { key: 'phoneUrl', type: 'url', label: 'Phone link' },
          { key: 'email', type: 'text', label: 'Email' },
          { key: 'hours', type: 'text', label: 'Hours, summarised' },
        ],
      },
      // The nested one, and the reason nesting exists: a rooftop has departments
      // and a department has a week. All seven days are always present, closed
      // ones included — a table that skips Sunday misaligns against one that does
      // not, and "Closed" is the answer the buyer came for.
      {
        key: 'hoursRows',
        type: 'list',
        label: 'Opening hours, by department',
        fields: [
          { key: 'department', type: 'text', label: 'Department' },
          { key: 'key', type: 'text', label: 'Code' },
          { key: 'summary', type: 'text', label: 'Whole week, in one line' },
          {
            key: 'days',
            type: 'list',
            label: 'Days',
            fields: [
              { key: 'day', type: 'text', label: 'Day' },
              { key: 'hours', type: 'text', label: 'Open–close, or Closed' },
              { key: 'opensAt', type: 'text', label: 'Opens at' },
              { key: 'closesAt', type: 'text', label: 'Closes at' },
              { key: 'closed', type: 'boolean', label: 'Closed that day' },
            ],
          },
        ],
      },
    ],
  },
  // A filter bar's buttons. The rows a `filter` behaviour offers have to be the
  // facets the cards actually carry: a control for a marque nobody stocks hides
  // every card when pressed, which reads as a broken page rather than an empty
  // one, and nothing about a typed list says which of the two it is.
  {
    id: 'location-brands',
    label: 'Brands carried (filter options)',
    description:
      'One row per brand at least one rooftop carries, from Admin → Locations → Brands.',
    widget: 'locations-map',
    path: 'brandFacets',
    match: 'value',
    config: ['locationSlug'],
    fields: [
      { key: 'label', type: 'text', label: 'Label' },
      { key: 'value', type: 'text', label: 'Filter value' },
    ],
  },
  {
    id: 'location-service-options',
    label: 'Service options (filter options)',
    description:
      'One row per service option at least one rooftop offers, from Admin → Locations → Profile.',
    widget: 'locations-map',
    path: 'perkFacets',
    match: 'value',
    config: ['locationSlug'],
    fields: [
      { key: 'label', type: 'text', label: 'Label' },
      { key: 'value', type: 'text', label: 'Filter value' },
    ],
  },
  // The blog, as rows a design can repeat over.
  //
  // Unlike every source above it, this one is not Vendure's to answer: the posts
  // are files in this repo, already loaded and sorted by the time any node
  // renders. So it resolves locally, from the render context, and needs nothing
  // baked into the placement — a post published today is on the next build with
  // no publish round-trip. `local` is what says so.
  //
  // `postsList` covers the common teaser and will keep covering it. This exists
  // for the case that block cannot reach: a dealer's own card, with their topic
  // pill and their grid, over posts that are never a typed copy.
  {
    id: 'posts',
    label: 'Blog posts',
    description:
      'Every published post, newest first, from Posts. A post published in the dashboard joins the list on the next build.',
    local: true,
    match: 'slug',
    config: ['topic', 'limit'],
    fields: [
      { key: 'slug', type: 'text', label: 'Slug' },
      { key: 'title', type: 'text', label: 'Title' },
      { key: 'href', type: 'url', label: 'Post link' },
      // Two spellings of the same instant: one to print, one for <time> and for
      // sorting in a filter behaviour. A card that needs neither ignores both.
      { key: 'date', type: 'text', label: 'Date' },
      { key: 'dateISO', type: 'text', label: 'Date (machine readable)' },
      { key: 'excerpt', type: 'textarea', label: 'Excerpt' },
      // The post's own field, so the pill on a card and the post it belongs to
      // can no longer disagree. Edited on Posts, beside the title.
      { key: 'topic', type: 'text', label: 'Topic' },
      { key: 'topicKey', type: 'text', label: 'Topic (filter value)' },
      { key: 'coverImage', type: 'image', label: 'Cover image' },
    ],
  },
  // The chips above a post grid, for the same reason `location-brands` exists: a
  // control for a topic nothing carries hides every card when pressed, which
  // reads as a broken page. Typed chips also miss the topic a post introduces
  // tomorrow, silently — the staleness the cards themselves just stopped having.
  {
    id: 'post-topics',
    label: 'Post topics (filter options)',
    description: 'One row per topic at least one published post carries.',
    local: true,
    match: 'value',
    config: [],
    fields: [
      { key: 'label', type: 'text', label: 'Label' },
      { key: 'value', type: 'text', label: 'Filter value' },
    ],
  },
  {
    id: 'staff',
    label: 'Staff',
    description: 'Sales and service contacts, from the team directory.',
    widget: 'staff',
    path: 'staff',
    match: 'name',
    config: ['locationSlug', 'departmentCode'],
    fields: [
      { key: 'name', type: 'text', label: 'Name' },
      { key: 'title', type: 'text', label: 'Title' },
      { key: 'phone', type: 'text', label: 'Phone' },
      { key: 'phoneUrl', type: 'url', label: 'Phone link' },
      { key: 'photo', type: 'image', label: 'Photo' },
    ],
  },
];

const BY_ID = new Map(DATA_SOURCES.map((s) => [s.id, s]));

export function dataSource(id) {
  return BY_ID.get(String(id || '').trim()) || null;
}

/**
 * Is this placement value a source binding rather than typed rows?
 *
 * Deliberately narrow. A list prop's value is normally an array, so anything
 * that is an object carrying a string `source` is unambiguous, and a dealer who
 * typed rows can never trip it.
 */
export function isDataBinding(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value) && typeof value.source === 'string';
}

/**
 * The rows a source binding resolves to.
 *
 * `resolved` is what the platform baked for this placement. Absent means the
 * page has never been published since the binding was made, or the resolver
 * failed — either way the honest answer is no rows, because inventing them would
 * put fictional addresses in the served HTML. The editor asks for samples
 * instead, so a dealer designing against a source they have not published yet
 * still sees the shape of it.
 */
export function resolveDataBinding(binding, resolved, opts = {}) {
  const source = dataSource(binding.source);
  if (!source) return [];

  // A local source answers from the render context, so it has rows on an
  // ordinary build with nothing baked. The baked value still wins when there is
  // one: a placement the platform has resolved is the platform's answer.
  const rows = Array.isArray(resolved)
    ? resolved
    : source.local
      ? localRows(source, binding, opts.ctx)
      : null;
  if (!rows) return opts.sample ? sampleRows(source, opts.sampleRows || 3) : [];

  const overlay = Array.isArray(binding.overlay) ? binding.overlay : [];
  if (!overlay.length) return rows;

  // Editorial extras the platform does not hold — a brand pill, a swatch — keyed
  // to the row they belong to. Fields the source owns are dropped rather than
  // merged: an address typed here would win over Admin and go stale silently,
  // which is the exact failure a source exists to end.
  const owned = new Set(source.fields.map((f) => f.key));
  const extras = new Map();
  for (const row of overlay) {
    if (!row || typeof row !== 'object') continue;
    const id = row[source.match];
    if (id == null || id === '') continue;
    const kept = {};
    for (const [key, value] of Object.entries(row)) {
      if (key === source.match || owned.has(key)) continue;
      kept[key] = value;
    }
    extras.set(String(id), kept);
  }

  return rows.map((row) => {
    const extra = extras.get(String(row?.[source.match]));
    return extra ? { ...row, ...extra } : row;
  });
}

/**
 * Rows for a source the renderer can answer itself.
 *
 * Only `posts` today. The context already holds them published-only and newest
 * first, so this maps them onto the source's field names and applies the two
 * knobs a placement may set. A context with no posts at all is a repo whose blog
 * is off — no rows, and the canvas falls through to samples.
 */
function localRows(source, binding, ctx) {
  const posts = ctx && Array.isArray(ctx.posts) ? ctx.posts : null;
  if (!posts) return null;
  if (source.id === 'post-topics') return topicRows(posts);
  if (source.id !== 'posts') return null;

  const config = binding.config && typeof binding.config === 'object' ? binding.config : {};
  const wanted = topicKey(config.topic);
  const limit = Number(config.limit);
  const base = String((ctx && ctx.blogBasePath) || '/blog').replace(/\/$/, '');

  let rows = posts.map((post) => ({
    slug: post.slug || '',
    title: post.title || '',
    href: post.slug ? `${base}/${post.slug}` : '',
    date: formatRowDate(post.date),
    dateISO: post.date ? String(post.date) : '',
    excerpt: post.description || '',
    topic: post.topic || '',
    topicKey: topicKey(post.topic),
    // An image prop wants `{ src, alt }`; a post with no cover gives an empty
    // src, which every image path here already draws as a placeholder.
    coverImage: { src: post.coverImage || '', alt: post.title || '' },
  }));

  if (wanted) rows = rows.filter((row) => row.topicKey === wanted);
  if (Number.isFinite(limit) && limit > 0) rows = rows.slice(0, limit);
  return rows;
}

/**
 * The topics in play, newest post first and each one once.
 *
 * Ordered by the posts rather than alphabetically: the chips then lead with what
 * the dealer is currently writing about, and a topic retired a year ago falls to
 * the end on its own.
 */
function topicRows(posts) {
  const seen = new Map();
  for (const post of posts) {
    const label = String(post?.topic || '').trim();
    if (!label) continue;
    const value = topicKey(label);
    if (!value || seen.has(value)) continue;
    seen.set(value, { label, value });
  }
  return [...seen.values()];
}

/** A topic as a filter value: what a control matches on, never the display copy. */
function topicKey(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** The same date the rest of the blog prints, so a card and a post agree. */
function formatRowDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

/** Placeholder rows, so a source binding has a shape on a canvas before it is published. */
function sampleRows(source, count) {
  return Array.from({ length: count }, (_, i) => sampleRow(source.fields, i));
}

function sampleRow(fields, i) {
  return Object.fromEntries((fields || []).map((f) => [f.key, sampleValue(f, i)]));
}

function sampleValue(field, i) {
  switch (field.type) {
    case 'number':
      return i + 1;
    case 'boolean':
      return false;
    case 'image':
      return { src: '', alt: '' };
    case 'url':
      return '#';
    // Two rows rather than one: a nested list drawn once looks like a scalar on
    // the canvas, and the whole point of the sample is to show that the design
    // repeats here.
    case 'list':
      return [0, 1].map((n) => sampleRow(field.fields, n));
    default:
      return `${field.label} ${i + 1}`;
  }
}
