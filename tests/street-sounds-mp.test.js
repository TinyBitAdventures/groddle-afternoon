/**
 * #715: a note one player plays on Piano Party (a key or star bumped) is heard by the others on the
 * street, as in Glitch (play_sound all_players went to every active player: GameServerJS
 * locations/inc_events.js 399-404, 531-538). js/street-sounds-mp.js and location-events.js's echo
 * rules, location-events-feature's send and echo with a fake realtime client, and the server's table
 * (groddle-afternoon-server data/street-sounds.json, streetsounds.go) against the game's streets. The
 * server side is streetsounds_test.go there.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { STREET_SOUND, STREET_SOUND_EVERY_MS, streetSoundEvent, streetSoundsFor } from '../public/js/street-sounds-mp.js?v=c9c290e0';
import { createEventRuntime, dueEventTimers, echoLight, runLocationEvent, sharedSoundEvents } from '../public/js/location-events.js?v=48938c8f';
import { locationEventsApi, locationEventsFeature } from '../public/js/features/location-events-feature.js?v=1c5b6340';
import { streetSoundsData } from '../tools/build-realtime-street-sounds.mjs';
import { serverPath, skipWithoutServer } from '../tools/repos.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const street = (tsid) => JSON.parse(readFileSync(join(root, 'public/assets/streets', `${tsid}.json`), 'utf8'));
const PIANO = 'GA96OS42D6F3M9P';
const LOTHA = 'GHV88RQU60B3Q0G';
const STARLIT = 'GHFCS002GN63BRB';
const LIGHT1 = 'light_spot_1340828550943';

describe('which events a street shares', () => {
  test('Piano Party: every key and star, none of the flag-only or arrival events', () => {
    const s = street(PIANO);
    const names = sharedSoundEvents(s.events);
    assert.equal(names.length, 66, 'all 66 play_sound all_players');
    assert.ok(names.includes('key1') && names.includes('bigstar1_on'));
    assert.ok(!names.includes('key1_off') && !names.includes('first_player_enter'));
    assert.deepEqual(streetSoundsFor(PIANO, s.events), names);
  });

  test('a toy street (its notes go through toy_click) and a street another system runs share none', () => {
    assert.deepEqual(streetSoundsFor(LOTHA, street(LOTHA).events), []);
    assert.deepEqual(streetSoundsFor(STARLIT, street(STARLIT).events), []);
  });

  test('a street_sound message names one event of this street (either TSID prefix)', () => {
    assert.equal(streetSoundEvent({ t: STREET_SOUND, street: `L${PIANO.slice(1)}`, event: 'key1', by: 2 }, PIANO), 'key1');
    assert.equal(streetSoundEvent({ t: STREET_SOUND, street: LOTHA, event: 'key1' }, PIANO), '');
    assert.equal(streetSoundEvent({ t: STREET_SOUND, street: PIANO, event: 'a b' }, PIANO), '');
    assert.equal(streetSoundEvent({ t: 'toy_played', street: PIANO, event: 'key1' }, PIANO), '');
  });
});

describe('an echo: the sound and the flash of light, never the flags', () => {
  test('key1 heard from another player plays LITTLE_STAR_19 and flashes its light for 400 ms', () => {
    const { events } = street(PIANO);
    assert.deepEqual([...echoLight(events, 'key1')], [LIGHT1]);
    const rt = createEventRuntime();
    rt.flags.add('key1_down'); // pressed here a moment ago: the other player's note still sounds
    const fx = runLocationEvent(rt, events, 'key1', { now: 0, echo: { light: echoLight(events, 'key1') } });
    assert.deepEqual(fx, [
      { type: 'deco', id: LIGHT1, visible: true, fade: 0 },
      { type: 'sound', name: 'LITTLE_STAR_19', loops: 1, stop: false },
    ]);
    assert.deepEqual([...rt.flags], ['key1_down'], 'no flag set or cleared');
    const [timer] = dueEventTimers(rt, 400);
    assert.equal(timer.event, 'key1_off');
    assert.deepEqual(runLocationEvent(rt, events, timer.event, { now: 400, echo: timer.echo }), [{ type: 'deco', id: LIGHT1, visible: false, fade: 0 }]);
    assert.deepEqual([...rt.flags], ['key1_down']);
  });

  test('a deco left shown for good (the street\'s puzzle state) and platforms stay the sender\'s', () => {
    const events = {
      bump: [
        { type: 'deco_show', deco: 'star' },
        { type: 'plat', plat: 'p1', pc_perm: 0 },
        { type: 'quest_flag', flag: 'q' },
        { type: 'play_sound', name: 'MINE', loops: 1 },
        { type: 'play_sound', name: 'ALL', loops: 1, all: true },
        { type: 'flag_has_exit', flag: 'never' },
        { type: 'physics', param: 'gravity', value: 0, all: true },
      ],
    };
    const fx = runLocationEvent(createEventRuntime(), events, 'bump', { now: 0, echo: { light: echoLight(events, 'bump') } });
    assert.deepEqual(fx, [{ type: 'sound', name: 'ALL', loops: 1, stop: false }]);
  });
});

function fakeClient(tsid, id = 7) {
  const listeners = new Map();
  return {
    state: 'online',
    street: tsid,
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

function fakeEngine(s, client, mode = 'multiplayer') {
  const data = {};
  const decoViews = new Map();
  for (const d of (s.layers || []).flatMap((l) => l.decos || [])) if (d?.id) decoViews.set(d.id, { visible: true, alpha: 1, destroyed: false });
  return {
    mode,
    street: s,
    streetTsid: s.tsid,
    platforms: (s.platforms || []).map((p) => ({ ...p })),
    decoViews,
    started: true,
    played: [],
    data,
    transientInstance: () => false,
    homeContext: () => ({ inHome: false }),
    setData: (k, v) => { data[k] = v; },
    param: () => null,
    query: (name) => (name === 'realtimeClient' ? client : null),
    playSound(name) { this.played.push(name); return true; },
    playCue() {},
  };
}

describe('online on Piano Party (location-events-feature)', () => {
  test('a key this player bumps goes to the street once; the others\' keys play here as an echo', () => {
    const s = street(PIANO);
    const client = fakeClient(PIANO);
    const engine = fakeEngine(s, client);
    locationEventsFeature.onStreetEnter(s, engine);
    locationEventsFeature.onTick(16, 0, engine);
    assert.ok(locationEventsApi.fire(engine, 'key1'));
    assert.deepEqual(client.sent, [{ kind: STREET_SOUND, event: 'key1' }]);
    assert.deepEqual(engine.played, ['LITTLE_STAR_19'], 'the player hears it here, once');
    // Held down (flag key1_down): no note, nothing sent.
    locationEventsApi.fire(engine, 'key1');
    assert.equal(client.sent.length, 1);
    // key1_off (the light going out, no sound) is never sent; a flag-only event neither.
    locationEventsFeature.onTick(450, 0, engine);
    locationEventsApi.fire(engine, 'key1_off');
    assert.equal(client.sent.length, 1);

    // Another player's key2: its note and its light here, this game's flags untouched.
    const light2 = [...echoLight(s.events, 'key2')][0];
    engine.decoViews.get(light2).visible = false;
    engine.played = [];
    client.emit(`msg:${STREET_SOUND}`, { t: STREET_SOUND, street: PIANO, event: 'key2', by: 9 });
    assert.deepEqual(engine.played, ['LITTLE_STAR_18']);
    assert.equal(engine.decoViews.get(light2).visible, true);
    assert.equal(locationEventsApi.flag('key2_down'), false, 'the echo sets no flag here');
    assert.equal(client.sent.length, 1, 'an echo is not sent back');
    locationEventsFeature.onTick(450, 0, engine);
    assert.equal(engine.decoViews.get(light2).visible, false, 'its light goes out after 400 ms');
    // This player's own (the server never sends it back, but a stray copy is not played twice),
    // another street's, an event the street does not share: nothing.
    engine.played = [];
    client.emit(`msg:${STREET_SOUND}`, { t: STREET_SOUND, street: PIANO, event: 'key3', by: 7 });
    client.emit(`msg:${STREET_SOUND}`, { t: STREET_SOUND, street: LOTHA, event: 'key3', by: 9 });
    client.emit(`msg:${STREET_SOUND}`, { t: STREET_SOUND, street: PIANO, event: 'first_player_enter', by: 9 });
    assert.deepEqual(engine.played, []);
    locationEventsFeature.onTick(16, 0, engine);
    assert.equal(engine.data.eventShared, 1);
    assert.equal(engine.data.eventEchoed, 1);
    locationEventsFeature.onStreetClear(engine);
  });

  test('solo (or with the socket off this street) the key plays here as before and nothing is sent', () => {
    const s = street(PIANO);
    const client = fakeClient(PIANO);
    const solo = fakeEngine(s, client, 'solo');
    locationEventsFeature.onStreetEnter(s, solo);
    locationEventsFeature.onTick(16, 0, solo);
    assert.ok(locationEventsApi.fire(solo, 'key5'));
    assert.deepEqual(solo.played, ['LITTLE_STAR_15']);
    assert.deepEqual(client.sent, []);
    const away = fakeClient(LOTHA);
    const elsewhere = fakeEngine(s, away);
    locationEventsFeature.onStreetEnter(s, elsewhere);
    locationEventsFeature.onTick(16, 0, elsewhere);
    assert.ok(locationEventsApi.fire(elsewhere, 'key6'));
    assert.deepEqual(away.sent, []);
    locationEventsFeature.onStreetClear(elsewhere);
  });

  test('Lotha Harte\'s notes are not sent this way (street-toys-mp shares them)', () => {
    const s = street(LOTHA);
    const client = fakeClient(LOTHA);
    const engine = fakeEngine(s, client);
    locationEventsFeature.onStreetEnter(s, engine);
    locationEventsFeature.onTick(16, 0, engine);
    assert.ok(locationEventsApi.fire(engine, 'first_note'));
    assert.deepEqual(client.sent, []);
    locationEventsFeature.onStreetClear(engine);
  });
});

describe('the server\'s table matches the game', () => {
  test('data/street-sounds.json is current, embedded, and limited as the toy clicks are', { skip: skipWithoutServer }, () => {
    const data = streetSoundsData();
    assert.equal(data.streets[PIANO].length, 66);
    assert.equal(data.streets[LOTHA], undefined);
    assert.equal(readFileSync(serverPath('data', 'street-sounds.json'), 'utf8'), `${JSON.stringify(data, null, 1)}\n`, 'run node tools/build-realtime-street-sounds.mjs');
    const go = readFileSync(serverPath('streetsounds.go'), 'utf8');
    assert.match(go, /\/\/go:embed data\/street-sounds\.json/);
    assert.match(go, /streetSoundEvery = toyClickEvery/);
    assert.match(readFileSync(serverPath('streettoys.go'), 'utf8'), new RegExp(`toyClickEvery\\s+= ${STREET_SOUND_EVERY_MS} \\* time\\.Millisecond`));
  });
});
