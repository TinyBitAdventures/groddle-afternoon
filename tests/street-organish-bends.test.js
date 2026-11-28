/**
 * Organish Chute's bends (report #390, register G839): the street's 14 Collision-triggered Event
 * Boxes (LA9UCEFP7LD3523.xml) fired invert_phys / reset_phys at the serpentine's bends, but where
 * they stood was not archived. Four bend boxes put them back on the way up from Shim Shiri, read
 * from the street's lines, each only for a traveller going that way. The walk below steps the
 * avatar with the game's own stepper (js/avatar-step.js) and the puzzle and location-event
 * features, from the foot of the right shaft to the mouth, and never presses Space.
 */
import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NORMAL_BUFF, avatarGround, stepAvatar, steerX, streetPhysicsExtras } from '../public/js/avatar-step.js?v=8415ee96';
import { barriersScreen, lineEndWalled, platformsScreen, streetHeight, streetWidth } from '../public/js/street-model.js?v=a9a05f9d';
import { enteredFrom, normalizePuzzleData, stepTriggers } from '../public/js/puzzle-triggers.js?v=221b67a9';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const TSID = 'GA9UCEFP7LD3523';
const raw = JSON.parse(readFileSync(join(root, 'public/assets/content/puzzle-triggers.json'), 'utf8'));
const def = normalizePuzzleData(raw)[TSID];
const loadStreet = () => JSON.parse(readFileSync(join(root, 'public/assets/streets', `${TSID}.json`), 'utf8'));
const sourceXml = join(root, '../streets/mnt/stos/location_data/LA9UCEFP7LD3523.xml');

describe('Organish Chute bend boxes (#390)', () => {
  it('four boxes at the bends of the way up, each saying why, firing the street\'s own invert_phys / reset_phys', () => {
    const bends = def.triggers.filter((t) => t.id.startsWith('bend_'));
    assert.deepEqual(bends.map((t) => [t.id, t.onEnter.join()]), [
      ['bend_top_right', 'reset_phys'],
      ['bend_bottom_right', 'invert_phys'],
      ['bend_top_left', 'reset_phys'],
      ['bend_bottom_left', 'invert_phys'],
    ]);
    for (const t of bends) {
      assert.equal(t.from, 'right', `${t.id}: the way up runs leftward at every bend`);
      assert.ok(t.why.length > 80, `${t.id} says why it stands there`);
    }
    assert.deepEqual(def.events.invert_phys, [{ type: 'physics', param: 'gravity', value: -1, duration: 0, all: false }]);
    assert.deepEqual(def.events.reset_phys.map((a) => a.type), ['physics_reset']);
    assert.ok(def.gravityToggle, 'Space still flips as a fallback');
  });

  it('the source has 14 event boxes and the two flip scripts', { skip: !existsSync(sourceXml) && 'needs the streets archive beside the repo' }, () => {
    const xml = readFileSync(sourceXml, 'utf8');
    assert.equal(xml.match(/label="Collision-triggered Event Box"/g).length, 14);
    assert.match(xml, /<object id="invert_phys">[\s\S]*?gravity:-1/);
    assert.match(xml, /<object id="reset_phys">[\s\S]*?gravity:1/);
  });

  it('a `from` box fires only for an avatar that came in across that side', () => {
    const box = { id: 'b', x: 100, y: 200, w: 40, h: 100, from: 'right', onEnter: ['go'], onExit: [] };
    assert.equal(enteredFrom(box, { x: 125, y: 150 }), true);
    assert.equal(enteredFrom(box, { x: 100, y: 250 }), false, 'from below');
    assert.equal(enteredFrom(box, null), false, 'placed inside');
    assert.equal(enteredFrom({ ...box, from: undefined }, null), true);
    const inside = new Set();
    assert.deepEqual(stepTriggers([box], inside, new Set(), 100, 150, 0, { x: 100, y: 230 }), [], 'rising in from below: inside, silent');
    assert.ok(inside.has('b'));
    stepTriggers([box], inside, new Set(), 130, 150, 0, { x: 100, y: 150 });
    assert.deepEqual(stepTriggers([box], inside, new Set(), 115, 150, 0, { x: 130, y: 150 }).map((e) => e.events), [['go']], 'back in from the right: fires');
  });
});

describe('the divider\'s tip is no ledge beside its wall (#390)', () => {
  const street = loadStreet();
  const lines = platformsScreen(street);
  const walls = barriersScreen(street);
  const tip = lines.find((p) => p.id === 'plat_1352148177034');

  it('past a line\'s end, a wall standing on that end cuts it off; inside the line, or a wall elsewhere, does not', () => {
    assert.deepEqual([Math.round(tip.x2), Math.round(tip.y2)], [2524, 2185]);
    assert.equal(lineEndWalled(tip, 2525, walls), true, 'beside wall_1352148176866, foot at the tip');
    assert.equal(lineEndWalled(tip, 2528, walls), true);
    assert.equal(lineEndWalled(tip, 2500, walls), false, 'on the tip itself');
    assert.equal(lineEndWalled(tip, 2410, walls), false, 'its other end has no wall');
    // A wall hanging down from a ledge's end (its top at the end) leaves the ledge's slack alone.
    const ledge = { x1: 0, y1: 500, x2: 100, y2: 500 };
    assert.equal(lineEndWalled(ledge, 102, [{ x: 100, yTop: 500, yBot: 900 }]), false);
    assert.equal(lineEndWalled(ledge, 102, [{ x: 100, yTop: 100, yBot: 500 }]), true);
  });

  it('only on a street that asks for it: the avatar falls past the tip to the bowl', () => {
    assert.equal(Math.round(avatarGround(lines, 2525, 2180, 6, { street })), 2185, 'the street as archived: the tip');
    const patched = { ...street, lineEndsAtWalls: true };
    assert.ok(avatarGround(lines, 2525, 2180, 6, { street: patched }) > 2450, 'patched: the bowl');
    assert.equal(def.lineEndsAtWalls, true);
    assert.match(def.lineEndsAtWallsWhy, /#390/);
  });
});

describe('the walk up Organish Chute with the game\'s stepper (#390)', () => {
  let puzzles;
  let events;
  let api;
  let gravityFlipKey;
  before(async () => {
    class Display {
      constructor() { this.anchor = { set() {} }; this.scale = { set() {} }; this.children = []; this.x = 0; this.y = 0; }
      addChild(c) { this.children.push(c); return c; }
      removeChild() {}
      destroy() {}
    }
    class Texture { constructor(o) { Object.assign(this, o); } }
    class ImageSource { constructor(o) { Object.assign(this, o, { width: 1, height: 1 }); } on() { return this; } }
    class Sprite extends Display { constructor(t) { super(); this.texture = t; } }
    globalThis.PIXI = { Sprite, Container: Display, Graphics: Display, Text: Display, Texture, ImageSource, Rectangle: class {} };
    globalThis.Image ||= class { set src(v) { this._s = v; } decode() { return Promise.resolve(); } };
    globalThis.fetch = async () => ({ json: async () => raw });
    // The flip keys listen on the window (bindGravityFlip).
    if (typeof globalThis.window === 'undefined') globalThis.window = new EventTarget();
    ({ gravityFlipKey, puzzlesFeature: puzzles } = await import('../public/js/features/puzzles-feature.js?v=6a7b75d3'));
    ({ locationEventsFeature: events, locationEventsApi: api } = await import('../public/js/features/location-events-feature.js?v=1c5b6340'));
  });

  /** The avatar on the street at (x, y), stepped a frame at a time as game.js steps it. */
  async function enter(x, y) {
    const street = loadStreet();
    const engine = {
      PIXI: globalThis.PIXI, started: true, street, streetTsid: TSID,
      // ~147 px tall, as the avatar measured in the game (feet 125 px under a ceiling it presses).
      player: { x, y, vx: 0, vy: 0, onGround: false, height: 147 },
      platforms: null, decoViews: new Map(), entityLayer: new globalThis.PIXI.Container(),
      transientInstance: () => false, heldInstance: () => null, homeContext: () => ({ inHome: false }), busy: () => false,
      register: (t) => t, setData() {}, param: () => null, toast() {}, playSound() {}, pushActivity() {}, floatText() {},
      snapCamera() {}, updateHud() {}, save() {}, quoinState: {}, pc: { xp: 0, energy: 100, mood: 100, currants: 0, imagination: 0 },
      travelGate: () => ({ ok: true }), enter(tsid) { this.left = tsid; },
    };
    puzzles.init(engine);
    await new Promise((r) => setTimeout(r, 20));
    puzzles.prepareStreet(street);
    engine.platforms = platformsScreen(street);
    events.onStreetEnter(street, engine);
    puzzles.onStreetEnter(street, engine);
    await new Promise((r) => setTimeout(r, 20));
    const barriers = barriersScreen(street);
    const worldW = streetWidth(street);
    const worldH = streetHeight(street);
    const keys = new Set();
    const buff = () => {
      const a = puzzles.physics(engine) || {};
      const b = events.physics(engine) || {};
      const speed = (a.speed ?? 1) * (b.speed ?? 1);
      const jump = (a.jump ?? 1) * (b.jump ?? 1);
      const gravity = (a.gravity ?? 1) * (b.gravity ?? 1);
      return { ...NORMAL_BUFF, ...streetPhysicsExtras({ ...b }), speed, jump, gravity };
    };
    const p = engine.player;
    const frame = () => {
      const bf = buff();
      p.vx = steerX(p.vx, keys.has('ArrowLeft') ? -1 : keys.has('ArrowRight') ? 1 : 0, p.onGround, bf);
      stepAvatar(p, {
        dt: 1, buff: bf, platforms: engine.platforms, barriers, worldW, worldH,
        ceilings: puzzles.ownsCeilings(engine) !== true,
        ground: (gx, gy, vy) => avatarGround(engine.platforms, gx, gy, vy ?? 0, { street, fallback: worldH }),
      });
      events.onTick(1000 / 60, Date.now(), engine);
      puzzles.onTick(1000 / 60, Date.now(), engine);
    };
    const hold = (k) => { keys.clear(); if (k) keys.add(k); };
    const steer = (tx) => hold(p.x < tx - 12 ? 'ArrowRight' : p.x > tx + 12 ? 'ArrowLeft' : null);
    const clear = () => { puzzles.onStreetClear(engine); events.onStreetClear(engine); };
    // A key press as the browser sends it; the flip waits 300 ms between flips (flipGravity).
    const press = async (code) => {
      await new Promise((r) => setTimeout(r, 320));
      globalThis.window.dispatchEvent(Object.assign(new Event('keydown'), { code, key: code, repeat: false }));
    };
    return { engine, p, frame, hold, steer, clear, press };
  }

  it('from the foot of the right shaft to the mouth without Space: every bend turns the traveller over', async () => {
    const w = await enter(3850, 2980);
    const { p } = w;
    w.frame(); // the arrival: gut_from_bottom turns the traveller over at the foot of the shaft
    // [what the traveller does, until]: hold the way along each passage, steer down the middle of each tube.
    const phases = [
      ['up the right shaft, head first', () => w.steer(3850), () => p.y < 500, -1],
      ['left along the top passage\'s ceiling', () => w.hold('ArrowLeft'), () => api.gravity() > 0, -1],
      ['down the first tube', () => w.steer(2660), () => p.onGround && p.y > 2300, 1],
      ['left along the bowl', () => w.hold('ArrowLeft'), () => api.gravity() < 0, 1],
      ['up the second tube', () => w.steer(2280), () => p.y < 700, -1],
      ['left along the upper passage\'s ceiling', () => w.hold('ArrowLeft'), () => api.gravity() > 0, -1],
      ['down the third tube', () => w.steer(1060), () => p.onGround && p.y > 2400, 1],
      ['left along the last bowl', () => w.hold('ArrowLeft'), () => api.gravity() < 0, 1],
      ['up the last tube to the mouth', () => w.steer(640), () => Boolean(w.engine.left), -1],
    ];
    for (const [name, act, done, gravity] of phases) {
      let f = 0;
      while (!done()) {
        assert.equal(Math.sign(api.gravity()), gravity, `${name}: gravity at (${Math.round(p.x)}, ${Math.round(p.y)})`);
        act();
        w.frame();
        f += 1;
        assert.ok(f < 900, `${name}: stuck at (${Math.round(p.x)}, ${Math.round(p.y)})`);
      }
    }
    assert.equal(w.engine.left, 'GA5GNCQ4T3137M7', 'out of the mouth to Indulcet Fames');
    w.clear();
  });

  it('Down puts a reversed avatar back on its feet, Up turns it over; never while climbing', () => {
    assert.equal(gravityFlipKey('ArrowDown', true), true);
    assert.equal(gravityFlipKey('KeyS', true), true);
    assert.equal(gravityFlipKey('ArrowDown', false), false, 'already the right way up');
    assert.equal(gravityFlipKey('ArrowUp', false), true);
    assert.equal(gravityFlipKey('KeyW', false), true);
    assert.equal(gravityFlipKey('ArrowUp', true), false, 'already head first');
    assert.equal(gravityFlipKey('ArrowUp', false, { climbing: true }), false, 'Up climbs a ladder');
    assert.equal(gravityFlipKey('Space', true), true);
    assert.equal(gravityFlipKey('ArrowLeft', true), false);
  });

  it('pinned head first in the first tube\'s top-left corner, Down drops the avatar and Up turns it over again', async () => {
    const w = await enter(2720, 377);
    api.fire(w.engine, 'gut_invert');
    for (let f = 0; f < 20; f += 1) w.frame();
    w.hold('ArrowLeft');
    for (let f = 0; f < 90; f += 1) w.frame();
    w.hold(null);
    assert.ok(Math.abs(w.p.x - 2525) < 4 && w.p.y < 700, `the corner of the report (${Math.round(w.p.x)}, ${Math.round(w.p.y)})`);
    assert.equal(api.gravity(), -1);
    await w.press('ArrowDown');
    assert.equal(api.gravity(), 1, 'Down: the right way up');
    for (let f = 0; f < 200; f += 1) w.frame();
    assert.ok(w.p.y > 2000, 'fell down the tube');
    await w.press('ArrowUp');
    assert.equal(api.gravity(), -1, 'Up: head first again');
    w.clear();
  });

  it('from the report\'s corner, Down drops the avatar to the bowl past the tip, and the bend turns it over again', async () => {
    const w = await enter(2720, 377);
    api.fire(w.engine, 'gut_invert');
    w.frame();
    assert.equal(api.gravity(), -1, 'starts head first');
    w.hold('ArrowLeft');
    for (let f = 0; f < 90; f += 1) w.frame();
    await w.press('ArrowDown');
    assert.equal(api.gravity(), 1);
    let f = 0;
    while (!(w.p.y > 2400) && f < 200) { w.frame(); f += 1; }
    assert.ok(w.p.y > 2400, `below y 2400 within 200 frames (at ${Math.round(w.p.x)}, ${Math.round(w.p.y)} after ${f})`);
    // Still holding Left: along the bowl under the tip, bend_bottom_right turns it over.
    f = 0;
    while (!(w.p.x < 2300) && f < 300) { w.frame(); f += 1; }
    assert.ok(w.p.x < 2300, 'past x 2300 going left');
    assert.equal(api.gravity(), -1, 'head first again');
    w.clear();
  });

  it('walking back the other way, a bend box lets the traveller pass', async () => {
    // Reversed in the first tube, rising back to the top passage: bend_top_right stays quiet.
    const w = await enter(2660, 1500);
    api.fire(w.engine, 'gut_invert');
    for (let f = 0; f < 200; f += 1) w.frame();
    assert.ok(w.p.y < 600, 'back at the top');
    assert.equal(api.gravity(), -1, 'still head first under the top passage');
    w.clear();
  });
});
