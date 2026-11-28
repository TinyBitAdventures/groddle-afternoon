/**
 * Report #730 (G1333, G1303 follow-up): "machines could now be placed closer together. I do not find that to be the case."
 * Solo, 1372x802, the third floor of the house (place house:2), machines 220 px apart as in the report's picture.
 *
 * Glitch measured the 200 px between machines from where the player stood (machine_stand.js canDrop 770-794,
 * player.js 1152-1186), and so do we (js/home-machines.js placeCheck `from`). Decoration Mode hides the avatar
 * (homes-feature.js setAvatarHidden), and the refusal said only "This Metal Machine cannot be placed here."
 * (Glitch's own words), so a player standing among the machines could not tell why a drag next to one was refused.
 * Austin 2026-11-26 (ours): say why ("Stand further from the other machines to set this one down."), and while
 * a machine is dragged show a faint ring where your Glitch stands (home-stack-marks.js drawStandMark). Sibling:
 * a machine dragged from the pack onto the floor outside Decoration Mode went down as a loose "Metal Machine"
 * stack (packDrop returned null without the pointer); now it is set down at your feet as Place does, as
 * Glitch's drop ran the machine's canDrop at pc.x (takeable.js 164).
 *
 * The browser blocks hold the browser lock (GRODDLE_BROWSER_LOCK) under 60 s each.
 * Run: node --test tests/report730-machines.test.js
 * GRODDLE_730_SHOT=<dir> also saves the marker's picture (marker-1372x802.png, -classic, -phone).
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { HOME_MACHINE_TEXT } from '../public/js/home-machines.js?v=76e05954';
import { STAND_MARK_SIZE, drawStandMark, standMarkStyle } from '../public/js/home-stack-marks.js?v=67b44287';
import { Display, fakePixi } from './fake-scene.js';

const root = join(import.meta.dirname, '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');
const NEAR = 'Stand further from the other machines to set this one down.';
const SHOT = process.env.GRODDLE_730_SHOT || '';

describe('#730: the words and the ring (source)', () => {
  it('too near says so in one plain sentence; the ends keep Glitch\'s words', () => {
    assert.equal(HOME_MACHINE_TEXT.placeNear, NEAR);
    assert.doesNotMatch(NEAR, /—/);
    assert.equal(HOME_MACHINE_TEXT.placeHere('Metal Machine'), 'This Metal Machine cannot be placed here.');
  });

  it('the ring takes its colours from the tokens, Modern\'s and Classic\'s', () => {
    const asked = [];
    const st = standMarkStyle((name, fallback) => { asked.push(name); return fallback; });
    assert.deepEqual(asked, ['--decor-stand-mark', '--decor-stand-mark-rim']);
    assert.ok(st.fillAlpha < 0.5 && st.rimAlpha < 0.5, 'faint');
    const css = read('public/style.css');
    assert.match(css, /--decor-stand-mark: var\(--text-tip\);/);
    assert.match(css, /--decor-stand-mark-rim: var\(--surface-tip\);/);
    const classic = read('public/css/classic.css');
    assert.match(classic, /:root\[data-ui="classic"\] \{\n {2}--decor-stand-mark: var\(--c-classic-tip\);\n {2}--decor-stand-mark-rim: var\(--c-classic-ink\);/);
    const mark = drawStandMark(fakePixi, (_, f) => f);
    assert.equal(mark.label, 'home-stand-mark');
    assert.equal(mark.eventMode, 'none');
    assert.ok(mark.children[0] instanceof Display);
    assert.deepEqual(STAND_MARK_SIZE, { w: 64, h: 16, tall: 112, wide: 40 }, 'a ring at the feet and an outline about your height');
  });

  it('Decoration Mode draws it when a machine drag starts and as it moves, and takes it away when the drag ends', () => {
    const homes = read('public/js/features/homes-feature.js');
    assert.match(homes, /engine\.setData\('homeDrag', `pack:\$\{st\.cls\}:`\);\n {4}if \(machine\) drawStandMarker\(engine, true\);/);
    assert.match(homes, /drawPackMarker\(engine, packDropTarget\(engine, e\)\);\n {6}drawStandMarker\(engine, true\);/);
    assert.match(homes, /function endPackDrag\(engine\) \{[^}]*drawStandMarker\(engine, false\);/);
    assert.match(homes, /scene\.standMarker\.x = p\.x;\n {2}scene\.standMarker\.y = p\.y;/, 'at the feet');
  });
});

let chromium = null;
try { chromium = (await import('playwright')).chromium; } catch { /* no Playwright */ }

const LOCK_WAIT_MS = 30 * 60_000;
const CANVAS = 'canvas[aria-label="Groddle game world"]';
const PLAY = '/play/?autostart=1&questoffer=off&homedemo=interior&hstip=0';

/** One Chrome under the lock, a server on this worktree's public folder, and a page in a context. */
function harness(viewport) {
  const h = { chrome: null, server: null, ctx: null, page: null, base: '' };
  h.open = async (label) => {
    const { openBrowser } = await import('../tools/qa/browser.mjs');
    const { startServer } = await import('../tools/qa/serve.mjs');
    h.server = await startServer({ root: join(root, 'public') });
    h.base = `http://127.0.0.1:${h.server.address().port}`;
    h.chrome = await openBrowser({ label, waitMs: LOCK_WAIT_MS });
    h.ctx = await h.chrome.browser.newContext({ viewport });
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

/** The page helpers the cases share. */
function helpers(h) {
  const page = () => h.page;
  const ready = () => page().waitForFunction(() => window.groddleHomeMachines?.home && window.groddleHomeFloor, null, { timeout: 30000 });
  const machines = () => page().evaluate(() => window.groddleHomeMachines.state().machines.map((m) => [m.classTsid, m.rx]));
  const data = () => page().evaluate((sel) => ({ ...document.querySelector(sel).dataset }), CANVAS);
  const toasts = () => page().evaluate(() => [...document.querySelectorAll('body *')].filter((e) => e.children.length === 0 && /placed here|dropped|set down|put your|Stand further/i.test(e.textContent)).map((e) => e.textContent.trim()));
  const clearToasts = () => page().evaluate(() => { for (const e of document.querySelectorAll('body *')) if (e.children.length === 0 && /placed here|dropped|set down|put your|Stand further/i.test(e.textContent)) e.textContent = ''; });
  async function floor(n, x) {
    await page().evaluate(([f, rx]) => window.groddleHomeFloor(f, rx), [n, x]);
    await page().waitForFunction((f) => window.groddleHomeMachines?.state().where?.place === (f ? `house:${f}` : 'house'), n, { timeout: 8000 });
    await page().waitForTimeout(300);
  }
  /** Room x to the canvas point under it (the camera's left world x and scale, as the canvas data gives them). */
  async function screenX(rx) {
    const d = await data();
    const box = await page().evaluate((sel) => { const r = document.querySelector(sel).getBoundingClientRect(); return { h: r.height }; }, CANVAS);
    const x0 = await page().evaluate(() => window.groddleHomeMachines.home.x0);
    return Math.round((rx + x0 - Number(d.cameraX)) * (box.h / Number(d.cameraWorldHeight)));
  }
  const slot = (cls) => page().locator(`.pack-slot[data-tsid="${cls}"]`).first();
  async function dragFromPack(cls, rx, y = 580, { during = null } = {}) {
    const s = slot(cls);
    await s.scrollIntoViewIfNeeded().catch(() => {});
    if (!during) {
      await s.dragTo(page().locator(CANVAS), { targetPosition: { x: await screenX(rx), y } });
    } else {
      const from = await s.boundingBox();
      const canvas = await page().locator(CANVAS).boundingBox();
      const to = { x: canvas.x + (await screenX(rx)), y: canvas.y + y };
      await page().mouse.move(from.x + from.width / 2, from.y + from.height / 2);
      await page().mouse.down();
      await page().mouse.move(to.x - 40, to.y, { steps: 4 });
      await page().mouse.move(to.x, to.y, { steps: 4 });
      await page().waitForTimeout(250);
      await during();
      await page().mouse.up();
    }
    await page().waitForTimeout(700);
  }
  async function decorate(on) {
    const mode = (await data()).homeMode;
    if (on && mode !== 'decorate') {
      await page().click('#homes-decorate-btn');
      await page().waitForTimeout(400);
      const tab = page().locator('[data-tab="pack"], [role="tab"]:has-text("Pack")').first();
      if (await tab.count()) await tab.click();
      await page().waitForTimeout(250);
    }
    if (!on && mode === 'decorate') {
      await page().keyboard.press('Escape');
      await page().waitForTimeout(400);
    }
  }
  /** The metalmaker back in the pack (Pick Up), then standing at x on floor n. */
  async function metalmakerToPack(n, standX) {
    const list = await machines();
    const i = list.findIndex(([c]) => c === 'metalmaker');
    if (i >= 0) {
      await page().evaluate((k) => window.groddleHomeMachines.standNear(k), i);
      assert.equal(await page().evaluate((k) => window.groddleHomeMachines.act(k, 'machine_pickup'), i), true);
      await page().waitForFunction(() => window.groddleHomeMachines.pack('metalmaker').n > 0, null, { timeout: 8000 });
    }
    await floor(n, standX);
  }
  /** A three-floor house, four machines on the third floor 220 px apart (room x 200, 420, 640, 860), each Placed at your feet. */
  async function build() {
    await page().goto(`${h.base}${PLAY}&fresh=1&resetgame=1&homefloordemo=built3up&homemachinedemo=metalmaker`);
    await ready();
    await page().evaluate(() => { for (const b of document.querySelectorAll('button')) if (b.textContent.trim() === 'Got it' && b.offsetParent) b.click(); });
    await floor(2, 900);
    await page().waitForFunction(() => window.groddleHomeMachines.pack('metalmaker').n > 0 && window.groddlePack?.grant, null, { timeout: 8000 });
    for (const [cls, rx] of [['woodworker', 200], ['fuelmaker', 420], ['blockmaker', 640], ['metalmaker', 860]]) {
      if (cls !== 'metalmaker') await page().evaluate((c) => window.groddlePack.grant(c, 1), cls);
      assert.equal(await page().evaluate(([c, x]) => window.groddleHomeMachines.placeAt(c, x), [cls, rx]), true, `${cls} at ${rx}`);
    }
    assert.deepEqual(await machines(), [['woodworker', 200], ['fuelmaker', 420], ['blockmaker', 640], ['metalmaker', 860]]);
  }
  async function shot(name) {
    if (!SHOT) return;
    mkdirSync(SHOT, { recursive: true });
    await page().screenshot({ path: join(SHOT, name) });
  }
  return { ready, machines, data, toasts, clearToasts, floor, screenX, dragFromPack, decorate, metalmakerToPack, build, shot };
}

describe('#730 in Chrome (1372x802): the third floor, machines 220 px apart', { skip: !chromium && 'no playwright' }, () => {
  const h = harness({ width: 1372, height: 802 });
  const t = helpers(h);
  before(async () => {
    await h.open('report730 machines test');
    await t.build();
  }, { timeout: LOCK_WAIT_MS + 60_000 });
  after(() => h.close());

  it('1. standing 200 px from every machine, a Decoration Mode drag lands next to one (the G1303 fix)', { timeout: 30_000 }, async () => {
    await t.metalmakerToPack(2, 880); // 240 px from the blockmaker at 640
    await t.decorate(true);
    await t.dragFromPack('metalmaker', 760);
    const got = await t.machines();
    const mm = got.find(([c]) => c === 'metalmaker');
    assert.ok(mm, `set down: ${JSON.stringify(got)} ${JSON.stringify(await t.toasts())}`);
    assert.ok(mm[1] - 640 < 200, `${mm[1] - 640} px from the blockmaker`);
    await t.decorate(false);
  });

  it('2. the report: standing among the machines, the refusal says to stand further from them, and a ring shows where you stand', { timeout: 30_000 }, async () => {
    await t.metalmakerToPack(2, 300); // 100 px from the woodworker at 200, 120 from the fuelmaker at 420
    await t.decorate(true);
    await t.clearToasts();
    assert.equal((await t.data()).homeStandMark || '', '', 'no ring before the drag');
    let during = null;
    // 120 px from the blockmaker, 340 from the nearest other: clear of every machine, refused for where you stand.
    await t.dragFromPack('metalmaker', 760, 580, {
      during: async () => {
        during = await t.data();
        await t.shot('marker-1372x802.png');
      },
    });
    assert.equal(during?.homeStandMark, '300', 'the ring at your feet while the machine is dragged');
    assert.equal((await t.data()).homeStandMark || '', '', 'gone when the drag ends');
    assert.equal((await t.machines()).some(([c]) => c === 'metalmaker'), false, 'refused (Glitch: canDrop measured from the player)');
    const said = (await t.toasts()).join(' | ');
    assert.match(said, /Stand further from the other machines to set this one down\./, `the refusal said: ${said}`);
    assert.doesNotMatch(said, /cannot be placed here/);
    await t.decorate(false);
  });

  it('3. sibling: a machine dragged from the pack outside Decoration Mode is set down at your feet or refused, never a loose stack', { timeout: 30_000 }, async () => {
    await t.decorate(false);
    const loose = async () => Number((await t.data()).droppedStacks || 0);
    const before0 = await loose();
    // Standing among them (300): refused with the same words, the machine kept.
    await t.clearToasts();
    await t.dragFromPack('metalmaker', 760, 560);
    assert.equal(await loose(), before0, 'a loose Metal Machine stack on the floor');
    assert.equal((await t.machines()).some(([c]) => c === 'metalmaker'), false);
    assert.equal(await h.page.evaluate(() => window.groddleHomeMachines.pack('metalmaker').n), 1, 'kept');
    assert.match((await t.toasts()).join(' | '), /Stand further from the other machines/);
    // Standing clear of every machine (the second floor has none): set down at your feet, not where it was let go.
    await h.page.keyboard.press('Escape'); // the stack's menu the drag opened (game.js dropDraggedAtFeet)
    await t.floor(1, 500);
    const looseHere = await loose();
    await t.dragFromPack('metalmaker', 300, 560);
    assert.equal(await loose(), looseHere, 'still no loose stack');
    assert.deepEqual((await t.machines()).find(([c]) => c === 'metalmaker'), ['metalmaker', 500], `at your feet: ${JSON.stringify(await t.toasts())}`);
  });
});

/**
 * The drag through the game's own drop registry (js/drop-targets.js, the instance the page loaded): the same
 * start / over / drop the pack slot's mouse drag and the phone's touch lift call, so it needs no visible slot
 * (Classic's tray shows the first few; a phone's pack is a drawer).
 */
async function registryDrag(page, { cls, rx = null, input, during }) {
  const at = await page.evaluate(async ([c, x, how]) => {
    const url = performance.getEntriesByType('resource').map((e) => e.name).find((n) => n.includes('/js/drop-targets.js'));
    const reg = await import(url);
    const canvas = document.querySelector('canvas[aria-label="Groddle game world"]');
    const r = canvas.getBoundingClientRect();
    const d = canvas.dataset;
    const k = r.height / Number(d.cameraWorldHeight);
    // A room x in view, or (null) three quarters across the canvas.
    const px = x == null ? r.left + r.width * 0.75 : r.left + (x + window.groddleHomeMachines.home.x0 - Number(d.cameraX)) * k;
    // Low in the room, above whatever covers the canvas's foot (a phone's Decoration Mode tray).
    const point = { x: px, y: r.top + r.height * 0.7 };
    while (point.y > r.top && document.elementFromPoint(point.x, point.y) !== canvas) point.y -= 10;
    point.el = document.elementFromPoint(point.x, point.y);
    reg.beginDrag({ from: 'pack', cls: c, count: 1, copy: 0, tool: true }, { input: how });
    reg.dragOver(point);
    window.__r730 = { reg, point };
    return { x: point.x, y: point.y, el: point.el?.tagName };
  }, [cls, rx, input]);
  await page.waitForTimeout(250);
  await during?.(at);
  const out = await page.evaluate(() => { const { reg, point } = window.__r730; delete window.__r730; return reg.dragDrop(point); });
  await page.waitForTimeout(600);
  return { at, out };
}

describe('#730 in Chrome: the ring on the ground floor, in Classic and at phone width', { skip: !chromium && 'no playwright' }, () => {
  const h = harness({ width: 1372, height: 802 });
  const t = helpers(h);
  before(async () => {
    await h.open('report730 ring test');
    await h.page.goto(`${h.base}${PLAY}&fresh=1&resetgame=1&homefloordemo=built3up&homemachinedemo=metalmaker&ui=classic`);
    await t.ready();
    await h.page.waitForFunction(() => window.groddleHomeMachines.pack('metalmaker').n > 0, null, { timeout: 8000 });
  }, { timeout: LOCK_WAIT_MS + 60_000 });
  after(() => h.close());

  const ringWhileDragging = async (n, standX, input, name) => {
    await t.floor(n, standX);
    await h.page.evaluate(() => { for (const c of document.querySelectorAll('.notify-card')) c.click(); });
    await t.decorate(true);
    assert.equal((await t.data()).homeMode, 'decorate');
    let during = null;
    const dragged = await registryDrag(h.page, { cls: 'metalmaker', input, during: async () => { during = await t.data(); await t.shot(name); } });
    assert.equal(during?.homeStandMark, String(standX), `the ring at ${standX} on floor ${n}`);
    assert.equal((await t.data()).homeStandMark || '', '', 'gone after');
    assert.ok((await t.machines()).some(([c]) => c === 'metalmaker'), `set down: ${JSON.stringify([dragged, await t.toasts(), (await t.data()).homeDropLast])}`);
    await t.decorate(false);
    // Back to the pack for the next one.
    const i = (await t.machines()).findIndex(([c]) => c === 'metalmaker');
    await h.page.evaluate((k) => window.groddleHomeMachines.standNear(k), i);
    assert.equal(await h.page.evaluate((k) => window.groddleHomeMachines.act(k, 'machine_pickup'), i), true);
    await h.page.waitForFunction(() => window.groddleHomeMachines.pack('metalmaker').n > 0, null, { timeout: 8000 });
  };

  it('Classic, the ground floor', { timeout: 30_000 }, async () => {
    assert.equal(await h.page.evaluate(() => document.documentElement.dataset.ui), 'classic');
    const css = (name) => h.page.evaluate((v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim(), name);
    assert.equal(await css('--decor-stand-mark'), await css('--c-classic-tip'), 'Classic\'s own tip colour');
    await ringWhileDragging(0, 500, 'mouse', 'marker-classic-1372x802.png');
  });

  it('Modern at phone width (390x844), the second floor, a touch lift', { timeout: 30_000 }, async () => {
    await h.page.evaluate(() => { try { localStorage.setItem('groddle.ui', 'modern'); } catch { /* */ } });
    await h.page.goto(`${h.base}${PLAY}&ui=modern`);
    await h.page.setViewportSize({ width: 390, height: 844 });
    await t.ready();
    await h.page.waitForTimeout(500);
    const css = (name) => h.page.evaluate((v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim(), name);
    assert.equal(await css('--decor-stand-mark'), await css('--text-tip'), 'Modern\'s tooltip text colour');
    await ringWhileDragging(1, 500, 'touch', 'marker-phone-390x844.png');
  });
});
