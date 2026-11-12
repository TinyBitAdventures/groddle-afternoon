// #156: energy and mood in the Paradise ticket streets stopped at a hard 100.
// Paradise quoins were ordinary quoins (items/quoin.js 185-186), credited through
// metabolics_add_mood / _energy and capped at the player's own tank
// (players/inc_metabolics.js 386-394), so a stat above 100 is never lowered.
import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { setMetabolicGainGate } from '../public/js/metabolics.js?v=8504134e';
import { creditMetabolicReward } from '../public/js/quoins.js?v=7e0dec6d';

const here = dirname(fileURLToPath(import.meta.url));
const game = readFileSync(join(here, '../public/game.js'), 'utf8');
const gsjs = join(here, '../../glitch-GameServerJS');

afterEach(() => setMetabolicGainGate(null));

describe('#156 Paradise energy and mood rewards', () => {
  it('a mood quoin raises a mood above 100 and never lowers it', () => {
    const pc = { energy: 200, energyMax: 250, mood: 154 };
    const got = creditMetabolicReward(pc, 'mood', 10);
    assert.equal(pc.mood, 164);
    assert.equal(got.actual, 10);
    assert.equal(got.copy, '+10 mood');
  });

  it('caps at the real max and says full only there', () => {
    const pc = { energy: 245, energyMax: 250, mood: 248 };
    assert.equal(creditMetabolicReward(pc, 'energy', 20).copy, '+5 energy');
    assert.equal(pc.energy, 250);
    const full = creditMetabolicReward(pc, 'energy', 20);
    assert.equal(full.actual, 0);
    assert.equal(full.copy, 'Energy already full');
    assert.equal(pc.energy, 250);
    // 100 is not full for a 250 tank.
    const at100 = { energy: 100, energyMax: 250, mood: 100 };
    const r = creditMetabolicReward(at100, 'mood', 7);
    assert.equal(r.copy, '+7 mood');
    assert.equal(at100.mood, 107);
  });

  it('a value above the tank is left where it is', () => {
    const pc = { energy: 260, energyMax: 250, mood: 90 };
    const r = creditMetabolicReward(pc, 'energy', 5);
    assert.equal(pc.energy, 260);
    assert.equal(r.copy, 'Energy already full');
  });

  it('dead or Super Pooped refuses the gain without calling it full (G213)', () => {
    setMetabolicGainGate(() => ({ ok: false, msg: "You would have gained energy, but you're super pooped!" }));
    const pc = { energy: 30, energyMax: 250, mood: 30 };
    const r = creditMetabolicReward(pc, 'energy', 20);
    assert.equal(pc.energy, 30);
    assert.equal(r.actual, 0);
    assert.equal(r.copy, '+0 energy');
    assert.match(r.blocked, /super pooped/);
  });

  it('game.js credits Paradise quoins, Cloud Rings and the finish reward through it', () => {
    const fn = game.slice(game.indexOf('function applyParadiseReward'), game.indexOf('function vectorStar'));
    assert.match(fn, /creditMetabolicReward\(pc, rewardDef\.type, amount\)/);
    assert.doesNotMatch(fn, /clamp\([^)]*,\s*0,\s*100\)/);
    assert.doesNotMatch(fn, /already full/);
    // The three callers: pickups, rings, the finish.
    assert.equal((game.match(/applyParadiseReward\(result\.(reward|completionReward)\)/g) || []).length, 3);
  });

  it('the source: Paradise skips the daily limit and quoins add through metabolics', { skip: !existsSync(gsjs) && 'no GSJS checkout' }, () => {
    const quoin = readFileSync(join(gsjs, 'items/quoin.js'), 'utf8');
    assert.match(quoin, /!this\.container\.isParadiseLocation\(\)/);
    assert.match(quoin, /if \(this\.instanceProps\.type == 'mood'\) var actual = pc\.metabolics_add_mood\(amount\);/);
    assert.match(quoin, /if \(this\.instanceProps\.type == 'energy'\) var actual = pc\.metabolics_add_energy\(amount\);/);
  });
});
