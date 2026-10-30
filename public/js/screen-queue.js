/**
 * The full-screen queue's gates (register G364): award, new-day and Giant
 * screens wait in one queue, as the client's do, until nothing else holds
 * the player's attention.
 *
 * Source: glitch-client TSFrontController.as addToScreenViewQ 3344-3356 (try
 * at once, else start the retry timer) and tryShowScreenViewFromQ 3358-3436:
 * the first screen in the queue bails, in this order, while
 *   3362-3367 editing, hand_of_god, chassis_mode (developer tools: none here)
 *   3368 info_mode (the I key's info mode: left out here)
 *   3370 cult_mode, 3372 decorator_mode
 *   3374 the window has lost focus (only screens with requires_client_focus:
 *        AchievementView, GiantView, LevelUpView, CollectionCompleteView are
 *        queued with true, NewDayView with false: NCMsgHandler.as 1017-1048,
 *        2651-2655, 2764-2768)
 *   3376 CameraMan in focus, 3398 in_camera_control_mode (Camera Mode)
 *   3378-3383 Cursor, GlitchrSnapshotView, GlitchrSavedDialog (multiplayer
 *        Snaps are taken in Camera Mode here; no separate view holds them)
 *   3384 InteractionMenu (verb menus and their item choosers)
 *   3386 GetInfoDialog (an item's card: the pack popover here)
 *   3388 ChoicesDialog (conversations and quest offers)
 *   3390 screen_view_open (another screen)
 *   3392 ImgMenuView (the iMG menu)
 *   3394 fam_dialog_open (the familiar's dialog)
 *   3396 moveModel.moving (a street change: the loading card)
 * and tries again on StateModel.as 115 screen_view_retry_timer (1000 ms). A
 * screen that closes tries the next one 500 ms later (screenViewClosed
 * 3335-3342).
 *
 * After the new-day screen fades out, the day's stats go in a chat bubble
 * over the avatar (NewDayView.as onDoneTweenComplete 216-225, showChatBubble
 * 236-265): one of MESSAGES (shuffled once, then taken in turn, 47-56, 162,
 * 244, 264) with a slug for each of stats_today's amounts above 0 (GSJS
 * players/player.js 917-920: energy and mood refilled). The bubble stays
 * min(10 s, 4 s + 0.3 s a word) (AvaChatBubbleManager.as 18-20, 51).
 */

/** StateModel.as 115: screen_view_retry_timer = new Timer(1000). */
export const SCREEN_RETRY_MS = 1000;
/** TSFrontController.as screenViewClosed 3341: setTimeout(tryShowScreenViewFromQ, 500). */
export const SCREEN_CLOSED_RETRY_MS = 500;

/**
 * The gates in tryShowScreenViewFromQ's order: [state key, client line, why].
 * `state` is a snapshot of the remake's equivalents (all booleans).
 */
export const SCREEN_GATES = Object.freeze([
  ['cultivating', 3370, 'cult_mode'],
  ['decorating', 3372, 'decorator_mode'],
  ['unfocused', 3374, '!flash_has_focus'],
  ['cameraMode', 3376, 'CameraMan'],
  ['interactionMenu', 3384, 'InteractionMenu'],
  ['getInfo', 3386, 'GetInfoDialog'],
  ['choicesDialog', 3388, 'ChoicesDialog'],
  ['screenOpen', 3390, 'screen_view_open'],
  ['imgMenu', 3392, 'ImgMenuView'],
  ['familiarDialog', 3394, 'fam_dialog_open'],
  ['moving', 3396, 'moving'],
]);

/**
 * The remake's own gates, after the client's (UI audit 2026-10-29, NOTIFY: a big
 * moment never lands on a dialog). The client's panels were its ChoicesDialog and
 * menus above; the remake's panels (.glitch-modal: vendor, shrine, make, ...) and
 * the features' own conversation cards ([role="dialog"]: the Crab's talk, the
 * Activity log, ...) hold the queue too. [state key, why].
 */
export const REMAKE_SCREEN_GATES = Object.freeze([
  ['panel', 'panel open'],
  ['dialog', 'dialog open'],
]);

/**
 * Why the next screen waits, or '' when it may show. The focus gate only
 * counts for screens that need it (requires_client_focus).
 */
export function screenQueueHold(state = {}, { requiresFocus = true } = {}) {
  for (const [key, , why] of SCREEN_GATES) {
    if (key === 'unfocused' && !requiresFocus) continue;
    if (state[key]) return why;
  }
  for (const [key, why] of REMAKE_SCREEN_GATES) {
    if (state[key]) return why;
  }
  return '';
}

/**
 * Resolves once `probe()` (a fresh gate snapshot) holds nothing: it looks at
 * once (500 ms after the last screen closed, when that was just now), then
 * every second. `onHold(why)` reports each wait (QA data).
 */
export function waitForScreenGates(probe, {
  requiresFocus = true,
  closedAt = -Infinity,
  now = () => globalThis.performance?.now?.() ?? Date.now(),
  setTimer = (fn, ms) => setTimeout(fn, ms),
  onHold = null,
} = {}) {
  return new Promise((resolve) => {
    const check = () => {
      let why = '';
      try {
        why = screenQueueHold(probe() || {}, { requiresFocus });
      } catch {
        why = '';
      }
      onHold?.(why);
      if (!why) resolve();
      else setTimer(check, SCREEN_RETRY_MS);
    };
    const sinceClose = now() - closedAt;
    if (sinceClose < SCREEN_CLOSED_RETRY_MS) setTimer(check, SCREEN_CLOSED_RETRY_MS - sinceClose);
    else check();
  });
}

/** NewDayView.as 47-56, in the source's order. */
export const NEW_DAY_MESSAGES = Object.freeze([
  'The day sure is glorious!',
  'Alright, refreshed!',
  '<b>*deep sniff*</b> now that smells like progress!',
  'Alright world, time to take you on!',
  'Another day, another dollar... er, currant?',
  'Each day will be better than the last. This one especially.',
  "I'd like mornings better if they started later.",
  'What a morning!? What cannot be accomplished on such a splendid day?',
  "It's the dawn of a new age. A great era. An epoch!",
  'A clear dawn sharpens my senses. Today will be a great day.',
]);

/** SortTools.shuffleArray (NewDayView buildBase 162): a shuffled copy, made once. */
export function shuffleNewDayMessages(rand = Math.random, list = NEW_DAY_MESSAGES) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** AvaChatBubbleManager.as 18-20, 51: min(MAX 10 s, MIN 4 s + 300 ms a word). */
export function chatBubbleShowMs(msg = '') {
  return Math.min(10_000, 4_000 + String(msg).split(' ').length * 300);
}

/**
 * The new-day bubble: the message (the client's htmlText bold drawn as plain
 * text, since the remake's bubble is plain), and a slug for energy and mood
 * when above 0 (showChatBubble 247-260 skips items and zero amounts).
 */
export function newDayBubble(message, { energy = 0, mood = 0 } = {}) {
  const text = String(message || '').replace(/<[^>]*>/g, '');
  const slugs = {};
  if (Math.round(Number(energy) || 0) > 0) slugs.energyGain = Math.round(Number(energy));
  if (Math.round(Number(mood) || 0) > 0) slugs.mood = Math.round(Number(mood));
  return {
    text,
    slugs: Object.keys(slugs).length ? slugs : null,
    durationMs: chatBubbleShowMs(message),
  };
}
