/**
 * LEVEL BUILDER (spec 6.3, phase P3): new streets from templates, new hubs and the hub map.
 * Pure: no DOM, no Pixi.
 *
 * A template is a layer stack (names, z, sizes as a part of the street, default filters) plus a
 * floor line and a sky gradient, all read from a measured style profile
 * (assets/content/style-profiles.json, tools/builder/style-profile.mjs, spec 9.2):
 *
 *   Meadow  the Standard stack (sky, bg_1, middleground, middleplus), from Groddle Meadow (hub 58)
 *   Tall    Vertical Parallax: the same stack 2,400 high, its back layers a little shorter than the
 *           street as Tiny Speck's tall streets have them (tallLayerHeight), so they move up and down a
 *           little slower and their bottoms stay behind the floor's ground at every camera position
 *   Forest  sky, bg_2, bg_1, middleground, middleplus and a foreground, from Groddle Forest (hub 56)
 *   Cave    a dark stack with a foreground, from Ilmenskie Caverns (hub 50)
 *   Blank   the middleground only, with the world's usual sky
 *
 * Each also lays a strip of its hub's usual ground deco along the floor (the most placed long
 * ground piece there: evenground_platform_long in the meadow, dirt_platform_long in the forest,
 * cave_gr_texture_2 in the caverns), so the street has art to stand on from the start (the game
 * will not load a street without a deco, street-model.js assertStreetGeometry).
 *
 * A profile's role reads { z: [median, min, max], w: [p10, median, p90] (layer width / street
 * width), h: same for height, filters: { name: { n, band: [p10, median, p90] } } }. A filter is
 * part of a template when at least half that role's layers carry it; its value is the median.
 */
import { newTsid, libraryAsset } from './zone.js?v=6a3db28e';

export const TEMPLATES = Object.freeze([
  Object.freeze({ id: 'meadow', name: 'Meadow', words: 'Sky, one back layer, the middleground and a near layer (the Standard stack).', profile: 'hub-58', height: 1000, ground: 'evenground_platform_long', roles: Object.freeze(['sky', 'bg_1', 'middleground', 'middleplus']) }),
  Object.freeze({ id: 'tall', name: 'Tall', words: 'The Standard stack, 2,400 high, its back layers moving up and down a little slower (Vertical Parallax).', profile: 'default', height: 2400, ground: 'evenground_platform_long', roles: Object.freeze(['sky', 'bg_1', 'middleground', 'middleplus']), vertical: true }),
  Object.freeze({ id: 'forest', name: 'Forest', words: 'Two back layers and a foreground, with a forest\'s sky and colours.', profile: 'hub-56', height: 1000, ground: 'dirt_platform_long', roles: Object.freeze(['sky', 'bg_2', 'bg_1', 'middleground', 'middleplus', 'foreground']) }),
  Object.freeze({ id: 'cave', name: 'Cave', words: 'A dark sky and back layers, with a foreground, from the caverns.', profile: 'hub-50', height: 1000, ground: 'cave_gr_texture_2', roles: Object.freeze(['sky', 'bg_1', 'middleground', 'middleplus', 'foreground']) }),
  Object.freeze({ id: 'blank', name: 'Blank', words: 'The middleground only, with the world\'s usual sky.', profile: 'default', height: 1000, ground: 'evenground_platform_long', roles: Object.freeze(['middleground']) }),
]);

export const WIDTH = Object.freeze({ min: 1000, max: 8000, default: 3000 });
export const HEIGHT = Object.freeze({ min: 600, max: 6000 });
/** How far above the street's bottom the floor line runs, and how far in from each end. */
export const FLOOR_Y = -60;
export const FLOOR_INSET = 20;
/** The builder's hub ids (spec 4: Tiny Speck's run 1-143). */
export const NEW_HUB_MIN = 900;
export const NEW_HUB_MAX = 999;
export const MAP_W = 760;
export const MAP_H = 460;
/** A new hub's map colours: Groddle Meadow's (hub-58.json). */
export const DEFAULT_MAP_COLOURS = Object.freeze({ color: '#1d3a80', top_color: '#989cb6', btm_color: '#6a6d7f' });

const ROLE_OF = (id) => (/^bg_\d$/.test(id) ? 'bg' : id);

/**
 * Tiny Speck's tall streets (203 at 1,800 px or more; Janagi Elations GA911QQIDI32J6R, 2,700 high:
 * its back layers 2,646, 2,592 and 2,511) make a back layer only a little shorter than the street,
 * by its depth: the median height is 99% at z -1, 98% at -2 and 95-97% deeper, whatever its width
 * (they are 66-90% as wide). So 1% a step of z, at most 4%, and at most TALL_SHRINK_MAX px.
 */
export const TALL_SHRINK = Object.freeze({ perZ: 0.01, max: 0.04 });
/**
 * A back layer's bottom slides from its own height (camera at the top) to the street's bottom
 * (camera at the bottom): a render of the whole street (8.5 full: the camera at the street's
 * middle) puts it half the shortfall over the street's bottom. Keeping the shortfall at most
 * 2 x (the floor's 60 px over the bottom) keeps it under the floor line there, and in play the
 * floor is only in view when the camera is near the bottom, where the layer's bottom is too.
 */
export const TALL_SHRINK_MAX_PX = 2 * -FLOOR_Y;

/** PURE: a back layer's height on a Tall street, by its z (TALL_SHRINK). */
export function tallLayerHeight(h, z) {
  const share = Math.min(TALL_SHRINK.max, TALL_SHRINK.perZ * Math.abs(Math.min(0, Number(z) || 0)));
  return Math.round(h - Math.min(h * share, TALL_SHRINK_MAX_PX));
}
const FILTER_NAMES = ['brightness', 'contrast', 'saturation', 'blur'];
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/** PURE: the template with this id (Meadow when unknown). */
export function templateOf(id) {
  return TEMPLATES.find((t) => t.id === id) || TEMPLATES[0];
}

/** PURE: a profile from style-profiles.json by name, falling back to the world's. */
export function profileOf(profiles, name) {
  const all = profiles?.profiles || {};
  return all[name] || all.default || null;
}

/** PURE: HSL (h in degrees, s and l 0..1) to the street gradient's hex (RRGGBB, no #). */
export function hslHex(h, s, l) {
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0), f(8), f(4)].map((v) => Math.round(clamp(v, 0, 1) * 255).toString(16).padStart(2, '0')).join('').toUpperCase();
}

/** PURE: a profile's typical sky (the median hue, saturation and lightness, top and bottom). */
export function gradientFrom(profile) {
  const g = profile?.gradient;
  if (!g?.top || !g?.bottom) return { top: '87A8C9', bottom: 'FFE7A0' };
  const pick = (end) => hslHex(Number(end.hue?.[1]) || 0, clamp(Number(end.s) || 0, 0, 1), clamp(Number(end.l?.[1]) || 0, 0, 1));
  return { top: pick(g.top), bottom: pick(g.bottom) };
}

/** PURE: a role's default filters (those on at least half its layers, at their median). */
export function filtersFor(roleRow) {
  const out = {};
  const layers = Number(roleRow?.layers) || 0;
  for (const name of FILTER_NAMES) {
    const f = roleRow?.filters?.[name];
    if (!f || !layers || f.n < layers / 2) continue;
    const v = Math.round(Number(f.band?.[1]) || 0);
    if (v !== 0) out[name] = clamp(v, name === 'blur' ? 0 : -100, 100);
  }
  return out;
}

/**
 * PURE: the layer stack of a template for a street of w x h. Back layers take the profile's
 * median z (kept below the layer in front of them), width and filters.
 */
export function templateLayers(template, profile, w, h) {
  const roles = profile?.roles || {};
  const out = [];
  const back = template.roles.slice(0, template.roles.indexOf('middleground')).reverse();
  let z = 0;
  for (const id of back) {
    const row = roles[ROLE_OF(id)];
    const want = Math.round(Number(row?.z?.[0]) || -1);
    z = Math.min(want, z - 1);
    // bg_2 behind bg_1: the second back layer is narrower, as Tiny Speck's are (spec 9.2).
    const ratio = clamp((Number(row?.w?.[1]) || 0.9) - (id === 'bg_2' ? 0.07 : 0), 0.5, 1.2);
    const lh = template.vertical ? tallLayerHeight(h, z) : Math.round(h * clamp(Number(row?.h?.[1]) || 1, 0.5, 1.2));
    out.unshift({ id, name: id, z, w: Math.round(w * ratio), h: lh, filters: filtersFor(row), decos: [] });
  }
  out.push({ id: 'middleground', name: 'middleground', z: 0, w, h, decos: [] });
  let front = 0;
  for (const id of template.roles.slice(template.roles.indexOf('middleground') + 1)) {
    const row = roles[ROLE_OF(id)];
    front = Math.max(Math.round(Number(row?.z?.[0]) || 1), front + 1);
    const ratio = clamp(Number(row?.w?.[1]) || 1, 1, 1.2);
    out.push({ id, name: id, z: front, w: Math.round(w * ratio), h: Math.round(h * clamp(Number(row?.h?.[1]) || 1, 1, 1.2)), filters: filtersFor(row), decos: [] });
  }
  for (const l of out) if (!Object.keys(l.filters || {}).length) delete l.filters;
  return out;
}

/** Ground pieces when the catalog is not to hand: median drawn size and art set (measured 2026-10-30). */
const GROUND = Object.freeze({
  evenground_platform_long: Object.freeze({ size: [1215, 67], bundle: 'groddle1' }),
  dirt_platform_long: Object.freeze({ size: [1226, 67], bundle: 'groddle1' }),
  cave_gr_texture_2: Object.freeze({ size: [333, 79], bundle: 'zutto1' }),
});

/**
 * PURE: the template's ground strip along the floor line: its ground deco end to end with a
 * little overlap, its top a quarter of its height over the floor.
 */
export function groundStrip(template, l, r, catalog = null) {
  const name = template.ground;
  if (!name) return [];
  const row = catalog?.get?.(name);
  const [w, h] = row?.drawn ? [row.drawn.w_med, row.drawn.h_med] : GROUND[name]?.size || [400, 70];
  const step = Math.max(50, Math.round(w * 0.9));
  const out = [];
  for (let x = l + Math.round(w / 2) - 10; ; x += step) {
    const at = Math.min(x, Math.round(r - w / 2 + 10));
    out.push({ id: `d_${out.length + 1}`, sprite: name, x: at, y: FLOOR_Y + Math.round(h * 0.75), w: Math.round(w), h: Math.round(h), z: out.length % 2, r: 0 });
    if (at + w / 2 >= r || out.length >= 40) break;
  }
  return out;
}

/**
 * PURE: a new draft street from a template (spec 6.3): `{ key, street, population }`, ready for
 * street.add (newStreetOps adds its art's provenance and its hub map line). The street is centred
 * on x 0 with its bottom at y 0: one floor line across it, a ground strip on it and the
 * template's sky. `catalog` (deco-catalog.json rows by name) sizes the ground.
 *
 * @param {{ zoneId: string, key: string, label: string, template?: string, width?: number,
 *   height?: number, hub: {id: string, name: string}, profiles: object, tsid?: string,
 *   catalog?: Map<string, object> }} o
 */
export function newStreet({ zoneId, key, label, template = 'meadow', width, height, hub, profiles, tsid = newTsid(), catalog = null }) {
  const t = templateOf(template);
  const w = Math.round(clamp(Number(width) || WIDTH.default, WIDTH.min, WIDTH.max));
  const h = Math.round(clamp(Number(height) || t.height, HEIGHT.min, HEIGHT.max));
  const profile = profileOf(profiles, t.profile);
  const l = -Math.round(w / 2);
  const r = l + w;
  const street = {
    source: `groddle-builder ${zoneId}`,
    tsid,
    label: String(label).slice(0, 48),
    hubId: String(hub?.id ?? ''),
    hubName: String(hub?.name ?? ''),
    bounds: { l, r, t: -h, b: 0 },
    gradient: gradientFrom(profile),
    platforms: [{ id: 'plat_1', x1: l + FLOOR_INSET, y1: FLOOR_Y, x2: r - FLOOR_INSET, y2: FLOOR_Y, pc_perm: -1, item_perm: -1 }],
    layers: templateLayers(t, profile, w, h),
    signposts: [],
    // No noMap: a zone street shows its own street map (spec 15 Q11). Zones stay off the world
    // map, the region lists and Completist through the zone markers (index and hub map rows'
    // `zone`, js/zone-streets.js), not through Tiny Speck's no_map flag, which hides the minimap.
  };
  const ground = groundStrip(t, l, r, catalog);
  street.layers.find((x) => x.id === 'middleground').decos = ground;
  street.stats = { platformCount: 1, layerCount: street.layers.length, decoCount: ground.length, signpostCount: 0 };
  return { key, street, population: { counts: {} } };
}

/**
 * PURE: the ops that add a new street to a zone: provenance rows for its library art not in the
 * zone yet, the street, and (a new hub) its line on the hub map. One undo step in the editor.
 */
export function newStreetOps(zone, draftStreet, catalog = null) {
  const ops = [];
  const seen = new Set();
  for (const l of draftStreet.street.layers || []) for (const d of l.decos || []) {
    if (seen.has(d.sprite) || zone.assets?.[d.sprite]) continue;
    seen.add(d.sprite);
    const row = catalog?.get?.(d.sprite);
    const source = row?.source || `${GROUND[d.sprite]?.bundle || 'groddle1'}.swf#${d.sprite}`;
    ops.push({ op: 'asset.set', name: d.sprite, asset: row ? libraryAsset(row) : { origin: 'tinyspeck-cc0', licence: 'CC0-1.0', source } });
  }
  ops.push({ op: 'street.add', street: draftStreet.key, draftStreet });
  if (zone.hub?.isNew) ops.push({ op: 'hubmap.set', map: mapWithStreet(zone.hub.map, { tsid: draftStreet.street.tsid, name: draftStreet.street.label }) });
  return ops;
}

/** PURE: the next free builder hub id (900-999), given the ids other drafts already use. */
export function nextHubId(taken = []) {
  const used = new Set([...taken].map((x) => Number(x)));
  for (let id = NEW_HUB_MIN; id <= NEW_HUB_MAX; id += 1) if (!used.has(id)) return String(id);
  return null;
}

/** PURE: a new hub (spec 6.3): an id from 900, a name and Groddle Meadow's map colours. */
export function newHub({ id, name }) {
  return { id: String(id), name: String(name).slice(0, 40), isNew: true, map: { ...DEFAULT_MAP_COLOURS, streets: [] } };
}

/**
 * PURE: where a new street's line goes on the hub map: on from the last line's end (as streets
 * join on Tiny Speck's maps), else across the middle; kept inside the 760 x 460 map.
 */
export function nextMapLine(map, { tsid, name }) {
  const lines = map?.streets || [];
  const last = lines[lines.length - 1];
  const len = 160;
  let x1 = 200;
  let y1 = 230;
  if (last) {
    x1 = last.x2;
    y1 = last.y2;
  }
  let x2 = x1 + len;
  let y2 = y1;
  if (x2 > MAP_W - 20) {
    x2 = x1;
    y2 = y1 + 80 > MAP_H - 20 ? y1 - 80 : y1 + 80;
  }
  const c = (v, max) => Math.round(clamp(v, 0, max));
  return { tsid, name: String(name), x1: c(x1, MAP_W), y1: c(y1, MAP_H), x2: c(x2, MAP_W), y2: c(y2, MAP_H) };
}

/** PURE: the hub map with a street's line added (or its name brought up to date). */
export function mapWithStreet(map, street) {
  const base = map || { ...DEFAULT_MAP_COLOURS, streets: [] };
  const lines = base.streets || [];
  const i = lines.findIndex((x) => x.tsid === street.tsid);
  if (i >= 0) return { ...base, streets: lines.map((x, j) => (j === i ? { ...x, name: String(street.name) } : x)) };
  return { ...base, streets: [...lines, nextMapLine(base, street)] };
}

/** PURE: the hub map without a street's line (a street removed from the zone). */
export function mapWithoutStreet(map, tsid) {
  if (!map) return map;
  return { ...map, streets: (map.streets || []).filter((x) => x.tsid !== tsid) };
}
