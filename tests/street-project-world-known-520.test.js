/**
 * #520: online, a street's Street Spirit said "Project available" for an instant and then nothing,
 * for everyone entering. The save keeps no shared project rows (street-jobs-mp.js sharedSlice) and
 * the board starts empty on load, so until the server's first project_world every project read
 * open: a resting or built project showed its bubble for one round trip, a spirit-less street put
 * up a Job Board the server's state never took down, and the roads you arrived past were opened
 * (noteArrival, keepWayHome) from that empty state.
 *
 * Glitch drew a giver's bubble only on the server's job_status (items/street_spirit.js 578-600; a
 * resting street sent none, locations/inc_jobs.js 463-467). Now, online, nothing reads the projects
 * until the first project_world, and the arrival runs then. Solo is unchanged.
 * Run: node --test tests/street-project-world-known-520.test.js
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { streetJobsFeature, projectApi } from '../public/js/features/street-jobs-feature.js?v=d7491112';
import { createToolConditionState } from '../public/js/tools.js?v=4156bba8';
import { Display, FakeEl, fakePixi } from './fake-scene.js';

const root = join(import.meta.dirname, '..');
const read = (rel) => readFileSync(join(root, 'public', rel), 'utf8');
const catalog = JSON.parse(read('assets/content/street-jobs.json'));
const ecology = JSON.parse(read('assets/content/street-ecology.json')).streets;
const wait = (ms = 0) => new Promise((r) => setTimeout(r, ms));

// A street with a spirit offering one street project (as in street-job-giver.test.js).
const SPIRIT_STREET = Object.keys(catalog.byStreet).find((t) => {
  const ids = catalog.byStreet[t];
  const job = catalog.jobs[ids[0]];
  return ids.length === 1 && ecology[t]?.counts?.street_spirit > 0 && job?.kind === 'street' && job.phases.length > 1;
});
const SPIRIT_JOB = catalog.byStreet[SPIRIT_STREET][0];
// A street with no spirit in the archive whose only projects are street projects: the Job Board's.
const BARE_STREET = Object.keys(catalog.byStreet).find((t) => !(ecology[t]?.counts?.street_spirit > 0)
  && catalog.byStreet[t].length === 1 && catalog.jobs[catalog.byStreet[t][0]]?.kind === 'street');
const BARE_JOB = catalog.byStreet[BARE_STREET][0];
// The new street a project builds: closed until it is built (not one off the starter street, which stands).
const START = JSON.parse(read('assets/streets/index.json')).default;
const NEW_JOB = Object.keys(catalog.jobs).find((id) => {
  const j = catalog.jobs[id];
  return j.kind === 'street' && j.street && !j.builtFromStart && !j.connecting.includes(START);
});
const NEW_STREET = catalog.jobs[NEW_JOB].street;

describe('#520 online, the projects wait for the server\'s first word', () => {
  const saved = {};
  let engine;
  let data;
  let client;
  const spirit = { classId: 'street_spirit_groddle', label: 'Street Spirit', state: { vendorKey: 'groceries' }, sprite: null };

  before(async () => {
    for (const k of ['document', 'window', 'fetch', 'PIXI', 'groddleProjects']) saved[k] = globalThis[k];
    globalThis.window = { addEventListener() {}, removeEventListener() {} };
    const body = new FakeEl('body');
    globalThis.document = { baseURI: 'https://groddle.localhost/', createElement: (t) => new FakeEl(t), createTextNode: (t) => ({ text: t }), head: new FakeEl('head'), body, getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], addEventListener() {} };
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
      sent: [],
      on(type, fn) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(fn); return () => listeners.get(type).delete(fn); },
      msg(m) { for (const fn of listeners.get(`msg:${m.t}`) || []) fn(m); },
      send(t, payload = {}) { client.sent.push({ t, ...payload }); return true; },
    };
    data = {};
    spirit.sprite = new Display();
    engine = {
      mode: 'multiplayer',
      started: true,
      PIXI: fakePixi,
      entityLayer: new Display(),
      fxLayer: new Display(),
      streetTsid: SPIRIT_STREET,
      street: { tsid: SPIRIT_STREET },
      player: { x: 500, y: 800 },
      interactables: [spirit],
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
      say() {},
      setData: (k, v) => { data[k] = v; },
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

  /** A fresh login: the save loaded (no shared rows, the world unknown), then the street entered. */
  const login = async (tsid, here = []) => {
    streetJobsFeature.onStreetClear(engine);
    streetJobsFeature.restore({}, engine);
    for (const k of Object.keys(data)) delete data[k];
    engine.streetTsid = tsid;
    engine.street = { tsid };
    engine.interactables = here;
    streetJobsFeature.onStreetEnter(engine.street, engine);
    await wait(10);
  };
  const world = (m = {}) => client.msg({ t: 'project_world', now: Date.now(), built: {}, rest: {}, ...m });

  it('a resting street\'s spirit shows no "Project available" before or after the answer', async () => {
    await login(SPIRIT_STREET, [spirit]);
    streetJobsFeature.onTick(16, Date.now(), engine);
    let st = streetJobsFeature._state();
    assert.equal(st.giver, false, 'no giver before project_world');
    assert.equal(st.bubble.spirit, '');
    assert.ok(!engine.fxLayer.children.some((c) => c.label === 'job-indicator-spirit' && !c.destroyed), 'no bubble drawn');
    assert.equal(data.streetJobGiver || '', '');
    // The street just built a project: it rests (the server's rest, keyed by the offering street).
    const offering = catalog.jobs[SPIRIT_JOB].connecting[0];
    world({ rest: { [offering]: Date.now() - 60_000 } });
    streetJobsFeature.onTick(16, Date.now(), engine);
    st = streetJobsFeature._state();
    assert.notEqual(st.bubble.spirit, 'Project available', 'resting: never "Project available"');
  });

  it('ours: a resting street\'s spirit counts down, then asks the server and offers the project', async () => {
    await login(SPIRIT_STREET, [spirit]);
    streetJobsFeature.onTick(16, Date.now(), engine);
    assert.equal(streetJobsFeature._state().bubble.spirit, '', 'no countdown before the first project_world');
    const offering = catalog.jobs[SPIRIT_JOB].connecting[0];
    world({ rest: { [offering]: Date.now() - 60_000 } });
    streetJobsFeature.onTick(16, Date.now(), engine);
    let st = streetJobsFeature._state();
    assert.equal(st.giver, true);
    assert.equal(st.bubble.spirit, 'Opens in 29 min', 'the Featured line\'s words and minutes');
    assert.equal(data.streetJobStatus, 'cooldown');
    assert.ok(!st.bubble.spirit.includes('\u2014'), 'no em dash');
    // Still resting, with a minute and a half left.
    st.state.streetDone[offering] = Date.now() - 30 * 60_000 + 90_000;
    streetJobsFeature.onTick(16, Date.now(), engine);
    assert.equal(streetJobsFeature._state().bubble.spirit, 'Opens in 2 min');
    // The rest runs out while you stand there: the server is asked again, and the project is offered.
    const asked = client.sent.filter((m) => m.t === 'project_sync').length;
    st.state.streetDone[offering] = Date.now() - 30 * 60_000 - 1;
    streetJobsFeature.onTick(16, Date.now(), engine);
    assert.equal(client.sent.filter((m) => m.t === 'project_sync').length, asked + 1, 'project_sync once');
    assert.equal(streetJobsFeature._state().bubble.spirit, 'Project available');
    streetJobsFeature.onTick(16, Date.now(), engine);
    assert.equal(client.sent.filter((m) => m.t === 'project_sync').length, asked + 1, 'and only once');
    // The server's answer still says it rests (a newer build): the countdown is back.
    world({ rest: { [offering]: Date.now() - 1000 } });
    streetJobsFeature.onTick(16, Date.now(), engine);
    assert.equal(streetJobsFeature._state().bubble.spirit, 'Opens in 30 min');
  });

  it('an open project\'s bubble comes with the answer', async () => {
    await login(SPIRIT_STREET, [spirit]);
    assert.equal(streetJobsFeature._state().giver, false);
    world();
    streetJobsFeature.onTick(16, Date.now(), engine);
    const st = streetJobsFeature._state();
    assert.equal(st.giver, true);
    assert.equal(st.bubble.spirit, 'Project available');
    assert.equal(data.streetJobGiver, 'spirit');
  });

  it('no Job Board before the answer, none when the server says the project is built', async () => {
    await login(BARE_STREET, []);
    assert.equal(streetJobsFeature._state().board, false, 'no board from the empty state');
    world({ built: { [BARE_JOB]: { at: Date.now() - 3_600_000, option: '' } } });
    assert.equal(streetJobsFeature._state().board, false, 'built: still none');
  });

  it('a Job Board up comes down when the server says it is built', async () => {
    await login(BARE_STREET, []);
    world();
    assert.equal(streetJobsFeature._state().board, true, 'open: the board stands');
    const sign = engine.entityLayer.children.at(-1);
    client.msg({ t: 'project_built', now: Date.now(), job: BARE_JOB, at: Date.now(), option: '', rest: {} });
    assert.equal(streetJobsFeature._state().board, false, 'taken down on refresh');
    assert.equal(sign.destroyed, true, 'its sign is gone from the street');
    assert.equal(data.streetJobGiver, '');
  });

  it('the roads you arrived past open only from the server\'s state (noteArrival, keepWayHome)', async () => {
    await login(NEW_STREET, []);
    await wait(40);
    const { state } = streetJobsFeature._state();
    assert.equal(state.grandfathered.includes(NEW_STREET), false, 'nothing opened from the empty state');
    assert.equal(data.streetJobWayHome, undefined, 'keepWayHome waits too');
    // The server: the project that builds this street is built, so its road is open for everyone.
    world({ built: { [NEW_JOB]: { at: Date.now() - 3_600_000, option: '' } } });
    await wait(40);
    assert.equal(state.grandfathered.includes(NEW_STREET), false, 'built in the world: not kept as yours');
    assert.equal(typeof data.streetJobWayHome, 'string', 'keepWayHome ran after the answer');
  });

  it('a street not built in the world still opens for the one standing on it, after the answer', async () => {
    await login(NEW_STREET, []);
    const { state } = streetJobsFeature._state();
    assert.equal(state.grandfathered.includes(NEW_STREET), false);
    world();
    assert.equal(streetJobsFeature._state().state.grandfathered.includes(NEW_STREET), true, 'ticket 50 still holds');
  });

  it('solo is unchanged: the giver and its bubble at once', async () => {
    engine.mode = 'solo';
    await login(SPIRIT_STREET, [spirit]);
    streetJobsFeature.onTick(16, Date.now(), engine);
    const st = streetJobsFeature._state();
    assert.equal(st.giver, true);
    assert.equal(st.bubble.spirit, 'Project available');
    engine.mode = 'multiplayer';
  });
});
