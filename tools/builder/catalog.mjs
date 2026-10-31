/**
 * LEVEL BUILDER (spec 6.4, 8.2, 8.3, 9.2): the deco catalog search and the style profiles for agents
 * (`cli.mjs decos` and `style`, and the builder worker's GET …/builder/decos and style/{profile}).
 * Ranking follows 6.4: text match first, then placements in the hub asked for, then placements
 * overall; facets: layer role, hub, family, animated.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { GAME_DIR } from '../repos.mjs';

const pub = (p) => join(GAME_DIR, 'public', p);
let catalogRows = null;
let profilesFile = null;

export function catalog() {
  catalogRows ??= JSON.parse(readFileSync(pub('assets/content/deco-catalog.json'), 'utf8')).decos;
  return catalogRows;
}

export function styleProfiles() {
  profilesFile ??= JSON.parse(readFileSync(pub('assets/content/style-profiles.json'), 'utf8'));
  return profilesFile;
}

/** PURE: a name's search tokens (split on _, digits and case). */
export function tokens(name) {
  return String(name || '').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase().split(/[^a-z]+/).filter(Boolean);
}

/** PURE: how well a row matches a query (lower is better; -1 no match). */
export function matchScore(row, q) {
  if (!q) return 5;
  const name = row.name.toLowerCase();
  if (name === q) return 0;
  if (name.startsWith(q)) return 1;
  const words = q.split(/\s+/).filter(Boolean);
  const toks = tokens(row.name);
  if (words.every((w) => toks.includes(w))) return 2;
  if (words.every((w) => name.includes(w))) return 3;
  if (words.every((w) => w === row.family || w === String(row.bundle || '').toLowerCase() || toks.some((t) => t.startsWith(w)))) return 4;
  return -1;
}

/**
 * PURE: catalog rows for a query, best first.
 * opts: { q, layer (a role), hub (hub id), family, animated (true/false), limit (default 20, at most 200) }
 */
export function searchDecos(rows, { q = '', layer = '', hub = '', family = '', animated = null, limit = 20 } = {}) {
  const query = String(q || '').toLowerCase().trim();
  const hubId = String(hub || '').replace(/^hub-/, '');
  const max = Math.max(1, Math.min(200, Number(limit) || 20));
  const anim = animated === null || animated === undefined || animated === '' ? null : animated === true || animated === 'true' || animated === '1';
  const out = [];
  for (const row of rows) {
    if (layer && !(row.layers?.[layer] > 0)) continue;
    if (family && row.family !== family) continue;
    if (anim !== null && Boolean(row.animated) !== anim) continue;
    const score = matchScore(row, query);
    if (score < 0) continue;
    const inHub = hubId ? (row.hubs || []).find(([h]) => String(h) === hubId)?.[1] || 0 : 0;
    out.push([score, inHub, row]);
  }
  out.sort((a, b) => a[0] - b[0] || b[1] - a[1] || (b[2].placements || 0) - (a[2].placements || 0) || a[2].name.localeCompare(b[2].name));
  return out.slice(0, max).map(([, inHub, row]) => ({ ...row, ...(hubId ? { inHub } : {}) }));
}

/** A style profile by name ('default', 'hub-58' or '58'), with its roles as `layers`, or null. */
export function styleProfile(name = 'default') {
  const key = /^\d+$/.test(String(name)) ? `hub-${name}` : String(name || 'default');
  const p = styleProfiles().profiles[key];
  if (!p) return null;
  const { roles, ...rest } = p;
  return { profile: key, ...rest, layers: roles };
}
