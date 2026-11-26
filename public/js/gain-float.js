/**
 * A gain's floating amount (report #181): the "+3 mood", "-2 energy", "+1 Cherry" words that rise
 * from the avatar or the thing that gave them (game.js floatText draws every one of them). This file
 * holds their timing and size, the one place for both, as Glitch's client drew a stat change:
 *
 * StatBurst.as (end_text_size 27, go 96-145): the amount grows in over 0.2 s (easeOutCubic, 0.2 s after its
 * circle starts), gives a little nod (2 px up, 4 down, 4 up, 2 down in 0.05, 0.1, 0.1 and 0.05 s),
 * holds 1.5 s, then moves 40 px and fades over 0.4 s: up for a gain, down for a loss
 * (`final_y_delta = val > 0 ? -40 : 40`). end_text_size = 18 px. So each amount was on screen
 * 2.4 s. Glitch drew it at the stat's gauge in the top bar (StatBurstController.as) after the
 * reward slug flew there (SlugAnimator.as), or in the giver's speech balloon, which stays at
 * least 4 s (LisChatBubbleManager.as 112); here it rises over the avatar or the giver
 * instead, so it keeps the burst's timing without its white circle.
 *
 * Before this, an amount faded from its first frame and was gone in 55 frames (0.9 s).
 */

export const GAIN_FLOAT = Object.freeze({
  // StatBurst.as end_text_size: 18 px on the 2012 1000x600 stage. Today's world view is larger, so
  // it is scaled as the quoin's 24 became 20 (Austin 2026-11-11, js/quoin-shards.js QUOIN_SHARD_FX):
  // 18 x 20 / 24 = 15 px.
  glitchText: 18,
  stageScale: 20 / 24,
  text: 15,
  textInSec: 0.2,
  textBobPx: 2,
  textBobSec: 0.05,
  textHoldSec: 1.5,
  textOutSec: 0.4,
  textRise: 40,
});

/** How long an amount shows, from its first frame to gone: 0.2 + 0.3 + 1.5 + 0.4 s. */
export const GAIN_FLOAT_SEC = Math.round((GAIN_FLOAT.textInSec + GAIN_FLOAT.textBobSec * 6
  + GAIN_FLOAT.textHoldSec + GAIN_FLOAT.textOutSec) * 1000) / 1000;

/** The same in milliseconds, for stacking amounts still showing (js/notify.js stackFloat). */
export const GAIN_FLOAT_MS = Math.round(GAIN_FLOAT_SEC * 1000);

const easeOutCubic = (t) => 1 - (1 - t) ** 3;
const clamp01 = (t) => Math.max(0, Math.min(1, t));

/** A loss ("-2 energy", "−1 Cherry") sinks as it fades, as StatBurst.as moved a negative value down. */
export function gainFloatSinks(words) {
  return /^\s*[-−–]\s?\d/.test(String(words ?? ''));
}

/**
 * One amount `t` seconds after it was raised: `scale` (0 to 1), `y` (px from where it was raised,
 * up is negative), `alpha`, and `done` once it is gone.
 *  - sink: a loss, moving down instead of up.
 *  - still (prefers-reduced-motion): no growing, no nod, no move; shown at once for the same time
 *    and faded in place.
 *  - holdSec: a longer hold for longer words (floatText opts.life); never shorter than Glitch's.
 */
export function gainFloatPose(t, { sink = false, still = false, holdSec = GAIN_FLOAT.textHoldSec } = {}) {
  const fx = GAIN_FLOAT;
  const hold = Math.max(fx.textHoldSec, Number(holdSec) || 0);
  const pose = { scale: 0, y: 0, alpha: 1, done: false };
  if (!(t >= 0)) return pose;
  const shown = fx.textInSec + fx.textBobSec * 6 + hold;
  if (still) {
    pose.scale = 1;
    pose.alpha = 1 - easeOutCubic(clamp01((t - shown) / fx.textOutSec));
    pose.done = t >= shown + fx.textOutSec;
    return pose;
  }
  if (t < fx.textInSec) {
    pose.scale = easeOutCubic(t / fx.textInSec);
    return pose;
  }
  pose.scale = 1;
  let after = t - fx.textInSec;
  const b = fx.textBobPx;
  const u = fx.textBobSec;
  // [from, to, seconds]: each leg eases out, as StatBurst.as's four tweens do.
  for (const [from, to, sec] of [[0, -b, u], [-b, b, u * 2], [b, -b, u * 2], [-b, 0, u]]) {
    if (after < sec) {
      pose.y = from + (to - from) * easeOutCubic(after / sec);
      return pose;
    }
    after -= sec;
  }
  after -= hold;
  if (after <= 0) return pose;
  const p = easeOutCubic(clamp01(after / fx.textOutSec));
  pose.alpha = 1 - p;
  pose.y = (sink ? 1 : -1) * fx.textRise * p;
  pose.done = after >= fx.textOutSec;
  return pose;
}
