#!/usr/bin/env node
/**
 * Build public/js/verb-responses-data.js: the talkback pools an animal, tree
 * or rock answers a finished verb with (item.js sendResponse(key, pc, slugs)
 * -> sendBubble(choice, 3500, pc, slugs)), verbatim from each class's
 * `var responses = {...}` in Tiny Speck's GameServerJS (CC0).
 *
 *   node tools/build-verb-responses.mjs [path/to/glitch-GameServerJS] [--check]
 *
 * Only the verb keys the remake plays are kept (pet, nibble, squeeze,
 * massage, milk, water, mining, shrine donations, barnacle and ice
 * scraping, peat harvests, dirt digging). Harvest talk for the living trees
 * is in js/trants.js, the wood tree's in js/woodcutting.js, the patches' in
 * js/patches.js. The twelve rock classes share one table (include/mining.js
 * keys) and the three peat bogs another; the build throws if one differs.
 * Each Giant's four shrines (Groddle, Firebog, Ix, Uralia) share their
 * Giant's table; npc_shrine_<giant>.js is the one read.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const GSJS = process.argv.slice(2).find((a) => !a.startsWith('--')) || join(ROOT, '..', 'glitch-GameServerJS');
const OUT = join(ROOT, 'public/js/verb-responses-data.js');

const TREES = ['trant_fruit', 'trant_egg', 'trant_bean', 'trant_bubble', 'trant_spice', 'trant_gas', 'wood_tree'];
const ROCKS = ['beryl', 'dullite', 'sparkly', 'metal'].flatMap((r) => [1, 2, 3].map((n) => `rock_${r}_${n}`));
const PEATS = ['peat_1', 'peat_2', 'peat_3'];
/** js/shrines.js GIANTS ids; the shrine classes are npc_shrine_<id>. */
const SHRINE_GIANTS = ['alph', 'cosma', 'friendly', 'grendaline', 'humbaba', 'lem', 'mab', 'pot', 'spriggan', 'ti', 'zille'];
const SHRINES = SHRINE_GIANTS.map((g) => `npc_shrine_${g}`);
const RESOURCE_NODES = ['mortar_barnacle', 'ice_knob', 'dirt_pile'];

/** Which response keys each class keeps (a RegExp over the key). */
const KEEP = {
  npc_piggy: /^(pet|nibble)_/,
  npc_chicken: /^squeeze_/,
  npc_butterfly: /^(massage|milk)_/,
  ...Object.fromEntries(TREES.map((c) => [c, /^(pet|water)_/])),
  rock: /^(mine_|gem_drop_|rock_disappeared$|metal_rock_disappeared$)/,
  ...Object.fromEntries(SHRINES.map((c) => [c, /^(donated_item_tier\d|super_donation_)/])),
  mortar_barnacle: /^scrape/,
  ice_knob: /^scrape/,
  dirt_pile: /^(dig_|dirt_pile_gone$)/,
  peat_1: /^harvest_peat_/,
};

function fail(msg) {
  throw new Error(`build-verb-responses: ${msg}`);
}

/** The `{...}` literal after `var responses = `, skipping braces inside strings. */
function responsesLiteral(src, file) {
  const at = src.indexOf('var responses = {');
  if (at < 0) fail(`${file}: no var responses`);
  const open = src.indexOf('{', at);
  let depth = 0;
  let quote = null;
  for (let k = open; k < src.length; k++) {
    const c = src[k];
    if (quote) {
      if (c === '\\') k++;
      else if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'") quote = c;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) {
      return { text: src.slice(open, k + 1), line: src.slice(0, at).split('\n').length };
    }
  }
  return fail(`${file}: unterminated responses`);
}

function readResponses(gsjs, cls) {
  const file = `items/${cls}.js`;
  const src = readFileSync(join(gsjs, file), 'utf8');
  const { text, line } = responsesLiteral(src, file);
  const all = vm.runInNewContext(`(${text})`, Object.create(null), { timeout: 1000 });
  return { all, source: `${file} ${line}` };
}

export function buildVerbResponses(gsjs = GSJS) {
  const pools = {};
  const sources = {};
  const keep = (cls, all, re) => {
    const out = {};
    for (const [key, lines] of Object.entries(all)) {
      if (!re.test(key)) continue;
      if (!Array.isArray(lines) || !lines.every((l) => typeof l === 'string')) fail(`${cls}.${key}: not a string list`);
      out[key] = lines;
    }
    if (!Object.keys(out).length) fail(`${cls}: no kept keys`);
    return out;
  };
  for (const cls of ['npc_piggy', 'npc_chicken', 'npc_butterfly', ...TREES, ...SHRINES, ...RESOURCE_NODES]) {
    const { all, source } = readResponses(gsjs, cls);
    pools[cls] = keep(cls, all, KEEP[cls]);
    sources[cls] = source;
  }
  let rock = null;
  for (const cls of ROCKS) {
    const { all, source } = readResponses(gsjs, cls);
    const kept = keep(cls, all, KEEP.rock);
    if (!rock) {
      rock = kept;
      sources.rock = `${source} (and the other ${ROCKS.length - 1} rock classes)`;
    } else if (JSON.stringify(kept) !== JSON.stringify(rock)) {
      fail(`${cls}: rock responses differ from ${ROCKS[0]}`);
    }
  }
  pools.rock = rock;
  let peat = null;
  for (const cls of PEATS) {
    const { all, source } = readResponses(gsjs, cls);
    const kept = keep(cls, all, KEEP.peat_1);
    if (!peat) {
      peat = kept;
      sources.peat_1 = `${source} (and peat_2, peat_3)`;
    } else if (JSON.stringify(kept) !== JSON.stringify(peat)) {
      fail(`${cls}: peat responses differ from ${PEATS[0]}`);
    }
  }
  pools.peat_1 = peat;
  return { pools, sources };
}

export function render({ pools, sources }) {
  const lines = [
    '// Generated by tools/build-verb-responses.mjs from tinyspeck/glitch-GameServerJS (CC0). Do not edit.',
    '// Each class\'s `var responses` pools for the verbs the remake plays (item.js sendResponse).',
    '',
    'export const VERB_RESPONSE_POOLS = Object.freeze({',
  ];
  for (const [cls, keys] of Object.entries(pools)) {
    lines.push(`  // ${sources[cls]}`);
    lines.push(`  ${cls}: Object.freeze({`);
    for (const [key, list] of Object.entries(keys)) {
      lines.push(`    ${key}: Object.freeze(${JSON.stringify(list)}),`);
    }
    lines.push('  }),');
  }
  lines.push('});\n');
  return lines.join('\n');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const built = buildVerbResponses();
  const count = Object.values(built.pools).reduce((n, keys) => n + Object.keys(keys).length, 0);
  if (process.argv.includes('--check')) {
    if (!existsSync(OUT) || readFileSync(OUT, 'utf8') !== render(built)) {
      console.error(`${OUT} is stale: run node tools/build-verb-responses.mjs`);
      process.exit(1);
    }
    console.log(`verb-responses-data.js is current (${count} pools)`);
  } else {
    writeFileSync(OUT, render(built));
    console.log(`${count} pools from ${Object.keys(built.pools).length} classes -> ${OUT}`);
  }
}
