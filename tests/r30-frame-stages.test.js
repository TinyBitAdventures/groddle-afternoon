/**
 * R30 (#513, several players froze in a Double Rainbow Party Space while the HUD kept working):
 * the whole frame ran inside one guard, so a stage early in it that threw every frame (the tool
 * copies, the current action, input or physics) skipped every stage after it, movement included,
 * and was reported once as "game loop". Each stage now has its own guard (feature-host
 * createFrameStages): a throw is reported once with its stage's name and the other stages run.
 * Run: node --test tests/r30-frame-stages.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';
import { createFrameStages } from '../public/js/feature-host.js?v=436b6d78';
import { guardTickerRender } from '../public/js/pixi-fixes.js?v=0f42b75e';

const game = readFileSync(join(import.meta.dirname, '..', 'public/game.js'), 'utf8');

describe('R30 one stage that throws every frame does not stop the others', () => {
  it('a fake frame: the tool copies throw every frame, the avatar still moves; reported once, named', () => {
    const heard = [];
    const first = [];
    const stage = createFrameStages({ report: (where, err) => heard.push([where, err.message]), onFirst: (name) => first.push(name) });
    const player = { x: 0 };
    const frame = () => {
      stage('tool copies', () => { throw new TypeError("Cannot read properties of undefined (reading 'sprite')"); });
      stage('input', () => {});
      stage('physics', () => { player.x += 4; });
      return stage('street view', () => 'drawn');
    };
    for (let i = 0; i < 600; i += 1) assert.equal(frame(), 'drawn');
    assert.equal(player.x, 2400, 'movement ran every frame');
    assert.deepEqual(heard, [['frame tool copies', "Cannot read properties of undefined (reading 'sprite')"]], 'once, not 60 times a second');
    assert.deepEqual(first, ['tool copies']);
    assert.deepEqual(stage.throws(), { 'tool copies': 600 });
  });

  it('two stages failing are each reported, by name', () => {
    const heard = [];
    const stage = createFrameStages({ report: (where) => heard.push(where) });
    for (let i = 0; i < 3; i += 1) {
      stage('current action', () => { throw new Error('a'); });
      stage('physics', () => { throw new Error('b'); });
    }
    assert.deepEqual(heard, ['frame current action', 'frame physics']);
  });

  it('the old single guard would have frozen it (what game.js no longer does)', () => {
    let moved = 0;
    const once = () => {
      try {
        throw new Error('tool copies');
        // eslint-disable-next-line no-unreachable
        moved += 1;
      } catch { /* reported once as "game loop" */ }
    };
    for (let i = 0; i < 10; i += 1) once();
    assert.equal(moved, 0);
  });
});

describe('R30 an action whose frame throws no longer holds the avatar', () => {
  const at = game.indexOf('function updateActionOrLetGo(');
  const src = game.slice(at, game.indexOf('\n}\n', at) + 2);
  /** game.js updateActionOrLetGo with fake neighbours: `update` is updateCurrentAction's body. */
  const harness = (update, cancel = 'currentAction = null;') => new Function(`
    let currentAction = { target: 'rock_sparkly_1', verbId: 'mine', status: 'running' };
    function updateCurrentAction() { if (!currentAction) return; ${update} }
    function cancelCurrentAction() { ${cancel} }
    function stopActionSoundLoop() {}
    function clearActionToolFx() {}
    function renderCurrentAction() {}
    ${src}
    return { step: (ms) => updateActionOrLetGo(ms), action: () => currentAction };
  `)();

  it('a throw every frame: reported once, the action let go after the first, so the hold clears', () => {
    const heard = [];
    const stage = createFrameStages({ report: (where) => heard.push(where) });
    const a = harness("currentAction = { ...currentAction }; throw new TypeError('render');");
    for (let i = 0; i < 5; i += 1) stage('current action', () => a.step(16));
    assert.equal(a.action(), null);
    assert.deepEqual(heard, ['frame current action']);
    assert.deepEqual(stage.throws(), { 'current action': 1 }, 'nothing left to throw after it was let go');
  });

  it('a cancel that throws too still drops it', () => {
    const a = harness("throw new TypeError('advance');", "throw new Error('cancel');");
    assert.throws(() => a.step(16), /advance/);
    assert.equal(a.action(), null);
  });

  it('a verb finished (the action already gone) or a new action begun by it is left alone', () => {
    const done = harness("currentAction = null; throw new Error('finish');");
    assert.throws(() => done.step(16), /finish/);
    assert.equal(done.action(), null);
    const next = harness("currentAction = { target: 'trant_fruit', verbId: 'harvest' }; throw new Error('finish');");
    assert.throws(() => next.step(16), /finish/);
    assert.deepEqual(next.action(), { target: 'trant_fruit', verbId: 'harvest' });
  });
});

describe('R30 game.js runs every stage of the frame in its own guard', () => {
  const frame = game.slice(game.indexOf('const gameFrame = (ticker) => {'), game.indexOf("frameFailed('game loop', err);"));

  it('the stages that move the avatar each have a guard, in order', () => {
    const order = [
      "run('tool copies', () => syncToolCopies(toolState));",
      "run('current action', () => updateActionOrLetGo(ms));",
      "run('make craft', () => updateMakeCraft(ms));",
      "run('input', handleInput);",
      "run('physics', () => physics(step));",
      "run('features', () => features.tick(ms, Date.now(), engine));",
      "run('street view', drawStreetFrame);",
      "run('prompt', () => {",
    ];
    let at = 0;
    for (const line of order) {
      const i = frame.indexOf(line, at);
      assert.ok(i > at, line);
      at = i;
    }
  });

  it('no call is left bare between the started gate and the prompt (each statement is a guarded stage)', () => {
    const body = frame.slice(frame.indexOf('const dt = Math.min('), frame.indexOf("run('prompt', () => {"));
    // The frame's own statements (in it, its ifs and its step loop: at most six spaces in); deeper lines are inside a stage.
    const own = body.split('\n').filter((l) => /^ {4,6}\S/.test(l)).map((l) => l.trim());
    const bare = own.filter((l) => /^[A-Za-z_$][\w$.?]*\(.*\);$/.test(l) && !l.startsWith('run('));
    assert.ok(own.filter((l) => l.startsWith('run(')).length >= 30, 'the stages are seen');
    assert.deepEqual(bare, []);
  });

  it('the stage guard reports through the page error path and names its stages on the canvas; the outer guard stays', () => {
    assert.match(game, /import \{ createErrorOnce, createFeatureHost, createFrameStages \} from '\.\/js\/feature-host\.js/);
    assert.match(game, /const stage = createFrameStages\(\{\n\s*onFirst: \(name\) => \{\n\s*if \(app\?\.canvas\) app\.canvas\.dataset\.frameStageFailed = Object\.keys\(stage\.throws\(\)\)\.join\(' '\);/);
    assert.match(game, /const run = \(name, fn\) => stage\(name, FRAME_THROW === name \? \(\) => \{ throw new Error\(`QA framethrow \$\{name\}`\); \} : fn\);/);
    assert.match(game, /frameStageThrows: \(\) => frameStages\?\.throws\?\.\(\) \|\| \{\},/);
    assert.match(game, /try \{\n\s*gameFrame\(ticker\);\n\s*\} catch \(err\) \{\n\s*frameFailed\('game loop', err\);/);
  });
});

/** The vendored Pixi in a vm whose requestAnimationFrame only queues (`frames.run()` plays the queue). */
function pixiWithFrames() {
  const queue = [];
  const g = { console, setTimeout, clearTimeout, navigator: { userAgent: 'node' }, performance };
  g.window = g;
  g.self = g;
  g.globalThis = g;
  let now = 1000;
  g.requestAnimationFrame = (fn) => { queue.push(fn); return queue.length; };
  g.cancelAnimationFrame = () => {};
  vm.createContext(g);
  vm.runInContext(readFileSync(join(import.meta.dirname, '..', 'public/vendor/pixi/pixi-8.23.0.min.js'), 'utf8'), g);
  const frames = {
    /** Play up to n queued frames; how many ran. */
    run(n) {
      let ran = 0;
      while (ran < n && queue.length) {
        now += 1000 / 60;
        const fn = queue.shift();
        try { fn(now); } catch { /* the browser reports it; the next frame is whatever was asked for */ }
        ran += 1;
      }
      return ran;
    },
  };
  return { PIXI: g.PIXI, frames };
}

/** An Application as Pixi's TickerPlugin wires it: render() at UPDATE_PRIORITY.LOW; the game's frame before it. */
function fakeApp(PIXI, render) {
  const app = { ticker: new PIXI.Ticker(), render, moved: 0 };
  app.ticker.autoStart = false;
  app.ticker.add(() => { app.moved += 1; });
  app.ticker.add(app.render, app, PIXI.UPDATE_PRIORITY.LOW);
  return app;
}

describe('#577/#578 (R30): a render that throws does not stop the game', () => {
  const badTexture = () => { throw new TypeError("Cannot read properties of null (reading 'addressModeU')"); };

  it('the harness reproduces the freeze: Pixi\'s ticker asks for no frame after a render throws', () => {
    const { PIXI, frames } = pixiWithFrames();
    const app = fakeApp(PIXI, badTexture);
    app.ticker.start();
    assert.equal(frames.run(120), 1, 'one frame, then nothing more is ever asked for');
    assert.equal(app.moved, 1, 'the avatar moved once and froze');
  });

  it('guarded: every frame runs, the avatar moves, the render throw is reported once as "frame render"', () => {
    const { PIXI, frames } = pixiWithFrames();
    let throwing = true;
    let drawn = 0;
    const app = fakeApp(PIXI, function render() {
      assert.equal(this, app, 'render keeps its app');
      if (throwing) badTexture();
      drawn += 1;
    });
    const heard = [];
    const stage = createFrameStages({ report: (where, err) => heard.push([where, err.message]) });
    assert.equal(guardTickerRender(PIXI, app, (fn) => stage('render', fn)), true);
    app.ticker.start();
    assert.equal(frames.run(120), 120);
    assert.equal(app.moved, 120);
    assert.deepEqual(heard, [['frame render', "Cannot read properties of null (reading 'addressModeU')"]]);
    throwing = false;
    frames.run(5);
    assert.equal(drawn, 5, 'and the view draws again once the bad frame is gone');
    assert.equal(guardTickerRender(PIXI, app, (fn) => stage('render', fn)), true, 'installing twice is a no-op');
    frames.run(1);
    assert.equal(drawn, 6, 'still one render a frame');
  });

  it('game.js puts the render in the frame stages, after the game\'s own frame', () => {
    const at = game.indexOf("guardTickerRender(PIXI, app, (fn) => run('render', fn));");
    assert.ok(at > game.indexOf("frameFailed('game loop', err);"), 'installed once the frame listener is on the ticker');
    assert.match(game, /import \{ guardDestroyedSources, guardTickerRender, installPixiFixes(, [\w, ]+)? \} from '\.\/js\/pixi-fixes\.js/);
  });
});
