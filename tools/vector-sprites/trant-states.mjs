#!/usr/bin/env node
/**
 * Build the living-trant jobs of tools/vector-sprites/harvestables.json from
 * the trant SWFs and their ActionScript (glitch-items, CC0).
 *
 * The game draws one still per species and maturity stage
 * (assets/sprites/trants/frames/trant_<species>_m<1|3|5|7|10>.png), each the
 * OGA render of setState({ h: 10, m, f_cap: 10, f_num: 10, seed }). The
 * client's updateTrantDisplay() picks that look in code, so each job names
 * the maturity clip, the frame the health puts it on, and the child clips
 * the code sets (swf-state.mjs freezes them):
 *  - bean: grow clip and its branch1-8 gotoAndStop(health);
 *  - egg: grow clip gotoAndStop(health);
 *  - bubble: gotoAndPlay(health); that frame's script sets stalk frames;
 *  - spice, gas: gotoAndStop(11 - health);
 *  - fruit: leaves in full bloom or at health 9 as each OGA still shows
 *    them (FRUIT_HEALTH9_LEAVES); cherries shown on frame id % 3 + 1 up to
 *    the health-10 fruit count, the rest hidden (see fruitState).
 *
 * Usage: node tools/vector-sprites/trant-states.mjs [--write]
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import { FFDEC, JAVA } from './swf-labels.mjs';
import { symbolClasses } from './swf-parts.mjs';
import { rootChildren, spriteChildren } from './swf-state.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ITEMS = join(os.homedir(), 'Documents/glitch-audit/glitch-items');
const MANIFEST = join(HERE, 'harvestables.json');
const HEALTH = 10;
const STAGES = [1, 3, 5, 7, 10];

const SPECIES = {
  bean: { swf: 'harvestable_resources/bean_tree/trant_bean.swf', cell: [198, 270] },
  bubble: { swf: 'harvestable_resources/bubble_tree/trant_bubble.swf', cell: [167, 277], renderer: 'svg' },
  egg: { swf: 'harvestable_resources/egg_plant/trant_egg.swf', cell: [296, 278] },
  fruit: { swf: 'harvestable_resources/fruit_tree/trant_fruit.swf', cell: [271, 249] },
  gas: { swf: 'harvestable_resources/gas_plant/trant_gas.swf', cell: [276, 258] },
  spice: { swf: 'harvestable_resources/spice_plant/trant_spice.swf', cell: [318, 250] },
};

/**
 * Fruit tree leaves the OGA stills show at health 9 (frame 9: leaf, no
 * blossom) instead of full bloom (frame 20). The client jitters each fol_N
 * leaf to health 9 or 10 with its RandomSeed (more often for higher N), but
 * replaying that LCG from the file-name seed does not reproduce the stills,
 * so these were identified by matching each still: every leaf tried at 9 and
 * at 20, one batched FFDec export per round, keeping flips that raise the
 * score (zoom 1: m3 0.83 -> 0.89, m7 0.84 -> 0.91, m10 0.90 -> 0.95). m3 and
 * m5 share a leaf layout and agree. Cherries were tried on every frame and
 * hidden; the client rule below won for all of them.
 */
export const FRUIT_HEALTH9_LEAVES = Object.freeze({
  1: [2],
  3: [1, 2, 11, 13, 14, 16],
  5: [2, 11, 13, 14, 16],
  7: [7, 13, 15, 16, 18, 21, 23, 24, 26, 28, 29],
  10: [14, 26, 28, 29, 34, 36, 39, 40, 41, 44, 45, 46, 51, 58, 61, 62, 64, 66, 71, 72],
});

/**
 * Fruit tree leaf and cherry frames for one maturity: leaves on their last
 * (blossom) frame, as the OGA atlases play them, except FRUIT_HEALTH9_LEAVES;
 * cherries follow the client code: shown up to the health-10 fruit count on
 * frame id % 3 + 1, the rest hidden.
 */
export function fruitState(children, maturity, health = HEALTH, fruitAmt = 1) {
  const maxcherrya = [0, 0, 0, 4, 8, 10, 15, 20, 25, 30];
  const cherryTop = {
    4: [0, 0, 0, 0, 1, 1, 1, 2, 3, 4],
    5: [0, 0, 0, 1, 1, 1, 2, 4, 6, 8],
    6: [0, 0, 0, 1, 2, 2, 4, 6, 8, 10],
    7: [0, 0, 0, 1, 2, 3, 6, 8, 10, 15],
    8: [0, 0, 0, 2, 2, 3, 6, 10, 12, 20],
    9: [0, 0, 0, 2, 3, 4, 8, 12, 15, 25],
    10: [0, 0, 0, 2, 3, 5, 10, 15, 20, 30],
  };
  const set = {};
  const nine = new Set(FRUIT_HEALTH9_LEAVES[maturity] || []);
  for (const c of children) {
    if (/^fol_\d+$/.test(c.name) && c.frames) set[c.name] = nine.has(Number(c.name.slice(4))) ? 9 : c.frames;
  }
  if (maturity > 3) {
    const names = new Set(children.map((c) => c.name));
    const pcmax = (fruitAmt * cherryTop[maturity][health - 1]) | 0;
    for (let id = 1; id <= maxcherrya[maturity - 1]; id++) {
      const name = `cherry_${id}`;
      if (!names.has(name)) continue;
      set[name] = id > pcmax ? null : (id % 3) + 1;
    }
  }
  return set;
}

/** `this.<child>.gotoAndStop(n)` calls in an exported class's frameN() script. */
function frameScriptSets(asFile, frame) {
  const src = readFileSync(asFile, 'utf8');
  const m = new RegExp(`internal function frame${frame}\\(\\) : \\*\\s*\\{([\\s\\S]*?)\\n      \\}`).exec(src);
  const set = {};
  if (m) for (const g of m[1].matchAll(/this\.(\w+)\.gotoAndStop\((\d+)\)/g)) set[g[1]] = Number(g[2]);
  return set;
}

function exportScripts(swf) {
  const dir = mkdtempSync(join(os.tmpdir(), 'trant-as-'));
  execFileSync(JAVA, ['-jar', FFDEC, '-export', 'script', dir, swf], { stdio: 'ignore' });
  return dir;
}

function findFile(dir, name) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      const hit = findFile(p, name);
      if (hit) return hit;
    } else if (e.name === name) return p;
  }
  return null;
}

/** Maturity clip sprite id per stage, from symbol classes or root instance names. */
function growSprites(species, swf) {
  const classes = symbolClasses(swf);
  const byClass = (re) => {
    const out = {};
    for (const [name, id] of classes) {
      const m = re.exec(name);
      if (m) out[Number(m[1]) + (species === 'egg' ? 1 : 0)] = { id, cls: name.split('.').pop() };
    }
    return out;
  };
  if (species === 'bean') return byClass(/\.beanTree_grow(\d+)_\d+$/);
  if (species === 'bubble') return byClass(/\.bt_grow(\d+)_\d+$/);
  if (species === 'spice') return byClass(/\.spiceTree_grow(\d+)_\d+$/);
  if (species === 'egg') return byClass(/\.maturity(\d+)_\d+$/);
  const prefix = species === 'gas' ? 'treem' : 'grow_';
  const out = {};
  for (const c of rootChildren(swf)) {
    if (c.name.startsWith(prefix)) out[Number(c.name.slice(prefix.length))] = { id: c.char };
  }
  return out;
}

export function trantJobs() {
  const jobs = [];
  for (const [species, def] of Object.entries(SPECIES)) {
    const swf = join(ITEMS, def.swf);
    const grows = growSprites(species, swf);
    const asDir = species === 'bubble' ? exportScripts(swf) : null;
    try {
      for (const m of STAGES) {
        const grow = grows[m];
        if (!grow) throw new Error(`${species}: no maturity ${m} clip`);
        const children = spriteChildren(swf, grow.id);
        let frame = 1;
        let set = {};
        if (species === 'bean') {
          frame = HEALTH;
          for (const c of children) if (/^branch\d+$/.test(c.name)) set[c.name] = HEALTH;
        } else if (species === 'egg') {
          frame = HEALTH;
        } else if (species === 'bubble') {
          frame = HEALTH;
          set = frameScriptSets(findFile(asDir, `${grow.cls}.as`), HEALTH);
        } else if (species === 'spice' || species === 'gas') {
          frame = 11 - HEALTH;
        } else if (species === 'fruit') {
          set = fruitState(children, m);
        }
        const [fw, fh] = def.cell;
        jobs.push({
          name: `trant-${species}-m${m}`,
          swf: def.swf,
          sprite: grow.id,
          ...(def.renderer ? { renderer: def.renderer } : {}),
          ...(Object.keys(set).length ? { state: { set } } : {}),
          sheets: [{ path: `assets/sprites/trants/frames/trant_${species}_m${m}.png`, fw, fh, cols: 1, frames: 1, swfStart: frame, swfCount: 1, mirror: false }],
        });
      }
    } finally {
      if (asDir) rmSync(asDir, { recursive: true, force: true });
    }
  }
  return jobs;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const jobs = trantJobs();
  if (process.argv.includes('--write')) {
    const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
    manifest.jobs = [...jobs, ...manifest.jobs.filter((j) => !j.name.startsWith('trant-') || j.name.includes('dead'))];
    writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 1)}\n`);
    console.log(`wrote ${jobs.length} trant jobs to ${MANIFEST}`);
  } else {
    for (const j of jobs) console.log(`${j.name}: sprite ${j.sprite} frame ${j.sheets[0].swfStart}${j.state ? ` state ${Object.keys(j.state.set).length}` : ''}`);
  }
}
