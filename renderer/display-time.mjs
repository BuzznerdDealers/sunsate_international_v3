// Opening hours as a visitor reads them: 12-hour with AM/PM, no leading zero.
//
// The platform keeps hours as `HH:mm` on the 24-hour clock, and the display
// strings it bakes alongside them (`hours`, `summary`) have at times been that
// raw form too — "07:00–17:00". This is the last step before the page, so it
// owns the conversion: whatever a publish or a live-data refresh bakes, the
// built HTML says "7:00 AM – 5:00 PM".
//
// Only display strings pass through here. `opensAt` / `closesAt` stay `HH:mm`
// because schema.org `opens` / `closes` require exactly that.

// A two-digit hour ("07:00") or an afternoon one ("17:00") is unambiguously the
// 24-hour clock; a bare "7:00" may already be 12-hour copy, so it is left alone,
// as is anything already followed by AM or PM.
const CLOCK = String.raw`(?<![\d:T])(0?\d|1\d|2[0-3]):([0-5]\d)(?![\d:])(?!\s*(?:[AaPp]\.?[Mm]\b))`;
const RANGE = new RegExp(`${CLOCK}\\s*[–-]\\s*${CLOCK}`, 'g');
const SINGLE = new RegExp(CLOCK, 'g');

const is24 = (h) => h.length === 2 || Number(h) >= 13;
const clock = (h, m) => {
  const hour = Number(h);
  return `${hour % 12 || 12}:${m} ${hour < 12 ? 'AM' : 'PM'}`;
};

/** "07:00–17:00 Mon–Fri" → "7:00 AM – 5:00 PM Mon–Fri". Non-strings are returned as given. */
export function clockText(value) {
  if (typeof value !== 'string' || !/\d:\d\d/.test(value)) return value;
  return value
    .replace(RANGE, (all, h1, m1, h2, m2) =>
      is24(h1) || is24(h2) ? `${clock(h1, m1)} – ${clock(h2, m2)}` : all,
    )
    .replace(SINGLE, (all, h, m) => (is24(h) ? clock(h, m) : all));
}

/** The keys a location row uses for hours copy, at any depth (`hoursRows[].days[].hours`). */
const DISPLAY_KEYS = new Set(['hours', 'summary']);

/**
 * A baked data-source row with its hours copy in 12-hour form. Returns the same
 * object when nothing changes, so rows without hours cost nothing.
 */
export function displayRow(row) {
  if (Array.isArray(row)) {
    let changed = false;
    const next = row.map((item) => {
      const out = displayRow(item);
      if (out !== item) changed = true;
      return out;
    });
    return changed ? next : row;
  }
  if (!row || typeof row !== 'object') return row;
  let next = row;
  for (const [key, value] of Object.entries(row)) {
    const out =
      typeof value === 'string' ? (DISPLAY_KEYS.has(key) ? clockText(value) : value) : displayRow(value);
    if (out !== value) {
      if (next === row) next = { ...row };
      next[key] = out;
    }
  }
  return next;
}
