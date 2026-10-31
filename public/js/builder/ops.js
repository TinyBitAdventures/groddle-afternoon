/**
 * LEVEL BUILDER (spec 6.6, 8.3): the op vocabulary. Every edit is an op; applying an op returns
 * its inverse, so undo applies the inverse and redo the op again. The same ops are the wire format
 * (POST .../drafts/<id>/ops): the site applies them with groddle-afternoon-site src/BuilderOps.php,
 * a line-for-line port of this file, and tests/builder-ops.test.js holds the two to the same bytes.
 * Pure: no DOM, no Pixi. Ops mutate the zone in place and never touch `stats` (recomputed on fork
 * and at publish) or `rev` (the store's).
 *
 * P1 ops (a street is named by its key, a deco or layer by its id):
 *   zone.set     { set: {title?, notes?}, unset?: [..], order?: [..] }
 *   hub.set      { hub: {...} | null }
 *   asset.set    { name, asset: {...} | null }
 *   street.add   { street: <key>, draftStreet: {key, street, population?, editor?}, at? }
 *   street.remove{ street }
 *   street.set   { street, set: {label?, gradient?, ...}, unset?: [..] }   top-level street fields
 *   editor.set   { street, editor: {...} | null }                         camera, locked layers (no undo)
 *   layer.set    { street, layer, set: {name?, z?, w?, h?, hidden?, filters?}, unset?: [..] }
 *   deco.add     { street, layer, deco: {id, sprite, x, y, w, h, z, r, ...}, at? }
 *   deco.remove  { street, id }
 *   deco.set     { street, id, set: {...}, unset?: [..] }
 *   deco.move    { street, id, layer, at?, set? }                          re-layer (set: new x, y)
 *
 * P2 ops (geometry, spec 6.5; ids follow Tiny Speck's patterns: plat_<n>, wall_<n>, ladder_<n>,
 * signpost_<n>). <kind> is platform, barrier, ladder or signpost; the thing rides under its kind's
 * name ({ platform: {...} }), and an add without an id takes the next free one:
 *   <kind>.add   { street, <kind>: {id?, ...}, at? }
 *   <kind>.remove{ street, id, prune? }       prune: drop the list when it empties (an add's inverse
 *                                             on a street that had no list, so undo gives the same bytes)
 *   <kind>.set   { street, id, set, unset?, order? }   pc_perm and item_perm may be set to null (hard)
 *   connect.add  { street, signpost, connect: {tsid, label, hub_id?, hidden?, arrive?}, at? }
 *   connect.remove { street, signpost, at }
 *   connect.set  { street, signpost, at, set, unset?, order? }
 *
 * P3 ops (new zones, spec 6.3, 6.4, 11):
 *   population.set { street, population: {counts, quoins?, interior?, ...} | null, order? }
 *                                             the street's row for the ecology planner
 *   hubmap.set   { map: {color?, top_color?, btm_color?, streets: [...], hubs?: [...]} | null, order? }
 *                                             the hub map of the zone's hub (the zone needs a hub)
 *   edit.add     { edit: {tsid, op: 'add-connect', signpost, connect} | {tsid, op: 'add-signpost', newSignpost}, at?, order? }
 *                                             a way in from a shipped street (zone.edits; the shipped file is never touched)
 *   edit.remove  { at, prune? }                prune: drop zone.edits when it empties (an add's inverse)
 *
 * Zone ambient effects (spec 4, 15 Q12; js/street-effects.js) ride the same two shapes:
 *   emitter.add / .remove / .set              a steam vent, lava squirt or embers (emitters[],
 *                                             fx_<n>), as the geometry kinds above
 *   street.set { set: { rumble: {every, duration, strength, sound?} } }   the street's rumble
 *
 * A failing op throws an OpError with a code; a batch (applyOps) is all or nothing.
 *
 * Key order is kept: an inverse that puts back a field an op removed also carries `order`, the
 * object's keys as they were, so undo gives the same bytes and not just the same values.
 */

export class OpError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

export const OP_NAMES = Object.freeze([
  'zone.set', 'hub.set', 'asset.set', 'street.add', 'street.remove', 'street.set', 'editor.set',
  'layer.set', 'deco.add', 'deco.remove', 'deco.set', 'deco.move',
  'platform.add', 'platform.remove', 'platform.set', 'barrier.add', 'barrier.remove', 'barrier.set',
  'ladder.add', 'ladder.remove', 'ladder.set', 'signpost.add', 'signpost.remove', 'signpost.set',
  'emitter.add', 'emitter.remove', 'emitter.set',
  'connect.add', 'connect.remove', 'connect.set',
  'population.set', 'hubmap.set', 'edit.add', 'edit.remove',
]);

/** Top-level street fields street.set may change (geometry, layers and ids have their own ops). */
export const STREET_FIELDS = Object.freeze(['label', 'internalLabel', 'hubId', 'hubName', 'gradient', 'musicFile', 'noMap', 'fogMap', 'bounds', 'rumble']);
export const LAYER_FIELDS = Object.freeze(['name', 'z', 'w', 'h', 'hidden', 'filters']);
export const DECO_FIELDS = Object.freeze(['sprite', 'name', 'signText', 'x', 'y', 'w', 'h', 'z', 'r', 'flip', 'hidden', 'animated']);
const ZONE_FIELDS = Object.freeze(['title', 'notes']);

/** Geometry kinds: the street list each lives in, its id prefix and the fields an op may set. */
export const GEOMETRY = Object.freeze({
  platform: Object.freeze({ list: 'platforms', prefix: 'plat_', fields: Object.freeze(['x1', 'y1', 'x2', 'y2', 'pc_perm', 'item_perm']) }),
  barrier: Object.freeze({ list: 'barriers', prefix: 'wall_', fields: Object.freeze(['x', 'y', 'h', 'pc_perm']) }),
  ladder: Object.freeze({ list: 'ladders', prefix: 'ladder_', fields: Object.freeze(['x', 'y', 'w', 'h', 'tiling']) }),
  signpost: Object.freeze({ list: 'signposts', prefix: 'signpost_', fields: Object.freeze(['x', 'y', 'w', 'h']) }),
  // Zone ambient effects (js/street-effects.js): steam vents, lava squirts, embers.
  emitter: Object.freeze({ list: 'emitters', prefix: 'fx_', fields: Object.freeze(['kind', 'layer', 'x', 'y', 'sprite', 'rate', 'size', 'height', 'spread', 'period', 'burst', 'hidden']) }),
});
export const CONNECT_FIELDS = Object.freeze(['tsid', 'label', 'hub_id', 'hidden', 'arrive']);
/** A zone edit's fields (schema $defs/streetEdit) and its two kinds. */
export const EDIT_FIELDS = Object.freeze(['tsid', 'op', 'signpost', 'connect', 'newSignpost']);
export const EDIT_KINDS = Object.freeze(['add-connect', 'add-signpost']);
/** Fields whose null is a value (a perm of null is hard both ways), not a missing value. */
const NULLABLE = Object.freeze(['pc_perm', 'item_perm']);

const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

function need(cond, code, message) {
  if (!cond) throw new OpError(code, message);
}

/** The zone's street row for a key. */
export function streetRow(zone, key) {
  const row = (zone.streets || []).find((s) => s.key === key);
  need(row, 'builder_no_street', `No street "${key}" in this draft.`);
  return row;
}

/** [layer, index] of a deco by id in a street. */
export function findDeco(street, id) {
  for (const layer of street.layers || []) {
    const i = (layer.decos || []).findIndex((d) => d.id === id);
    if (i >= 0) return [layer, i];
  }
  return [null, -1];
}

export function findLayer(street, id) {
  const layer = (street.layers || []).find((l) => l.id === id);
  need(layer, 'builder_no_layer', `No layer "${id}" on this street.`);
  return layer;
}

/** PURE: the next free deco id on a street, d_<n>. */
export function nextDecoId(street, taken = new Set()) {
  let n = 0;
  for (const layer of street.layers || []) {
    for (const d of layer.decos || []) {
      const m = /^d_(\d+)$/.exec(String(d.id || ''));
      if (m) n = Math.max(n, Number(m[1]));
    }
  }
  for (const t of taken) {
    const m = /^d_(\d+)$/.exec(String(t));
    if (m) n = Math.max(n, Number(m[1]));
  }
  return `d_${n + 1}`;
}

/** PURE: the next free id of a geometry kind on a street (plat_<n>, wall_<n>, ladder_<n>, signpost_<n>). */
export function nextGeometryId(street, kind) {
  need(own(GEOMETRY, kind), 'builder_bad_op', `No geometry kind "${kind}".`);
  const g = GEOMETRY[kind];
  let n = 0;
  for (const item of street[g.list] || []) {
    const m = /^(\d+)$/.exec(String(item?.id || '').slice(g.prefix.length));
    if (String(item?.id || '').startsWith(g.prefix) && m) n = Math.max(n, Number(m[1]));
  }
  return `${g.prefix}${n + 1}`;
}

/** [list, index] of a geometry item by id (list is null when the street has none). */
export function findGeometry(street, kind, id) {
  const list = street[GEOMETRY[kind].list];
  if (!Array.isArray(list)) return [null, -1];
  return [list, list.findIndex((g) => g.id === id)];
}

/** Put an object's keys in `order` (the keys it names first, the rest after, as they are). */
function reorder(target, order) {
  if (!Array.isArray(order)) return;
  const keys = [...order.filter((k) => own(target, k)), ...Object.keys(target).filter((k) => !order.includes(k))];
  const values = keys.map((k) => target[k]);
  for (const k of Object.keys(target)) delete target[k];
  keys.forEach((k, i) => { target[k] = values[i]; });
}

/**
 * Set and unset fields of `target` limited to `allowed`; returns the inverse {set, unset, order?}.
 * A set keeps an existing key in place; a removed key goes back where it was through `order`.
 */
function patch(target, set, unset, allowed, what, order, nullable = []) {
  need(isObj(set || {}), 'builder_bad_op', `${what}: set must be an object.`);
  need(Array.isArray(unset || []), 'builder_bad_op', `${what}: unset must be a list.`);
  const inv = { set: {}, unset: [] };
  for (const k of Object.keys(set || {})) {
    need(allowed.includes(k), 'builder_bad_op', `${what}: "${k}" cannot be set here.`);
    need(set[k] !== undefined && (set[k] !== null || nullable.includes(k)), 'builder_bad_op', `${what}: "${k}" needs a value (unset removes a field).`);
  }
  for (const k of unset || []) need(allowed.includes(k), 'builder_bad_op', `${what}: "${k}" cannot be unset here.`);
  for (const k of Object.keys(set || {})) {
    if (own(target, k)) inv.set[k] = clone(target[k]);
    else inv.unset.push(k);
  }
  const before = Object.keys(target);
  let removed = false;
  for (const k of unset || []) {
    if (own(target, k) && !own(set || {}, k)) {
      inv.set[k] = clone(target[k]);
      removed = true;
    }
  }
  for (const k of Object.keys(set || {})) target[k] = clone(set[k]);
  for (const k of unset || []) if (!own(set || {}, k)) delete target[k];
  reorder(target, order);
  if (removed) inv.order = before;
  return inv;
}

/**
 * Apply one op to the zone (mutating it); returns { inverse, changed } where `changed` lists the
 * things touched as "<street>/<id>" (or "<street>", "zone", "hub", "asset:<name>").
 */
export function applyOp(zone, op) {
  need(isObj(op) && typeof op.op === 'string', 'builder_bad_op', 'An op is an object with an "op" name.');
  switch (op.op) {
    case 'zone.set': {
      const inv = patch(zone, op.set, op.unset, ZONE_FIELDS, 'zone.set', op.order);
      return { inverse: { op: 'zone.set', ...inv }, changed: ['zone'] };
    }
    case 'hub.set': {
      need(op.hub === null || isObj(op.hub), 'builder_bad_op', 'hub.set needs a hub or null.');
      const before = own(zone, 'hub') ? clone(zone.hub) : null;
      const keys = Object.keys(zone);
      if (op.hub === null) delete zone.hub;
      else zone.hub = clone(op.hub);
      reorder(zone, op.order);
      const inverse = { op: 'hub.set', hub: before };
      if (op.hub === null && before !== null) inverse.order = keys;
      return { inverse, changed: ['hub'] };
    }
    case 'asset.set': {
      need(typeof op.name === 'string' && op.name !== '', 'builder_bad_op', 'asset.set needs a name.');
      need(op.asset === null || isObj(op.asset), 'builder_bad_op', 'asset.set needs an asset or null.');
      if (!isObj(zone.assets)) zone.assets = {};
      const before = own(zone.assets, op.name) ? clone(zone.assets[op.name]) : null;
      const keys = Object.keys(zone.assets);
      if (op.asset === null) delete zone.assets[op.name];
      else zone.assets[op.name] = clone(op.asset);
      reorder(zone.assets, op.order);
      const inverse = { op: 'asset.set', name: op.name, asset: before };
      if (op.asset === null && before !== null) inverse.order = keys;
      return { inverse, changed: [`asset:${op.name}`] };
    }
    case 'street.add': {
      const row = op.draftStreet;
      need(isObj(row) && row.key === op.street && isObj(row.street), 'builder_bad_op', 'street.add needs a draftStreet whose key is the op\'s street.');
      need(!(zone.streets || []).some((s) => s.key === op.street), 'builder_exists', `This draft already has a street "${op.street}".`);
      need(!(zone.streets || []).some((s) => s.street?.tsid === row.street.tsid), 'builder_exists', `This draft already has a street ${row.street.tsid}.`);
      if (!Array.isArray(zone.streets)) zone.streets = [];
      const at = Number.isInteger(op.at) ? Math.max(0, Math.min(op.at, zone.streets.length)) : zone.streets.length;
      zone.streets.splice(at, 0, clone(row));
      return { inverse: { op: 'street.remove', street: op.street }, changed: [op.street] };
    }
    case 'street.remove': {
      const row = streetRow(zone, op.street);
      const at = zone.streets.indexOf(row);
      zone.streets.splice(at, 1);
      return { inverse: { op: 'street.add', street: op.street, draftStreet: row, at }, changed: [op.street] };
    }
    case 'street.set': {
      const street = streetRow(zone, op.street).street;
      const inv = patch(street, op.set, op.unset, STREET_FIELDS, 'street.set', op.order);
      return { inverse: { op: 'street.set', street: op.street, ...inv }, changed: [op.street] };
    }
    case 'editor.set': {
      const row = streetRow(zone, op.street);
      need(op.editor === null || isObj(op.editor), 'builder_bad_op', 'editor.set needs editor state or null.');
      const before = own(row, 'editor') ? clone(row.editor) : null;
      const keys = Object.keys(row);
      if (op.editor === null) delete row.editor;
      else row.editor = clone(op.editor);
      reorder(row, op.order);
      const inverse = { op: 'editor.set', street: op.street, editor: before };
      if (op.editor === null && before !== null) inverse.order = keys;
      return { inverse, changed: [`${op.street}/editor`] };
    }
    case 'layer.set': {
      const layer = findLayer(streetRow(zone, op.street).street, op.layer);
      const inv = patch(layer, op.set, op.unset, LAYER_FIELDS, 'layer.set', op.order);
      return { inverse: { op: 'layer.set', street: op.street, layer: op.layer, ...inv }, changed: [`${op.street}/${op.layer}`] };
    }
    case 'deco.add': {
      const street = streetRow(zone, op.street).street;
      const layer = findLayer(street, op.layer);
      const deco = op.deco;
      need(isObj(deco) && typeof deco.id === 'string' && deco.id !== '' && typeof deco.sprite === 'string', 'builder_bad_op', 'deco.add needs a deco with an id and a sprite.');
      need(findDeco(street, deco.id)[0] === null, 'builder_exists', `A deco ${deco.id} is already on this street.`);
      for (const k of Object.keys(deco)) need(k === 'id' || DECO_FIELDS.includes(k), 'builder_bad_op', `deco.add: "${k}" is not a deco field.`);
      if (!Array.isArray(layer.decos)) layer.decos = [];
      const at = Number.isInteger(op.at) ? Math.max(0, Math.min(op.at, layer.decos.length)) : layer.decos.length;
      layer.decos.splice(at, 0, clone(deco));
      return { inverse: { op: 'deco.remove', street: op.street, id: deco.id }, changed: [`${op.street}/${deco.id}`] };
    }
    case 'deco.remove': {
      const street = streetRow(zone, op.street).street;
      const [layer, i] = findDeco(street, op.id);
      need(layer, 'builder_no_deco', `No deco ${op.id} on this street.`);
      const [deco] = layer.decos.splice(i, 1);
      return { inverse: { op: 'deco.add', street: op.street, layer: layer.id, deco, at: i }, changed: [`${op.street}/${op.id}`] };
    }
    case 'deco.set': {
      const street = streetRow(zone, op.street).street;
      const [layer, i] = findDeco(street, op.id);
      need(layer, 'builder_no_deco', `No deco ${op.id} on this street.`);
      const inv = patch(layer.decos[i], op.set, op.unset, DECO_FIELDS, 'deco.set', op.order);
      return { inverse: { op: 'deco.set', street: op.street, id: op.id, ...inv }, changed: [`${op.street}/${op.id}`] };
    }
    case 'deco.move': {
      const street = streetRow(zone, op.street).street;
      const [from, i] = findDeco(street, op.id);
      need(from, 'builder_no_deco', `No deco ${op.id} on this street.`);
      const to = findLayer(street, op.layer);
      const [deco] = from.decos.splice(i, 1);
      const inv = patch(deco, op.set || {}, [], ['x', 'y'], 'deco.move');
      if (!Array.isArray(to.decos)) to.decos = [];
      const at = Number.isInteger(op.at) ? Math.max(0, Math.min(op.at, to.decos.length)) : to.decos.length;
      to.decos.splice(at, 0, deco);
      const back = { op: 'deco.move', street: op.street, id: op.id, layer: from.id, at: i };
      if (Object.keys(inv.set).length) back.set = inv.set;
      return { inverse: back, changed: [`${op.street}/${op.id}`] };
    }
    case 'connect.add': {
      const street = streetRow(zone, op.street).street;
      const [list, i] = findGeometry(street, 'signpost', op.signpost);
      need(i >= 0, 'builder_no_signpost', `No signpost ${op.signpost} on this street.`);
      const post = list[i];
      const c = op.connect;
      need(isObj(c) && typeof c.tsid === 'string' && typeof c.label === 'string', 'builder_bad_op', 'connect.add needs a connect with a tsid and a label.');
      for (const k of Object.keys(c)) need(CONNECT_FIELDS.includes(k), 'builder_bad_op', `connect.add: "${k}" is not a connect field.`);
      if (!Array.isArray(post.connects)) post.connects = [];
      const at = Number.isInteger(op.at) ? Math.max(0, Math.min(op.at, post.connects.length)) : post.connects.length;
      post.connects.splice(at, 0, clone(c));
      return { inverse: { op: 'connect.remove', street: op.street, signpost: op.signpost, at }, changed: [`${op.street}/${op.signpost}`] };
    }
    case 'connect.remove': {
      const street = streetRow(zone, op.street).street;
      const [list, i] = findGeometry(street, 'signpost', op.signpost);
      need(i >= 0, 'builder_no_signpost', `No signpost ${op.signpost} on this street.`);
      const post = list[i];
      need(Number.isInteger(op.at) && op.at >= 0 && op.at < (post.connects || []).length, 'builder_no_connect', `Signpost ${op.signpost} has no arm ${op.at}.`);
      const [c] = post.connects.splice(op.at, 1);
      return { inverse: { op: 'connect.add', street: op.street, signpost: op.signpost, connect: c, at: op.at }, changed: [`${op.street}/${op.signpost}`] };
    }
    case 'connect.set': {
      const street = streetRow(zone, op.street).street;
      const [list, i] = findGeometry(street, 'signpost', op.signpost);
      need(i >= 0, 'builder_no_signpost', `No signpost ${op.signpost} on this street.`);
      const post = list[i];
      need(Number.isInteger(op.at) && op.at >= 0 && op.at < (post.connects || []).length, 'builder_no_connect', `Signpost ${op.signpost} has no arm ${op.at}.`);
      const inv = patch(post.connects[op.at], op.set, op.unset, CONNECT_FIELDS, 'connect.set', op.order);
      return { inverse: { op: 'connect.set', street: op.street, signpost: op.signpost, at: op.at, ...inv }, changed: [`${op.street}/${op.signpost}`] };
    }
    case 'population.set': {
      const row = streetRow(zone, op.street);
      need(op.population === null || (isObj(op.population) && isObj(op.population.counts)), 'builder_bad_op', 'population.set needs a population with counts, or null.');
      const before = own(row, 'population') ? clone(row.population) : null;
      const keys = Object.keys(row);
      if (op.population === null) delete row.population;
      else row.population = clone(op.population);
      reorder(row, op.order);
      const inverse = { op: 'population.set', street: op.street, population: before };
      if (op.population === null && before !== null) inverse.order = keys;
      return { inverse, changed: [`${op.street}/population`] };
    }
    case 'hubmap.set': {
      need(isObj(zone.hub), 'builder_no_hub', 'This draft has no hub yet.');
      need(op.map === null || (isObj(op.map) && Array.isArray(op.map.streets)), 'builder_bad_op', 'hubmap.set needs a map with a streets list, or null.');
      const before = own(zone.hub, 'map') ? clone(zone.hub.map) : null;
      const keys = Object.keys(zone.hub);
      if (op.map === null) delete zone.hub.map;
      else zone.hub.map = clone(op.map);
      reorder(zone.hub, op.order);
      const inverse = { op: 'hubmap.set', map: before };
      if (op.map === null && before !== null) inverse.order = keys;
      return { inverse, changed: ['hub'] };
    }
    case 'edit.add': {
      const e = op.edit;
      need(isObj(e) && typeof e.tsid === 'string' && EDIT_KINDS.includes(e.op), 'builder_bad_op', 'edit.add needs an edit with a tsid and an op (add-connect or add-signpost).');
      for (const k of Object.keys(e)) need(EDIT_FIELDS.includes(k), 'builder_bad_op', `edit.add: "${k}" is not an edit field.`);
      const c = e.op === 'add-connect' ? e.connect : null;
      if (e.op === 'add-connect') need(typeof e.signpost === 'string' && e.signpost !== '' && isObj(c) && typeof c.tsid === 'string' && typeof c.label === 'string', 'builder_bad_op', 'An add-connect edit names a signpost and a connect with a tsid and a label.');
      else need(isObj(e.newSignpost), 'builder_bad_op', 'An add-signpost edit carries the new signpost.');
      if (c) for (const k of Object.keys(c)) need(CONNECT_FIELDS.includes(k), 'builder_bad_op', `edit.add: "${k}" is not a connect field.`);
      const fresh = !Array.isArray(zone.edits);
      if (fresh) zone.edits = [];
      const at = Number.isInteger(op.at) ? Math.max(0, Math.min(op.at, zone.edits.length)) : zone.edits.length;
      zone.edits.splice(at, 0, clone(e));
      reorder(zone, op.order);
      const inverse = { op: 'edit.remove', at };
      if (fresh) inverse.prune = true;
      return { inverse, changed: ['edits'] };
    }
    case 'edit.remove': {
      const list = Array.isArray(zone.edits) ? zone.edits : [];
      need(Number.isInteger(op.at) && op.at >= 0 && op.at < list.length, 'builder_no_edit', `This draft has no edit ${op.at}.`);
      const keys = Object.keys(zone);
      const [e] = list.splice(op.at, 1);
      const inverse = { op: 'edit.add', edit: e, at: op.at };
      if (op.prune === true && list.length === 0) {
        delete zone.edits;
        inverse.order = keys;
      }
      return { inverse, changed: ['edits'] };
    }
    default: {
      const [kind, verb] = String(op.op).split('.');
      if (own(GEOMETRY, kind) && ['add', 'remove', 'set'].includes(verb)) return applyGeometryOp(zone, op, kind, verb);
      throw new OpError('builder_bad_op', `Unknown op "${op.op}".`);
    }
  }
}

/** platform.*, barrier.*, ladder.*, signpost.* and emitter.* (see the header). */
function applyGeometryOp(zone, op, kind, verb) {
  const g = GEOMETRY[kind];
  const street = streetRow(zone, op.street).street;
  if (verb === 'add') {
    const item = op[kind];
    need(isObj(item), 'builder_bad_op', `${op.op} needs a ${kind}.`);
    const allowed = kind === 'signpost' ? [...g.fields, 'connects'] : g.fields;
    for (const k of Object.keys(item)) need(k === 'id' || allowed.includes(k), 'builder_bad_op', `${op.op}: "${k}" is not a ${kind} field.`);
    need(item.id === undefined || (typeof item.id === 'string' && item.id !== ''), 'builder_bad_op', `${op.op}: an id is a string.`);
    if (kind === 'signpost' && item.connects !== undefined) {
      need(Array.isArray(item.connects), 'builder_bad_op', 'signpost.add: connects is a list.');
      for (const c of item.connects) {
        need(isObj(c) && typeof c.tsid === 'string' && typeof c.label === 'string', 'builder_bad_op', 'signpost.add: each connect has a tsid and a label.');
        for (const k of Object.keys(c)) need(CONNECT_FIELDS.includes(k), 'builder_bad_op', `signpost.add: "${k}" is not a connect field.`);
      }
    }
    const id = item.id === undefined ? nextGeometryId(street, kind) : item.id;
    need(findGeometry(street, kind, id)[1] < 0, 'builder_exists', `A ${kind} ${id} is already on this street.`);
    const copy = item.id === undefined ? { id, ...clone(item) } : clone(item);
    const fresh = !Array.isArray(street[g.list]);
    if (fresh) street[g.list] = [];
    const list = street[g.list];
    const at = Number.isInteger(op.at) ? Math.max(0, Math.min(op.at, list.length)) : list.length;
    list.splice(at, 0, copy);
    reorder(street, op.order);
    const inverse = { op: `${kind}.remove`, street: op.street, id };
    if (fresh) inverse.prune = true;
    return { inverse, changed: [`${op.street}/${id}`] };
  }
  const [list, i] = findGeometry(street, kind, op.id);
  need(i >= 0, `builder_no_${kind}`, `No ${kind} ${op.id} on this street.`);
  if (verb === 'remove') {
    const keys = Object.keys(street);
    const [item] = list.splice(i, 1);
    const inverse = { op: `${kind}.add`, street: op.street, [kind]: item, at: i };
    if (op.prune === true && list.length === 0) {
      delete street[g.list];
      inverse.order = keys;
    }
    return { inverse, changed: [`${op.street}/${op.id}`] };
  }
  const inv = patch(list[i], op.set, op.unset, g.fields, op.op, op.order, NULLABLE);
  return { inverse: { op: op.op, street: op.street, id: op.id, ...inv }, changed: [`${op.street}/${op.id}`] };
}

/**
 * Apply a batch, all or nothing: on a failing op the zone is left as it was and the error carries
 * `index`. Returns { inverses (in undo order: last op's inverse first), changed }.
 */
export function applyOps(zone, ops) {
  need(Array.isArray(ops), 'builder_bad_op', 'ops must be a list.');
  const done = [];
  const changed = [];
  for (let i = 0; i < ops.length; i += 1) {
    try {
      const r = applyOp(zone, ops[i]);
      done.push(r.inverse);
      for (const c of r.changed) if (!changed.includes(c)) changed.push(c);
    } catch (err) {
      for (let j = done.length - 1; j >= 0; j -= 1) applyOp(zone, done[j]);
      if (err instanceof OpError) err.index = i;
      throw err;
    }
  }
  return { inverses: done.reverse(), changed };
}

/** PURE: a short words summary of a batch for the log ("3 deco.set, 1 deco.add"). */
export function opsSummary(ops) {
  const n = new Map();
  for (const op of ops || []) n.set(op?.op, (n.get(op?.op) || 0) + 1);
  return [...n].map(([k, v]) => `${v} ${k}`).join(', ');
}
