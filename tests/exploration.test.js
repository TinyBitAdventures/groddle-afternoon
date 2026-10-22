/**
 * group_count badges and street-visit counters (js/exploration.js).
 * Run: node --test tests/exploration.test.js
 */
import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createAchievementState,
  applyAchievementProgress,
  groupLabelCount,
} from '../public/js/achievements.js';
import { loadContentCatalogsFromDir, getAchievementCatalog } from '../public/js/content-catalogs.js';
import { normalizeAchievementSnapshot } from '../public/js/player-save.js';
import {
  applyStreetVisit,
  availableHubStreets,
  countsTowardHub,
  hubMapStreetCount,
  streetVisitCounters,
} from '../public/js/exploration.js';
import { HUB_MAP_STREETS } from '../public/js/hub-maps-data.js';

const here = dirname(fileURLToPath(import.meta.url));
const publicRoot = join(here, '../public');
const index = JSON.parse(readFileSync(join(publicRoot, 'assets/streets/index.json'), 'utf8')).streets;

before(async () => {
  await loadContentCatalogsFromDir(join(publicRoot, 'assets/content'));
});

/** Replay a street visit the way game.js recordStreetVisit does. */
function visit(state, tsid) {
  return applyStreetVisit({
    state,
    tsid,
    hubId: index[tsid].hubId,
    indexStreets: index,
    apply: (counter, amount) => applyAchievementProgress(state, counter, amount),
  });
}

describe('group_count conditions', () => {
  it('counts distinct labels, not repeats', () => {
    const state = createAchievementState();
    applyAchievementProgress(state, 'emblems_acquired:mab');
    applyAchievementProgress(state, 'emblems_acquired:mab');
    applyAchievementProgress(state, 'emblems_acquired:pot');
    assert.equal(groupLabelCount(state, 'emblems_acquired'), 2);
    const cond = getAchievementCatalog().all_giant_emblems.conditions[0];
    assert.equal(state.progress.all_giant_emblems.progress[cond.name], 2);
  });

  it('unlocks All Giant Emblems at eleven different Giants', () => {
    const state = createAchievementState();
    const giants = ['alph', 'cosma', 'friendly', 'grendaline', 'humbaba', 'lem', 'mab', 'pot', 'spriggan', 'tii', 'zille'];
    let unlocked = false;
    for (const g of giants) {
      for (const u of applyAchievementProgress(state, `emblems_acquired:${g}`)) {
        if (u.classTsid === 'all_giant_emblems' && u.unlocked) unlocked = true;
      }
    }
    assert.ok(unlocked);
  });

  it('supports groups that contain a colon', () => {
    const state = createAchievementState();
    applyAchievementProgress(state, 'VERB:iconize:mab');
    applyAchievementProgress(state, 'VERB:iconize:pot');
    assert.equal(groupLabelCount(state, 'VERB:iconize'), 2);
  });

  it('distinct foods made drive the cooking ranks', () => {
    const state = createAchievementState();
    for (const food of ['sammich', 'cheezy_sammich', 'oily_dressing', 'tasty_pasta', 'fried_egg', 'hash', 'mexicali_eggs']) {
      applyAchievementProgress(state, `making_food:${food}`);
    }
    assert.ok(state.unlocked.includes('beginner_decoctifier'));
  });

  it('saves and restores the label sets', () => {
    const state = createAchievementState();
    applyAchievementProgress(state, 'locations_visited:GA5101HF7F429V5');
    const restored = normalizeAchievementSnapshot(JSON.parse(JSON.stringify(state)));
    assert.deepEqual(restored.groups.locations_visited, ['GA5101HF7F429V5']);
    assert.deepEqual(normalizeAchievementSnapshot({ progress: {}, unlocked: [] }).groups, {});
  });
});

describe('street visit counters', () => {
  it('maps every hub to G tsids', () => {
    assert.ok(Object.keys(HUB_MAP_STREETS).length > 80);
    for (const list of Object.values(HUB_MAP_STREETS)) for (const tsid of list) assert.match(tsid, /^G/);
  });

  it('emits the source counters for a mapped street', () => {
    const tsid = availableHubStreets('56', index)[0];
    const counters = streetVisitCounters({ tsid, hubId: '56', indexStreets: index }).map((c) => c.counter);
    assert.deepEqual(counters, [
      `locations_visited:${tsid}`,
      'hubs_visited:56',
      'streets_visited_in_hub:number_56',
      `streets_visited_in_hub_56:${tsid}`,
    ]);
    // A repeat visit no longer counts toward the hub number.
    const again = streetVisitCounters({ tsid, hubId: '56', visitedInHub: [tsid], indexStreets: index }).map((c) => c.counter);
    assert.ok(!again.includes('streets_visited_in_hub:number_56'));
  });

  it('only streets on their own hub map count toward the hub', () => {
    const borrowed = HUB_MAP_STREETS['56'].find((t) => index[t] && index[t].hubId !== '56');
    assert.ok(borrowed, 'hub 56 shows a neighbour hub street');
    assert.equal(countsTowardHub(borrowed, index[borrowed].hubId), HUB_MAP_STREETS[index[borrowed].hubId]?.includes(borrowed) || false);
  });

  it('explorer badges grow with distinct streets', () => {
    const state = createAchievementState();
    const streets = Object.keys(index).slice(0, 5);
    for (const tsid of streets) visit(state, tsid);
    visit(state, streets[0]);
    assert.equal(groupLabelCount(state, 'locations_visited'), 5);
    assert.ok(state.unlocked.includes('junior_ok_explorer'));
  });

  it('every hub Completist can finish with the streets the archive kept', () => {
    const cat = getAchievementCatalog();
    const completists = Object.values(cat).filter((d) => (d.conditions || []).some((c) => c.group === 'streets_visited_in_hub'));
    assert.ok(completists.length > 40, String(completists.length));
    for (const def of completists) {
      const cond = def.conditions.find((c) => c.group === 'streets_visited_in_hub');
      const hub = cond.name.replace('number_', '');
      const kept = availableHubStreets(hub, index);
      if (!kept.length || hub === '40') continue; // hubs the archive lost entirely; Naraka is js/hell.js's
      const state = createAchievementState();
      for (const tsid of kept) visit(state, tsid);
      assert.ok(state.unlocked.includes(def.classTsid), `${def.classTsid}: ${kept.length} kept of ${hubMapStreetCount(hub)}, needs ${cond.num}`);
    }
  });

  it('groddle forest is not finished one street early', () => {
    const kept = availableHubStreets('56', index);
    const state = createAchievementState();
    for (const tsid of kept.slice(0, -1)) visit(state, tsid);
    assert.ok(!state.unlocked.includes('groddle_forest_completist'));
  });
});
