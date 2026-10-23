/**
 * Interior streets in outdoor hubs (G43): building interiors get exactly their
 * archived population (no fallback piggies, trees, vendor or shrine), and a
 * spawner on a street whose snapshot holds no ecology guesses no animal.
 * js/street-ecology.js interiorReason / populationForStreet,
 * build-street-ecology.mjs.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  INTERIOR_ART_SETS,
  INTERIOR_DOOR_ART,
  INTERIOR_STREETS,
  ecologyForStreet,
  interiorReason,
  populationForStreet,
} from '../public/js/street-ecology.js';

const spike = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => JSON.parse(readFileSync(join(spike, rel), 'utf8'));
const catalog = read('public/assets/content/street-ecology.json');
const index = read('public/assets/streets/index.json');
const street = (tsid) => read(`public/${index.streets[tsid].file}`);

/** Interior streets, the rule that finds them, and their archived Quoin/Coin count. */
const INTERIORS = {
  GA5134UPLRU29OH: ['door art', 0], // Gregarious Towers (lobby)
  GDONEDVHC4030KF: ['door art', 0], // Gregarious Towers Basement
  GHVUFJ6HGRU2V0E: ['door art', 0], // Hakusan Heaps Towers
  GHV6HOCAH203RMF: ['door art', 0], // Hakusan Heaps Towers Basement
  GHVUR3UKGRU2SD2: ['door art', 0], // Egret Taun Towers
  GHVEI9NVJ203LRO: ['door art', 0], // Egret Taun Towers Basement (3 Gardens)
  GIFI4FP9GRU2CC8: ['door art', 0], // Sabudana Drama Towers
  GIF84CCRN203N7P: ['door art', 0], // Sabudana Drama Towers Basement
  GA9H1V6OGRU2FSB: ['door art', 0], // Hauki Seeks Manor
  GA9EBPF8M2031HB: ['door art', 0], // Hauki Seeks Manor Basement
  GM4118MEHFDMM: ['door art', 0], // Uncle Friendly's Emporium
  GCR101Q98A12EHH: ['interior art', 0], // Meadow Community Machine Room
  GA9MU59GB792T80: ['interior art', 0], // Besara Community Machine Room
  GA9S04AB15F3H53: ['interior art', 3], // Giant Living Room
  GA9S09UB15F34AE: ['interior art', 0], // Giant Kitchen
  GCR18H2DTFS17FB: ['POL template', 0], // SM Apartment 01
  GDOOSA8V29J24I3: ['The forgotten floor', 0],
  GDOC74759ST2IG1: ['Autumn Lodge', 7],
};

/** Outdoor streets beside them that must keep their archived population. */
const OUTDOOR = [
  'GLI2V0UN7RD1T2J', // Hechey Track
  'GIF15OTSM102353', // Tower St South
  'GLI32G3NUTD100I', // Gregarious Grange, outside Gregarious Towers
  'GA9A9CGB9F824PK', // Hakusan Heaps
  'GA9I4JIPBE92B8M', // Egret Taun
  'GHV2SQS7ENA25BL', // Sabudana Drama
  'GHV36AG0LO2208L', // Hauki Seeks
  'GCR10K3BPJK1U6F', // Otterlane, outside the Meadow machine room
];

const ANIMAL_OR_TREE = /^(?:npc_(?:piggy|chicken|butterfly)|trant_|wood_tree)/;

describe('interiorReason', () => {
  it('reads interior door art, interior-only art sets, GameServerJS lists and the explicit list', () => {
    assert.match(interiorReason({ tsid: 'GX', hubId: '77' }), /^hub 77 /);
    assert.match(interiorReason({ tsid: 'GX', doors: [{ sprite: 'door_asset_stairdoor_up_01a_bia' }] }), /^door art /);
    assert.match(interiorReason({ tsid: 'GX', doors: [{ sprite: 'door_asset_abandoned_apartment_int_01a' }] }), /^door art /);
    assert.match(interiorReason({ tsid: 'GX', doors: [{ sprite: 'door_asset_shoppeIn' }] }), /^door art /);
    assert.equal(interiorReason({ tsid: 'GX', doors: [{ sprite: 'door_asset_abandoned_apt_1' }] }), null); // the lobby door seen from outside
    assert.equal(interiorReason({ tsid: 'GX', doors: [{ sprite: 'door_asset_community_machine_room_ext' }] }), null);
    assert.match(interiorReason({ tsid: 'GX', swf_file: 'bldg_int_machine.swf' }), /^interior art /);
    assert.match(interiorReason({ tsid: 'GX', swf_file: 'kukubee2.swf' }), /^interior art /);
    assert.equal(interiorReason({ tsid: 'GX', swf_file: 'groddle1.swf,bldg_int_apt.swf' }), null); // borrows a few interior decos
    assert.match(interiorReason({ tsid: 'LX1' }, { machineRooms: new Set(['GX1']) }), /machine_rooms/);
    assert.match(interiorReason({ tsid: 'GX2' }, { polTemplates: new Map([['GX2', 'sm_apartment_01']]) }), /POL template sm_apartment_01/);
    assert.match(interiorReason({ tsid: 'GDOOSA8V29J24I3' }), /forgotten floor/);
    assert.equal(interiorReason({ tsid: 'GX' }), null);
    for (const why of [...Object.values(INTERIOR_ART_SETS), ...Object.values(INTERIOR_STREETS)]) assert.ok(why.length > 40);
  });

  it('no outdoor control street reads as indoors', () => {
    for (const tsid of OUTDOOR) {
      const s = street(tsid);
      assert.equal(interiorReason({ ...s, hubId: index.streets[tsid].hubId }), null, s.label);
    }
  });

  it('interior door art appears only on streets with no archived animals or trees', () => {
    for (const [tsid, meta] of Object.entries(index.streets)) {
      const s = street(tsid);
      if (!(s.doors || []).some((d) => INTERIOR_DOOR_ART.test(String(d.sprite || '')))) continue;
      const counts = ecologyForStreet(tsid, catalog)?.counts || {};
      assert.deepEqual(Object.keys(counts).filter((k) => ANIMAL_OR_TREE.test(k)), [], meta.label);
    }
  });
});

describe('interior rows in the catalog', () => {
  it('each interior street has an interior row with its reason and archived quoins', () => {
    for (const [tsid, [why, quoins]] of Object.entries(INTERIORS)) {
      const row = catalog.streets[tsid];
      assert.ok(row, tsid);
      assert.equal(row.interior, true, row.label);
      assert.ok(row.interiorWhy.includes(why), `${row.label}: ${row.interiorWhy}`);
      assert.equal(row.quoins, quoins, row.label);
      assert.equal(row.spawners, undefined, row.label);
    }
  });

  it('no interior row lists an animal or a tree, and every one says why', () => {
    for (const [tsid, row] of Object.entries(catalog.streets)) {
      if (!row.interior) continue;
      assert.ok(row.interiorWhy, tsid);
      assert.deepEqual(Object.keys(row.counts).filter((k) => ANIMAL_OR_TREE.test(k)), [], row.label);
    }
  });

  it('indoors there is no fallback: no animals, trees, rocks, vendor, shrine, apples or Musicblocks', () => {
    for (const tsid of Object.keys(INTERIORS)) {
      const pop = populationForStreet(tsid, ecologyForStreet(tsid, catalog));
      assert.equal(pop.source, 'tinyspeck-locations-xml', tsid);
      assert.equal(pop.interior, true, tsid);
      assert.deepEqual(
        [pop.piggies, pop.chickens, pop.butterflies, pop.treeClasses.length, pop.rockClasses.length, pop.vendor, pop.shrine, pop.apples, pop.musicblocks],
        [0, 0, 0, 0, 0, false, false, 0, 0],
        tsid,
      );
    }
    // The Egret Taun basement keeps its archived Gardens (three, capped at two).
    assert.equal(populationForStreet('GHVEI9NVJ203LRO', ecologyForStreet('GHVEI9NVJ203LRO', catalog)).gardens, 2);
  });

  it('outdoor control streets keep their rows and outdoor populations', () => {
    for (const tsid of OUTDOOR) {
      const row = ecologyForStreet(tsid, catalog);
      assert.ok(row, tsid);
      assert.equal(row.interior, undefined, row.label);
      const pop = populationForStreet(tsid, row);
      assert.equal(pop.interior, undefined, row.label);
      assert.deepEqual([pop.apples, pop.musicblocks, pop.quoins], [4, 1, 8], row.label);
    }
    const hechey = populationForStreet('GLI2V0UN7RD1T2J', ecologyForStreet('GLI2V0UN7RD1T2J', catalog));
    assert.ok(hechey.piggies > 0 && hechey.treeClasses.length > 0 && hechey.shrine);
  });
});

describe('spawners', () => {
  it('a spawner on a street with no archived ecology guesses no animal', () => {
    for (const tsid of ['GA9R4OR505F3PSL', 'GA9R3FG405F3B9P', 'GA9QNMSIV4F3143']) { // Abbasid Jail, Abbasid Walkway, Volcano Villa
      const row = ecologyForStreet(tsid, catalog);
      assert.deepEqual([row.counts, row.spawners], [{}, 1], tsid);
      const pop = populationForStreet(tsid, row);
      assert.equal(pop.piggies + pop.chickens + pop.butterflies, 0, row.label);
      assert.equal(pop.treeClasses.length + Number(pop.vendor) + Number(pop.shrine), 0, row.label);
    }
  });

  it('a spawner on a living street guesses no animal (G44b)', () => {
    const pop = populationForStreet('GX', { counts: { trant_bean: 2 }, spawners: 1 });
    assert.equal(pop.piggies + pop.chickens + pop.butterflies, 0);
    const shrine = populationForStreet('GX', { counts: {}, giantId: 'cosma', spawners: 1 });
    assert.equal(shrine.piggies + shrine.chickens + shrine.butterflies, 0);
  });

  it('Autumn Lodge is indoors: its two spawners (the Fried Eggs) add nothing; seven archived quoins', () => {
    const pop = populationForStreet('GDOC74759ST2IG1', ecologyForStreet('GDOC74759ST2IG1', catalog));
    assert.deepEqual([pop.piggies, pop.chickens, pop.butterflies, pop.quoins], [0, 0, 0, 7]);
  });
});
