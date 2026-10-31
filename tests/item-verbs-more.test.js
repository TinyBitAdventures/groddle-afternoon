/**
 * G406-G434 item verbs (js/item-verbs-more.js, js/features/item-verbs-more-feature.js,
 * and the three potions in js/potions.js / js/features/potions-feature.js),
 * checked against each item's GameServerJS file.
 * Run: node --test tests/item-verbs-more.test.js
 */
import { before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BUNDLE_OF_JOY,
  DEFECT_CHICK,
  DIE_FACES,
  DUSTY_STICK,
  ITEM_NAMES,
  TEXT,
  activateBroccoli,
  attractWithNet,
  blowJujuPowder,
  bubbleButton,
  caressBanana,
  cheeseSniffButton,
  defectRaceSecs,
  dieButton,
  dieOutcome,
  disperseElements,
  eatLicorice,
  frogDeliveryEscapeChance,
  inspectBoot,
  joyNextLeg,
  lickButton,
  lickStinkyCheese,
  lotionButton,
  pairOutcome,
  popBubble,
  prodButton,
  prodCheese,
  smashButton,
  smashTrophy,
  sniffBacon,
  sniffCheese,
  sniffMilk,
  sniffVeryStinkyCheese,
  spigotVerb,
  stickButton,
  stickPoints,
  tasteLotion,
  trophySmash,
  verbMessage,
  vvSniffButton,
} from '../public/js/item-verbs-more.js?v=ca6cc8aa';
import { itemVerbsMoreFeature, runMoreVerb, eatLicoriceNow } from '../public/js/features/item-verbs-more-feature.js?v=9694899c';
import {
  LETTER_WEIGHTS,
  POTIONS,
  POTION_TEXT,
  ROCKY,
  WISDOM,
  inSauce,
  nearSauce,
  potionButton,
  regenerateRock,
  rockyCheck,
  rollSauceLetter,
  sauceInputOk,
  sauceLabel,
  sauceStreetLine,
  sauceWord,
  wisdomCheck,
  wisdomMessage,
} from '../public/js/potions.js?v=294258de';
import { potionsFeature, usePotionNow, pourSauce } from '../public/js/features/potions-feature.js?v=e5f7c69e';
import { husbandryPack } from '../public/js/animal-husbandry.js?v=16364589';
import { XP_FOR_LEVEL } from '../public/js/progression.js?v=33462eaa';
import { moodScaledXp } from '../public/js/mood-xp.js?v=958e7680';
import { loadContentCatalogsFromDir } from '../public/js/content-catalogs.js?v=10b118dd';

const here = dirname(fileURLToPath(import.meta.url));
const publicRoot = join(here, '../public');
const GSJS = join(here, '../../glitch-GameServerJS');
const hasGsjs = existsSync(join(GSJS, 'items/bacon.js'));
const gsjs = (name) => readFileSync(join(GSJS, 'items', `${name}.js`), 'utf8');
const src = (rel) => readFileSync(join(publicRoot, rel), 'utf8');

before(async () => {
  await loadContentCatalogsFromDir(join(publicRoot, 'assets/content'));
});

beforeEach(() => {
  itemVerbsMoreFeature._reset();
  potionsFeature._reset();
  husbandryPack().hogtie = null;
});

/** mood 75 of 100: the iMG mood bonus is x1 (inc_stats.js 229-258). */
const pcAt = (over = {}) => ({ energy: 80, mood: 75, energyMax: 100, xp: 0, imagination: 0, ...over });
const seq = (...values) => {
  let i = 0;
  return () => values[Math.min(values.length - 1, i++)];
};
const levelXp = (lvl) => (lvl <= 1 ? 0 : XP_FOR_LEVEL[lvl - 2]);

function fakeEngine(over = {}) {
  const calls = { said: [], toasts: [], achievements: [], feats: [], sounds: [], drops: [], queries: [], bubbles: [] };
  const engine = {
    inv: {},
    pc: pcAt(),
    player: { x: 500, y: 400, scale: { x: 1 } },
    streetTsid: 'GTEST',
    worldW: 3000,
    interactables: [],
    learnedSkills: [],
    unlockedAchievements: [],
    toolState: null,
    achievement: (c, n = 1) => calls.achievements.push(`${c}=${n}`),
    featsIncrement: (f, n) => calls.feats.push(`${f}+${n}`),
    pushActivity: (t) => calls.said.push(t),
    toast: (t) => calls.toasts.push(t),
    playSound: (k) => calls.sounds.push(k),
    dropWorldStack: (cls, n, x) => calls.drops.push(`${cls}x${n}@${Math.round(x)}`),
    say: (target, text) => calls.bubbles.push(text),
    closeSay: () => 0,
    query: (hook) => {
      calls.queries.push(hook);
      return null;
    },
    whoIsHere: () => ['Ur'],
    setData: () => {},
    param: () => null,
    refreshPack: () => {},
    updateHud: () => {},
    save: () => {},
    homeContext: () => ({ inHome: false }),
    transientInstance: () => false,
    inScene: () => false,
    hasBuff: () => false,
    metabolicGate: () => ({ ok: true }),
    ...over,
  };
  return { engine, calls };
}

describe('GSJS text: every line is the item file\'s own', () => {
  const FILES = {
    spigotDrained: 'antique_spigot', spigotMood: 'antique_spigot', spigotCollect: 'antique_spigot', spigotContemplate: 'antique_spigot', spigotSpin: 'antique_spigot',
    broccoli: 'broccoli', broccoliTired: 'broccoli', baconOthers: 'bacon',
    bananaSquash: 'banana', bananaSmooth: 'banana', bananaMature: 'banana',
    lotionNotNow: 'butterfly_lotion', lotionTaste: 'butterfly_lotion',
    bootOil: 'boot', bootHoney: 'boot', bootXp: 'boot',
    bubbleLearn: 'hard_bubble', bubbleFun: 'hard_bubble',
    disperse: 'element_blue',
    lick: 'cheese_stinky', stinkySniff: 'cheese_stinky', needMood: 'cheese_stinky',
    needMoodProd: 'cheese_very_very_stinky', prod: 'cheese_very_very_stinky', vvSniff: 'cheese_very_very_stinky', tooWeak: 'cheese_very_very_stinky', destroyed: 'cheese',
    cheeseSniff: 'cheese', milkSniff: 'milk_butterfly', milkUp: 'milk_butterfly', licorice: 'licorice',
    rolling: 'dice', dieMood: 'dice_12sided', noJujus: 'juju_shoo_shoo_powder', jujusFlee: 'juju_shoo_shoo_powder',
    noButterflies: 'butterfly_net', stickNotReady: 'dusty_stick',
    needPouch: 'trophy_street_creator_earth_piece2',
  };
  it('each TEXT line is in its GSJS file', { skip: !hasGsjs }, () => {
    for (const [key, file] of Object.entries(FILES)) {
      const line = TEXT[key];
      const body = gsjs(file).replace(/\\'/g, "'");
      assert.ok(body.includes(line), `${key} in items/${file}.js`);
    }
    // butterfly_net.js 83 builds it from name_single.
    assert.ok(gsjs('butterfly_net').includes('"This "+this.name_single+" has become broken, and must be repaired."'));
    assert.equal(TEXT.netBroken, `This ${ITEM_NAMES.butterfly_net.name} has become broken, and must be repaired.`);
  });
  it('names, articles and plurals match var name_single / article / name_plural', { skip: !hasGsjs }, () => {
    for (const [cls, def] of Object.entries(ITEM_NAMES)) {
      const body = gsjs(cls);
      assert.equal(def.name, /var name_single = "([^"]*)"/.exec(body)[1], `${cls} name`);
      assert.equal(def.article, /var article = "([^"]*)"/.exec(body)[1], `${cls} article`);
      assert.equal(def.plural, /var name_plural = "([^"]*)"/.exec(body)[1], `${cls} plural`);
    }
  });
  it('the Bundle of Joy and the Defect Chick say their own lines', { skip: !hasGsjs }, () => {
    const joy = gsjs('npc_bundle_of_joy');
    for (const line of [...BUNDLE_OF_JOY.exclamations, BUNDLE_OF_JOY.dyingBubble]) assert.ok(joy.includes(line), line);
    assert.ok(joy.includes('"Your "+this.name_single+" ceased to exist, but left something behind."'));
    assert.match(joy, /this\.npc_walk_speed = 250;/);
    assert.match(joy, /apiSetTimer\('onDie', 20000\)/);
    assert.ok(gsjs('npc_cubimal_factorydefect_chick').includes(DEFECT_CHICK.broken));
  });
  it('buildVerbMessage: "You sniffed a Rasher of Bacon." with effects, and the failed form', () => {
    assert.equal(verbMessage('bacon', { verb: 'sniff', past: 'sniffed', effects: [{ type: 'metabolic_inc', which: 'mood', value: 5 }, { type: 'metabolic_dec', which: 'energy', value: 5 }] }), 'You sniffed a Rasher of Bacon. +5 Mood -5 Energy');
    assert.equal(verbMessage('banana', { verb: 'caress', past: 'caressed', failed: true, msgs: ['x.'] }), 'You tried to caress a Banana. x.');
    assert.equal(verbMessage('element_blue', { verb: 'disperse', past: 'dispersed', count: 40 }), 'You dispersed 40 Blue Elements.');
  });
});

describe('G406 Antique Spigot (antique_spigot.js 156-237)', () => {
  it('51+ mood: -50 mood, +20 iMG with the bonus read after the drain; the mood is read again', () => {
    const pc = pcAt({ mood: 130, energyMax: 150 });
    const out = spigotVerb(pc, 'applytoforehead');
    assert.equal(pc.mood, 80);
    assert.equal(pc.imagination, moodScaledXp(pcAt({ mood: 80, energyMax: 150 }), 20));
    assert.ok(out.ok && out.message.includes(TEXT.spigotDrained) && !out.message.includes(TEXT.spigotMood));
    assert.match(out.message, /^You applied to forehead an Antique Spigot\./);
    const low = pcAt({ mood: 80 });
    const both = spigotVerb(low, 'applytoforehead');
    assert.equal(low.mood, 30);
    assert.ok(both.message.includes(TEXT.spigotDrained) && both.message.includes(TEXT.spigotMood) && both.ok, 'a drain to 50 or below says both, never fails');
    const sad = pcAt({ mood: 50 });
    const no = spigotVerb(sad, 'applytoforehead');
    assert.equal(sad.mood, 50);
    assert.equal(sad.imagination, 0);
    assert.ok(no.ok && no.message.endsWith(TEXT.spigotMood));
  });
  it('Collect, Contemplate and Spin only print their joke', () => {
    assert.equal(spigotVerb(pcAt(), 'spin').message, `You spun an Antique Spigot. ${TEXT.spigotSpin}`);
    assert.equal(spigotVerb(pcAt(), 'collect').message, `You collected an Antique Spigot. ${TEXT.spigotCollect}`);
    assert.equal(spigotVerb(pcAt(), 'contemplate').message, `You contemplated an Antique Spigot. ${TEXT.spigotContemplate}`);
  });
});

describe('G408-G411, G414-G419, G422, G423: small pack verbs', () => {
  it('broccoli: 4 iMG while today is 100 or less, the floret goes either way (broccoli.js 55-76)', () => {
    const pc = pcAt();
    const ok = activateBroccoli(pc, 100);
    assert.equal(pc.imagination, 4);
    assert.equal(ok.consume, 1);
    assert.ok(ok.ok && ok.counted);
    const tired = activateBroccoli(pc, 101);
    assert.equal(pc.imagination, 4);
    assert.equal(tired.ok, false);
    assert.equal(tired.consume, 1);
    assert.match(tired.message, /^You tried to activate a Broccoli\. You can't activate any more broccoli today\./);
  });
  it('bacon: 10+ energy gives 5 mood for 5 energy, the rasher stays, never fails (bacon.js 91-107)', () => {
    const pc = pcAt({ energy: 10, mood: 50 });
    const out = sniffBacon(pc);
    assert.deepEqual([pc.energy, pc.mood, out.consume, out.ok], [5, 55, 0, true]);
    const tired = pcAt({ energy: 9, mood: 50 });
    const none = sniffBacon(tired);
    assert.deepEqual([tired.energy, tired.mood, none.ok], [9, 50, true]);
  });
  it('banana: level 10 squashes one in three, else +5 mood; level 11 is refused (banana.js 153-171)', () => {
    const pc = pcAt({ mood: 50 });
    const squash = caressBanana(pc, 10, () => 0.2);
    assert.deepEqual([squash.ok, squash.consume, pc.mood], [false, 1, 50]);
    const smooth = caressBanana(pc, 10, () => 0.4);
    assert.deepEqual([smooth.ok, smooth.consume, pc.mood], [true, 0, 55]);
    const old = caressBanana(pc, 11, () => 0.9);
    assert.equal(old.ok, false);
    assert.ok(old.message.endsWith(TEXT.bananaMature));
  });
  it('lotion: off in newxp and skill quests; +12 mood and the tube is gone (butterfly_lotion.js 286, 322-332)', () => {
    assert.equal(lotionButton({ newxpOrSkillQuest: true }).reason, TEXT.lotionNotNow);
    const pc = pcAt({ mood: 10 });
    const out = tasteLotion(pc);
    assert.deepEqual([pc.mood, out.consume, out.ok], [22, 1, true]);
  });
  it('boot: 1-3 Olive Oil, 4-6 Honey, else 6-15 iMG; the boot is deleted (boot.js 51-80)', () => {
    assert.deepEqual(inspectBoot(pcAt(), seq(0.5, 0.0)).give, { olive_oil: 1 });
    assert.deepEqual(inspectBoot(pcAt(), seq(0.5, 0.5)).give, { honey: 1 });
    const pc = pcAt();
    const xp = inspectBoot(pc, seq(0.99, 0.99));
    assert.equal(xp.imgRandom, 15);
    assert.equal(pc.imagination, 15);
    assert.equal(inspectBoot(pcAt(), seq(0, 0.7)).imgRandom, 6);
    assert.equal(xp.consume, 1);
  });
  it('hard bubble: level 4 learns 20 for 1 energy, level 5 gets 5 mood for 5 energy; old hat from level 4 (hard_bubble.js 40-146)', () => {
    assert.equal(bubbleButton(3).tooltip, 'You can learn something this way');
    assert.equal(bubbleButton(4).tooltip, 'Popping bubbles is old hat');
    const young = pcAt();
    popBubble(young, 4);
    assert.deepEqual([young.energy, young.imagination], [79, 20]);
    const old = pcAt({ mood: 50 });
    const out = popBubble(old, 5);
    assert.deepEqual([old.energy, old.mood, old.imagination, out.consume], [75, 55, 0, 1]);
  });
  it('disperse: the whole stack goes for count / 20 iMG with the bonus (element_blue.js 129-133)', () => {
    const pc = pcAt();
    const out = disperseElements(pc, 'element_green', 200);
    assert.deepEqual([out.consume, pc.imagination], [200, 10]);
    assert.equal(out.message, `You dispersed 200 Green Elements. ${TEXT.disperse} (+10 iMG)`);
  });
  it('stinky cheese: lick needs 20 mood and costs 20 (cheese_stinky.js 229-262)', () => {
    assert.equal(lickButton({ mood: 19 }).reason, TEXT.needMood);
    const pc = pcAt({ mood: 20 });
    const out = lickStinkyCheese(pc);
    assert.deepEqual([pc.mood, out.consume, out.ok], [0, 0, true]);
  });
  it('very, very stinky: prod 50 mood; sniff needs 51 energy: +50 mood, -50 energy, 10 iMG, half the time the cheese goes', () => {
    assert.equal(prodButton({ mood: 49 }).reason, 'You need more mood do that.');
    assert.equal(vvSniffButton({ energy: 50 }).reason, TEXT.tooWeak);
    const pc = pcAt({ mood: 60 });
    prodCheese(pc);
    assert.equal(pc.mood, 10);
    const s = pcAt({ energy: 60, mood: 25 });
    const kept = sniffVeryStinkyCheese(s, () => 0.6);
    assert.deepEqual([s.mood, s.energy, kept.consume], [75, 10, 0]);
    assert.equal(s.imagination, 10);
    const gone = sniffVeryStinkyCheese(pcAt({ energy: 90 }), () => 0.4);
    assert.equal(gone.consume, 1);
    assert.ok(gone.message.includes(TEXT.destroyed));
  });
  it('cheese: 6+ energy, +10 mood -5 energy, 3 in 10 the wedge goes (cheese.js 278-344)', () => {
    assert.equal(cheeseSniffButton({ energy: 5 }).reason, TEXT.tooWeak);
    assert.equal(cheeseSniffButton({ energy: 6 }).tooltip, 'Inspect with nose. Gives 10 mood and costs 5 energy');
    const pc = pcAt({ mood: 40 });
    assert.equal(sniffCheese(pc, () => 0.29).consume, 1);
    assert.equal(sniffCheese(pc, () => 0.3).consume, 0);
    assert.deepEqual([pc.mood, pc.energy], [60, 70]);
  });
  it('butterfly milk: 40 or less +12 and the bottle goes; crossing 40 also fails (milk_butterfly.js 225-250)', () => {
    const down = pcAt({ mood: 20 });
    const ok = sniffMilk(down);
    assert.deepEqual([down.mood, ok.consume, ok.ok], [32, 1, true]);
    const cross = pcAt({ mood: 35 });
    const both = sniffMilk(cross);
    assert.deepEqual([cross.mood, both.consume, both.ok], [47, 1, false]);
    assert.ok(both.message.includes(TEXT.milkSniff) && both.message.includes(TEXT.milkUp));
    const up = pcAt({ mood: 41 });
    const no = sniffMilk(up);
    assert.deepEqual([up.mood, no.consume, no.ok], [41, 0, false]);
  });
  it("licorice's own eat: -3 energy, +5 mood, 1 iMG with the bonus (stats_add_xp(1, false)), no food (licorice.js 172-215)", () => {
    const pc = pcAt();
    const out = eatLicorice(pc);
    assert.deepEqual([pc.energy, pc.mood, pc.imagination, out.consume], [77, 80, 1, 1]);
    assert.equal(out.message, `You ate a Licorice. ${TEXT.licorice} -3 Energy +5 Mood +1 iMG`);
    if (hasGsjs) assert.match(gsjs('licorice'), /var val = pc\.stats_add_xp\(1, false, context\);/);
  });
});

describe('G420 / G421 dice', () => {
  it('the 12-sided die: 11 Giants and a Rook, refused under 50 mood (dice_12sided.js 155-159, config_base.js 165-177)', () => {
    assert.equal(DIE_FACES.length, 12);
    assert.equal(DIE_FACES.at(-1), 'rook');
    if (hasGsjs) {
      const cfg = readFileSync(join(GSJS, 'config_base.js'), 'utf8');
      const giants = /var giants = \[([\s\S]*?)\];/.exec(cfg)[1].match(/'([a-z]+)'/g).map((g) => g.slice(1, -1));
      assert.deepEqual(DIE_FACES.slice(0, 11), giants);
    }
    assert.equal(dieButton({ mood: 49 }).reason, TEXT.dieMood);
    assert.equal(dieButton({ mood: 80 }, { rolling: true }).reason, TEXT.rolling);
  });
  it('a Rook face costs 50 mood, gives toys +3, and 15 percent asks for a rook attack', () => {
    const pc = pcAt({ mood: 80 });
    const r = dieOutcome(pc, 'rook', { rng: () => 0.1, rookable: true });
    assert.deepEqual([pc.mood, r.toys, r.attack, r.moodLine], [30, 3, true, 'You lose 50 mood for attracting the rook.']);
    assert.equal(dieOutcome(pcAt(), 'rook', { rng: () => 0.2, rookable: true }).attack, false);
    assert.equal(dieOutcome(pcAt(), 'ti').line, 'rolled "Ti"');
  });
  it('the pair: the street hears the total; 9 or more is toys +2 (dice.js 156-167)', () => {
    assert.deepEqual(pairOutcome(4, 5), { total: 9, toys: 2, line: 'rolled a 9 (4 and a 5)' });
    assert.equal(pairOutcome(4, 4).toys, 0);
  });
  it('feature: Roll, the left die at 1 s, the right at 2 s, done at 6 s; no second roll meanwhile', () => {
    const { engine, calls } = fakeEngine({ inv: { dice: 1 } });
    const t0 = Date.now();
    assert.ok(runMoreVerb(engine, 'dice', 'roll', { dice: '6,3' }).rolling);
    assert.equal(itemVerbsMoreFeature.packVerbs('dice', engine)[0].reason, TEXT.rolling);
    itemVerbsMoreFeature.onTick(16, t0 + 1050, engine);
    assert.equal(itemVerbsMoreFeature._state().rolling.dice.left, 6);
    itemVerbsMoreFeature.onTick(16, t0 + 2050, engine);
    assert.ok(calls.said.includes('Ur rolled a 9 (6 and a 3)'));
    assert.deepEqual(calls.feats, ['tottlys_toys+2']);
    itemVerbsMoreFeature.onTick(16, t0 + 6100, engine);
    assert.equal(itemVerbsMoreFeature._state().rolling.dice, null);
    assert.ok(calls.achievements.includes('dice:roll=1'));
  });
  it('feature: the 12-sided die lands at 2 s; a Rook asks summonRook only on the 15 percent', () => {
    const { engine, calls } = fakeEngine({ inv: { dice_12sided: 1 }, pc: pcAt({ mood: 90 }) });
    const t0 = Date.now();
    runMoreVerb(engine, 'dice_12sided', 'roll', { face: 'rook' });
    itemVerbsMoreFeature.onTick(16, t0 + 2050, engine);
    assert.ok(calls.said.includes('Ur rolled a Rook! RUNNNN!!!!!'));
    assert.ok(calls.said.includes('You lose 50 mood for attracting the rook.'));
    assert.equal(engine.pc.mood, 40);
    assert.deepEqual(calls.feats, ['tottlys_toys+3']);
    assert.equal(itemVerbsMoreFeature._state().daily.rookSummons, 1);
  });
});

describe('G424 Juju Shoo-Shoo Powder, G426 Butterfly Net, G427 Dusty Stick', () => {
  it('no Juju boss: the blow fails and the charge stays (juju_shoo_shoo_powder.js 272-275, 330)', () => {
    const out = blowJujuPowder(null);
    assert.deepEqual([out.ok, out.charges], [false, 5]);
    assert.equal(out.message, `You tried to blow on a Juju Shoo-Shoo Powder. ${TEXT.noJujus}`);
    const hit = blowJujuPowder(1, { bossHere: true });
    assert.deepEqual([hit.ok, hit.charges, hit.emptied], [true, 0, true]);
  });
  it('net: a butterfly within 500 px waits for 10 energy and 1 wear; none costs nothing (butterfly_net.js 94-110)', () => {
    const pc = pcAt();
    const none = attractWithNet(pc, null, null);
    assert.deepEqual([none.ok, none.points, pc.energy], [false, 100, 80]);
    assert.equal(none.message, `You tried to attract with a Butterfly Net. ${TEXT.noButterflies}`);
    const ok = attractWithNet(pc, 1, { classId: 'npc_butterfly' });
    assert.deepEqual([ok.ok, ok.points, pc.energy], [true, 0, 70]);
  });
  it('feature: the attracted butterfly follows you until a verb on a butterfly ends the wait', () => {
    const b = { x: 900, y: 300, baseY: 300, _ambient: true, scale: { x: 1, y: 1 }, baseScale: 1 };
    const target = { classId: 'npc_butterfly', sprite: b };
    const far = { classId: 'npc_butterfly', sprite: { x: 1100, y: 300, scale: { x: 1, y: 1 } } };
    const { engine } = fakeEngine({ inv: { butterfly_net: 1 }, interactables: [far, target] });
    runMoreVerb(engine, 'butterfly_net', 'attract');
    assert.equal(itemVerbsMoreFeature._state().attracted, true);
    for (let i = 0; i < 120; i += 1) itemVerbsMoreFeature.onTick(16, Date.now(), engine);
    assert.ok(Math.abs(b.x - 480) < 5 && Math.abs(b.y - 300) < 16, `beside you: ${b.x},${b.y}`);
    itemVerbsMoreFeature.onEvent('npc_butterfly:massage', 1, engine);
    assert.equal(itemVerbsMoreFeature._state().attracted, false);
    assert.equal(itemVerbsMoreFeature._state().netPoints, 99);
  });
  it('dusty stick: only when full; a point back every 12 minutes (dusty_stick.js 286-288, 313-320)', () => {
    const t = 1_000_000_000;
    assert.equal(stickPoints(null, t), 20);
    assert.equal(stickPoints(t - 11 * 60 * 1000, t), 0);
    assert.equal(stickPoints(t - 12 * 60 * 1000 * 7, t), 7);
    assert.equal(stickButton(t - DUSTY_STICK.rechargeMs * 19, t).reason, TEXT.stickNotReady);
    assert.equal(stickButton(t - DUSTY_STICK.rechargeMs * 20, t).enabled, true);
  });
  it('the Bundle of Joy walks right first, doubles, grows by half, dies at 20 s and leaves a Fiber', () => {
    assert.deepEqual(joyNextLeg({ dir: 'left', moveDistance: 100, x: 500 }), { dir: 'right', moveDistance: 200, toX: 700 });
    assert.deepEqual(joyNextLeg({ dir: 'right', moveDistance: 300, x: 700 }), { dir: 'left', moveDistance: 300, toX: 400 });
    assert.equal(joyNextLeg({ dir: 'right', moveDistance: 900, x: 100 }, { left: 0, right: 3000 }).toX, 50);
    const { engine, calls } = fakeEngine({ inv: { dusty_stick: 1 } });
    runMoreVerb(engine, 'dusty_stick', 'unleash');
    assert.equal(itemVerbsMoreFeature.packVerbs('dusty_stick', engine)[0].reason, TEXT.stickNotReady);
    const born = itemVerbsMoreFeature._state().joys[0].bornAt;
    for (let ms = 0; ms <= 23_100; ms += 100) itemVerbsMoreFeature.onTick(100, born + ms, engine);
    assert.ok(calls.said.includes(BUNDLE_OF_JOY.ceased));
    assert.equal(calls.drops.length, 1);
    assert.match(calls.drops[0], /^fiberx1@/);
    assert.equal(itemVerbsMoreFeature._state().joys.length, 0);
  });
});

describe('G434 Street Creator trophy pieces: smash', () => {
  it('every piece pays its classProps smash_green / blue / shiny', { skip: !hasGsjs }, () => {
    for (const fam of ['earth', 'rock', 'dirt', 'wood']) {
      for (let n = 1; n <= 5; n += 1) {
        const cls = `trophy_street_creator_${fam}_piece${n}`;
        const body = gsjs(cls);
        const prop = (k) => Number(new RegExp(`"${k}"\\s*:\\s*"(\\d+)"`).exec(body)[1]);
        const def = trophySmash(cls);
        assert.deepEqual([def.green, def.blue, def.shiny], [prop('smash_green'), prop('smash_blue'), prop('smash_shiny')], cls);
        assert.equal(def.name, /var name_single = "([^"]*)"/.exec(body)[1]);
      }
    }
    assert.equal(trophySmash('trophy_street_creator_earth'), null);
  });
  it('needs a pouch; what does not fit is reported destroyed', () => {
    assert.equal(smashButton('trophy_street_creator_wood_piece3').reason, TEXT.needPouch);
    const out = smashTrophy('trophy_street_creator_wood_piece3', { element_green: 300, element_blue: 100, element_shiny: 0 });
    assert.deepEqual(out.give, { element_green: 300, element_blue: 100 });
    assert.equal(out.message, "You smashed A Piece of Street Creator Wood Trophy. 350 Blue Elements were created, but destroyed, because you couldn't carry them. 550 Shiny Elements were created, but destroyed, because you couldn't carry them. You received 300 Green Elements and 100 Blue Elements.");
  });
});

describe('G407 Factory Defect Chick and G433 the mailed Hog-tied Piggy', () => {
  it('races in place 2-10 s, says it is broken, and is back in the pack 3 s later', () => {
    assert.equal(defectRaceSecs(() => 0), 2);
    assert.equal(defectRaceSecs(() => 0.999), 10);
    const { engine, calls } = fakeEngine({ inv: { npc_cubimal_factorydefect_chick: 1 } });
    const t0 = Date.now();
    runMoreVerb(engine, 'npc_cubimal_factorydefect_chick', 'race', { secs: 4 });
    assert.equal(engine.inv.npc_cubimal_factorydefect_chick, 1, 'stays counted in the pack (no ledger loss and gain)');
    assert.deepEqual(itemVerbsMoreFeature.packVerbs('npc_cubimal_factorydefect_chick', engine), []);
    assert.ok(calls.sounds.includes('CUBIMAL_WIND_UP'));
    itemVerbsMoreFeature.onTick(16, t0 + 2050, engine);
    assert.equal(itemVerbsMoreFeature._state().defect.phase, 'race');
    itemVerbsMoreFeature.onTick(16, t0 + 6050, engine);
    assert.ok(calls.said.includes(DEFECT_CHICK.broken));
    assert.ok(calls.sounds.includes('CUBIMAL_WIND_DOWN'));
    itemVerbsMoreFeature.onTick(16, t0 + 9100, engine);
    assert.equal(engine.inv.npc_cubimal_factorydefect_chick, 1);
    assert.equal(itemVerbsMoreFeature._state().defect, null);
  });
  it('a hog-tied piggy with no timer gets the frog-delivery one: 1 in 6 with Herdkeeping, 1 in 3 without', () => {
    assert.equal(frogDeliveryEscapeChance(['herdkeeping_1']), 0.16666667);
    assert.equal(frogDeliveryEscapeChance([]), 0.33333333);
    if (hasGsjs) assert.match(gsjs('hogtied_piggy'), /escape_chance = 0\.33333333;/);
    const { engine } = fakeEngine({ inv: { hogtied_piggy: 1 } });
    const t = Date.now();
    itemVerbsMoreFeature.onTick(16, t, engine);
    const h = husbandryPack().hogtie;
    assert.ok(h && h.escapeAt > t && h.escapeAt % (5 * 60 * 1000) === t % (5 * 60 * 1000));
    assert.equal(itemVerbsMoreFeature._state().last, 'hogtied_piggy:delivered:1in3');
  });
});

describe('G430 Draught of Wisdom, G431 Rocky Regeneration Solution, G428 Alphabet Sauce (potions)', () => {
  it('the three potions have their GSJS verb, uses, tooltip and name', { skip: !hasGsjs }, () => {
    for (const cls of ['potion_xp', 'potion_rocky_regeneration_solution', 'potion_alphabet_sauce']) {
      const body = gsjs(cls);
      const p = (k) => new RegExp(`"${k}"\\s*:\\s*"([^"]*)"`).exec(body)?.[1];
      const def = POTIONS[cls];
      assert.equal(def.verb, p('can_quaff') === '1' ? 'quaff' : 'pour');
      assert.equal(String(def.capacity), p('points_capacity'));
      assert.equal(def.tooltip, p(def.verb === 'quaff' ? 'quaff_tooltip' : 'pour_tooltip'));
    }
    assert.ok(gsjs('potion_xp').includes(POTION_TEXT.wisdomLevel) && gsjs('potion_xp').includes(POTION_TEXT.wisdomDaily));
    const rocky = gsjs('potion_rocky_regeneration_solution').replace(/\\'/g, "'");
    for (const k of ['rockyAward', 'noRocks', 'rockFine', 'rockRegenerated']) assert.ok(rocky.includes(POTION_TEXT[k]), k);
    assert.ok(gsjs('potion_alphabet_sauce').includes(POTION_TEXT.sauceAsk));
    assert.match(readFileSync(join(GSJS, 'achievements/shiny_nugget_award.js'), 'utf8'), /value\s*: "2003"/);
  });
  it('wisdom: level 20, once a game day, 500 iMG with no mood bonus', () => {
    assert.equal(wisdomCheck({ level: 19 }).error, POTION_TEXT.wisdomLevel);
    assert.equal(wisdomCheck({ level: 20, quaffedToday: true }).error, POTION_TEXT.wisdomDaily);
    assert.equal(wisdomMessage(WISDOM.xp), '+500 xp');
    const { engine } = fakeEngine({ inv: { potion_xp: 1 }, pc: pcAt({ mood: 5, xp: levelXp(20) }) });
    usePotionNow(engine, 'potion_xp');
    potionsFeature._complete(engine);
    assert.equal(engine.pc.imagination, 500, 'stats_add_xp(500, true): no bonus, even at 5 mood');
    assert.equal(potionsFeature._state().uses.potion_xp, 4);
    assert.equal(potionsFeature.packVerbs('potion_xp', engine)[0].reason, POTION_TEXT.wisdomDaily);
  });
  it('rocky: the award, a rock with fewer than 50 chunks within 200 px, set back to 50', () => {
    assert.equal(rockyCheck({ hasAward: false, rock: { chunksRemaining: 3 } }).error, POTION_TEXT.rockyAward);
    assert.equal(rockyCheck({ hasAward: true, rock: null }).error, POTION_TEXT.noRocks);
    assert.equal(rockyCheck({ hasAward: true, rock: { chunksRemaining: 50 } }).error, POTION_TEXT.rockFine);
    const rock = { chunksRemaining: 12 };
    regenerateRock(rock);
    assert.equal(rock.chunksRemaining, ROCKY.chunks);
    const target = { classId: 'rock_metal_1', state: { rock: { chunksRemaining: 9, depleted: false } }, sprite: { x: 620, y: 400 } };
    const { engine, calls } = fakeEngine({ inv: { potion_rocky_regeneration_solution: 1 }, interactables: [target], unlockedAchievements: [ROCKY.award] });
    usePotionNow(engine, 'potion_rocky_regeneration_solution');
    potionsFeature._complete(engine);
    assert.equal(target.state.rock.chunksRemaining, 50);
    assert.ok(calls.said.includes('You poured a Rocky Regeneration Solution. The rock now looks as good as new!'));
  });
  it('alphabet sauce: letters only, 3 to 140 characters; a puddle and a letter over your head', () => {
    assert.equal(sauceWord('Hello World'), 'helloworld');
    assert.equal(sauceInputOk('hi'), false);
    assert.equal(sauceInputOk('hi there'), true);
    assert.equal(sauceInputOk('no 9s'), false);
    assert.equal(sauceLabel('glitch'), 'Alphabet Sauce spelling glitch');
    assert.equal(sauceStreetLine('Ur', 'glitch'), 'Ur poured an Alphabet Sauce to try and spell: glitch');
    assert.equal(LETTER_WEIGHTS.length, 101);
    assert.equal(rollSauceLetter(() => 0), 'A');
    assert.equal(rollSauceLetter(() => 0.995), '1', 'randInt(0, length) can read past the end');
    assert.equal(rollSauceLetter(() => 100.5 / 102), 'heart');
    const item = { x: 500, y: 400 };
    assert.ok(inSauce(item, 720, 400) && !inSauce(item, 730, 400));
    assert.ok(nearSauce(item, 500, 0) && !nearSauce(item, 500, -60));
    // No conditions on the override: even the dead may pour.
    assert.equal(potionButton('potion_alphabet_sauce', { dead: true }).enabled, true);
    const { engine } = fakeEngine({ inv: { potion_alphabet_sauce: 1 } });
    pourSauce(engine, 'hi there');
    potionsFeature._complete(engine);
    const st = potionsFeature._state();
    assert.equal(st.sauces.length, 1);
    assert.equal(st.sauces[0].word, 'hithere');
    assert.ok(st.letter, 'you stand in it: a letter');
    assert.equal(engine.inv.potion_alphabet_sauce, 0);
    // Leaving the street with the sauce still there takes the letter away (onPlayerExit).
    potionsFeature.onStreetClear(engine);
    assert.equal(potionsFeature._state().letter, null);
  });
  it('the sauce pour is never refused near a signpost: its canPour is never called', { skip: !hasGsjs }, () => {
    const body = gsjs('potion_alphabet_sauce');
    const verb = /verbs\.pour = \{[\s\S]*?\n\};/.exec(body)[0];
    assert.equal(/"conditions"/.test(verb), false);
    assert.equal((body.match(/this\.canPour\(/g) || []).length, 0);
  });
});

describe('wiring', () => {
  it('licorice: the pack asks the feature before the food Eat (game.js packUseInfo / runPackUse)', () => {
    const game = src('game.js');
    assert.match(game, /const featureUse = features\.query\('packUseInfo', classTsid, engine\);\n  if \(featureUse\) return featureUse;/);
    assert.match(game, /if \(features\.query\('runPackUse', classTsid, engine\) === true\) return;/);
    const { engine } = fakeEngine({ inv: { licorice: 2 } });
    assert.equal(itemVerbsMoreFeature.packUseInfo('licorice', engine).verb, 'Eat');
    assert.equal(itemVerbsMoreFeature.packUseInfo('garlic', engine), null);
    assert.equal(itemVerbsMoreFeature.runPackUse('licorice', engine), true);
    assert.equal(engine.inv.licorice, 1);
    assert.ok(eatLicoriceNow(engine));
    assert.equal(engine.inv.licorice, 0);
  });
  it('the feature is registered and the potions keys moved together', () => {
    const index = src('js/features/index.js');
    assert.match(index, /import \{ itemVerbsMoreFeature \} from '\.\/item-verbs-more-feature\.js\?v=[0-9a-f]{8}'; FEATURES\.push\(itemVerbsMoreFeature\);/);
    assert.match(index, /potions-feature\.js\?v=[0-9a-f]{8}/);
    assert.match(src('js/features/potions-feature.js'), /from '\.\.\/potions\.js\?v=[0-9a-f]{8}'/);
  });
  it('save and restore keep the jar, the net, the stick and the day', () => {
    const { engine } = fakeEngine({ inv: { dusty_stick: 1, butterfly_net: 1 }, interactables: [{ classId: 'npc_butterfly', sprite: { x: 520, y: 380, scale: { x: 1, y: 1 } } }] });
    runMoreVerb(engine, 'butterfly_net', 'attract');
    runMoreVerb(engine, 'dusty_stick', 'unleash');
    const slice = JSON.parse(JSON.stringify(itemVerbsMoreFeature.save()));
    itemVerbsMoreFeature._reset();
    itemVerbsMoreFeature.restore(slice);
    const st = itemVerbsMoreFeature._state();
    assert.equal(st.netPoints, 99);
    assert.ok(Number.isFinite(st.stickEmptiedAt));
  });
});
