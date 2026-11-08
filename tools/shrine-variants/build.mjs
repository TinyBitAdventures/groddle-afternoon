#!/usr/bin/env node
/**
 * The 33 regional shrines' open / close sheets (js/shrine-variants.js), cut from
 * Tiny Speck's OpenGameArt dump (opengameart/glitch-assets-1.7z and -2.7z, CC0:
 * glitch-assets/npc_shrine_<region>_<giant>/npc_shrine_<region>_<giant>__x1_<open|close>_png_<epoch>.png)
 * to lossless WebP (tools/webp-lossless.mjs) in public/assets/sprites/shrines/<region>/<giant>_<motion>.webp.
 * The 1x sheets are the OGA pixels unchanged; each must be the region's grid
 * (SHRINE_SHEETS: cols x fw wide, rows x fh tall, rows enough for its frames).
 *
 * public/assets/sprites/shrines/variants.json records per file its class, the
 * OGA member it came from, its size and sha256.
 *
 * Usage: node tools/shrine-variants/build.mjs            (needs 7z, cwebp and the OGA archives)
 *        node tools/shrine-variants/build.mjs --check    (the manifest matches the files; no archives needed)
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { encodeLosslessWebp } from '../webp-lossless.mjs';
import { SHRINE_SHEETS, shrineClassFor, shrineSheet } from '../../public/js/shrine-variants.js?v=7f11c97d';

const here = dirname(fileURLToPath(import.meta.url));
const spike = join(here, '../..');
const audit = join(spike, '..');
export const MANIFEST = join(spike, 'public/assets/sprites/shrines/variants.json');
const ARCHIVES = ['opengameart/glitch-assets-1.7z', 'opengameart/glitch-assets-2.7z'];
export const GIANTS = Object.freeze(['alph', 'cosma', 'friendly', 'grendaline', 'humbaba', 'lem', 'mab', 'pot', 'spriggan', 'ti', 'zille']);
export const REGIONS = Object.freeze(['firebog', 'ix', 'uralia']);
const MOTIONS = ['open', 'close'];

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

/** Width and height from a WebP's VP8L header (lossless). */
export function webpSize(buf) {
  if (buf.subarray(0, 4).toString('latin1') !== 'RIFF' || buf.subarray(12, 16).toString('latin1') !== 'VP8L') throw new Error('not a lossless WebP');
  const b = buf.readUInt32LE(21);
  return [1 + (b & 0x3fff), 1 + ((b >> 14) & 0x3fff)];
}

/** Width and height from a PNG's IHDR. */
function pngSize(buf) {
  return [buf.readUInt32BE(16), buf.readUInt32BE(20)];
}

/** Every regional class and motion: [{ classTsid, region, giant, motion, out }]. */
export function variantFiles() {
  const rows = [];
  for (const region of REGIONS) {
    for (const giant of GIANTS) {
      for (const motion of MOTIONS) {
        const sheet = shrineSheet(region, giant, motion);
        rows.push({ classTsid: shrineClassFor(region, giant), region, giant, motion, out: sheet.url, sheet });
      }
    }
  }
  return rows;
}

/** The grid a sheet must fill: [width, height] for its region and frame count. */
export function expectedSize(region, motion) {
  const def = SHRINE_SHEETS[region];
  return [def.cols * def.fw, Math.ceil(def[motion] / def.cols) * def.fh];
}

function build() {
  const work = mkdtempSync(join(tmpdir(), 'shrine-variants-'));
  try {
    for (const a of ARCHIVES) {
      const file = join(audit, a);
      if (!existsSync(file)) throw new Error(`no ${a} beside the game`);
      execFileSync('7z', ['x', '-y', file, 'glitch-assets/npc_shrine_*', `-o${work}`], { stdio: 'ignore' });
    }
    const manifest = { source: 'OpenGameArt glitch-assets-1.7z / glitch-assets-2.7z (Tiny Speck, CC0)', files: {} };
    for (const row of variantFiles()) {
      const dir = join(work, 'glitch-assets', row.classTsid);
      const name = existsSync(dir) ? readdirSync(dir).find((f) => f.includes(`__x1_${row.motion}_png_`)) : null;
      if (!name) throw new Error(`${row.classTsid}: no ${row.motion} sheet in the OGA dump`);
      const png = readFileSync(join(dir, name));
      const [w, h] = pngSize(png);
      const [ew, eh] = expectedSize(row.region, row.motion);
      if (w !== ew || h !== eh) throw new Error(`${row.classTsid} ${row.motion}: ${w}x${h}, the grid is ${ew}x${eh}`);
      const out = join(spike, 'public', row.out);
      mkdirSync(dirname(out), { recursive: true });
      encodeLosslessWebp(join(dir, name), out);
      const buf = readFileSync(out);
      manifest.files[row.out] = { class: row.classTsid, motion: row.motion, oga: `glitch-assets/${row.classTsid}/${name}`, size: [w, h], frames: row.sheet.frames, bytes: buf.length, sha256: sha256(buf) };
    }
    writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 1)}\n`);
    console.log(`${Object.keys(manifest.files).length} regional shrine sheets written`);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

/** Problems (empty when every regional sheet is present, the region's grid, and as recorded). */
export function checkVariants() {
  if (!existsSync(MANIFEST)) return ['variants.json is missing: run node tools/shrine-variants/build.mjs'];
  const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
  const bad = [];
  const want = variantFiles();
  for (const row of want) {
    const m = manifest.files?.[row.out];
    if (!m) { bad.push(`${row.out}: not in the manifest`); continue; }
    const file = join(spike, 'public', row.out);
    if (!existsSync(file)) { bad.push(`${row.out}: missing`); continue; }
    const buf = readFileSync(file);
    if (buf.length !== m.bytes || sha256(buf) !== m.sha256) bad.push(`${row.out}: differs from the manifest`);
    const [w, h] = webpSize(buf);
    const [ew, eh] = expectedSize(row.region, row.motion);
    if (w !== ew || h !== eh) bad.push(`${row.out}: ${w}x${h}, the grid is ${ew}x${eh}`);
    if (m.class !== row.classTsid || m.frames !== row.sheet.frames) bad.push(`${row.out}: class or frames changed`);
  }
  for (const k of Object.keys(manifest.files || {})) if (!want.some((r) => r.out === k)) bad.push(`${k}: not a regional sheet`);
  return bad;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  if (process.argv.includes('--check')) {
    const bad = checkVariants();
    if (bad.length) {
      console.error(bad.join('\n'));
      process.exit(1);
    }
    console.log('variants.json matches the 66 regional shrine sheets');
  } else build();
}
