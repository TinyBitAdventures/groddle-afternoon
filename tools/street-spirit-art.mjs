#!/usr/bin/env node
/**
 * The regional Street Spirits' sheets (register G181, js/street-spirits.js)
 * from Tiny Speck's CC0 OpenGameArt dump (glitch-assets-1.7z / -2.7z,
 * extracted to opengameart/extracted_g174). Same pipeline as
 * tools/vendor-npc-art.mjs: each x1 sheet is a fixed grid
 * (STREET_SPIRIT_ART: cell; columns = sheet width / cell width), the kept
 * frames are cropped to the look's union box and written as a WebP strip
 * of 8 columns (lossy q88 with lossless-grade alpha, as the rook sheets: the
 * 28 strips are 4 MB, about twice that lossless). One crop per look keeps
 * the feet anchor the same across states (the Uralia spirit's
 * raise/hover/lower clips share one ground). Needs ImageMagick 7.
 *
 *   node tools/street-spirit-art.mjs            write the strips
 *   node tools/street-spirit-art.mjs --measure  print each sheet's populated
 *                                               frame count and the union crop
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, rmSync, mkdtempSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import { STREET_SPIRIT_ART, spiritCell, spiritSheetName } from '../public/js/street-spirits.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const OGA = join(os.homedir(), 'Documents/glitch-audit/opengameart/extracted_g174/glitch-assets');
const OUT = join(root, 'public/assets/sprites/street-spirits');
const COLS = 8;
const measure = process.argv.includes('--measure');
const magick = (args) => execFileSync('magick', args, { stdio: ['ignore', 'pipe', 'pipe'] }).toString();

/** The OGA sheet for one look and state: <dir>/<dir>_<look>_x1_<state>_png_<epoch>.png */
function sourceSheet(art, look, oga) {
  const dir = join(OGA, art.dir);
  const prefix = `${art.dir}_${art.looks[look]}_x1_${oga}_png_`;
  const src = readdirSync(dir).find((f) => f.startsWith(prefix));
  if (!src) throw new Error(`${dir}: no ${prefix}*`);
  return join(dir, src);
}

/** Bounding box of a cell's opaque pixels, or null when the cell is empty. */
function trimBox(file) {
  const box = magick([file, '-alpha', 'extract', '-threshold', '3%', '-format', '%@', 'info:']).trim().match(/(\d+)x(\d+)\+(\d+)\+(\d+)/);
  if (!box) return null;
  const [w, h, x, y] = box.slice(1).map(Number);
  return w <= 1 && h <= 1 ? null : { x, y, w, h };
}

mkdirSync(OUT, { recursive: true });
const tmp = mkdtempSync(join(os.tmpdir(), 'street-spirits-'));
try {
  for (const [variant, art] of Object.entries(STREET_SPIRIT_ART)) {
    const unions = new Map();
    for (const look of Object.keys(art.looks)) {
      const box = spiritCell(variant, look);
      const unionKey = art.cells ? `${variant} ${look}` : variant;
      if (!unions.has(unionKey)) unions.set(unionKey, { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity });
      const u = unions.get(unionKey);
      for (const [state, sheet] of Object.entries(art.states)) {
        const src = sourceSheet(art, look, sheet.oga);
        const cells = join(tmp, `${variant}-${look}-${state}`);
        mkdirSync(cells);
        magick([src, '-crop', `${box.cell.w}x${box.cell.h}`, '+repage', join(cells, '%04d.png')]);
        const all = readdirSync(cells).sort().map((f) => join(cells, f));
        if (measure) {
          let populated = 0;
          for (const f of all) {
            const b = trimBox(f);
            if (!b) continue;
            populated += 1;
            u.x0 = Math.min(u.x0, b.x); u.y0 = Math.min(u.y0, b.y);
            u.x1 = Math.max(u.x1, b.x + b.w); u.y1 = Math.max(u.y1, b.y + b.h);
          }
          console.log(`${variant} ${look} ${state} (${sheet.oga}): ${populated} populated of ${all.length} cells`);
        } else {
          const step = sheet.step || 1;
          const kept = all.slice(0, sheet.frames).filter((_, i) => i % step === 0);
          const want = Math.ceil(sheet.frames / step);
          if (kept.length !== want) throw new Error(`${src}: ${kept.length} of ${want} frames`);
          const { x, y, w, h } = box.crop;
          const out = join(OUT, spiritSheetName(variant, look, state));
          const args = [];
          for (let r = 0; r < Math.ceil(kept.length / COLS); r += 1) {
            args.push('(', ...kept.slice(r * COLS, r * COLS + COLS).flatMap((f) => ['(', f, '-crop', `${w}x${h}+${x}+${y}`, '+repage', '-background', 'none', '-extent', `${w}x${h}`, ')']), '+append', ')');
          }
          magick([...args, '-background', 'none', '-gravity', 'northwest', '-append', '-quality', '88', '-define', 'webp:alpha-quality=100', out]);
          console.log(`wrote ${out}`);
        }
        rmSync(cells, { recursive: true, force: true });
      }
    }
    if (measure) {
      for (const [key, u] of unions) console.log(`${key} union crop: { x: ${u.x0}, y: ${u.y0}, w: ${u.x1 - u.x0}, h: ${u.y1 - u.y0} }`);
    }
  }
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
