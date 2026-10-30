/**
 * G401 (lane TRAP, Austin's live play of 2026-10-28): after the whole Gentle Island tutorial he was
 * dropped on Rappam Rolls (Kajuu) and could not get anywhere. Nothing held the avatar: both of the
 * street's signposts said "The road to ... is still under construction" (street-jobs-feature
 * travelGate, js/street-jobs.js roadClosure), and a new player has no Teleportation for the Map. On a
 * fresh world 100 of config_prod.js's 115 newxp_exits are such pockets: GSJS listed them for a world
 * whose Kajuu, Muufo, Rasana, Salatu and Tamila roads were already built.
 *
 * 1. Exits count only when their roads lead back to Hechey Track (exitLeadsHome over the Map's
 *    signpost graph with today's closed roads); the pick never lands in a pocket.
 * 2. leaveIsland uses it; the tutorial's chrome and root are down once the island is left.
 * 3. A player already stranded on the exit street (Austin's save, a reload there) is set down on an
 *    exit with a way out, once.
 * 4. Autoplay closes the Map after Mappery instead of clicking a street (the G356 street menu).
 */
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { NEWXP_EXITS, GENTLE_ISLAND, indexTsid, normalizeNewxpSave } from '../public/js/newxp.js?v=d5978ec1';
import { closedStreets, normalizeStreetJobState } from '../public/js/street-jobs.js?v=3c8a3e97';
import { newxpFeature, __newxpTest, exitLeadsHome, pickOpenExit } from '../public/js/features/newxp-feature.js?v=7192302a';

const root = join(import.meta.dirname, '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');
const json = (rel) => JSON.parse(read(rel));
const feature = read('public/js/features/newxp-feature.js');

const graph = json('public/assets/content/signpost-graph.json');
const catalog = json('public/assets/content/street-jobs.json');
const index = json('public/assets/streets/index.json');
const HECHEY = 'GLI2V0UN7RD1T2J';
const RAPPAM = 'GHV3ISF18352QIP';
// A new player's world: nothing built, the island grandfathered, Hechey Track's roads exempt.
const fresh = normalizeStreetJobState({ initialized: true, grandfathered: Object.values(GENTLE_ISLAND) });
const closed = closedStreets(fresh, catalog, { exemptFrom: [index.default] });
const open = (tsid) => exitLeadsHome(tsid, { graph, closed });
const exists = (tsid) => Boolean(index.streets[tsid]);

describe('1. an exit counts only when its roads lead back to Hechey Track', () => {
  it('Rappam Rolls is a pocket on a fresh world: both posts list only roads still being built', () => {
    assert.equal(index.default, HECHEY);
    const street = json(`public/${index.streets[RAPPAM].file}`);
    const targets = street.signposts.flatMap((s) => s.connects.map((c) => indexTsid(c.tsid)));
    assert.ok(targets.length >= 4);
    for (const t of targets) assert.ok(closed.includes(t), `${index.streets[t]?.label} is closed`);
    assert.equal(open(RAPPAM), false);
  });

  it('most of config_prod.js newxp_exits are pockets today; the open ones are the Groddle exits', () => {
    const rows = NEWXP_EXITS.map(([t]) => indexTsid(t));
    const ok = rows.filter(open);
    assert.equal(rows.length, 115);
    assert.ok(ok.length >= 1 && ok.length < 30, `${ok.length} open exits`);
    for (const t of ok) assert.match(index.streets[t].hubName, /^Groddle/);
  });

  it('the pick never lands in a pocket, for any roll', () => {
    for (let i = 0; i < 400; i += 1) {
      const exit = pickOpenExit(() => i / 400, exists, open);
      assert.ok(open(exit.tsid), `${exit.tsid} has a way out`);
      assert.notEqual(exit.tsid, RAPPAM);
    }
  });

  it('with every road shut it falls back to the starting street; unknown roads keep the source pick', () => {
    assert.deepEqual(pickOpenExit(() => 0.5, exists, () => false), { sourceTsid: '', tsid: HECHEY, x: 0, y: 0 });
    assert.equal(pickOpenExit(() => 0.64, exists, null).tsid, RAPPAM);
  });

  it('walks signposts around closed streets and through doors, but not keyed doors', () => {
    const g = { streets: { A: ['B', 'C'], B: ['H'], C: [] }, doors: { C: ['D'], D: ['H'] }, doorKeys: {} };
    assert.equal(exitLeadsHome('A', { graph: g, closed: [], start: 'H' }), true);
    assert.equal(exitLeadsHome('A', { graph: g, closed: ['B'], start: 'H' }), true, 'round by the door');
    assert.equal(exitLeadsHome('A', { graph: { ...g, doorKeys: { 'C>D': 3 } }, closed: ['B'], start: 'H' }), false);
    // A closed road into the start itself still closes it (Hechey's own roads are exempt upstream).
    assert.equal(exitLeadsHome('A', { graph: { streets: { A: ['H'] } }, closed: ['H'], start: 'H' }), false);
    assert.equal(exitLeadsHome('H', { graph: g, closed: [], start: 'H' }), true);
    assert.equal(exitLeadsHome('A', { graph: null, closed: [], start: 'H' }), false);
  });
});

/** A stub engine with the street-jobs query and a fetch for the graph. */
function stubEngine(extra = {}) {
  const engine = {
    started: true,
    mode: 'solo',
    data: {},
    toasts: [],
    entered: [],
    streetTsid: RAPPAM,
    street: { label: 'Rappam Rolls', bounds: { l: -3000, r: 3000 } },
    player: { x: 0, y: 0, vx: 0, vy: 0 },
    param: () => null,
    setData(k, v) { this.data[k] = v; },
    inScene: () => false,
    busy: () => false,
    save() {},
    snapCamera() {},
    toast(msg) { this.toasts.push(msg); },
    streetExists: exists,
    query(hook) { return hook === 'closedRoads' ? closed : null; },
    async enter(tsid) {
      this.entered.push(tsid);
      this.streetTsid = tsid;
      this.street = { label: index.streets[tsid]?.label || tsid, bounds: { l: -3000, r: 3000 } };
    },
    ...extra,
  };
  return engine;
}

describe('2-3. leaving the island, and a player already stranded', () => {
  let realFetch;
  beforeEach(() => {
    realFetch = globalThis.fetch;
    globalThis.fetch = async () => ({ json: async () => graph });
    __newxpTest.resetExits();
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
    __newxpTest.save = normalizeNewxpSave({});
    __newxpTest.rooted = false;
  });

  it('leaveIsland drops the player on an exit with a way out, unrooted, even on a roll that meant Rappam Rolls', async () => {
    const engine = stubEngine({ streetTsid: GENTLE_ISLAND.exit });
    newxpFeature.init(engine);
    __newxpTest.save = { status: 'active', stage: 'island', island: 'leaving' };
    __newxpTest.rooted = true;
    const random = Math.random;
    Math.random = () => 73.5 / 115; // Rappam Rolls' slot among the 115
    try {
      await __newxpTest.leaveIsland(engine);
    } finally {
      Math.random = random;
    }
    const s = __newxpTest.save;
    assert.equal(s.island, 'exited');
    assert.notEqual(s.exit.tsid, RAPPAM);
    assert.ok(open(s.exit.tsid));
    assert.deepEqual(engine.entered, [s.exit.tsid]);
    assert.equal(__newxpTest.rooted, false);
  });

  it('a finished player on a pocket exit street is set down on an open exit once, with a line saying why', async () => {
    const engine = stubEngine();
    newxpFeature.init(engine);
    __newxpTest.save = { status: 'done', stage: 'done', island: 'exited', exit: { tsid: RAPPAM, x: -2427 } };
    assert.equal(await __newxpTest.rescueStranded(engine), true);
    const to = __newxpTest.save.exit.tsid;
    assert.ok(open(to));
    assert.deepEqual(engine.entered, [to]);
    assert.equal(engine.data.newxpRescued, `${RAPPAM}>${to}`);
    assert.match(engine.toasts[0], /^The roads out of Rappam Rolls are still under construction, so you were set down on .+\.$/);
    assert.doesNotMatch(engine.toasts[0], /—/);
    // Arrived: nothing more to do there.
    assert.equal(await __newxpTest.rescueStranded(engine), false);
    assert.equal(engine.entered.length, 1);
  });

  it('a reload mid-finish (exited, the quest award still to come) is moved on too; an open exit street is left alone', async () => {
    const engine = stubEngine();
    newxpFeature.init(engine);
    __newxpTest.save = { status: 'active', stage: 'island', island: 'exited', exit: { tsid: RAPPAM, x: -2427 } };
    assert.equal(await __newxpTest.rescueStranded(engine), true);
    const okExit = NEWXP_EXITS.map(([t]) => indexTsid(t)).find(open);
    const there = stubEngine({ streetTsid: okExit });
    __newxpTest.save = { status: 'done', stage: 'done', island: 'exited', exit: { tsid: okExit, x: 0 } };
    assert.equal(await __newxpTest.rescueStranded(there), false);
    assert.deepEqual(there.entered, []);
  });

  it('nobody else is moved: no exit yet, another street, or roads still loading', async () => {
    const engine = stubEngine();
    newxpFeature.init(engine);
    __newxpTest.save = { status: 'active', stage: 'island', island: 'leaving' };
    assert.equal(await __newxpTest.rescueStranded(engine), false);
    __newxpTest.save = { status: 'done', stage: 'done', island: 'exited', exit: { tsid: RAPPAM, x: 0 } };
    assert.equal(await __newxpTest.rescueStranded(stubEngine({ streetTsid: HECHEY })), false);
    const loading = stubEngine({ query: () => null });
    assert.equal(await __newxpTest.rescueStranded(loading), 'unknown');
    assert.deepEqual(loading.entered, []);
  });

  it('the check runs once a street is settled, and looks again while the roads load', () => {
    const tick = feature.slice(feature.indexOf('  onTick(dtMs, now, engine) {'), feature.indexOf('    if (!active()) {\n      publish(engine, now);'));
    assert.match(tick, /save\.exit && engine\.streetTsid !== strandChecked && now >= strandRetryAt && !islandBusy && !engine\.busy\?\.\(\)/);
    assert.match(tick, /if \(res === 'unknown'\) \{ strandChecked = ''; strandRetryAt = Date\.now\(\) \+ 2000; \}/);
  });
});

describe('2. nothing of the tutorial holds the avatar on the exit street', () => {
  afterEach(() => {
    __newxpTest.save = normalizeNewxpSave({});
    __newxpTest.rooted = false;
  });

  it('physics never roots once the island is left (or the tutorial is done)', () => {
    const engine = { inScene: () => false, streetTsid: RAPPAM };
    __newxpTest.rooted = true;
    __newxpTest.save = { status: 'active', stage: 'island', island: 'exited', exit: { tsid: RAPPAM, x: 0 } };
    assert.equal(newxpFeature.physics(engine), null);
    __newxpTest.save = { status: 'done', stage: 'done', island: 'exited' };
    assert.equal(newxpFeature.physics(engine), null);
    assert.match(feature, /if \(rooted && active\(\) && save\.island !== 'exited' && \(inTutorialScene\(engine\)/);
  });

  it('leaving unroots and hides the bubble, card, words and instruction before the fade', () => {
    const leave = feature.slice(feature.indexOf('async function leaveIsland(engine) {'), feature.indexOf('let strandChecked'));
    assert.ok(leave.indexOf('unrootForExit();') < leave.indexOf('await fadeOut();'));
    const unroot = feature.slice(feature.indexOf('function unrootForExit() {'), feature.indexOf('/** player.js teleportHome: choose_one'));
    assert.match(unroot, /rooted = false;/);
    assert.match(unroot, /for \(const n of \[ui\.bubble, ui\.card, ui\.vog, ui\.instr\]\) n\.hidden = true;/);
  });
});

describe('4. autoplay past Mappery', () => {
  it('closes the Map instead of clicking Progress Way (a street click opens its menu, G356)', () => {
    const fn = feature.slice(feature.indexOf('async function revealMappery(engine, t) {'), feature.indexOf('/** The hint signs\' text'));
    assert.match(fn, /if \(auto\) \{[\s\S]*engine\.closeMap\?\.\(\);/);
    assert.doesNotMatch(fn, /dispatchEvent\(new MouseEvent\('click'/);
  });
});
