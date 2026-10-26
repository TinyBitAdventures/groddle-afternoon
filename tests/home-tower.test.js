import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';
import {
  BUILD_A_TOWER,
  RECONSTRUCTED_TOWER_SPOTS,
  TOWER_ART,
  TOWER_ART_DIR,
  TOWER_CHASSIS,
  TOWER_CONFIG,
  TOWER_GEO,
  TOWER_IMG_COST,
  TOWER_JOB,
  TOWER_JOBS,
  TOWER_MIN_LEVEL,
  TOWER_PLACEMENT_WARNING,
  TOWER_PROTO,
  TOWER_STYLES,
  ELEVATOR_MARK,
  TOWER_DOOR_DX,
  TOWER_SIGN,
  applyWorkUnit,
  flipTower,
  parseTowerFacing,
  setTowerFacing,
  towerFacingX,
  clampToExpansion,
  cleanTowerName,
  composeTower,
  contributeItems,
  createTowerState,
  elevatorMark,
  elevatorStops,
  endExpansion,
  expandCosts,
  extraFloors,
  finishTower,
  floorJobFor,
  inTowerSpot,
  normalizeTowerState,
  ownerReloadFloor,
  projectComplete,
  projectPercent,
  projectRequirements,
  protoArtState,
  setFloorLabel,
  setTowerConfig,
  setTowerStyle,
  startExpansion,
  stepConfig,
  randomTowerConfig,
  normalizeTowerConfig,
  towerConfigRows,
  TOWER_DEFAULT_CONFIG,
  TOWER_PART_CHOICES,
  TOWER_VARIANT_ART,
  towerBounds,
  towerSecretText,
  towerSpotsFor,
  workCheck,
} from '../public/js/home-tower.js';
import {
  countCultivations,
  createCultivationState,
  cultivate,
  cultivationChoices,
  cultivationCost,
  removeCultivation,
  towerItem,
} from '../public/js/home-cultivation.js';

const root = join(import.meta.dirname, '..', 'public');
const GS = join(import.meta.dirname, '..', '..', 'glitch-GameServerJS');
const haveGs = existsSync(GS);

function gsjs(rel) {
  const ctx = { log: { info() {}, error() {} } };
  vm.runInNewContext(readFileSync(join(GS, rel), 'utf8'), ctx);
  return ctx;
}

const fullGot = (jobId) => Object.fromEntries(TOWER_JOBS[jobId].requirements.map((r) => [r.id, r.num]));

describe('source constants', () => {
  it('keeps the proto, cultivation gate and config_base.js towers values', () => {
    assert.equal(TOWER_IMG_COST, 20_000);
    assert.equal(TOWER_MIN_LEVEL, 18);
    assert.deepEqual({ ...TOWER_CONFIG }, {
      START_FLOORS: 2, START_TEXTURE_FLOOR: 'starter_crappy', START_TEXTURE_CEILING: 'starter_crappy_ceiling', START_TEXTURE_WALL: 'grey_unfinished', MAX_FLOORS: 9,
    });
    assert.equal(TOWER_GEO.width, 1178);
    assert.equal(TOWER_GEO.floorHeight, 486);
    assert.match(TOWER_PLACEMENT_WARNING, /4 girders, 16 wall segments, 20 urth blocks, 200 snails/);
    assert.deepEqual({ ...BUILD_A_TOWER.rewards }, { currants: 2000, energy: 200 });
  });

  it('copies job_cult_tower and job_tower_floor_3..9 field for field', { skip: !haveGs }, () => {
    for (const id of Object.keys(TOWER_JOBS)) {
      const src = gsjs(`quests/${id}.js`);
      assert.equal(TOWER_JOBS[id].title, src.title, id);
      assert.equal(TOWER_JOBS[id].completion, src.completion, id);
      const rows = Object.entries(src.requirements).map(([rid, r]) => [rid, Number(r.bucket_id), Number(r.group_id), r.type, r.class_id, r.num, r.base_cost, r.energy, r.wear]);
      assert.deepEqual(TOWER_JOBS[id].requirements.map((r) => [r.id, r.bucket, r.group, r.type, r.classId, r.num, r.baseCost, r.energy, r.wear]), rows, id);
    }
    const proto = gsjs('items/proto_furniture_tower_chassis.js');
    assert.equal(proto.base_cost, TOWER_IMG_COST);
    assert.equal(proto.classProps.job_class_id, TOWER_JOB);
    assert.equal(Number(proto.classProps.width), 356);
  });

  it('matches the build_a_tower catalog entry', () => {
    const quests = JSON.parse(readFileSync(join(root, 'assets/content/quests.json'), 'utf8'));
    const def = quests.build_a_tower;
    assert.deepEqual(def.rewards, { currants: 2000, energy: 200 });
    assert.deepEqual(def.requirements.map((r) => r.name), [BUILD_A_TOWER.cultivateFlag, BUILD_A_TOWER.buildFlag]);
    assert.ok(def.offerTriggers.some((t) => t.npc === BUILD_A_TOWER.giver));
  });
});

describe('cultivating the Tower', () => {
  it('needs level 18, costs a flat 20,000 iMG, and is offered once', () => {
    const state = createCultivationState();
    const low = cultivationChoices(state, { level: 17, imagination: 1e6 }).find((c) => c.protoClass === TOWER_PROTO);
    assert.equal(low.reason, 'Requires level 18.');
    assert.equal(low.warning, TOWER_PLACEMENT_WARNING);
    cultivate(state, { level: 60, imagination: 1e6 }, 'proto_patch', -500);
    cultivate(state, { level: 60, imagination: 1e6 }, 'proto_dirt_pile', 1300);
    // No 1.15^n escalation for the Tower.
    assert.equal(cultivationCost(state, TOWER_PROTO), 20_000);
    const pc = { level: 19, imagination: 20_000 };
    const res = cultivate(state, pc, TOWER_PROTO, 700);
    assert.equal(res.ok, true);
    assert.equal(res.item.endClass, TOWER_PROTO);
    assert.equal(pc.imagination, 0);
    assert.equal(cultivationChoices(state, { level: 60, imagination: 1e6 }).some((c) => c.protoClass === TOWER_PROTO), false);
    assert.equal(cultivate(state, { level: 60, imagination: 1e6 }, TOWER_PROTO, -900).ok, false);
  });

  it('counts the proto for other prices but not the built Tower, which cannot be removed', () => {
    const state = createCultivationState();
    cultivate(state, { level: 60, imagination: 1e6 }, TOWER_PROTO, 700);
    assert.equal(countCultivations(state), 1);
    assert.equal(cultivationCost(state, 'proto_patch'), Math.round(1.15 * 400));
    towerItem(state).endClass = TOWER_CHASSIS;
    assert.equal(countCultivations(state), 0);
    assert.equal(cultivationCost(state, 'proto_patch'), 400);
    assert.equal(removeCultivation(state, towerItem(state).id).reason, 'built');
  });
});

describe('the Tower project', () => {
  it('gates work behind each bucket\'s first group (quest.js getCurrentReqGroup)', () => {
    const got = {};
    const rows = projectRequirements(TOWER_JOB, got);
    assert.deepEqual(rows.filter((r) => r.open).map((r) => r.id), ['r1701', 'r1703', 'r1704', 'r1700', 'r1702']);
    const inv = { grade_aa_earth_block: 20, general_building_permit: 1, snail: 200 };
    for (const cls of Object.keys(inv)) assert.equal(contributeItems(TOWER_JOB, got, cls, 999, inv).ok, true);
    assert.equal(inv.snail, 0);
    const open = projectRequirements(TOWER_JOB, got).filter((r) => r.open).map((r) => r.id);
    assert.ok(open.includes('r1814'), 'break ground opens');
    assert.ok(!open.includes('r1705'), 'construct waits for girders and walls');
  });

  it('weights progress by base cost and swaps scaffolding at 1/3 and 2/3', () => {
    const got = { r1702: 16 }; // 16 x 2500 of the job's 52,920
    const total = TOWER_JOBS[TOWER_JOB].requirements.reduce((s, r) => s + r.num * r.baseCost, 0);
    assert.equal(total, 52_920);
    assert.equal(projectPercent(TOWER_JOB, got), Math.floor((40_000 / total) * 1000) / 1000);
    assert.equal(protoArtState(0), 1);
    assert.equal(protoArtState(0.333), 2);
    assert.equal(protoArtState(0.665), 2);
    assert.equal(protoArtState(0.666), 3);
  });

  it('works one unit at a time with energy, a working tool, and wear', () => {
    const got = { r1701: 20, r1703: 1, r1704: 200 };
    const ctx = { inv: {}, energy: 100 };
    assert.match(workCheck(TOWER_JOB, got, 'r1814', ctx).msg, /shovel/);
    ctx.inv.ace_of_spades = 1;
    assert.equal(workCheck(TOWER_JOB, got, 'r1814', ctx).tool, 'ace_of_spades');
    assert.equal(workCheck(TOWER_JOB, got, 'r1814', { ...ctx, energy: 25 }).ok, false);
    const pc = { energy: 50 };
    const wear = [];
    const res = applyWorkUnit(TOWER_JOB, got, 'r1814', { inv: ctx.inv, pc, useTool: (t, w) => wear.push([t, w]) });
    assert.equal(res.ok, true);
    assert.equal(pc.energy, 25);
    assert.deepEqual(wear, [['ace_of_spades', 2]]);
    assert.equal(got.r1814, 1);
    assert.equal(applyWorkUnit(TOWER_JOB, got, 'r1814', { inv: ctx.inv, pc }).ok, false, 'stops at energy <= unit cost');
  });

  it('builds a two-floor Tower, then adds floors up to nine', () => {
    const tower = createTowerState();
    assert.equal(finishTower(tower).reason, 'incomplete');
    tower.project = fullGot(TOWER_JOB);
    assert.equal(projectComplete(TOWER_JOB, tower.project), true);
    assert.equal(finishTower(tower).floors, 2);
    assert.equal(extraFloors(tower), 0);
    assert.equal(floorJobFor(tower.floors), 'job_tower_floor_3');
    assert.deepEqual(expandCosts(tower).items, { wall_segment: 8, grade_aa_earth_block: 40, girder: 8, snail: 24, beam: 4, metal_post: 8, string: 53, general_building_permit: 1 });
    assert.equal(startExpansion(tower).ok, 1);
    assert.equal(startExpansion(tower).error, 'already_building');
    assert.equal(elevatorStops(tower).at(-1).construction, true);
    assert.equal(endExpansion(tower).ok, false);
    while (tower.floors < 9) {
      if (!tower.expanding) startExpansion(tower);
      tower.expansion = fullGot(floorJobFor(tower.floors));
      endExpansion(tower);
    }
    assert.equal(tower.floors, 9);
    assert.equal(extraFloors(tower), 7);
    assert.equal(startExpansion(tower).error, 'max_size_already');
    assert.equal(expandCosts(tower).count, 0);
  });

  it('names the tower and its floors with the client regex, 25 characters', () => {
    // substr(0, 25) first, then the character filter.
    assert.equal(cleanTowerName('My <Lovely> Tower!! of 2012 and more'), 'My Lovely Tower!! of 20');
    const tower = normalizeTowerState({ built: true, floors: 3 });
    assert.equal(setFloorLabel(tower, 1, 'Library').ok, 1);
    assert.equal(elevatorStops(tower)[1].label, 'Library');
    assert.equal(setFloorLabel(tower, 5, 'x').error, 'bad_connect_id');
  });

  it('normalizes hostile saves', () => {
    const t = normalizeTowerState({ built: true, floors: 99, expanding: true, style: 'castle', floor: 40, project: { r1701: 9 }, secrets: ['TowerSpot_01', 'nope', 'TowerSpot_01'] });
    assert.equal(t.floors, 9);
    assert.equal(t.expanding, false);
    assert.equal(t.style, 'base');
    assert.equal(t.floor, null);
    assert.deepEqual(t.project, {});
    assert.deepEqual(t.secrets, ['TowerSpot_01']);
    const p = normalizeTowerState({ project: { r1701: 999, r9999: 3 } });
    assert.deepEqual(p.project, { r1701: 20 });
  });
});

describe('inside the Tower (locations/tower.js, the archived cutaways)', () => {
  /** locations/tower.js run with a stand-in location: cfg, geo config and players. */
  function towerJs(cfg) {
    const ctx = { log: { info() {}, error() {} }, config: { towers: { START_FLOORS: 2, MAX_FLOORS: 9 } }, choose_one: (a) => a[0] };
    vm.runInNewContext(readFileSync(join(GS, 'locations/tower.js'), 'utf8'), ctx);
    const self = { cfg: { floor_labels: {}, ...cfg }, tower_init() {} };
    for (const k of ['tower_get_geo_config', 'tower_get_bounds', 'tower_get_teleport_point', 'tower_get_reload_position', 'tower_move_players', 'tower_build_expansion']) self[k] = ctx[k];
    return self;
  }

  it('marks the elevator L, 1, 2 ... and names floors after the marks', () => {
    assert.deepEqual([0, 1, 2, 8].map(elevatorMark), ['L', '1', '2', '8']);
    const tower = normalizeTowerState({ built: true, floors: 3, expanding: true });
    const stops = elevatorStops(tower);
    assert.deepEqual(stops.map((s) => [s.mark, s.label, s.construction]), [
      ['L', 'Ground Floor', false], ['1', 'Floor 1', false], ['2', 'Floor 2', false], ['3', 'Under Construction', true],
    ]);
    // Measured on the cutaways: over the call buttons of signpost_asset_elevator_tower (180 x 514 at x 90).
    assert.ok(ELEVATOR_MARK.x > 60 && ELEVATOR_MARK.x < 95);
    assert.ok(ELEVATOR_MARK.footAboveBound > 157, 'above the call-button plate');
  });

  it('stacks 486 px floors under a 28 px roof frame, as the archived cutaways measure', () => {
    // The 64 cutaways are 720 px renders of the location (tower_reset_geometry: 1,177 px wide);
    // their heights are 612, 909, 1206, 1504, 1801, 2098 and 2693 px: 2 to 9 rows (7 = 6 + construction).
    const px = (rows) => Math.round((rows * TOWER_GEO.floorHeight + TOWER_GEO.frameHeight) * (720 / (TOWER_GEO.width - 1)));
    assert.deepEqual([2, 3, 4, 5, 6, 7, 9].map(px), [612, 909, 1206, 1504, 1801, 2098, 2693]);
  });

  it('walks the construction floor only from 130 to 290 and puts the Workbench at 340', { skip: !haveGs }, () => {
    const self = towerJs({ floors: 3, is_expanding: true });
    const bounds = self.tower_get_bounds();
    const built = self.tower_build_expansion(bounds);
    const floor = built.plats[0];
    assert.deepEqual([floor.start.x, floor.end.x], [TOWER_GEO.expansionLeft, TOWER_GEO.expansionRight]);
    assert.equal(bounds.expansion.job.x, TOWER_GEO.workbenchX);
    assert.equal(clampToExpansion(900), TOWER_GEO.expansionRight - 12);
    assert.equal(clampToExpansion(0), TOWER_GEO.expansionLeft + 12);
    assert.equal(clampToExpansion(200), 200);
    // tower_reset_geometry: geo.physics.y_cam_offset = 220.
    assert.match(readFileSync(join(GS, 'locations/tower.js'), 'utf8'), new RegExp(`y_cam_offset = ${TOWER_GEO.yCamOffset};`));
  });

  it('reloads the owner on the top row after starting or finishing a floor (tower_move_players)', { skip: !haveGs }, () => {
    for (const [floors, expanding] of [[2, false], [2, true], [3, false], [5, true], [9, false]]) {
      const self = towerJs({ floors, is_expanding: expanding });
      const bounds = self.tower_get_bounds();
      let landed = null;
      self.owner = { tsid: 'P1' };
      self.players = { P1: { tsid: 'P1', reloadGeometry: (x, y) => { landed = { x, y }; } } };
      self.tower_move_players('misc');
      // Which row the source put the owner on: the ground floor's teleport point, or a row's elevator connect.
      const rows = [...bounds.floors.map((f) => f.b - 70), ...(expanding ? [bounds.expansion.b - 70] : [])];
      const row = landed.x === 200 ? rows.indexOf(landed.y) : 0;
      const tower = normalizeTowerState({ built: true, floors, expanding });
      assert.equal(ownerReloadFloor(tower), row, `${floors} floors${expanding ? ' + construction' : ''}`);
    }
  });
});

describe('exterior art', () => {
  it('ships every style article and stacks one extra floor per floor above two', () => {
    for (const [id, art] of Object.entries(TOWER_ART)) {
      assert.ok(TOWER_STYLES[id], id);
      const two = composeTower(id, 0);
      const nine = composeTower(id, 7);
      assert.equal(nine.filter((op) => op.part.startsWith('floor_') && /\d$/.test(op.part)).length, 7, id);
      // initializehead: floor_top_container.y = -(bottom_floor_h + floor_h * extra)
      const top = nine.find((op) => op.part === 'floor_top');
      assert.ok(Math.abs(top.y - art.scale[1] * -(art.bottomFloorH + art.floorH * 7)) < 1e-6, id);
      assert.equal(two.some((op) => op.part === 'deco_side'), false, 'deco_side needs an extra floor');
      assert.ok(towerBounds(nine).h > towerBounds(two).h + 400, id);
    }
    for (const f of ['proto_1.webp', 'proto_2.webp', 'proto_3.webp', 'tower_expander.png']) {
      assert.ok(existsSync(join(root, TOWER_ART_DIR, f)), f);
    }
    // G316: elevator.png had no traced source and nothing drew it.
    assert.ok(!existsSync(join(root, TOWER_ART_DIR, 'elevator.png')));
  });

  it('ships every choice the client offered, one WebP per drawn article', () => {
    let files = 0;
    for (const id of Object.keys(TOWER_STYLES)) {
      const counts = TOWER_PART_CHOICES[id];
      const art = TOWER_VARIANT_ART[id];
      for (const part of ['floor_ground', 'floor_top', 'extra_floor', 'deco_ground', 'deco_side']) {
        assert.equal(art[part].length, counts[part], `${id} ${part}`);
        for (const row of art[part]) {
          if (!row) continue;
          files += 1;
          assert.match(row[0], /\.webp$/);
          assert.ok(existsSync(join(root, TOWER_ART_DIR, row[0])), row[0]);
        }
      }
      // door_<n> are the invisible hit areas of floor_ground_<n>
      assert.equal(art.door.length, counts.floor_ground, `${id} doors`);
      assert.ok(art.door.every((d) => d === null), `${id} doors draw nothing`);
      // every floor and top choice draws something; each deco list has one "none" choice
      for (const part of ['floor_ground', 'floor_top', 'extra_floor']) assert.ok(art[part].every(Boolean), `${id} ${part}`);
      for (const part of ['deco_ground', 'deco_side']) assert.equal(art[part].filter((r) => !r).length, 1, `${id} ${part} none`);
    }
    assert.equal(files, 165);
  });

  it('offers the choice counts of each chassis .as config_options', { skip: !existsSync(join(GS, '..', 'glitch-items')) }, () => {
    const items = join(GS, '..', 'glitch-items', 'furniture');
    const as = {
      base: 'furniture_base/furniture_tower_chassis/furniture_tower_chassis.as',
      tree: 'furniture_tower_chassis/furniture_tower_chassis_tree_tower.as',
      quarry: 'furniture_tower_chassis/furniture_tower_chassis_rock_tower.as',
      mushroom: 'furniture_tower_chassis/furniture_tower_chassis_mushroom_tower.as',
      spaceship: 'furniture_tower_chassis/furniture_tower_chassis_spaceship_tower.as',
      adobe: 'furniture_tower_chassis/furniture_tower_chassis_basic_tower.as',
    };
    for (const [id, rel] of Object.entries(as)) {
      const src = readFileSync(join(items, rel), 'utf8').replace(/\s+/g, ' ');
      const block = /config_options = \{([^}]*)\}/.exec(src)[1];
      const n = (k) => new RegExp(`${k}: \\[([^\\]]*)\\]`).exec(block)[1].split(',').length;
      assert.deepEqual({ ...TOWER_PART_CHOICES[id] }, {
        floor_ground: n('floor_ground'), floor_top: n('floor_top'), extra_floor: n('floor_1'),
        deco_ground: n('deco_ground'), deco_side: n('deco_side'),
      }, id);
      for (let f = 2; f <= 7; f += 1) assert.equal(n(`floor_${f}`), n('floor_1'), `${id} floor_${f}`);
    }
  });

  it('starts each style from its catalog config and keeps choices in range', () => {
    // catalog_furniture.js add_furniture_29 over getDefaultUpgradeConfig (all '1')
    assert.equal(normalizeTowerConfig('base').floor_top, 1);
    assert.equal(normalizeTowerConfig('quarry').floor_top, 3);
    assert.equal(normalizeTowerConfig('mushroom').deco_ground, 2);
    assert.equal(normalizeTowerConfig('spaceship').deco_side, 2);
    assert.equal(normalizeTowerConfig('adobe').floor_top, 2);
    for (const [id, def] of Object.entries(TOWER_DEFAULT_CONFIG)) {
      for (const [k, v] of Object.entries(def)) assert.ok(v <= TOWER_PART_CHOICES[id][k], `${id} ${k}`);
    }
    const cfg = normalizeTowerConfig('adobe', { floor_top: 9, floor_1: 4, floor_2: 0, deco_side: 'x', floor_ground: 3 });
    assert.equal(cfg.floor_top, 2, 'out of range falls back to the default');
    assert.equal(cfg.floor_1, 4);
    assert.equal(cfg.floor_2, 1);
    assert.equal(cfg.floor_ground, 3);
    // saved with the tower, and a new style starts from its own config
    const t = normalizeTowerState({ built: true, floors: 5, style: 'base', config: { floor_top: 6, floor_1: 8 } });
    assert.equal(t.config.floor_top, 6);
    assert.equal(normalizeTowerState(JSON.parse(JSON.stringify(t))).config.floor_1, 8);
    setTowerConfig(t, { ...t.config, deco_ground: 4 });
    assert.equal(t.config.deco_ground, 4);
    setTowerStyle(t, 'base');
    assert.equal(t.config.floor_top, 6, 'same style keeps the choices');
    setTowerStyle(t, 'quarry');
    assert.deepEqual(t.config, normalizeTowerConfig('quarry'));
    assert.equal(setTowerStyle(t, 'castle'), false);
  });

  it('lists the client rows: top, the floors the Tower has, ground, decos', () => {
    // config_option_names_sort; floor_N past extra_floors and deco_side under 1 extra floor are excluded
    assert.deepEqual(towerConfigRows('base', 0).map((r) => r.key), ['floor_top', 'floor_ground', 'deco_ground']);
    assert.deepEqual(towerConfigRows('base', 2).map((r) => r.key), ['floor_top', 'floor_2', 'floor_1', 'floor_ground', 'deco_ground', 'deco_side']);
    assert.deepEqual(towerConfigRows('tree', 7).map((r) => r.label), ['Top Floor', '7th Floor', '6th Floor', '5th Floor', '4th Floor', '3rd Floor', '2nd Floor', '1st Floor', 'Ground Floor', 'Ground Floor Deco', 'Side Deco']);
    assert.equal(towerConfigRows('tree', 7)[1].choices, 14);
    // ConfiggerChoiceElementUI: < > wrap around
    const cfg = normalizeTowerConfig('spaceship');
    assert.equal(stepConfig('spaceship', cfg, 'floor_ground', -1).floor_ground, 3);
    assert.equal(stepConfig('spaceship', { ...cfg, floor_ground: 3 }, 'floor_ground', 1).floor_ground, 1);
    let seed = 0;
    const r = randomTowerConfig('tree', () => ((seed = (seed * 9301 + 49297) % 233280) / 233280));
    assert.deepEqual(r, normalizeTowerConfig('tree', r));
  });

  it('draws the chosen articles: the ground floor, each extra floor, the top and decos', () => {
    const ops = composeTower('base', 2, { floor_ground: 6, floor_1: 8, floor_2: 7, floor_top: 6, deco_ground: 3, deco_side: 2 });
    const file = (part) => ops.find((op) => op.part === part)?.file;
    assert.equal(file('floor_ground'), 'base_floor_ground_6.webp');
    assert.equal(file('floor_1'), 'base_extra_floor_8.webp');
    assert.equal(file('floor_2'), 'base_extra_floor_7.webp');
    assert.equal(file('floor_top'), 'base_floor_top_6.webp');
    assert.equal(file('deco_ground'), 'base_deco_ground_3.webp');
    assert.equal(file('deco_side'), 'base_deco_side_2.webp');
    assert.equal(file('door'), undefined);
    // base deco 1 is the empty "none" symbol
    assert.equal(composeTower('base', 2).some((op) => op.part.startsWith('deco_')), false);
  });
});

describe('Flip (facing_right)', () => {
  const CLIENT = join(import.meta.dirname, '..', '..', 'glitch-client', 'com', 'tinyspeck', 'engine');
  const haveClient = existsSync(CLIENT);
  const featureSrc = readFileSync(join(root, 'js/features/home-tower-feature.js'), 'utf8');

  it('faces right by default and migrates saves from before Flip unflipped', () => {
    assert.equal(createTowerState().facingRight, true);
    // a save written before Flip existed has no facing at all
    const old = normalizeTowerState({ built: true, floors: 4, style: 'tree', config: { floor_top: 3 } });
    assert.equal(old.facingRight, true);
    assert.equal(old.config.floor_top, 3);
    assert.equal(normalizeTowerState({ built: true, facingRight: false }).facingRight, false);
    assert.equal(normalizeTowerState({ built: true, facingRight: 'junk' }).facingRight, true);
  });

  it('flips, saves with the Tower and survives a style change and Randomize', () => {
    const t = normalizeTowerState({ built: true, floors: 5, style: 'spaceship' });
    assert.equal(flipTower(t), false);
    const saved = normalizeTowerState(JSON.parse(JSON.stringify(t)));
    assert.equal(saved.facingRight, false);
    // FurnUpgradeController keeps dm.user_facing_right across a chassis change
    setTowerStyle(saved, 'tree');
    assert.equal(saved.facingRight, false);
    setTowerConfig(saved, randomTowerConfig('tree', () => 0.5));
    assert.equal(saved.facingRight, false);
    assert.equal(flipTower(saved), true);
    assert.equal(setTowerFacing(saved, false), false);
  });

  it('reads the QA and save forms of facing_right', () => {
    for (const v of [true, 1, '1', 'right', 'RIGHT']) assert.equal(parseTowerFacing(v), true, String(v));
    for (const v of [false, 0, '0', 'left']) assert.equal(parseTowerFacing(v), false, String(v));
    for (const v of [undefined, null, '', 'up', 2, Number.NaN]) assert.equal(parseTowerFacing(v), null, String(v));
  });

  it('mirrors every article about the foot, and its bounds with it', () => {
    for (const style of Object.keys(TOWER_STYLES)) {
      const cfg = normalizeTowerConfig(style, { deco_ground: 2, deco_side: 2 });
      const right = composeTower(style, 4, cfg);
      const left = composeTower(style, 4, cfg, false);
      assert.equal(left.length, right.length, style);
      right.forEach((op, i) => {
        assert.equal(left[i].file, op.file);
        assert.equal(left[i].x, -op.x, `${style} ${op.part} x`);
        assert.equal(left[i].scaleX, -op.scaleX, `${style} ${op.part} scaleX`);
        assert.equal(left[i].y, op.y);
        assert.equal(left[i].scaleY, op.scaleY);
      });
      const br = towerBounds(right);
      const bl = towerBounds(left);
      assert.ok(Math.abs(bl.l + br.r) < 1e-9 && Math.abs(bl.r + br.l) < 1e-9, `${style} bounds mirror`);
      assert.equal(bl.t, br.t);
    }
    // the Tree Tower is lopsided: flipping moves its mass to the other side
    const tree = towerBounds(composeTower('tree', 3));
    assert.notEqual(Math.round(tree.l), Math.round(-tree.r));
  });

  it('mirrors the sign and the step-out spot, not the sign text', () => {
    assert.deepEqual({ ...TOWER_SIGN }, { dx: 8, dy: -150 });
    assert.equal(towerFacingX(TOWER_SIGN.dx, true), 8);
    assert.equal(towerFacingX(TOWER_SIGN.dx, false), -8);
    assert.equal(towerFacingX(TOWER_DOOR_DX, false), -TOWER_DOOR_DX);
    // the sign is a sibling of the chassis container, so only its x changes
    assert.match(featureSrc, /sign\.x = towerFacingX\(TOWER_SIGN\.dx, tower\.facingRight\)/);
    assert.match(featureSrc, /arrivalX = Number\.isFinite\(x\) \? x \+ towerFacingX\(TOWER_DOOR_DX, tower\.facingRight\)/);
  });

  it('puts Flip before Randomize under the part rows, and a flip verb before customize', () => {
    const flipAt = featureSrc.indexOf("iconButton('Flip'");
    const randomAt = featureSrc.indexOf("iconButton('Randomize'");
    const rowsAt = featureSrc.indexOf('towerConfigRows(tower.style, extraFloors(tower))');
    const nameAt = featureSrc.indexOf("'Name your Tower");
    assert.ok(rowsAt > 0 && rowsAt < flipAt && flipAt < randomAt && randomAt < nameAt);
    const verbs = /case TOWER_CHASSIS:\s*return \[([\s\S]*?)\];/.exec(featureSrc)[1];
    assert.deepEqual([...verbs.matchAll(/id: '(\w+)'/g)].map((m) => m[1]), ['enter', 'flip', 'customize']);
    assert.match(verbs, /label: 'flip'[^}]*tooltip: 'Turn it around'/);
  });

  it('matches the client and GSJS sources', { skip: !haveClient || !haveGs }, () => {
    const cfg = readFileSync(join(CLIENT, 'data/itemstack/FurnitureConfig.as'), 'utf8');
    assert.match(cfg, /public var facing_right:Boolean = true;/);
    const ui = readFileSync(join(CLIENT, 'view/ui/decorate/ConfiggerChoiceElementUI.as'), 'utf8');
    assert.match(ui, /name: 'flip',\s*label: 'Flip'/);
    assert.match(ui, /randomize_bt\.x = int\(flip_bt\.width \+ 10\)/);
    const configger = readFileSync(join(CLIENT, 'view/ui/ConfiggerUI.as'), 'utf8');
    assert.ok(configger.indexOf('//handle the options') < configger.indexOf('//toss in the flip'));
    assert.ok(configger.indexOf('//toss in the flip') < configger.indexOf('//toss in the namer'));
    const chassis = readFileSync(join(GS, 'items/furniture_tower_chassis.js'), 'utf8');
    assert.match(chassis, /this\.instanceProps\.facing_right = "1";/);
    assert.match(chassis, /"can_flip"\s*: "1"/);
    assert.match(chassis, /verbs\.flip = \{[\s\S]*?"sort_on"\s*: 51,\s*"tooltip"\s*: "Turn it around"/);
    assert.match(chassis, /delta_x: 8,\s*delta_y: -120/);
    assert.match(chassis, /delta_y: scaffolding_sd\.delta_y-30/);
  });
});

describe('Jethimadh Tower Base secrets', () => {
  const BASE = ['GIF1QBNPP7123J0', 'GIF1Q3IQM7122SP', 'GIF1Q48RM712F87', 'GTJ10K7P3812R8F', 'GTJ10M515812V0C', 'GTJ110817812KO4'];
  const street = (tsid) => JSON.parse(readFileSync(join(root, 'assets/streets', `${tsid}.json`), 'utf8'));

  it('finds all eleven spots: seven archived in the corridors, four in the rebuilt rooms', () => {
    const ROOMS = ['GIF1G7Q75312T8B', 'GIF102JCHL027DO'];
    const corridors = BASE.flatMap((tsid) => towerSpotsFor(street(tsid)));
    const rooms = ROOMS.flatMap((tsid) => towerSpotsFor(street(tsid)));
    const ids = [...corridors, ...rooms].map((b) => b.id).sort();
    assert.deepEqual(ids, Array.from({ length: 11 }, (_, i) => `TowerSpot_${String(i + 1).padStart(2, '0')}`));
    assert.equal(corridors.length, 7);
    assert.ok(corridors.every((b) => b.source === 'archive'));
    assert.deepEqual(rooms.map((b) => `${b.id}:${b.source}`), ['TowerSpot_05:reconstructed', 'TowerSpot_09:reconstructed', 'TowerSpot_10:reconstructed', 'TowerSpot_11:reconstructed']);
  });

  it('puts each reconstructed spot over a walkable floor inside its room', () => {
    assert.deepEqual(RECONSTRUCTED_TOWER_SPOTS.map((s) => `${s.id}@${s.tsid}`), [
      'TowerSpot_05@GIF1G7Q75312T8B', 'TowerSpot_09@GIF102JCHL027DO', 'TowerSpot_10@GIF102JCHL027DO', 'TowerSpot_11@GIF102JCHL027DO',
    ]);
    for (const spot of RECONSTRUCTED_TOWER_SPOTS) {
      const s = street(spot.tsid);
      const box = towerSpotsFor(s).find((b) => b.id === spot.id);
      assert.equal(box.x, spot.wx - s.bounds.l);
      assert.equal(box.y, spot.wy - s.bounds.t);
      // A floor (pc_perm -1) under the box centre whose standing feet are inside the box.
      const yAt = (p) => p.y1 + ((spot.wx - p.x1) / (p.x2 - p.x1 || 1)) * (p.y2 - p.y1);
      const floors = s.platforms
        .filter((p) => p.pc_perm === -1 && spot.wx >= Math.min(p.x1, p.x2) && spot.wx <= Math.max(p.x1, p.x2))
        .map(yAt)
        .filter((y) => inTowerSpot(box, box.x, y - s.bounds.t));
      assert.ok(floors.length, `${spot.id} has no floor inside its box`);
    }
  });

  it('collides with the avatar box, so a box floating above the floor still counts', () => {
    const s = street('GIF1Q3IQM7122SP');
    const box = towerSpotsFor(s).find((b) => b.id === 'TowerSpot_02');
    // The avatar stands on the floor 30 px under this box's bottom edge.
    assert.equal(inTowerSpot(box, box.x, box.y + 30), true);
    assert.equal(inTowerSpot(box, box.x + 150, box.y + 30), false);
    assert.equal(inTowerSpot(box, box.x, box.y + 140), false);
  });

  it('uses the overlay text until the eleventh', () => {
    assert.equal(towerSecretText(3), 'You have found the third of eleven secret spots in the Base of Jethimadh Tower. Nice Work!');
    assert.equal(towerSecretText(11), '');
  });
});
