/**
 * Report #669 (Austin 2026-11-27): the floor crack rug "Shortcut to Urth" (furniture_rug style 310)
 * and the "Manhole" (style 353) are holes in an upper floor of the house: walk onto one and you
 * fall through to the floor below, landing at about the same x.
 *
 * Glitch: no source makes them holes. Both are plain rug styles with "plats: {}" in
 * items/catalog_furniture.js, and items/furniture_rug.js, locations/inc_homes.js and the client
 * have no hole, fall or shortcut code. Ours, data-driven by js/home-floor-holes.js FALL_THROUGH.
 * The browser part is the reproduction: on main, walking onto the crack on the second floor leaves
 * you on the second floor.
 * Run: node --test tests/report669-floor-holes.test.js
 */
import { after as afterAll, before as beforeAll, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import {
  FALL_ARRIVE_ABOVE,
  FALL_MAX_MS,
  FALL_SINK_PX,
  FALL_THROUGH,
  cutFloorLines,
  fallCheck,
  fallCut,
  fallDone,
  fallThroughRow,
  floorHoles,
  holeUnder,
  landingX,
} from '../public/js/home-floor-holes.js?v=4b244ef4';
import { FURNITURE_UPGRADES } from '../public/js/furniture-upgrades-data.js?v=0b2cf3cc';
import { furnitureSize, INTERIOR } from '../public/js/home-decor.js?v=325d9a13';
import { NORMAL_BUFF, avatarGround, stepAvatar } from '../public/js/avatar-step.js?v=8415ee96';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const GSJS = join(homedir(), 'Documents/glitch-audit/glitch-GameServerJS');
const gsjs = (f) => (existsSync(join(GSJS, f)) ? readFileSync(join(GSJS, f), 'utf8') : null);

const FLOOR = INTERIOR.floorY;
const rug = (upgradeId, x, extra = {}) => ({ id: upgradeId, classTsid: 'furniture_rug', upgradeId, x, y: FLOOR, facingRight: true, ...extra });

describe('#669 the fall-through pieces (one list)', () => {
  it('are the crack and the Manhole rugs, as the furniture upgrades name them', () => {
    assert.deepEqual(FALL_THROUGH.map((r) => `${r.classTsid}:${r.upgradeId}`), ['furniture_rug:310', 'furniture_rug:353']);
    for (const r of FALL_THROUGH) {
      assert.equal(FURNITURE_UPGRADES[r.classTsid]?.upgrades?.[String(r.upgradeId)]?.name, r.name);
      assert.ok(r.gap[0] >= 0 && r.gap[1] <= 1 && r.gap[0] < r.gap[1], `${r.name} gap`);
    }
  });

  it('Glitch gave them no platform, wall or config: nothing in the source makes them holes', { skip: !gsjs('items/catalog_furniture.js') && 'no GSJS' }, () => {
    const cat = gsjs('items/catalog_furniture.js');
    for (const [id, name, swf] of [['310', 'Shortcut to Urth', 'furniture_rug_floor_crack'], ['353', 'Manhole', 'furniture_rug_man_silhouette_hole']]) {
      const block = cat.slice(cat.indexOf(`"${id}" : {\n\t\t\tname   : "${name}"`)).split('\n\t\t},')[0];
      assert.match(block, new RegExp(swf));
      assert.match(block, /plats: \{\},/);
      assert.match(block, /walls: \{\},/);
    }
    assert.doesNotMatch(gsjs('items/furniture_rug.js'), /hole|shortcut|fall/i);
  });

  it('other rugs and other classes are not holes', () => {
    assert.equal(fallThroughRow(rug(117, 800)), null);
    assert.equal(fallThroughRow(rug(412, 800)), null);
    assert.equal(fallThroughRow({ classTsid: 'furniture_rug', x: 800 }), null);
    assert.equal(fallThroughRow({ classTsid: 'furniture_door', upgradeId: 310, x: 800 }), null);
    assert.equal(fallThroughRow({ ...rug(310, 800), upgradeId: '310' })?.name, 'Shortcut to Urth');
    assert.deepEqual(floorHoles([rug(117, 300), rug(679, 500)], furnitureSize), []);
  });
});

describe('#669 where the hole is', () => {
  it('the open part of the art, about the rug\'s middle, mirrored when it faces left', () => {
    const [crack, manhole] = floorHoles([rug(310, 800), rug(353, 300)], furnitureSize);
    const cw = furnitureSize('furniture_rug', 310).w;
    assert.equal(crack.x1, Math.round(800 - cw / 2 + 0.25 * cw));
    assert.equal(crack.x2, Math.round(800 - cw / 2 + 0.64 * cw));
    assert.ok(manhole.x1 < 300 && manhole.x2 > 300);
    const [flipped] = floorHoles([rug(310, 800, { facingRight: false })], furnitureSize);
    assert.equal(flipped.x1, Math.round(800 + cw / 2 - 0.64 * cw));
    assert.equal(flipped.x2, Math.round(800 + cw / 2 - 0.25 * cw));
    assert.equal(holeUnder([crack], 790)?.id, 310);
    assert.equal(holeUnder([crack], 600), null);
  });
});

describe('#669 when you fall', () => {
  const holes = floorHoles([rug(310, 800)], furnitureSize);
  const walk = { floor: 1, onGround: true, prevX: 785, x: 789.4, vx: 4.4, holes };

  it('walking onto it on an upper floor drops you', () => {
    assert.equal(fallCheck(walk)?.id, 310);
    assert.equal(fallCheck({ ...walk, floor: 2 })?.id, 310);
    assert.equal(fallCheck({ ...walk, x: 760, prevX: 764, vx: -4 })?.id, 310, 'from either side');
  });

  it('never on the ground floor, a Tower floor or outside', () => {
    assert.equal(fallCheck({ ...walk, floor: 0 }), null);
    assert.equal(fallCheck({ ...walk, floor: null }), null);
  });

  it('not in Decoration or Cultivation Mode, nor while a verb runs, nor in the air', () => {
    assert.equal(fallCheck({ ...walk, editing: true }), null);
    assert.equal(fallCheck({ ...walk, busy: true }), null);
    assert.equal(fallCheck({ ...walk, onGround: false }), null);
  });

  it('standing still on one set down under you, or put there by a Door or a teleport, you drop only once you walk', () => {
    assert.equal(fallCheck({ ...walk, prevX: 789.4, vx: 0 }), null, 'standing still');
    assert.equal(fallCheck({ ...walk, prevX: 789.4 }), null, 'pressing against nothing');
    assert.equal(fallCheck({ ...walk, prevX: 400, vx: 0 }), null, 'placed there');
    assert.equal(fallCheck({ ...walk, prevX: null }), null, 'first frame in the room');
    assert.equal(fallCheck({ ...walk, x: 600, prevX: 596 }), null, 'off the hole');
  });

  it('the cut walk line lets the avatar fall with the normal gravity, and the floor changes once it is under the floor', () => {
    const W = 1650;
    const lines = [{ id: 'home-floor', x1: 0, y1: FLOOR, x2: W, y2: FLOOR, pc_perm: -1 }];
    const street = { bounds: { l: 0, r: W, t: 0, b: FLOOR + 60 } };
    const body = { x: 789.4, y: FLOOR, vx: 4.4, vy: 0, onGround: true };
    const hole = fallCheck(walk);
    const cut = fallCut(hole, body.x);
    const open = cutFloorLines(lines, cut.x1, cut.x2);
    assert.equal(open.length, 2);
    assert.ok(open.every((p) => p.x2 <= cut.x1 || p.x1 >= cut.x2));
    assert.equal(lines.length, 1, 'the old lines are kept as they were');
    const ground = (px, py, vy) => avatarGround(open, px, py, vy, { street, fallback: FLOOR });
    let ms = 0;
    for (let f = 0; f < 120 && !fallDone({ feetY: body.y, floorY: FLOOR, elapsedMs: ms }); f += 1) {
      // Still holding the walk key the whole way (the most it can drift).
      body.vx = 4.4;
      stepAvatar(body, { dt: 1, buff: NORMAL_BUFF, platforms: open, worldW: W, worldH: street.bounds.b, ground });
      ms += 1000 / 60;
    }
    assert.ok(body.y >= FLOOR + FALL_SINK_PX, `feet ${body.y.toFixed(1)} under the floor by the sink`);
    assert.ok(ms < FALL_MAX_MS, `by gravity, in ${Math.round(ms)} ms`);
    assert.ok(body.vy > 0 && body.onGround === false);
    // Without the cut the same walk stays on the floor.
    const solid = { x: 789.4, y: FLOOR, vx: 4.4, vy: 0, onGround: true };
    for (let f = 0; f < 30; f += 1) stepAvatar(solid, { dt: 1, buff: NORMAL_BUFF, platforms: lines, worldW: W, worldH: street.bounds.b, ground: (px, py, vy) => avatarGround(lines, px, py, vy, { street, fallback: FLOOR }) });
    assert.equal(solid.y, FLOOR);
  });

  it('you land on the floor below at the same x, kept inside the walls, coming in through its ceiling', () => {
    assert.equal(landingX(791.6, { left: 88, right: 1562 }), 792);
    assert.equal(landingX(40, { left: 88, right: 1562 }), 88);
    assert.equal(landingX(1600, { left: 88, right: 1562 }), 1562);
    assert.equal(FALL_ARRIVE_ABOVE, INTERIOR.floorY - INTERIOR.ceilingY - 111);
  });

  it('the homes feature runs it every frame in the house and enters the floor below as a Door does', () => {
    const src = readFileSync(join(root, 'public/js/features/homes-feature.js'), 'utf8');
    assert.match(src, /keepInsideWalls\(engine\);\n\s+stepHoleFall\(engine, now\);/);
    assert.match(src, /goToHouseFloor\(engine, fall\.to, fall\.x\)/);
    assert.match(src, /editing: Boolean\(mode \|\| placing\)/);
  });
});

let chromium = null;
try { chromium = (await import('playwright')).chromium; } catch { /* no Playwright */ }

describe('#669 in Chrome at 1352x802: walking onto a hole on the second floor', { skip: !chromium && 'no playwright' }, () => {
  const LOCK_WAIT_MS = 30 * 60_000;
  let server = null;
  let chrome = null;
  beforeAll(async () => {
    const { openBrowser } = await import('../tools/qa/browser.mjs');
    const { startServer } = await import('../tools/qa/serve.mjs');
    chrome = await openBrowser({ label: 'report669 floor holes test', waitMs: LOCK_WAIT_MS });
    server = await startServer({ root: join(root, 'public') });
  }, { timeout: LOCK_WAIT_MS + 60_000 });
  afterAll(async () => {
    await chrome?.close();
    await server?.stop();
  });

  const data = (tab) => tab.evaluate(() => ({ ...document.querySelector('canvas').dataset }));
  const player = (tab) => tab.evaluate(() => window.groddleQA.snapshot().player);

  async function upstairsWith(style) {
    const base = `http://127.0.0.1:${server.address().port}`;
    const ctx = await chrome.browser.newContext({ viewport: { width: 1352, height: 802 } });
    const tab = await ctx.newPage();
    const errors = [];
    tab.on('pageerror', (e) => errors.push(e.message));
    await tab.goto(`${base}/play/?autostart=1&questoffer=off&fresh=1&resetgame=1&homedemo=interior&homefloordemo=built3up&homeholedemo=${style}@800`);
    await tab.waitForFunction(() => document.querySelector('canvas')?.dataset.homeFloor === '1' && document.querySelector('canvas')?.dataset.homeDecorPlaced, null, { timeout: 60_000 });
    await tab.waitForTimeout(800);
    return { ctx, tab, errors };
  }

  for (const style of ['310', '353']) {
    it(`style ${style}: you fall through to the ground floor and land at about the same x`, { timeout: 120_000 }, async () => {
      const { ctx, tab, errors } = await upstairsWith(style);
      try {
        const holes = (await data(tab)).homeHoles || '';
        const m = new RegExp(`^${style}:(\\d+)-(\\d+)$`).exec(holes);
        assert.ok(m, `the hole is listed on the second floor (${holes || 'none'})`);
        const [x1, x2] = [Number(m[1]), Number(m[2])];
        // Standing still in the middle of the hole: nothing happens until you walk.
        await tab.evaluate((x) => window.groddleQA.placeAvatar(x, 620), Math.round((x1 + x2) / 2));
        await tab.waitForTimeout(1000);
        assert.equal((await data(tab)).homeFloor, '1', 'standing on the hole does not drop you');
        // Walk onto it from the left.
        await tab.evaluate((x) => window.groddleQA.placeAvatar(x, 620), x1 - 90);
        await tab.waitForTimeout(600);
        assert.equal((await data(tab)).homeFloor, '1');
        await tab.keyboard.down('ArrowRight');
        try {
          await tab.waitForFunction(() => document.querySelector('canvas').dataset.homeFloor === '0', null, { timeout: 6000, polling: 'raf' });
        } catch {
          assert.fail(`walking onto the hole left you on floor ${(await data(tab)).homeFloor} at x ${Math.round((await player(tab)).x)}`);
        } finally {
          await tab.keyboard.up('ArrowRight');
        }
        const fell = /^fell:1->0@(\d+)$/.exec((await data(tab)).homeFallLast || '');
        assert.ok(fell, (await data(tab)).homeFallLast);
        const at = Number(fell[1]);
        assert.ok(at >= x1 - 10 && at <= x2 + 100, `landed at room x ${at}, the hole ${x1}-${x2}`);
        // In through the ceiling, then down onto the floor.
        await tab.waitForFunction(() => window.groddleQA.snapshot().player.onGround, null, { timeout: 4000 });
        const p = await player(tab);
        const houseX = Number((await data(tab)).homeHouseX);
        assert.equal(Math.round(p.y), 620);
        assert.ok(Math.abs(p.x - houseX - at) <= 2, `ground floor x ${p.x} is room x ${at}`);
        assert.deepEqual(errors, []);
      } finally {
        await ctx.close();
      }
    });
  }
});
