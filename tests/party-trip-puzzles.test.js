/**
 * G904: a party teleporter taken on a puzzle street (the colour levels, Umbra, Penumbra, any course
 * with a finish) or in a puzzle scene (Constellation, Beam Me Down) holds the run. Glitch kept the
 * instance you left for another instance (GSJS groups/instance.js player_exited_location 343-363)
 * and the party led back to the spot (players/inc_instances.js instances_left 135-180). Quoins taken
 * stay taken (Beam Me Down's skip the day's limit, so a second pay would be a real double reward),
 * a level the Map card took you to stays in progress (no dead-end EXIT, G888), and a reload at the
 * party keeps the hold.
 * Run: node --test tests/party-trip-puzzles.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeHeldPuzzle, normalizePuzzleSave } from '../public/js/puzzle-triggers.js?v=221b67a9';
import { normalizeHeldScene, normalizeSceneSave } from '../public/js/puzzle-scenes.js?v=04413a6d';
import { puzzlesFeature } from '../public/js/features/puzzles-feature.js?v=8c18417f';
import { puzzleScenesFeature } from '../public/js/features/puzzle-scenes-feature.js?v=fca3ec23';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const ORANGIAN = 'GHVCKEPHO403BN5';
const MOON = 'GDOBUP8IR8E2IPH';
const party = (inside) => ({ query: (hook, action) => (hook === 'partyTrip' && action === 'inside' ? inside : null) });

describe('the held puzzle street (js/puzzle-triggers.js)', () => {
  it('saved with the save: the spot, quoins taken, solved, in progress, how far, its clock', () => {
    const held = { tsid: ORANGIAN, x: 812.4, y: 400, taken: ['q1', 'q3'], complete: false, viaCard: true, bestX: 900, respawns: 2, elapsedMs: 41_000 };
    const save = normalizePuzzleSave({ completed: {}, held });
    assert.deepEqual(save.held, { ...held, x: 812 });
    assert.equal(normalizeHeldPuzzle({ tsid: 'not a street' }), null);
    assert.equal(normalizePuzzleSave({}).held, undefined);
  });
});

describe('the held scene (js/puzzle-scenes.js)', () => {
  it('keeps the scene, the spot, the quoins taken, landed and the stars drawn', () => {
    const away = { id: 'beam_me_down', x: 800, y: 5100, taken: ['b1_1', 'b2_3'], landed: true, complete: true, run: null };
    assert.deepEqual(normalizeSceneSave({ away }).away, away);
    const stars = normalizeHeldScene({ id: 'constellation', x: 1, y: 2, run: { connected: [0, 1, 2], misses: 1, complete: false } });
    assert.deepEqual(stars.run, { connected: [0, 1, 2], misses: 1, complete: false });
    assert.equal(normalizeHeldScene({ id: 'nowhere' }), null);
  });
});

describe('puzzles-feature', () => {
  it('nothing to hold with no run on the street', () => {
    assert.equal(puzzlesFeature.partyTrip('depart', { streetTsid: ORANGIAN, transientInstance: () => false }), null);
    assert.equal(puzzlesFeature.partyTrip('plan', {}), null, 'a plain street needs no plan');
    assert.equal(puzzlesFeature.partyTrip('resume', {}, { hold: 'puzzles' }), null, 'the street itself is the way back');
  });

  it('a reload in a party that has ended goes back to the held spot; while it lives you stay', () => {
    puzzlesFeature.restore({ held: { tsid: ORANGIAN, x: 812, y: 400, taken: [], viaCard: true } });
    assert.deepEqual(puzzlesFeature.reloadLocation({ tsid: MOON }, party(false)), { tsid: ORANGIAN, x: 812, y: 400 });
    assert.equal(puzzlesFeature.reloadLocation({ tsid: MOON }, party(true)), null);
    assert.equal(puzzlesFeature.reloadLocation({ tsid: 'GLI2V0UN7RD1T2J' }, party(false)), null, 'only from a party space');
    puzzlesFeature.restore({});
  });

  it('back on the held street the run carries on: quoins hidden and not paid, in progress, the card trip kept', () => {
    const src = read('public/js/features/puzzles-feature.js');
    const enter = src.slice(src.indexOf('  onStreetEnter(street, engine) {'), src.indexOf('  onStreetClear(engine) {'));
    assert.match(enter, /startRun\(engine, street, def\);\s*run\.viaCard = viaCard;\s*applyHeld\(engine\);/);
    assert.match(enter, /save\.held\.tsid !== key\(tsid\) && !partySpaceForStreet\(tsid\)\) save\.held = null;/, 'a reload into the space keeps it');
    const apply = src.slice(src.indexOf('function applyHeld('), src.indexOf('/* Map card'));
    assert.match(apply, /run\.taken\.add\(q\.id\);/);
    assert.match(apply, /run\.viaCard = held\.viaCard;/);
    assert.match(apply, /run\.complete = held\.complete;/, 'a solved level is not paid again (complete() returns early)');
    assert.match(src, /function complete\(engine\) \{\s*if \(!run \|\| run\.complete\) return;/);
  });
});

describe('puzzle-scenes-feature', () => {
  it('holds only its own scene with a run; answers only its own hold', () => {
    puzzleScenesFeature.restore({});
    assert.equal(puzzleScenesFeature.partyTrip('plan', { inScene: () => true, sceneTsid: 'PUZZLESCENE_BEAM_ME_DOWN' }), null);
    assert.equal(puzzleScenesFeature.partyTrip('resume', {}, { hold: 'quest-instances' }), null);
  });

  it('a reload in a party that has ended goes back toward the scene; while it lives you stay', () => {
    const back = { tsid: 'GLI2V0UN7RD1T2J', x: 3082, y: 192 };
    puzzleScenesFeature.restore({ returnTo: back, away: { id: 'beam_me_down', x: 800, y: 5100, taken: ['b1_1'] } });
    assert.equal(puzzleScenesFeature.reloadLocation({ tsid: MOON }, party(true)), null);
    assert.deepEqual(puzzleScenesFeature.reloadLocation({ tsid: MOON }, party(false)), back);
    puzzleScenesFeature.restore({});
  });

  it('the scene is parked whole and, built again after a reload, keeps its way back and its taken quoins', () => {
    const src = read('public/js/features/puzzle-scenes-feature.js');
    const depart = src.slice(src.indexOf('function departForParty('), src.indexOf('function resumeFromParty('));
    assert.match(depart, /engine\.parkScene\?\.\(\{ sprites, targets: \[active\.exit\?\.target\] \}\)/);
    const resume = src.slice(src.indexOf('function resumeFromParty('), src.indexOf('async function leaveScene('));
    assert.match(resume, /startScene\(engine, held\.id, \{ returnTo: back \}\)/, 'not the party space as the way back');
    assert.match(resume, /active\.taken\.add\(id\);/);
    assert.match(src, /if \(active && !away && !isPuzzleSceneTsid\(street\?\.tsid\)\) active = null;/);
  });
});
