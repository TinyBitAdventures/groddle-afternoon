/**
 * Prompt timeouts (register row G198): a prompt that carries the source's
 * `timeout` (seconds) goes away on its own, the way the client let it.
 *
 * What the source does (tinyspeck/glitch-GameServerJS and glitch-client, CC0):
 * - players/inc_prompts.js prompts_add 58-80: `timeout` (seconds) and an
 *   optional `timeout_value` go to the client (prompts_get_msg 124-142);
 *   without a timeout_value the server just lets the prompt expire
 *   (69-71 `expires`, prompts_expire 207-215), and no callback runs.
 * - glitch-client view/gameoverlay/PromptView.as:
 *   addPrompt 350-354 starts a timeout*1000 ms timer when the prompt is shown;
 *   removePromptIfNotOver 152-158: if the pointer is over the prompts it waits
 *   (removeables), otherwise the prompt goes and sendChoice runs with no value;
 *   sendChoice 168-189 sends prompt.timeout_value as the choice, and sends
 *   nothing when there is none; onRollOut 116-122 clears the waiting ones 2 s
 *   after the pointer leaves; onRollOver 125-129 cancels that.
 *   data/prompt/Prompt.as 7-10: modal prompts ignore the timeout.
 *
 * Remake: the prompt card only shows once the street loading card has gone
 * (G192, screen-fx streetCardUp), so the clock starts then, and stops while
 * a later card is up (screen-fx cardPausedTimeout), as the client hid prompts
 * while moving (PromptView.refresh 420). Hovering the card holds it, as above.
 */

import { cardPausedTimeout } from './screen-fx.js?v=82ce3680';

/** PromptView.as onRollOut 118-122: waiting prompts go 2 s after the pointer leaves. */
export const PROMPT_ROLL_OUT_MS = 2000;

/** Source seconds (`timeout`) or remake milliseconds (`timeoutMs`) as ms; 0 = no timeout. */
export function promptTimeoutMs({ timeout = 0, timeoutMs = 0 } = {}) {
  const ms = Number(timeoutMs) > 0 ? Number(timeoutMs) : Number(timeout) > 0 ? Number(timeout) * 1000 : 0;
  return Number.isFinite(ms) ? Math.round(ms) : 0;
}

/**
 * The choice an expired prompt sends (sendChoice 174-185): its timeout_value,
 * or none ('' / null / undefined send nothing).
 */
export function timeoutChoice(timeoutValue) {
  return timeoutValue === null || timeoutValue === undefined || timeoutValue === '' ? null : String(timeoutValue);
}

/**
 * Arm a prompt's timeout. `hoverEl` (the prompt card) holds it while the
 * pointer is over it. `onExpire(choice)` runs once, with timeoutChoice().
 * `timer(fn, ms) -> cancel` is cardPausedTimeout by default (tests pass a fake).
 * Returns { cancel, expired() }.
 */
export function armPromptTimeout({ ms, timeoutValue = null, hoverEl = null, onExpire, timer = cardPausedTimeout } = {}) {
  const wait = Math.max(0, Number(ms) || 0);
  let over = false;
  let due = false;
  let finished = false;
  let cancelMain = null;
  let cancelOut = null;
  const finish = () => {
    if (finished) return;
    finished = true;
    detach();
    onExpire?.(timeoutChoice(timeoutValue));
  };
  const enter = () => {
    over = true;
    cancelOut?.();
    cancelOut = null;
  };
  const leave = () => {
    over = false;
    if (!due || finished) return;
    cancelOut?.();
    cancelOut = timer(finish, PROMPT_ROLL_OUT_MS);
  };
  function detach() {
    hoverEl?.removeEventListener?.('pointerenter', enter);
    hoverEl?.removeEventListener?.('pointerleave', leave);
  }
  if (!wait) return { cancel() {}, expired: () => false };
  hoverEl?.addEventListener?.('pointerenter', enter);
  hoverEl?.addEventListener?.('pointerleave', leave);
  cancelMain = timer(() => {
    due = true;
    if (!over) finish();
  }, wait);
  return {
    cancel() {
      if (finished) return;
      finished = true;
      cancelMain?.();
      cancelOut?.();
      detach();
    },
    expired: () => due,
  };
}
