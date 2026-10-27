#!/usr/bin/env node
/**
 * Art for the Mail Dispatcher and the AFLC Frog (lane MAILNPC, register G121),
 * all from Tiny Speck's CC0 files.
 *
 * Dispatcher: tinyspeck/glitch-items misc/npc/npc_mail_dispatcher.swf. Its
 * item timeline holds dispatcherContainer_mc at scale 1.135 with the
 * dispatcherLeft symbol (sprite 28, the default variant,
 * npc_mail_dispatcher.js 29) inside; FFDec exports all 116 frames at zoom
 * 1.135 and they go into one sheet. OpenGameArt has no dispatcher sheets.
 * Labels (npc_mail_dispatcher.as 17): idle, interact, cancel,
 * prepare_package, waiting_for_frog, package_sent.
 *
 * Frog: OpenGameArt's npc_yoga_frog sheets (Tiny Speck's own client renders,
 * 108 x 94 cells) exist for box+frogBlue, box+frogRed and none+frogRed, but
 * not none+frogBlue, the courier frog after it hands the parcel over
 * (finishDelivery sets box none; npc_yoga_frog.js 391) and the frog that
 * comes to the dispatcher with empty hands (startPickup, 721-728). The frog
 * and its box are separate symbols in inhabitants/yoga_frog/npc_yoga_frog.swf
 * (frogRed sprite 88, frogBlue sprite 108, box sprite 112), so the blue frog
 * alone is sprite 108: FFDec exports its frames and they are placed in the
 * OGA cells by the offset that lays sprite 88 (red) over the OGA none+frogRed
 * cells; that red fit is scored per label as the check.
 *
 * Output:
 *   public/assets/sprites/mail-npc/dispatcher_left.png      the dispatcher sheet (1x)
 *   public/assets/sprites/mail-npc/frog_blue_box_<label>.png  copied OGA sheets
 *   public/assets/sprites/mail-npc/frog_blue_none_<label>.png built here
 *   public/js/mail-npc-art.js  (generated: cells, columns, label ranges, origins)
 *
 * Origins follow each item's getAssetInfo position (the client's placement
 * box): npc_mail_dispatcher.js 524 {x:-67, y:-144, w:134, h:145} and
 * npc_yoga_frog.js 913 {x:-22, y:-92, w:41, h:56} (the iconic frame).
 *
 * Usage: node tools/mail-npc-art/build.mjs [--work <dir>] [--check]
 */
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { FFDEC, JAVA, swfSprites } from '../vector-sprites/swf-labels.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const AUDIT = join(os.homedir(), 'Documents/glitch-audit');
const DISPATCHER_SWF = join(AUDIT, 'glitch-items/misc/npc/npc_mail_dispatcher/npc_mail_dispatcher.swf');
const FROG_SWF = join(AUDIT, 'glitch-items/inhabitants/yoga_frog/npc_yoga_frog.swf');
const OGA = join(AUDIT, 'opengameart/extracted_vendors/glitch-assets');
const OUT_DIR = join(ROOT, 'public/assets/sprites/mail-npc');
const OUT_JS = join(ROOT, 'public/js/mail-npc-art.js');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const WORK = opt('--work', join(os.tmpdir(), 'mail-npc-art-work'));
const CHECK = args.includes('--check');

/** dispatcherContainer_mc's scale on the item timeline (frame 1). */
const DISPATCHER_SCALE = 1.135;
const DISPATCHER_SPRITE = { id: 28, name: 'dispatcherLeft' };
const DISPATCHER_POSITION = { x: -67, y: -144, w: 134, h: 145 };
const DISPATCHER_COLS = 12;
const FROG_POSITION = { x: -22, y: -92, w: 41, h: 56 };
const FROG_CELL = { w: 108, h: 94 };
const FROG_RED = { id: 88, name: 'frogRed' };
const FROG_BLUE = { id: 108, name: 'frogBlue' };
/** Every animation the frog plays (npc_yoga_frog.as 15); 'iconic' is a still. */
export const FROG_LABELS = ['idle', 'moveStart', 'move', 'moveEnd', 'talk',
  'treePoseIn', 'treePose', 'treePoseOut', 'dancerPoseIn', 'dancerPose', 'dancerPoseOut',
  'warriorPoseIn', 'warriorPose', 'warriorPoseOut'];
/** A red frame must match its OGA cell this well (1 = identical) for the offset to be trusted. */
const FIT_MIN = 0.8;

function ffdec(argv) {
  execFileSync(JAVA, ['-jar', FFDEC, ...argv], { stdio: 'ignore', timeout: 900000 });
}

function size(png) {
  return execFileSync('magick', ['identify', '-format', '%w %h', png], { encoding: 'utf8' }).trim().split(' ').map(Number);
}

function rgba(png) {
  const [w, h] = size(png);
  const data = execFileSync('magick', [png, '-depth', '8', 'RGBA:-'], { maxBuffer: 1 << 30 });
  return { w, h, data };
}

function writePng(img, out) {
  execFileSync('magick', ['-size', `${img.w}x${img.h}`, '-depth', '8', 'RGBA:-', `PNG32:${out}`], { input: img.data, maxBuffer: 1 << 30 });
}

function blank(w, h) {
  return { w, h, data: Buffer.alloc(w * h * 4) };
}

/** Copy `src` into `dst` with src (0,0) at dst (x,y), clipped to dst. */
function blit(dst, src, x, y, clip = null) {
  const c = clip || { x: 0, y: 0, w: dst.w, h: dst.h };
  for (let sy = 0; sy < src.h; sy += 1) {
    const dy = y + sy;
    if (dy < c.y || dy >= c.y + c.h) continue;
    for (let sx = 0; sx < src.w; sx += 1) {
      const dx = x + sx;
      if (dx < c.x || dx >= c.x + c.w) continue;
      src.data.copy(dst.data, (dy * dst.w + dx) * 4, (sy * src.w + sx) * 4, (sy * src.w + sx) * 4 + 4);
    }
  }
}

function crop(img, x, y, w, h) {
  const out = blank(w, h);
  blit(out, img, -x, -y);
  return out;
}

/** The drawn pixels' box (alpha above 8). */
function drawn(img) {
  let x0 = img.w; let y0 = img.h; let x1 = -1; let y1 = -1;
  for (let y = 0; y < img.h; y += 1) {
    for (let x = 0; x < img.w; x += 1) {
      if (img.data[(y * img.w + x) * 4 + 3] > 8) {
        if (x < x0) x0 = x;
        if (y < y0) y0 = y;
        if (x > x1) x1 = x;
        if (y > y1) y1 = y;
      }
    }
  }
  return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

/**
 * Premultiplied RGBA likeness of a cell and a frame placed at (dx, dy) in it:
 * 1 - sum|diff| / sum(both), so 1 is identical and 0 shares nothing.
 */
function likeness(cell, frame, dx, dy) {
  let diff = 0;
  let total = 0;
  for (let y = 0; y < cell.h; y += 1) {
    const fy = y - dy;
    for (let x = 0; x < cell.w; x += 1) {
      const fx = x - dx;
      const i = (y * cell.w + x) * 4;
      const ca = cell.data[i + 3];
      const inside = fx >= 0 && fy >= 0 && fx < frame.w && fy < frame.h;
      const j = inside ? (fy * frame.w + fx) * 4 : -1;
      const fa = inside ? frame.data[j + 3] : 0;
      if (!ca && !fa) continue;
      for (let k = 0; k < 3; k += 1) {
        const a = (cell.data[i + k] * ca) / 255;
        const b = inside ? (frame.data[j + k] * fa) / 255 : 0;
        diff += Math.abs(a - b);
        total += a + b;
      }
      diff += Math.abs(ca - fa);
      total += ca + fa;
    }
  }
  return total ? 1 - diff / total : 1;
}

function exportSprite(swf, sprite, zoom, tag) {
  const dir = join(WORK, tag);
  const out = join(dir, `DefineSprite_${sprite.id}_${sprite.name}`);
  if (!existsSync(out) || !readdirSync(out).length) {
    mkdirSync(dir, { recursive: true });
    ffdec(['-zoom', String(zoom), '-selectid', String(sprite.id), '-format', 'sprite:png', '-export', 'sprite', dir, swf]);
  }
  return (n) => join(out, `${n}.png`);
}

function labelsOf(swf, id) {
  const cache = join(WORK, `labels-${id}.json`);
  if (existsSync(cache)) return JSON.parse(readFileSync(cache, 'utf8'));
  const sprite = swfSprites(swf).find((s) => s.id === id);
  if (!sprite) throw new Error(`sprite ${id} not in ${swf}`);
  const out = Object.fromEntries(sprite.labels.map((l) => [l.name, [l.start, l.count]]));
  writeFileSync(cache, JSON.stringify(out));
  return out;
}

function ogaSheet(box, variant, label) {
  const dir = join(OGA, `npc_yoga_frog_box_${box}_variant_${variant}`);
  const file = readdirSync(dir).find((f) => f.includes(`_x1_${label}_png_`));
  if (!file) throw new Error(`no OGA ${box}/${variant} sheet for ${label}`);
  return join(dir, file);
}

function cellOf(sheet, i) {
  const cols = Math.round(sheet.w / FROG_CELL.w);
  return crop(sheet, (i % cols) * FROG_CELL.w, Math.floor(i / cols) * FROG_CELL.h, FROG_CELL.w, FROG_CELL.h);
}

mkdirSync(WORK, { recursive: true });
if (!CHECK) mkdirSync(OUT_DIR, { recursive: true });

// ---------------------------------------------------------------- dispatcher
const dLabels = labelsOf(DISPATCHER_SWF, DISPATCHER_SPRITE.id);
const dFrame = exportSprite(DISPATCHER_SWF, DISPATCHER_SPRITE, DISPATCHER_SCALE, 'dispatcher');
const dCount = Math.max(...Object.values(dLabels).map(([s, c]) => s + c - 1));
const dFrames = Array.from({ length: dCount }, (_, i) => rgba(dFrame(i + 1)));
let union = null;
for (const f of dFrames) {
  const b = drawn(f);
  if (!b) continue;
  union = union
    ? { x0: Math.min(union.x0, b.x), y0: Math.min(union.y0, b.y), x1: Math.max(union.x1, b.x + b.w), y1: Math.max(union.y1, b.y + b.h) }
    : { x0: b.x, y0: b.y, x1: b.x + b.w, y1: b.y + b.h };
}
const dCell = { w: union.x1 - union.x0 + 2, h: union.y1 - union.y0 + 2 };
const idleBox = drawn(dFrames[dLabels.idle[0] - 1]);
// The client's placement box: its top is position.y above the item's origin.
const dOrigin = {
  // Centred: the placement box (134 wide) also counts a faint base the alpha cut drops.
  x: +(idleBox.x + idleBox.w / 2 - union.x0 + 1).toFixed(1),
  y: +(idleBox.y - DISPATCHER_POSITION.y - union.y0 + 1).toFixed(1),
};
const dRows = Math.ceil(dCount / DISPATCHER_COLS);
const dSheet = blank(dCell.w * DISPATCHER_COLS, dCell.h * dRows);
dFrames.forEach((f, i) => {
  const cx = (i % DISPATCHER_COLS) * dCell.w;
  const cy = Math.floor(i / DISPATCHER_COLS) * dCell.h;
  blit(dSheet, f, cx - union.x0 + 1, cy - union.y0 + 1, { x: cx, y: cy, w: dCell.w, h: dCell.h });
});
if (!CHECK) writePng(dSheet, join(OUT_DIR, 'dispatcher_left.png'));

// ---------------------------------------------------------------------- frog
const redLabels = labelsOf(FROG_SWF, FROG_RED.id);
const blueLabels = labelsOf(FROG_SWF, FROG_BLUE.id);
const redFrame = exportSprite(FROG_SWF, FROG_RED, 1, 'frog');
const blueFrame = exportSprite(FROG_SWF, FROG_BLUE, 1, 'frog');
const sheets = Object.fromEntries(FROG_LABELS.map((l) => [l, rgba(ogaSheet('none', 'frogRed', l))]));

// One offset for the whole sprite (one shared canvas), from a spread of red frames.
const probes = [];
for (const label of ['idle', 'move', 'talk', 'treePose', 'warriorPoseIn']) {
  const [start, count] = redLabels[label];
  for (let i = 0; i < count; i += Math.max(1, Math.floor(count / 4))) probes.push([cellOf(sheets[label], i), rgba(redFrame(start + i))]);
}
let best = { dx: 0, dy: 0, score: -1 };
for (let dy = -12; dy <= 12; dy += 1) {
  for (let dx = -12; dx <= 12; dx += 1) {
    let s = 0;
    for (const [cell, frame] of probes) s += likeness(cell, frame, dx, dy);
    s /= probes.length;
    if (s > best.score) best = { dx, dy, score: s };
  }
}

const fits = {};
const weak = [];
for (const label of FROG_LABELS) {
  const [start, count] = redLabels[label];
  let sum = 0;
  for (let i = 0; i < count; i += 1) sum += likeness(cellOf(sheets[label], i), rgba(redFrame(start + i)), best.dx, best.dy);
  fits[label] = +(sum / count).toFixed(3);
  if (fits[label] < FIT_MIN) weak.push(`${label} ${fits[label]}`);
}
if (weak.length) throw new Error(`the red frog does not line up with its OGA cells (${weak.join(', ')})`);

const frogSheets = {};
for (const label of FROG_LABELS) {
  const ref = sheets[label];
  const [start, count] = blueLabels[label];
  if (count !== redLabels[label][1]) throw new Error(`${label}: blue ${count} frames, red ${redLabels[label][1]}`);
  const cols = Math.round(ref.w / FROG_CELL.w);
  frogSheets[label] = [cols, count];
  if (CHECK) continue;
  copyFileSync(ogaSheet('box', 'frogBlue', label), join(OUT_DIR, `frog_blue_box_${label}.png`));
  const out = blank(ref.w, ref.h);
  for (let i = 0; i < count; i += 1) {
    const cx = (i % cols) * FROG_CELL.w;
    const cy = Math.floor(i / cols) * FROG_CELL.h;
    blit(out, rgba(blueFrame(start + i)), cx + best.dx, cy + best.dy, { x: cx, y: cy, w: FROG_CELL.w, h: FROG_CELL.h });
  }
  writePng(out, join(OUT_DIR, `frog_blue_none_${label}.png`));
}
// The iconic frame's box (blue sprite frame 1) is the client's placement box.
const iconic = drawn(rgba(blueFrame(blueLabels.iconic[0])));
const fOrigin = { x: iconic.x - FROG_POSITION.x + best.dx, y: iconic.y - FROG_POSITION.y + best.dy };

const js = [
  '/**',
  ' * GENERATED by tools/mail-npc-art/build.mjs. Do not edit.',
  ' *',
  ' * The Mail Dispatcher (glitch-items npc_mail_dispatcher.swf, dispatcherLeft at',
  ' * the item\'s 1.135 scale) and the AFLC Frog (OGA npc_yoga_frog box+frogBlue',
  ' * sheets; the frog without its box built from the SWF\'s frogBlue sprite), all',
  ' * CC0. Labels are [first cell, count]; origins are the item\'s x, y inside a',
  ' * cell (the client\'s getAssetInfo placement box).',
  ' */',
  'export const MAIL_NPC_ART_DIR = \'assets/sprites/mail-npc/\';',
  `export const DISPATCHER_ART = Object.freeze(${JSON.stringify({
    file: 'dispatcher_left.png',
    cell: dCell,
    cols: DISPATCHER_COLS,
    origin: dOrigin,
    labels: Object.fromEntries(Object.entries(dLabels).map(([k, [s, c]]) => [k, [s - 1, c]])),
  })});`,
  `export const FROG_ART = Object.freeze(${JSON.stringify({
    cell: FROG_CELL,
    origin: fOrigin,
    files: { box: 'frog_blue_box_', none: 'frog_blue_none_' },
    sheets: frogSheets,
    redFit: fits,
  })});`,
  '',
].join('\n');

if (CHECK) {
  const have = existsSync(OUT_JS) ? readFileSync(OUT_JS, 'utf8') : '';
  const files = ['dispatcher_left.png', ...FROG_LABELS.flatMap((l) => [`frog_blue_box_${l}.png`, `frog_blue_none_${l}.png`])];
  const lost = files.filter((f) => !existsSync(join(OUT_DIR, f)));
  if (have !== js || lost.length) {
    console.error(`mail npc art is stale${lost.length ? ` (${lost.length} files missing)` : ''}: run node tools/mail-npc-art/build.mjs`);
    process.exit(1);
  }
  process.exit(0);
}
writeFileSync(OUT_JS, js);
console.log(`mail npc art: dispatcher ${dCount} frames (${dCell.w}x${dCell.h}), frog offset ${best.dx},${best.dy} (fit ${best.score.toFixed(3)}), ${FROG_LABELS.length} labels`);
console.log(JSON.stringify(fits));
