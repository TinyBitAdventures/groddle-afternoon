/**
 * #654 (G1229 follow-up; Austin's ruling 2026-11-25): on an upright phone the top bar (the stats and
 * icon pills, the street's caption) and the controls (the stick, Act, Jump and the pack row) sit
 * outside the street, and the street fills the band between them. Before, the canvas ran the whole
 * screen under both, and the street fitted between them only where #617's ground line left it so.
 * Glitch drew its location viewport under the header and over the pack (TSMainView.as resizeToStage
 * 1229-1257). Sideways phones and computers are unchanged.
 * - pure: phoneRegions gives the band upright only (js/ui/phone-layout.js streetBandOf), the canvas's
 *   room is cut to it (js/location-view.js stageRoomInBand) and the closest level keeps the whole room's
 *   scale (streetBandStage), so a pinch reaches as close; Whole street fits the band (#740, streetBandScale);
 * - Chrome at 384x748 (the reporter's phone) and WebKit as an iPhone 15 Pro, on Kala Close: the
 *   canvas's rect is under the top bar and over the controls, and #617's guarantees hold: the feet
 *   stand in the street over the controls, Act and the pack row take taps on arrival, after a pinch
 *   level and after walking; sideways the canvas still fills the screen.
 * Run: node --test tests/phone-street-band.test.js
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GAP, phoneRegions, streetBandOf } from '../public/js/ui/phone-layout.js?v=d65ffc01';
import { MIN_PACK_HEIGHT, stageFor, stageRoomBeside, stageRoomInBand, streetBandStage } from '../public/js/location-view.js?v=04d55c40';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const game = readFileSync(join(root, 'public/game.js'), 'utf8');
const layoutSrc = readFileSync(join(root, 'public/js/ui/phone-layout.js'), 'utf8');

describe('#654: the street band (pure)', () => {
  it('upright the band runs from under the caption to over the stick, Act, Jump and the pack row; sideways there is none', () => {
    const r = phoneRegions({ width: 384, height: 748 });
    assert.ok(r.street, 'a band upright');
    assert.equal(r.street.top, r.caption.bottom + GAP);
    assert.equal(r.street.bottom, Math.min(r.stick.top, r.act.top, r.jump.top, r.pack.top) - GAP);
    for (const b of [r.strip, r.caption]) assert.ok(b.bottom <= r.street.top);
    for (const b of [r.stick, r.act, r.jump, r.pack]) assert.ok(b.top >= r.street.bottom);
    assert.equal(phoneRegions({ width: 748, height: 384 }).street, null);
    // A sheet covers the controls; the band stays where they stand (the dock cuts it shorter in game.js).
    assert.deepEqual(phoneRegions({ width: 384, height: 748, sheet: 'half' }).street, r.street);
    assert.deepEqual(phoneRegions({ width: 384, height: 748, sheet: 'map' }).street, r.street);
    // The pinned quest stands the stick up: the band ends over the stick where it stands.
    const pinned = phoneRegions({ width: 384, height: 748, pin: { w: 180, h: 40 } });
    assert.ok(pinned.pin && pinned.stickUp > 0);
    assert.equal(pinned.street.bottom, Math.min(pinned.stick.top, pinned.act.top, pinned.jump.top) - GAP);
    assert.equal(streetBandOf({ height: 100 }).bottom, 100);
    assert.equal(streetBandOf({ strip: { top: 0, bottom: 90 }, pack: { top: 80, bottom: 100 } }), null);
  });

  it('the canvas\'s room is cut to the band; a docked sheet ends it at its top edge', () => {
    const band = { top: 82, bottom: 538 };
    assert.deepEqual(stageRoomInBand(stageRoomBeside(384, 748, null), band), { width: 384, height: 456, left: 0, top: 82 });
    assert.deepEqual(stageRoomInBand(stageRoomBeside(384, 748, { side: 'bottom', css: 400 }), band), { width: 384, height: 266, left: 0, top: 82 });
    assert.deepEqual(stageRoomInBand(stageRoomBeside(384, 748, null), null), { width: 384, height: 748, left: 0, top: 0 });
  });

  it('the closest level keeps the whole room\'s scale (the pinch\'s reach); Whole street fits the band (#740); only the view gets shorter', () => {
    for (const [W, H, band] of [[384, 748, 456], [393, 659, 367], [375, 667, 375], [360, 629, 340]]) {
      for (const closeup of [0, 0.5, 1]) {
        const args = { width: W, packReserve: MIN_PACK_HEIGHT, sceneWidth: 4000, sceneHeight: 1200, phone: true, closeup };
        const full = stageFor({ ...args, height: H });
        const cut = stageFor({ ...args, height: band, streetBand: true, fullHeight: H });
        if (closeup === 1) assert.equal(cut.scale, full.scale, `${W}x${H} at ${closeup}`);
        // #740: Whole street shows the street's whole height (VIEW_HOLD_H, 1000 px) in the band, the canvas the band's height.
        else if (closeup === 0) assert.ok(Math.abs((cut.viewH + MIN_PACK_HEIGHT) * cut.scale - band) <= cut.scale + 0.01 && Math.abs(band / cut.scale - 1000) < 1.5, `${W}x${H}: Whole street ${band / cut.scale} world px tall`);
        else assert.ok(cut.scale < full.scale, `${W}x${H} at ${closeup}: between the band's Whole street and the closest`);
        assert.equal(cut.viewW, Math.round(W / cut.scale));
        assert.ok(!cut.landscape, `${W}x${H}: a band as wide as tall is still upright`);
        assert.ok(Math.abs(cut.cssHeight - band) < 0.01, `${W}x${H}: the canvas fills the band (${cut.cssHeight})`);
        assert.ok(Math.abs((cut.viewH + MIN_PACK_HEIGHT) * cut.scale - band) <= cut.scale + 0.01);
      }
    }
    // A scene shorter than the band is held in it, as a short scene always was.
    const room = stageFor({ width: 384, height: 456, packReserve: MIN_PACK_HEIGHT, sceneWidth: 900, sceneHeight: 420, phone: true, streetBand: true, fullHeight: 748 });
    assert.ok(room.cssHeight < 456 - 1);
    assert.equal(streetBandStage(null, { width: 384, height: 456 }), null);
  });

  it('wiring: the layout hands the band to the engine; game.js fits the canvas in it, on the phone layout upright only', () => {
    assert.match(layoutSrc, /engine\?\.setStageFrame\?\.\(regions\.street\);/);
    assert.match(layoutSrc, /engine\?\.setStageFrame\?\.\(null\);/);
    assert.match(game, /function activeStageFrame\(\) \{\n\s+if \(!TOUCH_PHONE \|\| PINNED_VIEW_H > 0 \|\| !stageFrame \|\| !modernUi\(\)\) return null;/);
    assert.match(game, /streetBand: room\.top > 0,\n\s+fullHeight: whole\.height,/);
    assert.match(game, /setStageFrame\(frame = null\) \{/);
  });
});

let playwright = null;
// R52: the WebKit build on a non-Ubuntu Linux needs its environment before Playwright loads.
try { await import('../tools/qa/playwright-env.mjs'); playwright = await import('playwright'); } catch { /* no Playwright */ }
const KALA = 'GIFGR4QG5IV1QPI';
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

/** The canvas, the top bar, the controls and the feet, in page px; and whether Act and the pack row take a tap at their centres. */
const measure = (tab) => tab.evaluate(() => {
  const rect = (el) => (el && el.getClientRects().length ? el.getBoundingClientRect() : null);
  const c = document.querySelector('#game-root canvas');
  const r = c.getBoundingClientRect();
  const tops = ['#wrap > header.top-bar', '#street-nameplate'].map((s) => rect(document.querySelector(s))).filter(Boolean);
  const lows = ['#game-root .touch-stick', '#game-root .touch-act', '#game-root .touch-jump', '#pack-row'].map((s) => rect(document.querySelector(s))).filter(Boolean);
  const hit = (sel) => {
    const b = rect(document.querySelector(sel));
    if (!b) return false;
    const el = document.elementFromPoint((b.left + b.right) / 2, (b.top + b.bottom) / 2);
    return Boolean(el?.closest(sel));
  };
  return {
    canvas: { top: r.top, bottom: r.bottom, height: r.height },
    window: innerHeight,
    barBottom: Math.max(...tops.map((b) => b.bottom)),
    controlsTop: Math.min(...lows.map((b) => b.top)),
    packTop: rect(document.querySelector('#pack-row'))?.top ?? NaN,
    feet: r.top + Number(c.dataset.playerScreenY) * Number(c.dataset.stageScale),
    act: hit('#game-root .touch-act'),
    pack: hit('#pack-row'),
  };
});

/** What is wrong with the street on an upright phone (empty when right). */
function problems(m, when) {
  const out = [];
  if (m.canvas.top < m.barBottom - 0.5) out.push(`${when}: the street (from ${Math.round(m.canvas.top)}) runs under the top bar (to ${Math.round(m.barBottom)})`);
  if (m.canvas.bottom > m.controlsTop + 0.5) out.push(`${when}: the street (to ${Math.round(m.canvas.bottom)}) runs under the controls (from ${Math.round(m.controlsTop)})`);
  if (!(m.feet < m.controlsTop) || !(m.feet <= m.canvas.bottom) || !(m.feet > m.canvas.top)) out.push(`${when}: the feet at ${Math.round(m.feet)}, the street ${Math.round(m.canvas.top)} to ${Math.round(m.canvas.bottom)}, the controls from ${Math.round(m.controlsTop)}`);
  if (!m.act) out.push(`${when}: Act takes no tap`);
  if (!m.pack) out.push(`${when}: the pack row takes no tap`);
  return out;
}

async function onKalaClose(browser, ctxOpts) {
  const base = `http://127.0.0.1:${server.address().port}`;
  const ctx = await browser.newContext(ctxOpts);
  await ctx.addInitScript(() => { try { localStorage.setItem('groddle-play-device', 'qa-game'); } catch { /* none */ } });
  const tab = await ctx.newPage();
  const errors = [];
  tab.on('pageerror', (e) => errors.push(e.message));
  await tab.goto(`${base}/play/?autostart=1&questoffer=off&hstip=0`);
  await tab.waitForFunction(() => !document.body.classList.contains('is-booting') && document.getElementById('overlay')?.classList.contains('hidden') && document.documentElement.classList.contains('phone-layout'), null, { timeout: 60_000 });
  await tab.evaluate((tsid) => {
    for (const b of document.querySelectorAll('button')) if (b.textContent.trim() === 'Got it' && b.offsetParent) b.click();
    return window.groddleQA.audio.travel(tsid);
  }, KALA);
  await tab.waitForTimeout(2500);
  return { ctx, tab, errors };
}

/** Arrival, the closest pinch level and back, walking right, then sideways. */
async function walkThrough(tab, { sideways }) {
  const bad = [];
  bad.push(...problems(await measure(tab), 'on arrival'));
  for (const level of [100, 0]) {
    await tab.evaluate((v) => {
      const input = document.getElementById('menu-zoom');
      input.value = String(v);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }, level);
    await tab.waitForTimeout(1200);
    bad.push(...problems(await measure(tab), `zoom ${level}`));
  }
  await tab.keyboard.down('ArrowRight');
  await tab.waitForTimeout(1500);
  await tab.keyboard.up('ArrowRight');
  await tab.waitForTimeout(1200);
  bad.push(...problems(await measure(tab), 'after walking'));
  if (sideways) {
    await tab.setViewportSize(sideways);
    await tab.waitForTimeout(1500);
    const m = await measure(tab);
    // Sideways nothing changes: the canvas fills the screen, the controls stand over its sides.
    if (m.canvas.top > 0.5 || Math.abs(m.canvas.height - m.window) > 0.5) bad.push(`sideways: the canvas ${Math.round(m.canvas.top)} to ${Math.round(m.canvas.bottom)}, not the whole ${m.window}`);
    if (!(m.feet < m.packTop)) bad.push(`sideways: the feet at ${Math.round(m.feet)}, the pack row from ${Math.round(m.packTop)}`);
  }
  return bad;
}

let server = null;
const LOCK_WAIT_MS = 30 * 60_000;

describe('#654: the street between the top bar and the controls (Chrome, 384x748)', { skip: !playwright && 'no playwright' }, () => {
  let chrome = null;
  before(async () => {
    const { openBrowser } = await import('../tools/qa/browser.mjs');
    const { startServer } = await import('../tools/qa/serve.mjs');
    server = await startServer({ root: join(root, 'public') });
    chrome = await openBrowser({ label: 'phone-street-band test (Chrome)', waitMs: LOCK_WAIT_MS });
  }, { timeout: LOCK_WAIT_MS + 60_000 });
  after(async () => {
    await chrome?.close();
  });

  it('the canvas stays clear of both bars; the feet, Act and the pack row on arrival, at a pinch level, after walking; sideways unchanged', { timeout: 120_000 }, async () => {
    const { ctx, tab, errors } = await onKalaClose(chrome.browser, { viewport: { width: 384, height: 748 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1, userAgent: UA });
    const bad = await walkThrough(tab, { sideways: { width: 748, height: 384 } });
    await ctx.close();
    assert.deepEqual(bad, []);
    assert.deepEqual(errors, []);
  });
});

describe('#654: the street between the top bar and the controls (WebKit, iPhone 15 Pro)', { skip: !playwright && 'no playwright' }, () => {
  let webkit = null;
  before(async () => {
    const { openBrowser } = await import('../tools/qa/browser.mjs');
    if (!server) {
      const { startServer } = await import('../tools/qa/serve.mjs');
      server = await startServer({ root: join(root, 'public') });
    }
    try {
      webkit = await openBrowser({ label: 'phone-street-band test (WebKit)', engine: 'webkit', waitMs: LOCK_WAIT_MS });
    } catch (e) { console.error(`no WebKit: ${e.message}`); webkit = null; }
  }, { timeout: LOCK_WAIT_MS + 60_000 });
  after(async () => {
    await webkit?.close();
    await server?.stop();
  });

  it('the same on Safari\'s engine', { timeout: 120_000 }, async (t) => {
    if (!webkit) {
      t.skip('no WebKit (tools/qa/setup-webkit.sh)');
      return;
    }
    const { ctx, tab, errors } = await onKalaClose(webkit.browser, { ...playwright.devices['iPhone 15 Pro'] });
    const bad = await walkThrough(tab, { sideways: null });
    await ctx.close();
    assert.deepEqual(bad, []);
    assert.deepEqual(errors, []);
  });
});
