#!/usr/bin/env node
/**
 * Race sheets for the 43 Cubimal figures (features/cubimal-race-feature.js)
 * from Tiny Speck's CC0 OpenGameArt dump: npc_cubimal_<slug>__x1_race_png_*,
 * the client's own recording of each figure's `race` FrameLabel (wind-up key
 * turning, feet stepping). Every sheet is 20 columns x 3 rows = 60 frames at
 * 30 fps (a 2 s loop); cell sizes differ per figure and are kept in
 * js/cubimals.js CUBIMAL_RACE_CELLS, which this script checks. The art faces
 * right (the key is on the figure's back, at the left), the way it races.
 *
 * Output: public/assets/sprites/cubimals/<class>_race.webp (lossless WebP,
 * about a third of the PNG). The sharp <class>_race@3x.webp beside each comes
 * from the figure's vector SWF, matched against this sheet:
 * node tools/vector-sprites/build.mjs --manifest tools/vector-sprites/cubimals.json
 * (rerun it after rewriting these sheets).
 *
 *   node tools/cubimal-race-art.mjs           # extract + write
 *   node tools/cubimal-race-art.mjs --check   # verify the shipped sheets
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import { CUBIMAL_RACE_CELLS, CUBIMAL_RACE_SHEET, cubimalRaceSheet } from '../public/js/cubimals.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const OGA = join(os.homedir(), 'Documents/glitch-audit/opengameart');
const OUT = join(root, 'public/assets/sprites/cubimals');
const check = process.argv.includes('--check');
const run = (cmd, args) => execFileSync(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim();
const size = (file) => run('magick', ['identify', '-format', '%w %h', file]).split(' ').map(Number);

let bad = 0;
if (check) {
  for (const classTsid of Object.keys(CUBIMAL_RACE_CELLS)) {
    const def = cubimalRaceSheet(classTsid);
    const file = join(root, 'public', def.path);
    if (!existsSync(file)) {
      console.log(`missing ${def.path}`);
      bad += 1;
      continue;
    }
    const [w, h] = size(file);
    if (w !== def.fw * CUBIMAL_RACE_SHEET.cols || h !== def.fh * CUBIMAL_RACE_SHEET.rows) {
      console.log(`${def.path}: ${w}x${h}, table says ${def.fw}x${def.fh} cells`);
      bad += 1;
    }
  }
  console.log(bad ? `${bad} sheet(s) off` : `${Object.keys(CUBIMAL_RACE_CELLS).length} sheets ok`);
  process.exit(bad ? 1 : 0);
}

mkdirSync(OUT, { recursive: true });
const tmp = mkdtempSync(join(os.tmpdir(), 'cubimal-race-'));
try {
  for (const archive of ['glitch-assets-1.7z', 'glitch-assets-2.7z']) {
    try {
      run('7z', ['x', '-y', join(OGA, archive), 'glitch-assets/npc_cubimal_*/*__x1_race_png_*', `-o${tmp}`]);
    } catch {
      /* the figures live in archive 1; archive 2 has none */
    }
  }
  for (const classTsid of Object.keys(CUBIMAL_RACE_CELLS)) {
    const dir = join(tmp, 'glitch-assets', classTsid);
    const src = existsSync(dir) ? readdirSync(dir).find((f) => f.includes('__x1_race_png_')) : null;
    if (!src) {
      console.log(`${classTsid}: no race sheet in the OGA archives`);
      bad += 1;
      continue;
    }
    const def = cubimalRaceSheet(classTsid);
    const [w, h] = size(join(dir, src));
    if (w !== def.fw * CUBIMAL_RACE_SHEET.cols || h !== def.fh * CUBIMAL_RACE_SHEET.rows) {
      console.log(`${classTsid}: ${w}x${h} is not ${CUBIMAL_RACE_SHEET.cols}x${CUBIMAL_RACE_SHEET.rows} cells of ${def.fw}x${def.fh}`);
      bad += 1;
      continue;
    }
    run('cwebp', ['-quiet', '-lossless', '-z', '9', '-exact', join(dir, src), '-o', join(root, 'public', def.path)]);
    console.log(`wrote ${def.path}`);
  }
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
process.exit(bad ? 1 : 0);
