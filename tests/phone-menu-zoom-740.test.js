/**
* #740 (an iPhone 402 x 874, upright and sideways; Austin's ruling 2026-11-26: keep the street's band
 * above the controls, #654): (a) Whole street fits the band (#654 kept the whole screen's scale, so it
 * showed about two thirds of a 1000 px street); (b) the Menu docks the street, and fitting it anew into
 * the room left flipped the stage's rule (402 x 247 is wider than tall: the sideways rule; 452 x 402
 * beside the column: a computer's 960 px floor), so opening the Menu zoomed the street out. The level
 * the player chose now looks the same with the Menu open or closed (js/location-view.js dockedStage).
 * - pure: stageFor with `undocked` keeps the free room's scale; Whole street in the band shows the street;
 * - WebKit on Tonga Trips (1000 px tall): upright Whole street shows the whole street in the band, and
 *   upright and sideways the scale is the same with the Menu open.
 * Run: node --test tests/phone-menu-zoom-740.test.js
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { phoneRegions } from '../public/js/ui/phone-layout.js?v=7ebe8992';
import { MIN_PACK_HEIGHT, dockedStage, stageFor, stageRoomBeside, stageRoomInBand, streetBandScale } from '../public/js/location-view.js?v=b178fe66';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const game = readFileSync(join(root, 'public/game.js'), 'utf8');

const SIDEWAYS = { width: 874, height: 402 };
const SIDEWAYS_SAFE = { l: 62, r: 62, b: 21, t: 0 };
const UPRIGHT = { width: 402, height: 874 };
const UPRIGHT_SAFE = { t: 62, b: 34, l: 0, r: 0 };

/** The stage game.js asks for (stageArgs) on a 1000 px street, with a sheet open or not. */
function phoneStageOf({ width: W, height: H }, safe, sheet, closeup = 0) {
  const r = phoneRegions({ width: W, height: H, safe, sheet });
  const frame = H > W ? r.street : null;
  const whole = stageRoomBeside(W, H, r.dock);
  const room = stageRoomInBand(whole, frame);
  let undocked;
  if (r.dock?.keep) {
    const fw = stageRoomBeside(W, H, null);
    const f = stageRoomInBand(fw, frame);
    undocked = { width: f.width, height: f.height, streetBand: f.top > 0, fullHeight: fw.height, topBand: 0 };
  }
  const stage = stageFor({ width: room.width, height: room.height, packReserve: MIN_PACK_HEIGHT, sceneWidth: 4380, sceneHeight: 1000, phone: true, closeup, streetBand: room.top > 0, fullHeight: whole.height, undocked });
  return { stage, room };
}

describe('#740: the zoom with the Menu open or closed, and Whole street in the band (pure)', () => {
  it('upright, Whole street shows the street\'s whole height in the band', () => {
    const { stage, room } = phoneStageOf(UPRIGHT, UPRIGHT_SAFE, '');
    assert.ok(stage.streetBand && !stage.landscape);
    assert.ok(Math.abs(room.height / stage.scale - 1000) < 1.5, `Whole street shows ${Math.round(room.height / stage.scale)} of 1000 world px`);
    assert.ok(Math.abs(stage.cssHeight - room.height) < 0.01);
    // The closest level reaches as close as the whole screen's (#654's pinch reach).
    const close = phoneStageOf(UPRIGHT, UPRIGHT_SAFE, '', 1).stage;
    const full = stageFor({ ...UPRIGHT, packReserve: MIN_PACK_HEIGHT, sceneWidth: 4380, sceneHeight: 1000, phone: true, closeup: 1 });
    assert.equal(close.scale, full.scale);
    assert.equal(streetBandScale({ fit: 0.5, closest: 1, closeup: 0.5 }), 0.5 * Math.SQRT2);
    assert.equal(streetBandScale({ fit: 1.2, closest: 1, closeup: 0.5 }), 1.2);
  });

  for (const [name, vp, safe] of [['upright 402 x 874', UPRIGHT, UPRIGHT_SAFE], ['sideways 874 x 402', SIDEWAYS, SIDEWAYS_SAFE]]) {
    it(`${name}: the Menu open keeps the scale at every level, upright stays upright and the canvas fills the room left`, () => {
      for (const closeup of [0, 0.5, 1]) {
        const closed = phoneStageOf(vp, safe, '', closeup).stage;
        const open = phoneStageOf(vp, safe, 'half', closeup);
        assert.equal(open.stage.scale, closed.scale, `${name} at ${closeup}`);
        assert.equal(Boolean(open.stage.landscape), Boolean(closed.landscape), `${name} at ${closeup}: the rule does not flip`);
        assert.equal(open.stage.cssWidth, open.room.width);
        assert.ok(Math.abs(open.stage.cssHeight - open.room.height) < 0.01);
        assert.equal(open.stage.viewW, Math.round(open.room.width / closed.scale));
        assert.ok(open.stage.docked);
      }
    });
  }

  it('only a half sheet keeps the scale: an open bag and the house picker still fit the room they leave', () => {
    // An open bag sideways leaves a strip too short for the kept scale (the action chip rose over the
    // caption, tests/phone-layout.test.js): it refits, as before #740.
    assert.ok(phoneRegions({ ...SIDEWAYS, safe: SIDEWAYS_SAFE, sheet: 'half' }).dock.keep);
    assert.ok(phoneRegions({ ...UPRIGHT, safe: UPRIGHT_SAFE, sheet: 'half' }).dock.keep);
    assert.ok(!phoneRegions({ ...SIDEWAYS, safe: SIDEWAYS_SAFE, sheet: 'bag', bagTop: 190 }).dock.keep);
    // stageFor keeps the free room's scale whenever it is given one.
    const closed = phoneStageOf(SIDEWAYS, SIDEWAYS_SAFE, '').stage;
    const kept = stageFor({ width: 452, height: 402, packReserve: MIN_PACK_HEIGHT, sceneWidth: 4380, sceneHeight: 1000, phone: true, undocked: { width: 874, height: 402 } });
    assert.equal(kept.scale, closed.scale);
    assert.equal(dockedStage(null, { width: 10, height: 10 }), null);
    assert.match(game, /function undockedStageRoom\(root, dock\) \{\n\s+if \(!dock\?\.keep\) return undefined;/);
    assert.match(game, /undocked: undockedStageRoom\(root, dock\),/);
    assert.match(game, /\.\.\.\(dock\.keep \? \{ keep: true \} : \{\}\)/, 'engine.setStageDock passes `keep` on');
  });
});

let playwright = null;
// R52: the WebKit build on a non-Ubuntu Linux needs its environment before Playwright loads.
try { await import('../tools/qa/playwright-env.mjs'); playwright = await import('playwright'); } catch { /* no Playwright */ }
const TONGA = 'GHVB16RSG652GJ4';
const LOCK_WAIT_MS = 30 * 60_000;

let server = null;
let webkit = null;

async function onTonga(viewport, safe) {
  const ctx = await webkit.browser.newContext({ ...playwright.devices['iPhone 15 Pro'], viewport, screen: viewport });
  await ctx.addInitScript((s) => {
    try { localStorage.setItem('groddle-play-device', 'qa-game'); localStorage.setItem('groddle.zoom.phone', '0'); } catch { /* none */ }
    // Playwright cannot emulate env(safe-area-inset-*): the iPhone's insets as the game's own variables.
    document.addEventListener('DOMContentLoaded', () => { for (const [k, v] of Object.entries(s)) document.documentElement.style.setProperty(`--safe-${k}`, `${v}px`); });
  }, safe);
  const tab = await ctx.newPage();
  const errors = [];
  tab.on('pageerror', (e) => errors.push(e.message));
  await tab.goto(`http://127.0.0.1:${server.address().port}/play/?autostart=1&questoffer=off&hstip=0`);
  await tab.waitForFunction(() => !document.body.classList.contains('is-booting') && document.getElementById('overlay')?.classList.contains('hidden') && document.documentElement.classList.contains('phone-layout'), null, { timeout: 60_000 });
  await tab.evaluate((t) => {
    for (const b of document.querySelectorAll('button')) if (b.textContent.trim() === 'Got it' && b.offsetParent) b.click();
    return window.groddleQA.audio.travel(t);
  }, TONGA);
  await tab.waitForTimeout(2500);
  return { ctx, tab, errors };
}

/** The canvas, the scale, the open sheet's card and the root's colour beside it. */
const measure = (tab, sel) => tab.evaluate((s) => {
  const c = document.querySelector('#game-root canvas');
  const r = c.getBoundingClientRect();
  const card = s ? document.querySelector(s) : null;
  const cr = card && card.getClientRects().length ? card.getBoundingClientRect() : null;
  const probe = document.createElement('div');
  probe.style.cssText = 'position:absolute;visibility:hidden;background-color:var(--surface)';
  document.body.append(probe);
  const surface = getComputedStyle(probe).backgroundColor;
  probe.remove();
  return {
    canvas: { left: r.left, top: r.top, width: r.width, height: r.height },
    scale: Number(c.dataset.stageScale),
    card: cr && { left: cr.left, right: cr.right },
    rootBg: getComputedStyle(document.getElementById('game-root')).backgroundColor,
    surface,
    sheet: document.documentElement.dataset.phoneSheet || '',
  };
}, sel);

describe('#740 on Safari\'s engine (WebKit, iPhone 15 Pro, Tonga Trips)', { skip: !playwright && 'no playwright' }, () => {
  before(async () => {
    const { openBrowser } = await import('../tools/qa/browser.mjs');
    const { startServer } = await import('../tools/qa/serve.mjs');
    server = await startServer({ root: join(root, 'public') });
    try {
      webkit = await openBrowser({ label: 'phone-menu-zoom-740 test (WebKit)', engine: 'webkit', waitMs: LOCK_WAIT_MS });
    } catch (e) { console.error(`no WebKit: ${e.message}`); webkit = null; }
  }, { timeout: LOCK_WAIT_MS + 60_000 });
  after(async () => {
    await webkit?.close();
    await server?.stop();
  });

  for (const [name, vp, safe] of [['upright 402 x 874', UPRIGHT, UPRIGHT_SAFE], ['sideways 874 x 402', SIDEWAYS, SIDEWAYS_SAFE]]) {
    it(`#740 ${name}: opening the Menu keeps the zoom${vp.height > vp.width ? '; Whole street shows the whole street in the band' : ''}`, { timeout: 120_000 }, async (t) => {
      if (!webkit) {
        t.skip('no WebKit (tools/qa/setup-webkit.sh)');
        return;
      }
      const { ctx, tab, errors } = await onTonga(vp, safe);
      const closed = await measure(tab);
      await tab.evaluate(() => document.getElementById('more-btn').click());
      await tab.waitForTimeout(1500);
      const open = await measure(tab);
      await ctx.close();
      // The street's height the canvas shows (the view and the 132 world px reserve), of Tonga's 1000.
      const shown = (m) => m.canvas.height / m.scale / 1000;
      console.log(`#740 ${name}: closed scale ${closed.scale} shows ${(shown(closed) * 100).toFixed(0)}%, open scale ${open.scale} shows ${(shown(open) * 100).toFixed(0)}%`);
      assert.equal(open.sheet, 'half');
      assert.ok(Math.abs(open.scale - closed.scale) / closed.scale < 0.01, `scale ${closed.scale} closed, ${open.scale} with the Menu open`);
      if (vp.height > vp.width) assert.ok(shown(closed) > 0.97, `Whole street shows ${(shown(closed) * 100).toFixed(0)}% of the street's height`);
      assert.deepEqual(errors, []);
    });
  }
});
