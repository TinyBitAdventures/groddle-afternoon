/**
 * LEVEL BUILDER deco picker search (spec 6.4, phase P3). Pure: no DOM.
 *
 * The rows are assets/content/deco-catalog.json's (tools/builder/deco-catalog.mjs): name, family,
 * bundle, size2, hires, sharp, animated, placements, streets, hubs ([[hubId, n]] top 5), layers
 * ({role: n}), drawn ({w_med, h_med}), neverPlaced. The zone's own new art joins them as rows made
 * by newArtRows (bundle "new art", the hub's placements unknown).
 *
 * Search: a query's words against each name's tokens (split on _, digits and case), its family and
 * its art set (bundle). Ranking: how well the words match first, then placements in the current
 * hub, then placements overall (spec 6.4). Facets: layer role, art set, used in this hub, animated,
 * size class and never placed.
 */

export const ROLES = Object.freeze(['sky', 'bg', 'middleground', 'middleplus', 'foreground']);
export const SIZES = Object.freeze([
  Object.freeze({ id: 'small', label: 'Small (under 100 px)', max: 100 }),
  Object.freeze({ id: 'medium', label: 'Medium (100 to 300 px)', max: 300 }),
  Object.freeze({ id: 'large', label: 'Large (300 to 700 px)', max: 700 }),
  Object.freeze({ id: 'huge', label: 'Huge (over 700 px)', max: Infinity }),
]);
export const NEW_ART_BUNDLE = 'new art';

/** PURE: a name's search tokens, lower case: split on _, -, spaces, digits and case changes. */
export function tokensOf(name) {
  const out = [];
  for (const part of String(name || '').split(/[^A-Za-z0-9]+/)) {
    for (const t of part.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/([A-Za-z])(\d)/g, '$1 $2').replace(/(\d)([A-Za-z])/g, '$1 $2').split(' ')) {
      if (t) out.push(t.toLowerCase());
    }
  }
  return out;
}

/** PURE: the words of a query (the same splitting, so "bush3" finds bush_3). */
export function queryWords(query) {
  return tokensOf(query);
}

/** PURE: a deco's drawn size: the median placed size, else half its 2x file. */
export function drawnSize(row) {
  const w = Number(row?.drawn?.w_med) || (row?.size2 ? Math.round(row.size2[0] / 2) : 0);
  const h = Number(row?.drawn?.h_med) || (row?.size2 ? Math.round(row.size2[1] / 2) : 0);
  return { w: Math.max(1, Math.round(w)), h: Math.max(1, Math.round(h)) };
}

/** PURE: a deco's size class by its longer drawn side. */
export function sizeClass(row) {
  const { w, h } = drawnSize(row);
  const side = Math.max(w, h);
  return SIZES.find((s) => side < s.max)?.id || 'huge';
}

/** PURE: how often a deco is placed on the streets of one hub (the catalog keeps its top 5). */
export function hubPlacements(row, hub) {
  if (!hub) return 0;
  const hit = (row?.hubs || []).find(([id]) => String(id) === String(hub));
  return hit ? Number(hit[1]) || 0 : 0;
}

/**
 * PURE: how well a row matches the query's words, 0 when one word matches nothing.
 * Per word: a whole name token 30, a token that starts with it 20, the family 15, the art set 10,
 * anywhere in the name 5. The whole name typed exactly adds 1,000; the name starting with the
 * query as typed adds 100.
 */
export function textScore(row, words, raw = '') {
  if (!words.length) return 0;
  const name = String(row.name || '');
  const lname = name.toLowerCase();
  const tokens = tokensOf(name);
  const family = String(row.family || '').toLowerCase();
  const bundle = String(row.bundle || '').toLowerCase();
  let score = 0;
  for (const w of words) {
    let best = 0;
    if (tokens.includes(w)) best = 30;
    else if (tokens.some((t) => t.startsWith(w))) best = 20;
    if (family === w || family.startsWith(w)) best = Math.max(best, 15);
    if (bundle === w || tokensOf(bundle).includes(w)) best = Math.max(best, 10);
    if (!best && lname.includes(w)) best = 5;
    if (!best) return 0;
    score += best;
  }
  const typed = String(raw || '').trim().toLowerCase();
  if (typed && lname === typed) score += 1000;
  else if (typed && lname.startsWith(typed)) score += 100;
  return score;
}

/** PURE: whether a row passes the facets ({ role, bundle, inHub, hub, animated, size, neverPlaced }). */
export function passesFacets(row, f = {}) {
  if (f.role && !(Number(row.layers?.[f.role]) > 0) && !(row.bundle === NEW_ART_BUNDLE && row.role === f.role)) return false;
  if (f.bundle && row.bundle !== f.bundle) return false;
  if (f.inHub && !hubPlacements(row, f.hub)) return false;
  if (f.animated && !row.animated) return false;
  if (f.size && sizeClass(row) !== f.size) return false;
  if (f.neverPlaced && !row.neverPlaced) return false;
  return true;
}

/**
 * PURE: the picker's results, best first: [{ row, score, hub }].
 * @param {object[]} rows catalog rows (and new-art rows)
 * @param {string} query what was typed
 * @param {{ hub?: string, role?: string, bundle?: string, inHub?: boolean, animated?: boolean,
 *   size?: string, neverPlaced?: boolean, limit?: number }} [opts]
 */
export function searchDecos(rows, query = '', opts = {}) {
  const words = queryWords(query);
  const out = [];
  for (const row of rows || []) {
    if (!passesFacets(row, opts)) continue;
    const score = words.length ? textScore(row, words, query) : 0;
    if (words.length && !score) continue;
    out.push({ row, score, hub: hubPlacements(row, opts.hub) });
  }
  // New art first when nothing is typed (the zone's own), then text, the hub, everywhere, the name.
  out.sort((a, b) => b.score - a.score
    || (b.row.bundle === NEW_ART_BUNDLE) - (a.row.bundle === NEW_ART_BUNDLE)
    || b.hub - a.hub
    || (Number(b.row.placements) || 0) - (Number(a.row.placements) || 0)
    || String(a.row.name).localeCompare(String(b.row.name)));
  return Number.isInteger(opts.limit) ? out.slice(0, opts.limit) : out;
}

/**
 * PURE: how many results each facet value would leave, for the picker's chips:
 * { role: {sky: n, ...}, size: {...}, bundle: [[name, n], ...] (most first, 16 at most),
 *   inHub, animated, neverPlaced }. Each facet is counted with the other facets applied.
 */
export function facetCounts(rows, query = '', opts = {}) {
  const words = queryWords(query);
  const matched = (rows || []).filter((row) => !words.length || textScore(row, words, query) > 0);
  const count = (without, test) => matched.filter((r) => passesFacets(r, { ...opts, [without]: without === 'inHub' || without === 'animated' || without === 'neverPlaced' ? false : '' }) && test(r)).length;
  const role = Object.fromEntries(ROLES.map((x) => [x, count('role', (r) => Number(r.layers?.[x]) > 0 || (r.bundle === NEW_ART_BUNDLE && r.role === x))]));
  const size = Object.fromEntries(SIZES.map((s) => [s.id, count('size', (r) => sizeClass(r) === s.id)]));
  const bundles = new Map();
  for (const r of matched) if (passesFacets(r, { ...opts, bundle: '' })) bundles.set(r.bundle, (bundles.get(r.bundle) || 0) + 1);
  return {
    role,
    size,
    bundle: [...bundles].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0]))).slice(0, 16),
    inHub: count('inHub', (r) => hubPlacements(r, opts.hub) > 0),
    animated: count('animated', (r) => Boolean(r.animated)),
    neverPlaced: count('neverPlaced', (r) => Boolean(r.neverPlaced)),
  };
}

/**
 * PURE: the zone's new art as picker rows: every assets{} row with origin "new" and a stored
 * file. Its drawn size is half its 2x file (as the library's are drawn), its role the one intake
 * was told (when the row says).
 */
export function newArtRows(assets) {
  const out = [];
  for (const [name, a] of Object.entries(assets || {})) {
    if (a?.origin !== 'new' || !/^[0-9a-f]{64}$/.test(a.sha256 || '')) continue;
    const size2 = a.w && a.h ? [a.w, a.h] : null;
    out.push({
      name,
      family: 'gz',
      bundle: NEW_ART_BUNDLE,
      size2,
      animated: false,
      placements: 0,
      hubs: [],
      layers: {},
      drawn: size2 ? { w_med: Math.round(size2[0] / 2), h_med: Math.round(size2[1] / 2) } : null,
      neverPlaced: true,
      sha256: a.sha256,
      licence: a.licence,
    });
  }
  return out;
}

/** PURE: the thumbnail URL of a row: the library's 2x WebP, or a new art's stored file. */
export function thumbUrl(row) {
  if (row?.bundle === NEW_ART_BUNDLE && row.sha256) return `/builder-art/${row.sha256}`;
  return `assets/decos/groddle/${encodeURIComponent(row?.name || '')}.webp`;
}

/** PURE: a new deco for the picker's choice, standing at (x, y) in its layer's space. */
export function decoFor(row, { id, x, y, z = 0 }) {
  const { w, h } = drawnSize(row);
  return { id, sprite: row.name, x: Math.round(x), y: Math.round(y), w, h, z, r: 0 };
}
