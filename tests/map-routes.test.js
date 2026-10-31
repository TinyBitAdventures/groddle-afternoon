/**
 * Map routes (register row G177): js/map-routes.js, features/map-routes-feature.js
 * and the quests that set a route (Beelzebooze, Warm and Smuggly, We're Off to
 * See the Lizard).
 */
import { describe, it, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ROUTE_COLOR,
  ROUTE_SOURCES,
  ROUTE_TARGETS,
  ROUTE_TEXT,
  clearRoute,
  createRouteState,
  croakRoute,
  enterStreet,
  findRoute,
  gpsText,
  graphKey,
  hubRouteDrawing,
  normalizeRouteState,
  planRoute,
  resurrectRoute,
  routeStep,
  signpostToward,
} from '../public/js/map-routes.js?v=3e8f84ad';
import { mapRoutesFeature } from '../public/js/features/map-routes-feature.js?v=3dc567b6';
import { hellTicketsFeature } from '../public/js/features/hell-tickets-feature.js?v=51d391dc';
import { hellFeature } from '../public/js/features/hell-feature.js?v=6825f033';
import { createFeatureHost } from '../public/js/feature-host.js?v=e4f648b1';
import { applyStreetIndex } from '../public/js/street-loader.js?v=d4113627';
import { loadContentCatalogsFromDir, resetContentCatalogs } from '../public/js/content-catalogs.js?v=10b118dd';
import { createQuestState } from '../public/js/quests.js?v=282e1621';
import { HELL_QUESTS, createHellState, croak } from '../public/js/hell.js?v=454c9f42';
import { SUBWAY_STREETS } from '../public/js/quest-rooms/back-alley.js?v=7aefccae';
import { doorRooms, doorToward, routeGraph } from '../public/js/map-routes.js?v=3e8f84ad';
import { afterStreetCard, runStreetTransition, streetCardUp } from '../public/js/screen-fx.js?v=82ce3680';
import { EMITTED_EVENTS } from '../public/js/quest-offers.js?v=6b6cbf22';
import { smugglingFeature } from '../public/js/features/smuggling-feature.js?v=22345862';
import { addItem } from '../public/js/inventory.js?v=85d4faba';
import { resurrect } from '../public/js/hell.js?v=454c9f42';

const spike = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = join(spike, 'public');
const gsjs = join(spike, '../glitch-GameServerJS');
const client = join(spike, '../glitch-client/com/tinyspeck/engine');
const read = (p) => readFileSync(p, 'utf8');
const GRAPH = JSON.parse(read(join(PUBLIC, 'assets/content/signpost-graph.json'))).streets;
const INDEX = JSON.parse(read(join(PUBLIC, 'assets/streets/index.json')));

const MAHATAM = 'GA5PV4T79OE2AOA';
const DHUMA = 'GA5REO5I9OE2KLS';
const VALUKA = 'GA5S44RM9OE2416';
const PANKA = 'GA5RPAFK9OE28GN';
const HELL_ONE = 'GA5PPFP86NF2FOS';
const HECHEY = 'GLI2V0UN7RD1T2J';
const NARAKA_ROUTE = [MAHATAM, DHUMA, 'GA5Q57C99OE2GNU', 'GA524M0OMOE2OGT', VALUKA, PANKA];

// A toy graph (TSID-like keys, compared without their L/G prefix): A - B - C - D, B - E - D, F alone.
const TOY = { GA: ['GB'], GB: ['GA', 'GC', 'GE'], GC: ['GB', 'GD'], GD: ['GC', 'GE'], GE: ['GB', 'GD'], GF: [] };

describe('the source (GSJS and the client)', { skip: !existsSync(gsjs) && 'no GSJS checkout' }, () => {
  it('Beelzebooze builds a path to Panka Surazu as it hands over the ticket', () => {
    const quest = read(join(gsjs, 'quests/hell_quest.js'));
    assert.match(quest, /pc\.buildPath\('LA5RPAFK9OE28GN', pc\.location\.tsid\)/);
    assert.match(quest, /your map has been updated with the route to the Hell Bar/);
    assert.equal(ROUTE_TARGETS.hellBar, 'LA5RPAFK9OE28GN');
    assert.equal(HELL_QUESTS.hell_quest.pathTo, ROUTE_TARGETS.hellBar);
  });

  it('the server texts are verbatim', () => {
    const player = read(join(gsjs, 'players/player.js'));
    for (const t of [ROUTE_TEXT.alreadyThere, ROUTE_TEXT.fromHome, ROUTE_TEXT.notFound]) assert.ok(player.includes(t), t);
    assert.ok(read(join(gsjs, 'items/contraband.js')).includes(ROUTE_TEXT.contrabandOffPath));
    assert.ok(read(join(gsjs, 'items/npc_bureaucrat.js')).includes(ROUTE_TEXT.bureaucratHall));
    assert.match(read(join(gsjs, 'items/npc_bureaucrat.js')), /\['LLI32G3NUTD100I', 'LA91JUQT2G82GUL', 'LA5I10NJDL52TKD'\]/);
    // croak keeps the route, resurrect restores it or clears it.
    assert.match(player, /if \(this\.map_path\) this\.previous_map_path = this\.map_path;/);
    assert.match(player, /shouldn't persist after they leave/);
    // Reaching the destination counts map_dest_reached.
    assert.match(read(join(gsjs, 'locations/location.js')), /quests_inc_counter\('map_dest_reached',1\)/);
  });

  it('every GSJS caller that sends a route is in ROUTE_SOURCES', () => {
    const files = ['quests/hell_quest.js', 'players/inc_announcements.js', 'items/contraband.js', 'items/npc_bureaucrat.js', 'players/inc_world_events.js'];
    for (const f of files) assert.match(read(join(gsjs, f)), /get_path_to_location/, f);
    const ids = ROUTE_SOURCES.map((r) => r.id);
    for (const id of ['hell_quest', 'smuggling_basic', 'fuelmaking_refuel_robot', 'card_carrying_qualification', 'loneliness', 'player']) assert.ok(ids.includes(id), id);
    for (const row of ROUTE_SOURCES.filter((r) => r.playable && r.wired)) {
      const file = row.wired.split(' ')[0];
      assert.match(read(join(PUBLIC, file)), /mapRoute/, `${row.id} wired in ${file}`);
    }
    for (const row of ROUTE_SOURCES.filter((r) => !r.playable)) assert.ok(row.why, `${row.id} says why it is not wired`);
  });

  it('the GPS copy and the path colour come from the client', { skip: !existsSync(client) && 'no client checkout' }, () => {
    const gps = read(join(client, 'view/ui/map/GpsUI.as'));
    assert.ok(gps.includes(ROUTE_TEXT.arrived));
    assert.ok(gps.includes("'To: '") || gps.includes('>To: <'));
    assert.ok(gps.includes("'Next: '"));
    assert.match(gps, /'Return to world'[\s\S]*' for directions'/);
    assert.match(read(join(client, 'view/gameoverlay/maps/MapHub.as')), /'hub_map_path_color', 'color', 0xf0f258/);
    assert.equal(ROUTE_COLOR, 0xf0f258);
  });
});

describe('finding a route over signposts', () => {
  it('shortest path, already there, unreachable, unknown', () => {
    assert.deepEqual(findRoute(TOY, 'GA', 'GD'), ['GA', 'GB', 'GC', 'GD']);
    assert.deepEqual(findRoute(TOY, 'GA', 'GA'), ['GA']);
    assert.equal(findRoute(TOY, 'GA', 'GF'), null);
    assert.equal(findRoute(TOY, 'Z', 'GA'), null);
  });

  it('the closest of several destinations (apiFindShortestGlobalPath)', () => {
    assert.deepEqual(findRoute(TOY, 'GA', ['GD', 'GC']), ['GA', 'GB', 'GC']);
    assert.deepEqual(findRoute(TOY, 'GA', ['GF', 'GE']), ['GA', 'GB', 'GE']);
  });

  it('goes round a closed road when it can, through it when it must', () => {
    assert.deepEqual(findRoute(TOY, 'GA', 'GD', { blocked: ['GC'] }), ['GA', 'GB', 'GE', 'GD']);
    assert.deepEqual(findRoute(TOY, 'GA', 'GD', { blocked: ['GC', 'GE'] }), ['GA', 'GB', 'GC', 'GD']);
    assert.deepEqual(findRoute(TOY, 'GA', 'GC', { blocked: ['GC'] }), ['GA', 'GB', 'GC'], 'a closed destination is still the destination');
  });

  it('Naraka: Mahatam Audarika to Panka Surazu, the far end of Naraka', () => {
    assert.deepEqual(findRoute(GRAPH, MAHATAM, 'LA5RPAFK9OE28GN'), NARAKA_ROUTE);
    assert.equal(graphKey(GRAPH, 'LA5RPAFK9OE28GN'), PANKA, 'L and G TSIDs are one street');
    assert.equal(findRoute(GRAPH, HELL_ONE, PANKA), null, 'Hell One has no signposts: the Hell Hole is the way out');
  });

  it('every remake subway street is reachable from the starter street', () => {
    const path = findRoute(GRAPH, HECHEY, SUBWAY_STREETS.map((s) => s.street));
    assert.ok(path && path.length > 1);
    assert.ok(SUBWAY_STREETS.some((s) => s.street === path.at(-1)));
  });
});

describe('route state', () => {
  it('planRoute: buildPath errors, and a destination kept when the start is off the graph', () => {
    const s = createRouteState();
    assert.equal(planRoute(s, TOY, { from: 'GA', to: 'GD', inHome: true }).error, ROUTE_TEXT.fromHome);
    assert.equal(planRoute(s, TOY, { from: 'GA', to: 'GA' }).error, ROUTE_TEXT.alreadyThere);
    const ok = planRoute(s, TOY, { from: 'GA', to: 'GD', source: 'hell_quest', quest: 'hell_quest', now: 5 });
    assert.equal(ok.ok, true);
    assert.deepEqual(ok.route, { destination: 'GD', path: ['GA', 'GB', 'GC', 'GD'], source: 'hell_quest', quest: 'hell_quest', setAt: 5, arrivedAt: 0 });
    const off = planRoute(s, TOY, { from: '', to: 'GD' });
    assert.equal(off.ok, true);
    assert.equal(off.route.path, null);
    assert.equal(off.route.destination, 'GD');
    const many = planRoute(s, TOY, { from: 'GA', to: ['GF', 'GE'] });
    assert.equal(many.route.destination, 'GE', 'the closest one wins');
  });

  it('routeStep: on the path, at the destination, linked from off the path, lost', () => {
    const route = { destination: 'GD', path: ['GA', 'GB', 'GC', 'GD'] };
    assert.deepEqual(routeStep(route, TOY, 'GB'), { status: 'on', index: 1, next: 'GC', remaining: ['GB', 'GC', 'GD'] });
    assert.equal(routeStep(route, TOY, 'GD').status, 'arrived');
    // E is off the path, but its signpost leads to D (walked from the end).
    assert.deepEqual(routeStep(route, TOY, 'GE'), { status: 'on', index: -1, next: 'GD', remaining: ['GE', 'GD'] });
    assert.equal(routeStep(route, TOY, 'GF').status, 'off');
    assert.equal(routeStep(null, TOY, 'GA').status, 'none');
  });

  it('enterStreet: arriving counts once, leaving the destination clears, off the path asks again', () => {
    let s = planRoute(createRouteState(), TOY, { from: 'GA', to: 'GC' }).state;
    let r = enterStreet(s, TOY, 'GB');
    assert.deepEqual(r.events, []);
    r = enterStreet(r.state, TOY, 'GC', { now: 9 });
    assert.deepEqual(r.events, ['arrived']);
    assert.equal(r.state.reached, 1);
    assert.equal(r.state.route.arrivedAt, 9);
    r = enterStreet(r.state, TOY, 'GC');
    assert.deepEqual(r.events, [], 'once');
    r = enterStreet(r.state, TOY, 'GD');
    assert.deepEqual(r.events, ['cleared']);
    assert.equal(r.state.route, null);
    assert.equal(r.state.lastCleared, 'left-destination');
    // Off the path on a street the graph knows: a new route from here.
    const graph = { ...TOY, GG: ['GA'], GA: ['GB', 'GG'] };
    s = planRoute(createRouteState(), graph, { from: 'GB', to: 'GD' }).state;
    r = enterStreet(s, graph, 'GG');
    assert.deepEqual(r.events, ['rerouted']);
    assert.deepEqual(r.state.route.path, ['GG', 'GA', 'GB', 'GC', 'GD']);
    // Somewhere the graph does not know (a home, an instance): the route waits.
    r = enterStreet(s, graph, 'GG', { offWorld: true });
    assert.deepEqual(r.events, []);
  });

  it('croak keeps the route; resurrecting puts it back and forgets what Naraka set', () => {
    let s = planRoute(createRouteState(), TOY, { from: 'GA', to: 'GD', source: 'player' }).state;
    s = croakRoute(s);
    assert.equal(s.previous.destination, 'GD');
    s = planRoute(s, GRAPH, { from: MAHATAM, to: PANKA, source: 'hell_quest', quest: 'hell_quest' }).state;
    assert.equal(s.route.destination, PANKA);
    s = resurrectRoute(s);
    assert.equal(s.route.destination, 'GD');
    assert.equal(s.previous, null);
    // No route before the croak: the hell route goes with you out of Naraka.
    let t = croakRoute(createRouteState());
    t = planRoute(t, GRAPH, { from: MAHATAM, to: PANKA }).state;
    t = resurrectRoute(t);
    assert.equal(t.route, null);
    assert.equal(t.lastCleared, 'resurrected');
  });

  it('clearRoute by owner, and the saved slice', () => {
    const s = planRoute(createRouteState(), TOY, { from: 'GA', to: 'GD', source: 'smuggling' }).state;
    assert.equal(clearRoute(s, { source: 'hell_quest' }).cleared, false);
    const c = clearRoute(s, { source: 'smuggling', reason: 'dropped' });
    assert.equal(c.cleared, true);
    assert.equal(c.state.lastCleared, 'dropped');
    assert.deepEqual(normalizeRouteState({ route: { path: ['GA'] }, reached: -3.2 }), { route: null, previous: null, reached: 0, lastCleared: '' });
    assert.deepEqual(normalizeRouteState(JSON.parse(JSON.stringify(s))), s);
  });

  it('the GPS lines', () => {
    const route = { destination: 'GD', path: ['GA', 'GB', 'GC', 'GD'] };
    const label = (t) => ({ GC: 'Cee', GD: 'Dee' })[t] || t;
    assert.deepEqual(gpsText(route, routeStep(route, TOY, 'GB'), label), { to: 'To: Dee', next: 'Next: Cee', arrived: false });
    assert.deepEqual(gpsText(route, routeStep(route, TOY, 'GD'), label), { to: 'You Have Arrived!', next: '', arrived: true });
    assert.deepEqual(gpsText(route, routeStep(route, TOY, 'GF'), label), { to: 'To: Dee', next: 'Return to world for directions', arrived: false, offPath: true });
    assert.equal(gpsText(null, null), null);
  });
});

describe('the street and the Map', () => {
  it('the signpost board that leads on', () => {
    const signs = [
      { connects: [{ tsid: 'LX1', label: 'One' }, { tsid: 'LX2', label: 'Two' }] },
      { hidden: true, connects: [{ tsid: 'LX3' }] },
      { connects: [{ tsid: 'LX4', label: 'Four' }] },
    ];
    assert.deepEqual(signpostToward(signs, 'GX2'), { sign: 0, board: 1 });
    assert.deepEqual(signpostToward(signs, 'GX4'), { sign: 2, board: 0 });
    assert.equal(signpostToward(signs, 'GX3'), null, 'hidden signposts are not drawn');
    assert.equal(signpostToward(signs, ''), null);
  });

  it('every Naraka hop has a drawn board toward the next street', () => {
    for (let i = 0; i < NARAKA_ROUTE.length - 1; i++) {
      const street = JSON.parse(read(join(PUBLIC, INDEX.streets[NARAKA_ROUTE[i]].file)));
      assert.ok(signpostToward(street.signposts, NARAKA_ROUTE[i + 1]), `${NARAKA_ROUTE[i]} -> ${NARAKA_ROUTE[i + 1]}`);
    }
  });

  it('hub drawing: the remaining streets joined end to end, the pin, the exit', () => {
    const segs = [
      { key: 'GA', x1: 0, y1: 0, x2: 10, y2: 0 },
      { key: 'GB', x1: 12, y1: 0, x2: 20, y2: 10 },
      { key: 'GC', x1: 50, y1: 50, x2: 60, y2: 50 },
    ];
    const hubOf = (t) => (t === 'GX' ? '58' : '56');
    const d = hubRouteDrawing(['GA', 'GB', 'GX'], segs, hubOf, '56');
    assert.equal(d.lines.length, 2);
    assert.deepEqual(d.joins, [{ x1: 10, y1: 0, x2: 12, y2: 0 }]);
    assert.equal(d.exitHub, '58');
    assert.equal(d.pin, null, 'the destination is in another hub');
    const here = hubRouteDrawing(['LA', 'GB'], segs, hubOf, '56');
    assert.deepEqual(here.pin, { x: 16, y: 5 });
    assert.equal(here.exitHub, '');
  });

  it('the Naraka hub map holds the whole Beelzebooze route', () => {
    const hub = JSON.parse(read(join(PUBLIC, 'assets/maps/hubs/hub-40.json')));
    const segs = hub.streets.map((s) => ({ key: s.tsid, x1: s.x1, y1: s.y1, x2: s.x2, y2: s.y2 }));
    const d = hubRouteDrawing(NARAKA_ROUTE, segs, () => '40', '40');
    assert.equal(d.lines.length, 6);
    assert.equal(d.joins.length + (d.lines.length - 1 - d.joins.length), 5);
    assert.ok(d.pin);
  });
});

/* ------------------------------------------------------------------ feature */

function fakeEngine(params = {}) {
  const data = {};
  const log = { prompts: [], toasts: [], activity: [], achievements: [], entered: [] };
  let host = null;
  const engine = {
    started: true,
    pc: { level: 5, xp: 1000, currants: 100, energy: 50, energyMax: 100, mood: 50, moodMax: 100 },
    inv: {},
    questState: createQuestState(),
    learnedSkills: [],
    streetTsid: MAHATAM,
    street: { tsid: MAHATAM, hubId: '40', label: 'Mahatam Audarika', bounds: { l: 0, t: 0 }, signposts: [] },
    player: { x: 300, y: 500, vx: 0, vy: 0 },
    signViews: [],
    interactables: [],
    log,
    data,
    param: (k) => (k in params ? String(params[k]) : null),
    setData: (k, v) => { data[k] = v; },
    busy: () => false,
    questDialogueOpen: () => false,
    playSound() {},
    save() {},
    updateHud() {},
    refreshPack() {},
    homeContext: () => ({ inHome: false }),
    transientInstance: () => false,
    toast: (t) => log.toasts.push(t),
    pushActivity: (t) => log.activity.push(t),
    prompt: (p) => log.prompts.push(p),
    achievement: (c, n = 1) => log.achievements.push([c, n]),
    query: (hook, ...args) => host.query(hook, ...args),
    enter(tsid) {
      log.entered.push(tsid);
      engine.streetTsid = tsid;
      host.streetEnter({ tsid }, engine);
      return Promise.resolve();
    },
  };
  host = createFeatureHost([mapRoutesFeature, hellTicketsFeature]);
  return engine;
}

describe('the feature', () => {
  before(async () => {
    resetContentCatalogs();
    await loadContentCatalogsFromDir(join(PUBLIC, 'assets/content'));
    applyStreetIndex(INDEX);
    mapRoutesFeature._setGraph(GRAPH);
  });
  beforeEach(() => {
    mapRoutesFeature._reset();
    mapRoutesFeature._setGraph(GRAPH);
    hellTicketsFeature._reset();
    hellTicketsFeature.restore({});
    hellFeature.restore({});
  });

  it('is registered in features/index.js under its cache key', () => {
    const index = read(join(PUBLIC, 'js/features/index.js'));
    assert.match(index, /map-routes-feature\.js\?v=[0-9a-f]{8}'; FEATURES\.push\(mapRoutesFeature\);$/m);
  });

  it('Beelzebooze accepted: the ticket, the prompt and the route to Panka Surazu', () => {
    const engine = fakeEngine();
    engine.questState.active.hell_quest = { progress: {} };
    hellTicketsFeature.onStreetEnter(engine.street, engine);
    hellTicketsFeature.onTick(16, Date.now() + 5000, engine);
    assert.equal(engine.inv.drink_ticket?.count ?? engine.inv.drink_ticket, 1);
    const route = mapRoutesFeature.mapRoute('get', null, engine);
    assert.equal(route.destination, PANKA);
    assert.deepEqual(route.path, NARAKA_ROUTE);
    assert.equal(route.quest, 'hell_quest');
    mapRoutesFeature.onStreetEnter(engine.street, engine);
    assert.equal(engine.data.routeTo, 'Panka Surazu');
    assert.equal(engine.data.routeNext, 'Dhuma Maya');
    assert.equal(engine.data.routeStatus, 'on');
  });

  it('walking it: arrival counts map_dest_reached, the next street clears it', async () => {
    const engine = fakeEngine();
    mapRoutesFeature.mapRoute('set', { to: PANKA, source: 'hell_quest' }, engine);
    for (const tsid of NARAKA_ROUTE.slice(1)) await engine.enter(tsid);
    assert.equal(engine.data.routeStatus, 'arrived');
    assert.deepEqual(engine.log.achievements, [['map_destination_reached', 1]]);
    await engine.enter(VALUKA);
    assert.equal(mapRoutesFeature.mapRoute('get', null, engine), null);
    assert.equal(engine.data.routeCleared, 'left-destination');
  });

  it("a quest's route goes when the quest leaves the log; an owner can clear its own", () => {
    const engine = fakeEngine();
    engine.questState.active.smuggling_basic = { progress: {} };
    mapRoutesFeature.mapRoute('set', { to: PANKA, source: 'smuggling', quest: 'smuggling_basic' }, engine);
    mapRoutesFeature.onTick(16, 1000, engine);
    assert.ok(mapRoutesFeature.mapRoute('get', null, engine));
    assert.equal(mapRoutesFeature.mapRoute('clear', { source: 'hell_quest' }, engine).cleared, false);
    delete engine.questState.active.smuggling_basic;
    mapRoutesFeature.onTick(16, 1016, engine);
    assert.equal(mapRoutesFeature.mapRoute('get', null, engine), null);
    assert.equal(engine.data.routeCleared, 'quest-done');
  });

  it('croak and resurrect through hell-feature', () => {
    const engine = fakeEngine();
    engine.streetTsid = HECHEY;
    mapRoutesFeature.mapRoute('set', { to: SUBWAY_STREETS[0].street, source: 'player' }, engine);
    mapRoutesFeature.onTick(16, 1, engine);
    hellFeature.restore(croak(createHellState(), { streetTsid: HECHEY, x: 1, y: 1, now: Date.now() }).state);
    mapRoutesFeature.onTick(16, 2, engine);
    engine.streetTsid = MAHATAM;
    mapRoutesFeature.mapRoute('set', { to: PANKA, source: 'hell_quest', quest: 'hell_quest' }, engine);
    assert.equal(mapRoutesFeature._state().previous.destination, SUBWAY_STREETS[0].street);
    hellFeature.restore({});
    mapRoutesFeature.onTick(16, 3, engine);
    assert.equal(mapRoutesFeature.mapRoute('get', null, engine).destination, SUBWAY_STREETS[0].street);
  });

  it('a closed road is routed round (street-jobs closedRoads)', () => {
    const engine = fakeEngine();
    engine.streetTsid = 'GA';
    mapRoutesFeature._setGraph(TOY);
    engine.query = (hook) => (hook === 'closedRoads' ? ['GC'] : null);
    const res = mapRoutesFeature.mapRoute('set', { to: 'GD' }, engine);
    assert.deepEqual(res.route.path, ['GA', 'GB', 'GE', 'GD']);
    assert.match(read(join(PUBLIC, 'js/features/street-jobs-feature.js')), /closedRoads\(\) \{\n    return catalog \? closedStreets\(state, catalog, opts\(\)\) : null;/);
  });

  it('Warm and Smuggly and the Back Alley set and clear through the host', () => {
    const smug = read(join(PUBLIC, 'js/features/smuggling-feature.js'));
    assert.equal((smug.match(/mapRoute', 'set', \{ to: state\.run\.destination, source: 'smuggling', quest: SMUGGLING_QUEST \}/g) || []).length, 2, 'the reveal and Check the address');
    assert.equal((smug.match(/mapRoute', 'clear', \{ source: 'smuggling' \}/g) || []).length, 2, 'a failed run and a delivered one');
    const alley = read(join(PUBLIC, 'js/quest-rooms/back-alley.js'));
    assert.match(alley, /mapRoute', 'set', \{ from: back, to: SUBWAY_STREETS\.map\(\(r\) => r\.street\), source: QUEST, quest: QUEST \}/);
    // From the street you came from to the closest station.
    const engine = fakeEngine();
    engine.transientInstance = () => true;
    const res = mapRoutesFeature.mapRoute('set', { from: HECHEY, to: SUBWAY_STREETS.map((r) => r.street), source: 'fuelmaking_refuel_robot' }, engine);
    assert.equal(res.ok, true);
    assert.equal(res.route.path[0], HECHEY);
    assert.ok(SUBWAY_STREETS.some((s) => s.street === res.route.destination));
    mapRoutesFeature.onStreetEnter(engine.street, engine);
    assert.equal(engine.data.routeStatus, 'off', 'still in the alley: Return to world for directions');
  });
});

/* ------------------------------------------------------------------ G192 */

const GRAPH_JSON = JSON.parse(read(join(PUBLIC, 'assets/content/signpost-graph.json')));
const HELL_BAR = 'GA5FPUNAI7P2NVF';
const VICARS = 'GCR1516SFHM122V';
const THORNFAD = 'GCR12NU45AM12BB';
const streetJson = (tsid) => JSON.parse(read(join(PUBLIC, INDEX.streets[tsid].file)));

/** Just enough Pixi for the route glow (a Container tree; Graphics draw nothing). */
class FakeContainer {
  constructor() {
    this.children = [];
    this.scale = { set() {} };
    this.x = 0;
    this.y = 0;
  }
  addChild(c) {
    this.children.push(c);
    c.parent = this;
    return c;
  }
  addChildAt(c) {
    this.children.unshift(c);
    c.parent = this;
    return c;
  }
  removeChild(c) {
    this.children = this.children.filter((x) => x !== c);
    c.parent = null;
  }
  destroy() {
    this.destroyed = true;
  }
}
class FakeGraphics extends FakeContainer {
  roundRect(x, y, w, h) {
    this.rect = { x, y, w, h };
    return this;
  }
  fill(style) {
    this.filled = style;
    return this;
  }
  stroke(style) {
    this.stroked = style;
    return this;
  }
}
const FAKE_PIXI = { Container: FakeContainer, Graphics: FakeGraphics, BlurFilter: class {} };

describe('G192 doors in the route graph', () => {
  const built = routeGraph(GRAPH_JSON);

  it('the client takes a door when no signpost leads on (loc_path_door)', { skip: !existsSync(client) && 'no client checkout' }, () => {
    const fc = read(join(client, 'control/TSFrontController.as'));
    assert.match(fc, /signpost = loc\.getSignpostThatLinksToLocTsid\(next_loc_tsid\);[\s\S]{0,200}door = loc\.getDoorThatLinksToLocTsid\(next_loc_tsid\);[\s\S]{0,80}model\.stateModel\.loc_path_door = door;/);
    const gps = read(join(client, 'view/ui/map/GpsUI.as'));
    assert.match(gps, /private function onArrowClick[\s\S]{0,700}startUserInitiatedPath\(model\.stateModel\.loc_path_signpost\.tsid\)[\s\S]{0,200}startUserInitiatedPath\(model\.stateModel\.loc_path_door\.tsid\)[\s\S]{0,200}onCloseClick/);
  });

  it('signpost-graph.json lists the doors; routeGraph joins them to the signposts', () => {
    assert.match(GRAPH_JSON.source, /doors/);
    assert.deepEqual(GRAPH_JSON.doors[PANKA], [HELL_BAR], 'the Hell Bar door in Panka Surazu');
    assert.ok(GRAPH_JSON.doors[HELL_BAR].includes(PANKA), 'and the way back out');
    assert.equal(GRAPH_JSON.doorKeys[`${THORNFAD}>${VICARS}`], 1, "Vicar's Peak needs Door Key 1");
    assert.deepEqual(GRAPH_JSON.streets[PANKA], GRAPH[PANKA], 'signposts unchanged');
    assert.ok(built.graph[PANKA].includes(HELL_BAR));
    assert.ok(!GRAPH_JSON.streets[PANKA].includes(HELL_BAR), 'the signpost list stays signposts only (smuggling routes)');
    assert.ok(built.locked.has(`${THORNFAD}>${VICARS}`));
    // Visible doors with one fixed destination on another street, and nothing else.
    const expected = {};
    let skipped = 0;
    for (const [key, meta] of Object.entries(INDEX.streets)) {
      for (const d of JSON.parse(read(join(PUBLIC, meta.file))).doors || []) {
        const to = graphKey(built.graph, d.connect?.street || d.connect?.tsid || '');
        if (d.hidden || d.destinations?.length || !to || to === key) {
          skipped += 1;
          continue;
        }
        (expected[key] ||= new Set()).add(to);
      }
    }
    assert.deepEqual(Object.fromEntries(Object.entries(GRAPH_JSON.doors).map(([k, v]) => [k, [...v].sort()])), Object.fromEntries(Object.entries(expected).map(([k, v]) => [k, [...v].sort()])));
    assert.ok(skipped >= 30, `hidden, random and same-street doors: ${skipped}`);
  });

  it('routes end inside door-only rooms: the Hell Bar behind Panka Surazu', () => {
    assert.deepEqual(findRoute(built.graph, MAHATAM, HELL_BAR, { locked: built.locked }), [...NARAKA_ROUTE, HELL_BAR]);
    assert.deepEqual(findRoute(built.graph, HELL_BAR, PANKA, { locked: built.locked }), [HELL_BAR, PANKA]);
    assert.equal(findRoute(built.graph, HELL_ONE, PANKA), null, 'Hell One still has only the Hell Hole');
  });

  it("Beelzebooze still routes to Panka Surazu (hell_quest.js 114-115), the street the Hell Bar's door is on", () => {
    assert.deepEqual(findRoute(built.graph, MAHATAM, ROUTE_TARGETS.hellBar, { locked: built.locked }), NARAKA_ROUTE);
    assert.equal(INDEX.streets[HELL_BAR].label, 'Hell Bar');
    assert.equal(doorToward(streetJson(PANKA).doors, HELL_BAR), 0);
  });

  it("Vicar's Peak: through its locked door, the only way in", () => {
    const path = findRoute(built.graph, HECHEY, VICARS, { locked: built.locked });
    assert.ok(path && path.length > 2);
    assert.deepEqual(path.slice(-2), [THORNFAD, VICARS]);
    assert.equal(findRoute(GRAPH, HECHEY, VICARS), null, 'not on the signposts alone');
  });

  it('a locked door only when there is no other way', () => {
    const toy = { GA: ['GB', 'GC'], GB: ['GA'], GC: ['GA', 'GB'] };
    const locked = new Set(['GA>GB']);
    assert.deepEqual(findRoute(toy, 'GA', 'GB', { locked }), ['GA', 'GC', 'GB']);
    assert.deepEqual(findRoute({ GA: ['GB'], GB: [] }, 'GA', 'GB', { locked }), ['GA', 'GB']);
    // With closed roads too: round both, then through the lock, then through the closure.
    assert.deepEqual(findRoute(toy, 'GA', 'GB', { locked, blocked: ['GC'] }), ['GA', 'GB']);
  });

  it('doorToward: visible doors with one destination, an unlocked one first', () => {
    const doors = [
      { hidden: true, connect: { street: 'GX1' } },
      { destinations: ['GX1'], connect: { street: 'GX1' } },
      { key_id: 4, connect: { street: 'GX1' } },
      { connect: { tsid: 'LX1' } },
      { connect: { street: 'GX2' } },
    ];
    assert.equal(doorToward(doors, 'GX1'), 3);
    assert.equal(doorToward(doors.slice(0, 3), 'GX1'), 2, 'a locked door when it is the only one');
    assert.equal(doorToward(doors, 'GX9'), -1);
    assert.equal(doorToward(doors, ''), -1);
  });

  it("the Map pins a door-only destination on the street its door is on", () => {
    const hub = JSON.parse(read(join(PUBLIC, 'assets/maps/hubs/hub-40.json')));
    const segs = hub.streets.map((s) => ({ key: s.tsid, x1: s.x1, y1: s.y1, x2: s.x2, y2: s.y2 }));
    assert.ok(!segs.some((s) => sameKey(s.key, HELL_BAR)), 'the Hell Bar is not drawn on Naraka');
    const d = hubRouteDrawing([...NARAKA_ROUTE, HELL_BAR], segs, (t) => INDEX.streets[t]?.hubId || '40', '40');
    assert.equal(d.pinVia, 'door');
    const panka = segs.find((s) => sameKey(s.key, PANKA));
    assert.deepEqual(d.pin, { x: (panka.x1 + panka.x2) / 2, y: (panka.y1 + panka.y2) / 2 });
    assert.equal(d.exitHub, '');
  });
});

function sameKey(a, b) {
  return String(a).slice(1) === String(b).slice(1);
}

describe('G192 the GPS arrow walks you there', () => {
  before(async () => {
    resetContentCatalogs();
    await loadContentCatalogsFromDir(join(PUBLIC, 'assets/content'));
    applyStreetIndex(INDEX);
  });
  beforeEach(() => {
    mapRoutesFeature._reset();
    mapRoutesFeature._setGraph(GRAPH_JSON);
  });

  function onStreet(tsid, extra = {}) {
    const engine = fakeEngine();
    engine.PIXI = FAKE_PIXI;
    engine.entityLayer = new FakeContainer();
    engine.streetTsid = tsid;
    engine.street = { tsid, hubId: '40', label: INDEX.streets[tsid].label, bounds: { l: 0, t: 0 } };
    engine.log.verbs = [];
    engine.log.travel = [];
    engine.targetVerbs = (t) => (t.classId === 'street_door' ? [{ id: 'enter', label: 'Enter', enabled: true, durationMs: 0 }] : []);
    engine.beginVerb = (t, v) => engine.log.verbs.push([t, v]);
    engine.travel = (to, meta) => engine.log.travel.push([to, meta]);
    engine.acting = () => false;
    Object.assign(engine, extra);
    return engine;
  }

  function doorTarget(engine, tsid) {
    const door = streetJson(tsid).doors[0];
    const sprite = engine.entityLayer.addChild(new FakeContainer());
    sprite.x = door.x;
    sprite.y = door.y;
    sprite.zIndex = 3;
    const target = { classId: 'street_door', featureId: 'doors', door, sprite };
    engine.interactables = [target];
    return target;
  }

  /** Walk the fake avatar the way the held arrow key would. */
  function walkUntilDone(engine, start = Date.now()) {
    let now = start;
    for (let i = 0; i < 2000 && mapRoutesFeature._walk(); i++) {
      now += 16;
      const w = mapRoutesFeature._walk();
      if (w?.dir) engine.player.x += w.dir * 4.4;
      mapRoutesFeature._stepWalk(engine, now);
    }
    return now;
  }

  it('Panka Surazu: the Hell Bar door glows, the arrow walks you to it and you go in', () => {
    const engine = onStreet(PANKA);
    const target = doorTarget(engine, PANKA);
    engine.player.x = 900;
    mapRoutesFeature.mapRoute('set', { to: HELL_BAR, source: 'player' }, engine);
    mapRoutesFeature.onStreetEnter(engine.street, engine);
    assert.equal(engine.data.routeVia, 'door');
    assert.equal(engine.data.routeNext, 'Hell Bar');
    assert.match(engine.data.routeDoor, /^1843:Hell Bar$/);
    assert.equal(mapRoutesFeature._highlight().glow.parent, engine.entityLayer, 'the glow sits with the door art');
    mapRoutesFeature._arrowClick(engine);
    assert.equal(mapRoutesFeature._walk().kind, 'door');
    walkUntilDone(engine);
    assert.equal(engine.data.routeWalkEnd, 'arrived');
    assert.ok(Math.abs(engine.player.x - target.door.x) <= 26);
    assert.equal(engine.log.verbs.length, 1);
    assert.equal(engine.log.verbs[0][0], target);
    assert.equal(engine.log.verbs[0][1].id, 'enter', "the door's own Enter verb (key, level and gate checks)");
  });

  it('a signpost: the arrow walks you to the post and takes the board toward the next street', () => {
    const engine = onStreet(MAHATAM);
    const board = { index: 0, x: 0, y: -100, rotation: 0, connection: { tsid: 'LA5REO5I9OE2KLS', label: 'Dhuma Maya', arrive: { x: 50, y: 400 } } };
    const view = new FakeContainer();
    view.x = 1500;
    view.y = 500;
    view.signBoards = [board];
    engine.signViews = [view];
    engine.player.x = 1200;
    mapRoutesFeature.mapRoute('set', { to: PANKA, source: 'hell_quest' }, engine);
    mapRoutesFeature.onStreetEnter(engine.street, engine);
    assert.equal(engine.data.routeVia, 'sign');
    mapRoutesFeature._arrowClick(engine);
    walkUntilDone(engine);
    assert.deepEqual(engine.log.travel, [[DHUMA, { label: 'Dhuma Maya', arrive: { x: 50, y: 400 } }]]);
  });

  it('a wall in the way stops the walk; a second click stops it too; at the destination the arrow closes the route', () => {
    const engine = onStreet(PANKA);
    doorTarget(engine, PANKA);
    engine.player.x = 900;
    mapRoutesFeature.mapRoute('set', { to: HELL_BAR, source: 'player' }, engine);
    mapRoutesFeature.onStreetEnter(engine.street, engine);
    mapRoutesFeature._arrowClick(engine);
    const t0 = Date.now();
    mapRoutesFeature._stepWalk(engine, t0 + 16);
    mapRoutesFeature._stepWalk(engine, t0 + 2000);
    assert.equal(mapRoutesFeature._walk(), null);
    assert.equal(engine.data.routeWalkEnd, 'stalled');
    assert.equal(engine.log.verbs.length, 0);
    mapRoutesFeature._arrowClick(engine);
    assert.ok(mapRoutesFeature._walk());
    mapRoutesFeature._arrowClick(engine);
    assert.equal(mapRoutesFeature._walk(), null);
    // Arrived: GpsUI onArrowClick at the destination -> onCloseClick.
    engine.streetTsid = HELL_BAR;
    mapRoutesFeature.onStreetEnter({ tsid: HELL_BAR }, engine);
    assert.equal(engine.data.routeStatus, 'arrived');
    mapRoutesFeature._arrowClick(engine);
    assert.equal(mapRoutesFeature.mapRoute('get', null, engine), null);
    assert.equal(engine.data.routeCleared, 'closed');
  });

  it('map_destination_reached is a quest event the game sends (A Little Tutorial Reinforcement)', () => {
    assert.ok(EMITTED_EVENTS.some((e) => e.event === 'map_destination_reached'));
    assert.match(read(join(PUBLIC, 'js/features/map-routes-feature.js')), /engine\.achievement\?\.\('map_destination_reached', 1\)/);
  });
});

describe('G192 the loading card first', () => {
  it('the client holds prompts, conversations and award screens while you move', { skip: !existsSync(client) && 'no client checkout' }, () => {
    assert.match(read(join(client, 'view/gameoverlay/PromptView.as')), /visible = \(!model\.moveModel\.moving\);[\s\S]*if \(!prompt\.displayed && !ConfirmationDialog\.instance\.parent && !model\.moveModel\.moving\)/);
    assert.match(read(join(client, 'port/QuestsDialog.as')), /if\(!model\.moveModel\.moving && !quest_convo_ui\.parent\)/);
    assert.match(read(join(client, 'control/TSFrontController.as')), /else if \(model\.moveModel\.moving\) \{\s*bail = 'tryShowScreenViewFromQ bailing because moving';/);
  });

  it('screen-fx counts the street cards on <html>; afterStreetCard waits for the last one', async () => {
    const root = new EventTarget();
    root.dataset = {};
    const saved = { document: globalThis.document, raf: globalThis.requestAnimationFrame };
    globalThis.document = { documentElement: root };
    globalThis.requestAnimationFrame = (cb) => setTimeout(cb, 0);
    const card = () => ({ dataset: {}, style: {}, hidden: true, classList: { add() {}, remove() {} }, setAttribute() {}, querySelector: () => null });
    try {
      assert.equal(streetCardUp(), false);
      const order = [];
      let waited = null;
      const first = runStreetTransition(card(), {
        toLabel: 'Hell One',
        holdMs: 0,
        onMid: async () => {
          order.push(`mid:${root.dataset.streetCards}`);
          waited = afterStreetCard().then(() => order.push('after'));
          // A second card while the first is up (a croak right after arriving).
          await runStreetTransition(card(), { toLabel: 'Naraka', holdMs: 0, onMid: () => order.push(`mid2:${root.dataset.streetCards}`) });
          order.push(`back:${root.dataset.streetCards}`);
        },
      });
      await first;
      order.push('done');
      await waited;
      assert.deepEqual(order, ['mid:1', 'mid2:2', 'back:1', 'after', 'done']);
      assert.equal(streetCardUp(), false);
      assert.equal('streetCards' in root.dataset, false);
      await afterStreetCard();
    } finally {
      globalThis.document = saved.document;
      globalThis.requestAnimationFrame = saved.raf;
      if (saved.document === undefined) delete globalThis.document;
      if (saved.raf === undefined) delete globalThis.requestAnimationFrame;
    }
  });

  it('dialogs hide and award screens queue while a card is up', () => {
    assert.match(read(join(PUBLIC, 'style.css')), /html\[data-street-cards\] \.quest-dialogue \{ visibility: hidden; \}/);
    const game = read(join(PUBLIC, 'game.js'));
    assert.match(game, /awardQueue = awardQueue\n(?:\s*\/\/[^\n]*\n)*\s*\.then\(\(\) => \{\n\s*if \(startHeld\(\)\) noteScreenHold\(state\.started \? 'look builder' : 'start card'\);\n\s*return afterStart\(\);\n\s*\}\)\n[^\n]*\n\s*\.then\(\(\) => afterStreetCard\(\)\)\n[^\n]*\n\s*\.then\(\(\) => waitForScreenGates\(screenGateState, \{ requiresFocus, closedAt: screenClosedAt, onHold: noteScreenHold \}\)\)\n\s*\.then\(show\)/);
  });

  function hellEngine() {
    const log = { prompts: [], achievements: [], entered: [] };
    let enterDone;
    let cardDone;
    const engine = {
      started: true,
      log,
      pc: { level: 5, energy: 50, energyMax: 100, mood: 50, moodMax: 100 },
      inv: {},
      questState: createQuestState(),
      streetTsid: HECHEY,
      street: { tsid: HECHEY, hubId: '56', label: 'Hechey Track' },
      player: { x: 100, y: 200 },
      param: () => null,
      setData() {},
      playSound() {},
      pushActivity() {},
      updateHud() {},
      stopFollowing() {},
      refreshPack() {},
      save() {},
      toast() {},
      hasBuff: () => false,
      removeBuff() {},
      questFlag() {},
      homeContext: () => ({ inHome: false }),
      transientInstance: () => false,
      streetExists: () => true,
      prompt: (p) => log.prompts.push(p),
      achievement: (c, n = 1) => log.achievements.push([c, n]),
      enter(tsid) {
        log.entered.push(tsid);
        return new Promise((r) => { enterDone = r; });
      },
      afterStreetCard: () => new Promise((r) => { cardDone = r; }),
    };
    return { engine, finishEnter: () => enterDone(), finishCard: () => cardDone() };
  }
  const flush = () => new Promise((r) => setImmediate(r));

  it("croaking: Hell One's prompt waits for the card, then its 1 s (location.js 315-330)", async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    hellFeature.restore({});
    const { engine, finishEnter, finishCard } = hellEngine();
    hellFeature.onTick(16, Date.now(), engine);
    engine.pc.energy = 0;
    hellFeature.onTick(16, Date.now(), engine);
    assert.equal(hellFeature.isDead(), true);
    assert.equal(engine.log.entered.length, 1);
    t.mock.timers.tick(5000);
    assert.equal(engine.log.prompts.length, 0, 'not while the street is loading');
    finishEnter();
    await flush();
    t.mock.timers.tick(5000);
    assert.equal(engine.log.prompts.length, 0, 'not while the card is up');
    finishCard();
    await flush();
    t.mock.timers.tick(999);
    assert.equal(engine.log.prompts.length, 0);
    t.mock.timers.tick(1);
    assert.equal(engine.log.prompts.length, 1);
    // G230: text only (location.js 321-331 sends no title).
    assert.deepEqual({ ...engine.log.prompts[0], text: '' }, { text: '', timeoutMs: 10000 });
    assert.match(engine.log.prompts[0].text, /^Uh oh\. You croaked! Bummer!/);
    hellFeature.restore({});
  });

  it('the Pooped prompt is headed Pooped, not "You croaked!" (catalog_buffs.js 1689-1713)', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const now = Date.now();
    const dead = croak(createHellState(), { streetTsid: HECHEY, x: 1, y: 1, now }).state;
    hellFeature.restore(resurrect(dead, { energy: 0, mood: 0 }, now).state);
    const { engine } = hellEngine();
    engine.pc.energy = 10;
    hellFeature.onTick(16, now, engine);
    engine.pc.energy = 4;
    hellFeature.onTick(16, now + 16, engine);
    t.mock.timers.tick(0);
    assert.equal(engine.log.prompts.length, 1);
    assert.equal(engine.log.prompts[0].title, undefined);
    assert.equal(engine.log.prompts[0].kicker, undefined);
    assert.equal(engine.log.prompts[0].text, 'You are seriously pooped! You need energy to get out of it.');
    hellFeature.restore({});
  });

  it('Wine of the Dead while alive: drink_wotd waits for Hell One to load and its card to go (G177)', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    hellFeature.restore({});
    const { engine, finishEnter, finishCard } = hellEngine();
    hellFeature.init(engine);
    addItem(engine.inv, 'wine_of_the_dead', 1);
    hellFeature.runPackVerb('wine_of_the_dead', 'drink', engine);
    assert.equal(hellFeature.isDead(), true, 'the living croak');
    const drank = () => engine.log.achievements.some(([c]) => c === 'wine_of_the_dead:drink');
    assert.equal(drank(), false);
    finishEnter();
    await flush();
    assert.equal(drank(), false, 'not under the card');
    finishCard();
    await flush();
    assert.equal(drank(), true);
    hellFeature.restore({});
  });
});

describe('G192 the Map keeps the map in view', () => {
  it('the extra cards fold into one Shortcuts line; the canvas takes the room left', () => {
    const game = read(join(PUBLIC, 'game.js'));
    assert.match(game, /arrangeMapCards\(panel\);\n  panel\.hidden = false;/);
    assert.match(game, /!el\.matches\('\[data-map-route\], \.nx-map-card'\)/, 'the route card and quest cards stay out');
    const css = read(join(PUBLIC, 'style.css'));
    assert.match(css, /\.map-card\.map-hub > \.map-canvas \{\n  flex: 1 1 420px;\n  height: auto;\n  min-height: 230px;/);
    assert.match(css, /\.map-extras \{/);
  });

  it("the Smuggling card is part of the route card: smuggling-feature has no Map card of its own", () => {
    assert.equal(typeof smugglingFeature.mapCards, 'undefined');
    smugglingFeature._reset();
    smugglingFeature.restore({ run: { from: HECHEY, destination: 'GCR11DNA3EL10TD', startedAt: 1 } });
    const engine = { inv: {}, questState: { active: { smuggling_basic: { progress: {} } } }, streetTsid: HECHEY };
    assert.equal(smugglingFeature.mapRouteCard(engine), null, 'no package, no card');
    addItem(engine.inv, 'contraband', 1);
    const info = smugglingFeature.mapRouteCard(engine);
    assert.equal(info.source, 'smuggling');
    assert.match(info.title, /^Contraband destination: Briarset Croft/);
    assert.equal(info.icon, 'assets/sprites/icons/contraband.png');
    smugglingFeature._reset();
    const feature = read(join(PUBLIC, 'js/features/map-routes-feature.js'));
    assert.match(feature, /engine\.query\?\.\('mapRouteCard', engine\)/);
  });
});

/* ------------------------------------------------------------------ G198 */

describe('G198 rooms behind doors as destinations', () => {
  const rooms = doorRooms(GRAPH_JSON);
  const off = new Set(GRAPH_JSON.offMap);
  const roomOf = (tsid) => rooms.find((r) => r.room === tsid);

  it('signpost-graph.json is current (tools/build-signpost-graph.mjs --check)', () => {
    const out = execFileSync(process.execPath, [join(spike, 'tools/build-signpost-graph.mjs'), '--check'], { encoding: 'utf8', stdio: 'pipe' });
    assert.match(out, /signpost graph current: \d+ streets, \d+ links, \d+ door links \(\d+ locked\), \d+ off the hub maps/);
  });

  it('offMap lists the streets no hub map draws', () => {
    assert.match(GRAPH_JSON.source, /hubs/);
    assert.ok(off.has(HELL_BAR) && off.has(VICARS), 'the Hell Bar and Vicar\'s Peak are not on a hub map');
    assert.ok(!off.has(PANKA) && !off.has(THORNFAD), 'the streets their doors are on are');
    const maps = JSON.parse(read(join(PUBLIC, 'assets/maps/index.json')));
    const drawn = new Set();
    for (const hub of Object.values(maps.hubs)) {
      for (const st of JSON.parse(read(join(PUBLIC, hub.file))).streets || []) for (const a of [st.tsid, `G${st.tsid.slice(1)}`, `L${st.tsid.slice(1)}`]) drawn.add(a);
    }
    for (const key of Object.keys(INDEX.streets)) assert.equal(off.has(key), !drawn.has(key), key);
  });

  it('the client offered destinations from the hub maps only (street menu and search)', { skip: !existsSync(client) && 'no client checkout' }, () => {
    const menu = read(join(client, 'control/InteractionMenuController.as'));
    assert.match(menu, /public function startLocationMenu\(street:Street, hub_tsid:String[\s\S]{0,400}label: 'Set as Destination'/);
    assert.match(read(join(client, 'model/WorldModel.as')), /public function searchLocations\(str:String\)[\s\S]{0,300}for\(k in search_locations\)/);
    assert.match(read(join(client, 'data/location/Hub.as')), /if\(add_to_search\) TSModelLocator\.instance\.worldModel\.search_locations\[k\] = location\.label;/);
  });

  it('doorRooms: every room off the maps behind a door, hung off the drawn street its first door is on', () => {
    assert.deepEqual(roomOf(HELL_BAR), { room: HELL_BAR, street: PANKA, via: PANKA, locked: false });
    assert.deepEqual(roomOf(VICARS), { room: VICARS, street: THORNFAD, via: THORNFAD, locked: true }, 'Door Key 1');
    assert.equal(new Set(rooms.map((r) => r.room)).size, rooms.length, 'each room once');
    for (const r of rooms) {
      assert.ok(off.has(r.room), `${r.room} is off the maps`);
      assert.ok(!off.has(r.street), `${r.street} is drawn`);
      assert.ok((GRAPH_JSON.doors[r.via] || []).includes(r.room), `a door from ${r.via} leads in`);
    }
    // Rooms behind rooms: Tower St West -> Stairs -> Mezzanine -> Hall of Rejected Concepts.
    const byLabel = (l) => rooms.find((r) => INDEX.streets[r.room].label === l);
    const stairs = byLabel('Stairs');
    const mezz = byLabel('Mezzanine');
    assert.equal(INDEX.streets[stairs.street].label, 'Tower St West');
    assert.equal(mezz.street, stairs.street);
    assert.equal(mezz.via, stairs.room);
    assert.ok(rooms.length >= 20, `${rooms.length} rooms`);
    assert.deepEqual(doorRooms({}), []);
  });

  it('the Map lists a hub\'s rooms in pick mode, and picking one sets a player route through its door', () => {
    resetContentCatalogs();
    applyStreetIndex(INDEX);
    mapRoutesFeature._reset();
    mapRoutesFeature._setGraph(GRAPH_JSON);
    const naraka = mapRoutesFeature._roomsInHub('40');
    const bar = naraka.find((r) => r.room === HELL_BAR);
    assert.ok(bar, 'the Hell Bar is listed on the Naraka map');
    assert.equal(bar.label, 'Hell Bar');
    assert.equal(bar.streetLabel, 'Panka Surazu');
    assert.ok(naraka.every((r) => INDEX.streets[r.street].hubId === '40'));
    assert.deepEqual(mapRoutesFeature._roomsInHub(''), []);
    const heights = mapRoutesFeature._roomsInHub('64');
    assert.ok(heights.some((r) => r.room === VICARS && r.locked && r.streetLabel === 'Thornfad Layers'));
    const engine = fakeEngine();
    mapRoutesFeature._setPickMode(true);
    const res = mapRoutesFeature._pickRoom(engine, HELL_BAR);
    assert.equal(res.ok, true);
    assert.equal(res.route.destination, HELL_BAR);
    assert.equal(res.route.source, 'player');
    assert.deepEqual(res.route.path.slice(-2), [PANKA, HELL_BAR], 'the last hop is the Panka Surazu door');
    assert.equal(engine.data.routeMode, '', 'pick mode ends');
    assert.deepEqual(engine.log.activity, ['Destination set: Hell Bar.']);
    mapRoutesFeature._reset();
  });

  it('the room list is in the route card while "Set a destination" is on', () => {
    const feature = read(join(PUBLIC, 'js/features/map-routes-feature.js'));
    assert.match(feature, /if \(pickMode\) roomPicker\(engine, card, shownHub\);/);
    assert.match(feature, /head\.textContent = 'Behind doors:';/);
    assert.match(feature, /const GRAPH_URL = 'assets\/content\/signpost-graph\.json\?v=g198-1';/, 'the graph gained offMap: a new cache key');
  });
});

describe('G198 the door glow follows the door art', () => {
  class FakeSprite extends FakeContainer {
    constructor(texture) {
      super();
      this.texture = texture;
      this.anchor = { x: 0, y: 0, set: (x, y) => { this.anchor.x = x; this.anchor.y = y; } };
      this.scale = { x: 1, y: 1, set: (x, y) => { this.scale.x = x; this.scale.y = y ?? x; } };
      this.rotation = 0;
    }
  }
  class FakeColorMatrix {}

  function pankaDoor(PIXI, withTexture) {
    const engine = fakeEngine();
    engine.PIXI = PIXI;
    engine.entityLayer = new FakeContainer();
    engine.streetTsid = PANKA;
    engine.street = { tsid: PANKA, hubId: '40', label: 'Panka Surazu', bounds: { l: 0, t: 0 } };
    const door = streetJson(PANKA).doors[0];
    const sprite = withTexture ? new FakeSprite({ id: 'door_asset_hell_bar_entrance_01a' }) : new FakeContainer();
    engine.entityLayer.addChild(sprite);
    Object.assign(sprite, { x: door.x, y: door.y, zIndex: 3, width: door.w, height: door.h });
    if (withTexture) sprite.anchor.set(0.5, 1);
    engine.interactables = [{ classId: 'street_door', featureId: 'doors', door, sprite }];
    mapRoutesFeature._reset();
    mapRoutesFeature._setGraph(GRAPH_JSON);
    mapRoutesFeature.mapRoute('set', { to: HELL_BAR, source: 'player' }, engine);
    mapRoutesFeature.onStreetEnter(engine.street, engine);
    return { engine, door, sprite, glow: mapRoutesFeature._highlight()?.glow };
  }

  it('the Hell Bar door (350x298) gets an art-shaped edge glow, not a filled box', () => {
    const { engine, door, sprite, glow } = pankaDoor({ ...FAKE_PIXI, Sprite: FakeSprite, ColorMatrixFilter: FakeColorMatrix }, true);
    assert.deepEqual([door.w, door.h, door.sprite], [350, 298, 'door_asset_hell_bar_entrance_01a']);
    assert.ok(glow instanceof FakeSprite, 'a copy of the door art');
    assert.equal(glow.texture, sprite.texture);
    assert.deepEqual([glow.anchor.x, glow.anchor.y], [0.5, 1]);
    const [flat, blur] = glow.filters;
    assert.ok(flat instanceof FakeColorMatrix);
    const c = [(ROUTE_COLOR >> 16) & 255, (ROUTE_COLOR >> 8) & 255, ROUTE_COLOR & 255].map((v) => v / 255);
    assert.deepEqual(flat.matrix, [0, 0, 0, 0, c[0], 0, 0, 0, 0, c[1], 0, 0, 0, 0, c[2], 0, 0, 0, 1, 0], 'every pixel the route colour, alpha kept');
    assert.ok(blur);
    // A few px past the art on each side, no more.
    assert.ok(Math.abs(glow.scale.x * 350 - 364) < 0.01, `${glow.scale.x * 350}`);
    assert.ok(Math.abs(glow.scale.y * 298 - 305) < 0.01, `${glow.scale.y * 298}`);
    assert.ok(glow.zIndex < sprite.zIndex, 'behind the door');
    assert.equal(glow.parent, sprite.parent);
    assert.equal(engine.data.routeDoorGlow, 'edge:350x298');
    // The art resized after its texture loaded (doors-feature applyRect): the glow follows on the next tick.
    sprite.scale.set(2, 2);
    sprite.width = 700;
    sprite.height = 596;
    mapRoutesFeature.onTick(16, Date.now(), engine);
    assert.ok(Math.abs(glow.scale.x * 350 - 714) < 0.01);
    mapRoutesFeature._reset();
  });

  it('without the art (a drawn door still loading) it is a thin outline the size of the door', () => {
    const { glow } = pankaDoor(FAKE_PIXI, false);
    assert.ok(glow instanceof FakeGraphics);
    assert.deepEqual(glow.rect, { x: -178, y: -301, w: 356, h: 304 });
    assert.equal(glow.filled, undefined, 'no fill');
    assert.equal(glow.stroked.color, ROUTE_COLOR);
    mapRoutesFeature._reset();
  });

  /** A world with real child order: bgLayer, then entityLayer (game.js world.addChild(bgLayer, entityLayer, fxLayer)). */
  class FakeWorld extends FakeContainer {
    addChildAt(c, i) {
      c.parent?.removeChild?.(c);
      this.children.splice(i, 0, c);
      c.parent = this;
      return c;
    }
    getChildIndex(c) {
      return this.children.indexOf(c);
    }
  }

  function tintedPanka() {
    const world = new FakeWorld();
    const bgLayer = world.addChild(new FakeContainer());
    const PIXI = { ...FAKE_PIXI, Sprite: FakeSprite, ColorMatrixFilter: FakeColorMatrix };
    const engine = fakeEngine();
    engine.PIXI = PIXI;
    engine.entityLayer = world.addChild(new FakeContainer());
    // Naraka's middleground matrix on the entity plane (game.js enterStreet).
    engine.entityLayer.filters = [new FakeColorMatrix()];
    const fx = world.addChild(new FakeContainer());
    engine.streetTsid = PANKA;
    engine.street = { tsid: PANKA, hubId: '40', label: 'Panka Surazu', bounds: { l: 0, t: 0 } };
    const door = streetJson(PANKA).doors[0];
    const sprite = new FakeSprite({ id: 'door_asset_hell_bar_entrance_01a' });
    engine.entityLayer.addChild(sprite);
    Object.assign(sprite, { x: door.x, y: door.y, zIndex: 3, width: door.w, height: door.h });
    sprite.anchor.set(0.5, 1);
    engine.interactables = [{ classId: 'street_door', featureId: 'doors', door, sprite }];
    mapRoutesFeature._reset();
    mapRoutesFeature._setGraph(GRAPH_JSON);
    mapRoutesFeature.mapRoute('set', { to: HELL_BAR, source: 'player' }, engine);
    mapRoutesFeature.onStreetEnter(engine.street, engine);
    return { world, bgLayer, fx, engine, door, sprite, glow: mapRoutesFeature._highlight()?.glow };
  }

  it('G200: the door glow sits out of the street tint, under the entity plane, so it reads 0xf0f258 on Naraka', () => {
    const { world, bgLayer, fx, engine, door, glow } = tintedPanka();
    const layer = mapRoutesFeature._glowLayer();
    assert.equal(glow.parent, layer);
    assert.equal(layer.parent, world);
    assert.equal(layer.filters, undefined, 'no colour matrix on its way to the screen');
    assert.deepEqual(world.children, [bgLayer, layer, engine.entityLayer, fx], 'above the street, below the door art');
    assert.equal(engine.data.routeGlowLayer, 'untinted');
    // Same place as before, in the same space as the door art.
    assert.equal(glow.x, door.x);
    assert.ok(Math.abs(glow.y - (door.y + 7 * 0.25)) < 0.01);
    // The halo's alpha is lifted after the blur, its colour left alone.
    const [flat, blur, gain] = glow.filters;
    assert.ok(flat instanceof FakeColorMatrix && blur && gain instanceof FakeColorMatrix);
    assert.deepEqual(gain.matrix, [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1.75, 0]);
    // A new street: the old glow leaves the layer, and the layer stays under the entity plane.
    mapRoutesFeature.onStreetClear(engine);
    assert.equal(layer.children.length, 0);
    assert.equal(glow.destroyed, true);
    world.addChildAt(bgLayer, 0);
    assert.equal(world.getChildIndex(layer) + 1, world.getChildIndex(engine.entityLayer));
    mapRoutesFeature._reset();
  });

  it('G200: a world rebuilt around a new entity plane takes the layer with it', () => {
    tintedPanka();
    const first = mapRoutesFeature._glowLayer();
    const again = tintedPanka();
    assert.equal(mapRoutesFeature._glowLayer(), first, 'one layer, moved');
    assert.equal(first.parent, again.world);
    assert.deepEqual(again.world.children, [again.bgLayer, first, again.engine.entityLayer, again.fx]);
    mapRoutesFeature._reset();
  });
});
