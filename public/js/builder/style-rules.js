/**
 * LEVEL BUILDER validator: the style rules STY-001 to STY-005 (spec 7.3, 9.2; phase P5).
 *
 * Pure: no DOM, no Pixi, no fetch. js/builder/validate.js imports these and runs them with the
 * other rules; each returns findings in the spec 7.2 format:
 *
 *   { rule, severity, street, at, message, where?, data, fix, fingerprint }
 *
 * - `street` is the draft street's key, `at` is "<key>", "<key>/<layer id>" or "<key>/<deco id>";
 * - `where` (STY-005 only) is the deco's anchor, space "world" (the middleground) or "layer";
 * - `fingerprint` is 16 hex over the rule, the place and the values the finding is about, so a
 *   waiver stops matching when those change.
 *
 * Every rule takes (draftStreet, ctx):
 *
 *   draftStreet  a zone's streets[] row, { key, street } (a bare street works too; key "street")
 *   ctx.profiles the parsed public/assets/content/style-profiles.json (tools/builder/style-profile.mjs)
 *   ctx.catalog  a Map of deco catalog rows by name (public/assets/content/deco-catalog.json), for STY-005
 *
 * Bands come from the street's hub profile when that hub has at least MIN_HUB_STREETS streets with
 * the role, else from the whole world ("default"). Bands are advice (spec 9.2): every STY finding
 * is warn or info, never an error.
 *
 * Exports: STY_RULES (id, severity, title, check), styleFindings(draftStreet, ctx) (all five),
 * sty001 to sty005, profileFor, bandOf, namedRole and fingerprint.
 */
import { layerRole } from './layer-role.js?v=e585f610';

export const MIN_HUB_STREETS = 5;
export const STY_FILTERS = Object.freeze(['brightness', 'contrast', 'saturation', 'tintAmount', 'blur']);

const FILTER_WORDS = { brightness: 'brightness', contrast: 'contrast', saturation: 'saturation', tintAmount: 'tint amount', blur: 'blur' };

/** PURE: 16 hex (FNV-1a 64) over a list of values. */
export function fingerprint(...parts) {
  const s = JSON.stringify(parts);
  let h = 0xcbf29ce484222325n;
  for (let i = 0; i < s.length; i += 1) {
    h ^= BigInt(s.charCodeAt(i));
    h = (h * 0x100000001b3n) & 0xffffffffffffffffn;
  }
  return h.toString(16).padStart(16, '0');
}

/**
 * PURE: the role a layer's name states, or null when the name says none ("bg_1" is bg, "clouds" is
 * sky, "fg" is foreground; "mtns" and "T_1303509543155" say nothing).
 */
export function namedRole(layer) {
  if (!layer || layer.id === 'middleground') return null;
  const name = `${layer.name || ''} ${layer.id || ''}`.toLowerCase();
  if (/sky|cloud|star|infinity/.test(name)) return 'sky';
  if (/fore|(^|[\s_])fg/.test(name)) return 'foreground';
  if (/(^|[\s_])(bg|back)/.test(name)) return 'bg';
  return null;
}

/** PURE: the profile for a hub id: the hub's own when it has one, else "default" (null without profiles). */
export function profileFor(profiles, hubId) {
  const all = profiles?.profiles || profiles || null;
  if (!all) return null;
  return all[`hub-${hubId}`] || all.default || null;
}

/** PURE: a role's measured values in the hub's profile, falling back to the world's when the hub has too few streets with it. */
export function bandOf(profiles, hubId, role) {
  const all = profiles?.profiles || profiles || null;
  if (!all) return null;
  const hub = all[`hub-${hubId}`]?.roles?.[role];
  if (hub && hub.streets >= MIN_HUB_STREETS) return { ...hub, from: `hub-${hubId}` };
  const world = all.default?.roles?.[role];
  return world ? { ...world, from: 'default' } : null;
}

function parts(draftStreet) {
  const street = draftStreet?.street && typeof draftStreet.street === 'object' ? draftStreet.street : draftStreet;
  const key = typeof draftStreet?.key === 'string' && draftStreet.street ? draftStreet.key : 'street';
  return { street: street || {}, key };
}

function finding(rule, severity, key, at, message, data, fix, where = null, fp = []) {
  const f = { rule, severity, street: key, at, message };
  if (where) f.where = where;
  f.data = data;
  f.fix = fix;
  f.fingerprint = fingerprint(rule, at, ...fp);
  return f;
}

const label = (layer) => layer.name || layer.id;
const fmt = (n) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 10) / 10));

/**
 * STY-001 (warn) Layer order: sky behind the bg layers, bg behind the middleground, foreground in
 * front. A layer's stated role is its name's (namedRole); the order is its z.
 */
export function sty001(draftStreet) {
  const { street, key } = parts(draftStreet);
  const layers = street.layers || [];
  const mz = Number(layers.find((l) => l.id === 'middleground')?.z) || 0;
  const z = (l) => Number(l.z) || 0;
  const out = [];
  const bgs = layers.filter((l) => namedRole(l) === 'bg' && z(l) < mz);
  for (const layer of layers) {
    const role = namedRole(layer);
    if (!role) continue;
    let why = '';
    let fix = '';
    if ((role === 'sky' || role === 'bg') && z(layer) >= mz) {
      why = `${role === 'sky' ? 'The sky layer' : 'The bg layer'} ${label(layer)} (z ${fmt(z(layer))}) is in front of the middleground (z ${fmt(mz)}).`;
      fix = `Give it a z below ${fmt(mz)}.`;
    } else if (role === 'foreground' && z(layer) <= mz) {
      why = `The foreground layer ${label(layer)} (z ${fmt(z(layer))}) is behind the middleground (z ${fmt(mz)}).`;
      fix = `Give it a z above ${fmt(mz)}.`;
    } else if (role === 'sky') {
      const front = bgs.filter((b) => z(b) < z(layer));
      if (front.length) {
        why = `The sky layer ${label(layer)} (z ${fmt(z(layer))}) is in front of the bg layer${front.length > 1 ? 's' : ''} ${front.map(label).join(', ')}.`;
        fix = `Give it a z below ${fmt(Math.min(...front.map(z)))}, or rename it if it is not a sky.`;
      }
    }
    if (why) out.push(finding('STY-001', 'warn', key, `${key}/${layer.id}`, why, { layer: layer.id, role, z: z(layer), middleground: mz }, fix, null, [z(layer), mz, role]));
  }
  return out;
}

/** STY-002 (info) Filter outside the usual range: a layer filter outside its role's p10 to p90. */
export function sty002(draftStreet, ctx = {}) {
  const { street, key } = parts(draftStreet);
  const out = [];
  for (const layer of street.layers || []) {
    const role = layerRole(layer, street);
    const b = bandOf(ctx.profiles, street.hubId, role);
    if (!b) continue;
    const off = [];
    for (const f of STY_FILTERS) {
      const v = layer.filters?.[f];
      const band = b.filters?.[f]?.band;
      if (typeof v !== 'number' || !band) continue;
      if (v < band[0] || v > band[2]) off.push({ filter: f, value: v, band });
    }
    if (!off.length) continue;
    const words = off.map((o) => `${FILTER_WORDS[o.filter]} ${fmt(o.value)} (usual ${o.band[0]} to ${o.band[2]})`).join(', ');
    out.push(finding('STY-002', 'info', key, `${key}/${layer.id}`, `Layer ${label(layer)} (${role}): ${words}.`, { layer: layer.id, role, profile: b.from, off }, `Fine if it is on purpose; Tiny Speck's ${role} layers mostly sit inside those ranges.`, null, [role, off.map((o) => [o.filter, o.value])]));
  }
  return out;
}

/** STY-003 (info) Density outside the usual range: decos per 1,000 px of the layer's width outside the role's p10 to p90. */
export function sty003(draftStreet, ctx = {}) {
  const { street, key } = parts(draftStreet);
  const sw = (street.bounds?.r ?? 0) - (street.bounds?.l ?? 0);
  const out = [];
  for (const layer of street.layers || []) {
    const role = layerRole(layer, street);
    const band = bandOf(ctx.profiles, street.hubId, role)?.density;
    const lw = layer.id === 'middleground' ? sw : Number(layer.w) > 0 ? layer.w : sw;
    if (!band || !(lw > 0)) continue;
    const n = (layer.decos || []).length;
    const density = Math.round((n * 10000) / lw) / 10;
    if (density >= band[0] && density <= band[2]) continue;
    const few = density < band[0];
    out.push(finding('STY-003', 'info', key, `${key}/${layer.id}`, `Layer ${label(layer)} (${role}) has ${fmt(density)} decos per 1,000 px; ${role} layers usually have ${band[0]} to ${band[2]}.`,
      { layer: layer.id, role, decos: n, width: lw, density, band, profile: bandOf(ctx.profiles, street.hubId, role).from },
      few ? 'Add decos, or leave it bare if that is the look you want.' : 'Thin the decos out, or keep it busy on purpose.', null, [role, n, lw]));
  }
  return out;
}

/** STY-004 (warn) No sky gradient: without one the painted fallback sky shows. */
export function sty004(draftStreet) {
  const { street, key } = parts(draftStreet);
  const g = street.gradient;
  if (g && /^[0-9A-Fa-f]{6}$/.test(String(g.top || '')) && /^[0-9A-Fa-f]{6}$/.test(String(g.bottom || ''))) return [];
  return [finding('STY-004', 'warn', key, key, `${street.label || key} has no sky gradient, so the painted fallback sky shows.`, { gradient: g ?? null }, 'Set a top and bottom colour for the sky.', null, [g ?? null])];
}

/**
 * STY-005 (info) Unusual layer for this deco: a library deco placed on a layer role where the
 * catalog shows Tiny Speck never placed it. One finding per sprite per layer (data.ids lists them).
 * New art (gz_) and decos the catalog has never seen placed are skipped.
 */
export function sty005(draftStreet, ctx = {}) {
  const { street, key } = parts(draftStreet);
  const catalog = ctx.catalog;
  if (!catalog?.get) return [];
  const out = [];
  for (const layer of street.layers || []) {
    const role = layerRole(layer, street);
    const seen = new Map();
    for (const d of layer.decos || []) {
      const row = catalog.get(d.sprite);
      if (!row || !row.placements || (row.layers?.[role] || 0) > 0) continue;
      if (!seen.has(d.sprite)) seen.set(d.sprite, []);
      seen.get(d.sprite).push(d);
    }
    for (const [sprite, decos] of seen) {
      const row = catalog.get(sprite);
      const usual = Object.keys(row.layers || {});
      const first = decos[0];
      const space = layer.id === 'middleground' ? 'world' : 'layer';
      out.push(finding('STY-005', 'info', key, `${key}/${first.id || layer.id}`,
        `${sprite} is on a ${role} layer (${label(layer)}); Tiny Speck placed it only on ${usual.join(', ')} layers (${row.placements} times).`,
        { sprite, layer: layer.id, role, usual: row.layers, ids: decos.map((d) => d.id).filter(Boolean) },
        `Fine if it is on purpose; it was drawn for ${usual[0]} depth.`, { x: first.x, y: first.y, space, layer: layer.id }, [sprite, layer.id, role, decos.length]));
    }
  }
  return out;
}

export const STY_RULES = Object.freeze([
  Object.freeze({ id: 'STY-001', severity: 'warn', title: 'Layer order', check: sty001 }),
  Object.freeze({ id: 'STY-002', severity: 'info', title: 'Filter outside the usual range', check: sty002 }),
  Object.freeze({ id: 'STY-003', severity: 'info', title: 'Density outside the usual range', check: sty003 }),
  Object.freeze({ id: 'STY-004', severity: 'warn', title: 'No sky gradient', check: sty004 }),
  Object.freeze({ id: 'STY-005', severity: 'info', title: 'Unusual layer for this deco', check: sty005 }),
]);

/** PURE: every STY finding for one draft street (rule order, then layer order). */
export function styleFindings(draftStreet, ctx = {}) {
  return STY_RULES.flatMap((r) => r.check(draftStreet, ctx));
}
