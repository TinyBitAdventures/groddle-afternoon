import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ROOK_CRUSHERS,
  ROOK_EGG_INITIAL_STATE,
  ROOK_EGG_SMASHED_STATE,
  ROOK_FOREST_ART_ID,
  ROOK_FOREST_DECOS,
  ROOK_FOREST_DEPTH_LAYERS,
  ROOK_FOREST_LIMBS,
  ROOK_QUEST_ID,
  ROOK_REWARD,
  ROOK_TOOL_PROFILES,
  ROOK_WOODS_DURATION_MS,
  ROOK_WOODS_STREET_ID,
  beginRookWoods,
  completeRookEggSmash,
  createRookWoodsState,
  crusherCycleMs,
  crusherHitsAvatar,
  crusherMoodLoss,
  crusherPosition,
  expireRookWoods,
  findWorkingRookTool,
  recordCrusherHit,
  rookEggStateForProgress,
  rookWoodsRemainingMs,
} from '../public/js/rook-woods.js';
import {
  createToolConditionState,
  setToolRemaining,
} from '../public/js/tools.js?v=woodcutting-test-8';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('Rooks’ Woods preserves the production quest contract', () => {
  assert.equal(ROOK_QUEST_ID, 'rook_egg_smash');
  assert.equal(ROOK_WOODS_STREET_ID, 'LLI1AD8LUCH109E');
  assert.equal(ROOK_WOODS_DURATION_MS, 120_000);
  assert.deepEqual(ROOK_REWARD, {
    xp: 1000,
    currants: 500,
    mood: 200,
    energy: 50,
  });
  assert.equal(ROOK_CRUSHERS.length, 4);
});

test('the instance waits for its warning, then expires exactly two minutes later', () => {
  const state = createRookWoodsState({
    sourceLocation: { tsid: 'GLI2V0UN7RD1T2J', x: 123, y: 456 },
  });
  assert.equal(state.status, 'warning');
  assert.equal(rookWoodsRemainingMs(state, 99_000), 120_000);
  assert.equal(beginRookWoods(state, 10_000).ok, true);
  assert.equal(rookWoodsRemainingMs(state, 10_500), 119_500);
  assert.equal(expireRookWoods(state, 129_999).reason, 'time_remaining');
  assert.equal(expireRookWoods(state, 130_000).ok, true);
  assert.equal(state.status, 'expired');
});

test('starting and smashing require one working source-approved tool', () => {
  const tools = createToolConditionState();
  setToolRemaining(tools, 'pick', 0);
  const quote = findWorkingRookTool({ pick: 1, hatchet: 1 }, tools);
  assert.equal(quote.ok, true);
  assert.equal(quote.classTsid, 'hatchet');
  assert.equal(quote.profile.durationMs, 3320);
  assert.equal(ROOK_TOOL_PROFILES.pick.durationMs, 4800);
  assert.equal(ROOK_TOOL_PROFILES.fancy_pick.durationMs, 4800);

  setToolRemaining(tools, 'hatchet', 0);
  assert.equal(findWorkingRookTool({ pick: 1, hatchet: 1 }, tools).ok, false);
});

test('the recovered five-state Egg cracks through four ticks and completes once', () => {
  assert.equal(rookEggStateForProgress(0), ROOK_EGG_INITIAL_STATE);
  assert.equal(rookEggStateForProgress(0.24), 5);
  assert.equal(rookEggStateForProgress(0.25), 4);
  assert.equal(rookEggStateForProgress(0.5), 3);
  assert.equal(rookEggStateForProgress(0.75), 2);
  assert.equal(rookEggStateForProgress(1), ROOK_EGG_SMASHED_STATE);

  const state = createRookWoodsState();
  beginRookWoods(state, 0);
  const result = completeRookEggSmash(state, 'pick');
  assert.equal(result.ok, true);
  assert.equal(state.status, 'complete');
  assert.equal(state.eggState, 1);
  assert.equal(completeRookEggSmash(state, 'pick').ok, false);
});

test('Crushers use the server wait, strike, impact, and ratchet cycle', () => {
  const crusher = {
    axis: 'y',
    x: 50,
    y: 100,
    travel: 100,
    topDelayMs: 1000,
    bottomDelayMs: 500,
    ratchetSteps: 2,
    phaseOffsetMs: 0,
    size: 120,
  };
  assert.equal(crusherCycleMs(crusher), 4500);
  assert.deepEqual(
    [0, 1000, 1500, 2000, 2500, 3500, 4500].map((at) => {
      const p = crusherPosition(crusher, at);
      return [p.phase, Math.round(p.y)];
    }),
    [
      ['waiting', 100],
      ['striking', 100],
      ['striking', 150],
      ['impact', 200],
      ['ratcheting', 200],
      ['ratcheting', 150],
      ['waiting', 100],
    ]
  );
  assert.equal(
    crusherHitsAvatar(crusher, { x: 50, y: 200 }, { x: 50, y: 235 }),
    true
  );
  assert.equal(
    crusherHitsAvatar(crusher, { x: 50, y: 200 }, { x: 250, y: 235 }),
    false
  );
});

test('Crusher hits retain source mood math and run-state accounting', () => {
  const state = createRookWoodsState();
  beginRookWoods(state, 0);
  assert.equal(crusherMoodLoss(765, 115), 12);
  assert.equal(recordCrusherHit(state, 'root_drop').hits, 1);
  assert.equal(state.lastCrusherId, 'root_drop');
});

test('client ships recovered Egg art and transient-instance integration', () => {
  const game = fs.readFileSync(path.join(root, 'public/game.js'), 'utf8');
  const html = fs.readFileSync(path.join(root, 'public/play/index.html'), 'utf8');
  const css = fs.readFileSync(path.join(root, 'public/style.css'), 'utf8');
  const egg = path.join(
    root,
    'public/assets/sprites/quests/rook-woods/rook-egg-states.png'
  );
  assert.equal(fs.existsSync(egg), true);
  assert.match(game, /startRookWoodsQuest/);
  assert.match(game, /updateRookWoods/);
  assert.match(game, /rook_egg_smashed/);
  assert.match(game, /rookautoplay/);
  assert.match(html, /id="rook-woods-hud"/);
  assert.match(css, /\.rook-woods-hud/);
});

test('Rooks’ Woods uses a deterministic clean-asset forest with readable depth', () => {
  assert.equal(ROOK_FOREST_ART_ID, 'clean-layered-silhouettes');
  assert.deepEqual(
    ROOK_FOREST_DEPTH_LAYERS.map((layer) => layer.id),
    ['distant', 'midground', 'canopy', 'roots']
  );
  assert.equal(ROOK_FOREST_DECOS.length, 31);
  assert.equal(ROOK_FOREST_LIMBS.length, 5);
  assert.ok(ROOK_FOREST_DECOS.every((deco) => (
    ROOK_FOREST_DEPTH_LAYERS.some((layer) => layer.id === deco.layer)
  )));
  assert.ok(ROOK_FOREST_LIMBS.every((limb) => (
    limb.points.length >= 8 &&
    limb.points.length % 2 === 0 &&
    limb.width >= 30
  )));

  for (const deco of ROOK_FOREST_DECOS) {
    const asset = path.join(root, 'public/assets/decos/groddle', deco.asset.replace(/\.png$/, '.webp'));
    assert.equal(fs.existsSync(asset), true, `missing clean Rooks’ Woods deco: ${deco.asset}`);
  }

  const game = fs.readFileSync(path.join(root, 'public/game.js'), 'utf8');
  assert.match(game, /rookForestArt/);
  assert.match(game, /ROOK_FOREST_DEPTH_LAYERS/);
  assert.match(game, /rook-woods\.js\?v=rook-woods-9/);
});
