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
  MUSICBLOCK_ENDGAME_DROP,
  MUSICBLOCK_PLAYBACK,
  MUSICBLOCK_SERIES,
  MUSICBLOCK_STREET_POOL,
  musicblockCollectionNote,
  musicblockItemMeta,
  musicblockPlaySeconds,
  musicblockSeriesProgress,
  planMusicblockDrop,
  playMusicblock,
  starterMusicblocks,
} from '../public/js/musicblocks.js?v=g403-1';
import { SOUND_ALIASES, SOUND_FILES } from '../public/js/sound-keys.js?v=g388-1';
import { DROP_TABLES } from '../public/js/drop-tables-data.js';
import { SOIL_DROP_TABLES } from '../public/js/patches.js?v=g414-1';
import { SPINNING_WHEEL_DROP_TABLE } from '../public/js/spinning-wheel.js';
import {
  ITEM_CATALOG,
  countItem,
  createInventory,
} from '../public/js/inventory.js?v=catalog-unified-7';
import { getVerbsFor, runVerb } from '../public/content.js?v=g450-1';

const here = dirname(fileURLToPath(import.meta.url));
const publicRoot = join(here, '../public');

function pc(overrides = {}) {
  return { energy: 20, mood: 50, xp: 0, imagination: 0, ...overrides };
}

const GSJS = join(here, '../../glitch-GameServerJS');
const gsjsVar = (src, name) => src.match(new RegExp(`^var ${name} = (.*);$`, 'm'))?.[1];

describe('official Musicblock catalog', () => {
  it('makes every recovered tune an item with GSJS metadata, CC0 art and its class sound', () => {
    ensureMusicblockItems();
    const recovered = Object.keys(SOUND_FILES).concat(Object.keys(SOUND_ALIASES))
      .filter((key) => /^MUSICBLOCK_/.test(key) && (SOUND_FILES[key] || SOUND_FILES[SOUND_ALIASES[key]]));
    assert.equal(recovered.length, 27);
    assert.deepEqual(Object.values(MUSICBLOCK_CATALOG).map((def) => def.soundKey).sort(), recovered.sort());
    // musicblock_trumpets (T-1) has no recovered tune, so no item.
    assert.equal(MUSICBLOCK_CATALOG.musicblock_trumpets, undefined);
    for (const def of Object.values(MUSICBLOCK_CATALOG)) {
      assert.equal(isMusicblock(def.classTsid), true);
      assert.equal(getMusicblock(def.classTsid), def);
      assert.equal(def.soundKey, def.classTsid.toUpperCase());
      assert.ok(existsSync(join(publicRoot, def.audio)), `missing ${def.audio}`);
      assert.ok(existsSync(join(publicRoot, def.icon)), `missing ${def.icon}`);
      assert.equal(ITEM_CATALOG[def.classTsid].label, def.label);
      assert.equal(ITEM_CATALOG[def.classTsid].icon, def.icon);
      assert.equal(ITEM_CATALOG[def.classTsid].baseCost, def.baseCost);
      if (existsSync(GSJS)) {
        const src = readFileSync(join(GSJS, `items/${def.classTsid}.js`), 'utf8');
        assert.equal(JSON.parse(gsjsVar(src, 'label')), def.label);
        assert.equal(JSON.parse(gsjsVar(src, 'description')), def.desc);
        assert.equal(Number(gsjsVar(src, 'base_cost')), def.baseCost);
        assert.equal(Number(gsjsVar(src, 'stackmax')), def.stackMax);
        assert.equal(Number(src.match(/"music_duration"\s*:\s*"(\d+)"/)[1]), def.durationMs);
      }
    }
    assert.deepEqual(starterMusicblocks(), { musicblock_d_green_02: 1 });
  });

  it('groups the five series exactly as the collection trophies do', () => {
    const achievements = JSON.parse(readFileSync(join(publicRoot, 'assets/content/achievements.json'), 'utf8'));
    const text = JSON.stringify(achievements);
    for (const series of Object.values(MUSICBLOCK_SERIES)) {
      const ids = Object.values(MUSICBLOCK_CATALOG).filter((def) => def.collection === series.id).map((def) => def.classTsid);
      assert.equal(ids.length, 5, series.id);
      assert.ok(text.includes(series.badge), series.badge);
      for (const id of ids) assert.ok(text.includes(id), `${series.badge} ${id}`);
      if (existsSync(GSJS)) {
        const src = readFileSync(join(GSJS, `achievements/${series.badge}.js`), 'utf8');
        assert.deepEqual([...src.matchAll(/label\s*:\s*"(musicblock_[a-z_0-9]+)"/g)].map((m) => m[1]).sort(), ids.sort());
      }
    }
    assert.equal(MUSICBLOCK_CATALOG.musicblock_sb_secret_01.collection, null);
    assert.equal(MUSICBLOCK_CATALOG.musicblock_goodnight_groddle.collection, null);
  });

  it('every recovered block is obtainable in the remake', () => {
    const sources = new Map(Object.keys(MUSICBLOCK_CATALOG).map((id) => [id, []]));
    const scan = (label, value) => {
      for (const id of JSON.stringify(value).match(/musicblock_[a-z_0-9]+/g) || []) sources.get(id)?.push(label);
    };
    for (const [table, rows] of Object.entries(DROP_TABLES)) scan(`drop:${table}`, rows);
    scan('soil', SOIL_DROP_TABLES);
    scan('spinning-wheel', SPINNING_WHEEL_DROP_TABLE);
    // Street drops: one missing series tune per street, then GNG.
    const state = createMusicblockState();
    const inv = createInventory();
    for (let i = 0; i < 40; i++) {
      const def = planMusicblockDrop(state, inv, `street-${i}`);
      if (!def) break;
      sources.get(def.classTsid).push('street');
      collectMusicblock(state, inv, def.classTsid, `street-${i}`);
    }
    for (const [id, from] of sources) assert.ok(from.length, `${id} has no source`);
    assert.deepEqual(sources.get('musicblock_goodnight_groddle'), ['street']);
    assert.ok(sources.get('musicblock_sb_secret_01').includes('soil'));
    // GSJS newbie_island / greeting spawns use the 25 series blocks.
    assert.equal(MUSICBLOCK_STREET_POOL.length, 25);
    assert.equal(MUSICBLOCK_ENDGAME_DROP, 'musicblock_goodnight_groddle');
  });

  it('drop modules register the GSJS item data, not stand-ins', () => {
    const meta = musicblockItemMeta('musicblock_x_shiny_04');
    assert.equal(meta.baseCost, 600);
    assert.equal(meta.icon, 'assets/sprites/icons/musicblock_x_shiny_04.png');
    assert.equal(musicblockItemMeta('nope'), null);
  });
});

describe('Musicblock play rewards', () => {
  it('gives fresh-tune rewards without consuming the reusable collectible', () => {
    const state = createMusicblockState();
    const player = pc({ mood: 99, xp: 100, imagination: 500 });
    const result = playMusicblock(state, player, 'musicblock_d_green_02', 1000);
    assert.equal(result.ok, true);
    assert.equal(result.freshness, 'fresh');
    // 50 iMG at 99% mood: the mood bonus is x1.2, 60 (G148).
    assert.deepEqual(result.effects, { energy: -2, mood: 1, xp: 60 });
    assert.equal(player.energy, 18);
    assert.equal(player.mood, 100);
    assert.equal(player.xp, 160);
    assert.equal(player.imagination, 560);
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
    const player = pc({ mood: 75 }); // the x1 mood band (G148)
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
    const player = pc({ mood: 75 }); // the x1 mood band (G148)
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

  it('completes every series across streets, then offers Goodnight Groddle once', () => {
    const state = createMusicblockState();
    const inv = createInventory(starterMusicblocks());
    let i = 0;
    for (; i < 30; i++) {
      const def = planMusicblockDrop(state, inv, `street-${i}`);
      if (!def) break;
      if (i < 24) assert.ok(def.collection, `street ${i} gave ${def.classTsid} before the series were done`);
      assert.equal(collectMusicblock(state, inv, def.classTsid, `street-${i}`).ok, true);
    }
    assert.equal(i, 25);
    for (const series of Object.keys(MUSICBLOCK_SERIES)) assert.equal(musicblockSeriesProgress(inv, series).complete, true);
    assert.equal(countItem(inv, 'musicblock_goodnight_groddle'), 1);
    assert.equal(countItem(inv, 'musicblock_sb_secret_01'), 0);
    assert.equal(listMusicblockCollection(inv).owned, 26);
    assert.equal(planMusicblockDrop(state, inv, 'one-more-street'), null);
    assert.equal(musicblockCollectionNote(inv, 'musicblock_d_blue_03'), 'DB series 5/5');
    assert.equal(musicblockCollectionNote(inv, 'musicblock_goodnight_groddle'), '');
  });

  it('pays SB-1 its own first hearing (1000 XP)', () => {
    const state = createMusicblockState();
    const player = pc({ mood: 75 }); // the x1 mood band (G148)
    const result = playMusicblock(state, player, 'musicblock_sb_secret_01', 1000);
    assert.equal(result.effects.xp, 1000);
    assert.match(result.msg, /oneness with the Giants/);
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
    const html = readFileSync(join(publicRoot, 'play/index.html'), 'utf8');
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
    // Tunes load on first play (not at boot) and report the class sound key.
    assert.doesNotMatch(game, /files\[`musicblock:\$\{def\.classTsid\}`\]/);
    assert.match(game, /dataset\.lastSound = `\$\{def\.soundKey\}:file`/);
    assert.match(game, /musicblockCollectionNote\(inv, classTsid\)/);
    assert.match(game, /fresh tune \+\$\{musicblockDef\.freshXp\} iMG/);
    // Completing a series is a collection trophy (inc_achievements.js:428).
    assert.match(game, /category === 'trophies' \? 'TROPHY_RECEIVED'/);
    assert.match(html, /game\.js\?v=(?:official-ecology-1|trant-harvest-[12]|badge-events-1|butterfly-care-1|feed-picker-1|animal-kinship-[12]|trant-care-[1-3]|woodcutting-[1-4]|dialogue-[1-3]|movement-1|food-memory-1|dametime-1|musicblocks-collect-2|fruit-machine-[12]|vendor-profiles-1|world-items-[12]|world-persistence-1|shrines-[1-4]|quoins-[12]|item-buffs-[12]|tool-condition-1)/);
  });
});

describe('Musicblock collection badges from any source', () => {
  it('emits in_inventory the first time a block reaches the pack', async () => {
    const { musicblocksFeature, newlyOwnedMusicblocks } = await import('../public/js/features/musicblocks-feature.js');
    assert.deepEqual(newlyOwnedMusicblocks(new Set(['musicblock_d_blue_01']), {
      musicblock_d_blue_01: 2, musicblock_d_blue_02: 1, apple: 3, musicblock_trumpets: 1,
    }), ['musicblock_d_blue_02']);
    const events = [];
    const engine = { inv: { musicblock_d_green_02: 1 }, achievement: (counter, n) => events.push([counter, n]) };
    musicblocksFeature.onTick(16, 1_000, engine); // first look: what game.js already counted at boot
    engine.inv.musicblock_x_shiny_03 = 1; // a Chicken squeeze drop
    musicblocksFeature.onTick(16, 1_500, engine); // throttled
    assert.deepEqual(events, []);
    musicblocksFeature.onTick(16, 2_100, engine);
    musicblocksFeature.onTick(16, 3_200, engine);
    assert.deepEqual(events, [['in_inventory:musicblock_x_shiny_03', 1]]);
    const index = readFileSync(join(publicRoot, 'js/features/index.js'), 'utf8');
    assert.match(index, /FEATURES\.push\(musicblocksFeature\)/);
  });
});

// G102: how the client played a block, checked against the AS3 client and GSJS.
// Footage (research/audio-hunt/README.md, G102) agrees: the street music drops out
// under the block and every well-matched block plays past its music_duration.
const CLIENT_SOUND = join(here, '../../glitch-client/com/tinyspeck/engine/sound');
describe('Musicblock playback (G102)', () => {
  it('pauses the street music, plays the whole recording and gives way to a new block', () => {
    assert.deepEqual({ ...MUSICBLOCK_PLAYBACK }, {
      gain: 0.72,
      streetMusicLevel: 0,
      streetFadeOutSec: 1,
      streetFadeInSec: 1,
      previousBlockFadeOutSec: 0.5,
    });
    // BB-3: 15.01 s recording, 8 s music_duration; footage hears it to 14.5 s.
    const bb3 = getMusicblock('musicblock_b_brown_03');
    assert.equal(bb3.durationMs, 8000);
    assert.equal(musicblockPlaySeconds(bb3, 15.01), 15.01);
    // A recording shorter than music_duration still plays to its own end.
    assert.equal(musicblockPlaySeconds(getMusicblock('musicblock_d_green_03'), 7.6), 7.6);
    // No decoded buffer length: fall back to music_duration.
    assert.equal(musicblockPlaySeconds(bb3, 0), 8);
    assert.equal(musicblockPlaySeconds(bb3, Number.NaN), 8);
  });

  it('matches the GSJS play verb: an exclusive sound, music_duration only times the overlays', { skip: !existsSync(GSJS) && 'GSJS not present' }, () => {
    for (const def of Object.values(MUSICBLOCK_CATALOG)) {
      const src = readFileSync(join(GSJS, `items/${def.classTsid}.js`), 'utf8');
      const play = src.slice(src.indexOf('verbs.play = {'));
      // announce_sound(name, loop_count, fade_in, is_exclusive)
      assert.match(play, /pc\.announce_sound\(this\.class_tsid\.toUpperCase\(\), 0, 0, true\);/, def.classTsid);
      const uses = [...play.matchAll(/\bduration\b/g)].length;
      const overlayUses = [...play.matchAll(/duration: duration,/g)].length;
      // var duration = getClassProp('music_duration'), then only pc_overlay announcements read it.
      assert.equal(uses, 1 + overlayUses * 2, def.classTsid);
    }
  });

  it('matches the client mixer for exclusive sounds', { skip: !existsSync(CLIENT_SOUND) && 'glitch-client not present' }, () => {
    const master = readFileSync(join(CLIENT_SOUND, 'SoundMaster.as'), 'utf8');
    const manager = readFileSync(join(CLIENT_SOUND, 'SoundManager.as'), 'utf8');
    assert.match(master, /private static const AMBIENT_FADE_MS:int = 1000;/);
    assert.match(master, /if\(is_exclusive \|\| is_music\)\{\s*if\(is_ambient_playing\) ambientStop\(\);\s*\/\/this guy gets to play over everything\s*stopAllSoundEffects\(\.5\);/);
    assert.match(master, /private function pauseMusic\(sound_id:String, fade_secs:Number = 1\)/);
    assert.match(master, /SoundManager\.instance\.resumeSound\(ambient_tracks\[ambient_track_index\], _music_volume, AMBIENT_FADE_MS\/1000\);/);
    // Played again while playing: stopped and started from the top.
    assert.match(manager, /if\(\$isExclusive && snd\.paused === false\)\{\s*stopSound\(\$name\);/);
    // Both sliders start equal, and the block plays at the SFX volume.
    assert.match(manager, /DEFAULT_SFX_VOLUME:Number = \.6;/);
    assert.match(manager, /DEFAULT_MUSIC_VOLUME:Number = \.6;/);
    assert.match(master, /var volume:Number = sfx_volume;\s*var can_play:Boolean;\s*if\(is_music\) volume = music_volume;/);
  });

  it('is wired into game.js', () => {
    const game = readFileSync(join(publicRoot, 'game.js'), 'utf8');
    const fn = game.slice(game.indexOf('async function playMusicblockAudio'), game.indexOf('function startMusic'));
    assert.match(fn, /src\.stop\(t \+ musicblockPlaySeconds\(def, src\.buffer\.duration\)\)/);
    assert.doesNotMatch(fn, /def\.durationMs \/ 1000/);
    assert.match(game, /blockPause \? MUSICBLOCK_PLAYBACK\.streetMusicLevel/);
  });
});
