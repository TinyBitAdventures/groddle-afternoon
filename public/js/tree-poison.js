/**
 * Tree Poison, Tree Poison Antidote, Poisoner's Guilt and how a tree dies.
 *
 * Pure rules (no Pixi, no DOM). Source: tinyspeck/glitch-GameServerJS (CC0)
 *   items/potion_tree_poison.js        canPour, getMoodCost, getValidTargets
 *                                      (closest poisonable tree in 200 px),
 *                                      onPour (guilt buffs off your own home)
 *   items/potion_tree_poison_antidote.js canPour, onPour (+10 mood, cancel die,
 *                                      tree_antidote:antidoted)
 *   items/potion_base (both potions)   pour: 2500 ms overlay, POTION_GENERIC,
 *                                      onPourComplete use(1) + potions_used,
 *                                      "You poured a ..." (item.js buildVerbMessage)
 *   items/tool_base (both potions)     points_capacity 5, can_repair 0: the fifth
 *                                      pour consumes the bottle silently
 *   items/trant_base (trant_*.js)      verbs.poison / verbs.apply_antidote
 *                                      conditions and copy; a poisoned tree hides
 *                                      harvest, pet, water, trantsform and poison
 *   items/include/trants.js            applyPoison (3 min timer to die, bubble at
 *                                      3 s then every 30 s), die() -> trant_*_dead
 *   items/wood_tree.js                 applyPoison (same timer); onDie replaces it
 *                                      with a Patch and, when poisoned, 25 Planks
 *                                      at patch.x + 80
 *   items/catalog_buffs.js             poisoners_guilt 90 s, a_too_guilty_mind 900 s
 *   items/patch.js plantBean           planting a bean eases Poisoner's Guilt
 *
 * Neglect (trants.js onInterval/minusHealth/onMaturityCycle and the old-age
 * roll) is the other way a tree dies in the source. It rides the hourly
 * tendable windows, which the remake's daily pet/water model replaces, so it
 * is not wired here (see the header of js/patches.js).
 */

import { loseMood, metabolicGain } from './metabolics.js';

export const TREE_POISON = 'potion_tree_poison';
export const TREE_ANTIDOTE = 'potion_tree_poison_antidote';
/** tool_base required_skill on both potions; trant_base checks it too. */
export const BOTANY_SKILL = 'botany_1';

export const POISON_DURATION_MS = 3 * 60 * 1000; // applyPoison: var duration = 3*60
export const POISON_FIRST_BUBBLE_MS = 3 * 1000; // apiSetTimer('onPoisoned', 3*1000)
export const POISON_BUBBLE_EVERY_MS = 30 * 1000; // apiSetTimer('onPoisoned', 30*1000)
export const POISON_BUBBLE_SHOW_MS = 3 * 1000; // sendBubble(phrase, 3*1000)
export const POUR_MS = 2500; // potion_base pour overlay + onPourComplete timer
export const POUR_RANGE = 200; // pc.findCloseStack(is_poisonable_trant, 200)
export const POTION_USES = 5; // points_capacity
export const ANTIDOTE_MOOD = 10; // pc.metabolics_add_mood(10)
export const DEAD_WOOD_PLANKS = 25; // wood_tree.js onDie createItemStack('plank', 25, ...)
export const DEAD_WOOD_PLANK_DX = 80; // ... patch.x + 80

export const GUILT_BUFF = 'poisoners_guilt';
export const TOO_GUILTY_BUFF = 'a_too_guilty_mind';
export const GUILT_SECONDS = 90; // catalog_buffs poisoners_guilt duration
export const GUILT_SECOND_TIME_SECONDS = 420; // onPour: {duration: 420, is_second_time: true}
export const TOO_GUILTY_SECONDS = 900; // catalog_buffs a_too_guilty_mind duration

/** getMoodCost: share of max mood by guilt state. */
export const POISON_MOOD_SHARE = Object.freeze({ clear: 0.1, guilty: 0.25, secondTime: 0.6 });

/** trants.js die(): living class -> dead class. wood_tree has no dead class. */
export const DEAD_TREE_CLASS = Object.freeze({
  trant_bean: 'trant_bean_dead',
  trant_bubble: 'trant_bubble_dead',
  trant_egg: 'trant_egg_dead',
  trant_fruit: 'trant_fruit_dead',
  trant_gas: 'trant_gas_dead',
  trant_spice: 'trant_spice_dead',
});

export const POISONABLE_TREES = Object.freeze([...Object.keys(DEAD_TREE_CLASS), 'wood_tree']);

/** Verb and potion copy exactly as written in the source. */
export const POISON_COPY = Object.freeze({
  poisonVerb: 'apply poison to',
  poisonTip: 'Apply poison to this tree, killing it',
  antidoteVerb: 'apply antidote to',
  antidoteTip: 'Save this poor poisoned tree with some antidote',
  pourPoisonTip: 'Apply poison, kill a tree.',
  pourAntidoteTip: 'Save a poisoned tree.',
  tooGuilty: 'The guilt is too much to bear. You cannot poison a tree until your mind is free.',
  needBotanyTree: 'You need to know Botany to do this.',
  needBotany: 'You need to know Botany to use this.',
  badMood: 'You are not in a good enough mood to poison a tree.',
  noPoisonTarget: "There's nothing around here to poison.",
  noAntidoteTarget: 'There are no poisoned trees nearby.',
  noAntidote: "You don't have any antidote!",
  poisoned: 'You poisoned this tree.',
  guiltyYet: ' Do you feel guilty yet?',
  guiltEased: 'Some of your tree-poisoning-related guilt subsides.',
  guiltGone: 'You no longer feel guilty about that tree you poisoned.',
});

const LABELS = Object.freeze({ [TREE_POISON]: 'Tree Poison', [TREE_ANTIDOTE]: 'Tree Poison Antidote' });

function count(inv, classTsid) {
  return Math.max(0, Math.floor(Number(inv?.[classTsid]) || 0));
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

export function isPoisonableTree(classId) {
  return POISONABLE_TREES.includes(classId);
}

/** is_poisoned: a timer is running (it may already be due). */
export function isPoisoned(state) {
  return Number(state?.poisonEndsAt) > 0;
}

export function poisonRemainingMs(state, now = Date.now()) {
  return isPoisoned(state) ? Math.max(0, Number(state.poisonEndsAt) - now) : 0;
}

/** The die timer has fired (or would have while the street was unloaded). */
export function poisonDue(state, now = Date.now()) {
  return isPoisoned(state) && now >= Number(state.poisonEndsAt);
}

/**
 * Guilt as the buff rows describe it: { tooGuilty, guilty, secondTime,
 * guiltRemainingMs }. Built from engine buff ids + the guilt row's args.
 */
export function guiltState({ buffs = [], guiltRow = null, now = Date.now() } = {}) {
  const ids = list(buffs);
  const guilty = ids.includes(GUILT_BUFF);
  const expiresAt = Number(guiltRow?.expiresAt);
  return {
    tooGuilty: ids.includes(TOO_GUILTY_BUFF),
    guilty,
    secondTime: guilty && guiltRow?.args?.is_second_time === true,
    guiltRemainingMs: guilty && Number.isFinite(expiresAt) ? Math.max(0, expiresAt - now) : 0,
  };
}

/** getMoodCost: round(max mood x 10% / 25% / 60%). */
export function poisonMoodCost(guilt = {}, maxMood = 100) {
  const share = !guilt.guilty ? POISON_MOOD_SHARE.clear : guilt.secondTime ? POISON_MOOD_SHARE.secondTime : POISON_MOOD_SHARE.guilty;
  return Math.round((Number(maxMood) || 100) * share);
}

/**
 * trant_base verbs.poison conditions, in source order. `visible: false` is
 * the source's {state: null} (the verb is not offered at all).
 * ctx: { inv, learned, mood, maxMood, guilt, owner, dontDie }
 */
export function quotePoisonVerb(state, ctx = {}) {
  if (isPoisoned(state)) return { visible: false };
  if (ctx.guilt?.tooGuilty) return { visible: true, enabled: false, reason: POISON_COPY.tooGuilty };
  if (count(ctx.inv, TREE_POISON) < 1) return { visible: false };
  if (!list(ctx.learned).includes(BOTANY_SKILL)) return { visible: true, enabled: false, reason: POISON_COPY.needBotanyTree };
  const moodCost = poisonMoodCost(ctx.guilt, ctx.maxMood);
  if ((Number(ctx.mood) || 0) < moodCost) return { visible: true, enabled: false, reason: POISON_COPY.badMood, moodCost };
  if (ctx.dontDie) return { visible: true, enabled: false, reason: "This tree can't be poisoned." };
  return { visible: true, enabled: true, reason: '', moodCost };
}

/** trant_base verbs.apply_antidote conditions. */
export function quoteAntidoteVerb(state, ctx = {}) {
  if (!isPoisoned(state)) return { visible: false };
  if (count(ctx.inv, TREE_ANTIDOTE) < 1) return { visible: true, enabled: false, reason: POISON_COPY.noAntidote };
  if (!list(ctx.learned).includes(BOTANY_SKILL)) return { visible: true, enabled: false, reason: POISON_COPY.needBotany };
  return { visible: true, enabled: true, reason: '' };
}

/**
 * potion_tree_poison canPour (the pack Pour). `target` is the closest
 * poisonable tree in range, or null.
 */
export function canPourPoison(target, ctx = {}) {
  if (!list(ctx.learned).includes(BOTANY_SKILL)) return { ok: false, msg: `You need to know Botany to use this.` };
  if (!target) return { ok: false, msg: POISON_COPY.noPoisonTarget };
  if (ctx.guilt?.tooGuilty) return { ok: false, msg: POISON_COPY.tooGuilty };
  if ((Number(ctx.mood) || 0) < poisonMoodCost(ctx.guilt, ctx.maxMood)) return { ok: false, msg: POISON_COPY.badMood };
  if (count(ctx.inv, TREE_POISON) < 1) return { ok: false, msg: 'This potion is out of charges.' };
  return { ok: true, msg: '' };
}

/** potion_tree_poison_antidote canPour. */
export function canPourAntidote(target, ctx = {}) {
  if (!list(ctx.learned).includes(BOTANY_SKILL)) return { ok: false, msg: POISON_COPY.needBotany };
  if (!target) return { ok: false, msg: POISON_COPY.noAntidoteTarget };
  if (count(ctx.inv, TREE_ANTIDOTE) < 1) return { ok: false, msg: POISON_COPY.noAntidote };
  return { ok: true, msg: '' };
}

/** applyPoison: the tree dies in three minutes unless an antidote lands first. */
export function applyTreePoison(state, now = Date.now(), durationMs = POISON_DURATION_MS) {
  state.poisonedAt = now;
  state.poisonEndsAt = now + Math.max(1, Number(durationMs) || POISON_DURATION_MS);
  state.poisonBubble = -1;
  return state;
}

/** Antidote onPour: delete is_poisoned, apiCancelTimer('die'). */
export function cureTreePoison(state) {
  delete state.poisonedAt;
  delete state.poisonEndsAt;
  delete state.poisonBubble;
  return state;
}

/**
 * Guilt change after a poisoning off your own home (onPour):
 *   none          -> poisoners_guilt (90 s)
 *   guilty        -> poisoners_guilt for 420 s, is_second_time
 *   second time   -> remove guilt, a_too_guilty_mind (900 s)
 * On your own home street there is no mood cost and no guilt.
 */
export function guiltAfterPoisoning(guilt = {}, { owner = false } = {}) {
  if (owner) return { moodCost: false, remove: [], apply: null };
  if (!guilt.guilty) return { moodCost: true, remove: [], apply: { id: GUILT_BUFF, durationSec: GUILT_SECONDS, args: {} } };
  if (guilt.secondTime) return { moodCost: true, remove: [GUILT_BUFF], apply: { id: TOO_GUILTY_BUFF, durationSec: TOO_GUILTY_SECONDS, args: {} } };
  return { moodCost: true, remove: [GUILT_BUFF], apply: { id: GUILT_BUFF, durationSec: GUILT_SECOND_TIME_SECONDS, args: { is_second_time: true } } };
}

/**
 * patch.js plantBean: "Mildly guilty poisoners feel less guilty when they
 * make new trees". The long second-time guilt with more than 90 s left drops
 * to a standard one; any other guilt ends.
 */
export function guiltAfterPlanting(guilt = {}) {
  if (!guilt.guilty) return null;
  if (guilt.secondTime && guilt.guiltRemainingMs > GUILT_SECONDS * 1000) {
    return { remove: [GUILT_BUFF], apply: { id: GUILT_BUFF, durationSec: GUILT_SECONDS, args: {} }, msg: POISON_COPY.guiltEased };
  }
  return { remove: [GUILT_BUFF], apply: null, msg: POISON_COPY.guiltGone };
}

/** onPoisoned phrases: even ticks count down, odd ticks ask for antidote. */
export function poisonBubbleText(tick, remainingSec) {
  return tick % 2 === 0
    ? `Help! I've been poisoned and will die in ${Math.max(0, Math.floor(remainingSec))} seconds.`
    : 'I need antidote!';
}

/**
 * The bubble that is due now, if a new one has come up since `state.poisonBubble`.
 * Tick k fires at poisonedAt + 3 s + 30 s x k; missed ticks are skipped.
 */
export function poisonBubbleDue(state, now = Date.now()) {
  if (!isPoisoned(state) || poisonDue(state, now)) return null;
  const since = now - (Number(state.poisonedAt) || now) - POISON_FIRST_BUBBLE_MS;
  if (since < 0) return null;
  const tick = Math.floor(since / POISON_BUBBLE_EVERY_MS);
  if (tick <= (Number.isFinite(state.poisonBubble) ? state.poisonBubble : -1)) return null;
  const firedAt = (Number(state.poisonedAt) || now) + POISON_FIRST_BUBBLE_MS + tick * POISON_BUBBLE_EVERY_MS;
  const remainingSec = Math.round((Number(state.poisonEndsAt) - firedAt) / 1000);
  return { tick, text: poisonBubbleText(tick, remainingSec), showMs: POISON_BUBBLE_SHOW_MS };
}

/**
 * What a dead tree becomes. Trants: their dead class (a dead tree you clear
 * with a Hatchet). Wood Trees: a Patch at once, plus 25 Planks on the ground
 * 80 px to the right when the death was a poisoning.
 */
export function treeDeathOutcome(classId, { poisoned = true } = {}) {
  if (classId === 'wood_tree') {
    return { soilClass: 'patch', planks: poisoned ? DEAD_WOOD_PLANKS : 0, plankDx: DEAD_WOOD_PLANK_DX };
  }
  const dead = DEAD_TREE_CLASS[classId];
  return dead ? { soilClass: dead, planks: 0, plankDx: 0 } : null;
}

// ---------------------------------------------------------------------------
// Bottles (points_remaining)
// ---------------------------------------------------------------------------

export function createPoisonBottleState(seed = {}) {
  const uses = {};
  for (const id of [TREE_POISON, TREE_ANTIDOTE]) {
    const n = Number(seed?.uses?.[id]);
    if (Number.isFinite(n) && n > 0) uses[id] = Math.min(POTION_USES, Math.floor(n));
  }
  return { uses };
}

export function bottleUsesLeft(state, potionClass, inv) {
  if (count(inv, potionClass) < 1) return 0;
  return state.uses[potionClass] || POTION_USES;
}

/** onPourComplete use(1); at 0 apiConsume(1) and the next bottle starts full. */
export function useBottle(state, potionClass, inv) {
  if (count(inv, potionClass) < 1) return { ok: false, emptied: false, left: 0 };
  const left = (state.uses[potionClass] || POTION_USES) - 1;
  if (left <= 0) {
    inv[potionClass] = count(inv, potionClass) - 1;
    if (inv[potionClass] <= 0) delete inv[potionClass];
    delete state.uses[potionClass];
    return { ok: true, emptied: true, left: 0 };
  }
  state.uses[potionClass] = left;
  return { ok: true, emptied: false, left };
}

/** item.js buildVerbMessage for a pour: "You poured a Tree Poison. <msgs>" */
export function pourMessage(potionClass, msgs = [], failed = false) {
  const label = LABELS[potionClass] || potionClass;
  const head = failed ? `You tried to pour a ${label}.` : `You poured a ${label}.`;
  return [head, ...list(msgs).filter(Boolean)].join(' ');
}

/**
 * The poison pour, after the 2.5 s overlay (onPourComplete -> onPour).
 * Mutates the tree state, pack, pc mood and bottle state together.
 * ctx: { inv, pc, guilt, owner, maxMood, now, durationMs, bottles }
 */
export function performPoisonPour(state, ctx = {}) {
  const now = Number.isFinite(ctx.now) ? ctx.now : Date.now();
  if (isPoisoned(state)) return { ok: false, msg: pourMessage(TREE_POISON, ["I can't find a tree anywhere!"], true) };
  const guiltChange = guiltAfterPoisoning(ctx.guilt, { owner: ctx.owner === true });
  let moodLost = 0;
  if (guiltChange.moodCost && ctx.pc) {
    const cost = poisonMoodCost(ctx.guilt, ctx.maxMood);
    // tree_poison.js 321: metabolics_lose_mood(getMoodCost) (G300: nothing while dead).
    moodLost = loseMood(ctx.pc, cost);
  }
  applyTreePoison(state, now, ctx.durationMs);
  const bottle = ctx.bottles ? useBottle(ctx.bottles, TREE_POISON, ctx.inv) : { ok: true, emptied: false };
  const text = POISON_COPY.poisoned + (guiltChange.moodCost ? POISON_COPY.guiltyYet : '');
  return {
    ok: true,
    moodLost,
    guilt: guiltChange,
    bottle,
    counters: [{ counter: `potions_used:${TREE_POISON}`, amount: 1 }],
    msg: pourMessage(TREE_POISON, [text]),
  };
}

/** The antidote pour: +10 mood, the die timer cancelled, tree_antidote:antidoted. */
export function performAntidotePour(state, ctx = {}) {
  if (!isPoisoned(state)) return { ok: false, msg: pourMessage(TREE_ANTIDOTE, [POISON_COPY.noAntidoteTarget], true) };
  let moodGained = 0;
  // tree_poison_antidote.js 284: metabolics_add_mood(10), which gives nothing
  // while dead and says so (inc_metabolics.js 79-86).
  if (ctx.pc && ctx.moodGain !== false && metabolicGain('mood').ok) {
    const cap = Number.isFinite(ctx.maxMood) ? ctx.maxMood : 100;
    const before = Number(ctx.pc.mood) || 0;
    ctx.pc.mood = Math.min(cap, before + ANTIDOTE_MOOD);
    moodGained = ctx.pc.mood - before;
  }
  cureTreePoison(state);
  const bottle = ctx.bottles ? useBottle(ctx.bottles, TREE_ANTIDOTE, ctx.inv) : { ok: true, emptied: false };
  return {
    ok: true,
    moodGained,
    bottle,
    counters: [
      { counter: 'tree_antidote:antidoted', amount: 1 },
      { counter: `potions_used:${TREE_ANTIDOTE}`, amount: 1 },
    ],
    msg: pourMessage(TREE_ANTIDOTE),
  };
}
