/**
 * Jethimadh Tower Base is indoors (G42): the six corridors and the rebuilt
 * rooms spawn only what the archived corridor objrefs hold (quoins), the
 * location chip names hub 77, and the rebuilt rooms run on below their floors.
 * js/street-ecology.js INTERIOR_HUBS, build-street-ecology.mjs,
 * features/tower-rooms-feature.js, features/seasons-feature.js,
 * js/street-loader.js applyIndexHub, js/tower-rooms.js.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  INTERIOR_HUBS,
  ecologyForStreet,
  isInteriorHub,
  populationForStreet,
  setStreetEcologyCatalog,
} from '../public/js/street-ecology.js';
import { applyIndexHub, loadStreetDataFromFs } from '../public/js/street-loader.js?v=g442-6';
import { TOWER_ROOMS, VENT } from '../public/js/tower-rooms.js';
import { ALL_TOWER_ROOMS } from '../public/js/tower-challenge-rooms.js';
import { towerRoomsFeature } from '../public/js/features/tower-rooms-feature.js';
import { seasonsFeature } from '../public/js/features/seasons-feature.js?v=g458-1';

const spike = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => JSON.parse(readFileSync(join(spike, rel), 'utf8'));
const catalog = read('public/assets/content/street-ecology.json');
const index = read('public/assets/streets/index.json');

/** Archived Quoin/Coin objrefs per corridor (LIF / LTJ location XML). */
const CORRIDOR_QUOINS = {
  GIF1QBNPP7123J0: 0, // Corridor One: spawner, Qurazy marker
  GIF1Q3IQM7122SP: 7, // Corridor Two: 6 Quoin + 1 Coin
  GIF1Q48RM712F87: 3,
  GTJ10K7P3812R8F: 0, // Corridor Four: spawner, Bug Acknowledgment, Qurazy marker
  GTJ10M515812V0C: 5,
  GTJ110817812KO4: 5,
};

const hub77 = Object.entries(index.streets).filter(([, row]) => String(row.hubId) === '77').map(([tsid]) => tsid);

describe('Jethimadh Tower Base is an interior hub', () => {
  it('hub 77 is the only interior hub, named as in inc_data_maps_prod.js', () => {
    assert.deepEqual({ ...INTERIOR_HUBS }, { 77: 'Jethimadh Tower: Base' });
    assert.equal(isInteriorHub('77'), true);
    assert.equal(isInteriorHub(77), true);
    assert.equal(isInteriorHub('71'), false); // Jethimadh, the streets outside
    assert.equal(isInteriorHub(''), false);
    assert.equal(isInteriorHub(undefined), false);
    assert.equal(hub77.length, 11); // six corridors + Rooms 4, 8, 15, 16 and the Ventilation Room
  });

  it('the six corridor rows are interior, keep the archived quoin count and drop the spawner', () => {
    for (const [tsid, quoins] of Object.entries(CORRIDOR_QUOINS)) {
      const row = catalog.streets[tsid];
      assert.ok(row, tsid);
      assert.equal(row.interior, true, tsid);
      assert.equal(row.quoins, quoins, tsid);
      assert.deepEqual(row.counts, {}, tsid);
      assert.equal(row.spawners, undefined, tsid);
    }
    // The only rows interior by hub are the six corridors (the rooms have no
    // archived location); other interior rows come from G43's door/art rules.
    const byHub = Object.keys(catalog.streets).filter((tsid) => /^hub 77 /.test(catalog.streets[tsid].interiorWhy || ''));
    assert.deepEqual(byHub.sort(), Object.keys(CORRIDOR_QUOINS).sort());
  });

  it('an interior population has no animals, apples, Musicblocks, scenery or fallback, and only its quoins', () => {
    setStreetEcologyCatalog(catalog);
    for (const [tsid, quoins] of Object.entries(CORRIDOR_QUOINS)) {
      const pop = populationForStreet(tsid, ecologyForStreet(tsid));
      assert.equal(pop.interior, true);
      assert.equal(pop.source, 'tinyspeck-locations-xml');
      assert.deepEqual(
        [pop.piggies, pop.chickens, pop.butterflies, pop.flyingButterflies, pop.apples, pop.musicblocks, pop.gardens],
        [0, 0, 0, 0, 0, 0, 0],
        tsid,
      );
      assert.deepEqual([pop.treeClasses, pop.rockClasses, pop.resourceNodeClasses], [[], [], []]);
      assert.equal(pop.vendor, false);
      assert.equal(pop.shrine, false);
      assert.equal(pop.quoins, quoins);
    }
  });

  it('an interior row still keeps any exact static counts it lists', () => {
    const pop = populationForStreet('X', { interior: true, counts: { npc_piggy: 2, rock_metal_1: 1 }, spawners: 3, quoins: 2 });
    assert.deepEqual([pop.piggies, pop.chickens, pop.butterflies, pop.rockClasses, pop.quoins], [2, 0, 0, ['rock_metal_1'], 2]);
  });

  it('outdoor streets are unchanged: eight quoins, four apples (spawners infer no animals, G44b)', () => {
    const pop = populationForStreet('GIF15OTSM102353', { counts: { trant_fruit: 1, npc_piggy: 1 }, spawners: 1 });
    assert.equal(pop.interior, undefined);
    assert.equal(pop.piggies + pop.chickens + pop.butterflies, 1);
    assert.deepEqual([pop.apples, pop.musicblocks, pop.quoins], [4, 1, 8]);
  });

  it('the rebuilt rooms get an interior row from tower-rooms-feature', () => {
    for (const room of ALL_TOWER_ROOMS) {
      const row = towerRoomsFeature.ecologyOverride({ tsid: room.tsid });
      assert.equal(row.interior, true, room.label);
      assert.equal(row.quoins, 0, room.label);
      const pop = populationForStreet(room.tsid, row);
      assert.equal(pop.piggies + pop.chickens + pop.butterflies + pop.apples + pop.musicblocks + pop.quoins, 0, room.label);
    }
    assert.equal(towerRoomsFeature.ecologyOverride({ tsid: 'GIF15OTSM102353' }), null);
  });

  it('seasonal street decor (Zilloween lanterns, eggs) skips interiors', () => {
    const engine = { param: (k) => (k === 'season' ? 'zilloween' : null), setData() {}, inv: [], street: null, streetTsid: '', pushActivity() {} };
    seasonsFeature.init(engine);
    const street = { tsid: 'GIF1Q3IQM7122SP', bounds: { l: 0, r: 3000 } };
    assert.ok(seasonsFeature.placementGroups({ interior: false }, street).length > 0);
    assert.deepEqual(seasonsFeature.placementGroups({ interior: true }, street), []);
    // Source-empty rows (the Stoot memorial) stay bare too.
    assert.deepEqual(seasonsFeature.placementGroups(populationForStreet('GIFPV9EMLT72DP4', { empty: true, counts: {} }), street), []);
  });
});

describe('the location chip names the hub from the street index', () => {
  it('applyIndexHub fills a missing hub and never overrides the JSON', () => {
    assert.deepEqual(applyIndexHub({ label: 'Corridor Two' }, { hubId: '77', hubName: 'Jethimadh Tower: Base' }), {
      label: 'Corridor Two',
      hubId: '77',
      hubName: 'Jethimadh Tower: Base',
    });
    assert.deepEqual(applyIndexHub({ hubId: '56', hubName: 'Groddle Forest' }, { hubId: '77', hubName: 'X' }), { hubId: '56', hubName: 'Groddle Forest' });
    // Instance templates have an empty hub in the index: nothing to fill.
    assert.deepEqual(applyIndexHub({ label: 'Area 42' }, { hubId: '', hubName: '' }), { label: 'Area 42' });
  });

  it('every hub 77 street loads as Jethimadh Tower: Base', async () => {
    for (const tsid of hub77) {
      const data = await loadStreetDataFromFs(tsid, join(spike, 'public/assets/streets'));
      assert.equal(data.hubId, '77', tsid);
      assert.equal(data.hubName, 'Jethimadh Tower: Base', tsid);
    }
  });
});

describe('Room 15 and the Ventilation Room run on below their floors', () => {
  const lowestFloor = (room) => Math.max(...room.platforms.filter((p) => p.pc_perm === -1).map((p) => Math.max(p.y1, p.y2)));

  it('at least 300 px of world under the lowest floor, like Rooms 4, 8 and 16', () => {
    for (const room of ALL_TOWER_ROOMS) {
      assert.ok(room.bounds.b - lowestFloor(room) >= 300, `${room.label}: ${room.bounds.b - lowestFloor(room)}`);
    }
    assert.equal(VENT.bounds.b, 3000);
  });

  it('the shell art reaches the new bottom and the end walls run the full height', () => {
    for (const room of TOWER_ROOMS) {
      const backdrop = room.decos.filter((d) => /^jethimadh_int_bg_/.test(d.sprite));
      // Bottom-centre anchors: unturned decos end at y; turned ones (r +-90) span y +- w/2.
      const bottom = Math.max(...backdrop.map((d) => (d.r ? d.y + d.w / 2 : d.y)));
      assert.ok(bottom >= room.bounds.b - 40, `${room.label} backdrop ends at ${bottom}`);
      for (const wall of room.barriers) assert.equal(wall.y + wall.h, room.bounds.b, wall.id);
    }
  });

  it('doors and arrivals keep their world positions', () => {
    const json = (tsid) => read(`public/assets/streets/${tsid}.json`);
    for (const room of TOWER_ROOMS) {
      const street = json(room.tsid);
      assert.deepEqual(street.bounds, room.bounds);
      for (const door of room.doors) {
        const d = street.doors.find((x) => x.id === door.id);
        assert.deepEqual([d.x + room.bounds.l, d.y + room.bounds.t], [door.x, door.y], door.id);
      }
    }
    assert.deepEqual(TOWER_ROOMS[0].doors[0].connect.tsid, 'LTJ10K7P3812R8F');
  });
});
