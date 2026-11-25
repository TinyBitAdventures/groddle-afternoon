/**
 * Report #695 (Android phone upright, 360x629, back yard): "gardening is cumbersome, requiring many
 * precision clicks". A plot there is 40 x 12 CSS px. Act at a garden started tending (plot 1-2 lit,
 * bug report #5), but only a real key stepped the lit plot (gardenTendKey): the stick wrote the keys
 * directly and walked the avatar off, and Act's drag (ACTPRESS, js/touch-controls.js actMenu) knew the
 * verb menu, chooser, signpost and pack card, not a garden, so a drag opened plot 1-2's menu.
 *
 * Glitch: while tending, the arrows moved between plots (GardenView.as onKeyDown 588-672) and Enter
 * acted on the lit plot (onPlotClick 657-660). Now on a phone, as signpostActMenu drives a post:
 * - Act drives the plots (game.js gardenTendActMenu): a drag steps the lit plot round the grid
 *   (stepTendKeys, the Right arrow's order), the lift or a tap acts on it as Enter does (G1305: its
 *   best action, game.js clickGardenPlot, tests/garden-plot-click.test.js);
 * - the stick moves the lit plot across the grid (stickTendKey), stepping again while held, and past
 *   the left or right end lets go of the garden and walks (a phone has no Esc).
 * Keyboard and desktop are unchanged.
 * Run: node --test tests/r695-garden-act-phone.test.js
 */
import { after as afterAll, before as beforeAll, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { STICK_TEND_DIRS, stepTendKey, stepTendKeys, stickTendKey } from '../public/js/garden-tend.js?v=a7470c4a';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const game = readFileSync(join(root, 'public/game.js'), 'utf8');

describe('#695: the plots a phone steps while tending (garden-tend.js)', () => {
  it('a drag on Act steps round every plot in the Right arrow\'s order, up goes back', () => {
    assert.equal(stepTendKeys('1-2', 1, 4, 2), stepTendKey('1-2', 'right', 4, 2));
    assert.equal(stepTendKeys('1-2', 3, 4, 2), '4-2');
    assert.equal(stepTendKeys('1-2', 4, 4, 2), '1-1', 'the front row, then the back');
    assert.equal(stepTendKeys('1-2', 8, 4, 2), '1-2', 'round to the start');
    assert.equal(stepTendKeys('1-2', -1, 4, 2), '4-1');
    assert.equal(stepTendKeys('3-1', 0, 4, 2), '3-1');
    const seen = new Set();
    for (let n = 0; n < 6; n++) seen.add(stepTendKeys('1-2', n, 3, 2));
    assert.equal(seen.size, 6, 'a 3x2 herb garden: six plots');
  });

  it('the stick moves across the grid as it looks, and walks off past the left or right end', () => {
    assert.equal(stickTendKey('1-2', 'right', 4, 2), '2-2');
    assert.equal(stickTendKey('2-2', 'left', 4, 2), '1-2');
    assert.equal(stickTendKey('2-2', 'up', 4, 2), '2-1', 'up is toward the back row (r 1)');
    assert.equal(stickTendKey('2-1', 'up', 4, 2), '2-1', 'resting at the back row');
    assert.equal(stickTendKey('2-1', 'down', 4, 2), '2-2');
    assert.equal(stickTendKey('2-2', 'down', 4, 2), '2-2', 'resting at the front row');
    assert.equal(stickTendKey('1-1', 'left', 4, 2), null, 'off the left end: let go and walk');
    assert.equal(stickTendKey('4-2', 'right', 4, 2), null, 'off the right end');
    assert.deepEqual(Object.keys(STICK_TEND_DIRS).sort(), ['ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowUp']);
  });

  it('game.js: Act\'s menu is the tended garden, the stick goes through it, the keyboard path stays', () => {
    assert.match(game, /if \(pop\) return \{ step: \(n\) => stepVerbRow\(pop, n\), choose: \(\) => chooseVerbRow\(pop\) \};\n\s+\/\/ #695[^\n]*\n\s+return gardenTendActMenu\(\);/);
    assert.match(game, /press: \(k\) => \{\n\s+\/\/ #695[^\n]*\n\s+if \(gardenTendStick\(k\)\) return;\n\s+keys\.add\(k\);/);
    assert.match(game, /if \(gardenTend && !menuTarget && !panelOnScreen\(\) && gardenTendKey\(e\)\) return;/);
  });
});

let chromium = null;
try { chromium = (await import('playwright')).chromium; } catch { /* no Playwright */ }

describe('#695 in Chrome, an Android phone upright (360x629, touch) in the back yard', { skip: !chromium && 'no playwright' }, () => {
  const LOCK_WAIT_MS = 30 * 60_000;
  let server = null;
  let chrome = null;
  beforeAll(async () => {
    const { openBrowser } = await import('../tools/qa/browser.mjs');
    const { startServer } = await import('../tools/qa/serve.mjs');
    chrome = await openBrowser({ label: 'r695 garden act test', waitMs: LOCK_WAIT_MS });
    server = await startServer({ root: join(root, 'public') });
  }, { timeout: LOCK_WAIT_MS + 60_000 });
  afterAll(async () => {
    await chrome?.close();
    await server?.stop();
  });

  it('Act tends, the stick and a drag on Act step the lit plot, the lift acts on it, the stick walks off', { timeout: 180_000 }, async () => {
    const base = `http://127.0.0.1:${server.address().port}`;
    const UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36';
    const ctx = await chrome.browser.newContext({ viewport: { width: 360, height: 629 }, deviceScaleFactor: 3, userAgent: UA, hasTouch: true, isMobile: true });
    await ctx.addInitScript(() => { try { localStorage.setItem('groddle-play-device', 'qa-game'); } catch { /* no storage */ } });
    const page = await ctx.newPage();
    try {
      await page.goto(`${base}/play/?autostart=1&fresh=1&resetgame=1&questoffer=off&homedemo=interior&homeyarddemo=cultivate`, { waitUntil: 'load' });
      await page.waitForFunction(() => window.groddleQA?.snapshot && !document.body.classList.contains('is-booting') && window.groddleQA.snapshot().interactables.some((i) => i.classId === 'garden_plot'), null, { timeout: 60_000 });
      await page.waitForTimeout(2500);
      await page.keyboard.press('Escape'); // leave Cultivate
      await page.waitForTimeout(600);
      const lx = await page.evaluate(() => Math.min(...window.groddleQA.snapshot().interactables.filter((i) => i.classId === 'garden_plot').map((p) => p.x)) - 30);
      const toGarden = async () => {
        await page.evaluate((x) => window.groddleQA.placeAvatar(x, window.groddleQA.snapshot().player.y - 4), lx);
        await page.waitForTimeout(1000);
      };
      const lit = () => page.evaluate(() => document.querySelector('#game-root canvas').dataset.gardenTend || '');
      const px = () => page.evaluate(() => window.groddleQA.snapshot().player.x);
      const act = await page.locator('[data-touch-act]').boundingBox();
      const ax = act.x + act.width / 2;
      const ay = act.y + act.height / 2;
      const tapAct = async () => { await page.touchscreen.tap(ax, ay); await page.waitForTimeout(400); };
      const stick = await page.locator('[data-touch-stick]').boundingBox();
      const sx = stick.x + stick.width / 2;
      const sy = stick.y + stick.height / 2;
      const push = async (dx, ms) => {
        await page.mouse.move(sx, sy);
        await page.mouse.down();
        await page.mouse.move(sx + dx, sy, { steps: 4 });
        await page.waitForTimeout(ms);
        await page.mouse.up();
        await page.waitForTimeout(300);
      };

      await toGarden();
      await tapAct();
      assert.equal(await lit(), '1-2', 'Act at the garden tends it, plot 1-2 lit');
      assert.equal(await page.locator('[data-touch-act]').textContent(), 'Choose', 'Act reads Choose while tending');

      // The stick right steps the lit plot (GardenView.as 588-672) and the avatar stands.
      const x0 = await px();
      await push(40, 150);
      assert.equal(await lit(), '2-2', 'the stick right lit the next plot');
      assert.ok(Math.abs((await px()) - x0) < 4, 'the avatar stood while the stick stepped');
      // Back to the left end, and on past it: tending lets go and the avatar walks left.
      await push(-40, 150);
      assert.equal(await lit(), '1-2');
      const x1 = await px();
      await push(-40, 700);
      assert.equal(await lit(), '', 'past the left end the stick let go of the garden');
      assert.ok((await px()) < x1 - 20, 'and walked the avatar off it');

      // A drag down on Act steps the lit plot; the lift acts on that plot (G1305: its best action).
      await toGarden();
      await tapAct();
      assert.equal(await lit(), '1-2');
      await page.evaluate(({ x, y }) => {
        const b = document.querySelector('[data-touch-act]');
        const ev = (type, dy) => b.dispatchEvent(new PointerEvent(type, { pointerId: 77, pointerType: 'touch', isPrimary: true, clientX: x, clientY: y + dy, bubbles: true, cancelable: true }));
        ev('pointerdown', 0);
        return new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => { ev('pointermove', 20); ev('pointermove', 40); r(); })));
      }, { x: ax, y: ay });
      await page.waitForTimeout(200);
      assert.equal(await lit(), '2-2', 'the drag lit the next plot');
      assert.equal(await page.evaluate(() => window.groddleQA.snapshot().menu), '', 'no menu yet while dragging');
      await page.evaluate(({ x, y }) => {
        document.querySelector('[data-touch-act]').dispatchEvent(new PointerEvent('pointerup', { pointerId: 77, pointerType: 'touch', isPrimary: true, clientX: x, clientY: y + 40, bubbles: true, cancelable: true }));
      }, { x: ax, y: ay });
      await page.waitForTimeout(400);
      const opened = await page.evaluate(() => ({ click: document.querySelector('#game-root canvas').dataset.plotClick || '', lit: document.querySelector('#game-root canvas').dataset.gardenTend }));
      assert.match(opened.click, /^2-2:/, 'the lift acted on the lit plot, as a tap on it does');
      assert.equal(opened.lit, '2-2', 'on plot 2-2');
    } finally {
      await ctx.close();
    }
  });
});
