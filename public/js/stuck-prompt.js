/**
 * Glitch's "Are you stuck? Do you want to leave this place?" (players/inc_instances.js 317-370) for
 * the places the quest-room runtime does not run (that one is quest-instances-feature maybeAskStuck):
 * Beam Me Down (features/puzzle-scenes-feature.js), Four Letter Words' playroom and Legalize It's
 * Back Alley (game.js). One place asks at a time, as one player stands in one instance.
 *
 *  - instances_schedule_exit_prompt: armed `exit_delay` after you are taken in (arm).
 *  - instances_show_exit_prompt 322-344: a dead player is asked 60 seconds later instead; the
 *    prompt goes in the prompt stack with icon buttons and no timeout. It waits out a dialog or a
 *    card on screen (host.busy).
 *  - instances_exit_via_prompt 346-357: Yes, please leaves (onYes: instances_left, back to where
 *    you came in); No thanks asks again 2 * 60 seconds later.
 *  - instances_cancel_exit_prompt 359-370: leaving the place by any way (location.js onPlayerExit
 *    770), or finishing its quest there (inc_quests.js 747), takes it away (cancel; a tick that
 *    finds you out of the place cancels too).
 *
 * host: { prompt(opts) -> uid, removePrompt(uid), isDead() -> bool, busy() -> bool,
 *         setData?(key, value), param?(key) }. QA &stuckpromptms=<ms> replaces every wait, as in quest
 * rooms. Canvas data: stuckPrompt (the place's key while asking, else empty).
 */

import {
  STUCK_PROMPT_AGAIN_MS,
  STUCK_PROMPT_CHOICES,
  STUCK_PROMPT_DEAD_MS,
  STUCK_PROMPT_TEXT,
  answerStuckPrompt,
  scheduleStuckPrompt,
  stuckPromptDue,
} from './quest-instance.js?v=bb5d53fd';

/** A source wait in ms; QA &stuckpromptms=<ms> replaces it. */
export function stuckWaitMs(host, ms) {
  const n = Math.max(0, Math.floor(Number(ms) || 0));
  if (!n) return 0;
  return Math.floor(Number(host?.param?.('stuckpromptms'))) || n;
}

export function createStuckAsker() {
  const clock = { key: '', status: 'active', stuckAt: 0, stuckAsking: false, uid: '' };

  function show(host, value) {
    host?.setData?.('stuckPrompt', value);
  }

  /** Stop asking (for `key`, or whatever place is armed); an open prompt goes. */
  function cancel(key = null, host = null) {
    if (key && clock.key !== key) return false;
    const uid = clock.uid;
    clock.key = '';
    clock.stuckAt = 0;
    clock.stuckAsking = false;
    clock.uid = '';
    if (uid) host?.removePrompt?.(uid);
    show(host, '');
    return true;
  }

  /** instances_schedule_exit_prompt(key, ms): ask `ms` from now (the QA override applies). */
  function arm(key, ms, host = null, now = Date.now()) {
    if (clock.key && clock.key !== key) cancel(null, host);
    clock.key = String(key || '');
    scheduleStuckPrompt(clock, stuckWaitMs(host, ms), now);
    return clock.stuckAt;
  }

  /**
   * Each frame for the place `key`: here (still in it), moving (a transition under way: wait),
   * onYes (the way out). Returns true when it asked.
   */
  function tick(key, host, { here = true, moving = false, onYes = null, now = Date.now() } = {}) {
    if (!key || clock.key !== key || moving) return false;
    if (!here) {
      cancel(key, host);
      return false;
    }
    if (!stuckPromptDue(clock, now)) return false;
    if (host.isDead?.()) {
      scheduleStuckPrompt(clock, STUCK_PROMPT_DEAD_MS, now);
      return false;
    }
    if (host.busy?.()) return false;
    clock.stuckAsking = true;
    let uid = '';
    uid = host.prompt?.({
      text: STUCK_PROMPT_TEXT,
      iconButtons: true,
      choices: STUCK_PROMPT_CHOICES.map((c) => ({ ...c })),
      onChoice: (value) => {
        if (!uid || clock.uid !== uid || clock.key !== key) return;
        clock.uid = '';
        show(host, '');
        const next = answerStuckPrompt(clock, value ?? null, { now: Date.now(), againMs: stuckWaitMs(host, STUCK_PROMPT_AGAIN_MS) });
        if (next === 'leave') {
          clock.key = '';
          onYes?.();
        }
      },
    }) || '';
    if (!uid) {
      clock.stuckAsking = false;
      return false;
    }
    clock.uid = uid;
    show(host, key);
    return true;
  }

  return {
    arm,
    cancel,
    tick,
    armed: (key) => Boolean(key) && clock.key === key && Boolean(clock.stuckAt || clock.stuckAsking),
    state: () => ({ ...clock }),
  };
}
