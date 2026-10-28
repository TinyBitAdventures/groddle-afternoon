/**
 * G258: periodic energy loss (players/player.js onPeriodicEnergyLoss
 * 2358-2380) replaces the remake's walking drain and standing top-up.
 * js/energy-decay.js, features/energy-decay-feature.js, the game.js physics
 * loop, and how Pooped / Super Pooped now last.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  ENERGY_LOSS_RATE,
  ENERGY_LOSS_TICK_MS,
  createEnergyLossClock,
  energyLossSkip,
  periodicEnergyLoss,
} from '../public/js/energy-decay.js?v=g258-1';
// The feature imports these with their browser cache tags; load the same module instances.
import { energyDecayContext, energyDecayFeature, runEnergyLossTick } from '../public/js/features/energy-decay-feature.js?v=g418-1';
import { __newxpTest } from '../public/js/features/newxp-feature.js?v=g418-1';
import { hellFeature } from '../public/js/features/hell-feature.js?v=hell-16';
import { HELL_TEXT } from '../public/js/hell.js';
import { SCENE_TSIDS } from '../public/js/newxp.js?v=newxp-4';
import { createQuestState } from '../public/js/quests.js';

const spike = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(spike, p), 'utf8');
const HECHEY = 'GLI2V0UN7RD1T2J';

describe('the source (player.js onPeriodicEnergyLoss)', () => {
  it('is what the rules quote: 90 s, 0.8% of max, the three skips, quiet', () => {
    const src = read('../glitch-GameServerJS/players/player.js');
    const fn = src.slice(src.indexOf('function onPeriodicEnergyLoss'), src.indexOf('function onPlayTimeCheck'));
    assert.match(fn, /if \(!this\.isOnline\(\)\) return;/);
    assert.match(fn, /!this\['!in_house_deco_mode'\] && !this\.location\.isParadiseLocation\(\)/);
    assert.match(fn, /this\['!meditating'\] != 'transcendental'/);
    assert.match(fn, /Math\.round\(this\.metabolics_get_max_energy\(\) \* 0\.008\)/);
    assert.match(fn, /metabolics_get_percentage\('energy'\) > 50/);
    assert.match(fn, /newxp_training2/);
    assert.match(fn, /metabolics_lose_energy\(to_lose, 1\)/);
    assert.match(fn, /apiSetTimer\('onPeriodicEnergyLoss', 90000\)/);
    assert.equal(ENERGY_LOSS_TICK_MS, 90000);
    assert.equal(ENERGY_LOSS_RATE, 0.008);
  });
});

describe('periodicEnergyLoss', () => {
  it('takes round(max x 0.008): 1 on a 100 tank, 4 on 500, 8 on 1000', () => {
    assert.equal(periodicEnergyLoss({ energy: 100, energyMax: 100 }).loss, 1, 'round(0.8)');
    assert.equal(periodicEnergyLoss({ energy: 3, energyMax: 100 }).loss, 1, 'the same at any level once the intro is done');
    assert.equal(periodicEnergyLoss({ energy: 500, energyMax: 500 }).loss, 4);
    assert.equal(periodicEnergyLoss({ energy: 10, energyMax: 1000 }).loss, 8);
    assert.equal(periodicEnergyLoss({ energy: 10, energyMax: 1250 }).loss, 10);
  });

  it('never drops below zero', () => {
    assert.equal(periodicEnergyLoss({ energy: 0, energyMax: 100 }).loss, 0);
    assert.equal(periodicEnergyLoss({ energy: 3, energyMax: 1000 }).loss, 3);
  });

  it('before the intro: only above 50%, never in the tutorial scenes', () => {
    assert.equal(periodicEnergyLoss({ energy: 50, energyMax: 100, introDone: false }).loss, 0);
    assert.equal(periodicEnergyLoss({ energy: 51, energyMax: 100, introDone: false }).loss, 1);
    assert.equal(periodicEnergyLoss({ energy: 90, energyMax: 100, introDone: false, newxpInstance: true }).loss, 0);
    assert.equal(periodicEnergyLoss({ energy: 90, energyMax: 100, introDone: true, newxpInstance: true }).loss, 1, 'after the intro the instance check is not made');
  });

  it('skips in source order: deco, Paradise, transcendental meditation', () => {
    assert.equal(energyLossSkip({}), null);
    assert.equal(energyLossSkip({ decoMode: true, paradise: true }), 'deco');
    assert.equal(energyLossSkip({ paradise: true, transcendental: true }), 'paradise');
    assert.equal(energyLossSkip({ transcendental: true }), 'meditation');
  });

  it('the clock counts whole 90 s of play and carries the remainder', () => {
    const clock = createEnergyLossClock();
    assert.equal(clock.period, 90000);
    assert.equal(clock.advance(89999), 0);
    assert.equal(clock.advance(1), 1);
    assert.equal(clock.advance(185000), 2);
    assert.equal(clock.elapsed, 5000);
  });
});

function fakeEngine(extra = {}) {
  const data = {};
  const engine = {
    started: true,
    streetTsid: HECHEY,
    pc: { energy: 100, energyMax: 100, mood: 100 },
    params: {},
    data,
    homeContext: () => ({ inHome: false }),
    metabolicGate: () => ({ ok: true }),
    pushActivity() {},
    updateHud() {},
    setData: (k, v) => { data[k] = String(v); },
    param: (k) => (k in engine.params ? engine.params[k] : null),
    ...extra,
  };
  return engine;
}

describe('energy decay feature', () => {
  it('loses 1 every 90 s of play and publishes the QA data', () => {
    __newxpTest.save = { status: 'off' };
    const engine = fakeEngine();
    energyDecayFeature._reset();
    energyDecayFeature.init(engine);
    assert.equal(engine.data.energyLossTick, '90000');
    energyDecayFeature.onTick(89000, 0, engine);
    assert.equal(engine.pc.energy, 100);
    energyDecayFeature.onTick(1000, 0, engine);
    assert.equal(engine.pc.energy, 99);
    assert.equal(engine.data.energyLossLast, '1');
    assert.equal(engine.data.energyLossTicks, '1');
    assert.equal(engine.data.energyLossEnergy, '99');
    assert.equal(engine.data.energyLossSkip, '');
  });

  it('honours energytick (at least 250 ms)', () => {
    const engine = fakeEngine();
    engine.params = { energytick: '1500' };
    energyDecayFeature._reset();
    energyDecayFeature.init(engine);
    assert.equal(engine.data.energyLossTick, '1500');
    energyDecayFeature.onTick(3000, 0, engine);
    assert.equal(engine.pc.energy, 98);
    engine.params = { energytick: '5' };
    energyDecayFeature.init(engine);
    assert.equal(engine.data.energyLossTick, '250');
  });

  it('does not tick before the game starts', () => {
    const engine = fakeEngine({ started: false });
    energyDecayFeature._reset();
    energyDecayFeature.init(engine);
    energyDecayFeature.onTick(900000, 0, engine);
    assert.equal(engine.pc.energy, 100);
  });

  it('skips Paradise, Beam Me Down, and a refused loss (dead, intro, training1)', () => {
    __newxpTest.save = { status: 'off' };
    const cases = [
      [{ streetTsid: 'PARADISE_CLOUD_RINGS' }, 'paradise'],
      [{ streetTsid: 'PUZZLESCENE_BEAM_ME_DOWN' }, 'paradise'],
      [{ metabolicGate: (stat, dir) => (stat === 'energy' && dir === 'loss' ? { ok: false } : { ok: true }) }, 'gate'],
    ];
    for (const [extra, skip] of cases) {
      const engine = fakeEngine(extra);
      const out = runEnergyLossTick(engine);
      assert.equal(out.skip, skip, JSON.stringify(extra));
      assert.equal(engine.pc.energy, 100);
    }
  });

  it('mid-tutorial: no loss at or under 50% or in a tutorial scene; after it, everywhere', () => {
    __newxpTest.save = { status: 'active', stage: 'island' };
    const engine = fakeEngine({ pc: { energy: 50, energyMax: 100 } });
    assert.equal(runEnergyLossTick(engine).loss, 0);
    engine.pc.energy = 60;
    assert.equal(runEnergyLossTick(engine).loss, 1);
    engine.streetTsid = SCENE_TSIDS.training2;
    assert.equal(energyDecayContext(engine).newxpInstance, true);
    assert.equal(runEnergyLossTick(engine).loss, 0, 'newxp_training2');
    __newxpTest.save = { status: 'off' };
    assert.equal(runEnergyLossTick(engine).loss, 1);
  });

  it('is registered with the feature host', () => {
    assert.match(read('public/js/features/index.js'), /energy-decay-feature\.js\?v=g418-1'; FEATURES\.push\(energyDecayFeature\);/);
  });
});

describe('game.js: no walking drain, no standing top-up', () => {
  const game = read('public/game.js');
  const physics = game.slice(game.indexOf('function physics(dt) {'), game.indexOf('// patrol NPCs'));

  it('the physics loop changes no energy', () => {
    assert.ok(physics.length > 1000, 'found the physics loop');
    assert.doesNotMatch(physics, /pc\.energy\s*=/);
    assert.doesNotMatch(game, /energyTick/);
    assert.match(physics, /state\.hudTick > 40/, 'the HUD heartbeat stays');
  });

  it('jumping, swimming strokes and climbing cost nothing', () => {
    assert.doesNotMatch(game, /pc\.energy = clamp\(pc\.energy - (1\.2|0\.4|0\.012 \* dt)/);
  });
});

describe('Pooped and Super Pooped last now nothing tops energy up', () => {
  function hellEngine(demo) {
    const log = { prompts: [] };
    const engine = {
      started: true,
      log,
      pc: { level: 5, energy: 50, energyMax: 100, mood: 50, moodMax: 100 },
      inv: {},
      questState: createQuestState(),
      streetTsid: HECHEY,
      street: { tsid: HECHEY, hubId: '56', label: 'Hechey Track' },
      player: { x: 100, y: 200 },
      param: (k) => (k === 'helldemo' ? demo : null),
      data: {},
      setData: (k, v) => { engine.data[k] = String(v); },
      playSound() {},
      pushActivity() {},
      updateHud() {},
      stopFollowing() {},
      refreshPack() {},
      save() {},
      toast() {},
      register: (t) => t,
      hasBuff: () => false,
      removeBuff() {},
      addBuff() {},
      questFlag() {},
      homeContext: () => ({ inHome: false }),
      transientInstance: () => false,
      streetExists: () => true,
      prompt: (p) => log.prompts.push(p),
      achievement() {},
      enter: () => new Promise(() => {}),
      afterStreetCard: () => Promise.resolve(),
      metabolicGate: (stat, dir) => hellFeature.metabolicGate(stat, dir) || { ok: true },
    };
    return engine;
  }

  /** Stand still for `n` loss ticks with both features running. */
  function standStill(engine, n) {
    for (let i = 0; i < n; i++) {
      energyDecayFeature.onTick(1000, Date.now(), engine);
      hellFeature.onTick(16, Date.now(), engine);
    }
  }

  it('Pooped stays while you stand around, and eating over 5% clears it', (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    __newxpTest.save = { status: 'off' };
    hellFeature.restore({});
    const engine = hellEngine('pooped');
    engine.param = (k) => (k === 'helldemo' ? 'pooped' : k === 'energytick' ? '1000' : null);
    hellFeature.init(engine);
    hellFeature.onStreetEnter(engine.street, engine);
    energyDecayFeature._reset();
    energyDecayFeature.init(engine);
    assert.equal(engine.pc.energy, 5);
    standStill(engine, 1);
    t.mock.timers.tick(0);
    assert.equal(engine.pc.energy, 4, 'the periodic loss is what brings it');
    assert.equal(hellFeature._state().pooped?.kind, 'pooped');
    assert.deepEqual(engine.log.prompts[0], { text: HELL_TEXT.pooped, timeoutMs: 10000 });
    standStill(engine, 30);
    assert.equal(engine.pc.energy, 0, 'energy only goes down');
    assert.equal(hellFeature._state().pooped?.kind, 'pooped', 'still Pooped after 30 ticks standing');
    assert.equal(hellFeature.isDead(), false, 'one croak a day');
    engine.pc.energy = 20; // a meal
    hellFeature.onTick(16, Date.now(), engine);
    assert.equal(hellFeature._state().pooped, null, 'metabolics_add_energy over 5% removes Pooped');
    assert.equal(engine.data.hellPooped, '', 'the canvas data follows');
    hellFeature.restore({});
  });

  it('Super Pooped refuses gains but not the periodic loss', (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    __newxpTest.save = { status: 'off' };
    hellFeature.restore({});
    const engine = hellEngine('superpooped');
    engine.param = (k) => (k === 'helldemo' ? 'superpooped' : k === 'energytick' ? '1000' : null);
    hellFeature.init(engine);
    hellFeature.onStreetEnter(engine.street, engine);
    energyDecayFeature._reset();
    energyDecayFeature.init(engine);
    standStill(engine, 1);
    t.mock.timers.tick(0);
    assert.equal(hellFeature._state().pooped?.kind, 'super_pooped');
    standStill(engine, 3);
    assert.equal(engine.pc.energy, 1, 'losses are never gated by Super Pooped');
    assert.equal(engine.metabolicGate('energy', 'gain').ok, false);
    assert.equal(engine.metabolicGate('energy', 'loss').ok, true);
    assert.equal(hellFeature._state().pooped?.kind, 'super_pooped');
    hellFeature.restore({});
  });
});
