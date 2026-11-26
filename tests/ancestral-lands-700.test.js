/**
 * Report #700: time in the Ancestral Lands felt short. Our numbers were Glitch's (600 s, the Dust
 * Trap table, the cap at full); two things were not, and Austin's ruling (2026-11-26) is "as Glitch"
 * on both. Here the first:
 *
 * 1. The visit's clock stopped while the tab was hidden: each frame counted at most a second, and a
 *    hidden tab runs no frames. Glitch's clock was wall-clock on its server (get_baqala_buff_time:
 *    time_spent + time() - entry_time, players/inc_special_locations.js 114-116), so it ran on, and
 *    the buff's on_remove (check_baqala_boot 151-168) sent you away on time whether you watched or not.
 */
import { after, before, describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { FEATURES } from '../public/js/features/index.js?v=5d7ea778';
import { applyBuff, createBuffState, hasBuff, removeBuff } from '../public/js/buffs.js?v=1016728d';
import { loadContentCatalogsFromDir } from '../public/js/content-catalogs.js?v=c9b84764';
import { NOSTALGIA_BOOT_STREETS } from '../public/js/ancestral-nostalgia-data.js?v=0adb9184';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const GSJS = join(root, '../glitch-GameServerJS');
const hasGsjs = existsSync(join(GSJS, 'players/inc_special_locations.js'));
const gsjs = (rel) => readFileSync(join(GSJS, rel), 'utf8');
const flush = () => new Promise((r) => setImmediate(r));

before(async () => {
  await loadContentCatalogsFromDir(join(root, 'public/assets/content'));
});

describe('#700 the source', () => {
  it('Glitch counted the visit on the server clock', { skip: !hasGsjs && 'glitch-GameServerJS not beside the repo' }, () => {
    const loc = gsjs('players/inc_special_locations.js');
    assert.match(loc, /return this\.baqala_times \? \(this\.baqala_times\.time_spent \+ time\(\) - this\.baqala_times\.entry_time\) : 0;/);
  });
});

describe('#700 the clock runs on in a hidden tab', () => {
  const feature = FEATURES.find((f) => f.id === 'juju-bandits');
  const street = (hubId) => ({ hubId, platforms: [], bounds: { l: 0, r: 3000, t: -1000, b: 0 } });
  const enter = (engine, s) => {
    engine.street = s;
    feature.onStreetClear(engine);
    feature.onStreetEnter(s, engine);
  };
  const makeEngine = () => {
    const buffs = createBuffState();
    const data = {};
    const engine = {
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
      query: (hook) => (hook === 'openForEveryone' ? new Set(NOSTALGIA_BOOT_STREETS.map((r) => r.tsid)) : hook === 'openRoadsLoaded' ? true : null),
      inScene: () => false,
      transientInstance: () => false,
      questDialogueOpen: () => false,
      acting: () => false,
    };
    return engine;
  };
  const savedDoc = globalThis.document;
  after(() => {
    mock.timers.reset();
    if (savedDoc === undefined) delete globalThis.document;
    else globalThis.document = savedDoc;
    feature.restore(undefined);
  });

  it('a gap with no frames counts in full (it counted one second)', () => {
    feature.restore(undefined);
    const engine = makeEngine();
    const t0 = Date.now();
    const wall = Date.now;
    Date.now = () => t0;
    try { enter(engine, street('86')); } finally { Date.now = wall; }
    feature.onTick(16, t0 + 1000, engine);
    feature.onTick(16, t0 + 2000, engine);
    // The tab hidden five minutes: no frames, then one.
    feature.onTick(16, t0 + 2000 + 300_000, engine);
    assert.ok(Math.abs(feature._state().clock.spent - 302) < 0.01, String(feature._state().clock.spent));
    assert.equal(engine.data.nostalgiaLeft, '298');
    feature.restore(undefined);
  });

  it('while hidden, a timer keeps the visit going and sends you away on time', async () => {
    feature.restore(undefined);
    const listeners = {};
    globalThis.document = { visibilityState: 'visible', addEventListener: (type, fn) => { listeners[type] = fn; } };
    const t0 = Date.now();
    mock.timers.enable({ apis: ['setInterval', 'Date'], now: t0 });
    const engine = makeEngine();
    feature.init(engine);
    assert.equal(typeof listeners.visibilitychange, 'function', 'it watches the tab');
    enter(engine, street('86'));
    feature.onTick(16, t0 + 1000, engine);
    mock.timers.tick(1000);
    // Hidden: no more frames.
    globalThis.document.visibilityState = 'hidden';
    listeners.visibilitychange();
    for (let i = 0; i < 597; i += 1) mock.timers.tick(1000);
    assert.equal(engine.travels.length, 0, 'still there with seconds to go');
    assert.ok(Number(engine.data.nostalgiaLeft) <= 2, engine.data.nostalgiaLeft);
    for (let i = 0; i < 4; i += 1) mock.timers.tick(1000);
    await flush();
    assert.equal(engine.travels.length, 1, 'sent away at 10 minutes, the tab still hidden');
    assert.equal(engine.hasBuff('too_much_nostalgia'), true);
    // Back on the tab: the timer stops, frames take over.
    globalThis.document.visibilityState = 'visible';
    listeners.visibilitychange();
    const spent = feature._state().clock.spent;
    mock.timers.tick(5000);
    assert.equal(feature._state().clock.spent, spent, 'no timer once the tab shows');
    mock.timers.reset();
  });
});
