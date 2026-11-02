/**
 * The quest pill (player report 37, Austin 2026-11-02): inside a quest place the
 * big card that sat top centre covered the picture and the top of the item menus,
 * and on Storyland a narration notice peeked out under it, two cards stacked.
 *
 * The original had no such card. A quest instance had no clock or Leave on
 * screen at all: after its exit_delay the server asked "Are you stuck? Do you want
 * to leave this place?" (GSJS players/inc_instances.js 317-357, an_autumn_day.js
 * questInstanceLocation(..., 5*60)), and timed rooms showed bare overlay_counter
 * text near the top of the view (quests/letter_block_3.js 260-332: "Time" at 3%,
 * the clock at 12%; inc_quests.js 1252-1272 rainbow_run_overlay). The remake keeps
 * its clock, progress and Leave, folded into the street name's place:
 *
 * - While a quest card is up, the street nameplate becomes the quest pill on one
 *   line: icon, title, act or step, countdown, compact progress, Leave. Same place
 *   and height as the nameplate (features/quest-plate-feature.js).
 * - Step and narration text shows once as a caption under the pill and fades
 *   (longer for longer text); new text replaces it, one caption at a time.
 * - The pill opens the full card (the room's own card, under the pill); Escape or
 *   a click elsewhere closes it.
 * - Menus, tooltips and windows sit over the pill, caption and open card.
 *
 * The timed minigames keep their own boards: the original showed race and game
 * scores on screen the whole time (locations/inc_race.js 260-335 overlay_counter
 * at top_y 10%), so race, Hog Haul, Game of Crowns and Mayhem are left as they are.
 *
 * This file is pure (no DOM): the cards it adopts and the text rules.
 */

/**
 * The quest cards that fold into the pill: each card's id and where its parts are.
 * title/stage/timer/leave/step/line/count/progress are selectors inside the card;
 * icon is an <img> (or a mark whose text is the icon); dots are the progress marks
 * (done when they carry one of DOT_DONE).
 */
export const QUEST_PLATE_CARDS = Object.freeze([
  { id: 'quest-instance-hud', title: '[data-qi-title]', stage: '[data-qi-stage]', icon: '[data-qi-icon]', timer: '[data-qi-timer]', leave: '[data-qi-leave]', step: '[data-qi-objective]', progress: '[data-qi-stats] > span' },
  { id: 'greedy-street-hud', title: '.greedy-street-heading strong', stage: '[data-greedy-stage]', icon: '.greedy-street-mark', timer: '[data-greedy-timer]', leave: '#greedy-street-leave-btn', step: '[data-greedy-objective]', line: '[data-greedy-line]', dots: '[data-greedy-act]' },
  { id: 'four-letter-hud', title: '.four-letter-heading strong', stage: '[data-four-letter-progress]', icon: '.four-letter-heading img', leave: '#four-letter-leave-btn', step: '[data-four-letter-riddle]' },
  { id: 'legalize-hud', title: '.legalize-heading strong', stage: '[data-legalize-stage]', icon: '.legalize-heading img', leave: '#legalize-leave-btn', step: '[data-legalize-objective]', count: '[data-legalize-progress]' },
  { id: 'winter-walk-hud', title: '.winter-walk-heading strong', stage: '[data-winter-stage]', icon: '.winter-walk-heading img', timer: '[data-winter-timer]', leave: '#winter-walk-leave-btn', step: '[data-winter-objective]', count: '[data-winter-motes]', unit: 'motes' },
  { id: 'summers-day-hud', title: '.summers-day-heading strong', stage: '[data-summer-stage]', timer: '[data-summer-timer]', leave: '#summers-day-leave-btn', step: '[data-summer-objective]', count: '[data-summer-progress]' },
  { id: 'rook-woods-hud', title: '.rook-woods-heading strong', stage: '[data-rook-tool]', timer: '[data-rook-timer]', leave: '#rook-woods-leave-btn', step: '[data-rook-objective]' },
  { id: 'rook-museum-hud', title: '.rook-museum-heading strong', stage: '[data-rook-museum-stage]', icon: '.rook-museum-mark', leave: '#rook-museum-leave-btn', step: '[data-rook-museum-objective]', count: '[data-rook-museum-count]' },
  { id: 'de-embiggenify-hud', title: '.de-embiggenify-heading strong', stage: '[data-eesti-stage]', icon: '.de-embiggenify-heading img', timer: '[data-eesti-timer]', leave: '#de-embiggenify-leave-btn', step: '[data-eesti-objective]' },
  { id: 'paradise-flight-hud', title: '[data-paradise-title]', stage: '[data-paradise-controls]', icon: '[data-paradise-icon]', timer: '[data-paradise-timer]', leave: '#paradise-flight-leave-btn', step: '[data-paradise-objective]', count: '[data-paradise-progress]' },
]);

/** Classes that mark a progress dot as done. */
export const DOT_DONE = Object.freeze(['is-done', 'is-read', 'is-on', 'is-visited']);

/** How long a caption stays (ms): a short line about 3.5 s, a long one up to 10 s. */
export function captionMs(text) {
  const n = String(text || '').trim().length;
  return Math.max(3500, Math.min(10000, 2600 + n * 60));
}

/** Words with their spaces tidied. */
export function tidy(text) {
  return String(text ?? '').replace(/\s+/g, ' ').trim();
}

/** "0 / 12" as "0/12" (a count in the pill), "0/6 WORDS" as "0/6 words". */
export function compactCount(text, unit = '') {
  let s = tidy(text).replace(/\s*\/\s*/g, '/');
  if (!s) return '';
  s = s.replace(/^(\d+\/\d+)\s+([A-Z][A-Z\s']*)$/, (all, n, w) => `${n} ${w.toLowerCase()}`);
  if (unit && /^\d+\/\d+$/.test(s)) s = `${s} ${unit}`;
  return s;
}

/** Progress dots as { done, total }, from a list of { classes } (DOT_DONE marks done). */
export function dotCount(dots = []) {
  const list = Array.from(dots || []);
  return { done: list.filter((d) => DOT_DONE.some((c) => d?.classes?.includes?.(c))).length, total: list.length };
}

/**
 * What the caption shows after a sync: the step when it changed (it says what to do
 * next; the narration line is in the story's own dialogue), else the narration when
 * it changed. `first` (the card just came up) shows the step. Returns '' for none.
 */
export function nextCaption(prev, now, { first = false } = {}) {
  const step = tidy(now?.step);
  const line = tidy(now?.line);
  if (first) return step || '';
  if (step && step !== tidy(prev?.step)) return step;
  if (line && line !== tidy(prev?.line)) return line;
  return '';
}
