#!/usr/bin/env node
/**
 * The Bureaucratic Hall's two waiting chairs by the counter wall (#734, Austin 2026-11-27).
 *
 * The 2012 footage of the hall (the player's screenshots in report #734; video wo0iNJ0PPS4) shows
 * eight orange chairs on the waiting wall: the tipped one, two, three, and two more at the right
 * end by the counter's dividing wall. Tiny Speck's backdrop bureaucratic_hall_bg (bldg_int_bhall.swf,
 * tinyspeck/glitch-locations, CC0) paints only the first six into its one shape, so the last two
 * are drawn from that same art: the rightmost painted chair's own paths (tools/interrogation/
 * build-chair.mjs CHAIR_PATHS, the shape's DefineShape3 id 2), copied twice to the right, colours
 * untouched. The backdrop file itself stays exactly as rendered from the SWF (tools/deco-pipeline).
 *
 * The SVG's units are the hall's stage (js/bureaucratic-hall.js HALL, 2212 x 700): FFDec's shape
 * SVG wraps the paths in matrix(1, 0, 0, 1, 4.0, 2.1) and the backdrop's render puts the shape's
 * own (0, 0) at stage (0, 0.1), so each copy is translated by (dx, 0.1).
 *
 * Usage (FFDec reads the SWF, never runs it; any Java 17+):
 *   1. Write the deco's own SWF out of the bundle (tools/deco-audit/audit.py bundled_swf:
 *      bundled/bldg_int_bhall/bureaucratic_hall_bg.swf).
 *   2. java -jar ffdec.jar -format shape:svg -export shape <dir> bureaucratic_hall_bg.swf
 *   3. node tools/bureaucratic-hall/build-chairs.mjs --svg <dir>/2.svg [--check]
 * Writes public/assets/sprites/bureaucratic-hall/waiting-chairs-right.svg.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CHAIR_PATHS } from '../interrogation/build-chair.mjs';
import { HALL_EXTRA_CHAIRS } from '../../public/js/bureaucratic-hall.js?v=29db1c45';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
export const CHAIRS_OUT = `public/${HALL_EXTRA_CHAIRS.url}`;
/** The rightmost painted chair's box on the stage (its paths' bounds, legs and shadow included). */
export const PAINTED_CHAIR_BOX = Object.freeze({ x: 1146, y: 407, w: 92, h: 101 });

/** The two chairs' SVG from FFDec's SVG of bureaucratic_hall_bg. */
export function chairsSvg(svg) {
  const paths = [...svg.matchAll(/<path [^>]*\/>/g)].map((m) => m[0]);
  if (paths.length < 200) throw new Error(`expected the hall's ~239 paths, got ${paths.length}`);
  const kept = CHAIR_PATHS.map((i) => paths[i]);
  const ids = new Set(kept.flatMap((p) => [...p.matchAll(/url\(#(gradient\d+)\)/g)].map((m) => m[1])));
  const defs = [...svg.matchAll(/<(linearGradient|radialGradient)[^>]*id="(gradient\d+)"[^>]*>[\s\S]*?<\/\1>/g)]
    .filter((m) => ids.has(m[2]))
    .map((m) => m[0]);
  if (defs.length !== ids.size) throw new Error(`gradients missing: ${defs.length} of ${ids.size}`);
  const C = HALL_EXTRA_CHAIRS;
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    "<!-- Tiny Speck's Bureaucratic Hall waiting chair (bldg_int_bhall.swf bureaucratic_hall_bg, CC0), its paths copied twice for the hall's last two chairs (#734): tools/bureaucratic-hall/build-chairs.mjs -->",
    `<svg xmlns="http://www.w3.org/2000/svg" width="${C.w * 2}" height="${C.h * 2}" viewBox="${C.x} ${C.y} ${C.w} ${C.h}">`,
    `<defs>${defs.join('')}</defs>`,
    ...C.dx.map((dx) => `<g transform="matrix(1.0, 0.0, 0.0, 1.0, ${dx}, 0.1)">${kept.join('')}</g>`),
    '</svg>',
    '',
  ].join('\n');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const at = process.argv.indexOf('--svg');
  if (at < 0 || !process.argv[at + 1]) {
    console.error('usage: node tools/bureaucratic-hall/build-chairs.mjs --svg <ffdec shape svg> [--check]');
    process.exit(2);
  }
  const text = chairsSvg(readFileSync(process.argv[at + 1], 'utf8'));
  const out = join(root, CHAIRS_OUT);
  let before = '';
  try { before = readFileSync(out, 'utf8'); } catch { /* new */ }
  if (process.argv.includes('--check')) {
    console.log(before === text ? 'current' : 'stale');
    process.exit(before === text ? 0 : 1);
  }
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, text);
  console.log(`wrote ${CHAIRS_OUT} (${text.length} bytes)`);
}
