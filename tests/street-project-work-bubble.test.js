/**
 * Player report 111 (Dr Flavius, 2026-11-06): "there were 2 units of work that needed to be done,
 * but the bubble says I did 2 of 3. If you look at the project again after the speech bubble it
 * shows the task completed."
 *
 * The board's thank-you (stopWork) read what was left from the board's own copy. Online the
 * server answers project_worked before it sends the row (groddle-afternoon-server projects.go
 * 993 then 996), so the copy had not counted the last unit yet: 2 units plus the 1 the copy still
 * showed. Glitch counted the unit before it spoke (items/include/jobs.js 453). The bubble now
 * takes what is left from the server's project_worked (online) and from applyWorkUnit (solo).
 *
 * This runs the real feature (the board, the Work button, the work loop) on a fake Pixi and page,
 * solo and then online against a fake realtime client.
 * Run: node --test tests/street-project-work-bubble.test.js
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { projectApi, streetJobsFeature } from '../public/js/features/street-jobs-feature.js?v=25e52041';
import { soloNeed } from '../public/js/street-jobs.js?v=02a81cb3';
import { createToolConditionState } from '../public/js/tools.js?v=d8aa3536';
import { Display, FakeEl, fakePixi } from './fake-scene.js';

const root = join(import.meta.dirname, '..');
const catalog = JSON.parse(readFileSync(join(root, 'public/assets/content/street-jobs.json'), 'utf8'));
const JOB = '62'; // Build Lowland Slough, from GLI57DI72HI153U: one phase
const BOARD_STREET = catalog.jobs[JOB].connecting[0];
const CLS = catalog.jobs[JOB].phases[0].classTsid;
const REQS = catalog.classes[CLS].requirements;
const WORK = REQS.find((r) => r.type === 'work' && r.classId === 'hatchet');
const NEED = soloNeed(WORK.num);
const UNIT_MS = 1500;

/** Every requirement before the work's group full; the work two units short. */
function gotTwoShort() {
  const got = {};
  for (const r of REQS) if (Number(r.group) < Number(WORK.group)) got[r.id] = soloNeed(r.num);
  got[WORK.id] = NEED - 2;
  return got;
}

const wait = (ms = 0) => new Promise((r) => setTimeout(r, ms));

describe('the street project\'s work bubble counts the last unit (report 111)', () => {
  const saved = {};
  let engine;
  let said;
  let client;
  let body;

  before(async () => {
    for (const k of ['document', 'window', 'fetch', 'groddleProjects', 'PIXI']) saved[k] = globalThis[k];
    globalThis.window = { addEventListener() {}, removeEventListener() {} };
    body = new FakeEl('body');
    globalThis.document = { baseURI: 'https://groddle.localhost/', createElement: (t) => new FakeEl(t), createTextNode: (t) => ({ text: t }), head: new FakeEl('head'), body, getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], addEventListener() {} };
    globalThis.PIXI = fakePixi;
    globalThis.fetch = async (url) => {
      const rel = String(url).split('?')[0].replace(/^\//, '');
      try {
        return { ok: true, status: 200, json: async () => JSON.parse(readFileSync(join(root, 'public', rel), 'utf8')) };
      } catch {
        return { ok: false, status: 404, json: async () => null };
      }
    };
    said = [];
    const listeners = new Map();
    client = {
      state: 'online',
      me: { id: 1, name: 'Bo' },
      sent: [],
      on(type, fn) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(fn); return () => listeners.get(type).delete(fn); },
      msg(m) { for (const fn of listeners.get(`msg:${m.t}`) || []) fn(m); },
      send(t, payload = {}) { client.sent.push({ t, ...payload }); return true; },
    };
    engine = {
      mode: 'solo',
      started: true,
      PIXI: fakePixi,
      entityLayer: new Display(),
      fxLayer: new Display(),
      streetTsid: BOARD_STREET,
      street: { tsid: BOARD_STREET },
      player: { x: 500, y: 800 },
      inv: { hatchet: 1 },
      pc: { level: 10, energy: 500, mood: 100, currants: 0 },
      learnedSkills: [],
      toolState: createToolConditionState(),
      param: () => null,
      placement: () => [],
      query: (hook) => (hook === 'realtimeClient' ? client : null),
      register: (t) => t,
      say: (target, text) => said.push(text),
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
      visitedStreets: () => [BOARD_STREET],
    };
    streetJobsFeature.init(engine);
    streetJobsFeature.restore({}, engine);
    await projectApi.ready();
  });

  after(() => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete globalThis[k];
      else globalThis[k] = v;
    }
  });

  const workButton = () => body.all().find((n) => n.dataset?.sjAct === 'work' && !n.disabled);
  const bubble = () => said.find((t) => t.startsWith('Thanks! You contributed'));

  it('solo: two units of the two needed', async () => {
    const { state } = streetJobsFeature._state();
    state.jobs[JOB] = { phase: 0, got: gotTwoShort(), mine: {}, hired: {}, startedAt: 1, readyAt: 0, doneAt: 0, option: null };
    streetJobsFeature.onStreetEnter(engine.street, engine);
    await wait(5);
    assert.ok(streetJobsFeature._state().board, 'the board stands on the street');
    projectApi.open(engine, JOB);
    workButton().fire('click');
    assert.ok(streetJobsFeature._state().work, 'working');
    const t0 = Date.now();
    for (let i = 1; i <= 2; i += 1) streetJobsFeature.onTick(16, t0 + i * UNIT_MS + 5, engine);
    assert.equal(streetJobsFeature._state().work, null, 'the work stops when the need is met');
    assert.match(bubble(), /^Thanks! You contributed 2 units of the 2 we need right now\./);
    streetJobsFeature.onStreetClear(engine);
  });

  it('online: the server\'s count, though its row comes after the answer', async () => {
    said.length = 0;
    engine.mode = 'multiplayer';
    streetJobsFeature.restore({}, engine);
    streetJobsFeature.onStreetEnter(engine.street, engine);
    await wait(5);
    assert.ok(globalThis.groddleProjects, 'the shared board is up');
    // The street's row from the server: the work two units short.
    const row = { phase: 0, got: gotTwoShort(), held: {}, mine: {}, started: Date.now() - 60_000, ready: 0, done: 0, top: [], count: 1 };
    client.msg({ t: 'project_street', street: BOARD_STREET, now: Date.now(), jobs: { [JOB]: row } });
    streetJobsFeature.onStreetEnter(engine.street, engine);
    await wait(5);
    assert.ok(streetJobsFeature._state().board, 'the board stands on the street');
    projectApi.open(engine, JOB);
    workButton().fire('click');
    assert.ok(streetJobsFeature._state().work?.mp, 'shared work');
    const t0 = Date.now();
    for (let i = 1; i <= 2; i += 1) {
      streetJobsFeature.onTick(16, t0 + i * UNIT_MS + 5, engine);
      const sent = client.sent.filter((m) => m.t === 'project_work');
      assert.equal(sent.length, i, `unit ${i} sent`);
      // projects.go: project_worked first (left after this unit), then the row.
      client.msg({ t: 'project_worked', job: sent.at(-1).job, req: WORK.id, cost: WORK.baseCost, left: 2 - i });
      if (i < 2) client.msg({ t: 'project_state', job: sent.at(-1).job, now: Date.now(), row: { ...row, got: { ...row.got, [WORK.id]: NEED - 2 + i } } });
    }
    assert.equal(streetJobsFeature._state().work, null, 'the work stops at the server\'s 0 left');
    assert.match(bubble(), /^Thanks! You contributed 2 units of the 2 we need right now\./, 'not "of the 3"');
  });
});
