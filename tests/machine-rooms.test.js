/**
 * Machines in the three Community Machine Rooms (register row G169):
 * js/machine-rooms.js, features/machine-rooms-feature.js, the Make panel's
 * station option (making.js canCraft stationTool) and the street furniture
 * furnitureRow hook that hangs each room's Notice Board.
 */
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ALTAR_BONUS_TABLES,
  ALTAR_PREFACE,
  MACHINE_ROOM_BOARD,
  MACHINE_ROOM_LAYOUTS,
  MACHINE_ROOM_TSIDS,
  altarBonusLine,
  altarBonusTable,
  isMachineRoomTsid,
  machineRoomFurnitureRow,
  machineRoomLayout,
  machineTank,
  renderX,
  roomMachineVerbs,
  tankFuel,
} from '../public/js/machine-rooms.js';
import { FOREST_MACHINE_ROOM_HELD, FOREST_MACHINE_ROOM_TSID } from '../public/js/forest-machine-room.js';
import { FRESH_FUEL, MAX_FUEL, refuelMachine } from '../public/js/machines.js';
import { DROP_TABLES, applyDropResult, rollDropTable } from '../public/js/drop-tables.js';
import { canUseTool } from '../public/js/tools.js?v=tools-5';
import { MAKING_TOOL_SKILLS, RECIPE_CATALOG, canCraft, craftRecipe, ensureMakingItems, loadRecipeCatalogFromFile } from '../public/js/making.js?v=g179-1';
import { fixedFurniturePoints, furniturePlacementGroups } from '../public/js/street-furniture.js?v=furniture-g169';
import { worldToScreen } from '../public/js/street-model.js';
import { nearestSurfaceY } from '../public/js/walk-surface.js';
import { platformsScreen } from '../public/js/street-model.js';
import { machineRoomsFeature } from '../public/js/features/machine-rooms-feature.js?v=g169-1';

const spike = join(dirname(fileURLToPath(import.meta.url)), '..');
const gsjs = join(spike, '../glitch-GameServerJS');
const locations = join(spike, '../streets/mnt/stos/location_data');
const street = (tsid) => JSON.parse(readFileSync(join(spike, 'public/assets/streets', `${tsid}.json`), 'utf8'));
const src = (file) => readFileSync(join(gsjs, file), 'utf8');

const OBJREF_CLASS = { Woodworker: 'woodworker', Blockmaker: 'blockmaker', Fuelmaker: 'fuelmaker', 'Metal Machine': 'metalmaker' };
function objrefMachines(xmlTsid) {
  const xml = readFileSync(join(locations, `${xmlTsid}.xml`), 'utf8');
  const items = xml.slice(xml.indexOf('<objrefs id="items">'), xml.indexOf('</objrefs>', xml.indexOf('<objrefs id="items">')));
  return [...items.matchAll(/<objref tsid="([A-Z0-9]+)" label="([^"]+)"\/>/g)]
    .filter((m) => OBJREF_CLASS[m[2]])
    .map((m) => ({ id: m[1], classTsid: OBJREF_CLASS[m[2]] }));
}
const sortRows = (rows) => [...rows].sort((a, b) => a.id.localeCompare(b.id));

describe('machine rooms: which rooms and which machines', () => {
  it('are the three config_prod.js machine_rooms', () => {
    const cfg = src('config_prod.js');
    const list = /var machine_rooms = \[([^\]]+)\]/.exec(cfg)[1].match(/L[A-Z0-9]+/g).map((t) => `G${t.slice(1)}`);
    assert.deepEqual([...MACHINE_ROOM_TSIDS].sort(), list.sort());
    for (const tsid of list) {
      assert.ok(isMachineRoomTsid(tsid) && isMachineRoomTsid(`L${tsid.slice(1)}`));
      assert.ok(machineRoomLayout(tsid), tsid);
    }
    assert.equal(isMachineRoomTsid('GCR10K3BPJK1U6F'), false);
  });

  it('Meadow and Besara hold exactly their 2013 objref machines, under the objref ids', () => {
    for (const [tsid, xml] of [['GCR101Q98A12EHH', 'LCR101Q98A12EHH'], ['GA9MU59GB792T80', 'LA9MU59GB792T80']]) {
      const want = sortRows(objrefMachines(xml));
      const got = sortRows(MACHINE_ROOM_LAYOUTS[tsid].machines.map(({ id, classTsid }) => ({ id, classTsid })));
      assert.deepEqual(got, want, tsid);
    }
    assert.equal(MACHINE_ROOM_LAYOUTS.GCR101Q98A12EHH.machines.length, 5);
    assert.equal(MACHINE_ROOM_LAYOUTS.GA9MU59GB792T80.machines.length, 4);
  });

  it('the Forest room holds FOREST_MACHINE_ROOM_HELD at its recorded x', () => {
    const got = MACHINE_ROOM_LAYOUTS[FOREST_MACHINE_ROOM_TSID].machines.map(({ classTsid, x }) => ({ classTsid, x }));
    assert.deepEqual(got, FOREST_MACHINE_ROOM_HELD.machines.map(({ classTsid, x }) => ({ classTsid, x })));
  });

  it('render positions map 720 px onto the 1400-wide room (the sign deco checks the scale)', () => {
    assert.equal(renderX(0), -700);
    assert.equal(renderX(720), 700);
    // Meadow's sign deco is at x -24 (render centre ~348 px), Besara's at -115 (~301 px).
    assert.ok(Math.abs(renderX(348) - -24) <= 3);
    assert.ok(Math.abs(renderX(301) - -115) <= 3);
  });

  it('every machine stands on the room floor, apart from the others', () => {
    for (const tsid of MACHINE_ROOM_TSIDS) {
      const room = street(tsid);
      const plats = platformsScreen(room);
      const xs = MACHINE_ROOM_LAYOUTS[tsid].machines.map((m) => m.x).sort((a, b) => a - b);
      for (const x of xs) {
        const p = worldToScreen(room, x, -130);
        const y = nearestSurfaceY(plats, p.x, p.y);
        assert.ok(y != null && Math.abs(y - p.y) < 40, `${tsid} x ${x}: floor at ${y}`);
      }
      for (let i = 1; i < xs.length; i += 1) assert.ok(xs[i] - xs[i - 1] >= 100, `${tsid}: ${xs[i - 1]} and ${xs[i]} overlap`);
      for (const m of MACHINE_ROOM_LAYOUTS[tsid].machines) assert.ok(m.why, `${tsid} ${m.id} says where its x came from`);
    }
  });
});

describe('the Altar bonus, as the source writes it', () => {
  it('the preface and each machine\'s recipe -> table pairs match onMakingComplete', () => {
    for (const cls of ['fuelmaker', 'blockmaker', 'metalmaker', 'woodworker']) {
      const text = src(`items/${cls}.js`);
      const start = text.indexOf(`function onMakingComplete(pc, recipe_id, count){ // defined by ${cls}`);
      assert.ok(start > 0, cls);
      const body = text.slice(start, text.indexOf('\nfunction ', start + 10));
      assert.ok(body.includes('if (!this.isInCraftingAltar()) return false;'), cls);
      assert.ok(body.includes(`var preface = "${ALTAR_PREFACE}";`), cls);
      const pairs = Object.fromEntries([...body.matchAll(/recipe_id == (\d+)\)\{\s*pc\.runDropTable\('([a-z_]+)'/g)].map((m) => [m[1], m[2]]));
      assert.deepEqual(pairs, { ...ALTAR_BONUS_TABLES[cls] }, cls);
      assert.ok(/function isInCraftingAltar\(\)\{ \/\/ defined by machine_base\s+return in_array_real\(this\.container\.tsid, config\.machine_rooms\);/.test(text), cls);
    }
  });

  it('only Fuel Cell (192) and Urth Block (190) pay; the Woodworker and Metal Machine never do', () => {
    assert.equal(altarBonusTable('fuelmaker', 192), 'crafting_altar_bonus_rewards_fuel');
    assert.equal(altarBonusTable('blockmaker', '190'), 'crafting_altar_bonus_rewards_grade_aa_block');
    assert.equal(altarBonusTable('fuelmaker', 192, { inRoom: false }), null);
    for (const id of ['253', '277', '278']) assert.equal(altarBonusTable('woodworker', id), null);
    for (const id of ['279', '280', '281']) assert.equal(altarBonusTable('metalmaker', id), null);
    for (const table of new Set(Object.values(ALTAR_BONUS_TABLES).flatMap((t) => Object.values(t)))) assert.ok(DROP_TABLES[table], table);
    assert.match(DROP_TABLES.crafting_altar_bonus_rewards_fuel.name, /Machine Room 5% Bonus for Fuel Cell/);
  });

  it('one roll pays one row, each line with the preface (runDropTable)', () => {
    const roll = (n) => () => (n + 0.5) / 101;
    const pc = { mood: 50, energy: 50, xp: 0, level: 5 };
    const inv = {};
    const first = applyDropResult(rollDropTable('crafting_altar_bonus_rewards_fuel', roll(0)), { inv, pc, moodCap: 100, energyCap: 100 });
    assert.deepEqual(first.lines.map(altarBonusLine), ['Altar bonus! You used a Machine in a Machine Room: You got 7 mood!']);
    assert.equal(pc.mood, 57);
    const gas = applyDropResult(rollDropTable('crafting_altar_bonus_rewards_fuel', roll(100)), { inv, pc });
    assert.deepEqual(gas.lines, ['You got 1 White Gas!']);
    assert.equal(inv.white_gas, 1);
    const block = rollDropTable('crafting_altar_bonus_rewards_grade_aa_block', roll(81));
    assert.deepEqual(block.items, [{ classTsid: 'loam', qty: 1, table: 'crafting_altar_bonus_rewards_grade_aa_block' }]);
  });
});

describe('room machines: fixed, fuelled, usable', () => {
  before(async () => {
    await loadRecipeCatalogFromFile(join(spike, 'public/assets/content/recipes.json'));
    ensureMakingItems();
  });

  it('offer use and refuel only (no pick up, no disassemble)', () => {
    const tank = machineTank(null, 'fuelmaker');
    const verbs = roomMachineVerbs('fuelmaker', tank, { learned: ['fuelmaking_1'], fuelCells: 0 });
    assert.deepEqual(verbs.map((v) => v.id), ['use', 'refuel']);
    assert.equal(verbs[0].enabled, true);
    assert.equal(verbs[0].tooltip, `Get Excited and Make Things. Fuel: ${FRESH_FUEL}/${MAX_FUEL}`);
    assert.equal(verbs[1].reason, "You don't have any fuel cells.");
    const all = roomMachineVerbs('fuelmaker', tank, { learned: [], fuelCells: 5, skillName: () => 'Fuelmaking' });
    assert.equal(all[0].reason, 'You need to know Fuelmaking to use this.');
    assert.deepEqual(all.map((v) => v.id), ['use', 'refuel', 'refuel_all']);
    assert.ok(!all.some((v) => /pick|disassemble/i.test(v.id + v.label)));
  });

  it('machine skills match making.js', () => {
    for (const cls of ['fuelmaker', 'blockmaker', 'woodworker', 'metalmaker']) {
      const verbs = roomMachineVerbs(cls, machineTank(null, cls), { learned: [MAKING_TOOL_SKILLS[cls].requiredSkill] });
      assert.equal(verbs[0].enabled, true, cls);
    }
  });

  it('a tank starts at max_fuel / 4, refuels with Fuel Cells, and runs dry', () => {
    const tank = machineTank(undefined, 'blockmaker');
    assert.equal(tankFuel(tank, 'blockmaker'), 50);
    assert.equal(tankFuel(machineTank({ condition: { blockmaker: { remaining: 999 } } }, 'blockmaker'), 'blockmaker'), MAX_FUEL);
    const inv = { fuel_cell: 4 };
    const res = refuelMachine(inv, tank, 'blockmaker', { all: true });
    assert.equal(res.ok, true);
    assert.equal(res.cells, 3);
    assert.equal(tankFuel(tank, 'blockmaker'), 200);
    assert.equal(inv.fuel_cell, 1);
    const full = roomMachineVerbs('blockmaker', tank, { learned: ['blockmaking_1'], fuelCells: 1 });
    assert.equal(full[1].reason, 'There is not enough space for a fuel cell. Current level: 200/200');
    const dry = machineTank({ condition: { blockmaker: { remaining: 0 } } }, 'blockmaker');
    assert.equal(roomMachineVerbs('blockmaker', dry, { learned: ['blockmaking_1'] })[0].reason, 'This Blockmaker does not have enough fuel remaining.');
    assert.equal(canUseTool(dry, 'blockmaker', 1).ok, false);
  });

  it('the Make panel runs on the room machine: no machine in the pack, fuel from its own tank', () => {
    const recipe = RECIPE_CATALOG.fuel_cell;
    assert.equal(recipe.id, '192');
    const inv = { jellisac_clump: 12, peat: 8, white_gas: 2 };
    const packTools = { condition: {} };
    const tank = machineTank(null, 'fuelmaker');
    const base = { learned: ['fuelmaking_1'], requireSkill: true, requireTool: true };
    assert.equal(canCraft(inv, recipe, { ...base, toolState: packTools }).reason, 'tool');
    assert.equal(canCraft(inv, recipe, { ...base, toolState: tank, stationTool: 'woodworker' }).reason, 'tool', 'a station only stands in for its own machine');
    const opts = { ...base, toolState: tank, stationTool: 'fuelmaker' };
    assert.equal(canCraft(inv, recipe, opts).ok, true);
    const pc = { energy: 100, mood: 100, xp: 0, imagination: 0, level: 5 };
    const out = craftRecipe(inv, pc, 'fuel_cell', opts);
    assert.equal(out.ok, true);
    assert.equal(inv.fuel_cell, 1);
    assert.equal(tankFuel(tank, 'fuelmaker'), FRESH_FUEL - Number(recipe.toolWear));
    assert.deepEqual(packTools.condition, {});
    const dry = machineTank({ condition: { fuelmaker: { remaining: 0 } } }, 'fuelmaker');
    assert.equal(canCraft({ jellisac_clump: 12, peat: 8, white_gas: 2 }, recipe, { ...base, toolState: dry, stationTool: 'fuelmaker' }).reason, 'broken_tool');
  });
});

describe('the furnitureRow hook: a Notice Board on every room\'s wall', () => {
  it('the rebuilt Forest room gets a board row of its own; archived rows keep their note', () => {
    const toScreen = (x, y) => ({ x: x + 700, y: y + 700 });
    const forest = machineRoomFurnitureRow(FOREST_MACHINE_ROOM_TSID, null, toScreen);
    assert.deepEqual(forest, { bag_notice_board: 1, at: { bag_notice_board: [{ x: MACHINE_ROOM_BOARD.x + 700, y: MACHINE_ROOM_BOARD.y + 700, wall: true }] } });
    const meadow = machineRoomFurnitureRow('GCR101Q98A12EHH', { note: 1, bag_notice_board: 1 }, toScreen);
    assert.equal(meadow.note, 1);
    assert.deepEqual(furniturePlacementGroups(meadow).map((g) => g.key), ['furnitureNote'], 'the board is fixed, the note still planned');
    assert.equal(fixedFurniturePoints(meadow, 'bag_notice_board').length, 1);
    assert.equal(fixedFurniturePoints(meadow, 'note'), null);
    assert.equal(machineRoomFurnitureRow('GCR10K3BPJK1U6F', { npc_mailbox: 1 }, toScreen), null);
  });

  it('the feature answers furnitureRow with the board above each room floor, clear of the sign', () => {
    for (const tsid of MACHINE_ROOM_TSIDS) {
      const room = street(tsid);
      const row = machineRoomsFeature.furnitureRow(room, null);
      const [p] = row.at.bag_notice_board;
      const floor = nearestSurfaceY(platformsScreen(room), p.x, p.y + 100);
      assert.ok(floor - p.y > 80 && floor - p.y < 130, `${tsid}: board bottom ${floor - p.y} px above the floor`);
      const sign = room.layers.flatMap((l) => l.decos || []).find((d) => d.w === 417);
      assert.ok(p.x - 106 > sign.x + 700 + sign.w / 2, `${tsid}: board clear of the sign`);
    }
    assert.equal(machineRoomsFeature.furnitureRow(street('GCR10K3BPJK1U6F'), null), null);
  });
});

describe('the feature in a room', () => {
  class Obj {
    constructor() {
      this.anchor = { set() {} };
      this.children = [];
    }
    addChild(c) { this.children.push(c); return c; }
  }
  const PIXI = { Sprite: Obj, Container: Obj, ImageSource: class { on() {} emit() {} }, Texture: class { constructor(o) { Object.assign(this, o); } } };

  function roomEngine(tsid, extra = {}) {
    const room = street(tsid);
    const slots = {};
    const data = {};
    const log = [];
    const engine = {
      PIXI,
      street: room,
      streetTsid: tsid,
      entityLayer: new Obj(),
      platforms: platformsScreen(room),
      player: { x: 600, y: 570 },
      pc: { energy: 100, mood: 50, xp: 0, level: 5, energyMax: 100 },
      inv: {},
      learnedSkills: ['fuelmaking_1', 'blockmaking_1'],
      streetSlot: (id, t) => ((slots[`${id}:${t}`] ||= {})),
      register: (t) => t,
      setData: (k, v) => { data[k] = v; },
      param: () => null,
      pushActivity: (line) => log.push(line),
      toast() {},
      floatText() {},
      updateHud() {},
      save() {},
      achievement: (c, n) => log.push(`counter ${c} ${n}`),
      openMakeStation: (station) => { engine.station = station; },
      data,
      log,
      slots,
      ...extra,
    };
    return engine;
  }

  it('spawns every machine, uses one through the Make panel and pays the bonus once per job', () => {
    const prev = globalThis.PIXI;
    globalThis.PIXI = PIXI;
    try {
      const engine = roomEngine('GCR101Q98A12EHH', { param: (n) => (n === 'machineroomroll' ? '0' : null) });
      machineRoomsFeature.onStreetClear(engine);
      machineRoomsFeature.onStreetEnter(engine.street, engine);
      assert.equal(engine.data.machineRoom, 'GCR101Q98A12EHH');
      assert.equal(engine.data.machineRoomMachines, '5');
      const state = machineRoomsFeature._state();
      assert.deepEqual(state.machines.map((m) => m.classTsid), ['blockmaker', 'blockmaker', 'fuelmaker', 'woodworker', 'metalmaker']);
      assert.equal(engine.entityLayer.children.length, 5);
      const registered = [];
      const engine2 = roomEngine('GCR101Q98A12EHH', { register: (t) => (registered.push(t), t), param: (n) => (n === 'machineroomroll' ? '0' : null) });
      machineRoomsFeature.onStreetClear(engine2);
      machineRoomsFeature.onStreetEnter(engine2.street, engine2);
      const fm = registered.find((t) => t.classId === 'fuelmaker');
      assert.ok(fm);
      assert.deepEqual(machineRoomsFeature.verbsFor(fm, engine2).map((v) => v.id), ['use', 'refuel']);
      assert.equal(machineRoomsFeature.runVerb(fm, 'use', engine2), true);
      assert.equal(engine2.station.tool, 'fuelmaker');
      assert.equal(tankFuel(engine2.station.toolState, 'fuelmaker'), FRESH_FUEL);
      engine2.station.onComplete({ recipe: { id: '192' }, made: 3 });
      assert.deepEqual(engine2.log, ['Altar bonus! You used a Machine in a Machine Room: You got 7 mood!']);
      assert.equal(engine2.pc.mood, 57);
      assert.equal(engine2.data.machineRoomBonus, '1');
      // A Woodworker job finishes with no bonus (recipe 192 only, woodworker.js:862).
      const ww = registered.find((t) => t.classId === 'woodworker');
      machineRoomsFeature.runVerb(ww, 'use', engine2);
      engine2.station.onComplete({ recipe: { id: '253' }, made: 1 });
      assert.equal(engine2.log.length, 1);
      // Refuel: the Bowser counter as well as refueled.
      engine2.inv.fuel_cell = 1;
      machineRoomsFeature.runVerb(fm, 'refuel', engine2);
      assert.ok(engine2.log.includes('counter machines:refueled_for_others 1'));
      const slot = engine2.slots['machine-rooms:GCR101Q98A12EHH'];
      assert.equal(tankFuel(slot.tanks.IDOOVGC4SRJ2PBN, 'fuelmaker'), FRESH_FUEL + 50, 'the tank is saved in the street slot');
      machineRoomsFeature.onStreetClear(engine2);
      const outside = roomEngine('GCR10K3BPJK1U6F');
      machineRoomsFeature.onStreetEnter(outside.street, outside);
      assert.equal(outside.data.machineRoom, '');
      assert.equal(outside.data.machineRoomMachines, '0');
    } finally {
      globalThis.PIXI = prev;
    }
  });
});
