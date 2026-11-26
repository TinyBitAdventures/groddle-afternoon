/**
 * G888: one rule for every street with no road back to Ur. Austin 2026-11-16: "Can we do a 'is
 * quest active' check? If the quest isn't active there should be a visible exit that appears which
 * takes you back to a normal street." A dead end is found from the signpost graph (plus the ways out
 * features run themselves), never from a hand list; an owner that runs something there answers
 * deadEndRun; with nothing active the wooden EXIT arrow stands near where you arrived.
 * Run: node --test tests/dead-end-exit.test.js
 */
import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEAD_END_EXIT, DEAD_END_TEXT, deadEndExitSpot, floorAt, isDeadEndTsid, urReach } from '../public/js/dead-ends.js?v=8b015857';
import { DEAD_END_EXIT_CLASS, deadEndActive, deadEndsFeature as de } from '../public/js/features/dead-ends-feature.js?v=1a5e981f';
import { loadStreetIndexObject } from '../public/js/street-loader.js?v=10376267';
import { STRAY_FALLBACK_TSID, streetsReachingUr } from '../public/js/quest-instance.js?v=15090adc';
import { ROOM_STREETS } from '../public/js/quest-rooms/catalog.js?v=f37a25ba';
import { FIRST_SKILLS } from '../public/js/newxp.js?v=0d81aa52';
import { COLOUR_LEVEL_STREETS, NO_EXIT_PUZZLE_STREETS } from '../public/js/puzzle-triggers.js?v=221b67a9';
import { hiddenFloorsFeature } from '../public/js/features/hidden-floors-feature.js?v=e2d65ebc';
import { midTowerFeature } from '../public/js/features/mid-tower-feature.js?v=da4c7ad9';
import { questInstancesFeature as qi } from '../public/js/features/quest-instances-feature.js?v=42643f08';
import { puzzlesFeature as pz } from '../public/js/features/puzzles-feature.js?v=12ca7213';
import { hellFeature } from '../public/js/features/hell-feature.js?v=74604dfc';
import { subwayFeature } from '../public/js/features/subway-feature.js?v=50d6e916';
import { interrogationRoomFeature } from '../public/js/features/interrogation-room-feature.js?v=3b2769d5';
import { newxpFeature } from '../public/js/features/newxp-feature.js?v=452e26ce';
import { Display, fakePixi } from './fake-scene.js';

/** fake-scene's Pixi, with a texture source js/textures.js can wait on (the image never loads in Node). */
class FakeSource { constructor() { this.destroyed = false; } emit() {} resize() { return true; } update() {} }
class FakeTexture { constructor(o = {}) { this.source = o.source; this.destroyed = false; } }
const testPixi = new Proxy({ ImageSource: FakeSource, Texture: FakeTexture, Rectangle: class { constructor(x, y, w, h) { Object.assign(this, { x, y, w, h }); } } }, {
  get: (t, k) => (k in t ? t[k] : fakePixi[k]),
});

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const graph = JSON.parse(read('public/assets/content/signpost-graph.json'));
const index = JSON.parse(read('public/assets/streets/index.json'));
loadStreetIndexObject(index);
const flush = () => new Promise((r) => setTimeout(r, 0));

const HECHEY = 'GLI2V0UN7RD1T2J';
const EZ = 'GIFII3UBRFB3KBE';
const ORANGIAN = 'GHVCKEPHO403BN5';
const UMBRA = 'GDOSHD9J6NT2HUJ';
const PENUMBRA = 'GIFM2QAIQ1C31JV';
const MARKET_ST = 'GLI104NPBDC1DC2'; // Old Groddle Forest (hub 28), link-only
const FORGOTTEN_FLOOR = 'GDOOSA8V29J24I3';
const LOST_FLOOR = 'GA9QUBPI49J2MOB';
const MISSING_FLOOR = 'GUV1CSSE49J2P2C';
const UNNNN = 'GIFPV9EMLT72DP4';
const INTERROGATION = 'GIFLFPPBUUT11SP';
const SUBWAY_CAR = 'GTJ101M7R9O1HTT';

/** The ways out the features run themselves, as the feature host collects them. */
const ROADS = [...hiddenFloorsFeature.urRoads(), ...midTowerFeature.urRoads()];

function fakeEngine({ tsid = HECHEY, run = null, player = { x: 1000, y: 900 }, platforms = null, width = 2000 } = {}) {
  const targets = new Set();
  const log = { entered: [], data: {} };
  const engine = {
    log,
    targets,
    started: true,
    PIXI: testPixi,
    entityLayer: new Display(),
    streetTsid: tsid,
    street: { tsid, label: tsid, bounds: { l: 0, r: width, t: -1000, b: 0 } },
    worldW: width,
    platforms: platforms || [{ id: 'floor', x1: 0, y1: 900, x2: width, y2: 900 }],
    player: { ...player },
    run,
    setData: (k, v) => { log.data[k] = v; },
    param: () => null,
    save() {},
    inScene: () => false,
    transientInstance: () => false,
    homeContext: () => ({ inHome: false, owned: false }),
    register(t) { targets.add(t); return t; },
    unregister(t) { targets.delete(t); },
    collect: (hook) => (hook === 'urRoads' ? ROADS : []),
    query: (hook, ...args) => {
      if (hook === 'deadEndRun') return engine.run;
      if (hook === 'safeWayOut') return { tsid: HECHEY, x: 410, y: 820 };
      return null;
    },
    enter: async (to, opts) => {
      log.entered.push([to, opts]);
      engine.streetTsid = to;
      engine.street = { tsid: to, label: to, bounds: { l: 0, r: width, t: -1000, b: 0 } };
    },
  };
  return engine;
}

/** Enter the street and let the arrival settle (the exit stands where you landed, SETTLE_MS). */
let clock = Date.now();
const tick = (engine, ms = 1000) => { clock += ms; de.onTick(16, clock, engine); };
function arrive(engine) {
  de.onStreetEnter(engine.street, engine);
  clock = Date.now();
  tick(engine);
}

const exitOf = (engine) => [...engine.targets].find((t) => t.classId === DEAD_END_EXIT_CLASS) || null;

let savedPixi;
before(() => {
  savedPixi = globalThis.PIXI;
  globalThis.PIXI = testPixi;
});
after(() => {
  globalThis.PIXI = savedPixi;
});

describe('which streets are dead ends (js/dead-ends.js urReach)', () => {
  const ur = urReach(graph, ROADS);
  const dead = Object.keys(index.streets).filter((t) => isDeadEndTsid(t, ur));

  it('is the signpost graph rule of G887 plus the ways out a feature runs itself', () => {
    const plain = streetsReachingUr(graph);
    for (const t of Object.keys(index.streets)) {
      if (plain.has(t)) assert.ok(ur.has(t), `${t} reaches Ur by its roads`);
    }
    for (const t of [FORGOTTEN_FLOOR, LOST_FLOOR, MISSING_FLOOR, UNNNN]) {
      assert.ok(!plain.has(t), `${t}: no signpost or door out`);
      assert.ok(ur.has(t), `${t}: its teleporter is its road back`);
    }
    assert.equal(urReach(null), null);
  });

  it('covers every kind with no list: quest rooms, practice streets, colour levels, Umbra, Penumbra, hub 28', () => {
    const want = [
      ...Object.values(ROOM_STREETS).flat(),
      ...FIRST_SKILLS.map((s) => s.street).filter(Boolean),
      ...COLOUR_LEVEL_STREETS,
      ...NO_EXIT_PUZZLE_STREETS,
      UMBRA,
      PENUMBRA,
      MARKET_ST,
      INTERROGATION,
      SUBWAY_CAR,
    ];
    for (const t of want) assert.ok(dead.includes(t), `${t} is a dead end`);
    const hub28 = Object.entries(index.streets).filter(([, r]) => r.hubId === '28').map(([t]) => t);
    const hub28Dead = hub28.filter((t) => dead.includes(t));
    assert.ok(hub28Dead.length >= 10, `Old Groddle Forest: ${hub28Dead.length} link-only streets`);
    assert.ok(!dead.includes(HECHEY));
    assert.ok(!isDeadEndTsid('RH_HOME_EXT', ur), 'a home is never one');
    assert.ok(!isDeadEndTsid('QI_MENTAL_BLOCK_MAIN', ur), 'a scene is never one');
    assert.ok(!isDeadEndTsid(EZ, null), 'unknown until the graph is in');
  });
});

describe('the exit over every street in the index (features/dead-ends-feature.js)', () => {
  const ur = urReach(graph, ROADS);
  beforeEach(() => de._reset());

  it('each dead end shows it when nothing is active, and none when something is; no Ur street ever does', () => {
    let shown = 0;
    for (const tsid of Object.keys(index.streets)) {
      const dead = isDeadEndTsid(tsid, ur);
      const engine = fakeEngine({ tsid });
      de._reset();
      de._setGraph(graph, engine);
      arrive(engine);
      const exit = exitOf(engine);
      if (!dead) {
        assert.equal(exit, null, `${tsid} reaches Ur: no exit`);
        assert.equal(engine.log.data.deadEnd, '', tsid);
        continue;
      }
      assert.ok(exit, `${tsid}: the exit when nothing runs`);
      assert.equal(engine.log.data.deadEnd, 'exit', tsid);
      shown += 1;
      // Something starts (a quest room's run, the tutorial...): the exit goes at the next check.
      engine.run = 'quest-room';
      tick(engine);
      assert.equal(exitOf(engine), null, `${tsid}: none while active`);
      assert.equal(engine.log.data.deadEnd, 'active:quest-room', tsid);
      // It ends: the exit is back.
      engine.run = null;
      tick(engine);
      assert.ok(exitOf(engine), `${tsid}: back once it ends`);
      // An active check from the start: never shown.
      const busy = fakeEngine({ tsid, run: 'tutorial' });
      de._reset();
      de._setGraph(graph, busy);
      arrive(busy);
      assert.equal(exitOf(busy), null, `${tsid}: none while the tutorial runs`);
    }
    assert.ok(shown > 80, `${shown} dead ends`);
  });

  it('a held instance or scene counts as active; homes and scenes never show it', () => {
    const held = fakeEngine({ tsid: EZ });
    held.transientInstance = () => true;
    assert.equal(deadEndActive(held), 'instance');
    de._setGraph(graph, held);
    arrive(held);
    assert.equal(exitOf(held), null);
    const home = fakeEngine({ tsid: EZ });
    home.homeContext = () => ({ inHome: true });
    de._reset();
    de._setGraph(graph, home);
    arrive(home);
    assert.equal(exitOf(home), null);
  });

  it('before the signpost graph arrives nothing shows (it does once it is in)', () => {
    const engine = fakeEngine({ tsid: MARKET_ST });
    arrive(engine);
    assert.equal(exitOf(engine), null);
    assert.equal(engine.log.data.deadEnd, 'loading');
    de._setGraph(graph, engine);
    tick(engine);
    assert.ok(exitOf(engine));
  });

  it('reads as a door: label Exit, verb Enter, the way out named', () => {
    const engine = fakeEngine({ tsid: MARKET_ST });
    de._setGraph(graph, engine);
    arrive(engine);
    const exit = exitOf(engine);
    assert.equal(exit.label, 'Exit');
    assert.equal(exit.subtitle, 'The way out, back to Hechey Track');
    const [verb] = de.verbsFor(exit, engine);
    assert.equal(verb.label, 'Enter');
    assert.equal(verb.tooltip, 'Back to Hechey Track');
    assert.equal(DEAD_END_TEXT.tip(''), 'Back to a street with roads to Ur');
    assert.equal(DEAD_END_EXIT.sprite, 'sign_arrow_1');
  });
});

describe('where it stands (js/dead-ends.js deadEndExitSpot)', () => {
  const floor = [{ x1: 0, y1: 900, x2: 3000, y2: 900 }];

  it('near where you arrived, toward the nearer street end, on the floor', () => {
    assert.deepEqual(deadEndExitSpot({ platforms: floor, arrival: { x: 400, y: 880 }, width: 3000 }), { x: 230, y: 900, side: -1 });
    assert.deepEqual(deadEndExitSpot({ platforms: floor, arrival: { x: 2700, y: 880 }, width: 3000 }), { x: 2870, y: 900, side: 1 });
  });

  it('too near the end: the other side; no floor there: further on, else right where you arrived', () => {
    assert.deepEqual(deadEndExitSpot({ platforms: floor, arrival: { x: 120, y: 900 }, width: 3000 }), { x: 290, y: 900, side: 1 });
    const ledge = [{ x1: 900, y1: 600, x2: 1100, y2: 600 }];
    assert.deepEqual(deadEndExitSpot({ platforms: ledge, arrival: { x: 1000, y: 600 }, width: 3000 }), { x: 1000, y: 600, side: -1 });
  });

  it('with no arrival, the left end; a ceiling or a soft line is no floor', () => {
    assert.deepEqual(deadEndExitSpot({ platforms: floor, width: 3000 }), { x: 120, y: 900, side: -1 });
    assert.equal(floorAt([{ x1: 0, y1: 800, x2: 100, y2: 800, pcPerm: 1 }], 50, 800), null);
    assert.equal(floorAt([{ x1: 0, y1: 800, x2: 100, y2: 800, pcPerm: 0 }], 50, 800), null);
    assert.equal(floorAt([{ x1: 0, y1: 800, x2: 100, y2: 800, pcPerm: -1 }], 50, 800), 800);
  });
});

describe('going through it', () => {
  beforeEach(() => de._reset());

  it('it is a door: walking into it or standing on it does nothing (no exit by accident while exploring)', async () => {
    const engine = fakeEngine({ tsid: MARKET_ST, player: { x: 400, y: 900 } });
    de._setGraph(graph, engine);
    arrive(engine);
    const spot = de._state().exit.spot;
    assert.equal(spot.x, 230);
    for (const x of [400, 300, spot.x, spot.x - 20, spot.x]) {
      engine.player.x = x;
      engine.player.y = spot.y;
      tick(engine, 16);
    }
    tick(engine, 5000);
    await flush();
    assert.deepEqual(engine.log.entered, []);
    assert.ok(exitOf(engine), 'still standing there');
  });

  it('its Enter verb (Enter, E, Act or a click) takes you to the last ordinary street (safeWayOut)', async () => {
    const engine = fakeEngine({ tsid: MARKET_ST, player: { x: 400, y: 900 } });
    de._setGraph(graph, engine);
    arrive(engine);
    const exit = exitOf(engine);
    assert.deepEqual(de.verbsFor(exit, engine).map((v) => v.id), ['enter']);
    assert.equal(de.runVerb(exit, 'enter', engine), true);
    await flush();
    assert.equal(engine.log.entered.length, 1);
    assert.deepEqual(engine.log.entered[0][0], HECHEY);
    assert.equal(engine.log.entered[0][1].spawnX, 410);
    assert.equal(engine.log.data.deadEndLast, `left:${HECHEY}`);
  });

  it('a street owner with its own way out (questRoomLeave) is asked first', async () => {
    const engine = fakeEngine({ tsid: ORANGIAN });
    const base = engine.query;
    let owned = 0;
    engine.query = (hook, ...args) => (hook === 'questRoomLeave' ? (owned += 1, engine.enter('GA54VETILKR26N1', {}).then(() => true)) : base(hook, ...args));
    de._setGraph(graph, engine);
    arrive(engine);
    assert.equal(de.runVerb(exitOf(engine), 'enter', engine), true);
    await flush();
    assert.equal(owned, 1);
    assert.equal(engine.log.entered[0][0], 'GA54VETILKR26N1');
  });

  it('waits for you to land: it stands where you came down, not where you spawned in the air', () => {
    const engine = fakeEngine({ tsid: MARKET_ST, player: { x: 400, y: 300 } });
    engine.player.onGround = false;
    de._setGraph(graph, engine);
    arrive(engine);
    assert.equal(exitOf(engine), null);
    assert.equal(engine.log.data.deadEnd, 'exit');
    Object.assign(engine.player, { x: 600, y: 900, onGround: true });
    tick(engine);
    assert.equal(de._state().exit.spot.x, 430);
  });

  it('the practice streets keep their own walk-in EXIT box (Glitch\'s teleporter, quest-instances-feature tickStray)', () => {
    const src = read('public/js/features/quest-instances-feature.js');
    const fn = src.slice(src.indexOf('function tickStray('), src.indexOf('/* HUD + QA data'));
    assert.match(fn, /startsWith\('quest:flag:'\) && inBottomBox\(b, p\.x, p\.y\)\)\) leaveStray\(engine\);/);
    const de2 = read('public/js/features/dead-ends-feature.js');
    assert.ok(!/inExitBox|inBottomBox/.test(de2), 'the generic exit has no walk-in box');
  });

  it('never while something runs there', async () => {
    const engine = fakeEngine({ tsid: MARKET_ST });
    de._setGraph(graph, engine);
    arrive(engine);
    const exit = exitOf(engine);
    engine.run = 'quest-room';
    de.runVerb(exit, 'enter', engine);
    await flush();
    assert.deepEqual(engine.log.entered, []);
  });
});

describe('each owner answers its own check (deadEndRun)', () => {
  it('quest rooms: a run or one starting', () => {
    qi.restore({});
    assert.equal(qi.deadEndRun(), null);
    const src = read('public/js/features/quest-instances-feature.js');
    const fn = src.slice(src.indexOf('  deadEndRun() {'), src.indexOf('  holdQuestOffers() {'));
    assert.match(fn, /if \(run \|\| entering \|\| save\.away\) return 'quest-room';/);
  });

  it('colour levels: taken from the Map card and not solved yet; by a link or a reload, nothing runs', () => {
    pz.restore({});
    const engine = fakeEngine({ tsid: ORANGIAN });
    assert.equal(pz.deadEndRun(engine), null);
    const src = read('public/js/features/puzzles-feature.js');
    assert.match(src, /cardTrip = key\(tsid\);\n  engine\.closeMap\?\.\(\);/);
    assert.match(src, /run\.viaCard = viaCard;/);
    const fn = src.slice(src.indexOf('  deadEndRun(engine) {'), src.indexOf('  questRoomHere(engine) {'));
    assert.match(fn, /if \(!run\?\.viaCard \|\| run\.complete/);
    assert.match(fn, /COLOUR_LEVEL_STREETS\.includes\(run\.tsid\)/);
  });

  it('the tutorial, the dead, the subway car and the Interrogation room', () => {
    assert.equal(newxpFeature.deadEndRun(fakeEngine({ tsid: 'GA952QGCH3D31E2' })), null, 'no tutorial running here');
    assert.equal(hellFeature.deadEndRun(), null, 'alive');
    // G1139: a ride owns the car's way off; a car with no ride (stranded) shows the exit.
    assert.equal(subwayFeature.deadEndRun(fakeEngine({ tsid: SUBWAY_CAR })), null, 'no ride');
    subwayFeature._test.setRide({ stop: 1, phase: 'moving' });
    assert.equal(subwayFeature.deadEndRun(fakeEngine({ tsid: SUBWAY_CAR })), 'subway', 'riding');
    subwayFeature._test.setRide(null);
    assert.equal(subwayFeature.deadEndRun(fakeEngine({ tsid: HECHEY })), null);
    assert.equal(interrogationRoomFeature.deadEndRun(fakeEngine({ tsid: INTERROGATION })), 'interrogation');
    assert.equal(interrogationRoomFeature.deadEndRun(fakeEngine({ tsid: HECHEY })), null);
    const hell = read('public/js/features/hell-feature.js');
    assert.match(hell, /deadEndRun\(\) \{\n    return state\.isDead \? 'dead' : null;/);
    const nx = read('public/js/features/newxp-feature.js');
    const fn = nx.slice(nx.indexOf('  deadEndRun(engine) {'), nx.indexOf('  reloadLocation(saved, engine) {'));
    assert.match(fn, /practiceStreetHeld\(\)\) return 'tutorial';/);
    assert.match(fn, /active\(\) && GENTLE_ISLAND_TSIDS/);
  });

  it('registered with the feature host after the owners that answer questRoomLeave', () => {
    const src = read('public/js/features/index.js');
    const at = (name) => src.indexOf(`FEATURES.push(${name})`) >= 0 ? src.indexOf(`FEATURES.push(${name})`) : src.indexOf(`  ${name},`);
    assert.ok(at('deadEndsFeature') > at('questInstancesFeature'));
    assert.ok(at('deadEndsFeature') > at('puzzlesFeature'));
    assert.match(read('public/game.js'), /collect: \(hook, \.\.\.args\) => features\.collect\(hook, \.\.\.args\),/);
  });

  it('the way out falls back to the default street', () => {
    assert.equal(STRAY_FALLBACK_TSID, HECHEY);
  });
});
