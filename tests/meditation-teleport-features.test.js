/**
 * Feature-host hooks added for meditation and teleportation (pack verbs,
 * map cards, gravity) and the two feature modules against a fake engine.
 * Run: node --test tests/meditation-teleport-features.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createFeatureHost } from '../public/js/feature-host.js';
import { createInventory, countItem } from '../public/js/inventory.js?v=catalog-unified-3';
import { createToolConditionState } from '../public/js/tools.js?v=tools-4';
import { meditationFeature } from '../public/js/features/meditation-feature.js';
import { teleportationFeature } from '../public/js/features/teleportation-feature.js';

function fakeEngine(overrides = {}) {
  const toasts = [];
  const events = [];
  const learned = overrides.learned || [];
  return {
    toasts,
    events,
    started: true,
    pc: { energy: 80, mood: 50, xp: 0, imagination: 0 },
    inv: createInventory({ focusing_orb: 1 }),
    toolState: createToolConditionState(),
    learnedSkills: learned,
    player: { x: 500, y: 400, vx: 0, vy: 0, onGround: true, pivot: { y: 0 }, height: 96 },
    street: { label: 'Hechey Track', hubId: '56', hubName: 'Groddle Forest' },
    streetTsid: 'GLI2V0UN7RD1T2J',
    param: () => null,
    setData() {},
    toast: (msg) => toasts.push(msg),
    pushActivity() {},
    updateHud() {},
    save() {},
    achievement: (counter, amount) => events.push([counter, amount]),
    transientInstance: () => false,
    homeContext: () => ({ inHome: false }),
    streetExists: () => true,
    travelGate: overrides.travelGate || (() => ({ ok: true })),
    metabolicGate: () => ({ ok: true }),
    closeMap() {},
    acting: () => false,
    busy: () => false,
    ...overrides.extra,
  };
}

describe('feature host hooks', () => {
  const a = {
    id: 'a',
    packVerbs: (cls) => (cls === 'x' ? [{ id: 'go', label: 'Go' }] : null),
    runPackVerb: (cls, verb) => cls === 'x' && verb === 'go',
    physics: () => ({ gravity: 0.85 }),
    mapCards: () => ['card-a'],
  };
  const b = { id: 'b', physics: () => ({ speed: 2 }), packVerbs: () => [{ id: 'other', label: 'Other' }] };
  const host = createFeatureHost([a, b]);

  it('collects pack verbs tagged with the owning feature', () => {
    assert.deepEqual(host.packVerbs('x', {}), [
      { id: 'go', label: 'Go', featureId: 'a' },
      { id: 'other', label: 'Other', featureId: 'b' },
    ]);
    assert.deepEqual(host.packVerbs('y', {}).map((v) => v.featureId), ['b']);
  });

  it('routes a pack verb to its feature', () => {
    assert.equal(host.runPackVerb('x', 'go', {}, 'a'), true);
    assert.equal(host.runPackVerb('x', 'go', {}, 'b'), false);
    assert.equal(host.runPackVerb('x', 'go', {}), true);
  });

  it('folds gravity with speed and jump', () => {
    assert.deepEqual(host.physics({}), { speed: 2, jump: 1, gravity: 0.85 });
  });

  it('collects map cards', () => {
    assert.deepEqual(host.collect('mapCards', {}), ['card-a']);
  });
});

describe('meditation feature', () => {
  it('offers only Meditate (disabled) without Meditative Arts', () => {
    const engine = fakeEngine();
    meditationFeature.restore({});
    const verbs = meditationFeature.packVerbs('focusing_orb', engine);
    assert.deepEqual(verbs.map((v) => [v.id, v.enabled]), [['meditate', false]]);
    assert.equal(meditationFeature.packVerbs('apple', engine), null);
  });

  it('lists learned orb verbs and answers radiate with the source reason', () => {
    const engine = fakeEngine({ learned: ['meditativearts_2', 'focused_meditation_1', 'transcendental_radiation_1'] });
    meditationFeature.restore({});
    const verbs = meditationFeature.packVerbs('focusing_orb', engine);
    assert.deepEqual(verbs.map((v) => v.id), ['focus_energy', 'focus_mood', 'radiate', 'meditate']);
    assert.equal(verbs.find((v) => v.id === 'radiate').enabled, false);
    assert.equal(meditationFeature.runPackVerb('focusing_orb', 'radiate', engine), true);
    assert.deepEqual(engine.toasts, ["There's nobody near enough for you to radiate."]);
  });
});

describe('teleportation feature', () => {
  it('shows no map card without the skill', () => {
    teleportationFeature.restore({});
    assert.deepEqual(teleportationFeature.mapCards(fakeEngine()), []);
  });

  it('asks the host travel gate before a script jump (Hell / Pooped)', () => {
    teleportationFeature.restore({
      scripts: [{ id: 'tps1', destination: { tsid: 'GOTHER', x: 1, y: 2, label: 'Elsewhere' } }],
    });
    const engine = fakeEngine({
      learned: ['teleportation_1'],
      travelGate: () => ({ ok: false, msg: 'You are too Pooped to teleport. Eat something first!' }),
    });
    engine.inv = createInventory({ teleportation_script: 1 });
    assert.equal(teleportationFeature.runPackVerb('teleportation_script', 'use:tps1', engine), true);
    assert.deepEqual(engine.toasts, ['You are too Pooped to teleport. Eat something first!']);
    assert.equal(countItem(engine.inv, 'teleportation_script'), 1);
    assert.equal(engine.pc.energy, 80);
  });

  it('hides Create Teleportation Script on Paper before Teleportation IV', () => {
    teleportationFeature.restore({});
    const engine = fakeEngine({ learned: ['teleportation_1'] });
    assert.equal(teleportationFeature.packVerbs('paper', engine), null);
    const t4 = fakeEngine({ learned: ['teleportation_1', 'teleportation_4', 'penmanship_1'] });
    const verbs = teleportationFeature.packVerbs('paper', t4);
    assert.equal(verbs[0].id, 'create_script');
    assert.equal(verbs[0].enabled, false);
    assert.equal(verbs[0].reason, "You'll need a Quill first.");
  });
});
