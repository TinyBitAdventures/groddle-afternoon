/**
 * A pack stack dragged in the house and its back yard, over what is drawn on top of the room
 * (review 2026-11-27, the leftovers of the back yard's drag and drop).
 *
 * 1. The HUD (js/drop-targets.js DROP_THROUGH): in Classic the Currants counter sits on the view's left
 *    edge at floor height, so a stack held there to scroll the room was over the counter, not the room:
 *    the room did not scroll and the stack could not be let go there. Glitch asked the location itself
 *    (LocationInputHandler.as _packDragMoveHandler 655-658: hitTestObject, whatever was drawn on top) and
 *    scrolled by the pointer alone (HandOfDecorator.as maybeScrollVPByDragging). Every HUD element on both
 *    edges, in Classic and Modern, at a computer's size and a phone's.
 *
 * 2. What pops up by itself mid-drag (the Magic Rock's New Quest card, a prompt, the familiar, a notice such as
 *    the butler's or the mail's): it covered the room, so the stack let go over it went nowhere and the drag
 *    seemed cancelled. Glitch's drag went on under a card (Cursor.as blur does nothing; the location was
 *    still asked, as in 1); its screens (level up, a badge, a finished quest, a Giant, the new day) waited
 *    while the Cursor held a drag (TSFrontController.as tryShowScreenViewFromQ 3378).
 *
 * The drag goes through the page's own registry as the mouse's does: a dragover on the element under the
 * pointer (document.elementFromPoint), as HTML5 sends it, every 100 ms while held.
 * Browser blocks hold the browser lock (GRODDLE_BROWSER_LOCK) under 60 s each.
 * Run: node --test tests/yard-drag-hud.test.js
 * GRODDLE_YARD_SHOT=<dir> saves the pictures.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const SHOT = process.env.GRODDLE_YARD_SHOT || '';

let chromium = null;
try { await import('../tools/qa/playwright-env.mjs'); chromium = (await import('playwright')).chromium; } catch { /* no Playwright */ }

const LOCK_WAIT_MS = 30 * 60_000;
const CANVAS = 'canvas[aria-label="Groddle game world"]';
const PLAY = '/play/?autostart=1&questoffer=off&hstip=0&fresh=1&resetgame=1&homedemo=interior&homex=-500';

function harness(ctxOpts) {
  const h = { chrome: null, server: null, ctx: null, page: null, base: '' };
  h.open = async (label) => {
    const { openBrowser } = await import('../tools/qa/browser.mjs');
    const { startServer } = await import('../tools/qa/serve.mjs');
    h.server = await startServer({ root: join(root, 'public') });
    h.base = `http://127.0.0.1:${h.server.address().port}`;
    h.chrome = await openBrowser({ label, waitMs: LOCK_WAIT_MS });
    h.ctx = await h.chrome.browser.newContext(ctxOpts);
    await h.ctx.addInitScript(() => { try { localStorage.setItem('groddle-play-device', 'qa-game'); } catch { /* no storage */ } });
    h.page = await h.ctx.newPage();
    h.page.setDefaultTimeout(8000);
  };
  h.close = async () => {
    await h.ctx?.close().catch(() => {});
    await h.chrome?.close();
    await h.server?.stop();
  };
  return h;
}

function helpers(h) {
  const page = () => h.page;
  const data = () => page().evaluate((sel) => ({ ...document.querySelector(sel).dataset }), CANVAS);
  const gotIt = () => page().evaluate(() => { for (const b of document.querySelectorAll('button')) if (/^(Got it|OK|Close)$/.test(b.textContent.trim()) && b.offsetParent) b.click(); });
  const camX = () => page().evaluate(() => window.groddleQA.cameraFrame().camX);
  /** The avatar stood in the house's doorway and the camera settled there: room to scroll both ways. */
  async function center() {
    const x0 = Number((await data()).homeHouseX);
    await page().evaluate(([x, y]) => window.groddleQA.placeAvatar(x, y), [x0, 676]);
    let last = null;
    for (let i = 0; i < 40; i += 1) {
      await page().waitForTimeout(150);
      const now = Math.round(await camX());
      if (now === last) break;
      last = now;
    }
  }
  async function yard(flag = '') {
    await page().goto(`${h.base}${PLAY}${flag}`);
    await page().waitForFunction((s) => document.querySelector(s)?.dataset.homeScene === 'interior' && window.groddlePack?.grant && window.groddleQA?.cameraFrame, CANVAS, { timeout: 30000 });
    await page().waitForTimeout(1200);
    await gotIt();
    await page().evaluate(() => window.groddlePack.grant('cherry', 6));
  }
  /**
   * A pack stack begun, then held at (x, y) for `ms`: a dragover on the element under the pointer every
   * 100 ms (HTML5's), then, with `drop`, let go there (its drop). Returns what was under it and the registry's marks.
   */
  const hold = (at, ms, { drop = false } = {}) => page().evaluate(async ([p, wait, letGo]) => {
    const url = performance.getEntriesByType('resource').map((e) => e.name).find((name) => /\/js\/drop-targets\.js/.test(name));
    const m = await import(url);
    const el = document.elementFromPoint(p.x, p.y);
    const under = el ? `${el.closest('[id]')?.id || ''}.${String(el.className?.baseVal ?? el.className ?? '').split(' ')[0]}` : '';
    const cam0 = window.groddleQA.cameraFrame().camX;
    m.beginDrag({ from: 'pack', cls: 'cherry', count: 1 });
    const send = (type) => {
      const e = new DragEvent(type, { bubbles: true, cancelable: true, composed: true, clientX: p.x, clientY: p.y });
      (document.elementFromPoint(p.x, p.y) || document.body).dispatchEvent(e);
    };
    const t0 = performance.now();
    let over = '';
    while (performance.now() - t0 < wait) {
      send('dragover');
      over = over || document.documentElement.dataset.dropOver || '';
      await new Promise((r) => setTimeout(r, 100));
    }
    const cam1 = window.groddleQA.cameraFrame().camX;
    if (letGo) send('drop');
    else m.endDrag();
    return { under, over, last: document.documentElement.dataset.dropLast || '', before: cam0, after: cam1 };
  }, [at, ms, drop]);
  /** Every screen answered (a new day, a level, a badge the fresh save brings), none waiting: the start of a clean drag. */
  async function quiet() {
    let calm = 0;
    for (let i = 0; i < 80 && calm < 4; i += 1) {
      const busy = await page().evaluate(() => {
        const up = ['award-screen', 'new-day-screen', 'giant-screen-panel'].map((id) => document.getElementById(id)).filter((el) => el && !el.hidden && el.classList.contains('is-visible'));
        for (const el of up) [...el.querySelectorAll('button')].find((b) => b.offsetParent && !b.disabled)?.click();
        return up.length > 0 || window.groddleQA.notify.screensPending() > 0;
      });
      calm = busy ? 0 : calm + 1;
      await page().waitForTimeout(150);
    }
    assert.equal(calm >= 4, true, 'the screens a fresh save brings are answered');
  }
  async function shot(name) {
    if (!SHOT) return;
    mkdirSync(SHOT, { recursive: true });
    await page().screenshot({ path: join(SHOT, name) });
  }
  return { page, base: () => h.base, data, camX, center, quiet, yard, hold, shot };
}

/** The HUD elements on the view's left and right edges (inside the 48 px edge band), as client points. */
const edgeHud = (page) => page.evaluate((sel) => {
  const r = document.querySelector(sel).getBoundingClientRect();
  const out = [];
  const seen = new Set();
  // Three depths inside the 48 px edge band (home-builder.js edgePan).
  for (const [side, x] of [['left', r.left + 6], ['left', r.left + 24], ['left', r.left + 42], ['right', r.right - 6], ['right', r.right - 24], ['right', r.right - 42]]) {
    for (let y = Math.ceil(r.top) + 2; y < r.bottom; y += 4) {
      const el = document.elementFromPoint(x, y);
      if (!el || el.tagName === 'CANVAS') continue;
      // The pack and the windows are drop targets or the player's own: only the HUD over the room.
      if (el.closest('#pack-bar, [role="dialog"], .local-chat-dock.is-open')) continue;
      const top = el.closest('#currants-stat, #hud-stats, .top-actions, #street-minimap, .social-rail, .local-chat-dock, #street-nameplate, #quest-pins, #buff-strip, #play-context, .top-bar') || el;
      const key = `${side}:${top.id || top.className}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ side, name: `${top.id || String(top.className).split(' ')[0]}+${Math.round(Math.abs(x - (side === 'left' ? r.left : r.right)))}`, x: Math.round(x), y });
    }
  }
  return out;
}, CANVAS);

/** One browser for one test: the lock is held under 60 s each (the brief's rule). */
function browserIt(name, ctxOpts, timeout, fn) {
  it(name, { timeout: LOCK_WAIT_MS + timeout, skip: !chromium && 'no playwright' }, async () => {
    const h = harness(ctxOpts);
    try {
      await h.open(`yard drag hud: ${name.slice(0, 40)}`);
      await fn(helpers(h), h);
    } finally {
      await h.close();
    }
  });
}

const COMPUTER = { viewport: { width: 1352, height: 802 } };
const PHONE = { viewport: { width: 844, height: 390 }, hasTouch: true };

describe('review 2026-11-27 leftover 1: a pack stack held over the HUD at the view\'s edge', () => {
  browserIt('Classic (1352x802): held over the Currants counter at the left edge, at floor height, the room scrolls; let go there, it lands in the yard', COMPUTER, 45_000, async (t) => {
    const page = t.page();
    await t.yard('&ui=classic');
    const at = await page.evaluate((sel) => {
      const r = document.querySelector(sel).getBoundingClientRect();
      const c = document.getElementById('currants-stat').getBoundingClientRect();
      return { x: Math.round(r.left + 6), y: Math.round(c.top + c.height / 2), floorY: Math.round(r.top + (r.bottom - r.top) * 0.75) };
    }, CANVAS);
    assert.ok(Math.abs(at.y - at.floorY) < 120, `the counter at floor height: ${at.y} (floor ~${at.floorY})`);
    await t.center();
    const got = await t.hold(at, 2500, { drop: true });
    const { before, after } = got;
    await page.waitForTimeout(400);
    await t.shot('hud-currants-classic-1352x802.png');
    assert.match(got.under, /^currants-stat\./, `the counter is under the pointer: ${got.under}`);
    assert.ok(after < before - 150, `the room scrolled left: ${before} -> ${after}`);
    assert.equal(got.over, 'home-place:ok', 'the room takes it over the counter');
    assert.match(got.last, /^home-place:ok:/);
    assert.equal((await t.data()).homeDropLast, 'place:cherry:yard', 'let go over the counter, it lands in the yard');
  });

  for (const [size, ctx] of [['1352x802', COMPUTER], ['844x390 touch', PHONE]]) {
    for (const [skin, flag] of [['Classic', '&ui=classic'], ['Modern', '']]) {
      browserIt(`${skin} (${size}): every HUD element on the left and right edges lets the room take the stack and scroll`, ctx, 55_000, async (t) => {
        const page = t.page();
        await t.yard(flag);
        const huds = await edgeHud(page);
        assert.ok(huds.length >= 2, `HUD on the edges: ${JSON.stringify(huds)}`);
        const bad = [];
        for (const hud of huds) {
          await t.center();
          const got = await t.hold(hud, 900);
          const { before, after } = got;
          const moved = hud.side === 'left' ? after < before : after > before;
          if (got.over !== 'home-place:ok') bad.push(`${hud.side} ${hud.name} at ${hud.y}: over ${got.over || 'nothing'}`);
          else if (!moved) bad.push(`${hud.side} ${hud.name} at ${hud.y}: the room did not scroll (${before} -> ${after})`);
        }
        await t.shot(`hud-edges-${skin.toLowerCase()}-${size.split(' ')[0]}.png`);
        assert.deepEqual(bad, [], JSON.stringify(huds));
      });
    }
  }
});

/**
 * The page's drop registry, a step at a time, as the mouse drives it: begin, then a dragover (or the drop)
 * dispatched on the element under the point, as HTML5 sends them. Returns what was under the point and the marks.
 */
const step = (page, what, at = null) => page.evaluate(async ([w, p]) => {
  const url = performance.getEntriesByType('resource').map((e) => e.name).find((name) => /\/js\/drop-targets\.js/.test(name));
  const m = await import(url);
  if (w === 'begin') return Boolean(m.beginDrag({ from: 'pack', cls: 'cherry', count: 1 }));
  if (w === 'drag') return Boolean(m.currentDrag());
  const el = document.elementFromPoint(p.x, p.y);
  (el || document.body).dispatchEvent(new DragEvent(w, { bubbles: true, cancelable: true, composed: true, clientX: p.x, clientY: p.y }));
  return { under: el ? `${el.closest('[id]')?.id || ''}` : '', over: document.documentElement.dataset.dropOver || '', last: document.documentElement.dataset.dropLast || '' };
}, [what, at]);

describe('review 2026-11-27 leftover 2: what pops up by itself mid-drag leaves the drag going', () => {
  browserIt('Modern (1352x802): the Magic Rock\'s New Quest card pops up mid-drag; the stack still lands where it is let go, over the card', COMPUTER, 45_000, async (t) => {
    const page = t.page();
    await t.yard();
    await t.quiet();
    const cardUp = () => page.evaluate(() => !document.getElementById('quest-dialogue')?.hidden);
    assert.equal(await cardUp(), false, 'no card yet when the drag begins');
    const at = await page.evaluate((sel) => {
      const r = document.querySelector(sel).getBoundingClientRect();
      return { x: Math.round((r.left + r.right) / 2), y: Math.round(r.top + (r.bottom - r.top) * 0.55) };
    }, CANVAS);
    assert.ok(await step(page, 'begin'));
    let got = await step(page, 'dragover', at);
    assert.equal(got.over, 'home-place:ok', `the room takes it first: ${JSON.stringify(got)}`);
    // The card pops as an offer does (quest-offers-feature openOffer: engine.offerQuestDialogue).
    await page.evaluate(() => window.groddleQA.notify.questCard('Pot\'s Empty Table', 'Psst. Pot wants a feast!'));
    for (let i = 0; i < 6; i += 1) {
      await page.waitForTimeout(100);
      got = await step(page, 'dragover', at);
    }
    await t.shot('popup-quest-card-mid-drag-1352x802.png');
    assert.equal(await cardUp(), true, 'the New Quest card popped up mid-drag');
    assert.equal(got.under, 'quest-dialogue', 'the card is under the pointer');
    assert.equal(await step(page, 'drag'), true, 'the drag goes on');
    assert.equal(got.over, 'home-place:ok', 'the room still takes it under the card');
    got = await step(page, 'drop', at);
    await page.waitForTimeout(400);
    assert.match(got.last, /^home-place:ok:/);
    assert.equal((await t.data()).homeDropLast, 'place:cherry:yard', 'it lands in the yard where it was let go');
    assert.equal(await cardUp(), true, 'the card is still there to answer');
  });

  browserIt('Modern (1352x802): a badge\'s screen waits until the drag ends (Glitch held screens while the Cursor dragged), then shows', COMPUTER, 45_000, async (t) => {
    const page = t.page();
    await t.yard();
    const at = await page.evaluate((sel) => {
      const r = document.querySelector(sel).getBoundingClientRect();
      return { x: Math.round((r.left + r.right) / 2), y: Math.round(r.top + (r.bottom - r.top) * 0.55) };
    }, CANVAS);
    const shown = () => page.evaluate(() => Boolean(document.getElementById('award-screen')?.classList.contains('is-visible')));
    await t.quiet();
    assert.ok(await step(page, 'begin'));
    await step(page, 'dragover', at);
    assert.ok(await page.evaluate(() => window.groddleQA.notify.grantBadge('first_eleven_skills') !== false));
    let up = false;
    for (let i = 0; i < 25; i += 1) {
      await page.waitForTimeout(100);
      const got = await step(page, 'dragover', at);
      up = up || (await shown());
      if (got.over !== 'home-place:ok') assert.fail(`the drag lost the room: ${JSON.stringify(got)}`);
    }
    assert.equal(up, false, 'no screen over the drag');
    assert.ok(await page.evaluate(() => window.groddleQA.notify.screensPending()) >= 1, 'the screen waits');
    const got = await step(page, 'drop', at);
    assert.match(got.last, /^home-place:ok:/);
    await page.waitForTimeout(400);
    assert.equal((await t.data()).homeDropLast, 'place:cherry:yard');
    for (let i = 0; i < 40 && !up; i += 1) {
      await page.waitForTimeout(100);
      up = await shown();
    }
    await t.shot('popup-badge-after-drop-1352x802.png');
    assert.equal(up, true, 'the screen shows once the stack is let go');
  });

  browserIt('Modern (844x390): a notice (the butler\'s, the mail\'s) that pops up under the pointer mid-drag; let go over it, the stack lands in the yard', PHONE, 45_000, async (t) => {
    const page = t.page();
    await t.yard();
    await t.quiet();
    assert.ok(await step(page, 'begin'));
    await page.evaluate(() => window.groddleQA.notify.notice('You have mail.', 9000));
    await page.waitForTimeout(500);
    const at = await page.evaluate(() => {
      const c = [...document.querySelectorAll('#notify-notices .notify-card')].at(-1);
      const r = c?.getBoundingClientRect();
      return r && { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
    });
    assert.ok(at, 'the notice shows');
    let got = null;
    for (let i = 0; i < 3; i += 1) {
      got = await step(page, 'dragover', at);
      await page.waitForTimeout(100);
    }
    assert.equal(got.under, 'notify-notices', 'the notice is under the pointer');
    assert.equal(got.over, 'home-place:ok', 'the room takes it under the notice');
    got = await step(page, 'drop', at);
    await page.waitForTimeout(400);
    await t.shot('popup-notice-844x390.png');
    assert.match(got.last, /^home-place:ok:/);
    assert.equal((await t.data()).homeDropLast, 'place:cherry:yard');
  });
});
