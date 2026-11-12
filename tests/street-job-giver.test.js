/**
 * Gaps 3 and 4 (research/street-projects-audit-2026-11-11.md): the Street Spirit gives a street's
 * projects, and Glitch's clickable bubble over the giver says "Project available", "34.9% / of
 * phase 1 complete" or "20 mins / until next phase".
 *
 * Source: glitch-GameServerJS items/street_spirit.js talk_to 279-315 (sort_on 53, tooltip "See
 * what's up with this spirit", hasJobs -> offerJobs), onPlayerCollision 547, items/include/jobs.js
 * canOffer 101-106, quests/quest.js 1012 (perc); glitch-client port/JobManager.as 100-138,
 * port/JobActionIndicatorView.as onTimerTick 69-90, util/StringUtil.as formatTime 177-225.
 * Run: node --test tests/street-job-giver.test.js
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { streetJobsFeature, projectApi } from '../public/js/features/street-jobs-feature.js?v=0e0ca46b';
import { streetSpiritsFeature } from '../public/js/features/street-spirits-feature.js?v=066f9287';
import { soloNeed } from '../public/js/street-jobs.js?v=94f8d250';
import { createToolConditionState } from '../public/js/tools.js?v=5f482998';
import {
  JOB_INDICATOR_TEXT,
  flipAlpha,
  formatTime,
  jobIndicatorView,
  jobPerc,
} from '../public/js/job-indicator.js?v=05498227';
import { Display, FakeEl, fakePixi } from './fake-scene.js';

const root = join(import.meta.dirname, '..');
const audit = join(root, '..');
const read = (rel) => readFileSync(join(root, 'public', rel), 'utf8');
const catalog = JSON.parse(read('assets/content/street-jobs.json'));
const ecology = JSON.parse(read('assets/content/street-ecology.json')).streets;
const wait = (ms = 0) => new Promise((r) => setTimeout(r, ms));

describe('the bubble over a project giver (gap 4)', () => {
  it('StringUtil.formatTime, without seconds as the countdown asks', () => {
    assert.equal(formatTime(1200, false), '20 mins');
    assert.equal(formatTime(1199, false), '19 mins');
    assert.equal(formatTime(61, false), '1 min');
    assert.equal(formatTime(3600, false), '1 hour');
    assert.equal(formatTime(3660, false), '1 hour 1 min');
    assert.equal(formatTime(7320, false), '2 hours 2 mins');
    assert.equal(formatTime(330), '5 mins 30 secs', 'its default keeps the seconds');
    assert.equal(formatTime(61), '1 min 1 sec');
    assert.equal(formatTime(9 * 3600 + 120, false), '9 hours', 'past 8 hours only the hours');
    assert.equal(formatTime(3 * 86400 + 60, false), '3 days');
  });

  it('perc is the phase by base cost, rounded down to 3 places (quest.js 1012)', () => {
    assert.equal(jobPerc([{ need: 10, got: 5, baseCost: 1 }, { need: 10, got: 0, baseCost: 3 }]), 0.125);
    assert.equal(jobPerc([{ need: 1000, got: 349, baseCost: 2 }]), 0.349);
    assert.equal(jobPerc([{ need: 3, got: 1, baseCost: 1 }]), 0.333);
    assert.equal(jobPerc([]), 0);
  });

  it('reads "Project available", the percent of a phase, or the wait (JobManager.as 100-125)', () => {
    const now = 1_000_000;
    assert.deepEqual(jobIndicatorView({ status: 'open', phase: 0 }, { phases: 3, perc: 0, now }).main, ['Project available']);
    const pr = jobIndicatorView({ status: 'active', phase: 0 }, { phases: 3, perc: 0.349, now });
    assert.deepEqual(pr.main, ['34.9%', 'of phase 1 complete']);
    assert.equal(pr.alt, 'Project available', 'flips with "Project available"');
    assert.equal(pr.percent, 0.349);
    assert.equal(pr.clickable, true);
    assert.deepEqual(jobIndicatorView({ status: 'active', phase: 1 }, { phases: 3, perc: 0.5, now }).main, ['50.0%', 'of phase 2 complete']);
    assert.deepEqual(jobIndicatorView({ status: 'active', phase: 0 }, { phases: 1, perc: 0.2, now }).main, ['20.0%', 'complete'], 'one phase: no "of phase N"');
    const wait = jobIndicatorView({ status: 'delayed', phase: 1, until: now + 1200 * 1000 }, { phases: 3, perc: 0, now });
    assert.deepEqual(wait.main, ['20 mins', 'until next phase']);
    assert.equal(wait.clickable, false, 'a click asks for the job only when no countdown runs (JobManager.as 178)');
    assert.deepEqual(jobIndicatorView({ status: 'delayed', phase: 1, until: now + 30 * 1000 }, { now }).main, ['Less than 1 min', 'until next phase']);
    assert.deepEqual(jobIndicatorView({ status: 'delayed', phase: 1, until: now - 1 }, { now }).main, ['Project available'], 'at 0 it is available again');
    for (const status of ['done', 'built', 'cooldown']) assert.equal(jobIndicatorView({ status, phase: 0 }, { now }), null, `${status}: no bubble`);
  });

  it('flips its faces as flipNext did: hold 3 s, fade half a second', () => {
    assert.equal(flipAlpha(0), 0);
    assert.equal(flipAlpha(2999), 0);
    assert.equal(flipAlpha(3250), 0.5);
    assert.equal(flipAlpha(5000), 1);
    assert.equal(flipAlpha(7250), 0.5);
    assert.equal(flipAlpha(7900), 0);
    assert.equal(flipAlpha(8000 + 5000), 1);
  });

  it('words with no em-dash', () => {
    for (const v of Object.values(JOB_INDICATOR_TEXT)) assert.ok(!String(typeof v === 'function' ? v(1) : v).includes('—'));
  });

  it('matches the client source where it is here', { skip: !existsSync(join(audit, 'glitch-client')) }, () => {
    const port = join(audit, 'glitch-client/com/tinyspeck/engine/port');
    const jaiv = readFileSync(join(port, 'JobActionIndicatorView.as'), 'utf8');
    const jm = readFileSync(join(port, 'JobManager.as'), 'utf8');
    assert.ok(jaiv.includes("time_left = 'Less than 1 min'"));
    assert.ok(jaiv.includes("'<br><span class=\"quest_bubble_complete\">until next phase</span>'"));
    assert.ok(jaiv.includes('StringUtil.formatTime(current_available_time, false)'));
    assert.ok(jm.includes("(status_job_info.perc*100).toFixed(1)+'%</span>'"));
    assert.ok(jm.includes("'of phase '+(status_job_info.getCurrentPhaseIndex()+1)+' '"));
    assert.ok(jm.includes("indicator.msg = 'Project available'"));
  });
});

describe('the Street Spirit gives the project (gap 3)', () => {
  const saved = {};
  let engine;
  let data;
  let body;
  // A street whose archived location has a spirit and which offers one street project of several
  // phases (Firdaus Finds, Build Gaare Grims In Andra, as the data stands).
  const STREET = Object.keys(catalog.byStreet).find((t) => {
    const ids = catalog.byStreet[t];
    const job = catalog.jobs[ids[0]];
    return ids.length === 1 && ecology[t]?.counts?.street_spirit > 0 && job?.kind === 'street' && job.phases.length > 1;
  });
  const JOB = catalog.byStreet[STREET][0];
  const spirit = { classId: 'street_spirit_groddle', label: 'Street Spirit', state: { vendorKey: 'groceries' }, sprite: null };

  before(async () => {
    for (const k of ['document', 'window', 'fetch', 'PIXI']) saved[k] = globalThis[k];
    globalThis.window = { addEventListener() {}, removeEventListener() {} };
    body = new FakeEl('body');
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
    data = {};
    spirit.sprite = new Display();
    engine = {
      mode: 'solo',
      started: true,
      PIXI: fakePixi,
      entityLayer: new Display(),
      fxLayer: new Display(),
      streetTsid: STREET,
      street: { tsid: STREET },
      player: { x: 500, y: 800 },
      interactables: [spirit],
      inv: {},
      pc: { level: 10, energy: 500, mood: 100, currants: 0 },
      learnedSkills: [],
      unlockedAchievements: ['you_have_papers'],
      toolState: createToolConditionState(),
      param: () => null,
      placement: () => [],
      query: () => null,
      register: (t) => t,
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
      visitedStreets: () => [STREET],
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

  const enter = async (tsid, here = [spirit]) => {
    streetJobsFeature.onStreetClear(engine);
    engine.streetTsid = tsid;
    engine.street = { tsid };
    engine.interactables = here;
    streetJobsFeature.onStreetEnter(engine.street, engine);
    await wait(5);
  };

  it('a street with a spirit has no board: the spirit carries the bubble', async () => {
    await enter(STREET);
    const st = streetJobsFeature._state();
    assert.equal(st.board, false, 'no Job Board');
    assert.equal(st.giver, true);
    assert.equal(st.bubble.spirit, 'Project available');
    assert.equal(data.streetJobGiver, 'spirit');
    assert.equal(data.streetJobBoard, JOB);
    const bubble = engine.fxLayer.children.find((c) => c.label === 'job-indicator-spirit');
    assert.ok(bubble, 'drawn on the fx layer over the spirit');
  });

  it('talk to keeps its place after Browse goods (and reminisce), with the source tooltip', () => {
    const verbs = [
      { id: 'browse', label: 'browse goods', sort: 10 },
      { id: 'reminisce', label: 'reminisce', sort: 15 },
      { id: 'talk_to', label: 'talk to', sort: 20, tooltip: 'Exchange pleasantries' },
    ];
    const out = streetJobsFeature.decorateVerbs(spirit, verbs, engine);
    assert.deepEqual(out.map((v) => v.id), ['browse', 'reminisce', 'talk_to'], 'Browse goods stays first');
    assert.equal(out[2].tooltip, "See what's up with this spirit");
    assert.equal(streetJobsFeature.decorateVerbs({ classId: 'npc_shrine_x' }, verbs, engine), null, 'other targets untouched');
  });

  it('talk to opens the project, and no conversation is offered meanwhile', () => {
    assert.equal(streetJobsFeature.spiritHasJobs(spirit, engine), true);
    assert.equal(streetJobsFeature.spiritOfferJobs(spirit, engine), true);
    streetJobsFeature.onTick(16, Date.now(), engine);
    assert.equal(data.streetJobPanel, JOB, 'the project panel opened');
    // street-spirits-feature asks first, before its conversations (street_spirit.js 309-315).
    const asked = [];
    const eng = { query: (hook) => (asked.push(hook), hook === 'spiritOfferJobs' ? true : null) };
    assert.equal(streetSpiritsFeature.runVerbOverride(spirit, 'talk_to', eng), true);
    assert.ok(asked.includes('spiritOfferJobs'));
    const src = read('js/features/street-spirits-feature.js');
    assert.ok(src.includes("engine.query?.('spiritHasJobs', t, engine) === true"), 'tickOffer holds the conversation');
  });

  it('the bubble follows the phase: percent, then the wait between phases', async () => {
    const { state } = streetJobsFeature._state();
    const cls = catalog.jobs[JOB].phases[0].classTsid;
    const reqs = catalog.classes[cls].requirements;
    const r = reqs[0];
    state.jobs[JOB] = { phase: 0, got: { [r.id]: 1 }, mine: {}, hired: {}, startedAt: 1, readyAt: 0, doneAt: 0, option: null };
    streetJobsFeature.onTick(16, Date.now(), engine);
    const reqRows = reqs.map((q) => ({ need: soloNeed(q.num), got: q.id === r.id ? 1 : 0, baseCost: q.baseCost }));
    const pct = `${(jobPerc(reqRows) * 100).toFixed(1)}%`;
    const phases = catalog.jobs[JOB].phases.length;
    assert.equal(phases > 1, true);
    assert.equal(streetJobsFeature._state().bubble.spirit, `${pct} of phase 1 complete`);
    state.jobs[JOB].readyAt = Date.now() + 1200 * 1000;
    streetJobsFeature.onTick(16, Date.now(), engine);
    assert.equal(streetJobsFeature._state().bubble.spirit, '20 mins until next phase');
    assert.equal(streetJobsFeature.spiritHasJobs(spirit, engine), null, 'resting: talk to is the spirit\'s own (jobs.js hasJobs)');
    assert.equal(streetJobsFeature.spiritOfferJobs(spirit, engine), null);
    delete state.jobs[JOB];
  });

  it('a street with no spirit in the archive keeps the Job Board, with the same bubble', async () => {
    const bare = Object.keys(catalog.byStreet).find((t) => !(ecology[t]?.counts?.street_spirit > 0) && catalog.byStreet[t].some((id) => catalog.jobs[id]?.kind === 'street'));
    assert.ok(bare, 'some project street has no spirit (Baqala and others)');
    await enter(bare, []);
    const st = streetJobsFeature._state();
    assert.equal(st.board, true);
    assert.equal(st.giver, false);
    assert.equal(st.bubble.board, 'Project available');
    assert.equal(data.streetJobGiver, 'board');
  });

  it('the data: which project streets have a spirit to give from', () => {
    let spirited = 0;
    const bare = [];
    for (const tsid of Object.keys(catalog.byStreet)) {
      if (ecology[tsid]?.counts?.street_spirit > 0) spirited += 1;
      else bare.push(tsid);
    }
    assert.ok(spirited > bare.length, 'most project streets have their spirit');
    assert.ok(bare.includes('GA5157TDPC42IGK'), 'Plains Rte C (Baqala) has none in its location XML');
  });
});
