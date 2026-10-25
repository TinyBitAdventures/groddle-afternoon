/**
 * The machines in the three Community Machine Rooms (register row G169).
 * Pure data and rules (no Pixi, no DOM); js/features/machine-rooms-feature.js
 * draws them and runs them through the Make panel.
 *
 * What the source says (glitch-GameServerJS, CC0):
 * - config_prod.js:1296 public_machine_rooms and :1332 machine_rooms list the
 *   Meadow (LCR101Q98A12EHH), Forest (LIF16EM56A12FSB) and Besara
 *   (LA9MU59GB792T80) rooms. location.js:4116 is_machine_room().
 * - machine_base isInCraftingAltar() (fuelmaker.js:1197, blockmaker.js:1202,
 *   metalmaker.js:1303, woodworker.js:1181): true for a machine whose
 *   container is one of those rooms. It hides disassemble and fully
 *   disassemble there (fuelmaker.js:64, :310); the only pick up verb belongs
 *   to a half-built machine (placing_part_step, fuelmaker.js:351-365), and
 *   inc_admin.js:884 resets delete every machine except the rooms' ones. So
 *   a room machine is fixed: use, refuel and collect are all that is left.
 * - The "+5%" is not a multiplier. onMakingComplete (fuelmaker.js:843-868,
 *   blockmaker.js:843-863, metalmaker.js:947-955, woodworker.js:858-866)
 *   runs one drop table per finished making job, with the activity preface
 *   "Altar bonus! You used a Machine in a Machine Room: " before each
 *   runDropTable line (inc_skill_packages.js:1-130). Two of the tables are
 *   named "Machine Room 5% Bonus for Fuel Cell" / "... for Urth Block"
 *   (catalog_drop_tables.js:387-447), which is where the sign's 5% comes from.
 *   Which recipe rolls which table, exactly as written:
 *     Fuelmaker: 192 Fuel Cell -> crafting_altar_bonus_rewards_fuel
 *     Blockmaker: 193 -> _brick, 189 -> _grade_a_block, 190 Urth Block ->
 *       _grade_aa_block, 191 -> _grade_aaa_block (only 190 exists in
 *       catalog_recipes.js:3977, so only Urth Block pays)
 *     Metal Machine and Woodworker: recipe 192 -> _fuel, a recipe neither
 *       machine makes (279-281, 253/277/278), so they never pay. The
 *       _shortpost table (catalog_drop_tables.js:470) is never rolled.
 * - The machines (2013 location XML objrefs, which carry no positions):
 *   Meadow LCR101Q98A12EHH.xml:301-309 Woodworker, Blockmaker, Fuelmaker,
 *   Note, Metal Machine, Notice Board, Blockmaker; Besara
 *   LA9MU59GB792T80.xml:339-346 Butler Cubimal (a player's), Notice Board,
 *   Blockmaker, Metal Machine, Fuelmaker, Woodworker. Forest has no XML:
 *   forest-machine-room.js FOREST_MACHINE_ROOM_HELD.
 * - Positions come from Tiny Speck's street renders (reference only, 720 px
 *   for the 1400-wide room, so x = px * 1400 / 720 - 700; the sign deco
 *   checks the scale): Meadow 2011-09-30 (research/wayback/raw/street-images/
 *   groddle-meadow/LCR101Q98A12EHH_main_1317440663.jpg), Besara 2012-05-16
 *   (groddle-besara-g169/LA9MU59GB792T80_main_1337155083.jpg), Forest
 *   2012-05-21. The room art paints two X marks on the floor (machine
 *   spots: Meadow's 2011 machines stand on them); Besara's render shows its
 *   two uncovered, and its 2013 Metal Machine and Woodworker are put on them
 *   here. Machines the renders do not show are placed by judgement (each
 *   row's `why` says which).
 * - machine_base onAssembled starts a tank at max_fuel / 4; the rooms' real
 *   tank levels are not in the dump, so every room machine starts at 50/200.
 * - The Notice Boards hang on the right wall (Besara and Forest renders:
 *   px 513-620 by rows 168-235, world x 402, bottom -243). Meadow's 2013 board
 *   has no picture; it hangs in the same place on the same template.
 */

import { FOREST_MACHINE_ROOM_HELD, FOREST_MACHINE_ROOM_TSID } from './forest-machine-room.js';
import { MACHINE_ROOMS } from './exploration.js';
import { FRESH_FUEL, FUEL_PER_CELL, MAX_FUEL } from './machines.js';

/** config_prod.js:1332 machine_rooms, as built (G prefix). */
export const MACHINE_ROOM_TSIDS = Object.freeze([...MACHINE_ROOMS]);
export const isMachineRoomTsid = (tsid) => MACHINE_ROOMS.has(String(tsid || '').replace(/^L/, 'G'));

/** fuelmaker.js:863. */
export const ALTAR_PREFACE = 'Altar bonus! You used a Machine in a Machine Room: ';

/** onMakingComplete's recipe -> drop table, per machine (see the header). */
export const ALTAR_BONUS_TABLES = Object.freeze({
  fuelmaker: Object.freeze({ 192: 'crafting_altar_bonus_rewards_fuel' }),
  blockmaker: Object.freeze({
    193: 'crafting_altar_bonus_rewards_brick',
    189: 'crafting_altar_bonus_rewards_grade_a_block',
    190: 'crafting_altar_bonus_rewards_grade_aa_block',
    191: 'crafting_altar_bonus_rewards_grade_aaa_block',
  }),
  metalmaker: Object.freeze({ 192: 'crafting_altar_bonus_rewards_fuel' }),
  woodworker: Object.freeze({ 192: 'crafting_altar_bonus_rewards_fuel' }),
});

/** The table a finished job rolls, or null (not in a room, or no table for that recipe). */
export function altarBonusTable(classTsid, recipeId, { inRoom = true } = {}) {
  if (!inRoom) return null;
  return ALTAR_BONUS_TABLES[classTsid]?.[String(recipeId)] || null;
}

/** "You got 7 mood!" -> the source's online activity line. */
export const altarBonusLine = (line) => `${ALTAR_PREFACE}${line}`;

/** Machine labels as the objrefs name them (metalmaker's item name is Metal Machine). */
export const MACHINE_LABELS = Object.freeze({
  fuelmaker: 'Fuelmaker',
  blockmaker: 'Blockmaker',
  woodworker: 'Woodworker',
  metalmaker: 'Metal Machine',
});

/** making.js MAKING_TOOL_SKILLS for the four machines (inc_making.js making_required_skill). */
export const MACHINE_SKILLS = Object.freeze({
  fuelmaker: 'fuelmaking_1',
  blockmaker: 'blockmaking_1',
  woodworker: 'woodworking_1',
  metalmaker: 'metalwork_1',
});

/** Render px (720 wide) to room world x. */
export const renderX = (px) => Math.round((px * 1400) / 720 - 700);

const machine = (id, classTsid, x, why) => Object.freeze({ id, classTsid, x, why });

/** The Notice Board on the right wall, in room world coordinates (bottom centre). */
export const MACHINE_ROOM_BOARD = Object.freeze({ x: renderX(567), y: -243 });

export const MACHINE_ROOM_LAYOUTS = Object.freeze({
  GCR101Q98A12EHH: Object.freeze({
    label: 'Meadow Community Machine Room',
    sourceTsid: 'LCR101Q98A12EHH',
    machines: Object.freeze([
      machine('IA56S8OHNQ52CNI', 'blockmaker', renderX(106), '2011-09-30 render, first Blockmaker'),
      machine('IDOM9CJS0UJ2SQ6', 'blockmaker', renderX(233), '2011-09-30 render, second Blockmaker'),
      machine('IDOOVGC4SRJ2PBN', 'fuelmaker', renderX(340), '2011-09-30 render, first Fuelmaker'),
      machine('IA5RL1JTRQS2J4J', 'woodworker', renderX(447), 'judgement: the render\'s second Fuelmaker spot (2013 lists one Fuelmaker and a Woodworker)'),
      machine('IA5A0MC9AHV27GT', 'metalmaker', renderX(615), 'judgement: not in the 2011 render; the by-the-door spot the Forest render uses'),
    ]),
    board: MACHINE_ROOM_BOARD,
    boardWhy: 'no render shows Meadow\'s board; hung where Besara\'s and Forest\'s hang',
  }),
  GA9MU59GB792T80: Object.freeze({
    label: 'Besara Community Machine Room',
    sourceTsid: 'LA9MU59GB792T80',
    machines: Object.freeze([
      machine('IHV17TANAHV25N4', 'fuelmaker', renderX(108), '2012-05-16 render'),
      machine('IA9LA103LQA2J8U', 'blockmaker', renderX(232), '2012-05-16 render'),
      machine('IHV10AAIAHV2S0H', 'metalmaker', renderX(345), 'judgement: the render\'s first X mark (which of the two later machines went where is not recorded)'),
      machine('IHV13PMKAHV2IEG', 'woodworker', renderX(460), 'judgement: the render\'s second X mark'),
    ]),
    board: MACHINE_ROOM_BOARD,
    boardWhy: '2012-05-16 render',
  }),
  [FOREST_MACHINE_ROOM_TSID]: Object.freeze({
    label: 'Forest Community Machine Room',
    sourceTsid: 'LIF16EM56A12FSB',
    machines: Object.freeze(FOREST_MACHINE_ROOM_HELD.machines.map((m, i) => machine(`forest-${i}`, m.classTsid, m.x, m.why))),
    board: MACHINE_ROOM_BOARD,
    boardWhy: '2012-05-21 render (its one pinned note is unreadable, and no text survives: the board starts empty)',
  }),
});

/** Layout for a room (G or L prefix), or null. */
export function machineRoomLayout(tsid) {
  if (!isMachineRoomTsid(tsid)) return null;
  return MACHINE_ROOM_LAYOUTS[String(tsid).replace(/^L/, 'G')] || null;
}

/**
 * The furniture row a room carries (street-furniture-feature's furnitureRow
 * hook): the archived row (or none, for the rebuilt Forest room) plus one
 * Notice Board hung at a fixed spot. `toScreen(x, y)` maps room world to the
 * street's screen space.
 */
export function machineRoomFurnitureRow(tsid, base, toScreen) {
  const layout = machineRoomLayout(tsid);
  if (!layout) return null;
  const p = toScreen(layout.board.x, layout.board.y);
  return {
    ...(base || {}),
    bag_notice_board: 1,
    at: { ...(base?.at || {}), bag_notice_board: [{ x: p.x, y: p.y, wall: true }] },
  };
}

/**
 * One tank per room machine, shaped like js/tools.js tool state so
 * canUseTool / useToolCondition / refuelMachine work on it unchanged.
 */
export function machineTank(seed, classTsid) {
  const row = seed?.condition?.[classTsid];
  const remaining = Number.isFinite(Number(row?.remaining)) ? Math.max(0, Math.min(MAX_FUEL, Math.floor(Number(row.remaining)))) : FRESH_FUEL;
  return {
    condition: {
      [classTsid]: { remaining, broken: remaining <= 0, uses: Math.max(0, Number(row?.uses) || 0), repairs: 0 },
    },
  };
}

export const tankFuel = (tank, classTsid) => Math.max(0, Number(tank?.condition?.[classTsid]?.remaining) || 0);

/**
 * Wait, collect and lock (G175). A machine job is not made in your hands:
 * - making_make_known (players/inc_making.js:306-308) takes the ingredients
 *   up front for a machine, the job runs count * wait_ms + 2200 ms (:187,
 *   :230-231, "Extra time for the animations"), and the window does not stay
 *   open (rsp.no_modal, :504).
 * - finishMakingKnown (:716-946) runs the recipe when the time is up, wherever
 *   you are: the tank pays its fuel then (:760-777, item.use), and the outputs
 *   go into the machine (setContents, fuelmaker.js:1533-1544; inc_making.js:827-833) with READY and
 *   a callPlayer bubble; the activity line adds "Make sure to pick up your
 *   stuff soon, or it might disappear!" away from your own house (:915-918).
 * - While it runs, canUse (fuelmaker.js:1011-1021) is false: use says "The
 *   machine is still running. N remaining." to the one who started it and
 *   "Someone else is using this. N remaining." to everybody else
 *   (verbs.use :633-668). With your output waiting, use is hidden and the
 *   default verb is collect (:560-630), which hands it over with COLLECT.
 * - expireOldContents (:1146-1158): output left more than
 *   days_to_store_contents (6) game days in a machine that is not in your own
 *   house is gone. game_days_since_ts rounds (common.js:189-200; 14,400 real
 *   seconds to a game day).
 */
export const MACHINE_EXTRA_WAIT_MS = 2200;
export const GAME_DAY_MS = 14400 * 1000;
export const DAYS_TO_STORE_CONTENTS = 6;
/** The one player in a solo game; a job carries who started it, as last_user does. */
export const SOLO_USER = 'you';

/** computeEnergyAndTimeCost for a machine (inc_making.js:187, :230-231). */
export function machineJobMs(waitMs, qty = 1, waitMultiplier = 1) {
  const n = Math.max(1, Math.floor(Number(qty) || 1));
  const each = Math.max(0, Number(waitMs) || 0) * (Number(waitMultiplier) || 1);
  return Math.round(n * each) + MACHINE_EXTRA_WAIT_MS;
}

/** machineTimeRemaining (inc_making.js:1873-1890): whole seconds left, rounded. */
export const jobSecondsLeft = (job, now = Date.now()) => Math.max(0, Math.round(((Number(job?.readyAt) || 0) - now) / 1000));

export const jobRunning = (job, now = Date.now()) => Boolean(job) && now < (Number(job.readyAt) || 0);

/** common.js:204-240 secondsToString (minutes and seconds, no hours). */
export function secondsToString(secs) {
  const s = Math.max(0, Math.floor(Number(secs) || 0));
  if (s >= 60) {
    const mins = Math.floor(s / 60);
    const rest = s - mins * 60;
    const minWord = mins === 1 ? 'minute' : 'minutes';
    const secWord = rest === 1 ? 'second' : 'seconds';
    return rest ? `${mins} ${minWord} and ${rest} ${secWord}` : `${mins} ${minWord}`;
  }
  return `${s} ${s === 1 ? 'second' : 'seconds'}`;
}

/** game_days_since_ts (common.js:189-200) > days_to_store_contents. */
export function contentsExpired(at, now = Date.now()) {
  const diff = now - (Number(at) || 0);
  if (diff < 0) return false;
  return Math.round(diff / GAME_DAY_MS) > DAYS_TO_STORE_CONTENTS;
}

/** machine_base collect get_tooltip (fuelmaker.js:570-576). */
export const COLLECT_TOOLTIPS = Object.freeze({
  fuelmaker: 'Collect your fuel cell',
  blockmaker: 'Collect your block',
  metalmaker: 'Collect your metal',
  woodworker: 'Collect your wood',
});

/** machine_base callPlayer (fuelmaker.js:1006-1009) and onPlayerCollision (:1413-1419), said on finishing and when you come near. */
export const CALL_PLAYER_LINES = Object.freeze(['I made things for you!', 'Hey, come get your stuff!', 'Come take this stuff off my gears.']);

/** onPlayerCollision's hitbox (apiSetHitBox(200, 100), fuelmaker.js:1423). */
export const MACHINE_HITBOX = Object.freeze({ w: 200, h: 100 });

/** finishMakingKnown's activity line for a machine (inc_making.js:893-918; machine recipes cost no energy). */
export function machineMadeLine(recipeName, count, xp) {
  const xpBit = xp > 0 ? ` +${Math.round(xp)} iMG` : '';
  return `You made ${recipeName} (x${count})${xpBit}. Make sure to pick up your stuff soon, or it might disappear!`;
}

/** buildVerbMessage(count, 'collect from', 'collected from') with the machine's article (item.js:26-75). */
export const collectLine = (classTsid) => `You collected from a ${MACHINE_LABELS[classTsid] || classTsid}.`;

/**
 * Metal Music (metalmaker.js:46-101): Turn Music Off / On, only with the
 * Making Metal card (metalmaking_music); music_on is the machine's own and
 * on by default. The verbs carry no isInCraftingAltar check, so a room's
 * Metal Machine has them too.
 */
export function metalMusicVerbs(classTsid, { upgrade = false, musicOn = true } = {}) {
  if (classTsid !== 'metalmaker' || !upgrade) return [];
  return musicOn
    ? [{ id: 'music_off', label: 'Turn Music Off', sort: 50, tooltip: 'Stop playing Metal Music while the machine is working', enabled: true, reason: '', durationMs: 0 }]
    : [{ id: 'music_on', label: 'Turn Music On', sort: 51, tooltip: 'Play Metal Music while the machine is working', enabled: true, reason: '', durationMs: 0 }];
}

/** isPlayingMusic (metalmaker.js:787-800) / onPlayerEnter (:1527-1556), onMakingStart (:958-975): the sound a running machine loops. */
export function runningSoundKey(classTsid, { upgrade = false, musicOn = true } = {}) {
  return classTsid === 'metalmaker' && upgrade && musicOn ? 'METALMAKER' : 'ACTIVE';
}

/** Has stuff waiting: getContentsForPlayer (fuelmaker.js:1160-1172). */
export const hasContents = (contents) => Boolean(contents) && Object.values(contents.items || {}).some((n) => n > 0);

/**
 * The verbs a room machine offers: use, collect and refuel (machine_base
 * verbs.use, collect, refuel: fuelmaker.js:633, :560, :442), plus Metal Music on
 * a Metal Machine. No pick up and no disassemble.
 * ctx: { learned, fuelCells, skillName(id), job, contents, now, user,
 *        musicUpgrade, musicOn }
 */
export function roomMachineVerbs(classTsid, tank, ctx = {}) {
  const label = MACHINE_LABELS[classTsid] || classTsid;
  const fuel = tankFuel(tank, classTsid);
  const skill = MACHINE_SKILLS[classTsid];
  const learned = Array.isArray(ctx.learned) ? ctx.learned : [];
  const skillName = typeof ctx.skillName === 'function' ? ctx.skillName(skill) : skill;
  const now = Number.isFinite(ctx.now) ? ctx.now : Date.now();
  const me = ctx.user || SOLO_USER;
  const job = ctx.job || null;
  const running = jobRunning(job, now);
  const left = running ? secondsToString(jobSecondsLeft(job, now)) : '';
  const lockReason = running
    ? (job.user || SOLO_USER) === me
      ? `The machine is still running. ${left} remaining.`
      : `Someone else is using this. ${left} remaining.`
    : '';
  const waiting = hasContents(ctx.contents);
  const verbs = [];
  if (waiting) {
    // collect conditions: enabled unless the machine is running for somebody else.
    const otherRun = running && (job.user || SOLO_USER) !== me;
    verbs.push({
      id: 'collect',
      label: 'Collect',
      sort: 58,
      tooltip: COLLECT_TOOLTIPS[classTsid] || 'Collect a finished block',
      enabled: !otherRun,
      reason: otherRun ? `Someone else is using this. ${left} remaining.` : '',
      primary: !otherRun,
      durationMs: 0,
    });
  } else {
    // making_check_allowed (inc_making.js:80-108).
    const useReason = lockReason || (skill && !learned.includes(skill)
      ? `You need to know ${skillName} to use this.`
      : fuel <= 0
        ? `This ${label} does not have enough fuel remaining.`
        : '');
    verbs.push({ id: 'use', label: 'Use', sort: 56, tooltip: `Get Excited and Make Things. Fuel: ${fuel}/${MAX_FUEL}`, enabled: !useReason, reason: useReason, durationMs: 0 });
  }
  const cells = Math.max(0, Math.floor(Number(ctx.fuelCells) || 0));
  const refuelReason = fuel > MAX_FUEL - FUEL_PER_CELL
    ? `There is not enough space for a fuel cell. Current level: ${fuel}/${MAX_FUEL}`
    : cells < 1
      ? "You don't have any fuel cells."
      : '';
  const fit = Math.min(cells, Math.floor((MAX_FUEL - fuel) / FUEL_PER_CELL));
  verbs.push({ id: 'refuel', label: 'Refuel', sort: 54, tooltip: `Add more fuel. Current level: ${fuel}/${MAX_FUEL}`, enabled: !refuelReason, reason: refuelReason, durationMs: 0 });
  if (!refuelReason && fit > 1) {
    verbs.push({ id: 'refuel_all', label: `Refuel with ${fit} cells`, sort: 55, tooltip: `Fill the tank. Current level: ${fuel}/${MAX_FUEL}`, enabled: true, reason: '', durationMs: 0 });
  }
  verbs.push(...metalMusicVerbs(classTsid, { upgrade: ctx.musicUpgrade, musicOn: ctx.musicOn !== false }));
  return verbs;
}

/**
 * What a started job holds: count * each input, taken from the pack now
 * (inc_making.js:306-308). Returns null when the pack is short.
 */
export function takeJobIngredients(inv, recipe, qty, { count, remove }) {
  const n = Math.max(1, Math.floor(Number(qty) || 1));
  const need = {};
  for (const inp of recipe?.inputs || []) need[inp.classTsid] = (need[inp.classTsid] || 0) + inp.qty * n;
  for (const [id, q] of Object.entries(need)) if (count(inv, id) < q) return null;
  for (const [id, q] of Object.entries(need)) remove(inv, id, q);
  return need;
}
