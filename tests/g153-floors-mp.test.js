/**
 * G153 in multiplayer: an owner on an upper house floor (home-floors.js) shares no
 * street with visitors on the ground floor. G1249 (#669): the floor is a street of the
 * owner's alone, HOUSE_<id>_<floor> (homes.go lets nobody else on), so machines there work.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { houseFloorStreet, readHomeStreet, sharedHomeStreet, summonHomePlace } from '../public/js/neighbours-mp.js?v=c0128a48';

const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../public/js/features/neighbours-mp-feature.js'), 'utf8');

describe('house floors and the shared home street (G153)', () => {
  it('treats an upper house floor as a room of its own; a Tower floor is shared with its visitors (MPVISIT)', () => {
    assert.match(src, /const houseFloor = Number\(scene\?\.houseFloor\) > 0 \? Number\(scene\.houseFloor\) : 0;/);
    assert.match(src, /houseFloor, ownTowerFloor/);
    assert.equal(sharedHomeStreet({ me: 7, inHome: true, room: 'interior', towerFloor: false, ownTowerFloor: 2 }), 'TOWER_7_2');
  });
  it('an owner in a room of their own shares no street; on the ground floor they do', () => {
    assert.equal(sharedHomeStreet({ me: 7, inHome: true, room: 'interior', towerFloor: true }), '');
    assert.notEqual(sharedHomeStreet({ me: 7, inHome: true, room: 'interior', towerFloor: false }), '');
  });
  it('G1249: an upper floor is a street of the owner\'s alone, never a shared home place', () => {
    assert.equal(sharedHomeStreet({ me: 7, inHome: true, room: 'interior', houseFloor: 1 }), 'HOUSE_7_1');
    assert.equal(sharedHomeStreet({ me: 7, inHome: true, room: 'interior', houseFloor: 2 }), 'HOUSE_7_2');
    assert.equal(sharedHomeStreet({ me: 7, inHome: true, room: 'interior', houseFloor: 0 }), 'HOUSE_7');
    assert.equal(houseFloorStreet(7, 3), '');
    assert.equal(houseFloorStreet(0, 1), '');
    // Nothing shared reads it: no home place for drops or a summons (summon.go refuses it too).
    assert.equal(readHomeStreet('HOUSE_7_1'), null);
    assert.equal(summonHomePlace({ street: 'HOUSE_7_1', me: 7, inHome: true }), 'here');
  });
});
