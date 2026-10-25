/**
 * Machines in the three Community Machine Rooms (register row G169):
 * js/machine-rooms.js, features/machine-rooms-feature.js, the Make panel's
 * station option (making.js canCraft stationTool) and the street furniture
 * furnitureRow hook that hangs each room's Notice Board; and G175: the wait,
 * collect and lock of a machine job, Metal Music on a room Metal Machine.
 */
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ALTAR_BONUS_TABLES,
  ALTAR_PREFACE,
  CALL_PLAYER_LINES,
  COLLECT_TOOLTIPS,
  DAYS_TO_STORE_CONTENTS,
  GAME_DAY_MS,
  MACHINE_EXTRA_WAIT_MS,
  collectLine,
  contentsExpired,
  jobSecondsLeft,
  machineJobMs,
  machineMadeLine,
  metalMusicVerbs,
  runningSoundKey,
  secondsToString,
  takeJobIngredients,
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
import { countItem, removeItem } from '../public/js/inventory.js?v=catalog-unified-5';
import { canUseTool } from '../public/js/tools.js?v=tools-5';
import { MACHINE_EXTRA_WAIT_MS as MAKING_EXTRA_WAIT_MS, MAKING_TOOL_SKILLS, RECIPE_CATALOG, canCraft, craftRecipe, ensureMakingItems, loadRecipeCatalogFromFile } from '../public/js/making.js?v=g259-1';
import { fixedFurniturePoints, furniturePlacementGroups } from '../public/js/street-furniture.js?v=furniture-g175';
import { worldToScreen } from '../public/js/street-model.js';
import { nearestSurfaceY } from '../public/js/walk-surface.js';
import { platformsScreen } from '../public/js/street-model.js';
import { machineRoomsFeature } from '../public/js/features/machine-rooms-feature.js?v=g259-1';

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

describe('wait, collect and lock: the source rules (G175)', () => {
  before(async () => {
    await loadRecipeCatalogFromFile(join(spike, 'public/assets/content/recipes.json'));
    ensureMakingItems();
  });

  it('a job runs count * wait_ms + 2200 ms (computeEnergyAndTimeCost)', () => {
    const making = src('players/inc_making.js');
    assert.match(making, /var wait_time = count \* intval\(recipe\.wait_ms\);/);
    assert.match(making, /wait_time \+= 2200; \/\/ Extra time for the animations/);
    assert.equal(MACHINE_EXTRA_WAIT_MS, 2200);
    assert.equal(MAKING_EXTRA_WAIT_MS, MACHINE_EXTRA_WAIT_MS);
    assert.equal(machineJobMs(RECIPE_CATALOG.fuel_cell.waitMs, 3), 3 * 20000 + 2200);
    assert.equal(machineJobMs(RECIPE_CATALOG.board.waitMs, 1), 2500 + 2200);
    assert.equal(machineJobMs(10000, 2, 0.5), 10000 + 2200);
  });

  it('secondsToString and machineTimeRemaining match common.js and inc_making.js', () => {
    assert.match(src('common.js'), /return \(""\+wholeMins\+" "\+minWord\+" and "\+wholeSeconds\+" "\+secWord\);/);
    assert.equal(secondsToString(1), '1 second');
    assert.equal(secondsToString(42), '42 seconds');
    assert.equal(secondsToString(60), '1 minute');
    assert.equal(secondsToString(61), '1 minute and 1 second');
    assert.equal(secondsToString(185), '3 minutes and 5 seconds');
    assert.equal(jobSecondsLeft({ readyAt: 10_600 }, 0), 11, 'Math.round, as machineTimeRemaining');
    assert.equal(jobSecondsLeft({ readyAt: 0 }, 5000), 0);
  });

  it('output waits 6 game days at most (expireOldContents, game_days_since_ts rounds)', () => {
    assert.match(src('items/fuelmaker.js'), /"days_to_store_contents"\s*:\s*"6"/);
    assert.match(src('common.js'), /there are 14400 real seconds in a game day/);
    assert.equal(DAYS_TO_STORE_CONTENTS, 6);
    assert.equal(GAME_DAY_MS, 14_400_000);
    assert.equal(contentsExpired(0, 6.49 * GAME_DAY_MS), false);
    assert.equal(contentsExpired(0, 6.5 * GAME_DAY_MS), true);
    assert.equal(contentsExpired(1000, 0), false, 'a time in the future is 0 days');
  });

  it('use is locked while the job runs: your own run, and somebody else\'s', () => {
    const fm = src('items/fuelmaker.js');
    const job = { readyAt: 62_000, user: 'you' };
    const ctx = { learned: ['fuelmaking_1'], fuelCells: 0, job, now: 0 };
    const mine = roomMachineVerbs('fuelmaker', machineTank(null, 'fuelmaker'), ctx);
    assert.deepEqual(mine.map((v) => v.id), ['use', 'refuel']);
    assert.equal(mine[0].enabled, false);
    assert.equal(mine[0].reason, 'The machine is still running. 1 minute and 2 seconds remaining.');
    assert.ok(fm.includes('"The machine is still running. "+time_left+" remaining."'));
    const theirs = roomMachineVerbs('fuelmaker', machineTank(null, 'fuelmaker'), { ...ctx, job: { ...job, user: 'someone' } });
    assert.equal(theirs[0].reason, 'Someone else is using this. 1 minute and 2 seconds remaining.');
    assert.ok(fm.includes('"Someone else is using this. "+time_left+" remaining."'));
    const done = roomMachineVerbs('fuelmaker', machineTank(null, 'fuelmaker'), { ...ctx, now: 62_000 });
    assert.equal(done[0].enabled, true, 'free again once the time is up');
  });

  it('with your output waiting, use is hidden and Collect is the default verb', () => {
    const fm = src('items/fuelmaker.js');
    const verbs = roomMachineVerbs('blockmaker', machineTank(null, 'blockmaker'), { learned: ['blockmaking_1'], contents: { items: { grade_aa_earth_block: 2 } }, now: 0 });
    assert.deepEqual(verbs.map((v) => v.id), ['collect', 'refuel']);
    assert.equal(verbs[0].enabled, true);
    assert.equal(verbs[0].primary, true);
    assert.equal(verbs[0].tooltip, 'Collect your block');
    for (const [cls, tip] of Object.entries(COLLECT_TOOLTIPS)) assert.ok(fm.includes(`if (this.class_tsid == '${cls}') return "${tip}";`), cls);
    for (const line of CALL_PLAYER_LINES) assert.ok(fm.includes(`"${line}"`), line);
    const empty = roomMachineVerbs('blockmaker', machineTank(null, 'blockmaker'), { learned: ['blockmaking_1'], contents: { items: { grade_aa_earth_block: 0 } } });
    assert.equal(empty[0].id, 'use');
  });

  it('the finish and collect lines are the source\'s', () => {
    const making = src('players/inc_making.js');
    assert.ok(making.includes('msg += " Make sure to pick up your stuff soon, or it might disappear!"'));
    assert.equal(machineMadeLine('Fuel Cell', 2, 20), 'You made Fuel Cell (x2) +20 iMG. Make sure to pick up your stuff soon, or it might disappear!');
    assert.ok(src('items/fuelmaker.js').includes("this.buildVerbMessage(msg.count, 'collect from', 'collected from'"));
    assert.equal(collectLine('metalmaker'), 'You collected from a Metal Machine.');
  });

  it('a job takes count * each input from the pack up front, or nothing', () => {
    const inv = { tin: 3, plain_metal: 2 };
    const held = takeJobIngredients(inv, RECIPE_CATALOG.metal_rod, 2, { count: countItem, remove: removeItem });
    assert.deepEqual(held, { tin: 2, plain_metal: 2 });
    assert.deepEqual(inv, { tin: 1, plain_metal: 0 });
    assert.equal(takeJobIngredients(inv, RECIPE_CATALOG.metal_rod, 1, { count: countItem, remove: removeItem }), null);
    assert.deepEqual(inv, { tin: 1, plain_metal: 0 }, 'a short pack keeps everything');
  });
});

describe('Metal Music on a room Metal Machine (G175)', () => {
  it('the music verbs carry no machine-room check, so the room machine offers them', () => {
    const mm = src('items/metalmaker.js');
    const off = mm.slice(mm.indexOf('verbs.turn_off_music'), mm.indexOf('verbs.turn_on_music'));
    const on = mm.slice(mm.indexOf('verbs.turn_on_music'), mm.indexOf('verbs.', mm.indexOf('verbs.turn_on_music') + 10));
    for (const v of [off, on]) {
      assert.ok(!v.includes('isInCraftingAltar'), 'no machine room check');
      assert.ok(v.includes("imagination_has_upgrade('metalmaking_music')"));
    }
    assert.ok(off.includes('"Stop playing Metal Music while the machine is working"'));
    assert.ok(on.includes('"Play Metal Music while the machine is working"'));
  });

  it('Turn Music Off / On with the Making Metal card, on by default, only on the Metal Machine', () => {
    assert.deepEqual(metalMusicVerbs('metalmaker', { upgrade: false }), []);
    assert.deepEqual(metalMusicVerbs('fuelmaker', { upgrade: true }), []);
    assert.deepEqual(metalMusicVerbs('metalmaker', { upgrade: true }).map((v) => v.label), ['Turn Music Off']);
    assert.deepEqual(metalMusicVerbs('metalmaker', { upgrade: true, musicOn: false }).map((v) => v.label), ['Turn Music On']);
    const verbs = roomMachineVerbs('metalmaker', machineTank(null, 'metalmaker'), { learned: ['metalwork_1'], musicUpgrade: true });
    assert.deepEqual(verbs.map((v) => v.id), ['use', 'refuel', 'music_off']);
    assert.equal(runningSoundKey('metalmaker', { upgrade: true, musicOn: true }), 'METALMAKER');
    assert.equal(runningSoundKey('metalmaker', { upgrade: true, musicOn: false }), 'ACTIVE');
    assert.equal(runningSoundKey('woodworker', { upgrade: true }), 'ACTIVE');
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
  class Gfx extends Obj {
    clear() { this.ops = []; return this; }
    roundRect(...a) { (this.ops ||= []).push(['rect', ...a]); return this; }
    circle(...a) { (this.ops ||= []).push(['circle', ...a]); return this; }
    fill() { return this; }
    stroke() { return this; }
  }
  const PIXI = { Sprite: Obj, Container: Obj, Graphics: Gfx, ImageSource: class { on() {} emit() {} }, Texture: class { constructor(o) { Object.assign(this, o); } } };
  let clock = 1_000_000;
  const realNow = Date.now;

  before(async () => {
    await loadRecipeCatalogFromFile(join(spike, 'public/assets/content/recipes.json'));
    ensureMakingItems();
  });

  function roomEngine(tsid, extra = {}, shared = {}) {
    const room = street(tsid);
    const slots = shared.slots || {};
    const data = {};
    const log = shared.log || [];
    const sounds = shared.sounds || [];
    const engine = {
      PIXI,
      street: room,
      streetTsid: tsid,
      entityLayer: new Obj(),
      platforms: platformsScreen(room),
      player: { x: 600, y: 570 },
      pc: shared.pc || { energy: 100, mood: 50, xp: 0, imagination: 0, level: 5, energyMax: 100, imaginationUpgrades: [] },
      inv: shared.inv || {},
      learnedSkills: ['fuelmaking_1', 'blockmaking_1', 'woodworking_1', 'metalwork_1'],
      streetSlot: (id, t) => ((slots[`${id}:${t}`] ||= {})),
      register: (t) => ((shared.registered ||= []).push(t), t),
      setData: (k, v) => { data[k] = v; },
      param: () => null,
      pushActivity: (line) => log.push(line),
      toast() {},
      say: (target, line) => log.push(`say ${target.classId}: ${line}`),
      floatText() {},
      updateHud() {},
      refreshPack() {},
      save() {},
      playSound: (key) => sounds.push(key),
      playSoundLoop: (key) => { sounds.push(`loop ${key}`); return { stop: () => sounds.push(`stop ${key}`) }; },
      achievement: (c, n) => log.push(`counter ${c} ${n}`),
      openMakeStation: (station) => { engine.station = station; },
      // game.js makeStationJob: craftRecipe on the machine's hold, with its tank.
      makeStationJob: ({ key, qty, hold, tool, toolState }) => {
        const out = { made: 0, xp: 0, msgs: [] };
        const opts = { learned: engine.learnedSkills, requireSkill: true, requireTool: true, toolState, stationTool: tool };
        for (let i = 0; i < qty; i++) {
          const r = craftRecipe(hold, engine.pc, key, { ...opts, unitIndex: i + 1, batchQty: qty });
          if (!r.ok) { out.msgs.push(...r.msgs); break; }
          out.made += 1;
          out.xp += r.xp;
        }
        return out;
      },
      data,
      log,
      slots,
      sounds,
      ...extra,
    };
    return engine;
  }

  const tick = (engine, ms) => {
    clock += ms;
    machineRoomsFeature.onTick(300, clock, engine);
  };

  it('spawns every machine; a job takes the ingredients, runs while you are away, and waits to be collected', () => {
    const prev = globalThis.PIXI;
    globalThis.PIXI = PIXI;
    Date.now = () => clock;
    try {
      machineRoomsFeature._reset();
      const shared = { inv: { jellisac_clump: 24, peat: 16, white_gas: 4 } };
      const engine = roomEngine('GCR101Q98A12EHH', { param: (n) => (n === 'machineroomroll' ? '0' : null) }, shared);
      machineRoomsFeature.onStreetClear(engine);
      machineRoomsFeature.onStreetEnter(engine.street, engine);
      assert.equal(engine.data.machineRoom, 'GCR101Q98A12EHH');
      assert.equal(engine.data.machineRoomMachines, '5');
      assert.deepEqual(machineRoomsFeature._state().machines.map((m) => m.classTsid), ['blockmaker', 'blockmaker', 'fuelmaker', 'woodworker', 'metalmaker']);
      const fm = shared.registered.find((t) => t.classId === 'fuelmaker');
      assert.deepEqual(machineRoomsFeature.verbsFor(fm, engine).map((v) => v.id), ['use', 'refuel']);
      assert.equal(machineRoomsFeature.runVerb(fm, 'use', engine), true);
      assert.equal(engine.station.tool, 'fuelmaker');
      assert.equal(typeof engine.station.startJob, 'function', 'the panel starts a job instead of making in your hands');
      assert.equal(engine.station.startJob({ key: 'fuel_cell', recipe: RECIPE_CATALOG.fuel_cell, qty: 2, waitMultiplier: 1 }), true);
      assert.deepEqual(shared.inv, { jellisac_clump: 0, peat: 0, white_gas: 0 }, 'ingredients go in up front');
      const job = machineRoomsFeature._state().jobs.IDOOVGC4SRJ2PBN;
      assert.equal(job.readyAt - job.startedAt, 2 * 20000 + 2200);
      assert.deepEqual(engine.sounds, ['loop ACTIVE'], 'the machine hums while you are in the room');
      const busy = machineRoomsFeature.verbsFor(fm, engine);
      assert.equal(busy[0].enabled, false);
      assert.equal(busy[0].reason, 'The machine is still running. 42 seconds remaining.');
      assert.equal(engine.station.startJob({ key: 'fuel_cell', recipe: RECIPE_CATALOG.fuel_cell, qty: 1 }), false, 'one job at a time');
      tick(engine, 10_000);
      assert.match(machineRoomsFeature._state().machines[2].subtitle, /^Working · 32 seconds left$/);
      // Leave; the job finishes while you are elsewhere (finishMakingKnown is on the player's timer).
      machineRoomsFeature.onStreetClear(engine);
      assert.ok(engine.sounds.includes('stop ACTIVE'));
      const outside = roomEngine('GCR10K3BPJK1U6F', { param: (n) => (n === 'machineroomroll' ? '0' : null) }, { ...shared, slots: engine.slots, log: engine.log, sounds: engine.sounds });
      machineRoomsFeature.onStreetEnter(outside.street, outside);
      tick(outside, 33_000);
      assert.equal(machineRoomsFeature._state().jobs.IDOOVGC4SRJ2PBN, undefined);
      assert.deepEqual(machineRoomsFeature._state().contents.IDOOVGC4SRJ2PBN.items, { fuel_cell: 2 }, 'the output waits in the machine');
      assert.equal(shared.inv.fuel_cell || 0, 0, 'not in the pack yet');
      // xpReward 10 each, through grantMoodXp (mood 50 trims it).
      assert.ok(outside.log.some((l) => /^You made Fuel Cell \(x2\) \+\d+ iMG\. Make sure to pick up your stuff soon, or it might disappear!$/.test(l)), outside.log.join(' / '));
      assert.ok(outside.log.includes('Altar bonus! You used a Machine in a Machine Room: You got 7 mood!'), 'one bonus roll per finished job');
      assert.equal(machineRoomsFeature._state().bonusPaid, 1);
      assert.ok(outside.sounds.includes('READY'));
      const slot = engine.slots['machine-rooms:GCR101Q98A12EHH'];
      assert.equal(tankFuel(slot.tanks.IDOOVGC4SRJ2PBN, 'fuelmaker'), FRESH_FUEL - 2 * Number(RECIPE_CATALOG.fuel_cell.toolWear), 'the room tank paid the fuel at the finish');
      machineRoomsFeature.onStreetClear(outside);
      // Come back: Collect is the default, Use is gone, and it calls you when you come near.
      shared.registered = [];
      const back = roomEngine('GCR101Q98A12EHH', {}, { ...shared, slots: engine.slots });
      back.player.x = -9999;
      machineRoomsFeature.onStreetEnter(back.street, back);
      const fm2 = shared.registered.find((t) => t.classId === 'fuelmaker');
      assert.deepEqual(machineRoomsFeature.verbsFor(fm2, back).map((v) => v.id), ['collect', 'refuel']);
      assert.equal(back.data.machineRoomWaiting, 'IDOOVGC4SRJ2PBN');
      back.player.x = fm2.sprite.x + 60;
      back.player.y = fm2.sprite.y;
      tick(back, 300);
      assert.ok(back.log.some((l) => /^say fuelmaker: /.test(l) && CALL_PLAYER_LINES.includes(l.slice('say fuelmaker: '.length))));
      machineRoomsFeature.runVerb(fm2, 'collect', back);
      assert.equal(shared.inv.fuel_cell, 2);
      assert.ok(back.log.includes('You collected from a Fuelmaker.'));
      assert.ok(back.sounds.includes('COLLECT'));
      assert.deepEqual(machineRoomsFeature.verbsFor(fm2, back).map((v) => v.id), ['use', 'refuel', 'refuel_all']);
      // A Woodworker job finishes with no bonus (recipe 192 only, woodworker.js:862).
      shared.inv.plank = 4;
      const ww = shared.registered.find((t) => t.classId === 'woodworker');
      machineRoomsFeature.runVerb(ww, 'use', back);
      back.station.startJob({ key: 'board', recipe: RECIPE_CATALOG.board, qty: 1 });
      tick(back, 5_000);
      assert.deepEqual(machineRoomsFeature._state().contents.IA5RL1JTRQS2J4J.items, { board: 1 });
      assert.equal(machineRoomsFeature._state().bonusPaid, 1);
      // Refuel: the Bowser counter as well as refueled.
      machineRoomsFeature.runVerb(fm2, 'refuel', back);
      assert.ok(back.log.includes('counter machines:refueled_for_others 1'));
      machineRoomsFeature.onStreetClear(back);
      const out2 = roomEngine('GCR10K3BPJK1U6F');
      machineRoomsFeature.onStreetEnter(out2.street, out2);
      assert.equal(out2.data.machineRoom, '');
      assert.equal(out2.data.machineRoomMachines, '0');
    } finally {
      globalThis.PIXI = prev;
      Date.now = realNow;
    }
  });

  it('a job and its output survive a reload; output left 6.5 game days is gone', () => {
    const prev = globalThis.PIXI;
    globalThis.PIXI = PIXI;
    Date.now = () => clock;
    try {
      machineRoomsFeature._reset();
      const shared = { inv: { tin: 1, plain_metal: 1 } };
      const engine = roomEngine('GA9MU59GB792T80', {}, shared);
      machineRoomsFeature.onStreetEnter(engine.street, engine);
      const mm = shared.registered.find((t) => t.classId === 'metalmaker');
      machineRoomsFeature.runVerb(mm, 'use', engine);
      engine.station.startJob({ key: 'metal_rod', recipe: RECIPE_CATALOG.metal_rod, qty: 1 });
      const saved = JSON.parse(JSON.stringify(machineRoomsFeature.save()));
      machineRoomsFeature.onStreetClear(engine);
      machineRoomsFeature._reset();
      machineRoomsFeature.restore(saved);
      assert.equal(machineRoomsFeature._state().jobs.IHV10AAIAHV2S0H.key, 'metal_rod');
      tick(engine, 12_200);
      assert.deepEqual(machineRoomsFeature._state().contents.IHV10AAIAHV2S0H.items, { metal_rod: 1 });
      machineRoomsFeature.restore(JSON.parse(JSON.stringify(machineRoomsFeature.save())));
      clock += 6.5 * GAME_DAY_MS;
      const back = roomEngine('GA9MU59GB792T80', {}, { ...shared, slots: engine.slots });
      machineRoomsFeature.onStreetEnter(back.street, back);
      assert.equal(machineRoomsFeature._state().contents.IHV10AAIAHV2S0H, undefined, 'expireOldContents on entering');
      machineRoomsFeature.restore({ jobs: { X: { room: 'GCR10K3BPJK1U6F', key: 'board', readyAt: 1 } }, contents: { Y: { room: 'nowhere', items: {} } } });
      assert.deepEqual(machineRoomsFeature._state().jobs, {}, 'rows for rooms that are not machine rooms are dropped');
      machineRoomsFeature.onStreetClear(back);
    } finally {
      globalThis.PIXI = prev;
      Date.now = realNow;
    }
  });

  it('a room Metal Machine plays Metal Music with the Making Metal card, and keeps its own setting', () => {
    const prev = globalThis.PIXI;
    globalThis.PIXI = PIXI;
    Date.now = () => clock;
    try {
      machineRoomsFeature._reset();
      const shared = { inv: { tin: 1, plain_metal: 1 }, pc: { energy: 100, mood: 50, xp: 0, imagination: 0, level: 5, energyMax: 100, imaginationUpgrades: ['metalmaking_music'] } };
      const engine = roomEngine('GA9MU59GB792T80', {}, shared);
      machineRoomsFeature.onStreetEnter(engine.street, engine);
      const mm = shared.registered.find((t) => t.classId === 'metalmaker');
      assert.deepEqual(machineRoomsFeature.verbsFor(mm, engine).map((v) => v.id), ['use', 'refuel', 'music_off']);
      const fm = shared.registered.find((t) => t.classId === 'fuelmaker');
      assert.ok(!machineRoomsFeature.verbsFor(fm, engine).some((v) => /music/.test(v.id)));
      machineRoomsFeature.runVerb(mm, 'use', engine);
      engine.station.startJob({ key: 'metal_rod', recipe: RECIPE_CATALOG.metal_rod, qty: 1 });
      assert.deepEqual(engine.sounds, ['loop METALMAKER']);
      machineRoomsFeature.runVerb(mm, 'music_off', engine);
      assert.deepEqual(engine.sounds, ['loop METALMAKER', 'stop METALMAKER', 'loop ACTIVE'], 'announce_sound_stop(METALMAKER); the hum goes on');
      assert.deepEqual(machineRoomsFeature.verbsFor(mm, engine).map((v) => v.id), ['use', 'refuel', 'music_on']);
      assert.deepEqual(machineRoomsFeature.save().musicOff, { IHV10AAIAHV2S0H: true });
      machineRoomsFeature.runVerb(mm, 'music_on', engine);
      assert.equal(engine.sounds.at(-1), 'loop METALMAKER');
      tick(engine, 12_200);
      assert.ok(engine.sounds.includes('stop METALMAKER'), 'the music stops when the job is done');
      machineRoomsFeature.onStreetClear(engine);
    } finally {
      globalThis.PIXI = prev;
      Date.now = realNow;
    }
  });
});
