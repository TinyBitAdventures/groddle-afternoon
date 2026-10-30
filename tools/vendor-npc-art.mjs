#!/usr/bin/env node
/**
 * The vendor NPCs' sheets (features/vendor-npcs-feature.js) from Tiny Speck's
 * CC0 OpenGameArt dump (glitch-assets-1.7z / -2.7z, extracted to
 * opengameart/extracted_vendors): the Gardening Tools Vendor, Meal Vendor,
 * Tool Vendor, Uncle Friendly and Helga. Each x1 sheet is a fixed grid
 * (js/vendor-npcs.js VENDOR_NPC_ART: cell, frames); every state is cropped
 * to the union of its frames and written as a lossless WebP strip, 8 columns.
 * The crop offsets live in VENDOR_NPC_ART so the feet anchor stays the
 * source cell's.
 *
 *   node tools/vendor-npc-art.mjs            write the strips
 *   node tools/vendor-npc-art.mjs --measure  print each state's union crop
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, rmSync, mkdtempSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import { VENDOR_NPC_ART } from '../public/js/vendor-npcs.js?v=53b1f6c9';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const OGA = join(os.homedir(), 'Documents/glitch-audit/opengameart/extracted_vendors/glitch-assets');
const OUT = join(root, 'public/assets/sprites/vendors');
const COLS = 8;
const measure = process.argv.includes('--measure');
const magick = (args) => execFileSync('magick', args, { stdio: ['ignore', 'pipe', 'pipe'] }).toString();

mkdirSync(OUT, { recursive: true });
const tmp = mkdtempSync(join(os.tmpdir(), 'vendors-'));
try {
  for (const [classTsid, art] of Object.entries(VENDOR_NPC_ART)) {
    const dir = join(OGA, classTsid);
    const files = readdirSync(dir);
    for (const [state, sheet] of Object.entries(art.states)) {
      const src = files.find((f) => f.includes(`_x1_${sheet.oga}_png_`));
      if (!src) throw new Error(`${dir}: no ${sheet.oga}`);
      const cells = join(tmp, `${classTsid}-${state}`);
      mkdirSync(cells);
      magick([join(dir, src), '-crop', `${art.cell.w}x${art.cell.h}`, '+repage', join(cells, '%04d.png')]);
      const first = sheet.first || 0;
      const frames = readdirSync(cells).sort().slice(first, first + sheet.frames).map((f) => join(cells, f));
      if (frames.length !== sheet.frames) throw new Error(`${src}: ${frames.length} of ${sheet.frames} frames`);
      if (measure) {
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        for (const f of frames) {
          const box = magick([f, '-format', '%@', 'info:']).trim().match(/(\d+)x(\d+)\+(\d+)\+(\d+)/);
          if (!box) continue;
          const [w, h, x, y] = box.slice(1).map(Number);
          if (w <= 1 && h <= 1) continue;
          x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x + w); y1 = Math.max(y1, y + h);
        }
        console.log(`${classTsid} ${state}: crop { x: ${x0}, y: ${y0}, w: ${x1 - x0}, h: ${y1 - y0} }`);
      } else {
        const { x, y, w, h } = sheet.crop;
        const out = join(OUT, `${classTsid}_${state}.webp`);
        const rows = Math.ceil(frames.length / COLS);
        const args = [];
        for (let r = 0; r < rows; r += 1) {
          args.push('(', ...frames.slice(r * COLS, r * COLS + COLS).flatMap((f) => ['(', f, '-crop', `${w}x${h}+${x}+${y}`, '+repage', '-background', 'none', '-extent', `${w}x${h}`, ')']), '+append', ')');
        }
        magick([...args, '-background', 'none', '-gravity', 'northwest', '-append', '-define', 'webp:lossless=true', out]);
        console.log(`wrote ${out}`);
      }
      rmSync(cells, { recursive: true, force: true });
    }
  }
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
