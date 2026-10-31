#!/usr/bin/env node
/**
 * LEVEL BUILDER (spec 9.2, phase P5): the style guide measured from Tiny Speck's art,
 * public/assets/content/style-profiles.json. One profile for the whole world ("default") and one
 * per hub ("hub-<id>"), each from the shipped streets (public/assets/streets/*.json) alone:
 *
 *   streets                       how many streets the profile was measured on
 *   size {w, h, layers}           street width, height and layer count: [p10, p50, p90, max]
 *   flipped, rotated              share of decos flipped, and rotated
 *   roles {<role>: ...}           per layer role (js/builder/layer-role.js: sky, bg, middleground,
 *                                 middleplus, foreground):
 *     streets, layers             how many streets have the role, and how many layers
 *     z [median, min, max]
 *     w, h [p10, p50, p90]        layer size over the street's (the middleground is 1)
 *     decoW, decoH [p10, p50, p90] drawn deco size, px
 *     density [p10, p50, p90]     decos per 1,000 px of the layer's width
 *     filters {<name>: {n, band: [p10, p50, p90]}}   brightness, contrast, saturation, tintAmount, blur
 *     palette {l, s: [p10, p50, p90], hue: [12]}     the colour of the art placed on the role,
 *                                 each placement counted once, from tools/builder/deco-palette.json
 *   gradient {streets, top, bottom: {hue [p10,p50,p90], s median, l [p10,p50,p90]}, bottomLighter}
 *
 * The validator's STY rules (js/builder/style-rules.js), intake's style check (the site's
 * BuilderIntake) and the CLI's `style` command read it. Bands are advice, never a block: a new
 * zone may look new on purpose. Nothing depends on the clock, so a rebuild writes the same bytes.
 *
 *   node tools/builder/style-profile.mjs                    write the file
 *   node tools/builder/style-profile.mjs --check            exit 1 when stale (tests/builder-style.test.js)
 *   node tools/builder/style-profile.mjs --show hub-58 ...  print profiles' bands as text
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DECO_TWINS } from '../../public/js/street-render.js?v=3bcef6a7';
import { layerRole, LAYER_ROLES } from '../../public/js/builder/layer-role.js?v=e585f610';
import { HUE_BINS } from '../../public/js/builder/colour-stats.js?v=30f71984';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const OUT = join(ROOT, 'public/assets/content/style-profiles.json');
export const FILTERS = Object.freeze(['brightness', 'contrast', 'saturation', 'tintAmount', 'blur']);

/** PURE: [p10, p50, p90] of a list (nearest rank on the sorted list), rounded by `round`; null when empty. */
export function band(list, round = Math.round) {
  if (!list.length) return null;
  const s = Float64Array.from(list).sort();
  const at = (p) => s[Math.min(s.length - 1, Math.floor(p * (s.length - 1) + 0.5))];
  return [round(at(0.1)), round(at(0.5)), round(at(0.9))];
}

/** PURE: [p10, p50, p90] of values with weights (the value where the running weight passes p). */
export function weightedBand(pairs, round = (n) => Math.round(n * 1000) / 1000) {
  if (!pairs.length) return null;
  const s = [...pairs].sort((a, b) => a[0] - b[0]);
  const total = s.reduce((t, p) => t + p[1], 0);
  const at = (p) => {
    let run = 0;
    for (const [v, w] of s) {
      run += w;
      if (run >= p * total) return v;
    }
    return s.at(-1)[0];
  };
  return [round(at(0.1)), round(at(0.5)), round(at(0.9))];
}

const r1 = (n) => Math.round(n * 10) / 10;
const r2 = (n) => Math.round(n * 100) / 100;
const r3 = (n) => Math.round(n * 1000) / 1000;

/** PURE: HSL of a 6-hex colour as [h, s, l]. */
export function hexHsl(hex) {
  const n = parseInt(String(hex).replace(/^#/, ''), 16);
  if (!Number.isFinite(n)) return null;
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (!d) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h *= 60;
  if (h < 0) h += 360;
  return [h, Math.min(1, s), l];
}

function newBucket() {
  return { streets: 0, w: [], h: [], layers: [], flipped: 0, rotated: 0, decos: 0, roles: {}, gradient: { n: 0, top: [], bottom: [], lighter: 0 } };
}
function roleBucket(b, role) {
  return (b.roles[role] ||= { streets: new Set(), layers: 0, z: [], w: [], h: [], decoW: [], decoH: [], density: [], filters: Object.fromEntries(FILTERS.map((f) => [f, []])), pl: [], ps: [], hue: new Array(HUE_BINS).fill(0), hueN: 0 });
}

/** Measure every shipped street into the profiles. */
export function buildProfiles(root = ROOT) {
  const library = new Set(JSON.parse(readFileSync(join(root, 'public/assets/decos/manifest.json'), 'utf8')));
  const palette = new Map(JSON.parse(readFileSync(join(root, 'tools/builder/deco-palette.json'), 'utf8')).decos.map((r) => [r.name, r]));
  const dir = join(root, 'public/assets/streets');
  const files = readdirSync(dir).filter((f) => /^[GL][A-Z0-9]+\.json$/.test(f)).sort();
  const world = newBucket();
  const hubs = new Map();
  for (const f of files) {
    const street = JSON.parse(readFileSync(join(dir, f), 'utf8'));
    const hub = street.hubId != null && street.hubId !== '' ? String(street.hubId) : '';
    const buckets = [world];
    if (hub) {
      if (!hubs.has(hub)) hubs.set(hub, newBucket());
      buckets.push(hubs.get(hub));
    }
    const b0 = street.bounds || {};
    const sw = (b0.r ?? 0) - (b0.l ?? 0);
    const sh = (b0.b ?? 0) - (b0.t ?? 0);
    const layers = street.layers || [];
    for (const b of buckets) {
      b.streets += 1;
      b.w.push(sw);
      b.h.push(sh);
      b.layers.push(layers.length);
      const g = street.gradient;
      if (g && g.top && g.bottom) {
        const top = hexHsl(g.top);
        const bottom = hexHsl(g.bottom);
        if (top && bottom) {
          b.gradient.n += 1;
          b.gradient.top.push(top);
          b.gradient.bottom.push(bottom);
          if (bottom[2] > top[2]) b.gradient.lighter += 1;
        }
      }
    }
    for (const layer of layers) {
      const role = layerRole(layer, street);
      const middle = layer.id === 'middleground';
      const lw = middle ? sw : Number(layer.w) > 0 ? layer.w : sw;
      const lh = middle ? sh : Number(layer.h) > 0 ? layer.h : sh;
      const decos = layer.decos || [];
      for (const b of buckets) {
        const r = roleBucket(b, role);
        r.streets.add(street.tsid);
        r.layers += 1;
        r.z.push(Number(layer.z) || 0);
        if (sw > 0) r.w.push(lw / sw);
        if (sh > 0) r.h.push(lh / sh);
        if (lw > 0) r.density.push((decos.length * 1000) / lw);
        for (const fl of FILTERS) {
          const v = layer.filters?.[fl];
          if (typeof v === 'number' && Number.isFinite(v)) r.filters[fl].push(v);
        }
        for (const d of decos) {
          b.decos += 1;
          if (d.flip) b.flipped += 1;
          if (d.r) b.rotated += 1;
          if (d.w > 0) r.decoW.push(d.w);
          if (d.h > 0) r.decoH.push(d.h);
          const art = library.has(d.sprite) ? d.sprite : DECO_TWINS[d.sprite];
          const p = art && palette.get(art);
          if (!p) continue;
          r.pl.push([p.l, 1]);
          r.ps.push([p.s, 1]);
          for (let i = 0; i < HUE_BINS; i += 1) r.hue[i] += p.hue[i];
          r.hueN += 1;
        }
      }
    }
  }
  const profiles = { default: finish(world) };
  for (const hub of [...hubs.keys()].sort((a, b) => Number(a) - Number(b) || (a < b ? -1 : 1))) profiles[`hub-${hub}`] = finish(hubs.get(hub));
  return { format: 'groddle-style-profiles/1', streetsScanned: files.length, roles: LAYER_ROLES, filters: FILTERS, profiles };
}

function finish(b) {
  const max = (l) => (l.length ? Math.max(...l) : null);
  const roles = {};
  for (const role of LAYER_ROLES) {
    const r = b.roles[role];
    if (!r) continue;
    const zs = [...r.z].sort((x, y) => x - y);
    const filters = {};
    for (const fl of FILTERS) if (r.filters[fl].length) filters[fl] = { n: r.filters[fl].length, band: band(r.filters[fl]) };
    const hueSum = r.hue.reduce((t, v) => t + v, 0);
    roles[role] = {
      streets: r.streets.size,
      layers: r.layers,
      z: [r2(zs[(zs.length - 1) >> 1]), r2(zs[0]), r2(zs.at(-1))],
      w: band(r.w, r2),
      h: band(r.h, r2),
      decoW: band(r.decoW),
      decoH: band(r.decoH),
      density: band(r.density, r1),
      filters,
      palette: r.hueN ? { l: weightedBand(r.pl), s: weightedBand(r.ps), hue: r.hue.map((v) => (hueSum ? r3(v / hueSum) : 0)) } : null,
    };
  }
  const g = b.gradient;
  const end = (list) => (list.length ? { hue: band(list.map((x) => x[0])), s: band(list.map((x) => x[1]), r2)[1], l: band(list.map((x) => x[2]), r2) } : null);
  return {
    streets: b.streets,
    size: { w: [...band(b.w), max(b.w)], h: [...band(b.h), max(b.h)], layers: [...band(b.layers), max(b.layers)] },
    flipped: b.decos ? r3(b.flipped / b.decos) : 0,
    rotated: b.decos ? r3(b.rotated / b.decos) : 0,
    roles,
    gradient: { streets: g.n, top: end(g.top), bottom: end(g.bottom), bottomLighter: g.lighter },
  };
}

/** One profile a line: small diffs. */
export function profilesText(p) {
  const head = { ...p };
  delete head.profiles;
  const rows = Object.entries(p.profiles).map(([k, v]) => `${JSON.stringify(k)}:${JSON.stringify(v)}`);
  return `${JSON.stringify(head).slice(0, -1)},"profiles":{\n${rows.join(',\n')}\n}}\n`;
}

/** PURE: a profile's bands as lines of text (the --show output). */
export function showProfile(name, prof) {
  if (!prof) return [`${name}: no such profile`];
  const b = (x) => (x ? x.join(' / ') : 'none');
  const out = [`${name}: ${prof.streets} streets; width ${b(prof.size.w.slice(0, 3))} (max ${prof.size.w[3]}), height ${b(prof.size.h.slice(0, 3))}, layers ${b(prof.size.layers.slice(0, 3))}; flipped ${prof.flipped}, rotated ${prof.rotated}`];
  for (const [role, r] of Object.entries(prof.roles)) {
    const filters = Object.entries(r.filters).map(([k, v]) => `${k} ${b(v.band)} (${v.n})`).join(', ') || 'no filters';
    const pal = r.palette ? `lightness ${b(r.palette.l)}, saturation ${b(r.palette.s)}, top hues ${topHues(r.palette.hue)}` : 'no palette';
    out.push(`  ${role.padEnd(12)} ${r.streets} streets, z ${r.z[0]} (${r.z[1]} to ${r.z[2]}), width ÷ street ${b(r.w)}, deco w ${b(r.decoW)}, h ${b(r.decoH)}, per 1,000 px ${b(r.density)}`);
    out.push(`  ${''.padEnd(12)} ${filters}`);
    out.push(`  ${''.padEnd(12)} ${pal}`);
  }
  const g = prof.gradient;
  if (g.top) out.push(`  sky gradient (${g.streets}): top hue ${b(g.top.hue)}, l ${b(g.top.l)}; bottom hue ${b(g.bottom.hue)}, l ${b(g.bottom.l)}; bottom lighter on ${g.bottomLighter}`);
  return out;
}

function topHues(hue) {
  return hue.map((v, i) => [v, i]).sort((a, b) => b[0] - a[0]).slice(0, 3).filter(([v]) => v > 0).map(([v, i]) => `${i * 30}-${i * 30 + 30}° ${Math.round(v * 100)}%`).join(', ') || 'grey';
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2);
  if (args[0] === '--show') {
    const file = JSON.parse(readFileSync(OUT, 'utf8'));
    for (const name of args.slice(1).length ? args.slice(1) : ['default']) console.log(showProfile(name, file.profiles[name]).join('\n'));
  } else {
    const text = profilesText(buildProfiles());
    if (args.includes('--check')) {
      const now = existsSync(OUT) ? readFileSync(OUT, 'utf8') : '';
      if (now !== text) {
        console.error('style-profiles.json is stale: run node tools/builder/style-profile.mjs');
        process.exit(1);
      }
      console.log('style-profiles.json is current');
    } else {
      writeFileSync(OUT, text);
      console.log(`wrote ${OUT} (${Object.keys(JSON.parse(text).profiles).length} profiles)`);
    }
  }
}
