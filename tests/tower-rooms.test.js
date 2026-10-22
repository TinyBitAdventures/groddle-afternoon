/**
 * Jethimadh Tower Base: the rebuilt Room 15 and Ventilation Room
 * (js/tower-rooms.js, tools/build-tower-rooms.mjs, features/tower-rooms-feature.js).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertStreetGeometry, platformsScreen } from '../public/js/street-model.js';
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
} from '../public/js/tower-rooms.js';
import { inTowerSpot, towerSpotsFor } from '../public/js/home-tower.js';
import { restockGarden, towerRoomsFeature } from '../public/js/features/tower-rooms-feature.js';
import {
  ALL_TOWER_ROOMS,
  CHALLENGE_ROOMS,
  CHALLENGE_ROOM_DOOR_LINKS,
  ROOM_16_TSID,
  ROOM_4_DRINKS,
  ROOM_4_TSID,
  ROOM_8_TSID,
  anyTowerRoomByTsid,
  anyTowerRoomStreet,
} from '../public/js/tower-challenge-rooms.js';
import { ladderTopDeck } from '../public/js/street-model.js';

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

  it('use only the corridors\' own art, all of it on disk', () => {
    const manifest = new Set(JSON.parse(readFileSync(join(spike, 'public/assets/decos/manifest.json'), 'utf8')));
    const corridorArt = new Set(['jethimadh_int_bg_left', 'jethimadh_int_bg_center', 'jethimadh_int_bg_right', 'jethimadh_int_bg_shadow_50percent', 'jethimadh_int_steps_1', 'jethimadh_int_lantern_1', 'jethimadh_int_pillar_1', 'jethimadh_int_pillar_1_mod', 'jethimadh_int_door_sign', 'firebog_sign_blank', 'jethimadh_frame_cap', 'jethimadh_frame_wall']);
    for (const room of TOWER_ROOMS) {
      const s = street(room.tsid);
      for (const layer of s.layers) {
        for (const d of layer.decos) {
          assert.ok(corridorArt.has(d.sprite), `${room.label}: ${d.sprite}`);
          assert.ok(manifest.has(d.sprite), d.sprite);
        }
      }
      for (const door of s.doors) assert.ok(existsSync(join(spike, 'public/assets/decos/groddle', `${door.sprite}.webp`)), door.sprite);
    }
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
    const { t, b } = VENT.bounds;
    const up = (y) => (b - y) / (b - t);
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
  it('gives the rooms the corridors\' empty ecology and leaves other streets alone', () => {
    assert.deepEqual(towerRoomsFeature.ecologyOverride({ tsid: VENT_ROOM_TSID }), { label: 'Ventilation Room', sourceTsid: 'LIF102JCHL027DO', counts: {}, spawners: 1 });
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

  it('use only art the archived corridors use, all of it on disk', () => {
    const corridorArt = new Set();
    for (const tsid of ['GIF1QBNPP7123J0', 'GIF1Q3IQM7122SP', 'GIF1Q48RM712F87', 'GTJ10K7P3812R8F', 'GTJ10M515812V0C', 'GTJ110817812KO4']) {
      for (const layer of street(tsid).layers) for (const d of layer.decos) corridorArt.add(d.sprite);
    }
    corridorArt.add('jethimadh_frame_cap').add('jethimadh_frame_wall'); // Room 15's shell (the corridors' firebog.swf set)
    const manifest = new Set(JSON.parse(readFileSync(join(spike, 'public/assets/decos/manifest.json'), 'utf8')));
    for (const room of CHALLENGE_ROOMS) {
      const s = street(room.tsid);
      for (const layer of s.layers) {
        for (const d of layer.decos) {
          assert.ok(corridorArt.has(d.sprite), `${room.label}: ${d.sprite}`);
          assert.ok(manifest.has(d.sprite), d.sprite);
        }
      }
      for (const door of s.doors) assert.ok(existsSync(join(spike, 'public/assets/decos/groddle', `${door.sprite}.webp`)), door.sprite);
      for (const p of room.platforms) assert.ok(p.why, `${p.id} has a derivation note`);
      for (const d of room.doors) assert.ok(d.why, d.id);
      for (const l of room.ladders) assert.ok(l.why, l.id);
      for (const i of room.items || []) assert.ok(i.why, i.id);
    }
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
      // The room's way out stands where you arrive.
      const out = anyTowerRoomByTsid(w.room).doors[0];
      assert.deepEqual([out.x, out.y], [w.x, w.y]);
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

  it('room 4: a ladder from the floor to the way out, four spinach plots and six drinks on the floor', () => {
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
    const bedHalf = (4 * 52 + 20) / 2; // game.js GARDEN_CELL_W 52, pads 10
    const mid = room4.platforms.find((p) => p.id === 'plat_r4_floor_mid');
    assert.ok(mid.x1 <= room4.garden.x - bedHalf && room4.garden.x + bedHalf <= mid.x2 && mid.y1 === room4.garden.y);
    // Six different drinks, each on the floor.
    assert.deepEqual(room4.items.map((i) => i.cls), ROOM_4_DRINKS.map((d) => d.cls));
    for (const item of room4.items) assert.equal(item.y, Math.round(floorAt(room4.platforms, item.x, -100)));
  });

  it('room 8: plain-jump ledges up to the way out and to the Teal-Red Hexagon Key\'s shelf', () => {
    walkChain(room8, ['r8_floor_l', 'r8_climb_00', 'r8_climb_01', 'r8_climb_02', 'r8_climb_03', 'r8_climb_04', 'r8_climb_05', 'r8_wayout']);
    walkChain(room8, ['r8_floor_r', 'r8_key_00', 'r8_key_01', 'r8_key_02', 'r8_key_03', 'r8_key_04', 'r8_key_05', 'r8_key_shelf']);
    const s = street(ROOM_8_TSID);
    const key = s.boxes.find((b) => b.key);
    assert.equal(key.key, 4);
    const shelf = floorAt(room8.platforms, key.x + s.bounds.l, key.y + s.bounds.t - 30);
    assert.ok(key.y + s.bounds.t - shelf >= 0 && key.y + s.bounds.t - shelf <= key.h);
    assert.ok(Math.min(...piece(room8, 'r8_key_shelf').map((p) => Math.min(p.y1, p.y2))) < -600, 'the key sits high in the room');
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
