/**
 * G149 potions (js/potions.js, js/features/potions-feature.js): every Cauldron
 * potion that had no verb, checked against its GameServerJS file, and the
 * Rug's Munch.
 * Run: node --test tests/potions.test.js
 */
import { before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ANIMAL_BABIES,
  CRAZY_QUOIN_BONUS,
  FAVOR_GIANTS,
  KEY_NAMES,
  KEY_REPLACEMENTS,
  PHYSICS_ITEMS,
  POTIONS,
  POTION_TEXT,
  RUG_MUNCH,
  amorousCheck,
  ancestralCheck,
  animalYouthCheck,
  avariceCheck,
  charadesCheck,
  closestWithin,
  crazyQuoinLimit,
  favorCheck,
  favorMessage,
  favorShakeButton,
  isTrantsformable,
  keyChoices,
  keycutterMessage,
  keycutterReplacement,
  loveMood,
  physicsOf,
  physicsPourCheck,
  potionButton,
  potionMessage,
  shakeFavorGiant,
  touchPhysicsItem,
  touchesPhysicsItem,
  trantsformCheck,
  trantsformMessage,
  trantsformOutcome,
  usePotion,
} from '../public/js/potions.js';
import { potionsFeature, usePotionNow, munchRug, shakeFavor } from '../public/js/features/potions-feature.js';
import { BUFF_ICONS } from '../public/js/buff-triggers.js?v=g370-1';
import { createPlot, growTree, tickPlot, trantsformPlotTree, normalizePlot } from '../public/js/patches.js';
import { POTION_ART } from '../public/js/potion-art.js';
import { loadContentCatalogsFromDir } from '../public/js/content-catalogs.js';
import { createAchievementState, applyAchievementProgress } from '../public/js/achievements.js?v=g366-1';

const here = dirname(fileURLToPath(import.meta.url));
const publicRoot = join(here, '../public');
const GSJS = join(here, '../../glitch-GameServerJS/items');
const gsjs = (name) => readFileSync(join(GSJS, `${name}.js`), 'utf8');
const prop = (src, key) => new RegExp(`"${key}"\\s*:\\s*"([^"]*)"`).exec(src)?.[1];

before(async () => {
  await loadContentCatalogsFromDir(join(publicRoot, 'assets/content'));
});

beforeEach(() => potionsFeature._reset());

/** The bits of game.js's engine the feature touches. */
function fakeEngine(over = {}) {
  const calls = { sounds: [], achievements: [], drops: [], buffs: [], removed: [], said: [], toasts: [], unregistered: [] };
  const buffs = new Map();
  const engine = {
    inv: {},
    pc: { energy: 50, mood: 50, energyMax: 100, moodMax: 100, imaginationUpgrades: [] },
    player: { x: 500, y: 400, baseScale: 0.5 },
    interactables: [],
    streetTsid: 'GTEST',
    street: { bounds: { l: 0, t: 0 }, signposts: [] },
    quoinState: { dailyLimit: 100, collectedToday: 0 },
    shrineState: { favor: {}, emblems: {} },
    hasBuff: (id) => buffs.has(id),
    buffRow: (id) => buffs.get(id) || null,
    applyBuff: (id) => {
      buffs.set(id, { classTsid: id });
      calls.buffs.push(id);
      return { ok: true };
    },
    removeBuff: (id) => {
      if (buffs.delete(id)) calls.removed.push(id);
    },
    achievement: (counter, amount = 1) => calls.achievements.push(`${counter}=${amount}`),
    playSound: (key) => calls.sounds.push(key),
    pushActivity: (text) => calls.said.push(text),
    toast: (text) => calls.toasts.push(text),
    refreshPack: () => {},
    save: () => {},
    setData: () => {},
    param: () => null,
    floatText: () => {},
    metabolicGate: () => ({ ok: true }),
    homeContext: () => ({ inHome: false }),
    transientInstance: () => false,
    inScene: () => false,
    dropWorldStack: (classTsid, count) => calls.drops.push(`${classTsid}x${count}`),
    unregister: (t) => calls.unregistered.push(t.classId),
    streetSlot: () => ({}),
    streetWorld: () => ({ trees: [] }),
    ...over,
  };
  return { engine, calls, buffs };
}

/** Quaff/pour now and finish the 2.5 s overlay. */
function use(engine, cls, extra) {
  const started = usePotionNow(engine, cls, extra);
  if (started) potionsFeature._complete(engine);
  return started;
}

describe('potion_base: verbs, uses and messages from each potion file', () => {
  it('every potion here has the verb, tooltip, uses and name its GSJS file gives', () => {
    for (const [cls, def] of Object.entries(POTIONS)) {
      const src = gsjs(cls);
      const quaff = prop(src, 'can_quaff') === '1';
      const pour = prop(src, 'can_pour') === '1';
      assert.equal(def.verb, quaff ? 'quaff' : 'pour', `${cls} verb`);
      assert.ok(quaff !== pour, `${cls} has exactly one verb`);
      assert.equal(String(def.capacity), prop(src, 'points_capacity'), `${cls} points_capacity`);
      const tooltip = prop(src, quaff ? 'quaff_tooltip' : 'pour_tooltip') ?? '';
      assert.equal(def.tooltip, tooltip, `${cls} tooltip`);
      assert.equal(def.name, /var name_single = "([^"]*)"/.exec(src)[1], `${cls} name`);
      assert.equal(def.article, /var article = "([^"]*)"/.exec(src)[1], `${cls} article`);
    }
  });

  it('buildVerbMessage: "You quaffed an Amorous Philtre." and the failed form', () => {
    assert.equal(potionMessage('potion_amorous_philtre'), 'You quaffed an Amorous Philtre.');
    assert.equal(potionMessage('potion_rainbow_juice', [], true), 'You tried to pour a Rainbow Juice.');
    assert.equal(potionMessage('potion_favor', ['You gained 111 favor with Tii']), 'You quaffed a Draught of Giant Amicability. You gained 111 favor with Tii');
  });

  it('tool_base use(1): a bottle counts down and is used up at zero', () => {
    assert.deepEqual(usePotion('potion_amorous_philtre', undefined), { uses: 4, emptied: false });
    assert.deepEqual(usePotion('potion_amorous_philtre', 1), { uses: null, emptied: true });
    assert.deepEqual(usePotion('potion_rainbow_juice', undefined), { uses: null, emptied: true });
    assert.equal(potionButton('potion_favor', { uses: 7 }).label, 'Quaff (7/11)');
    assert.equal(potionButton('potion_rainbow_juice').label, 'Pour');
    assert.equal(potionButton('potion_favor', { dead: true }).reason, POTION_TEXT.dead);
  });

  it('a quaff uses one of the bottle, counts potions_used and the verb (notifyVerb)', () => {
    const { engine, calls } = fakeEngine();
    engine.inv.potion_amorous_philtre = 2;
    use(engine, 'potion_amorous_philtre');
    assert.equal(potionsFeature._state().uses.potion_amorous_philtre, 4);
    assert.deepEqual(calls.achievements, ['potions_used:potion_amorous_philtre=1', 'potion_amorous_philtre:quaff=1', 'VERB:quaff:potion_amorous_philtre=1']);
    assert.equal(calls.sounds[0], 'POTION_AMOROUS_PHILTRE');
    assert.equal(calls.said[0], 'You quaffed an Amorous Philtre.');
  });

  it('Potion Patron: seven potions_used of any kind (group_sum)', () => {
    const state = createAchievementState();
    const pc = { imagination: 0, xp: 0, currants: 0, giantFavor: {} };
    for (let i = 0; i < 6; i += 1) applyAchievementProgress(state, i % 2 ? 'potions_used:potion_elixir_of_avarice' : 'potions_used:potion_animal_youth', 1, pc);
    assert.equal(state.unlocked.includes('potion_patron'), false);
    applyAchievementProgress(state, 'potions_used:potion_favor', 1, pc);
    assert.ok(state.unlocked.includes('potion_patron'));
  });
});

describe('quaff potions', () => {
  it('Amorous Philtre: Feeling Called Love, +10% of max mood, refused while it runs', () => {
    assert.equal(loveMood(200), 20);
    assert.deepEqual(amorousCheck({ loveActive: true }), { ok: false, error: "This doesn't fit my plans, no." });
    const { engine, calls } = fakeEngine();
    engine.inv.potion_amorous_philtre = 1;
    use(engine, 'potion_amorous_philtre');
    assert.deepEqual(calls.buffs, ['feeling_called_love']);
    assert.equal(engine.pc.mood, 60);
    // G277: the tray stand-in comes with applyBuff (buff-triggers BUFF_ICONS), tests/g370-left.
    assert.equal(BUFF_ICONS.feeling_called_love, 'potion_amorous_philtre');
    assert.equal(potionsFeature.packVerbs('potion_amorous_philtre', engine)[0].reason, "This doesn't fit my plans, no.");
  });

  it('Elixir of Avarice: 50 more quoins today, refused while it runs, gone at the new day', () => {
    assert.equal(CRAZY_QUOIN_BONUS, 50);
    assert.equal(crazyQuoinLimit(110), 160);
    assert.equal(avariceCheck({ crazyActive: true }).error, 'You are already collecting coins like crazy.');
    const { engine, calls } = fakeEngine();
    engine.inv.potion_elixir_of_avarice = 1;
    use(engine, 'potion_elixir_of_avarice');
    assert.equal(engine.quoinState.dailyLimit, 150);
    assert.equal(calls.said[0], 'You quaffed an Elixir of Avarice. Your quoin limit for today has increased by 50!');
    assert.equal(BUFF_ICONS.crazy_coin_collector, 'potion_elixir_of_avarice');
    potionsFeature.onNewDay(Date.now(), engine);
    assert.equal(engine.hasBuff('crazy_coin_collector'), false);
  });

  it('Draught of Giant Amicability: 111 favor with the bottle\'s Giant, capped at the emblem, once a day', () => {
    assert.deepEqual(FAVOR_GIANTS, ['alph', 'cosma', 'friendly', 'grendaline', 'humbaba', 'lem', 'mab', 'pot', 'spriggan', 'ti', 'zille']);
    assert.deepEqual(favorCheck({ giant: 'ti', favor: 0, maxFavor: 1000 }), { ok: true, gain: 111, tooltip: 'Gain 111 favor with Tii' });
    assert.equal(favorCheck({ giant: 'mab', favor: 950, maxFavor: 1000 }).tooltip, 'Gain 50 favor with Mab to earn an Emblem');
    assert.equal(favorCheck({ giant: 'mab', favor: 1000, maxFavor: 1000 }).error, 'You must collect the Emblem of Mab before you can quaff this');
    assert.equal(favorCheck({ giant: 'mab', quaffedToday: true }).error, 'You can only quaff this once per day');
    assert.equal(favorMessage('ti', 111), 'You gained 111 favor with Tii');
    const { engine, calls } = fakeEngine();
    engine.inv.potion_favor = 1;
    use(engine, 'potion_favor');
    const giant = potionsFeature._state().favorGiant;
    assert.ok(FAVOR_GIANTS.includes(giant));
    assert.equal(engine.shrineState.favor[giant], 111);
    assert.ok(calls.sounds.includes('DONATION_4TH_TIER'));
    assert.equal(potionsFeature.packVerbs('potion_favor', engine)[0].reason, 'You can only quaff this once per day');
  });

  it('Shake: three a day, each to a different Giant', () => {
    assert.equal(favorShakeButton(0).tooltip, 'Change the amicable giant. Three more shakes remaining today');
    assert.equal(favorShakeButton(2).tooltip, 'Last shake today');
    assert.equal(favorShakeButton(3).reason, 'Giants have had enough shaking for today. Try again tomorrow');
    for (let i = 0; i < 30; i += 1) assert.notEqual(shakeFavorGiant('mab').giant, 'mab');
    assert.equal(shakeFavorGiant('mab', () => 0.95).message, 'You shook the Draught of Giant Amicability. Quaffing it will now give favor with Zille');
    const { engine } = fakeEngine();
    engine.inv.potion_favor = 1;
    for (let i = 0; i < 3; i += 1) assert.equal(shakeFavor(engine), true);
    assert.equal(shakeFavor(engine), false);
  });

  it('Keycutter Tonic: a key you choose becomes a different key 1-6', () => {
    assert.deepEqual(KEY_REPLACEMENTS, ['door_key_1', 'door_key_2', 'door_key_3', 'door_key_4', 'door_key_5', 'door_key_6']);
    assert.deepEqual(keyChoices({ door_key_10: 1, door_key_2: 1, apple: 3, door_key_5: 0 }), ['door_key_2', 'door_key_10']);
    for (let i = 0; i < 30; i += 1) assert.notEqual(keycutterReplacement('door_key_3'), 'door_key_3');
    assert.equal(keycutterMessage(KEY_NAMES.door_key_1, KEY_NAMES.door_key_3), 'Your Yellow-Purple Triangle Key has been replaced with an Orange-Blue Square Key.');
    const { engine } = fakeEngine();
    assert.equal(potionsFeature.packVerbs('potion_keycutter_tonic', { ...engine, inv: { potion_keycutter_tonic: 1 } })[0].reason, "You don't have any keys.");
    engine.inv = { potion_keycutter_tonic: 1, door_key_7: 1 };
    use(engine, 'potion_keycutter_tonic', { key: 'door_key_7' });
    assert.equal(engine.inv.door_key_7 || 0, 0);
    assert.equal(keyChoices(engine.inv).length, 1);
    assert.ok(KEY_REPLACEMENTS.includes(keyChoices(engine.inv)[0]));
  });

  it('Charades Potion and Ancestral Spirits refuse with their own lines', () => {
    assert.equal(charadesCheck({ players: 1 }).error, POTION_TEXT.charades);
    assert.equal(charadesCheck({ players: 2 }).ok, true);
    // The refusals are the files' own strings (escaped quotes aside).
    for (const [cls, text] of [['potion_charades', POTION_TEXT.charades], ['potion_ancestral_spirits', POTION_TEXT.ancestral], ['potion_amorous_philtre', POTION_TEXT.love.replace("'", "\\'")]]) {
      assert.ok(gsjs(cls).includes(text), `${cls}: ${text}`);
    }
    assert.equal(ancestralCheck({}).error, 'You can only drink this in the Ancestral Lands.');
    assert.equal(ancestralCheck({ nostalgia: true, usedThisVisit: true }).error, 'You can only use this once per visit.');
    const { engine } = fakeEngine();
    engine.inv = { potion_charades: 1, potion_ancestral_spirits: 1 };
    assert.equal(potionsFeature.packVerbs('potion_charades', engine)[0].enabled, false);
    assert.equal(potionsFeature.packVerbs('potion_ancestral_spirits', engine)[0].enabled, false);
  });
});

describe('pour potions', () => {
  const animal = (classId, x) => ({ classId, sprite: { x, y: 400, destroyed: false, visible: true }, state: {} });

  it('Potion of Animal Youth: the closest animal in 200 px becomes its baby', () => {
    assert.deepEqual(ANIMAL_BABIES, { npc_chicken: 'chick', npc_piggy: 'piglet', npc_butterfly: 'caterpillar' });
    assert.equal(closestWithin([{ x: 750 }, { x: 640 }, { x: 300 }], 500)?.x, 640);
    assert.equal(closestWithin([{ x: 800 }], 500), null);
    assert.equal(animalYouthCheck(null).error, 'There are no animals around here.');
    const piggy = animal('npc_piggy', 600);
    const { engine, calls } = fakeEngine();
    engine.interactables = [piggy, animal('npc_chicken', 1200)];
    engine.inv.potion_animal_youth = 1;
    use(engine, 'potion_animal_youth');
    assert.deepEqual(calls.drops, ['pigletx1']);
    assert.equal(piggy.sprite.visible, false);
    assert.equal(engine.interactables.includes(piggy), false);
    assert.equal(potionsFeature._state().uses.potion_animal_youth, 2);
  });

  it('the clouds and the rainbow: refused by signposts and, for the rainbow, in puzzles and memories', () => {
    assert.deepEqual(physicsPourCheck('potion_avatar_large', { x: 100, y: 100, signposts: [{ x: 200, y: 180 }] }), { ok: false, error: "You can't pour this close to a sign post." });
    assert.equal(physicsPourCheck('potion_avatar_large', { x: 100, y: 100, signposts: [{ x: 260, y: 100 }] }).ok, true);
    assert.equal(physicsPourCheck('potion_rainbow_juice', { room: 'QI_RADIANT_GLARE_MAIN' }).error, "I'd say, doing that would give you an unfair advantage.");
    assert.equal(physicsPourCheck('potion_rainbow_juice', { memory: true }).ok, false);
    assert.equal(physicsPourCheck('potion_avatar_small', { room: 'QI_LE_MISERABLE_MAIN' }).error, "You can't pour this here");
    assert.equal(physicsPourCheck('potion_avatar_large', { room: 'QI_RADIANT_GLARE_MAIN' }).ok, true);
  });

  it('the physics items have the source hitboxes, scale, gravity and lifetimes', () => {
    const src = (name) => readFileSync(join(GSJS, `${name}.js`), 'utf8');
    for (const [name, def] of Object.entries(PHYSICS_ITEMS)) {
      const s = src(name);
      const ip = (k) => Number(new RegExp(`instanceProps\\.${k} = "([^"]*)"`).exec(s)[1]);
      assert.equal(def.w, ip('width'), `${name} width`);
      assert.equal(def.h, ip('height'), `${name} height`);
      assert.equal(def.pcScale, ip('pc_scale'), `${name} pc_scale`);
      assert.equal(def.gravity, ip('gravity'), `${name} gravity`);
      assert.equal(def.durationSec, ip('duration'), `${name} duration`);
      assert.equal(def.removesOthers, ip('removes_ctpc_effects') === 1, `${name} removes_ctpc_effects`);
      assert.ok(s.includes(`apiSetTimer('apiDelete', ${def.lifeSec === 300 ? '5*60' : '120'}*1000)`), `${name} lifetime`);
      assert.ok(POTION_ART[name], `${name} art`);
    }
  });

  it('touching a cloud scales the avatar for 10 s; a new cloud replaces the other; the rainbow lifts', () => {
    const big = { id: 'a', classTsid: 'avatar_embiggenifier', x: 100, y: 400 };
    const small = { id: 'b', classTsid: 'avatar_smallifier', x: 300, y: 400 };
    const rain = { id: 'c', classTsid: 'anti_gravitys_rainbow', x: 500, y: 400 };
    assert.equal(touchesPhysicsItem(big, 120, 400), true);
    assert.equal(touchesPhysicsItem(big, 150, 400), false);
    assert.equal(touchesPhysicsItem(rain, 510, 400), true);
    assert.equal(touchesPhysicsItem(rain, 520, 400), false);
    let fx = {};
    let out = touchPhysicsItem(fx, big, 0);
    fx = out.effects;
    assert.equal(out.sound, 'BIGENNIFY');
    assert.deepEqual(physicsOf(fx, 5000), { scale: 1.2, gravity: 1 });
    assert.deepEqual(physicsOf(fx, 10_001), { scale: 1, gravity: 1 });
    out = touchPhysicsItem(fx, big, 1000);
    assert.equal(out.sound, '', 'no sound when the scale does not change');
    out = touchPhysicsItem(out.effects, small, 2000);
    fx = out.effects;
    assert.deepEqual(Object.keys(fx), ['b']);
    assert.equal(out.sound, 'SMALLIFY');
    fx = touchPhysicsItem(fx, rain, 3000).effects;
    assert.deepEqual(physicsOf(fx, 4000), { scale: 0.6, gravity: -5 });
    assert.deepEqual(physicsOf(fx, 5001), { scale: 0.6, gravity: 1 });
  });

  it('a pour leaves its item at your feet, and the physics hook carries the rainbow', () => {
    const { engine } = fakeEngine();
    engine.inv.potion_rainbow_juice = 1;
    use(engine, 'potion_rainbow_juice');
    const items = potionsFeature._state().items;
    assert.equal(items.length, 1);
    assert.equal(items[0].classTsid, 'anti_gravitys_rainbow');
    assert.equal(engine.inv.potion_rainbow_juice || 0, 0, 'a one-use bottle is used up');
    assert.deepEqual(potionsFeature.physics(engine), { speed: 1, jump: 1, gravity: 1 });
  });

  it('Trantsformation Fluid: a different tree, no Egg Plant off your home, health 4, maturity max(4, m - 3)', () => {
    for (let i = 0; i < 40; i += 1) {
      const out = trantsformOutcome('trant_fruit', 9);
      assert.notEqual(out.classId, 'trant_fruit');
      assert.notEqual(out.classId, 'trant_egg');
      assert.equal(out.health, 4);
      assert.equal(out.maturity, 6);
    }
    assert.equal(trantsformOutcome('trant_bean', 5, { home: true, rng: () => 0.3 }).classId, 'trant_egg');
    assert.equal(trantsformOutcome('trant_bean', 5).maturity, 4);
    assert.equal(trantsformCheck(null).error, 'You must be near a tree to apply this.');
    assert.equal(trantsformCheck({ state: { maturity: 3, health: 9 } }).error, 'This tree is too small to be trantsformed');
    assert.equal(trantsformCheck({ state: { maturity: 9, health: 3 } }).error, 'This tree is too weak to be trantsformed');
    assert.equal(isTrantsformable({ classId: 'trant_egg' }), false);
    assert.equal(isTrantsformable({ classId: 'trant_egg' }, { home: true }), true);
    assert.equal(isTrantsformable({ classId: 'trant_gas' }, { poisoned: true }), false);
    assert.equal(trantsformMessage('Fruit Tree', 'Egg Plant'), 'The Fruit Tree is now an Egg Plant.');
  });

  it('a Patch-grown tree becomes the new tree on the patches tick (no Seedling message)', () => {
    const plot = createPlot('patch');
    plot.stage = 'seedling';
    plot.seedling = { trantClass: 'trant_fruit', beanClass: '', plantedAt: 0, minAt: 0, maxAt: 1e15, upgradeGrowLevel: 0, petted: 3, petters: 0, growLevel: 8, thirdPetAt: 0 };
    growTree(plot, 1);
    assert.equal(plot.tree.classId, 'trant_fruit');
    trantsformPlotTree(plot, { classId: 'trant_spice', maturity: 5, health: 4 }, 1000);
    assert.equal(plot.stage, 'seedling');
    const saved = normalizePlot(JSON.parse(JSON.stringify(plot)));
    assert.equal(saved.seedling.health, 4, 'a reload keeps the health');
    const { events } = tickPlot(plot, 1001);
    assert.deepEqual(events, ['trantsformed']);
    assert.equal(plot.stage, 'tree');
    assert.equal(plot.tree.classId, 'trant_spice');
    assert.equal(plot.tree.state.maturity, 5);
    assert.equal(plot.tree.state.health, 4);
  });

  it('the feature trantsforms a tree grown in a Patch', () => {
    const plot = createPlot('patch');
    plot.stage = 'seedling';
    plot.seedling = { trantClass: 'trant_bean', beanClass: '', plantedAt: 0, minAt: 0, maxAt: 1e15, upgradeGrowLevel: 0, petted: 3, petters: 0, growLevel: 9, thirdPetAt: 0 };
    growTree(plot, 1);
    plot.tree.state.health = 8;
    const tree = { classId: 'trant_bean', label: 'Bean Tree', grownFromBean: true, state: plot.tree.state, sprite: { x: 560, y: 400, destroyed: false } };
    const { engine, calls } = fakeEngine({ streetSlot: (id) => (id === 'patches' ? { plots: { p1: plot } } : {}) });
    engine.interactables = [tree];
    engine.inv.potion_trantsformation_fluid = 1;
    use(engine, 'potion_trantsformation_fluid');
    assert.equal(plot.stage, 'seedling');
    assert.notEqual(plot.seedling.trantClass, 'trant_bean');
    assert.equal(plot.seedling.growLevel, 6);
    assert.match(calls.said[0], /^You poured a Trantsformation Fluid\. The Bean Tree is now an? /);
  });
});

describe('the Rug', () => {
  it('Munch: FOX_EAT, Feeling Called Love, "You munched a Rug."', () => {
    assert.ok(gsjs('furniture_rug').includes("pc.announce_sound('FOX_EAT');"));
    assert.deepEqual(potionsFeature.verbsFor({ classId: 'furniture_rug' }).map((v) => v.label), ['Munch']);
    assert.equal(potionsFeature.verbsFor({ classId: 'furniture_chair' }), null);
    const { engine, calls } = fakeEngine();
    munchRug(engine);
    assert.deepEqual(calls.sounds, ['FOX_EAT']);
    assert.deepEqual(calls.buffs, ['feeling_called_love']);
    assert.ok(calls.achievements.includes('furniture_rug:munch=1'));
    assert.equal(calls.said[0], RUG_MUNCH.message);
    // No conditions: munching again restarts the buff.
    munchRug(engine);
    assert.deepEqual(calls.removed, ['feeling_called_love']);
  });
});

describe('art', () => {
  it('ships the sheets potion-art.js names', () => {
    for (const art of Object.values(POTION_ART)) assert.ok(existsSync(join(publicRoot, art.url)), art.url);
  });
});
