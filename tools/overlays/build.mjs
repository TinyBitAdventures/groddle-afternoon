#!/usr/bin/env node
/**
 * More of Tiny Speck's overlay animations (glitch-overlays/*.fla, CC0, HEAD
 * 72aecf9), for register rows G372-G396: the skill-package pictures (pet,
 * nibble, squeeze, milk, massage, trant harvest and pet, scoop, revive), the
 * show_rainbow arcs the remake did not have, the race countdown, the game
 * logos and the rest. public/js/overlays.js plays them.
 *
 * The overlay sources are XFL authoring files (zipped .fla, CS5.5), not SWFs,
 * so FFDec cannot read them; tools/overlay-art/xfl-svg.mjs draws each frame
 * as SVG (the reader tools/overlay-art/build.mjs uses for the first 27
 * overlays) and Chrome rasterises it. Per overlay the frames are drawn at
 * `scale` (stage px to sheet px: 2 for the small 1:1 skill pictures, 1.25
 * for the 400 px rainbows over their 330 px stage, as overlay-art does),
 * identical frames are kept once, and the cells are packed in one WebP
 * sheet. Each sheet's bytes and sha256 and each FLA's sha1 are recorded in
 * public/assets/sprites/overlays/overlays-more.json (the same row shape as
 * overlays.json, so overlay-art.js's cellRect / standPlacement read it).
 *
 * Usage: node tools/overlays/build.mjs [key...]   (all by default; needs Chrome)
 *        node tools/overlays/build.mjs --check    (the manifest matches the FLAs and the files)
 * PLAYWRIGHT_CORE may name a playwright-core build (the repo's playwright
 * otherwise). The FLA is data: it is only inflated and parsed, nothing runs.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { frameSvg, loadFla } from '../overlay-art/xfl-svg.mjs';
import { readZip } from '../avatar-compositor/xfl.mjs';
import { framePlan, scrub } from '../overlay-art/build.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const spike = join(here, '../..');
const audit = join(spike, '..');
export const OUT_DIR = join(spike, 'public/assets/sprites/overlays');
export const MANIFEST = join(OUT_DIR, 'overlays-more.json');
const fla = (k) => `glitch-overlays/${k}.fla`;
const small = (k, extra = {}) => ({ fla: fla(k), scale: 2, step: 1, webp: 0.85, ...extra });
// The skill-package pictures (pig_pet, trant_harvest and the rest) fade their one
// clip in and out with a CS4 motion object (motionObjectXML Alpha_Amount 0, 100 at
// frame 6, 100 at 13, 0 at 19), which the classic-tween reader does not follow:
// a config with motionAlpha: true applies that curve. They are not built: they are
// the verb's word (pet, harvest, squeeze ...) and the client draws its word
// progress bar instead whenever the announcement has word_progress
// (InLocationAnnouncementOverlay.as 441-442), which every one of those calls
// sends; only the 40 px bubble other players see uses them.
const rainbow = (k) => ({ fla: fla(k), scale: 1.25, step: 1, webp: 0.8 });

/**
 * Where each is shown lives with the player (public/js/overlays.js
 * OVERLAY_USES); here only how it is drawn.
 */
export const OVERLAYS = Object.freeze({
  // G383 inc_trading.js 188-205: the 70 px bubble over a trading player.
  trading: small('trading'),
  // G374-G376, G373 show_rainbow (players/player.js 3014-3029): 400 x 400 over the 330 x 200 stage
  // (rainbow_randomkindness waits on the Random Kindness bestow verb; not built).
  rainbow_100coinstoday: rainbow('rainbow_100coinstoday'),
  rainbow_150coinstoday: rainbow('rainbow_150coinstoday'),
  rainbow_maxrelax: rainbow('rainbow_maxrelax'),
  rainbow_superharvest: rainbow('rainbow_superharvest'),
  rainbow_spindoctor: rainbow('rainbow_spindoctor'),
  rainbow_superdonation: rainbow('rainbow_superdonation'),
  charades_gameover: rainbow('charades_gameover'),
  // G394: 350 px over the 362 x 199 stage; the one main frame holds the 106-frame 321go clip (stop()).
  '321_countdown': { fla: fla('321_countdown'), scale: 1.5, step: 1, webp: 0.85 },
  // G373 fox_bait.js 127-138: 150 x 150.
  fox_bait_ignite: { fla: fla('fox_bait_ignite'), scale: 1.5, step: 1, webp: 0.85 },
  // G372 dust_trap.js organelleOverlay 214-233.
  vacuoles: small('vacuoles'),
  endoplasmic_reticulum: small('endoplasmic_reticulum'),
  super_old_mitochondrial_dna: small('super_old_mitochondrial_dna'),
  golgi_apparatus: small('golgi_apparatus'),
  // G377: the feathers clip plays once (stop()); the dice and the 12-sided die have states.
  rook_feathers_falling: { fla: fla('rook_feathers_falling'), scale: 1, step: 1, webp: 0.85 },
  dice_overlay: small('dice_overlay', { scale: 1.5, states: { symbol: 'diceOverlay', labels: ['spin', 'roll1', 'roll2', 'roll3', 'roll4', 'roll5', 'roll6'] } }),
  twelve_sided_die: small('twelve_sided_die', {
    scale: 1.5,
    states: { symbol: 'twelveSidedDie', labels: ['spin', 'roll_alph', 'roll_cosma', 'roll_friendly', 'roll_grendaline', 'roll_humbaba', 'roll_lem', 'roll_mab', 'roll_pot', 'roll_spriggan', 'roll_ti', 'roll_zille', 'roll_rook'] },
  }),
  // G378 (jellisac_splatter_on_shrine waits on the Jellisac Hands slather verb; not built).
  musicblock_notes: small('musicblock_notes'),
  // G379.
  petrified_rock_open_overlay: { fla: fla('petrified_rock_open_overlay'), scale: 1.5, step: 1, webp: 0.85 },
  // G380: 300 px over the ~200 px stages.
  target_effect_powder_extreme: { fla: fla('target_effect_powder_extreme'), scale: 1.5, step: 1, webp: 0.85 },
  target_effect_powder_mild: { fla: fla('target_effect_powder_mild'), scale: 1.5, step: 1, webp: 0.85 },
  // G381: waiting loops, grab plays into pull.
  glitchmas_cracker: { fla: fla('glitchmas_cracker'), scale: 1, step: 1, webp: 0.85, states: { symbol: 'glitchmasCracker', labels: ['waiting', 'grab'] } },
  // G382 (click_to_prime is left out: it is the clickable prompt to prime, not built).
  click_to_donate: { fla: fla('click_to_donate'), scale: 1.5, step: 1, webp: 0.85 },
  shrine_power_up: { fla: fla('shrine_power_up'), scale: 1, step: 1, webp: 0.85, states: { symbol: 'shrinePowerUp', labels: ['charge', 'ready', 'off'] } },
  // G391: the Hell Hole hint arrow (75 px over the 140 px stage).
  right_arrow: { fla: fla('right_arrow'), scale: 1, step: 1, webp: 0.85 },
  // G389.
  phantom_glitch: { fla: fla('phantom_glitch'), scale: 1.25, step: 1, webp: 0.85 },
  // G390: charge, ready, off.
  avatar_power_up: { fla: fla('avatar_power_up'), scale: 1.5, step: 1, webp: 0.85, states: { symbol: 'avatarPowerUp', labels: ['charge', 'ready', 'off'] } },
  // G392.
  tower_sign_scaffolding_overlay: small('tower_sign_scaffolding_overlay'),
  // G393: the new player's skill cards (one frame each; art only, the flow is Austin's call). The
  // three house cards draw their houses with overlay / screen blend modes the reader does not do.
  newxpchooseskill_animalkinship_overlay: small('newxpchooseskill_animalkinship_overlay', { webp: 0.9 }),
  newxpchooseskill_ezcooking_overlay: small('newxpchooseskill_ezcooking_overlay', { webp: 0.9 }),
  newxpchooseskill_lightgreenthumb_overlay: small('newxpchooseskill_lightgreenthumb_overlay', { webp: 0.9 }),
  // G395: the games' opening logos (one frame), drawn like the winner splashes.
  race_logo: { fla: fla('race_logo'), scale: 1.5, step: 1, webp: 0.9 },
  grabemgood_logo: { fla: fla('grabemgood_logo'), scale: 1.5, step: 1, webp: 0.9 },
  thegreathoghaul_logo: { fla: fla('thegreathoghaul_logo'), scale: 1.5, step: 1, webp: 0.9 },
  game_of_crowns_logo: { fla: fla('game_of_crowns_logo'), scale: 1.5, step: 1, webp: 0.9 },
  // G396.
  crown_game_indicator_you: small('crown_game_indicator_you', { webp: 0.9 }),
  crown_game_indicator_someone_else: small('crown_game_indicator_someone_else', { webp: 0.9 }),
  game_of_crowns_throbber: small('game_of_crowns_throbber'),
});

/**
 * A main-timeline motion object's Alpha_Amount curve (CS4 motion tweens,
 * motionObjectXML): [[frame, alpha 0..1], ...] for the first layer that has
 * one, or null. Keyframe timevalue is in AnimationCore TimeScale units per
 * second; anchor "x,v" holds the value v (percent). TimeMap strength 0 is
 * linear.
 */
export function motionAlphaCurve(file, fps) {
  const doc = readZip(file).read('DOMDocument.xml').toString('utf8');
  const core = doc.match(/<AnimationCore TimeScale="(\d+)"[\s\S]*?<\/AnimationCore>/);
  if (!core) return null;
  const ts = Number(core[1]);
  const prop = core[0].match(/<Property [^>]*id="Alpha_Amount"[^>]*>((?:<Keyframe [^>]*\/>)+)<\/Property>/);
  if (!prop) return null;
  if (!/<TimeMap strength="0"/.test(core[0])) throw new Error(`${file}: an eased motion object`);
  return [...prop[1].matchAll(/<Keyframe anchor="[^,]*,([^"]+)"[^>]*timevalue="(\d+)"/g)]
    .map((m) => [Number(m[2]) * fps / ts, Number(m[1]) / 100]);
}

/** The curve's value at frame n (held before the first and after the last key). */
export function curveAt(curve, n) {
  if (n <= curve[0][0]) return curve[0][1];
  for (let i = 1; i < curve.length; i++) {
    const [f1, v1] = curve[i];
    const [f0, v0] = curve[i - 1];
    if (n <= f1) return v0 + (v1 - v0) * ((n - f0) / (f1 - f0 || 1));
  }
  return curve[curve.length - 1][1];
}

/** The loaded FLA with the motion object's own colour alpha lifted to 1 (the curve carries it). */
function liftMotionAlpha(doc) {
  for (const L of doc.main.layers) for (const f of L.frames) for (const e of f.els) if (e.k === 'inst' && e.ct) e.ct[3] = 1;
  return doc;
}

const withOpacity = (svg, a) => (a >= 0.999 ? svg : svg.replace(/^(<svg[^>]*>)/, `$1<g opacity="${Math.round(a * 1000) / 1000}">`).replace(/<\/svg>$/, '</g></svg>'));

const sha = (buf, alg = 'sha256') => createHash(alg).update(buf).digest('hex');
const round2 = (v) => Math.round(v * 100) / 100;

/** Width and height from a WebP's VP8X / VP8L / VP8 header. */
export function webpSize(buf) {
  if (buf.subarray(0, 4).toString('latin1') !== 'RIFF' || buf.subarray(8, 12).toString('latin1') !== 'WEBP') throw new Error('not a WebP');
  const kind = buf.subarray(12, 16).toString('latin1');
  if (kind === 'VP8X') return [1 + buf.readUIntLE(24, 3), 1 + buf.readUIntLE(27, 3)];
  if (kind === 'VP8L') {
    const b = buf.readUInt32LE(21);
    return [1 + (b & 0x3fff), 1 + ((b >> 14) & 0x3fff)];
  }
  if (kind === 'VP8 ') return [buf.readUInt16LE(26) & 0x3fff, buf.readUInt16LE(28) & 0x3fff];
  throw new Error(`WebP ${kind}`);
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
window.pack = (cols, quality) => {
  const w = frames[0].c.width, h = frames[0].c.height;
  const s = document.createElement('canvas');
  s.width = w * Math.min(cols, frames.length); s.height = h * Math.ceil(frames.length / cols);
  const ctx = s.getContext('2d');
  frames.forEach((f, i) => ctx.drawImage(f.c, (i % cols) * w, Math.floor(i / cols) * h));
  frames = [];
  return s.toDataURL('image/webp', quality);
};
`;

async function launch() {
  const { chromium } = await import(process.env.PLAYWRIGHT_CORE || 'playwright');
  const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  return chromium.launch({ headless: true, executablePath: existsSync(chrome) ? chrome : undefined, args: ['--force-color-profile=srgb', '--disable-features=MacAppCodeSignClone'] });
}

/** One overlay to a WebP sheet: its manifest row (overlays.json's sheet shape plus bytes and sha256). */
async function buildOne(page, key, cfg) {
  const file = join(audit, cfg.fla);
  const doc = scrub(loadFla(file), cfg.scrub);
  const curve = cfg.motionAlpha ? motionAlphaCurve(file, doc.doc.frameRate) : null;
  if (cfg.motionAlpha && !curve) throw new Error(`${key}: no motion object alpha`);
  if (curve) liftMotionAlpha(doc);
  const svgAt = (n, opts) => (curve ? withOpacity(frameSvg(doc, n, opts), curveAt(curve, n)) : frameSvg(doc, n, opts));
  const plan = framePlan({ kind: 'sheet', ...cfg }, doc);
  const pad = 300;
  const W = doc.doc.width;
  const H = doc.doc.height;
  const wide = [-pad, -pad, W + pad * 2, H + pad * 2];
  let u = null;
  for (const { n, start } of plan.picks) {
    // The box: every frame at full opacity (a faded frame still covers its area).
    const b = await page.evaluate((src) => window.bbox(src), frameSvg(doc, n, { box: wide, start }));
    if (!b) continue;
    u = u ? [Math.min(u[0], b[0]), Math.min(u[1], b[1]), Math.max(u[2], b[2]), Math.max(u[3], b[3])] : b;
  }
  if (!u) throw new Error(`${key}: nothing drawn`);
  const box = [u[0] - pad - 1, u[1] - pad - 1, u[2] - u[0] + 2, u[3] - u[1] + 2].map(round2);
  const order = [];
  for (const { n, start } of plan.picks) order.push(await page.evaluate((src) => window.addFrame(src), svgAt(n, { box, scale: cfg.scale, start })));
  const unique = Math.max(...order) + 1;
  const cellW = Math.ceil(box[2] * cfg.scale);
  const cellH = Math.ceil(box[3] * cfg.scale);
  const cols = Math.max(1, Math.min(unique, Math.floor(4096 / cellW)));
  if (Math.ceil(unique / cols) * cellH > 16383) throw new Error(`${key}: sheet too tall for WebP (box ${box.join(",")}, ${unique} cells)`);
  const dataUrl = await page.evaluate(([c, q]) => window.pack(c, q), [cols, cfg.webp]);
  const out = cfg.scale === 1 ? `${key}.webp` : `${key}@${cfg.scale}x.webp`;
  const buf = Buffer.from(dataUrl.split(',')[1], 'base64');
  if (buf.subarray(8, 12).toString('latin1') !== 'WEBP') throw new Error(`${key}: Chrome did not write a WebP`);
  writeFileSync(join(OUT_DIR, out), buf);
  console.log(`${key}: ${plan.picks.length} frames (${unique} unique), cell ${cellW}x${cellH}, ${cols} cols, ${(buf.length / 1024).toFixed(0)} KB`);
  return {
    kind: 'sheet',
    src: cfg.fla,
    fla: sha(readFileSync(file), 'sha1'),
    fps: doc.doc.frameRate / cfg.step,
    frames: plan.picks.length,
    stage: [W, H],
    box,
    ...(plan.states ? { states: plan.states } : {}),
    ...(curve ? { motionAlpha: curve.map(([f, v]) => [round2(f), round2(v)]) } : {}),
    file: out,
    scale: cfg.scale,
    cell: [cellW, cellH],
    cols,
    order,
    bytes: buf.length,
    sha256: sha(buf),
  };
}

function writeManifest(manifest) {
  const sorted = Object.fromEntries(Object.keys(manifest).sort().map((k) => [k, manifest[k]]));
  const text = JSON.stringify(sorted, (k, v) => (Array.isArray(v) && v.every((x) => typeof x === 'number') ? `[${v.join(', ')}]` : v), 1).replace(/"\[([^"]*)\]"/g, '[$1]');
  writeFileSync(MANIFEST, `${text}\n`);
}

async function build(keys) {
  mkdirSync(OUT_DIR, { recursive: true });
  const manifest = existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, 'utf8')) : {};
  const browser = await launch();
  try {
    const page = await browser.newPage();
    await page.setContent('<!doctype html><body></body>');
    await page.addScriptTag({ content: PAGE });
    for (const key of keys) {
      if (!OVERLAYS[key]) throw new Error(`unknown overlay ${key}`);
      manifest[key] = await buildOne(page, key, OVERLAYS[key]);
      writeManifest(manifest);
    }
  } finally {
    await browser.close();
  }
  for (const k of Object.keys(manifest)) if (!OVERLAYS[k]) delete manifest[k];
  writeManifest(manifest);
}

/** Problems with the manifest (empty when it matches the config, the FLAs beside the game and the sheets). */
export function checkOverlays() {
  const bad = [];
  if (!existsSync(MANIFEST)) return ['overlays-more.json is missing: run node tools/overlays/build.mjs'];
  const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
  for (const k of Object.keys(manifest)) if (!OVERLAYS[k]) bad.push(`${k}: not in the config`);
  for (const [key, cfg] of Object.entries(OVERLAYS)) {
    const m = manifest[key];
    if (!m) { bad.push(`${key}: not built`); continue; }
    const out = join(OUT_DIR, m.file);
    if (!existsSync(out)) { bad.push(`${key}: no ${m.file}`); continue; }
    const buf = readFileSync(out);
    if (buf.length !== m.bytes || sha(buf) !== m.sha256) bad.push(`${key}: ${m.file} differs from the manifest`);
    const [w, h] = webpSize(buf);
    const unique = Math.max(...m.order) + 1;
    if (w !== m.cell[0] * Math.min(m.cols, unique) || h !== m.cell[1] * Math.ceil(unique / m.cols)) bad.push(`${key}: sheet ${w}x${h}`);
    if (m.scale !== cfg.scale || m.src !== cfg.fla) bad.push(`${key}: config changed`);
    if (m.order.length !== m.frames) bad.push(`${key}: order`);
    if (Boolean(m.states) !== Boolean(cfg.states)) bad.push(`${key}: states`);
    const src = join(audit, cfg.fla);
    if (!existsSync(src)) continue; // glitch-overlays not beside the game: the files alone are checked
    if (sha(readFileSync(src), 'sha1') !== m.fla) { bad.push(`${key}: FLA changed`); continue; }
    const plan = framePlan({ kind: 'sheet', ...cfg }, scrub(loadFla(src), cfg.scrub));
    if (plan.picks.length !== m.frames) bad.push(`${key}: frame count ${plan.picks.length}, built ${m.frames}`);
  }
  return bad;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2);
  if (args.includes('--check')) {
    const bad = checkOverlays();
    if (bad.length) {
      console.error(bad.join('\n'));
      process.exit(1);
    }
    console.log(`overlays-more.json matches the FLAs (${Object.keys(OVERLAYS).length} overlays)`);
  } else await build(args.length ? args : Object.keys(OVERLAYS));
}
