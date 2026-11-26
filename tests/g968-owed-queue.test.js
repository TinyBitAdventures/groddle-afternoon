/**
 * G968 (root R10): one owed queue for every counted report. A count reported to the realtime
 * server (feat_add) is kept in the save until the server answers it, asked again after a failed
 * send, a dropped socket or a pace refusal, under an id the server remembers (groddle-afternoon-server
 * feats.go featReport), so it lands once. The per-animal cap is spent only when the server accepts.
 * The server's own tests: feats_ids_test.go.
 * Run: node --test tests/g968-owed-queue.test.js
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { MP_ACTS, MP_ORDER, MP_PACE, RUN_MS } from '../public/js/feats-mp.js?v=49ed2393';
import {
  OWED_ANSWER_MS,
  OWED_MAX,
  OWED_OFFLINE_MS,
  OWED_RETRY_MAX_MS,
  createOwed,
  oweReport,
  owedRestore,
  owedSave,
  retryDelay,
} from '../public/js/feat-owed.js?v=ef5e6463';
import { soloFeatsFeature } from '../public/js/features/solo-feats-feature.js?v=18e0411f';

const root = join(import.meta.dirname, '..');
const RUN = 5400;

function jsFiles(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'vendor' || name === 'node_modules' || name.startsWith('.')) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) jsFiles(p, out);
    else if (/\.m?js$/.test(name)) out.push(p);
  }
  return out;
}

/**
 * A stand-in for feats.go add with report ids: a bucket the test fills (`allow`), each id's done
 * and want, "dup" once done. It counts into `total`, so a test can see a count land once.
 */
function fakeServer(feat) {
  const ids = new Map();
  const srv = {
    feat,
    allow: Infinity,
    total: 0,
    answer(add) {
      const base = { t: 'feat_counted', feat: add.feat, run: RUN, id: add.id };
      if (add.street) base.street = add.street;
      if (add.feat !== srv.feat) return { ...base, n: 0, reason: 'not_today' };
      const rep = ids.get(add.id);
      if (rep && rep.done >= rep.want) return { ...base, n: 0, reason: 'dup', done: rep.done, want: rep.want };
      const act = MP_ACTS[add.feat]?.[add.act];
      const want = rep ? rep.want : (act ? act.n : add.n);
      const n = Math.min(want - (rep?.done || 0), srv.allow);
      if (n <= 0) return { ...base, n: 0, reason: 'pace', done: rep?.done || 0, want };
      srv.allow -= n;
      const r = rep || { done: 0, want };
      r.done += n;
      ids.set(add.id, r);
      srv.total += n;
      return { ...base, n, done: r.done, want, total: srv.total, mine: srv.total, place: 1 };
    },
  };
  return srv;
}

/** A realtime client wired to the stand-in: online or not, answers delivered or lost. */
function wiredClient(srv) {
  const listeners = new Map();
  const c = {
    state: 'online',
    me: { id: 7, name: 'Ada' },
    up: true,
    sent: [],
    queue: [],
    on(type, fn) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(fn);
      return () => listeners.get(type).delete(fn);
    },
    send(kind, payload) {
      if (!c.up) return false;
      c.sent.push({ kind, ...payload });
      if (kind === 'feat_add') c.queue.push(payload);
      return true;
    },
    deliver(msg) {
      for (const fn of listeners.get(`msg:${msg.t}`) || []) fn(msg);
    },
    emit(type) {
      for (const fn of listeners.get(type) || []) fn();
    },
    /** The server takes every report sent; lose: the answers never come back (the socket dropped). */
    pump({ lose = false } = {}) {
      while (c.queue.length) {
        const msg = srv.answer(c.queue.shift());
        if (!lose) c.deliver(msg);
      }
    },
    state0(feat, clock) {
      c.deliver({ t: 'feat_state', now: clock, run: RUN, feat, start: clock - 60_000, end: clock + RUN_MS, total: srv.total, goal: 30, bonus: 60, super: 90, tier: 0, count: 0, mine: srv.total, place: 0, top: [] });
    },
  };
  return c;
}

function mpEngine(client) {
  return {
    mode: 'multiplayer',
    started: true,
    inv: {},
    pc: { currants: 0, mood: 10, energy: 10, xp: 0, giantFavor: {} },
    player: { x: 0, y: 0 },
    streetTsid: 'GA5101HF7F429V5',
    questState: { completed: [], doneAt: {} },
    quoinState: { qurazyFound: 0 },
    hasBuff: () => false,
    inScene: () => false,
    param: () => null,
    query: (name) => (name === 'realtimeClient' ? client : null),
    achievement() {},
    grantAchievement: () => true,
    award() {},
    pushActivity() {},
    toast() {},
    refreshPack() {},
    playSound() {},
    save() {},
    setData() {},
  };
}

/** One report for this Feat the way the game makes it (an act and a street where the server needs one). */
function reportOne(feat, engine, i = 0) {
  const acts = MP_ACTS[feat];
  const act = acts ? Object.keys(acts)[0] : '';
  const opts = act ? { act, street: `GA5101HF7F42${String(i).padStart(3, '0')}` } : {};
  soloFeatsFeature.featsIncrement(feat, 1, opts, engine);
}

function withClock(fn) {
  const realNow = Date.now;
  const t = { clock: realNow(), now: 0 };
  Date.now = () => t.clock;
  try {
    return fn(t);
  } finally {
    Date.now = realNow;
  }
}

describe('every counted report goes through the owed queue (G968)', () => {
  it('feat_add is sent from one place only, the queue\'s flush', () => {
    const hits = [];
    for (const f of [...jsFiles(join(root, 'public/js')), join(root, 'public/game.js')]) {
      const src = readFileSync(f, 'utf8');
      const n = src.split("'feat_add'").length - 1 + src.split('"feat_add"').length - 1;
      if (n) hits.push(`${relative(root, f)}:${n}`);
    }
    assert.deepEqual(hits, ['public/js/features/solo-feats-feature.js:1'], 'a counted report that bypasses the queue');
    const feature = readFileSync(join(root, 'public/js/features/solo-feats-feature.js'), 'utf8');
    const flush = feature.slice(feature.indexOf('function flushOwed('), feature.indexOf('\nfunction ', feature.indexOf('function flushOwed(') + 1));
    assert.match(flush, /s\.client\.send\('feat_add', next\.report\)/);
    const report = feature.slice(feature.indexOf('function mpReport('), feature.indexOf('\nfunction ', feature.indexOf('function mpReport(') + 1));
    assert.doesNotMatch(report, /\.send\(/, 'mpReport owes; only flushOwed sends');
    assert.match(report, /oweReport\(owed, /);
  });

  for (const feat of MP_ORDER) {
    it(`${feat}: an offline, a paced and a lost report each land once`, () => withClock((t) => {
      const srv = fakeServer(feat);
      const client = wiredClient(srv);
      const engine = mpEngine(client);
      const tick = (ms) => { t.clock += ms; t.now += ms; soloFeatsFeature.onTick(16, t.now, engine); };
      soloFeatsFeature.init(engine);
      soloFeatsFeature.restore({}, engine);
      soloFeatsFeature.onStreetEnter({ tsid: engine.streetTsid }, engine);
      client.state0(feat, t.clock);
      // Offline: the send is refused; owed, and tried again after OWED_OFFLINE_MS.
      client.up = false;
      reportOne(feat, engine, 1);
      assert.equal(soloFeatsFeature.save().owed.length, 1);
      client.up = true;
      tick(OWED_OFFLINE_MS + 600);
      client.pump();
      assert.equal(srv.total, MP_ACTS[feat] ? Object.values(MP_ACTS[feat])[0].n : 1);
      const one = srv.total;
      assert.equal(soloFeatsFeature.save().owed.length, 0);
      // Paced: refused, kept, asked again after the pace interval, counted once.
      srv.allow = 0;
      reportOne(feat, engine, 2);
      client.pump();
      assert.equal(srv.total, one);
      assert.equal(soloFeatsFeature.save().owed.length, 1);
      srv.allow = Infinity;
      tick(500);
      assert.equal(client.queue.length, 0, 'not asked again before the pace interval');
      tick(retryDelay(feat, one) + 600);
      client.pump();
      assert.equal(srv.total, 2 * one);
      // Lost: the server counted it but the answer never came; asked again under the same id: dup.
      reportOne(feat, engine, 3);
      client.pump({ lose: true });
      assert.equal(srv.total, 3 * one);
      client.emit('hello');
      client.state0(feat, t.clock);
      client.pump();
      assert.equal(srv.total, 3 * one, 'no double count');
      assert.equal(soloFeatsFeature.save().owed.length, 0);
      const ids = client.sent.filter((m) => m.kind === 'feat_add').map((m) => m.id);
      assert.equal(ids.at(-1), ids.at(-2));
    }));
  }

  it('an answer that never comes is asked again under the same id', () => withClock((t) => {
    const srv = fakeServer('animal_love');
    const client = wiredClient(srv);
    const engine = mpEngine(client);
    const tick = (ms) => { t.clock += ms; t.now += ms; soloFeatsFeature.onTick(16, t.now, engine); };
    soloFeatsFeature.init(engine);
    soloFeatsFeature.restore({}, engine);
    soloFeatsFeature.onStreetEnter({ tsid: engine.streetTsid }, engine);
    client.state0('animal_love', t.clock);
    reportOne('animal_love', engine);
    client.pump({ lose: true });
    tick(OWED_ANSWER_MS - 1000);
    assert.equal(client.queue.length, 0);
    tick(1600);
    assert.equal(client.queue.length, 1);
    client.pump();
    assert.equal(srv.total, 1);
    assert.equal(soloFeatsFeature.save().owed.length, 0);
  }));

  it('a reload keeps what is owed and lands it once', () => withClock((t) => {
    const srv = fakeServer('tottlys_toys');
    const client = wiredClient(srv);
    const engine = mpEngine(client);
    soloFeatsFeature.init(engine);
    soloFeatsFeature.restore({}, engine);
    soloFeatsFeature.onStreetEnter({ tsid: engine.streetTsid }, engine);
    client.state0('tottlys_toys', t.clock);
    // Two reports: the first counted with its answer lost, the second never sent (offline).
    reportOne('tottlys_toys', engine);
    client.pump({ lose: true });
    client.up = false;
    soloFeatsFeature.featsIncrement('tottlys_toys', 4, {}, engine);
    const saved = JSON.parse(JSON.stringify(soloFeatsFeature.save()));
    assert.equal(saved.owed.length, 2);
    assert.equal(srv.total, 1);
    // The page loads again from that save.
    const client2 = wiredClient(srv);
    const engine2 = mpEngine(client2);
    soloFeatsFeature.init(engine2);
    soloFeatsFeature.restore(saved, engine2);
    soloFeatsFeature.onStreetEnter({ tsid: engine2.streetTsid }, engine2);
    t.clock += 1000;
    client2.state0('tottlys_toys', t.clock);
    client2.pump();
    client2.pump();
    assert.equal(srv.total, 5, 'one counted before, four now, none twice');
    assert.deepEqual(soloFeatsFeature.save().owed, []);
  }));

  it('spends a per-animal cap only when the server accepts', () => withClock((t) => {
    const srv = fakeServer('animal_love');
    const client = wiredClient(srv);
    const engine = mpEngine(client);
    soloFeatsFeature.init(engine);
    soloFeatsFeature.restore({}, engine);
    soloFeatsFeature.onStreetEnter({ tsid: engine.streetTsid }, engine);
    client.state0('animal_love', t.clock);
    client.up = false;
    const hug = () => soloFeatsFeature.featsIncrement('animal_love', 1, { cap: { key: 'crab:GA5:hug', max: 1 } }, engine);
    hug();
    hug(); // the owed one holds the cap's one place
    let save = soloFeatsFeature.save();
    assert.equal(save.owed.length, 1);
    assert.deepEqual(save.caps, {}, 'not spent on a failed send');
    // A paced refusal does not spend it either.
    client.up = true;
    srv.allow = 0;
    t.clock += OWED_OFFLINE_MS + 600;
    t.now += OWED_OFFLINE_MS + 600;
    soloFeatsFeature.onTick(16, t.now, engine);
    client.pump();
    assert.deepEqual(soloFeatsFeature.save().caps, {});
    srv.allow = Infinity;
    t.clock += OWED_RETRY_MAX_MS;
    t.now += OWED_RETRY_MAX_MS;
    soloFeatsFeature.onTick(16, t.now, engine);
    client.pump();
    save = soloFeatsFeature.save();
    assert.deepEqual(save.caps, { 'crab:GA5:hug': 1 });
    assert.equal(srv.total, 1);
    hug();
    assert.equal(soloFeatsFeature.save().owed.length, 0, 'at its cap');
  }));
});

describe('the queue itself (js/feat-owed.js)', () => {
  it('merges plain reports never asked, keeps acts and caps apart, and is bounded', () => {
    const q = createOwed();
    const run = { feat: 'animal_love', run: RUN, start: 0 };
    const a = oweReport(q, { feat: 'animal_love', n: 1 }, run, 10);
    oweReport(q, { feat: 'animal_love', n: 2 }, run, 11);
    assert.equal(q.list.length, 1);
    assert.equal(a.n, 3);
    a.asked = true;
    oweReport(q, { feat: 'animal_love', n: 1 }, run, 12);
    oweReport(q, { feat: 'animal_love', n: 1, cap: { key: 'kitty:x', max: 3 } }, run, 13);
    assert.equal(q.list.length, 3);
    assert.equal(oweReport(q, { feat: 'pet_only', n: 1 }, run, 14), null, 'not today\'s Feat');
    for (let i = 0; i < OWED_MAX + 20; i += 1) oweReport(q, { feat: 'animal_love', n: 1, cap: { key: `k${i}`, max: 1 } }, run, 20 + i);
    assert.equal(q.list.length, OWED_MAX);
  });

  it('restores only well-formed reports', () => {
    const q = createOwed();
    oweReport(q, { feat: 'streaking', n: 1, act: 'streak', street: 'GA5101HF7F429V5' }, null, 5);
    const good = owedSave(q);
    const back = owedRestore([...good, good[0], { id: 'x', feat: 'animal_love', n: 1 }, { id: 'fo-aaaaaaaaaa', feat: 'animal_love', n: 0 }, { id: 'fo-bbbbbbbbbb', feat: 'animal_love', run: 'pet_only:3', n: 1 }, { id: 'fo-cccccccccc', feat: 'animal_love', n: 1, street: '<b>' }, null]);
    assert.deepEqual(owedSave(back), good);
  });

  it('waits the server\'s pace before asking again (feats-mp.js MP_PACE)', () => {
    assert.equal(retryDelay('reminscequests', 1), 60_000);
    assert.equal(retryDelay('reminscequests', 9), 180_000, 'what the bucket holds of it');
    assert.equal(retryDelay('qurazy_quoin_collecting', 1), OWED_RETRY_MAX_MS);
    assert.equal(retryDelay('animal_love', 1), Math.ceil(MP_PACE.animal_love.everyMs / MP_PACE.animal_love.n));
  });
});
