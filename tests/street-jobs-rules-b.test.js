/**
 * Street project rules against Glitch (rules-b audit, 2026-11-12):
 *  - "How many?": JobDetailsUI.as 63-75, 131, 216 (QuantityPicker from 1, Max, the step's need).
 *  - Work stops only on leaving the street, "You left the location." (items/include/jobs.js 369-373),
 *    and each unit goes to the first open step for the tool (quest.js find_work 1501-1514).
 *  - The 30-minute rest holds upgrades and projects under way (locations/inc_jobs.js 457-461).
 *  - Shares to two decimals (quest.js expandText 261); the bar by base cost, "N.N% complete"
 *    (JobDialog.as 655-661); the rewards line (JobDialog.as showRewards 713-742).
 *  - A restoration counts no project badges (quest.js 1434, 1671) and one cultivation_projects_restored
 *    for its finisher (1652-1656), never for the Door.
 *  - Online, a helper of an earlier phase gets the end card (quest.js 1734-1773, players/inc_jobs.js 480-500).
 * Run: node --test tests/street-jobs-rules-b.test.js
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { projectApi, streetJobsFeature } from '../public/js/features/street-jobs-feature.js?v=caa20b5e';
import {
  findWork,
  jobRewardsText,
  jobStatus,
  normalizeStreetJobState,
  percentCompleteText,
  phaseRequirements,
  rewardWords,
  settlePhase,
  sharePercent,
  overallShare,
  phaseBaseCost,
  soloNeed,
  STREET_JOB_COOLDOWN_MS,
  workCheck,
  contributeItems,
  noWorkingToolMsg,
} from '../public/js/street-jobs.js?v=17f103d0';
import { createToolConditionState } from '../public/js/tools.js?v=4156bba8';
import { soloTerms } from '../public/js/street-jobs-solo.js?v=e6d237d8';
import { Display, FakeEl, fakePixi } from './fake-scene.js';

const root = join(import.meta.dirname, '..');
const catalog = JSON.parse(readFileSync(join(root, 'public/assets/content/street-jobs.json'), 'utf8'));
const JOB = '62'; // Build Lowland Slough, one phase
const BOARD_STREET = catalog.jobs[JOB].connecting[0];
const CLS = catalog.jobs[JOB].phases[0].classTsid;
const REQS = catalog.classes[CLS].requirements;
const GINGER = REQS.find((r) => r.classId === 'ginger');
const WORK = REQS.find((r) => r.type === 'work' && r.classId === 'hatchet');
const NOW = 1_800_000_000_000;

const fresh = () => normalizeStreetJobState({ initialized: true });
const gotBefore = (group) => {
  const got = {};
  for (const r of REQS) if (Number(r.group) < group) got[r.id] = soloNeed(r.num);
  return got;
};

describe('street project rules (pure)', () => {
  it('G1109: the whole project\'s share weighs each phase by its size', () => {
    assert.equal(sharePercent(overallShare([{ mine: 100, total: 100 }, { mine: 0, total: 100 }])), 50);
    assert.equal(sharePercent(overallShare([{ mine: 100, total: 100 }, { mine: 100, total: 300 }])), 50);
    assert.equal(sharePercent(overallShare([{ mine: 500, total: 100 }])), 100, 'never past a phase\'s total');
    assert.equal(overallShare([]), 0);
  });

  it('G1109 solo: the last phase\'s settle names the share of the whole project', () => {
    const [jobId, job] = Object.entries(catalog.jobs).find(([, j]) => j.kind === 'street' && j.phases.length === 2);
    const [p0, p1] = job.phases.map((p) => p.classTsid);
    const d = 1;
    const size = (cls) => phaseBaseCost(catalog.classes[cls], d);
    const got = {};
    for (const r of catalog.classes[p1].requirements) got[r.id] = soloNeed(r.num, d);
    const state = fresh();
    state.jobs[jobId] = { phase: 1, got, mine: { [p0]: size(p0) }, hired: {}, startedAt: NOW - 5000, readyAt: 0, doneAt: 0, option: null };
    const solo = { ...catalog, jobs: { ...catalog.jobs, [jobId]: { ...job, divisor: d, solo: undefined } } };
    const out = settlePhase(state, solo, jobId, NOW, () => 0.99);
    assert.equal(out.ok, true);
    assert.equal(out.finalPhase, true);
    assert.equal(out.participation, 0, 'the last phase alone');
    assert.equal(out.overall, sharePercent(size(p0) / (size(p0) + size(p1))));
  });

  it('the 30-minute rest holds a started street project and an upgrade too', () => {
    const state = fresh();
    state.jobs[JOB] = { phase: 0, got: {}, mine: { [CLS]: 5 }, hired: {}, startedAt: NOW - 5000, readyAt: 0, doneAt: 0, option: null };
    state.streetDone[BOARD_STREET] = NOW - 1000;
    assert.equal(jobStatus(state, catalog, JOB, NOW, { street: BOARD_STREET }).status, 'cooldown');
    assert.equal(jobStatus(state, catalog, JOB, NOW + STREET_JOB_COOLDOWN_MS, { street: BOARD_STREET }).status, 'active');
    const [upId, up] = Object.entries(catalog.jobs).find(([, j]) => j.kind === 'upgrade');
    state.streetDone[up.street] = NOW - 1000;
    assert.equal(jobStatus(state, catalog, upId, NOW, { street: up.street }).status, 'cooldown');
  });

  it('shares to two decimals, the bar in Glitch\'s words', () => {
    assert.equal(sharePercent(0.34567), 34.57);
    assert.equal(sharePercent(1), 100);
    assert.equal(percentCompleteText(0), '0% complete');
    assert.equal(percentCompleteText(1), '100% complete');
    assert.equal(percentCompleteText(0.4567), '45.7% complete');
    const state = fresh();
    const row = { phase: 0, got: {}, mine: {}, hired: {}, startedAt: 1, readyAt: 0, doneAt: 0, option: null };
    for (const r of REQS) row.got[r.id] = soloNeed(r.num);
    state.jobs[JOB] = row;
    const total = REQS.reduce((s, r) => s + soloNeed(r.num) * r.baseCost, 0);
    row.mine[CLS] = Math.round(total / 3);
    const out = settlePhase(state, catalog, JOB, NOW, () => 0.99);
    assert.equal(out.participation, Math.round((Math.round(total / 3) / total) * 10000) / 100);
  });

  it('the rewards line: all contributors split the pool, the top players get the performance rewards', () => {
    assert.equal(rewardWords([[150, 'iMG']]), '150 iMG.');
    assert.equal(rewardWords([[150, 'iMG'], [0, 'mood'], [5, 'energy']]), '150 iMG and 5 energy.');
    assert.equal(rewardWords([[1500, 'iMG'], [20, 'mood'], [null, 'Street Creation Rewards A']]), '1,500 iMG, 20 mood, and Street Creation Rewards A.');
    const job = catalog.jobs[JOB];
    const def = catalog.classes[CLS];
    const words = jobRewardsText(job, def, { giant: (g) => g, drop: (id) => catalog.drops[id]?.name || id });
    assert.match(words.all, /^All contributors will split: 600 iMG, 200 mood, 200 energy, and 10 favor with all of the giants\.$/);
    assert.match(words.top, /^The top 10 players will also get: 200 iMG, 100 mood, 50 energy, Street Creation Rewards A, and /);
    assert.equal(jobRewardsText({ ...job, kind: 'restore' }, def), null);
  });

  it('a work step you cannot do says what Glitch said', () => {
    const state = fresh();
    state.jobs[JOB] = { phase: 0, got: gotBefore(Number(WORK.group)), mine: {}, hired: {}, startedAt: 1, readyAt: 0, doneAt: 0, option: null };
    const names = { itemName: (c) => (c === 'hatchet' ? 'Hatchet' : c), skillName: (s) => s };
    assert.equal(workCheck(state, catalog, JOB, WORK.id, { inv: {}, energy: 100, ...names }, NOW).msg, "You don't have a working Hatchet.");
    assert.equal(workCheck(state, catalog, JOB, WORK.id, { inv: { hatchet: 1 }, toolOk: () => false, energy: 100, tick: true, ...names }, NOW).msg, "You don't have the necessary working tool.");
    assert.equal(contributeItems(fresh(), catalog, JOB, 'ginger', 3, {}, NOW).msg, "You don't have any.");
  });

  it('G1191: holding the kin tool a step does not take says that tool won\'t do and what the step takes', () => {
    const name = (c) => ({ pick: 'Pick', fancy_pick: 'Fancy Pick', hatchet: 'Hatchet', class_axe: 'Class Axe', shovel: 'Shovel', ace_of_spades: 'Ace of Spades', irrigator_9000: 'Irrigator 9000', watering_can: 'Watering Can' })[c] || c;
    assert.deepEqual(WORK.classIds, ['hatchet']);
    const state = fresh();
    state.jobs[JOB] = { phase: 0, got: gotBefore(Number(WORK.group)), mine: {}, hired: {}, startedAt: 1, readyAt: 0, doneAt: 0, option: null };
    assert.equal(workCheck(state, catalog, JOB, WORK.id, { inv: { class_axe: 1 }, energy: 100, itemName: name }, NOW).msg, "You don't have a working Hatchet. Your Class Axe won't do: this step takes a Hatchet.");
    assert.equal(noWorkingToolMsg(['pick'], { fancy_pick: 1 }, name), "You don't have a working Pick. Your Fancy Pick won't do: this step takes a Pick.");
    assert.equal(noWorkingToolMsg(['fancy_pick'], { pick: 1 }, name), "You don't have a working Fancy Pick. Your Pick won't do: this step takes a Fancy Pick.");
    assert.equal(noWorkingToolMsg(['irrigator_9000'], { watering_can: 1 }, name), "You don't have a working Irrigator 9000. Your Watering Can won't do: this step takes an Irrigator 9000.");
    assert.equal(noWorkingToolMsg(['pick'], {}, name), "You don't have a working Pick.", 'Glitch\'s words when there is no kin tool');
    assert.equal(noWorkingToolMsg(['pick'], { pick: 1 }, name), "You don't have a working Pick.", 'a worn-out Pick of the right kind');
    assert.equal(noWorkingToolMsg(['shovel', 'ace_of_spades'], {}, name), "You don't have a working Shovel or Ace of Spades.", 'a step that takes two names both');
    assert.equal(noWorkingToolMsg(['fancy_pick', 'pick'], { pick: 1 }, name), "You don't have a working Fancy Pick or Pick.", 'a kin the step takes is not refused');
  });

  it('find_work: the first open step for the tool, passing over a finished one', () => {
    const state = fresh();
    state.jobs[JOB] = { phase: 0, got: gotBefore(Number(WORK.group)), mine: {}, hired: {}, startedAt: 1, readyAt: 0, doneAt: 0, option: null };
    assert.equal(findWork(state, catalog, JOB, 'hatchet'), WORK.id);
    assert.equal(findWork(state, catalog, JOB, 'hatchet', WORK.id), '');
    state.jobs[JOB].got[WORK.id] = soloNeed(WORK.num);
    assert.equal(findWork(state, catalog, JOB, 'hatchet'), '');
  });

  it('a restoration adds no project-badge phase', () => {
    const state = fresh();
    const restore = { kind: 'restore', street: '', connecting: [], label: 'Pod', phases: [{ classTsid: 'job_cult_barnacle_pod_2', order: 1 }], divisor: 1 };
    const cat = { ...catalog, jobs: { ...catalog.jobs, 'home-proto-1-1': restore } };
    const res = contributeItems(state, cat, 'home-proto-1-1', 'plank', 2, { plank: 5 }, NOW);
    assert.equal(res.ok, true);
    assert.equal(res.newPhase, false);
    assert.deepEqual(state.phasesContributed, []);
    assert.ok(phaseRequirements(state, cat, 'home-proto-1-1').length > 0);
  });
});

const wait = (ms = 0) => new Promise((r) => setTimeout(r, ms));

describe('the board in play', () => {
  const saved = {};
  let engine;
  let body;
  let client;
  let prompts;
  let counters;
  let awards;

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
    prompts = [];
    counters = [];
    awards = [];
    const listeners = new Map();
    client = {
      state: 'online',
      me: { id: 1, name: 'Ada' },
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
      inv: { hatchet: 1, ginger: 7, plank: 40 },
      pc: { level: 10, energy: 500, mood: 100, currants: 0 },
      learnedSkills: [],
      unlockedAchievements: ['you_have_papers'],
      toolState: createToolConditionState(),
      param: () => null,
      placement: () => [],
      query: (hook) => (hook === 'realtimeClient' ? client : null),
      register: (t) => t,
      say() {},
      setData() {},
      toast() {},
      prompt: (p) => prompts.push(p.text),
      pushActivity() {},
      floatText() {},
      updateHud() {},
      refreshPack() {},
      playSound() {},
      award: (a) => awards.push(a),
      save() {},
      achievement: (name, n) => counters.push([name, n]),
      grantAchievement() {},
      visitedStreets: () => [BOARD_STREET],
    };
    streetJobsFeature.init(engine);
    streetJobsFeature.restore({}, engine);
    await projectApi.ready();
    // Report #425: these checks run at the far-out 1/50 amounts (Lowland Slough is 5 streets from the start).
    const far = projectApi.catalog().jobs[JOB];
    delete far.hops;
    far.solo = soloTerms(null);
  });

  after(() => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete globalThis[k];
      else globalThis[k] = v;
    }
  });

  const button = (act) => body.all().find((n) => n.dataset?.sjAct === act && !n.disabled);
  const maxOf = (act) => body.all().find((n) => n.dataset?.sjQtyMax === act && !n.disabled);
  const plusOf = (act) => body.all().filter((n) => n.dataset?.sjQty === act).flatMap((b) => b.children).find((n) => n.dataset?.sjQtyStep === '+');

  it('"How many?" starts at 1; + and Max choose more', async () => {
    const { state } = streetJobsFeature._state();
    state.jobs[JOB] = { phase: 0, got: {}, mine: {}, hired: {}, startedAt: 1, readyAt: 0, doneAt: 0, option: null };
    streetJobsFeature.onStreetEnter(engine.street, engine);
    await wait(5);
    projectApi.open(engine, JOB);
    button('give').fire('click');
    assert.equal(state.jobs[JOB].got[GINGER.id], 1, 'one by default');
    assert.equal(engine.inv.ginger, 6);
    plusOf('give').fire('click');
    button('give').fire('click');
    assert.equal(state.jobs[JOB].got[GINGER.id], 3, 'two more');
    maxOf('give').fire('click');
    button('give').fire('click');
    assert.equal(state.jobs[JOB].got[GINGER.id], 7, 'Max: everything you have, up to the need');
    assert.equal(engine.inv.ginger, 0);
  });

  it('work runs the units asked for, wherever you walk on the street, and stops when you leave it', () => {
    const { state } = streetJobsFeature._state();
    state.jobs[JOB] = { phase: 0, got: gotBefore(Number(WORK.group)), mine: {}, hired: {}, startedAt: 1, readyAt: 0, doneAt: 0, option: null };
    projectApi.open(engine, JOB);
    plusOf('work').fire('click');
    button('work').fire('click');
    const t0 = Date.now();
    engine.player.x += 2000; // Glitch: no distance check (items/include/jobs.js 369-373)
    for (let i = 1; i <= 3; i += 1) streetJobsFeature.onTick(16, t0 + i * 1500 + 5, engine);
    assert.equal(state.jobs[JOB].got[WORK.id], 2, 'two units, as asked');
    assert.equal(streetJobsFeature._state().work, null);
    projectApi.open(engine, JOB);
    button('work').fire('click');
    assert.ok(streetJobsFeature._state().work);
    streetJobsFeature.onStreetClear(engine);
    assert.equal(streetJobsFeature._state().work, null);
    assert.equal(prompts.at(-1), 'You left the location.');
  });

  it('a restoration counts one cultivation_projects_restored and no phase win; the Door counts none', async () => {
    const { state } = streetJobsFeature._state();
    const phases = [{ classTsid: 'job_cult_barnacle_pod_2', order: 1, delaySeconds: 0, label: 'Barnacle Pod' }];
    projectApi.register('home-proto-9-1', { kind: 'restore', title: 'Barnacle Pod', label: 'Barnacle Pod', phases, divisor: 1, rewardMultiplier: 1 }, { onDone: () => '' });
    const reqs = catalog.classes.job_cult_barnacle_pod_2.requirements;
    const got = {};
    for (const r of reqs) got[r.id] = r.num;
    got.r1614 = 15;
    state.jobs['home-proto-9-1'] = { phase: 0, got, mine: {}, hired: {}, startedAt: 1, readyAt: 0, doneAt: 0, option: null };
    counters.length = 0;
    projectApi.open(engine, 'home-proto-9-1');
    button('give').fire('click');
    assert.ok(state.jobs['home-proto-9-1'].doneAt, 'restored');
    assert.deepEqual(counters.filter(([n]) => n.startsWith('cultivation_projects_restored')), [['cultivation_projects_restored:home-proto-9-1', 1]]);
    assert.equal(counters.some(([n]) => n === 'job_phase_winner:count'), false);
    projectApi.unregister('home-proto-9-1', { dropRow: true });

    projectApi.register('home-door-1', { kind: 'restore', title: 'Build a New Floor', label: 'Your house', phases: [{ classTsid: 'job_proto_door', order: 1, delaySeconds: 60, label: 'Build a New Floor' }], divisor: 1, rewardMultiplier: 1 }, { onDone: () => 'Your second floor is ready.' });
    state.jobs['home-door-1'] = { phase: 0, got: { r1487: 99 }, mine: {}, hired: {}, startedAt: 1, readyAt: 0, doneAt: 0, option: null };
    counters.length = 0;
    projectApi.open(engine, 'home-door-1');
    button('give').fire('click');
    assert.ok(state.jobs['home-door-1'].doneAt, 'built');
    assert.equal(counters.some(([n]) => n.startsWith('cultivation_projects_restored')), false);
    assert.doesNotMatch(JSON.stringify(awards.at(-1)), /restoration project/);
    projectApi.unregister('home-door-1', { dropRow: true });
  });

  it('online: a helper of an earlier phase only gets the end card with each phase\'s share', async () => {
    const [jobId, job] = Object.entries(catalog.jobs).find(([, j]) => j.kind === 'street' && j.phases.length === 2);
    engine.mode = 'multiplayer';
    engine.streetTsid = job.connecting[0];
    engine.street = { tsid: job.connecting[0] };
    streetJobsFeature.restore({}, engine);
    streetJobsFeature.onStreetEnter(engine.street, engine);
    await wait(5);
    assert.ok(globalThis.groddleProjects, 'the shared board is up');
    awards.length = 0;
    const [p0, p1] = job.phases.map((p) => p.classTsid);
    client.msg({
      t: 'project_reward', id: `job-r-${jobId}-1-abc-1`, job: jobId, phase: 1, cls: p1, final: true, share: 0, participation: 0,
      rewards: { xp: 0, currants: 0, mood: 0, energy: 0, favor: [] }, performance: { xp: 0, mood: 0, energy: 0, currants: 0, items: [], favor: [] },
      winner: false, top5: false, phases: 1, option: '', readyAt: 0, count: 3, cost: 0, total: 100, finisher: false, shares: { [p0]: 34.57 }, complete: true,
    });
    await wait(5);
    const text = JSON.stringify(awards.at(-1) || {});
    assert.match(text, /You contributed 34\.57% of the work!/);
    assert.match(text, /2\. [^:]+: You did not contribute\./);
    assert.match(text, /Teleportation Script/);
  });

  // G1109 (Austin 2026-11-21): "You did {job_participation}% of the work, nice." is your share of the
  // whole project. Glitch filled it from the last phase (quest.js expandText 261), so all of phase 1
  // and none of phase 2 read 0%.
  it('online: the completion line names your share of the whole project, from the server\'s overall', async () => {
    const [jobId, job] = Object.entries(catalog.jobs).find(([, j]) => j.kind === 'street' && j.phases.length === 2);
    const [p0, p1] = job.phases.map((p) => p.classTsid);
    const reward = (id, extra) => ({
      t: 'project_reward', id, job: jobId, phase: 1, cls: p1, final: true, share: 0, participation: 0,
      rewards: { xp: 0, currants: 0, mood: 0, energy: 0, favor: [] }, performance: { xp: 0, mood: 0, energy: 0, currants: 0, items: [], favor: [] },
      winner: false, top5: false, phases: 1, option: '', readyAt: 0, count: 3, cost: 0, total: 100, finisher: false, shares: { [p0]: 100 }, complete: true,
      ...extra,
    });
    awards.length = 0;
    client.msg(reward(`job-r-${jobId}-1-g1109-1`, { overall: 50 }));
    await wait(5);
    let text = JSON.stringify(awards.at(-1) || {});
    assert.match(text, /You did 50% of the work, nice\./, 'the server\'s overall share');
    assert.doesNotMatch(text, /You did 0% of the work/);
    // An older server names no overall: weighed from each phase's share and size here.
    const size = (cls) => catalog.classes[cls].requirements.reduce((sum, r) => sum + r.num * r.baseCost, 0);
    const want = sharePercent(size(p0) / (size(p0) + size(p1)));
    awards.length = 0;
    client.msg(reward(`job-r-${jobId}-1-g1109-2`, {}));
    await wait(5);
    text = JSON.stringify(awards.at(-1) || {});
    assert.match(text, new RegExp(`You did ${String(want).replace('.', '\\.')}% of the work, nice\\.`));
  });
});
