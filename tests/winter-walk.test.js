import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  WINTER_HAVEN_STREET_ID,
  WINTER_MOTE_REWARDS,
  WINTER_WALK_DURATION_MS,
  WINTER_WALK_ICE_REWARD,
  WINTER_WALK_QUEST_ID,
  WINTER_WALK_STREET_ID,
  collectWinterMote,
  createWinterWalkState,
  enterWinterHaven,
  expireWinterWalk,
  finishWinterWalk,
  returnToWinterWalk,
  winterWalkObjective,
  winterWalkProgress,
  winterWalkRemainingMs,
} from '../public/js/winter-walk.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(here, '..', 'public');

test('Winter Walk uses the source timer, quest id, and first-run ice reward', () => {
  assert.equal(WINTER_WALK_QUEST_ID, 'winter_walk');
  assert.equal(WINTER_WALK_DURATION_MS, 300000);
  assert.equal(WINTER_WALK_ICE_REWARD, 23);
  assert.equal(WINTER_WALK_STREET_ID, 'GHF8LE0Q0UC3QEF');
  assert.equal(WINTER_HAVEN_STREET_ID, 'GHFA15VS0UC3ITS');
});

test('motes are stage-bound, unique, and reproduce visible iMG moments', () => {
  const state = createWinterWalkState({ now: 1000 });
  assert.equal(collectWinterMote(state, 'haven', 0, 1100).reason, 'wrong_stage');
  assert.equal(collectWinterMote(state, 'surface', 0, 1100).amount, 120);
  assert.equal(collectWinterMote(state, 'surface', 0, 1200).reason, 'already_collected');
  assert.equal(collectWinterMote(state, 'surface', 2, 1300).amount, 3000);
  assert.deepEqual(winterWalkProgress(state), {
    collected: 2,
    total: Object.values(WINTER_MOTE_REWARDS).reduce(
      (sum, rewards) => sum + rewards.length,
      0
    ),
  });
  assert.equal(state.imgEarned, 3120);
});

test('route returns from the haven to the snowy finale and rewards only the first run', () => {
  const first = createWinterWalkState({ now: 0 });
  assert.match(winterWalkObjective(first), /snowy path/);
  assert.equal(enterWinterHaven(first, 1000).ok, true);
  assert.match(winterWalkObjective(first), /Climb/);
  assert.equal(finishWinterWalk(first, 1500).reason, 'wrong_stage');
  assert.equal(returnToWinterWalk(first, 2000).ok, true);
  assert.match(winterWalkObjective(first), /last winter motes/);
  assert.equal(collectWinterMote(first, 'return', 0, 2100).amount, 1098);
  assert.equal(collectWinterMote(first, 'return', 1, 2200).amount, 600);
  assert.equal(collectWinterMote(first, 'return', 2, 2300).amount, 720);
  const done = finishWinterWalk(first, 2400);
  assert.equal(done.ok, true);
  assert.equal(done.iceReward, 23);

  const repeat = createWinterWalkState({ now: 0, repeat: true });
  enterWinterHaven(repeat, 1000);
  returnToWinterWalk(repeat, 1500);
  assert.equal(finishWinterWalk(repeat, 2000).iceReward, 0);
});

test('five-minute expiry is exact and blocks late route progress', () => {
  const state = createWinterWalkState({ now: 5000 });
  assert.equal(winterWalkRemainingMs(state, 304999), 1);
  assert.equal(expireWinterWalk(state, 304999).reason, 'time_remaining');
  assert.equal(collectWinterMote(state, 'surface', 0, 305000).reason, 'expired');
  assert.equal(state.status, 'expired');
});

test('client ships clean recovered exit art, three-phase routing, snow, and autoplay QA', () => {
  const game = fs.readFileSync(path.join(publicDir, 'game.js'), 'utf8');
  const html = fs.readFileSync(path.join(publicDir, 'play/index.html'), 'utf8');
  const css = fs.readFileSync(path.join(publicDir, 'style.css'), 'utf8');
  assert.equal(fs.existsSync(path.join(publicDir, 'assets', 'sprites', 'icons', 'ice.png')), true);
  assert.equal(
    fs.existsSync(path.join(publicDir, 'assets', 'decos', 'groddle', 'sign_exit_starter_01a.png')),
    true
  );
  assert.equal(
    fs.existsSync(path.join(publicDir, 'assets', 'decos', 'groddle', 'ladder_interior_4steps.png')),
    true
  );
  assert.match(game, /spawnWinterSnow/);
  assert.match(game, /enterWinterHavenStage/);
  assert.match(game, /reenterWinterWalkStage/);
  assert.match(game, /surface>haven>return/);
  assert.match(game, /recovered-exit-ladder/);
  assert.match(game, /white-home-light/);
  assert.match(game, /winterautoplay/);
  assert.match(game, /winterpreview/);
  assert.match(html, /id="winter-walk-hud"/);
  assert.match(css, /\.winter-walk-hud/);
});
