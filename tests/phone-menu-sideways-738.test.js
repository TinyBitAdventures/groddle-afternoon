/**
 * #738 (an iPhone 15 Pro sideways, 874 x 402, the Home Screen app; Austin's ruling 2026-11-26): the
 * sideways half sheets (the Menu, Quests, Social, the side sheets, the chat dock) share one column at the
 * left (js/ui/phone-layout.js), sized as the safe-area inset plus 360 px but laid from x 0, so the card
 * stood under the camera cut-out while the stats pill and the pack row kept the inset; and the room the
 * docked street left above and below the card was the dark band (#2a2a2a), read as a dark overlay.
 * - pure: the sideways column starts at the left inset and the street still docks beside its whole width;
 * - WebKit as an iPhone 15 Pro sideways on Tonga Trips (the insets set by hand: Playwright cannot emulate
 *   env(safe-area-inset-*)): the Menu's and Quests' cards start at the inset, the street docks beside the
 *   column, and the room beside it is the page's surface colour.

 * Run: node --test tests/phone-menu-sideways-738.test.js
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { COLUMN_W, phoneRegions } from '../public/js/ui/phone-layout.js?v=d65ffc01';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const css = readFileSync(join(root, 'public/style.css'), 'utf8');

const SIDEWAYS = { width: 874, height: 402 };
const SIDEWAYS_SAFE = { l: 62, r: 62, b: 21, t: 0 };

describe('#738: the sideways column keeps the safe-area inset (pure)', () => {
  it('the card starts at the left inset; the street docks beside the column\'s whole width', () => {
    const r = phoneRegions({ ...SIDEWAYS, safe: SIDEWAYS_SAFE, sheet: 'half' });
    assert.equal(r.sheet.left, SIDEWAYS_SAFE.l, 'the card starts at the inset, not under the camera cut-out');
    assert.equal(r.sheet.right, SIDEWAYS_SAFE.l + COLUMN_W);
    assert.deepEqual(r.dock, { side: 'left', css: r.sheet.right, zoom: true });
    assert.ok(r.notices.left > r.sheet.right && r.buffs.left > r.sheet.right);
    // No inset (a Safari tab, Android): the column at the edge, as before.
    assert.equal(phoneRegions({ ...SIDEWAYS, sheet: 'half' }).sheet.left, 0);
    // Upright the sheet spans the width.
    assert.equal(phoneRegions({ width: 402, height: 874, safe: { t: 62, b: 34 }, sheet: 'half' }).sheet.left, 0);
  });

  it('the room beside the column is the page\'s surface, not the dark band', () => {
    assert.match(css, /\[data-phone-sheet="half"\] #game-root\[data-stage-docked="left"\] \{ background-color: var\(--surface\); \}/);
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

describe('#738 on Safari\'s engine (WebKit, iPhone 15 Pro, Tonga Trips)', { skip: !playwright && 'no playwright' }, () => {
  before(async () => {
    const { openBrowser } = await import('../tools/qa/browser.mjs');
    const { startServer } = await import('../tools/qa/serve.mjs');
    server = await startServer({ root: join(root, 'public') });
    try {
      webkit = await openBrowser({ label: 'phone-menu-sideways-738 test (WebKit)', engine: 'webkit', waitMs: LOCK_WAIT_MS });
    } catch (e) { console.error(`no WebKit: ${e.message}`); webkit = null; }
  }, { timeout: LOCK_WAIT_MS + 60_000 });
  after(async () => {
    await webkit?.close();
    await server?.stop();
  });

  it('#738 sideways: the Menu and Quests keep the inset, the street docks beside the column, the room beside it is the page\'s surface', { timeout: 120_000 }, async (t) => {
    if (!webkit) {
      t.skip('no WebKit (tools/qa/setup-webkit.sh)');
      return;
    }
    const { ctx, tab, errors } = await onTonga(SIDEWAYS, SIDEWAYS_SAFE);
    await tab.evaluate(() => document.getElementById('more-btn').click());
    await tab.waitForTimeout(1200);
    const menu = await measure(tab, '.top-bar #more-list');
    await tab.evaluate(() => {
      const row = document.getElementById('menu-quest-btn') || [...document.querySelectorAll('#more-list button')].find((b) => b.textContent.trim() === 'Quests');
      row?.click();
    });
    await tab.waitForTimeout(1200);
    const quests = await measure(tab, '#quest-panel:not([hidden]) > .side-card');
    await ctx.close();
    for (const [name, m] of [['the Menu', menu], ['Quests', quests]]) {
      assert.equal(m.sheet, 'half', `${name} is open as a half sheet`);
      assert.ok(m.card, `${name}'s card shows`);
      assert.ok(m.card.left >= SIDEWAYS_SAFE.l - 0.5, `${name}'s card starts at ${m.card.left} px, under the camera cut-out (inset ${SIDEWAYS_SAFE.l} px)`);
      assert.ok(m.canvas.left >= m.card.right - 0.5, `${name}: the street (from ${m.canvas.left}) docks beside the column (to ${m.card.right})`);
      assert.equal(m.rootBg, m.surface, `${name}: the room beside the column is ${m.rootBg}, not the page's surface ${m.surface}`);
    }
    assert.deepEqual(errors, []);
  });
});
