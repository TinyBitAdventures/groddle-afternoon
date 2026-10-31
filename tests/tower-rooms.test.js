/**
 * Jethimadh Tower Base: the rebuilt Room 15 and Ventilation Room
 * (js/tower-rooms.js, tools/build-tower-rooms.mjs, features/tower-rooms-feature.js).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertStreetGeometry, platformsScreen } from '../public/js/street-model.js?v=23b926e5';
import {
  ROOM_15_TSID,
  STEPS_PROFILE,
  TOWER_ROOMS,
  TOWER_ROOM_DOOR_LINKS,
  TOWER_ROOM_SPOTS,
  VENT,
  VENT_ROOM_TSID,
  towerRoomByTsid,
  towerRoomStreet,
  turned,
} from '../public/js/tower-rooms.js?v=7b2aa06a';
import { inTowerSpot, towerSpotsFor } from '../public/js/home-tower.js?v=6ccb3a4f';
import { restockGarden, towerRoomsFeature } from '../public/js/features/tower-rooms-feature.js?v=884946b3';
import {
  ALL_TOWER_ROOMS,
  CHALLENGE_ROOMS,
  CHALLENGE_ROOM_DOOR_LINKS,
  ROOM_16_TSID,
  ROOM_4_DRINKS,
  ROOM_4_SHELVES,
  ROOM_4_TSID,
  ROOM_8_TSID,
  TOWER_ROOM_16_ART_ROOT,
  TOWER_ROOM_4_ART_ROOT,
  anyTowerRoomByTsid,
  anyTowerRoomStreet,
  flats,
} from '../public/js/tower-challenge-rooms.js?v=9e39f503';
import { ladderTopDeck } from '../public/js/street-model.js?v=23b926e5';

const spike = join(dirname(fileURLToPath(import.meta.url)), '..');
const streets = join(spike, 'public/assets/streets');
const street = (tsid) => JSON.parse(readFileSync(join(streets, `${tsid}.json`), 'utf8'));
const room15 = towerRoomByTsid(ROOM_15_TSID);
const vent = towerRoomByTsid(VENT_ROOM_TSID);

/** Plain jump in remake units (game.js): vy -9.6 px/frame, gravity 0.42, walk 4.4. */
const JUMP = { vy: 9.6, g: 0.42, vx: 4.4 };
const apex = (k = 1, g = 1) => (JUMP.vy * k) ** 2 / (2 * JUMP.g * g);
/** Horizontal reach of a running jump that lands `rise` px higher (negative: lower). */
function reach(rise, { jump = 1, gravity = 1, speed = 1 } = {}) {
  const v = JUMP.vy * jump;
  const g = JUMP.g * gravity;
  const disc = v * v - 2 * g * rise;
  if (disc < 0) return -1;
  return ((v + Math.sqrt(disc)) / g) * JUMP.vx * speed;
}
const SPINACH = { jump: 1.5, gravity: 0.35 / 0.42, speed: 1.7 }; // buffs.js high_jumper

/** The top of the floor under x within a platform list (world), nearest to y. */
function floorAt(platforms, x, y) {
  let best = null;
  for (const p of platforms) {
    if (p.pc_perm !== -1) continue;
    const x1 = Math.min(p.x1, p.x2);
    const x2 = Math.max(p.x1, p.x2);
    if (x < x1 || x > x2) continue;
    const py = x2 === x1 ? p.y1 : p.y1 + ((x - p.x1) / (p.x2 - p.x1)) * (p.y2 - p.y1);
    if (best == null || Math.abs(py - y) < Math.abs(best - y)) best = py;
  }
  return best;
}

describe('rebuilt tower rooms: street data', () => {
  it('are written, indexed and current (tools/build-tower-rooms.mjs --check)', () => {
    const out = execFileSync(process.execPath, [join(spike, 'tools/build-tower-rooms.mjs'), '--check'], { encoding: 'utf8' });
    assert.match(out, /stale: nothing/);
    const index = JSON.parse(readFileSync(join(streets, 'index.json'), 'utf8')).streets;
    for (const room of TOWER_ROOMS) {
      const row = index[room.tsid];
      assert.equal(row.label, room.label);
      assert.equal(row.hubId, '77');
      assert.equal(row.reconstructed, true);
      const s = street(room.tsid);
      assertStreetGeometry(s);
      assert.match(s.source, /^reconstruction/);
      assert.equal(s.tsid, room.tsid);
    }
    assert.equal(index[ROOM_15_TSID].label, 'Room 15');
    assert.equal(index[VENT_ROOM_TSID].label, 'Ventilation Room');
  });

  const mapsFile = join(spike, '../glitch-GameServerJS/inc_data_maps_prod.js');
  it('keep the hub 77 names from inc_data_maps_prod.js', { skip: !existsSync(mapsFile) && 'GSJS checkout not beside this worktree' }, () => {
    const maps = readFileSync(mapsFile, 'utf8');
    assert.match(maps, /"LIF102JCHL027DO"\s*:\s*"Ventilation Room"/);
    assert.match(maps, /"LIF1G7Q75312T8B"\s*:\s*"Room 15"/);
    assert.equal(room15.sourceTsid, 'LIF1G7Q75312T8B');
    assert.equal(vent.sourceTsid, 'LIF102JCHL027DO');
  });

  it('use only the corridors\' own art (and, in the Ventilation Room, the firebog.swf pieces of its Snap), all of it on disk', () => {
    const manifest = new Set(JSON.parse(readFileSync(join(spike, 'public/assets/decos/manifest.json'), 'utf8')));
    const corridorArt = new Set(['jethimadh_int_bg_left', 'jethimadh_int_bg_center', 'jethimadh_int_bg_right', 'jethimadh_int_bg_shadow_50percent', 'jethimadh_int_steps_1', 'jethimadh_int_lantern_1', 'jethimadh_int_pillar_1', 'jethimadh_int_pillar_1_mod', 'jethimadh_int_door_sign', 'firebog_sign_blank', 'jethimadh_frame_cap', 'jethimadh_frame_wall']);
    // G110: the Ventilation Room Snap's hanging plank, thorny ropes, glowing bushes and beaded roots.
    const ventSnapArt = new Set(['firebog_sign_blank_plank', 'vine_rope', 'underground_bogwillow', 'underground_bogwillow_1', 'hanging_braches1', 'hanging_braches2']);
    for (const room of TOWER_ROOMS) {
      const s = street(room.tsid);
      for (const layer of s.layers) {
        for (const d of layer.decos) {
          assert.ok(corridorArt.has(d.sprite) || (room.tsid === VENT_ROOM_TSID && ventSnapArt.has(d.sprite)), `${room.label}: ${d.sprite}`);
          assert.ok(manifest.has(d.sprite), d.sprite);
        }
      }
      for (const door of s.doors) assert.ok(existsSync(join(spike, 'public/assets/decos/groddle', `${door.sprite}.webp`)), door.sprite);
    }
  });

  it('dresses the Ventilation Room like its Snap: dark plank walls, a lantern over each door, the rope-hung Way Out planks, bushes and roots (G110)', () => {
    const s = street(VENT_ROOM_TSID);
    const bg = s.layers.find((l) => l.name === 'BG');
    assert.equal(bg.z, -1);
    assert.deepEqual(bg.filters, { tintColor: 0, tintAmount: 62 });
    assert.ok(bg.decos.every((d) => /^jethimadh_int_bg_/.test(d.sprite)), 'only the wood backdrops are dimmed');
    const mg = s.layers.find((l) => l.id === 'middleground').decos;
    const fg = s.layers.find((l) => l.name === 'FG').decos;
    // The plaques are gone: each door has a plank on two ropes, its text, to its left and over your head.
    assert.ok(!mg.some((d) => d.sprite === 'jethimadh_int_door_sign'));
    const planks = mg.filter((d) => d.sprite === 'firebog_sign_blank_plank');
    assert.deepEqual(planks.map((d) => d.signText), ['Way Out', 'Way Out', 'Tower St South']);
    for (const [i, door] of vent.doors.entries()) {
      const p = planks[i];
      assert.ok(p.x < door.x && door.x - p.x < 250, `${door.id} plank to the left`);
      assert.ok(door.y - p.y >= 140, `${door.id} plank clear over the head`);
      assert.equal(mg.filter((d) => d.sprite === 'vine_rope' && Math.abs(d.x - p.x) < p.w / 2 && p.y - d.y > 0 && p.y - d.y < p.h && d.r === 0).length, 2, `${door.id} plank ropes`);
      // A lantern (screen space in FG) right over the door.
      assert.ok(fg.some((d) => d.sprite === 'jethimadh_int_lantern_1' && Math.abs(d.x + s.bounds.l - door.x) < 2 && Math.abs(d.y + s.bounds.t - door.y) < 80), `${door.id} lantern`);
    }
    assert.ok(mg.filter((d) => d.sprite === 'underground_bogwillow').length >= 3);
    assert.ok(mg.filter((d) => /^hanging_braches/.test(d.sprite)).length >= 6);
  });

  it('turns decos about their bottom-centre anchor so they stay centred', () => {
    const d = turned('x', 100, 50, 1000, 200, 90);
    assert.deepEqual([d.x, d.y, d.w, d.h, d.r], [0, 50, 1000, 200, 90]);
    const e = turned('x', 100, 50, 1000, 200, -90);
    assert.equal(e.x, 200);
  });

  it('follow the steps art with their floor platforms', () => {
    assert.ok(STEPS_PROFILE.every(([fx, fy], i) => fx > 0 && fx < 1 && fy >= 0 && fy < 0.5 && (i === 0 || fx > STEPS_PROFILE[i - 1][0])));
    for (const room of TOWER_ROOMS) {
      for (const p of room.platforms) assert.ok(p.why, `${p.id} has a derivation note`);
      for (const d of room.doors) assert.ok(d.why, d.id);
      for (const s of room.spots) assert.ok(s.why, s.id);
    }
  });
});

describe('rebuilt tower rooms: doors', () => {
  it('the archived corridor doors lead in at their archived arrival points', () => {
    const want = {
      door_1304677515854: { room: ROOM_15_TSID, x: -790, y: -423 },
      door_1304677515850: { room: VENT_ROOM_TSID, x: 360, y: 240 },
      door_1304678594671: { room: VENT_ROOM_TSID, x: 400, y: -2540 },
    };
    for (const link of TOWER_ROOM_DOOR_LINKS) {
      const door = street(link.street).doors.find((d) => d.id === link.door);
      const w = want[link.door];
      assert.equal(door.connect.x, w.x);
      assert.equal(door.connect.y, w.y);
      assert.equal(door.connect.street, w.room);
      const target = street(w.room);
      assert.equal(door.connect.arrive.x, w.x - target.bounds.l);
      // Arrival lands on a floor within a few px of the archived feet position.
      const floor = floorAt(target.platforms, w.x, w.y);
      assert.ok(Math.abs(floor - w.y) <= 6, `${link.door} floor ${floor}`);
      assert.equal(door.connect.arrive.y, Math.round(floor - target.bounds.t));
    }
    // Room 15's door still needs the Teal-Red Hexagon Key (key 4).
    const r15 = street('GTJ10K7P3812R8F').doors.find((d) => d.id === 'door_1304677515854');
    assert.equal(r15.key_id, 4);
    assert.equal(r15.is_locked, true);
  });

  it('every room door leads back out: Way Out to C4 / C6, the shaft bottom to Tower St South', () => {
    const r15 = street(ROOM_15_TSID);
    assert.deepEqual(r15.doors.map((d) => d.connect.street), ['GTJ10K7P3812R8F']);
    const v = street(VENT_ROOM_TSID);
    assert.deepEqual(v.doors.map((d) => d.connect.street), ['GTJ110817812KO4', 'GTJ10K7P3812R8F', 'GIF15OTSM102353']);
    for (const s of [r15, v]) {
      for (const d of s.doors) {
        assert.ok(d.connect.arrive, d.id);
        assert.equal(d.is_locked, false);
        // The door stands on a floor (its art is bottom-centre).
        const plats = platformsScreen(s);
        const floor = floorAt(plats.map((p) => ({ ...p, pc_perm: -1 })), d.x, d.y);
        assert.ok(floor != null && Math.abs(floor - d.y) <= 3, `${d.id} floats: ${floor} vs ${d.y}`);
      }
    }
    // Back in C4, Room 15's exit lands in front of the Room 15 door.
    const back = r15.doors[0].connect.arrive;
    const c4door = street('GTJ10K7P3812R8F').doors.find((d) => d.id === 'door_1304677515854');
    assert.ok(Math.abs(back.x - c4door.x) <= 2);
  });
});

describe('rebuilt tower rooms: the secret spots', () => {
  const spotIn = (room, id) => {
    const s = street(room.tsid);
    return { s, box: towerSpotsFor(s).find((b) => b.id === id) };
  };
  const standing = (room, s, box, x, y) => inTowerSpot(box, x - s.bounds.l, y - s.bounds.t);

  it('moves spots 5 and 9-11 off the corridor ledges into the rooms', () => {
    assert.deepEqual(TOWER_ROOM_SPOTS.map((s) => [s.id, s.tsid]), [
      ['TowerSpot_05', ROOM_15_TSID], ['TowerSpot_09', VENT_ROOM_TSID], ['TowerSpot_10', VENT_ROOM_TSID], ['TowerSpot_11', VENT_ROOM_TSID],
    ]);
    for (const tsid of ['GTJ10K7P3812R8F', 'GTJ10M515812V0C', 'GIF1QBNPP7123J0']) {
      const ids = towerSpotsFor(street(tsid)).map((b) => b.id);
      assert.ok(!ids.some((id) => ['TowerSpot_05', 'TowerSpot_09', 'TowerSpot_10', 'TowerSpot_11'].includes(id)), `${tsid}: ${ids}`);
    }
    for (const spot of TOWER_ROOM_SPOTS) assert.deepEqual([spot.w, spot.h], [200, 200]);
  });

  it('spot 5: the top of Room 15 near the way out, a spinach jump from the way-out ledge', () => {
    const { s, box } = spotIn(room15, 'TowerSpot_05');
    const ledgeY = floorAt(room15.platforms, room15.doors[0].x, -423);
    const shelfY = floorAt(room15.platforms, -590, -680);
    assert.ok(Math.abs(ledgeY + 423) < 3);
    // Near the way out: within 250 px of the door, above it, in the top third of the room.
    assert.ok(Math.abs(box.x + s.bounds.l - room15.doors[0].x) <= 250);
    assert.ok(shelfY < room15.doors[0].y - room15.doors[0].h);
    assert.ok(shelfY - s.bounds.t < (s.bounds.b - s.bounds.t) / 3);
    // Standing on the shelf counts; standing at the door does not.
    assert.equal(standing(room15, s, box, -590, shelfY), true);
    assert.equal(standing(room15, s, box, -650, ledgeY), false);
    // A plain jump from the ledge falls short of the box; spinach (High Jumper) reaches it.
    const rise = ledgeY - (box.y + s.bounds.t + 100); // feet must rise until the avatar's 100 px box meets the spot
    assert.ok(apex() < rise, `plain apex ${apex()} vs ${rise}`);
    assert.ok(apex(SPINACH.jump, SPINACH.gravity) > rise, `spinach apex vs ${rise}`);
  });

  it('spot 9: just below the C6 Way Out ledge, not on it', () => {
    const { s, box } = spotIn(vent, 'TowerSpot_09');
    const door = vent.doors[0];
    const top = vent.route[vent.route.length - 2]; // the last climb ledge before the C6 ledge
    assert.equal(standing(vent, s, box, (top.left + top.right) / 2, top.top), true);
    // Every point of the C6 ledge is outside the box.
    for (let x = 30; x <= VENT.inner; x += 10) {
      const y = floorAt(vent.platforms, x, VENT.c6Floor);
      if (y != null && Math.abs(y - VENT.c6Floor) < 60) assert.equal(standing(vent, s, box, x, y), false, `ledge x ${x}`);
    }
    assert.ok(top.top > door.y && top.top - door.y <= 100, 'directly under the top exit');
  });

  it('spot 10: a platform on the left about three quarters up; spot 11: on the left just under the middle door', () => {
    // Heights from the shaft's bottom floor (the world runs on below it, out of reach).
    const { t } = VENT.bounds;
    const up = (y) => (VENT.floor - y) / (VENT.floor - t);
    const s10 = vent.spots.find((x) => x.id === 'TowerSpot_10');
    const s11 = vent.spots.find((x) => x.id === 'TowerSpot_11');
    assert.ok(up(s10.y) > 0.66 && up(s10.y) < 0.85, `spot 10 at ${up(s10.y)}`);
    assert.ok(s10.x < -300 && s11.x < -300, 'both on the left');
    const c4 = vent.doors[1];
    assert.ok(s11.y > c4.y && s11.y - c4.y < 150, 'slightly lower than the mid-height Way Out');
    // C4's door is the middle door, near mid height; C6's is near the top; the street exit at the bottom.
    assert.ok(Math.abs(up(c4.y) - 0.5) < 0.1);
    assert.ok(up(vent.doors[0].y) > 0.9 && up(vent.doors[2].y) < 0.05);
    for (const spot of [s10, s11]) {
      const { s, box } = spotIn(vent, spot.id);
      // The box never reaches past the ledge (a mid-air find stops the run over nothing).
      const ledge = vent.platforms.filter((p) => p.id.startsWith(`plat_vent_secret_${spot.id.slice(-2)}`));
      assert.ok(box.x + s.bounds.l + 100 <= Math.max(...ledge.map((p) => p.x2)), spot.id);
      const y = floorAt(vent.platforms, spot.x, spot.y - 30);
      assert.equal(standing(vent, s, box, spot.x, y), true, spot.id);
    }
  });

  it('the shaft climbs with plain jumps from the spot-11 ledge to the C6 ledge, and both left ledges are a plain jump off it', () => {
    const route = vent.route;
    for (let i = 1; i < route.length; i += 1) {
      const a = route[i - 1];
      const b = route[i];
      const rise = a.low - b.low; // low ends face each other: the pieces alternate flips
      const gap = Math.max(0, Math.max(a.left, b.left) - Math.min(a.right, b.right));
      assert.ok(rise <= 85, `step ${i} rise ${rise}`);
      assert.ok(gap < reach(rise + 20) * 0.9, `step ${i} gap ${gap} at rise ${rise}`);
    }
    // The chain runs through both Way Out ledges.
    assert.ok(route.some((p) => Math.abs(p.top - VENT.c4Floor) < 1));
    assert.equal(route[route.length - 1].top, VENT.c6Floor);
    for (const spot of vent.spots.filter((x) => x.id !== 'TowerSpot_09')) {
      const ledgeTop = spot.y - 30;
      const ledgeRight = spot.x + 110 - 0.097 * 220; // the piece's low right end
      const near = route.filter((p) => Math.abs(p.top - ledgeTop) <= 90);
      // From the climb ledge's high block to the spot ledge's low right end (19 px under its top).
      assert.ok(near.some((p) => p.left - ledgeRight < reach(p.top - (ledgeTop + 19)) * 0.9), spot.id);
    }
  });

  it('room 15 has its Purple-Orange Circle Key on a shelf you can climb to', () => {
    const s = street(ROOM_15_TSID);
    const key = s.boxes.find((b) => b.key);
    assert.equal(key.key, 6);
    const kx = key.x + s.bounds.l;
    const shelf = floorAt(room15.platforms, kx, key.y + s.bounds.t - 30);
    assert.ok(shelf != null && key.y + s.bounds.t - shelf >= 0 && key.y + s.bounds.t - shelf <= key.h);
    // The way up: each key-course step a plain jump.
    const tops = {};
    for (const p of room15.platforms.filter((q) => /r15_key_/.test(q.id))) {
      const piece = p.id.replace(/_\d+$/, '');
      tops[piece] = Math.min(tops[piece] ?? Infinity, p.y1, p.y2);
    }
    const levels = Object.values(tops).map((y) => Math.round((y + 1) / 5) * 5).sort((a, b) => b - a);
    const steps = [-160, ...levels.filter((y) => y < -160)];
    assert.deepEqual(steps, [-160, -235, -310, -385, -460, -535]);
    for (let i = 1; i < steps.length; i += 1) assert.ok(steps[i - 1] - steps[i] <= 85);
  });
});

describe('tower-rooms feature', () => {
  it('gives the rooms an interior ecology like the corridors and leaves other streets alone', () => {
    assert.deepEqual(towerRoomsFeature.ecologyOverride({ tsid: VENT_ROOM_TSID }), { label: 'Ventilation Room', sourceTsid: 'LIF102JCHL027DO', counts: {}, interior: true, quoins: 0 });
    assert.equal(towerRoomsFeature.ecologyOverride({ tsid: ROOM_15_TSID }).label, 'Room 15');
    assert.equal(towerRoomsFeature.ecologyOverride({ tsid: 'GTJ10K7P3812R8F' }), null);
  });

  it('saves the day each key, item and garden restock was taken (and reads v1 saves)', () => {
    towerRoomsFeature.restore({ keyDay: '2026-10-22:3' });
    assert.deepEqual(towerRoomsFeature.save(), { v: 2, keyDays: { [ROOM_15_TSID]: '2026-10-22:3' }, taken: {}, gardenDays: {} });
    const v2 = { v: 2, keyDays: { [ROOM_8_TSID]: 'd1', [ROOM_16_TSID]: 'd2' }, taken: { [`${ROOM_4_TSID}:r4_gurly_drink`]: 'd1' }, gardenDays: { [ROOM_4_TSID]: 'd3' } };
    towerRoomsFeature.restore(v2);
    assert.deepEqual(towerRoomsFeature.save(), v2);
    towerRoomsFeature.restore({ v: 2, keyDays: { x: 5 }, taken: null });
    assert.deepEqual(towerRoomsFeature.save(), { v: 2, keyDays: {}, taken: {}, gardenDays: {} });
    towerRoomsFeature.restore(undefined);
    assert.deepEqual(towerRoomsFeature.save().keyDays, {});
  });

  it('the street JSON is the builder output (doors linked by the build script)', () => {
    for (const room of ALL_TOWER_ROOMS) {
      const built = anyTowerRoomStreet(room);
      const s = street(room.tsid);
      assert.deepEqual(s.platforms, built.platforms);
      assert.deepEqual(s.layers, built.layers);
      assert.deepEqual(s.boxes, built.boxes);
      assert.deepEqual(s.ladders, built.ladders);
    }
  });

  it('owns the floor items\' Pick up verb and nothing else', () => {
    assert.deepEqual(towerRoomsFeature.verbsFor({ classId: 'tower_room_item' }).map((v) => v.id), ['pickup']);
    assert.equal(towerRoomsFeature.verbsFor({ classId: 'garden_plot' }), null);
    for (const tsid of [ROOM_4_TSID, ROOM_8_TSID, ROOM_16_TSID]) {
      assert.deepEqual(towerRoomsFeature.ecologyOverride({ tsid }).counts, {});
    }
  });

  it('replants only empty plots with ready spinach', () => {
    const garden = { plots: {
      '1-1': { state: 'dirty', seed: null, wet: false },
      '2-1': { state: 'clean', seed: null, wet: true, wetAt: 5 },
      '3-1': { state: 'seeds', seed: 'seed_onion', wet: true },
      '4-1': { state: 'crop', seed: 'seed_spinach', wet: false },
    } };
    assert.equal(restockGarden(garden, 'seed_spinach', 1000), 2);
    assert.deepEqual(Object.values(garden.plots).map((p) => [p.state, p.seed]), [
      ['crop', 'seed_spinach'], ['crop', 'seed_spinach'], ['seeds', 'seed_onion'], ['crop', 'seed_spinach'],
    ]);
    assert.equal(garden.plots['2-1'].wet, false);
    assert.equal(restockGarden(garden, 'seed_spinach'), 0);
  });
});

/* ------------------------------------------------------------------ */
/* Rooms 4, 8 and 16 (js/tower-challenge-rooms.js)                      */
/* ------------------------------------------------------------------ */

const room4 = anyTowerRoomByTsid(ROOM_4_TSID);
const room8 = anyTowerRoomByTsid(ROOM_8_TSID);
const room16 = anyTowerRoomByTsid(ROOM_16_TSID);

/** Sample points along platforms (world). */
const along = (plats) => plats.flatMap((p) => [0, 0.25, 0.5, 0.75, 1].map((k) => [p.x1 + (p.x2 - p.x1) * k, p.y1 + (p.y2 - p.y1) * k]));
/** Can a running jump carry the avatar from some point of A onto some point of B? */
function canReach(A, B, opt = {}) {
  const top = apex(opt.jump || 1, opt.gravity || 1) * 0.8;
  for (const [ax, ay] of along(A)) {
    for (const [bx, by] of along(B)) {
      const rise = ay - by;
      if (rise <= top && Math.abs(bx - ax) <= reach(rise + 20, opt) * 0.9) return true;
    }
  }
  return false;
}
const piece = (room, name) => room.platforms.filter((p) => p.id.replace(/_\d+$/, '') === `plat_${name}`);
function walkChain(room, names) {
  for (let i = 1; i < names.length; i += 1) {
    assert.ok(canReach(piece(room, names[i - 1]), piece(room, names[i])), `${room.label}: ${names[i - 1]} -> ${names[i]}`);
  }
}

describe('rebuilt tower rooms: Rooms 4, 8 and 16', () => {
  it('are written and indexed with the hub 77 names from inc_data_maps_prod.js', () => {
    const index = JSON.parse(readFileSync(join(streets, 'index.json'), 'utf8')).streets;
    assert.deepEqual(CHALLENGE_ROOMS.map((r) => [r.tsid, r.sourceTsid, r.label]), [
      [ROOM_4_TSID, 'LIF1Q6PMN7123NQ', 'Room 4'],
      [ROOM_8_TSID, 'LIF1FHA10312KLV', 'Room 8'],
      [ROOM_16_TSID, 'LTJ11V9DK812UNL', 'Room 16'],
    ]);
    for (const room of CHALLENGE_ROOMS) {
      assert.equal(index[room.tsid].label, room.label);
      assert.equal(index[room.tsid].hubId, '77');
      assert.equal(index[room.tsid].reconstructed, true);
      assertStreetGeometry(street(room.tsid));
    }
    assert.equal(ALL_TOWER_ROOMS.length, 5);
  });

  const mapsFile = join(spike, '../glitch-GameServerJS/inc_data_maps_prod.js');
  it('keep the hub 77 names and the drinks\' GSJS names', { skip: !existsSync(mapsFile) && 'GSJS checkout not beside this worktree' }, () => {
    const maps = readFileSync(mapsFile, 'utf8');
    for (const room of CHALLENGE_ROOMS) assert.match(maps, new RegExp(`"${room.sourceTsid}"\\s*:\\s*"${room.label}"`));
    for (const d of ROOM_4_DRINKS) {
      const item = readFileSync(join(spike, `../glitch-GameServerJS/items/${d.cls}.js`), 'utf8');
      assert.match(item, new RegExp(`var name_single = "${d.label}"`));
    }
  });

  it('use only art on disk: Room 8 firebog.swf street decos (G110), Room 4 wardrobia felt (G72), Room 16 firebog bottletree (G72)', () => {
    const corridorArt = new Set();
    for (const tsid of ['GIF1QBNPP7123J0', 'GIF1Q3IQM7122SP', 'GIF1Q48RM712F87', 'GTJ10K7P3812R8F', 'GTJ10M515812V0C', 'GTJ110817812KO4']) {
      for (const layer of street(tsid).layers) for (const d of layer.decos) corridorArt.add(d.sprite);
    }
    corridorArt.add('jethimadh_frame_cap').add('jethimadh_frame_wall'); // Room 15's shell (the corridors' firebog.swf set)
    const manifest = new Set(JSON.parse(readFileSync(join(spike, 'public/assets/decos/manifest.json'), 'utf8')));
    const firebogDir = join(spike, '../research/audio-hunt/raw/glitch-locations/source/firebog');
    const firebog = existsSync(firebogDir) ? new Set(readdirSync(firebogDir).filter((f) => f.endsWith('.swf')).map((f) => f.slice(0, -4))) : null;
    for (const room of CHALLENGE_ROOMS) {
      const s = street(room.tsid);
      for (const layer of s.layers) {
        for (const d of layer.decos) {
          if (room.tsid === ROOM_8_TSID && firebog) assert.ok(firebog.has(d.sprite) || corridorArt.has(d.sprite), `${room.label}: ${d.sprite} is not a firebog.swf deco`);
          else if (room.tsid === ROOM_16_TSID && firebog) assert.ok(firebog.has(d.sprite), `${room.label}: ${d.sprite} is not a firebog.swf deco`);
          assert.ok(manifest.has(d.sprite), d.sprite);
        }
      }
      for (const door of s.doors) assert.ok(existsSync(join(spike, 'public/assets/decos/groddle', `${door.sprite}.webp`)), door.sprite);
      for (const p of room.platforms) assert.ok(p.why, `${p.id} has a derivation note`);
      for (const d of room.doors) assert.ok(d.why, d.id);
      for (const l of room.ladders) assert.ok(l.why, l.id);
      for (const i of room.items || []) assert.ok(i.why, i.id);
    }
    // Room 4 is drawn from its art rows only: wardrobia pieces (tools/room-art tower_room_4) and the corridor ladder.
    assert.ok(street(ROOM_4_TSID).layers.every((l) => l.decos.every((d) => /^ladder_/.test(d.sprite))), 'Room 4\'s street keeps only its ladder art');
    assert.equal(street(ROOM_4_TSID).swf_file, 'wardrobia.swf');
    assert.deepEqual(street(ROOM_4_TSID).gradient, { top: 'cbe5f8', bottom: 'cbe5f8' });
    const plan = JSON.parse(readFileSync(join(spike, 'tools/room-art/tower_room_4.json'), 'utf8')).pieces;
    for (const a of room4.art) {
      assert.ok(a.z < 0, `${a.name} stays behind the avatar`);
      if (a.fill != null) continue;
      const file = a.src.replace(/\.png$/, '.webp');
      assert.ok(existsSync(join(spike, 'public', file)), file);
      if (a.src.startsWith(TOWER_ROOM_4_ART_ROOT)) assert.match(plan[a.name].swf, /^bundle:wardrobia\.swf#/);
      else assert.match(a.name, /^ladder_/);
    }
    assert.equal(room4.art.filter((a) => a.signText).map((a) => [a.name, a.signText]).join(), 'wardrobia_arrow_1,EXIT');
  });

  it('G72 dressing follows the unchanged platforms: felt ground on every Room 4 floor run, planks on every Room 16 run', () => {
    // Each felt band's grass top (bottom-centre anchor turned by r) runs within 12 px of 28 px over every floor run.
    const grounds = room4.art.filter((a) => a.name === 'platform_with_xsection_1').map((g) => {
      const t = (g.r * Math.PI) / 180;
      const tx = g.x + g.h * Math.sin(t);
      const ty = g.y - g.h * Math.cos(t);
      return { left: tx - (g.w / 2) * Math.cos(t), right: tx + (g.w / 2) * Math.cos(t), top: (x) => ty + Math.tan(t) * (x - tx) };
    });
    for (const f of flats(room4.platforms).filter((r) => r.y > -600 && !/_lip_|_shelf_/.test(r.id))) {
      const xc = (f.x1 + f.x2) / 2;
      assert.ok(grounds.some((g) => g.left <= f.x1 && f.x2 <= g.right && Math.abs(g.top(xc) - (f.y - 28)) <= 12), `${f.id} has felt ground`);
    }
    const island = room4.art.find((a) => a.name === 'platform_with_skirt_1');
    assert.ok(island.x - island.w / 2 <= room4.wayOut.left && room4.wayOut.right <= island.x + island.w / 2);
    const planks = street(ROOM_16_TSID).layers[0].decos.filter((d) => d.sprite === 'platform_bottletree_flat');
    for (const f of flats(room16.platforms)) {
      assert.ok(planks.some((d) => d.x - d.w / 2 <= f.x1 && f.x2 <= d.x + d.w / 2 && d.y === f.y + 22), `${f.id} has planks`);
    }
    // Room 16's way out is the pod's mouth: the pod stands round the archived arrival.
    const pod = street(ROOM_16_TSID).layers[0].decos.find((d) => d.sprite === 'bottletree_body2');
    const door = room16.doors[0];
    assert.equal(door.sprite, 'ground_cutaway_hollow1');
    assert.ok(Math.abs(pod.x - door.x) <= 2 && pod.y > door.y && pod.y - pod.h < door.y - door.h);
    // G97: the mouth is drawn from tools/room-art's render at the door's own size (2x), not the stretched deco.
    const plan = JSON.parse(readFileSync(join(spike, 'tools/room-art/tower_room_16.json'), 'utf8')).pieces.ground_cutaway_hollow1;
    assert.equal(door.src, `${TOWER_ROOM_16_ART_ROOT}${plan.file}`);
    assert.equal(street(ROOM_16_TSID).doors[0].src, door.src);
    assert.ok(existsSync(join(spike, 'public', door.src)), door.src);
    assert.match(plan.swf, /^bundle:firebog\.swf#ground_cutaway_hollow1$/);
    assert.deepEqual(plan.out_px, [door.w * plan.density, door.h * plan.density]);
  });

  it('the archived corridor doors lead in at their archived arrivals, still locked by their keys', () => {
    const want = {
      door_1304676445973: { room: ROOM_4_TSID, x: -1080, y: -1701, key: 1 },
      door_1304677515848: { room: ROOM_8_TSID, x: -736, y: -630, key: 3 },
      door_1304678594665: { room: ROOM_16_TSID, x: -7, y: -407, key: 6 },
    };
    for (const link of CHALLENGE_ROOM_DOOR_LINKS) {
      const door = street(link.street).doors.find((d) => d.id === link.door);
      const w = want[link.door];
      assert.deepEqual([door.connect.x, door.connect.y, door.connect.street], [w.x, w.y, w.room]);
      assert.deepEqual([door.key_id, door.is_locked], [w.key, true]);
      const target = street(w.room);
      const floor = floorAt(target.platforms, w.x, w.y);
      assert.ok(Math.abs(floor - w.y) <= 6, `${link.door} floor ${floor}`);
      assert.deepEqual(door.connect.arrive, { x: w.x - target.bounds.l, y: Math.round(floor - target.bounds.t) });
      // Rooms 4 and 16: the way out stands where you arrive. Room 8 (G110): you cross the bridge to it.
      const out = anyTowerRoomByTsid(w.room).doors[0];
      if (w.room === ROOM_8_TSID) assert.ok(out.x - w.x > 1400, 'Room 8\'s way out is across the void');
      else assert.deepEqual([out.x, out.y], [w.x, w.y]);
    }
  });

  it('Rooms 4 and 16 lead back to their own corridor doors; Room 8 leads on into C4\'s east half', () => {
    const back = (tsid, corridor, doorId) => {
      const s = street(tsid);
      const c = street(corridor);
      const d = c.doors.find((x) => x.id === doorId);
      assert.equal(s.doors.length, 1);
      assert.equal(s.doors[0].connect.street, corridor);
      return { arrive: s.doors[0].connect.arrive, door: d, c };
    };
    const r4 = back(ROOM_4_TSID, 'GIF1Q3IQM7122SP', 'door_1304676445973');
    assert.ok(Math.abs(r4.arrive.x - r4.door.x) <= 2);
    const r16 = back(ROOM_16_TSID, 'GTJ110817812KO4', 'door_1304678594665');
    assert.ok(Math.abs(r16.arrive.x - r16.door.x) <= 2);
    const r8 = back(ROOM_8_TSID, 'GTJ10K7P3812R8F', 'door_1304677515848');
    // East of C4's split (walls at world 26 and 183), west of the C6E door (world 492).
    const wx = r8.arrive.x + r8.c.bounds.l;
    const walls = r8.c.barriers.map((w) => w.x);
    assert.ok(walls.includes(26) && walls.includes(183));
    assert.ok(wx > 183 && wx < 492, `Room 8 exit lands at world x ${wx}`);
    // Every room door stands on a floor and is unlocked from the inside.
    for (const tsid of [ROOM_4_TSID, ROOM_8_TSID, ROOM_16_TSID]) {
      const s = street(tsid);
      for (const d of s.doors) {
        assert.equal(d.is_locked, false);
        const floor = floorAt(platformsScreen(s).map((p) => ({ ...p, pc_perm: -1 })), d.x, d.y);
        assert.ok(floor != null && Math.abs(floor - d.y) <= 3, `${d.id} floats: ${floor} vs ${d.y}`);
      }
    }
  });

  it('room 4: a ladder from the floor to the way out, four spinach plots and six drinks on two shelves', () => {
    const s = street(ROOM_4_TSID);
    assert.equal(s.ladders.length, 1);
    const l = room4.ladders[0];
    // Its foot is on the floor, its top on the way-out ledge (game.js ladderTopDeck mounts it).
    assert.ok(Math.abs(floorAt(room4.platforms, l.x, l.y) - l.y) <= 2);
    const top = l.y - l.h;
    const deck = ladderTopDeck(room4.platforms, l.x, top, l.y);
    assert.ok(deck != null && Math.abs(deck - top) <= 2, `deck ${deck} vs top ${top}`);
    assert.ok(room4.wayOut.left <= l.x && l.x <= room4.wayOut.right);
    assert.equal(room4.wayOut.top, room4.doors[0].y);
    // Garden: 4 x 1 on the floor's middle flat, spinach.
    assert.deepEqual([room4.garden.cols * room4.garden.rows, room4.garden.seed], [4, 'seed_spinach']);
    // js/garden-view.js: a street crop garden is strip_1, four strip_1_1 tiles 85 px apart (92.8 wide).
    const bedHalf = (3 * 85 + 92.8) / 2;
    const mid = room4.platforms.find((p) => p.id === 'plat_r4_floor_mid');
    assert.ok(mid.x1 <= room4.garden.x - bedHalf && room4.garden.x + bedHalf <= mid.x2 && mid.y1 === room4.garden.y);
    // Six different drinks, three on each shelf (G97: the Snaps' drinks stand on shelves).
    assert.deepEqual(room4.items.map((i) => i.cls), ROOM_4_DRINKS.map((d) => d.cls));
    const floorOnly = room4.platforms.filter((p) => /_floor_/.test(p.id));
    for (const shelf of ROOM_4_SHELVES) {
      const id = `r4_${shelf.name.replace('wardrobia_', '')}`;
      const plat = piece(room4, id);
      assert.equal(plat.length, 1, id);
      assert.equal(plat[0].pc_perm, -1, `${id} is one way`);
      // A plain jump from the floor lands on it; nothing else (no key, no spinach) is needed.
      assert.ok(canReach(floorOnly, plat), `${id} is a plain jump from the floor`);
      const mine = room4.items.filter((i) => i.x >= plat[0].x1 && i.x <= plat[0].x2 && i.y === plat[0].y1);
      assert.equal(mine.length, 3, `${id} holds three drinks`);
      // Each drink is also in reach from the floor under it (game.js nearestInteractable(100)).
      for (const i of mine) assert.ok(floorAt(floorOnly, i.x, -100) - i.y < 100, `${i.id} within reach of the floor`);
      // The shelf art's plank top is the platform.
      const art = room4.art.find((a) => a.name === shelf.name);
      assert.ok(Math.abs(art.y - art.h + 3 - plat[0].y1) <= 1 && art.x === shelf.x);
      // Clear of the ladder and the garden.
      assert.ok(plat[0].x2 < room4.ladders[0].x - 40 || plat[0].x1 > room4.ladders[0].x + 40);
      assert.ok(plat[0].x2 < room4.garden.x - bedHalf || plat[0].x1 > room4.garden.x + bedHalf);
    }
    assert.equal(new Set(room4.items.map((i) => `${i.x},${i.y}`)).size, 6);
  });

  it('room 8 (G110): arrive on a ledge, cross the bridge over the void to the deck with the key and the way out', () => {
    walkChain(room8, ['r8_arrive', 'r8_bridge', 'r8_deck']);
    // No short cut: the deck is out of a plain jump from the arrival ledge.
    assert.equal(canReach(piece(room8, 'r8_arrive'), piece(room8, 'r8_deck')), false);
    // The bridge drops left to right like the Snap's, and hangs over a void at least 500 px deep.
    const bridge = piece(room8, 'r8_bridge');
    const [first, last] = [bridge[0], bridge[bridge.length - 1]];
    assert.ok(last.y2 - first.y1 > 100 && last.x2 - first.x1 > 500, 'a long bridge dropping to the right');
    const pit = room8.platforms.filter((p) => /^plat_r8_pit_/.test(p.id));
    for (const p of bridge) {
      for (const x of [p.x1, p.x2]) {
        const under = room8.platforms.filter((q) => q.pc_perm === -1 && !bridge.includes(q) && Math.min(q.x1, q.x2) <= x && x <= Math.max(q.x1, q.x2) && Math.min(q.y1, q.y2) > p.y1);
        assert.ok(under.every((q) => pit.includes(q) && Math.min(q.y1, q.y2) - Math.max(p.y1, p.y2) > 500), `nothing under the bridge at x ${x} but the void floor`);
      }
    }
    // A fall is not the end: a vine climbs from the void floor to the arrival ledge.
    assert.equal(room8.ladders.length, 1);
    const l = room8.ladders[0];
    assert.ok(pit.includes(room8.platforms.find((p) => p.pc_perm === -1 && Math.min(p.x1, p.x2) <= l.x && l.x <= Math.max(p.x1, p.x2) && Math.abs(floorAt([p], l.x, l.y) - l.y) <= 2)));
    assert.equal(ladderTopDeck(room8.platforms, l.x, l.y - l.h, l.y), -630);
    const s = street(ROOM_8_TSID);
    assert.deepEqual(s.ladders.map((x) => x.id), ['ladder_r8_vine']);
    // Key 4 lies on the deck, the way out is the trunk's hollow at its far end, the rope-hung plank over it.
    const key = s.boxes.find((b) => b.key);
    assert.equal(key.key, 4);
    const deck = piece(room8, 'r8_deck');
    const kx = key.x + s.bounds.l;
    const ky = floorAt(deck, kx, key.y + s.bounds.t - 30);
    assert.ok(ky != null && key.y + s.bounds.t - ky === 30);
    const door = room8.doors[0];
    assert.equal(door.sprite, 'ground_cutaway_hollow3');
    assert.ok(Math.abs(floorAt(deck, door.x, door.y) - door.y) <= 1 && door.x > kx);
    const mg = s.layers.find((x) => x.id === 'middleground').decos;
    const plank = mg.find((d) => d.sprite === 'firebog_sign_blank_plank');
    assert.equal(plank.signText, 'Way Out');
    assert.ok(plank.x > deck[0].x1 && plank.x < door.x);
    for (const sprite of ['bridge', 'walkway_1', 'vine_rope', 'hanging_eggs_decor', 'hanging_braches1', 'bottletree_body2', 'sprout']) assert.ok(mg.some((d) => d.sprite === sprite), sprite);
    // The void: the corridor shell dimmed behind it.
    const bg = s.layers.find((x) => x.name === 'BG');
    assert.deepEqual(bg.filters, { tintColor: 0, tintAmount: 82 });
    assert.ok(bg.decos.some((d) => d.sprite === 'jethimadh_int_bg_center'));
  });

  it('room 16: Spinach on the floor and a Red-Green Triangle Key only a spinach jump reaches', () => {
    walkChain(room16, ['r16_floor_r', 'r16_climb_00', 'r16_climb_01', 'r16_climb_02', 'r16_wayout']);
    walkChain(room16, ['r16_floor_l', 'r16_left_00', 'r16_left_01', 'r16_left_02', 'r16_left_03']);
    const s = street(ROOM_16_TSID);
    const key = s.boxes.find((b) => b.key);
    assert.equal(key.key, 5);
    const shelf = [...piece(room16, 'r16_key_shelf'), ...piece(room16, 'r16_key_shelf_lip')];
    assert.ok(canReach(piece(room16, 'r16_left_03'), shelf, SPINACH), 'spinach jump from the last left ledge');
    for (const id of new Set(room16.platforms.map((p) => p.id.replace(/_\d+$/, '')))) {
      if (id === 'plat_r16_key_shelf' || id === 'plat_r16_key_shelf_lip' || id === 'plat_r16_ceiling') continue;
      assert.equal(canReach(room16.platforms.filter((p) => p.id.replace(/_\d+$/, '') === id), shelf), false, `${id} reaches the key without spinach`);
    }
    const kx = key.x + s.bounds.l;
    const shelfY = floorAt(room16.platforms, kx, key.y + s.bounds.t - 30);
    assert.ok(key.y + s.bounds.t - shelfY >= 0 && key.y + s.bounds.t - shelfY <= key.h);
    assert.deepEqual(room16.items.map((i) => [i.cls, i.count]), [['spinach', 3]]);
    assert.equal(room16.items[0].y, Math.round(floorAt(room16.platforms, room16.items[0].x, -100)));
  });
});
