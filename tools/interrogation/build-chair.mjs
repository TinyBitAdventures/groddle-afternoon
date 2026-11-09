#!/usr/bin/env node
/**
 * The Interrogation room's chair (G352): one waiting chair cut out of Tiny Speck's Bureaucratic
 * Hall art and coloured the red-brown of the room's render.
 *
 * Source (CC0): bureaucratic_hall_bg, the whole Bureaucratic Hall picture embedded in the street
 * bundle bldg_int_bhall.swf (tinyspeck/glitch-locations glitch-location-swfs; also in groddle1.swf).
 * Its six waiting chairs are drawn into that one shape, not decos of their own. The render of the
 * Interrogation room (LIFLFPPBUUT11SP_main_1301106549.jpg, reference only) shows the same chair, a
 * shell seat and back on four splayed steel legs, in a redder brown: the render samples the seat at
 * about rgb(106,69,60), hue 12, under the bulb's warm light; the hall's chair is #945a2b, hue 27.
 *
 * What it keeps: the rightmost chair of the row (the one standing clear of the others), its paths
 * (CHAIR_PATHS, by their order in FFDec's SVG of the shape) and the gradients they use, inside a
 * viewBox round them. The brown fills are turned CHAIR_HUE_SHIFT degrees towards red; the steel
 * legs and the shadows keep their colours.
 *
 * Usage (FFDec reads the SWF, never runs it; any Java 17+):
 *   1. Write the deco's own SWF out of the bundle (tools/deco-audit/audit.py bundled_swf, or
 *      tools/deco-pipeline/recover.py's work dir: bundled/bldg_int_bhall/bureaucratic_hall_bg.swf).
 *   2. java -jar ffdec.jar -format shape:svg -export shape <dir> bureaucratic_hall_bg.swf
 *   3. node tools/interrogation/build-chair.mjs --svg <dir>/2.svg [--check]
 * Writes public/assets/sprites/interrogation/waiting-chair-red.svg.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
export const CHAIR_OUT = 'public/assets/sprites/interrogation/waiting-chair-red.svg';

/** The rightmost waiting chair's paths in bureaucratic_hall_bg's shape (DefineShape3 id 2), by order. */
export const CHAIR_PATHS = Object.freeze([124, 125, 126, 127, 128, 129, 130, 131, 132, 133, 136, 137, 138, 139, 140, 141, 142, 146, 147]);
/** Degrees the brown fills turn (towards red): the hall's hue 27 to the render's red-brown. */
export const CHAIR_HUE_SHIFT = -18;
/** Saturation kept (the render is darker, not greyer, than the hall). */
export const CHAIR_SATURATION = 1;
/** The box kept round the chair, in the shape's own units (1x: the hall picture is 2221.55 x 703). */
export const CHAIR_BOX = Object.freeze({ x: 1150, y: 409, w: 92, h: 101 });

function hexToHsl(hex) {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h * 60, s, l];
}

function hslToHex(h, s, l) {
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return `#${[f(0), f(8), f(4)].map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('')}`;
}

/** A warm, saturated fill (the seat's browns) turned red; greys, steel and black shadows unchanged. */
export function recolourHex(hex) {
  const [h, s, l] = hexToHsl(hex.toLowerCase());
  if (s < 0.25 || h < 15 || h > 45) return hex.toLowerCase();
  return hslToHex((h + CHAIR_HUE_SHIFT + 360) % 360, Math.min(1, s * CHAIR_SATURATION), l);
}

/** The chair SVG from FFDec's SVG of bureaucratic_hall_bg. */
export function chairSvg(svg) {
  const group = /<g transform="(matrix\([^)]*\))">/.exec(svg);
  if (!group) throw new Error('no shape group in the SVG');
  const paths = [...svg.matchAll(/<path [^>]*\/>/g)].map((m) => m[0]);
  if (paths.length < 200) throw new Error(`expected the hall's ~239 paths, got ${paths.length}`);
  const kept = CHAIR_PATHS.map((i) => paths[i]);
  const ids = new Set(kept.flatMap((p) => [...p.matchAll(/url\(#(gradient\d+)\)/g)].map((m) => m[1])));
  const defs = [...svg.matchAll(/<(linearGradient|radialGradient)[^>]*id="(gradient\d+)"[^>]*>[\s\S]*?<\/\1>/g)]
    .filter((m) => ids.has(m[2]))
    .map((m) => m[0].replace(/stop-color="(#[0-9a-fA-F]{6})"/g, (_, c) => `stop-color="${recolourHex(c)}"`));
  if (defs.length !== ids.size) throw new Error(`gradients missing: ${defs.length} of ${ids.size}`);
  const flat = kept.map((p) => p.replace(/fill="(#[0-9a-fA-F]{6})"/g, (_, c) => `fill="${recolourHex(c)}"`));
  const B = CHAIR_BOX;
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<!-- Tiny Speck's Bureaucratic Hall waiting chair (bldg_int_bhall.swf bureaucratic_hall_bg, CC0), recoloured red-brown for the Interrogation room: tools/interrogation/build-chair.mjs -->`,
    `<svg xmlns="http://www.w3.org/2000/svg" width="${B.w * 2}" height="${B.h * 2}" viewBox="${B.x} ${B.y} ${B.w} ${B.h}">`,
    `<defs>${defs.join('')}</defs>`,
    `<g transform="${group[1]}">${flat.join('')}</g>`,
    '</svg>',
    '',
  ].join('\n');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const at = process.argv.indexOf('--svg');
  if (at < 0 || !process.argv[at + 1]) {
    console.error('usage: node tools/interrogation/build-chair.mjs --svg <ffdec shape svg> [--check]');
    process.exit(2);
  }
  const text = chairSvg(readFileSync(process.argv[at + 1], 'utf8'));
  const out = join(root, CHAIR_OUT);
  let before = '';
  try { before = readFileSync(out, 'utf8'); } catch { /* new */ }
  if (process.argv.includes('--check')) {
    console.log(before === text ? 'current' : 'stale');
    process.exit(before === text ? 0 : 1);
  }
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, text);
  console.log(`wrote ${CHAIR_OUT} (${text.length} bytes)`);
}
