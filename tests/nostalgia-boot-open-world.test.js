/**
 * Live report 212 (2026-11-12, Friendly): "when your time runs out in ancestral lands, you get
 * sometimes placed in a region that doesn't have street projects done, and you cannot get out."
 * do_baqala_boot (GSJS players/inc_special_locations.js 199-226) picks one of 26 streets in Kajuu,
 * Andra, Tamila and Besara; every one of them is a street project, closed on a fresh world and
 * closed or in a pocket cut off by closed roads on the live world (R11, 2026-11-21). The kick now
 * picks only among the 26 the open-road rule opens for everyone (js/open-roads.js openWorld), and
 * with none open, or the roads never loaded, lands on the starter street (Hechey Track).
 *
 * 1. On a fresh world none of the 26 is open for everyone, so the kick lands on the starter street.
 * 2. openBootTarget: only open boot streets; none open or no answer gives the starter street.
 * 3. street-jobs-feature openForEveryone: the open world from the starter street, the same for every
 *    player (a road kept open for you alone does not count), and the kick asks it.
 * 4. G1075: a kick right after logging in waits for the roads; when they never come, or none of
 *    the 26 is open, it lands on the starter street (it used to take Glitch's pick, past a closed
 *    road, and landing there opened that road for you alone: js/street-jobs.js openWayHome).
 */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { streetGraph } from '../public/js/street-graph.js?v=d767f3a2';
import { closedForEveryone, freeWays, openWorld } from '../public/js/open-roads.js?v=2e03b0a6';
import { TELEPORTERS } from '../public/js/hidden-floors.js?v=023336cb';
import { WINTRY_PORTAL_TELEPORTERS } from '../public/js/wintry-portal.js?v=1437deda';
import { applyStreetIndex } from '../public/js/street-loader.js?v=10376267';
import { streetJobsFeature } from '../public/js/features/street-jobs-feature.js?v=04b17fac';
import { STARTER_LANDING, openBootTarget } from '../public/js/ancestral-nostalgia.js?v=7c972d9f';
import { NOSTALGIA_BOOT_STREETS } from '../public/js/ancestral-nostalgia-data.js?v=0adb9184';
import { FEATURES } from '../public/js/features/index.js?v=a8674e15';
import { createBuffState, applyBuff, hasBuff, removeBuff } from '../public/js/buffs.js?v=a4f7377b';

const root = join(import.meta.dirname, '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');
const json = (rel) => JSON.parse(read(rel));
const catalog = json('public/assets/content/street-jobs.json');
const index = json('public/assets/streets/index.json');
// The game's street graph (signposts and doors, locked doors marked: a new player holds no keys).
const graph = streetGraph(json('public/assets/content/signpost-graph.json'));

const BOOT = new Set(NOSTALGIA_BOOT_STREETS.map((r) => r.tsid));
// The open world for everyone on a fresh world: nothing built yet.
const fresh = openWorld(graph, { closed: closedForEveryone(catalog, {}, { starters: [index.default] }), starter: index.default, free: freeWays([...TELEPORTERS, ...WINTRY_PORTAL_TELEPORTERS]) });

describe('1. a fresh world: none of the 26 boot streets is open, so the kick lands on the starter street', () => {
  it('none of them is in the open world; the starter street is', () => {
    assert.equal(NOSTALGIA_BOOT_STREETS.length, 26);
    for (const row of NOSTALGIA_BOOT_STREETS) assert.equal(fresh.has(row.tsid), false, row.label);
    assert.ok(fresh.has(index.default));
  });

  it('the landing is Hechey Track, the starter street, at its own arrival', () => {
    assert.equal(STARTER_LANDING.tsid, index.default);
    assert.equal(STARTER_LANDING.label, index.streets[index.default].label);
    for (const streetRoll of [0, 0.5, 0.99]) assert.deepEqual(openBootTarget(NOSTALGIA_BOOT_STREETS, fresh, { streetRoll }), { tsid: index.default, label: 'Hechey Track', arrive: null });
  });
});

describe('2. openBootTarget', () => {
  const kajuu = NOSTALGIA_BOOT_STREETS.filter((r) => r.hubId === NOSTALGIA_BOOT_STREETS[0].hubId);
  const open = new Set([index.default, ...kajuu.map((r) => r.tsid)]);

  it('picks only among the boot streets that are open, at one of their arrivals', () => {
    assert.ok(kajuu.length > 0 && kajuu.length < 26);
    for (let i = 0; i < 40; i += 1) {
      const out = openBootTarget(NOSTALGIA_BOOT_STREETS, open, { streetRoll: i / 40, arrivalRoll: 0.5 });
      const row = kajuu.find((r) => r.tsid === out.tsid);
      assert.ok(row, out.tsid);
      assert.ok(row.arrivals.some(([x, y]) => x === out.arrive.x && y === out.arrive.y));
    }
  });

  it('the starter street when none is open, when the roads never loaded, or none exists', () => {
    const starter = { tsid: index.default, label: 'Hechey Track', arrive: null };
    assert.deepEqual(openBootTarget(NOSTALGIA_BOOT_STREETS, new Set([index.default])), starter);
    assert.deepEqual(openBootTarget(NOSTALGIA_BOOT_STREETS, null), starter);
    assert.deepEqual(openBootTarget(NOSTALGIA_BOOT_STREETS, open, { exists: () => false }), starter);
  });
});

describe('3. street-jobs-feature openForEveryone, and the kick asks it', () => {
  const realFetch = globalThis.fetch;
  const params = {};
  const engine = {
    started: true, mode: 'solo', streetTsid: index.default,
    questState: { active: {}, done: {} },
    param: (k) => params[k] ?? null,
    setData() {}, save() {}, updateHud() {},
  };
  let open = null;
  before(async () => {
    globalThis.fetch = async (url) => ({ ok: true, json: async () => json(`public/${String(url).split('?')[0]}`) });
    applyStreetIndex(index);
    streetJobsFeature.init(engine);
    // A player who has stood on every boot street: those roads are kept open for them alone.
    streetJobsFeature.restore({ grandfathered: [...BOOT] }, engine);
    for (let i = 0; i < 300 && !open; i += 1) {
      open = streetJobsFeature.openForEveryone(engine);
      if (!open) await new Promise((r) => setTimeout(r, 10));
    }
  });
  after(() => {
    globalThis.fetch = realFetch;
  });

  it('is the open world for everyone: the starter street, none of the 26, kept roads left out', () => {
    assert.ok(open, 'the roads loaded');
    assert.equal(streetJobsFeature.openRoadsLoaded(engine), true);
    assert.ok(open.has(index.default));
    for (const t of BOOT) assert.equal(open.has(t), false, t);
    assert.deepEqual([...open].sort(), [...fresh].sort(), 'the same as js/open-roads.js openWorld');
  });

  it('juju-bandits-feature asks it, and lands on the starter street without it (a forced QA destination stays)', () => {
    const juju = read('public/js/features/juju-bandits-feature.js');
    assert.match(juju, /engine\.query\?\.\('openForEveryone', engine\)/);
    assert.match(juju, /return openBootTarget\(NOSTALGIA_BOOT_STREETS, open, \{ exists \}\);/);
    assert.match(juju, /if \(rows\.length\) return pickBootTarget\(rows, \{ exists \}\);/);
  });
});

describe('4. a kick before the roads load waits for them (G1075), then never past a closed road', () => {
  const feature = FEATURES.find((f) => f.id === 'juju-bandits');
  const savanna = { hubId: '86', platforms: [], bounds: { l: 0, r: 3000, t: -1000, b: 0 } };
  const flush = () => new Promise((r) => setImmediate(r));

  function makeEngine(roads) {
    const buffs = createBuffState();
    const data = {};
    const engine = {
      data, buffs, travels: [], street: savanna, inv: {}, player: { x: 500, y: 0 },
      pc: { imaginationUpgrades: [] },
      questState: { active: { help_juju_bandits: {} }, completed: [] },
      param: (k) => (k === 'nostalgiademo' ? '3' : null),
      setData: (k, v) => { data[k] = String(v); },
      achievement() {}, save() {}, refreshPack() {}, pushActivity() {},
      hasBuff: (id) => hasBuff(buffs, id, Date.now()),
      applyBuff: (id) => applyBuff(buffs, id, null, Date.now()),
      removeBuff: (id) => removeBuff(buffs, id, null, Date.now()),
      buffRow: (id) => (hasBuff(buffs, id, Date.now()) ? buffs.active[id] : null),
      prompt: () => '',
      travel: async (tsid, meta) => {
        engine.travels.push({ tsid, ...meta });
        engine.street = { ...savanna, hubId: '85' };
        feature.onStreetClear(engine);
        feature.onStreetEnter(engine.street, engine);
        return { ok: true };
      },
      streetExists: () => true,
      inScene: () => false, transientInstance: () => false, questDialogueOpen: () => false, acting: () => false,
      // street-jobs-feature's answers: nothing while the roads load, then the open world for everyone.
      query: (hook) => {
        if (hook === 'openRoadsLoaded') return roads.loaded;
        if (hook === 'openForEveryone') return roads.loaded ? roads.open : null;
        return null;
      },
    };
    return engine;
  }
  const kick = async (roads, { before = 0, after = 0 } = {}) => {
    feature.restore(undefined);
    const engine = makeEngine(roads);
    feature.onStreetClear(engine);
    feature.onStreetEnter(savanna, engine);
    let now = Date.now();
    const play = (s) => { for (let i = 0; i < s; i += 1) feature.onTick(16, (now += 1000), engine); };
    play(before);
    await flush();
    const waited = engine.travels.length;
    roads.loaded = true;
    play(after);
    await flush();
    feature.restore(undefined);
    return { engine, waited };
  };

  it('waits while the roads load, then lands on an open one of the 26', async () => {
    const row = NOSTALGIA_BOOT_STREETS[3];
    const { engine, waited } = await kick({ loaded: false, open: new Set([index.default, row.tsid]) }, { before: 8, after: 4 });
    assert.equal(waited, 0, 'no kick while the roads load');
    assert.equal(engine.travels.length, 1);
    assert.equal(engine.travels[0].tsid, row.tsid);
  });

  it('lands on the starter street when none of the 26 is open', async () => {
    const { engine } = await kick({ loaded: false, open: fresh }, { before: 8, after: 4 });
    assert.equal(engine.travels.length, 1);
    assert.equal(engine.travels[0].tsid, index.default);
    assert.equal(engine.travels[0].arrive, null);
  });

  it('gives up waiting after about a minute and lands on the starter street, never Glitch\'s pick', async () => {
    const { engine } = await kick({ loaded: false, open: null }, { before: 120 });
    assert.equal(engine.travels.length, 1);
    assert.equal(engine.travels[0].tsid, index.default);
    assert.equal(BOOT.has(engine.travels[0].tsid), false);
  });
});
