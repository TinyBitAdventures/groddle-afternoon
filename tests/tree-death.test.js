import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  ANTIDOTE_MOOD,
  BOTANY_SKILL,
  DEAD_TREE_CLASS,
  DEAD_WOOD_PLANKS,
  DEAD_WOOD_PLANK_DX,
  GUILT_BUFF,
  GUILT_SECONDS,
  GUILT_SECOND_TIME_SECONDS,
  POISON_BUBBLE_EVERY_MS,
  POISON_BUBBLE_SHOW_MS,
  POISON_COPY,
  POISON_DURATION_MS,
  POISON_FIRST_BUBBLE_MS,
  POTION_USES,
  POUR_MS,
  POUR_RANGE,
  TOO_GUILTY_BUFF,
  TOO_GUILTY_SECONDS,
  TREE_ANTIDOTE,
  TREE_POISON,
  applyTreePoison,
  canPourAntidote,
  canPourPoison,
  createPoisonBottleState,
  guiltAfterPlanting,
  guiltAfterPoisoning,
  guiltState,
  performAntidotePour,
  performPoisonPour,
  poisonBubbleDue,
  poisonDue,
  poisonMoodCost,
  quoteAntidoteVerb,
  quotePoisonVerb,
  treeDeathOutcome,
  useBottle,
} from '../public/js/tree-poison.js';
import { createPlot, killPlotTree, performPlotVerb, growTree } from '../public/js/patches.js?v=g414-1';
import { createFeatureHost } from '../public/js/feature-host.js';
import { FEATURES } from '../public/js/features/index.js?v=registry-322';
import { adoptedPlan } from '../public/js/features/patches-feature.js?v=g442-6';
import { patchesFeature } from '../public/js/features/patches-feature.js?v=g442-6';
import {
  decorateTreeVerbs,
  streetTreeIndex,
  treeDeathFeature,
} from '../public/js/features/tree-death-feature.js?v=g448-2';
import { skillRemakeNote } from '../public/js/skill-tree.js?v=g403-1';
import { loadContentCatalogsFromDir } from '../public/js/content-catalogs.js?v=g403-1';

const T0 = 1_000_000;

function poisonCtx(extra = {}) {
  return {
    inv: { [TREE_POISON]: 1 },
    learned: [BOTANY_SKILL],
    mood: 100,
    maxMood: 100,
    guilt: { tooGuilty: false, guilty: false, secondTime: false },
    ...extra,
  };
}

describe('tree poison source numbers (GSJS)', () => {
  it('uses the potion and trants.js timings', () => {
    assert.equal(POISON_DURATION_MS, 180000); // applyPoison 3*60
    assert.equal(POISON_FIRST_BUBBLE_MS, 3000); // onPoisoned after 3*1000
    assert.equal(POISON_BUBBLE_EVERY_MS, 30000); // then every 30*1000
    assert.equal(POISON_BUBBLE_SHOW_MS, 3000); // sendBubble(phrase, 3*1000)
    assert.equal(POUR_MS, 2500); // potion_base overlay and onPourComplete
    assert.equal(POUR_RANGE, 200); // findCloseStack(..., 200)
    assert.equal(POTION_USES, 5); // points_capacity
    assert.equal(ANTIDOTE_MOOD, 10); // metabolics_add_mood(10)
    assert.equal(DEAD_WOOD_PLANKS, 25); // wood_tree onDie createItemStack('plank', 25, x+80)
    assert.equal(DEAD_WOOD_PLANK_DX, 80);
    assert.equal(GUILT_SECONDS, 90);
    assert.equal(GUILT_SECOND_TIME_SECONDS, 420);
    assert.equal(TOO_GUILTY_SECONDS, 900);
    assert.equal(BOTANY_SKILL, 'botany_1');
  });

  it('getMoodCost is 10%, 25% then 60% of max mood', () => {
    assert.equal(poisonMoodCost({}, 100), 10);
    assert.equal(poisonMoodCost({ guilty: true }, 100), 25);
    assert.equal(poisonMoodCost({ guilty: true, secondTime: true }, 100), 60);
    assert.equal(poisonMoodCost({}, 135), 14); // Math.round(13.5)
  });

  it('die() maps each trant to its dead class; a Wood Tree leaves a Patch and 25 Planks', () => {
    assert.equal(DEAD_TREE_CLASS.trant_egg, 'trant_egg_dead');
    assert.deepEqual(treeDeathOutcome('trant_bean'), { soilClass: 'trant_bean_dead', planks: 0, plankDx: 0 });
    assert.deepEqual(treeDeathOutcome('wood_tree'), { soilClass: 'patch', planks: 25, plankDx: 80 });
    assert.equal(treeDeathOutcome('wood_tree', { poisoned: false }).planks, 0);
    assert.equal(treeDeathOutcome('npc_piggy'), null);
  });
});

describe('poison and antidote verbs (trant_base conditions)', () => {
  it('poison is hidden without Tree Poison or on an already poisoned tree', () => {
    assert.equal(quotePoisonVerb({}, poisonCtx({ inv: {} })).visible, false);
    const state = applyTreePoison({}, T0);
    assert.equal(quotePoisonVerb(state, poisonCtx()).visible, false);
  });

  it('checks guilt, Botany, then mood, in source order with source copy', () => {
    assert.equal(quotePoisonVerb({}, poisonCtx({ guilt: { tooGuilty: true }, inv: {} })).reason, POISON_COPY.tooGuilty);
    assert.equal(quotePoisonVerb({}, poisonCtx({ learned: [] })).reason, 'You need to know Botany to do this.');
    assert.equal(quotePoisonVerb({}, poisonCtx({ mood: 9 })).reason, 'You are not in a good enough mood to poison a tree.');
    const ok = quotePoisonVerb({}, poisonCtx({ mood: 10 }));
    assert.equal(ok.enabled, true);
    assert.equal(ok.moodCost, 10);
  });

  it('antidote shows only on a poisoned tree and needs the antidote and Botany', () => {
    const state = applyTreePoison({}, T0);
    assert.equal(quoteAntidoteVerb({}, poisonCtx()).visible, false);
    assert.equal(quoteAntidoteVerb(state, poisonCtx({ inv: {} })).reason, "You don't have any antidote!");
    assert.equal(quoteAntidoteVerb(state, poisonCtx({ inv: { [TREE_ANTIDOTE]: 1 }, learned: [] })).reason, 'You need to know Botany to use this.');
    assert.equal(quoteAntidoteVerb(state, poisonCtx({ inv: { [TREE_ANTIDOTE]: 1 } })).enabled, true);
  });

  it('the pack Pour follows canPour', () => {
    assert.equal(canPourPoison({}, poisonCtx({ learned: [] })).msg, 'You need to know Botany to use this.');
    assert.equal(canPourPoison(null, poisonCtx()).msg, "There's nothing around here to poison.");
    assert.equal(canPourPoison({}, poisonCtx()).ok, true);
    assert.equal(canPourAntidote(null, poisonCtx({ inv: { [TREE_ANTIDOTE]: 1 } })).msg, 'There are no poisoned trees nearby.');
  });
});

describe('pouring', () => {
  it('poisons, costs mood off your home, and builds the source activity line', () => {
    const state = {};
    const pc = { mood: 80 };
    const inv = { [TREE_POISON]: 1 };
    const bottles = createPoisonBottleState();
    const res = performPoisonPour(state, { ...poisonCtx({ inv }), pc, now: T0, bottles });
    assert.equal(res.ok, true);
    assert.equal(state.poisonEndsAt, T0 + 180000);
    assert.equal(pc.mood, 70);
    assert.equal(res.msg, 'You poured a Tree Poison. You poisoned this tree. Do you feel guilty yet?');
    assert.deepEqual(res.guilt.apply, { id: GUILT_BUFF, durationSec: 90, args: {} });
    assert.deepEqual(res.counters, [{ counter: 'potions_used:potion_tree_poison', amount: 1 }]);
    assert.equal(bottles.uses[TREE_POISON], 4);
  });

  it('on your own home there is no mood cost and no guilt', () => {
    const pc = { mood: 80 };
    const res = performPoisonPour({}, { ...poisonCtx(), pc, owner: true, now: T0 });
    assert.equal(pc.mood, 80);
    assert.equal(res.guilt.apply, null);
    assert.equal(res.msg, 'You poured a Tree Poison. You poisoned this tree.');
  });

  it('guilt climbs 90 s -> 420 s second time -> A too-guilty mind', () => {
    assert.deepEqual(guiltAfterPoisoning({ guilty: true }), {
      moodCost: true,
      remove: [GUILT_BUFF],
      apply: { id: GUILT_BUFF, durationSec: 420, args: { is_second_time: true } },
    });
    assert.deepEqual(guiltAfterPoisoning({ guilty: true, secondTime: true }).apply, { id: TOO_GUILTY_BUFF, durationSec: 900, args: {} });
    const g = guiltState({ buffs: [GUILT_BUFF], guiltRow: { expiresAt: T0 + 300000, args: { is_second_time: true } }, now: T0 });
    assert.deepEqual(g, { tooGuilty: false, guilty: true, secondTime: true, guiltRemainingMs: 300000 });
  });

  it('planting a bean eases guilt (patch.js plantBean)', () => {
    assert.equal(guiltAfterPlanting({ guilty: false }), null);
    assert.equal(guiltAfterPlanting({ guilty: true, secondTime: true, guiltRemainingMs: 200000 }).msg, 'Some of your tree-poisoning-related guilt subsides.');
    assert.equal(guiltAfterPlanting({ guilty: true, secondTime: true, guiltRemainingMs: 200000 }).apply.durationSec, 90);
    const gone = guiltAfterPlanting({ guilty: true, secondTime: true, guiltRemainingMs: 60000 });
    assert.equal(gone.msg, 'You no longer feel guilty about that tree you poisoned.');
    assert.equal(gone.apply, null);
  });

  it('the antidote cures, gives 10 mood and counts tree_antidote:antidoted', () => {
    const state = applyTreePoison({}, T0);
    const pc = { mood: 95 };
    const res = performAntidotePour(state, { pc, maxMood: 100 });
    assert.equal(res.ok, true);
    assert.equal(state.poisonEndsAt, undefined);
    assert.equal(pc.mood, 100);
    assert.equal(res.moodGained, 5);
    assert.equal(res.msg, 'You poured a Tree Poison Antidote.');
    assert.equal(res.counters[0].counter, 'tree_antidote:antidoted');
  });

  it('a bottle pours five times then is consumed silently', () => {
    const inv = { [TREE_POISON]: 2 };
    const bottles = createPoisonBottleState();
    for (let i = 0; i < 4; i += 1) assert.equal(useBottle(bottles, TREE_POISON, inv).emptied, false);
    const fifth = useBottle(bottles, TREE_POISON, inv);
    assert.equal(fifth.emptied, true);
    assert.equal(inv[TREE_POISON], 1);
    assert.equal(useBottle(bottles, TREE_POISON, inv).left, 4);
  });

  it('bubbles at 3 s and every 30 s, counting down then asking for antidote', () => {
    const state = applyTreePoison({}, T0);
    assert.equal(poisonBubbleDue(state, T0 + 2000), null);
    const first = poisonBubbleDue(state, T0 + 3000);
    assert.equal(first.text, "Help! I've been poisoned and will die in 177 seconds.");
    state.poisonBubble = first.tick;
    assert.equal(poisonBubbleDue(state, T0 + 20000), null);
    const second = poisonBubbleDue(state, T0 + 33000);
    assert.equal(second.text, 'I need antidote!');
    state.poisonBubble = second.tick;
    // A missed tick is skipped, not replayed.
    const later = poisonBubbleDue(state, T0 + 124000);
    assert.equal(later.tick, 4);
    assert.equal(later.text, "Help! I've been poisoned and will die in 57 seconds.");
    assert.equal(poisonDue(state, T0 + 179999), false);
    assert.equal(poisonDue(state, T0 + 180000), true);
    assert.equal(poisonBubbleDue(state, T0 + 180000), null);
  });
});

describe('trees grown in Patches die in their plot', () => {
  function grown(trantClass) {
    const plot = createPlot('patch', { now: T0 });
    plot.stage = 'seedling';
    plot.seedling = { trantClass, beanClass: '', plantedAt: T0, minAt: T0, maxAt: T0 + 1e7, upgradeGrowLevel: 0, petted: 3, petters: 1, growLevel: 0, thirdPetAt: T0 };
    growTree(plot, T0);
    return plot;
  }

  it('a trant becomes its dead class, which clears to a Patch (an Egg Plant to a Dark Patch)', () => {
    const plot = grown('trant_egg');
    assert.deepEqual(killPlotTree(plot, T0 + 1), { classId: 'trant_egg', soilClass: 'trant_egg_dead' });
    assert.equal(plot.stage, 'dead');
    const res = performPlotVerb(plot, 'clear', { inv: { hatchet: 1 }, pc: { energy: 100 }, now: T0 + 2 });
    assert.equal(res.ok, true);
    assert.deepEqual(res.outputs, [{ classTsid: 'plank', qty: 25 }]);
    assert.equal(plot.stage, 'dirty');
    assert.equal(plot.kind, 'patch_dark');
  });

  it('a Wood Tree is a weedy Patch at once', () => {
    const plot = grown('wood_tree');
    assert.deepEqual(killPlotTree(plot, T0 + 1), { classId: 'wood_tree', soilClass: 'patch' });
    assert.equal(plot.stage, 'dirty');
    assert.equal(plot.kind, 'patch');
    assert.equal(killPlotTree(plot), null);
  });

  it('adopted plots replay from their saved spot', () => {
    const slot = { plots: { 'tree:2': createPlot('trant_bean_dead', { now: T0 }) }, adopted: { 'tree:2': { x: 400, y: 900 }, 'tree:9': { x: 1, y: 1 } } };
    assert.deepEqual(adoptedPlan(slot), [{ key: 'tree:2', classTsid: 'trant_bean_dead', x: 400, y: 900, adopted: true }]);
  });
});

describe('tree verbs while poisoned', () => {
  const verbs = [
    { id: 'pet', sort: 10 },
    { id: 'water', sort: 20 },
    { id: 'harvest', sort: 30 },
    { id: 'talk_to', sort: 40 },
  ];

  it('adds apply poison to after talk to', () => {
    const out = decorateTreeVerbs(verbs, {}, poisonCtx());
    assert.deepEqual(out.map((v) => v.id), ['pet', 'water', 'harvest', 'talk_to', 'treepoison:poison']);
    assert.equal(out[4].label, 'apply poison to');
    assert.equal(out[4].tooltip, 'Apply poison to this tree, killing it');
  });

  it('a poisoned tree hides harvest, pet and water and offers the antidote', () => {
    const state = applyTreePoison({}, T0);
    const out = decorateTreeVerbs(verbs, state, poisonCtx({ inv: { [TREE_ANTIDOTE]: 1 } }));
    assert.deepEqual(out.map((v) => v.id), ['talk_to', 'treepoison:antidote']);
    assert.equal(out[1].label, 'apply antidote to');
  });

  it('feature hosts chain decorateVerbs', () => {
    const host = createFeatureHost([
      { id: 'a', decorateVerbs: (t, v) => [...v, { id: 'x' }] },
      { id: 'b', decorateVerbs: () => null },
      { id: 'c', decorateVerbs: (t, v) => v.filter((row) => row.id !== 'pet') },
    ]);
    assert.deepEqual(host.decorateVerbs({}, [{ id: 'pet' }, { id: 'talk_to' }], {}).map((v) => v.id), ['talk_to', 'x']);
  });
});

function fakeEngine({ trees, buffs = {}, home = false } = {}) {
  const world = { trees: trees.map((t) => ({ classId: t.classId, state: t.state })) };
  const slots = {};
  const calls = { achievements: [], drops: [], activity: [], said: [], adopted: [], unregistered: [], applied: [], removed: [] };
  const engine = {
    interactables: [...trees],
    inv: { [TREE_POISON]: 1, [TREE_ANTIDOTE]: 1 },
    pc: { mood: 100, energy: 100, energyMax: 100 },
    learnedSkills: [BOTANY_SKILL],
    player: { x: trees[0].sprite.x - 100, y: trees[0].sprite.y },
    streetTsid: 'GTEST',
    streetWorld: () => world,
    streetSlot: (id) => (slots[id] ||= {}),
    activeBuffIds: () => Object.keys(buffs),
    buffRow: (id) => buffs[id] || null,
    applyBuff: (id, opts) => {
      calls.applied.push([id, opts]);
      buffs[id] = { expiresAt: Date.now() + (opts?.durationSec || 0) * 1000, args: opts?.args || {} };
      return { ok: true };
    },
    removeBuff: (id) => {
      calls.removed.push(id);
      delete buffs[id];
      return { ok: true };
    },
    homeContext: () => ({ inHome: home }),
    unregister: (t) => {
      calls.unregistered.push(t);
      engine.interactables = engine.interactables.filter((x) => x !== t);
    },
    param: () => null,
    setData: () => {},
    pushActivity: (m) => calls.activity.push(m),
    toast: () => {},
    floatText: () => {},
    achievement: (c, n) => calls.achievements.push([c, n]),
    refreshPack: () => {},
    save: () => {},
    dropWorldStack: (...args) => calls.drops.push(args),
    say: (t, text) => calls.said.push(text),
    metabolicGate: () => ({ ok: true }),
  };
  return { engine, world, slots, calls };
}

function tree(classId, x) {
  return { classId, label: classId, state: { classTsid: classId, maturity: 7, health: 8 }, sprite: { x, y: 902, height: 200 } };
}

describe('tree-death feature', () => {
  const realAdopt = patchesFeature.adoptPlot;
  let adopted;
  beforeEach(() => {
    treeDeathFeature._reset();
    adopted = [];
    patchesFeature.adoptPlot = (engine, row) => {
      adopted.push(row);
      return row;
    };
  });

  it('is registered once', () => {
    assert.equal(FEATURES.filter((f) => f.id === 'tree-death').length, 1);
  });

  it('a poisoned street trant dies after three minutes into a dead tree plot', () => {
    const bean = tree('trant_bean', 500);
    const { engine, slots, calls } = fakeEngine({ trees: [tree('trant_fruit', 200), bean] });
    assert.equal(streetTreeIndex(engine.streetWorld().trees, bean), 1);
    assert.equal(treeDeathFeature._completePour(engine, 'poison', bean), true);
    assert.equal(engine.pc.mood, 90);
    assert.deepEqual(calls.applied[0], [GUILT_BUFF, { durationSec: 90, args: {} }]);
    assert.ok(calls.achievements.some(([c]) => c === 'potions_used:potion_tree_poison'));
    const ends = bean.state.poisonEndsAt;
    treeDeathFeature.onTick(16, ends - 1000, engine);
    assert.ok(engine.interactables.includes(bean));
    treeDeathFeature.onTick(16, ends + 10, engine);
    assert.ok(!engine.interactables.includes(bean));
    assert.deepEqual(adopted.map((r) => [r.key, r.soilClass, r.x]), [['tree:1', 'trant_bean_dead', 500]]);
    assert.equal(slots['tree-death'].replaced[1].classId, 'trant_bean');
    assert.equal(bean.state.poisonEndsAt, undefined);
    patchesFeature.adoptPlot = realAdopt;
  });

  it('the second poisoning while guilty costs 25% and sets the 420 s guilt', () => {
    const buffs = { [GUILT_BUFF]: { expiresAt: Date.now() + 60000, args: {} } };
    const a = tree('trant_bean', 300);
    const { engine, calls } = fakeEngine({ trees: [a], buffs });
    treeDeathFeature._completePour(engine, 'poison', a);
    assert.equal(engine.pc.mood, 75);
    assert.deepEqual(calls.removed, [GUILT_BUFF]);
    assert.deepEqual(calls.applied[0], [GUILT_BUFF, { durationSec: 420, args: { is_second_time: true } }]);
  });

  it('a poisoned Wood Tree leaves a Patch and 25 Planks 80 px to the right', () => {
    const wood = tree('wood_tree', 900);
    const { engine, calls } = fakeEngine({ trees: [wood] });
    treeDeathFeature._completePour(engine, 'poison', wood);
    treeDeathFeature._killTree(engine, wood);
    assert.deepEqual(adopted.map((r) => [r.key, r.soilClass]), [['tree:0', 'patch']]);
    assert.deepEqual(calls.drops, [['plank', 25, 980, 902 - 74]]);
    patchesFeature.adoptPlot = realAdopt;
  });

  it('the antidote saves the tree', () => {
    const bean = tree('trant_bean', 500);
    const { engine, calls } = fakeEngine({ trees: [bean] });
    treeDeathFeature._completePour(engine, 'poison', bean);
    treeDeathFeature._completePour(engine, 'antidote', bean);
    assert.equal(bean.state.poisonEndsAt, undefined);
    assert.ok(calls.achievements.some(([c]) => c === 'tree_antidote:antidoted'));
    treeDeathFeature.onTick(16, Date.now() + POISON_DURATION_MS + 1000, engine);
    assert.ok(engine.interactables.includes(bean));
    assert.equal(adopted.length, 0);
    patchesFeature.adoptPlot = realAdopt;
  });

  it('trees that died stay gone on the next visit, and timers that ran out away kill on entry', () => {
    const fruit = tree('trant_fruit', 200);
    const bean = tree('trant_bean', 500);
    const { engine, slots } = fakeEngine({ trees: [fruit, bean] });
    slots['tree-death'] = { replaced: { 0: { classId: 'trant_fruit', soilClass: 'trant_fruit_dead', at: 1 } } };
    applyTreePoison(bean.state, Date.now() - POISON_DURATION_MS - 5);
    treeDeathFeature.onStreetEnter({}, engine);
    assert.deepEqual(engine.interactables, []);
    assert.deepEqual(adopted.map((r) => r.key), ['tree:1']);
    patchesFeature.adoptPlot = realAdopt;
  });

  it('planting a bean ends ordinary guilt', () => {
    const buffs = { [GUILT_BUFF]: { expiresAt: Date.now() + 60000, args: {} } };
    const { engine, calls } = fakeEngine({ trees: [tree('trant_bean', 1)], buffs });
    treeDeathFeature.onEvent('patches:planted', 1, engine);
    assert.deepEqual(calls.removed, [GUILT_BUFF]);
    assert.ok(calls.activity.includes('You no longer feel guilty about that tree you poisoned.'));
  });
});

describe('Botany in the skill tree', () => {
  it('is live now that poisoning and curing trees work', async () => {
    await loadContentCatalogsFromDir(new URL('../public/assets/content', import.meta.url).pathname);
    const note = skillRemakeNote('botany_1');
    assert.equal(note.status, 'live');
    assert.match(note.note, /Tree Poison/);
  });
});
