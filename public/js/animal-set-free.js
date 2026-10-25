/**
 * Set free (register G284): a Chicken or a Butterfly in a place you own (the
 * back yard) can be released into the wilderness.
 *
 * Source: items/npc_chicken.js 359-414 (verbs.set_free), 884-893
 * (freeChicken), 948-971 (modal_callback), 2467-2471 (set_free_in_pol);
 * items/npc_butterfly.js 320-370, 971-979 (freeButterfly), 985-1010
 * (modal_callback), 2060-2067.
 *
 * - The verb shows only where container.owner is you (state null elsewhere),
 *   and asks for Herdkeeping (herdkeeping_1).
 * - The prompt is modal, OK / Cancel, no title.
 * - OK: metabolics_add_mood(20) (nothing while dead, the metabolic gate) and
 *   metabolics_lose_energy(5); the animal answers with a set_free_in_pol
 *   line carrying those slugs; a smoke_puff itemstack_overlay follows it
 *   (delay 2.5 s, delta_y 95, 1.5 s); at 3 s it is gone (apiDelete) and the
 *   activity says so.
 */

import { metabolicGain, moodMax, loseEnergy } from './metabolics.js';

export const SET_FREE = Object.freeze({
  verb: 'set free',
  skill: 'herdkeeping_1',
  noSkill: 'You need to know Herdkeeping to set animals free.',
  tooltip: 'Costs 5 energy, rewards 20 mood',
  mood: 20,
  energy: 5,
  /** The smoke_puff itemstack_overlay: follow, place on the display top plus delta_y. */
  puff: Object.freeze({ overlay: 'smoke_puff', delayMs: 2500, deltaY: 95, durationMs: 1500 }),
  /** apiSetTimer('freeChicken' | 'freeButterfly', 3000). */
  freedMs: 3000,
  ok: 'OK',
  cancel: 'Cancel',
  classes: Object.freeze({
    npc_chicken: Object.freeze({
      sort: 52,
      // get_tooltip names "chicken" in lower case; the butterfly uses name_single.
      single: 'chicken',
      prompt: 'chicken',
      responses: Object.freeze([
        'What-what? Freedom? FREEDOM!',
        "That's it? No \"Thanks\"? No \"Great work, Chicken\"? Feh!",
        "Eh? Oh. Well, thanks for having me. It's been… interesting.",
      ]),
    }),
    npc_butterfly: Object.freeze({
      sort: 53,
      single: 'Butterfly',
      prompt: 'butterfly',
      responses: Object.freeze([
        'OMGiant! BAIIIIiiiiiiiiIIIiiiiii!!!',
        '<3 u bai!',
        'cu l8rs yah? L8rs!',
        'K Bai!',
        'ttfn!!!!!1!',
        'l8r g8r!!!',
      ]),
    }),
  }),
});

export function canSetFree(classId) {
  return Boolean(SET_FREE.classes[classId]);
}

/** get_tooltip: "Release this chicken into the wilderness. Costs 5 energy, rewards 20 mood". */
export function setFreeTooltip(classId, userName = '') {
  const def = SET_FREE.classes[classId];
  if (!def) return '';
  return userName
    ? `Release a ${def.single} named ${userName} into the wilderness. ${SET_FREE.tooltip}`
    : `Release this ${def.single} into the wilderness. ${SET_FREE.tooltip}`;
}

/**
 * The verb's menu state: null where the source hides it (not your place),
 * else { enabled, reason, tooltip, sort }.
 */
export function setFreeVerbState(classId, state = {}, { ownYard = false, learned = [] } = {}) {
  const def = SET_FREE.classes[classId];
  if (!def || !ownYard) return null;
  const knows = (learned || []).includes(SET_FREE.skill);
  return {
    enabled: knows,
    reason: knows ? '' : SET_FREE.noSkill,
    tooltip: setFreeTooltip(classId, state?.userName || ''),
    sort: def.sort,
    // The handler prompts at once; the conditions never check energy (lose_energy stops at 0).
    durationMs: 0,
  };
}

/** The handler's modal prompt text. */
export function setFreePrompt(classId, userName = '') {
  const def = SET_FREE.classes[classId];
  if (!def) return '';
  return userName
    ? `Are you sure you want to let your ${def.prompt} named ${userName} out into the wilderness?`
    : `Are you sure you want to let your ${def.prompt} out into the wilderness?`;
}

/** choose_one(responses.set_free_in_pol) for a roll in [0, 1). */
export function setFreeResponse(classId, roll = Math.random()) {
  const list = SET_FREE.classes[classId]?.responses || [];
  if (!list.length) return '';
  return list[Math.min(list.length - 1, Math.max(0, Math.floor(Number(roll) * list.length) || 0))];
}

/** freeChicken / freeButterfly's activity line. */
export function setFreeGoneLine(classId, userName = '') {
  const def = SET_FREE.classes[classId];
  if (!def) return '';
  return userName
    ? `The ${def.prompt} named ${userName} has gone to enjoy its life in the wilderness.`
    : `Your ${def.prompt} has gone to enjoy its life in the wilderness.`;
}

/**
 * modal_callback 'ok': +20 mood through the metabolic gate, -5 energy (to
 * 0 at least). Returns { slugs: { mood, energy }, line } (slugs are what
 * actually moved).
 */
export function applySetFree(classId, pc = {}, roll = Math.random()) {
  const moodBefore = Number(pc.mood) || 0;
  if (metabolicGain('mood').ok) pc.mood = Math.min(moodMax(pc), moodBefore + SET_FREE.mood);
  const energyBefore = Number(pc.energy) || 0;
  // G289: metabolics_lose_energy, nothing lost while dead (inc_metabolics.js 108-122).
  loseEnergy(pc, SET_FREE.energy);
  return {
    slugs: { mood: (Number(pc.mood) || 0) - moodBefore, energy: energyBefore - pc.energy },
    line: setFreeResponse(classId, roll),
  };
}
