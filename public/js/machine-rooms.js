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
 * The verbs a room machine offers: use and refuel (machine_base verbs.use
 * :633-668, verbs.refuel :442-558). No pick up and no disassemble.
 * ctx: { learned, fuelCells, skillName(id) }
 */
export function roomMachineVerbs(classTsid, tank, ctx = {}) {
  const label = MACHINE_LABELS[classTsid] || classTsid;
  const fuel = tankFuel(tank, classTsid);
  const skill = MACHINE_SKILLS[classTsid];
  const learned = Array.isArray(ctx.learned) ? ctx.learned : [];
  const skillName = typeof ctx.skillName === 'function' ? ctx.skillName(skill) : skill;
  // making_check_allowed (inc_making.js:80-108).
  const useReason = skill && !learned.includes(skill)
    ? `You need to know ${skillName} to use this.`
    : fuel <= 0
      ? `This ${label} does not have enough fuel remaining.`
      : '';
  const cells = Math.max(0, Math.floor(Number(ctx.fuelCells) || 0));
  const refuelReason = fuel > MAX_FUEL - FUEL_PER_CELL
    ? `There is not enough space for a fuel cell. Current level: ${fuel}/${MAX_FUEL}`
    : cells < 1
      ? "You don't have any fuel cells."
      : '';
  const fit = Math.min(cells, Math.floor((MAX_FUEL - fuel) / FUEL_PER_CELL));
  const verbs = [
    { id: 'use', label: 'Use', sort: 56, tooltip: `Get Excited and Make Things. Fuel: ${fuel}/${MAX_FUEL}`, enabled: !useReason, reason: useReason, durationMs: 0 },
    { id: 'refuel', label: 'Refuel', sort: 54, tooltip: `Add more fuel. Current level: ${fuel}/${MAX_FUEL}`, enabled: !refuelReason, reason: refuelReason, durationMs: 0 },
  ];
  if (!refuelReason && fit > 1) {
    verbs.push({ id: 'refuel_all', label: `Refuel with ${fit} cells`, sort: 55, tooltip: `Fill the tank. Current level: ${fuel}/${MAX_FUEL}`, enabled: true, reason: '', durationMs: 0 });
  }
  return verbs;
}
