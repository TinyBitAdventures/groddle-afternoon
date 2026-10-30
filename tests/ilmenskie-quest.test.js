import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  AXIS_DENYDE_STREET_ID,
  HOGTIED_JONES_ID,
  ILMENSKIE_QUEST_ID,
  ILMENSKIE_REWARD,
  canReleaseIlmenskieJones,
  createIlmenskieState,
  ensureIlmenskieState,
  ilmenskieObjective,
  meetIlmenskieJones,
  pickupIlmenskieJones,
  releaseIlmenskieJones,
  rememberIlmenskieSource,
} from '../public/js/ilmenskie-quest.js?v=0e9809ac';

const here = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(here, '..', 'public');

test('Ilmenskie quest exposes source-exact ids and rewards', () => {
  assert.equal(ILMENSKIE_QUEST_ID, 'teleportation_rescue_pig');
  assert.equal(AXIS_DENYDE_STREET_ID, 'GHFIV4V8J6J2I7U');
  assert.equal(HOGTIED_JONES_ID, 'hogtied_piggy_explorer');
  assert.deepEqual(ILMENSKIE_REWARD, {
    xp: 450,
    mood: 250,
    favor: { giant: 'lem', points: 40 },
  });
});

test('rescue follows meet, pickup, escape, and outside release order', () => {
  const state = createIlmenskieState();
  assert.equal(pickupIlmenskieJones(state).reason, 'meet_first');
  assert.equal(meetIlmenskieJones(state).ok, true);
  assert.equal(ilmenskieObjective(state, AXIS_DENYDE_STREET_ID), 'Pick up Ilmenskie Jones');
  assert.equal(pickupIlmenskieJones(state).ok, true);
  assert.equal(canReleaseIlmenskieJones(state, AXIS_DENYDE_STREET_ID).reason, 'still_in_cavern');
  assert.match(canReleaseIlmenskieJones(state, AXIS_DENYDE_STREET_ID).message, /mortal peril/);
  assert.equal(releaseIlmenskieJones(state, AXIS_DENYDE_STREET_ID).ok, false);
  assert.equal(ilmenskieObjective(state, AXIS_DENYDE_STREET_ID), 'Open Map and teleport out of Axis Denyde');
  assert.equal(releaseIlmenskieJones(state, 'GHVQOQ4F3N02H81').ok, true);
  assert.equal(state.phase, 'released');
});

test('story repair and source location are persistent and idempotent', () => {
  const quests = { story: {} };
  const state = ensureIlmenskieState(quests);
  rememberIlmenskieSource(state, { tsid: 'GSTART', x: 123, y: 456 });
  rememberIlmenskieSource(state, { tsid: 'GOTHER', x: 1, y: 2 });
  assert.deepEqual(state.sourceLocation, { tsid: 'GSTART', x: 123, y: 456 });
  assert.equal(ensureIlmenskieState(quests), state);
});

test('client ships original clean art, map teleportation, rescue verbs, and QA route', () => {
  const game = fs.readFileSync(path.join(publicDir, 'game.js'), 'utf8');
  const content = fs.readFileSync(path.join(publicDir, 'content.js'), 'utf8');
  const css = fs.readFileSync(path.join(publicDir, 'style.css'), 'utf8');
  for (const file of ['jones-walk.png', 'jones-look.png', 'hogtied-jones.png']) {
    assert.equal(
      fs.existsSync(path.join(publicDir, 'assets', 'sprites', 'quests', 'ilmenskie', file)),
      true
    );
  }
  assert.match(game, /teleportToAxisDenyde/);
  assert.match(game, /releasePackedIlmenskieJones/);
  assert.match(game, /jonesautoplay/);
  assert.match(content, /npc_piggy_explorer/);
  assert.match(css, /\.map-quest-teleport/);
});
