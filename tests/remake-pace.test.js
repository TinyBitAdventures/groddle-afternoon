/**
 * The remake's mining pace (register G983, Austin 2026-11-17): a swing takes 0.3 of the package's own
 * time (js/pace.js REMAKE_PACE, read by js/mining.js miningProfile), so Mining I to IV take 6, 4.2, 3
 * and 2.4 s instead of Glitch's 20, 14, 10 and 8 s (catalog_skill_packages.js 1919-1953; #330, G758).
 * Manic Mining still applies on top; energy, wear and xp stay Glitch's; nothing else is paced yet.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { REMAKE_PACE, pace, paceFor, pacedSystemOf } from '../public/js/pace.js?v=c07dfbd8';
import { MINING_COSTS, miningProfile, refiningProfile } from '../public/js/mining.js?v=7ecaa572';
import { SKILL_PACKAGES, skillPackageDetails } from '../public/js/skill-packages.js?v=bfb87281';
import { actionDurationFor } from '../public/js/action-timing.js?v=283e65ce';
import { serverPath, skipWithoutServer } from '../tools/repos.mjs';

const RANKS = ['mining_1', 'mining_2', 'mining_3', 'mining_4'];
const learnedTo = (i) => RANKS.slice(0, i + 1);
const MANIC = ['mining_time_1', 'mining_time_2', 'mining_time_3'];

describe('mining at the remake pace (G983)', () => {
  it('one shared factor: mining at 0.3, the default the same, and pace() rounds to whole ms', () => {
    assert.equal(REMAKE_PACE.mining, 0.3);
    assert.equal(REMAKE_PACE.default, 0.3);
    assert.equal(paceFor('mining'), 0.3);
    assert.equal(pace('mining', 20000), 6000);
    assert.equal(pace('mining', 0), 0);
    assert.equal(pacedSystemOf('mining'), 'mining');
    assert.equal(pacedSystemOf('mining_fancypick'), 'mining');
    assert.equal(pacedSystemOf('refining'), null, 'only mining is paced in this round');
  });

  it('Mining I to IV swing for 6000, 4200, 3000 and 2400 ms with either pick; Glitch\'s data is untouched', () => {
    for (const pick of ['pick', 'fancy_pick']) {
      assert.deepEqual(RANKS.map((_, i) => miningProfile(learnedTo(i), pick).durationMs), [6000, 4200, 3000, 2400], pick);
      assert.deepEqual(RANKS.map((_, i) => miningProfile(learnedTo(i), pick).sourceDurationMs), [20000, 14000, 10000, 8000], pick);
    }
    assert.deepEqual(RANKS.map((r) => SKILL_PACKAGES.mining.skills[r].duration), [20000, 14000, 10000, 8000]);
    assert.equal(MINING_COSTS.waitMs, 6000);
  });

  it('Manic Mining I-III (mining_time_1..3) still cut the paced swing: III halves it at every rank', () => {
    const withCard = (card) => RANKS.map((_, i) => miningProfile(learnedTo(i), 'pick', [card]).durationMs);
    assert.deepEqual(withCard('mining_time_1'), [5400, 3780, 2700, 2160]);
    assert.deepEqual(withCard('mining_time_2'), [4500, 3150, 2250, 1800]);
    assert.deepEqual(withCard('mining_time_3'), [3000, 2100, 1500, 1200]);
    // Only the best card counts (inc_skill_packages.js getSkillPackageDetails).
    assert.equal(miningProfile(['mining_1'], 'pick', MANIC).durationMs, 3000);
  });

  it('energy, tool wear and xp per swing stay Glitch\'s rows', () => {
    RANKS.forEach((r, i) => {
      const row = SKILL_PACKAGES.mining.skills[r];
      const p = miningProfile(learnedTo(i), 'pick');
      assert.deepEqual([p.energy, p.toolWear, p.xp], [row.energy_cost, row.tool_wear, row.xp_bonus], r);
    });
  });

  it('the action-timing fallback for a mine verb is Mining I at the pace', () => {
    assert.equal(actionDurationFor('rock_beryl_1', 'mine'), 6000);
    assert.equal(actionDurationFor('rock_metal_1', 'mine'), miningProfile(['mining_1']).durationMs);
  });

  it('other packages keep Glitch\'s times (the Grinder\'s refining, the package overlay itself)', () => {
    assert.equal(refiningProfile(['refining_1']).sourceDurationMs, SKILL_PACKAGES.refining.skills.refining_1.duration);
    assert.equal(skillPackageDetails('mining', ['mining_1']).duration, 20000, 'the overlay stays Glitch\'s; only miningProfile paces it');
  });

  it('the realtime server has no swing-time floor and its rate limits admit the fastest swing', { skip: skipWithoutServer }, () => {
    const objects = readFileSync(serverPath('objects.go'), 'utf8');
    const yard = readFileSync(serverPath('home_yard.go'), 'utf8');
    const num = (src, name) => Number(src.match(new RegExp(`\\b${name}\\s*=\\s*([0-9.]+)`))?.[1]);
    const objBurst = num(objects, 'objBurst');
    const objEvery = num(objects, 'objEvery'); // tokens a second
    const yardBurst = num(yard, 'yardBurst');
    const yardEverySec = /\byardEvery\s*=\s*time\.Second\b/.test(yard) ? 1 : NaN;
    assert.ok(objBurst > 0 && objEvery > 0 && yardBurst > 0 && yardEverySec === 1, 'read the limits');
    // handleMine only adds the miner; nothing compares a landing with when the swing started.
    const handleMine = objects.slice(objects.indexOf('func (o *objects) handleMine'), objects.indexOf('func (o *objects) handleDig'));
    assert.ok(handleMine.length > 0);
    assert.doesNotMatch(handleMine, /time\.|Since|startedAt|swingMs/);

    // The fastest swing: Mining IV with Manic Mining III. Each swing online sends obj_mine start and
    // obj_act (street rocks, objects.go allow) or one home_yard act (a visited home's rock).
    const fastest = miningProfile(RANKS, 'fancy_pick', ['mining_time_3']).durationMs;
    assert.equal(fastest, 1200);
    const run = (burst, perSec, framesPerSwing) => {
      let tokens = burst;
      for (let swing = 0; swing < 500; swing += 1) {
        tokens = Math.min(burst, tokens + (fastest / 1000) * perSec);
        for (let f = 0; f < framesPerSwing; f += 1) {
          if (tokens < 1) return swing;
          tokens -= 1;
        }
      }
      return 500;
    };
    assert.equal(run(objBurst, objEvery, 2), 500, 'street rocks: no refused frame in 500 swings');
    assert.equal(run(yardBurst, 1 / yardEverySec, 1), 500, 'home rocks: no "Slow down" in 500 swings');
  });
});
