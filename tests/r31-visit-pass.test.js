/**
 * R31, player report #522: a visitor petting, watering or harvesting on another player's home
 * street read "You need to be on their home street to do that." while the verb seemed to work.
 * The site signs a visit pass for 30 minutes (groddle-afternoon-site src/Neighbours.php PASS_TTL)
 * and the realtime server keeps it only for the socket it came on (homes.go disconnected). After a
 * reconnect, or a walk out of the house once it had run out, the server refused the rejoin
 * (homes.go gate: home_private), the game sent the same expired pass again, ignored the "homes"
 * refusal of it, and the server kept the visitor on their last street (hub.go joinLocked), so
 * every yard verb was refused (home_yard.go "away") while the game kept its local result.
 * Now the game fetches a fresh pass (the visit's own site route) before the old one runs out and
 * whenever the server refuses one, then rejoins; a yard verb the server refuses is undone on the
 * visitor's side. Glitch had no pass and ran the verbs on the server (trant_egg.js 462-600).
 *
 * Run: node --test tests/r31-visit-pass.test.js
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  VISIT_PASS_EARLY_MS,
  VISIT_PASS_RETRY_MS,
  VISIT_PASS_TRIES,
  createVisitPassKeeper,
  normalizeHomeView,
  visitPassTtl,
} from '../public/js/neighbours-mp.js?v=55e3976b';
import { undoVisitorReward, visitorRewardDelta, visitorRewardSnapshot } from '../public/js/yard-verbs-mp.js?v=0b35651e';
import { neighboursMpFeature } from '../public/js/features/neighbours-mp-feature.js?v=0a0dc63b';
import { Display, FakeEl, fakePixi } from './fake-scene.js';

const root = join(import.meta.dirname, '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');
const wait = (ms = 0) => new Promise((r) => setTimeout(r, ms));
const MIN = 60 * 1000;

describe('R31: the visit pass is kept good (js/neighbours-mp.js createVisitPassKeeper)', () => {
  function rig({ fail = null } = {}) {
    let t = 1_000_000;
    const log = [];
    let n = 0;
    const keeper = createVisitPassKeeper({
      now: () => t,
      fetchView: async (owner) => {
        log.push(`fetch:${owner}`);
        if (fail) throw fail;
        n += 1;
        return { owner: { id: owner }, pass: `pass${n}`, passTtl: 1800 };
      },
      onView: (owner, view) => log.push(`view:${owner}:${view.pass}`),
      onGone: (owner, err) => log.push(`gone:${owner}:${err.code}`),
      onLost: (owner) => log.push(`lost:${owner}`),
    });
    return { keeper, log, step: (ms) => { t += ms; } };
  }

  it('reads the site\'s pass life (30 minutes when it does not say, an hour at most)', () => {
    assert.equal(normalizeHomeView({ owner: { id: 7, name: 'Ada' }, home: { owned: true }, pass: { token: 'a.b', expiresIn: 1800 } }).passTtl, 1800);
    assert.equal(normalizeHomeView({ owner: { id: 7, name: 'Ada' }, home: { owned: true } }).passTtl, 0, 'no pass, no life');
    assert.equal(visitPassTtl(undefined), 1800);
    assert.equal(visitPassTtl(99999), 3600);
  });

  it('asks the site for a fresh pass before the old one runs out, not before', async () => {
    const { keeper, log, step } = rig();
    keeper.start(7, { pass: 'pass0', passTtl: 1800 });
    step(20 * MIN);
    keeper.tick();
    assert.deepEqual(log, [], 'twenty minutes in: still good');
    step(30 * MIN - VISIT_PASS_EARLY_MS - 20 * MIN);
    keeper.tick();
    await wait();
    assert.deepEqual(log, ['fetch:7', 'view:7:pass1'], 'five minutes before it runs out: a fresh one');
    keeper.accepted();
    keeper.tick();
    await wait();
    assert.equal(log.length, 2, 'and none again until that one is old');
  });

  it('a refused street with a fresh pass sends it again; a refused pass, or an old one, asks for a new one', async () => {
    const { keeper, log, step } = rig();
    keeper.start(7, { pass: 'pass0', passTtl: 1800 });
    assert.equal(keeper.refused('home_private'), 'resend');
    assert.deepEqual(log, []);
    // #522: the server refused the pass itself (expired after a reconnect): a new one, not the same.
    assert.equal(keeper.refused('homes'), 'renew');
    await wait();
    assert.deepEqual(log, ['fetch:7', 'view:7:pass1']);
    keeper.accepted();
    // A walk out of the house past the pass's life: home_private with an old pass.
    step(31 * MIN);
    assert.equal(keeper.refused('home_private'), 'renew');
    await wait();
    assert.deepEqual(log.slice(2), ['fetch:7', 'view:7:pass2']);
  });

  it('asks the site at most once a while, and gives up after a few the server never took', async () => {
    const { keeper, log, step } = rig();
    keeper.start(7, { pass: 'pass0', passTtl: 1800 });
    keeper.refused('homes');
    keeper.refused('homes');
    await wait();
    assert.equal(log.filter((l) => l.startsWith('fetch')).length, 1, 'one ask for two refusals together');
    for (let i = 1; i < VISIT_PASS_TRIES; i += 1) {
      step(VISIT_PASS_RETRY_MS);
      keeper.refused('homes');
      await wait();
    }
    assert.equal(log.filter((l) => l.startsWith('fetch')).length, VISIT_PASS_TRIES);
    step(VISIT_PASS_RETRY_MS);
    keeper.refused('homes');
    step(VISIT_PASS_RETRY_MS);
    keeper.refused('homes');
    await wait();
    assert.deepEqual(log.filter((l) => l.startsWith('lost')), ['lost:7'], 'told once');
    assert.equal(log.filter((l) => l.startsWith('fetch')).length, VISIT_PASS_TRIES, 'and no more asks');
  });

  it('the site refusing the visit now (blocked since) ends it; a network failure is tried again later', async () => {
    const blocked = Object.assign(new Error('You are blocked by that player.'), { code: 'groddle_home_blocked' });
    const a = rig({ fail: blocked });
    a.keeper.start(7, { pass: 'pass0', passTtl: 1800 });
    a.keeper.refused('homes');
    await wait();
    assert.deepEqual(a.log, ['fetch:7', 'gone:7:groddle_home_blocked']);
    assert.equal(a.keeper.owner, 0);
    const b = rig({ fail: new Error('offline') });
    b.keeper.start(7, { pass: 'pass0', passTtl: 1800 });
    b.keeper.refused('homes');
    await wait();
    assert.deepEqual(b.log, ['fetch:7']);
    assert.equal(b.keeper.owner, 7, 'still visiting');
  });

  it('a stopped or replaced visit takes no late answer', async () => {
    const { keeper, log } = rig();
    keeper.start(7, { pass: 'pass0', passTtl: 1800 });
    keeper.refused('homes');
    keeper.start(8, { pass: 'other', passTtl: 1800 });
    await wait();
    assert.deepEqual(log, ['fetch:7'], 'the answer for 7 is dropped');
  });
});

describe('R31: the visit feature renews and rejoins (features/neighbours-mp-feature.js)', () => {
  const saved = {};
  let engine;
  let client;
  let fetched = 0;
  const toasts = [];

  function fakeClient() {
    const listeners = new Map();
    const sent = [];
    const joins = [];
    return {
      state: 'online',
      me: { id: 1, name: 'Bo' },
      wanted: 'HOME_7',
      sent,
      joins,
      on(type, fn) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(fn); return () => listeners.get(type).delete(fn); },
      emit(type, payload) { for (const fn of listeners.get(type) || []) fn(payload); },
      send(kind, payload = {}) { sent.push({ t: kind, ...payload }); return true; },
      join(m) { joins.push(m.street); return true; },
      passes() { return sent.filter((m) => m.t === 'home_pass').map((m) => m.token); },
    };
  }

  before(() => {
    for (const k of ['document', 'fetch', 'groddleNeighbours', 'GRODDLE_MP_BOOT', 'PIXI']) saved[k] = globalThis[k];
    globalThis.document = { baseURI: 'https://groddle.localhost/', createElement: (t) => new FakeEl(t), createTextNode: (t) => ({ text: t }), head: new FakeEl('head'), body: new FakeEl('body'), getElementById: () => null, querySelector: () => null };
    globalThis.GRODDLE_MP_BOOT = { nonce: 'abcdef0123' };
    globalThis.PIXI = fakePixi;
    globalThis.fetch = async (url) => {
      if (!String(url).startsWith('https://groddle.localhost/wp-json/')) return { status: 404, ok: false, headers: { get: () => null }, json: async () => null };
      const path = String(url).replace('https://groddle.localhost/wp-json/groddle/v1/', '');
      if (path === 'homes/7') {
        fetched += 1;
        const out = { owner: { id: 7, name: 'Ada' }, home: { owned: true, style: 'meadow' }, homes: { decor: { placed: [] }, cult: { items: [] } }, key: false, pass: { token: `pass${fetched}.sig`, expiresIn: 1800 }, butler: null };
        return { status: 200, ok: true, headers: { get: () => null }, json: async () => out };
      }
      const out = path === 'homes/visitors' ? { allow: false } : { given: [], received: [] };
      return { status: 200, ok: true, headers: { get: () => null }, json: async () => out };
    };
    client = fakeClient();
    const entityLayer = new Display();
    engine = {
      mode: 'multiplayer',
      started: true,
      PIXI: fakePixi,
      entityLayer,
      groundY: 870,
      streetTsid: 'GLI32N0F1UD114O',
      street: { label: 'Archimedes Acres', hubName: 'Groddle Meadow' },
      player: { x: 100, y: 870, facing: 'right' },
      interactables: [],
      query: (hook) => (hook === 'realtimeClient' ? client : null),
      param: () => null,
      homeContext: () => ({ inHome: false, room: 'street' }),
      transientInstance: () => false,
      setData() {},
      toast: (t) => toasts.push(t),
      pushActivity() {},
      achievement() {},
      say() {},
      register(t) { engine.interactables.push(t); return t; },
      clear() {
        for (const s of [...entityLayer.children]) entityLayer.removeChild(s);
        neighboursMpFeature.onStreetClear?.(engine);
        engine.interactables = [];
      },
      enterScene(scene) { engine.clear(); engine.streetTsid = scene.tsid; },
      async enter(tsid) { engine.clear(); engine.streetTsid = tsid; neighboursMpFeature.onStreetEnter(engine.street, engine); },
    };
    neighboursMpFeature.onTick(16, 0, engine);
  });

  after(() => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete globalThis[k];
      else globalThis[k] = v;
    }
  });

  it('#522: after a reconnect the expired pass is refused; a fresh one is fetched, then the street is joined again', async () => {
    await wait(5);
    const session = globalThis.groddleNeighbours;
    assert.ok(session, 'the session started');
    assert.equal(await session.visitHome(7), true);
    assert.deepEqual(client.passes(), ['pass1.sig']);
    // A new socket: the game sends the pass it has; the server refuses it (expired), then the join.
    client.emit('hello', client.me);
    client.emit('error', { code: 'homes', message: 'that token has expired' });
    client.emit('error', { code: 'home_private', message: 'Visit their home street from the game first.' });
    await wait(5);
    assert.equal(fetched, 2, 'the visit\'s own site route again');
    assert.deepEqual(client.passes(), ['pass1.sig', 'pass1.sig', 'pass2.sig'], 'the fresh pass goes to the server');
    assert.deepEqual(client.joins, [], 'not before the server takes it');
    client.emit('msg:home_pass_ok', { owner: 7, key: false });
    assert.deepEqual(client.joins, ['HOME_7'], 'then the home street again');
    assert.equal(toasts.filter((t) => /reached/.test(t)).length, 0, 'nothing said');
  });

  it('a yard verb refused as "away" asks for the street again (neighboursRejoin)', () => {
    client.joins.length = 0;
    assert.equal(neighboursMpFeature.neighboursRejoin(8, engine), null, 'not the home visited');
    assert.equal(neighboursMpFeature.neighboursRejoin(7, engine), true);
    assert.equal(client.passes().at(-1), 'pass2.sig', 'the pass, still fresh, again');
    client.emit('msg:home_pass_ok', { owner: 7, key: false });
    assert.deepEqual(client.joins, ['HOME_7']);
  });

  it('renews on its own before the pass runs out', async () => {
    const realNow = Date.now;
    const base = realNow();
    try {
      Date.now = () => base + 26 * MIN;
      neighboursMpFeature.onTick(16, 0, engine);
      await wait(5);
      assert.equal(fetched, 3);
      assert.equal(client.passes().at(-1), 'pass3.sig');
    } finally {
      Date.now = realNow;
    }
  });
});

describe('R31: a refused yard verb keeps nothing (js/yard-verbs-mp.js, features/yard-verbs-mp-feature.js)', () => {
  it('takes back what the verb gave and gives back the energy it cost', () => {
    const inv = { cherry: 2, hoe: 1 };
    const pc = { energy: 100, mood: 50, imagination: 10, xp: 10, level: 3 };
    const before = visitorRewardSnapshot(inv, pc);
    // A harvest: 3 Cherries, 4 energy, 2 mood, 1 iMG.
    inv.cherry += 3;
    pc.energy -= 4;
    pc.mood += 2;
    pc.imagination += 1;
    pc.xp += 1;
    const delta = visitorRewardDelta(before, visitorRewardSnapshot(inv, pc));
    assert.deepEqual(delta, { items: { cherry: 3 }, stats: { energy: -4, mood: 2, imagination: 1, xp: 1 } });
    inv.cherry -= 1; // one eaten since
    assert.deepEqual(undoVisitorReward(inv, pc, delta), { cherry: 3 });
    assert.deepEqual(inv, { cherry: 1, hoe: 1 });
    assert.deepEqual(pc, { energy: 100, mood: 50, imagination: 10, xp: 10, level: 3 });
  });

  it('a verb that changed nothing has nothing to undo; a level it raised keeps its XP', () => {
    const pc = { energy: 5, mood: 5, imagination: 0, xp: 99, level: 1 };
    assert.equal(visitorRewardDelta(visitorRewardSnapshot({}, pc), visitorRewardSnapshot({}, pc)), null);
    const before = visitorRewardSnapshot({}, pc);
    const after = visitorRewardSnapshot({}, { ...pc, xp: 101, imagination: 2, level: 2 });
    assert.deepEqual(visitorRewardDelta(before, after), { items: {}, stats: { imagination: 2 } });
  });

  it('the feature notes what each tree, animal and Patch verb gave and undoes it on a refusal', () => {
    const src = read('public/js/features/yard-verbs-mp-feature.js');
    const override = src.slice(src.indexOf('  runVerbOverride(target, verbId, engine) {'), src.indexOf('  sharedVerbGrant('));
    assert.match(override, /session\.beforeVerb\(v\);\s*return null;/, 'a tree or animal verb notes what the visitor held first');
    assert.match(src, /send\('plot', e\.key, verbId, visitorRewardDelta\(before, held\(\)\)\)/, 'a Patch verb carries what it gave');
    assert.match(src, /send\('tree', tr\.key, verb, carry\(`tree:\$\{tr\.key\}`\)\)/);
    assert.match(src, /send\('animal', a\.id, verb, carry\(`animal:\$\{a\.id\}`\)\)/);
    const done = src.slice(src.indexOf("client.on('msg:home_yard_done'"), src.indexOf("client.on('msg:home_yard_acted'"));
    const refused = done.slice(done.lastIndexOf('} else {'));
    assert.ok(refused.indexOf('undoReward(ask)') >= 0 && refused.indexOf('undoReward(ask)') < refused.indexOf('notice('), 'undone first');
    assert.match(refused, /msg\.why === 'away' && engine\.query\?\.\('neighboursRejoin'/, '"away" rejoins instead of the server\'s line');
  });
});
