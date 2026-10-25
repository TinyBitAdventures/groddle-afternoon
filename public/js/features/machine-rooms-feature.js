/**
 * Community machine rooms (register rows G156, G169), as a feature module
 * (see js/feature-host.js).
 *
 * - Indoors: the Meadow and Besara rooms are archived, so street-ecology.json
 *   keeps them indoors (interior: no fallback piggies, trees, vendor or
 *   shrine, no quoins). The Forest Community Machine Room
 *   (js/forest-machine-room.js, tools/build-forest-machine-room.mjs) has no
 *   location XML, so build-street-ecology.mjs cannot write its row: this
 *   feature answers it through ecologyOverride, the same row the archived
 *   rooms carry.
 * - Machines (G169, js/machine-rooms.js): each room's Fuelmakers,
 *   Blockmakers, Woodworkers and Metal Machines stand on the floor. Anyone
 *   can use or refuel them; nobody can pick them up or take them apart
 *   (machine_base isInCraftingAltar). "Use" opens the Make panel on that
 *   machine (engine.openMakeStation): its recipes, its own tank (saved per
 *   room in the street slot, 50/200 to start), no machine needed in the
 *   pack. Each finished job rolls the source's "Altar bonus!" drop table once
 *   (onMakingComplete), with the preface on every activity line.
 * - Notice Board: furnitureRow hangs one on the right wall of every room,
 *   the Forest's included (it has no archived furniture row).
 *
 * QA (doordemo enters through the door that leads in):
 *   Meadow  ?autostart=1&questoffer=off&doordemo=GCR10K3BPJK1U6F&doorindex=0&doorautoplay=1
 *   Besara  ?autostart=1&questoffer=off&doordemo=GA9G6MA4P6923PH&doorindex=0&doorautoplay=1
 *   Forest  ?autostart=1&questoffer=off&doordemo=GLI23FELDHD1O3C&doorindex=0&doorautoplay=1
 *   &machineroomdemo=fuelmaker|blockmaker|woodworker|metalmaker grants the
 *   machine's skill and one job's ingredients and stands you beside the
 *   first one; &machineroomautoplay=1 uses it and makes one;
 *   &machineroomroll=0..100 fixes the bonus roll (randInt(0, 100)).
 * Canvas data: machineRoom (the room's tsid, or ''), machineRoomMachines,
 *   machineRoomFuel (id=fuel,...), machineRoomBonus (bonus rolls paid),
 *   machineRoomLast (the last bonus line or verb result).
 */

import { forestMachineRoomEcology, isForestMachineRoomTsid } from '../forest-machine-room.js';
import {
  MACHINE_LABELS,
  MACHINE_SKILLS,
  altarBonusLine,
  altarBonusTable,
  machineRoomFurnitureRow,
  machineRoomLayout,
  machineTank,
  roomMachineVerbs,
  tankFuel,
} from '../machine-rooms.js';
import { refuelMachine, MAX_FUEL } from '../machines.js';
import { DROP_ITEMS, applyDropResult, isEmptyDrop, rollDropTable } from '../drop-tables.js';
import { ITEM_CATALOG, addItem, countItem, ensureItem } from '../inventory.js?v=catalog-unified-4';
import { energyMax, moodMax } from '../metabolics.js';
import { getSkillCatalog } from '../content-catalogs.js';
import { worldToScreen } from '../street-model.js';
import { nearestSurfaceY } from '../walk-surface.js';
import { textureFromUrl } from '../textures.js';

export const MACHINE_ROOMS_FEATURE_ID = 'machine-rooms';

/** One job's ingredients per machine, for the QA demo (catalog_recipes.js). */
const DEMO_JOBS = Object.freeze({
  fuelmaker: { recipe: 'Fuel Cell', items: { jellisac_clump: 12, peat: 8, white_gas: 2 } },
  blockmaker: { recipe: 'Urth Block', items: { earth: 5, loam: 2, heavy_gas: 1 } },
  woodworker: { recipe: 'Board', items: { plank: 4 } },
  metalmaker: { recipe: 'Metal Rod', items: { tin: 1, plain_metal: 1 } },
});

let machines = [];
let roomTsid = '';
let bonusPaid = 0;
let last = '';
let demoDone = false;
let timers = [];

const later = (fn, ms) => timers.push(setTimeout(fn, ms));

function skillName(id) {
  return getSkillCatalog()?.[id]?.name || String(id || '').replace(/_\d+$/, '').replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}

function publish(engine) {
  engine.setData?.('machineRoomMachines', String(machines.length));
  engine.setData?.('machineRoomFuel', machines.map((m) => `${m.def.id}=${tankFuel(m.tank, m.def.classTsid)}`).join(','));
  engine.setData?.('machineRoomBonus', String(bonusPaid));
  engine.setData?.('machineRoomLast', last);
}

function subtitle(m) {
  return `Community machine · Fuel ${tankFuel(m.tank, m.def.classTsid)}/${MAX_FUEL}`;
}

function spawnMachines(engine, street, layout) {
  const slot = engine.streetSlot?.(MACHINE_ROOMS_FEATURE_ID, street.tsid) || {};
  slot.tanks ||= {};
  const { PIXI } = engine;
  for (const def of layout.machines) {
    slot.tanks[def.id] = machineTank(slot.tanks[def.id], def.classTsid);
    const p = worldToScreen(street, def.x, -130);
    const y = nearestSurfaceY(engine.platforms, p.x, p.y) ?? p.y;
    const sprite = new PIXI.Sprite(textureFromUrl(`assets/sprites/icons/${def.classTsid}.png`));
    sprite.anchor.set(0.5, 1);
    sprite.x = p.x;
    sprite.y = y + 4;
    sprite.zIndex = 8;
    engine.entityLayer.addChild(sprite);
    const m = { def, sprite, tank: slot.tanks[def.id], target: null };
    m.target = engine.register({
      classId: def.classTsid,
      featureId: MACHINE_ROOMS_FEATURE_ID,
      label: MACHINE_LABELS[def.classTsid] || def.classTsid,
      subtitle: subtitle(m),
      sprite,
      roomMachine: def.id,
    });
    machines.push(m);
  }
}

function machineFor(target) {
  return machines.find((m) => m.target === target) || null;
}

function say(engine, msg, ok = true) {
  last = msg;
  engine.toast?.(msg);
  if (ok) engine.pushActivity?.(msg);
  publish(engine);
}

/** onMakingComplete for a room machine: one roll of the recipe's table, once per finished job. */
function finishJob(engine, m, { recipe, made }) {
  m.target.subtitle = subtitle(m);
  const table = made > 0 ? altarBonusTable(m.def.classTsid, recipe?.id) : null;
  if (!table) {
    publish(engine);
    engine.save?.();
    return;
  }
  const forced = engine.param?.('machineroomroll');
  const rng = forced != null && forced !== '' ? () => (Math.max(0, Math.min(100, Number(forced) || 0)) + 0.5) / 101 : Math.random;
  const result = rollDropTable(table, rng);
  if (isEmptyDrop(result)) {
    publish(engine);
    return;
  }
  for (const it of result.items) {
    const meta = DROP_ITEMS[it.classTsid];
    if (meta && (!ITEM_CATALOG[it.classTsid] || /^Item /.test(ITEM_CATALOG[it.classTsid].desc || ''))) {
      ensureItem(it.classTsid, { label: meta.label, namePlural: meta.plural, desc: meta.desc || undefined, baseCost: meta.baseCost });
    }
  }
  const pc = engine.pc;
  const paid = applyDropResult(result, { inv: engine.inv, pc, addItem, energyCap: energyMax(pc), moodCap: moodMax(pc) });
  bonusPaid += 1;
  const p = engine.player;
  let lift = 0;
  for (const line of paid.lines) {
    const text = altarBonusLine(line);
    engine.pushActivity?.(text);
    last = text;
    if (p) engine.floatText?.(p.x, (p.y || 0) - 130 - lift, line.replace(/^You got /, '+').replace(/!$/, ''), 0xffe39a);
    lift += 18;
  }
  if (paid.lines[0]) engine.toast?.(altarBonusLine(paid.lines[0]), 4200);
  engine.updateHud?.();
  publish(engine);
  engine.save?.();
}

function useMachine(engine, m) {
  engine.openMakeStation?.({
    tool: m.def.classTsid,
    toolState: m.tank,
    roomMachine: m.def.id,
    onComplete: (job) => finishJob(engine, m, job),
  });
  last = `use:${m.def.id}`;
  publish(engine);
}

function refuel(engine, m, all) {
  const res = refuelMachine(engine.inv, m.tank, m.def.classTsid, { all });
  if (res.ok) {
    // machine_base refuel handler: refueled, and refueled_for_others away from home (Bowser).
    engine.achievement?.('machines:refueled', 1);
    engine.achievement?.('machines:refueled_for_others', 1);
    m.target.subtitle = subtitle(m);
    engine.updateHud?.();
    engine.save?.();
  }
  say(engine, res.msg, res.ok);
}

function setupDemo(engine) {
  const cls = engine.param?.('machineroomdemo');
  if (!cls || demoDone || !DEMO_JOBS[cls]) return;
  const m = machines.find((row) => row.def.classTsid === cls);
  if (!m) return;
  demoDone = true;
  const job = DEMO_JOBS[cls];
  if (!(engine.learnedSkills || []).includes(MACHINE_SKILLS[cls])) engine.grantSkill?.(MACHINE_SKILLS[cls]);
  for (const [id, n] of Object.entries(job.items)) {
    const short = n - countItem(engine.inv, id);
    if (short > 0) addItem(engine.inv, id, short);
  }
  if (engine.pc && engine.pc.energy < 50) engine.pc.energy = 50;
  engine.updateHud?.();
  later(() => {
    if (engine.player) {
      engine.player.x = m.sprite.x + 90;
      engine.player.vx = 0;
      engine.snapCamera?.();
    }
    if (engine.param?.('machineroomautoplay') !== '1') return;
    useMachine(engine, m);
    later(() => {
      const tile = [...document.querySelectorAll('#make-list .make-tile')].find((t) => t.querySelector('.tile-label')?.textContent === job.recipe);
      tile?.click();
      later(() => document.querySelector('#make-detail [data-make-go]')?.click(), 400);
    }, 600);
  }, 1200);
}

export const machineRoomsFeature = {
  id: MACHINE_ROOMS_FEATURE_ID,

  ecologyOverride(street) {
    return isForestMachineRoomTsid(street?.tsid) ? forestMachineRoomEcology() : null;
  },

  /** The Notice Board on the wall (and the Forest room's furniture row). */
  furnitureRow(street, base) {
    if (!street?.bounds) return null;
    return machineRoomFurnitureRow(street.tsid, base, (x, y) => worldToScreen(street, x, y));
  },

  onStreetEnter(street, engine) {
    const layout = machineRoomLayout(street?.tsid);
    roomTsid = layout ? street.tsid : '';
    engine.setData?.('machineRoom', roomTsid);
    if (layout && street?.bounds && engine.entityLayer) {
      spawnMachines(engine, street, layout);
      setupDemo(engine);
    }
    publish(engine);
  },

  onStreetClear() {
    for (const id of timers) clearTimeout(id);
    timers = [];
    machines = [];
    roomTsid = '';
  },

  verbsFor(target, engine) {
    const m = machineFor(target);
    if (!m) return null;
    return roomMachineVerbs(m.def.classTsid, m.tank, {
      learned: engine.learnedSkills || [],
      fuelCells: countItem(engine.inv, 'fuel_cell'),
      skillName,
    });
  },

  runVerb(target, verbId, engine) {
    const m = machineFor(target);
    if (!m) return false;
    if (verbId === 'use') useMachine(engine, m);
    else if (verbId === 'refuel') refuel(engine, m, false);
    else if (verbId === 'refuel_all') refuel(engine, m, true);
    return true;
  },

  /** QA / tests. */
  _state() {
    return { roomTsid, bonusPaid, last, machines: machines.map((m) => ({ id: m.def.id, classTsid: m.def.classTsid, x: m.sprite.x, fuel: tankFuel(m.tank, m.def.classTsid) })) };
  },
};
