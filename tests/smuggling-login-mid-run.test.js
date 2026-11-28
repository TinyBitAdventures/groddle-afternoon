/**
 * Sibling audit B3 (2026-11-21): log in online in the middle of a Warm and Smuggly run, and the
 * run's destination was moved off a street that is open. The run is checked on arrival and every
 * 2 s (steerRun), and before the world's first project_world street projects read every
 * world-built street as closed (the save holds no shared rows); the redirect was saved and said
 * so in the log, and the Map route moved with it. Now, online, the roads count as unknown until
 * project_world (street-jobs roadsKnown) and the run stands until then.
 * Run: node --test tests/smuggling-login-mid-run.test.js
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { CONTRABAND, SMUGGLING_QUEST } from '../public/js/smuggling.js?v=2fde7da3';
import { applyStreetIndex } from '../public/js/street-loader.js?v=10376267';
import { streetJobsFeature, projectApi } from '../public/js/features/street-jobs-feature.js?v=baeda249';
import { smugglingFeature } from '../public/js/features/smuggling-feature.js?v=7174ea7a';
import { createInventory, addItem } from '../public/js/inventory.js?v=3be7988a';

const PUB = join(import.meta.dirname, '..', 'public');
const read = (rel) => readFileSync(join(PUB, rel), 'utf8');
const catalog = JSON.parse(read('assets/content/street-jobs.json'));
const EAST_SPICE = 'LM413SQ6LRN58';
const SOGGY_BOTTOMS = 'LTJ11KEKAKO196V';
const wait = (ms = 0) => new Promise((r) => setTimeout(r, ms));

describe('B3 online, a run is not steered before the world says which roads are built', () => {
  const saved = {};
  const activity = [];
  const routes = [];
  let saves = 0;
  let client;
  let game;

  before(async () => {
    for (const k of ['document', 'window', 'fetch']) saved[k] = globalThis[k];
    globalThis.window = { addEventListener() {}, removeEventListener() {} };
    globalThis.document = { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], createElement: () => ({ style: {}, append() {}, addEventListener() {}, setAttribute() {}, classList: { add() {}, remove() {}, toggle() {} } }), head: { append() {} }, body: { append() {} } };
    globalThis.fetch = async (url) => ({ ok: true, json: async () => JSON.parse(read(String(url).split('?')[0])) });
    applyStreetIndex(JSON.parse(read('assets/streets/index.json')));
    const listeners = new Map();
    client = {
      state: 'connecting',
      me: { id: 1, name: 'Bo' },
      on(type, fn) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(fn); return () => listeners.get(type).delete(fn); },
      msg(m) { for (const fn of listeners.get(`msg:${m.t}`) || []) fn(m); },
      send() { return true; },
    };
    const inv = createInventory();
    addItem(inv, CONTRABAND, 1);
    game = {
      mode: 'multiplayer',
      streetTsid: `G${EAST_SPICE.slice(1)}`,
      street: { tsid: `G${EAST_SPICE.slice(1)}` },
      questState: { active: { [SMUGGLING_QUEST]: { progress: {} } }, done: {} },
      inv,
      player: { x: 0, y: 0, onGround: true },
      unlockedAchievements: ['you_have_papers'],
      param: () => null,
      setData() {},
      save: () => { saves += 1; },
      updateHud() {},
      toast() {},
      pushActivity: (t) => activity.push(t),
      visitedStreets: () => [],
      query: (hook, ...args) => {
        if (hook === 'realtimeClient') return client;
        if (hook === 'mapRoute') {
          if (args[0] === 'get') return { source: 'smuggling', path: null };
          routes.push(args[1]);
          return null;
        }
        return typeof streetJobsFeature[hook] === 'function' ? streetJobsFeature[hook](...args) : null;
      },
    };
    streetJobsFeature.init(game);
    streetJobsFeature.restore({}, game);
    await projectApi.ready();
    // The street graph in, as a login some seconds after boot has it.
    for (let i = 0; i < 300 && !streetJobsFeature.openRoadsLoaded(); i += 1) await wait(10);
  });
  after(() => {
    smugglingFeature._reset();
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete globalThis[k];
      else globalThis[k] = v;
    }
  });

  it('the run to a street the world built stands through the wait, and after the answer', async () => {
    smugglingFeature._reset();
    smugglingFeature.restore({ run: { from: EAST_SPICE, destination: SOGGY_BOTTOMS, startedAt: 1 } });
    streetJobsFeature.onStreetEnter(game.street, game);
    await wait(10);
    saves = 0; // street projects' own first-visit save
    smugglingFeature.onStreetEnter(game.street, game);
    smugglingFeature.onTick(16, Date.now(), game);
    smugglingFeature.onTick(16, Date.now() + 2500, game);
    assert.equal(streetJobsFeature.roadsKnown(), false, 'the world unknown yet');
    assert.equal(smugglingFeature._state().state.run.destination, SOGGY_BOTTOMS, 'no redirect before project_world');
    assert.equal(activity.length, 0, 'no "Change of plans" line');
    assert.equal(routes.length, 0, 'the Map route stands');
    assert.equal(saves, 0, 'no redirect saved');

    // The world: every street project built, so every road is open, Soggy Bottoms' with them.
    client.state = 'online';
    const built = {};
    for (const [id, job] of Object.entries(catalog.jobs)) if (job.kind === 'street') built[id] = { at: Date.now() - 3_600_000, option: '' };
    client.msg({ t: 'project_world', now: Date.now(), built, rest: {} });
    await wait(10);
    assert.equal(streetJobsFeature.roadsKnown(), true);
    smugglingFeature.onTick(16, Date.now() + 5000, game);
    smugglingFeature.onTick(16, Date.now() + 7500, game);
    assert.equal(smugglingFeature._state().state.run.destination, SOGGY_BOTTOMS, 'open: it stays');
    assert.equal(activity.length, 0);
  });
});
