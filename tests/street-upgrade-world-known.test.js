/**
 * Sibling audit B1/B5 (2026-11-21): online, a street another player had upgraded was built from
 * the archived ecology after a login or reload (the old shrine Giant, no upgrade animals, rocks or
 * flowers) and stayed so until you left. The save holds no shared rows (street-jobs-mp.js
 * sharedSlice); the built upgrade comes with project_world, after the boot street is built, and
 * nothing built the street again. The roads' reach answers (questReach, walkReach) answered from
 * the same empty state, as if every world-built street were closed.
 *
 * Now the upgrade and the reach answers are unknown until the first project_world, and when the
 * world's word changes the upgrade where you stand, the street is built again once, in place (no
 * loading card). Glitch reloaded every player on an upgraded street, not only its finisher
 * (locations/inc_upgrades.js upgrades_move_players 729-739).
 * Run: node --test tests/street-upgrade-world-known.test.js
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { streetJobsFeature, projectApi } from '../public/js/features/street-jobs-feature.js?v=9e4bb0f7';
import { createToolConditionState } from '../public/js/tools.js?v=4156bba8';
import { Display, FakeEl, fakePixi } from './fake-scene.js';

const root = join(import.meta.dirname, '..');
const read = (rel) => readFileSync(join(root, 'public', rel), 'utf8');
const catalog = JSON.parse(read('assets/content/street-jobs.json'));
const wait = (ms = 0) => new Promise((r) => setTimeout(r, ms));

// A street with an upgrade project, and the upgrade's second option (not the default first).
const UP_JOB = Object.keys(catalog.jobs).find((id) => catalog.jobs[id].kind === 'upgrade' && catalog.upgrades?.[catalog.jobs[id].street]?.options?.length > 1);
const UP_STREET = catalog.jobs[UP_JOB].street;
const OPTION = catalog.upgrades[UP_STREET].options[1];

describe('B1 online, a street\'s upgrade waits for the world and builds the street again', () => {
  const saved = {};
  let engine;
  let client;
  const entered = [];

  before(async () => {
    for (const k of ['document', 'window', 'fetch', 'PIXI']) saved[k] = globalThis[k];
    globalThis.window = { addEventListener() {}, removeEventListener() {} };
    globalThis.document = { baseURI: 'https://groddle.localhost/', createElement: (t) => new FakeEl(t), createTextNode: (t) => ({ text: t }), head: new FakeEl('head'), body: new FakeEl('body'), getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], addEventListener() {} };
    globalThis.PIXI = fakePixi;
    globalThis.fetch = async (url) => {
      const rel = String(url).split('?')[0].replace(/^\//, '');
      try {
        return { ok: true, status: 200, json: async () => JSON.parse(read(rel)) };
      } catch {
        return { ok: false, status: 404, json: async () => null };
      }
    };
    const listeners = new Map();
    client = {
      state: 'online',
      me: { id: 1, name: 'Bo' },
      on(type, fn) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(fn); return () => listeners.get(type).delete(fn); },
      msg(m) { for (const fn of listeners.get(`msg:${m.t}`) || []) fn(m); },
      send() { return true; },
    };
    engine = {
      mode: 'multiplayer',
      started: true,
      PIXI: fakePixi,
      entityLayer: new Display(),
      fxLayer: new Display(),
      streetTsid: UP_STREET,
      street: { tsid: UP_STREET },
      player: { x: 640, y: 800 },
      interactables: [],
      inv: {},
      pc: { level: 10, energy: 500, mood: 100, currants: 0 },
      learnedSkills: [],
      unlockedAchievements: ['you_have_papers'],
      toolState: createToolConditionState(),
      param: () => null,
      placement: () => [],
      query: (hook) => (hook === 'realtimeClient' ? client : null),
      register: (t) => t,
      unregister: (t) => t.sprite?.destroy?.({ children: true }),
      busy: () => false,
      enter: (tsid, opts) => entered.push({ tsid, ...opts }),
      say() {},
      setData() {},
      toast() {},
      prompt() {},
      pushActivity() {},
      floatText() {},
      updateHud() {},
      refreshPack() {},
      save() {},
      achievement() {},
      grantAchievement() {},
      visitedStreets: () => [],
    };
    streetJobsFeature.init(engine);
    streetJobsFeature.restore({}, engine);
    await projectApi.ready();
  });

  after(() => {
    streetJobsFeature.onStreetClear(engine);
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete globalThis[k];
      else globalThis[k] = v;
    }
  });

  /** enterStreet: the ecology asked for the street's data object, then the features' arrival. */
  const enterStreet = async (tsid) => {
    streetJobsFeature.onStreetClear(engine);
    engine.streetTsid = tsid;
    const data = { tsid };
    engine.street = data;
    const ecology = streetJobsFeature.ecologyOverride(data, engine);
    streetJobsFeature.onStreetEnter(data, engine);
    await wait(10);
    return ecology;
  };
  /** A fresh login: the save loaded (no shared rows, the world unknown), then the boot street built. */
  const login = async (tsid) => {
    streetJobsFeature.restore({}, engine);
    entered.length = 0;
    return enterStreet(tsid);
  };
  const world = (m = {}) => client.msg({ t: 'project_world', now: Date.now(), built: {}, rest: {}, ...m });
  const builtUpgrade = () => ({ [UP_JOB]: { at: Date.now() - 3_600_000, option: OPTION.id } });
  const tick = () => streetJobsFeature.onTick(16, Date.now(), engine);

  it('before project_world the upgrade and the reach are unknown; after it, the street is built again once, in place', async () => {
    const ecology = await login(UP_STREET);
    assert.equal(ecology, null, 'the archived row while the world is unknown');
    assert.equal(streetJobsFeature.streetsReachable(engine), null, 'reach unknown before the world');
    assert.equal(streetJobsFeature.streetsWalkable(UP_STREET, engine), null, 'walk reach unknown before the world');
    assert.equal(streetJobsFeature.roadsKnown(engine), false);
    tick();
    assert.equal(entered.length, 0, 'nothing to build again yet');

    world({ built: builtUpgrade() });
    await wait(10);
    assert.equal(streetJobsFeature.roadsKnown(engine), true);
    assert.ok(streetJobsFeature.streetsReachable(engine), 'reach answers after the world');
    const now = streetJobsFeature.ecologyOverride({ tsid: UP_STREET }, engine);
    assert.ok(now, 'the upgraded row once the world says so');
    tick();
    assert.equal(entered.length, 1, 'the street is built again');
    assert.equal(entered[0].tsid, UP_STREET);
    assert.equal(entered[0].spawnX, 640, 'where you stand');
    assert.equal(entered[0].useTransition, false, 'no loading card');
    assert.equal(entered[0].quiet, true, 'no arrival line');
    tick();
    world({ built: builtUpgrade() });
    tick();
    assert.equal(entered.length, 1, 'once only');

    // The rebuild: the street is now built with the upgrade, and the next world message changes nothing.
    assert.ok(await enterStreet(UP_STREET), 'built upgraded');
    world({ built: builtUpgrade() });
    tick();
    assert.equal(entered.length, 1, 'built right: no second rebuild');
  });

  it('a street with no upgrade in the world is not built again', async () => {
    await login(UP_STREET);
    world();
    await wait(10);
    tick();
    assert.equal(entered.length, 0);
  });

  it('someone else finishes the upgrade while you stand there: built again for you too', async () => {
    await login(UP_STREET);
    world();
    await wait(10);
    tick();
    assert.equal(entered.length, 0);
    client.msg({ t: 'project_built', now: Date.now(), job: UP_JOB, at: Date.now(), option: OPTION.id, rest: {} });
    tick();
    assert.equal(entered.length, 1, 'project_built on your street rebuilds it');
  });

  it('another street\'s upgrade leaves yours alone', async () => {
    const other = Object.keys(catalog.byStreet).find((t) => t !== UP_STREET);
    await login(other);
    world({ built: builtUpgrade() });
    await wait(10);
    tick();
    assert.equal(entered.length, 0);
  });
});
