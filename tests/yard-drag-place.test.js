/**
 * Drag and drop in the back yard (Austin 2026-11-27: "Placing items in the backyard is very tedious. Can we
 * allow for drag and drop place similar to inside the house?").
 *
 * The back yard is part of the house's own location (inc_homes.js homes_rebuild_rooms: the house is a
 * "house-right" location, the yard runs left of it), and Glitch's can_decorate held there (WorldModel.as 59:
 * the location is the player's interior_tsid), so a pack stack let go over the yard went on the plat under
 * the pointer (HandOfDecorator.as packDragStartHandler 538-545, dropItemFromPackOnTargetPlatform). Ours set it
 * on the house's floor instead: home-decor.js stackSurfaceAt clamps a point to the house's room, so a stack
 * dropped anywhere in the yard landed just inside the house's left wall. Now it lands on the yard's ground
 * under the pointer (homes-feature.js yardDropSpot), with the marker there while dragging, solo and online
 * (the same dropPackStackAt; drops.go lets the owner set a stack anywhere in their own house).
 *
 * Cultivate's tray (ours: Glitch carried a cultivation at your feet and placed it with the carry UI's button,
 * CultManager.as 550-645, 706-743) drags onto the yard as it did, checked here at the pointer with the yard's
 * own rules (placementCheck: room, spacing, the way into the house), its refusal saying why.
 *
 * Browser blocks hold the browser lock (GRODDLE_BROWSER_LOCK) under 60 s each.
 * Run: node --test tests/yard-drag-place.test.js
 * GRODDLE_YARD_SHOT=<dir> saves the pictures (pack, cultivate, phone).
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { BACK_YARD_GROUND_Y, CULTIVATION_PIN, YARD_DROP_EDGE, cultivationPin, yardDropSpot } from '../public/js/features/homes-feature.js?v=78d0151e';

import { createBackYardState, placementCheck } from '../public/js/home-cultivation.js?v=122d6f45';

const root = join(import.meta.dirname, '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');
const SHOT = process.env.GRODDLE_YARD_SHOT || '';
/** World px between the pointer and where the test maps it (the canvas data gives the camera, not the stage's insets and easing). */
const NEAR = 48;

describe('a stack let go over the back yard lands on its ground (pure)', () => {
  it('at the pointer\'s x, on the yard\'s ground, on nothing', () => {
    assert.deepEqual(yardDropSpot(-400, 1050), { x: -400, y: BACK_YARD_GROUND_Y, on: null, yard: true });
    assert.equal(yardDropSpot(-731.6, 1050).x, -732);
  });

  it('kept off the yard\'s far end and the foot of the ramp into the house', () => {
    assert.equal(yardDropSpot(-5000, 1050).x, -1050 + YARD_DROP_EDGE);
    assert.equal(yardDropSpot(-3, 1050).x, -YARD_DROP_EDGE);
    assert.ok(-YARD_DROP_EDGE < -20, 'left of the ramp (home-wallpaper.js rampX -20)');
  });

  it('over the house (room x 0 and on), or with no yard, it is the house\'s own floor and shelves', () => {
    assert.equal(yardDropSpot(0, 1050), null);
    assert.equal(yardDropSpot(300, 1050), null);
    assert.equal(yardDropSpot(-200, 0), null);
    assert.equal(yardDropSpot(Number.NaN, 1050), null);
  });

  it('the pack drop, a moved stack and their markers all ask the yard first (source)', () => {
    const homes = read('public/js/features/homes-feature.js');
    assert.match(homes, /function stackSpotAt\(p\) \{\n {2}return \(inHouse\(\) \? yardDropSpot\(p\.x, roomX0\(\)\) : null\) \|\| stackSurfaceAt\(decor, p\.x, p\.y\);/);
    const pd = homes.slice(homes.indexOf('function packDropTarget('), homes.indexOf('function stackSpotAt('));
    assert.match(pd, /return stackSpotAt\(p\);/);
    const ms = homes.slice(homes.indexOf('function moveStack('), homes.indexOf('function shareOwnStack('));
    assert.match(ms, /const target = stackSpotAt\(p\);/);
  });
});

describe('a pin over a carried cultivation (pure)', () => {
  it('stands over its art, and at least CULTIVATION_PIN.least over the ground, point down at the foot', () => {
    assert.equal(cultivationPin(0).top, -CULTIVATION_PIN.least, 'a flat Patch: the least');
    assert.equal(cultivationPin(96).top, -(96 + 6 + CULTIVATION_PIN.rise), 'a tall rock: over its art');
    const p = cultivationPin(40);
    assert.ok(p.top + p.head + p.stem < 0, 'the stem stops short of the ground pad');
    assert.ok(CULTIVATION_PIN.least >= 60, 'clear of a tray whose top edge sits at the ground');
    // Classic's taller tray covers the ground whole: the pin's head stands over the tray's edge.
    const hid = cultivationPin(30, 100);
    assert.ok(hid.top + 100 <= -CULTIVATION_PIN.head - 12, `its head over the edge: ${hid.top}`);
    assert.deepEqual(cultivationPin(30, -40), cultivationPin(30), 'a ground in view changes nothing');
  });
});

describe('review 2026-11-27 #4: a cultivation set against the house says why (pure)', () => {
  it('beside the house it is the way in, not a short yard; the far end still asks for an expansion', () => {
    const st = createBackYardState({});
    for (const rx of [-20, -60, -120]) {
      const fit = placementCheck(st, 'proto_dullite_rock', rx);
      assert.equal(fit.reason, 'door', `${rx}: ${fit.msg}`);
      assert.equal(fit.msg, 'Keep the way into your house clear.');
    }
    const far = placementCheck(st, 'proto_dullite_rock', -760);
    assert.equal(far.reason, 'edge');
    assert.match(far.msg, /Expand the yard/);
    assert.equal(placementCheck(st, 'proto_dullite_rock', -200).ok, true);
    assert.equal(placementCheck(st, 'proto_dullite_rock', 200).msg, 'That is inside your house. Set it down in the yard.');
  });
});

let chromium = null;
try { await import('../tools/qa/playwright-env.mjs'); chromium = (await import('playwright')).chromium; } catch { /* no Playwright */ }

const LOCK_WAIT_MS = 30 * 60_000;
const CANVAS = 'canvas[aria-label="Groddle game world"]';
const PLAY = '/play/?autostart=1&questoffer=off&hstip=0&fresh=1&resetgame=1&homedemo=interior';

function harness(ctxOpts, { engine = '' } = {}) {
  const h = { chrome: null, server: null, ctx: null, page: null, base: '' };
  h.open = async (label) => {
    const { openBrowser } = await import('../tools/qa/browser.mjs');
    const { startServer } = await import('../tools/qa/serve.mjs');
    h.server = await startServer({ root: join(root, 'public') });
    h.base = `http://127.0.0.1:${h.server.address().port}`;
    h.chrome = await openBrowser({ label, waitMs: LOCK_WAIT_MS, ...(engine ? { engine } : {}) });
    h.ctx = await h.chrome.browser.newContext(ctxOpts);
    // A phone plays this device's game, not the companion (as tests/r695-garden-act-phone.test.js).
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
  /** A world point as a client point: the world layer's offset (groddleQA.cameraFrame) and the view's width, as worldPoint inverts. */
  const client = (wx, wy) => page().evaluate(([sel, x, y]) => {
    const r = document.querySelector(sel).getBoundingClientRect();
    const f = window.groddleQA.cameraFrame();
    const k = r.width / f.viewW;
    return { x: Math.round(r.left + (f.worldX + x) * k), y: Math.round(r.top + (f.worldY + y) * k) };
  }, [CANVAS, wx, wy]);
  /** The tray's top in client px (the Cultivate tray), or the window's bottom. */
  const trayTop = () => page().evaluate(() => document.getElementById('homes-tray')?.getBoundingClientRect().top ?? innerHeight);
  /** Stand the avatar at world x on the yard and let the camera come. */
  async function standAt(wx) {
    await page().evaluate(([x, y]) => window.groddleQA.placeAvatar(x, y - 4), [wx, 680]);
    await page().waitForTimeout(1600);
  }
  /** A pack stack dragged to a client point through the page's own drop registry (the mouse's and the touch lift's one path). */
  const registryDrag = (cls, count, at, { drop = true } = {}) => page().evaluate(async ([sel, c, n, p, letGo]) => {
    const url = performance.getEntriesByType('resource').map((e) => e.name).find((name) => /\/js\/drop-targets\.js/.test(name));
    const m = await import(url);
    const el = document.querySelector(sel);
    m.beginDrag({ from: 'pack', cls: c, count: n });
    const over = m.dragOver({ x: p.x, y: p.y, el });
    const mark = el.dataset.homePackMark || '';
    const res = letGo ? m.dragDrop({ x: p.x, y: p.y, el }) : (m.endDrag(), null);
    return { over: over?.target?.id || '', mark, res };
  }, [CANVAS, cls, count, at, drop]);
  /** The page's own drop registry, a step at a time (the drag stays begun between calls). */
  const reg = (step, arg = null) => page().evaluate(async ([sel, what, a]) => {
    const url = performance.getEntriesByType('resource').map((e) => e.name).find((name) => /\/js\/drop-targets\.js/.test(name));
    const m = await import(url);
    const canvas = document.querySelector(sel);
    const at = a && { x: a.x, y: a.y, el: a.sel ? document.querySelector(a.sel) : canvas };
    if (what === 'begin') return Boolean(m.beginDrag({ from: 'pack', cls: a.cls, count: a.count }));
    if (what === 'over') return m.dragOver(at)?.target?.id || '';
    if (what === 'drop') return m.dragDrop(at);
    m.endDrag();
    return null;
  }, [CANVAS, step, arg]);
  /** The dropped stacks drawn here: { label, x, y }. */
  const stacks = () => page().evaluate(() => window.groddleQA.snapshot().interactables.filter((t) => t.classId === 'dropped_item').map((t) => ({ label: t.label, x: Math.round(t.x), y: Math.round(t.y) })));
  const canvasRect = () => page().evaluate((sel) => { const r = document.querySelector(sel).getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom }; }, CANVAS);
  async function shot(name) {
    if (!SHOT) return;
    mkdirSync(SHOT, { recursive: true });
    await page().screenshot({ path: join(SHOT, name) });
  }
  return { page, data, gotIt, client, trayTop, standAt, registryDrag, reg, stacks, canvasRect, shot };
}

describe('the back yard in Chrome (1352x802, solo)', { skip: !chromium && 'no playwright' }, () => {
  const h = harness({ viewport: { width: 1352, height: 802 } });
  const t = helpers(h);
  before(async () => {
    await h.open('yard drag place test');
  }, { timeout: LOCK_WAIT_MS + 60_000 });
  after(() => h.close());

  it('1. a pack stack dragged onto the yard lands at the pointer on the yard\'s ground, the marker there first', { timeout: 50_000 }, async () => {
    const page = t.page();
    await page.goto(`${h.base}${PLAY}&homex=-500`);
    await page.waitForFunction((s) => document.querySelector(s)?.dataset.homeScene === 'interior' && window.groddlePack?.grant && window.groddleQA?.placeAvatar, CANVAS, { timeout: 30000 });
    await page.waitForTimeout(1200);
    await t.gotIt();
    await page.evaluate(() => window.groddlePack.grant('cherry', 3));
    const d = await t.data();
    const x0 = Number(d.homeHouseX);
    assert.ok(x0 > 600, `a back yard: ${x0}`);
    // A spot 300 px into the yard from the house, on screen (you stand 500 px in).
    const wx = x0 - 300;
    const at = await t.client(wx, 600);
    const got = await t.registryDrag('cherry', 3, at);
    await page.waitForTimeout(500);
    const after = await t.data();
    await t.shot('pack-yard-1352x802.png');
    assert.equal(got.over, 'home-place', JSON.stringify(got));
    const [mx, my] = got.mark.split(',').map(Number);
    assert.ok(Math.abs(mx - wx) <= NEAR && my === 680, `the marker at the pointer on the yard: ${got.mark} (pointer ${wx})`);
    assert.equal(after.homeDropLast, 'place:cherry:yard');
    assert.equal(after.homeDropAt, got.mark, 'it lands where the marker stood');
  });

  for (const [skin, flag] of [['Modern', ''], ['Classic', '&ui=classic']]) it(`2. ${skin}: a Cultivate tile dragged onto free yard ground is bought at the pointer; onto a rock it is refused, saying why`, { timeout: 50_000 }, async () => {
    const page = t.page();
    await page.goto(`${h.base}${PLAY}&homeyarddemo=cultivate${flag}`);
    await page.waitForFunction((s) => document.querySelector(s)?.dataset.homeMode === 'cultivate' && window.groddleQA?.placeAvatar, CANVAS, { timeout: 30000 });
    await page.waitForTimeout(1000);
    await t.gotIt();
    // The demo yard is full: two expansions make room at its far end (rx -1170..-1030 for a Patch).
    for (let i = 0; i < 2; i += 1) {
      await page.click('[data-home-expand="yard"]');
      await page.waitForTimeout(400);
      await page.evaluate(() => { for (const b of document.querySelectorAll('button')) if (/^Expand/.test(b.textContent.trim()) && b.closest('[role="dialog"], .quest-dialogue, .confirm') && b.offsetParent) b.click(); });
      await page.waitForTimeout(900);
    }
    const d = await t.data();
    assert.equal(d.homeBackYard, '4', `expanded twice: ${d.homeBackYard}`);
    const x0 = Number(d.homeHouseX);
    await t.standAt(x0 - 1000);
    const before = (await t.data()).homeBackCultivations;
    const tile = page.locator('[data-cultivate="proto_patch"]').first();
    const tb = await tile.boundingBox();
    // Onto the Beryl Rock (rx -820) first: refused, and the toast says why.
    let to = await t.client(x0 - 820, 560);
    await page.mouse.move(tb.x + tb.width / 2, tb.y + tb.height / 2);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 8 });
    await page.waitForTimeout(200);
    const tipNo = await page.evaluate(() => [...document.querySelectorAll('.world-drop-tip')].filter((e) => !e.hidden).map((e) => e.textContent).join('|'));
    await page.mouse.up();
    await page.waitForTimeout(500);
    const refused = await t.data();
    assert.match(refused.homeDropLast || '', /^refused:overlap/, JSON.stringify({ to, tile: tb, ghost: refused.homeGhostAt, drag: refused.homeDrag }));
    assert.equal(refused.homeBackCultivations, before, 'nothing bought');
    assert.match(tipNo, /Too close to your Beryl Rock\./, 'the reason shows while dragging');
    await t.page().keyboard.press('Escape');
    await page.waitForTimeout(300);
    // Then onto free ground at rx -1100: bought there, the ghost on the ground above the tray while dragging.
    to = await t.client(x0 - 1100, 560);
    await page.mouse.move(tb.x + tb.width / 2, tb.y + tb.height / 2);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 8 });
    await page.waitForTimeout(250);
    const mid = await t.data();
    await t.shot(`cultivate-drag-1352x802-${skin.toLowerCase()}.png`);
    const [gx, gy, ok] = mid.homeGhostAt.split(',');
    assert.equal(ok, 'ok', mid.homeGhostAt);
    assert.ok(Math.abs(Number(gx) - (x0 - 1100)) <= NEAR, `the ghost under the pointer: ${mid.homeGhostAt}`);
    // The pin over it shows clear of the tray, even where the yard's ground is behind the tray's edge.
    const pinTop = await t.client(Number(gx), Number(mid.homeGhostAt.split(',')[3]));
    assert.ok(pinTop.y < (await t.trayTop()) - 30, `the pin (${pinTop.y}) shows above the tray (${await t.trayTop()})`);
    // Let go to buy: no Place button over the ghost (it stood on the ghost's foot and hid the marker).
    assert.equal(await page.evaluate(() => document.getElementById('homes-place')?.hidden ?? true), true, 'no Place button while dragging');
    await page.mouse.up();
    await page.waitForTimeout(800);
    const done = await t.data();
    assert.equal(done.homeDropLast, 'placed');
    const added = done.homeBackCultivations.split(',').find((row) => !before.split(',').includes(row));
    assert.ok(added && /^patch@-1\d{3}$/.test(added), `a Patch bought: ${added}`);
    assert.equal(Number(added.split('@')[1]), Number(gx) - x0, 'where the ghost stood');
  });
});

/** A press on the tile at `from`, held, moved to `to` and let go, every event sent to the node it went down on (as Safari sends a finger's). */
async function safariTouchDrag(page, from, to, { holdMs = 450, steps = 6 } = {}) {
  return page.evaluate(async ([f, t, hold, n]) => {
    const node = document.elementFromPoint(f.x, f.y)?.closest('.hb-tile');
    if (!node) return { ok: false, why: 'no tile' };
    const send = (type, p, buttons) => node.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, composed: true, pointerId: 41, pointerType: 'touch', isPrimary: true, clientX: p.x, clientY: p.y, button: type === 'pointermove' ? -1 : 0, buttons }));
    send('pointerdown', f, 1);
    await new Promise((r) => setTimeout(r, hold));
    for (let i = 1; i <= n; i += 1) {
      send('pointermove', { x: f.x + ((t.x - f.x) * i) / n, y: f.y + ((t.y - f.y) * i) / n }, 1);
      await new Promise((r) => setTimeout(r, 60));
    }
    // Before the finger lifts: the drop redraws the tray again, as it may.
    const connected = node.isConnected;
    send('pointerup', t, 0);
    return { ok: true, connected };
  }, [from, to, holdMs, steps]);
}

describe('review 2026-11-27 in Chrome (1352x802, solo, Modern)', { skip: !chromium && 'no playwright' }, () => {
  const h = harness({ viewport: { width: 1352, height: 802 } });
  const t = helpers(h);
  before(async () => {
    await h.open('yard drag review test');
  }, { timeout: LOCK_WAIT_MS + 60_000 });
  after(() => h.close());

  async function yard() {
    const page = t.page();
    await page.goto(`${h.base}${PLAY}&homex=-500`);
    await page.waitForFunction((s) => document.querySelector(s)?.dataset.homeScene === 'interior' && window.groddlePack?.grant && window.groddleQA?.cameraFrame, CANVAS, { timeout: 30000 });
    await page.waitForTimeout(1200);
    await t.gotIt();
    await page.evaluate(() => window.groddlePack.grant('cherry', 6));
    return Number((await t.data()).homeHouseX);
  }

  it('item 2: a pack stack held at the view\'s edge scrolls the room, its marker staying under the pointer', { timeout: 40_000 }, async () => {
    const page = t.page();
    await yard();
    const r = await t.canvasRect();
    const at = { x: Math.round(r.right - 20), y: Math.round(r.top + (r.bottom - r.top) * 0.6) };
    const camBefore = (await page.evaluate(() => window.groddleQA.cameraFrame())).camX;
    assert.ok(await t.reg('begin', { cls: 'cherry', count: 1 }));
    assert.equal(await t.reg('over', at), 'home-place');
    const markBefore = Number((await t.data()).homePackMark.split(',')[0]);
    await page.waitForTimeout(2500);
    const camAfter = (await page.evaluate(() => window.groddleQA.cameraFrame())).camX;
    const markAfter = Number((await t.data()).homePackMark.split(',')[0]);
    await t.reg('end');
    assert.ok(camAfter > camBefore + 150, `the view scrolled right: ${camBefore} -> ${camAfter}`);
    assert.ok(markAfter > markBefore + 150, `the marker went with it: ${markBefore} -> ${markAfter}`);
  });

  it('item 6: over the open bag the yard\'s marker goes and the stack goes into the bag, not onto the yard', { timeout: 40_000 }, async () => {
    const page = t.page();
    await yard();
    const key = await page.evaluate(() => window.groddlePack.layout().pack.slots.find((s) => s.kind === 'bag')?.key);
    assert.ok(key, 'a bag in the pack');
    await page.evaluate((k) => window.groddlePack.toggle(k), key);
    await page.waitForTimeout(500);
    const slot = await page.evaluate(() => {
      const el = [...document.querySelectorAll('#pack-bag .pack-slot, .pack-bag-window .pack-slot, [id^="pack-bag"] .pack-slot')].find((e) => e.offsetParent);
      if (!el) return null;
      el.setAttribute('data-yard-test', '1');
      const b = el.getBoundingClientRect();
      return { x: Math.round(b.left + b.width / 2), y: Math.round(b.top + b.height / 2) };
    });
    assert.ok(slot, 'the open bag shows its slots');
    const before = (await t.stacks()).length;
    assert.ok(await t.reg('begin', { cls: 'cherry', count: 1 }));
    const yardAt = await t.client(400, 600);
    assert.equal(await t.reg('over', yardAt), 'home-place');
    assert.match((await t.data()).homePackMark, /^\d+,680$/, 'the marker on the yard first');
    const id = await t.reg('over', { ...slot, sel: '[data-yard-test="1"]' });
    assert.notEqual(id, 'home-place');
    assert.equal((await t.data()).homePackMark, '', 'no yard marker over the bag');
    await t.reg('drop', { ...slot, sel: '[data-yard-test="1"]' });
    await page.waitForTimeout(500);
    assert.equal((await t.stacks()).length, before, 'nothing set down in the yard');
  });

  it('item 1: Decoration Mode scrolls into the yard, and a stack there is selected and moved', { timeout: 50_000 }, async () => {
    const page = t.page();
    await yard();
    // A Cherry set down at the yard's far end (world x 80), then Decoration Mode.
    const drop = await t.client(80, 600);
    await t.reg('begin', { cls: 'cherry', count: 1 });
    await t.reg('drop', drop);
    await page.waitForTimeout(600);
    assert.equal((await t.data()).homeDropAt, '80,680');
    await page.click('#homes-decorate-btn');
    await page.waitForTimeout(800);
    // A sideways wheel pans the decorate camera (HandOfDecorator onMouseWheel), as the arrows do.
    const r = await t.canvasRect();
    await page.mouse.move((r.left + r.right) / 2, (r.top + r.bottom) / 2);
    for (let i = 0; i < 24; i += 1) await page.mouse.wheel(-120, 0);
    await page.waitForTimeout(1500);
    const at = await t.client(80, 664);
    const trayTop = await t.trayTop();
    assert.ok(at.y < trayTop - 4, `the yard's ground shows over Decoration Mode's tray: ${at.y} < ${trayTop}`);
    assert.ok(at.x > r.left + 10 && at.x < r.right - 10, `the yard's far end is in view in Decoration Mode: ${JSON.stringify(at)} in ${JSON.stringify(r)}`);
    const to = await t.client(420, 600);
    await page.mouse.move(at.x, at.y);
    await page.mouse.down();
    assert.match((await t.data()).homeSelected, /^stack:/, 'the press selects it');
    await page.mouse.move(at.x + 10, at.y - 10, { steps: 2 });
    await page.mouse.move(to.x, to.y, { steps: 10 });
    await page.waitForTimeout(200);
    await page.mouse.up();
    await page.waitForTimeout(700);
    await t.shot('decorate-yard-1352x802.png');
    const cherry = (await t.stacks()).find((s) => /cherr/i.test(s.label));
    assert.ok(cherry && Math.abs(cherry.x - 420) <= NEAR && cherry.y === 680, `moved on the yard: ${JSON.stringify(await t.stacks())} ${(await t.data()).homeStackLast}`);
  });

  it('item 5: Classic shows the yard\'s ground over its pack panel, as Modern does', { timeout: 40_000 }, async () => {
    const page = t.page();
    for (const flag of ['', '&ui=classic']) {
      await page.goto(`${h.base}${PLAY}&homex=-500${flag}`);
      await page.waitForFunction((s) => document.querySelector(s)?.dataset.homeScene === 'interior', CANVAS, { timeout: 30000 });
      await page.waitForTimeout(2500);
      const d = await t.data();
      const feet = await t.client(Number((await page.evaluate(() => window.groddleQA.cameraFrame())).playerX), 680);
      const panel = await page.evaluate(() => document.getElementById('pack-bar')?.getBoundingClientRect().top ?? innerHeight);
      if (flag) await t.shot('classic-yard-1352x802.png');
      assert.ok(feet.y < panel - 20, `${flag || 'modern'}: the feet (${feet.y}) over the pack row (${panel}); clearance ${d.groundClearance}`);
    }
  });
});

/** Touch through Chrome's own input (CDP): a finger down on `from`, held, moved to `to`, lifted. */
async function touchDrag(page, from, to, { holdMs = 450, steps = 10 } = {}) {
  const cdp = await page.context().newCDPSession(page);
  const send = (type, p) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: p ? [{ x: p.x, y: p.y, id: 1 }] : [] });
  await send('touchStart', from);
  await page.waitForTimeout(holdMs);
  for (let i = 1; i <= steps; i += 1) {
    await send('touchMove', { x: from.x + ((to.x - from.x) * i) / steps, y: from.y + ((to.y - from.y) * i) / steps });
    await page.waitForTimeout(30);
  }
  await page.waitForTimeout(200);
  await send('touchEnd');
  await cdp.detach();
}

describe('the back yard on a phone (402x812, touch)', { skip: !chromium && 'no playwright' }, () => {
  const UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36';
  const h = harness({ viewport: { width: 402, height: 812 }, deviceScaleFactor: 3, userAgent: UA, isMobile: true, hasTouch: true });
  const t = helpers(h);
  before(async () => {
    await h.open('yard drag place phone test');
  }, { timeout: LOCK_WAIT_MS + 60_000 });
  after(() => h.close());

  it('3. a Cultivate tile dragged by a finger onto the yard is bought at the finger; a pack stack lands at the finger', { timeout: 55_000 }, async () => {
    const page = t.page();
    await page.goto(`${h.base}${PLAY}&homeyarddemo=cultivate`, { waitUntil: 'load' });
    await page.waitForFunction((s) => document.querySelector(s)?.dataset.homeMode === 'cultivate' && window.groddleQA?.placeAvatar, CANVAS, { timeout: 45000 });
    await page.waitForTimeout(1500);
    await t.gotIt();
    for (let i = 0; i < 2; i += 1) {
      await page.locator('[data-home-expand="yard"]').scrollIntoViewIfNeeded().catch(() => {});
      await page.click('[data-home-expand="yard"]');
      await page.waitForTimeout(400);
      await page.evaluate(() => { for (const b of document.querySelectorAll('button')) if (/^Expand/.test(b.textContent.trim()) && b.closest('[role="dialog"], .quest-dialogue, .confirm') && b.offsetParent) b.click(); });
      await page.waitForTimeout(900);
    }
    const d = await t.data();
    const x0 = Number(d.homeHouseX);
    await t.standAt(x0 - 950);
    const before = d.homeBackCultivations;
    const tile = page.locator('[data-cultivate="proto_patch"]').first();
    await tile.scrollIntoViewIfNeeded();
    const tb = await tile.boundingBox();
    const to = await t.client(x0 - 1100, 600);
    await touchDrag(page, { x: tb.x + tb.width / 2, y: tb.y + tb.height / 2 }, to);
    await page.waitForTimeout(800);
    await t.shot('cultivate-touch-402x812.png');
    const done = await t.data();
    const added = done.homeBackCultivations.split(',').find((row) => !before.split(',').includes(row));
    assert.ok(added && Math.abs(Number(added.split('@')[1]) + 1100) <= NEAR, `a Patch at the finger: ${added} (${done.homeDropLast})`);
    // Leave Cultivate; a pack stack let go over the yard (the touch lift's path) lands at the finger.
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
    await page.evaluate(() => window.groddlePack.grant?.('cherry', 2));
    const wx = x0 - 1000;
    const at = await t.client(wx, 600);
    const got = await t.registryDrag('cherry', 2, at);
    await page.waitForTimeout(400);
    const after = await t.data();
    await t.shot('pack-touch-402x812.png');
    assert.equal(after.homeDropLast, 'place:cherry:yard', JSON.stringify(got));
    assert.ok(Math.abs(Number(after.homeDropAt.split(',')[0]) - wx) <= NEAR, after.homeDropAt);
  });
});

describe('review 2026-11-27 item 3: an iPhone (WebKit, 402x812): a Cultivate tile dragged by a finger', { skip: !chromium && 'no playwright' }, () => {
  const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
  const h = harness({ viewport: { width: 402, height: 812 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: UA }, { engine: 'webkit' });
  const t = helpers(h);
  before(async () => {
    await h.open('yard drag webkit test');
  }, { timeout: LOCK_WAIT_MS + 60_000 });
  after(() => h.close());

  it('keeps its tile through the tray\'s redraw, so the finger\'s moves still carry it and it is bought where it lets go', { timeout: 60_000 }, async () => {
    const page = t.page();
    await page.goto(`${h.base}${PLAY}&homeyarddemo=cultivate`, { waitUntil: 'load' });
    await page.waitForFunction((s) => document.querySelector(s)?.dataset.homeMode === 'cultivate' && window.groddleQA?.placeAvatar, CANVAS, { timeout: 45000 });
    await page.waitForTimeout(1500);
    await t.gotIt();
    for (let i = 0; i < 2; i += 1) {
      await page.evaluate(() => document.querySelector('[data-home-expand="yard"]')?.click());
      await page.waitForTimeout(1000);
    }
    const d = await t.data();
    const x0 = Number(d.homeHouseX);
    await t.standAt(x0 - 950);
    const before = d.homeBackCultivations;
    const tb = await page.locator('[data-cultivate="proto_patch"]').first().boundingBox();
    const to = await t.client(x0 - 1100, 600);
    const res = await safariTouchDrag(page, { x: tb.x + tb.width / 2, y: tb.y + tb.height / 2 }, to);
    await page.waitForTimeout(800);
    await t.shot('cultivate-webkit-402x812.png');
    const done = await t.data();
    assert.ok(res.ok && res.connected, `the tile the finger went down on is still in the page: ${JSON.stringify(res)}`);
    const added = done.homeBackCultivations.split(',').find((row) => !before.split(',').includes(row));
    assert.ok(added && Math.abs(Number(added.split('@')[1]) + 1100) <= NEAR, `a Patch at the finger: ${added} (${done.homeDropLast})`);
  });
});
