#!/usr/bin/env node
/**
 * Tiny Speck's overlay FLAs (glitch-overlays/*.fla, CC0) to art the game
 * plays. tools/overlay-art/xfl-svg.mjs draws each frame as SVG; then, per
 * overlay, either
 *  - kind "svg": the frames are kept as vector SVG in <key>.frames.json,
 *    { defs, frames } with the repeated outlines and ramps shared
 *    (shareFrames; the fireworks fill the whole viewport, 1500-2200 px
 *    across, which no bitmap sheet carries at a sane size), each cropped to
 *    the union of what any frame draws; or
 *  - kind "sheet": Chrome rasterises each frame, identical frames are kept
 *    once and packed in a grid PNG (play_glitch, 110 x 80), or a WebP at
 *    quality `webp` (the G251 sheets: a quarter to a half of the PNG's bytes).
 *
 * overlays.json: { <key>: { kind, src, fla (sha1), fps, frames, stage: [w, h],
 *   box: [x, y, w, h] (stage px the art covers), file,
 *   sheet only: scale, cell: [w, h], cols, order: [cell per frame] } }
 * The game places the stage the way the client did (ArbitrarySWFView at 1:1
 * when no size is given, else fitted to the width x height box): centred on
 * the point for a window overlay (vp_overlay), standing on it (registration
 * center_bottom) for pc_, itemstack_ and location_overlay.
 *
 * Usage: node tools/overlay-art/build.mjs [key...]   (all by default)
 *        node tools/overlay-art/build.mjs --check    (overlays.json matches the FLAs)
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { frameCount, frameSvg, loadFla } from './xfl-svg.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const spike = join(here, '../..');
const audit = join(spike, '..');
const outDir = join(spike, 'public/assets/sprites/overlays');
const manifestPath = join(outDir, 'overlays.json');

/**
 * The overlays the game uses.
 *   fireworks_1/2/3: items/include/loneliness.js 345-430 vp_overlay with no
 *     width or height, so the stage shows at 1:1 (ArbitrarySWFView scale()).
 *   play_glitch: items/game_box.js 137-149 pc_overlay, a 110 x 110 box over
 *     the 110 x 80 stage (scale 1); its one main frame holds the 744-frame
 *     "all" clip (24.8 s at 30 fps against the verb's 24.5 s). Drawn at 2x,
 *     every other frame (15 fps).
 */
export const OVERLAYS = Object.freeze({
  fireworks_1: { fla: 'glitch-overlays/fireworks_1.fla', kind: 'svg', step: 1 },
  fireworks_2: { fla: 'glitch-overlays/fireworks_2.fla', kind: 'svg', step: 1 },
  fireworks_3: { fla: 'glitch-overlays/fireworks_3.fla', kind: 'svg', step: 1 },
  // catalog_buffs.js 2446-2510 sneezing_fit on_tick: pc_overlay
  // overlay_sneezing_powder, 300 x 300 at delta_y -110, 2 s (Señor Funpickle, G209).
  overlay_sneezing_powder: { fla: 'glitch-overlays/overlay_sneezing_powder.fla', kind: 'sheet', scale: 1, step: 1 },
  // locations/location.js 730-760 spawnQurazy: announce_vp_overlay
  // o_qurazy_quoin_overlay for 10 s (x 50%, top_y -5%, fade_out_sec 3). Its
  // one main frame holds clips (the rays turn every 60 frames, the quoin
  // every 104) that keep playing while it shows, fade out included
  // (10 s - 0.2 s + 3 s, AbstractAnnouncementOverlay.as 535-540, 694-701), so
  // `frames` draws those 12.8 s: 384 frames, every other one (15 fps; the
  // slow turn reads the same, at half the bytes).
  o_qurazy_quoin_overlay: { fla: 'glitch-overlays/o_qurazy_quoin_overlay.fla', kind: 'svg', step: 2, frames: 384 },
  // G251: the hand-drawn stand-ins swapped for the real art.
  // locations/inc_rook.js 697-707, 778-785 doOrbAttack: location_overlay
  // focusing_orb_laser_beam, 1 s, scaled 1 + min(n/6, 1) over 0.25 s.
  focusing_orb_laser_beam: { fla: 'glitch-overlays/focusing_orb_laser_beam.fla', kind: 'sheet', scale: 1, step: 1, webp: 0.85 },
  // items/include/shrines.js 1055-1071 launchAttack: itemstack_overlay
  // shrine_laser_beam_1/2/3 (2 = 100+ damage, 3 = an emblem), 2 s, delta 5 / 140.
  shrine_laser_beam_1: { fla: 'glitch-overlays/shrine_laser_beam_1.fla', kind: 'sheet', scale: 1, step: 1, webp: 0.85 },
  shrine_laser_beam_2: { fla: 'glitch-overlays/shrine_laser_beam_2.fla', kind: 'sheet', scale: 1, step: 1, webp: 0.85 },
  shrine_laser_beam_3: { fla: 'glitch-overlays/shrine_laser_beam_3.fla', kind: 'sheet', scale: 1, step: 1, webp: 0.85 },
  // players/player.js 3014-3029 show_rainbow: pc_overlay, 400 x 400, 4 s (the
  // 330 x 200 stage at 400/330); items/include/rook.js 208-222 the same box over
  // a fully revived trant or critter. stop() on frame 115 holds the last frame.
  rainbow_youdidit: { fla: 'glitch-overlays/rainbow_youdidit.fla', kind: 'sheet', scale: 1.25, step: 1, webp: 0.85 },
  rainbow_fullyrevived: { fla: 'glitch-overlays/rainbow_fullyrevived.fla', kind: 'sheet', scale: 1.25, step: 1, webp: 0.85 },
  rainbow_secretspot: { fla: 'glitch-overlays/rainbow_secretspot.fla', kind: 'sheet', scale: 1.25, step: 1, webp: 0.85 },
  // items/npc_piggy.js 1964-1971 (and npc_butterfly.js, npc_chicken.js):
  // itemstack_overlay smoke_puff, delta_y 95, 1.5 s; 24 fps, stop() on frame 21.
  smoke_puff: { fla: 'glitch-overlays/smoke_puff.fla', kind: 'sheet', scale: 1, step: 1, webp: 0.85 },
  // items/butler_box.js 114-121 (and item.js 499, location.js 2056 poof_in):
  // itemstack_overlay proto_puff, delta_y 125, 2 s; stop() on frame 46.
  proto_puff: { fla: 'glitch-overlays/proto_puff.fla', kind: 'sheet', scale: 1, step: 1, webp: 0.85 },
  play_glitch: {
    fla: 'glitch-overlays/play_glitch.fla',
    kind: 'sheet',
    scale: 2,
    step: 2,
    // The Glitch wordmark is a trademark, not part of the CC0 release: the
    // title card's logo (symbol "all", Layer 21) and the small one in the
    // mock client's top bar (Layer 4, top left) are left out.
    scrub: [
      { symbol: 'all', layer: 'Layer 21' },
      { symbol: 'all', layer: 'Layer 4', region: [-47, -34.5, -34.2, -27] },
    ],
  },
});

/** Drop a layer, or the outlines of a layer's shapes that sit inside a region (symbol px). */
export function scrub(fla, rules = []) {
  for (const r of rules) {
    const tl = fla.symbols.get(r.symbol);
    const layer = tl?.layers.find((l) => l.name === r.layer);
    if (!layer) throw new Error(`scrub: no ${r.symbol}/${r.layer}`);
    if (!r.region) {
      layer.frames = layer.frames.map((f) => ({ ...f, els: [] }));
      continue;
    }
    const [x0, y0, x1, y1] = r.region;
    const inside = (m, d) => {
      const n = d.match(/-?\d*\.?\d+/g).map(Number);
      for (let i = 0; i < n.length; i += 2) {
        const x = m[0] * n[i] + m[2] * n[i + 1] + m[4];
        const y = m[1] * n[i] + m[3] * n[i + 1] + m[5];
        if (x < x0 || x > x1 || y < y0 || y > y1) return false;
      }
      return true;
    };
    const walk = (e) => {
      if (e.k === 'group') e.members.forEach(walk);
      if (e.k !== 'shape') return;
      for (const [fill, d] of e.paths) {
        const kept = d.split(/(?=M)/).filter((sub) => !inside(e.m, sub));
        e.paths.set(fill, kept.join(''));
      }
    };
    layer.frames.forEach((f) => f.els.forEach(walk));
  }
  return fla;
}

const sha1 = (file) => createHash('sha1').update(readFileSync(file)).digest('hex');

export function checkOverlays() {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const bad = [];
  for (const [key, cfg] of Object.entries(OVERLAYS)) {
    const m = manifest[key];
    const file = join(audit, cfg.fla);
    if (!m) { bad.push(`${key}: not built`); continue; }
    if (!existsSync(join(outDir, m.file))) bad.push(`${key}: no ${m.file}`);
    if (!existsSync(file)) continue;
    if (m.fla !== sha1(file)) bad.push(`${key}: FLA changed`);
    if (m.kind !== cfg.kind) bad.push(`${key}: kind`);
    if (m.frames !== Math.ceil((cfg.frames || frameCount(loadFla(file))) / cfg.step)) bad.push(`${key}: frame count`);
  }
  return bad;
}

async function launch() {
  const core = '/Users/austin/Cove/Sites/minnadmin.localhost/public/wp-content/plugins/minn-admin/tests/node_modules/playwright-core/index.mjs';
  const { chromium } = await import(existsSync(core) ? core : 'playwright');
  const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  return chromium.launch({ executablePath: existsSync(chrome) ? chrome : undefined, args: ['--force-color-profile=srgb', '--disable-features=MacAppCodeSignClone'] });
}

const PAGE = `
window.drawSvg = async (src) => {
  const url = URL.createObjectURL(new Blob([src], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    c.getContext('2d').drawImage(img, 0, 0);
    return c;
  } finally { URL.revokeObjectURL(url); }
};
window.bbox = async (src) => {
  const c = await drawSvg(src);
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  let x0 = c.width, y0 = c.height, x1 = -1, y1 = -1;
  for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) {
    if (d[(y * c.width + x) * 4 + 3] > 2) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  return x1 < 0 ? null : [x0, y0, x1 + 1, y1 + 1];
};
window.frames = [];
window.addFrame = async (src) => {
  const c = await drawSvg(src);
  const data = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  let h = 0;
  for (let i = 0; i < data.length; i += 7) h = (h * 31 + data[i]) | 0;
  const sig = h + ':' + data.length;
  for (let k = 0; k < frames.length; k++) {
    if (frames[k].sig !== sig) continue;
    const o = frames[k].data;
    let same = true;
    for (let i = 0; i < data.length; i++) if (Math.abs(o[i] - data[i]) > 1) { same = false; break; }
    if (same) return k;
  }
  frames.push({ c, data, sig });
  return frames.length - 1;
};
window.pack = (cols, type = 'image/png', quality = 0.9) => {
  const w = frames[0].c.width, h = frames[0].c.height;
  const s = document.createElement('canvas');
  s.width = w * Math.min(cols, frames.length); s.height = h * Math.ceil(frames.length / cols);
  const ctx = s.getContext('2d');
  frames.forEach((f, i) => ctx.drawImage(f.c, (i % cols) * w, Math.floor(i / cols) * h));
  frames = [];
  return s.toDataURL(type, quality);
};
`;

const round2 = (v) => Math.round(v * 100) / 100;

/**
 * Vector frames with their repeats shared (G251): the fireworks draw the same
 * few dozen outlines and gradient ramps in every frame, only placed and
 * tinted differently (fireworks_1: 2,537 paths, 88 distinct outlines; 1,121
 * gradients, 25 distinct ramps). Each outline goes once into `defs` as
 * <path id="_pN" fill-rule="evenodd" d=".."/> and the frames <use> it with
 * their own transform and fill (both inherit into the use); each ramp goes
 * once as a template (<linearGradient id="_sN"> or radial, with the units,
 * the 819.2 px Flash square and the stops), and a frame's gradient keeps only
 * its matrix and takes the rest by href (SVG gradient templates). Gradients
 * and glow filters that two frames define alike are kept once as well (_gN,
 * _fN), and a run of uses with one transform becomes a group carrying it.
 * Gradient translations drop to 1/100 px (shape space); the outlines keep
 * theirs, as rounding those moved a few spark edges by a pixel in Chrome.
 * Chrome draws every fireworks frame pixel for pixel as before, at a tenth of
 * the bytes (7.3 MB to 0.7 MB). js/overlay-art.js assembleFrames() puts
 * `defs` back into each frame's <defs>. Returns { defs, frames }.
 */
export function shareFrames(svgs) {
  const paths = new Map();
  const ramps = new Map();
  const tr = (m) => m.replace(/matrix\(([^)]*)\)/g, (all, nums) => {
    const n = nums.split(' ');
    if (n.length !== 6) return all;
    for (const i of [4, 5]) n[i] = String(round2(Number(n[i])));
    return `matrix(${n.join(' ')})`;
  });
  const frames = svgs.map((svg) => svg
    .replace(/<path fill-rule="evenodd" transform="([^"]*)" d="([^"]*)"/g, (all, t, d) => {
      if (!paths.has(d)) paths.set(d, `_p${paths.size}`);
      return `<use href="#${paths.get(d)}" transform="${t}"`;
    })
    .replace(/<(linearGradient|radialGradient) (id="[^"]*") ([^>]*?) ?gradientTransform="([^"]*)">((?:<stop [^>]*\/>)+)<\/\1>/g, (all, tag, id, attrs, gt, stops) => {
      const key = `${tag} ${attrs}>${stops}`;
      if (!ramps.has(key)) ramps.set(key, `_s${ramps.size}`);
      return `<${tag} ${id} gradientTransform="${tr(gt)}" href="#${ramps.get(key)}"/>`;
    }));
  // Gradients and filters that two or more frames define alike go to defs once
  // (_gN, _fN) and the frames point at them.
  const defEl = /<(linearGradient|radialGradient) id="([^"]+)"([^>]*)\/>|<filter id="([^"]+)"([\s\S]*?<\/filter>)/g;
  const keyOf = (m) => (m[1] ? `${m[1]}${m[3]}` : `filter${m[5]}`);
  const seen = new Map();
  for (const f of frames) for (const k of new Set([...f.matchAll(defEl)].map(keyOf))) seen.set(k, (seen.get(k) || 0) + 1);
  const shared = new Map();
  const sharedFrames = frames.map((f) => {
    const remap = new Map();
    let out = f.replace(defEl, (...m) => {
      const k = keyOf(m);
      if (seen.get(k) < 2) return m[0];
      if (!shared.has(k)) shared.set(k, `_${m[1] ? 'g' : 'f'}${shared.size}`);
      remap.set(m[2] || m[4], shared.get(k));
      return '';
    });
    for (const [from, to] of remap) out = out.split(`url(#${from})`).join(`url(#${to})`);
    // A run of uses with one transform becomes a group carrying it.
    return out.replace(/(?:<use href="#[^"]+" transform="([^"]+)"[^>]*\/>)(?:<use href="#[^"]+" transform="\1"[^>]*\/>)+/g, (run, t) =>
      `<g transform="${t}">${run.split(` transform="${t}"`).join('')}</g>`);
  });
  const defs = [...paths].map(([d, id]) => `<path id="${id}" fill-rule="evenodd" d="${d}"/>`).join('')
    + [...ramps].map(([key, id]) => {
      const tag = key.slice(0, key.indexOf(' '));
      return `<${key.replace(/^(\w+) /, `$1 id="${id}" `)}</${tag}>`;
    }).join('')
    + [...shared].map(([k, id]) => (k.startsWith('filter') ? `<filter id="${id}"${k.slice(6)}` : `<${k.replace(/^(\w+)/, `$1 id="${id}"`)}/>`)).join('');
  return { defs, frames: sharedFrames };
}

async function build(keys) {
  mkdirSync(outDir, { recursive: true });
  const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : {};
  const browser = await launch();
  try {
    const page = await browser.newPage();
    await page.setContent('<!doctype html><body></body>');
    await page.addScriptTag({ content: PAGE });
    for (const key of keys) {
      const cfg = OVERLAYS[key];
      const file = join(audit, cfg.fla);
      const fla = scrub(loadFla(file), cfg.scrub);
      const total = cfg.frames || frameCount(fla);
      const picks = [];
      for (let n = 0; n < total; n += cfg.step) picks.push(n);
      // Union of the drawn area over every frame, at 1:1 with a margin round the stage.
      const pad = 300;
      const W = fla.doc.width;
      const H = fla.doc.height;
      const wide = [-pad, -pad, W + pad * 2, H + pad * 2];
      let u = null;
      for (const n of picks) {
        const b = await page.evaluate((src) => window.bbox(src), frameSvg(fla, n, { box: wide }));
        if (!b) continue;
        u = u ? [Math.min(u[0], b[0]), Math.min(u[1], b[1]), Math.max(u[2], b[2]), Math.max(u[3], b[3])] : b;
      }
      if (!u) throw new Error(`${key}: nothing drawn`);
      const box = [u[0] - pad - 1, u[1] - pad - 1, u[2] - u[0] + 2, u[3] - u[1] + 2];
      const base = { kind: cfg.kind, src: cfg.fla, fla: sha1(file), fps: fla.doc.frameRate / cfg.step, frames: picks.length, stage: [W, H], box };
      if (cfg.kind === 'svg') {
        const out = `${key}.frames.json`;
        const { defs, frames } = shareFrames(picks.map((n) => frameSvg(fla, n, { box })));
        writeFileSync(join(outDir, out), `{"defs":${JSON.stringify(defs)},\n"frames":[\n${frames.map((f) => JSON.stringify(f)).join(',\n')}\n]}\n`);
        manifest[key] = { ...base, file: out };
        console.log(`${key}: ${picks.length} SVG frames, box ${box.join(',')}`);
        continue;
      }
      const order = [];
      for (const n of picks) order.push(await page.evaluate((src) => window.addFrame(src), frameSvg(fla, n, { box, scale: cfg.scale })));
      const unique = Math.max(...order) + 1;
      const cellW = Math.ceil(box[2] * cfg.scale);
      const cellH = Math.ceil(box[3] * cfg.scale);
      const cols = Math.max(1, Math.min(unique, Math.floor(4096 / cellW)));
      const ext = cfg.webp ? 'webp' : 'png';
      const dataUrl = await page.evaluate(([c, t, q]) => window.pack(c, t, q), [cols, `image/${ext}`, cfg.webp || 1]);
      // @2x: the game's textures.js reads the resolution from the name (logical size = stage px).
      const out = cfg.scale === 1 ? `${key}.${ext}` : `${key}@${cfg.scale}x.${ext}`;
      writeFileSync(join(outDir, out), Buffer.from(dataUrl.split(',')[1], 'base64'));
      manifest[key] = { ...base, file: out, scale: cfg.scale, cell: [cellW, cellH], cols, order };
      console.log(`${key}: ${picks.length} frames (${unique} unique), cell ${cellW}x${cellH}, ${cols} cols, box ${box.join(',')}`);
    }
  } finally {
    await browser.close();
  }
  const sorted = Object.fromEntries(Object.keys(manifest).sort().map((k) => [k, manifest[k]]));
  for (const m of Object.values(sorted)) m.box = m.box.map(round2);
  writeFileSync(manifestPath, `${JSON.stringify(sorted, (k, v) => (Array.isArray(v) && v.every((x) => typeof x === 'number') ? `[${v.join(', ')}]` : v), 1).replace(/"\[([^"]*)\]"/g, '[$1]')}\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2);
  if (args.includes('--check')) {
    const bad = checkOverlays();
    if (bad.length) {
      console.error(bad.join('\n'));
      process.exit(1);
    }
    console.log('overlays.json matches the FLAs');
  } else await build(args.length ? args : Object.keys(OVERLAYS));
}
