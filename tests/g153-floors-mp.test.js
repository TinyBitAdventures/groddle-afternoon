/**
 * G153 in multiplayer: an owner on an upper house floor (home-floors.js) shares no
 * street with visitors on the ground floor, as a Tower floor does.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sharedHomeStreet } from '../public/js/neighbours-mp.js?v=g328-4';

const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../public/js/features/neighbours-mp-feature.js'), 'utf8');

describe('house floors and the shared home street (G153)', () => {
  it('treats an upper house floor like a Tower floor', () => {
    assert.match(src, /const ownRoom = scene\?\.tower != null \|\| Number\(scene\?\.houseFloor\) > 0;/);
    assert.match(src, /towerFloor: ownRoom/);
  });
  it('an owner in a room of their own shares no street; on the ground floor they do', () => {
    assert.equal(sharedHomeStreet({ me: 7, inHome: true, room: 'interior', towerFloor: true }), '');
    assert.notEqual(sharedHomeStreet({ me: 7, inHome: true, room: 'interior', towerFloor: false }), '');
  });
});
