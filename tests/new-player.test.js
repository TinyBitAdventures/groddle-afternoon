/**
 * A new multiplayer character starts as the source's new player and plays
 * the tutorial (js/new-player.js); solo keeps the demo kit.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  NEW_PLAYER_SOURCE,
  NEW_PLAYER_STATS,
  grantSoloStarterItems,
  isNewMultiplayerPlayer,
  newPlayerInventory,
  newPlayerStats,
} from '../public/js/new-player.js?v=d9fa4f61';
import { createBrowserSaveStore, createMultiplayerSaveStore, createSaveStore } from '../public/js/save-store.js?v=89422a9c';
import { createInventory } from '../public/js/inventory.js?v=5be47371';
import { normalizePlayerSnapshot, parsePlayerSave, restorePlayerSave } from '../public/js/player-save.js?v=00f88199';
import { createQuoinState } from '../public/js/quoins.js?v=7e0dec6d';
import { createShrineState } from '../public/js/shrines.js?v=15cd8b43';
import { PARADISE_COURSES, PARADISE_TICKET_IDS } from '../public/js/paradise-flight.js?v=c7acd7a2';
import { imaginationFeature, STARTER_UPGRADES } from '../public/js/features/imagination-feature.js?v=2b539c49';
import { RESOURCE_FEATURE_ID, resourceNodesFeature } from '../public/js/features/resource-nodes-feature.js?v=55fb520d';

const here = import.meta.dirname;
const pub = join(here, '..', 'public');
const read = (rel) => readFileSync(join(pub, rel), 'utf8');
const gsjsRoot = join(here, '..', '..', 'glitch-GameServerJS');
const gsLine = (file, line) => readFileSync(join(gsjsRoot, file), 'utf8').split('\n')[line - 1];

function memoryStore(entries = {}) {
  const data = new Map(Object.entries(entries));
  return { get: (k) => (data.has(k) ? data.get(k) : null), setItem: (k, v) => data.set(k, v), getItem: (k) => (data.has(k) ? data.get(k) : null), removeItem: (k) => data.delete(k) };
}

const mpStore = (entries = {}) => createMultiplayerSaveStore({
  boot: { saveUrl: '/wp-json/groddle/v1/save', entries, version: 0 },
  scope: {},
  fetch: async () => ({ ok: true, status: 200, headers: { get: () => null }, json: async () => ({ version: 1 }) }),
});

describe('the source new player', () => {
  it('starts at level 1 with no xp, iMG or currants, 55 energy and mood of a 100 tank', () => {
    assert.deepEqual({ ...NEW_PLAYER_STATS }, {
      level: 1, xp: 0, imagination: 0, currants: 0, energy: 55, mood: 55, energyMax: 100, rewardMultiplier: 1,
    });
    const pc = newPlayerStats();
    assert.deepEqual(pc.imaginationUpgrades, []);
    assert.equal(pc.level, 1);
    assert.notEqual(newPlayerStats().imaginationUpgrades, pc.imaginationUpgrades, 'a fresh list each call');
  });

  it('quoin multiplier 1 and no Giant favor are already the remake defaults', () => {
    assert.equal(createQuoinState().multiplier, 1);
    assert.ok(Object.values(createShrineState().favor).every((n) => n === 0));
    assert.ok(Object.values(createShrineState().emblems).every((n) => n === 0));
  });

  it('cites the source lines it copies', { skip: !existsSync(gsjsRoot) && 'no GSJS checkout' }, () => {
    assert.match(gsLine('players/player.js', 1188), /^function onCreate\(\)\{/);
    assert.match(gsLine('players/player.js', 1221), /this\.stats_set_currants\(0\);/);
    assert.match(gsLine('players/player.js', 1222), /this\.metabolics_set_mood\(55\);/);
    assert.match(gsLine('players/player.js', 1223), /this\.metabolics_set_energy\(55\);/);
    assert.match(gsLine('players/player.js', 1239), /this\.goToNewNewStartingLevel\(\);/);
    assert.match(gsLine('players/inc_stats.js', 9), /init_prop\('stats', 'xp', 0,/);
    assert.match(gsLine('players/inc_stats.js', 17), /init_prop\('stats', 'currants', 0,/);
    assert.match(gsLine('players/inc_stats.js', 54), /init_prop\('stats', 'imagination', 0,/);
    assert.match(gsLine('players/inc_stats.js', 57), /quoin_multiplier = 1;/);
    assert.match(gsLine('players/inc_metabolics.js', 9), /init_prop\('metabolics', 'energy', max/);
    assert.match(gsLine('players/inc_metabolics.js', 334), /var max = 100;/);
    // onCreate creates items only on the skip_newux testing path.
    const onCreate = readFileSync(join(gsjsRoot, 'players/player.js'), 'utf8').split('\n').slice(1187, 1243).join('\n');
    const normalPath = onCreate.slice(onCreate.indexOf('this.stats_set_currants(0)'));
    assert.doesNotMatch(normalPath, /createItem/);
    for (const key of ['level', 'xp', 'imagination', 'currants', 'energy', 'mood', 'energyMax', 'quoinMultiplier', 'favor', 'skills', 'inventory', 'tutorial']) {
      assert.ok(NEW_PLAYER_SOURCE[key], key);
    }
  });
});

describe('who is a new multiplayer player', () => {
  it('a multiplayer save with no player state', () => {
    assert.equal(isNewMultiplayerPlayer('multiplayer', mpStore({})), true);
    assert.equal(isNewMultiplayerPlayer('multiplayer', mpStore({ appearance: '{"hair":"x"}' })), true);
    assert.equal(isNewMultiplayerPlayer('multiplayer', mpStore({ playerState: '' })), true);
  });

  it('never an existing multiplayer save', () => {
    assert.equal(isNewMultiplayerPlayer('multiplayer', mpStore({ playerState: '{"version":7}' })), false);
  });

  it('never solo, practice or a store that could not load', () => {
    const empty = createBrowserSaveStore({ storage: memoryStore() });
    assert.equal(isNewMultiplayerPlayer('solo', empty), false);
    assert.equal(isNewMultiplayerPlayer('solo', mpStore({})), false);
    assert.equal(isNewMultiplayerPlayer('multiplayer', empty), false, 'a browser store is solo');
    assert.equal(isNewMultiplayerPlayer('multiplayer', createSaveStore('multiplayer', { scope: {} })), false, 'refusing store');
    assert.equal(isNewMultiplayerPlayer('multiplayer', null), false);
  });
});

describe('the empty pack', () => {
  it('zeroes the built-in pack and the one-time Paradise tickets', () => {
    const seed = newPlayerInventory(createInventory(), PARADISE_TICKET_IDS);
    const inv = createInventory(seed);
    assert.ok(Object.values(inv).every((n) => n === 0), JSON.stringify(inv));
    for (const id of PARADISE_TICKET_IDS) assert.equal(inv[id], 0, id);
    assert.equal(inv.butterfly_lotion, 0);
    assert.equal(inv.pinch_of_salt, 0);
  });
});

describe('features with a starter kit', () => {
  it('resource nodes: no Scraper, Shovel or Firefly Jar for a new player, ever', () => {
    const engine = { newPlayer: true, inv: {}, param: () => null, setData() {} };
    resourceNodesFeature.init(engine);
    assert.deepEqual(engine.inv, {});
    assert.equal(resourceNodesFeature.save().starterKit, true);
    // A reload restores the saved slice: still nothing.
    resourceNodesFeature.restore({ starterKit: true }, engine);
    assert.deepEqual(engine.inv, {});
  });

  it('resource nodes: solo still gets the kit', () => {
    resourceNodesFeature.restore({ starterKit: false });
    const engine = { newPlayer: false, inv: {}, param: () => null, setData() {} };
    resourceNodesFeature.init(engine);
    assert.deepEqual(engine.inv, { scraper: 1, shovel: 1, firefly_jar: 1 });
    assert.equal(RESOURCE_FEATURE_ID, resourceNodesFeature.id);
  });

  it('imagination: a new player is marked handled, not granted the tutorial cards', () => {
    const src = read('js/features/imagination-feature.js');
    assert.match(src, /if \(engine\.newPlayer\) state\.starterGranted = true;\n\s*else grantStarterUpgrades\(state, owned\(engine\)\);/);
  });

  it('imagination: a tutorial purchase becomes owned once; solo already owns them', () => {
    const engine = { pc: { imaginationUpgrades: [], energy: 55 }, setData() {}, param: () => null };
    imaginationFeature.startNewPlayer(engine);
    assert.deepEqual(engine.pc.imaginationUpgrades, [], 'a new player is granted nothing');
    assert.equal(imaginationFeature.grantTutorialUpgrade('walk_speed_1', engine), true);
    assert.equal(imaginationFeature.grantTutorialUpgrade('walk_speed_1', engine), null);
    assert.deepEqual(engine.pc.imaginationUpgrades, ['walk_speed_1']);
    const solo = { pc: { imaginationUpgrades: [], energy: 80 }, setData() {}, param: () => null };
    imaginationFeature.restore({}, solo);
    // A save from before 2026-11-04 (no slice version) also keeps High Jumper I and II.
    assert.deepEqual([...solo.pc.imaginationUpgrades].sort(), [...STARTER_UPGRADES, 'jump_1', 'jump_2'].sort());
    assert.equal(imaginationFeature.grantTutorialUpgrade('walk_speed_1', solo), null);
    assert.equal(imaginationFeature.grantTutorialUpgrade('no_such_card', engine), null);
  });

  it('the tutorial hands each bought card to the imagination shop', () => {
    const src = read('js/features/newxp-feature.js');
    assert.match(src, /save\.upgrades\.push\(buy\);\n.*\n\s*engineRef\.query\?\.\('grantTutorialUpgrade', buy, engineRef\);/);
  });
});

describe('G565: a multiplayer save gains nothing on load', () => {
  // game.js's filter: the starter Paradise tickets (the nine reconstructed courses are the shop's).
  const starterTickets = Object.values(PARADISE_COURSES).filter((c) => c.starterTicket !== false).map((c) => c.ticketId);
  const UNEARNED = /^(paradise_ticket_|race_ticket)|^(hatchet|scraper|shovel|firefly_jar)$/;

  /** What the boot does to a loaded save's pack: restore it, then the one-time grants. */
  function bootPack(mode, playerStateJson, { newPlayer = false } = {}) {
    const inv = createInventory(newPlayer ? newPlayerInventory(createInventory(), PARADISE_TICKET_IDS) : {});
    const pc = newPlayer ? newPlayerStats() : {};
    const saved = playerStateJson ? parsePlayerSave(playerStateJson, { inventory: inv, player: pc }) : null;
    if (saved) restorePlayerSave(saved, inv, pc, {});
    const engine = { mode, newPlayer, inv, param: () => null, setData() {} };
    resourceNodesFeature.restore({ starterKit: false });
    resourceNodesFeature.init(engine);
    if (saved) resourceNodesFeature.restore(saved.systems?.features?.[RESOURCE_FEATURE_ID] || {}, engine);
    grantSoloStarterItems(inv, mode, starterTickets);
    return inv;
  }
  const held = (inv) => Object.fromEntries(Object.entries(inv).filter(([, n]) => n > 0));

  it('the four starter Paradise tickets are the ones the boot used to hand out', () => {
    assert.deepEqual(starterTickets, ['paradise_ticket_cloud_rings', 'paradise_ticket_radial_heights', 'paradise_ticket_starlit_night', 'paradise_ticket_slip_n_slide']);
  });

  it('a fresh online save without the starter entries loads with no tickets and no unearned items', () => {
    // The QA scripts' seed (tools/qa/online-smoke.mjs seedSave): a player state whose pack lacks the keys.
    for (const inventory of [{}, { guano: 10 }]) {
      const seed = JSON.stringify({ savedAt: 5, inventory, player: { currants: 0, level: 2, xp: 150 }, systems: { quests: { active: {}, completed: {} } } });
      const inv = bootPack('multiplayer', seed);
      assert.deepEqual(held(inv), inventory, JSON.stringify(inv));
      assert.deepEqual(Object.keys(inv).filter((c) => UNEARNED.test(c) && inv[c] > 0), []);
    }
  });

  it('a real new player loads with none, and still none after a reload of what it saved', () => {
    const first = bootPack('multiplayer', null, { newPlayer: true });
    assert.deepEqual(held(first), {});
    for (const id of ['hatchet', ...starterTickets]) assert.equal(first[id], 0, `${id}: a deliberate zero in the first save`);
    const features = { [RESOURCE_FEATURE_ID]: resourceNodesFeature.save() };
    const reload = bootPack('multiplayer', JSON.stringify({ savedAt: 6, inventory: first, player: { level: 1 }, systems: { features } }));
    assert.deepEqual(held(reload), {});
  });

  it('a ticket earned online stays as it is; solo keeps its one-time grants', () => {
    const earned = bootPack('multiplayer', JSON.stringify({ savedAt: 5, inventory: { paradise_ticket_cloud_rings: 2 }, player: {}, systems: {} }));
    assert.deepEqual(held(earned), { paradise_ticket_cloud_rings: 2 });
    const solo = {};
    assert.deepEqual(grantSoloStarterItems(solo, 'solo', starterTickets), ['hatchet', ...starterTickets]);
    assert.deepEqual(grantSoloStarterItems(solo, 'solo', starterTickets), [], 'once');
    const zeros = { hatchet: 0, paradise_ticket_cloud_rings: 0 };
    assert.deepEqual(grantSoloStarterItems(zeros, 'solo', starterTickets), starterTickets.slice(1), 'a deliberate zero stays zero');
    assert.equal(zeros.hatchet, 0);
    const old = bootPack('solo', JSON.stringify({ savedAt: 5, inventory: { apple: 1 }, player: {}, systems: {} }));
    assert.deepEqual(held(old), { apple: 1, hatchet: 1, scraper: 1, shovel: 1, firefly_jar: 1, ...Object.fromEntries(starterTickets.map((t) => [t, 1])) });
  });

  it('game.js grants them only through the solo-only helper', () => {
    const game = read('game.js');
    assert.match(game, /grantSoloStarterItems\(inv, GAME_MODE, PARADISE_TICKET_IDS\.filter\(\(id\) => paradiseCourseForTicket\(id\)\?\.starterTicket !== false\)\);/);
    assert.doesNotMatch(game, /inv\.hatchet === undefined|inv\[ticketId\] === undefined/);
  });
});

describe('the multiplayer start', () => {
  const src = read('js/features/newxp-feature.js');
  it('starts the tutorial with no Skip to Ur', () => {
    const card = src.slice(src.indexOf('const tutorialChoice = () => {'), src.indexOf('// Multiplayer phase 1 (js/game-mode.js)'));
    const mp = card.slice(card.indexOf("if (engine.mode === 'multiplayer') {"), card.indexOf('return;'));
    assert.match(mp, /data-nx-start>Start</);
    assert.doesNotMatch(mp, /Skip to Ur|data-nx-skipstart/);
    assert.match(mp, /pendingStage = 'clouds';/);
    assert.match(src, /\} else if \(engine\.newPlayer\) \{\n\s*\/\/[^\n]*\n\s*pendingStage = 'clouds';/);
  });
});

describe('solo is unchanged', () => {
  const game = read('game.js');
  it('keeps the demo pc, pack and starter skills', () => {
    assert.match(game, /const NEW_PLAYER = isNewMultiplayerPlayer\(GAME_MODE, saveStore\);/);
    assert.match(game, /const pc = NEW_PLAYER \? newPlayerStats\(\) : \{ energy: 80, mood: 70, imagination: 5000, currants: 200, xp: 5000, level: 5, rewardMultiplier: 1 \};/);
    assert.match(game, /const inv = createInventory\(NEW_PLAYER \? newPlayerInventory\(createInventory\(\), PARADISE_TICKET_IDS\) : \{\n\s*butterfly_lotion: 3,\n\s*apple: 2,\n\s*hatchet: 1,\n\s*\.\.\.starterCraftIngredients\(\),\n\s*\.\.\.starterToolsInventory\(\),/);
    const starters = game.slice(game.indexOf('  if (!NEW_PLAYER) {'), game.indexOf('// Full locations-xml street catalog'));
    for (const skill of ['animalkinship_1', 'ezcooking_1', 'cheffery_1', 'blending_1', 'blending_2']) {
      assert.ok(starters.includes(`grantSkillWithPrereqs(skillState, '${skill}');`), skill);
    }
    assert.match(starters, /for \(const sk of STARTER_MINING_SKILLS\)/);
    assert.match(starters, /assignQuest\(questState, 'animalkinship_pet_piggies'/);
    // A solo game begun as a new player (the start card's tutorial, tests/newxp-new-player.test.js) skips it.
    assert.match(game, /if \(isSolo\(\) && !pc\.startedFresh\) grantSkill\(skillState, 'tinkering_1', true\);/);
    assert.match(game, /newPlayer: NEW_PLAYER,/);
  });

  it('solo never counts as a new player, whatever its save', () => {
    for (const entries of [{}, { playerState: '{}' }]) {
      const browser = createBrowserSaveStore({ storage: memoryStore(entries.playerState ? { groddle_player_state_v1: entries.playerState } : {}) });
      assert.equal(isNewMultiplayerPlayer('solo', browser), false);
    }
  });

  it('the save defaults are still the demo kit', () => {
    const pc = normalizePlayerSnapshot({});
    assert.equal(pc.level, 5);
    assert.equal(pc.imagination, 5000);
    assert.equal(pc.currants, 200);
    assert.equal(pc.xp, 5000);
  });
});
