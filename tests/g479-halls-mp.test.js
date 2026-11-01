/**
 * G479: the Bureaucratic Halls' bureaucrats shared between real players. The
 * pure client side (js/halls-mp.js), the hall visit with the server deciding
 * the bureaucrats (js/bureaucratic-hall.js createHallFlow `shared`), the
 * server's hall data (tools/build-realtime-halls.mjs, data/halls.json) and
 * rules (halls.go; skipped without the server repo), the multiplayer branch
 * of bureaucratic-halls-feature, and that solo never touches any of it.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

import { HALL_MP_TEXT, HALL_TURN_MS, busyForOther, clerkAt, clerkRow, poseChanged } from '../public/js/halls-mp.js?v=044b5c5a';
import { HALL, HALL_LAYOUT, PLEASE_WAIT_MS, createHallFlow } from '../public/js/bureaucratic-hall.js?v=a0bc6317';
import { hallsData } from '../tools/build-realtime-halls.mjs';
import { HAS_SERVER, serverPath, skipWithoutServer } from '../tools/repos.mjs';

const root = join(import.meta.dirname, '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');
const gsjs = join(root, '..', 'glitch-GameServerJS');
const flush = () => new Promise((r) => setImmediate(r));

/** A hall host plus a `shared` the test answers for the server. */
function rig(me = 7) {
  let t = 1000;
  const pos = { x: HALL_LAYOUT.arrival.x, y: HALL.ground };
  const sent = [];
  const asks = [];
  const drawn = [];
  const busy = [];
  const rows = HALL_LAYOUT.clerkHomes.map((x, i) => clerkRow({ i, x, dir: 'left', anim: 'idle' }, t));
  let answer = null;
  const host = {
    now: () => t,
    player: () => pos,
    pcLabel: () => 'Ur',
    clerkCount: 4,
    clerkLabel: (i) => `Clerk ${i}`,
    drawClerk: (i, pose) => (drawn[i] = pose),
    busyWith: (i, name) => (busy[i] = name),
    say() {},
    converse: (i, opts) => new Promise((resolve) => (answer = { i, opts, resolve })),
    prompt: () => 'p',
    removePrompt() {},
    applyBuff() {},
    removeBuff() {},
    acting: () => false,
    learned: () => ['bureaucraticarts_1'],
    achievements: () => ['card_carrying_qualification'],
    buy: () => 'ok',
    setData() {},
    rng: () => 0.99, // no hand-off after the question
  };
  const shared = {
    me,
    ask: (kind, x) => new Promise((resolve) => asks.push({ kind, x, resolve })),
    as: (i, kind) => sent.push(['as', i, kind]),
    pose: (i, pose) => sent.push(['pose', i, Math.round(pose.x)]),
    touch: (i) => sent.push(['touch', i]),
    done: (i, x) => sent.push(['done', i, Math.round(x)]),
    view: (i, now) => clerkAt(rows[i], now),
    row: (i) => rows[i],
  };
  return {
    host, shared, sent, asks, drawn, busy, rows, pos,
    advance: (ms) => (t += ms),
    give: async (i) => {
      const a = asks.shift();
      a.resolve(i);
      await flush();
      return a;
    },
    answer: async (value) => {
      const a = answer;
      answer = null;
      a.resolve(value);
      await flush();
      return a;
    },
    get talking() { return answer; },
  };
}

describe('the hall\'s bureaucrats on the client', () => {
  it('draws a server walk on and knows who is busy with whom', () => {
    const row = clerkRow({ i: 1, by: 9, who: 'Bo', kind: 'help', x: 1800, to: 1700, speed: 50, anim: 'walk1' }, 0);
    assert.deepEqual(clerkAt(row, 1000), { x: 1750, dir: 'left', anim: 'walk1', walking: true });
    assert.equal(clerkAt(row, 5000).x, 1700);
    assert.equal(busyForOther(row, 7), true);
    assert.equal(busyForOther(row, 9), false);
    assert.equal(poseChanged({ x: 10, dir: 'left', anim: 'idle' }, { x: 10.4, dir: 'left', anim: 'idle' }), false);
    assert.equal(poseChanged({ x: 10, dir: 'left', anim: 'idle' }, { x: 12, dir: 'left', anim: 'idle' }), true);
    assert.equal(HALL_TURN_MS, 60_000);
    assert.equal(HALL_MP_TEXT.line(1), 'Every bureaucrat is busy. You are next in line.');
    assert.equal(HALL_MP_TEXT.line(3), 'Every bureaucrat is busy. You are number 3 in line.');
    for (const t of [HALL_MP_TEXT.line(2), HALL_MP_TEXT.lost, HALL_MP_TEXT.serving('Ada')]) assert.doesNotMatch(t, /—|Glitch/);
  });

  it('the server picks who greets and helps you; the rest are drawn where it says', async () => {
    const r = rig();
    const flow = createHallFlow(r.host, { shared: r.shared });
    // Another player's bureaucrat walks towards them: drawn there, marked busy.
    Object.assign(r.rows[3], clerkRow({ i: 3, by: 9, who: 'Bo', kind: 'help', x: 2150, to: 1900, speed: 50, anim: 'walk2' }, 1000));
    flow.tick(16);
    assert.deepEqual(r.asks.map((a) => a.kind), ['greet'], 'arriving asks the server for a greeter');
    flow.tick(16);
    assert.equal(r.asks.length, 1, 'once');
    r.advance(1000);
    flow.tick(16);
    assert.equal(r.drawn[3].x, 2100);
    assert.equal(r.busy[3], 'Bo');
    // Every bureaucrat busy: the line.
    flow.inLine('greet', 2);
    assert.equal(flow.state.phase, 'line');
    await r.give(0);
    assert.deepEqual(flow.held, [0]);
    assert.equal(flow.state.phase, 'greeting');
    flow.tick(16);
    assert.ok(r.sent.some((s) => s[0] === 'pose' && s[1] === 0), 'your bureaucrat\'s walk goes to the others');
    flow.hurryClerks();
    flow.tick(16);
    await r.answer('greeting-ok');
    flow.hurryClerks();
    flow.tick(16);
    assert.deepEqual(r.sent.filter((s) => s[0] === 'done'), [['done', 0, 1640]], 'back at its place, it is free again');
    assert.deepEqual(flow.held, []);
    // Please Wait, then the server's helper.
    r.pos.x = 900;
    flow.tick(16);
    r.advance(PLEASE_WAIT_MS);
    flow.tick(16);
    assert.equal(r.asks[0].kind, 'help');
    await r.give(1);
    flow.hurryClerks();
    flow.tick(16);
    assert.equal(flow.state.phase, 'called');
    assert.equal(flow.talkState(1).enabled, true);
    // Talk to: an item; the next official is the server's (first free, will).
    const talking = flow.talk(1);
    await flush();
    await r.answer('your_papers');
    assert.equal(r.asks[0].kind, 'will');
    await r.give(2);
    await r.answer('ok');
    await talking;
    assert.deepEqual(r.sent.filter((s) => s[0] === 'as'), [['as', 2, 'help']], 'the one promised now helps');
    assert.ok(r.sent.some((s) => s[0] === 'touch'), 'each step keeps the turn');
  });

  it('a turn the server took ends the visit, and the others held go back', async () => {
    const r = rig();
    const flow = createHallFlow(r.host, { shared: r.shared });
    flow.tick(16);
    await r.give(0);
    flow.hurryClerks();
    flow.tick(16);
    assert.ok(r.talking, 'the greeting is open');
    assert.equal(flow.lost(0), true);
    assert.equal(flow.state.phase, 'done');
    assert.equal(flow.state.last, 'lost');
    assert.deepEqual(flow.held, []);
    await r.answer('greeting-ok');
    assert.equal(flow.state.waiting, false, 'answering after the turn is lost does nothing');
    assert.equal(flow.lost(0), false, 'once');
  });

  it('solo keeps its own bureaucrats: no shared, no asks', () => {
    const r = rig();
    const flow = createHallFlow(r.host);
    flow.tick(16);
    assert.equal(r.asks.length, 0);
    assert.equal(flow.state.phase, 'greeting');
  });
});

describe('the source', { skip: !existsSync(gsjs) && 'no GSJS checkout' }, () => {
  it('one bureaucrat serves one player: busy greeting, helping or promised', () => {
    const b = readFileSync(join(gsjs, 'items/npc_bureaucrat.js'), 'utf8');
    assert.match(b, /function isBusy\(\)\{[^]*?if \(this\.current_state == 'idle' && !this\.will_help\) return false;/);
    assert.match(b, /if \(items\[i\]\.class_tsid == 'npc_bureaucrat' && !items\[i\]\.isBusy\(\)\) return items\[i\];/);
    const inst = readFileSync(join(gsjs, 'locations/inc_instances.js'), 'utf8');
    assert.match(inst, /Used for things like the bureaucratic hall/);
  });
});

describe('the server\'s halls', () => {
  it('are current (node tools/build-realtime-halls.mjs)', { skip: skipWithoutServer }, () => {
    const out = execFileSync(process.execPath, [join(root, 'tools/build-realtime-halls.mjs'), '--check'], { encoding: 'utf8' });
    assert.match(out, /is current/);
  });

  it('are the three street halls with four bureaucrats each', () => {
    const d = hallsData();
    assert.deepEqual(d.halls.map((h) => h.street), ['HALL_LDOCV86VHCD245F', 'HALL_LIF101O8CDQ1AMU', 'HALL_LIF2E3LVGK82J7Q']);
    assert.deepEqual(d.clerks.map((c) => c.home), HALL_LAYOUT.clerkHomes);
    assert.deepEqual(d.stroll, [1606, 2166]);
    assert.equal(d.turn, HALL_TURN_MS);
  });

  it('halls.go cites the source and keeps the line', { skip: !HAS_SERVER && 'no server checkout' }, () => {
    const go = readFileSync(serverPath('halls.go'), 'utf8');
    for (const cite of ['isBusy 805-837', 'getRandomBureaucrat 314-321', 'idle_onMsg 733-765', 'returnToStart 901-907', 'general/17265']) assert.ok(go.includes(cite), cite);
  });
});

describe('the multiplayer branch of bureaucratic-halls-feature', () => {
  const src = read('public/js/features/bureaucratic-halls-feature.js');
  it('shares a street hall\'s scene street and the server\'s bureaucrats only when online', () => {
    assert.match(src, /const shared = session && session\.client\.state === 'online' \? sharedAdapter\(session, hallSceneTsid\(def\.tsid\)\) : null;/);
    assert.match(src, /realtimeStreet\(engine\) \{\n\s*return hall\?\.shared && engine\.inScene\?\.\(\) \? hallSceneTsid\(hall\.def\.tsid\) : null;/);
    assert.match(src, /engine\?\.mode === 'multiplayer' && Boolean\(engine\.query\?\.\('realtimeClient'\)\)/);
  });
  it('Legalize It\'s hall stays the player\'s own (no shared in its flow)', () => {
    const fn = src.slice(src.indexOf('bureaucraticHallFlow(engine, opts = {}) {'), src.indexOf('/** QA for Legalize It'));
    assert.doesNotMatch(fn, /shared/);
  });
});
