/**
 * Gap 2 of the street projects audit (research/street-projects-audit-2026-11-11.md): other players'
 * tool bubbles while they work on a street project. Glitch sent each worker's pc_overlay (the tool's
 * tool_animation in a bubble) to everyone else on the street (items/include/jobs.js startJobWork
 * 293-307, apiSendAnnouncementX(anncx, pc)) and took it down the same way (cancelJobWork 435-438);
 * the tool's sound was the worker's alone (pc.announce_sound, jobs.js 308).
 *
 * Online, the game tells the realtime server once when a run of work starts and once when it stops
 * (groddle-afternoon-server projects_crew.go), never once a unit, and draws a bubble over each remote
 * worker the server names (project_working, project_workers). This runs the real feature on a fake
 * Pixi and page against a fake realtime client.
 * Run: node --test tests/street-project-crew-bubbles.test.js
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { projectApi, streetJobsFeature } from '../public/js/features/street-jobs-feature.js?v=3af822e3';
import { soloNeed } from '../public/js/street-jobs.js?v=94f8d250';
import { createToolConditionState } from '../public/js/tools.js?v=5f482998';
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

/** Every requirement before the work's group full; the work three units short. */
function gotThreeShort() {
  const got = {};
  for (const r of REQS) if (Number(r.group) < Number(WORK.group)) got[r.id] = soloNeed(r.num);
  got[WORK.id] = NEED - 3;
  return got;
}

const wait = (ms = 0) => new Promise((r) => setTimeout(r, ms));

describe('street project work: the other workers\' tool bubbles (gap 2)', () => {
  const saved = {};
  let engine;
  let client;
  let body;
  let data;
  let remotes;
  const emit = (type, payload) => { for (const fn of client.listeners.get(type) || []) fn(payload); };
  const crewSprites = () => engine.fxLayer.children.filter((c) => c.label === 'job-crew-tool' && !c.destroyed);
  const sent = (t) => client.sent.filter((m) => m.t === t);
  const remote = (id, x, y) => {
    const r = new Display();
    r.x = x;
    r.y = y;
    remotes.set(id, { id, root: r });
    return r;
  };

  before(async () => {
    for (const k of ['document', 'window', 'fetch', 'groddleProjects', 'groddleRealtime', 'PIXI']) saved[k] = globalThis[k];
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
    remotes = new Map();
    globalThis.groddleRealtime = { remotes };
    data = {};
    const listeners = new Map();
    client = {
      state: 'online',
      me: { id: 1, name: 'Bo' },
      sent: [],
      listeners,
      on(type, fn) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(fn); return () => listeners.get(type).delete(fn); },
      msg(m) { for (const fn of listeners.get(`msg:${m.t}`) || []) fn(m); },
      send(t, payload = {}) { client.sent.push({ t, ...payload }); return true; },
    };
    engine = {
      mode: 'multiplayer',
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
      unlockedAchievements: ['you_have_papers'],
      toolState: createToolConditionState(),
      param: () => null,
      placement: () => [],
      query: (hook) => (hook === 'realtimeClient' ? client : null),
      register: (t) => t,
      say() {},
      setData(k, v) { data[k] = v; },
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
    streetJobsFeature.onStreetEnter(engine.street, engine);
    await wait(5);
    assert.ok(globalThis.groddleProjects, 'the shared board is up');
  });

  after(() => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete globalThis[k];
      else globalThis[k] = v;
    }
  });

  it('your run of work: one start with the tool, one stop, nothing a unit', async () => {
    const row = { phase: 0, got: gotThreeShort(), held: {}, mine: {}, started: Date.now() - 60_000, ready: 0, done: 0, top: [], count: 1 };
    client.msg({ t: 'project_street', street: BOARD_STREET, now: Date.now(), jobs: { [JOB]: row } });
    streetJobsFeature.onStreetEnter(engine.street, engine);
    await wait(5);
    projectApi.open(engine, JOB);
    body.all().find((n) => n.dataset?.sjAct === 'work' && !n.disabled).fire('click');
    assert.ok(streetJobsFeature._state().work?.mp, 'shared work');
    assert.deepEqual(sent('project_work_start'), [{ t: 'project_work_start', job: JOB, req: WORK.id, tool: 'hatchet' }]);
    const t0 = Date.now();
    for (let i = 1; i <= 3; i += 1) {
      streetJobsFeature.onTick(16, t0 + i * UNIT_MS + 5, engine);
      client.msg({ t: 'project_worked', job: JOB, req: WORK.id, cost: WORK.baseCost, left: 3 - i });
      if (i < 3) assert.equal(sent('project_work_stop').length, 0, `still working after unit ${i}`);
    }
    assert.equal(sent('project_work').length, 3, 'three units');
    assert.equal(sent('project_work_start').length, 1, 'one start for the run');
    assert.equal(streetJobsFeature._state().work, null, 'the work stopped');
    assert.equal(sent('project_work_stop').length, 1, 'one stop');
  });

  it('a remote worker\'s bubble rides over its avatar and comes down with the stop', () => {
    const ada = remote(2, 300, 820);
    client.msg({ t: 'project_working', id: 2, tool: 'hatchet' });
    client.msg({ t: 'project_working', id: 1, tool: 'hatchet' }); // yourself: your own bubble is drawn already
    client.msg({ t: 'project_working', id: 5, tool: 'rubber_duck' }); // not a tool any work asks for
    streetJobsFeature.onTick(16, Date.now(), engine);
    assert.equal(data.jobCrewTools, '2:hatchet');
    let sprites = crewSprites();
    assert.equal(sprites.length, 1, 'one bubble');
    assert.equal(sprites[0].x, 300);
    assert.equal(sprites[0].y, 820 - 186, 'over the name plate');
    ada.x = 340;
    streetJobsFeature.onTick(16, Date.now(), engine);
    assert.equal(crewSprites()[0].x, 340, 'it follows the avatar');
    assert.equal(crewSprites().length, 1, 'not drawn again each frame');
    client.msg({ t: 'project_working', id: 2, tool: '' });
    streetJobsFeature.onTick(16, Date.now(), engine);
    assert.equal(crewSprites().length, 0, 'down with the stop');
    assert.equal(data.jobCrewTools, '');
  });

  it('arriving: the workers already there; one whose avatar comes later; the roster drops who left', () => {
    remote(3, 600, 820);
    client.msg({ t: 'project_workers', list: [{ id: 3, tool: 'shovel' }, { id: 4, tool: 'watering_can' }] });
    streetJobsFeature.onTick(16, Date.now(), engine);
    assert.equal(data.jobCrewTools, '3:shovel,4:watering_can');
    assert.equal(crewSprites().length, 1, 'only an avatar on the street gets a bubble');
    remote(4, 700, 820);
    streetJobsFeature.onTick(16, Date.now(), engine);
    assert.equal(crewSprites().length, 2, 'the late avatar gets its bubble');
    emit('roster', { street: BOARD_STREET, players: [{ id: 3 }] });
    streetJobsFeature.onTick(16, Date.now(), engine);
    assert.equal(data.jobCrewTools, '3:shovel');
    assert.equal(crewSprites().length, 1, 'gone with the player');
    streetJobsFeature.onStreetClear(engine);
    assert.equal(crewSprites().length, 0, 'the bubbles go with the street');
    emit('roster', { street: 'GOTHER', players: [] });
    assert.equal(data.jobCrewTools, '');
  });
});
