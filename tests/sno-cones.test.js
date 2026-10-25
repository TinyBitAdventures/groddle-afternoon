/**
 * G136 Sno Cones (js/sno-cones.js, js/features/sno-cones-feature.js):
 * sno_cone_base's own Eat (iMG, a level gate, brain freeze from the fourth
 * cone of the day), the dropped cone's Bemoan and melt, and no plain food use.
 * Run: node --test tests/sno-cones.test.js
 */
import { before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  SNO_CONES,
  SNO_CONE_MELT_MS,
  SNO_CONE_TEXT,
  bemoanSnoCone,
  eatSnoCone,
  snoConeEatButton,
  snoConeMelted,
} from '../public/js/sno-cones.js?v=g300-1';
import { BEMOAN_VERB, snoConesFeature } from '../public/js/features/sno-cones-feature.js';
import {
  applyAchievementProgress,
  createAchievementState,
  seedAchievementNearCompletion,
} from '../public/js/achievements.js?v=badge-events-1';
import { getGameDayKey } from '../public/js/game-day.js?v=dametime-3';
import { loadContentCatalogsFromDir } from '../public/js/content-catalogs.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const GSJS = join(root, '../glitch-GameServerJS/items');

before(async () => {
  await loadContentCatalogsFromDir(join(root, 'public/assets/content'));
});

function classProp(file, key) {
  const m = readFileSync(join(GSJS, file), 'utf8').match(new RegExp(`"${key}"\\s*:\\s*"(\\d+)"`));
  return Number(m[1]);
}

function fakeEngine(over = {}) {
  const calls = { achievements: [], toasts: [], activity: [], changed: 0, saved: 0 };
  const engine = {
    inv: {},
    pc: { level: 20, xp: 0, imagination: 0, mood: 75, energy: 50 }, // the x1 mood band (G148)
    player: { x: 300, y: 500 },
    streetTsid: 'GTEST',
    droppedItems: { version: 1, nextId: 1, streets: {} },
    achievement: (counter, amount = 1) => calls.achievements.push(`${counter}:${amount}`),
    toast: (t) => calls.toasts.push(t),
    pushActivity: (t) => calls.activity.push(t),
    droppedItemsChanged: () => { calls.changed += 1; },
    save: () => { calls.saved += 1; },
    homeContext: () => over.home || { inHome: false, owned: true },
    setData() {},
    param: () => null,
    ...over,
  };
  return { engine, calls };
}

describe('sno cone rules (items/sno_cone_*.js)', () => {
  it('copies each cone\'s eat_min_level, eat_xp and bemoan iMG from GSJS', () => {
    for (const [classTsid, def] of Object.entries(SNO_CONES)) {
      assert.equal(def.minLevel, classProp(`${classTsid}.js`, 'eat_min_level'), classTsid);
      assert.equal(def.xp, classProp(`${classTsid}.js`, 'eat_xp'), classTsid);
      const src = readFileSync(join(GSJS, `${classTsid}.js`), 'utf8');
      assert.ok(src.includes(`stats_add_xp(${def.bemoanXp} * msg.count`), `${classTsid} bemoan`);
      assert.ok(src.includes(def.bemoan), `${classTsid} bemoan line`);
    }
  });

  it('refuses below the level gate and eats nothing', () => {
    const pc = { level: 3, xp: 0, imagination: 0, mood: 50 };
    const out = eatSnoCone('sno_cone_green', pc, { eatenToday: 0 });
    assert.equal(out.ok, false);
    assert.deepEqual(out.msgs, ['You must be at least level 4 to eat this sno cone.']);
    assert.equal(pc.xp, 0);
    assert.equal(out.eatenToday, 0);
  });

  it('gives iMG and no energy; the Rainbo cone has no gate (eat_min_level 0)', () => {
    const pc = { level: 1, xp: 0, imagination: 0, mood: 75, energy: 10 }; // the x1 mood band (G148)
    const out = eatSnoCone('sno_cone_rainbow', pc, { eatenToday: 0 });
    assert.equal(out.ok, true);
    assert.equal(pc.xp, 1100);
    assert.equal(pc.imagination, 1100);
    assert.equal(pc.energy, 10);
  });

  it('warns on the third cone and may freeze the brain from the fourth', () => {
    const pc = { level: 20, xp: 0, imagination: 0, mood: 90 };
    assert.deepEqual(eatSnoCone('sno_cone_blue', pc, { eatenToday: 2 }).msgs, [SNO_CONE_TEXT.almost]);
    const lucky = eatSnoCone('sno_cone_blue', pc, { eatenToday: 3, rng: () => 0.9 });
    assert.deepEqual(lucky.msgs, [SNO_CONE_TEXT.lucky]);
    assert.equal(lucky.froze, false);
    // Two Blue cones at 90% mood: 37 iMG x1.2 is 44 each (G148).
    assert.equal(pc.xp, 88);
    const froze = eatSnoCone('sno_cone_blue', pc, { eatenToday: 4, rng: () => 0.1 });
    assert.equal(froze.ok, true);
    assert.equal(froze.froze, true);
    assert.equal(pc.mood, 0);
    assert.equal(pc.xp, 88, 'no iMG on a brain freeze');
    assert.deepEqual(froze.achievementCounters, [{ counter: 'brain:frozen', amount: 1 }]);
  });

  it('brain:frozen counts toward The Walking Frozed', () => {
    const state = createAchievementState();
    seedAchievementNearCompletion(state, 'walking_frozed', 1);
    applyAchievementProgress(state, 'brain:frozen', 1, { imagination: 0, xp: 0, currants: 0, giantFavor: {} });
    assert.ok(state.unlocked.includes('walking_frozed'));
  });

  it('the Eat tooltip warns once more than three went down today', () => {
    assert.equal(snoConeEatButton('sno_cone_red', 3).tooltip, SNO_CONE_TEXT.eatTooltip);
    assert.equal(snoConeEatButton('sno_cone_red', 4).tooltip, SNO_CONE_TEXT.eatTooltipRisky);
    assert.equal(snoConeEatButton('apple', 0), null);
  });

  it('bemoans for the whole stack and melts 30 minutes after a drop', () => {
    const pc = { xp: 0, imagination: 0 };
    assert.equal(bemoanSnoCone('sno_cone_orange', pc, 2).xp, 150);
    assert.equal(snoConeMelted({ classTsid: 'sno_cone_red', droppedAt: 1000 }, 1000 + SNO_CONE_MELT_MS - 1), false);
    assert.equal(snoConeMelted({ classTsid: 'sno_cone_red', droppedAt: 1000 }, 1000 + SNO_CONE_MELT_MS), true);
    assert.equal(snoConeMelted({ classTsid: 'apple', droppedAt: 1 }, 1e12), false);
  });

  it('build-recipes leaves sno cones out of the food uses (no plain Eat for energy)', () => {
    const items = JSON.parse(readFileSync(join(root, 'public/assets/content/making-items.json'), 'utf8')).items;
    for (const classTsid of Object.keys(SNO_CONES)) {
      assert.ok(items[classTsid], classTsid);
      assert.equal(items[classTsid].use, undefined, `${classTsid} has no food use`);
    }
  });
});

describe('sno cones feature', () => {
  beforeEach(() => snoConesFeature._reset());

  it('Eat uses one cone, counts the day, and VERB:eat', () => {
    const { engine, calls } = fakeEngine();
    engine.inv.sno_cone_purple = 2;
    const [button] = snoConesFeature.packVerbs('sno_cone_purple', engine);
    assert.equal(button.id, 'eat');
    assert.equal(snoConesFeature.runPackVerb('sno_cone_purple', 'eat', engine), true);
    assert.equal(engine.inv.sno_cone_purple, 1);
    assert.equal(engine.pc.xp, 550);
    assert.equal(snoConesFeature._state().daily.eaten, 1);
    assert.equal(snoConesFeature._state().daily.day, getGameDayKey(Date.now()));
    assert.ok(calls.achievements.includes('VERB:eat:sno_cone_purple:1'));
  });

  it('a dropped cone can be picked up only at home, and Bemoan removes the stack', () => {
    const { engine, calls } = fakeEngine();
    engine.droppedItems.streets.GTEST = [{ id: 'world-item-1', streetTsid: 'GTEST', classTsid: 'sno_cone_blue', count: 2, x: 1, y: 1, droppedAt: Date.now() }];
    const target = { classId: 'dropped_item', state: { id: 'world-item-1', classTsid: 'sno_cone_blue', count: 2 } };
    const verbs = snoConesFeature.decorateVerbs(target, [{ id: 'pickup', label: 'pick up', enabled: true }], engine);
    assert.equal(verbs.find((v) => v.id === 'pickup').enabled, false);
    assert.equal(verbs.find((v) => v.id === 'pickup').reason, SNO_CONE_TEXT.pickupRefused);
    assert.ok(verbs.some((v) => v.id === BEMOAN_VERB));
    const home = fakeEngine({ home: { inHome: true, owned: true } }).engine;
    assert.equal(snoConesFeature.decorateVerbs(target, [{ id: 'pickup', label: 'pick up', enabled: true }], home).find((v) => v.id === 'pickup').enabled, true);
    assert.equal(snoConesFeature.decorateVerbs({ classId: 'dropped_item', state: { classTsid: 'apple' } }, [], engine), null);

    assert.equal(snoConesFeature.runVerbOverride(target, BEMOAN_VERB, engine), true);
    assert.equal(engine.pc.xp, 38);
    assert.equal(engine.droppedItems.streets.GTEST, undefined);
    assert.equal(calls.changed, 1);
    assert.ok(calls.activity.includes('Sigh. You should have known not to drop a cone.'));
  });

  it('melts old dropped cones on every street, leaving other stacks', () => {
    const { engine, calls } = fakeEngine();
    const old = Date.now() - SNO_CONE_MELT_MS - 1;
    engine.droppedItems.streets.GTEST = [
      { id: 'a', classTsid: 'sno_cone_red', count: 1, x: 0, y: 0, droppedAt: old },
      { id: 'b', classTsid: 'apple', count: 1, x: 0, y: 0, droppedAt: old },
    ];
    engine.droppedItems.streets.GOTHER = [{ id: 'c', classTsid: 'sno_cone_green', count: 1, x: 0, y: 0, droppedAt: old }];
    snoConesFeature.onTick(0, Date.now(), engine);
    assert.deepEqual(engine.droppedItems.streets.GTEST.map((r) => r.id), ['b']);
    assert.equal(engine.droppedItems.streets.GOTHER, undefined);
    assert.equal(calls.changed, 1);
  });
});
