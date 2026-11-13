/**
 * Reports #194 and #198.
 * #194 (Organish Chute): reversed gravity with no line overhead carried the avatar off the top of
 * the street for good, and /stuck put you back with the gravity still reversed. The client kept
 * the feet between location.t and location.b (AvatarPhysicsHandler.as setAndBoundPositionOnSelf
 * 470-480): js/avatar-step.js streetTopBottom; /stuck drops the event physics
 * (location-events-feature stuck).
 * #198 (Fernucopia): the whistle stand's blast stopped under the exit ledge's underside, and
 * jetpack_once kept the stand dead until you left the street. puzzle-triggers.json
 * platformPerms softens the underside; `rearm` re-arms the stand once you are back on the floor.
 */
import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JUMP_SPEED, NORMAL_BUFF, avatarGround, stepAvatar, streetPhysicsExtras, streetTopBottom } from '../public/js/avatar-step.js?v=43b1182e';
import { avatarHeadReach, barriersScreen, platformsScreen, streetHeight, streetWidth } from '../public/js/street-model.js?v=b6cb6a4e';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const raw = JSON.parse(readFileSync(join(root, 'public/assets/content/puzzle-triggers.json'), 'utf8'));
const loadStreet = (tsid) => JSON.parse(readFileSync(join(root, 'public/assets/streets', `${tsid}.json`), 'utf8'));
const game = readFileSync(join(root, 'public/game.js'), 'utf8');
const FERNUCOPIA = 'GHVQMS17V813FN7';

describe('report #194: the street\'s top and bottom (avatar-step.js streetTopBottom)', () => {
  const floorAt = (y) => () => y;

  it('reversed gravity with nothing overhead stops the head at the top of the street, and a flip brings it down', () => {
    const body = { x: 500, y: 600, vx: 0, vy: 0, onGround: true };
    const opts = { buff: { ...NORMAL_BUFF, gravity: -1 }, platforms: [], worldW: 4000, worldH: 3000, ground: floorAt(3000) };
    for (let f = 0; f < 600; f += 1) stepAvatar(body, opts);
    const reach = avatarHeadReach(1).reach;
    assert.equal(body.y, reach, 'the head rests against the top, the avatar still in view');
    assert.equal(body.vy, 0);
    assert.equal(body.onGround, false);
    const down = { ...opts, buff: NORMAL_BUFF };
    for (let f = 0; f < 600 && !body.onGround; f += 1) stepAvatar(body, down);
    assert.equal(body.onGround, true, 'gravity flipped back: it falls to the floor');
    assert.equal(body.y, 3000);
  });

  it('without worldH (the level builder\'s validator) nothing changes', () => {
    const body = { x: 500, y: 600, vx: 0, vy: 0, onGround: true };
    for (let f = 0; f < 300; f += 1) stepAvatar(body, { buff: { ...NORMAL_BUFF, gravity: -1 }, platforms: [], worldW: 4000, ground: floorAt(3000) });
    assert.ok(body.y < 0);
  });

  it('under normal gravity the feet stop at the top as the client\'s did, so a line near the top still holds you', () => {
    const top = { x: 0, y: -40, vy: -9 };
    streetTopBottom(top, { worldH: 1000, gravity: 1, headReach: 111 });
    assert.deepEqual([top.y, top.vy], [0, 0]);
    // Standing on a line 30 px under the top (GIFDIDJT0GU1CR8 has three) is left alone.
    const line = [{ id: 'l', x1: 0, y1: 30, x2: 400, y2: 30, pcPerm: -1 }];
    const body = { x: 200, y: 30, vx: 0, vy: 0, onGround: true };
    for (let f = 0; f < 30; f += 1) stepAvatar(body, { platforms: line, worldW: 400, worldH: 1000, ground: (x, y, vy) => avatarGround(line, x, y, vy) });
    assert.deepEqual([body.y, body.onGround], [30, true]);
  });

  it('the feet never go under the bottom, unless a line there holds them lower', () => {
    const stand = { x: 0, y: 1034, vy: 0, onGround: true };
    streetTopBottom(stand, { worldH: 1000, floor: 1034 });
    assert.equal(stand.y, 1034, 'a floor below b (Tumble Rd 4: 34 px) wins');
    const fall = { x: 0, y: 1200, vy: 8, onGround: false };
    streetTopBottom(fall, { worldH: 1000, floor: Infinity });
    assert.deepEqual([fall.y, fall.vy, fall.onGround], [1000, 0, true], 'no floor under you: the bottom of the street is one');
  });

  it('game.js passes the street height to both of its steps', () => {
    assert.match(game, /function avatarStepOptions\(dt = 1\) \{[\s\S]{0,300}worldH: streetWorldH\(\),/);
    assert.match(game, /stepAvatar\(player, \{[\s\S]{0,400}worldH: streetWorldH\(\),/);
    assert.match(game, /function streetWorldH\(\) \{\s*const b = currentStreet\?\.bounds;/);
  });
});

describe('reports #194/#198: /stuck and Fernucopia\'s whistle stand (puzzles-feature, location-events-feature)', () => {
  let puzzles;
  let events;
  let eventsApi;
  before(async () => {
    class Display {
      constructor() {
        this.anchor = { set() {} };
        this.scale = { set() {} };
        this.children = [];
        this.x = 0;
        this.y = 0;
      }
      addChild(c) { this.children.push(c); return c; }
      removeChild() {}
      destroy() { this.destroyed = true; }
    }
    class Texture { constructor(o) { Object.assign(this, o); } }
    class ImageSource { constructor(o) { Object.assign(this, o, { width: 1, height: 1 }); } on() { return this; } }
    class Sprite extends Display { constructor(texture) { super(); this.texture = texture; } }
    class Text extends Display {}
    globalThis.PIXI = { Sprite, Container: Display, Graphics: Display, Text, Texture, ImageSource, Rectangle: class {} };
    globalThis.Image ||= class { set src(v) { this._s = v; } decode() { return Promise.resolve(); } };
    globalThis.fetch = async () => ({ json: async () => raw });
    ({ puzzlesFeature: puzzles } = await import('../public/js/features/puzzles-feature.js?v=81922fb7'));
    ({ locationEventsFeature: events, locationEventsApi: eventsApi } = await import('../public/js/features/location-events-feature.js?v=f2b6c156'));
  });

  async function enterFernucopia() {
    const street = loadStreet(FERNUCOPIA);
    const data = {};
    const engine = {
      PIXI: globalThis.PIXI,
      started: true,
      street,
      streetTsid: FERNUCOPIA,
      player: { x: 4700, y: 955, vx: 0, vy: 0, onGround: true },
      platforms: null,
      decoViews: new Map(),
      entityLayer: new globalThis.PIXI.Container(),
      transientInstance: () => false,
      heldInstance: () => null,
      homeContext: () => ({ inHome: false }),
      busy: () => false,
      register: (t) => t,
      setData: (k, v) => { data[k] = v; },
      param: () => null,
      toast() {},
      playSound() {},
      pushActivity() {},
      floatText() {},
      snapCamera() {},
      updateHud() {},
      save() {},
      data,
    };
    puzzles.init(engine);
    await new Promise((r) => setTimeout(r, 20));
    puzzles.prepareStreet(street);
    engine.platforms = platformsScreen(street);
    events.onStreetEnter(street, engine);
    puzzles.onStreetEnter(street, engine);
    await new Promise((r) => setTimeout(r, 20));
    return engine;
  }
  const tick = (engine, ms = 1000 / 60) => {
    events.onTick(ms, Date.now(), engine);
    puzzles.onTick(ms, Date.now(), engine);
  };

  it('the stand fires once, is re-armed back on the shaft floor after a flight, and fires again', async () => {
    const engine = await enterFernucopia();
    const p = engine.player;
    tick(engine);
    assert.equal(eventsApi.flag('jetpack_once'), false);
    Object.assign(p, { x: 4801, y: 955, onGround: true });
    tick(engine);
    assert.equal(eventsApi.flag('jetpack_once'), true, 'stepping on the stand fires jet_pack_01');
    assert.ok(eventsApi.gravity() < 0, 'spring_01: the blast');
    // A flight that falls short (as on the live street before the fix, report #198).
    Object.assign(p, { y: 400, onGround: false });
    tick(engine);
    Object.assign(p, { x: 4700, y: 955, onGround: true });
    tick(engine);
    assert.equal(eventsApi.flag('jetpack_once'), false, 'back on the shaft floor: re-armed');
    Object.assign(p, { x: 4801 });
    tick(engine);
    assert.equal(eventsApi.flag('jetpack_once'), true, 'and the stand fires again');
    // Landing on the exit ledge is not the shaft floor: no re-arm there.
    Object.assign(p, { y: 400, onGround: false });
    tick(engine);
    Object.assign(p, { x: 4850, y: 156, onGround: true });
    tick(engine);
    assert.equal(eventsApi.flag('jetpack_once'), true);
    puzzles.onStreetClear(engine);
    events.onStreetClear(engine);
  });

  it('/stuck drops the blast\'s physics and re-arms the stand', async () => {
    const engine = await enterFernucopia();
    Object.assign(engine.player, { x: 4801, y: 955, onGround: true });
    tick(engine);
    assert.ok(eventsApi.gravity() < 0);
    assert.ok(events.physics(engine).jetpack);
    assert.ok(eventsApi.stuck(engine) >= 2);
    assert.equal(eventsApi.gravity(), 1);
    assert.equal(events.physics(engine).jetpack, false);
    assert.equal(eventsApi.flag('jetpack_once'), false);
    puzzles.onStreetClear(engine);
    events.onStreetClear(engine);
  });

  it('/stuck in a gut tube puts gravity back the right way up (Organish Chute, gut_invert has no end)', () => {
    const street = { tsid: 'GTESTGUT0000001', platforms: [], events: { player_enter: [], gut_invert: raw.streets.GA9UCEFP7LD3523.events.gut_invert } };
    const engine = { street, streetTsid: street.tsid, platforms: [], decoViews: new Map(), started: true, transientInstance: () => false, homeContext: () => ({ inHome: false }), setData() {}, param: () => null };
    events.onStreetEnter(street, engine);
    eventsApi.fire(engine, 'gut_invert');
    events.onTick(60_000, Date.now(), engine);
    assert.equal(eventsApi.gravity(), -1, 'still reversed a minute later');
    assert.equal(eventsApi.stuck(engine), 1);
    assert.equal(eventsApi.gravity(), 1);
    events.onStreetClear(engine);
  });

  it('the /stuck move calls it', () => {
    const feature = readFileSync(join(root, 'public/js/features/slash-commands-feature.js'), 'utf8');
    assert.match(feature, /if \(plan\.stuck === 'arrival'\) locationEventsApi\.stuck\(engine\);/);
  });

  it('the blast carries you from the stand up onto the exit ledge (and stopped under it before the fix)', async () => {
    const fly = (street, engine) => {
      const plats = platformsScreen(street);
      const body = { x: 4801, y: 955, vx: 0, vy: 0, onGround: true };
      engine.player = body;
      let top = body.y;
      for (let f = 0; f < 60 * 8; f += 1) {
        // The puzzle run fires the stand on the first frame; the flight is the street's physics.
        if (f === 0) tick(engine);
        else events.onTick(1000 / 60, Date.now(), engine);
        const extra = events.physics(engine) || { speed: 1, jump: 1, gravity: 1 };
        const buff = { ...NORMAL_BUFF, ...streetPhysicsExtras(extra), speed: extra.speed, jump: extra.jump, gravity: extra.gravity };
        stepAvatar(body, {
          buff,
          platforms: plats,
          barriers: barriersScreen(street),
          worldW: streetWidth(street),
          worldH: streetHeight(street),
          bodyScale: street.physics.setting.pc_scale,
          ground: (x, y, vy) => avatarGround(plats, x, y, vy, { street }),
        });
        top = Math.min(top, body.y);
      }
      return { body, top };
    };
    const engine = await enterFernucopia();
    const { body, top } = fly(engine.street, engine);
    assert.ok(top < 153, `rose past the ledge (feet reached ${top.toFixed(0)})`);
    assert.ok(top >= 0, 'never past the top of the street');
    assert.equal(body.onGround, true);
    assert.ok(Math.abs(body.y - 156) < 4, `stands on the exit ledge (y ${body.y.toFixed(0)})`);
    puzzles.onStreetClear(engine);
    events.onStreetClear(engine);

    // The archived underside (pc_perm 1): the head stops at y 199 and the blast drops you back.
    const engine2 = await enterFernucopia();
    const source = loadStreet(FERNUCOPIA);
    const shut = fly(source, engine2);
    assert.ok(shut.top > 199, `stopped under the underside (feet ${shut.top.toFixed(0)})`);
    assert.ok(Math.abs(shut.body.y - 955) < 2, 'and fell back to the shaft floor');
    puzzles.onStreetClear(engine2);
    events.onStreetClear(engine2);
  });

  it('the data: both underside halves soft, the rearm region on the shaft floor, a toast without em dashes', () => {
    const def = raw.streets[FERNUCOPIA];
    assert.deepEqual(def.platformPerms.map((f) => [f.id, f.pc_perm]), [['plat_1336677223326', 0], ['plat_1336677223328', 0]]);
    const [rearm] = def.rearm;
    assert.equal(rearm.flag, 'jetpack_once');
    assert.ok(def.events[rearm.event].some((a) => a.type === 'flag_clear' && a.flag === 'jetpack_once'));
    assert.ok(rearm.x0 <= 4626 && rearm.x1 >= 4999 && rearm.y0 < 955 && rearm.y1 >= 955);
    const stand = def.triggers.find((t) => t.id === 'whistle_stand');
    assert.ok(!/\u2014/.test(stand.toast));
  });
});
