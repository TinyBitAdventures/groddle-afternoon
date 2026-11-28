/**
 * Show the way refuses a locked door you hold no key for (Austin 2026-11-25, root R11). Found while
 * testing lane wayk: a player with no Your Papers and no key was routed to Xalanga through Level 2
 * West's Yellow-Teal Square Key door (Key 7), because a route took a locked door whenever nothing
 * else reached the street. Glitch's door refuses anyone without the key ("You need the correct key
 * to unlock this door.", locations/inc_locked_doors.js 49) and its gate anyone without Your Papers
 * (subway_gate.js), so a route through either is one the player cannot walk. Now the street graph
 * holds the traveller's keys (roadsFor reads the pack, doors.js doorKeysHeld) beside its closures,
 * every route goes through a locked door only with its key, and when nothing open is left the Map
 * says what is needed (map-routes.js routeNeeds).
 * Run: node --test tests/route-locked-doors.test.js
 */
import { describe, it, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROUTE_TEXT, isRide, regionWayIn, routeNeeds, subwayRides } from '../public/js/map-routes.js?v=52140ba2';
import { _useStreetGraph, findRoute, keysNow, lockedOnTheWay, reachableStreets, roadsFor, streetGraph } from '../public/js/street-graph.js?v=d767f3a2';
import { DOOR_KEYS, DOOR_TEXT, doorKeysHeld } from '../public/js/doors.js?v=f815e7c8';
import { SUBWAY_STREETS, closedStreets, normalizeStreetJobState } from '../public/js/street-jobs.js?v=76471e42';
import { PAPERS_BADGE } from '../public/js/subway.js?v=ea6921ff';
import { mapRoutesFeature } from '../public/js/features/map-routes-feature.js?v=c7a6b235';
import { createFeatureHost } from '../public/js/feature-host.js?v=b87e2cbc';
import { applyStreetIndex } from '../public/js/street-loader.js?v=10376267';

const root = join(import.meta.dirname, '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const json = (p) => JSON.parse(read(p));
const INDEX = json('public/assets/streets/index.json');
const GRAPH = json('public/assets/content/signpost-graph.json');
const CATALOG = json('public/assets/content/street-jobs.json');

const byLabel = (name, hub) => Object.keys(INDEX.streets).find((t) => INDEX.streets[t].label === name && (!hub || String(INDEX.streets[t].hubId) === hub));
const hubOf = (t) => String(INDEX.streets[String(t).replace(/^L/, 'G')]?.hubId || '');
const label = (t) => INDEX.streets[String(t).replace(/^L/, 'G')]?.label || t;
const streetsOf = (hubId) => Object.keys(INDEX.streets).filter((t) => hubOf(t) === hubId);
const freshClosed = () => closedStreets(normalizeStreetJobState({ initialized: true }), CATALOG, {});
const RIDES = subwayRides(SUBWAY_STREETS);
const XALANGA = '95';
const HAZY_GATE_3 = byLabel('Hazy Gate 3', XALANGA);
const LEVEL_2_WEST = byLabel('Level 2 West');
const OPPIDAN = byLabel('Oppidan Avenue');
const KEY7_DOOR = Object.entries(GRAPH.doorKeys).find(([edge, id]) => id === 7 && edge.startsWith(`${LEVEL_2_WEST}>`))?.[0];
const crosses = (path, edge) => path.some((t, i) => i > 0 && `${path[i - 1]}>${t}` === edge);

describe('the data this rests on', () => {
  it("Level 2 West's door to Oppidan Avenue is locked with Key 7, the Yellow-Teal Square Key", () => {
    assert.equal(KEY7_DOOR, `${LEVEL_2_WEST}>${OPPIDAN}`);
    assert.equal(DOOR_KEYS[7].label, 'Yellow-Teal Square Key');
    assert.equal(DOOR_TEXT.needKey, 'You need the correct key to unlock this door.');
  });

  it('doorKeysHeld reads door_key_N from the pack', () => {
    assert.deepEqual(doorKeysHeld({ door_key_7: 1, door_key_3: 0, apple: 4 }), [7]);
    assert.deepEqual(doorKeysHeld(null), []);
  });
});

describe('the street graph holds the keys (js/street-graph.js)', () => {
  const TOY = { GA: ['GB'], GB: [] };
  const locked = { 'GA>GB': 7 };

  it('no key, no way through; its key opens it; keys may be read when a walk starts', () => {
    assert.equal(findRoute(streetGraph(TOY, { locked }), 'GA', 'GB'), null);
    assert.deepEqual(findRoute(streetGraph(TOY, { locked, keys: [7] }), 'GA', 'GB'), ['GA', 'GB']);
    let pack = [];
    const g = streetGraph(TOY, { locked, keys: () => pack });
    assert.equal(findRoute(g, 'GA', 'GB'), null);
    pack = [7];
    assert.deepEqual(findRoute(g, 'GA', 'GB'), ['GA', 'GB']);
    assert.deepEqual([...keysNow(g)], [7]);
  });

  it('lockedOnTheWay names the door and its key when only a key would get there', () => {
    assert.deepEqual(lockedOnTheWay(streetGraph(TOY, { locked }), 'GA', 'GB'), { path: ['GA', 'GB'], doors: [{ from: 'GA', to: 'GB', key: 7 }] });
    assert.equal(lockedOnTheWay(streetGraph(TOY, { locked, keys: [7] }), 'GA', 'GB'), null, 'held: nothing in the way');
  });

  it("roadsFor(engine) reads the engine's pack, so every walker over it (Map, quest links, smuggling) has the gate", () => {
    _useStreetGraph(GRAPH);
    try {
      const engine = { inv: {}, query: (hook) => (hook === 'closedRoads' ? freshClosed() : null) };
      const g = roadsFor(engine);
      assert.equal(findRoute(g, INDEX.default, HAZY_GATE_3), null, 'no key, no papers: no way to Xalanga');
      engine.inv.door_key_7 = 1;
      assert.ok(crosses(findRoute(g, INDEX.default, HAZY_GATE_3), KEY7_DOOR), 'Key 7 in the pack: through its door');
    } finally {
      _useStreetGraph(null);
    }
  });

  it("on foot (Warm and Smuggly's destinations, street-jobs-feature walkReach): a locked door only with its key", () => {
    const toy = { GA: ['GB'], GB: ['GC'], GC: [] };
    const locked = { 'GB>GC': 7 };
    assert.ok(!reachableStreets(streetGraph(toy, { locked }), { starts: ['GA'], keyed: 'held' }).has('GC'));
    assert.ok(reachableStreets(streetGraph(toy, { locked, keys: [7] }), { starts: ['GA'], keyed: 'held' }).has('GC'));
    assert.match(read('public/js/features/street-jobs-feature.js'), /reachableStreets\(streetGraph\(waysReady\.roads, \{ closed: closedNowHere, keys \}\), \{ starts: \[from\], keyed: 'held' \}\)/);
  });

  it('source: roadsFor builds its graph with the pack\'s keys', () => {
    assert.match(read('public/js/street-graph.js'), /streetGraph\(loaded, \{ closed: \(\) => engine\.query\?\.\('closedRoads', engine\), keys: \(\) => doorKeysHeld\(engine\.inv\) \}\)/);
  });
});

describe('routeNeeds says what is needed (js/map-routes.js)', () => {
  const graph = streetGraph(GRAPH, { closed: freshClosed });
  const refused = { rides: RIDES, text: 'GATE', gate: 'papers', hint: 'HINT' };
  const list = [HAZY_GATE_3];

  it('no papers and no key: the subway or the Key 7 door, each with what it needs', () => {
    const need = routeNeeds(graph, INDEX.default, list, {}, refused, label);
    assert.equal(need.subway, true);
    assert.deepEqual(need.doors.map((d) => d.key), [7]);
    assert.equal(need.text, 'The only ways there are the subway, whose gate needs your papers, and a locked door on Level 2 West, which needs a Yellow-Teal Square Key. HINT');
  });

  it('only the door (papers held, no ride offered there): Glitch\'s door line and the key', () => {
    const need = routeNeeds(graph, INDEX.default, list, {}, null, label);
    assert.equal(need.subway, false);
    assert.equal(need.text, 'The only way there is through a locked door on Level 2 West. You need the correct key to unlock this door: a Yellow-Teal Square Key.');
  });

  it('only the subway: the gate\'s words as before (R24)', () => {
    const held = streetGraph(GRAPH, { closed: freshClosed, keys: [] , locked: {} });
    assert.deepEqual(routeNeeds(held, INDEX.default, list, {}, refused, label), { subway: true, doors: [], text: 'GATE' });
  });

  it('nothing named when only unbuilt roads stand in the way (that is "No road there yet")', () => {
    const toy = streetGraph({ GA: ['GB'], GB: ['GC'], GC: [] }, { closed: ['GB'], locked: {} });
    assert.equal(routeNeeds(toy, 'GA', ['GC'], {}, { rides: { GA: ['GC'] }, text: 'GATE', gate: 'papers' }, label)?.subway, true, 'a ride the gate refuses is named');
    assert.equal(routeNeeds(toy, 'GA', ['GC'], {}, null, label), null);
  });

  it('regionWayIn: the way in through a locked door carries its doors', () => {
    const way = regionWayIn(graph, { from: INDEX.default, hubId: XALANGA, streets: streetsOf(XALANGA), hubOf });
    assert.equal(way.entry, HAZY_GATE_3);
    assert.deepEqual(way.doors, [{ from: LEVEL_2_WEST, to: OPPIDAN, key: 7 }]);
    assert.equal(regionWayIn(streetGraph(GRAPH, { closed: freshClosed, keys: [7] }), { from: INDEX.default, hubId: XALANGA, streets: streetsOf(XALANGA), hubOf }).doors, undefined);
  });
});

describe('Show the way to Xalanga (features/map-routes-feature.js, a fresh solo world)', () => {
  const closed = freshClosed();
  const fakeEngine = ({ papers = false, keys = [] } = {}) => {
    const data = {};
    let host = null;
    const toasts = [];
    const inv = Object.fromEntries(keys.map((k) => [`door_key_${k}`, 1]));
    const engine = {
      started: true,
      pc: { level: 5 },
      inv,
      unlockedAchievements: papers ? [PAPERS_BADGE] : [],
      streetTsid: INDEX.default,
      street: { tsid: INDEX.default, hubId: hubOf(INDEX.default), signposts: [] },
      player: { x: 0, y: 0 },
      data,
      toasts,
      toast: (t) => toasts.push(t),
      setData: (k, v) => { data[k] = v; },
      homeContext: () => ({ inHome: false }),
      transientInstance: () => false,
      save() {},
      query: (hook, ...args) => (hook === 'closedRoads' ? closed : host.query(hook, ...args)),
    };
    host = createFeatureHost([mapRoutesFeature]);
    return engine;
  };
  const show = (engine) => engine.query('mapRoute', 'set', { to: HAZY_GATE_3, source: 'player' }, engine);
  before(() => applyStreetIndex(INDEX));
  beforeEach(() => {
    mapRoutesFeature._reset();
    mapRoutesFeature._setGraph(GRAPH);
  });

  it('no Papers, no key: the route refuses and names what is needed (not the Key 7 door)', () => {
    const engine = fakeEngine();
    const res = show(engine);
    assert.equal(res.ok, false);
    assert.equal(res.gated, true);
    assert.equal(res.subway, true);
    assert.match(res.error, /^The only ways there are the subway, whose gate needs your papers, and a locked door on Level 2 West, which needs a Yellow-Teal Square Key\./);
    assert.ok(!engine.query('mapRoute', 'get', null, engine), 'no route set');
    // The Map card still names the way in (the subway's), and says Show the way tells what it needs.
    const way = engine.query('mapRoute', 'wayIn', { hubId: XALANGA }, engine);
    assert.equal(way.entry, HAZY_GATE_3);
    assert.equal(way.gated, true);
    assert.ok(!crosses(way.path, KEY7_DOOR));
    assert.equal(ROUTE_TEXT.wayInGated, 'Show the way says what you need for it.');
  });

  it('with Your Papers: the subway route', () => {
    const engine = fakeEngine({ papers: true });
    const res = show(engine);
    assert.equal(res.ok, true, res.error);
    const path = res.route.path;
    assert.ok(path.some((t, i) => i > 0 && isRide(GRAPH, RIDES, path[i - 1], t)), 'it rides the subway');
    assert.ok(!crosses(path, KEY7_DOOR), 'not through the Key 7 door');
    assert.ok(!engine.query('mapRoute', 'wayIn', { hubId: XALANGA }, engine)?.gated);
  });

  it('with Key 7 only: the door route', () => {
    const engine = fakeEngine({ keys: [7] });
    const res = show(engine);
    assert.equal(res.ok, true, res.error);
    assert.ok(crosses(res.route.path, KEY7_DOOR), 'through Level 2 West\'s Key 7 door');
    assert.equal(res.route.path[res.route.path.length - 1], HAZY_GATE_3);
  });

  it('with another key only: still refused', () => {
    const res = show(fakeEngine({ keys: [1, 2] }));
    assert.equal(res.ok, false);
    assert.match(res.error, /Yellow-Teal Square Key/);
  });

  it('the Map\'s toasts wait longer for a refusal that names what is needed', () => {
    const src = read('public/js/features/map-routes-feature.js');
    assert.equal((src.match(/engine\.toast\?\.\(res\.error, res\.gated \? 6000 : 2600\)/g) || []).length, 3);
  });
});
