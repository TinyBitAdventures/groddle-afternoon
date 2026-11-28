/**
 * Sibling audit B8/B9 (2026-11-21): a fetch at boot that failed kept its fallback for the session.
 * - B8 street-render loadDecoManifest: the fallback (only the new zone art, NEW_DECOS) was kept,
 *   so every street was drawn nearly bare until a reload.
 * - B9 street-jobs: without the street graph every solo project took the far-out amounts (1/50,
 *   no skill drop), and the catalog was never scaled again.
 * Now a failed load is tried again on the next use, as the street index, arrivals table and the
 * street graph's own loader already were; the fallback stands for that attempt only.
 * Run: node --test tests/boot-fetch-retry.test.js
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { loadDecoManifest } from '../public/js/street-render.js?v=124facce';
import { NEW_DECOS } from '../public/js/deco-hires.js?v=34f36d77';
import { streetJobsFeature, projectApi } from '../public/js/features/street-jobs-feature.js?v=8f8c3622';
import { createToolConditionState } from '../public/js/tools.js?v=4156bba8';
import { STREET_GRAPH_URL } from '../public/js/street-graph.js?v=16013e6e';
import { Display, FakeEl, fakePixi } from './fake-scene.js';

const root = join(import.meta.dirname, '..');
const read = (rel) => readFileSync(join(root, 'public', rel), 'utf8');
const SYLVAN = '5'; // Sylvan Grove, 3 streets from the start: 1/500 solo once the distances are in
const wait = (ms = 0) => new Promise((r) => setTimeout(r, ms));

const saved = {};
let failing = new Set();
before(() => {
  for (const k of ['document', 'window', 'fetch', 'PIXI']) saved[k] = globalThis[k];
  globalThis.window = { addEventListener() {}, removeEventListener() {} };
  globalThis.document = { baseURI: 'https://groddle.localhost/', createElement: (t) => new FakeEl(t), createTextNode: (t) => ({ text: t }), head: new FakeEl('head'), body: new FakeEl('body'), getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], addEventListener() {} };
  globalThis.PIXI = fakePixi;
  globalThis.fetch = async (url) => {
    const rel = String(url).split('?')[0].replace(/^\//, '');
    if ([...failing].some((f) => rel === f)) throw new TypeError('Failed to fetch');
    return { ok: true, status: 200, json: async () => JSON.parse(read(rel)) };
  };
});
after(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete globalThis[k];
    else globalThis[k] = v;
  }
});

describe('B8 the deco manifest', () => {
  it('a failed load gives the fallback once and is tried again next time', async () => {
    failing = new Set(['assets/decos/manifest.json']);
    const first = await loadDecoManifest();
    assert.equal(first.size, new Set(NEW_DECOS).size, 'the fallback for this street');
    failing = new Set();
    const next = await loadDecoManifest();
    const full = JSON.parse(read('assets/decos/manifest.json'));
    assert.ok(next.size >= full.length, 'the next street has the whole library');
    assert.equal(await loadDecoManifest(), next, 'kept once in');
  });
});

describe('B9 street projects without the street graph', () => {
  it('solo amounts follow the distance once the graph comes in on a later load', async () => {
    failing = new Set([STREET_GRAPH_URL]);
    const engine = {
      mode: 'solo',
      started: true,
      PIXI: fakePixi,
      entityLayer: new Display(),
      fxLayer: new Display(),
      streetTsid: 'GLI2V0UN7RD1T2J',
      street: { tsid: 'GLI2V0UN7RD1T2J' },
      player: { x: 0, y: 0 },
      interactables: [],
      inv: {},
      pc: { level: 10, energy: 500, mood: 100, currants: 0 },
      learnedSkills: [],
      unlockedAchievements: [],
      toolState: createToolConditionState(),
      param: () => null,
      placement: () => [],
      query: () => null,
      register: (t) => t,
      unregister() {},
      setData() {},
      toast() {},
      save() {},
      updateHud() {},
      visitedStreets: () => [],
    };
    streetJobsFeature.init(engine);
    streetJobsFeature.restore({}, engine);
    const catalog = await projectApi.ready();
    assert.equal(catalog.jobs[SYLVAN].solo.divisor, 50, 'without the graph: the far-out amounts, for now');
    failing = new Set();
    await projectApi.ready();
    for (let i = 0; i < 100 && catalog.jobs[SYLVAN].solo.divisor === 50; i += 1) await wait(10);
    assert.equal(catalog.jobs[SYLVAN].solo.divisor, 500, 'the next load asked for the graph again');
    assert.equal(catalog.jobs[SYLVAN].hops, 3);
  });
});
