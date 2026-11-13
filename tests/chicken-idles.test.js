/**
 * A Chicken's idle states (js/chicken-idles.js, js/chicken-idle-art.js, lane refsart): the
 * original's pause states and its look at a player, drawn from Tiny Speck's own sheets. The
 * rules are read against npc_chicken.js and npc_chicken.fla when they are beside the repo, the
 * grids against the shipped files.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  CHICKEN_IDLE_FPS,
  CHICKEN_IDLE_FRAMES,
  CHICKEN_LOOPERS,
  CHICKEN_PAUSE_STATES,
  chickenIdleFrame,
  chickenIdleSheet,
  chickenPoseState,
  chickenWaitPose,
} from '../public/js/chicken-idles.js?v=eef0279b';
import { PACKED_SHEETS } from '../public/js/packed-sheets-data.js?v=192c6f15';
import { packedCell, packedDurationMs, packedFrameAt, packedRect } from '../public/js/packed-sheets.js?v=379a15fc';
import { CHICKEN_PAUSE, chickenPlan, chickenSeed, chickenWalkAt } from '../public/js/street-creatures.js?v=4a0738f6';
import { yardPlan, yardWanderAt, followYardPath } from '../public/js/yard-wander.js?v=39be1110';
import { imageSize } from '../tools/image-size.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(root, 'public', rel), 'utf8');
const GSJS = join(root, '..', 'glitch-GameServerJS', 'items', 'npc_chicken.js');
const FLA = join(root, '..', 'glitch-items', 'inhabitants', 'chicken', 'npc_chicken.fla');

describe('the source says what the rules say', { skip: existsSync(GSJS) ? false : 'clone tinyspeck/glitch-GameServerJS beside the repo' }, () => {
  const src = existsSync(GSJS) ? readFileSync(GSJS, 'utf8') : '';
  const fn = (name) => src.slice(src.indexOf(`function ${name}(`), src.indexOf('\n}\n', src.indexOf(`function ${name}(`)));

  it('pause_state_choices: the eight choices, in order, with their seconds', () => {
    const block = src.slice(src.indexOf('var pause_state_choices = ['), src.indexOf('];', src.indexOf('var pause_state_choices = [')));
    const rows = [...block.matchAll(/\[(\d+),\s*['"](\w+)['"]\]/g)].map((m) => [Number(m[1]), m[2]]);
    assert.deepEqual(rows, CHICKEN_PAUSE_STATES.map((r) => [...r]));
    assert.deepEqual(CHICKEN_PAUSE.choices.map((r) => [...r]), rows.map(([s, state]) => [s * 1000, state]));
  });

  it('onWaitStart: nothing when rooked or sad; else, not flying and not on an egg, it stops and its state is verb', () => {
    const body = fn('onWaitStart');
    assert.match(body, /if \(this\.isRooked\(\)\) return;\s+if \(this\.isSad\(\)\) return;/);
    assert.match(body, /if \(\(!this\['!is_flying'\] && !this\.incubating\)\)\{\s+this\.apiStopMoving\(\);\s+this\.state = 'verb';/);
    assert.equal(chickenWaitPose({}), 'verb');
    assert.equal(chickenWaitPose({ rooked: true }), '');
    assert.equal(chickenWaitPose({ sad: true }), '');
    assert.equal(chickenWaitPose({ flying: true }), '');
    assert.equal(chickenWaitPose({ incubating: true }), 'stand');
  });

  it('onPause takes a choice as its state and walks on after its seconds', () => {
    const body = fn('onPause');
    assert.match(body, /var choice = choose_one\(this\.pause_state_choices\);\s+this\.state = choice\[1\];/);
    assert.match(body, /this\.apiSetTimer\('startMoving', choice\[0\] \* 1000\);/);
    assert.match(body, /this\.apiSetTimer\('onPause', randInt\(6000, 14000\)\);/);
  });
});

describe('how the client played a state', () => {
  it('none of the idle states loops: the .fla lists only the walk and the flights', { skip: existsSync(FLA) ? false : 'clone tinyspeck/glitch-items beside the repo' }, () => {
    // unzip warns about this archive's directory length and still prints the file.
    const xml = spawnSync('unzip', ['-p', FLA, 'DOMDocument.xml'], { encoding: 'utf8', maxBuffer: 1 << 28 }).stdout || '';
    if (!xml.includes('loopers')) return;
    const loopers = /loopers = \[([^\]]*)\]/.exec(xml)[1].split(',').map((s) => s.trim().replace(/^'|'$/g, ''));
    assert.deepEqual(loopers, [...CHICKEN_LOOPERS]);
    for (const state of Object.keys(CHICKEN_IDLE_FRAMES)) assert.ok(!loopers.includes(state), state);
    const animations = /animations = \[([^\]]*)\]/.exec(xml)[1];
    for (const state of Object.keys(CHICKEN_IDLE_FRAMES)) assert.ok(animations.includes(`'${state}'`), `${state} is one of the animatee's states`);
  });

  it('plays once at 30 frames a second and holds its last frame', () => {
    assert.equal(CHICKEN_IDLE_FPS, 30);
    assert.equal(chickenIdleFrame('idle1', 0), 0);
    assert.equal(chickenIdleFrame('idle1', 1000), 30);
    assert.equal(chickenIdleFrame('idle1', 2233), 66, 'the 67th frame at 2.2 s');
    assert.equal(chickenIdleFrame('idle1', 3999), 66, 'and still there when its 4 s are up');
    assert.equal(chickenIdleFrame('pause', 3999), 119, 'pause is 131 frames: it walks on before its end');
    assert.equal(chickenIdleFrame('pecking_twice', 2999), 39);
    assert.equal(chickenIdleFrame('nonsense', 500), 0);
  });

  it('names: the older stand and peck still mean something', () => {
    assert.equal(chickenPoseState('walk'), 'walk');
    assert.equal(chickenPoseState('stand'), 'stand');
    assert.equal(chickenPoseState('peck'), 'pecking_once');
    assert.equal(chickenPoseState('idle2'), 'idle2');
    assert.equal(chickenPoseState('verb'), 'verb');
    assert.equal(chickenPoseState('sit'), 'stand');
  });
});

describe('the sheets', () => {
  // Measured from Tiny Speck's OGA sheets (148 x 110 cells): the sheet's size, its frames, its distinct cells.
  const MEASURED = {
    idle1: { size: [888, 1320], frames: 67, cells: 49 },
    idle2: { size: [888, 880], frames: 47, cells: 45 },
    idle3: { size: [888, 1650], frames: 86, cells: 56 },
    pause: { size: [888, 2420], frames: 131, cells: 42 },
    pecking_twice: { size: [888, 770], frames: 40, cells: 29 },
    verb: { size: [888, 1100], frames: 55, cells: 30 },
  };

  it('are the six states, with the frames the SWF and the OGA sheets have', () => {
    assert.deepEqual(Object.keys(PACKED_SHEETS.chicken), Object.keys(MEASURED));
    const results = JSON.parse(readFileSync(join(root, 'tools/packed-sheets/results.json'), 'utf8')).sheets;
    for (const [state, m] of Object.entries(MEASURED)) {
      const def = chickenIdleSheet(state);
      assert.equal(def.plays, m.frames, state);
      assert.equal(def.plays, CHICKEN_IDLE_FRAMES[state], state);
      assert.equal(def.frames, m.cells, state);
      assert.deepEqual([...def.cell], [148, 110], state);
      assert.equal(def.fps, 30, state);
      assert.equal(def.loop, false, state);
      const row = results.find((r) => r.set === 'chicken' && r.name === state);
      assert.deepEqual(row.oga.size, m.size, `${state}: the OGA sheet's size`);
      assert.equal(row.oga.cols, 6, state);
      assert.equal(row.oga.cols * row.oga.rows >= m.frames && row.oga.cols * (row.oga.rows - 1) < m.frames, true, `${state}: its frames end in the last row`);
      // The 3x render's frames: one SWF frame per packed cell, inside the state's label.
      assert.equal(row.frameList.length, m.cells, state);
      assert.equal(row.frameList[0], row.frameList.reduce((a, b) => Math.min(a, b)), state);
    }
    assert.equal(chickenIdleSheet('pecking_once'), null, "pecking_once is game.js's own chickenPeck sheet");
    assert.match(read('game.js'), /chickenPeck: \{\s+url: 'assets\/sprites\/npc_chicken__x1_pecking_once_png_1354830398\.webp',\s+fw: 148, fh: 110, cols: 6, rows: 6, frameCount: 32,/);
    assert.equal(CHICKEN_IDLE_FRAMES.pecking_once, 32);
  });

  it('each file is its packed grid, its box inside the cell, with a 3x twin three times its size', () => {
    const hires = read('js/sprite-hires.js');
    for (const [state, def] of Object.entries(PACKED_SHEETS.chicken)) {
      const file = join(root, 'public', def.path);
      assert.ok(existsSync(file), def.path);
      const { w, h } = imageSize(file);
      assert.equal(w, def.cols * def.fw, def.path);
      assert.equal(h, Math.ceil(def.frames / def.cols) * def.fh, def.path);
      assert.ok(def.at[0] >= 0 && def.at[1] >= 0 && def.at[0] + def.fw <= def.cell[0] && def.at[1] + def.fh <= def.cell[1], `${state}: the box is inside the cell`);
      assert.equal(def.seq.length, def.plays, state);
      assert.equal(Math.max(...def.seq), def.frames - 1, state);
      assert.equal(new Set(def.seq).size, def.frames, `${state}: every packed cell is shown`);
      const twin = def.path.replace('.webp', '@3x.webp');
      const big = imageSize(join(root, 'public', twin));
      assert.deepEqual([big.w, big.h], [w * 3, h * 3], twin);
      assert.ok(hires.includes(`"${def.path}", "${twin}"`), `${def.path} in js/sprite-hires.js`);
      // Swapped to 3x when first drawn, never at boot.
      assert.match(hires.slice(hires.indexOf('FIRST_DRAW_SPRITES')), new RegExp(`"${def.path.replace(/[.]/g, '\\.')}"`), `${def.path} waits for its first draw`);
    }
  });

  it('the feet stay where the walk puts them: every state stands on the walk sheet\'s line', () => {
    // The walk's art ends at row 98 of its 110 px cell (measured), the anchor game.js uses; an idle's
    // box reaches at least that far down, so the trim puts its feet on the same line.
    for (const [state, def] of Object.entries(PACKED_SHEETS.chicken)) {
      assert.ok(def.at[1] + def.fh >= 97, `${state}: reaches the feet line (${def.at[1] + def.fh})`);
      assert.ok(def.at[1] + def.fh <= 110, state);
    }
  });

  it('a frame is found in the packed grid by its seq', () => {
    const def = PACKED_SHEETS.chicken.pause;
    assert.equal(packedCell(def, 0), 0);
    assert.equal(packedCell(def, 20), 15, 'frames 15-43 are one picture');
    assert.equal(packedCell(def, 43), 15);
    assert.equal(packedCell(def, 130), 15, 'and it ends on it');
    assert.equal(packedCell(def, 999), 15, 'past the end is the last frame');
    assert.deepEqual(packedRect(def, 8), { x: 60, y: 71, w: 60, h: 71 });
    assert.equal(packedFrameAt(def, 1000), 30);
    assert.equal(packedFrameAt(def, 60000), 130);
    assert.equal(packedFrameAt({ ...def, loop: true }, (131 * 1000) / 30 + 34), 1);
    assert.equal(Math.round(packedDurationMs(def)), 4367);
  });

  it('the builder is current', () => {
    let out;
    try {
      out = execFileSync('python3.11', ['-I', join(root, 'tools/packed-sheets/build.py'), '--check'], { encoding: 'utf8' });
    } catch (err) {
      if (/ENOENT|No module named/.test(String(err.stderr || err))) return;
      throw new Error(String(err.stdout || err));
    }
    assert.match(out, /packed sheets: \d+ current/);
  });
});

describe('where a Chicken shows them', () => {
  const home = { baseX: 1000, range: 100, dir: 1 };
  const seed = chickenSeed(0, home.baseX);

  it('the shared path names the state and how far into it it is, the same on every page', () => {
    const plan = chickenPlan(home, seed);
    const pauses = plan.segs.filter((g) => g.pose !== 'walk');
    assert.equal(pauses.length, 8);
    for (const g of pauses) {
      assert.ok(Object.hasOwn(CHICKEN_IDLE_FRAMES, g.pose), g.pose);
      const mid = chickenWalkAt(home, 3 * plan.ms + g.at + 1500, seed);
      assert.equal(mid.pose, g.pose);
      assert.ok(Math.abs(mid.poseMs - 1500) < 1e-3, `1.5 s into ${g.pose}: ${mid.poseMs}`);
      assert.equal(chickenIdleFrame(mid.pose, mid.poseMs), Math.min(CHICKEN_IDLE_FRAMES[g.pose] - 1, 45));
    }
  });

  it('the path itself is where it was before the states had names', () => {
    // The round of home 1000 ± 100, seed chickenSeed(0, 1000): when each pause starts (ms), as main
    // drew it before this lane (277 plans compared against main's module when this was written).
    const plan = chickenPlan(home, seed);
    assert.equal(Math.round(plan.ms), 82399);
    assert.deepEqual(plan.segs.filter((g) => g.pose !== 'walk').map((g) => [Math.round(g.at), g.pose]), [
      [13300, 'idle1'], [20454, 'idle2'], [26875, 'pause'], [34551, 'idle2'],
      [44943, 'pecking_twice'], [54064, 'idle2'], [62833, 'idle3'], [76591, 'idle1'],
    ]);
    const src = read('js/street-creatures.js');
    assert.match(src, /const \[holdMs, pose\] = choices\[Math\.min\(choices\.length - 1, Math\.floor\(rng\(\) \* choices\.length\)\)\];\n\s+const turn = rng\(\) < turnChance;/, 'the rolls are drawn as before');
  });

  it('one of your Chickens keeps the state its pause rolled, and the walk is unchanged', () => {
    const hen = yardPlan({ id: 'a3', classId: 'npc_chicken', left: 400, right: 620 });
    const stands = hen.segs.filter((g) => g.pose === 'stand');
    assert.ok(stands.length >= 4);
    for (const g of stands) {
      assert.ok(Object.hasOwn(CHICKEN_IDLE_FRAMES, g.idle), g.idle);
      assert.equal(g.ms, CHICKEN_PAUSE.choices.find(([, s]) => s === g.idle)[0]);
    }
    const pig = yardPlan({ id: 'a3', classId: 'npc_piggy', left: 400, right: 620 });
    assert.ok(pig.segs.every((g) => g.idle === undefined), 'a Piggy has none');
    // On the path, standing: followYardPath hands the state on.
    const animal = { id: 'a3', classId: 'npc_chicken', homeX: 500, worldW: 3000 };
    let seen = null;
    for (let t = 0; t < 120000 && !seen; t += 250) {
      const at = yardWanderAt(animal, t);
      if (at.idle) seen = { t, at };
    }
    assert.ok(seen, 'it pauses within two minutes');
    const spr = { x: seen.at.x, y: 502, baseScale: 0.7, scale: { x: 0.7, y: 0.7 } };
    const drawn = followYardPath(spr, { holdUntil: 0 }, { animal, nowMs: seen.t + 1247241600000, dtMs: 16.67, held: false, groundAt: () => 500 });
    if (drawn.idle) {
      assert.equal(drawn.idle, seen.at.idle);
      assert.equal(drawn.moving, false);
    }
    const held = followYardPath(spr, { holdUntil: 0 }, { animal, nowMs: seen.t, dtMs: 16.67, held: true, groundAt: () => 500 });
    assert.equal(held.idle, undefined, 'held for a player, the path has no say');
  });

  it('game.js: every pause frame carries its time, a player at it gets the look, QA can force a state', () => {
    const game = read('game.js');
    assert.match(game, /spr\.walkPose = \(pose, ms = null\) => \{\s+const shown = chickenPose\(PIXI, textures, spr, pose, ms\);/);
    assert.match(game, /c\.walkPose\?\.\(c\._pause\.pose, c\._pause\.ms - c\._pause\.left\);/);
    assert.match(game, /const pose = chickenWaitPose\(\{\s+rooked: Boolean\(features\.query\('targetRooked', at, engine\)\),\s+sad: isCrowdSad\(at\?\.state, Date\.now\(\)\),\s+incubating: Boolean\(at\?\.state\?\.incubatingEgg\),\s+\}\);\s+if \(pose\) c\.walkPose\?\.\(pose\);/);
    assert.match(game, /const CHICKEN_IDLE_QA = String\(new URLSearchParams\(location\.search\)\.get\('chickenidle'\) \|\| ''\);/);
    // The flight comes first, as it did (tests/chicken-scare.test.js): a scared Chicken is not posed.
    assert.ok(game.indexOf('if (c._scareFlight) continue;') < game.indexOf('const pose = chickenWaitPose({'));
  });

  it('your own and a visited yard\'s: an idle is no hold, a one-shot still is, and both go through one function', () => {
    for (const f of ['animal-husbandry-feature.js', 'yard-verbs-mp-feature.js']) {
      const src = read(`js/features/${f}`);
      assert.match(src, /const oneShot = !spr\.loop && !\(chicken && showsChickenIdle\(spr, engine\.textures\)\);/, f);
      assert.match(src, /if \(!oneShot\) yardChickenPose\(engine\.PIXI, engine\.textures, spr, at, /, f);
    }
    const art = read('js/chicken-idle-art.js');
    // A squeeze or a scared hop (a one-shot with something to do after) plays to its end first.
    assert.match(art, /if \(!spr \|\| spr\.destroyed \|\| \(!spr\.loop && spr\.onComplete\)\) return '';/);
    // Nothing is fetched at boot: a sheet is asked for when its state is first wanted.
    assert.doesNotMatch(art, /loadAll\(/);
    assert.match(art, /if \(!loader\.ready\(def\)\) \{\s+asked\.add\(state\);\s+loader\.load\(def\);\s+return \[\];/);
  });
});

describe('the pose on a sprite', () => {
  // A stand-in for Pixi's AnimatedSprite, enough for chickenPose.
  const sprite = (textures) => ({
    textures,
    loop: true,
    playing: true,
    onComplete: null,
    animationSpeed: 0.12,
    at: 0,
    gotoAndPlay(k) { this.at = k; this.playing = true; },
    gotoAndStop(k) { this.at = k; this.playing = false; },
    play() { this.playing = true; },
  });
  const frames = (n, tag) => Array.from({ length: n }, (_, i) => ({ tag, i }));
  const table = { chickenWalk: { frames: frames(24, 'walk') }, chickenStand: { frames: frames(1, 'stand') }, chickenPeck: { frames: frames(32, 'peck') } };

  it('pecking_once plays once from the shared frame and holds; walk and stand are as they were', async () => {
    const { chickenPose, showsChickenIdle } = await import('../public/js/chicken-idle-art.js?v=556916bb');
    const spr = sprite(table.chickenWalk.frames.slice(0, 6));
    assert.equal(chickenPose(null, table, spr, 'pecking_once', 500), 'pecking_once');
    assert.equal(spr.textures, table.chickenPeck.frames);
    assert.equal(spr.loop, false);
    assert.equal(spr.animationSpeed, 0.5);
    assert.equal(spr.at, 15);
    assert.equal(spr.playing, true);
    assert.equal(showsChickenIdle(spr, table), true);
    // Again the next frame: it plays on, it is not restarted.
    spr.at = 20;
    assert.equal(chickenPose(null, table, spr, 'pecking_once', 520), 'pecking_once');
    assert.equal(spr.at, 20);
    // Joined after its end, it stands on the last frame.
    const late = sprite(table.chickenWalk.frames.slice(0, 6));
    chickenPose(null, table, late, 'peck', 1900);
    assert.equal(late.at, 31);
    assert.equal(late.playing, false);
    // Walking on.
    assert.equal(chickenPose(null, table, spr, 'walk'), 'walk');
    assert.equal(spr.textures.length, 6);
    assert.equal(spr.loop, true);
    assert.equal(spr.animationSpeed, 0.12);
    assert.equal(showsChickenIdle(spr, table), false);
    assert.equal(chickenPose(null, table, spr, 'stand'), 'stand');
    assert.equal(spr.textures, table.chickenStand.frames);
    assert.equal(spr.playing, false);
  });

  it('a state whose sheet is not in yet shows the still, and a squeeze is left to finish', async () => {
    const { chickenPose } = await import('../public/js/chicken-idle-art.js?v=556916bb');
    const spr = sprite(table.chickenWalk.frames.slice(0, 6));
    assert.equal(chickenPose(null, table, spr, 'idle2', 100), 'stand', 'no Pixi here, so no sheet: the still');
    assert.equal(spr.textures, table.chickenStand.frames);
    const squeezing = sprite(table.chickenPeck.frames.slice(0, 6));
    squeezing.loop = false;
    squeezing.onComplete = () => {};
    assert.equal(chickenPose(null, table, squeezing, 'verb'), '');
    assert.equal(squeezing.textures.length, 6);
  });
});
