import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ROOK_AVATAR_HIT,
  ROOK_CRUSHERS,
  ROOK_CRUSHER_ART,
  ROOK_EGG_INITIAL_STATE,
  ROOK_EGG_SMASHED_STATE,
  ROOK_FOREST_ART_ID,
  ROOK_FOREST_DECOS,
  ROOK_FOREST_DEPTH_LAYERS,
  ROOK_FOREST_LIMBS,
  ROOK_NEST,
  ROOK_QUEST_ID,
  ROOK_REWARD,
  ROOK_TOOL_PROFILES,
  ROOK_WOODS_DURATION_MS,
  ROOK_WOODS_PLATFORMS,
  ROOK_WOODS_STREET_ID,
  beginRookWoods,
  completeRookEggSmash,
  createRookWoodsState,
  crusherArtScale,
  crusherCycleMs,
  crusherHitsAvatar,
  crusherMoodLoss,
  crusherPosition,
  expireRookWoods,
  findWorkingRookTool,
  recordCrusherHit,
  rookEggStateForProgress,
  rookWoodsGroundY,
  rookWoodsRemainingMs,
} from '../public/js/rook-woods.js?v=a77b5fe9';
import {
  createToolConditionState,
  setToolRemaining,
} from '../public/js/tools.js?v=9a2e7ef4';

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
  assert.match(game, /rook-woods\.js\?v=[\w-]+'/);
});

test('the Crushers are crusher.swf and the Egg sits in the rook_nest deco', () => {
  // crusher.swf (glitch-items, CC0) is one DefineShape on a one-frame timeline: one still.
  const plan = JSON.parse(fs.readFileSync(path.join(root, 'tools/rook-art/plan.json'), 'utf8'));
  const row = plan.pieces.find((p) => p.name === 'crusher');
  assert.equal(row.source, 'item:misc/crusher/crusher.swf');
  assert.equal(ROOK_CRUSHER_ART.swf, 'crusher.swf');
  assert.equal(ROOK_CRUSHER_ART.file, `assets/${row.file.slice('assets/'.length)}`);
  assert.match(ROOK_CRUSHER_ART.file, /@3x\.webp$/);
  assert.equal(fs.existsSync(path.join(root, 'public', ROOK_CRUSHER_ART.file)), true);
  assert.deepEqual([ROOK_CRUSHER_ART.w, ROOK_CRUSHER_ART.h], [row.w, row.h]);
  // Drawn at each spec's size (the footprint the collision bounds were tuned to); bounds unchanged.
  for (const spec of ROOK_CRUSHERS) {
    const drawn = Math.max(ROOK_CRUSHER_ART.w, ROOK_CRUSHER_ART.h) * crusherArtScale(spec);
    assert.ok(Math.abs(drawn - spec.size) < 1e-9, spec.id);
  }
  assert.deepEqual(ROOK_CRUSHERS.map((c) => c.size), [118, 112, 116, 120]);

  assert.equal(ROOK_NEST.asset, 'rook_nest.png');
  assert.equal(fs.existsSync(path.join(root, 'public/assets/decos/groddle/rook_nest.webp')), true);
  assert.ok(ROOK_NEST.w > 171 * 0.84, 'the nest is wider than the Egg');

  const game = fs.readFileSync(path.join(root, 'public/game.js'), 'utf8');
  const crusher = game.slice(game.indexOf('function drawRookCrusher(spec)'), game.indexOf('function spawnRookCrushers()'));
  assert.match(crusher, /textureFromUrl\(ROOK_CRUSHER_ART\.file\)/);
  assert.doesNotMatch(crusher, /PIXI\.Graphics/);
  const bg = game.slice(game.indexOf('function drawRookWoodsBackground()'), game.indexOf('function drawRookCrusher(spec)'));
  assert.match(bg, /ROOK_NEST\.asset/);
  assert.doesNotMatch(bg, /const nest = new PIXI\.Graphics/);
  assert.match(game, /rookCrusherArt = ROOK_CRUSHER_ART\.swf/);
  assert.match(game, /rookNestArt = /);
});

test('every Crusher can be passed on foot: a sweep clears a standing head, a drop leaves a gap you can time', () => {
  const game = fs.readFileSync(path.join(root, 'public/game.js'), 'utf8');
  // The avatar box, walk speed and jump come from the code that runs them.
  assert.match(game, /crusherHitsAvatar\(entry\.spec, entry\.position, \{\s*x: player\.x,\s*y: player\.y,\s*\.\.\.ROOK_AVATAR_HIT,\s*\}\)/);
  assert.match(game, /const platforms = ROOK_WOODS_PLATFORMS\.map/);
  const walkPerFrame = Number(/const max = ([\d.]+) \* movementBuff\.speed;/.exec(game)[1]);
  const jumpVelocity = Number(/const jumpVelocity = -([\d.]+) \* movementBuff\.jump;/.exec(game)[1]);
  const gravity = Number(/player\.vy \+= ([\d.]+) \* movementBuff\.gravity \* dt;/.exec(game)[1]);
  const walkPxPerMs = (walkPerFrame * 60) / 1000;
  let vy = -jumpVelocity;
  let rise = 0;
  let lift = 0;
  while (vy < 0) {
    vy += gravity;
    lift -= vy;
    rise = Math.max(rise, lift);
  }
  assert.ok(rise > 90 && rise < 130, `jump rise ${rise}`);

  const avatarAt = (x, up = 0) => ({ x, y: rookWoodsGroundY(x) - up, ...ROOK_AVATAR_HIT });
  const hitAt = (spec, ms, avatar) => crusherHitsAvatar(spec, crusherPosition(spec, ms), avatar);
  const routeEnd = ROOK_WOODS_PLATFORMS.at(-1).x2;
  const eggStand = 2140 - 72; // spawnRookEgg x, where you stand to Smash (autoplay's spot too)
  const STEP_MS = 10;
  for (const spec of ROOK_CRUSHERS) {
    const cycle = crusherCycleMs(spec);
    // Where on the route a standing avatar is ever hit.
    let lo = Infinity;
    let hi = -Infinity;
    for (let x = 0; x <= routeEnd; x += 2) {
      for (let ms = 0; ms < cycle; ms += STEP_MS) {
        if (hitAt(spec, ms, avatarAt(x))) {
          lo = Math.min(lo, x);
          hi = Math.max(hi, x);
          break;
        }
      }
    }
    assert.ok(!(eggStand >= lo && eggStand <= hi), `${spec.id} guards the Egg itself`);
    if (lo === Infinity) {
      // A sweep over the walking line: you walk under it, but a jump into it still hurts.
      assert.equal(spec.axis, 'x', `${spec.id} never threatens a standing avatar`);
      const reach = [spec.x, spec.x + spec.travel];
      let jumpHit = false;
      for (let x = reach[0]; x <= reach[1] && !jumpHit; x += 4) {
        for (let ms = 0; ms < cycle && !jumpHit; ms += STEP_MS) jumpHit = hitAt(spec, ms, avatarAt(x, rise));
      }
      assert.ok(jumpHit, `${spec.id} threatens a jump`);
      continue;
    }
    // A Crusher a standing avatar can meet: some start time walks through clean, with room to time it.
    let run = 0;
    let best = 0;
    for (let start = 0; start < cycle * 2; start += STEP_MS) {
      let clean = true;
      for (let x = lo - 2; x <= hi + 2 && clean; x += walkPxPerMs * STEP_MS) {
        clean = !hitAt(spec, start + (x - (lo - 2)) / walkPxPerMs, avatarAt(x));
      }
      run = clean ? run + STEP_MS : 0;
      best = Math.max(best, run);
    }
    assert.ok(best >= 300, `${spec.id}: the widest window to walk through is ${best} ms`);
  }
});
