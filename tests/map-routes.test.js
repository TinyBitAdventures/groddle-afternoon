/**
 * Map routes (register row G177): js/map-routes.js, features/map-routes-feature.js
 * and the quests that set a route (Beelzebooze, Warm and Smuggly, We're Off to
 * See the Lizard).
 */
import { describe, it, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
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
} from '../public/js/map-routes.js?v=g177-1';
import { mapRoutesFeature } from '../public/js/features/map-routes-feature.js?v=g177-1';
import { hellTicketsFeature } from '../public/js/features/hell-tickets-feature.js?v=g177-1';
import { hellFeature } from '../public/js/features/hell-feature.js?v=hell-4';
import { createFeatureHost } from '../public/js/feature-host.js';
import { applyStreetIndex } from '../public/js/street-loader.js';
import { loadContentCatalogsFromDir, resetContentCatalogs } from '../public/js/content-catalogs.js';
import { createQuestState } from '../public/js/quests.js';
import { HELL_QUESTS, createHellState, croak } from '../public/js/hell.js';
import { SUBWAY_STREETS } from '../public/js/quest-rooms/back-alley.js';

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
    assert.match(index, /map-routes-feature\.js\?v=g177-1'; FEATURES\.push\(mapRoutesFeature\);$/m);
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

describe('Wine of the Dead while alive: the loading card first', () => {
  it('the drink_wotd event waits for the croak to finish entering Hell One', () => {
    const src = read(join(PUBLIC, 'js/features/hell-feature.js'));
    assert.match(src, /Promise\.resolve\(engine\.enter\(to\.tsid, \{ spawnX: to\.x, spawnY: to\.y, bypassFeatureGates: true \}\)\)\.then\(drank, drank\)/);
  });
});
