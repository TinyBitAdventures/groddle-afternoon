/**
 * The Forest Community Machine Room, rebuilt from the community machine room
 * template behind Middle Valley Clearing's door (js/forest-machine-room.js,
 * tools/build-forest-machine-room.mjs, features/machine-rooms-feature.js).
 * Register row G156.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertStreetGeometry } from '../public/js/street-model.js?v=606bae73';
import { arrivalInTarget } from '../public/js/location-navigation.js?v=38c12adf';
import { populationForStreet } from '../public/js/street-ecology.js?v=dbcefe18';
import { MACHINE_ROOMS, availableHubStreets, countsTowardHub, isMachineRoom, streetVisitCounters } from '../public/js/exploration.js?v=19c6758f';
import {
  CLEARING_DOOR,
  CLEARING_SOURCE_TSID,
  CLEARING_TSID,
  EXIT_DOOR_ID,
  FOREST_MACHINE_ROOM_ARRIVE,
  FOREST_MACHINE_ROOM_HELD,
  FOREST_MACHINE_ROOM_SOURCE_TSID,
  FOREST_MACHINE_ROOM_TSID,
  TEMPLATE_TSID,
  forestMachineRoomEcology,
  forestMachineRoomStreet,
  isForestMachineRoomTsid,
} from '../public/js/forest-machine-room.js?v=5f7e4589';
import { machineRoomsFeature } from '../public/js/features/machine-rooms-feature.js?v=0ceaadff';
import { FEATURES } from '../public/js/features/index.js?v=5ee36fdd';

const spike = join(dirname(fileURLToPath(import.meta.url)), '..');
const streets = join(spike, 'public/assets/streets');
const street = (tsid) => JSON.parse(readFileSync(join(streets, `${tsid}.json`), 'utf8'));
const gsjs = join(spike, '../glitch-GameServerJS');
const locations = join(spike, '../streets/mnt/stos/location_data');
const room = street(FOREST_MACHINE_ROOM_TSID);
const clearing = street(CLEARING_TSID);
const meadow = street(TEMPLATE_TSID);
const besara = street('GA9MU59GB792T80');
const decos = (s) => s.layers.flatMap((layer) => layer.decos || []);

describe('Forest Community Machine Room street', () => {
  it('is written, indexed and current (tools/build-forest-machine-room.mjs --check)', () => {
    execFileSync(process.execPath, [join(spike, 'tools/build-forest-machine-room.mjs'), '--check'], { stdio: 'pipe' });
    assertStreetGeometry(room);
    assert.match(room.source, /^reconstruction/);
    assert.equal(room.reconstructed, true);
    assert.equal(room.template, TEMPLATE_TSID);
    assert.deepEqual([room.label, room.hubId, room.hubName], ['Forest Community Machine Room', '56', 'Groddle Forest']);
    const index = JSON.parse(readFileSync(join(streets, 'index.json'), 'utf8'));
    const row = index.streets[FOREST_MACHINE_ROOM_TSID];
    assert.deepEqual(
      [row.label, row.hubId, row.hubName, row.reconstructed, row.file, row.platforms, row.decos],
      ['Forest Community Machine Room', '56', 'Groddle Forest', true, `assets/streets/${FOREST_MACHINE_ROOM_TSID}.json`, room.platforms.length, 3],
    );
  });

  it('has the template bounds, art set and decos (the two archived rooms agree on all three)', () => {
    for (const s of [room, meadow, besara]) {
      assert.deepEqual(s.bounds, { l: -700, r: 700, t: -700, b: 0 }, s.tsid);
      assert.equal(s.swf_file, 'bldg_int_machine.swf', s.tsid);
      assert.deepEqual(decos(s).map((d) => d.sprite).sort(), ['community_machine_room_int', 'door_asset_community_machine_room', 'sign_community_machine_room'], s.tsid);
    }
    // Meadow's copy: the sign where the 2012-05-21 street render shows it, not Besara's.
    assert.deepEqual(decos(room), decos(meadow));
    assert.deepEqual(room.platforms, meadow.platforms);
    assert.deepEqual(room.barriers, meadow.barriers);
    const sign = (s) => decos(s).find((d) => d.sprite === 'sign_community_machine_room');
    assert.deepEqual([sign(room).x, sign(besara).x], [-24, -115]);
  });

  it('is the machine room GSJS names in hub 56', { skip: !existsSync(gsjs) && 'GSJS checkout not beside this worktree' }, () => {
    const config = readFileSync(join(gsjs, 'config_prod.js'), 'utf8');
    for (const list of ['public_machine_rooms', 'machine_rooms']) {
      assert.match(config, new RegExp(`var ${list} = \\['LCR101Q98A12EHH', '${FOREST_MACHINE_ROOM_SOURCE_TSID}', 'LA9MU59GB792T80'\\];`));
    }
    const maps = readFileSync(join(gsjs, 'inc_data_maps_prod.js'), 'utf8');
    assert.match(maps, /"LIF16EM56A12FSB"\t: "Forest Community Machine Room"/);
  });
});

describe('Forest Community Machine Room doors', () => {
  const inDoor = clearing.doors.find((d) => d.id === CLEARING_DOOR);
  const outDoor = room.doors.find((d) => d.id === EXIT_DOOR_ID);

  it("the Clearing's archived door leads in, at its own connect, onto the copied floor", { skip: !existsSync(locations) && 'location XML not beside this worktree' }, () => {
    const xml = readFileSync(join(locations, `${CLEARING_TSID}.xml`), 'utf8');
    const block = xml.slice(xml.indexOf(`<object id="${CLEARING_DOOR}">`), xml.indexOf('<object id="ladders">'));
    assert.match(block, /<objref id="target" tsid="LIF16EM56A12FSB" label="Forest Community Machine Room"\/>/);
    assert.match(block, /<int id="x">522<\/int>\s*<int id="y">-150<\/int>/);
    assert.match(block, /bldg_int_machine\/1322700879\.swf/);
  });

  it('door in: Middle Valley Clearing -> the room, landing in front of the way out', () => {
    assert.ok(inDoor);
    assert.equal(inDoor.connect.tsid, FOREST_MACHINE_ROOM_SOURCE_TSID);
    assert.equal(inDoor.connect.street, FOREST_MACHINE_ROOM_TSID);
    assert.deepEqual([inDoor.connect.x, inDoor.connect.y], [FOREST_MACHINE_ROOM_ARRIVE.x, FOREST_MACHINE_ROOM_ARRIVE.y]);
    const snap = arrivalInTarget(room, FOREST_MACHINE_ROOM_ARRIVE.x, FOREST_MACHINE_ROOM_ARRIVE.y);
    assert.ok(snap.snapped);
    assert.deepEqual(inDoor.connect.arrive, { x: snap.x, y: snap.y });
    // On the floor, left of the way out (as Meadow and Besara land, 40 and 111 px short of theirs).
    assert.ok(inDoor.connect.arrive.x < outDoor.x && outDoor.x - inDoor.connect.arrive.x < 150);
  });

  it('door out: the room -> Middle Valley Clearing, in front of the door it came from', () => {
    assert.equal(room.doors.length, 1);
    assert.equal(outDoor.sprite, 'door_asset_community_machine_room');
    assert.equal(outDoor.is_locked, false);
    assert.equal(outDoor.key_id, 0);
    assert.equal(outDoor.connect.tsid, CLEARING_SOURCE_TSID);
    assert.equal(outDoor.connect.street, CLEARING_TSID);
    const doorX = inDoor.x + clearing.bounds.l;
    const doorY = inDoor.y + clearing.bounds.t;
    assert.deepEqual([outDoor.connect.x, outDoor.connect.y], [doorX, doorY]);
    const snap = arrivalInTarget(clearing, doorX, doorY);
    assert.ok(snap.snapped);
    assert.deepEqual(outDoor.connect.arrive, { x: snap.x, y: snap.y });
    assert.equal(outDoor.connect.arrive.x, inDoor.x);
  });

  it('the builder refuses a template that is not the Meadow room', () => {
    assert.throws(() => forestMachineRoomStreet(besara), /template must be/);
    const built = forestMachineRoomStreet(meadow);
    assert.equal(built.doors[0].connect.street, CLEARING_TSID);
    assert.equal(built.doors[0].connect.arrive, undefined);
  });
});

describe('Forest Community Machine Room population', () => {
  it('is indoors like the archived rooms: nothing spawned, no quoins', () => {
    const catalog = JSON.parse(readFileSync(join(spike, 'public/assets/content/street-ecology.json'), 'utf8'));
    const archived = catalog.streets[TEMPLATE_TSID];
    const row = machineRoomsFeature.ecologyOverride({ tsid: FOREST_MACHINE_ROOM_TSID });
    assert.deepEqual(row, forestMachineRoomEcology());
    assert.deepEqual([row.interior, row.counts, row.quoins], [archived.interior, archived.counts, archived.quoins]);
    assert.equal(row.interiorWhy, 'config_prod.js machine_rooms');
    const pop = populationForStreet(FOREST_MACHINE_ROOM_TSID, row);
    assert.deepEqual(
      [pop.piggies, pop.chickens, pop.butterflies, pop.treeClasses.length, pop.rockClasses.length, pop.vendor, pop.shrine, pop.quoins, pop.apples],
      [0, 0, 0, 0, 0, false, false, 0, 0],
    );
    assert.equal(machineRoomsFeature.ecologyOverride({ tsid: TEMPLATE_TSID }), null);
    assert.equal(catalog.streets[FOREST_MACHINE_ROOM_TSID], undefined, 'no archived row: the feature supplies it');
  });

  it('is registered and recognised under either prefix', () => {
    assert.ok(FEATURES.some((f) => f.id === 'machine-rooms'));
    assert.ok(isForestMachineRoomTsid('LIF16EM56A12FSB'));
    assert.ok(isForestMachineRoomTsid('GIF16EM56A12FSB'));
    assert.ok(!isForestMachineRoomTsid(TEMPLATE_TSID));
  });

  it('records what the 2012-05-21 render shows held there (not built yet)', () => {
    assert.deepEqual(FOREST_MACHINE_ROOM_HELD.machines.map((m) => m.classTsid), ['fuelmaker', 'blockmaker', 'fuelmaker']);
    assert.deepEqual(FOREST_MACHINE_ROOM_HELD.furniture, { bag_notice_board: 1 });
    for (const m of FOREST_MACHINE_ROOM_HELD.machines) assert.ok(m.x > room.bounds.l && m.x < room.bounds.r);
  });
});

describe('machine rooms and exploration (location.js:183, :2767)', () => {
  const index = JSON.parse(readFileSync(join(streets, 'index.json'), 'utf8')).streets;

  it('lists the three config_prod.js machine_rooms', { skip: !existsSync(gsjs) && 'GSJS checkout not beside this worktree' }, () => {
    const config = readFileSync(join(gsjs, 'config_prod.js'), 'utf8');
    const list = [...config.match(/var machine_rooms = \[([^\]]*)\]/)[1].matchAll(/'L([A-Z0-9]+)'/g)].map((m) => `G${m[1]}`);
    assert.deepEqual([...MACHINE_ROOMS].sort(), list.sort());
  });

  it('a machine room is a hidden location: hubs_visited counts, the Completist does not', () => {
    for (const [tsid, hub] of [[FOREST_MACHINE_ROOM_TSID, '56'], [TEMPLATE_TSID, '58'], ['GA9MU59GB792T80', '98']]) {
      assert.ok(isMachineRoom(tsid) && isMachineRoom(`L${tsid.slice(1)}`));
      assert.equal(countsTowardHub(tsid, hub), false, tsid);
      assert.ok(!availableHubStreets(hub, index).includes(tsid), tsid);
      assert.deepEqual(streetVisitCounters({ tsid, hubId: hub, indexStreets: index }).map((c) => c.counter), [`hidden_locations_visited:${tsid}`, `hubs_visited:${hub}`]);
    }
    // The street outside still counts.
    assert.ok(countsTowardHub(CLEARING_TSID, '56'));
    assert.equal(streetVisitCounters({ tsid: CLEARING_TSID, hubId: '56', indexStreets: index })[0].counter, `locations_visited:${CLEARING_TSID}`);
  });
});
