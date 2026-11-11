/**
 * G153 in multiplayer: an owner on an upper house floor (home-floors.js) shares no
 * street with visitors on the ground floor, as a Tower floor does.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sharedHomeStreet } from '../public/js/neighbours-mp.js?v=fc5f0670';

const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../public/js/features/neighbours-mp-feature.js'), 'utf8');

describe('house floors and the shared home street (G153)', () => {
  it('treats an upper house floor as a room of its own; a Tower floor is shared with its visitors (MPVISIT)', () => {
    assert.match(src, /const ownRoom = Number\(scene\?\.houseFloor\) > 0;/);
    assert.match(src, /towerFloor: ownRoom, ownTowerFloor/);
    assert.equal(sharedHomeStreet({ me: 7, inHome: true, room: 'interior', towerFloor: false, ownTowerFloor: 2 }), 'TOWER_7_2');
  });
  it('an owner in a room of their own shares no street; on the ground floor they do', () => {
    assert.equal(sharedHomeStreet({ me: 7, inHome: true, room: 'interior', towerFloor: true }), '');
    assert.notEqual(sharedHomeStreet({ me: 7, inHome: true, room: 'interior', towerFloor: false }), '');
  });
});
