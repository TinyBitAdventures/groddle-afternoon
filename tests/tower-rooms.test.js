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
import { towerRoomsFeature } from '../public/js/features/tower-rooms-feature.js';

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
      for (const door of s.doors) assert.ok(existsSync(join(spike, 'public/assets/decos/groddle', `${door.sprite}.png`)), door.sprite);
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

  it('saves the day the key was taken', () => {
    towerRoomsFeature.restore({ keyDay: '2026-10-22:3' });
    assert.deepEqual(towerRoomsFeature.save(), { v: 1, keyDay: '2026-10-22:3' });
    towerRoomsFeature.restore(undefined);
    assert.equal(towerRoomsFeature.save().keyDay, '');
  });

  it('the street JSON is the builder output (doors linked by the build script)', () => {
    for (const room of TOWER_ROOMS) {
      const built = towerRoomStreet(room);
      const s = street(room.tsid);
      assert.deepEqual(s.platforms, built.platforms);
      assert.deepEqual(s.layers, built.layers);
      assert.deepEqual(s.boxes, built.boxes);
    }
  });
});
