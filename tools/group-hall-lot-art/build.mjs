#!/usr/bin/env node
/**
 * The Group Hall lot (street-projects audit 2026-11-11, gap 1), from Tiny Speck's CC0 file
 * glitch-items misc/group_hall_lot_marker/group_hall_lot_marker.swf (one frame, no states).
 *
 * The SWF's root timeline places two pieces (FFDec -swf2xml):
 *   - DefineShape4 1 at depth 2, matrix (0, 0): the roped plot, four stakes, the rope and the
 *     red ribbon, 621 x 96.4 px (shapeBounds 12420 x 1928 twips);
 *   - DefineSprite 3 at depth 3, named "interaction_target", matrix (1483, 135) twips: the sign
 *     with the house, hammer and wrench (DefineShape3 2, 85.9 x 107.85 px). The client
 *     hit-tests an item by its interaction_target, so the sign is what you click.
 * The stage is 621 x 114.6 px (displayRect 12420 x 2292 twips), the item's getAssetInfo box
 * {x:-311, y:-115, w:621, h:115} (items/group_hall_lot_marker.js 119): the origin is the stage's
 * bottom centre, which is where the sign's post meets the ground.
 *
 * Each piece is exported at zoom 3 (the game's sharp art density; js/textures.js reads
 * resolution 3 from the @3x name, so they draw at their 1x size) and written as lossless WebP.
 * The build also lays the two pieces back together at their matrices and compares the result
 * with FFDec's own render of the whole frame, so the offsets in js/group-hall-lot.js are the SWF's.
 *
 * Output: public/assets/sprites/street-jobs/group_hall_lot_plot@3x.webp
 *         public/assets/sprites/street-jobs/group_hall_lot_sign@3x.webp
 * Usage:  node tools/group-hall-lot-art/build.mjs [--work <dir>] [--check]
 *         --check: no Java; the files exist at the sizes js/group-hall-lot.js expects.
 * The SWF is data: FFDec reads it, nothing runs it.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import os from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FFDEC, JAVA } from '../vector-sprites/swf-labels.mjs';
import { encodeLosslessWebp } from '../webp-lossless.mjs';
import { imageSize } from '../image-size.mjs';
import { LOT_ART } from '../../public/js/group-hall-lot.js?v=23e8fbd9';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SWF = join(os.homedir(), 'Documents/glitch-audit/glitch-items/misc/group_hall_lot_marker/group_hall_lot_marker.swf');
const ZOOM = 3;
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const WORK = opt('--work', join(os.tmpdir(), 'group-hall-lot-art'));
const out = (piece) => join(ROOT, 'public', LOT_ART[piece].url);

function check() {
  let bad = 0;
  for (const piece of ['plot', 'sign']) {
    const file = out(piece);
    if (!existsSync(file)) { console.error(`missing ${file}`); bad += 1; continue; }
    const { w: width, h: height } = imageSize(file);
    const want = [Math.ceil(LOT_ART[piece].w * ZOOM), Math.ceil(LOT_ART[piece].h * ZOOM)];
    if (Math.abs(width - want[0]) > 1 || Math.abs(height - want[1]) > 1) {
      console.error(`${file}: ${width} x ${height}, expected about ${want.join(' x ')}`);
      bad += 1;
    }
  }
  if (bad) process.exit(1);
  console.log('group hall lot art is current');
}

function ffdec(argv) {
  execFileSync(JAVA, ['-jar', FFDEC, ...argv], { stdio: 'ignore', timeout: 300000 });
}
const firstPng = (dir) => join(dir, readdirSync(dir).find((f) => f.endsWith('.png')));

function build() {
  mkdirSync(WORK, { recursive: true });
  const shapeDir = join(WORK, 'shape');
  const spriteDir = join(WORK, 'sprite');
  const frameDir = join(WORK, 'frame');
  ffdec(['-zoom', String(ZOOM), '-selectid', '1', '-format', 'shape:png', '-export', 'shape', shapeDir, SWF]);
  ffdec(['-zoom', String(ZOOM), '-selectid', '3', '-format', 'sprite:png', '-export', 'sprite', spriteDir, SWF]);
  ffdec(['-zoom', String(ZOOM), '-format', 'frame:png', '-export', 'frame', frameDir, SWF]);
  const plot = firstPng(shapeDir);
  const sign = firstPng(join(spriteDir, readdirSync(spriteDir).find((d) => d.startsWith('DefineSprite'))));
  const frame = firstPng(frameDir);

  // Lay the pieces back at their SWF offsets and compare with FFDec's whole-frame render.
  const { w: fw, h: fh } = imageSize(frame);
  const at = (piece) => `+${Math.round((LOT_ART[piece].x + LOT_ART.originX) * ZOOM)}+${Math.round((LOT_ART[piece].y + LOT_ART.originY) * ZOOM)}`;
  const composite = join(WORK, 'composite.png');
  execFileSync('magick', ['-size', `${fw}x${fh}`, 'xc:none', plot, '-geometry', at('plot'), '-composite', sign, '-geometry', at('sign'), '-composite', composite]);
  let diff = '';
  try {
    // The frame export carries the stage's white background (SetBackgroundColor ff ff ff): compare both on white.
    const onWhite = (png) => {
      const flat = png.replace(/\.png$/, '-white.png');
      execFileSync('magick', [png, '-background', 'white', '-flatten', flat]);
      return flat;
    };
    diff = execFileSync('magick', ['compare', '-metric', 'RMSE', onWhite(composite), onWhite(frame), 'null:'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (err) {
    diff = String(err.stderr || err.stdout || ''); // compare exits 1 when the images differ at all
  }
  const norm = Number(/\(([\d.e-]+)\)/.exec(diff)?.[1]);
  if (!(norm < 0.02)) throw new Error(`pieces at the SWF offsets do not match the frame render (RMSE ${diff.trim()})`);

  mkdirSync(dirname(out('plot')), { recursive: true });
  encodeLosslessWebp(plot, out('plot'));
  encodeLosslessWebp(sign, out('sign'));
  console.log(`plot ${imageSize(out("plot")).w} x ${imageSize(out("plot")).h}, sign ${imageSize(out("sign")).w} x ${imageSize(out("sign")).h}; laid together vs the frame: RMSE ${norm}`);
}

if (args.includes('--check')) check();
else build();
