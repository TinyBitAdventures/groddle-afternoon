/**
 * G134 powders (js/powders.js, js/features/powders-feature.js): each
 * powder's one verb and its GameServerJS effect, charges, the shrine bonus,
 * and the four powder badges at their thresholds.
 * Run: node --test tests/powders.test.js
 */
import { before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  POWDERS,
  POWDER_TEXT,
  dragonChased,
  fecundityScatter,
  fertilidustLiteTarget,
  fertilidustOutcome,
  fertilizeTree,
  noNoCrashSeconds,
  noNoRushSeconds,
  powderVerbFor,
  shrinePowderAchievementCounters,
  shrinePowderOptions,
  sniffNoNo,
  sprinkleHallowed,
  usePowderCharge,
} from '../public/js/powders.js?v=g403-1';
import { powdersFeature } from '../public/js/features/powders-feature.js?v=g403-1';
import {
  applyAchievementProgress,
  createAchievementState,
  getAchievementProgress,
  seedAchievementNearCompletion,
} from '../public/js/achievements.js?v=g403-1';
import { createShrineState, donateToShrine, quoteShrineDonation } from '../public/js/shrines.js?v=spinning-wheel-test-9';
import { applyBuff, createBuffState, tickBuffs } from '../public/js/buffs.js?v=g403-1';
import { loadContentCatalogsFromDir } from '../public/js/content-catalogs.js?v=g403-1';

const publicRoot = join(dirname(fileURLToPath(import.meta.url)), '../public');

before(async () => {
  await loadContentCatalogsFromDir(join(publicRoot, 'assets/content'));
});

const pcFor = () => ({ imagination: 0, xp: 0, currants: 0, giantFavor: {} });
const apply = (state, rows) => rows.flatMap((row) => applyAchievementProgress(state, row.counter, row.amount, pcFor()));

/** One action's rows bump the badge from 0, and finish it from one short. */
function assertEarns(id, rows) {
  const fresh = createAchievementState();
  apply(fresh, rows);
  assert.ok(getAchievementProgress(fresh, id).conditions[0].current >= 1, `${id} counted`);
  const near = createAchievementState();
  seedAchievementNearCompletion(near, id, 1);
  assert.equal(near.unlocked.includes(id), false);
  apply(near, rows);
  assert.ok(near.unlocked.includes(id), `${id} at its threshold`);
}

/** A street with the bits of game.js's engine the feature touches. */
function fakeEngine(over = {}) {
  const calls = { sounds: [], achievements: [], drops: [], buffs: [], removed: [], refreshed: [], said: [] };
  const buffs = new Set(over.buffs || []);
  const engine = {
    inv: {},
    pc: { energy: 50, mood: 50, energyMax: 100, moodMax: 100 },
    player: { x: 500, y: 400 },
    interactables: [],
    unlockedAchievements: [],
    hasBuff: (id) => buffs.has(id),
    applyBuff: (id, opts = {}) => {
      buffs.add(id);
      calls.buffs.push(opts.durationSec ? `${id}:${opts.durationSec}` : id);
      return { ok: true };
    },
    removeBuff: (id) => {
      if (buffs.delete(id)) calls.removed.push(id);
    },
    achievement: (counter, amount = 1) => calls.achievements.push({ counter, amount }),
    playSound: (key) => calls.sounds.push(key),
    pushActivity: (text) => calls.said.push(text),
    toast: () => {},
    refreshPack: () => {},
    updateHud: () => {},
    save: () => {},
    setData: () => {},
    param: () => null,
    floatText: () => {},
    dropWorldStack: (classTsid, count, x, y) => calls.drops.push({ classTsid, count, x, y }),
    refreshTreeVisual: (target) => calls.refreshed.push(target.classId),
    ...over,
  };
  return { engine, calls, buffs };
}

const sprite = (x) => ({ x, y: 400, destroyed: false });

beforeEach(() => powdersFeature._reset());

describe('powder_base: one verb per powder, charges, the jar going', () => {
  it('every powder the Beaker makes has its own verb and tooltip (classProps.verb)', () => {
    assert.deepEqual(
      Object.fromEntries(Object.entries(POWDERS).map(([k, v]) => [k, v.verb])),
      {
        no_no_powder: 'sniff',
        sneezing_powder: 'scatter',
        sparkle_powder: 'sprinkle',
        powder_of_mild_fecundity: 'disperse',
        powder_of_startling_fecundity: 'disperse',
        fertilidust: 'disperse',
        fertilidust_lite: 'sprinkle',
        fairly_hallowed_shrine_powder: 'sprinkle',
        extremely_hallowed_shrine_powder: 'sprinkle',
        krazy_salts: 'push',
      },
    );
    assert.deepEqual(powderVerbFor('sparkle_powder'), {
      id: 'sprinkle', label: 'Sprinkle (5/5)', tooltip: 'Causes the delight of all players nearby', enabled: true, reason: '', primary: true,
    });
    assert.equal(powderVerbFor('no_no_powder').label, 'Sniff');
    assert.equal(powderVerbFor('powder_of_startling_fecundity', { cooldown: true }).reason, "You can't use this Powder again yet.");
    assert.equal(powderVerbFor('fertilidust', { charges: 0 }).reason, 'This powder is out of charges.');
  });

  it('five charges, then the jar is deleted; No-No goes with each sniff, Krazy Salts stays', () => {
    let charges;
    for (const left of [4, 3, 2, 1]) {
      const used = usePowderCharge('sneezing_powder', charges);
      assert.deepEqual(used, { charges: left, emptied: false });
      charges = used.charges;
    }
    assert.deepEqual(usePowderCharge('sneezing_powder', charges), { charges: null, emptied: true });
    assert.deepEqual(usePowderCharge('no_no_powder'), { charges: null, emptied: true });
    assert.deepEqual(usePowderCharge('krazy_salts'), { charges: null, emptied: false });
  });

  it('Sparkle Powder: -20 energy, +10 mood, SPARKLE_POWDER, a charge, notifyVerb (sparkle_powder.js onUse)', () => {
    const { engine, calls } = fakeEngine();
    engine.inv.sparkle_powder = 1;
    for (let i = 0; i < 5; i++) {
      engine.pc.energy = 50;
      engine.pc.mood = 50;
      powdersFeature.runPackVerb('sparkle_powder', 'sprinkle', engine);
      assert.equal(engine.pc.energy, 30);
      assert.equal(engine.pc.mood, 60);
    }
    assert.equal(calls.sounds.filter((k) => k === 'SPARKLE_POWDER').length, 5);
    assert.equal(engine.inv.sparkle_powder || 0, 0, 'jar gone after five');
    assert.ok(calls.achievements.some((r) => r.counter === 'sparkle_powder:sprinkle'));
    assert.equal(calls.said[0], POWDER_TEXT.sparkle);
  });

  it('Sneezing Powder: -2 mood, then SNEEZING_AHCHOO and a Bean two seconds later', () => {
    const { engine, calls } = fakeEngine();
    engine.inv.sneezing_powder = 1;
    powdersFeature.runPackVerb('sneezing_powder', 'scatter', engine);
    assert.equal(engine.pc.mood, 48);
    assert.deepEqual(calls.sounds, ['SNEEZING_POWDER']);
    assert.equal(calls.drops.length, 0);
    powdersFeature._flush(Date.now() + 2500);
    assert.deepEqual(calls.sounds, ['SNEEZING_POWDER', 'SNEEZING_AHCHOO']);
    assert.deepEqual(calls.drops.map((d) => `${d.classTsid}x${d.count}`), ['bean_plainx1']);
    assert.equal(powdersFeature._state().charges.sneezing_powder, 4);
  });

  it('Krazy Salts: push costs 2 mood and keeps the salts (krazy_salts.js:103-125)', () => {
    const { engine } = fakeEngine();
    engine.inv.krazy_salts = 1;
    powdersFeature.runPackVerb('krazy_salts', 'push', engine);
    assert.equal(engine.pc.mood, 48);
    assert.equal(engine.inv.krazy_salts, 1);
  });
});

describe('No-No Powder: rush, crash, croak and Dragon Chaser', () => {
  it('rush 360 s halved by each earlier sniff; the crash halves after the first (no_no_powder.js, catalog_buffs.js:1470-1479)', () => {
    assert.deepEqual([0, 1, 2, 3, 20].map(noNoRushSeconds), [360, 180, 90, 45, 1]);
    assert.deepEqual([1, 2, 3].map(noNoCrashSeconds), [360, 180, 90]);
    assert.deepEqual(sniffNoNo({ pooped: true }), { ok: false, consumed: true, message: POWDER_TEXT.noNoPooped });
    assert.equal(dragonChased(1_000, 1_000 + 660_000), false);
    assert.equal(dragonChased(1_000, 1_000 + 661_000), true);
  });

  it('sniff, crash, sniff again, and the crash with no rush croaks', () => {
    const { engine, calls, buffs } = fakeEngine();
    engine.inv.no_no_powder = 3;
    powdersFeature.runPackVerb('no_no_powder', 'sniff', engine);
    assert.deepEqual(calls.buffs, ['no_no_powder:360']);
    assert.equal(engine.inv.no_no_powder, 2);
    buffs.delete('no_no_powder');
    powdersFeature.onEvent('buff_expired:no_no_powder', 1, engine);
    assert.deepEqual(calls.buffs.slice(1), ['no_no_powder_crash:360']);
    powdersFeature.runPackVerb('no_no_powder', 'sniff', engine);
    assert.ok(calls.removed.includes('no_no_powder_crash'), 'a sniff ends the crash');
    assert.equal(calls.buffs.at(-1), 'no_no_powder:180');
    buffs.delete('no_no_powder');
    powdersFeature.onEvent('buff_expired:no_no_powder', 1, engine);
    assert.equal(calls.buffs.at(-1), 'no_no_powder_crash:180');
    buffs.delete('no_no_powder_crash');
    engine.pc.energy = 40;
    powdersFeature.onEvent('buff_expired:no_no_powder_crash', 1, engine);
    assert.equal(engine.pc.energy, 0, 'hell.js croaks at zero energy');
    assert.equal(powdersFeature._state().noNo.startAt, 0);
  });

  it('a rush still running 660 s after the first sniff counts powders:dragon_chaser', () => {
    const { engine, calls } = fakeEngine();
    engine.inv.no_no_powder = 1;
    powdersFeature.runPackVerb('no_no_powder', 'sniff', engine);
    powdersFeature.onEvent('buff_tick:no_no_powder', 1, engine);
    assert.equal(calls.achievements.some((r) => r.counter === 'powders:dragon_chaser'), false);
    powdersFeature._state().noNo.startAt = Date.now() - 661_000;
    powdersFeature.onEvent('buff_tick:no_no_powder', 1, engine);
    assert.ok(calls.achievements.some((r) => r.counter === 'powders:dragon_chaser'));
    assertEarns('dragon_chaser', [{ counter: 'powders:dragon_chaser', amount: 1 }]);
  });

  it('the rush holds both tanks full; the crash drains 3% a minute (catalog_buffs.js on_tick)', () => {
    const state = createBuffState();
    const pc = { energy: 20, mood: 10, energyMax: 100, moodMax: 100 };
    const t0 = 1_800_000_000_000;
    applyBuff(state, 'no_no_powder', pc, t0);
    assert.deepEqual([pc.energy, pc.mood], [100, 100]);
    pc.energy = 70;
    tickBuffs(state, pc, t0 + 1000);
    assert.equal(pc.energy, 100);
    const crash = createBuffState();
    const pc2 = { energy: 80, mood: 80, energyMax: 100, moodMax: 100 };
    applyBuff(crash, 'no_no_powder_crash', pc2, t0);
    // The game ticks every frame (tickBuffs runs at most 24 ticks a call).
    for (let s = 1; s < 60; s++) tickBuffs(crash, pc2, t0 + s * 1000);
    assert.equal(pc2.energy, 80);
    tickBuffs(crash, pc2, t0 + 60_000);
    assert.deepEqual([pc2.energy, pc2.mood], [77, 77]);
  });
});

describe('Fecundity powders and Critter Catalyzer', () => {
  const herd = (n) => Array.from({ length: n }, (_, i) => ({ classId: ['npc_piggy', 'npc_butterfly', 'npc_chicken'][i % 3], x: i * 100, y: 400 }));

  it('drops come from fecundity_scatter_data at the number of animals; 15 at most', () => {
    const mild = fecundityScatter('mild', herd(5));
    assert.deepEqual(mild.drops.map((d) => `${d.classTsid}x${d.count}`), ['meatx2', 'milk_butterflyx3', 'grainx24', 'meatx2', 'milk_butterflyx3']);
    assert.deepEqual(mild.achievementCounters, []);
    assert.equal(mild.message, POWDER_TEXT.mildAll);
    const startling = fecundityScatter('startling', herd(20));
    assert.equal(startling.count, 15);
    assert.equal(startling.drops[0].count, 3);
    assert.equal(startling.message, POWDER_TEXT.startlingMany);
    assert.deepEqual(fecundityScatter('startling', herd(4)).achievementCounters, []);
    assert.deepEqual(fecundityScatter('startling', herd(5)).achievementCounters, [{ counter: 'powders:critter_catalyzer', amount: 1 }]);
  });

  it('Disperse: drops after 7 s, EFFECT_EXTREME, the ten-minute cooldown, and the badge', () => {
    const { engine, calls } = fakeEngine();
    engine.inv.powder_of_startling_fecundity = 1;
    engine.interactables = herd(5).map((a) => ({ classId: a.classId, sprite: sprite(a.x) }));
    powdersFeature.runPackVerb('powder_of_startling_fecundity', 'disperse', engine);
    assert.ok(calls.buffs.includes('fecundity_cooldown'));
    assert.ok(calls.achievements.some((r) => r.counter === 'powders:critter_catalyzer'));
    assert.equal(calls.drops.length, 0);
    powdersFeature._flush(Date.now() + 7500);
    assert.equal(calls.drops.length, 5);
    assert.ok(calls.sounds.includes('EFFECT_EXTREME'));
    // The verb is disabled while the cooldown runs.
    assert.equal(powdersFeature.packVerbs('powder_of_startling_fecundity', engine)[0].enabled, false);
    assertEarns('critter_catalyzer', [{ counter: 'powders:critter_catalyzer', amount: 1 }]);
  });
});

describe('Fertilidust and Fertilivert', () => {
  it('onFertilidust: a trant grows a stage and goes to full health; a Wood Tree grows below 6', () => {
    const trant = { maturity: 9, health: 3 };
    assert.equal(fertilizeTree('trant_fruit', trant), true);
    assert.deepEqual([trant.maturity, trant.health], [10, 10]);
    const wood = { maturity: 5 };
    fertilizeTree('wood_tree', wood);
    assert.equal(wood.maturity, 6);
    assert.equal(fertilizeTree('wood_tree', wood), false);
    assert.equal(fertilizeTree('paper_tree', { maturity: 1 }), false);
  });

  it('four or more trees count powders:fertilivert; no trees keeps the charge', () => {
    assert.deepEqual(fertilidustOutcome({ trants: 4 }).achievementCounters, [{ counter: 'powders:fertilivert', amount: 1 }]);
    assert.deepEqual(fertilidustOutcome({ trants: 3 }).achievementCounters, []);
    assert.deepEqual(fertilidustOutcome({ trants: 0, paper: 1 }), { ok: false, msgs: [POWDER_TEXT.fertilidustPaper], xp: 0, sound: '', achievementCounters: [] });
    assert.equal(fertilidustOutcome({}).msgs[0], POWDER_TEXT.fertilidustNone);
    assertEarns('fertilivert', [{ counter: 'powders:fertilivert', amount: 1 }]);
  });

  it('Disperse grows every street tree three seconds later and redraws it', () => {
    const { engine, calls } = fakeEngine();
    engine.inv.fertilidust = 1;
    const trees = ['trant_fruit', 'trant_egg', 'wood_tree', 'trant_bean'].map((classId, i) => ({ classId, sprite: sprite(i * 300), state: { maturity: 3, health: 5 } }));
    engine.interactables = [...trees, { classId: 'trant_bean_dead', sprite: sprite(50), state: {} }];
    powdersFeature.runPackVerb('fertilidust', 'disperse', engine);
    assert.ok(calls.achievements.some((r) => r.counter === 'powders:fertilivert'));
    assert.equal(trees[0].state.maturity, 3);
    powdersFeature._flush(Date.now() + 3500);
    assert.deepEqual(trees.map((t) => t.state.maturity), [4, 4, 4, 4]);
    assert.deepEqual(calls.refreshed, ['trant_fruit', 'trant_egg', 'wood_tree', 'trant_bean']);
    assert.equal(powdersFeature._state().charges.fertilidust, 4);
  });

  it('Fertilidust Lite: the closest tree, never paper; a failure keeps the charge', () => {
    const near = { classId: 'trant_gas', x: 480 };
    assert.equal(fertilidustLiteTarget([{ classId: 'trant_egg', x: 1500 }, near], 500).tree, near);
    assert.deepEqual(fertilidustLiteTarget([{ classId: 'paper_tree', x: 490 }, { classId: 'trant_egg', x: 1500 }], 500), { ok: false, message: POWDER_TEXT.litePaper });
    const { engine } = fakeEngine();
    engine.inv.fertilidust_lite = 1;
    powdersFeature.runPackVerb('fertilidust_lite', 'sprinkle', engine);
    assert.equal(powdersFeature._state().charges.fertilidust_lite, undefined);
    assert.equal(engine.inv.fertilidust_lite, 1);
  });
});

describe('Hallowed shrine powders and Hallowed Be Shrine Name', () => {
  it('Sprinkle applies the buff once; a second sprinkle is refused and uses nothing', () => {
    const { engine, calls } = fakeEngine();
    engine.inv.extremely_hallowed_shrine_powder = 1;
    engine.interactables = [{ classId: 'npc_shrine_grendaline', sprite: sprite(600) }];
    powdersFeature.runPackVerb('extremely_hallowed_shrine_powder', 'sprinkle', engine);
    assert.deepEqual(calls.buffs, ['extremely_hallowed']);
    assert.equal(calls.said[0], POWDER_TEXT.extremely);
    powdersFeature.runPackVerb('extremely_hallowed_shrine_powder', 'sprinkle', engine);
    assert.equal(calls.said[1], POWDER_TEXT.hallowedActive);
    assert.equal(powdersFeature._state().charges.extremely_hallowed_shrine_powder, 4);
    powdersFeature._flush(Date.now() + 2500);
    assert.ok(calls.sounds.includes('EFFECT_EXTREME'));
    assert.deepEqual(sprinkleHallowed('fairly_hallowed_shrine_powder').buffId, 'fairly_hallowed');
  });

  it('shrines.js:445-457: triple / double the donation, then the buff is used up; No-No keeps a fifth of the XP', () => {
    assert.deepEqual(shrinePowderOptions((id) => id === 'extremely_hallowed'), { powderBonus: 3, consume: 'extremely_hallowed', noNo: false });
    assert.deepEqual(shrinePowderOptions((id) => id === 'fairly_hallowed' || id === 'no_no_powder'), { powderBonus: 2, consume: 'fairly_hallowed', noNo: true });
    const state = createShrineState();
    const inv = { abbasid_ribs: 10 };
    const plain = quoteShrineDonation(state, 'alph', inv, 'abbasid_ribs', 5, { xp: 1e9 });
    const triple = quoteShrineDonation(state, 'alph', inv, 'abbasid_ribs', 5, { xp: 1e9, powderBonus: 3 });
    assert.equal(triple.rawXp, Math.round(plain.baseCost * 0.2 * 3));
    assert.equal(triple.rawFavor, Math.round(plain.baseCost * 0.1 * 3));
    assert.equal(triple.rawMood, Math.round(plain.baseCost * 0.1 * 3));
    const noNo = quoteShrineDonation(state, 'alph', inv, 'abbasid_ribs', 5, { xp: 1e9, noNo: true });
    assert.equal(noNo.rawXp, Math.round(Math.round(plain.baseCost * 0.2) * 0.2));
    const pc = { mood: 10, moodMax: 100, xp: 1e9, imagination: 0 };
    const done = donateToShrine(state, 'alph', inv, pc, 'abbasid_ribs', 5, { powderBonus: 3, consume: 'extremely_hallowed', rng: () => 0.5, ticketRoll: 1 });
    assert.equal(done.powderConsumed, 'extremely_hallowed');
    assert.deepEqual(shrinePowderAchievementCounters(done.powderConsumed, 1000), [{ counter: 'powders:hallowed_be_shrine_name', amount: 1 }]);
    assert.deepEqual(shrinePowderAchievementCounters(done.powderConsumed, 999), []);
    assert.deepEqual(shrinePowderAchievementCounters('fairly_hallowed', 5000), []);
    assertEarns('hallowed_be_shrine_name', shrinePowderAchievementCounters('extremely_hallowed', 1005));
  });
});
