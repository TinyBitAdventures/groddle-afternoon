/**
 * Machines (Woodworker, Fuelmaker, Metalmaker, Blockmaker): assembly from
 * vendor parts and the fuel tank that machine recipes burn.
 *
 * Source (glitch-GameServerJS, CC0):
 * - items/machine_stand.js: add_chassis needs Engineering I and 20 energy per
 *   component; assemble_woodworker / _metalmaker / _fuelmaker / _blockmaker
 *   list the three parts each machine takes. The archived item pages agree:
 *   "You'll need a Machine Stand, Woodworker Fuser, Woodworker Chassis and
 *   Machine Engine to assemble a Woodworker." (blockmaker_engine is the shared
 *   "Machine Engine".)
 * - items/<machine>.js machine_base: max_fuel 200, a fresh machine starts at
 *   max_fuel / 4 (onAssembled), refuel adds 50 per Fuel Cell and refuses when
 *   the tank has less than 50 room.
 * - players/inc_making.js: for making_type "machine" a recipe's fuel_cell
 *   input is fuel from the tank (tool_uses = fuel qty), not pack Fuel Cells.
 *
 * Remake: the machine is a pack tool like the Metalmaker always was here, the
 * stand is assembled in one go from the pack (60 energy for three
 * components), and the tank is the tool's condition in js/tools.js
 * (capacity 200, not repairable, refuelled here).
 */

import { addItem, countItem, removeItem } from './inventory.js?v=catalog-unified-4';
import { ensureToolCondition, getToolCondition } from './tools.js';
import { distillingBonus, hasMasterAssembler, hasMasterExploder, machinePartInstallMs } from './imagination-effects.js';

export const MACHINE_STAND = 'machine_stand';
export const MACHINE_ENGINE = 'blockmaker_engine';
export const FUEL_CELL = 'fuel_cell';
export const ASSEMBLY_SKILL = 'engineering_1';
export const COMPONENT_ENERGY = 20;
export const MAX_FUEL = 200;
export const FRESH_FUEL = MAX_FUEL / 4;
export const FUEL_PER_CELL = 50;

/** machine_stand.js assemble_* verbs, in the order the parts go on. */
export const MACHINE_ASSEMBLIES = Object.freeze({
  woodworker: Object.freeze({ label: 'Woodworker', parts: Object.freeze(['woodworker_fuser', 'woodworker_chassis', MACHINE_ENGINE]) }),
  metalmaker: Object.freeze({ label: 'Metalmaker', parts: Object.freeze(['metalmaker_mechanism', 'metalmaker_tooler', MACHINE_ENGINE]) }),
  fuelmaker: Object.freeze({ label: 'Fuelmaker', parts: Object.freeze(['fuelmaker_case', 'fuelmaker_core', MACHINE_ENGINE]) }),
  blockmaker: Object.freeze({ label: 'Blockmaker', parts: Object.freeze(['blockmaker_chassis', MACHINE_ENGINE, 'blockmaker_plates']) }),
});

export const MACHINE_IDS = Object.freeze(Object.keys(MACHINE_ASSEMBLIES));

/** GSJS label / base_cost / description for the stand and every part. */
export const MACHINE_PART_ITEMS = Object.freeze({
  machine_stand: { label: 'Machine Stand', baseCost: 500, desc: 'This generic machine stand provides just the right foundation upon which many a machine can be built.  As with all good foundations, once assembled it cannot be moved.' },
  blockmaker_engine: { label: 'Machine Engine', baseCost: 2500, desc: "Install this engine, and your machine is one step closer to purring like the quintessential classic, thrumming like the deeply resonant inner chambers of Zille's enormous throat." },
  woodworker_fuser: { label: 'Woodworker Fuser', baseCost: 1750, desc: 'The business end of the hardworking woodworking Woodworker, this is the bit that actually works the wood. Responsible for fusing planks into boards, boards into posts, posts into beams and dreams into reality (as long as you dream of wood).' },
  woodworker_chassis: { label: 'Woodworker Chassis', baseCost: 1250, desc: 'One of the four essential parts of the Woodworker, the chassis is essential in helping every upstanding wannabe woodworker gird their woodworkerly loin-parts and whittle their brown stuff into something wonderful.' },
  metalmaker_mechanism: { label: 'Metal Machine Mechanism', baseCost: 1350, desc: 'The type of smooth, perfectly-honed mechanism you would expect from followers of Alph. Whatever function it is that this performs in the Metalmaker, it does it very, very well.' },
  metalmaker_tooler: { label: 'Metal Machine Tooler', baseCost: 1750, desc: 'Silvery, heavy, and glistening with hot oil, lump of machinery so beautiful, complex and well crafted that it must have been tooled in some kind of academy.' },
  fuelmaker_case: { label: 'Fuelmaker Case', baseCost: 1500, desc: 'Placed on an assembled Machine Stand, this Fuelmaker Case makes a good case for a stand to become a Fuelmaker.' },
  fuelmaker_core: { label: 'Fuelmaker Core', baseCost: 1250, desc: 'Install the Fuelmaker core and the final piece of the puzzle will be in place. Now you just need fuel to fuel the Fuelmaker.' },
  blockmaker_chassis: { label: 'Blockmaker Chassis', baseCost: 1500, desc: "It's commonly known that machines have 'personality'.  Add me to a regular ol' machine stand and forever imbue it with 'blockmaker' personality." },
  blockmaker_plates: { label: 'Blockmaker Plates', baseCost: 1250, desc: 'Made from only the finest Molybdenum this side of Shimla Mirch.  Once installed, the Blockmaker is complete.' },
  still: { label: 'Still', baseCost: 2000, desc: 'A basic Still for converting Grain, Corn, or the humble Potato into versatile, potent (if not smooth) Hooch.', isTool: true },
});

export function isMachine(classTsid) {
  return Boolean(MACHINE_ASSEMBLIES[classTsid]);
}

/**
 * Energy to put the parts on: 20 per component (add_chassis), or nothing with
 * Master Assembler, whose assemble_* verbs autoAssemble without a metabolic
 * cost (machine_stand.js:136-180, 759-768).
 */
export function assemblyEnergy(machine, upgrades = []) {
  const def = MACHINE_ASSEMBLIES[machine];
  if (!def) return 0;
  return hasMasterAssembler(upgrades) ? 0 : COMPONENT_ENERGY * def.parts.length;
}

/** Installing overlay per part (machine_base onApplyPart): 2000 ms, 1000 with Speedy Assembler. */
export function assemblyMs(machine, upgrades = []) {
  const def = MACHINE_ASSEMBLIES[machine];
  return def ? def.parts.length * machinePartInstallMs(upgrades) : 0;
}

/** Can the player assemble this machine from the pack right now? */
export function assemblyCheck(inv, pc, machine, learned = [], upgrades = []) {
  const def = MACHINE_ASSEMBLIES[machine];
  if (!def) return { ok: false, reason: 'unknown', msg: 'That is not a machine.' };
  if (countItem(inv, MACHINE_STAND) < 1) return { ok: false, reason: 'stand', msg: 'You need a Machine Stand.' };
  const missing = def.parts.filter((part) => countItem(inv, part) < 1);
  if (missing.length) {
    return { ok: false, reason: 'parts', missing, msg: `You need ${missing.map((id) => MACHINE_PART_ITEMS[id]?.label || id).join(', ')}.` };
  }
  if (!learned.includes(ASSEMBLY_SKILL)) return { ok: false, reason: 'skill', msg: 'You need to know Engineering to do this.' };
  const energy = assemblyEnergy(machine, upgrades);
  if (energy && (pc?.energy || 0) <= energy) return { ok: false, reason: 'energy', msg: "You don't have enough energy to do that!", energy };
  return { ok: true, energy, def, durationMs: assemblyMs(machine, upgrades) };
}

/**
 * Put the stand and three parts together into a working machine with a
 * quarter-full tank. Atomic: nothing changes unless every check passes.
 */
export function assembleMachine(inv, pc, toolState, machine, learned = [], upgrades = []) {
  const started = startAssembly(inv, pc, machine, learned, upgrades);
  if (!started.ok) return started;
  return finishAssembly(inv, toolState, started.pending);
}

/**
 * Take the stand and parts and pay the energy; the machine appears when the
 * installing overlays finish (finishAssembly). Atomic on failure.
 */
export function startAssembly(inv, pc, machine, learned = [], upgrades = [], now = Date.now()) {
  const check = assemblyCheck(inv, pc, machine, learned, upgrades);
  if (!check.ok) return check;
  removeItem(inv, MACHINE_STAND, 1);
  for (const part of check.def.parts) removeItem(inv, part, 1);
  if (check.energy) pc.energy -= check.energy;
  return {
    ok: true,
    energy: check.energy,
    durationMs: check.durationMs,
    pending: { kind: 'assemble', machine, energy: check.energy, readyAt: now + check.durationMs },
    msg: `Installing the ${check.def.label}'s parts…${check.energy ? ` (-${check.energy} energy)` : ''}`,
  };
}

export function finishAssembly(inv, toolState, pending) {
  const machine = pending?.machine;
  const def = MACHINE_ASSEMBLIES[machine];
  if (!def) return { ok: false, reason: 'unknown', msg: 'That is not a machine.' };
  const energy = Number(pending.energy) || 0;
  const hadOne = countItem(inv, machine) > 0;
  addItem(inv, machine, 1);
  const row = ensureToolCondition(toolState, machine);
  if (row && !hadOne) {
    row.remaining = FRESH_FUEL;
    row.broken = false;
  }
  return {
    ok: true,
    machine,
    energy,
    fuel: row ? row.remaining : FRESH_FUEL,
    msg: `You assembled a ${def.label}!${energy ? ` (-${energy} energy)` : ''} It has ${row ? row.remaining : FRESH_FUEL}/${MAX_FUEL} fuel.`,
  };
}

/** machine_base disassemble / fully_disassemble: 15 energy per removal. */
export const DISASSEMBLY_ENERGY = 15;
/** onFullyDisassemble overlay. */
export const FULL_DISASSEMBLY_MS = 6600;

/**
 * Taking a machine apart. The source removes one part at a time (15 energy
 * and a 2000 ms uninstalling overlay each, 1000 with Speedy Assembler) until
 * only the stand is left; Master Exploder's fully_disassemble does it all for
 * 15 energy in one 6600 ms overlay. Needs Engineering I and an idle machine.
 * The tank's fuel goes with the machine.
 */
export function disassemblyPlan(machine, upgrades = [], { full = false } = {}) {
  const def = MACHINE_ASSEMBLIES[machine];
  if (!def) return null;
  if (full) return { energy: DISASSEMBLY_ENERGY, durationMs: FULL_DISASSEMBLY_MS, full: true };
  return { energy: DISASSEMBLY_ENERGY * def.parts.length, durationMs: def.parts.length * machinePartInstallMs(upgrades), full: false };
}

export function disassemblyCheck(inv, pc, machine, learned = [], upgrades = [], { full = false, busy = false } = {}) {
  const def = MACHINE_ASSEMBLIES[machine];
  if (!def) return { ok: false, reason: 'unknown', msg: 'That is not a machine.' };
  if (full && !hasMasterExploder(upgrades)) return { ok: false, reason: 'card', msg: 'You need the Master Exploder upgrade.' };
  if (countItem(inv, machine) < 1) return { ok: false, reason: 'missing', msg: `You don't have a ${def.label}.` };
  if (!learned.includes(ASSEMBLY_SKILL)) return { ok: false, reason: 'skill', msg: 'You need to know Engineering to do this.' };
  if (busy) return { ok: false, reason: 'busy', msg: 'The machine is still in use.' };
  const plan = disassemblyPlan(machine, upgrades, { full });
  if ((pc?.energy || 0) <= plan.energy) return { ok: false, reason: 'energy', msg: "You don't have enough energy to do that!", energy: plan.energy };
  return { ok: true, def, ...plan };
}

export function startDisassembly(inv, pc, machine, learned = [], upgrades = [], opts = {}, now = Date.now()) {
  const check = disassemblyCheck(inv, pc, machine, learned, upgrades, opts);
  if (!check.ok) return check;
  removeItem(inv, machine, 1);
  pc.energy -= check.energy;
  return {
    ok: true,
    energy: check.energy,
    durationMs: check.durationMs,
    pending: { kind: 'disassemble', machine, energy: check.energy, full: check.full, readyAt: now + check.durationMs },
    msg: `Taking the ${check.def.label} apart… (-${check.energy} energy)`,
  };
}

export function finishDisassembly(inv, toolState, pending) {
  const def = MACHINE_ASSEMBLIES[pending?.machine];
  if (!def) return { ok: false, reason: 'unknown', msg: 'That is not a machine.' };
  addItem(inv, MACHINE_STAND, 1);
  for (const part of def.parts) addItem(inv, part, 1);
  if (toolState?.condition && countItem(inv, pending.machine) < 1) delete toolState.condition[pending.machine];
  return {
    ok: true,
    machine: pending.machine,
    msg: `You took the ${def.label} apart: a Machine Stand, ${def.parts.map((id) => MACHINE_PART_ITEMS[id]?.label || id).join(', ')}.`,
  };
}

/** Finish a saved assembly or disassembly. */
export function finishMachineWork(inv, toolState, pending) {
  if (pending?.kind === 'assemble') return finishAssembly(inv, toolState, pending);
  if (pending?.kind === 'disassemble') return finishDisassembly(inv, toolState, pending);
  return { ok: false, reason: 'unknown', msg: '' };
}

/** machine_base refuel: +50 per Fuel Cell, only while 50 or more units fit. */
export function refuelCheck(inv, toolState, machine) {
  if (!isMachine(machine)) return { ok: false, reason: 'unknown', msg: 'That is not a machine.' };
  const fuel = getToolCondition(toolState, machine);
  if (fuel.remaining > MAX_FUEL - FUEL_PER_CELL) {
    return { ok: false, reason: 'full', msg: `There is not enough space for a fuel cell. Current level: ${fuel.remaining}/${MAX_FUEL}` };
  }
  if (countItem(inv, FUEL_CELL) < 1) return { ok: false, reason: 'cells', msg: "You don't have any fuel cells." };
  const cells = Math.min(countItem(inv, FUEL_CELL), Math.floor((MAX_FUEL - fuel.remaining) / FUEL_PER_CELL));
  return { ok: true, cells, fuel: fuel.remaining };
}

export function refuelMachine(inv, toolState, machine, { all = false } = {}) {
  const check = refuelCheck(inv, toolState, machine);
  if (!check.ok) return check;
  const cells = all ? check.cells : 1;
  removeItem(inv, FUEL_CELL, cells);
  const row = ensureToolCondition(toolState, machine);
  row.remaining = Math.min(MAX_FUEL, row.remaining + cells * FUEL_PER_CELL);
  row.broken = row.remaining <= 0;
  return {
    ok: true,
    cells,
    fuel: row.remaining,
    msg: `You added ${cells} Fuel Cell${cells === 1 ? '' : 's'}. Fuel: ${row.remaining}/${MAX_FUEL}.`,
  };
}

/* ------------------------------------------------------------------ */
/* Still (items/still.js)                                               */
/* ------------------------------------------------------------------ */

export const STILL = Object.freeze({
  classTsid: 'still',
  skill: 'distilling_1',
  hopperSize: 500,
  hoochCost: 14,
  maxHooch: 50,
  /** startWorking: (7/3) minutes per Hooch. */
  workMs: Math.round((7 / 3) * 60 * 1000),
  /** onCreate distillables, worth their base_cost in hopper units. */
  distillables: Object.freeze({ grain: 1, corn: 6, potato: 7, grain_bushel: 250 }),
});

/** The Hoocher cards can push the hopper past hopper_size (still.js adds after the room check). */
const HOPPER_CEILING = Math.ceil(STILL.hopperSize * 1.2);

export function createStillState(seed = {}) {
  const n = (v) => Math.max(0, Math.floor(Number(v) || 0));
  const workingSince = Number(seed?.workingSince);
  return {
    hopper: Math.min(HOPPER_CEILING, n(seed?.hopper)),
    hooch: Math.min(STILL.maxHooch, n(seed?.hooch)),
    workingSince: Number.isFinite(workingSince) && workingSince > 0 ? workingSince : 0,
  };
}

/** finishWorking as often as real time allows: one Hooch per 140 s while the hopper holds 14. */
export function advanceStill(state, now = Date.now()) {
  if (!state.workingSince) return state;
  while (state.workingSince && now - state.workingSince >= STILL.workMs) {
    state.hooch += 1;
    state.hopper -= STILL.hoochCost;
    state.workingSince += STILL.workMs;
    if (state.hopper < STILL.hoochCost || state.hooch >= STILL.maxHooch) state.workingSince = 0;
  }
  return state;
}

export function stillRoom(state) {
  return Math.max(0, STILL.hopperSize - state.hopper);
}

/**
 * still.js distill: put as many of one distillable in as the hopper has room
 * for, then start. Corn / Grain / Potato Hoocher (still.js:286-297, 346-357)
 * add 20% more units than the room check counted.
 */
export function distillInStill(state, inv, classTsid, learned = [], now = Date.now(), upgrades = []) {
  advanceStill(state, now);
  const value = STILL.distillables[classTsid];
  if (!value) return { ok: false, reason: 'not_distillable', msg: 'That will not distill.' };
  if (!learned.includes(STILL.skill)) return { ok: false, reason: 'skill', msg: 'You need to know Distilling to use a Still.' };
  if (state.hooch >= STILL.maxHooch) {
    return { ok: false, reason: 'full', msg: "The Still is totally full. You'll have to remove some Hooch before you can make any more." };
  }
  const fit = Math.floor(stillRoom(state) / value);
  const taken = Math.min(countItem(inv, classTsid), fit);
  if (taken < 1) return { ok: false, reason: 'room', msg: 'There is no room left in the hopper.' };
  removeItem(inv, classTsid, taken);
  const bonus = distillingBonus(classTsid, upgrades);
  // setHopperAmount(intval(hopper) + taken * base_cost * multiplier); reads intval.
  state.hopper = Math.floor(state.hopper + taken * value * bonus.multiplier);
  if (!state.workingSince && state.hopper >= STILL.hoochCost) state.workingSince = now;
  const extra = bonus.name ? Math.round(taken * value * (bonus.multiplier - 1)) : 0;
  return {
    ok: true,
    taken,
    extra,
    hopper: state.hopper,
    msg: `You added ${taken} to the hopper (${state.hopper}/${STILL.hopperSize}).${extra ? ` Your "${bonus.name}" upgrade got you an extra ${extra} units in the hopper!` : ''}`,
  };
}

export function collectHooch(state, inv, learned = [], now = Date.now()) {
  advanceStill(state, now);
  if (!learned.includes(STILL.skill)) return { ok: false, reason: 'skill', msg: 'You need to know Distilling to use a Still.' };
  if (state.hooch < 1) return { ok: false, reason: 'empty', msg: 'There is no Hooch in the Still yet.' };
  const got = state.hooch;
  addItem(inv, 'hooch', got);
  state.hooch = 0;
  if (!state.workingSince && state.hopper >= STILL.hoochCost) state.workingSince = now;
  return { ok: true, got, msg: `You collected ${got} ${got > 1 ? 'Hooches' : 'Hooch'} in ${got > 1 ? '' : 'a '}convenient, rustic jar${got > 1 ? 's' : ''}.` };
}

/** Seconds until the next Hooch, or 0 when idle. */
export function stillEtaSeconds(state, now = Date.now()) {
  advanceStill(state, now);
  if (!state.workingSince) return 0;
  return Math.max(0, Math.ceil((state.workingSince + STILL.workMs - now) / 1000));
}
