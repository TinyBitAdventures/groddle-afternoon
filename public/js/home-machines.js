/**
 * Machines set down on a home street (lane MACHINES, Austin 2026-11-01:
 * "Let owners set an assembled machine down on their street, as the
 * original did."). The pure rules and the copy; the feature is
 * js/features/home-machines-feature.js. In multiplayer the machine lives on
 * the site (groddle-afternoon-site src/HomeMachines.php, its data
 * data/home-machines.json written by tools/build-home-machines.mjs) and the
 * realtime server carries the acts (groddle-afternoon-server
 * home_machines.go); in solo it lives in the feature's slice of the save.
 *
 * What the original did (glitch-GameServerJS, CC0; the four machines share
 * machine_base, fuelmaker.js lines below):
 *
 * - A machine only ever stood in a location: every verb of an assembled
 *   machine is ok_states ["in_location"] and keys_in_pack is empty
 *   (fuelmaker.js 46-660, 1647-1657); the Machine Stand is dropped and the
 *   parts put on it there ("As with all good foundations, once assembled it
 *   cannot be moved.", machine_stand.js:7). The stand could go anywhere but
 *   an instance, never within 200 px of another stand or machine, nor within
 *   70 px of either end of the street (machine_stand.js canDrop 770-788). So
 *   a home street, the house, the Tower and every public street could carry
 *   one. Here: the owner's home street (Austin's decision); the remake's
 *   machines stay pack tools as well (js/machines.js).
 * - Anyone standing there could use it, refuel it and collect what they made
 *   (verbs.use 633-684, refuel 442-558, collect 560-631: no owner check);
 *   only the owner or a key-holder could take it apart (disassemble 322,
 *   fully_disassemble 76, pick up 372: "Only the owner or a keyholder of this
 *   location can disassemble this ..."), with Engineering (59, 316), never
 *   while it ran (canUse 1011-1021), and with a warning when other players'
 *   things were still in it (verifyDisassemble 1568-1581: they are
 *   destroyed). Here taking it apart is "Pick up": it goes back in the pack
 *   whole, its tank with it, as the remake's machines are pack tools.
 * - One job at a time: while it runs nobody else can use it ("Someone else
 *   is using this. N remaining.", use 655-660); the ingredients go in when
 *   the job starts (inc_making.js 306-308), the job takes count * wait_ms +
 *   2200 ms (machine-rooms.js machineJobMs), the tank pays the fuel when it
 *   is done (inc_making.js 760-777, Better/Betterer Blockmaker 20/40% less on
 *   the whole job) and what it made waits in the machine for whoever made it
 *   (setContents 1533-1544, getContentsForPlayer 1160-1172): yours never
 *   expires in your own home, anyone else's after 6 game days
 *   (expireOldContents 1146-1158). You collect yours (collect 560-631);
 *   while yours waits, use is hidden (use 664-668).
 * - A finished job by someone who is not the owner adds 7 to the owner's
 *   Magic Rock pool (inc_making.js:836, cultivation_add_img_rewards(this,
 *   7.0); locations/inc_cultivation.js 168-178: only on a home's public
 *   half, never for the owner). The source credits the street the maker
 *   stands on when the job finishes (this.location); here it is the
 *   machine's home, wherever the maker went (bug 8964's intent).
 * - Fuel: 200 at most, a fresh machine 50 (onCreate max_fuel / 4), +50 a
 *   Fuel Cell and refused with less than 50 room (refuel 457-470).
 */

import {
  COLLECT_TOOLTIPS,
  DAYS_TO_STORE_CONTENTS,
  GAME_DAY_MS,
  MACHINE_EXTRA_WAIT_MS,
  MACHINE_LABELS,
  MACHINE_SKILLS,
  contentsExpired,
  jobRunning,
  jobSecondsLeft,
  machineTank,
  roomMachineVerbs,
  secondsToString,
} from './machine-rooms.js?v=b37e9a73';
import { ASSEMBLY_SKILL, FUEL_PER_CELL, MAX_FUEL, isMachine } from './machines.js?v=b5f892f6';

export const HOME_MACHINES_ID = 'home-machines';

/** The home street's tsid in a save (homes-feature HOME_STREET_TSID). */
export const HOME_MACHINES_STREET = 'RH_HOME_EXT';

/** inc_making.js:836 cultivation_add_img_rewards(this, 7.0). */
export const HOME_MACHINE_POOL = 7;
/** machine_stand.js canDrop: findCloseStack('machine_stand' | is_machine, 200). */
export const MACHINE_SPACING = 200;
/** machine_stand.js canDrop: pc.x <= geo.l+70 || pc.x >= geo.r-70. */
export const MACHINE_EDGE = 70;
/** Ours: machines one home street keeps (the site keeps at most this many). */
export const HOME_MACHINES_MAX = 8;
/** inc_making.js 368-375: Better / Betterer Blockmaker (the whole job's fuel). */
export const SAVE_FUEL = Object.freeze({ blockmaking_save_fuel_2: 0.4, blockmaking_save_fuel_1: 0.2 });
/** inc_making.js get_task_limit_multiplier 1759-1806: Mad Machinist I / II. */
export const TASK_LIMIT_CARDS = Object.freeze({ recipe_task_limit_machines_2: 2, recipe_task_limit_machines_1: 1.5 });

export { DAYS_TO_STORE_CONTENTS, GAME_DAY_MS, MACHINE_EXTRA_WAIT_MS, MAX_FUEL, FUEL_PER_CELL };

export const HOME_MACHINE_TEXT = Object.freeze({
  placeVerb: 'Place',
  placeTip: 'Set it down here, for anyone on your street to use',
  placeHome: 'You can only set a machine down on your own home street.', // ours
  placeHere: (label) => `This ${label} cannot be placed here.`, // machine_stand.js canDrop
  placeMany: 'You have a lot of machines out already.', // ours
  placed: (label) => `You put your ${label} down here.`, // ours
  pickupVerb: 'Pick up',
  pickupTip: 'Put it back in your pack',
  pickupDenied: (label) => `Only the owner or a keyholder of this location can pick up this ${label}.`, // fuelmaker.js:322 (disassemble)
  engineering: 'You need to know Engineering to do this.', // fuelmaker.js:316
  stillRunning: 'The machine is still in use.', // fuelmaker.js:327
  someoneElse: 'Someone else is using this.', // fuelmaker.js:329
  collectFirst: 'Collect what is in the machine first.', // ours (use is hidden while yours waits, 664-668)
  othersInside: 'Are you sure you want to pick this up? The machine contains items belonging to other players that will be destroyed.', // fuelmaker.js:1573
  pickedUp: (label) => `You picked up the ${label}.`, // ours
  ingredients: 'You need more ingredients.',
  offline: 'You need to be online to do that.',
  failed: 'That didn\'t work. Try again in a moment.',
  noRecipe: 'This machine doesn\'t make that.',
  tooMany: 'That\'s more than it can make at once.',
  noFuel: (label) => `This ${label} does not have enough fuel remaining.`, // inc_making.js:100
  madeAtYours: (name, label) => `${name} made something at your ${label}.`, // ours
  yours: 'Yours',
  ownerOf: (name) => `${name}'s`,
});

const finite = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
const whole = (v) => Math.max(0, Math.floor(finite(v)));

/** The four machines (machine_base). */
export const isHomeMachineClass = (classTsid) => isMachine(classTsid);

export const machineLabel = (classTsid) => MACHINE_LABELS[classTsid] || String(classTsid || '').replace(/_/g, ' ');

/**
 * Where on the street a machine may go (machine_stand.js canDrop): rx is
 * from the house, the street runs from -houseX to width - houseX.
 * machines: the placed ones ({ rx }).
 */
export function placeCheck({ machines = [], rx, layout, classTsid } = {}) {
  const label = machineLabel(classTsid);
  if (!isHomeMachineClass(classTsid)) return { ok: false, why: 'class', msg: 'That is not a machine.' };
  if (machines.length >= HOME_MACHINES_MAX) return { ok: false, why: 'many', msg: HOME_MACHINE_TEXT.placeMany };
  const x = Math.round(finite(rx, NaN));
  if (!Number.isFinite(x)) return { ok: false, why: 'here', msg: HOME_MACHINE_TEXT.placeHere(label) };
  if (layout && Number.isFinite(layout.houseX) && Number.isFinite(layout.width)) {
    const wx = layout.houseX + x;
    if (wx <= MACHINE_EDGE || wx >= layout.width - MACHINE_EDGE) return { ok: false, why: 'edge', msg: HOME_MACHINE_TEXT.placeHere(label) };
  }
  if (machines.some((m) => Math.abs(finite(m.rx) - x) < MACHINE_SPACING)) return { ok: false, why: 'near', msg: HOME_MACHINE_TEXT.placeHere(label) };
  return { ok: true, rx: x };
}

/** Fuel a job burns (inc_making.js 760-777): the recipe's per-unit fuel times the count, less the Blockmaker cards' share. */
export function jobFuel(classTsid, perUnit, qty, upgrades = []) {
  let uses = whole(perUnit) * Math.max(1, whole(qty));
  if (classTsid === 'blockmaker') {
    const set = new Set(upgrades || []);
    for (const [card, share] of Object.entries(SAVE_FUEL)) {
      if (set.has(card)) {
        uses -= Math.round(uses * share);
        break;
      }
    }
  }
  return uses;
}

/** The most one job makes (main.js:795-799 with the Mad Machinist cards). */
export function jobLimit(taskLimit, upgrades = []) {
  const base = whole(taskLimit) || 1;
  const set = new Set(upgrades || []);
  for (const [card, m] of Object.entries(TASK_LIMIT_CARDS)) if (set.has(card)) return Math.round(base * m);
  return base;
}

/* ------------------------------------------------------------------ */
/* A machine as everyone sees it                                        */
/* ------------------------------------------------------------------ */

/**
 * A machine's shared state, as the site sends it (and as solo keeps it):
 * { id, classTsid, rx, fuel, music, job: { user, name, qty, startedAt,
 * readyAt } | null, waiting: [user ids with output in it] }. `offset` turns
 * the site's clock into this page's (local - site).
 */
export function normalizeMachine(raw, offset = 0) {
  if (!raw || typeof raw !== 'object') return null;
  const id = String(raw.id || '');
  const classTsid = String(raw.class ?? raw.classTsid ?? '');
  if (!/^hm-[0-9a-f]{16}$/.test(id) || !isHomeMachineClass(classTsid)) return null;
  const job = raw.job && typeof raw.job === 'object' && Number.isFinite(Number(raw.job.ready ?? raw.job.readyAt))
    ? {
      user: String(raw.job.user ?? ''),
      name: String(raw.job.name || ''),
      qty: Math.max(1, whole(raw.job.qty)),
      startedAt: finite(raw.job.at ?? raw.job.startedAt) + offset,
      readyAt: finite(raw.job.ready ?? raw.job.readyAt) + offset,
    }
    : null;
  return {
    id,
    classTsid,
    rx: Math.round(finite(raw.rx)),
    fuel: Math.max(0, Math.min(MAX_FUEL, whole(raw.fuel))),
    music: raw.music !== false,
    job,
    waiting: Array.isArray(raw.waiting) ? raw.waiting.map((u) => String(u)) : [],
  };
}

/** The tank in js/tools.js's shape (machine-rooms machineTank), for the Make panel and the verbs. */
export const tankOf = (m) => machineTank({ condition: { [m.classTsid]: { remaining: m.fuel } } }, m.classTsid);

/**
 * The verbs a placed machine offers `me`: use / collect / refuel (and Metal
 * Music) as a room machine's (machine-rooms roomMachineVerbs), plus Pick up
 * for the owner or a key-holder (fuelmaker.js disassemble 296-349).
 * ctx: { me, mayTake, learned, fuelCells, skillName, now, musicUpgrade }
 */
export function placedMachineVerbs(m, ctx = {}) {
  const me = String(ctx.me ?? 'you');
  const now = Number.isFinite(ctx.now) ? ctx.now : Date.now();
  const job = m.job ? { ...m.job, user: m.job.user } : null;
  const mine = m.waiting.includes(me);
  const verbs = roomMachineVerbs(m.classTsid, tankOf(m), {
    learned: ctx.learned,
    fuelCells: ctx.fuelCells,
    skillName: ctx.skillName,
    job,
    contents: mine ? { items: { output: 1 } } : null,
    now,
    user: me,
    musicUpgrade: ctx.musicUpgrade,
    musicOn: m.music,
  });
  if (ctx.mayTake) verbs.push(pickupVerb(m, { ...ctx, me, now, mine }));
  return verbs;
}

function pickupVerb(m, ctx) {
  const label = machineLabel(m.classTsid);
  const learned = Array.isArray(ctx.learned) ? ctx.learned : [];
  const running = jobRunning(m.job, ctx.now);
  let reason = '';
  if (!learned.includes(ASSEMBLY_SKILL)) reason = HOME_MACHINE_TEXT.engineering;
  else if (running) reason = m.job.user === ctx.me ? HOME_MACHINE_TEXT.stillRunning : HOME_MACHINE_TEXT.someoneElse;
  else if (ctx.mine) reason = HOME_MACHINE_TEXT.collectFirst;
  return { id: 'machine_pickup', label: HOME_MACHINE_TEXT.pickupVerb, sort: 53, tooltip: HOME_MACHINE_TEXT.pickupTip, enabled: !reason, reason, durationMs: 0 };
}

/** The subtitle under a placed machine. */
export function machineSubtitle(m, { me = 'you', now = Date.now(), ownerName = '' } = {}) {
  if (jobRunning(m.job, now)) {
    const left = secondsToString(jobSecondsLeft(m.job, now));
    return m.job.user === String(me) ? `Working · ${left} left` : `In use · ${left} left`;
  }
  if (m.waiting.includes(String(me))) return 'Done · your stuff is waiting';
  return `${ownerName ? `${ownerName}'s machine` : 'Your machine'} · Fuel ${m.fuel}/${MAX_FUEL}`;
}

/** Whether there is anyone else's output in it (the pick up warning). */
export const othersInside = (m, me) => m.waiting.some((u) => u !== String(me));

/* ------------------------------------------------------------------ */
/* Solo: the same rules on the slice                                    */
/* ------------------------------------------------------------------ */

/** A solo machine row: the shared state plus what the site keeps (held, contents). */
export function soloRow(raw) {
  const m = normalizeMachine(raw);
  if (!m) return null;
  const contents = {};
  for (const [user, c] of Object.entries(raw.contents || {})) {
    const items = {};
    for (const [cls, n] of Object.entries(c?.items || {})) if (whole(n) > 0) items[cls] = whole(n);
    if (Object.keys(items).length) contents[user] = { items, at: finite(c.at) };
  }
  const job = m.job && raw.job ? { ...m.job, key: String(raw.job.key || ''), recipeId: String(raw.job.recipeId || ''), held: { ...(raw.job.held || {}) }, need: whole(raw.job.need) } : null;
  return { ...m, job, contents, waiting: Object.keys(contents) };
}

/** The job is done (finishMakingKnown): the tank pays, the output waits for its maker. */
export function settleSolo(row, outputs, now = Date.now()) {
  if (!row.job || jobRunning(row.job, now)) return false;
  const job = row.job;
  row.fuel = Math.max(0, row.fuel - whole(job.need));
  const had = row.contents[job.user]?.items || {};
  const items = { ...had };
  for (const [cls, n] of Object.entries(outputs || {})) if (whole(n) > 0) items[cls] = (items[cls] || 0) + whole(n);
  if (Object.keys(items).length) row.contents[job.user] = { items, at: job.readyAt };
  row.job = null;
  row.waiting = Object.keys(row.contents);
  return true;
}

/** expireOldContents: anyone's but the owner's, older than 6 game days. */
export function expireSolo(row, owner = 'you', now = Date.now()) {
  for (const [user, c] of Object.entries(row.contents)) {
    if (user !== owner && contentsExpired(c.at, now)) delete row.contents[user];
  }
  row.waiting = Object.keys(row.contents);
}

/** The recipe's outputs for a job of qty (making_execute_recipe outputs * count). */
export function jobOutputs(recipe, qty) {
  const out = {};
  for (const o of recipe?.outputs || []) out[o.classTsid] = (out[o.classTsid] || 0) + whole(o.qty) * Math.max(1, whole(qty));
  return out;
}

export { COLLECT_TOOLTIPS, MACHINE_SKILLS, jobRunning, jobSecondsLeft, secondsToString };

/* ------------------------------------------------------------------ */
/* What the owner's (or a key-holder's) game applies once               */
/* ------------------------------------------------------------------ */

const OP_RE = /^hm-[0-9a-f]{16}$/;
export const isMachineOp = (op) => OP_RE.test(String(op || ''));
export const TAKEN_KEEP = 24;

/** The slice: placed ids this save has taken out of the pack, taken ops it has put back, my jobs (for the iMG when they finish). */
export function normalizeSlice(raw) {
  const ids = (list) => (Array.isArray(list) ? list.filter(isMachineOp) : []);
  const jobs = {};
  for (const [op, j] of Object.entries(raw?.jobs || {})) {
    if (isMachineOp(op) && j && typeof j === 'object' && typeof j.key === 'string' && Number.isFinite(Number(j.readyAt))) {
      jobs[op] = { key: j.key, qty: Math.max(1, whole(j.qty)), classTsid: String(j.classTsid || ''), readyAt: finite(j.readyAt), held: { ...(j.held || {}) }, owner: whole(j.owner), machine: String(j.machine || '') };
    }
  }
  const machines = Array.isArray(raw?.machines) ? raw.machines.map(soloRow).filter(Boolean) : [];
  return { placed: ids(raw?.placed), taken: ids(raw?.taken).slice(-TAKEN_KEEP), jobs, machines };
}
