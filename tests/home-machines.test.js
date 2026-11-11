/**
 * Lane MACHINES: machines an owner sets down on a home street (Austin
 * 2026-11-01). js/home-machines.js (the rules), the feature's slice, the
 * site's src/HomeMachines.php (through php -r) and its data/home-machines.json,
 * and the server's home_machines.go, against the GameServerJS lines they cite.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  HOME_MACHINES_MAX,
  HOME_MACHINE_POOL,
  HOME_MACHINE_TEXT,
  MACHINE_ROOM_BOUNDS,
  MACHINE_ROOM_PLACES,
  isRoomPlace,
  placeIsAltar,
  roomFixedXs,
  roomMachineSpan,
  roomName,
  roomPlaceOf,
  roomTsidOf,
  MACHINE_EDGE,
  MACHINE_SPACING,
  expireSolo,
  jobFuel,
  jobLimit,
  jobOutputs,
  normalizeMachine,
  normalizeSlice,
  othersInside,
  placeCheck,
  placePays,
  placedMachineVerbs,
  roomSpan,
  towerPlace,
  settleSolo,
  soloRow,
} from '../public/js/home-machines.js?v=1bd74ede';
import { homeMachinesFeature } from '../public/js/features/home-machines-feature.js?v=20ad90b9';
import { RECIPE_CATALOG, setRecipeCatalog } from '../public/js/making.js?v=4e72bb4b';
import { HAS_SERVER, HAS_SITE, SITE_DIR, serverPath } from '../tools/repos.mjs';

const root = join(import.meta.dirname, '..');
const gsjs = join(root, '..', 'glitch-GameServerJS');
const line = (file, n) => readFileSync(join(gsjs, file), 'utf8').split('\n')[n - 1];
const hasPhp = spawnSync('php', ['-v']).status === 0;
const skipSite = !HAS_SITE ? 'no groddle-afternoon-site checkout' : !hasPhp ? 'no php' : false;

function php(body) {
  const code = `foreach (["HomePool", "HomeMachines"] as $c) require ${JSON.stringify(SITE_DIR)} . "/src/$c.php"; use Groddle\\Minn\\HomeMachines as H; $R = H::rules(); ${body}`;
  return JSON.parse(execFileSync('php', ['-r', code]).toString());
}

const recipes = JSON.parse(readFileSync(join(root, 'public/assets/content/recipes.json'), 'utf8'));
if (!RECIPE_CATALOG.fuel_cell) setRecipeCatalog(recipes.recipes || recipes);
const FUEL_CELL = (recipes.recipes || recipes).fuel_cell;

describe('the rules are the source\'s (GSJS)', () => {
  it('a finished make at someone else\'s machine pays the owner 7 (inc_making.js:836)', () => {
    assert.match(line('players/inc_making.js', 836), /cultivation_add_img_rewards\(this, 7\.0\)/);
    assert.equal(HOME_MACHINE_POOL, 7);
    // inc_cultivation.js 168-178: only a home's public half, never the owner.
    assert.match(line('locations/inc_cultivation.js', 170), /is_public/);
    assert.match(line('locations/inc_cultivation.js', 171), /pols_is_owner\(pc\)/);
  });
  it('only the owner or a key-holder takes one apart; anyone uses, refuels and collects', () => {
    for (const f of ['fuelmaker', 'blockmaker', 'woodworker']) {
      assert.match(line(`items/${f}.js`, 322), /pols_is_owner\(pc\) && ?!this\.container\.acl_keys_player_has_key\(pc\)/, f);
    }
    const src = readFileSync(join(gsjs, 'items/fuelmaker.js'), 'utf8');
    for (const verb of ['use', 'refuel', 'collect']) {
      const body = src.slice(src.indexOf(`verbs.${verb} = {`), src.indexOf('};', src.indexOf(`verbs.${verb} = {`)));
      assert.doesNotMatch(body, /pols_is_owner|acl_keys/, `${verb} asks nobody`);
    }
    assert.match(src, /itemDef\.keys_in_pack = \{\};/, 'an assembled machine has no pack verbs: it only stands in a location');
  });
  it('where one may stand (machine_stand.js canDrop)', () => {
    assert.match(line('items/machine_stand.js', 775), /findCloseStack\('machine_stand', 200\)/);
    assert.match(line('items/machine_stand.js', 786), /geo\.l\+70/);
    assert.equal(MACHINE_SPACING, 200);
    assert.equal(MACHINE_EDGE, 70);
  });
});

describe('placing', () => {
  const layout = { houseX: 1000, width: 2400 };
  it('not near another, not at an end, not too many', () => {
    assert.equal(placeCheck({ machines: [], rx: 0, layout, classTsid: 'fuelmaker' }).ok, true);
    assert.equal(placeCheck({ machines: [{ rx: 0 }], rx: 199, layout, classTsid: 'fuelmaker' }).why, 'near');
    assert.equal(placeCheck({ machines: [{ rx: 0 }], rx: 200, layout, classTsid: 'fuelmaker' }).ok, true);
    assert.equal(placeCheck({ machines: [], rx: -935, layout, classTsid: 'fuelmaker' }).why, 'edge');
    assert.equal(placeCheck({ machines: [], rx: 1335, layout, classTsid: 'woodworker' }).why, 'edge');
    assert.equal(placeCheck({ machines: Array.from({ length: HOME_MACHINES_MAX }, (_, i) => ({ rx: i * 300 })), rx: -900, layout, classTsid: 'fuelmaker' }).why, 'many');
    assert.equal(placeCheck({ machines: [], rx: 0, layout, classTsid: 'still' }).why, 'class');
    assert.equal(placeCheck({ machines: [], rx: 0, layout, classTsid: 'fuelmaker' }).msg, undefined);
    assert.equal(placeCheck({ machines: [{ rx: 0 }], rx: 10, layout, classTsid: 'fuelmaker' }).msg, 'This Fuelmaker cannot be placed here.');
  });
});

describe('HOMES2: in the house and in the Tower', () => {
  it('a room\'s ends are its inner walls; the spacing counts that room only', () => {
    const house = roomSpan('house', { wallSegments: 7 });
    assert.deepEqual(house, { lo: 76, hi: 7 * 150 - 76 });
    assert.equal(placeCheck({ machines: [], rx: 146, span: house, classTsid: 'fuelmaker' }).why, 'edge');
    assert.equal(placeCheck({ machines: [], rx: 147, span: house, classTsid: 'fuelmaker' }).ok, true);
    assert.equal(placeCheck({ machines: [], rx: 904, span: house, classTsid: 'fuelmaker' }).why, 'edge');
    assert.equal(placeCheck({ machines: [{ rx: 300 }], rx: 450, span: house, classTsid: 'fuelmaker' }).why, 'near');
    assert.deepEqual(roomSpan('house', { wallSegments: 20 }).hi, 20 * 150 - 76);
    assert.deepEqual(roomSpan('tower:3'), { lo: 130, hi: 1102 });
    assert.equal(towerPlace(4), 'tower:4');
    assert.equal(towerPlace(99), 'tower:8');
  });
  it('a machine keeps its place; the home street is the default', () => {
    const raw = { id: 'hm-00000000000000aa', class: 'fuelmaker', rx: 0, fuel: 50 };
    assert.equal(normalizeMachine(raw).place, 'street');
    assert.equal(normalizeMachine({ ...raw, place: 'tower:2' }).place, 'tower:2');
    assert.equal(normalizeMachine({ ...raw, place: 'yard' }).place, 'street');
  });
  it('only the home street pays the owner\'s pool (inc_cultivation.js:170, inc_houses.js 1706-1709)', () => {
    assert.match(line('locations/inc_cultivation.js', 170), /if \(!this\.is_public\) return false;/);
    assert.match(line('players/inc_houses.js', 1709), /this\.home\.exterior\.cultivation_get_img_rewards\(this\)/);
    assert.match(line('locations/tower.js', 11), /this\.is_public = true;/);
    assert.deepEqual(['street', 'house', 'tower:0'].map(placePays), [true, false, false]);
  });
  it('findCloseStack looks in one location (player.js 1152-1186)', () => {
    assert.match(line('players/player.js', 1160), /for \(var i in this\.location\.items\)/);
  });
});

describe('lane machines (#152): the Community Machine Rooms', () => {
  const roomSpot = (place, taken = []) => {
    const ok = [];
    for (let x = -700; x <= 700; x += 1) {
      if (placeCheck({ machines: taken.map((rx) => ({ rx })), rx: x, span: roomMachineSpan(), fixed: roomFixedXs(place), classTsid: 'fuelmaker' }).ok) ok.push(x);
    }
    return ok;
  };
  it('the three rooms are the source\'s machine_rooms (config_prod.js:1332), and isInCraftingAltar reads them (fuelmaker.js 1197-1199)', () => {
    const list = line('config_prod.js', 1332).match(/L[A-Z0-9]{14}/g);
    assert.deepEqual(list.map((l) => roomPlaceOf(l)).sort(), ['mr:besara', 'mr:forest', 'mr:meadow']);
    assert.deepEqual(Object.keys(MACHINE_ROOM_PLACES).sort(), list.map((l) => `G${l.slice(1)}`).sort());
    assert.match(line('items/fuelmaker.js', 1198), /in_array_real\(this\.container\.tsid, config\.machine_rooms\)/);
    assert.match(line('items/fuelmaker.js', 861), /if \(!this\.isInCraftingAltar\(\)\) return false;/);
    assert.equal(roomPlaceOf('GA5101HF7F429V'), '');
    assert.deepEqual(['mr:meadow', 'mr:forest', 'street', 'house', 'tower:2'].map(placeIsAltar), [true, true, false, false, false]);
    assert.deepEqual(['mr:besara', 'mr:x', 'street'].map(isRoomPlace), [true, false, false]);
    assert.equal(roomTsidOf('mr:forest'), 'GIF16EM56A12FSB');
    assert.equal(roomName('mr:besara'), 'besara');
    assert.equal(normalizeMachine({ id: 'hm-00000000000000aa', class: 'fuelmaker', rx: 0, fuel: 50, place: 'mr:forest', owner: 9, ownerName: 'Bo' }).place, 'mr:forest');
  });
  it('the rooms\' ends are their streets\' (bldg_int_machine.swf, -700..700)', () => {
    for (const tsid of ['GCR101Q98A12EHH', 'GA9MU59GB792T80']) {
      const st = JSON.parse(readFileSync(join(root, `public/assets/streets/${tsid}.json`), 'utf8'));
      assert.deepEqual([st.bounds.l, st.bounds.r], [MACHINE_ROOM_BOUNDS.l, MACHINE_ROOM_BOUNDS.r], tsid);
    }
    assert.match(readFileSync(join(root, 'public/js/forest-machine-room.js'), 'utf8'), /bounds -700\.\.700/);
  });
  it('canDrop keeps 200 px from the room\'s own machines and 70 px from its ends (machine_stand.js 777-788)', () => {
    assert.match(line('items/machine_stand.js', 781), /findCloseStack\(is_machine, 200\)/);
    const forest = roomSpot('mr:forest');
    assert.ok(forest.length > 0, 'the Forest room has room');
    assert.deepEqual([forest[0], forest.at(-1)], [-286, 296]);
    assert.ok(forest.every((x) => roomFixedXs('mr:forest').every((f) => Math.abs(f - x) >= 200) && x > -630 && x < 630));
    assert.equal(placeCheck({ machines: [], rx: -630, span: roomMachineSpan(), classTsid: 'fuelmaker' }).why, 'edge');
    assert.equal(placeCheck({ machines: [], rx: -29, span: roomMachineSpan(), fixed: roomFixedXs('mr:forest'), classTsid: 'fuelmaker' }).why, 'near');
    // One down in each Forest gap, then the room is full; Besara takes two past its Woodworker.
    assert.equal(roomSpot('mr:forest', [-250, 200]).length, 0);
    const besara = roomSpot('mr:besara');
    assert.deepEqual([besara[0], besara.at(-1)], [394, 629]);
    assert.equal(roomSpot('mr:besara', [394]).length > 0, true);
    assert.equal(roomSpot('mr:besara', [394, 600]).length, 0);
    // As the room's five machines stand (two by judgement, machine-rooms.js), Meadow has no spot left.
    assert.equal(roomSpot('mr:meadow').length, 0);
  });
  it('a room is no POL: everyone\'s output goes after 6 game days, the owner\'s too (expireOldContents 1146-1158)', () => {
    assert.match(line('items/fuelmaker.js', 1149), /if \(!this\.container\.pols_is_pol\(\) \|\| !this\.container\.pols_is_owner\(pc\)\)/);
    const row = soloRow({ id: 'hm-00000000000000ae', classTsid: 'fuelmaker', place: 'mr:forest', rx: 0, fuel: 100, job: null, contents: { you: { items: { fuel_cell: 1 }, at: 0 } } });
    expireSolo(row, null, 7 * 14400 * 1000);
    assert.deepEqual(row.waiting, []);
    assert.equal(placePays('mr:meadow'), false, 'no pool: no home');
  });
  it('the source hid disassemble in a machine room; ours keeps the owner\'s Pick up', () => {
    assert.match(line('items/fuelmaker.js', 64), /if \(this\.isInCraftingAltar\(\)\) return \{state:null\};/);
    assert.match(line('items/fuelmaker.js', 310), /if \(this\.isInCraftingAltar\(\)\) return \{state:null\};/);
    const m = normalizeMachine({ id: 'hm-00000000000000aa', class: 'fuelmaker', rx: 0, fuel: 50, place: 'mr:forest', owner: 7, job: null, waiting: [] });
    const ctx = { learned: ['fuelmaking_1', 'engineering_1'], fuelCells: 1, now: 5 };
    assert.equal(placedMachineVerbs(m, { ...ctx, me: '7', mayTake: true }).some((v) => v.id === 'machine_pickup'), true);
    assert.deepEqual(placedMachineVerbs(m, { ...ctx, me: '9', mayTake: false }).map((v) => v.id), ['use', 'refuel']);
  });
  it('the slice keeps where a job runs (for the Altar bonus); the refusal names the rooms', () => {
    const s = normalizeSlice({ jobs: { 'hm-00000000000000ac': { key: 'fuel_cell', qty: 1, readyAt: 5, held: {}, place: 'mr:besara' }, 'hm-00000000000000ad': { key: 'fuel_cell', qty: 1, readyAt: 5, held: {}, place: 'yard' } } });
    assert.equal(s.jobs['hm-00000000000000ac'].place, 'mr:besara');
    assert.equal(s.jobs['hm-00000000000000ad'].place, undefined);
    assert.match(HOME_MACHINE_TEXT.placeHome, /Community Machine Room/);
    assert.doesNotMatch(HOME_MACHINE_TEXT.placeHome, /\u2014|Glitch/);
  });
});

describe('fuel and the job size', () => {
  it('the Blockmaker cards take 20 / 40% off the whole job (inc_making.js 768-776)', () => {
    assert.equal(jobFuel('blockmaker', 5, 10, []), 50);
    assert.equal(jobFuel('blockmaker', 5, 10, ['blockmaking_save_fuel_1']), 40);
    assert.equal(jobFuel('blockmaker', 5, 10, ['blockmaking_save_fuel_2', 'blockmaking_save_fuel_1']), 30);
    assert.equal(jobFuel('fuelmaker', 1, 3, ['blockmaking_save_fuel_2']), 3);
  });
  it('Mad Machinist I / II', () => {
    assert.equal(jobLimit(10, []), 10);
    assert.equal(jobLimit(10, ['recipe_task_limit_machines_1']), 15);
    assert.equal(jobLimit(5, ['recipe_task_limit_machines_2']), 10);
  });
});

describe('a machine as everyone sees it', () => {
  const raw = { id: 'hm-00000000000000aa', class: 'fuelmaker', rx: 120, fuel: 60, music: true, job: { user: 9, name: 'Fuel Cell', qty: 1, at: 1000, ready: 23200 }, waiting: [7] };
  it('normalizes the site\'s view onto this page\'s clock', () => {
    const m = normalizeMachine(raw, 500);
    assert.deepEqual([m.job.user, m.job.startedAt, m.job.readyAt, m.waiting], ['9', 1500, 23700, ['7']]);
    assert.equal(normalizeMachine({ ...raw, id: 'x' }), null);
    assert.equal(normalizeMachine({ ...raw, class: 'still' }), null);
  });
  it('a visitor uses, refuels and collects; only the owner or a key-holder may pick it up', () => {
    const idle = normalizeMachine({ ...raw, job: null, waiting: [] });
    const ctx = { learned: ['fuelmaking_1', 'engineering_1'], fuelCells: 2, now: 5000 };
    const visitor = placedMachineVerbs(idle, { ...ctx, me: '9', mayTake: false }).map((v) => v.id);
    assert.deepEqual(visitor.sort(), ['refuel', 'refuel_all', 'use'].sort());
    const owner = placedMachineVerbs(idle, { ...ctx, me: '7', mayTake: true });
    assert.equal(owner.find((v) => v.id === 'machine_pickup').enabled, true);
  });
  it('while it runs nobody else can use it, nor pick it up (canUse)', () => {
    const run = normalizeMachine(raw);
    const ctx = { learned: ['fuelmaking_1', 'engineering_1'], fuelCells: 0, now: 5000 };
    const other = placedMachineVerbs(run, { ...ctx, me: '11', mayTake: false }).find((v) => v.id === 'use');
    assert.equal(other.enabled, false);
    assert.match(other.reason, /^Someone else is using this\. 18 seconds remaining\.$/);
    const owner = placedMachineVerbs(run, { ...ctx, me: '7', mayTake: true });
    assert.equal(owner.find((v) => v.id === 'machine_pickup').reason, 'Someone else is using this.');
    assert.equal(owner.find((v) => v.id === 'collect').enabled, false, 'my output waits but the machine runs for someone else');
    assert.equal(othersInside(run, '7'), false);
    assert.equal(othersInside(run, '9'), true);
  });
  it('without Engineering, no pick up', () => {
    const idle = normalizeMachine({ ...raw, job: null, waiting: [] });
    const v = placedMachineVerbs(idle, { learned: [], me: '7', mayTake: true, now: 1 }).find((x) => x.id === 'machine_pickup');
    assert.equal(v.reason, 'You need to know Engineering to do this.');
  });
});

describe('solo: the same rules on the slice', () => {
  it('a finished job pays the tank and its output waits for the maker; others\' expires', () => {
    const row = soloRow({ id: 'hm-00000000000000ab', classTsid: 'fuelmaker', rx: 0, fuel: 100, job: { user: 'you', key: 'fuel_cell', name: 'Fuel Cell', qty: 2, need: 2, startedAt: 0, readyAt: 1000, held: {} }, contents: {} });
    assert.equal(settleSolo(row, jobOutputs(FUEL_CELL, 2), 500), false, 'still running');
    assert.equal(settleSolo(row, jobOutputs(FUEL_CELL, 2), 1000), true);
    assert.deepEqual([row.fuel, row.job, row.contents.you.items], [98, null, { fuel_cell: 2 }]);
    row.contents.friend = { items: { fuel_cell: 1 }, at: 0 };
    expireSolo(row, 'you', 7 * 14400 * 1000);
    assert.deepEqual(Object.keys(row.contents), ['you'], 'yours never goes at home (expireOldContents)');
  });
  it('the slice keeps ids and jobs, and drops what is not one', () => {
    const s = normalizeSlice({ placed: ['hm-00000000000000aa', 'nope'], taken: ['hm-00000000000000ab'], jobs: { 'hm-00000000000000ac': { key: 'fuel_cell', qty: 1, readyAt: 5, held: { peat: 8 } }, bad: {} } });
    assert.deepEqual([s.placed, s.taken, Object.keys(s.jobs)], [['hm-00000000000000aa'], ['hm-00000000000000ab'], ['hm-00000000000000ac']]);
  });
  it('the feature saves only what it holds and reads it back', () => {
    homeMachinesFeature._reset();
    assert.equal(homeMachinesFeature.save(), undefined);
    homeMachinesFeature.restore({ placed: ['hm-00000000000000aa'], machines: [{ id: 'hm-00000000000000ad', classTsid: 'woodworker', rx: 40, fuel: 70, job: null, contents: {} }] });
    const out = homeMachinesFeature.save();
    assert.deepEqual(out.placed, ['hm-00000000000000aa']);
    assert.equal(out.machines[0].fuel, 70);
    assert.deepEqual(homeMachinesFeature.packVerbs('fuelmaker', { started: false }), [], 'nothing before the game starts (or under node)');
    homeMachinesFeature._reset();
  });
  it('is registered', () => {
    assert.match(readFileSync(join(root, 'public/js/features/index.js'), 'utf8'), /FEATURES\.push\(homeMachinesFeature\)/);
  });
});

describe('the site decides (src/HomeMachines.php)', { skip: skipSite }, () => {
  it('its data is fresh (tools/build-home-machines.mjs)', () => {
    assert.equal(spawnSync('node', ['tools/build-home-machines.mjs', '--check'], { cwd: root }).status, 0);
  });
  const row = `["id"=>"hm-0000000000000001","owner"=>7,"class"=>"fuelmaker","rx"=>0,"fuel"=>50,"music"=>true,"job"=>null,"contents"=>[],"status"=>"placed","taken_op"=>null,"taker"=>null]`;
  it('a visitor starts a job: the ingredients times the count, the source\'s time, the tank\'s fuel', () => {
    const j = php(`echo json_encode(H::start($R, ${row}, 9, "fuel_cell", 2, ["fuelmaking_1"], [], 1000));`);
    assert.deepEqual(j.held, { jellisac_clump: 24, peat: 16, white_gas: 4 });
    assert.equal(j.job.ready, 1000 + 2 * FUEL_CELL.waitMs + 2200);
    assert.equal(j.job.need, jobFuel('fuelmaker', FUEL_CELL.toolWear, 2, []));
  });
  it('refuses without the skill, past the task limit, without fuel, while running, with output waiting', () => {
    const why = (body) => php(`$r = ${row}; ${body}`).why;
    assert.equal(why(`echo json_encode(H::start($R, $r, 9, "fuel_cell", 1, [], [], 1));`), 'skill');
    assert.equal(why(`echo json_encode(H::start($R, $r, 9, "fuel_cell", 11, ["fuelmaking_1"], [], 1));`), 'qty');
    assert.equal(php(`$r = ${row}; echo json_encode(H::start($R, $r, 9, "fuel_cell", 15, ["fuelmaking_1"], ["recipe_task_limit_machines_1"], 1));`).why, undefined);
    assert.equal(why(`$r["fuel"] = 0; echo json_encode(H::start($R, $r, 9, "fuel_cell", 1, ["fuelmaking_1"], [], 1));`), 'fuel');
    assert.equal(why(`echo json_encode(H::start($R, $r, 9, "board", 1, ["fuelmaking_1"], [], 1));`), 'recipe');
    const busy = php(`$r = ${row}; $r["job"] = ["user"=>11,"key"=>"fuel_cell","qty"=>1,"need"=>1,"name"=>"Fuel Cell","at"=>0,"ready"=>10000]; echo json_encode(H::start($R, $r, 9, "fuel_cell", 1, ["fuelmaking_1"], [], 4000));`);
    assert.deepEqual(busy, { why: 'busy', text: 'Someone else is using this. 6 seconds remaining.' });
    assert.equal(why(`$r["contents"] = ["9" => ["items" => ["fuel_cell" => 1], "at" => 0]]; echo json_encode(H::start($R, $r, 9, "fuel_cell", 1, ["fuelmaking_1"], [], 1));`), 'waiting');
  });
  it('a finished job: the tank pays, the output waits for its maker, the owner\'s pool gets 7 (never for the owner)', () => {
    const job = '["user"=>9,"key"=>"fuel_cell","qty"=>2,"need"=>2,"name"=>"Fuel Cell","at"=>0,"ready"=>1000]';
    const [r, paid] = php(`$r = ${row}; $r["job"] = ${job}; echo json_encode(H::settle($R, $r, 7, 1000));`);
    assert.deepEqual([r.fuel, r.job, r.contents['9'].items, paid.amount, paid.user], [48, null, { fuel_cell: 2 }, 7, 9]);
    const [, own] = php(`$r = ${row}; $r["job"] = ["user"=>7] + ${job}; echo json_encode(H::settle($R, $r, 7, 1000));`);
    assert.equal(own, null);
    const [still] = php(`$r = ${row}; $r["job"] = ${job}; echo json_encode(H::settle($R, $r, 7, 999));`);
    assert.equal(still.job.user, 9, 'not yet');
    const [old] = php(`$r = ${row}; $r["contents"] = ["9" => ["items" => ["fuel_cell" => 1], "at" => 0], "7" => ["items" => ["fuel_cell" => 1], "at" => 0]]; echo json_encode(H::settle($R, $r, 7, 7 * 14400000));`);
    assert.deepEqual(Object.keys(old.contents), ['7'], 'anyone\'s but the owner\'s goes after 6 game days');
  });
  it('picking it up: the owner or a key-holder, with Engineering, never while it runs, others\' output only with a yes', () => {
    const take = (body) => php(`$r = ${row}; ${body}`);
    assert.equal(take('echo json_encode(H::takeWhy($r, 9, false, true, false, 1));'), 'denied');
    assert.equal(take('echo json_encode(H::takeWhy($r, 7, true, false, false, 1));'), 'engineering');
    assert.equal(take('$r["job"] = ["user"=>9,"ready"=>10]; echo json_encode(H::takeWhy($r, 7, true, true, false, 5));'), 'running');
    assert.equal(take('$r["contents"] = ["9" => ["items" => ["fuel_cell" => 1], "at" => 0]]; echo json_encode(H::takeWhy($r, 7, true, true, false, 5));'), 'others');
    assert.equal(take('$r["contents"] = ["9" => ["items" => ["fuel_cell" => 1], "at" => 0]]; echo json_encode(H::takeWhy($r, 7, true, true, true, 5));'), null);
  });
  it('HOMES2: a room\'s walls and a Tower floor it has; only the street pays', () => {
    assert.equal(php('echo json_encode(H::placeWhy($R, [], "fuelmaker", 146, [76, 974]));'), 'edge');
    assert.equal(php('echo json_encode(H::placeWhy($R, [], "fuelmaker", 147, [76, 974]));'), null);
    const tower = (floors, place) => php(`$s = json_decode('{"systems":{"features":{"home-tower":{"built":true,"floors":${floors}},"homes":{"decor":{"wallSegments":9}}}}}'); echo json_encode(H::span($R, "${place}", $s));`);
    assert.deepEqual(tower(3, 'tower:2'), [130, 1102]);
    assert.equal(tower(3, 'tower:3'), false, 'a floor it does not have');
    assert.deepEqual(tower(3, 'house'), [76, 9 * 150 - 76]);
    assert.equal(tower(3, 'street'), null);
    assert.deepEqual(php('echo json_encode([H::placeId("tower:8"), H::placeId("tower:9"), H::placeId("house"), H::placeId("yard")]);'), [true, false, true, false]);
    const job = '["user"=>9,"key"=>"fuel_cell","qty"=>1,"need"=>1,"name"=>"Fuel Cell","at"=>0,"ready"=>1000]';
    const [, inHouse] = php(`$r = ${row}; $r["place"] = "house"; $r["job"] = ${job}; echo json_encode(H::settle($R, $r, 7, 1000));`);
    assert.equal(inHouse, null, 'a make in the house pays nobody');
    const [, onStreet] = php(`$r = ${row}; $r["place"] = "street"; $r["job"] = ${job}; echo json_encode(H::settle($R, $r, 7, 1000));`);
    assert.equal(onStreet.amount, 7);
    assert.equal(php(`$r = ${row}; $r["place"] = "tower:1"; echo json_encode(H::view($r));`).place, 'tower:1');
  });
  it('lane machines: the rooms\' places, ends and own machines; canDrop counts them; no pool; the owner\'s output goes too', () => {
    assert.deepEqual(php('echo json_encode([H::placeId("mr:meadow"), H::placeId("mr:forest"), H::placeId("mr:hall"), H::isRoom("mr:besara"), H::isRoom("street")]);'), [true, true, false, true, false]);
    assert.deepEqual(php('echo json_encode(H::roomSpan($R, "mr:forest"));'), [-700, 700]);
    assert.deepEqual(php('echo json_encode(H::roomFixed($R, "mr:forest"));'), roomFixedXs('mr:forest'));
    assert.equal(php('echo json_encode(H::placeWhy($R, [], "fuelmaker", -29, [-700, 700], H::roomFixed($R, "mr:forest")));'), 'near');
    assert.equal(php('echo json_encode(H::placeWhy($R, [], "fuelmaker", 200, [-700, 700], H::roomFixed($R, "mr:forest")));'), null);
    assert.equal(php('echo json_encode(H::placeWhy($R, [["rx" => 250]], "fuelmaker", 200, [-700, 700], H::roomFixed($R, "mr:forest")));'), 'near');
    assert.equal(php('echo json_encode(H::placeWhy($R, [], "fuelmaker", 631, [-700, 700], []));'), 'edge');
    const job = '["user"=>9,"key"=>"fuel_cell","qty"=>1,"need"=>1,"name"=>"Fuel Cell","at"=>0,"ready"=>1000]';
    const [r, paid] = php(`$r = ${row}; $r["place"] = "mr:forest"; $r["job"] = ${job}; echo json_encode(H::settle($R, $r, 7, 1000));`);
    assert.equal(paid, null, 'a room pays nobody\'s pool');
    assert.deepEqual(r.contents['9'].items, { fuel_cell: 1 });
    const [old] = php(`$r = ${row}; $r["place"] = "mr:forest"; $r["contents"] = ["9" => ["items" => ["fuel_cell" => 1], "at" => 0], "7" => ["items" => ["fuel_cell" => 1], "at" => 0]]; echo json_encode(H::settle($R, $r, 7, 7 * 14400000));`);
    assert.deepEqual(old.contents, [], 'everyone\'s goes, the owner\'s too');
    assert.equal(php(`$r = ${row}; $r["place"] = "mr:meadow"; echo json_encode(H::view($r));`).owner, 7);
    const src = readFileSync(join(SITE_DIR, 'src/HomeMachines.php'), 'utf8');
    assert.match(src, /'\/groddle\/v1\/machine-rooms\/\{room:\[a-z\]\+\}\/machines'/);
    assert.match(src, /!self::isRoom\(\$place\) && \(new Neighbours/, 'no key-holders in a room');
    assert.ok(php('echo json_encode(H::span($R, "street", null));') === null);
  });
  it('placing and refuelling as the game does', () => {
    assert.equal(php('echo json_encode(H::placeWhy($R, [["rx" => 0]], "fuelmaker", 199));'), 'near');
    assert.equal(php('echo json_encode(H::placeWhy($R, [["rx" => 0]], "fuelmaker", 200));'), null);
    assert.equal(php('echo json_encode(H::placeWhy($R, [], "still", 0));'), 'class');
    assert.deepEqual(php('echo json_encode([H::refuelFit($R, 151, 4), H::refuelFit($R, 150, 4), H::refuelFit($R, 50, 1), H::refuelFit($R, 0, 4)]);'), [0, 1, 1, 4]);
    assert.equal(php('echo json_encode(H::jobFuel($R, "blockmaker", 5, 10, ["blockmaking_save_fuel_1"]));'), jobFuel('blockmaker', 5, 10, ['blockmaking_save_fuel_1']));
  });
  it('the view shows no one\'s output, only who has some', () => {
    const v = php(`$r = ${row}; $r["contents"] = ["9" => ["items" => ["fuel_cell" => 1], "at" => 0]]; echo json_encode(H::view($r));`);
    assert.deepEqual(v.waiting, [9]);
    assert.equal(JSON.stringify(v).includes('fuel_cell'), false);
  });
  it('has its table', () => {
    const minn = JSON.parse(readFileSync(join(SITE_DIR, 'minn.json'), 'utf8'));
    const t = JSON.stringify(minn).includes('groddle_home_machines');
    assert.ok(t);
  });
});

describe('the realtime server carries it (home_machines.go)', { skip: HAS_SERVER ? false : 'no server checkout' }, () => {
  it('posts to the site\'s route', () => {
    const go = readFileSync(serverPath('home_machines.go'), 'utf8');
    assert.match(go, /ledgerRouteHomeMachines = "\/groddle\/v1\/homes\/machines"/);
    assert.match(go, /func machinePlace\(street string, owner int64\)/, 'the actor stands in the owner\'s home: the street, the house or a Tower floor');
    for (const [tsid, place] of Object.entries(MACHINE_ROOM_PLACES)) assert.match(go, new RegExp(`"${tsid}": +"${place}"`), `${place} (lane machines)`);
  });
});
