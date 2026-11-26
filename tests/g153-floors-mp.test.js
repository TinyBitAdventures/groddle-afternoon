/**
 * G153 in multiplayer: an owner on an upper house floor (home-floors.js) shares no
 * street with visitors on the ground floor. G1249 (#669): the floor is a street of its
 * own, HOUSE_<id>_<floor>, so machines there work; R5 (G1313) it is the house, shared
 * with whoever may enter (homes.go), a home place for drops and summons.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { houseFloorStreet, readHomeStreet, sharedHomeStreet, summonHomePlace } from '../public/js/neighbours-mp.js?v=4d16b7e4';

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
  it('G1249: an upper floor is a street of its own; R5 (G1313): a home place, the house', () => {
    assert.equal(sharedHomeStreet({ me: 7, inHome: true, room: 'interior', houseFloor: 1 }), 'HOUSE_7_1');
    assert.equal(sharedHomeStreet({ me: 7, inHome: true, room: 'interior', houseFloor: 2 }), 'HOUSE_7_2');
    assert.equal(sharedHomeStreet({ me: 7, inHome: true, room: 'interior', houseFloor: 0 }), 'HOUSE_7');
    assert.equal(houseFloorStreet(7, 3), '');
    assert.equal(houseFloorStreet(0, 1), '');
    // R5: drops and a summons read it as the house's floor (summon.go: the owner summons into it).
    assert.deepEqual(readHomeStreet('HOUSE_7_1'), { owner: 7, room: 'interior', floor: 1 });
    assert.equal(summonHomePlace({ street: 'HOUSE_7_1', me: 7, inHome: true }), '');
    assert.equal(sharedHomeStreet({ visit: { owner: 7, room: 'interior', floor: 2 }, me: 9 }), 'HOUSE_7_2', 'a visitor upstairs');
  });
});
