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
 *   one. Here: the owner's home street, their house and their Tower's floors,
 *   never a public street (Austin, 2026-11-01: "Machines may stand on the
 *   home street, in the house and in the Tower"); the remake's machines stay
 *   pack tools as well (js/machines.js). In a room the "ends of the street"
 *   are the room's inner walls (home-decor interiorBounds: the house's side
 *   walls 76 px inside each end segment, a Tower floor's elevator side and
 *   far wall), and the 200 px spacing counts only machines in that room
 *   (findCloseStack looks through pc.location.items, player.js 1152-1186:
 *   one location). The house is its ground floor (HOUSE_<id>, the room
 *   visitors share); an upper house floor stays the owner's own room.
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
 *   machine's place, wherever the maker went (bug 8964's intent). So only a
 *   machine on the home street pays: the house is not public (:170
 *   is_public), and a Tower's own rewards were never collected (the Magic
 *   Rock reads home.exterior's alone, players/inc_houses.js 1706-1709).
 * - Fuel: 200 at most, a fresh machine 50 (onCreate max_fuel / 4), +50 a
 *   Fuel Cell and refused with less than 50 room (refuel 457-470).
 *
 * The Community Machine Rooms (lane machines, report #152; Austin 2026-11-08:
 * "Allow machines in the community machine rooms only."): besides the home,
 * a player may set their own machine down in the Meadow, Besara and Forest
 * rooms (config_prod.js:1332 machine_rooms), nowhere else. There the same
 * canDrop holds (machine_stand.js 771-794): 200 px from any machine, the
 * room's own included (findCloseStack(is_machine, 200) looks through every
 * item in the location), and 70 px from the room's ends (geo.l / geo.r, the
 * rooms' -700..700). A room is no POL, so:
 * - anyone uses, refuels and collects (as everywhere: no owner check), and
 *   what each player made waits for them alone (contents per player);
 * - everyone's output goes after 6 game days, the owner's too
 *   (expireOldContents 1146-1158: only a POL's owner keeps theirs);
 * - a finished job rolls the room's Altar bonus (machine_base
 *   isInCraftingAltar is true for any machine whose container is a machine
 *   room, fuelmaker.js 1197-1199, 861-866), for whoever made it;
 * - nobody's Magic Rock pool is paid (no home: inc_cultivation.js:170);
 * - only its owner picks it up (ours: in the source isInCraftingAltar hides
 *   disassemble and fully_disassemble in a machine room, fuelmaker.js 64 and
 *   310, so a machine set down there could never be taken back by anyone;
 *   the lane's brief keeps the owner's Pick up);
 * - it stays where it was put when its owner is offline or never comes back,
 *   as a placed machine did in the original.
 * Each row's place names its room ("mr:meadow", "mr:besara", "mr:forest").
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
} from './machine-rooms.js?v=1be82048';
import { ASSEMBLY_SKILL, FUEL_PER_CELL, MAX_FUEL, isMachine } from './machines.js?v=c44050e6';
import { INTERIOR, interiorBounds } from './home-decor.js?v=d6fabb62';
import { machineRoomLayout } from './machine-rooms.js?v=1be82048';

export const HOME_MACHINES_ID = 'home-machines';

/** The home street's tsid in a save (homes-feature HOME_STREET_TSID). */
export const HOME_MACHINES_STREET = 'RH_HOME_EXT';
/** The house and Tower floors' tsid in a save (homes-feature HOME_INTERIOR_TSID). */
export const HOME_MACHINES_INTERIOR = 'RH_HOME_INT';

/**
 * Where in a home a machine stands: the home street, the house (its ground
 * floor) or a Tower floor ("tower:<0..8>", config_base.js towers MAX_FLOORS).
 * The realtime server names it from the street the actor stands on
 * (HOME_<id>, HOUSE_<id>, TOWER_<id>_<floor>).
 */
export const PLACE_STREET = 'street';
export const PLACE_HOUSE = 'house';
const PLACE_RE = /^(street|house|tower:[0-8]|mr:(meadow|besara|forest))$/;
export const isPlace = (p) => PLACE_RE.test(String(p || ''));

/** The three Community Machine Rooms (config_prod.js:1332 machine_rooms, as built: G prefix) and their places. */
export const MACHINE_ROOM_PLACES = Object.freeze({
  GCR101Q98A12EHH: 'mr:meadow',
  GA9MU59GB792T80: 'mr:besara',
  GIF16EM56A12FSB: 'mr:forest',
});
/** The place a machine room street names (G or L prefix), or ''. */
export const roomPlaceOf = (tsid) => MACHINE_ROOM_PLACES[String(tsid || '').replace(/^L/, 'G')] || '';
export const isRoomPlace = (p) => /^mr:(meadow|besara|forest)$/.test(String(p || ''));
/** The room street a place stands for, or ''. */
export const roomTsidOf = (place) => Object.keys(MACHINE_ROOM_PLACES).find((t) => MACHINE_ROOM_PLACES[t] === place) || '';
/** "mr:meadow" -> "meadow" (the site's route names a room so). */
export const roomName = (place) => (isRoomPlace(place) ? String(place).slice(3) : '');
/** The rooms' ends: one template, bldg_int_machine.swf, bounds -700..700 (Meadow and Besara's street JSON, forest-machine-room.js). */
export const MACHINE_ROOM_BOUNDS = Object.freeze({ l: -700, r: 700 });
/** Where a machine may stand in a room, in room world x: its ends. */
export const roomMachineSpan = () => ({ lo: MACHINE_ROOM_BOUNDS.l, hi: MACHINE_ROOM_BOUNDS.r });
/** The room's own machines' x (machine-rooms.js MACHINE_ROOM_LAYOUTS): canDrop keeps 200 px from them too. */
export const roomFixedXs = (place) => (machineRoomLayout(roomTsidOf(place))?.machines || []).map((m) => m.x);
/** isInCraftingAltar (fuelmaker.js 1197-1199): a machine in a machine room rolls the Altar bonus. */
export const placeIsAltar = (p) => isRoomPlace(p);
export const towerPlace = (floor) => `tower:${Math.max(0, Math.min(8, Math.floor(Number(floor) || 0)))}`;
/** Only the home street is a home's public half that pays the pool (inc_cultivation.js:170, inc_houses.js 1706-1709). */
export const placePays = (p) => (p || PLACE_STREET) === PLACE_STREET;
/** The walk line a machine stands on: the street's, or a room's floor (home-decor INTERIOR.floorY). */
export const ROOM_GROUND_Y = INTERIOR.floorY;

/**
 * A room's span for placing, in room x (0 at the room's left end): the inner
 * walls of the house (decor wallSegments) or of a Tower floor.
 */
export function roomSpan(place, decor = null) {
  if (String(place).startsWith('tower:')) {
    const b = interiorBounds({ layout: 'tower' });
    return { lo: b.left, hi: b.right };
  }
  const b = interiorBounds({ wallSegments: decor?.wallSegments });
  return { lo: b.left, hi: b.right };
}

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
  placeTip: 'Set it down here, for anyone here to use',
  placeHome: 'You can only set a machine down in your own home (on your home street, in your house or in your Tower) or in a Community Machine Room.', // ours
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
 * machines: the placed ones ({ rx }) in the same place. In a room `span`
 * ({ lo, hi } in room x, roomSpan) stands for the street's ends.
 */
export function placeCheck({ machines = [], rx, layout, span, classTsid, fixed = [] } = {}) {
  const label = machineLabel(classTsid);
  if (!isHomeMachineClass(classTsid)) return { ok: false, why: 'class', msg: 'That is not a machine.' };
  if (machines.length >= HOME_MACHINES_MAX) return { ok: false, why: 'many', msg: HOME_MACHINE_TEXT.placeMany };
  const x = Math.round(finite(rx, NaN));
  if (!Number.isFinite(x)) return { ok: false, why: 'here', msg: HOME_MACHINE_TEXT.placeHere(label) };
  if (span && Number.isFinite(span.lo) && Number.isFinite(span.hi)) {
    if (x <= span.lo + MACHINE_EDGE || x >= span.hi - MACHINE_EDGE) return { ok: false, why: 'edge', msg: HOME_MACHINE_TEXT.placeHere(label) };
  } else if (layout && Number.isFinite(layout.houseX) && Number.isFinite(layout.width)) {
    const wx = layout.houseX + x;
    if (wx <= MACHINE_EDGE || wx >= layout.width - MACHINE_EDGE) return { ok: false, why: 'edge', msg: HOME_MACHINE_TEXT.placeHere(label) };
  }
  if (machines.some((m) => Math.abs(finite(m.rx) - x) < MACHINE_SPACING) || fixed.some((fx) => Math.abs(finite(fx) - x) < MACHINE_SPACING)) return { ok: false, why: 'near', msg: HOME_MACHINE_TEXT.placeHere(label) };
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
 * { id, classTsid, place, rx, fuel, music, job: { user, name, qty, startedAt,
 * readyAt } | null, waiting: [user ids with output in it] } (place: where
 * in the home, PLACE_STREET when the row names none). `offset` turns
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
    // Whose it is: the site names it in a machine room, where machines of many players stand (solo: '').
    owner: raw.owner == null ? '' : String(raw.owner),
    ownerName: String(raw.ownerName || ''),
    place: isPlace(raw.place) ? String(raw.place) : PLACE_STREET,
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

/** expireOldContents: anyone's but the owner's, older than 6 game days (owner null: a machine room, no POL, where the owner's goes too). */
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
      jobs[op] = { key: j.key, qty: Math.max(1, whole(j.qty)), classTsid: String(j.classTsid || ''), readyAt: finite(j.readyAt), held: { ...(j.held || {}) }, owner: whole(j.owner), machine: String(j.machine || ''), ...(isPlace(j.place) ? { place: String(j.place) } : {}) };
    }
  }
  const machines = Array.isArray(raw?.machines) ? raw.machines.map(soloRow).filter(Boolean) : [];
  return { placed: ids(raw?.placed), taken: ids(raw?.taken).slice(-TAKEN_KEEP), jobs, machines };
}
