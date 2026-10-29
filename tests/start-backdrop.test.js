// BACKDROP (Austin 2026-10-29, /play/online/ on Verdant Green): behind the start card ("Welcome
// to a scrap of Ur") the street "looks almost broken": far layers at their unscrolled offsets,
// decos never culled in, flat sky, because the ticker returned before drawing the street until
// Start. The street now draws under the card, and the card waits under the loading card until its
// street has drawn, fading in; past a cap it comes in over a calm backdrop that clears later.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { BACKDROP_CAP_MS, pendingSources, revealStartCard, whenSceneDrawn } from '../public/js/start-backdrop.js?v=g432-1';

const here = dirname(fileURLToPath(import.meta.url));
const pub = join(here, '../public');
const read = (rel) => readFileSync(join(pub, rel), 'utf8');
const game = read('game.js');
const css = read('style.css');
const between = (src, a, b) => src.slice(src.indexOf(a), src.indexOf(b, src.indexOf(a) + a.length));

const source = (name, loaded = false) => ({ name, loaded });
const sprite = (src, extra = {}) => ({ texture: { source: src }, children: [], ...extra });
const settled = (s) => s.loaded;

describe('the street draws under the start card', () => {
  it('the ticker draws the street (view height, front, parallax, culling) before the started gate', () => {
    const ticker = between(game, 'app.ticker.add((ticker) => {\n    syncStreetFront();', 'buffTickAccum += dt;');
    const gate = ticker.indexOf('if (!state.started) {');
    assert.ok(gate > 0, 'the started gate');
    assert.match(ticker.slice(gate, gate + 80), /if \(!state\.started\) \{\s*drawStreetFrame\(\);\s*return;\s*\}/);
    // After Start, once per frame after physics moved the camera.
    assert.ok(ticker.indexOf('physics(dt);') < ticker.lastIndexOf('drawStreetFrame();'));
    const frame = between(game, 'const drawStreetFrame = () => {', '};');
    for (const step of ['syncLocationViewHeight()', 'syncStreetFront()', 'bgLayer?.updateParallax?.(', 'bgLayer?.cullDecos?.(']) {
      assert.ok(frame.includes(step), step);
    }
  });

  it('the start card waits under the loading card, then fades in (or over the calm backdrop at the cap)', () => {
    const boot = between(game, "if (new URLSearchParams(location.search).has('autostart')) beginGame();", 'let newDayCheckAccum');
    assert.match(boot, /const startCardWaits = !state\.started && Boolean\(startOverlay\) && !startOverlay\.classList\.contains\('hidden'\);/);
    assert.match(boot, /if \(startCardWaits\) startOverlay\.classList\.add\('is-waiting'\);\s*else endBoot\(\);/);
    assert.match(boot, /bootLoader\.hidden = true/);
    const reveal = between(game, 'if (startCardWaits) {\n    const t0', '\nmain().catch');
    assert.match(reveal, /roots: \(\) => \[bgLayer, entityLayer, streetFrontLayer\]/);
    assert.match(reveal, /startOverlay\.classList\.toggle\('is-calm', mode === 'calm'\);\s*endBoot\(\{ fade: true \}\);/);
    assert.match(reveal, /startOverlay\.classList\.remove\('is-waiting'\)/);
    assert.match(reveal, /bootParams\.get\('backdropcap'\)/);
    // The reveal runs once the ticker that draws the street is in.
    assert.ok(game.indexOf('app.ticker.add((ticker) => {\n    syncStreetFront();') < game.indexOf('if (startCardWaits) {\n    const t0'));
  });

  it('the overlay fades, waits invisible and has a calm backdrop that can clear', () => {
    assert.match(css, /\.overlay \{ transition: opacity 0\.35s ease; \}/);
    assert.match(css, /\.overlay\.is-waiting \{ opacity: 0; pointer-events: none; \}/);
    assert.match(css, /\.overlay::before \{[^}]*opacity: 0;[^}]*transition: opacity 0\.6s ease;/);
    assert.match(css, /\.overlay\.is-calm::before \{ opacity: 1; \}/);
    assert.match(css, /\.overlay > \.card \{ position: relative; \}/);
    assert.match(css, /\.boot-loader\.is-leaving \{ opacity: 0; pointer-events: none; \}/);
  });

  it('a tutorial reload and autostart skip the wait (the overlay is already hidden)', () => {
    const newxp = read('js/features/newxp-feature.js');
    assert.match(between(newxp, 'function resumeOnReload(engine) {', 'const go = () =>'), /overlay\.classList\.add\('hidden'\);/);
    assert.ok(game.indexOf("has('autostart')) beginGame();") < game.indexOf('const startCardWaits'));
  });

  it('cache keys: the module, game.js round16, style.css and the online page', () => {
    assert.match(game, /from '\.\/js\/start-backdrop\.js\?v=g432-1'/);
    for (const page of ['play/index.html', 'play/online/index.html']) {
      const html = read(page);
      assert.match(html, /round16=g\d+-\d+"/, page);
      assert.match(html, /style\.css\?v=[^"]*&amp;backdrop=g432-1"/, page);
    }
  });
});

describe('start-backdrop.js', () => {
  it('pendingSources: loading images on screen, not culled, hidden or destroyed ones', () => {
    const a = source('a');
    const b = source('b', true);
    const c = source('c');
    const d = source('d');
    const e = source('e');
    const root = {
      children: [
        sprite(a),
        sprite(b),
        sprite(c, { culled: true }),
        sprite(d, { visible: false }),
        { children: [sprite(e), sprite(a)] },
        sprite(source('gone'), { destroyed: true }),
      ],
    };
    const out = pendingSources([root, null], settled);
    assert.deepEqual([...out].map((s) => s.name).sort(), ['a', 'e']);
  });

  it('whenSceneDrawn waits for the loads, then frames, and re-checks what arrived', async () => {
    const a = source('a');
    const late = source('late');
    const root = { children: [sprite(a)] };
    const log = [];
    let frames = 0;
    const drawn = whenSceneDrawn({
      roots: () => [root],
      isSettled: settled,
      whenSettled: (s) => new Promise((resolve) => setTimeout(() => {
        s.loaded = true;
        log.push(s.name);
        // An arrival brings another image (a blurred layer's tiles, a sharp deco's own file).
        if (s === a) root.children.push(sprite(late));
        resolve();
      }, 5)),
      nextFrame: () => { frames += 1; return Promise.resolve(); },
      frames: 2,
    });
    assert.equal(await drawn, true);
    assert.deepEqual(log, ['a', 'late']);
    assert.ok(frames >= 2 + 1, 'a first frame, then two after the loads');
  });

  it('whenSceneDrawn gives up after its rounds with false', async () => {
    const root = { children: [sprite(source('never'))] };
    const ok = await whenSceneDrawn({ roots: () => [root], isSettled: settled, whenSettled: () => Promise.resolve(), nextFrame: () => Promise.resolve(), rounds: 2 });
    assert.equal(ok, false);
  });

  it('revealStartCard: the street when drawn in time', async () => {
    const shown = [];
    const mode = await revealStartCard({ drawn: Promise.resolve(true), show: (m) => shown.push(m), clear: () => shown.push('clear'), capMs: 50 });
    assert.equal(mode, 'street');
    assert.deepEqual(shown, ['street']);
  });

  it('revealStartCard: the calm backdrop at the cap, cleared once the street draws', async () => {
    const shown = [];
    let finish;
    const drawn = new Promise((resolve) => { finish = resolve; });
    const mode = await revealStartCard({ drawn, show: (m) => shown.push(m), clear: () => shown.push('clear'), capMs: 5 });
    assert.equal(mode, 'calm');
    assert.deepEqual(shown, ['calm']);
    finish(true);
    await new Promise((r) => setTimeout(r, 0));
    assert.deepEqual(shown, ['calm', 'clear']);
  });

  it('revealStartCard: a failed draw keeps the calm backdrop', async () => {
    const shown = [];
    const mode = await revealStartCard({ drawn: Promise.reject(new Error('x')), show: (m) => shown.push(m), clear: () => shown.push('clear'), capMs: 50 });
    assert.equal(mode, 'calm');
    assert.deepEqual(shown, ['calm']);
    assert.ok(BACKDROP_CAP_MS >= 2000 && BACKDROP_CAP_MS <= 8000);
  });
});
