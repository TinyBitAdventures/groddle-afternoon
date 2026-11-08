/**
 * G405: a home garden tells its owner when a plot dries or a crop is ready.
 * include/garden.js stateChanged 989-1049, notifyOwner 1060-1075; players/inc_prompts.js.
 * Run: node --test tests/garden-notices.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GARDEN_WATER_MS, SEED_CATALOG, createGarden, tickGarden } from '../public/js/garden.js?v=7bf205c7';
import {
  GARDEN_CROP_LINE,
  GARDEN_DRY_LINE,
  GARDEN_NOTICE_GAP_MS,
  GARDEN_NOTICE_TIMEOUT,
  gardenNoticeLines,
  noticeAllowed,
  plotMarks,
} from '../public/js/garden-notices.js?v=dc26dd82';
import { gardenNoticesFeature } from '../public/js/features/garden-notices-feature.js?v=9404cf18';
import { homesFeature } from '../public/js/features/homes-feature.js?v=4ca0070e';

const T0 = 1_000_000;

function bed(state, extra = {}) {
  const garden = createGarden({ cols: 2, rows: 1, now: T0 });
  Object.assign(garden.plots['1-1'], { state, seed: state === 'clean' ? null : 'seed_spinach', wet: true, wetAt: T0, stageStartedAt: T0, growthMs: 0, growModifier: 1 }, extra);
  return garden;
}

describe('G405 the lines', () => {
  it('a wet seeds or shoots plot going dry says so', () => {
    for (const state of ['seeds', 'shoots']) {
      const garden = bed(state, { seed: 'seed_potato', growthMs: 0 });
      const before = plotMarks(garden);
      // Keep it from growing past its stage: dry it right at the end of the watering.
      garden.plots['1-1'].stageStartedAt = T0 + GARDEN_WATER_MS;
      tickGarden(garden, T0 + GARDEN_WATER_MS);
      assert.equal(garden.plots['1-1'].wet, false);
      assert.deepEqual(gardenNoticeLines(before, plotMarks(garden)), [GARDEN_DRY_LINE]);
    }
  });

  it('an empty, picked or ripe plot going dry says nothing (stateChanged checks seeds and shoots)', () => {
    for (const state of ['clean', 'dirty', 'crop']) {
      const garden = bed(state);
      const before = plotMarks(garden);
      tickGarden(garden, T0 + GARDEN_WATER_MS);
      assert.equal(garden.plots['1-1'].wet, false, state);
      assert.deepEqual(gardenNoticeLines(before, plotMarks(garden)), [], state);
    }
  });

  it('shoots becoming a crop says so; seeds becoming shoots does not', () => {
    const garden = bed('seeds');
    const seed = SEED_CATALOG.seed_spinach;
    let before = plotMarks(garden);
    tickGarden(garden, T0 + seed.grow1Ms);
    assert.equal(garden.plots['1-1'].state, 'shoots');
    assert.deepEqual(gardenNoticeLines(before, plotMarks(garden)), []);
    before = plotMarks(garden);
    tickGarden(garden, T0 + seed.grow1Ms + seed.grow2Ms);
    assert.equal(garden.plots['1-1'].state, 'crop');
    assert.deepEqual(gardenNoticeLines(before, plotMarks(garden)), [GARDEN_CROP_LINE]);
  });

  it('a garden or plot seen for the first time says nothing (a load)', () => {
    const garden = bed('crop', { wet: false });
    assert.deepEqual(gardenNoticeLines(undefined, plotMarks(garden)), []);
    assert.deepEqual(gardenNoticeLines({}, plotMarks(garden)), []);
  });

  it('hand work is no notice: picking, clearing, planting, watering', () => {
    const marks = (state, wet) => ({ '1-1': { state, wet } });
    assert.deepEqual(gardenNoticeLines(marks('crop', true), marks('dirty', true)), []);
    assert.deepEqual(gardenNoticeLines(marks('dirty', false), marks('clean', false)), []);
    assert.deepEqual(gardenNoticeLines(marks('clean', true), marks('seeds', true)), []);
    assert.deepEqual(gardenNoticeLines(marks('seeds', false), marks('seeds', true)), []);
  });

  it('one prompt for each garden in 10 minutes (notifyOwner 1063)', () => {
    const g = {};
    assert.equal(noticeAllowed(g, T0), true);
    g.lastNoticeAt = T0;
    assert.equal(noticeAllowed(g, T0 + GARDEN_NOTICE_GAP_MS - 1), false);
    assert.equal(noticeAllowed(g, T0 + GARDEN_NOTICE_GAP_MS), true);
    assert.equal(noticeAllowed({}, T0 + 1), true, 'the next garden has its own');
    assert.equal(GARDEN_NOTICE_TIMEOUT, 10);
    assert.equal(GARDEN_NOTICE_GAP_MS, 600000);
  });

  it('the words are the source words, without an em-dash', () => {
    assert.equal(GARDEN_DRY_LINE, 'One of your garden plots has gone dry.');
    assert.equal(GARDEN_CROP_LINE, 'One of your garden crops is ready for picking.');
  });
});

describe('G405 the feature', () => {
  let frame = 100000;
  function run(gardens, { drawn = [], clock = T0 } = {}) {
    const realState = homesFeature._state;
    const prompts = [];
    let now = clock;
    const engine = {
      started: true,
      interactables: drawn.map((garden) => ({ classId: 'garden_new', state: { garden } })),
      prompt: (p) => prompts.push(p),
      setData() {},
      save() {},
      param: () => null,
    };
    homesFeature._state = () => ({ cult: { gardens }, backCult: { gardens: {} } });
    const realNow = Date.now;
    Date.now = () => now;
    const step = (at) => {
      now = at;
      frame += 2000;
      gardenNoticesFeature.onTick(16, frame, engine);
    };
    return { prompts, step, done() { homesFeature._state = realState; Date.now = realNow; } };
  }

  it('says nothing on the first look, then once as the bed goes on, away from it', () => {
    const potato = SEED_CATALOG.seed_potato;
    const a = bed('shoots', { seed: 'seed_potato' });
    Object.assign(a.plots['2-1'], { state: 'shoots', seed: 'seed_potato', wet: true, wetAt: T0, stageStartedAt: T0, growthMs: 0, growModifier: 1 });
    const h = run({ 7: a });
    try {
      h.step(T0);
      assert.equal(h.prompts.length, 0, 'a load says nothing');
      h.step(T0 + potato.grow2Ms);
      assert.equal(a.plots['1-1'].state, 'crop', 'grown with nobody there');
      assert.deepEqual(h.prompts.map((p) => p.text), [GARDEN_CROP_LINE], 'two plots, one prompt');
      assert.equal(h.prompts[0].timeout, 10);
      assert.deepEqual(h.prompts[0].choices, [{ value: 'ok', label: 'ok' }]);
    } finally {
      h.done();
    }
  });

  it('a load after the time away says nothing about it', () => {
    const potato = SEED_CATALOG.seed_potato;
    const a = bed('shoots', { seed: 'seed_potato' });
    const h = run({ 8: a });
    try {
      h.step(T0 + 10 * potato.grow2Ms);
      assert.equal(h.prompts.length, 0);
      h.step(T0 + 10 * potato.grow2Ms + 1000);
      assert.equal(h.prompts.length, 0);
    } finally {
      h.done();
    }
  });

  it('holds the next one for 10 minutes, then says it; the mark is on the garden, so a reload keeps it', () => {
    const potato = SEED_CATALOG.seed_potato;
    const a = bed('shoots', { seed: 'seed_potato' });
    const b = a.plots['2-1'];
    const h = run({ 9: a });
    try {
      h.step(T0);
      h.step(T0 + potato.grow2Ms);
      assert.equal(h.prompts.length, 1);
      assert.equal(a.lastNoticeAt, T0 + potato.grow2Ms);
      // A second plot ripens inside the 10 minutes.
      Object.assign(b, { state: 'shoots', seed: 'seed_potato', wet: true, wetAt: T0 + potato.grow2Ms, stageStartedAt: T0 + potato.grow2Ms, growthMs: 0, growModifier: 1 });
      h.step(T0 + potato.grow2Ms + 1000);
      h.step(T0 + 2 * potato.grow2Ms);
      assert.equal(b.state, 'crop');
      assert.equal(h.prompts.length, 1, 'quiet for 10 minutes');
      // Another plot after the 10 minutes.
      const later = T0 + potato.grow2Ms + GARDEN_NOTICE_GAP_MS;
      Object.assign(b, { state: 'shoots', wetAt: later - 1000, stageStartedAt: later - 1000 });
      h.step(later - 1000);
      h.step(later - 1000 + potato.grow2Ms);
      assert.equal(h.prompts.length, 2);
    } finally {
      h.done();
    }
  });

  it('a bed drawn here is left to game.js to grow, so its redraw still sees the change', () => {
    const a = bed('shoots', { seed: 'seed_potato' });
    const h = run({ 10: a }, { drawn: [a] });
    try {
      h.step(T0);
      h.step(T0 + SEED_CATALOG.seed_potato.grow2Ms);
      assert.equal(a.plots['1-1'].state, 'shoots', 'not grown here');
      // tickAllGardens grows it; the next look sees it.
      tickGarden(a, T0 + SEED_CATALOG.seed_potato.grow2Ms);
      assert.equal(a.plots['1-1'].state, 'crop');
      h.step(T0 + SEED_CATALOG.seed_potato.grow2Ms + 1000);
      assert.deepEqual(h.prompts.map((p) => p.text), [GARDEN_CROP_LINE]);
    } finally {
      h.done();
    }
  });

  it('only looks at the owner\'s own gardens', () => {
    const src = readFileSync(new URL('../public/js/features/garden-notices-feature.js', import.meta.url), 'utf8');
    assert.match(src, /st\?\.cult\?\.gardens/);
    assert.match(src, /st\?\.backCult\?\.gardens/);
    assert.doesNotMatch(src, /streetWorldState|streetSlot/);
  });
});
