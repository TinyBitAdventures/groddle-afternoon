/**
 * Radial Heights as its location runs it (LHFQOLEIHN63P27.xml `events`, GHFQOLEIHN63P27.json
 * `events` after build-street-events.mjs), on the shared location event runtime
 * (js/location-events.js runLocationEvent: flags with early exit, chained and delayed events, deco
 * show/hide, platform and wall perms, sounds, the quoins the scripts set down).
 *
 * - Arrival: instance_created hides the 53 yellow stars (hide_yellow_stars) and the 39 grey guide
 *   stars (hide_grey_stars), the moon, the "You're a star" art and both signs, pens you on the start
 *   cloud (plat and wall perms) and sets the spawn_01-14, check and reward flags.
 * - The flitterbug over the start cloud: its box (a Collision-triggered Event Box the archive lost)
 *   runs hide_start_clouds (the pen opens, the start clouds fade) and hide_cover_01, whose chain
 *   (hide_cover_02 to 53, 25 ms apart, locations/inc_events.js apiSetTimerMulti) shows the grey
 *   stars in spiral order and sets down a quoin at each big star's spot.
 * - Each star's box runs show_star_NN (its yellow star fades in, check_NN, its note), verify_NN
 *   (needs verify_01 to NN-1: the stars in order) and master_check (needs every check_NN). Run in
 *   that order, the 53rd star in order reaches verify_53 first: "You're a star" (your_a_star_01a),
 *   COMEDIAN, "Exit's down here!", four Qurazies (spawn_reward_2), and prevent_moon cleared so
 *   master_check stops. Out of order, master_check: the moon, "Good work, you've got all the stars!"
 *   and "Exit's down here!", one Qurazy (spawn_reward), and prevent_star cleared so no verify can
 *   finish. Which box fired which events was not archived; this order is the one in which both
 *   endings the script was written for can happen.
 */
import { createEventRuntime, dueEventTimers, runLocationEvent } from './location-events.js?v=48938c8f';

/** The events Radial Heights runs as you arrive (location.js: instance first, then the player). */
export const RADIAL_ARRIVAL_EVENTS = Object.freeze(['instance_created', 'player_enter']);
/** The flitterbug's box. */
export const RADIAL_FLITTERBUG_EVENTS = Object.freeze(['hide_start_clouds', 'hide_cover_01']);

const pad = (n) => String(n).padStart(2, '0');

/** A star's box: its show, its place in the order, then the all-stars check. */
export function radialStarEvents(n) {
  return [`show_star_${pad(n)}`, `verify_${pad(n)}`, 'master_check'];
}

/** PURE: yellow star deco id -> its star number (the show_star_NN that shows it). */
export function radialStarNumbers(events) {
  const out = new Map();
  for (const [name, actions] of Object.entries(events || {})) {
    const m = /^show_star_(\d+)$/.exec(name);
    if (!m) continue;
    const show = (actions || []).find((act) => act.type === 'deco_show' && act.deco);
    if (show) out.set(show.deco, Number(m[1]));
  }
  return out;
}

/** A running course: the shared event runtime and the street's events. */
export function createRadialSession(events) {
  return { events: events || {}, runtime: createEventRuntime() };
}

/** Run events in turn (the player's own: `target`), their effects in order. */
export function radialFire(session, names, now = 0, target = true) {
  const effects = [];
  for (const name of names) effects.push(...runLocationEvent(session.runtime, session.events, name, { now, target }));
  return effects;
}

/** The delayed events due by `now` (the hide_cover chain), their effects in order. */
export function radialTick(session, now) {
  const effects = [];
  // Each runs at its own time, so a chain that falls due within one frame (or a slow one) runs
  // through to `now` with its 25 ms steps, as the server's timers would have.
  for (let guard = 0; guard < 1000; guard += 1) {
    const due = dueEventTimers(session.runtime, now);
    if (!due.length) break;
    for (const timer of due) {
      effects.push(...runLocationEvent(session.runtime, session.events, timer.event, { now: timer.at, target: timer.target, firedAt: timer.firedAt }));
    }
  }
  return effects;
}

/** PURE: the script steps of a set of effects that set down quoins ({ x, y, props }, world px). */
export function effectQuoins(effects) {
  return (effects || []).filter((fx) => fx?.type === 'quoin');
}

/** Mutates `geometry` (paradiseSourceGeometry rows): the plat and wall perms the effects set. */
export function applyGeometryEffects(geometry, effects) {
  let changed = false;
  for (const fx of effects || []) {
    if (fx?.type !== 'plat' && fx?.type !== 'wall') continue;
    const rows = fx.type === 'plat' ? geometry?.platforms : geometry?.barriers;
    const row = (rows || []).find((r) => r.id === fx.id);
    if (!row) continue;
    row.pc_perm = fx.pc_perm;
    if ('item_perm' in fx) row.item_perm = fx.item_perm;
    changed = true;
  }
  return changed;
}

/**
 * items/quoin.js onPropsChanged 575-590: the Paradise classes' presets ('paradise iMG' and
 * 'paradise currants', benefit 1 and not random); other classes the script names are not used here.
 */
const CLASS_PRESETS = Object.freeze({
  'paradise iMG': Object.freeze({ type: 'xp', benefit: 1 }),
  'paradise currants': Object.freeze({ type: 'currants', benefit: 1 }),
});

/**
 * PURE: what a script's quoin pays as a Paradise reward def ({ type, benefit, giantId }, or a
 * Qurazy): items/quoin.js onPlayerCollision 161-166 (is_random rolls benefit_floor to
 * benefit_ceil, else benefit), its type and giant. `rng` is 0..1.
 */
export function eventQuoinReward(props = {}, rng = Math.random) {
  const preset = CLASS_PRESETS[props.class_name];
  const type = preset?.type || String(props.type || 'xp');
  if (type === 'qurazy') return Object.freeze({ type: 'qurazy', benefit: 0, giantId: null });
  let benefit;
  if (preset) benefit = preset.benefit;
  else if (Number(props.is_random) === 1) {
    const lo = Math.floor(Number(props.benefit_floor) || 0);
    const hi = Math.max(lo, Math.floor(Number(props.benefit_ceil) || 0));
    benefit = lo + Math.floor(Math.min(0.999999, Math.max(0, Number(rng()) || 0)) * (hi - lo + 1));
  } else benefit = Number(props.benefit) || 0;
  return Object.freeze({ type, benefit, giantId: type === 'favor' ? String(props.giant || '') || null : null });
}
