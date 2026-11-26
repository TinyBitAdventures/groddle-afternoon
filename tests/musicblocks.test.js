/** Playable Musicblocks: official rewards, freshness, assets, and pack wiring. */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GAME_DAY_MS } from '../public/js/game-day.js?v=a532775d';
import {
  MUSICBLOCK_CATALOG,
  MUSICBLOCK_MONTH_MS,
  MUSICBLOCK_REPLAY_MS,
  createMusicblockState,
  chooseStartStreetMusicblock,
  endgameGiftDue,
  ensureMusicblockItems,
  getMusicblock,
  isMusicblock,
  listMusicblockCollection,
  MUSICBLOCK_ENDGAME_GIFT,
  MUSICBLOCK_ENDGAME_GIFT_LINE,
  MUSICBLOCK_PLAYBACK,
  MUSICBLOCK_SERIES,
  musicblockCollectionNote,
  musicblockItemMeta,
  musicblockPlaySeconds,
  musicblockSeriesProgress,
  ownsMusicblock,
  playMusicblock,
  START_STREET_DELAY_MS,
  START_STREET_MUSICBLOCKS,
  startStreetMusicblockDue,
  starterMusicblocks,
} from '../public/js/musicblocks.js?v=8e985753';
import { SOUND_ALIASES, SOUND_FILES } from '../public/js/sound-keys.js?v=8b36c250';
import { DROP_TABLES } from '../public/js/drop-tables-data.js?v=c51a6400';
import { SOIL_DROP_TABLES } from '../public/js/patches.js?v=3498abf3';
import { SPINNING_WHEEL_DROP_TABLE } from '../public/js/spinning-wheel.js?v=00148471';
import { ISLAND_MUSICBLOCKS } from '../public/js/newxp.js?v=f02bc05e';
import { AWARD_ITEM } from '../public/js/funpickle.js?v=95796317';
import {
  ITEM_CATALOG,
  addItem,
  countItem,
  createInventory,
} from '../public/js/inventory.js?v=6414dbdc';
import { getVerbsFor } from '../public/content.js?v=a87eb482';

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
    // G938: Gentle Island's side street (newbie_island.js 124-162) and the start street (location.js 663).
    scan('island', ISLAND_MUSICBLOCKS);
    scan('start-street', START_STREET_MUSICBLOCKS);
    // GNG: the Funpickle's giveAward and the 25-tune gift (desk FUNPICKLE).
    scan('funpickle', AWARD_ITEM);
    scan('gift', MUSICBLOCK_ENDGAME_GIFT);
    for (const [id, from] of sources) assert.ok(from.length, `${id} has no source`);
    assert.deepEqual(sources.get('musicblock_goodnight_groddle'), ['funpickle', 'gift']);
    assert.ok(sources.get('musicblock_sb_secret_01').includes('soil'));
    assert.equal(ISLAND_MUSICBLOCKS.length, 25);
    assert.equal(START_STREET_MUSICBLOCKS.length, 20);
  });

  it('G938: every Musicblock row of the GSJS drop tables is in the remake as written', { skip: !existsSync(GSJS) && 'GSJS not present' }, () => {
    // items/catalog_drop_tables.js: 103 musicblock class_id rows across 26 tables.
    const src = readFileSync(join(GSJS, 'items/catalog_drop_tables.js'), 'utf8');
    const rows = [];
    let table = null;
    let threshold = null;
    for (const line of src.split('\n')) {
      const t = line.match(/^\t([a-z_0-9]+) : \{$/);
      if (t) table = t[1];
      const p = line.match(/^\t\t\t(\d+) : \[$/);
      if (p) threshold = Number(p[1]);
      const c = line.match(/class_id : "(musicblock_[a-z_0-9]+)", count : (\d+)/);
      if (c) rows.push({ table, threshold, classTsid: c[1], count: Number(c[2]) });
    }
    assert.equal(rows.length, 103);
    assert.equal(new Set(rows.map((r) => r.table)).size, 26);
    for (const r of rows) {
      const row = DROP_TABLES[r.table]?.rows.find(([at]) => at === r.threshold);
      assert.ok(row?.[1].some((e) => e.item === r.classTsid && e.count === r.count), `${r.table} ${r.threshold} ${r.classTsid}`);
    }
    const ours = Object.values(DROP_TABLES).flatMap((t) => t.rows.flatMap(([, list]) => list)).filter((e) => /^musicblock_/.test(e.item || ''));
    assert.equal(ours.length, rows.length);
  });

  it('drop modules register the GSJS item data, not stand-ins', () => {
    const meta = musicblockItemMeta('musicblock_x_shiny_04');
    assert.equal(meta.baseCost, 600);
    assert.equal(meta.icon, 'assets/sprites/icons/musicblock_x_shiny_04.webp');
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

  it('plays on its last energy and spends what is left (musicblock play has no energy check)', () => {
    const state = createMusicblockState();
    const player = pc({ energy: 1 });
    const result = playMusicblock(state, player, 'musicblock_d_green_02', 1000);
    assert.equal(result.ok, true);
    assert.equal(player.energy, 0, 'Property.apiDec stops at the bottom');
    assert.equal(result.effects.energy, -1);
    assert.ok(state.heardAt.musicblock_d_green_02);
  });
});

/** A feature host stand-in: the street, the pack, the player's own dropped stacks. */
function fakeEngine({ streetTsid, inv, stacks = [] } = {}) {
  const drops = [];
  const data = {};
  const engine = {
    streetTsid,
    inv,
    dropTsid: streetTsid,
    droppedItems: { streets: { [streetTsid]: stacks } },
    worldW: 3000,
    player: { x: 100, y: 1040 },
    dropWorldStack(classTsid, count, x, y) {
      drops.push({ classTsid, count, x, y });
      engine.droppedItems.streets[streetTsid].push({ id: `d${drops.length}`, classTsid, count, x, y });
      return { ok: true };
    },
    save() {},
    setData: (k, v) => { data[k] = v; },
    param: () => null,
    achievement() {},
    pushActivity: (line) => { data.activity = line; },
    toast() {},
    refreshPack() {},
  };
  return { engine, drops, data };
}

async function freshFeature() {
  const mod = await import('../public/js/features/musicblocks-feature.js?v=4668a393');
  mod.musicblocksFeature._reset();
  return mod;
}

const HECHEY = 'GLI2V0UN7RD1T2J';

describe('G938: no street holds a block of its own', () => {
  it('the street drop is gone from the module, game.js and the verbs', () => {
    const src = readFileSync(join(publicRoot, 'js/musicblocks.js'), 'utf8');
    const game = readFileSync(join(publicRoot, 'game.js'), 'utf8');
    const content = readFileSync(join(publicRoot, 'content.js'), 'utf8');
    assert.doesNotMatch(src, /planMusicblockDrop|MUSICBLOCK_STREET_POOL|collectedStreets|stableHash/);
    assert.doesNotMatch(game, /spawnMusicblockDrop|planMusicblockDrop|worldMusicblocks|musicblockPickup/);
    assert.doesNotMatch(content, /collectMusicblock|musicblockPickup/);
    // A block in the world is an ordinary ground stack now, not a class with its own pick up verb.
    assert.deepEqual(getVerbsFor({ classId: 'musicblock_d_red_01', state: {} }, { pc: pc(), inv: createInventory() }).map((v) => v.id), []);
  });

  it('an existing player finds no block on any street, the start street included', async () => {
    const { musicblocksFeature, layStartStreetMusicblock } = await freshFeature();
    const streets = ['GLI3272LOTD1B1F', 'LIF102FDNU11314', 'GA5101HF7F429V5', HECHEY];
    for (const tsid of streets) {
      const { engine, drops } = fakeEngine({ streetTsid: tsid, inv: createInventory(starterMusicblocks()) });
      musicblocksFeature.onStreetEnter({ tsid }, engine);
      assert.equal(layStartStreetMusicblock(engine, tsid), null, tsid);
      assert.deepEqual(drops, [], tsid);
      musicblocksFeature.onStreetClear(engine);
    }
  });

  it('a player with no block finds none on a street that is not the start street', async () => {
    const { layStartStreetMusicblock } = await freshFeature();
    for (const tsid of ['GLI3272LOTD1B1F', 'LIF102FDNU11314', 'GA94GCF7H3D30IM']) {
      const { engine, drops } = fakeEngine({ streetTsid: tsid, inv: createInventory() });
      assert.equal(layStartStreetMusicblock(engine, tsid), null, tsid);
      assert.deepEqual(drops, []);
    }
  });

  it('an older save keeps its blocks; its street record is dropped harmlessly', () => {
    const seeded = createMusicblockState({ heardAt: { musicblock_d_red_05: 7 }, plays: 3, collectedStreets: { GLI123: true } });
    assert.deepEqual(seeded, { heardAt: { musicblock_d_red_05: 7 }, plays: 3, lastPlayed: null });
  });
});

describe('G938: the start street block (location.js 646-667)', () => {
  it('matches the source: the twenty D and X blocks, a one second delay, only with no block owned or lying there', { skip: !existsSync(GSJS) && 'GSJS not present' }, () => {
    const loc = readFileSync(join(GSJS, 'locations/location.js'), 'utf8');
    const at = loc.indexOf('// Place a music block');
    const block = loc.slice(at, loc.indexOf('Adding delayed music block', at));
    assert.match(block, /if \(block_location && !pc\.countItemClass\(is_musicblock\) && !this\.find_items\(is_musicblock\)\.length\)/);
    assert.deepEqual([...block.match(/choose_one\(\[([^\]]+)\]\)/)[1].matchAll(/'([a-z_0-9]+)'/g)].map((m) => m[1]), [...START_STREET_MUSICBLOCKS]);
    assert.match(block, /this\.createItemStackDelayed\(block_class, 1, block_location\[0\], block_location\[1\], 1\);/);
    assert.equal(START_STREET_DELAY_MS, 1000);
    // config_prod.js greeting_locations: every live start street names a musicblock_position.
    assert.match(readFileSync(join(GSJS, 'config_prod.js'), 'utf8'), /musicblock_position: \[-1085, -177\]/);
  });

  it('is due only on the start street, owning no block, none lying there, once', () => {
    const none = createInventory();
    assert.equal(startStreetMusicblockDue({ onStartStreet: true, inv: none }), true);
    assert.equal(startStreetMusicblockDue({ onStartStreet: false, inv: none }), false);
    assert.equal(startStreetMusicblockDue({ onStartStreet: true, inv: none, made: true }), false);
    assert.equal(startStreetMusicblockDue({ onStartStreet: true, inv: createInventory({ musicblock_sb_secret_01: 1 }) }), false);
    assert.equal(startStreetMusicblockDue({ onStartStreet: true, inv: none, stacks: [{ classTsid: 'musicblock_b_brown_02' }] }), false);
    assert.equal(startStreetMusicblockDue({ onStartStreet: true, inv: none, stacks: [{ classTsid: 'apple' }] }), true);
    assert.equal(ownsMusicblock(createInventory({ apple: 2 })), false);
    assert.equal(chooseStartStreetMusicblock(() => 0), 'musicblock_d_blue_01');
    assert.equal(chooseStartStreetMusicblock(() => 0.9999), 'musicblock_x_shiny_05');
    assert.ok(!START_STREET_MUSICBLOCKS.some((id) => /brown/.test(id)));
  });

  it('lays one of the twenty a second after arriving, as the player\'s own ground stack, then never again', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const { musicblocksFeature, startStreetTsid } = await freshFeature();
    assert.equal(startStreetTsid(), HECHEY);
    musicblocksFeature._setRng(() => 0.5);
    const inv = createInventory();
    const { engine, drops, data } = fakeEngine({ streetTsid: HECHEY, inv });
    musicblocksFeature.onStreetEnter({ tsid: HECHEY }, engine);
    t.mock.timers.tick(999);
    assert.deepEqual(drops, []);
    t.mock.timers.tick(1);
    // config_prod.js Alakol Start: the block 293 px along from the arrival; dropped from 40 px up onto the line.
    assert.deepEqual(drops, [{ classTsid: 'musicblock_d_red_01', count: 1, x: 393, y: 1000 }]);
    assert.equal(data.musicblockStart, 'musicblock_d_red_01');
    assert.deepEqual(musicblocksFeature.save(), { startBlock: { tsid: HECHEY, classTsid: 'musicblock_d_red_01' }, gift: false });
    // Picked up and sold: the street does not lay another.
    engine.droppedItems.streets[HECHEY] = [];
    musicblocksFeature.onStreetEnter({ tsid: HECHEY }, engine);
    t.mock.timers.tick(2000);
    assert.equal(drops.length, 1);
    // A reload remembers it.
    const slice = musicblocksFeature.save();
    musicblocksFeature._reset();
    musicblocksFeature.restore(slice);
    musicblocksFeature.onStreetEnter({ tsid: HECHEY }, engine);
    t.mock.timers.tick(2000);
    assert.equal(drops.length, 1);
  });

  it('lies a short walk from the arrival, toward the middle of the street', async () => {
    const { startStreetSpot, START_BLOCK_OFFSET } = await freshFeature();
    assert.equal(START_BLOCK_OFFSET, -1085 - -1378);
    assert.deepEqual(startStreetSpot({ x: 200, y: 900 }, 4000), { x: 493, y: 860 });
    assert.deepEqual(startStreetSpot({ x: 3800, y: 900 }, 4000), { x: 3507, y: 860 });
    assert.deepEqual(startStreetSpot({ x: 30, y: 900 }, 300), { x: 240, y: 860 });
    if (existsSync(GSJS)) assert.match(readFileSync(join(GSJS, 'config_prod.js'), 'utf8'), /\/\/ Alakol Start 1\n\t\{\n\t\ttsid: 'LNVKFBM3PVC2GDD',\n\t\tx: \[-1378\],\n\t\ty: \[-195\],\n\t\tmusicblock_position: \[-1085, -177\]/);
  });

  it('the street the tutorial leaves a new player on is a start street too, online and solo', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const { musicblocksFeature, startStreets } = await freshFeature();
    const EXIT = 'LIF102FDNU11314';
    const { engine, drops } = fakeEngine({ streetTsid: EXIT, inv: createInventory() });
    // Before the tutorial is left, its exit is nobody's start street.
    engine.query = () => null;
    assert.deepEqual(startStreets(engine), [HECHEY]);
    musicblocksFeature.onStreetEnter({ tsid: EXIT }, engine);
    t.mock.timers.tick(1500);
    assert.deepEqual(drops, []);
    // Set down there by the tutorial (newxp-feature newxpExitStreet), still falling at the second.
    engine.query = (hook) => (hook === 'newxpExitStreet' ? EXIT : null);
    assert.deepEqual(startStreets(engine), [HECHEY, EXIT]);
    engine.player.onGround = false;
    musicblocksFeature.onStreetEnter({ tsid: EXIT }, engine);
    t.mock.timers.tick(1500);
    assert.deepEqual(drops, []);
    engine.player.onGround = true;
    t.mock.timers.tick(250);
    assert.equal(drops.length, 1);
    assert.ok(START_STREET_MUSICBLOCKS.includes(drops[0].classTsid));
    assert.equal(musicblocksFeature.save().startBlock.tsid, EXIT);
    // Once a save: Hechey Track lays none after it.
    const hechey = fakeEngine({ streetTsid: HECHEY, inv: createInventory() });
    musicblocksFeature.onStreetEnter({ tsid: HECHEY }, hechey.engine);
    t.mock.timers.tick(2000);
    assert.deepEqual(hechey.drops, []);
    const feature = readFileSync(join(publicRoot, 'js/features/newxp-feature.js'), 'utf8');
    assert.match(feature, /newxpExitStreet\(\) \{\n    if \(!save\?\.exit\?\.tsid \|\| !\(save\.island === 'exited' \|\| save\.status === 'done'\)\) return null;\n    return save\.exit\.tsid;/);
  });

  it('leaving before the second is up lays nothing', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const { musicblocksFeature } = await freshFeature();
    const { engine, drops } = fakeEngine({ streetTsid: HECHEY, inv: createInventory() });
    musicblocksFeature.onStreetEnter({ tsid: HECHEY }, engine);
    t.mock.timers.tick(500);
    musicblocksFeature.onStreetClear(engine);
    engine.streetTsid = 'GLI3272LOTD1B1F';
    t.mock.timers.tick(1000);
    assert.deepEqual(drops, []);
  });

  it('Gentle Island\'s side street keeps its own block (newbie_island.js 124-162)', { skip: !existsSync(GSJS) && 'GSJS not present' }, () => {
    const src = readFileSync(join(GSJS, 'locations/newbie_island.js'), 'utf8');
    const side = src.slice(src.indexOf("this.instance_id == 'NB_Side_Street2'"));
    assert.deepEqual([...side.slice(0, side.indexOf(']);')).matchAll(/'(musicblock_[a-z_0-9]+)'/g)].map((m) => m[1]), [...ISLAND_MUSICBLOCKS]);
    assert.match(side, /this\.createItemStack\(block_class, 1, -988, -467\)/);
    const feature = readFileSync(join(publicRoot, 'js/features/newxp-feature.js'), 'utf8');
    assert.match(feature, /function doonboggleSetup\(engine\) \{\n  if \(!hasFlag\('musicblock'\)\) \{/);
  });
});

describe('Musicblock collection', () => {
  it('desk FUNPICKLE: all 25 series tunes send GNG once, in giveAward\'s way', async () => {
    const inv = createInventory();
    for (const def of Object.values(MUSICBLOCK_CATALOG)) if (def.collection) addItem(inv, def.classTsid, 1);
    assert.equal(endgameGiftDue(inv), true);
    assert.equal(endgameGiftDue(inv, true), false);
    const { musicblocksFeature } = await freshFeature();
    const { engine, data } = fakeEngine({ streetTsid: 'GLI3272LOTD1B1F', inv });
    musicblocksFeature.onTick(16, 1_000, engine);
    assert.equal(countItem(inv, MUSICBLOCK_ENDGAME_GIFT), 1);
    assert.equal(data.activity, MUSICBLOCK_ENDGAME_GIFT_LINE);
    assert.equal(data.musicblockGift, 'given');
    assert.equal(listMusicblockCollection(inv).owned, 26);
    // Sold: never sent again.
    inv[MUSICBLOCK_ENDGAME_GIFT] = 0;
    musicblocksFeature.onTick(16, 3_000, engine);
    assert.equal(countItem(inv, MUSICBLOCK_ENDGAME_GIFT), 0);
    assert.equal(musicblockCollectionNote(inv, 'musicblock_d_blue_03'), 'DB series 5/5');
    assert.equal(musicblockCollectionNote(inv, 'musicblock_goodnight_groddle'), '');
    if (existsSync(GSJS)) {
      const src = readFileSync(join(GSJS, 'items/special_item_that_only_beta_testers_get.js'), 'utf8');
      assert.match(src, /As an apology, Tiny Speck have sent you this Musicblock\."\);\n\n\tpc\.createItemFromGround\('musicblock_goodnight_groddle', 1, false\);/);
    }
  });

  it('a player who already owns GNG (the Funpickle) is never sent another', async () => {
    const inv = createInventory({ [MUSICBLOCK_ENDGAME_GIFT]: 1 });
    for (const def of Object.values(MUSICBLOCK_CATALOG)) if (def.collection) addItem(inv, def.classTsid, 1);
    const { musicblocksFeature } = await freshFeature();
    const { engine } = fakeEngine({ streetTsid: 'GLI3272LOTD1B1F', inv });
    musicblocksFeature.onTick(16, 1_000, engine);
    inv[MUSICBLOCK_ENDGAME_GIFT] = 0;
    musicblocksFeature.onTick(16, 3_000, engine);
    assert.equal(countItem(inv, MUSICBLOCK_ENDGAME_GIFT), 0);
    assert.equal(musicblocksFeature.save().gift, true);
  });

  it('pays SB-1 its own first hearing (1000 XP)', () => {
    const state = createMusicblockState();
    const player = pc({ mood: 75 }); // the x1 mood band (G148)
    const result = playMusicblock(state, player, 'musicblock_sb_secret_01', 1000);
    assert.equal(result.effects.xp, 1000);
    assert.match(result.msg, /oneness with the Giants/);
  });
});

describe('Musicblock game integration', () => {
  it('wires pack action, local audio, ambient ducking and collection UI', () => {
    const game = readFileSync(join(publicRoot, 'game.js'), 'utf8');
    const html = readFileSync(join(publicRoot, 'play/index.html'), 'utf8');
    assert.match(game, /data-pack-play/);
    assert.match(game, /playPackMusicblock/);
    assert.match(game, /playMusicblockAudio/);
    assert.match(game, /showMusicblockFx/);
    assert.match(game, /result\.msg\.replace\(\/\[\.\!\?\]\+\$\//);
    assert.match(game, /audio\.musicblock \? 0\.055 : STREET_MUSIC_MIX;/);
    assert.match(game, /const STREET_MUSIC_MIX = 0\.26;/);
    assert.match(game, /musicblocks_played:/);
    assert.match(game, /data-musicblock-collection/);
    // Tunes load on first play (not at boot) and report the class sound key.
    assert.doesNotMatch(game, /files\[`musicblock:\$\{def\.classTsid\}`\]/);
    assert.match(game, /dataset\.lastSound = `\$\{def\.soundKey\}:file`/);
    assert.match(game, /musicblockCollectionNote\(inv, classTsid\)/);
    assert.match(game, /fresh tune \+\$\{musicblockDef\.freshXp\} iMG/);
    // Completing a series is a collection trophy (inc_achievements.js:428).
    assert.match(game, /category === 'trophies' \? 'TROPHY_RECEIVED'/);
    assert.match(html, /game\.js\?v=[0-9a-f]{8}/);
  });
});

describe('Musicblock collection badges from any source', () => {
  it('emits in_inventory the first time a block reaches the pack', async () => {
    const { musicblocksFeature, newlyOwnedMusicblocks } = await import('../public/js/features/musicblocks-feature.js?v=4668a393');
    assert.deepEqual(newlyOwnedMusicblocks(new Set(['musicblock_d_blue_01']), {
      musicblock_d_blue_01: 2, musicblock_d_blue_02: 1, apple: 3, musicblock_trumpets: 1,
    }), ['musicblock_d_blue_02']);
    musicblocksFeature._reset();
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
