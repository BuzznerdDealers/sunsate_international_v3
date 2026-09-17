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

  const rows = Array.isArray(resolved) ? resolved : null;
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

/** Placeholder rows, so a source binding has a shape on a canvas before it is published. */
function sampleRows(source, count) {
  return Array.from({ length: count }, (_, i) =>
    Object.fromEntries(
      source.fields.map((f) => [
        f.key,
        f.type === 'number'
          ? i + 1
          : f.type === 'image'
            ? { src: '', alt: '' }
            : f.type === 'url'
              ? '#'
              : `${f.label} ${i + 1}`,
      ]),
    ),
  );
}
