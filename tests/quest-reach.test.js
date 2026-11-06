/**
 * Quests that need a street no open road reaches (Austin, 2026-11-03; js/quest-reach.js).
 * A fresh world keeps every street project's road closed (feedback: street projects stay
 * closed), so "To Xalanga, And Beyond" asked for a teleport point nobody could reach (Austin then
 * opened Hazy Gate 3, job 524, from the start: tools/street-jobs-built-from-start.json). Such a
 * quest is not offered until a road leads there, and one already accepted shows On hold in the
 * Quests list, keeps its progress, leaves the tracker and pins, and comes back by itself when
 * the road opens (solo: the player's projects; online: the shared world's, project_built).
 * The same evening the Map's way to Hazy Gate 3 went through Level 2 West's Yellow-Teal Square
 * Key door, a key nothing gives: such doors are no way (signpost-graph `sealed`), so a fresh world
 * reached 86 streets, not 238, and Xalanga was held again; Neva Neva and Ajaya Bliss are behind Door
 * Key 9 doors. Austin then opened the one walkable way from the start (jobs 206 Konemaen Jaunt, 201
 * Simo Steer, 240 Kala Close: the subway to Onto Parada, then on to Yellow Yawning; Viscid Pud's post
 * to Pandhal Pegs is out of a jump's reach), so a fresh world reaches 239 streets, Xalanga with them.
 */
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { loadContentCatalogsFromDir, resetContentCatalogs, getQuestCatalog } from '../public/js/content-catalogs.js?v=10b118dd';
import { createQuestState } from '../public/js/quests.js?v=c8d9d0a4';
import { acceptOffer, pendingQuestOffers, setQuestHeldCheck } from '../public/js/quest-offers.js?v=8599dbf9';
import { SUBWAY_STREETS, closedStreets, initializeStreetJobs, normalizeStreetJobState } from '../public/js/street-jobs.js?v=02a81cb3';
import { applyWorld } from '../public/js/street-jobs-mp.js?v=c920dbb9';
import { routeGraph } from '../public/js/map-routes.js?v=e0ac88c0';
import { TELEPORTERS } from '../public/js/hidden-floors.js?v=d49b76df';
import { WINTRY_PORTAL_TELEPORTERS } from '../public/js/wintry-portal.js?v=1437deda';
import { closuresInTheWay, holdNote, placeIndex, questHold, questPlaceNeeds, reachableStreets } from '../public/js/quest-reach.js?v=9a001ac1';
import { streetJobsFeature } from '../public/js/features/street-jobs-feature.js?v=66065d7c';

const root = join(import.meta.dirname, '..');
const PUB = join(root, 'public');
const read = (rel) => readFileSync(join(PUB, rel), 'utf8');
const json = (rel) => JSON.parse(read(rel));
const catalog = json('assets/content/street-jobs.json');
const index = json('assets/streets/index.json');
const HOME = index.default;
const XALANGA = 'teleportation_teleport_to_region';
const NEVA = 'sparkly_of_interest_1'; // Well, I Neva!: Arrive at Neva Neva
const PURPLE = 'purple_journey_north'; // A Purple Journey North: Munch a Purple Flower in Aranna
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
  it('a fresh world reaches 239 streets: no door whose key nothing gives (Level 2 West into Oppidan Avenue)', () => {
    const w = world(freshJobs());
    assert.equal(w.reach.size, 239);
    const level2 = 'GHH1011JSO11ORS';
    const oppidan = 'GDOHDJ84BST2UI2';
    assert.equal(json('assets/content/signpost-graph.json').sealed[`${level2}>${oppidan}`], 7, 'the Yellow-Teal Square Key');
    assert.equal(graph[level2].includes(oppidan), false);
    assert.equal(w.reach.has(oppidan), false);
    assert.deepEqual([...w.reach].filter((t) => index.streets[t].hubId === '95').map((t) => index.streets[t].label).sort(), ['Hazy Gate 3', 'Languid Line S'], 'Xalanga, by Hazy Gate 3');
  });

  it('names the six whose streets no open road reaches; two open once their projects are built', () => {
    const state = freshJobs();
    const held = Object.keys(getQuestCatalog()).filter((id) => holdIn(state, id)).sort();
    assert.deepEqual(held, ['explore_the_seams', PURPLE, 'sparkly_of_interest_1', 'sparkly_of_interest_2', 'sparkly_of_interest_3', 'sparkly_of_interest_4']);
    // Neva Neva and Ajaya Bliss are behind Door Key 9 doors (Nawiwa Wend, Subarna Spells): no project opens them.
    for (const id of ['sparkly_of_interest_1', 'sparkly_of_interest_2', 'sparkly_of_interest_3', 'sparkly_of_interest_4']) {
      assert.deepEqual(chainJobs(state, id), [], `${id}: no road to build`);
      const all = freshJobs();
      applyWorld(all, catalog, { built: Object.fromEntries(Object.keys(catalog.jobs).filter((j) => catalog.jobs[j].kind === 'street').map((j) => [j, { at: 5 }])) });
      assert.ok(holdIn(all, id), `${id}: held with every project built`);
    }
    for (const id of [PURPLE]) {
      const jobs = chainJobs(state, id);
      assert.ok(jobs.length > 0 && jobs.every(Boolean), id);
      const built = freshJobs();
      applyWorld(built, catalog, { built: Object.fromEntries(jobs.map((j) => [j, { at: 5 }])) });
      assert.equal(holdIn(built, id), null, `${id} opens once its ${jobs.length} projects stand`);
    }
  });

  it('To Xalanga, And Beyond: not held on a fresh world; the way is the subway to Onto Parada and the three roads opened from the start', () => {
    const needs = questPlaceNeeds(getQuestCatalog()[XALANGA], idx);
    assert.deepEqual(needs.map((n) => n.name), ['teleportation_point_in_xalanga', 'teleport_to_xalanga']);
    assert.equal(needs[0].streets.length, 40);
    assert.equal(holdIn(freshJobs(), XALANGA), null, 'not held on a fresh world');
    assert.deepEqual(Object.keys(catalog.jobs).filter((id) => catalog.jobs[id].builtFromStart), ['201', '206', '240', '524']);
    for (const id of ['201', '206', '240', '524']) assert.match(catalog.jobs[id].builtFromStart, /^Austin 2026-11-03/);
    const w = world(freshJobs());
    for (const label of ['Onto Parada', 'Konemaen Jaunt', 'Simo Steer', 'Kala Close', 'Shinso Ello', 'Yellow Yawning', 'Hazy Gate 3']) {
      const t = Object.keys(index.streets).find((k) => index.streets[k].label === label);
      assert.ok(w.reach.has(t) && !w.shut.has(t), `${label} is open and reached`);
    }
    // Without the three roads it is held again: they are the way.
    const none = freshJobs();
    const shutAlso = new Set([...closedStreets(none, catalog, opts), ...['201', '206', '240'].map((id) => catalog.jobs[id].street)]);
    const reach = reachableStreets({ graph, free, shut: shutAlso, starts: [HOME] });
    assert.ok(questHold(getQuestCatalog()[XALANGA], reach, idx), 'held without them');
  });

  it('a quest that can happen anywhere, or on a street you reach, never waits', () => {
    const state = freshJobs();
    for (const id of ['croppery_harvest_and_sell_at_auction', 'herbalism_harvest_shuck_and_plant_herbs', 'jump_in_hole', 'meditativearts_maintain_energy_in_wintry_place']) {
      assert.equal(holdIn(state, id), null, id);
    }
  });

  it('each chain starts at a board you can stand at now, never one behind a closure', () => {
    const state = freshJobs();
    const w = world(state);
    for (const id of [PURPLE]) {
      const hold = holdIn(state, id);
      const chain = closuresInTheWay({ graph, free, shut: w.shut, starts: w.starts, targets: hold.streets, boards });
      assert.ok(w.reach.has(chain[0].board), `${id}: the first board is reachable now`);
      for (const step of chain) assert.ok(boards[step.street].includes(step.board), `${id}: built at its own board`);
    }
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
    const state = freshJobs();
    setQuestHeldCheck((id) => Boolean(holdIn(state, id)));
    try {
      assert.equal(offered(), true, 'Teleportation I offers it on a fresh world: Xalanga is reachable');
      // Where it would wait (a check that holds it), it is not offered.
      setQuestHeldCheck((id) => id === XALANGA);
      assert.equal(offered(), false);
      assert.equal(pendingQuestOffers(qs, { level: 20, xp: 50000 }, { ...ctx, questHeld: () => false }).some((r) => r.classTsid === XALANGA), true, 'a caller can answer itself');
      // NPC offers (npcQuestOffers) go through the same eligibleTrigger, so they ask the same check.
      const src = read('js/quest-offers.js');
      const at = src.indexOf('function eligibleTrigger(');
      assert.ok(src.indexOf('if ((ctx.questHeld || questHeldCheck)?.(def.classTsid)) return null;', at) > at);
      assert.ok(src.indexOf('eligibleTrigger(def, questState, pc, npcCtx, { npc: true })') > 0);
    } finally {
      setQuestHeldCheck(null);
    }
  });

  it('an accepted quest is held on load with its progress, and resumes when its road opens', () => {
    const qs = createQuestState();
    assert.equal(acceptOffer(qs, PURPLE, { inv: {}, now: 1 }).ok, true);
    qs.active[PURPLE].progress.purple_journey_munch = 1;
    const saved = JSON.parse(JSON.stringify(qs));
    const state = normalizeStreetJobState(JSON.parse(JSON.stringify(freshJobs())));
    assert.ok(holdIn(state, PURPLE), 'held on load');
    assert.deepEqual(qs, saved, 'nothing about the quest changes');
    applyWorld(state, catalog, { built: Object.fromEntries(chainJobs(state, PURPLE).map((j) => [j, { at: 9 }])) });
    assert.equal(holdIn(state, PURPLE), null, 'resumes');
    assert.equal(qs.active[PURPLE].progress.purple_journey_munch, 1, 'progress kept');
  });

  it('a street you have stood on counts (grandfathered, ticket 50): an old character is not held', () => {
    const state = freshJobs();
    state.grandfathered.push(Object.keys(index.streets).find((t) => index.streets[t].label === 'Neva Neva'));
    assert.equal(holdIn(state, NEVA), null);
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
        hold = streetJobsFeature.questHold(PURPLE, engine);
        if (!hold) await new Promise((r) => setTimeout(r, 10));
      }
      assert.ok(hold, 'held on a fresh world');
      assert.equal(hold.place, 'Aranna');
      assert.match(hold.note, /^On hold: waiting for the road to Aranna to be built\. Start with .+, at the project board on .+\.$/);
      assert.equal(streetJobsFeature.questHold(PURPLE, engine), hold, 'cached while the roads stand');
      assert.equal(streetJobsFeature.questHold(XALANGA, engine), null, 'Xalanga is reachable');
      assert.equal(streetJobsFeature.questHold('croppery_harvest_and_sell_at_auction', engine), null);
      assert.equal(streetJobsFeature.questHold(NEVA, engine).note, 'On hold: waiting for the road to Neva Neva to be built.', 'no project to start: a Door Key 9 door');
      // The save keeps no hold: the slice is the street projects' own.
      assert.equal(JSON.stringify(streetJobsFeature.save()).includes('hold'), false);
      // A road opens (a saved world where the chain stands): the hold goes, on load.
      const built = freshJobs();
      applyWorld(built, catalog, { built: Object.fromEntries(chainJobs(built, PURPLE).map((j) => [j, { at: 7 }])) });
      streetJobsFeature.restore(built, engine);
      assert.equal(streetJobsFeature.questHold(PURPLE, engine), null);
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
