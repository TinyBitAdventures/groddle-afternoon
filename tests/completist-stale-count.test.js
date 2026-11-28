/**
 * #528 (R32): before v0.47.0 a hub's subway station counted toward its Completist;
 * Glitch never counted it (location.js:2759 transit_is_station). A save that visited
 * the station then kept it in its count and its street list, so it finished a street
 * early. On load exploration.js topUpCompletists works each Completist out again from
 * the saved list through today's countsTowardHub, lowering as well as raising; an
 * earned badge stays (Austin 2026-11-17).
 * Run: node --test tests/completist-stale-count.test.js
 */
import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAchievementState, applyAchievementProgress, unlockAchievement } from '../public/js/achievements.js?v=7a3a0e92';
import { loadContentCatalogsFromDir, getAchievementCatalog } from '../public/js/content-catalogs.js?v=b2a9a862';
import { TRANSIT_STATIONS, applyStreetVisit, availableHubStreets, countsTowardHub, topUpCompletists } from '../public/js/exploration.js?v=8f19e25d';

const here = dirname(fileURLToPath(import.meta.url));
const publicRoot = join(here, '..', 'public');
const index = JSON.parse(readFileSync(join(publicRoot, 'assets/streets/index.json'), 'utf8')).streets;

before(async () => {
  await loadContentCatalogsFromDir(join(publicRoot, 'assets/content'));
});

const HUB = '72'; // Chakra Phool
const STATION = 'GTJ102S2J102N7O'; // Jutuan Central Subway Station
const TOMA = 'GTJ12G0H5KV10GH'; // Toma Traverse
const walk = (state, streets) => streets.flatMap((tsid) => applyStreetVisit({ state, tsid, hubId: HUB, indexStreets: index, apply: (c, n) => applyAchievementProgress(state, c, n) }));
const load = (state) => topUpCompletists({ state, catalog: getAchievementCatalog(), indexStreets: index, unlock: (id) => unlockAchievement(state, id, null) });

/** A save from before v0.47.0 that visited the station: counted once, kept in the list. */
function staleSave() {
  const state = createAchievementState();
  state.groups[`streets_visited_in_hub_${HUB}`] = [STATION];
  state.progress.chakra_phool_completist = { progress: { number_72: 1 } };
  return state;
}

describe('#528 Completists drop a street the old rule counted', () => {
  it('the case: the station is on the hub map, is not counted today, and the badge asks 31', () => {
    assert.ok(TRANSIT_STATIONS.has(STATION));
    assert.equal(index[STATION]?.hubId, HUB);
    assert.equal(countsTowardHub(STATION, HUB), false);
    const streets = availableHubStreets(HUB, index);
    assert.equal(streets.length, 31);
    assert.ok(streets.includes(TOMA));
    assert.equal(getAchievementCatalog().chakra_phool_completist.conditions[0].num, 31);
  });

  it('a stale station visit plus 30 streets does not earn Chakra Phool; the 31st street does', () => {
    const state = staleSave();
    load(state);
    assert.equal(state.progress.chakra_phool_completist.progress.number_72, 0, 'lowered on load');
    assert.deepEqual(state.groups[`streets_visited_in_hub_${HUB}`], [], 'the station leaves the list');
    const thirty = availableHubStreets(HUB, index).filter((t) => t !== TOMA);
    assert.equal(thirty.length, 30);
    walk(state, thirty);
    assert.equal(state.unlocked.includes('chakra_phool_completist'), false, 'Toma Traverse still unvisited');
    assert.equal(state.progress.chakra_phool_completist.progress.number_72, 30);
    const updates = walk(state, [TOMA]);
    assert.ok(state.unlocked.includes('chakra_phool_completist'));
    assert.ok(updates.some((u) => u.classTsid === 'chakra_phool_completist' && u.unlocked));
  });

  it('a save midway (stale station + 29 streets) finishes only at the real 31st', () => {
    const state = staleSave();
    const thirty = availableHubStreets(HUB, index).filter((t) => t !== TOMA);
    state.groups[`streets_visited_in_hub_${HUB}`].push(...thirty.slice(0, 29));
    state.progress.chakra_phool_completist.progress.number_72 = 30;
    const rows = load(state);
    assert.equal(rows.some((r) => r.unlocked), false);
    assert.equal(state.progress.chakra_phool_completist.progress.number_72, 29);
    walk(state, thirty.slice(29));
    assert.equal(state.unlocked.includes('chakra_phool_completist'), false, 'thirty real streets');
    walk(state, [TOMA]);
    assert.ok(state.unlocked.includes('chakra_phool_completist'));
  });

  it('31 real streets earn it, stale station or not', () => {
    const state = staleSave();
    load(state);
    walk(state, availableHubStreets(HUB, index));
    assert.ok(state.unlocked.includes('chakra_phool_completist'));
  });

  it('a badge already earned stays, and keeps its list once trimmed', () => {
    const state = staleSave();
    walk(state, availableHubStreets(HUB, index).filter((t) => t !== TOMA));
    // Earned under the old rule (station + 30).
    unlockAchievement(state, 'chakra_phool_completist', null);
    load(state);
    assert.ok(state.unlocked.includes('chakra_phool_completist'), 'kept');
    assert.equal(state.groups[`streets_visited_in_hub_${HUB}`].includes(STATION), false);
  });

  it('progress above what the list holds is lowered, below it raised (#154 still holds)', () => {
    const state = createAchievementState();
    state.groups[`streets_visited_in_hub_${HUB}`] = availableHubStreets(HUB, index).slice(0, 10);
    state.progress.chakra_phool_completist = { progress: { number_72: 25 } };
    load(state);
    assert.equal(state.progress.chakra_phool_completist.progress.number_72, 10);
    state.groups[`streets_visited_in_hub_${HUB}`].push(...availableHubStreets(HUB, index).slice(10, 20));
    load(state);
    assert.equal(state.progress.chakra_phool_completist.progress.number_72, 20);
  });
});
