/**
 * Quests the remake once offered that can never be finished, and that the original never offered
 * (build-quests.mjs EXCLUDE). A save that still holds one, accepted, waiting or put off, lets it go
 * once, with one line saying why. Nothing is lost: accepting these quests gave nothing, and their
 * rewards come only at a turn-in that could never happen.
 *
 * - orld_ugs_esara, Chasing Hubba Dubba Hugs: no file offers it and nothing sets its hug flags
 *   (quests/orld_ugs_esara.js 18-50); the Magic Rock offered it at level 15 until 2026-11-12.
 */
export const RETIRED_QUESTS = Object.freeze({
  orld_ugs_esara: 'Chasing Hubba Dubba Hugs',
});

/** The line a player reads when one leaves the log (ours). */
export function retiredQuestLine(title) {
  return `“${title}” could never be finished, so it has left your quest log.`;
}

/**
 * Takes every retired quest out of the quest state (active, and the offer lists js/quest-offers.js
 * keeps). A finished one stays finished. Returns the titles of those the player held.
 */
export function retireDeadQuests(questState, retired = RETIRED_QUESTS) {
  const held = [];
  if (!questState) return held;
  const offers = questState.offers;
  for (const [id, title] of Object.entries(retired)) {
    const was = Boolean(questState.active?.[id] || offers?.offered?.[id] || offers?.declined?.[id] ||
      (Array.isArray(offers?.queue) && offers.queue.includes(id)));
    if (!was) continue;
    if (questState.active) delete questState.active[id];
    if (offers && typeof offers === 'object') {
      for (const key of ['offered', 'declined', 'managed', 'timers', 'failed', 'distinct', 'repeats']) {
        if (offers[key] && typeof offers[key] === 'object') delete offers[key][id];
      }
      if (Array.isArray(offers.queue)) offers.queue = offers.queue.filter((q) => q !== id);
    }
    held.push(title);
  }
  return held;
}
