/**
 * Shared public gardens in multiplayer (register G368): the rules a page needs
 * to show and tend a street bed whose plots the realtime server keeps
 * (groddle-afternoon-server gardens.go). The feature is
 * features/shared-gardens-feature.js; the plan is
 * research/plans/g368-shared-public-gardens.md.
 *
 * - The ten streets below share their beds online: the original's public
 *   gardens (items/include/garden.js isPublic 1244-1247: a garden with no
 *   owner). Doonboggle Trail is left out (the tutorial's spinach bed every
 *   new player must find ripe, features/newxp-feature.js), and so is every
 *   home, tower room, party space and solo-only zone: those are not in the
 *   list, so they keep their own plots exactly as before.
 * - A plot's id is "<bed>:<col>-<row>": the bed is the street's garden type
 *   ("default" the crop bed, "herb" the herb bed, game.js spawnGarden), the
 *   key js/garden.js plotKey.
 * - The planter's 60 seconds (include/garden.js 1042-1046, 1052-1055,
 *   1229-1231: a public plot's crop keeps its planter for 0.0167 hours, and
 *   GardenView.as 481-486 refuses anyone else's pick with LOCK_LINE). The
 *   server sends "planter" and "lock" (ms left) only while the lock runs.
 *
 * tools/build-realtime-gardens.mjs writes the server's data/gardens.json
 * from SHARED_GARDEN_STREETS and the game's own placement planner;
 * tools/build-garden-seeds.mjs gives the site the same list for the one-time
 * payout by mail of each player's old plots (groddle-afternoon-site
 * GardenPayout.php).
 */

/** The public gardens shared online (all ten at once: Austin 2026-11-07). Street tsids as saves key them. */
export const SHARED_GARDEN_STREETS = Object.freeze([
  'GA95U14319524O9', // Chakra Phool Herb Gardens
  'GA97L62229522GS', // Jethimadh Herb Gardens
  'GA99U5PI39524GN', // Shimla Mirch Herb Gardens
  'GCR101NQ4BU1SKS', // Community Gardens
  'GCR101UN0NJ1QPQ', // Middle Arbor
  'GCR202JSVIN1STL', // Kipacre Greens
  'GHVEI9NVJ203LRO', // Egret Taun Towers Basement
  'GIFCNFNEJRG2ON4', // Mmumawwa Wala
  'GIFGR46M8RE2RC7', // Veldt Balm
  'GLI2V0UN7RD1T2J', // Hechey Track (the remake's own beds, kept: Austin 2026-11-07)
]);

/** include/garden.js 952 pushEvent(plot, 0.0167, 'unlock'): 0.0167 hours rounds to 60 s. */
export const GARDEN_LOCK_MS = 60_000;

/** GardenView.as 485: another player's pick during the planter's 60 seconds. */
export const LOCK_LINE = 'Another player planted those seeds, give them time to snag them up!';

/** include/garden.js 469-472, 601-606: the plot was picked first. */
export const NOTHING_TO_PICK_LINE = 'Oops. There is nothing there to pick.';

/** Whether a street's beds are shared online. */
export function isSharedGardenStreet(tsid) {
  return SHARED_GARDEN_STREETS.includes(String(tsid || ''));
}

export function plotId(bed, key) {
  return `${bed === 'herb' ? 'herb' : 'default'}:${key}`;
}

/** "herb:2-1" -> { bed: 'herb', key: '2-1' }, or null. */
export function parsePlotId(id) {
  const m = String(id || '').match(/^(default|herb):(\d{1,2}-\d{1,2})$/);
  return m ? { bed: m[1], key: m[2] } : null;
}

const STATES = new Set(['clean', 'seeds', 'shoots', 'crop', 'dirty']);

/**
 * A server plot as js/garden.js keeps a plot, on this page's clock (offset: server ms minus local
 * ms). The fields garden.js reads: state, seed, wet, wetAt, stageStartedAt, growthMs, growModifier,
 * fertilized, pace, wetPace; plus the lock (planter, lockUntil) for this page's own refusal.
 */
export function localPlot(s, offset = 0, now = Date.now()) {
  const at = (ms) => (Number.isFinite(ms) && ms > 0 ? ms - offset : null);
  const state = STATES.has(s?.state) ? s.state : 'clean';
  const plot = {
    state,
    seed: state === 'seeds' || state === 'shoots' || state === 'crop' ? String(s.seed || '') || null : null,
    wet: s?.wet === true,
    wetAt: s?.wet === true ? at(s.wetAt) ?? now : null,
    stageStartedAt: at(s?.stageAt) ?? now,
    growthMs: Math.max(0, Number(s?.banked) || 0),
    growModifier: Number.isFinite(s?.mod) && s.mod > 0 ? s.mod : 1,
    fertilized: s?.fert === true,
    // The clock the crop and the watering run on (js/garden.js LEGACY_GARDEN): the server's word,
    // left off for a plot from before the garden's speed changed (and by a server from before).
    ...(Number(s?.pace) > 0 ? { pace: Number(s.pace) } : {}),
    ...(s?.wet === true && Number(s?.wetPace) > 0 ? { wetPace: Number(s.wetPace) } : {}),
    planter: Number(s?.planter) || 0,
    lockUntil: Number(s?.planter) && Number(s?.lock) > 0 ? now + Number(s.lock) : 0,
  };
  return plot;
}

/** Copy a server plot into the page's plot object in place (plot targets hold the object). */
export function applyPlot(plot, s, offset = 0, now = Date.now()) {
  const next = localPlot(s, offset, now);
  for (const key of Object.keys(plot)) if (!(key in next)) delete plot[key];
  Object.assign(plot, next);
  return plot;
}

/** Whether this player may not pick yet: someone else planted it and their 60 seconds run. */
export function lockedFor(plot, me, now = Date.now()) {
  return Boolean(plot && plot.state === 'crop' && plot.planter && Number(plot.planter) !== Number(me) && plot.lockUntil > now);
}

/**
 * The client's success roll for a verb with one (water, harvest), drawn before the server is
 * asked: the plan keeps skill rolls on the page (a cheat only skips a retry). A roll that fails
 * runs the verb here alone with the same draw (it changes no plot); one that succeeds asks the
 * server and runs with it. rate is the skill package's success_rate (percent).
 */
export function rollPasses(roll, rate) {
  const r = Number(rate);
  if (!Number.isFinite(r) || r >= 100) return true;
  return roll < r / 100;
}
