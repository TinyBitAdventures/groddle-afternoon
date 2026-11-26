/**
 * Austin's ruling 2026-11-26 ("Both as Glitch"), on the Ancestral Lands visit.
 *
 * Sleep grace. A computer asleep mid-visit kept our wall clock running, so the whole visit was
 *    used up and the player was sent away on waking. In Glitch a sleeping client was logged out,
 *    which froze the visit (leave_savanna(logout) banked time_spent and set logged_out,
 *    players/inc_special_locations.js 88-109; the buff is not offline, catalog_buffs.js 21-27, so
 *    buffs_logout froze it, inc_buffs.js 107-112). Logging back in ran start_baqala_buff, whose
 *    grace period turned a visit already over into 15 s left (37-40: time_spent >= 600 becomes 585).
 *    Ours: a long wall-clock gap (asleep), or the realtime socket dropping and coming back, that
 *    would have ended the visit leaves you in it with those 15 s.
 */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { FEATURES } from '../public/js/features/index.js?v=c7f0ccca';
import { ANCESTRAL_CLOCK, ANCESTRAL_SLEEP_GAP_MS, ANCESTRAL_WAKE_GRACE, ancestralWake } from '../public/js/juju-bandits.js?v=0d3af5fe';
import { applyBuff, createBuffState, hasBuff, removeBuff } from '../public/js/buffs.js?v=a4f7377b';
import { loadContentCatalogsFromDir } from '../public/js/content-catalogs.js?v=c9b84764';
import { NOSTALGIA_BOOT_STREETS } from '../public/js/ancestral-nostalgia-data.js?v=0adb9184';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const GSJS = join(root, '../glitch-GameServerJS');
const hasGsjs = existsSync(join(GSJS, 'items/dust_trap.js'));
const gsjs = (rel) => readFileSync(join(GSJS, rel), 'utf8');
const flush = () => new Promise((r) => setImmediate(r));

before(async () => {
  await loadContentCatalogsFromDir(join(root, 'public/assets/content'));
});

describe('the source', { skip: !hasGsjs && 'glitch-GameServerJS not beside the repo' }, () => {
  it('a logout froze the visit and logging in gave a visit already over 15 s', () => {
    const loc = gsjs('players/inc_special_locations.js');
    assert.match(loc, /if\(this\.baqala_times\.time_spent >= 600\) \{\s*this\.baqala_times\.time_spent = 585;/);
    assert.match(loc, /this\.baqala_times\.logged_out = logout;/);
    assert.match(gsjs('items/catalog_buffs.js'), /"ancestral_nostalgia" : \{[^}]*is_offline\s*: false,/);
    assert.deepEqual([ANCESTRAL_CLOCK.graceFrom, ANCESTRAL_CLOCK.graceTo, ANCESTRAL_WAKE_GRACE], [600, 585, 15]);
  });
});

describe('ancestralWake', () => {
  it('a visit that ran out in the gap comes back with 15 s; one that did not is left alone', () => {
    const clock = { spent: 900, inside: true };
    assert.equal(ancestralWake(clock, 300, 600), true);
    assert.equal(clock.spent, 585);
    const early = { spent: 500, inside: true };
    assert.equal(ancestralWake(early, 300, 600), false);
    assert.equal(early.spent, 500);
    // 5 s left at the drop: still 5 s (time_spent 595 stays under 600).
    const tight = { spent: 700, inside: true };
    ancestralWake(tight, 595, 600);
    assert.equal(tight.spent, 595);
    // Prepared II's 12 minutes: 15 s of those.
    const card = { spent: 2000, inside: true };
    ancestralWake(card, 100, 720);
    assert.equal(card.spent, 705);
    assert.ok(ANCESTRAL_SLEEP_GAP_MS > 60_000, 'a hidden tab\'s throttled timer (once a minute) is no sleep');
  });
});

describe('asleep mid-visit', () => {
  const feature = FEATURES.find((f) => f.id === 'juju-bandits');
  const street = (hubId) => ({ hubId, platforms: [], bounds: { l: 0, r: 3000, t: -1000, b: 0 } });
  const enter = (engine, s) => {
    engine.street = s;
    feature.onStreetClear(engine);
    feature.onStreetEnter(s, engine);
  };
  const makeEngine = ({ mode = 'solo', client = null } = {}) => {
    const buffs = createBuffState();
    const data = {};
    const engine = {
      mode,
      data,
      buffs,
      prompts: [],
      travels: [],
      street: street('86'),
      inv: {},
      player: { x: 500, y: 0 },
      pc: { imaginationUpgrades: [] },
      questState: { active: { help_juju_bandits: {} }, completed: [] },
      param: () => null,
      setData: (k, v) => { data[k] = String(v); },
      achievement() {},
      save() {},
      refreshPack() {},
      pushActivity() {},
      hasBuff: (id) => hasBuff(buffs, id, Date.now()),
      applyBuff: (id) => applyBuff(buffs, id, null, Date.now()),
      removeBuff: (id) => removeBuff(buffs, id, null, Date.now()),
      buffRow: (id) => (hasBuff(buffs, id, Date.now()) ? buffs.active[id] : null),
      prompt: (p) => { engine.prompts.push(p); return ''; },
      travel: async (tsid, meta) => {
        engine.travels.push({ tsid, ...meta });
        enter(engine, street('85'));
        return { ok: true };
      },
      streetExists: () => true,
      query: (hook) => {
        if (hook === 'realtimeClient') return client;
        if (hook === 'openForEveryone') return new Set(NOSTALGIA_BOOT_STREETS.map((r) => r.tsid));
        return hook === 'openRoadsLoaded' ? true : null;
      },
      inScene: () => false,
      transientInstance: () => false,
      questDialogueOpen: () => false,
      acting: () => false,
    };
    return engine;
  };
  /** In Baqala at t0 with `spent` seconds gone (5 minutes left at 300). */
  const start = (engine, spent) => {
    const t0 = Date.now();
    const wall = Date.now;
    Date.now = () => t0;
    try {
      feature.restore({ ancestral: { spent, inside: false } });
      enter(engine, street('86'));
    } finally { Date.now = wall; }
    feature.onTick(16, t0 + 1000, engine);
    return t0;
  };
  after(() => feature.restore(undefined));

  it('asleep 20 minutes with 5 left: back in the visit with 15 s, then sent away (it sent you away on waking)', async () => {
    const engine = makeEngine();
    const t0 = start(engine, 300);
    const woke = t0 + 1000 + 20 * 60_000;
    feature.onTick(16, woke, engine);
    await flush();
    assert.equal(engine.travels.length, 0, 'not sent away on waking');
    assert.equal(engine.data.nostalgiaLeft, '15');
    assert.equal(engine.hasBuff('ancestral_nostalgia'), true);
    for (let s = 1; s <= 14; s += 1) feature.onTick(16, woke + s * 1000, engine);
    await flush();
    assert.equal(engine.travels.length, 0, 'still there with a second to go');
    feature.onTick(16, woke + 15_000, engine);
    feature.onTick(16, woke + 15_016, engine);
    await flush();
    assert.equal(engine.travels.length, 1, 'the 15 s ran out');
    feature.restore(undefined);
  });

  it('asleep a while with time to spare: the gap still counts in full (#700)', () => {
    const engine = makeEngine();
    const t0 = start(engine, 0);
    feature.onTick(16, t0 + 1000 + 4 * 60_000, engine);
    assert.ok(Math.abs(feature._state().clock.spent - 241) < 0.01, String(feature._state().clock.spent));
    feature.restore(undefined);
  });

  it('a hidden tab\'s minute-long gap is no sleep: it still sends you away on time (#700)', async () => {
    const engine = makeEngine();
    const t0 = start(engine, 570);
    feature.onTick(16, t0 + 1000 + 60_000, engine);
    feature.onTick(16, t0 + 1000 + 60_016, engine);
    await flush();
    assert.equal(engine.travels.length, 1);
    feature.restore(undefined);
  });

  it('online, the socket dropping is a logout: no kick while it is down, 15 s once it is back', async () => {
    const listeners = new Map();
    const client = {
      state: 'online',
      on(type, fn) {
        if (!listeners.has(type)) listeners.set(type, []);
        listeners.get(type).push(fn);
        return () => {};
      },
      emit(type, detail) {
        if (type === 'state') client.state = detail.state;
        for (const fn of listeners.get(type) || []) fn(detail);
      },
    };
    const engine = makeEngine({ mode: 'multiplayer', client });
    const t0 = start(engine, 500);
    client.emit('state', { state: 'offline', reconnecting: true });
    // Frames run on while the socket is down, past the end of the visit (100 s left at the drop).
    for (let s = 2; s <= 130; s += 1) feature.onTick(16, t0 + s * 1000, engine);
    await flush();
    assert.equal(engine.travels.length, 0, 'not sent away while logged out');
    client.emit('state', { state: 'connecting' });
    client.emit('state', { state: 'online' });
    const back = t0 + 130_000;
    feature.onTick(16, back + 16, engine);
    await flush();
    assert.equal(engine.travels.length, 0);
    assert.equal(engine.data.nostalgiaLeft, '15');
    for (let s = 1; s <= 16; s += 1) feature.onTick(16, back + s * 1000, engine);
    await flush();
    assert.equal(engine.travels.length, 1, 'the 15 s ran out');
    feature.restore(undefined);
  });
});
