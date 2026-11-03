/**
 * Quests that need a street no open road reaches (Austin, 2026-11-03; js/quest-reach.js).
 * A fresh world keeps every street project's road closed (feedback: street projects stay
 * closed), so "To Xalanga, And Beyond" asked for a teleport point nobody could reach. Such a
 * quest is not offered until a road leads there, and one already accepted shows On hold in the
 * Quests list, keeps its progress, leaves the tracker and pins, and comes back by itself when
 * the road opens (solo: the player's projects; online: the shared world's, project_built).
 */
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { loadContentCatalogsFromDir, resetContentCatalogs, getQuestCatalog } from '../public/js/content-catalogs.js?v=10b118dd';
import { createQuestState } from '../public/js/quests.js?v=282e1621';
import { acceptOffer, pendingQuestOffers, setQuestHeldCheck } from '../public/js/quest-offers.js?v=3bf17441';
import { SUBWAY_STREETS, closedStreets, initializeStreetJobs, normalizeStreetJobState } from '../public/js/street-jobs.js?v=0235351c';
import { applyWorld } from '../public/js/street-jobs-mp.js?v=3db7e276';
import { routeGraph } from '../public/js/map-routes.js?v=130d8539';
import { TELEPORTERS } from '../public/js/hidden-floors.js?v=5ce87a04';
import { WINTRY_PORTAL_TELEPORTERS } from '../public/js/wintry-portal.js?v=1437deda';
import { closuresInTheWay, holdNote, placeIndex, questHold, questPlaceNeeds, reachableStreets } from '../public/js/quest-reach.js?v=73ff8fd2';
import { streetJobsFeature } from '../public/js/features/street-jobs-feature.js?v=db9cd19d';

const root = join(import.meta.dirname, '..');
const PUB = join(root, 'public');
const read = (rel) => readFileSync(join(PUB, rel), 'utf8');
const json = (rel) => JSON.parse(read(rel));
const catalog = json('assets/content/street-jobs.json');
const index = json('assets/streets/index.json');
const HOME = index.default;
const XALANGA = 'teleportation_teleport_to_region';
const G = (t) => String(t || '').replace(/^L/, 'G');

const graph = routeGraph(json('assets/content/signpost-graph.json')).graph;
const free = {};
for (const a of SUBWAY_STREETS) for (const b of SUBWAY_STREETS) if (a !== b) (free[a] ||= []).push(b);
for (const t of [...TELEPORTERS, ...WINTRY_PORTAL_TELEPORTERS]) (free[G(t.from)] ||= []).push(G(t.to));
const boards = {};
for (const job of Object.values(catalog.jobs)) if (job.kind === 'street') (boards[job.street] ||= []).push(...job.connecting.map(G));
const idx = placeIndex(index);
const opts = { exemptFrom: [HOME] };

function freshJobs() {
  const state = normalizeStreetJobState({});
  initializeStreetJobs(state, [HOME]);
  return state;
}
function world(state) {
  const shut = new Set(closedStreets(state, catalog, opts));
  const starts = [HOME, ...state.grandfathered];
  return { shut, starts, reach: reachableStreets({ graph, free, shut, starts }) };
}
const holdIn = (state, id) => questHold(getQuestCatalog()[id], world(state).reach, idx);
/** The street projects the hold's chain builds, by job id. */
function chainJobs(state, id) {
  const w = world(state);
  const hold = questHold(getQuestCatalog()[id], w.reach, idx);
  return closuresInTheWay({ graph, free, shut: w.shut, starts: w.starts, targets: hold.streets, boards })
    .map(({ street }) => Object.keys(catalog.jobs).find((j) => catalog.jobs[j].kind === 'street' && catalog.jobs[j].street === street));
}

before(async () => {
  resetContentCatalogs();
  await loadContentCatalogsFromDir(join(PUB, 'assets/content'));
});

describe('which quests wait for a road on a fresh world', () => {
  it('names the six whose streets no open road reaches, each reachable once its projects are built', () => {
    const state = freshJobs();
    const held = Object.keys(getQuestCatalog()).filter((id) => holdIn(state, id)).sort();
    assert.deepEqual(held, ['purple_journey_north', 'sparkly_of_interest_1', 'sparkly_of_interest_2', 'sparkly_of_interest_3', 'sparkly_of_interest_4', XALANGA]);
    for (const id of held) {
      const jobs = chainJobs(state, id);
      assert.ok(jobs.length > 0 && jobs.every(Boolean), id);
      const built = freshJobs();
      applyWorld(built, catalog, { built: Object.fromEntries(jobs.map((j) => [j, { at: 5 }])) });
      assert.equal(holdIn(built, id), null, `${id} opens once its ${jobs.length} projects stand`);
    }
  });

  it('To Xalanga, And Beyond: both steps need Xalanga (Set teleportation point, teleport there)', () => {
    const needs = questPlaceNeeds(getQuestCatalog()[XALANGA], idx);
    assert.deepEqual(needs.map((n) => n.name), ['teleportation_point_in_xalanga', 'teleport_to_xalanga']);
    assert.equal(needs[0].streets.length, 40);
    const hold = holdIn(freshJobs(), XALANGA);
    assert.equal(hold.place, 'Xalanga');
  });

  it('a quest that can happen anywhere, or on a street you reach, never waits', () => {
    const state = freshJobs();
    for (const id of ['croppery_harvest_and_sell_at_auction', 'herbalism_harvest_shuck_and_plant_herbs', 'jump_in_hole', 'meditativearts_maintain_energy_in_wintry_place', 'explore_the_seams']) {
      assert.equal(holdIn(state, id), null, id);
    }
  });

  it('the chain starts at a board you can stand at: Hazy Gate 3\'s board is inside Xalanga, so not that one', () => {
    const state = freshJobs();
    const w = world(state);
    const hold = holdIn(state, XALANGA);
    const chain = closuresInTheWay({ graph, free, shut: w.shut, starts: w.starts, targets: hold.streets, boards });
    assert.ok(w.reach.has(chain[0].board), 'the first board is reachable now');
    assert.ok(boards[chain[0].street].includes(chain[0].board));
    const naive = closuresInTheWay({ graph, free, shut: w.shut, starts: w.starts, targets: hold.streets });
    assert.equal(idx.label(naive[0].street), 'Hazy Gate 3');
    assert.equal(w.reach.has(boards[naive[0].street][0]), false, 'Ramble Way 4 is behind the closures');
  });

  it('says why in plain words', () => {
    assert.equal(holdNote({ place: 'Xalanga' }, { building: 'Footlands Heath', board: 'Elysian Slope' }),
      'On hold: waiting for the road to Xalanga to be built. Start with Footlands Heath, at the project board on Elysian Slope.');
    assert.equal(holdNote({ place: 'Neva Neva' }), 'On hold: waiting for the road to Neva Neva to be built.');
    assert.doesNotMatch(holdNote({ place: 'X' }, { building: 'Y', board: 'Z' }), /—/);
  });
});

describe('offers wait, accepted quests hold and resume', () => {
  it('the familiar and NPCs do not offer a held quest, and do once it is reachable', () => {
    const qs = createQuestState();
    const ctx = { level: 20, xp: 50000, skills: ['teleportation_1'], learned: ['teleportation_1'], inv: {}, achievements: [], buffs: [], now: 10 };
    const offered = () => pendingQuestOffers(qs, { level: 20, xp: 50000 }, ctx).some((r) => r.classTsid === XALANGA);
    assert.equal(offered(), true, 'Teleportation I offers it (offerTriggers skill)');
    let state = freshJobs();
    setQuestHeldCheck((id) => Boolean(holdIn(state, id)));
    try {
      assert.equal(offered(), false);
      assert.equal(pendingQuestOffers(qs, { level: 20, xp: 50000 }, { ...ctx, questHeld: () => false }).some((r) => r.classTsid === XALANGA), true, 'a caller can answer itself');
      // NPC offers (npcQuestOffers) go through the same eligibleTrigger, so they ask the same check.
      const src = read('js/quest-offers.js');
      const at = src.indexOf('function eligibleTrigger(');
      assert.ok(src.indexOf('if ((ctx.questHeld || questHeldCheck)?.(def.classTsid)) return null;', at) > at);
      assert.ok(src.indexOf('eligibleTrigger(def, questState, pc, npcCtx, { npc: true })') > 0);
      // The shared world (or your own) builds the roads: offered again.
      applyWorld(state, catalog, { built: Object.fromEntries(chainJobs(state, XALANGA).map((j) => [j, { at: 5 }])) });
      assert.equal(offered(), true);
    } finally {
      setQuestHeldCheck(null);
    }
  });

  it('an accepted quest is held on load with its progress, and resumes when its road opens', () => {
    const qs = createQuestState();
    assert.equal(acceptOffer(qs, XALANGA, { inv: {}, now: 1 }).ok, true);
    qs.active[XALANGA].progress.teleportation_point_in_xalanga = 1;
    const saved = JSON.parse(JSON.stringify(qs));
    const state = normalizeStreetJobState(JSON.parse(JSON.stringify(freshJobs())));
    assert.ok(holdIn(state, XALANGA), 'held on load');
    assert.deepEqual(qs, saved, 'nothing about the quest changes');
    applyWorld(state, catalog, { built: Object.fromEntries(chainJobs(state, XALANGA).map((j) => [j, { at: 9 }])) });
    assert.equal(holdIn(state, XALANGA), null, 'resumes');
    assert.equal(qs.active[XALANGA].progress.teleportation_point_in_xalanga, 1, 'progress kept');
  });

  it('a street you have stood on counts (grandfathered, ticket 50): an old character is not held', () => {
    const state = freshJobs();
    const xal = Object.keys(index.streets).find((t) => index.streets[t].hubId === '95');
    state.grandfathered.push(xal);
    assert.equal(holdIn(state, XALANGA), null);
  });
});

describe('the game asks the street projects (no stored flag)', () => {
  it('street-jobs-feature answers questHold from the roads as they stand, cached by the roads', async () => {
    const realFetch = globalThis.fetch;
    globalThis.fetch = async (url) => ({ ok: true, json: async () => JSON.parse(read(String(url).split('?')[0])) });
    try {
      const engine = { mode: 'solo', streetTsid: HOME, param: () => null, setData() {}, save() {}, updateHud() {} };
      streetJobsFeature.init(engine);
      streetJobsFeature.restore({}, engine);
      let hold = null;
      for (let i = 0; i < 200 && !hold; i += 1) {
        hold = streetJobsFeature.questHold(XALANGA, engine);
        if (!hold) await new Promise((r) => setTimeout(r, 10));
      }
      assert.ok(hold, 'held on a fresh world');
      assert.equal(hold.place, 'Xalanga');
      assert.match(hold.note, /^On hold: waiting for the road to Xalanga to be built\. Start with .+, at the project board on .+\.$/);
      assert.equal(streetJobsFeature.questHold(XALANGA, engine), hold, 'cached while the roads stand');
      assert.equal(streetJobsFeature.questHold('croppery_harvest_and_sell_at_auction', engine), null);
      // The save keeps no hold: the slice is the street projects' own.
      assert.equal(JSON.stringify(streetJobsFeature.save()).includes('hold'), false);
      // A road opens (a saved world where the chain stands): the hold goes, on load.
      const built = freshJobs();
      applyWorld(built, catalog, { built: Object.fromEntries(chainJobs(built, XALANGA).map((j) => [j, { at: 7 }])) });
      streetJobsFeature.restore(built, engine);
      assert.equal(streetJobsFeature.questHold(XALANGA, engine), null);
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  it('game.js shows the note on the card, and keeps held quests off the tracker and the pins', () => {
    const game = read('game.js');
    assert.match(game, /const hold = p\.active \? questHoldOf\(p\.def\.classTsid\) : null;/);
    assert.match(game, /note\.className = 'q-hold';\n\s+note\.textContent = hold\.note;/);
    assert.match(game, /\.filter\(\(row\) => !holds\.includes\(row\.classTsid\)\)\.slice\(0, 2\)/);
    assert.match(game, /if \(!p\?\.active \|\| questHoldOf\(classTsid\)\) return null;/);
    const sheet = read('js/ui/quest-sheet.js');
    assert.match(sheet, /h\.textContent = `On hold: waiting for the road to \$\{card\.dataset\.questHold\}`;/);
    assert.match(read('style.css'), /\[data-ui="modern"\] #quest \.qc-step\.qc-hold/);
    assert.match(read('css/classic.css'), /\.qc-head \.qc-step\.qc-hold/);
    assert.match(read('js/features/quest-offers-feature.js'), /setQuestHeldCheck\(\(id\) => Boolean\(engine\.query\?\.\('questHold', id, engine\)\)\);/);
  });
});
