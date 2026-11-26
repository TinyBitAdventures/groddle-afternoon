import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  AXIS_DENYDE_STREET_ID,
  CAVE_IN_BOX_ID,
  CAVE_IN_HINT,
  CAVE_IN_STREET_ID,
  caveInHint,
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
} from '../public/js/ilmenskie-quest.js?v=433ca65b';

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
  for (const file of ['jones-walk.webp', 'jones-look.webp', 'hogtied-jones.webp']) {
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

test('the story-quest offer waits for teleportation_4, the skill whose quest it is (quests.json offerTriggers)', async () => {
    const src = fs.readFileSync(new URL('../public/game.js', import.meta.url), 'utf8');
    const quests = JSON.parse(fs.readFileSync(new URL('../public/assets/content/quests.json', import.meta.url), 'utf8'));
    const def = (quests.quests || quests).teleportation_rescue_pig;
    assert.deepEqual(def.offerTriggers, [{ type: 'skill', skill: 'teleportation_4' }]);
    assert.match(src, /const ILMENSKIE_SKILL_ID = 'teleportation_4';/);
    const fn = src.slice(src.indexOf('function canOfferStoryQuest('), src.indexOf('function appendStoryQuestOffers('));
    assert.match(fn, /classTsid === ILMENSKIE_QUEST_ID\) return \(skillState\.learned \|\| \[\]\)\.includes\(ILMENSKIE_SKILL_ID\)/);
});

test('G1168: Intate Treats caveIn box gives the familiar hint once (teleportation_rescue_pig.js callback_caveIn 70-79)', () => {
  assert.equal(CAVE_IN_BOX_ID, 'caveIn');
  const street = JSON.parse(fs.readFileSync(path.join(publicDir, 'assets/streets', `${CAVE_IN_STREET_ID}.json`), 'utf8'));
  assert.equal(street.label, 'Intate Treats');
  assert.ok((street.boxes || []).some((b) => b.id === CAVE_IN_BOX_ID));
  assert.equal(
    CAVE_IN_HINT,
    'Looks like you can\'t get in this way, kid. Those rocks aren\'t going anywhere.<split butt_txt="Hm…" />You\'re going to need to find another way in.',
  );
  const state = createIlmenskieState();
  assert.equal(caveInHint(state, { carryingJones: true }), null, 'not with Jones in the pack');
  assert.equal(caveInHint(state), CAVE_IN_HINT);
  assert.equal(state.explainedCaveIn, true);
  assert.equal(caveInHint(state), null, 'once a quest run');
  const qs = { story: { ilmenskie: { ...state } } };
  assert.equal(ensureIlmenskieState(qs).explainedCaveIn, true, 'kept across a reload');
  const gs = path.join(here, '..', '..', 'glitch-GameServerJS', 'quests/teleportation_rescue_pig.js');
  if (fs.existsSync(gs)) {
    const src = fs.readFileSync(gs, 'utf8');
    assert.ok(src.includes(`'txt': "${CAVE_IN_HINT.replace(/"/g, '\\"')}",`));
  }
  const game = fs.readFileSync(path.join(publicDir, 'game.js'), 'utf8');
  assert.match(game, /caveInHint\(ilmenskieStory\(\), \{ carryingJones: countItem\(inv, HOGTIED_JONES_ID\) > 0 \}\)/);
  assert.match(game, /run\('ilmenskie cave-in', stepIlmenskieCaveIn\)/);
});
