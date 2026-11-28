// G873 (#422): a visited player's Tower was titled "<Name>'s Your Tower": the visit put the
// possessive before towerLabel(), whose unnamed fallback is the owner's own "Your Tower".
// Glitch titled every Tower "<Name>'s Tower" (GSJS players/inc_towers.js:22,
// items/furniture_tower_chassis.js:508 tower_set_label(pc.label + "'s Tower")).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { visitedTowerName } from '../public/js/neighbours-mp.js?v=de82fd7d';

const root = join(import.meta.dirname, '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

describe('G873: a visited Tower\'s title (js/neighbours-mp.js visitedTowerName)', () => {
  it('unnamed, the owner\'s name and Tower', () => {
    assert.equal(visitedTowerName('Ada', { built: true, floors: 2 }), "Ada's Tower");
    assert.equal(visitedTowerName('James', { name: '' }), "James' Tower");
    assert.equal(visitedTowerName('Ada', { name: '   ' }), "Ada's Tower");
    assert.equal(visitedTowerName('Ada', null), "Ada's Tower");
  });

  it('a Tower its owner named keeps that name', () => {
    assert.equal(visitedTowerName('Ada', { name: 'Sky Loft' }), "Ada's Sky Loft");
  });

  it('never says Your on someone else\'s Tower', () => {
    for (const tw of [{}, { name: '' }, null]) assert.doesNotMatch(visitedTowerName('Ada', tw), /Your/);
  });
});

describe('G873: the visit uses it (js/features/neighbours-mp-feature.js)', () => {
  it('the scene label and the Tower on the street', () => {
    const n = read('public/js/features/neighbours-mp-feature.js');
    assert.doesNotMatch(n, /towerLabel\(/, 'the owner\'s label is not used on a visit');
    assert.match(n, /room === 'tower' \? visitedTowerName\(visit\.name, tower\)/);
    assert.match(n, /classId: CLASS_TOWER, [^\n]*label: visitedTowerName\(visit\.name, tw\)/);
  });
});
