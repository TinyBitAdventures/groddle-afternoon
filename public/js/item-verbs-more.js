/**
 * More pack verbs the original gave single items (register rows G406-G434),
 * as pure rules. js/features/item-verbs-more-feature.js binds them to the
 * pack and the street.
 *
 * Every rule is transcribed from that item's own verb in GameServerJS
 * (items/<class>.js verbs.<verb>: conditions, handler); the line numbers are
 * beside each one. A verb that succeeds runs item.js:719 notifyVerb, which
 * counts `<class>:<verb>` and `VERB:<verb>:<class>` (item-verbs.js
 * itemVerbAchievementCounters). The activity line is item.js:26
 * buildVerbMessage: "You sniffed a Rasher of Bacon." (or "You tried to ..."
 * when the verb failed), each flavour message, then the effects on yourself
 * ("+5 Mood -5 Energy +4 iMG", transformEffects 136-187).
 *
 * Effects on other players in the street (bacon.js 109-120, garlic.js
 * 130-156, the dice's location activity) need the realtime server and are
 * left out here; a solo street has nobody else in it.
 */

import { grantMoodXp } from './mood-xp.js?v=958e7680';
import { gainMetabolic, loseEnergy, loseMood } from './metabolics.js?v=8504134e';

/* ------------------------------------------------------------------ */
/* Names and the activity line                                          */
/* ------------------------------------------------------------------ */

const named = (name, article, plural) => Object.freeze({ name, article, plural });

/** var name_single / article / name_plural of each item here. */
export const ITEM_NAMES = Object.freeze({
  antique_spigot: named('Antique Spigot', 'an', 'Antique Spigots'),
  broccoli: named('Broccoli', 'a', 'Broccoli'),
  bacon: named('Rasher of Bacon', 'a', 'Rashers of Bacon'),
  banana: named('Banana', 'a', 'Bananas'),
  butterfly_lotion: named('Butterfly Lotion', 'a', 'Butterfly Lotions'),
  boot: named('Boot', 'a', 'Boots'),
  hard_bubble: named('Hard Bubble', 'a', 'Hard Bubbles'),
  element_blue: named('Blue Element', 'a', 'Blue Elements'),
  element_green: named('Green Element', 'a', 'Green Elements'),
  element_red: named('Red Element', 'a', 'Red Elements'),
  element_shiny: named('Shiny Element', 'a', 'Shiny Elements'),
  cheese: named('Cheese', 'a', 'Cheeses'),
  cheese_stinky: named('Stinky Cheese', 'a', 'Stinky Cheese'),
  cheese_very_very_stinky: named('Very, Very Stinky Cheese', 'a', 'Very, Very Stinky Cheese'),
  milk_butterfly: named('Butterfly Milk', 'a', 'Butterfly Milks'),
  licorice: named('Licorice', 'a', 'Licorice'),
  dice: named('Pair of Dice', 'a', 'Pair of Dice'),
  dice_12sided: named('12-sided Die', 'a', '12-sided Dice'),
  juju_shoo_shoo_powder: named('Juju Shoo-Shoo Powder', 'a', 'Juju Shoo-Shoo Powder'),
  butterfly_net: named('Butterfly Net', 'a', 'Butterfly Nets'),
  dusty_stick: named('Dusty Stick', 'a', 'Dusty Sticks'),
  npc_cubimal_factorydefect_chick: named('Factory Defect Chick Cubimal', 'a', 'Factory Defect Chick Cubimals'),
  npc_bundle_of_joy: named('Bundle of Joy', 'a', 'Bundles of Joy'),
});

/** item.js transformEffects: metabolic_inc / metabolic_dec / xp_give. */
export function formatEffects(effects = []) {
  const out = [];
  for (const e of effects) {
    const v = Math.abs(Number(e.value) || 0);
    if (!v) continue;
    if (e.type === 'xp_give') out.push(`+${v} iMG`);
    else if (e.type === 'metabolic_inc') out.push(`+${v} ${capitalize(e.which)}`);
    else if (e.type === 'metabolic_dec') out.push(`-${v} ${capitalize(e.which)}`);
  }
  return out.join(' ');
}

function capitalize(s) {
  const t = String(s || '');
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : t;
}

/**
 * item.js:26 buildVerbMessage(count, verb, verb_past, failed, msgs, self_effects).
 * Flavour messages are joined with a space each (buildSimpleVerbMessage 88-90);
 * the remake trims the trailing space and doubled spaces.
 */
export function verbMessage(classTsid, { verb, past, failed = false, msgs = [], effects = [], count = 1 } = {}) {
  const def = ITEM_NAMES[classTsid] || named(classTsid, 'a', classTsid);
  let msg = `You ${failed ? `tried to ${verb}` : past} `;
  msg += count > 1 ? `${count} ${def.plural}. ` : `${def.article} ${def.name}. `;
  for (const m of msgs) if (m) msg += `${m} `;
  msg += formatEffects(effects);
  return msg.replace(/\s+/g, ' ').trim();
}

/* ------------------------------------------------------------------ */
/* Small helpers that mutate the player as the source calls do          */
/* ------------------------------------------------------------------ */

const num = (v) => Number(v) || 0;
const chance = (rng, p) => rng() < p;

function addMood(pc, n, effects) {
  // metabolics_add_mood: nothing while dead, capped at the tank (G259).
  const v = gainMetabolic(pc, 'mood', n);
  if (v) effects.push({ type: 'metabolic_inc', which: 'mood', value: v });
  return v;
}

function subMood(pc, n, effects) {
  const v = loseMood(pc, n);
  if (v) effects.push({ type: 'metabolic_dec', which: 'mood', value: v });
  return v;
}

function subEnergy(pc, n, effects) {
  const v = loseEnergy(pc, n);
  if (v) effects.push({ type: 'metabolic_dec', which: 'energy', value: v });
  return v;
}

function addXp(pc, n, effects) {
  // stats_add_xp(n, false): the mood bonus applies (inc_stats.js 260-272, js/mood-xp.js).
  const v = grantMoodXp(pc, n);
  if (v) effects.push({ type: 'xp_give', which: '', value: v });
  return v;
}

/**
 * One verb's result. `consume` is how many of the item go (apiDelete of the
 * one the verb acted on, or the whole stack for a disperse); `give` items to
 * add to the pack.
 */
function result(classTsid, verb, past, { failed = false, msgs = [], effects = [], consume = 0, give = null, count = 1, extra = {} } = {}) {
  return {
    ok: !failed,
    consume,
    give,
    effects,
    message: verbMessage(classTsid, { verb, past, failed, msgs, effects, count }),
    ...extra,
  };
}

/* ------------------------------------------------------------------ */
/* The verbs                                                            */
/* ------------------------------------------------------------------ */

export const TEXT = Object.freeze({
  // antique_spigot.js 156-237, 66-155, 239-283
  spigotDrained: 'You drained off some of your mood and learned something from it.',
  spigotMood: 'You are not in a good enough mood to do that.',
  spigotCollect: 'You already collected this!',
  spigotContemplate: 'It takes sooooooooooooo long to make a game :(',
  spigotSpin: "That doesn't do anything.",
  // broccoli.js 55-74
  broccoli: 'Broccoli activated. It goes and does its thing.',
  broccoliTired: "You can't activate any more broccoli today. Your broccoli-activating finger is tired. Go stimulate a different vegetable.",
  // bacon.js 116 (to the other players here)
  baconOthers: 'Something smells delicious.',
  // banana.js 155-171
  bananaSquash: "Oops, you squashed it! You can't just go to town on a Banana like that; you have to be delicate.",
  bananaSmooth: 'Feels so smooth!',
  bananaMature: "You've matured beyond public banana fondling.",
  // butterfly_lotion.js 286, 322
  lotionNotNow: "You can't taste this right now.",
  lotionTaste: "You tried to taste a little but you ended up tasting a lot! And now it's gone! Oddly mood enhancing though.",
  // boot.js 58-77
  bootOil: 'You found Olive Oil inside!',
  bootHoney: 'You found Honey inside!',
  bootXp: 'You found some spare imagination inside!',
  // hard_bubble.js 103, 116
  bubbleLearn: 'Interesting. These bubbles are hard to pop, but you definitely seemed to learn a thing or two.',
  bubbleFun: "Popping bubbles is fun, but you've already learned all you can from it.",
  // element_*.js 131-133
  disperse: 'Those elements done gone back to the universe.',
  // cheese_stinky.js 243-262
  lick: 'Awesome. Now you have stink-tongue.',
  stinkySniff: "Yup. That's stinky cheese all right.",
  needMood: 'You need more mood to do that.',
  // cheese_very_very_stinky.js 147, 155-171, 208-247
  needMoodProd: 'You need more mood do that.',
  prod: "Not a good idea. It's going to take a while for that finger-stink to wear off.",
  vvSniff: 'At first sniff, this is one of the worst olfactory experiences of your life. On your second sniff, you experience an epiphany, which you forget almost immediately.',
  tooWeak: 'You are too weak to do that.',
  destroyed: 'The cheese was destroyed by your intense sniffing.',
  // cheese.js 321
  cheeseSniff: 'It smells fairly nice. It might smell nicer if you aged it.',
  // milk_butterfly.js 229, 247
  milkSniff: 'Butterfly milk smells like perfume from France. You experience a momentary surge of elation.',
  milkUp: "Sniffing Butterfly Milk only works when you're feeling down.",
  // licorice.js 181
  licorice: "So... very... chewy. You're going to be picking licorice out of your teeth for days.",
  // dice.js 104, dice_12sided.js 155-159, 201-214
  rolling: "Already rollin'",
  dieMood: 'You need more mood to do that',
  // juju_shoo_shoo_powder.js 274, 312
  noJujus: "Are you sure you want to do this? There are no Jujus nearby right now. Once you blow on the Shoo-Shoo Powder, it's gone forever.",
  jujusFlee: "Ha! As intended, the powder blows into the Jujus's eyes, causing smarting and general grouchiness. The Jujus flee, thwarted. For the moment.",
  outOfCharges: 'This powder is out of charges.',
  // butterfly_net.js 83, 106
  netBroken: 'This Butterfly Net has become broken, and must be repaired.',
  noButterflies: 'There are no Butterflies nearby.',
  // dusty_stick.js 287
  stickNotReady: 'Your stick is not ready!',
  // trophy_piece verbs.smash 50
  needPouch: "You'll need an elemental pouch to collect the pieces.",
});

/** Pack buttons: { id, label, tooltip, enabled, reason, primary }. */
const button = (id, label, tooltip, reason = '', primary = false) => ({ id, label, tooltip, enabled: !reason, reason, primary });

/* ---- G406 Antique Spigot (antique_spigot.js) ---------------------- */

export const SPIGOT_VERBS = Object.freeze([
  { id: 'collect', label: 'Collect', tooltip: 'Collect this previous artifact', past: 'collected', line: TEXT.spigotCollect },
  { id: 'contemplate', label: 'Contemplate', tooltip: 'Gain a precious insight', past: 'contemplated', line: TEXT.spigotContemplate },
  { id: 'applytoforehead', label: 'Apply to forehead', tooltip: "Do the good ol' forehead applyin'", verb: 'apply to forehead', past: 'applied to forehead' },
  { id: 'spin', label: 'Spin', tooltip: 'Spin the spigot. Spingot!', past: 'spun', line: TEXT.spigotSpin },
]);

/**
 * verbs.applytoforehead 193-235: with 51 or more mood, lose 50 and learn 20
 * (the mood bonus applies after the loss); the mood is read again after, so
 * a drain that leaves 50 or less also says the not-in-a-good-mood line. The
 * verb never fails. The other three only print their joke.
 */
export function spigotVerb(pc, verbId) {
  const def = SPIGOT_VERBS.find((v) => v.id === verbId);
  if (!def) return null;
  if (verbId !== 'applytoforehead') return result('antique_spigot', def.id, def.past, { msgs: [def.line] });
  const msgs = [];
  const effects = [];
  if (num(pc.mood) >= 51) {
    subMood(pc, 50, effects);
    addXp(pc, 20, effects);
    msgs.push(TEXT.spigotDrained);
  }
  if (num(pc.mood) <= 50) msgs.push(TEXT.spigotMood);
  return result('antique_spigot', def.verb, def.past, { msgs, effects });
}

/* ---- G408 Broccoli: activate (broccoli.js 31-84) -------------------- */

/** achievements_get_daily_label_count('activate', 'broccoli') <= 100 still pays. */
export const BROCCOLI_DAILY_MAX = 100;

export function broccoliButton() {
  return button('activate', 'Activate', 'Full vegetable actualization');
}

/** The floret is deleted either way; 4 iMG with the mood bonus while today's count is 100 or less. */
export function activateBroccoli(pc, activatedToday = 0) {
  const effects = [];
  if (num(activatedToday) <= BROCCOLI_DAILY_MAX) {
    addXp(pc, 4, effects);
    return result('broccoli', 'activate', 'activated', { msgs: [TEXT.broccoli], effects, consume: 1, extra: { counted: true } });
  }
  return result('broccoli', 'activate', 'activated', { failed: true, msgs: [TEXT.broccoliTired], consume: 1, extra: { counted: false } });
}

/* ---- G409 Bacon: sniff (bacon.js 30-128) ---------------------------- */

export function baconButton() {
  return button('sniff', 'Sniff', 'Gives 5 mood, costs 5 energy');
}

/** With 10 or more energy: +5 mood, -5 energy. The rasher stays; the verb never fails. */
export function sniffBacon(pc) {
  const effects = [];
  if (num(pc.energy) >= 10) {
    addMood(pc, 5, effects);
    subEnergy(pc, 5, effects);
  }
  return result('bacon', 'sniff', 'sniffed', { effects });
}

/* ---- G410 Banana: caress (banana.js 133-181) ------------------------ */

export function bananaButton() {
  return button('caress', 'Caress', 'If you treat the banana well, it may improve your mood');
}

/** Level 10 or below: a 1-in-3 squash (the banana goes), else +5 mood. Level 11 up: refused. */
export function caressBanana(pc, level, rng = Math.random) {
  const effects = [];
  const msgs = [];
  let failed = false;
  let consume = 0;
  if (num(level) <= 10) {
    if (chance(rng, 0.3333)) {
      msgs.push(TEXT.bananaSquash);
      consume = 1;
      failed = true;
    } else {
      addMood(pc, 5, effects);
      msgs.push(TEXT.bananaSmooth);
    }
  }
  if (num(level) >= 11) {
    msgs.push(TEXT.bananaMature);
    failed = true;
  }
  return result('banana', 'caress', 'caressed', { failed, msgs, effects, consume });
}

/* ---- G411 Butterfly Lotion: taste (butterfly_lotion.js 274-338) ----- */

export function lotionButton({ newxpOrSkillQuest = false } = {}) {
  return button('taste', 'Taste', 'Lotion is not for eating', newxpOrSkillQuest ? TEXT.lotionNotNow : '');
}

/** +12 mood and the tube is gone. */
export function tasteLotion(pc) {
  const effects = [];
  addMood(pc, 12, effects);
  return result('butterfly_lotion', 'taste', 'tasted', { msgs: [TEXT.lotionTaste], effects, consume: 1 });
}

/* ---- G414 Boot: inspect (boot.js 29-83) ----------------------------- */

export function bootButton() {
  return button('inspect', 'Inspect', 'Inspect the boot');
}

/**
 * Two draws in source order: imgRandom = floor(r*10)+6 (6..15), then
 * random = floor(r*10)+1. 1-3 Olive Oil, 4-6 Honey, else the iMG. The boot is deleted.
 */
export function inspectBoot(pc, rng = Math.random) {
  const imgRandom = Math.floor(rng() * 10) + 6;
  const roll = Math.floor(rng() * 10) + 1;
  const effects = [];
  if (roll <= 3) return result('boot', 'inspect', 'inspected', { msgs: [TEXT.bootOil], consume: 1, give: { olive_oil: 1 } });
  if (roll <= 6) return result('boot', 'inspect', 'inspected', { msgs: [TEXT.bootHoney], consume: 1, give: { honey: 1 } });
  addXp(pc, imgRandom, effects);
  return result('boot', 'inspect', 'inspected', { msgs: [TEXT.bootXp], effects, consume: 1, extra: { imgRandom } });
}

/* ---- G415 Hard Bubble: pop (hard_bubble.js 30-148) ------------------ */

export function bubbleButton(level) {
  return button('pop', 'Pop', num(level) >= 4 ? 'Popping bubbles is old hat' : 'You can learn something this way');
}

/** Level 4 or below: -1 energy, +20 iMG. Level 5 up: -5 energy, +5 mood. The bubble goes. */
export function popBubble(pc, level, count = 1) {
  const n = Math.max(1, Math.floor(num(count) || 1));
  const effects = [];
  const msgs = [];
  if (num(level) <= 4) {
    subEnergy(pc, 1 * n, effects);
    addXp(pc, 20 * n, effects);
    msgs.push(TEXT.bubbleLearn);
  }
  if (num(level) >= 5) {
    subEnergy(pc, 5 * n, effects);
    msgs.push(TEXT.bubbleFun);
    addMood(pc, 5 * n, effects);
  }
  return result('hard_bubble', 'pop', 'popped', { msgs, effects, consume: n, count: n });
}

/* ---- G416 Elements: disperse (element_base, element_blue.js 93-149) - */

export const ELEMENT_CLASSES = Object.freeze(['element_blue', 'element_green', 'element_red', 'element_shiny']);

export function disperseButton() {
  return button('disperse', 'Disperse', 'Elements will be destroyed');
}

/** The stack goes; stats_add_xp(count / 20, false) and "(+N iMG)" after the line. */
export function disperseElements(pc, classTsid, count) {
  const n = Math.max(1, Math.floor(num(count) || 1));
  const xp = grantMoodXp(pc, n / 20);
  return result(classTsid, 'disperse', 'dispersed', { msgs: [TEXT.disperse, `(+${xp} iMG)`], consume: n, count: n, extra: { xp } });
}

/* ---- G417 Stinky Cheese: lick (cheese_stinky.js 217-267) ------------ */

export function lickButton(pc) {
  return button('lick', 'Lick', 'Licking the stink is unwise', num(pc.mood) >= 20 ? '' : TEXT.needMood);
}

export function lickStinkyCheese(pc) {
  if (num(pc.mood) < 20) return result('cheese_stinky', 'lick', 'licked', { failed: true, msgs: [TEXT.needMood] });
  const effects = [];
  subMood(pc, 20, effects);
  return result('cheese_stinky', 'lick', 'licked', { msgs: [TEXT.lick], effects });
}

/** cheese_stinky.js 309-352 verbs.sniff: "Purely informational", the cheese stays. */
export function stinkySniffButton() {
  return button('sniff', 'Sniff', 'Purely informational');
}

export function sniffStinkyCheese() {
  return result('cheese_stinky', 'sniff', 'sniffed', { msgs: [TEXT.stinkySniff] });
}

/* ---- G418 Very, Very Stinky Cheese (cheese_very_very_stinky.js 133-254) */

export function prodButton(pc) {
  return button('prod', 'Prod', 'Caution: potential stink-finger', num(pc.mood) >= 50 ? '' : TEXT.needMoodProd);
}

export function vvSniffButton(pc) {
  return button('sniff', 'Sniff', 'Caution: potential life-altering experience', num(pc.energy) >= 51 ? '' : TEXT.tooWeak);
}

/** 50 mood or more: -50 mood, the cheese stays. */
export function prodCheese(pc) {
  if (num(pc.mood) < 50) return result('cheese_very_very_stinky', 'prod', 'prodded', { failed: true, msgs: [TEXT.needMood] });
  const effects = [];
  subMood(pc, 50, effects);
  return result('cheese_very_very_stinky', 'prod', 'prodded', { msgs: [TEXT.prod], effects });
}

/** 51 energy or more: +50 mood, -50 energy, 10 iMG (not times count), and a coin flip destroys the cheese. */
export function sniffVeryStinkyCheese(pc, rng = Math.random) {
  if (num(pc.energy) < 51) return result('cheese_very_very_stinky', 'sniff', 'sniffed', { failed: true, msgs: [TEXT.tooWeak] });
  const effects = [];
  const msgs = [TEXT.vvSniff];
  addMood(pc, 50, effects);
  subEnergy(pc, 50, effects);
  addXp(pc, 10, effects);
  let consume = 0;
  if (chance(rng, 0.5)) {
    consume = 1;
    msgs.push(TEXT.destroyed);
  }
  return result('cheese_very_very_stinky', 'sniff', 'sniffed', { msgs, effects, consume });
}

/* ---- G419 Cheese: sniff (cheese.js 278-344) ------------------------- */

export function cheeseSniffButton(pc) {
  // get_tooltip fills $mood and $energy_cost from verbs.sniff effects (10, 5).
  return button('sniff', 'Sniff', 'Inspect with nose. Gives 10 mood and costs 5 energy', num(pc.energy) >= 6 ? '' : TEXT.tooWeak);
}

/** +10 mood, -5 energy, and three times in ten the wedge is gone. */
export function sniffCheese(pc, rng = Math.random) {
  const effects = [];
  const msgs = [TEXT.cheeseSniff];
  addMood(pc, 10, effects);
  subEnergy(pc, 5, effects);
  let consume = 0;
  if (chance(rng, 0.3)) {
    consume = 1;
    msgs.push(TEXT.destroyed);
  }
  return result('cheese', 'sniff', 'sniffed', { msgs, effects, consume });
}

/* ---- G422 Butterfly Milk: sniff (milk_butterfly.js 183-258) --------- */

export function milkSniffButton() {
  return button('sniff', 'Sniff', 'Advised for curing the blues');
}

/**
 * 40 mood or less: +12 mood and the bottle goes. The mood is read again, so a
 * sniff that lifts you past 40 also says the feeling-down line and the verb
 * counts as failed.
 */
export function sniffMilk(pc) {
  const effects = [];
  const msgs = [];
  let failed = false;
  let consume = 0;
  if (num(pc.mood) <= 40) {
    msgs.push(TEXT.milkSniff);
    addMood(pc, 12, effects);
    consume = 1;
  }
  if (num(pc.mood) >= 41) {
    msgs.push(TEXT.milkUp);
    failed = true;
  }
  return result('milk_butterfly', 'sniff', 'sniffed', { failed, msgs, effects, consume });
}

/* ---- G423 Licorice: eat (licorice.js 133-216) ----------------------- */

/** licorice's own eat replaces food's (is_default); eat_bonus_img / eat_img call it too (94-131, 219-256). */
export const LICORICE_EAT = Object.freeze({ id: 'eat', label: 'Eat', tooltip: 'The taste is not for everyone' });

/** -3 energy, +5 mood, 1 iMG with the mood bonus, and the piece is gone. No food_eat. */
export function eatLicorice(pc) {
  const effects = [];
  subEnergy(pc, 3, effects);
  addMood(pc, 5, effects);
  addXp(pc, 1, effects);
  return result('licorice', 'eat', 'ate', { msgs: [TEXT.licorice], effects, consume: 1 });
}

/* ---- G420 / G421 Dice --------------------------------------------- */

/** dice.js 116-138 and dice_12sided.js 166-186: the overlays and their timers (ms). */
export const DICE = Object.freeze({
  pair: Object.freeze({ overlay: 'dice_overlay', durationMs: 6000, leftMs: 1000, rightMs: 2000, deltaY: -120, deltaX: 20, wh: 56 }),
  twelve: Object.freeze({ overlay: 'twelve_sided_die', durationMs: 6000, landMs: 2000, deltaY: -120, wh: 56 }),
});

/** config_base.js 165-177 giants, then dice_12sided.js 196-197 pushes 'rook'. */
export const DIE_FACES = Object.freeze(['alph', 'cosma', 'friendly', 'grendaline', 'humbaba', 'lem', 'mab', 'pot', 'spriggan', 'ti', 'zille', 'rook']);

export function diceButton({ rolling = false } = {}) {
  return button('roll', 'Roll', 'Roll dem bones', rolling ? TEXT.rolling : '');
}

export function dieButton(pc, { rolling = false } = {}) {
  let reason = '';
  if (rolling) reason = TEXT.rolling;
  else if (num(pc.mood) < 50) reason = TEXT.dieMood;
  return button('roll', 'Roll', 'But there are only 11 gia...', reason);
}

/** common.js 691 randInt(lo, hi), both ends included. */
export function randInt(lo, hi, rng = Math.random) {
  const r = Math.max(0, Math.min(0.999999999, num(rng())));
  return lo + Math.floor(r * (1 + hi - lo));
}

/** onDiceRollCompleteRight 156-167: the street hears the total; 9 or more is Tottly's Toys +2. */
export function pairOutcome(left, right) {
  const total = num(left) + num(right);
  return { total, toys: total >= 9 ? 2 : 0, line: `rolled a ${total} (${left} and a ${right})` };
}

/** capitalize(giant) (common.js): "Ti", not the potion's "Tii". */
export const dieFaceName = (face) => capitalize(face);

/**
 * onDiceRollLand 192-228: a Giant face only announces it; a Rook is
 * Tottly's Toys +3, a daily rook summon, 50 mood lost, and 15 percent of the
 * time a rook attack when the street can be rooked and is not already.
 */
export function dieOutcome(pc, face, { rng = Math.random, rookable = false, rooked = false } = {}) {
  if (face !== 'rook') return { face, line: `rolled "${dieFaceName(face)}"`, toys: 0, rook: false, attack: false, moodLine: '' };
  const lost = loseMood(pc, 50);
  const attack = chance(rng, 0.15) && rookable && !rooked;
  return {
    face,
    line: 'rolled a Rook! RUNNNN!!!!!',
    toys: 3,
    rook: true,
    lost,
    moodLine: lost ? `You lose ${lost} mood for attracting the rook.` : '',
    attack,
  };
}

/* ---- G424 Juju Shoo-Shoo Powder (juju_shoo_shoo_powder.js) -------- */

/** classProps maxCharges 5, use_sound JUJU_SHOO_SHOO_POWDER. */
export const JUJU_POWDER = Object.freeze({ maxCharges: 5, sound: 'JUJU_SHOO_SHOO_POWDER', label: 'Blow on', tooltip: 'Scares away any nearby Jujus' });

export function jujuPowderButton(charges) {
  const left = jujuChargesLeft(charges);
  return button('blow_on', JUJU_POWDER.label, JUJU_POWDER.tooltip, left > 0 ? '' : TEXT.outOfCharges);
}

export function jujuChargesLeft(charges) {
  if (charges == null) return JUJU_POWDER.maxCharges;
  const n = Number(charges);
  return Number.isFinite(n) ? Math.max(0, Math.min(JUJU_POWDER.maxCharges, Math.floor(n))) : JUJU_POWDER.maxCharges;
}

/**
 * onUse 266-318: with no Juju boss here the blow fails and the charge stays
 * (doVerb 330 spends one only on success). With one, a charge goes and the
 * gang teleports out (npc_juju_boss.js 299-342).
 */
export function blowJujuPowder(charges, { bossHere = false } = {}) {
  const left = jujuChargesLeft(charges);
  if (!bossHere) return { ...result('juju_shoo_shoo_powder', 'blow on', 'blew on', { failed: true, msgs: [TEXT.noJujus] }), charges: left };
  const next = left - 1;
  return { ...result('juju_shoo_shoo_powder', 'blow on', 'blew on', { msgs: [TEXT.jujusFlee] }), charges: next, emptied: next <= 0 };
}

/* ---- G426 Butterfly Net: attract (butterfly_net.js 70-113) --------- */

/** points_capacity 100; findCloseStack(is_butterfly, 500). */
export const BUTTERFLY_NET = Object.freeze({ capacity: 100, range: 500, energy: 10 });

export function netPointsLeft(points) {
  if (points == null) return BUTTERFLY_NET.capacity;
  const n = Number(points);
  return Number.isFinite(n) ? Math.max(0, Math.min(BUTTERFLY_NET.capacity, Math.floor(n))) : BUTTERFLY_NET.capacity;
}

export function netButton(points) {
  return button('attract', 'Attract', 'The Butterfly comes to you. Costs 10 energy', netPointsLeft(points) > 0 ? '' : TEXT.netBroken, true);
}

/** A butterfly within 500 px waits for you: 1 wear, -10 energy. None: the verb fails and costs nothing. */
export function attractWithNet(pc, points, found) {
  const left = netPointsLeft(points);
  if (!found) return { ...result('butterfly_net', 'attract with', 'attracted with', { failed: true, msgs: [TEXT.noButterflies] }), points: left };
  loseEnergy(pc, BUTTERFLY_NET.energy);
  return { ...result('butterfly_net', 'attract with', 'attracted with'), points: Math.max(0, left - 1) };
}

/** moveToWait 1012-1024: the butterfly holds 20 px behind and 100 px above you. */
export function netWaitSpot(px, py) {
  return { x: num(px) - 20, y: num(py) - 100 };
}

/* ---- G427 Dusty Stick and the Bundle of Joy ------------------------ */

/** dusty_stick.js: points_capacity 20, one point back every 12 minutes (onRejuvination 313-320). */
export const DUSTY_STICK = Object.freeze({ capacity: 20, rechargeMs: 12 * 60 * 1000 });

export function stickPoints(emptiedAt, now = Date.now()) {
  if (!Number.isFinite(Number(emptiedAt)) || emptiedAt == null) return DUSTY_STICK.capacity;
  return Math.max(0, Math.min(DUSTY_STICK.capacity, Math.floor((num(now) - num(emptiedAt)) / DUSTY_STICK.rechargeMs)));
}

export function stickButton(emptiedAt, now = Date.now()) {
  const points = stickPoints(emptiedAt, now);
  return button('unleash', `Unleash (${points}/${DUSTY_STICK.capacity})`, 'Spread some joy', points === DUSTY_STICK.capacity ? '' : TEXT.stickNotReady);
}

/**
 * npc_bundle_of_joy.js onCreate 220-250, onExcited 258-268, onDie 252-256,
 * okReallyDieNow 215-218, startMoving 270-295, walk_onMsg 297-314.
 */
export const BUNDLE_OF_JOY = Object.freeze({
  walkSpeed: 250,
  firstMoveMs: 1000,
  exciteEveryMs: 2000,
  excitements: 4,
  bubbleMs: 1000,
  dieAtMs: 20000,
  dyingBubble: 'Oh no! My existen ...',
  dyingBubbleMs: 4000,
  goneAfterMs: 3000,
  edge: 50,
  exclamations: Object.freeze(['I love you, {pc_label}', 'this is great!!!', 'wheeeeeeee!', 'is there anything better than this!???']),
  ceased: 'Your Bundle of Joy ceased to exist, but left something behind.',
  leaves: 'fiber',
});

export function joyExclamation(index, ownerLabel) {
  const line = BUNDLE_OF_JOY.exclamations[Math.max(0, Math.min(3, Math.floor(num(index))))];
  return line.replace(/\{pc_label\}/g, String(ownerLabel || ''));
}

/**
 * The next walk leg: turnAround first (it starts facing left, so the first
 * leg goes right), a right leg doubles move_distance before it walks, and
 * every finished leg multiplies it by 1.5. Clamped 50 px inside the street.
 */
export function joyNextLeg(joy, { left = 0, right = 4000 } = {}) {
  const dir = joy.dir === 'left' ? 'right' : 'left';
  let dist = num(joy.moveDistance) || 100;
  let x;
  if (dir === 'left') {
    x = Math.max(left + BUNDLE_OF_JOY.edge, num(joy.x) - dist);
  } else {
    dist *= 2;
    x = Math.min(right - BUNDLE_OF_JOY.edge, num(joy.x) + dist);
  }
  return { dir, moveDistance: dist, toX: x };
}

/* ---- G434 Street Creator trophy pieces: smash (trophy_piece) ------- */

/** classProps smash_green / smash_blue / smash_shiny: pieces 1-2, 3, and 4-5 of every family. */
const SMASH_BY_PIECE = Object.freeze({
  1: [200, 500, 400],
  2: [200, 500, 400],
  3: [300, 450, 550],
  4: [400, 550, 700],
  5: [400, 550, 700],
});

const TROPHY_FAMILIES = Object.freeze({ earth: 'Earth', rock: 'Rock', dirt: 'Dirt', wood: 'Wood' });

/** trophy_street_creator_<family>_piece<n> -> { green, blue, shiny, name }, or null. */
export function trophySmash(classTsid) {
  const m = /^trophy_street_creator_(earth|rock|dirt|wood)_piece([1-5])$/.exec(String(classTsid || ''));
  if (!m) return null;
  const [green, blue, shiny] = SMASH_BY_PIECE[m[2]];
  return { green, blue, shiny, name: `A Piece of Street Creator ${TROPHY_FAMILIES[m[1]]} Trophy` };
}

export function smashButton(classTsid, { hasPouch = false } = {}) {
  const def = trophySmash(classTsid);
  if (!def) return null;
  return button('smash', 'Smash', `Smash this trophy to receive ${def.green} Green Elements, ${def.blue} Blue Elements and ${def.shiny} Shiny Elements.`, hasPouch ? '' : TEXT.needPouch);
}

/**
 * The handler 64-114: each element goes into the pouch up to what it can
 * hold (createItemFromSource with destroy_remainder); the rest is reported
 * destroyed. `room` = { element_green, element_blue, element_shiny }.
 */
export function smashTrophy(classTsid, room = {}) {
  const def = trophySmash(classTsid);
  if (!def) return null;
  const rows = [
    ['element_green', def.green, 'Green Elements'],
    ['element_blue', def.blue, 'Blue Elements'],
    ['element_shiny', def.shiny, 'Shiny Elements'],
  ];
  const give = {};
  let line = `You smashed ${def.name}. `;
  const produced = [];
  for (const [cls, n, label] of rows) {
    const fits = Math.max(0, Math.min(n, Math.floor(num(room[cls] ?? n))));
    const destroyed = n - fits;
    if (destroyed) line += `${destroyed} ${label} were created, but destroyed, because you couldn't carry them. `;
    if (fits) {
      give[cls] = fits;
      produced.push(`${fits} ${label}`);
    }
  }
  if (produced.length === 1) line += `You received ${produced[0]}.`;
  else if (produced.length === 2) line += `You received ${produced[0]} and ${produced[1]}.`;
  else if (produced.length === 3) line += `You received ${produced[0]}, ${produced[1]} and ${produced[2]}.`;
  return { ok: true, consume: 1, give, message: line.trim(), effects: [] };
}

/* ---- G407 Factory Defect Chick (npc_cubimal_factorydefect_chick.js) */

/** verbs.race 108-148, onRaceStart 159-164, onRaceEnd 151-157, returnToPack 166-175. */
export const DEFECT_CHICK = Object.freeze({
  classTsid: 'npc_cubimal_factorydefect_chick',
  label: 'Race',
  tooltip: 'Race it against another Cubimal',
  aheadPx: 50,
  windUpMs: 2000,
  minSecs: 2,
  maxSecs: 10,
  backMs: 3000,
  broken: "Oh! It's broken!",
  // The client's recordings in the CC0 OpenGameArt dump: race (15 x 4 cells of 52 x 33, the last one blank) and state 1.
  raceSheet: Object.freeze({ path: 'assets/sprites/cubimals/npc_cubimal_factorydefect_chick_race.webp', fw: 52, fh: 33, cols: 15, frames: 59 }),
  brokenSheet: Object.freeze({ path: 'assets/sprites/cubimals/npc_cubimal_factorydefect_chick_1.webp', fw: 52, fh: 33, cols: 1, frames: 1 }),
});

/** randInt(2, 10) seconds of racing in place: the defect never sets a walk speed. */
export function defectRaceSecs(rng = Math.random) {
  return randInt(DEFECT_CHICK.minSecs, DEFECT_CHICK.maxSecs, rng);
}

export function defectRaceButton({ racing = false } = {}) {
  // verbs.race has no conditions; while it races it is out of the pack.
  return racing ? null : button('race', DEFECT_CHICK.label, DEFECT_CHICK.tooltip);
}

/* ---- G433 Hog-tied Piggy by frog mail (hogtied_piggy.js 177-188) --- */

/** onFrogDelivery: 1 in 6 a 5-minute attempt with Herdkeeping, else 1 in 3. */
export function frogDeliveryEscapeChance(learned = []) {
  return (learned || []).includes('herdkeeping_1') ? 0.16666667 : 0.33333333;
}
