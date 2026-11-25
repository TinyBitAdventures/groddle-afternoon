/**
 * G1319 (live Global chat 2026-11-25): a new player about an hour in was stuck in Gregarious Towers
 * Basement. The stairs and every way out said "You can't do that yet", /follow did not help, and only
 * an admin teleport got them out. The tutorial's island travel gate refused every street off Gentle
 * Island while the save was in the island stage, wherever the player stood; but the Gentle Island
 * Exit box (before On to the Big Time is accepted) and Back to world from home both take a player off
 * the island without ending the stage, so every way onward was refused.
 *
 * Glitch refused no trip between ordinary streets for a new player: the island held you by its own
 * shape (newbie_island.js hitBox street4_check 9-22), the first ordinary street flagged the leave
 * (location.js 686-688), and leaving home while the island's quests ran went back to the island
 * (inc_houses.js houses_get_previous_location 1312-1325, houses_leave 1290-1306).
 * Run: node --test tests/newxp-stranded-g1319.test.js
 */
import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GENTLE_ISLAND, GENTLE_ISLAND_TSIDS, exitBoxAction, islandHomeReturn } from '../public/js/newxp.js?v=0d81aa52';
import { __newxpTest, newxpFeature } from '../public/js/features/newxp-feature.js?v=30331b92';

const here = dirname(fileURLToPath(import.meta.url));
const BASEMENT = 'GDONEDVHC4030KF';
const LOBBY = 'GA5134UPLRU29OH';
const HECHEY = 'GLI2V0UN7RD1T2J';
const STEPS = ['arrive', 'quest_given', 'bags_done', 'go_home', 'home_done', 'leaving'];
const VIA = ['door', 'signpost', 'follow', 'teleport', undefined];
const engineOn = (streetTsid) => ({ streetTsid, inScene: () => false, mode: 'multiplayer' });

describe('G1319: no player is stranded off Gentle Island by the tutorial', () => {
  afterEach(() => { __newxpTest.save = { status: 'off' }; });

  it('a save in the island stage standing off the island is refused no road onward', () => {
    for (const island of STEPS) {
      __newxpTest.save = { status: 'active', stage: 'island', island };
      for (const via of VIA) {
        assert.equal(newxpFeature.travelGate(LOBBY, engineOn(BASEMENT), { via }), null, `${island} ${via}`);
        assert.equal(newxpFeature.travelGate(HECHEY, engineOn(LOBBY), { via }), null, `${island} ${via}`);
      }
    }
  });

  it('the exit box before the leave takes a player off the island, and from there every road is open', () => {
    __newxpTest.save = { status: 'active', stage: 'island', island: 'go_home' };
    assert.equal(exitBoxAction(__newxpTest.save), 'teleport');
    assert.equal(newxpFeature.travelGate(HECHEY, engineOn('GLI32G3NUTD100I'), { via: 'signpost' }), null);
  });

  it('on the island the gate still holds the way off until the island is left', () => {
    for (const island of STEPS) {
      __newxpTest.save = { status: 'active', stage: 'island', island };
      for (const from of GENTLE_ISLAND_TSIDS) {
        assert.deepEqual(newxpFeature.travelGate(LOBBY, engineOn(from), { via: 'door' }), { ok: false, msg: "You can't do that yet" }, `${island} ${from}`);
        assert.equal(newxpFeature.travelGate(GENTLE_ISLAND.progress_way, engineOn(from), { via: 'signpost' }), null);
      }
    }
    __newxpTest.save = { status: 'active', stage: 'island', island: 'exited' };
    assert.equal(newxpFeature.travelGate(LOBBY, engineOn(GENTLE_ISLAND.exit)), null);
    __newxpTest.save = { status: 'done', stage: 'done', island: 'exited' };
    assert.equal(newxpFeature.travelGate(LOBBY, engineOn(GENTLE_ISLAND.exit)), null);
  });

  it('Back to world from home leads back to Gentle Island while the island stage runs', () => {
    for (const island of STEPS) {
      const save = { status: 'active', stage: 'island', island };
      assert.deepEqual(islandHomeReturn(save, { tsid: LOBBY, x: 10, y: 20 }), { tsid: GENTLE_ISLAND.progress_way }, island);
      assert.deepEqual(islandHomeReturn(save, null), { tsid: GENTLE_ISLAND.progress_way }, island);
      // Came home from the island: the usual way back (that spot) stands.
      assert.equal(islandHomeReturn(save, { tsid: GENTLE_ISLAND.doonboggle_trail, x: 5, y: 6 }), null);
      __newxpTest.save = save;
      assert.deepEqual(newxpFeature.homeReturnTo({ tsid: BASEMENT }), { tsid: GENTLE_ISLAND.progress_way });
    }
    for (const save of [{ status: 'active', stage: 'island', island: 'exited' }, { status: 'done', stage: 'done' }, { status: 'skipped', stage: 'island' }, { status: 'active', stage: 'house' }, null]) {
      assert.equal(islandHomeReturn(save, { tsid: LOBBY }), null, JSON.stringify(save));
    }
  });

  it('the home way out asks the tutorial first (game.js homeReturnDestination)', () => {
    const game = readFileSync(join(here, '../public/game.js'), 'utf8');
    const fn = game.slice(game.indexOf('function homeReturnDestination('), game.indexOf('function homeWayOut('));
    assert.match(fn, /features\.query\('homeReturnTo', back, engine\)/);
  });

  it('Glitch sent a player leaving home mid-island back to the island', { skip: !existsSync(join(here, '../../glitch-GameServerJS/players/inc_houses.js')) }, () => {
    const src = readFileSync(join(here, '../../glitch-GameServerJS/players/inc_houses.js'), 'utf8');
    assert.match(src, /Newxp forcing to newbie island/);
    assert.match(src, /tsid: 'LIF8LHA3HT336O0'/);
  });
});
