/**
 * Archived wildlife rows (Fox Rangers, Fox Stop Markers, Heli Kitties) from
 * assets/content/street-ecology.json `wildlife`, written by
 * build-street-ecology.mjs. Kept apart from `streets[*].counts` so streets
 * whose only archived wildlife is kitties keep their playable fallback.
 */

export const STREET_ECOLOGY_JSON = 'assets/content/street-ecology.json';

let catalog = null;
let loading = null;

/** Row for a street (G/L alias aware), or null. */
export function wildlifeFor(source, tsid) {
  const map = source?.wildlife || {};
  const id = String(tsid || '');
  const aliases = [id];
  if (id.startsWith('G')) aliases.push(`L${id.slice(1)}`);
  if (id.startsWith('L')) aliases.push(`G${id.slice(1)}`);
  for (const alias of aliases) if (map[alias]) return map[alias];
  return null;
}

/** The loaded catalog, or null before the first fetch resolves. */
export function wildlifeCatalog() {
  return catalog;
}

/** Fetch the ecology catalog once (shared by the fox and kitty features). */
export function loadWildlifeCatalog(fetchImpl = globalThis.fetch) {
  if (catalog) return Promise.resolve(catalog);
  if (!loading) {
    loading = (typeof fetchImpl === 'function'
      ? fetchImpl(STREET_ECOLOGY_JSON).then((r) => (r.ok ? r.json() : null)).catch(() => null)
      : Promise.resolve(null)
    ).then((json) => {
      catalog = json && typeof json === 'object' ? json : { streets: {}, wildlife: {} };
      return catalog;
    });
  }
  return loading;
}

/** Tests: install a catalog directly. */
export function setWildlifeCatalog(next) {
  catalog = next && typeof next === 'object' ? next : null;
  loading = null;
  return catalog;
}
