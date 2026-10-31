/**
 * LEVEL BUILDER (spec 4, 6.3): pure helpers over a zone. Forking a shipped street into a draft,
 * builder tsids, stats, and the coordinate conversions the editor needs (spec 2.1: middleground
 * decos are world space; decos on every other layer are layer-local, offset each frame by
 * parallax). No DOM, no Pixi.
 */
import { worldToScreen, screenToWorld } from '../street-model.js?v=23b926e5';
import { withoutZoneConnects } from '../zone-streets.js?v=b40010d5';

/** Fields a builder street never carries (schema $defs/draftStreet; feature-owned or events). */
export const FORK_DROPS = Object.freeze([
  'events', 'eventBoxes', 'physics', 'reconstructed', 'why', 'template', 'ownLight', 'subway',
  'enchantedForest', 'starJinglers', 'glowOrbs', 'soilArt', 'walls', 'internalLabel', 'swf_file',
]);

/** The sky a fork of a street without one gets (the schema requires a gradient on builder streets). */
export const DEFAULT_GRADIENT = Object.freeze({ top: '87A8C9', bottom: 'FFE7A0' });

/** Population classes the schema takes (street-ecology.json counts). */
export const POPULATION_CLASSES = Object.freeze([
  'street_spirit', 'trant_fruit', 'trant_bean', 'trant_bubble', 'trant_egg', 'trant_gas', 'trant_spice', 'wood_tree',
  'paper_tree', 'rock_metal_1', 'rock_beryl_1', 'rock_dullite_1', 'rock_sparkly_1', 'dirt_pile', 'dust_trap', 'peat_1',
  'mortar_barnacle', 'jellisac', 'ice_knob', 'npc_piggy', 'npc_chicken', 'npc_butterfly', 'npc_salmon', 'npc_firefly',
  'npc_sloth', 'garden',
]);

const TSID_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** A new builder street tsid: GZ and 13 capitals or digits (spec 4; random, so drafts never collide). */
export function newTsid(random = (n) => globalThis.crypto.getRandomValues(new Uint8Array(n))) {
  const bytes = random(13);
  let out = 'GZ';
  for (let i = 0; i < 13; i += 1) out += TSID_CHARS[bytes[i] % 36];
  return out;
}

/** PURE: a street key from a label, unique among `taken`. */
export function streetKeyFrom(label, taken = []) {
  let base = String(label || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^[^a-z]+/, '').replace(/-+$/, '').slice(0, 28).replace(/-+$/, '');
  if (!base) base = 'street';
  const used = new Set(taken);
  if (!used.has(base)) return base;
  for (let n = 2; ; n += 1) if (!used.has(`${base}-${n}`)) return `${base}-${n}`;
}

/** PURE: the counts a builder street's stats hold, recomputed from its content. */
export function streetStats(street) {
  const stats = {
    platformCount: (street.platforms || []).length,
    layerCount: (street.layers || []).length,
    decoCount: (street.layers || []).reduce((n, l) => n + (l.decos || []).length, 0),
    signpostCount: (street.signposts || []).length,
  };
  if (street.doors) stats.doorCount = street.doors.length;
  if (street.ladders) stats.ladderCount = street.ladders.length;
  if (street.barriers) stats.barrierCount = street.barriers.length;
  return stats;
}

/** PURE: a provenance row for a library sprite (catalog row from assets/content/deco-catalog.json). */
export function libraryAsset(row) {
  return { origin: 'tinyspeck-cc0', licence: 'CC0-1.0', source: row.source };
}

/** PURE: the population row for a draft street from a shipped ecology row (schema $defs/population). */
export function populationFrom(row) {
  if (!row || typeof row !== 'object') return null;
  const counts = {};
  for (const [c, n] of Object.entries(row.counts || {})) {
    if (POPULATION_CLASSES.includes(c) && Number.isInteger(n) && n > 0) counts[c] = Math.min(12, n);
  }
  const out = { counts };
  if (Number.isInteger(row.quoins)) out.quoins = Math.max(0, Math.min(40, row.quoins));
  if (typeof row.interior === 'boolean') out.interior = row.interior;
  if (typeof row.exact === 'boolean') out.exact = row.exact;
  if (typeof row.giantId === 'string') out.giantId = row.giantId;
  return out;
}

/**
 * PURE: fork a shipped street into a draft street (spec 6.3; Q3: forks never touch the shipped
 * file). The copy takes a new GZ tsid and label, drops what builder streets never carry
 * (FORK_DROPS), numbers every deco d_1..d_n in layer order, gets a sky if it had none, and
 * recomputes its stats. Returns { draftStreet, assets: {sprite: row}, hub: {id, name} }.
 *
 * @param {object} shipped the street JSON as the file has it
 * @param {{ zoneId: string, key: string, label: string, tsid: string, indexRow?: object,
 *   catalog: Map<string, object>, twins?: Record<string, string>, ecologyRow?: object }} opts
 */
export function forkStreet(shipped, { zoneId, key, label, tsid, indexRow = {}, catalog, twins = {}, ecologyRow = null }) {
  const street = JSON.parse(JSON.stringify(shipped));
  for (const f of FORK_DROPS) delete street[f];
  const from = shipped.tsid;
  street.source = `groddle-builder ${zoneId} (fork of ${from})`;
  street.tsid = tsid;
  street.label = String(label).slice(0, 48);
  street.hubId = String(shipped.hubId ?? indexRow.hubId ?? '');
  street.hubName = String(shipped.hubName ?? indexRow.hubName ?? '');
  if (!street.gradient) street.gradient = { ...DEFAULT_GRADIENT };
  // A published zone's arms on the shipped street (spec 11) are that zone's, not Tiny Speck's: a fork leaves them.
  if (Array.isArray(street.signposts)) street.signposts = withoutZoneConnects(street.signposts);
  let n = 0;
  const assets = {};
  for (const layer of street.layers || []) {
    for (const deco of layer.decos || []) {
      n += 1;
      const rest = { ...deco };
      delete rest.id;
      for (const k of Object.keys(deco)) delete deco[k];
      Object.assign(deco, { id: `d_${n}` }, rest);
      const art = catalog.has(deco.sprite) ? deco.sprite : twins[deco.sprite];
      if (art && catalog.has(art) && !assets[deco.sprite]) assets[deco.sprite] = libraryAsset(catalog.get(art));
    }
  }
  street.stats = streetStats(street);
  const draftStreet = { key, street };
  const population = populationFrom(ecologyRow);
  if (population) draftStreet.population = population;
  return { draftStreet, assets, hub: { id: street.hubId, name: street.hubName } };
}

/** PURE: the ops that fork a street into a zone (street.add, missing assets, a hub if it has none). */
export function forkOps(zone, fork) {
  const ops = [];
  if (!zone.hub && fork.hub.id) ops.push({ op: 'hub.set', hub: fork.hub });
  for (const [name, row] of Object.entries(fork.assets)) {
    if (!zone.assets?.[name]) ops.push({ op: 'asset.set', name, asset: row });
  }
  ops.push({ op: 'street.add', street: fork.draftStreet.key, draftStreet: fork.draftStreet });
  return ops;
}

// —— Coordinates (spec 2.1, 6.5 re-layering) ——

/** Whether a layer draws in its own layer-local space (street-render.js buildStreetView). */
export function isLayerLocal(layer) {
  return layer?.id !== 'middleground' && ((layer?.w > 0 && layer?.h > 0) || /^T_/.test(String(layer?.id || '')));
}

/**
 * PURE: a deco's anchor in screen space (the street's top-left origin; where it is drawn on the
 * canvas before the camera), given its layer's current offset (the layer container's x, y).
 */
export function decoScreen(street, layer, deco, offset = { x: 0, y: 0 }) {
  if (isLayerLocal(layer)) return { x: deco.x + (offset.x || 0), y: deco.y + (offset.y || 0) };
  return worldToScreen(street, deco.x, deco.y);
}

/** PURE: the deco x, y a screen-space anchor is in a layer (the inverse of decoScreen). */
export function screenToDeco(street, layer, point, offset = { x: 0, y: 0 }) {
  if (isLayerLocal(layer)) return { x: point.x - (offset.x || 0), y: point.y - (offset.y || 0) };
  return screenToWorld(street, point.x, point.y);
}

/**
 * PURE: where a deco lands when it moves from one layer to another and stays where it appears
 * on screen with the current camera (spec 6.5). Offsets are each layer container's x, y.
 */
export function relayerPosition(street, from, to, deco, offsets = {}) {
  const at = decoScreen(street, from, deco, offsets[from.id]);
  const p = screenToDeco(street, to, at, offsets[to.id]);
  return { x: Math.round(p.x), y: Math.round(p.y) };
}

/**
 * PURE: a copy of a shipped street to look at (read-only in the editor): every deco numbered
 * d_1..d_n in layer order, as a fork numbers them, so what you inspect has the id it will have.
 */
export function withDecoIds(street) {
  const copy = JSON.parse(JSON.stringify(street));
  let n = 0;
  for (const layer of copy.layers || []) {
    for (const deco of layer.decos || []) {
      n += 1;
      deco.id = `d_${n}`;
    }
  }
  return copy;
}

/** PURE: the screen-space floor a play-test starts on: the standable line under (x, y), else the nearest. */
export function floorUnder(platforms, x, y, standable = () => true) {
  let best = null;
  let bestD = Infinity;
  for (const p of platforms) {
    if (!standable(p)) continue;
    const lo = Math.min(p.x1, p.x2);
    const hi = Math.max(p.x1, p.x2);
    const cx = Math.max(lo, Math.min(hi, x));
    const t = p.x2 === p.x1 ? 0 : (cx - p.x1) / (p.x2 - p.x1);
    const ly = p.y1 + t * (p.y2 - p.y1);
    const below = ly >= y - 1;
    // Lines under the point first (nearest down), then any line by distance.
    const d = (cx === x && below ? 0 : 1e6) + Math.abs(ly - y) + Math.abs(cx - x);
    if (d < bestD) {
      bestD = d;
      best = { x: Math.round(cx), y: Math.round(ly) };
    }
  }
  return best;
}

// —— Zone edits (spec 4, 11): new ways in from shipped streets, never written into their files ——

/** PURE: the zone's edits on one shipped street (L and G forms of its tsid alike). */
export function editsOn(edits, tsid) {
  const a = String(tsid || '').slice(1);
  return (edits || []).filter((e) => e && typeof e.tsid === 'string' && e.tsid.slice(1) === a && /^[GL]/.test(e.tsid));
}

/**
 * PURE: a copy of a shipped street with the zone's edits on it, as publishing will apply them
 * (tools/builder/apply-zone-edits.mjs, phase P6): an add-connect edit appends its arm to the named
 * signpost, an add-signpost edit appends the new signpost. Edits on other streets, or naming a
 * signpost the street lacks, are left out. The input is untouched.
 */
export function streetWithEdits(street, edits) {
  const copy = JSON.parse(JSON.stringify(street));
  for (const e of editsOn(edits, copy.tsid)) {
    if (e.op === 'add-connect' && e.connect) {
      const post = (copy.signposts || []).find((p) => p.id === e.signpost);
      if (!post) continue;
      if (!Array.isArray(post.connects)) post.connects = [];
      post.connects.push(JSON.parse(JSON.stringify(e.connect)));
    } else if (e.op === 'add-signpost' && e.newSignpost) {
      if (!Array.isArray(copy.signposts)) copy.signposts = [];
      copy.signposts.push(JSON.parse(JSON.stringify(e.newSignpost)));
    }
  }
  return copy;
}

/**
 * PURE: the edit that adds an arm into a zone street on a shipped street's signpost (spec 8.2
 * link-world). `arrive` is where players land on the zone street (its screen px), or null.
 */
export function linkEdit({ shippedTsid, signpost, target, arrive = null }) {
  const connect = { tsid: target.tsid, label: String(target.label || target.tsid).slice(0, 48) };
  if (/^[0-9]{1,4}$/.test(String(target.hubId || ''))) connect.hub_id = String(target.hubId);
  if (arrive && Number.isFinite(arrive.x) && Number.isFinite(arrive.y)) connect.arrive = { x: Math.round(arrive.x), y: Math.round(arrive.y) };
  return { tsid: shippedTsid, op: 'add-connect', signpost, connect };
}
