/**
 * Lane RACES2 (G349, G334): the challenger's spent race ticket in multiplayer
 * comes back only when the server says the challenge never became a game
 * (race_ticket.js:150, inc_games.js 2448-2450), a reload mid-race ends the
 * race as a logout did (instance.js player_logout), and The Great Hog Haul
 * between real players (js/hog-haul-mp.js, features/hog-haul-mp-feature.js,
 * the server's hoghaul.go and data/hoghaul.json from
 * tools/build-realtime-hoghaul.mjs). Solo is unchanged.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

import { racesFeature } from '../public/js/features/races-feature.js?v=6e095024';
import { hogHaulMpFeature } from '../public/js/features/hog-haul-mp-feature.js?v=087704cd';
import {
  HOG_MP_TEXT,
  atPen,
  carryMap,
  hogLine,
  hogObjective,
  normalizeHogMatch,
  pigPose,
  touches,
} from '../public/js/hog-haul-mp.js?v=d8605396';
import { hogHaulData } from '../tools/build-realtime-hoghaul.mjs';
import { HOG_HAUL_STREET_ID } from '../public/js/hog-haul.js?v=50d2e072';
import { HAS_SERVER, serverPath, skipWithoutServer } from '../tools/repos.mjs';

const root = join(import.meta.dirname, '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');
const TICKET = 'race_ticket_canyon_run';
const HOG_TICKET = 'race_ticket_hogtie_piggy';

function fakeClient() {
  const handlers = new Map();
  return {
    state: 'online',
    street: 'GA5',
    me: { id: 7 },
    players: [{ id: 8, name: 'Bo', x: 0, y: 0 }],
    sent: [],
    on(type, fn) {
      if (!handlers.has(type)) handlers.set(type, []);
      handlers.get(type).push(fn);
    },
    send(kind, payload) {
      this.sent.push({ kind, ...payload });
      return true;
    },
    fire(type, msg) {
      for (const fn of handlers.get(type) || []) fn(msg);
    },
  };
}

function fakeEngine(mode, client) {
  const data = {};
  return {
    mode,
    inv: {},
    pc: { currants: 0 },
    player: { x: 100, y: 500 },
    streetTsid: 'GA5',
    started: false,
    toasts: [],
    data,
    query: (hook) => (hook === 'realtimeClient' ? client : null),
    toast(text) { this.toasts.push(text); },
    updateHud() {},
    save() {},
    setData(k, v) { data[k] = String(v); },
    pushActivity() {},
    prompt() { return 'p1'; },
    removePrompt() {},
    playSound() {},
    placement: () => [],
    transientInstance: () => false,
    homeContext: () => ({ inHome: false }),
    travelGate: () => null,
    param: () => null,
    inScene: () => false,
  };
}

const street = { tsid: 'GA5' };

describe('G349: the challenger\'s ticket in multiplayer', () => {
  const client = fakeClient();
  const engine = fakeEngine('multiplayer', client);

  it('is not given back by a street change (a croak or teleport while the challenge starts)', () => {
    racesFeature.restore({ pendingTicket: TICKET });
    racesFeature.onStreetEnter(street, engine);
    assert.equal(engine.inv[TICKET] || 0, 0, 'entering a street never refunds in multiplayer');
    assert.deepEqual(client.sent.filter((m) => m.kind === 'race_pending'), [{ kind: 'race_pending', course: 'canyon_run' }], 'the page asks the server instead');
    racesFeature.onStreetEnter(street, engine);
    assert.equal(client.sent.filter((m) => m.kind === 'race_pending').length, 1, 'once until it hears');
  });

  it('stays spent when the server says a match was made (race_ticket.js:150)', () => {
    client.fire('msg:race_ticket', { t: 'race_ticket', course: 'canyon_run', refund: false });
    assert.equal(engine.inv[TICKET] || 0, 0);
    assert.equal(racesFeature._state().record.pendingTicket, null);
  });

  it('comes back once when the challenge never became a game (inc_games.js 2448-2450)', () => {
    racesFeature.restore({ pendingTicket: TICKET });
    racesFeature.onStreetEnter(street, engine);
    client.fire('msg:race_ticket', { t: 'race_ticket', course: 'canyon_run', refund: true, text: 'Your race never started, so your ticket was returned.' });
    assert.equal(engine.inv[TICKET], 1);
    client.fire('msg:race_ticket', { t: 'race_ticket', course: 'canyon_run', refund: true });
    client.fire('msg:race_failed', { t: 'race_failed', course: 'canyon_run', refund: true, text: 'x' });
    assert.equal(engine.inv[TICKET], 1, 'never twice');
  });

  it('asks again on a reconnect', () => {
    engine.inv[TICKET] = 0;
    racesFeature.restore({ pendingTicket: TICKET });
    const before = client.sent.filter((m) => m.kind === 'race_pending').length;
    client.fire('hello', { id: 7 });
    assert.equal(client.sent.filter((m) => m.kind === 'race_pending').length, before + 1);
    client.fire('msg:race_ticket', { t: 'race_ticket', course: 'canyon_run', refund: false });
  });

  it('a Great Hog Haul Ticket challenges the real players on the street', () => {
    engine.inv[HOG_TICKET] = 1;
    engine.startHogHaulRace = () => { throw new Error('the solo stand-in must not run in multiplayer'); };
    assert.equal(racesFeature.runPackVerb(HOG_TICKET, 'activate', engine), true);
    assert.deepEqual(client.sent.at(-1), { kind: 'race_challenge', course: 'hogtie_piggy' });
    assert.equal(engine.inv[HOG_TICKET] || 0, 0, 'spent at activation');
    client.fire('msg:race_refused', { t: 'race_refused', why: 'alone', text: 'You need at least one other player here.' });
    assert.equal(engine.inv[HOG_TICKET], 1, 'a refused challenge gives it back');
  });
});

describe('G349: solo keeps its reload rule', () => {
  it('a ticket spent before GO comes back on the next street', () => {
    const engine = fakeEngine('solo', null);
    racesFeature.restore({ pendingTicket: TICKET });
    racesFeature.onStreetEnter(street, engine);
    assert.equal(engine.inv[TICKET], 1);
    assert.deepEqual(engine.toasts, ['Your race never started, so your ticket was returned.']);
  });
});

const MATCH = {
  t: 'race_match', match: '00000000000000b2', street: 'RACE_00000000000000B2', course: 'hogtie_piggy', title: 'The Great Hog Haul',
  game: 'hogtie_piggy', kind: 'pigs', slot: 1, spawn: [1580, 1181], home: HOG_HAUL_STREET_ID, goal: 3, pen: [1435, 1181],
  baits: [[100, 200], [300, 400]], pigs: [[500, 600, 92]], players: [{ id: 7, name: 'Ada', slot: 0 }, { id: 8, name: 'Bo', slot: 1 }], autoLeave: 120,
};

describe('hog-haul-mp: what the server sends', () => {
  it('cleans a match', () => {
    const m = normalizeHogMatch(MATCH);
    assert.equal(m.home, HOG_HAUL_STREET_ID);
    assert.deepEqual(m.pen, { x: 1435, y: 1181 });
    assert.deepEqual(m.pigs, [{ x: 500, y: 600, range: 92 }]);
    assert.equal(m.goal, 3);
    assert.equal(normalizeHogMatch({ ...MATCH, kind: 'finish' }), null);
    assert.equal(normalizeHogMatch({ ...MATCH, street: 'GA5' }), null, 'only a match street');
    assert.equal(normalizeHogMatch({ ...MATCH, players: [MATCH.players[0]] }), null);
    assert.equal(normalizeHogMatch({ ...MATCH, baits: [[1, 'x']] }), null);
  });

  it('says what inc_games.js says when', () => {
    assert.equal(hogLine('bait', 0), 'You have bait, now go get a piggy!');
    assert.equal(hogLine('bait', 2), 'Got bait! Find a pig!');
    assert.equal(hogLine('pig', 0), 'You hogtied a piggy, now take it to the Pig Pen!');
    assert.equal(hogLine('pig', 1), 'Got a pig! Back to the pen!');
    assert.equal(hogLine('pig', 2), '');
    assert.equal(hogLine('pen', 1), 'Nice job! Now, get two more!');
    assert.equal(hogLine('pen', 2), 'Nice job! Now, get one more!');
    assert.equal(hogLine('pen', 3), '');
    assert.equal(HOG_MP_TEXT.needsBait, 'You need bait first!');
    assert.equal(hogObjective('pig'), 'Got a pig! Back to the pen!');
    assert.deepEqual([...carryMap({ 7: 'pig', 8: 'bait', 9: 'x', bad: 'pig' })], [[7, 'pig'], [8, 'bait']]);
  });

  it('paces a Piggy round its spot the same on every client, and touches in the source box', () => {
    const pig = { x: 500, y: 600, range: 92 };
    for (const t of [0, 1234, 99999]) {
      const a = pigPose(pig, 2, t);
      assert.deepEqual(a, pigPose(pig, 2, t));
      assert.ok(Math.abs(a.x - 500) <= 92.0001);
    }
    assert.ok(touches(540, 600, 500, 600));
    assert.ok(!touches(560, 600, 500, 600));
    assert.ok(atPen(1435 + 150, 1181, { x: 1435, y: 1181 }));
    assert.ok(!atPen(1435 + 160, 1181, { x: 1435, y: 1181 }));
  });
});

describe('the Hog Haul layout the server owns', () => {
  it('is current (node tools/build-realtime-hoghaul.mjs)', { skip: skipWithoutServer }, () => {
    const out = execFileSync(process.execPath, [join(root, 'tools/build-realtime-hoghaul.mjs'), '--check'], { encoding: 'utf8' });
    assert.match(out, /is current \(11 baits, 8 piggies\)/);
  });

  it('is solo\'s layout of the same street (game.js setupHogHaulWorld)', async () => {
    const d = await hogHaulData();
    assert.equal(d.street, HOG_HAUL_STREET_ID);
    assert.equal(d.goal, 3);
    assert.equal(d.baits.length, 11);
    assert.equal(d.pigs.length, 8);
    assert.equal(d.spawns.length, 2);
    const game = read('public/game.js');
    assert.match(game, /\{ key: 'raceBaits', count: 11, clearance: 66 \},\n\s+\{ key: 'racePiggies', count: 8, clearance: 92 \},/);
    assert.match(game, /seed: `\$\{HOG_HAUL_STREET_ID\}:race-items`/);
    assert.match(game, /worldToScreen\(currentStreet, -15, -875\)/);
  });
});

describe('the server (races.go + hoghaul.go)', { skip: skipWithoutServer }, () => {
  const races = HAS_SERVER ? readFileSync(serverPath('races.go'), 'utf8') : '';
  const hog = HAS_SERVER ? readFileSync(serverPath('hoghaul.go'), 'utf8') : '';

  it('keeps the source rules', () => {
    assert.match(races, /"hogtie_piggy": \{min: 2, max: 2, name: "The Great Hog Haul"\}/);
    assert.match(hog, /hogBoxHalfW = 50\.0/);
    assert.match(hog, /hogBoxH\s+= 50\.0/);
    assert.match(hog, /hogHaulGoal\s+= 3/);
    assert.ok(hog.includes('"You need bait first!"'));
    assert.match(hog, /creditLocked|m\.end\(mt, &raceRef/);
    assert.ok(races.includes('Your race never started, so your ticket was returned.'));
    assert.match(races, /r\.Handle\("race_pending", m\.pending\)/);
  });
});

describe('the multiplayer Hog Haul stays out of solo', () => {
  it('answers no hook outside a multiplayer haul', () => {
    const solo = fakeEngine('solo', null);
    assert.equal(hogHaulMpFeature.ecologyOverride({ tsid: HOG_HAUL_STREET_ID }), null);
    assert.equal(hogHaulMpFeature.realtimeStreet({ ...solo, streetTsid: HOG_HAUL_STREET_ID }), null);
    assert.equal(hogHaulMpFeature.travelGate(), null);
    assert.equal(hogHaulMpFeature.physics({ ...solo, streetTsid: HOG_HAUL_STREET_ID }), null);
    hogHaulMpFeature.init(solo);
    hogHaulMpFeature.restore({ returnTo: { tsid: 'GA5', x: 1, y: 2 } });
    assert.equal(hogHaulMpFeature.reloadLocation({ tsid: HOG_HAUL_STREET_ID }), null, 'solo reloads are game.js\'s');
    assert.equal(hogHaulMpFeature.labelFor('RACE_00000000000000B2'), null);
  });

  it('the solo ticket and the quest still run the stand-in', () => {
    const src = read('public/js/features/races-feature.js');
    assert.match(src, /if \(isMp\(engine\) && raceId === HOG_HAUL_GAME_ID\) return mpChallenge\(classTsid, raceId, engine\);/);
    assert.match(src, /if \(raceId === HOG_HAUL_GAME_ID\) return activateHogHaul\(classTsid, engine, opts\);/);
    const feat = read('public/js/features/hog-haul-mp-feature.js');
    assert.match(feat, /onStreetEnter\(street, engine\) \{\n    if \(engine\.mode !== 'multiplayer'\) return;/);
  });

  it('is registered before street-objects', () => {
    const idx = read('public/js/features/index.js');
    assert.ok(idx.indexOf('hogHaulMpFeature') > 0 && idx.indexOf('hogHaulMpFeature') < idx.indexOf('streetObjectsFeature'));
  });
});
