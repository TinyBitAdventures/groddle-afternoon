// Lane phonefix (Austin's iPhone round, 2026-11-13): "Froughtful Fen is under construction. I'm not
// able to go into it", so the crash trip from Ferncaster End could not be tested on a fresh save.
// ?openroads=1 opens every road for one solo session (js/street-jobs.js openRoadsWanted and
// isJobBuilt's `open`), never in multiplayer or on /play/online/, and it writes nothing to the save.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { closedStreets, isJobBuilt, noteArrival, normalizeStreetJobState, openRoadsWanted, roadClosure } from '../public/js/street-jobs.js?v=03e90891';

const root = join(import.meta.dirname, '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');
const catalog = JSON.parse(read('public/assets/content/street-jobs.json'));
const index = JSON.parse(read('public/assets/streets/index.json'));
const FEN = 'GTJ103U2KJK1BLG';
const FERNCASTER = 'GCR13M5UQEM15TA';

describe('?openroads=1 (solo QA)', () => {
  it('reads the param in solo only, never in multiplayer or on /play/online/', () => {
    assert.equal(openRoadsWanted('1', { path: '/play/' }), true);
    assert.equal(openRoadsWanted('', { path: '/play/' }), true);
    assert.equal(openRoadsWanted(null, { path: '/play/' }), false);
    assert.equal(openRoadsWanted('0', { path: '/play/' }), false);
    assert.equal(openRoadsWanted('1', { path: '/play/', multiplayer: true }), false);
    assert.equal(openRoadsWanted('1', { path: '/play/online/' }), false);
    assert.equal(openRoadsWanted('1', { path: '/game/play/online/index.html' }), false);
  });

  it('opens Froughtful Fen and Ferncaster End on a fresh save, and writes nothing', () => {
    const state = normalizeStreetJobState({});
    const base = { exemptFrom: [index.default] };
    assert.ok(roadClosure(state, catalog, FEN, [FEN], base), 'Fen is closed on a fresh save');
    assert.ok(closedStreets(state, catalog, base).includes(FERNCASTER));
    const open = { ...base, open: true };
    const before = JSON.stringify(state);
    assert.equal(roadClosure(state, catalog, FEN, [FEN], open), null);
    assert.deepEqual(closedStreets(state, catalog, open), []);
    // Arriving there opens nothing for good: no grandfathered street lands in the save.
    assert.equal(noteArrival(state, catalog, FEN, open), false);
    assert.equal(JSON.stringify(state), before);
    // Without the param the road is closed again.
    assert.ok(roadClosure(state, catalog, FEN, [FEN], base));
  });

  it('leaves a QA demo board forced and upgrades unbuilt', () => {
    const state = normalizeStreetJobState({});
    const [fenJob] = Object.entries(catalog.jobs).find(([, j]) => j.kind === 'street' && j.street === FEN);
    assert.equal(isJobBuilt(state, catalog, fenJob, { open: true, force: [fenJob] }), false);
    const upgrade = Object.entries(catalog.jobs).find(([, j]) => j.kind === 'upgrade' && !j.builtFromStart);
    if (upgrade) assert.equal(isJobBuilt(state, catalog, upgrade[0], { open: true }), false);
  });

  it('the feature passes the param through opts()', () => {
    const src = read('public/js/features/street-jobs-feature.js');
    assert.match(src, /openRoadsWanted\(engineRef\?\.param\?\.\('openroads'\)/);
    assert.match(src, /open: openRoads\(\)/);
  });
});
