#!/usr/bin/env node
/**
 * The overworld Juju Bandit's sheets (features/juju-bandits-feature.js) from
 * Tiny Speck's CC0 OpenGameArt dump: npc_juju_bandit_bandana_<b>_variant_<v>
 * x1 sheets (240 x 254 cells), three skin variants x three bandanas
 * (npc_juju_bandit.js onCreate: colours red/green/yellow, bandanas
 * blue/black/red). Each state is cropped to the union of its frames (the
 * spawn/shrink sparkles need far more room than the body) and written as a
 * lossless WebP strip, 8 columns. js/juju-bandits.js JUJU_SHEETS carries the
 * crop offsets, so the feet anchor stays the source cell's.
 *
 * Long loops are trimmed to what the bandit plays: idle1 (standing while it
 * declares) keeps its first 60 frames, idle2 (the 2.5 s rage quit) 75.
 *
 * These are the client's own recordings of npc_juju_bandit.swf sprite 226,
 * so they match the SWF once it is rendered the way the recorder drew it:
 * the holder, face and hands (animated_mcs) each on their own copy of the
 * label, other nested clips on frame 1, both legs in the opposite container
 * (initializehead), and the walk sheet is the SWF's walk loop (label frames
 * 8-23, loop_froms walk: 8), so it loops whole. Their sharp 3x versions come
 * from tools/vector-sprites/characters.json (juju-bandit-<variant>-<bandana>,
 * "record"); re-run that build after this script.
 *
 *   node tools/juju-bandit-art.mjs
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, rmSync, mkdtempSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import { JUJU_SHEETS, JUJU_VARIANTS, JUJU_BANDANAS, JUJU_CELL } from '../public/js/juju-bandits.js?v=6cf92f4f';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const OGA = join(os.homedir(), 'Documents/glitch-audit/opengameart/extracted_juju_camp/glitch-assets');
const OUT = join(root, 'public/assets/sprites/juju_bandit');
const COLS = 8;
const magick = (args) => execFileSync('magick', args, { stdio: ['ignore', 'pipe', 'pipe'] }).toString();

mkdirSync(OUT, { recursive: true });
const tmp = mkdtempSync(join(os.tmpdir(), 'juju-'));
try {
  for (const variant of JUJU_VARIANTS) {
    for (const bandana of JUJU_BANDANAS) {
      const dir = join(OGA, `npc_juju_bandit_bandana_${bandana}_variant_${variant}`);
      const files = readdirSync(dir);
      for (const [state, sheet] of Object.entries(JUJU_SHEETS)) {
        const src = files.find((f) => f.includes(`_x1_${sheet.oga}_png_`));
        if (!src) throw new Error(`${dir}: no ${sheet.oga}`);
        const cells = join(tmp, `${variant}-${bandana}-${state}`);
        mkdirSync(cells);
        magick([join(dir, src), '-crop', `${JUJU_CELL.w}x${JUJU_CELL.h}`, '+repage', join(cells, '%04d.png')]);
        const frames = readdirSync(cells).sort().slice(0, sheet.frames).map((f) => join(cells, f));
        if (frames.length !== sheet.frames) throw new Error(`${src}: ${frames.length} of ${sheet.frames} frames`);
        const { x, y, w, h } = sheet.crop;
        const out = join(OUT, `juju_${variant}_${bandana}_${state}.webp`);
        // Montage the cropped cells into an 8-column strip.
        const rows = Math.ceil(frames.length / COLS);
        const args = [];
        for (let r = 0; r < rows; r += 1) {
          args.push('(', ...frames.slice(r * COLS, r * COLS + COLS).flatMap((f) => ['(', f, '-crop', `${w}x${h}+${x}+${y}`, '+repage', '-background', 'none', '-extent', `${w}x${h}`, ')']), '+append', ')');
        }
        magick([...args, '-background', 'none', '-gravity', 'northwest', '-append', '-define', 'webp:lossless=true', out]);
        rmSync(cells, { recursive: true, force: true });
      }
      console.log(`wrote ${variant}/${bandana}`);
    }
  }
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
