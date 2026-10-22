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
  applyWorkUnit,
  cleanTowerName,
  composeTower,
  contributeItems,
  createTowerState,
  elevatorStops,
  endExpansion,
  expandCosts,
  extraFloors,
  finishTower,
  floorJobFor,
  inTowerSpot,
  normalizeTowerState,
  projectComplete,
  projectPercent,
  projectRequirements,
  protoArtState,
  setFloorLabel,
  startExpansion,
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

describe('exterior art', () => {
  it('ships every style article and stacks one extra floor per floor above two', () => {
    for (const [id, art] of Object.entries(TOWER_ART)) {
      assert.ok(TOWER_STYLES[id], id);
      for (const part of Object.values(art.parts)) {
        if (part) assert.ok(existsSync(join(root, TOWER_ART_DIR, part[0])), part[0]);
      }
      const two = composeTower(id, 0);
      const nine = composeTower(id, 7);
      assert.equal(nine.filter((op) => op.part.startsWith('floor_') && /\d$/.test(op.part)).length, 7, id);
      // initializehead: floor_top_container.y = -(bottom_floor_h + floor_h * extra)
      const top = nine.find((op) => op.part === 'floor_top');
      assert.ok(Math.abs(top.y - art.scale[1] * -(art.bottomFloorH + art.floorH * 7)) < 1e-6, id);
      assert.equal(two.some((op) => op.part === 'deco_side'), false, 'deco_side needs an extra floor');
      assert.ok(towerBounds(nine).h > towerBounds(two).h + 400, id);
    }
    for (const f of ['proto_1.webp', 'proto_2.webp', 'proto_3.webp', 'elevator.png', 'tower_expander.png']) {
      assert.ok(existsSync(join(root, TOWER_ART_DIR, f)), f);
    }
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
