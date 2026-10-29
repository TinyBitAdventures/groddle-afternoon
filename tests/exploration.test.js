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
} from '../public/js/achievements.js?v=g403-1';
import { loadContentCatalogsFromDir, getAchievementCatalog } from '../public/js/content-catalogs.js?v=g403-1';
import { normalizeAchievementSnapshot } from '../public/js/player-save.js?v=g424-1';
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
    // Since G184 every imported street on a hub's list is filed under that hub.
    for (const [hub, list] of Object.entries(HUB_MAP_STREETS)) {
      for (const t of list) if (index[t]) assert.equal(index[t].hubId, hub, `${t} on hub ${hub}'s list`);
    }
    // Louise Pasture (Groddle Meadow) borders Ix; it counts for its own hub only.
    assert.equal(countsTowardHub('GLIFIG7BP8G1MU9', '58'), true);
    assert.equal(countsTowardHub('GLIFIG7BP8G1MU9', '27'), false);
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
    // 43 kept streets of the map's 56; the badge wants 41 (groddle_forest_completist).
    const kept = availableHubStreets('56', index);
    assert.equal(kept.length, 43);
    const state = createAchievementState();
    for (const tsid of kept.slice(0, 40)) visit(state, tsid);
    assert.ok(!state.unlocked.includes('groddle_forest_completist'));
    visit(state, kept[40]);
    assert.ok(state.unlocked.includes('groddle_forest_completist'));
  });
});

import {
  STREET_VISITS_SLOT,
  formatLoadingTime,
  homeToFeatures,
  loadingCardDetails,
  loadingVisitLine,
  ordinal,
  recordStreetEntry,
  streetFeaturesFromTargets,
  streetLoadingVisit,
} from '../public/js/exploration.js';

describe('location loading card (LoadingLocationView.as, location.js getLoadingInfo)', () => {
  it('formats time and ordinals like StringUtil', () => {
    assert.equal(formatLoadingTime((270 * 1440 + 15 * 60 + 5) * 60), '270 days 15 hours 5 mins');
    assert.equal(formatLoadingTime((7 * 1440 + 20 * 60 + 25) * 60), '7 days 20 hours 25 mins');
    assert.equal(formatLoadingTime(61 * 60), '1 hour 1 min');
    assert.equal(formatLoadingTime(1234 * 86400), '1,234 days');
    assert.equal(formatLoadingTime((2 * 1440 + 3 * 60 + 4) * 60, { displaySec: false, maxToShow: 2 }), '~2 days 3 hours');
    assert.deepEqual([1, 2, 3, 4, 11, 12, 13, 21, 22, 101, 111].map(ordinal),
      ['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '101st', '111th']);
  });

  it('counts visits before this entry and stamps the last one', () => {
    const now = 10_000_000_000;
    assert.deepEqual(streetLoadingVisit(null, { now }), { firstVisit: true, visitCount: 0, lastVisitMins: 0 });
    // A street the save already knew counts as one visit with no time.
    assert.deepEqual(streetLoadingVisit({}, { now, knownVisits: 1 }), { firstVisit: false, visitCount: 1, lastVisitMins: 0 });
    const slot = {};
    recordStreetEntry(slot, now - 90 * 60000);
    recordStreetEntry(slot, now - 30 * 60000);
    assert.deepEqual(streetLoadingVisit(slot, { now }), { firstVisit: false, visitCount: 2, lastVisitMins: 30 });
    assert.equal(STREET_VISITS_SLOT, 'street-visits');
  });

  it('writes the visit line as the client does', () => {
    assert.equal(loadingVisitLine({ firstVisit: true }), '<span class="st-hl">First time here!</span>');
    assert.equal(loadingVisitLine({ firstVisit: true, qurazyHere: true }),
      '<span class="st-hl">First time here!</span> <b>Find the Qurazy Quoin:</b>');
    assert.equal(loadingVisitLine({ visitCount: 4, lastVisitMins: 270 * 1440 + 15 * 60 + 5 }),
      'Last here <b>270 days 15 hours 5 mins ago</b> &#8212; this is your 5th visit');
    // Back within half a minute: last_visit_mins rounds to 0, only the count shows.
    assert.equal(loadingVisitLine({ visitCount: 1, lastVisitMins: 0 }), 'this is your 2nd visit');
  });

  it('builds Home to: vendor, shrine, then one Plus line in source order', () => {
    assert.deepEqual(homeToFeatures({
      vendor: 'Hardware Vendor',
      shrineGiant: 'ti',
      counts: { npc_chicken: 2, npc_piggy: 3, npc_butterfly: 1 },
      trees: [['trant_bean', 3], ['trant_bubble', 1]],
      rocks: [['metal_rock', 2]],
      gardens: { herb: 6 },
    }), [
      'A <b>Hardware Vendor</b>.',
      'A shrine dedicated to <b>Ti</b>.',
      'Plus <b>3 Piggies</b>, <b>1 Butterfly</b>, <b>2 Chickens</b>, <b>3 Bean Trees</b>, <b>1 Bubble Tree</b>, <b>2 Metal Rocks for mining</b>, and <b>6 Herb Garden plots</b>.',
    ]);
    assert.deepEqual(homeToFeatures({ vendor: 'Alchemical Goods Vendor' }), ['An <b>Alchemical Goods Vendor</b>.']);
    // No vendor or shrine: no "Plus" (the Jethimadh Herb Gardens card).
    assert.deepEqual(homeToFeatures({ counts: { npc_piggy: 8, npc_butterfly: 7, npc_chicken: 9 }, gardens: { herb: 36 } }),
      ['<b>8 Piggies</b>, <b>7 Butterflies</b>, <b>9 Chickens</b>, and <b>36 Herb Garden plots</b>.']);
    assert.deepEqual(homeToFeatures({}), []);
  });

  it('counts the spawned targets', () => {
    const street = streetFeaturesFromTargets([
      { classId: 'npc_piggy' }, { classId: 'npc_piggy' }, { classId: 'apple' },
      { classId: 'trant_fruit' }, { classId: 'wood_tree' }, { classId: 'trant_fruit' },
      { classId: 'rock_beryl_1' }, { classId: 'rock_sparkly_1' },
      { classId: 'street_spirit_groceries', state: { vendorLabel: 'Groceries Vendor' } },
      { classId: 'npc_shrine_mab', state: { giantId: 'mab' } },
      { classId: 'garden_new', state: { garden: { gardenType: 'herb', cols: 3, rows: 2 } } },
      { classId: 'garden_new', state: { garden: { gardenType: 'default', cols: 4, rows: 2 } } },
      { classId: 'peat_2' },
    ]);
    assert.deepEqual(homeToFeatures(street), [
      'A <b>Groceries Vendor</b>.',
      'A shrine dedicated to <b>Mab</b>.',
      'Plus <b>2 Piggies</b>, <b>1 Peat Bog</b>, <b>2 Fruit Trees</b>, <b>1 Wood Tree</b>, <b>1 Beryl Rock for mining</b>, <b>1 Sparkly Rock for mining</b>, <b>6 Herb Garden plots</b>, and <b>8 Crop Garden plots</b>.',
    ]);
  });

  it('adds the Qurazy note on first visits and the upgrade badge after an upgrade', () => {
    const now = 50_000_000_000;
    const first = loadingCardDetails({ quoinTypes: ['xp', 'qurazy'], visit: { firstVisit: true, visitCount: 0 }, now });
    assert.equal(first.qurazyHere, true);
    assert.match(first.visitHtml, /Find the Qurazy Quoin:/);
    const again = loadingCardDetails({ quoinTypes: ['qurazy'], visit: { firstVisit: false, visitCount: 2, lastVisitMins: 600 }, upgradedAt: now - 60 * 60000, playerLabel: 'Ur', now });
    assert.equal(again.qurazyHere, false);
    assert.equal(again.upgradeBadge, true);
    assert.match(again.upgradeHtml, /^<b>Upgraded 1 hour ago\.<\/b> Led by:/);
    const before = loadingCardDetails({ visit: { visitCount: 2, lastVisitMins: 30 }, upgradedAt: now - 60 * 60000, now });
    assert.equal(before.upgradeBadge, false);
  });
});
