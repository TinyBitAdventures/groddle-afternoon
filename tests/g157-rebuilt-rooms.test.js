/**
 * Snowed In, Ethereal Endeavour and Martleby Hare, rebuilt from players'
 * pictures (js/rebuilt-rooms.js, tools/build-rebuilt-rooms.mjs,
 * features/rebuilt-rooms-feature.js). Register rows G157, G158, G159.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertStreetGeometry, platformYAt } from '../public/js/street-model.js';
import { arrivalInTarget } from '../public/js/location-navigation.js';
import { populationForStreet } from '../public/js/street-ecology.js';
import { checkDoorEntry, doorAt, doorDestination } from '../public/js/doors.js';
import { eventCounters, SEAM_STREETS } from '../public/js/quest-offers.js';
import {
  ABBASID_RIVER_DOOR,
  ABBASID_RIVER_TSID,
  DOONBOGGLE_DOOR,
  DOONBOGGLE_TSID,
  ETHEREAL_ARRIVE,
  ETHEREAL_EXIT_DOOR,
  ETHEREAL_OVAL,
  ETHEREAL_QUOINS,
  ETHEREAL_TEMPLATE_TSID,
  ETHEREAL_TSID,
  FOOTLANDS_TSID,
  MARTLEBY_ARRIVE,
  MARTLEBY_DOOR,
  MARTLEBY_EXIT_DOOR,
  MARTLEBY_TIERS,
  MARTLEBY_TSID,
  REBUILT_ROOMS,
  ROOKTHILLS_DOOR,
  ROOKTHILLS_TSID,
  SNOWED_IN_ARRIVE,
  SNOWED_IN_BAYS,
  SNOWED_IN_EXIT_DOOR,
  SNOWED_IN_FLOOR_Y,
  SNOWED_IN_TSID,
  rebuiltRoomEcology,
} from '../public/js/rebuilt-rooms.js';
import { rebuiltRoomsFeature } from '../public/js/features/rebuilt-rooms-feature.js';
import { FEATURES } from '../public/js/features/index.js';

const spike = join(dirname(fileURLToPath(import.meta.url)), '..');
const pub = join(spike, 'public');
const streets = join(pub, 'assets/streets');
const street = (tsid) => JSON.parse(readFileSync(join(streets, `${tsid}.json`), 'utf8'));
const gsjs = join(spike, '../glitch-GameServerJS');
const locations = join(spike, '../streets/mnt/stos/location_data');
const index = JSON.parse(readFileSync(join(streets, 'index.json'), 'utf8'));
const manifest = new Set(JSON.parse(readFileSync(join(pub, 'assets/decos/manifest.json'), 'utf8')));

const si = street(SNOWED_IN_TSID);
const ee = street(ETHEREAL_TSID);
const mh = street(MARTLEBY_TSID);
const rooms = { [SNOWED_IN_TSID]: si, [ETHEREAL_TSID]: ee, [MARTLEBY_TSID]: mh };

/** A platform under world x within 2 px of world y. */
const floorAt = (s, x, y) => s.platforms.some((p) => {
  const py = platformYAt(p, x, 0);
  return py != null && Math.abs(py - y) <= 2;
});
/** Screen-space door arrival lands on a platform of the target street. */
const landsOnFloor = (target, arrive) => floorAt(target, arrive.x + target.bounds.l, arrive.y + target.bounds.t);
const door = (s, id) => (s.doors || []).find((d) => d.id === id);

describe('rebuilt rooms: street JSON', () => {
  it('are written, indexed and current (tools/build-rebuilt-rooms.mjs --check)', () => {
    execFileSync(process.execPath, [join(spike, 'tools/build-rebuilt-rooms.mjs'), '--check'], { stdio: 'pipe' });
    for (const room of REBUILT_ROOMS) {
      const s = rooms[room.tsid];
      assertStreetGeometry(s);
      assert.match(s.source, /^reconstruction/);
      assert.equal(s.reconstructed, true);
      assert.equal(s.label, room.label);
      const row = index.streets[room.tsid];
      assert.deepEqual([row.label, row.reconstructed, row.file, row.platforms], [room.label, true, `assets/streets/${room.tsid}.json`, s.platforms.length]);
      assert.equal(s.stats.decoCount, s.layers.reduce((n, l) => n + l.decos.length, 0));
    }
    assert.deepEqual([index.streets[SNOWED_IN_TSID].hubName, index.streets[ETHEREAL_TSID].hubName, index.streets[MARTLEBY_TSID].hubName], ['Vortex of Random', 'Gentle Island', 'Groddle Heights']);
  });

  it('draw only CC0 decos already shipped (layers, doors)', () => {
    for (const s of Object.values(rooms)) {
      for (const layer of s.layers) {
        for (const d of layer.decos) {
          assert.ok(existsSync(join(pub, 'assets/decos/groddle', `${d.sprite}.webp`)), `${s.label}: ${d.sprite}`);
          assert.ok(manifest.has(d.sprite), `${s.label}: ${d.sprite} in the deco manifest`);
        }
      }
      for (const d of s.doors) assert.ok(manifest.has(d.sprite) && existsSync(join(pub, 'assets/decos/groddle', `${d.sprite}.webp`)), `${s.label} door ${d.sprite}`);
    }
  });

  it('the GSJS map lists name all three; only Martleby Hare is a Seam Street', { skip: !existsSync(gsjs) && 'GSJS checkout not beside this worktree' }, () => {
    const maps = readFileSync(join(gsjs, 'inc_data_maps_prod.js'), 'utf8');
    assert.match(maps, /"LA9RLGSQ05F3Q69"\t: "Snowed In"/);
    assert.match(maps, /"LA9EKMN138D3QK2"\t: "Ethereal Endeavour"/);
    assert.match(maps, /"LCR14T7ECHM18G8"\t: "Martleby Hare"/);
    const loc = readFileSync(join(gsjs, 'locations/location.js'), 'utf8');
    const line = loc.split('\n').find((l) => l.includes("getQuestStatus('explore_the_seams')"));
    const listed = [...line.matchAll(/'(L[A-Z0-9]{14})'/g)].map((m) => `G${m[1].slice(1)}`);
    assert.deepEqual([...listed].sort(), [...SEAM_STREETS].sort());
    assert.ok(listed.includes(MARTLEBY_TSID) && !listed.includes(SNOWED_IN_TSID) && !listed.includes(ETHEREAL_TSID));
  });
});

describe('rebuilt rooms: doors in and out', () => {
  const cases = [
    { room: si, from: ABBASID_RIVER_TSID, id: ABBASID_RIVER_DOOR, key: 0, arrive: SNOWED_IN_ARRIVE, exit: SNOWED_IN_EXIT_DOOR, back: ABBASID_RIVER_TSID },
    { room: ee, from: DOONBOGGLE_TSID, id: DOONBOGGLE_DOOR, key: 1, arrive: ETHEREAL_ARRIVE, exit: ETHEREAL_EXIT_DOOR, back: DOONBOGGLE_TSID },
    { room: mh, from: ROOKTHILLS_TSID, id: ROOKTHILLS_DOOR, key: 2, arrive: MARTLEBY_ARRIVE, exit: MARTLEBY_EXIT_DOOR, back: FOOTLANDS_TSID },
  ];

  for (const c of cases) {
    it(`${c.room.label}: the source door leads in at its own connect point, ${c.key ? `locked with Door Key ${c.key}` : 'unlocked'}`, () => {
      const entry = street(c.from);
      const d = door(entry, c.id);
      assert.equal(d.connect.street, c.room.tsid);
      assert.equal(d.connect.tsid, `L${c.room.tsid.slice(1)}`);
      assert.deepEqual([d.connect.x, d.connect.y], [c.arrive.x, c.arrive.y]);
      assert.deepEqual([Boolean(d.is_locked), d.key_id || 0], [c.key > 0, c.key]);
      const at = arrivalInTarget(c.room, c.arrive.x, c.arrive.y);
      assert.ok(at.snapped, 'a floor under the arrival');
      assert.deepEqual(d.connect.arrive, { x: at.x, y: at.y });
      assert.ok(landsOnFloor(c.room, d.connect.arrive));
      const dest = doorDestination(d);
      assert.equal(dest.street, c.room.tsid);
      // The door's own checks: a key door turns you away without its key.
      const none = checkDoorEntry(d, { level: 1, hasKey: () => false, destination: dest });
      const held = checkDoorEntry(d, { level: 1, hasKey: () => true, destination: dest });
      if (c.key) {
        assert.equal(none.ok, false);
        assert.equal(held.ok, true);
      } else {
        assert.equal(none.ok, true);
      }
    });

    it(`${c.room.label}: its way out lands on a floor in ${c.back}`, () => {
      const out = door(c.room, c.exit);
      assert.ok(out, 'an exit door');
      assert.deepEqual([out.is_locked, out.hidden, out.key_id], [false, false, 0]);
      assert.equal(out.connect.street, c.back);
      const target = street(c.back);
      assert.ok(out.connect.arrive && landsOnFloor(target, out.connect.arrive), 'snapped to a floor');
      // A player standing on the floor in front of it is at the door (doors.js doorAt).
      const feet = arrivalInTarget(c.room, out.x + c.room.bounds.l, out.y + c.room.bounds.t);
      assert.ok(feet.snapped, `${out.id} over a floor`);
      assert.equal(doorAt(c.room.doors, feet.x, feet.y)?.id, out.id);
      assert.equal(checkDoorEntry(out, { destination: doorDestination(out) }).ok, true);
    });
  }

  it('the source XML holds the three doors', { skip: !existsSync(locations) && 'street dump not beside this worktree' }, () => {
    const abbasid = readFileSync(join(locations, `${ABBASID_RIVER_TSID}.xml`), 'utf8');
    assert.match(abbasid, /<objref id="target" tsid="LA9RLGSQ05F3Q69" label="Snowed In"\/>/);
    assert.match(abbasid.slice(abbasid.indexOf('<object id="sources">')).slice(0, 300), /LA9RLGSQ05F3Q69/, "Abbasid River's sources list Snowed In");
    const trail = readFileSync(join(locations, `${DOONBOGGLE_TSID}.xml`), 'utf8');
    assert.match(trail, /<objref id="target" tsid="LA9EKMN138D3QK2" label="Ethereal Endeavour"\/>/);
    const rook = readFileSync(join(locations, `${ROOKTHILLS_TSID}.xml`), 'utf8');
    assert.match(rook, /<objref id="target" tsid="LCR14T7ECHM18G8" label="Martleby Hare"\/>/);
    const foot = readFileSync(join(locations, `${FOOTLANDS_TSID}.xml`), 'utf8');
    assert.match(foot.slice(foot.indexOf('<object id="sources">')).slice(0, 300), /LCR14T7ECHM18G8/, "Footlands Heath's sources list Martleby Hare");
  });
});

describe('rebuilt rooms: layouts after the pictures', () => {
  it('Snowed In is the 3110 x 642 hall: eight doors, four windows, the lift, the teleporter, the camp', () => {
    assert.deepEqual(si.bounds, { l: -1555, r: 1555, t: -642, b: 0 });
    assert.equal(SNOWED_IN_BAYS.filter((b) => b.kind === 'door').length, 8);
    assert.equal(SNOWED_IN_BAYS.filter((b) => b.kind === 'window').length, 4);
    const all = si.layers.flatMap((l) => l.decos);
    const count = (re) => all.filter((d) => re.test(d.sprite)).length;
    assert.equal(count(/^door_asset_abandoned_apt_1$/), 8);
    assert.equal(count(/^apartment_hall_wall_piece_window$/), 4);
    assert.equal(count(/^apartment_hall_elevator$/), 1);
    assert.equal(count(/^Teleporter_(Base|Beam)$/), 2);
    assert.ok(count(/^snow_(skirt|rubble)_/) >= 8, 'the drifts');
    for (const s of ['hanging_clothes_line', 'juju_grandma_campfire_01a_al1', 'deco_chair_wooden_ghtest', 'deco_stool_wooden_ghtest']) assert.equal(count(new RegExp(`^${s}$`)), 1, s);
    assert.ok(floorAt(si, -1500, SNOWED_IN_FLOOR_Y) && floorAt(si, 1500, SNOWED_IN_FLOOR_Y), 'one floor end to end');
    const lift = door(si, SNOWED_IN_EXIT_DOOR);
    assert.equal(lift.sprite, 'door_asset_elevator_door');
    assert.ok(Math.abs(lift.x + si.bounds.l - SNOWED_IN_ARRIVE.x) < 150, 'Abbasid River lands beside the lift');
  });

  it('Ethereal Endeavour is the newxp brain end, mirrored: membrane, oval and EXIT at the left', () => {
    const template = street(ETHEREAL_TEMPLATE_TSID);
    assert.equal(template.swf_file, 'newxp.swf');
    const mid = ee.layers.find((l) => l.id === 'middleground');
    const wall = mid.decos.find((d) => d.sprite === 'Cellular_wall_back_wide');
    assert.ok(wall && wall.flip === true && wall.x < 0, 'the membrane, flipped, on the left half');
    const sign = mid.decos.find((d) => d.sprite === 'sign_exit_starter_01a');
    assert.ok(sign && Math.abs(sign.x - ETHEREAL_OVAL.x) < 120, 'EXIT by the oval');
    const out = door(ee, ETHEREAL_EXIT_DOOR);
    assert.ok(Math.abs(out.x + ee.bounds.l - ETHEREAL_OVAL.x) < 40, 'the way out is the oval');
    // Only brain art came across, and every layer keeps the template's parallax rule.
    for (const layer of ee.layers) for (const d of layer.decos) assert.match(d.sprite, /^(cell|Cellular|neuron|Brain|glowing_orb|newStart_background|sign_exit)/);
    assert.ok(ee.layers.length >= 4, 'the template layers');
    // The floor runs from the left bound to the right one.
    assert.ok(floorAt(ee, ee.bounds.l + 2, ETHEREAL_OVAL.floor), 'floor under the membrane');
    const xs = ee.platforms.flatMap((p) => [p.x1, p.x2]);
    assert.deepEqual([Math.min(...xs), Math.max(...xs)], [ee.bounds.l, ee.bounds.r]);
  });

  it('Martleby Hare: each ledge ends over the next, down to the stone-arched door, with no ladders', () => {
    assert.deepEqual(mh.bounds, { l: -750, r: 750, t: -2000, b: 0 });
    assert.equal(mh.ladders.length, 0);
    const first = MARTLEBY_TIERS[0];
    assert.ok(first.segs.some(([a, b]) => MARTLEBY_ARRIVE.x > a && MARTLEBY_ARRIVE.x < b) && first.y === MARTLEBY_ARRIVE.y);
    for (let i = 0; i + 1 < MARTLEBY_TIERS.length; i += 1) {
      const [a, b] = MARTLEBY_TIERS[i].segs[0];
      const next = MARTLEBY_TIERS[i + 1];
      // The open end (not at the street edge) drops onto the next ledge.
      const ends = [a > mh.bounds.l ? a - 20 : null, b < mh.bounds.r ? b + 20 : null].filter((x) => x != null);
      assert.ok(ends.length, `${MARTLEBY_TIERS[i].id} has an open end`);
      assert.ok(ends.every((x) => floorAt(mh, x, next.y)), `${MARTLEBY_TIERS[i].id} drops onto ${next.id}`);
    }
    const out = door(mh, MARTLEBY_EXIT_DOOR);
    assert.equal(out.sprite, 'heights_door_static');
    assert.equal(out.y + mh.bounds.t, MARTLEBY_TIERS[MARTLEBY_DOOR.tier].y);
    assert.ok(out.x + mh.bounds.l > 0, 'right of centre, as in the snap');
    // Footlands Heath's balcony: the door lands in front of its stone-arched door deco.
    const foot = street(FOOTLANDS_TSID);
    const balconyDoor = foot.layers.find((l) => l.id === 'middleground').decos.find((d) => d.sprite === 'heights_door_static');
    assert.ok(Math.abs(out.connect.arrive.x + foot.bounds.l - balconyDoor.x) < 60);
  });
});

describe('rebuilt rooms: population and the Seams', () => {
  it('no fallback piggies, vendors or shrines; Ethereal Endeavour keeps its quoins', () => {
    assert.ok(FEATURES.some((f) => f.id === rebuiltRoomsFeature.id), 'registered');
    assert.equal(rebuiltRoomsFeature.ecologyOverride({ tsid: ABBASID_RIVER_TSID }), null);
    for (const room of REBUILT_ROOMS) {
      for (const tsid of [room.tsid, room.sourceTsid]) assert.ok(rebuiltRoomEcology(tsid), tsid);
      const pop = populationForStreet(room.tsid, rebuiltRoomsFeature.ecologyOverride(rooms[room.tsid]));
      assert.deepEqual([pop.piggies, pop.chickens, pop.butterflies, pop.treeClasses.length, pop.rockClasses.length, pop.vendor, pop.shrine], [0, 0, 0, 0, 0, false, false], room.label);
    }
    assert.equal(populationForStreet(ETHEREAL_TSID, rebuiltRoomEcology(ETHEREAL_TSID)).quoins, ETHEREAL_QUOINS);
    assert.equal(populationForStreet(SNOWED_IN_TSID, rebuiltRoomEcology(SNOWED_IN_TSID)).quoins, 0);
  });

  it('a first visit counts visit_seam_street only on a Seam Street (Martleby Hare among them)', () => {
    const counted = (tsid) => eventCounters(`street_first_visit:${tsid}`).some((c) => c.counter === 'visit_seam_street');
    assert.equal(counted(MARTLEBY_TSID), true);
    assert.equal(counted('GCR1516SFHM122V'), true);
    assert.equal(counted(SNOWED_IN_TSID), false);
    assert.equal(counted(ETHEREAL_TSID), false);
    assert.equal(counted(ROOKTHILLS_TSID), false);
    for (const tsid of SEAM_STREETS) assert.ok(index.streets[tsid], `${tsid} imported`);
  });

  it('player copy has no em-dashes', () => {
    for (const s of Object.values(rooms)) {
      assert.doesNotMatch(s.label, /—/);
      for (const d of s.doors) assert.doesNotMatch(d.connect.label, /—/);
    }
  });
});
