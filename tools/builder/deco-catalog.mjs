#!/usr/bin/env node
/**
 * LEVEL BUILDER (spec 6.4, phase P0): the deco catalog the builder's picker searches,
 * public/assets/content/deco-catalog.json. One row per library deco (the 2,990 names in
 * public/assets/decos/manifest.json), in name order:
 *
 *   name, family (first word), bundle (the SWF art set; "png" for the 139 decos that came as
 *   PNGs), source (bundle and symbol, the provenance row a fork writes), size2 [w,h] (the 2x
 *   file, which is also the logical size), hires (a 3x file exists), sharp, animated, placements, streets,
 *   hubs (top 5 by placements: [hubId, n]), layers {role: count} (js/builder/layer-role.js),
 *   drawn {w_med, h_med} (median placed size; null when never placed), neverPlaced
 *
 * Usage counts come from a scan of every shipped street (public/assets/streets/*.json), with a
 * placement counted under the art the renderer draws (street-render.js DECO_TWINS). Nothing in
 * the file depends on the clock, so a rebuild with no source change writes the same bytes.
 *
 *   node tools/builder/deco-catalog.mjs           write the file
 *   node tools/builder/deco-catalog.mjs --check   exit 1 when it is stale (tests/zone-schema.test.js)
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DECO_TWINS } from '../../public/js/street-render.js?v=3bcef6a7';
import { HIRES_DECOS } from '../../public/js/deco-hires-list.js?v=ff3e7d6b';
import { SHARP_DECOS } from '../../public/js/deco-sharp-list.js?v=14808a90';
import { ANIM_DECOS } from '../../public/js/deco-anim-list.js?v=ecfee655';
import { layerRole } from '../../public/js/builder/layer-role.js?v=e585f610';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const OUT = join(ROOT, 'public/assets/content/deco-catalog.json');
const STREETS = join(ROOT, 'public/assets/streets');

/** PURE: the median of a list of numbers (rounded to a whole px), or null. */
export function median(list) {
  if (!list.length) return null;
  const s = [...list].sort((a, b) => a - b);
  const m = s.length >> 1;
  return Math.round(s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2);
}

/** PURE: a deco's family, the first word of its name. */
export const familyOf = (name) => String(name).split('_')[0].toLowerCase();

/** PURE: [bundle, source] from a plan row's swf field ("bundle:newxp.swf#Brain_stem_large"). */
export function bundleOf(row) {
  const m = /^bundle:([^#]+?)(?:\.swf)?#(.+)$/.exec(String(row?.swf || ''));
  if (m) return [m[1], `${m[1]}.swf#${m[2]}`];
  return ['png', `png#${row?.name || ''}`];
}

/** Build the catalog from the repo's files. */
export function buildCatalog(root = ROOT) {
  const names = JSON.parse(readFileSync(join(root, 'public/assets/decos/manifest.json'), 'utf8'));
  const library = new Set(names);
  const plan = new Map(JSON.parse(readFileSync(join(root, 'tools/deco-pipeline/plan.json'), 'utf8')).decos.map((d) => [d.name, d]));
  const use = new Map();
  const dir = join(root, 'public/assets/streets');
  const files = readdirSync(dir).filter((f) => /^[GL][A-Z0-9]+\.json$/.test(f)).sort();
  for (const f of files) {
    const street = JSON.parse(readFileSync(join(dir, f), 'utf8'));
    const hub = street.hubId != null && street.hubId !== '' ? String(street.hubId) : '';
    for (const layer of street.layers || []) {
      const role = layerRole(layer, street);
      for (const deco of layer.decos || []) {
        const art = library.has(deco.sprite) ? deco.sprite : DECO_TWINS[deco.sprite];
        if (!art || !library.has(art)) continue;
        let u = use.get(art);
        if (!u) use.set(art, (u = { n: 0, streets: new Set(), hubs: new Map(), layers: {}, w: [], h: [] }));
        u.n += 1;
        u.streets.add(street.tsid);
        if (hub) u.hubs.set(hub, (u.hubs.get(hub) || 0) + 1);
        u.layers[role] = (u.layers[role] || 0) + 1;
        if (deco.w > 0) u.w.push(deco.w);
        if (deco.h > 0) u.h.push(deco.h);
      }
    }
  }
  const rows = [...names].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)).map((name) => {
    const p = plan.get(name) || {};
    const u = use.get(name);
    const [bundle, source] = bundleOf({ ...p, name });
    const hubs = u ? [...u.hubs].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, 5) : [];
    const layers = u ? Object.fromEntries(Object.entries(u.layers).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))) : {};
    return {
      name,
      family: familyOf(name),
      bundle,
      source,
      size2: Array.isArray(p.size2) ? p.size2 : null,
      hires: p.hires === true || HIRES_DECOS.has(name),
      sharp: SHARP_DECOS.has(name),
      animated: ANIM_DECOS.has(name),
      placements: u?.n || 0,
      streets: u?.streets.size || 0,
      hubs,
      layers,
      drawn: u && u.w.length ? { w_med: median(u.w), h_med: median(u.h) } : null,
      neverPlaced: !u,
    };
  });
  return { format: 'groddle-deco-catalog/1', count: rows.length, streetsScanned: files.length, decos: rows };
}

/** One row a line: small diffs, and the file stays readable. */
export function catalogText(cat) {
  const head = { ...cat, decos: undefined };
  delete head.decos;
  return `${JSON.stringify(head).slice(0, -1)},"decos":[\n${cat.decos.map((r) => JSON.stringify(r)).join(',\n')}\n]}\n`;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const text = catalogText(buildCatalog());
  if (process.argv.includes('--check')) {
    const now = existsSync(OUT) ? readFileSync(OUT, 'utf8') : '';
    if (now !== text) {
      console.error('deco-catalog.json is stale: run node tools/builder/deco-catalog.mjs');
      process.exit(1);
    }
    console.log('deco-catalog.json is current');
  } else {
    writeFileSync(OUT, text);
    console.log(`wrote ${OUT} (${JSON.parse(text).count} decos)`);
  }
}
