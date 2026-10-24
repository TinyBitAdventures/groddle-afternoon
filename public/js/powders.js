/**
 * Powders: the Beaker's jars (items/*powder*.js, fertilidust*.js and
 * krazy_salts.js over their shared include powder_base), as pure rules.
 * js/features/powders-feature.js binds them to the pack and the street.
 *
 * Sources (GameServerJS):
 * - powder_base (in every powder file): one verb per powder (classProps.verb;
 *   the other base verbs return state null), maxCharges 5 unless overridden,
 *   doVerb plays classProps.use_sound on success and uses one charge, and the
 *   jar is deleted at zero charges; a failed onUse uses nothing.
 * - no_no_powder.js onUse (sniff), catalog_buffs.js no_no_powder (rush,
 *   1452-1489) and no_no_powder_crash (1490-1520).
 * - sneezing_powder.js / sparkle_powder.js onUse (scatter / sprinkle).
 * - powder_of_mild_fecundity.js / powder_of_startling_fecundity.js onUse
 *   (disperse) and catalog_buffs.js fecundity_cooldown (690).
 * - fertilidust.js / fertilidust_lite.js onUse, include/trants.js:1236
 *   onFertilidust and wood_tree.js:870 onFertilidust.
 * - fairly / extremely_hallowed_shrine_powder.js onUse (sprinkle) and
 *   include/shrines.js:445-457 (the donation bonus).
 * - krazy_salts.js verbs.push.
 */

import { fruitCapacityAt } from './trants.js?v=trant-harvest-2';

/** One powder: its single verb, charges, sound and the verb's own tooltip. */
const powder = (verb, label, tooltip, sound, extra = {}) => Object.freeze({ verb, label, tooltip, sound, maxCharges: 5, ...extra });

export const POWDERS = Object.freeze({
  no_no_powder: powder('sniff', 'Sniff', 'Be careful when sniffing powders', 'NO_NO_POWDER', { maxCharges: 0 }),
  sneezing_powder: powder('scatter', 'Scatter', 'Causes hilarious sneezing', 'SNEEZING_POWDER'),
  sparkle_powder: powder('sprinkle', 'Sprinkle', 'Causes the delight of all players nearby', 'SPARKLE_POWDER'),
  powder_of_mild_fecundity: powder('disperse', 'Disperse', 'Extra vigor for all animals nearby', 'POWDER_OF_MILD_FECUNDITY', { fecundity: 'mild' }),
  powder_of_startling_fecundity: powder('disperse', 'Disperse', 'Causes abundance of vigor in animals nearby', 'POWDER_OF_STARTLING_FECUNDITY', { fecundity: 'startling' }),
  fertilidust: powder('disperse', 'Disperse', 'Significantly improve health of all Trees in your location', 'FERTILIDUST'),
  fertilidust_lite: powder('sprinkle', 'Sprinkle', 'Improve the health of one Tree', 'FERTILIDUST_LITE'),
  fairly_hallowed_shrine_powder: powder('sprinkle', 'Sprinkle', 'Scatter near a shrine for double rewards', 'FAIRLY_HALLOWED_SHRINE_POWDER', { buffId: 'fairly_hallowed' }),
  extremely_hallowed_shrine_powder: powder('sprinkle', 'Sprinkle', 'Scatter near a shrine for triple rewards', 'EXTREMELY_HALLOWED_SHRINE_POWDER', { buffId: 'extremely_hallowed' }),
  // krazy_salts.js: its own push verb (no doVerb, so no charge and no use_sound).
  krazy_salts: powder('push', 'Push', 'Push it real good', '', { maxCharges: 0, keeps: true }),
});

export const POWDER_TEXT = Object.freeze({
  outOfCharges: 'This powder is out of charges.',
  cooldown: "You can't use this Powder again yet.",
  noNoPooped: "No-no powder when you're pooped? That was dumb. Total waste!",
  noNo: "Oh! Wow! Oh! The powder may say no-no, but your energy and mood say yes-yes! You're on top of the world! ON TOP OF THE WORLD! Wait a minute...",
  sneezing: 'At first, watching everyone around you erupt in a sneezing fit is terribly funny. Until the spraying starts.',
  sparkle: "The air fills with energizing, moisturizing, tantalizing, romanticizing, surprising, her-prizing, revitalizing sparkle powder! It's good for what ails you, bewails you and assails you.",
  mildAll: 'The powder dutifully does its thing, causing every animal in this location to simultaneously drop their meaty, milky, grainy offerings on the ground.',
  mildMany: 'The powder dutifully does its thing, causing many animals in this location to simultaneously drop their meaty, milky, grainy offerings on the ground.',
  startlingAll: 'Within seconds of scattering the powder to the winds, every nearby critter becomes extra fertile, fruitful and abundant. They simultaneously drop their meaty, milky, grainy offerings on the ground.',
  startlingMany: 'Within seconds of scattering the powder to the winds, many nearby critters become extra fertile, fruitful and abundant. They simultaneously drop their meaty, milky, grainy offerings on the ground.',
  fertilidust: 'The airborne fertilidust alights on nearby trees, where it is quickly absorbed by the leaves, races down the medullary rays, and tickles the roots. Every tree immediately grows to its next stage of development.',
  fertilidustPaper: "Paper is impervious to powder. You don't want to waste your Fertilidust here.",
  fertilidustNone: 'There are no trees in this location. Seems like a waste of perfectly good Fertilidust. You may want to reconsider.',
  fertilidustRevivedOne: 'Oooh! That powder brought a tree back to life!',
  fertilidustRevivedMany: (n) => `Oooh! That powder brought ${n} trees back to life!`,
  lite: 'It may be the lite version, but this Fertilidust is still potent stuff. The tree shoots up into its next stage of development. ',
  litePaper: "Paper is impervious to powder. You don't want to waste your Fertilidust Lite here.",
  liteNone: "You realize there are no trees nearby, right? You don't want to go around wasting perfectly good Fertilidust.",
  hallowedActive: 'The giants are already listening. No need to bother them further.',
  fairly: 'You sense an increase in power coming from the shrine. Quick! Make a donation!',
  extremely: 'Invisible waves of energy emanate from the shrine. The giants are listening. Better make this donation a good one.',
  krazy: "Ah. You pushed it, but you didn't push it good. If only there were such a thing as Krazy Pepa. Alas…",
});

export function isPowder(classTsid) {
  return Boolean(POWDERS[classTsid]);
}

/** powder_base isUseable: no maxCharges, or charges left. */
export function powderChargesLeft(classTsid, charges) {
  const def = POWDERS[classTsid];
  if (!def?.maxCharges) return Infinity;
  const n = Number(charges);
  return Number.isFinite(n) ? Math.max(0, Math.min(def.maxCharges, Math.floor(n))) : def.maxCharges;
}

/**
 * The pack button for a powder: the verb's own conditions (the fecundity
 * cooldown) and isUseable. `ctx.cooldown` is fecundity_cooldown running.
 */
export function powderVerbFor(classTsid, ctx = {}) {
  const def = POWDERS[classTsid];
  if (!def) return null;
  const left = powderChargesLeft(classTsid, ctx.charges);
  let reason = '';
  if (def.fecundity && ctx.cooldown) reason = POWDER_TEXT.cooldown;
  else if (left <= 0) reason = POWDER_TEXT.outOfCharges;
  // powder_base updateState: "Sparkle Powder (3/5)".
  const label = def.maxCharges ? `${def.label} (${left}/${def.maxCharges})` : def.label;
  return { id: def.verb, label, tooltip: def.tooltip, enabled: !reason, reason, primary: !reason };
}

/**
 * powder_base use(): one charge. Returns { charges, emptied } where an
 * emptied jar is deleted (apiDelete at zero charges). No-No Powder has no
 * charges and is used up by every sniff; Krazy Salts keeps.
 */
export function usePowderCharge(classTsid, charges) {
  const def = POWDERS[classTsid];
  if (!def || def.keeps) return { charges: null, emptied: false };
  if (!def.maxCharges) return { charges: null, emptied: true };
  const left = powderChargesLeft(classTsid, charges) - 1;
  return left <= 0 ? { charges: null, emptied: true } : { charges: left, emptied: false };
}

// ---------------------------------------------------------------------------
// No-No Powder
// ---------------------------------------------------------------------------

/** no_no_powder.js onUse: 360 s halved for every earlier sniff today, at least 1. */
export function noNoRushSeconds(sniffsToday = 0) {
  const uses = Math.max(0, Math.floor(Number(sniffsToday) || 0));
  return Math.max(1, Math.round(360 / 2 ** uses));
}

/** catalog_buffs.js no_no_powder on_remove: the crash halves after the first sniff (uses counts this one). */
export function noNoCrashSeconds(sniffsToday = 1) {
  const uses = Math.max(0, Math.floor(Number(sniffsToday) || 0));
  return Math.max(1, uses > 1 ? Math.round(360 / 2 ** (uses - 1)) : 360);
}

/** no_no_powder.js onUse: pooped (or super pooped) wastes the jar. */
export function sniffNoNo({ pooped = false, sniffsToday = 0 } = {}) {
  if (pooped) return { ok: false, consumed: true, message: POWDER_TEXT.noNoPooped };
  return { ok: true, consumed: true, message: POWDER_TEXT.noNo, durationSec: noNoRushSeconds(sniffsToday) };
}

/** catalog_buffs.js:1487: a rush still running more than 660 s after the first sniff. */
export const DRAGON_CHASER_SECONDS = 660;

export function dragonChased(rushStartAt, now = Date.now()) {
  return Number.isFinite(Number(rushStartAt)) && rushStartAt > 0 && now - rushStartAt > DRAGON_CHASER_SECONDS * 1000;
}

// ---------------------------------------------------------------------------
// Fecundity powders
// ---------------------------------------------------------------------------

export const FECUNDITY_MAX_ANIMALS = 15;

/** fecundity_scatter_data, indexed by the number of animals affected (1-15). */
export const FECUNDITY_SCATTER = Object.freeze({
  mild: Object.freeze({
    npc_piggy: [0, 6, 4, 3, 3, 2, 2, 2, 2, 2, 1, 1, 1, 1, 1, 1],
    npc_butterfly: [0, 8, 5, 4, 3, 3, 2, 2, 2, 1, 1, 1, 1, 1, 1, 1],
    npc_chicken: [0, 50, 40, 32, 28, 24, 20, 15, 14, 13, 13, 12, 11, 10, 8, 8],
  }),
  startling: Object.freeze({
    npc_piggy: [0, 18, 12, 10, 8, 7, 6, 5, 5, 4, 4, 3, 3, 3, 3, 3],
    npc_butterfly: [0, 24, 16, 12, 10, 9, 7, 6, 5, 5, 4, 4, 4, 3, 3, 3],
    npc_chicken: [0, 150, 120, 100, 80, 70, 60, 50, 45, 40, 40, 35, 32, 30, 28, 25],
  }),
});

export const FECUNDITY_DROPS = Object.freeze({ npc_piggy: 'meat', npc_butterfly: 'milk_butterfly', npc_chicken: 'grain' });

/** events_add delay before the edibles appear: 6 s (mild), 7 s (startling). */
export const FECUNDITY_DELAY_MS = Object.freeze({ mild: 6000, startling: 7000 });

/**
 * powder_of_*_fecundity.js onUse over the street's animals
 * ([{ classId, x, y, sad? }]): the first 15 that are not sad each drop
 * their edible, the count read from the table at the number affected.
 * Startling counts powders:critter_catalyzer at five or more.
 */
export function fecundityScatter(kind, animals = []) {
  const table = FECUNDITY_SCATTER[kind];
  if (!table) return null;
  const eligible = (animals || []).filter((a) => FECUNDITY_DROPS[a?.classId] && !a.sad);
  const count = Math.min(eligible.length, FECUNDITY_MAX_ANIMALS);
  const drops = eligible.slice(0, count).map((a) => ({
    classTsid: FECUNDITY_DROPS[a.classId],
    count: table[a.classId][count],
    x: a.x,
    y: a.y,
    animal: a.classId,
  }));
  const many = count >= FECUNDITY_MAX_ANIMALS;
  const message = kind === 'startling'
    ? (many ? POWDER_TEXT.startlingMany : POWDER_TEXT.startlingAll)
    : (many ? POWDER_TEXT.mildMany : POWDER_TEXT.mildAll);
  const achievementCounters = kind === 'startling' && count >= 5
    ? [{ counter: 'powders:critter_catalyzer', amount: 1 }]
    : [];
  return { ok: true, count, drops, message, achievementCounters, sound: kind === 'startling' ? 'EFFECT_EXTREME' : 'EFFECT_MILD' };
}

// ---------------------------------------------------------------------------
// Fertilidust
// ---------------------------------------------------------------------------

export const LIVING_TRANTS = Object.freeze(['trant_bean', 'trant_bubble', 'trant_egg', 'trant_fruit', 'trant_gas', 'trant_spice']);

/** is_trant, wood_tree or wood_tree_enchanted. */
export function isFertileTree(classId) {
  return LIVING_TRANTS.includes(classId) || classId === 'wood_tree' || classId === 'wood_tree_enchanted';
}

/**
 * onFertilidust: a trant grows one maturity step below 10 and goes to full
 * health (health 9, then plusHealth); a Wood Tree grows one step below 6.
 * Mutates the tree's state; returns true when anything changed.
 */
export function fertilizeTree(classId, state) {
  if (!state || typeof state !== 'object') return false;
  const before = `${state.maturity}/${state.health}`;
  if (classId === 'wood_tree' || classId === 'wood_tree_enchanted') {
    const m = Math.floor(Number(state.maturity) || 0);
    if (m < 6) state.maturity = m + 1;
  } else if (LIVING_TRANTS.includes(classId)) {
    const m = Math.floor(Number(state.maturity) || 0);
    if (m < 10) state.maturity = m + 1;
    state.health = 10;
    state.fruitCapacity = fruitCapacityAt(classId, state.maturity, state.health);
  } else {
    return false;
  }
  return `${state.maturity}/${state.health}` !== before;
}

/** fertilidust.js onUse: 25 XP for every dead trant brought back. */
export const FERTILIDUST_REVIVE_XP = 25;

/**
 * fertilidust.js onUse outcome for the street's trees ({ trants, dead,
 * paper }): fails (keeps the charge) only with no living or dead trees;
 * powders:fertilivert at four or more living trees.
 */
export function fertilidustOutcome({ trants = 0, dead = 0, paper = 0 } = {}) {
  const msgs = [];
  if (trants) msgs.push(POWDER_TEXT.fertilidust);
  else if (!dead) msgs.push(paper ? POWDER_TEXT.fertilidustPaper : POWDER_TEXT.fertilidustNone);
  if (dead) msgs.push(dead === 1 ? POWDER_TEXT.fertilidustRevivedOne : POWDER_TEXT.fertilidustRevivedMany(dead));
  return {
    ok: Boolean(trants || dead),
    msgs,
    xp: dead * FERTILIDUST_REVIVE_XP,
    sound: trants ? 'EFFECT_EXTREME' : '',
    achievementCounters: trants >= 4 ? [{ counter: 'powders:fertilivert', amount: 1 }] : [],
  };
}

/**
 * fertilidust_lite.js onUse: the closest of the street's trees (paper trees
 * included in the search, and refused).
 */
export function fertilidustLiteTarget(trees = [], x = 0) {
  let best = null;
  for (const tree of trees || []) {
    if (!isFertileTree(tree?.classId) && tree?.classId !== 'paper_tree') continue;
    const d = Math.abs((Number(tree.x) || 0) - x);
    if (!best || d < best.d) best = { tree, d };
  }
  if (!best) return { ok: false, message: POWDER_TEXT.liteNone };
  if (best.tree.classId === 'paper_tree') return { ok: false, message: POWDER_TEXT.litePaper };
  return { ok: true, tree: best.tree, message: POWDER_TEXT.lite, sound: 'EFFECT_MILD' };
}

// ---------------------------------------------------------------------------
// Hallowed shrine powders
// ---------------------------------------------------------------------------

/** fairly / extremely_hallowed_shrine_powder.js onUse: refused while that buff runs. */
export function sprinkleHallowed(classTsid, { active = false } = {}) {
  const buffId = POWDERS[classTsid]?.buffId;
  if (!buffId) return null;
  if (active) return { ok: false, buffId, message: POWDER_TEXT.hallowedActive };
  return {
    ok: true,
    buffId,
    message: buffId === 'extremely_hallowed' ? POWDER_TEXT.extremely : POWDER_TEXT.fairly,
    sound: buffId === 'extremely_hallowed' ? 'EFFECT_EXTREME' : 'EFFECT_MILD',
  };
}

/**
 * include/shrines.js:445-457 for the next donation: Extremely Hallowed
 * triples it (and is removed), else Fairly Hallowed doubles it; No-No Powder's
 * rush keeps a fifth of its XP. `hasBuff(id)` reads the player's buffs.
 */
export function shrinePowderOptions(hasBuff = () => false) {
  if (hasBuff('extremely_hallowed')) return { powderBonus: 3, consume: 'extremely_hallowed', noNo: hasBuff('no_no_powder') };
  if (hasBuff('fairly_hallowed')) return { powderBonus: 2, consume: 'fairly_hallowed', noNo: hasBuff('no_no_powder') };
  return { powderBonus: 1, consume: null, noNo: hasBuff('no_no_powder') };
}

/** shrines.js:446: an Extremely Hallowed donation worth 1,000 or more counts Hallowed Be Shrine Name. */
export function shrinePowderAchievementCounters(consumed, baseCost) {
  return consumed === 'extremely_hallowed' && (Number(baseCost) || 0) >= 1000
    ? [{ counter: 'powders:hallowed_be_shrine_name', amount: 1 }]
    : [];
}
