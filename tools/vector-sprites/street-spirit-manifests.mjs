#!/usr/bin/env node
/**
 * Writes the two Street Spirit manifests for tools/vector-sprites/build.mjs
 * from js/street-spirits.js, so their cells, frame counts and steps are the
 * ones the game cuts (spiritSheet, spiritCrySheet, portraitSheet):
 *
 *  - street-spirits.json: the street clips (idle, talk, cry; the Uralia
 *    spirit's ground/raise/hover/lower) at 3x, drawn at scale 1 in the world
 *    (js/sprite-hires.js swaps them on first draw).
 *  - spirit-portraits.json: the loneliness porthole's three clips at 5x
 *    (js/sprite-dense.js). The invite fits a 1x cell of 142-181 px to the
 *    class's loneliness_size (215-325 px, inc_world_events.js 45-71), 1.5-1.8
 *    world px per texel, so 3 device px per world px needs 4.5-5.4.
 *
 * Sources (CC0, tinyspeck/glitch-items inhabitants/street_spirit_*): each
 * SWF's animated root clip, whose part clips (Groddle head/body parts,
 * Firebog size, Uralia cap) share its label timeline, so FFDec's frame n
 * shows every part at its own frame n, as the client's gotoAndPlay on each
 * animated_mc did. A look swaps the placed parts (job "parts"): the Groddle
 * SWF places base_L1wood / bottom_L1woodRoots / skull_L1wood / eyes_L1Eyes4 /
 * top_L1woodTwig, the Uralia one capPurple. Firebog's medium body (class
 * "medium", sprite 94) has its own timeline and no porthole clips, so it is
 * rendered on its own.
 *
 *   node tools/vector-sprites/street-spirit-manifests.mjs          write both
 *   node tools/vector-sprites/street-spirit-manifests.mjs --check  exit 1 if stale
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  STREET_SPIRIT_ART,
  STREET_SPIRIT_LONELY_ART,
  PORTRAIT_STATES,
  portraitLook,
  portraitSheet,
  spiritCrySheet,
  spiritSheet,
} from '../../public/js/street-spirits.js?v=f9e88445';

const HERE = dirname(fileURLToPath(import.meta.url));

/** Root clip, its 1-based label range per SWF (FFDec -dumpSWF), and the parts each look swaps. */
const GRODDLE_DEFAULT = { base: 'base_L1wood', bottom: 'bottom_L1woodRoots', skull: 'skull_L1wood', eyes: 'eyes_L1Eyes4', top: 'top_L1woodTwig' };
export const SPIRIT_SWFS = Object.freeze({
  groddle: { swf: 'inhabitants/street_spirit_groddle/street_spirit_groddle.swf', sprite: 377, street: [119, 386], portrait: [383, 477] },
  // Firebog: animated_mcs is only the body ('corpus', street_spirit_firebog.as), so the client's
  // recorder left its flames and every other nested clip on frame 1 (job "record", swf-record.mjs).
  // Its container places the body at 0.65 (sprite 162's matrix), so the medium body rendered on
  // its own is drawn at zoom 3 x 0.65.
  firebog: { swf: 'inhabitants/street_spirit_firebog/street_spirit_firebog.swf', sprite: 163, street: [1, 226], portrait: [223, 332], record: ['large'], medium: { sprite: 94, street: [1, 112], zoom: 1.949982, record: ['medium'] } },
  zutto: { swf: 'inhabitants/street_spirit_zutto/street_spirit_zutto.swf', sprite: 160, street: [1, 175], portrait: [172, 266] },
  ix: { swf: 'inhabitants/street_spirit_ix/street_spirit_ix.swf', sprite: 286, street: [1, 240] },
});

/** The look's instance props (STREET_SPIRIT_ART looks) as part swaps on the SWF's default placements. */
export function lookParts(variant, look) {
  const props = STREET_SPIRIT_ART[variant].looks[look];
  if (variant === 'groddle') {
    // base_base_L0dirt_bottom_none_eyes_eyes_L0eyes1_skull_skull_L0dirt_top_none
    const want = {};
    for (const slot of Object.keys(GRODDLE_DEFAULT)) {
      const m = new RegExp(`(?:^|_)${slot}_(none|${slot}_[A-Za-z0-9]+)`).exec(props);
      if (!m) throw new Error(`${look}: no ${slot} in ${props}`);
      want[slot] = m[1] === 'none' ? null : m[1];
    }
    const parts = {};
    for (const [slot, placed] of Object.entries(GRODDLE_DEFAULT)) if (want[slot] !== placed) parts[placed] = want[slot];
    return parts;
  }
  if (variant === 'zutto') {
    const cap = props.replace(/^cap_/, '');
    return cap === 'capPurple' ? null : { capPurple: cap };
  }
  return null;
}

const rel = (path) => path;

function sheetRow(def, oga, step) {
  return { path: rel(def.path), label: oga, fw: def.fw, fh: def.fh, cols: def.cols, frames: def.frames, ...(step > 1 ? { step } : {}) };
}

export function streetManifest() {
  const jobs = [];
  for (const [variant, art] of Object.entries(STREET_SPIRIT_ART)) {
    const src = SPIRIT_SWFS[variant];
    for (const look of Object.keys(art.looks)) {
      const sheets = [];
      for (const [state, sheet] of Object.entries(art.states)) sheets.push(sheetRow(spiritSheet(variant, look, state), sheet.oga, sheet.step || 1));
      const cry = spiritCrySheet(variant, look);
      if (cry) sheets.push(sheetRow(cry, STREET_SPIRIT_LONELY_ART[variant].cry.oga, 1));
      const medium = variant === 'firebog' && look === 'medium';
      const parts = lookParts(variant, look);
      jobs.push({
        name: `street-spirit-${variant}-${look}`,
        swf: src.swf,
        sprite: medium ? src.medium.sprite : src.sprite,
        frameRange: medium ? src.medium.street : src.street,
        ...(medium && src.medium.zoom ? { zoom: src.medium.zoom } : {}),
        ...((medium ? src.medium.record : src.record) ? { record: { clips: medium ? src.medium.record : src.record } } : {}),
        ...(parts && Object.keys(parts).length ? { parts } : {}),
        sheets,
      });
    }
  }
  return {
    about: 'Generated by tools/vector-sprites/street-spirit-manifests.mjs from js/street-spirits.js (do not edit by hand). The Street Spirits\' street clips at 3x from their CC0 SWFs; lossy like the 1x strips. Run: node tools/vector-sprites/build.mjs --manifest tools/vector-sprites/street-spirits.json',
    firstDraw: true,
    lossy: 88,
    jobs,
  };
}

export const PORTRAIT_DENSITY = 5;

export function portraitManifest() {
  const jobs = [];
  for (const [variant, lonely] of Object.entries(STREET_SPIRIT_LONELY_ART)) {
    const src = SPIRIT_SWFS[variant];
    const looks = [...new Set(Object.keys(STREET_SPIRIT_ART[variant].looks).map((l) => portraitLook(variant, l)))];
    for (const look of looks) {
      const parts = lookParts(variant, look);
      jobs.push({
        name: `spirit-portrait-${variant}-${look}`,
        swf: src.swf,
        sprite: src.sprite,
        frameRange: src.portrait,
        ...(src.record ? { record: { clips: src.record } } : {}),
        ...(parts && Object.keys(parts).length ? { parts } : {}),
        sheets: PORTRAIT_STATES.map((state) => sheetRow(portraitSheet(variant, look, state), lonely.portrait[state].oga, 1)),
      });
    }
  }
  return {
    about: `Generated by tools/vector-sprites/street-spirit-manifests.mjs from js/street-spirits.js (do not edit by hand). The loneliness porthole at ${PORTRAIT_DENSITY}x (js/sprite-dense.js, drawn by features/spirit-loneliness-feature.js). Run: node tools/vector-sprites/build.mjs --manifest tools/vector-sprites/spirit-portraits.json`,
    density: PORTRAIT_DENSITY,
    lossy: 86,
    // Parts of at most 24 MB decoded: the 2D canvas decodes only the part it draws.
    budget: { maxSide: 4096, maxMB: 24 },
    results: 'results-dense.json',
    module: 'js/sprite-dense.js',
    jobs,
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const out = { 'street-spirits.json': streetManifest(), 'spirit-portraits.json': portraitManifest() };
  let stale = 0;
  for (const [name, m] of Object.entries(out)) {
    const file = join(HERE, name);
    const text = `${JSON.stringify(m, null, 1)}\n`;
    if (process.argv.includes('--check')) {
      if (!existsSync(file) || readFileSync(file, 'utf8') !== text) {
        console.log(`stale: tools/vector-sprites/${name}`);
        stale++;
      }
    } else {
      writeFileSync(file, text);
      console.log(`wrote tools/vector-sprites/${name}: ${m.jobs.length} jobs, ${m.jobs.reduce((a, j) => a + j.sheets.length, 0)} sheets`);
    }
  }
  if (stale) process.exitCode = 1;
}
