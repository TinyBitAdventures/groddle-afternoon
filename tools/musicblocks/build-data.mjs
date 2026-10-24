#!/usr/bin/env node
/**
 * Writes public/musicblocks/data.json for the Musicblocks entry in the Groddle
 * Wiki (/wiki/musicblocks/, drawn by minn/groddle/src/Musicblocks.php).
 *
 * Everything comes from the game: the blocks, their series, descriptions and
 * recordings from js/musicblocks.js (Tiny Speck's item files and CC0 tunes),
 * each series' collector trophy from assets/content/achievements.json, and
 * what a play pays from playMusicblock itself, run for a player with no mood
 * bonus or penalty (moodScaledXp's multiplier of 1). Nothing on the page is
 * typed in by hand.
 *
 *   node tools/musicblocks/build-data.mjs          write data.json
 *   node tools/musicblocks/build-data.mjs --check  exit 1 if data.json is stale
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { MUSICBLOCK_CATALOG, MUSICBLOCK_SERIES, MUSICBLOCK_MONTH_MS, MUSICBLOCK_REPLAY_MS, createMusicblockState, playMusicblock } from '../../public/js/musicblocks.js';
import { GAME_DAY_MS } from '../../public/js/game-day.js';
import { ITEM_BASE_COSTS } from '../../public/js/store-catalog.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const pub = join(root, 'public');
const out = join(pub, 'musicblocks', 'data.json');

/** The rare blocks that belong to no series, in the catalog's order. */
const RARE = 'rare';
/** Tiny Speck's item file for the one block whose tune was never recovered (GSJS items/musicblock_trumpets.js). */
const LOST = [{ id: 'musicblock_trumpets', label: 'Musicblock T-1' }];

const site = (path) => (path ? `/${path}` : null);

function block(def) {
  const icon3x = def.icon.replace(/\.png$/, '@3x.png');
  if (!def.audio || !existsSync(join(pub, def.audio))) throw new Error(`${def.classTsid}: no recording at ${def.audio}`);
  return {
    id: def.classTsid,
    label: def.label,
    desc: def.desc,
    audio: site(def.audio),
    icon: existsSync(join(pub, def.icon)) ? site(def.icon) : null,
    icon3x: existsSync(join(pub, icon3x)) ? site(icon3x) : null,
    cost: def.baseCost,
    firstPlay: null,
  };
}

/** What playing pays, read off the game's own play function: base iMG (no mood value, so no scaling), mid game day. */
export function playRules() {
  const at = 1000 * GAME_DAY_MS + GAME_DAY_MS / 2;
  const play = (seed, id, now) => playMusicblock(createMusicblockState(seed), { energy: 100, level: 1, xp: 0, imagination: 0 }, id, now).effects;
  const dg1 = 'musicblock_d_green_01';
  const dg2 = 'musicblock_d_green_02';
  const fresh = play({}, dg1, at);
  return {
    energy: -fresh.energy,
    mood: fresh.mood,
    fresh: fresh.xp,
    secret: play({}, 'musicblock_sb_secret_01', at).xp,
    returning: play({ heardAt: { [dg1]: at - MUSICBLOCK_MONTH_MS } }, dg1, at).xp,
    replayHours: MUSICBLOCK_REPLAY_MS / 3600000,
    dailyFirst: play({ heardAt: { [dg1]: at - MUSICBLOCK_REPLAY_MS } }, dg1, at).xp,
    dailyNew: play({ heardAt: { [dg1]: at - MUSICBLOCK_REPLAY_MS, [dg2]: at - 1 } }, dg1, at).xp,
    stale: play({ heardAt: { [dg1]: at - 1 } }, dg1, at).xp,
  };
}

export function musicblockData() {
  const achievements = JSON.parse(readFileSync(join(pub, 'assets/content/achievements.json'), 'utf8'));
  const sets = Object.values(MUSICBLOCK_SERIES).map((series) => {
    const trophy = achievements[series.badge];
    if (!trophy) throw new Error(`no achievement ${series.badge}`);
    const badge = `assets/badges/${series.badge}.png`;
    return {
      id: series.id,
      colour: series.colour,
      glow: `#${series.glow.toString(16).padStart(6, '0')}`,
      trophy: {
        name: trophy.name,
        desc: trophy.desc,
        badge: existsSync(join(pub, badge)) ? site(badge) : null,
        imagination: trophy.rewards?.xp ?? 0,
        mood: trophy.rewards?.mood ?? 0,
        energy: trophy.rewards?.energy ?? 0,
        item: Object.values(trophy.rewards?.items ?? {}).map((i) => i.label).join(', '),
      },
      blocks: Object.values(MUSICBLOCK_CATALOG).filter((def) => def.collection === series.id).map(block),
    };
  });
  const rare = Object.values(MUSICBLOCK_CATALOG).filter((def) => !def.collection).map(block);
  sets.push({ id: RARE, colour: 'gold', glow: `#${(0xe6d29a).toString(16)}`, trophy: null, blocks: rare });
  const rules = playRules();
  for (const set of sets) for (const b of set.blocks) b.firstPlay = b.id === 'musicblock_sb_secret_01' ? rules.secret : rules.fresh;
  return {
    sets,
    lost: LOST.map((l) => ({ ...l, cost: ITEM_BASE_COSTS[l.id] ?? null })),
    rules,
    counts: { tunes: sets.reduce((n, s) => n + s.blocks.length, 0), series: sets.length - 1 },
  };
}

function main() {
  const body = JSON.stringify(musicblockData(), null, 1) + '\n';
  const now = existsSync(out) ? readFileSync(out, 'utf8') : null;
  if (process.argv.includes('--check')) {
    if (now !== body) {
      console.log('public/musicblocks/data.json is stale (node tools/musicblocks/build-data.mjs)');
      process.exit(1);
    }
    return;
  }
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, body);
  const d = JSON.parse(body);
  console.log(`${d.counts.tunes} tunes in ${d.counts.series} series and the rare ones; rules ${JSON.stringify(d.rules)}`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
