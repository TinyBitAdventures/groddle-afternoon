/**
 * Emotional Bear pack interactions.
 *
 * Ported from GameServerJS:
 * - items/emotional_bear.js
 * - items/lips.js
 * - items/moon.js
 *
 * The original targeted other players. The single-player remake uses the
 * named street companions already present in the Feat replay as local players.
 */

import { loseEnergy } from './metabolics.js?v=8504134e';

export const EMOTIONAL_BEAR_ITEM_ID = 'emotional_bear';
export const EMOTIONAL_BEAR_LIPS_ID = 'lips';
export const EMOTIONAL_BEAR_MOON_ID = 'moon';

export const EMOTIONAL_BEAR_COMPANIONS = Object.freeze([
  'Amp',
  'Bumbishfish',
  'Lily Linguistic',
]);

export const EMOTIONAL_BEAR_ACTIONS = Object.freeze({
  hug: Object.freeze({
    id: 'hug',
    label: 'Hug',
    energy: 5,
    selfMood: 2,
    targetMood: 2,
    durationMs: 5_000,
    animation: 'hug',
  }),
  high_five: Object.freeze({
    id: 'high_five',
    label: 'High five',
    energy: 10,
    selfMood: 0,
    targetMood: 10,
    durationMs: 4_000,
    animation: 'high-five',
  }),
  kiss: Object.freeze({
    id: 'kiss',
    label: 'Kiss',
    energy: 10,
    selfMood: 0,
    targetMood: 10,
    durationMs: 3_000,
    animation: 'kiss',
    upgrade: 'kiss',
  }),
  moon: Object.freeze({
    id: 'moon',
    label: 'Moon',
    energy: 10,
    selfMood: 0,
    targetMood: 10,
    durationMs: 6_000,
    animation: 'moon',
    upgrade: 'moon',
  }),
});

/**
 * G459: a kiss with garlic breath (emotional_bear.js 228-262): it needs and
 * costs 5 energy, gives you 5 mood, and the one kissed loses 3 mood.
 */
export const GARLIC_BREATH_BUFF = 'buff_garlic_breath';
export const GARLIC_KISS = Object.freeze({ energy: 5, selfMood: 5, targetMood: -3 });

const VALID_UPGRADES = new Set(['kiss', 'moon']);
const VALID_ACTIONS = new Set(Object.keys(EMOTIONAL_BEAR_ACTIONS));
const COMPANION_SET = new Set(EMOTIONAL_BEAR_COMPANIONS);

function integer(value, fallback = 0, max = 999_999) {
  const number = Math.floor(Number(value));
  return Number.isFinite(number) ? Math.max(0, Math.min(max, number)) : fallback;
}

function clampMood(value) {
  return Math.max(0, Math.min(100, Number(value) || 0));
}

function cleanDayKey(value) {
  return String(value || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 32);
}

function cleanInteractionMap(seed = {}) {
  const out = {};
  for (const action of VALID_ACTIONS) {
    const row = {};
    for (const companion of EMOTIONAL_BEAR_COMPANIONS) {
      const amount = integer(seed?.[action]?.[companion]);
      if (amount > 0) row[companion] = amount;
    }
    out[action] = row;
  }
  return out;
}

export function normalizeEmotionalBearState(seed = {}) {
  const upgrades = [...new Set(
    (Array.isArray(seed?.upgrades) ? seed.upgrades : [])
      .map((entry) => String(entry || ''))
      .filter((entry) => VALID_UPGRADES.has(entry))
  )];
  const companionMood = {};
  for (const companion of EMOTIONAL_BEAR_COMPANIONS) {
    companionMood[companion] = clampMood(seed?.companionMood?.[companion] ?? 70);
  }
  return {
    upgrades,
    anthropomorphizedDay: cleanDayKey(seed?.anthropomorphizedDay),
    companionMood,
    interactions: cleanInteractionMap(seed?.interactions),
    totalEmotes: integer(seed?.totalEmotes),
  };
}

export function createEmotionalBearState(seed = {}) {
  return normalizeEmotionalBearState(seed);
}

export function emotionalBearHasUpgrade(state, upgrade) {
  return normalizeEmotionalBearState(state).upgrades.includes(upgrade);
}

/** Original item state names: iconic_plain, iconic_kiss, iconic_moon, iconic_moon_kiss. */
export function emotionalBearIconState(state) {
  const normalized = normalizeEmotionalBearState(state);
  const kiss = normalized.upgrades.includes('kiss');
  const moon = normalized.upgrades.includes('moon');
  if (kiss && moon) return 'moon_kiss';
  if (moon) return 'moon';
  if (kiss) return 'kiss';
  return 'plain';
}

export function emotionalBearIcon(state) {
  return `assets/sprites/emotional-bear/iconic_${emotionalBearIconState(state)}.png`;
}

export function emotionalBearUpgradeQuote(state, inventory, upgrade) {
  const normalized = normalizeEmotionalBearState(state);
  const itemId = upgrade === 'kiss'
    ? EMOTIONAL_BEAR_LIPS_ID
    : upgrade === 'moon'
      ? EMOTIONAL_BEAR_MOON_ID
      : '';
  if (!itemId) return { ok: false, reason: 'unknown_upgrade', itemId: '' };
  if (normalized.upgrades.includes(upgrade)) {
    return { ok: false, reason: 'already_upgraded', itemId };
  }
  if ((inventory?.[itemId] || 0) < 1) {
    return { ok: false, reason: 'missing_accessory', itemId };
  }
  return { ok: true, reason: '', itemId };
}

/**
 * Consume the source accessory and update the bear's persistent visual state.
 */
export function upgradeEmotionalBear(state, inventory, upgrade) {
  const quote = emotionalBearUpgradeQuote(state, inventory, upgrade);
  if (!quote.ok) return { ...quote, state: normalizeEmotionalBearState(state) };
  inventory[quote.itemId] -= 1;
  const next = normalizeEmotionalBearState(state);
  next.upgrades.push(upgrade);
  Object.assign(state, next);
  const action = upgrade === 'kiss' ? 'kiss' : 'moon';
  return {
    ok: true,
    itemId: quote.itemId,
    upgrade,
    iconState: emotionalBearIconState(state),
    message: `You upgraded your Emotional Bear. Now you can ${action} with your Emo Bear!`,
  };
}

export function emotionalBearActionQuote(
  state,
  player,
  actionId,
  target = '',
  options = {}
) {
  const { dayKey = '', inRace = false } = options || {};
  const normalized = normalizeEmotionalBearState(state);
  if (actionId === 'anthropomorphize') {
    if (normalized.anthropomorphizedDay === cleanDayKey(dayKey)) {
      return {
        ok: false,
        reason: 'daily_limit',
        message: "You already did this today. Now it's just a bear.",
      };
    }
    return { ok: true, energy: 0, selfMood: 20, targetMood: 0 };
  }
  const action = EMOTIONAL_BEAR_ACTIONS[actionId];
  if (!action) return { ok: false, reason: 'unknown_action', message: 'The bear looks confused.' };
  if (action.upgrade && !normalized.upgrades.includes(action.upgrade)) {
    return {
      ok: false,
      reason: 'missing_upgrade',
      message: action.upgrade === 'kiss'
        ? 'Attach Lips to unlock kissing.'
        : 'Attach a Moon to unlock mooning.',
    };
  }
  if (inRace) {
    return {
      ok: false,
      reason: 'race',
      message: "You're in a race! Save your emotional outbursts for later.",
    };
  }
  if (!COMPANION_SET.has(target)) {
    return { ok: false, reason: 'target', message: 'Choose a street companion.' };
  }
  // GSJS checks <= the cost, so an action always leaves at least one energy.
  const garlic = actionId === 'kiss' && options?.garlic === true;
  if ((Number(player?.energy) || 0) <= (garlic ? GARLIC_KISS.energy : action.energy)) {
    return {
      ok: false,
      reason: 'energy',
      message: `You tried to ${action.label.toLowerCase()} ${target}, but you just don't have the energy.`,
    };
  }
  return garlic ? { ok: true, ...action, ...GARLIC_KISS, garlic: true } : { ok: true, ...action };
}

export function performEmotionalBearAction(
  state,
  player,
  actionId,
  target = '',
  options = {}
) {
  const quote = emotionalBearActionQuote(state, player, actionId, target, options);
  if (!quote.ok) return quote;
  const next = normalizeEmotionalBearState(state);

  if (actionId === 'anthropomorphize') {
    const before = clampMood(player?.mood);
    player.mood = clampMood(before + 20);
    const gained = player.mood - before;
    next.anthropomorphizedDay = cleanDayKey(options.dayKey);
    Object.assign(state, next);
    return {
      ok: true,
      actionId,
      animation: 'hug',
      durationMs: 5_000,
      effects: { mood: gained },
      message: 'Weirdly, ascribing glitchy characteristics to your inanimate bear cheers you up a bit.',
    };
  }

  // quote carries the garlic kiss's costs when options.garlic (G459).
  const action = { ...EMOTIONAL_BEAR_ACTIONS[actionId], energy: quote.energy, selfMood: quote.selfMood, targetMood: quote.targetMood };
  // G289: metabolics_lose_energy, nothing lost while dead (inc_metabolics.js 108-122).
  loseEnergy(player, action.energy);
  const selfMoodBefore = clampMood(player.mood);
  player.mood = clampMood(selfMoodBefore + action.selfMood);
  const selfMood = player.mood - selfMoodBefore;
  const targetBefore = next.companionMood[target];
  next.companionMood[target] = clampMood(targetBefore + action.targetMood);
  const targetMood = next.companionMood[target] - targetBefore;
  next.interactions[actionId][target] = integer(next.interactions[actionId][target]) + 1;
  next.totalEmotes += 1;
  Object.assign(state, next);

  const past = {
    hug: 'hugged',
    high_five: 'high fived',
    kiss: 'kissed',
    moon: 'mooned',
  }[actionId];
  return {
    ok: true,
    actionId,
    target,
    animation: action.animation,
    durationMs: action.durationMs,
    effects: {
      energy: -action.energy,
      ...(selfMood > 0 ? { mood: selfMood } : {}),
    },
    targetEffects: { mood: targetMood },
    targetMood: next.companionMood[target],
    uniqueTarget: next.interactions[actionId][target] === 1,
    garlic: quote.garlic === true,
    // emotional_bear.js 247: "Hopefully they don't notice your garlic breath. -5 energy, +5 mood".
    message: quote.garlic
      ? `You ${past} ${target}. Hopefully they don't notice your garlic breath. -${action.energy} energy, +${selfMood} mood`
      : `You ${past} ${target}. Energy -${action.energy}${selfMood > 0 ? `, Mood +${selfMood}` : ''}`,
  };
}

export function listEmotionalBearActions(state, player, options = {}) {
  const rows = Object.values(EMOTIONAL_BEAR_ACTIONS).map((action) => {
    const target = EMOTIONAL_BEAR_COMPANIONS[0];
    const quote = emotionalBearActionQuote(state, player, action.id, target, options);
    return { ...action, available: quote.reason !== 'missing_upgrade', enabled: quote.ok, reason: quote.message || '' };
  });
  const anthropomorphize = emotionalBearActionQuote(
    state,
    player,
    'anthropomorphize',
    '',
    options
  );
  rows.push({
    id: 'anthropomorphize',
    label: 'Anthropomorphize',
    energy: 0,
    selfMood: 20,
    targetMood: 0,
    durationMs: 5_000,
    animation: 'hug',
    available: true,
    enabled: anthropomorphize.ok,
    reason: anthropomorphize.message || '',
  });
  return rows;
}
