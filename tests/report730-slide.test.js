/**
 * Report #730 (G1333, root R7): "Nothing I do will drag a machine once it is placed." A placed machine only
 * opened its menu on a press, in play and in Decoration Mode, and the 200 px between machines held for every
 * spot, so a player could not set two machines nearer than they first stood.
 *
 * Glitch let the owner slide a placed machine along the floor of their house or Tower:
 * - a machine is pickupable (keys_in_location "p": "pickup", fuelmaker.js 1647-1648; Item.as 417-418 sets
 *   pickupable from it), and a press on a pickupable stack in the location starts a drag in play
 *   (LocationInputHandler.as _locMouseDownHandler 431-435: furniture needs can_decorate, anything pickupable
 *   drags); HandOfDecorator takes that drag where you can decorate ("this makes it so we can drop precisely in
 *   your own home!", locDragStartHandler 551-557, startWithItemFromLocationWhileNOTinDecorateMode 1223),
 *   and in Decoration Mode its own press does the same (onMouseDown 2411-2427, onMouseMove 2430-2436 calls
 *   startWithItemFromLocation, which takes furniture, trophies and anything pickupable, 1259). So: in
 *   play and in Decoration Mode alike.
 * - can_decorate is the owner's house or Tower only (WorldModel.as 59; location.js 2699-2706 sets
 *   is_decoratable for the owner, interior and tower), so never the home street nor anyone else's home.
 * - the drop sends itemstackModify with the floor point (dropFromLocationOnTargetPlatform 1445, 1600-1607,
 *   only checkXIsInBounds); the server's doModifyItem (main.js 4852-4867) asks only that you are at home and
 *   puts it there: no canDrop, so no 200 px rule on a move (canDrop, machine_stand.js 770-794, runs when a
 *   stand comes out of the pack). The machine is the same object, its job and fuel with it.
 * Austin 2026-11-27: "slide them as Glitch: drag to move, no 200 px rule on a move."
 *
 * The browser block holds the browser lock (GRODDLE_BROWSER_LOCK) under 60 s.
 * Run: GRODDLE_SITE_DIR=<site> GRODDLE_SERVER_DIR=<server> node --test tests/report730-slide.test.js
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

import * as HM from '../public/js/home-machines.js?v=cab883cd';
import { homeMachinesFeature } from '../public/js/features/home-machines-feature.js?v=50e65394';
import { homesFeature } from '../public/js/features/homes-feature.js?v=aa371a62';
import { Display, FakeEl, fakePixi } from './fake-scene.js';
import { HAS_SERVER, HAS_SITE, SITE_DIR, serverPath } from '../tools/repos.mjs';
import { HAS_PHP, PHP } from './php.js';

const root = join(import.meta.dirname, '..');
const gsjs = join(root, '..', 'glitch-GameServerJS');
const client = join(root, '..', 'glitch-client', 'com', 'tinyspeck', 'engine');
const line = (file, n) => readFileSync(file, 'utf8').split('\n')[n - 1];
const read = (rel) => readFileSync(join(root, rel), 'utf8');
const skipSite = !HAS_SITE ? 'no groddle-afternoon-site checkout' : !HAS_PHP ? 'no php' : false;

describe('#730: Glitch slid a placed machine, in play and in Decoration Mode (the source)', () => {
  it('a machine is pickupable, and a pickupable stack drags from the location in play', () => {
    assert.match(line(join(gsjs, 'items/fuelmaker.js'), 1648), /"p"\s*: "pickup"/);
    assert.match(line(join(client, 'data/item/Item.as'), 417), /if \(vkt\.verb_tsid == 'pickup'\) \{/);
    const lih = join(client, 'view/renderer/LocationInputHandler.as');
    assert.match(line(lih, 431), /if \(item\.is_furniture \|\| item\.is_special_furniture\) \{/);
    assert.match(line(lih, 434), /good = item\.pickupable;/);
  });
  it('HandOfDecorator takes it in your own home, out of Decoration Mode and in it', () => {
    const hod = join(client, 'control/HandOfDecorator.as');
    assert.match(line(hod, 552), /startWithItemFromLocationWhileNOTinDecorateMode/);
    assert.match(line(hod, 553), /this makes it so we can drop precisely in your own home!/);
    assert.match(line(hod, 1259), /!itemstack\.item\.is_furniture && !itemstack\.item\.is_special_furniture && !itemstack\.item\.is_trophy && !itemstack\.item\.pickupable/);
    assert.match(line(hod, 2435), /startWithItemFromLocation\(selected_lis_view\.tsid\);/);
    assert.match(line(join(client, 'model/WorldModel.as'), 59), /can_decorate = \(pc && location && \(\(location\.is_decoratable\)/);
    assert.match(line(join(gsjs, 'locations/location.js'), 2705), /if \(home_type == 'interior'\) geo\.is_decoratable = true;/);
    assert.match(line(join(gsjs, 'locations/location.js'), 2706), /if \(home_type == 'tower'\) geo\.is_decoratable = true;/);
  });
  it('the move is itemstackModify: at home, no canDrop (no 200 px)', () => {
    assert.match(line(join(gsjs, 'main.js'), 4852), /function doModifyItem\(pc, msg\)\{/);
    assert.match(line(join(gsjs, 'main.js'), 4853), /houses_is_at_home\(\)\) return pc\.apiSendMsg\(make_fail_rsp\(msg, 0, "You are not at home"\)\);/);
    assert.match(line(join(gsjs, 'main.js'), 4867), /pc\.location\.apiPutItemIntoPosition\(item, msg\.x, msg\.y\);/);
    assert.match(line(join(client, 'control/HandOfDecorator.as'), 1600), /new NetOutgoingItemstackModifyVO\(/);
  });
});

describe('a slide starts wherever a world click would act (#730 review)', () => {
  it('a New Quest card up on the screen does not stop it; a verb menu or the map does', () => {
    const feat = readFileSync(join(root, 'public/js/features/home-machines-feature.js'), 'utf8');
    assert.match(feat, /if \(!editing && \(engine\.worldPressBlocked \? engine\.worldPressBlocked\(\) \|\| engine\.acting\?\.\(\) : engine\.busy\?\.\(\{ ignoreHome: true \}\)\)\) return;/);
    const game = readFileSync(join(root, 'public/game.js'), 'utf8');
    assert.match(game, /worldPressBlocked: \(\) => !state\.started \|\| Boolean\(menuTarget\) \|\| isMapOpen\(\) \|\| isScreenFxBlocking\(\),/);
    // The same gates worldPress itself checks first.
    assert.match(game, /function worldPress\(e\) \{\n\s+if \(!state\.started \|\| menuTarget \|\| isMapOpen\(\) \|\| isScreenFxBlocking\(\)\) return;/);
  });
});

describe('moveCheck: where a slide may end', () => {
  const span = HM.roomSpan('house:2', { wallSegments: 11 });
  it('no 200 px rule: right beside another machine', () => {
    assert.equal(typeof HM.moveCheck, 'function', 'a placed machine cannot be moved at all');
    assert.deepEqual(HM.moveCheck({ rx: 440, span, place: 'house:2' }), { ok: true, rx: 440 });
  });
  it('kept in the room (the inner walls), as Glitch kept it on the floor line', () => {
    assert.deepEqual(HM.moveCheck({ rx: span.hi + 500, span, place: 'house:2' }), { ok: true, rx: span.hi });
    assert.deepEqual(HM.moveCheck({ rx: -900, span, place: 'house:2' }), { ok: true, rx: span.lo });
    assert.equal(HM.moveCheck({ rx: NaN, span, place: 'house:2' }).ok, false);
  });
  it('the house and the Tower (can_decorate), never the home street or a machine room', () => {
    for (const p of ['house', 'house:1', 'house:2', 'tower:0', 'tower:8']) assert.equal(HM.slidePlace(p), true, p);
    for (const p of ['street', 'mr:meadow', '', null]) assert.equal(HM.slidePlace(p), false, String(p));
    assert.equal(HM.moveCheck({ rx: 100, span: null, place: 'street' }).ok, false);
  });
});

/** A fake house scene on floor `floor` for homes-feature's _state (what home-machines-feature reads to name its place). */
function fakeHouse(floor = 2) {
  return () => ({ scene: { room: 'interior', houseFloor: floor, tower: null, background: { houseX: 0 } }, decor: { wallSegments: 11 }, cult: null });
}

describe('solo: the owner slides a placed machine on the third floor', () => {
  const saved = {};
  let engine;
  let s;
  const realState = homesFeature._state;

  before(() => {
    for (const k of ['document', 'groddleHomeMachines', 'PIXI']) saved[k] = globalThis[k];
    globalThis.document = { baseURI: 'https://groddle.localhost/', createElement: (t) => new FakeEl(t), body: new FakeEl('body'), head: new FakeEl('head'), getElementById: () => null, querySelector: () => null };
    globalThis.PIXI = fakePixi;
    homesFeature._state = fakeHouse(2);
    engine = {
      mode: 'solo', started: true, PIXI: { Sprite: Display, Graphics: Display }, entityLayer: new Display(), streetTsid: 'RH_HOME_INT', platforms: [],
      inv: { woodworker: 1, fuelmaker: 1 }, player: { x: 0, y: 570 }, query: () => null, param: () => null, transientInstance: () => false,
      homeContext: () => ({ inHome: true, owned: true }), setData() {}, toast() {}, save() {}, refreshPack() {}, pushActivity() {}, register: (t) => t, unregister() {},
    };
    homeMachinesFeature._reset();
    homeMachinesFeature.onTick(16, Date.now(), engine);
    s = globalThis.groddleHomeMachines;
  });

  after(() => {
    homesFeature._state = realState;
    homeMachinesFeature._reset();
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete globalThis[k];
      else globalThis[k] = v;
    }
  });

  it('two machines 220 px apart, as in the report\'s picture', () => {
    assert.equal(s.state().where?.place, 'house:2');
    assert.equal(s.placeAt('woodworker', 300), true);
    assert.equal(s.placeAt('fuelmaker', 520), true);
    assert.deepEqual(s.state().machines.map((m) => m.rx), [300, 520]);
  });

  it('slid to 40 px from the other: it goes, its job and fuel with it', () => {
    assert.equal(typeof s.move, 'function', 'a placed machine cannot be moved');
    const row = s.slice.machines.find((m) => m.classTsid === 'fuelmaker');
    const t = Date.now();
    row.job = { user: 'you', key: 'fuel_cell', recipeId: '1', name: 'Fuel Cell', qty: 1, held: { peat: 4 }, need: 5, startedAt: t, readyAt: t + 60_000 };
    row.fuel = 120;
    assert.equal(s.move(row.id, 340), true);
    const m = s.state().machines.find((x) => x.classTsid === 'fuelmaker');
    assert.equal(m.rx, 340);
    assert.equal(m.place, 'house:2', 'on its floor');
    assert.equal(m.fuel, 120);
    assert.ok(m.job && m.job.left > 50, 'still running');
    assert.equal(homeMachinesFeature.save().machines.find((x) => x.classTsid === 'fuelmaker').rx, 340, 'kept in the save');
  });

  it('kept within the room', () => {
    const id = s.state().machines.find((x) => x.classTsid === 'woodworker').id;
    const span = HM.roomSpan('house:2', { wallSegments: 11 });
    assert.equal(s.move(id, 99999), true);
    assert.equal(s.state().machines.find((x) => x.id === id).rx, span.hi);
  });

  it('the Decoration Mode press and the play press both reach it (the wiring)', () => {
    const f = read('public/js/features/home-machines-feature.js');
    assert.ok(/window\.addEventListener\('pointerdown', onSlideDown, true\)/.test(f), 'a press before the room\'s and the world\'s');
    assert.ok(/if \(slide\.deco\) \{\n {6}ev\.stopPropagation\(\);/.test(f), 'in Decoration Mode the press is the machine\'s, not the room\'s');
    assert.ok(/slide\.dragging = true;\n[^\n]*\n {6}engine\.closeVerbMenu\?\.\(\);/.test(f), 'out of it the press opened the menu, and the drag takes over');
  });
});

describe('online: the move goes to the realtime server; others and a reload see it', () => {
  const saved = {};
  const sent = [];
  const handlers = {};
  const realState = homesFeature._state;
  let engine;
  let s;
  const flush = () => new Promise((r) => setImmediate(r));
  const machine = (rx) => ({ id: 'hm-00000000000000ab', class: 'blockmaker', place: 'house:2', rx, fuel: 150, music: true, job: { user: '9', name: 'Grade A Earth Block', qty: 2, at: Date.now(), ready: Date.now() + 90_000 }, waiting: [] });

  before(async () => {
    for (const k of ['document', 'fetch', 'GRODDLE_MP_BOOT', 'PIXI', 'groddleHomeMachines']) saved[k] = globalThis[k];
    globalThis.document = { baseURI: 'https://groddle.localhost/', createElement: () => ({ getContext: () => null, style: {} }), getElementById: () => null, querySelector: () => null, head: { append() {} }, body: { append() {} } };
    globalThis.GRODDLE_MP_BOOT = { nonce: 'abcdef0123' };
    globalThis.PIXI = fakePixi;
    globalThis.fetch = async () => ({ status: 200, ok: true, headers: { get: () => null }, json: async () => ({ now: Date.now(), machines: [machine(640)], mayTake: true }), text: async () => '' });
    homesFeature._state = fakeHouse(2);
    const cl = { state: 'online', me: { id: 7, name: 'Ada' }, on(k, fn) { handlers[k] = fn; return () => {}; }, send(kind, payload) { sent.push({ kind, ...payload }); return true; } };
    engine = {
      mode: 'multiplayer', started: true, PIXI: { Sprite: Display, Graphics: Display }, entityLayer: new Display(), streetTsid: 'RH_HOME_INT', player: { x: 0, y: 0 }, inv: {}, pc: { imaginationUpgrades: [] },
      query: (hook) => (hook === 'realtimeClient' ? cl : null), param: () => null, homeContext: () => ({ inHome: true, owned: true }), transientInstance: () => false,
      setData() {}, toast() {}, pushActivity() {}, refreshPack() {}, save() {}, register: (t) => t, unregister() {},
    };
    homeMachinesFeature._reset();
    homeMachinesFeature.onTick(16, 0, engine);
    s = globalThis.groddleHomeMachines;
    for (let i = 0; i < 20 && !s?.state().machines.length; i += 1) {
      await flush();
      homeMachinesFeature.onTick(16, i * 16, engine);
    }
  });

  after(() => {
    homesFeature._state = realState;
    homeMachinesFeature._reset();
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete globalThis[k];
      else globalThis[k] = v;
    }
  });

  it('the owner\'s slide sends a move with the machine and its new x', () => {
    assert.equal(s.state().where?.place, 'house:2');
    assert.equal(typeof s.move, 'function', 'a placed machine cannot be moved');
    assert.equal(s.move('hm-00000000000000ab', 460), true);
    const f = sent.at(-1);
    assert.deepEqual({ kind: f.kind, owner: f.owner, verb: f.verb, id: f.id, rx: f.rx }, { kind: 'home_machine', owner: 7, verb: 'move', id: 'hm-00000000000000ab', rx: 460 });
  });

  it('settled: it stands there, its job running and fuel kept; a refusal puts it back', () => {
    handlers['msg:home_machine_done']({ req: sent.at(-1).req, owner: 7, verb: 'move', status: 'settled', machine: machine(460), now: Date.now() });
    const m = s.state().machines[0];
    assert.deepEqual([m.rx, m.fuel, Boolean(m.job)], [460, 150, true]);
    s.move('hm-00000000000000ab', 300);
    handlers['msg:home_machine_done']({ req: sent.at(-1).req, owner: 7, verb: 'move', status: 'refused', why: 'own', text: 'Only the owner can move a machine.', now: Date.now() });
    assert.equal(s.state().machines[0].rx, 460);
    assert.equal(globalThis.groddleHomeMachines.home.x0 + 460, s.drawnX('hm-00000000000000ab'), 'drawn back where it stands');
  });

  it('another player\'s move reaches this game (home_machine_changed)', () => {
    handlers['msg:home_machine_changed']({ owner: 7, verb: 'move', by: { id: 7, name: 'Ada' }, machine: machine(820), now: Date.now() });
    assert.equal(s.state().machines[0].rx, 820);
  });
});

describe('online: a visitor or key-holder cannot slide it', () => {
  const saved = {};
  const sent = [];
  let s;
  const flush = () => new Promise((r) => setImmediate(r));

  before(async () => {
    for (const k of ['document', 'fetch', 'GRODDLE_MP_BOOT', 'PIXI', 'groddleHomeMachines']) saved[k] = globalThis[k];
    globalThis.document = { baseURI: 'https://groddle.localhost/', createElement: () => ({ getContext: () => null, style: {} }), getElementById: () => null, querySelector: () => null, head: { append() {} }, body: { append() {} } };
    globalThis.GRODDLE_MP_BOOT = { nonce: 'abcdef0123' };
    globalThis.PIXI = fakePixi;
    const m = { id: 'hm-00000000000000ab', class: 'blockmaker', place: 'house:2', rx: 640, fuel: 150, music: true, job: null, waiting: [] };
    globalThis.fetch = async () => ({ status: 200, ok: true, headers: { get: () => null }, json: async () => ({ now: Date.now(), machines: [m], mayTake: true, segments: 11 }), text: async () => '' });
    const cl = { state: 'online', me: { id: 9, name: 'Bo' }, on() { return () => {}; }, send(kind, payload) { sent.push({ kind, ...payload }); return true; } };
    const engine = {
      mode: 'multiplayer', started: true, PIXI: { Sprite: Display, Graphics: Display }, entityLayer: new Display(), streetTsid: 'MPH_7_IN2', player: { x: 0, y: 0 }, inv: {}, pc: { imaginationUpgrades: [] },
      query: (hook) => (hook === 'realtimeClient' ? cl : null), param: () => null, homeContext: () => ({ inHome: false }), transientInstance: () => false,
      setData() {}, toast() {}, pushActivity() {}, refreshPack() {}, save() {}, register: (t) => t, unregister() {},
    };
    homeMachinesFeature._reset();
    homeMachinesFeature.onTick(16, 0, engine);
    s = globalThis.groddleHomeMachines;
    for (let i = 0; i < 20 && !s?.state().machines.length; i += 1) {
      await flush();
      homeMachinesFeature.onTick(16, i * 16, engine);
    }
  });

  after(() => {
    homeMachinesFeature._reset();
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete globalThis[k];
      else globalThis[k] = v;
    }
  });

  it('a key-holder on the owner\'s third floor (mayTake: may pick it up) still cannot move it', () => {
    assert.deepEqual(s.state().where, { kind: 'visit', owner: 7, place: 'house:2', mayTake: true });
    assert.equal(typeof s.move, 'function');
    assert.equal(s.canSlide('hm-00000000000000ab'), false);
    assert.equal(s.move('hm-00000000000000ab', 300), false);
    assert.equal(sent.length, 0);
  });
});

describe('the site keeps the move (src/HomeMachines.php)', { skip: skipSite }, () => {
  it('move is a verb; only the owner; within the room; no 200 px', () => {
    const code = `foreach (["HomePool", "HomeMachines"] as $c) require ${JSON.stringify(SITE_DIR)} . "/src/$c.php"; use Groddle\\Minn\\HomeMachines as H; $R = H::rules();
      echo json_encode([in_array("move", H::VERBS, true), H::moveWhy([76, 1024], 440), H::moveWhy([76, 1024], 1025), H::moveWhy([76, 1024], 75), H::moveWhy([76, 1024], "440"), H::moveWhy(null, 440), H::moveWhy(false, 440), H::TEXT_MOVE]);`;
    const got = JSON.parse(execFileSync(PHP, ['-r', code]).toString());
    assert.deepEqual(got, [true, null, 'here', 'here', 'here', 'here', 'here', 'Only the owner can move a machine.']);
  });
});

describe('the realtime server carries the move (home_machines.go)', { skip: HAS_SERVER ? false : 'no groddle-afternoon-server checkout' }, () => {
  it('a move verb, owner only, its x kept', () => {
    const go = readFileSync(serverPath('home_machines.go'), 'utf8');
    assert.match(go, /"move": true/);
    assert.match(go, /if \(msg\.Verb == "place" \|\| msg\.Verb == "move"\) && owner != actor \{/);
  });
});

// —— Chrome, at the player's size: the third floor, machines 220 px apart; drag one in Decoration Mode and out of it ——

let chromium = null;
try { chromium = (await import('playwright')).chromium; } catch { /* no Playwright */ }
const CANVAS = 'canvas[aria-label="Groddle game world"]';

describe('#730 in Chrome (1372x801): drag a placed machine', { skip: !chromium && 'no playwright' }, () => {
  let chrome = null;
  let server = null;
  let ctx = null;
  let page = null;
  const machines = () => page.evaluate(() => window.groddleHomeMachines.state().machines.map((m) => [m.classTsid, m.rx]));
  const data = () => page.evaluate((sel) => ({ ...document.querySelector(sel).dataset }), CANVAS);
  const menuText = () => page.evaluate(() => { const m = document.getElementById('verb-menu'); return m && !m.hidden && m.offsetParent ? m.innerText.replace(/\s+/g, ' ') : ''; });
  /** A machine's body (40 world px above its feet) on screen, and client px per world px. */
  async function bodyOf(cls) {
    return page.evaluate((c) => {
      const s = window.groddleHomeMachines;
      const m = s.state().machines.find((x) => x.classTsid === c);
      const p = s.clientOf(m.id);
      return { id: m.id, rx: m.rx, x: p.x, y: p.y - 40 * p.k, k: p.k };
    }, cls);
  }
  /** Press on the machine and drag it to room x `toRx` (the pointer moves by as much as the machine should). */
  async function drag(cls, toRx) {
    const a = await bodyOf(cls);
    const bx = a.x + (toRx - a.rx) * a.k;
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(a.x + (bx > a.x ? 8 : -8), a.y, { steps: 2 });
    await page.mouse.move(bx, a.y, { steps: 8 });
    await page.waitForTimeout(150);
    const mid = await data();
    await page.mouse.up();
    await page.waitForTimeout(400);
    return mid;
  }

  before(async () => {
    const { openBrowser } = await import('../tools/qa/browser.mjs');
    const { startServer } = await import('../tools/qa/serve.mjs');
    server = await startServer({ root: join(root, 'public') });
    chrome = await openBrowser({ label: 'report730 slide test', waitMs: 30 * 60_000 });
    ctx = await chrome.browser.newContext({ viewport: { width: 1372, height: 801 } });
    page = await ctx.newPage();
    page.setDefaultTimeout(8000);
    await page.goto(`http://127.0.0.1:${server.address().port}/play/?autostart=1&questoffer=off&homedemo=interior&hstip=0&fresh=1&resetgame=1&homefloordemo=built3up&homemachinedemo=metalmaker`);
    await page.waitForFunction(() => window.groddleHomeMachines?.home && window.groddleHomeFloor, null, { timeout: 30000 });
    await page.evaluate(() => { for (const b of document.querySelectorAll('button')) if (b.textContent.trim() === 'Got it' && b.offsetParent) b.click(); });
    await page.evaluate(() => window.groddleHomeFloor(2, 900));
    await page.waitForFunction(() => window.groddleHomeMachines.state().where?.place === 'house:2' && window.groddleHomeMachines.pack('metalmaker').n > 0 && window.groddlePack?.grant, null, { timeout: 10000 });
    await page.waitForTimeout(300);
    for (const [cls, rx] of [['woodworker', 200], ['fuelmaker', 420], ['blockmaker', 640], ['metalmaker', 860]]) {
      if (cls !== 'metalmaker') await page.evaluate((c) => window.groddlePack.grant(c, 1), cls);
      assert.equal(await page.evaluate(([c, x]) => window.groddleHomeMachines.placeAt(c, x), [cls, rx]), true, `${cls} at ${rx}`);
    }
    // Stand clear of them, at the far end.
    await page.evaluate(() => { const p = window.groddleHomeMachines.home; void p; });
  }, { timeout: 30 * 60_000 + 60_000 });

  after(async () => {
    await ctx?.close().catch(() => {});
    await chrome?.close();
    await new Promise((r) => (server ? server.close(r) : r()));
  });

  it('out of Decoration Mode a click still opens its menu; a drag moves it, right beside another', { timeout: 30_000 }, async () => {
    const a = await bodyOf('blockmaker');
    await page.mouse.click(a.x, a.y);
    await page.waitForTimeout(300);
    assert.match(await menuText(), /Blockmaker/, 'the click opens the menu, as before');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    const mid = await drag('blockmaker', 470);
    assert.match(mid.hmSlide || '', /^hm-/, 'sliding while the button is down');
    const bm = (await machines()).find(([c]) => c === 'blockmaker');
    assert.ok(Math.abs(bm[1] - 470) <= 3, `moved to ${bm[1]} (50 px from the fuelmaker at 420)`);
    assert.equal(await menuText(), '', 'the drag closed the menu the press opened');
  });

  it('in Decoration Mode a drag moves it too', { timeout: 30_000 }, async () => {
    await page.click('#homes-decorate-btn');
    await page.waitForTimeout(500);
    assert.equal((await data()).homeMode, 'decorate');
    await drag('metalmaker', 740);
    const mm = (await machines()).find(([c]) => c === 'metalmaker');
    assert.ok(Math.abs(mm[1] - 740) <= 3, `moved to ${mm[1]}`);
    assert.equal((await data()).homeMode, 'decorate', 'still decorating');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
  });
});
