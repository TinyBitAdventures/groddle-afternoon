/**
 * LEVEL BUILDER published zones (docs/level-builder/spec.md 11, phase P6): how the game tells a
 * zone's streets from Tiny Speck's. A published zone's streets are files like any other
 * (assets/streets/<tsid>.json, with rows in index.json), but their tsids start with GZ, which no
 * shipped street does (the prefixes in use are GA, GC, GD, GH, GI, GL, GM, GN, GT and GU), and
 * their index rows carry `zone: <zone id>`.
 *
 * Zones are solo only (spec 15, Q6): a multiplayer page drops their index rows and every arm that
 * leads into one (js/street-loader.js), the realtime builders skip them (tools/build-realtime-*.mjs),
 * and the hub picker on the map leaves their hubs out (js/map-graph.js listHubsFromIndex). All pure.
 */

/** A zone street's tsid: GZ and 13 capitals or digits (zone.schema.json $defs/draftStreet). */
export const ZONE_TSID = /^GZ[A-Z0-9]{13}$/;

/** PURE: is this a zone street's tsid? (Its L alias, LZ..., counts too.) */
export function isZoneTsid(tsid) {
  return /^[GL]Z[A-Z0-9]{13}$/.test(String(tsid || ''));
}

/** PURE: is this index row (or its tsid) a zone street's? */
export function isZoneRow(tsid, row) {
  return isZoneTsid(tsid) || (row != null && typeof row === 'object' && typeof row.zone === 'string' && row.zone !== '');
}

/** PURE: index rows without the zones' streets (a new object; the input is untouched). */
export function withoutZoneRows(streets) {
  const out = {};
  for (const [tsid, row] of Object.entries(streets || {})) if (!isZoneRow(tsid, row)) out[tsid] = row;
  return out;
}

/**
 * PURE: signposts without the arms that lead into a zone, and without a post left with no arm at
 * all because of it. Posts with nothing to drop come back as they were.
 */
export function withoutZoneConnects(signposts) {
  const out = [];
  for (const post of signposts || []) {
    const connects = post?.connects || [];
    const kept = connects.filter((c) => !isZoneTsid(c?.tsid));
    if (kept.length === connects.length) out.push(post);
    else if (kept.length) out.push({ ...post, connects: kept });
  }
  return out;
}
