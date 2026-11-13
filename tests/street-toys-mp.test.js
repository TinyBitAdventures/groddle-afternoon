/**
 * The street toys online (register G679): js/street-toys-mp.js against the streets' own scripts, the
 * Koulato feature's online path with a fake realtime client, and the server's table
 * (groddle-afternoon-server streettoys.go) against the game's toys and jar boxes. The server side is
 * streettoys_test.go there.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TOY_CLICK, catchUpDangles, catchUpKoulato, catchUpLotha, createToyTracker, ownJars, toyEvents, toyMessageFor, toyServerState } from '../public/js/street-toys-mp.js?v=9eca3893';
import { STREET_TOYS } from '../public/js/street-toys.js?v=09630452';
import { JAR_BOXES, JAR_FLIES, KOULATO_TSID } from '../public/js/koulato-jars.js?v=5838b30a';
import { createEventRuntime, runLocationEvent } from '../public/js/location-events.js?v=05663361';
import { koulatoJarsFeature } from '../public/js/features/koulato-jars-feature.js?v=9d324fc5';
import { serverPath, skipWithoutServer } from '../tools/repos.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const street = (tsid) => JSON.parse(readFileSync(join(root, 'public/assets/streets', `${tsid}.json`), 'utf8'));
const LOTHA = 'GHV88RQU60B3Q0G';
const ICICLE = 'GHF70EIUS0D3RDM';

describe('the server\'s word, as the game keeps it', () => {
  test('toy_state per street kind, and toy_played over it', () => {
    let s = toyServerState({ t: 'toy_state', street: LOTHA, toys: 'lotha', lit: false });
    assert.deepEqual(s, { toys: 'lotha', lit: false });
    s = toyServerState({ t: 'toy_played', street: LOTHA, toy: 'lotha_note_3', by: 2, events: ['third_note', 'correct_order'] }, s);
    assert.equal(s.lit, true);
    s = toyServerState({ t: 'toy_played', street: LOTHA, toy: '', by: 0, events: ['light_fade'] }, s);
    assert.equal(s.lit, false);
    let d = toyServerState({ t: 'toy_state', toys: 'dangles', lights: [true, false, true] });
    d = toyServerState({ t: 'toy_played', events: ['shroom_light_2_on', 'shroom_light_3_off'] }, d);
    assert.deepEqual(d.lights, [true, true, false]);
    let k = toyServerState({ t: 'toy_state', toys: 'koulato', arrivals: 12.4, out: false, jars: [] });
    assert.deepEqual(k, { toys: 'koulato', arrivals: 12, out: false, jars: [false, false, false] });
    k = toyServerState({ t: 'toy_played', events: ['place_jars'], arrivals: 0, out: true, lit: [false, true, false] }, k);
    assert.deepEqual(k, { toys: 'koulato', arrivals: 0, out: true, jars: [false, true, false] });
    assert.equal(toyServerState({ t: 'toy_played', events: ['x'] }, null), null, 'a played with no state first is ignored');
    assert.deepEqual(toyEvents({ events: ['first_note', 7, 'bad name', 'x'.repeat(41)] }), ['first_note']);
    assert.ok(toyMessageFor({ street: 'LHV88RQU60B3Q0G' }, LOTHA) && !toyMessageFor({ street: ICICLE }, LOTHA) && !toyMessageFor(null, LOTHA));
    assert.equal(TOY_CLICK, 'toy_click');
  });
});

describe('the word that comes while the street loads', () => {
  test('the tracker keeps the socket\'s street\'s state; a new street\'s roster forgets the old', () => {
    const t = createToyTracker();
    t.roster({ street: LOTHA, players: [] });
    t.take({ t: 'toy_state', street: LOTHA, toys: 'lotha', lit: false });
    t.take({ t: 'toy_played', street: LOTHA, events: ['third_note', 'correct_order'] });
    assert.deepEqual(t.stateFor('LHV88RQU60B3Q0G'), { toys: 'lotha', lit: true });
    t.take({ t: 'toy_played', street: ICICLE, events: ['shroom_light_1_off'] });
    assert.equal(t.stateFor(ICICLE), null, 'a played for another street is not taken');
    t.roster({ street: LOTHA, players: [{ id: 2 }] });
    assert.equal(t.stateFor(LOTHA).lit, true, 'the same street\'s roster keeps it');
    t.roster({ street: ICICLE, players: [] });
    assert.equal(t.stateFor(LOTHA), null);
    assert.equal(t.stateFor(ICICLE), null);
  });
});

describe('catching up with the street\'s own scripts', () => {
  test('Lotha Harte: an arrival while it is lit shows the heart and leaves the fade to the server', () => {
    const s = street(LOTHA);
    const rt = createEventRuntime();
    const step = catchUpLotha({ toys: 'lotha', lit: true }, false);
    assert.deepEqual(step, { fire: ['correct_order'], cancel: ['light_fade'], shown: true });
    const fx = runLocationEvent(rt, s.events, step.fire[0], { now: 0 });
    assert.equal(fx.filter((e) => e.type === 'deco' && e.visible).length, STREET_TOYS[LOTHA].hide.length);
    assert.deepEqual(rt.timers.map((t) => t.event), ['light_fade'], 'the timer the caller cancels');
    assert.deepEqual(catchUpLotha({ toys: 'lotha', lit: false }, true), { fire: ['light_fade'], cancel: [], shown: false });
    assert.equal(catchUpLotha({ toys: 'lotha', lit: true }, true), null);
    assert.equal(catchUpLotha({ toys: 'dangles', lights: [] }, false), null);
  });

  test('Icicle Dangles: a light out for the street goes out here, past the 700 ms lock', () => {
    const s = street(ICICLE);
    const rt = createEventRuntime();
    const flag = (n) => rt.flags.has(n);
    assert.deepEqual(catchUpDangles({ toys: 'dangles', lights: [true, true, true] }, flag), []);
    // This game's light 2 is still locked from a click of its own a moment ago.
    rt.flags.add('light2');
    const steps = catchUpDangles({ toys: 'dangles', lights: [true, false, true] }, flag);
    assert.deepEqual(steps, [{ clear: 'light2', fire: 'shroom_light_2_off' }]);
    rt.flags.delete(steps[0].clear);
    const fx = runLocationEvent(rt, s.events, steps[0].fire, { now: 0 });
    assert.deepEqual(fx.filter((e) => e.type === 'deco').map((e) => [e.id, e.visible]), [['light_spot_2_groddle1_1352325189092', false]]);
    assert.ok(flag('light2_on'));
    assert.deepEqual(catchUpDangles({ toys: 'dangles', lights: [true, false, true] }, flag), [], 'then it matches');
    assert.deepEqual(catchUpDangles({ toys: 'dangles', lights: [true, true, true] }, flag), [{ clear: 'light2', fire: 'shroom_light_2_on' }]);
  });

  test('Koulato Cluster: jars out and which are lit, or put away', () => {
    const s = street(KOULATO_TSID);
    const rt = createEventRuntime();
    let lit = [false, false, false];
    let step = catchUpKoulato({ toys: 'koulato', arrivals: 3, out: true, jars: [true, false, true] }, rt.flags.has('jars_on'), lit);
    assert.deepEqual(step.fire, ['place_jars', 'jar1_on', 'jar3_on']);
    for (const name of step.fire) runLocationEvent(rt, s.events, name, { now: 0 });
    lit = step.lit;
    assert.deepEqual(lit, [true, false, true]);
    assert.ok(rt.flags.has('jars_on'));
    step = catchUpKoulato({ toys: 'koulato', arrivals: 3, out: true, jars: [true, false, false] }, true, lit);
    assert.deepEqual(step.fire, ['jar3_off']);
    step = catchUpKoulato({ toys: 'koulato', arrivals: 4, out: false, jars: [false, false, false] }, true, step.lit);
    assert.deepEqual(step, { fire: ['turn_off', 'hide_all'], lit: [false, false, false] });
    assert.deepEqual(catchUpKoulato(null, false, lit), { fire: [], lit });
  });

  test('only this player\'s "own" jars are put down here', () => {
    const msg = { jars: [{ n: 1, id: 7, own: true }, { n: 2, id: 8, own: true }, { n: 3, id: 7, own: false }, { n: 9, id: 7, own: true }] };
    assert.deepEqual(ownJars(msg, 7), [{ n: 1 }]);
    assert.deepEqual(ownJars(msg, null), []);
    assert.deepEqual(ownJars({}, 7), []);
  });
});

/** A realtime client stand-in: listeners, sends recorded, one player. */
function fakeClient(id = 7) {
  const listeners = new Map();
  return {
    state: 'online',
    street: KOULATO_TSID,
    me: { id },
    sent: [],
    on(type, fn) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(fn);
      return () => listeners.get(type).delete(fn);
    },
    emit(type, msg) {
      for (const fn of listeners.get(type) || []) fn(msg);
    },
    send(kind, payload) {
      this.sent.push({ kind, ...payload });
      return true;
    },
  };
}

function fakeEngine(client, mode = 'multiplayer') {
  const data = {};
  const drops = [];
  return {
    mode,
    started: true,
    player: { x: JAR_BOXES[1].x, y: JAR_BOXES[1].y - 10 },
    data,
    drops,
    setData(k, v) { data[k] = v; },
    query(name) { return name === 'realtimeClient' ? client : name === 'minimapPlayers' ? [] : null; },
    param: () => null,
    transientInstance: () => false,
    homeContext: () => ({ inHome: false }),
    dropWorldStack(c, n, x, y, points) { drops.push({ c, n, x, y, points }); return { ok: true }; },
  };
}

describe('Koulato Cluster online (koulato-jars-feature)', () => {
  test('the game counts no arrival of its own and completes nothing alone: the server says', () => {
    koulatoJarsFeature.restore({ arrivals: 29, placed: false });
    const client = fakeClient();
    const engine = fakeEngine(client);
    koulatoJarsFeature.onStreetEnter({ tsid: KOULATO_TSID }, engine);
    assert.deepEqual(koulatoJarsFeature._state().save, { arrivals: 29, placed: false }, 'the 30th solo arrival is not counted online');
    client.emit('msg:toy_state', { t: 'toy_state', street: KOULATO_TSID, toys: 'koulato', arrivals: 12, out: true, jars: [false, true, false] });
    koulatoJarsFeature.onTick(16, 0, engine);
    assert.equal(engine.data.koulatoArrivals, 12);
    assert.equal(engine.data.koulatoPlaced, 1);
    // Standing on jar 2 alone with two pretend players drawn on 1 and 3 completes nothing here.
    assert.equal(koulatoJarsFeature._state().done, 0);
    assert.equal(engine.drops.length, 0);
    koulatoJarsFeature.onStreetClear();
  });

  test('a toy_state that came while the street loaded is read on arrival', () => {
    const client = fakeClient(7);
    const engine = fakeEngine(client);
    koulatoJarsFeature.onTick(16, 0, engine); // online from the first frame: listening
    client.emit('roster', { street: KOULATO_TSID, players: [] });
    client.emit('msg:toy_state', { t: 'toy_state', street: KOULATO_TSID, toys: 'koulato', arrivals: 0, out: true, jars: [false, false, true] });
    koulatoJarsFeature.onStreetEnter({ tsid: KOULATO_TSID }, engine);
    assert.deepEqual(koulatoJarsFeature._state().server, { toys: 'koulato', arrivals: 0, out: true, jars: [false, false, true] });
    koulatoJarsFeature.onStreetClear();
  });

  test('the completion: a jar the server shared is not dropped here; an "own" one for me is, once', () => {
    const client = fakeClient(7);
    const engine = fakeEngine(client);
    koulatoJarsFeature.onStreetEnter({ tsid: KOULATO_TSID }, engine);
    client.emit('msg:toy_state', { t: 'toy_state', street: KOULATO_TSID, toys: 'koulato', arrivals: 0, out: true, jars: [true, false, true] });
    const done = (jars) => ({ t: 'toy_played', street: KOULATO_TSID, toy: '', by: 0, events: ['jar2_on', 'complete', 'turn_off'], arrivals: 0, out: false, lit: [false, false, false], jars });
    client.emit('msg:toy_played', done([{ n: 1, id: 5, own: false }, { n: 2, id: 7, own: false }, { n: 3, id: 6, own: false }]));
    assert.equal(engine.drops.length, 0, 'shared: the server put it on the ground');
    assert.equal(koulatoJarsFeature._state().done, 1);
    client.emit('msg:toy_played', done([{ n: 1, id: 5, own: true }, { n: 2, id: 7, own: true }, { n: 3, id: 6, own: true }]));
    assert.deepEqual(engine.drops, [{ c: 'firefly_jar', n: 1, x: JAR_BOXES[1].drop.x, y: JAR_BOXES[1].drop.y, points: [JAR_FLIES] }]);
    // Another street's message changes nothing.
    client.emit('msg:toy_played', { ...done([{ n: 2, id: 7, own: true }]), street: 'GA5101HF7F429V5' });
    assert.equal(engine.drops.length, 1);
    koulatoJarsFeature.onStreetClear();
  });

  test('solo still counts its own arrivals', () => {
    koulatoJarsFeature.restore({ arrivals: 3, placed: false });
    const engine = fakeEngine(null, 'solo');
    koulatoJarsFeature.onStreetEnter({ tsid: KOULATO_TSID }, engine);
    assert.equal(koulatoJarsFeature._state().save.arrivals, 4);
    koulatoJarsFeature.onStreetClear();
    koulatoJarsFeature.restore(null);
  });
});

describe('the server\'s table matches the game', { skip: skipWithoutServer }, () => {
  const go = () => readFileSync(serverPath('streettoys.go'), 'utf8');

  test('the toy ids and their events', () => {
    const src = go();
    for (const toy of STREET_TOYS[LOTHA].toys) assert.match(src, new RegExp(`"${toy.id}": "${toy.events[0]}"`), toy.id);
    STREET_TOYS[ICICLE].toys.forEach((toy, i) => assert.match(src, new RegExp(`"${toy.id}": ${i}`), toy.id));
    for (const tsid of [LOTHA, ICICLE, KOULATO_TSID]) assert.match(src, new RegExp(`"${tsid.slice(1)}": toy`), tsid);
  });

  test('the jar boxes, and each Firefly Jar rests on the ledge under its drop point', () => {
    const src = go();
    const rows = [...src.matchAll(/\{X: ([\d.]+), Y: ([\d.]+), W: ([\d.]+), H: ([\d.]+), DropX: ([\d.]+), DropY: ([\d.]+)\}/g)].map((m) => m.slice(1).map(Number));
    assert.equal(rows.length, 3);
    const s = street(KOULATO_TSID);
    rows.forEach(([x, y, w, h, dx, dy], i) => {
      const box = JAR_BOXES[i];
      assert.deepEqual([x, y, w, h, dx], [box.x, box.y, box.w, box.h, box.drop.x], `jar ${box.n}`);
      // The first line under the source's drop point (createItemStack falls to it), street space.
      const under = s.platforms
        .filter((p) => Math.min(p.x1, p.x2) + 2500 <= dx && Math.max(p.x1, p.x2) + 2500 >= dx)
        .map((p) => p.y1 + (p.y2 - p.y1) * ((dx - 2500 - p.x1) / ((p.x2 - p.x1) || 1)) + 1500)
        .filter((ly) => ly >= box.drop.y)
        .sort((a, b) => a - b)[0];
      assert.ok(Math.abs(under - dy) <= 1, `jar ${box.n} rests at ${under}, the server places it at ${dy}`);
    });
    assert.match(src, /koulatoFlies = 7/);
    assert.match(src, /koulatoArrivals = 30/);
  });
});
