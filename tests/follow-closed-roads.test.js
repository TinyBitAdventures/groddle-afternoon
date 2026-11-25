/**
 * #549 (Austin 2026-11-19, root issue R11): following a friend onto a street still being built.
 * Online a street you have stood on stays open for you (#294), and follow ignored closed roads, so
 * following someone onto an unbuilt street got you in and then kept it open. Glitch refused every
 * way onto a job-locked street (locations/inc_jobs.js jobs_modify_connections 578-603,
 * players/inc_teleportation.js 219-223). Follow is refused now with the signpost's line; a street
 * the follower has already stood on stays open; the leader's own roads are untouched.
 */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { applyStreetIndex } from '../public/js/street-loader.js?v=10376267';
import { streetJobsFeature } from '../public/js/features/street-jobs-feature.js?v=782d36a0';
import { followMpFeature } from '../public/js/features/follow-mp-feature.js?v=7ca5d0c4';

const PUB = new URL('../public/', import.meta.url);
const read = (rel) => readFileSync(new URL(rel, PUB), 'utf8');

describe('#549: the travel gate refuses a follow onto a street still being built', () => {
  const realFetch = globalThis.fetch;
  const engine = {
    started: true,
    mode: 'solo',
    streetTsid: 'GLI2V0UN7RD1T2J',
    questState: { active: {}, done: {} },
    param: () => null,
    setData() {},
    save() {},
    updateHud() {},
  };
  let closed = null;
  let index = null;
  before(async () => {
    globalThis.fetch = async (url) => ({ ok: true, json: async () => JSON.parse(read(String(url).split('?')[0])) });
    index = JSON.parse(read('assets/streets/index.json'));
    applyStreetIndex(index);
    streetJobsFeature.init(engine);
    streetJobsFeature.restore({}, engine);
    for (let i = 0; i < 300 && !closed?.length; i += 1) {
      closed = streetJobsFeature.closedRoads(engine);
      if (!closed?.length) await new Promise((r) => setTimeout(r, 10));
    }
  });
  after(() => {
    globalThis.fetch = realFetch;
  });

  it('a follow onto a closed street is refused with the line a signpost gives', () => {
    const shut = closed.filter((t) => index.streets[t]);
    assert.ok(shut.length >= 2, 'a fresh world has closed streets');
    for (const t of shut.slice(0, 5)) {
      const gate = streetJobsFeature.travelGate(t, engine, { via: 'follow' });
      assert.equal(gate?.ok, false, t);
      assert.match(gate.msg, /^The road to .+ is still under construction\./);
      assert.equal(gate.msg, streetJobsFeature.streetUnderConstruction(t, engine).road, 'the signpost line');
    }
  });

  it('a street the follower has already stood on stays open for them', () => {
    const [mine, other] = closed.filter((t) => index.streets[t]);
    streetJobsFeature.restore({ initialized: true, grandfathered: [mine] }, engine);
    assert.equal(streetJobsFeature.travelGate(mine, engine, { via: 'follow' }), null);
    assert.equal(streetJobsFeature.travelGate(other, engine, { via: 'follow' })?.ok, false);
    streetJobsFeature.restore({}, engine);
  });

  it('game.js sends the follow through the travel gate as a follow', () => {
    const game = read('game.js');
    assert.match(game, /travel: \(tsid, meta = \{\}\) => travelTo\(tsid, \{ via: 'signpost', \.\.\.meta \}\)/);
    assert.match(game, /features\.travelGate\(toTsid, engine, \{ via: meta\.via \}\)/);
    assert.match(read('js/features/follow-mp-feature.js'), /engine\.travel\?\.\(go\.street, \{ via: 'follow'/);
  });
});

describe('#549: a refused follow ends the follow without "lost sight"', () => {
  globalThis.window ??= { addEventListener() {} };
  const listeners = new Map();
  const sent = [];
  const client = {
    me: { id: 1, name: 'Ada' },
    on(type, fn) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(fn); return () => {}; },
    msg(m) { for (const fn of listeners.get(`msg:${m.t}`) || []) fn(m); },
    send(kind, payload) { sent.push([kind, payload]); return true; },
  };
  const log = { activity: [], toasts: [], travels: [], data: {} };
  globalThis.groddleRealtime = { remotes: new Map() };
  const engine = {
    mode: 'multiplayer',
    started: true,
    streetTsid: 'GA5A',
    player: { x: 100, y: -100, vx: 0, vxMax: 4.4 },
    unlockedAchievements: [],
    query: (hook) => (hook === 'realtimeClient' ? client : null),
    prompt: () => 'p1',
    removePrompt() {},
    pushActivity(text) { log.activity.push(text); },
    toast(text) { log.toasts.push(text); },
    setData(k, v) { log.data[k] = String(v); },
    streetExists: () => true,
    // game.js travelTo: the street jobs gate refused (it toasts the closed road's line itself).
    travel(tsid, meta) { log.travels.push([tsid, meta]); return Promise.resolve({ ok: false, reason: 'feature_gate' }); },
    save() {},
  };

  it('stops following and says the leader went where you cannot follow', async () => {
    followMpFeature.onTick(16, Date.now(), engine);
    client.msg({ t: 'follow_started', id: 2, name: 'Bo', streets: 1 });
    client.msg({ t: 'follow_go', id: 2, name: 'Bo', street: 'GA5B', x: 300, y: -80, dir: 1, via: 'walk' });
    await new Promise((r) => setImmediate(r));
    assert.equal(log.travels.at(-1)[1].via, 'follow');
    assert.deepEqual(sent.at(-1), ['follow_stop', {}]);
    assert.equal(log.activity.at(-1), "Bo went somewhere you can't follow.");
    assert.ok(!log.toasts.some((t) => /lost sight/.test(t)), 'the closed road line is not covered by another toast');
    assert.equal(engine.streetTsid, 'GA5A', 'still on the street you were on');
  });
});
