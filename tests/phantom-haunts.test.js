/**
 * #145 Notice the Unnoticeable cold spots. phantom_glitch.js chooseHauntings (373-397) picks seven
 * of its 50 official streets at random for each player; the remake took the first seven, so every
 * player hunted Balcam Stacks, Burnabee, Follybottom Stritt, Grimssea Bottom, Hackfast Quicks,
 * Firdaus Finds and Murrukku Meander, six of them on streets still to be built in a fresh world.
 * Now: seven at random among the official streets the player can reach (the reach the On hold
 * quests use), topped up with reachable streets from the haunts' own regions (a fresh world reaches
 * only 6 of the 50), an older save's unfound unreachable spots swapped once, and a spot no road
 * reaches puts the quest On hold.
 */
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  OFFICIAL_PHANTOM_HAUNTS,
  PHANTOM_HAUNT_COUNT,
  PHANTOM_QUEST_ID,
  choosePhantomHaunts,
  createGhostQuestState,
  ensureGhostQuestState,
  noticePhantom,
  phantomHauntPool,
  phantomPlaceNeed,
} from '../public/js/ghost-quest.js?v=37adc842';
import { createQuestState } from '../public/js/quests.js?v=2b882eb6';
import { loadContentCatalogsFromDir, resetContentCatalogs, getQuestCatalog } from '../public/js/content-catalogs.js?v=10b118dd';
import { SUBWAY_STREETS, closedStreets, initializeStreetJobs, normalizeStreetJobState } from '../public/js/street-jobs.js?v=94f8d250';
import { routeGraph } from '../public/js/map-routes.js?v=c7e7dc80';
import { TELEPORTERS } from '../public/js/hidden-floors.js?v=732a2610';
import { WINTRY_PORTAL_TELEPORTERS } from '../public/js/wintry-portal.js?v=1437deda';
import { placeIndex, questHold, questStoryNeeds, reachableStreets } from '../public/js/quest-reach.js?v=a206bc33';
import { streetJobsFeature } from '../public/js/features/street-jobs-feature.js?v=7313ca96';

const root = join(import.meta.dirname, '..');
const PUB = join(root, 'public');
const read = (rel) => readFileSync(join(PUB, rel), 'utf8');
const json = (rel) => JSON.parse(read(rel));
const index = json('assets/streets/index.json');
const catalog = json('assets/content/street-jobs.json');
const HOME = index.default;
const G = (t) => String(t || '').replace(/^L/, 'G');
const available = Object.keys(index.streets);
const label = (t) => index.streets[t]?.label;
const info = (t) => index.streets[t] || null;
const idx = placeIndex(index);

const graph = routeGraph(json('assets/content/signpost-graph.json')).graph;
const free = {};
for (const a of SUBWAY_STREETS) for (const b of SUBWAY_STREETS) if (a !== b) (free[a] ||= []).push(b);
for (const t of [...TELEPORTERS, ...WINTRY_PORTAL_TELEPORTERS]) (free[G(t.from)] ||= []).push(G(t.to));

/** A fresh world's reach from the starter street (the street projects' roads as they stand). */
function freshReach() {
  const state = normalizeStreetJobState({});
  initializeStreetJobs(state, [HOME]);
  const shut = new Set(closedStreets(state, catalog, { exemptFrom: [HOME] }));
  return reachableStreets({ graph, free, shut, starts: [HOME, ...state.grandfathered] });
}
const OLD_FIRST_SEVEN = ['Balcam Stacks', 'Burnabee', 'Follybottom Stritt', 'Grimssea Bottom', 'Hackfast Quicks', 'Firdaus Finds', 'Murrukku Meander'];
const activeQuests = () => {
  const qs = createQuestState();
  qs.active[PHANTOM_QUEST_ID] = { progress: {}, startedAt: 1 };
  return qs;
};

before(async () => {
  resetContentCatalogs();
  await loadContentCatalogsFromDir(join(PUB, 'assets/content'));
});

describe('#145 cold spots: seven at random per player, as phantom_glitch.js', () => {
  it('lists all 50 official streets in source order, every one imported', () => {
    const gs = readFileSync(join(root, '..', 'glitch-GameServerJS', 'quests', 'phantom_glitch.js'), 'utf8');
    const ids = [...gs.matchAll(/"prod_tsid"\s*:\s*"(L[A-Z0-9]+)"/g)].map((m) => m[1]);
    assert.equal(ids.length, 50);
    assert.deepEqual([...OFFICIAL_PHANTOM_HAUNTS], ids);
    assert.equal(phantomHauntPool(available).length, 50);
  });

  it('different players get different sevens, all official, never the old fixed first seven', () => {
    const pool = new Set(phantomHauntPool(available));
    const picks = Array.from({ length: 20 }, (_, i) => choosePhantomHaunts(available, { seed: `player-${i}` }));
    for (const p of picks) {
      assert.equal(p.length, PHANTOM_HAUNT_COUNT);
      assert.equal(new Set(p).size, PHANTOM_HAUNT_COUNT);
      assert.ok(p.every((t) => pool.has(t)));
    }
    assert.ok(new Set(picks.map((p) => [...p].sort().join())).size >= 19, 'sevens differ between players');
    assert.ok(picks.every((p) => p.map(label).join() !== OLD_FIRST_SEVEN.join()));
    // Across many players every official street turns up.
    const seen = new Set(Array.from({ length: 200 }, (_, i) => choosePhantomHaunts(available, { seed: `p${i}` })).flat());
    assert.equal(seen.size, 50);
  });

  it('a fresh world: only streets the player can reach now; six of the old seven stood on streets still to be built', () => {
    const reach = freshReach();
    const old = OLD_FIRST_SEVEN.map((name) => phantomHauntPool(available).find((t) => label(t) === name));
    assert.deepEqual(old.filter((t) => reach.has(t)).map(label), ['Burnabee'], 'only Burnabee of the fixed seven was reachable');
    const reachable = phantomHauntPool(available).filter((t) => reach.has(t));
    assert.deepEqual(reachable.map(label).sort(), ['Burnabee', 'Jutuan Central', 'Level 1 West', 'Level 2 West', 'Morchella Lepiota', 'Thicket']);
    const hauntHubs = new Set(phantomHauntPool(available).map((t) => index.streets[t].hubId));
    const standIns = new Set();
    for (let i = 0; i < 50; i += 1) {
      const p = choosePhantomHaunts(available, { reachable: reach, info, seed: `fresh-${i}` });
      assert.equal(p.length, PHANTOM_HAUNT_COUNT);
      assert.equal(new Set(p).size, PHANTOM_HAUNT_COUNT);
      assert.ok(p.every((t) => reach.has(t)), p.map(label).join());
      for (const t of reachable) assert.ok(p.includes(t), 'every reachable official street is used first');
      const extra = p.filter((t) => !reachable.includes(t));
      assert.equal(extra.length, 1);
      assert.ok(hauntHubs.has(index.streets[extra[0]].hubId), 'the stand-in is in a haunted region');
      assert.doesNotMatch(label(extra[0]), /subway station|machine room/i);
      standIns.add(extra[0]);
    }
    assert.ok(standIns.size > 10, 'the stand-in differs between players');
    // Without region info the rest come from official streets still to be built (On hold until then).
    const noInfo = choosePhantomHaunts(available, { reachable: reach, seed: 'no-info' });
    assert.equal(noInfo.filter((t) => !reach.has(t)).length, 1);
  });

  it('accepting the quest picks reachable spots and records that reach was known', () => {
    const reach = freshReach();
    const qs = activeQuests();
    const story = ensureGhostQuestState(qs, available, { reset: true, reachable: reach, info, seed: 'accept' });
    assert.equal(story.hauntStreets.length, PHANTOM_HAUNT_COUNT);
    assert.ok(story.hauntStreets.every((t) => reach.has(t)));
    assert.equal(story.reachChecked, true);
    assert.equal(phantomPlaceNeed(qs).need, PHANTOM_HAUNT_COUNT);
    // Picked while the roads were still loading: not marked, so it is checked later.
    const early = ensureGhostQuestState(activeQuests(), available, { reset: true, seed: 'early' });
    assert.equal(early.reachChecked, false);
  });

  it('no region info and few reachable: the reachable ones first, then official streets still to be built', () => {
    const pool = phantomHauntPool(available);
    const reach = new Set(pool.slice(10, 13));
    const p = choosePhantomHaunts(available, { reachable: reach, seed: 'short' });
    assert.equal(p.length, PHANTOM_HAUNT_COUNT);
    assert.equal(p.filter((t) => reach.has(t)).length, 3, 'every reachable one is used');
    assert.ok(p.every((t) => pool.includes(t)), 'the rest stay official haunts (they open with their roads)');
    // A catalog without seven official streets borrows other streets (the unit-test worlds).
    const tiny = ['A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'A8'];
    assert.equal(choosePhantomHaunts(tiny, { seed: 'x' }).length, PHANTOM_HAUNT_COUNT);
  });
});

describe('#145 an older save: unfound unreachable spots swapped once, found spots kept', () => {
  it('swaps each unreachable spot still to find for a reachable official one, keeps found ones, then never again', () => {
    const reach = freshReach();
    const pool = phantomHauntPool(available);
    const old = OLD_FIRST_SEVEN.map((name) => pool.find((t) => label(t) === name));
    const blocked = old.filter((t) => !reach.has(t));
    const foundBlocked = blocked[0];
    const qs = activeQuests();
    qs.story.phantom = createGhostQuestState({ hauntStreets: old, foundStreets: [old.find((t) => reach.has(t)), foundBlocked] });
    const before = qs.story.phantom.foundStreets.slice();
    ensureGhostQuestState(qs, available); // reach not known yet: nothing changes
    assert.deepEqual(qs.story.phantom.hauntStreets, old);
    assert.equal(qs.story.phantom.reachChecked, false);
    const story = ensureGhostQuestState(qs, available, { reachable: reach, info, seed: 'load' });
    assert.equal(story.reachChecked, true);
    assert.deepEqual(story.foundStreets, before, 'found spots stay, even one now out of reach');
    assert.equal(story.hauntStreets.length, PHANTOM_HAUNT_COUNT);
    assert.equal(new Set(story.hauntStreets).size, PHANTOM_HAUNT_COUNT);
    for (const t of story.hauntStreets) {
      if (story.foundStreets.includes(t)) continue;
      assert.ok(reach.has(t), `${label(t)} is reachable`);
    }
    for (const t of old.filter((x) => reach.has(x))) assert.ok(story.hauntStreets.includes(t), 'reachable spots stay where they were');
    // Once only: a later reach that excludes a spot does not swap again.
    const swapped = story.hauntStreets.slice();
    ensureGhostQuestState(qs, available, { reachable: new Set([HOME]), seed: 'again' });
    assert.deepEqual(qs.story.phantom.hauntStreets, swapped);
    // The flag survives the save round trip.
    assert.equal(createGhostQuestState(JSON.parse(JSON.stringify(qs.story.phantom))).reachChecked, true);
  });

  it('with nothing reachable to swap in, the unreachable spot stays (On hold until its road is built)', () => {
    const pool = phantomHauntPool(available);
    const haunts = pool.slice(0, 7);
    const qs = activeQuests();
    qs.story.phantom = createGhostQuestState({ hauntStreets: haunts });
    const reach = new Set(haunts.slice(0, 6));
    const story = ensureGhostQuestState(qs, available, { reachable: reach, seed: 'none' });
    assert.deepEqual(story.hauntStreets, haunts);
    assert.equal(story.reachChecked, true);
  });

  it('a hunt left with fewer than seven spots keeps the found ones and fills the rest', () => {
    const pool = phantomHauntPool(available);
    const qs = activeQuests();
    qs.story.phantom = createGhostQuestState({ hauntStreets: pool.slice(0, 3), foundStreets: pool.slice(0, 2) });
    const story = ensureGhostQuestState(qs, available, { reachable: new Set(pool.slice(20)), seed: 'fill' });
    assert.deepEqual(story.foundStreets, pool.slice(0, 2));
    assert.deepEqual(story.hauntStreets.slice(0, 2), pool.slice(0, 2));
    assert.equal(story.hauntStreets.length, PHANTOM_HAUNT_COUNT);
    assert.ok(story.hauntStreets.slice(2).every((t) => pool.slice(20).includes(t)));
  });
});

describe('#145 On hold when a remaining cold spot is out of reach', () => {
  it('questHold reads the player\'s spots: held while one still to find is unreachable, free once it is found or reachable', () => {
    const def = getQuestCatalog()[PHANTOM_QUEST_ID];
    const reach = freshReach();
    const pool = phantomHauntPool(available);
    const ok = pool.filter((t) => reach.has(t)).slice(0, 6);
    const far = pool.find((t) => !reach.has(t));
    const qs = activeQuests();
    qs.story.phantom = createGhostQuestState({ hauntStreets: [...ok, far], reachChecked: true });
    assert.equal(questHold(def, reach, idx), null, 'without the quest state nothing is known');
    const hold = questHold(def, reach, idx, qs);
    assert.ok(hold);
    assert.deepEqual(hold.streets, [far]);
    assert.equal(hold.place, label(far));
    // Found elsewhere first: still held for the far one.
    noticePhantom(qs, ok[0]);
    assert.ok(questHold(def, reach, idx, qs));
    // Its road opens: no hold.
    assert.equal(questHold(def, new Set([...reach, far]), idx, qs), null);
    // Not active, finished, or all reachable: no story need.
    assert.deepEqual(questStoryNeeds(PHANTOM_QUEST_ID, createQuestState(), idx), []);
    qs.story.phantom = createGhostQuestState({ hauntStreets: ok.concat(pool.find((t) => reach.has(t) && !ok.includes(t))) });
    assert.equal(questHold(def, reach, idx, qs), null);
    qs.story.phantom.finalReady = true;
    assert.deepEqual(questStoryNeeds(PHANTOM_QUEST_ID, qs, idx), []);
  });

  it('street-jobs-feature: streetsReachable gives the reach, and questHold names the far cold spot', async () => {
    const realFetch = globalThis.fetch;
    globalThis.fetch = async (url) => ({ ok: true, json: async () => JSON.parse(read(String(url).split('?')[0])) });
    try {
      const qs = activeQuests();
      const engine = { mode: 'solo', streetTsid: HOME, questState: qs, param: () => null, setData() {}, save() {}, updateHud() {} };
      streetJobsFeature.init(engine);
      streetJobsFeature.restore({}, engine);
      let reach = null;
      for (let i = 0; i < 200 && !reach; i += 1) {
        reach = streetJobsFeature.streetsReachable(engine);
        if (!reach) await new Promise((r) => setTimeout(r, 10));
      }
      assert.ok(reach instanceof Set && reach.has(HOME));
      const story = ensureGhostQuestState(qs, available, { reset: true, reachable: reach, info, seed: 'feature' });
      assert.equal(streetJobsFeature.questHold(PHANTOM_QUEST_ID, engine), null, 'all seven reachable: not held');
      const far = phantomHauntPool(available).find((t) => !reach.has(t));
      story.hauntStreets[6] = far;
      const hold = streetJobsFeature.questHold(PHANTOM_QUEST_ID, engine);
      assert.ok(hold, 'a swapped-in far spot holds it (the cache follows the spots)');
      assert.equal(hold.place, label(far));
      assert.match(hold.note, new RegExp(`^On hold: waiting for the road to ${label(far)} to be built`));
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  it('the game wires it: reach from the street projects, the hold cached by the spots, and the once-only check', () => {
    const game = read('game.js');
    assert.match(game, /reachable: features\.query\('streetsReachable', engine\) \|\| null/);
    assert.equal((game.match(/ensureGhostQuestState\(/g) || []).length, 1, 'one call site, through ghostQuestStory');
    assert.match(game, /checkPhantomHauntReach\(\);\n\s+\/\/ A quest on hold/);
    const jobs = read('js/features/street-jobs-feature.js');
    assert.match(jobs, /streetsReachable\(engine\) \{\n\s+return questReach\(engine\)\?\.reach \|\| null;/);
    assert.match(jobs, /questHold\(def, r\.reach, placeIdx, engine\?\.questState\)/);
    assert.match(jobs, /const cacheKey = storyKey \? `\$\{classTsid\}\|\$\{storyKey\}` : classTsid;/);
  });
});
