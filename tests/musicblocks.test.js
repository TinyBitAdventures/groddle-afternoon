/** Playable Musicblocks: official rewards, freshness, assets, and pack wiring. */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GAME_DAY_MS } from '../public/js/game-day.js';
import {
  MUSICBLOCK_CATALOG,
  MUSICBLOCK_MONTH_MS,
  MUSICBLOCK_REPLAY_MS,
  createMusicblockState,
  collectMusicblock,
  ensureMusicblockItems,
  getMusicblock,
  isMusicblock,
  listMusicblockCollection,
  planMusicblockDrop,
  playMusicblock,
  starterMusicblocks,
} from '../public/js/musicblocks.js';
import {
  ITEM_CATALOG,
  countItem,
  createInventory,
} from '../public/js/inventory.js?v=catalog-unified-2';
import { getVerbsFor, runVerb } from '../public/content.js';

const here = dirname(fileURLToPath(import.meta.url));
const publicRoot = join(here, '../public');

function pc(overrides = {}) {
  return { energy: 20, mood: 50, xp: 0, imagination: 0, ...overrides };
}

describe('official Musicblock catalog', () => {
  it('ships recovered tunes with matching item art and GSJS metadata', () => {
    ensureMusicblockItems();
    assert.equal(Object.keys(MUSICBLOCK_CATALOG).length, 4);
    for (const def of Object.values(MUSICBLOCK_CATALOG)) {
      assert.equal(isMusicblock(def.classTsid), true);
      assert.equal(getMusicblock(def.classTsid), def);
      assert.match(def.label, /^Musicblock D[GR]-\d$/);
      assert.ok(def.durationMs >= 6000);
      assert.ok(existsSync(join(publicRoot, def.audio)), `missing ${def.audio}`);
      assert.ok(
        existsSync(join(publicRoot, `assets/sprites/icons/${def.classTsid}.png`)),
        `missing ${def.classTsid} icon`
      );
      assert.equal(ITEM_CATALOG[def.classTsid].label, def.label);
    }
    assert.deepEqual(starterMusicblocks(), { musicblock_d_green_02: 1 });
  });
});

describe('Musicblock play rewards', () => {
  it('gives fresh-tune rewards without consuming the reusable collectible', () => {
    const state = createMusicblockState();
    const player = pc({ mood: 99, xp: 100, imagination: 500 });
    const result = playMusicblock(state, player, 'musicblock_d_green_02', 1000);
    assert.equal(result.ok, true);
    assert.equal(result.freshness, 'fresh');
    assert.deepEqual(result.effects, { energy: -2, mood: 1, xp: 50 });
    assert.equal(player.energy, 18);
    assert.equal(player.mood, 100);
    assert.equal(player.xp, 150);
    assert.equal(player.imagination, 550);
    assert.equal(state.heardAt.musicblock_d_green_02, 1000);
    assert.equal(state.plays, 1);
  });

  it('keeps immediate replays fun but removes freshness XP', () => {
    const state = createMusicblockState({ heardAt: { musicblock_d_green_02: 1000 } });
    const player = pc();
    const result = playMusicblock(state, player, 'musicblock_d_green_02', 1000 + 60_000);
    assert.equal(result.ok, true);
    assert.equal(result.freshness, 'stale');
    assert.equal(result.effects.xp, 0);
    assert.equal(player.energy, 18);
    assert.equal(player.mood, 52);
  });

  it('restores the official long-absence 100 XP reward', () => {
    const state = createMusicblockState({ heardAt: { musicblock_d_green_02: 1 } });
    const player = pc();
    const result = playMusicblock(
      state,
      player,
      'musicblock_d_green_02',
      MUSICBLOCK_MONTH_MS + 2
    );
    assert.equal(result.freshness, 'returning');
    assert.equal(result.effects.xp, 100);
  });

  it('awards 10 XP for the first tune of a game day and 5 for another', () => {
    assert.equal(MUSICBLOCK_REPLAY_MS, GAME_DAY_MS);
    const now = 10 * GAME_DAY_MS + 2000;
    const state = createMusicblockState({
      heardAt: {
        musicblock_d_green_02: now - GAME_DAY_MS - 10,
        musicblock_d_red_01: now - GAME_DAY_MS - 20,
      },
    });
    const player = pc();
    const first = playMusicblock(state, player, 'musicblock_d_green_02', now);
    assert.equal(first.freshness, 'daily-first');
    assert.equal(first.effects.xp, 10);
    const second = playMusicblock(state, player, 'musicblock_d_red_01', now + 1);
    assert.equal(second.freshness, 'daily-new');
    assert.equal(second.effects.xp, 5);
  });

  it('requires 2 energy and leaves state untouched when too tired', () => {
    const state = createMusicblockState();
    const player = pc({ energy: 1 });
    const before = structuredClone(player);
    const result = playMusicblock(state, player, 'musicblock_d_green_02', 1000);
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'energy');
    assert.deepEqual(player, before);
    assert.deepEqual(state.heardAt, {});
  });
});

describe('Musicblock street collection', () => {
  it('plans one deterministic missing tune per uncollected street', () => {
    const state = createMusicblockState();
    const inv = createInventory(starterMusicblocks());
    const first = planMusicblockDrop(state, inv, 'LIF102FDNU11314');
    const repeated = planMusicblockDrop(state, inv, 'LIF102FDNU11314');
    assert.ok(first);
    assert.equal(first.classTsid, repeated.classTsid);
    assert.notEqual(first.classTsid, 'musicblock_d_green_02');
  });

  it('picks up through the verb system and records discovery progress', () => {
    const state = createMusicblockState();
    const inv = createInventory(starterMusicblocks());
    const streetTsid = 'LIF102FDNU11314';
    const def = planMusicblockDrop(state, inv, streetTsid);
    const target = { classId: def.classTsid, state: {} };
    const player = pc();
    const verbs = getVerbsFor(target, { pc: player, inv });
    assert.deepEqual(verbs.map((verb) => verb.id), ['pickup']);

    const result = runVerb(target, 'pickup', {
      pc: player,
      inv,
      musicblocks: state,
      streetTsid,
    });
    assert.equal(result.ok, true);
    assert.equal(result.remove, true);
    assert.equal(result.musicblockPickup.newDiscovery, true);
    assert.equal(result.musicblockPickup.collection.owned, 2);
    assert.equal(countItem(inv, def.classTsid), 1);
    assert.equal(state.collectedStreets[streetTsid], true);
    assert.equal(planMusicblockDrop(state, inv, streetTsid), null);
  });

  it('completes the recovered four-tune collection across streets', () => {
    const state = createMusicblockState();
    const inv = createInventory(starterMusicblocks());
    for (let i = 0; i < 3; i++) {
      const streetTsid = `street-${i}`;
      const def = planMusicblockDrop(state, inv, streetTsid);
      assert.ok(def);
      assert.equal(collectMusicblock(state, inv, def.classTsid, streetTsid).ok, true);
    }
    const collection = listMusicblockCollection(inv);
    assert.equal(collection.owned, 4);
    assert.equal(collection.total, 4);
    assert.equal(collection.complete, true);
    assert.deepEqual(collection.missing, []);
    assert.equal(planMusicblockDrop(state, inv, 'one-more-street'), null);
  });

  it('normalizes saved street collection state and repairs older session shapes', () => {
    const seeded = createMusicblockState({
      collectedStreets: { kept: true, ignored: false, truthy: 1 },
    });
    assert.deepEqual(seeded.collectedStreets, { kept: true });
    const legacy = { heardAt: {}, plays: 0, lastPlayed: null };
    const inv = createInventory();
    const result = collectMusicblock(legacy, inv, 'musicblock_d_red_05', 'legacy-street');
    assert.equal(result.ok, true);
    assert.deepEqual(legacy.collectedStreets, { 'legacy-street': true });
  });
});

describe('Musicblock game integration', () => {
  it('wires pack action, local audio, ambient ducking, world drops, and collection UI', () => {
    const game = readFileSync(join(publicRoot, 'game.js'), 'utf8');
    const content = readFileSync(join(publicRoot, 'content.js'), 'utf8');
    const html = readFileSync(join(publicRoot, 'index.html'), 'utf8');
    assert.match(game, /data-pack-play/);
    assert.match(game, /playPackMusicblock/);
    assert.match(game, /playMusicblockAudio/);
    assert.match(game, /showMusicblockFx/);
    assert.match(game, /result\.msg\.replace\(\/\[\.\!\?\]\+\$\//);
    assert.match(game, /audio\.musicblock \? 0\.055 : 0\.26/);
    assert.match(game, /musicblocks_played:/);
    assert.match(game, /spawnMusicblockDrop/);
    assert.match(game, /worldMusicblocks/);
    assert.match(game, /data-musicblock-collection/);
    assert.match(game, /in_inventory:\$\{picked\.def\.classTsid\}/);
    assert.match(content, /musicblockPickup: picked/);
    assert.match(html, /game\.js\?v=(?:official-ecology-1|trant-harvest-[12]|badge-events-1|butterfly-care-1|feed-picker-1|animal-kinship-[12]|trant-care-[1-3]|woodcutting-[1-4]|dialogue-[1-3]|movement-1|food-memory-1|dametime-1|musicblocks-collect-2|fruit-machine-[12]|vendor-profiles-1|world-items-[12]|world-persistence-1|shrines-[1-4]|quoins-[12]|item-buffs-[12]|tool-condition-1)/);
  });
});
