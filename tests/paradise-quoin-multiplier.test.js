// #560: Paradise quoins (Beam Me Down and the flight courses) paid the same fixed amounts to every
// player, the amounts a x100 player was recorded getting, so the player's own quoin multiplier
// did nothing there. Glitch paid every quoin Math.round(benefit * pc.stats_get_quoin_multiplier())
// (items/quoin.js 161-174), Paradise ones included ('paradise iMG' / 'paradise currants' are
// benefit 1, 575-590), and Paradise quoins never count toward quoins_today (159, 236).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { quoinPay, createQuoinState } from '../public/js/quoins.js?v=5abad2c7';
import {
  PARADISE_COURSES,
  collectParadisePickup,
  createParadiseRun,
  finishParadiseRun,
  paradiseTicketCost,
  passParadiseRing,
} from '../public/js/paradise-flight.js?v=2ca6d035';
import { recordedBenefit } from '../public/js/paradise-courses.js?v=eb5c7fd9';
import { BEAM_ME_DOWN, beamQuoins } from '../public/js/puzzle-scenes.js?v=04413a6d';
import { moodScaledXp } from '../public/js/mood-xp.js?v=e311b45c';

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(join(here, '..', rel), 'utf8');
const gsjs = join(here, '../../glitch-GameServerJS');

describe('#560 Paradise quoins pay the quoin multiplier', () => {
  it('quoinPay is the source rounding: benefit times the multiplier, 1 to 100', () => {
    assert.equal(quoinPay(1, 100), 100);
    assert.equal(quoinPay(25, 37), 925);
    assert.equal(quoinPay(3, 1.5), 5);
    assert.equal(quoinPay(1, 0), 1, 'no multiplier is x1');
    assert.equal(quoinPay(1, 500), 100, 'capped at x100');
  });

  it('a course pickup pays its benefit times the multiplier', () => {
    for (const course of Object.values(PARADISE_COURSES)) {
      // G1119: Radial Heights' stars pay nothing; its scripted quoins pay (tests/radial-heights-scripts.test.js).
      if (!course.rewards.length) continue;
      for (const m of [1, 4, 100]) {
        const run = createParadiseRun(course.id, { now: 0 });
        for (let i = 0; i < course.pickupCount; i += 1) {
          const def = course.rewards[i % course.rewards.length];
          const got = collectParadisePickup(run, i, 1000, { level: 10, multiplier: m });
          assert.equal(got.ok, true, course.id);
          if (def.type === 'qurazy') continue; // by level, no multiplier (quoin.js 207-209)
          assert.ok(def.benefit >= 1, `${course.id} ${i}`);
          assert.equal(got.reward.amount, def.benefit * m, `${course.id} ${i} x${m}`);
        }
        const done = finishParadiseRun(run, 2000, { multiplier: m });
        if (!course.ringCount) assert.equal(done.completionReward.amount, course.completionReward.benefit * m, course.id);
      }
    }
  });

  it('a x1 player no longer gets the x100 amounts; a x100 player at full mood sees the recorded ones', () => {
    const run = createParadiseRun('mountain_scaling', { now: 0 });
    // The first pickup was recorded +120 iMG: benefit 1.
    assert.equal(collectParadisePickup(run, 0, 1000, { multiplier: 1 }).reward.amount, 1);
    const full = { mood: 100, energy: 100, energyMax: 100, moodMax: 100 };
    for (const recorded of [120, 240, 360, 480, 600, 720, 3000]) {
      assert.equal(moodScaledXp(full, quoinPay(recordedBenefit('xp', recorded), 100)), recorded, String(recorded));
    }
    for (const type of ['mood', 'energy', 'currants', 'favor']) assert.equal(quoinPay(recordedBenefit(type, 100), 100), 100, type);
  });

  it('Cloud Rings pay their benefit times the multiplier too', () => {
    const run = createParadiseRun('cloud_rings', { now: 0 });
    assert.equal(passParadiseRing(run, 1, 1000, { multiplier: 1 }).reward.amount, 1);
    assert.equal(passParadiseRing(run, 4, 1000, { multiplier: 50 }).reward.amount, 500);
  });

  it('a run leaves the day\'s quoin count alone', () => {
    const state = createQuoinState({ multiplier: 100 });
    const before = JSON.stringify(state);
    const run = createParadiseRun('starlit_night', { now: 0 });
    collectParadisePickup(run, 1, 1000, { multiplier: state.multiplier });
    assert.equal(JSON.stringify(state), before);
  });

  it('game.js passes the player\'s multiplier to every Paradise grant', () => {
    const game = read('public/game.js');
    assert.match(game, /collectParadisePickup\(paradiseRun, entry\.index, Date\.now\(\), \{ level: pc\.level, multiplier: quoinState\.multiplier \}\)/);
    assert.match(game, /passParadiseRing\(paradiseRun, entry\.index, Date\.now\(\), \{ multiplier: quoinState\.multiplier \}\)/);
    assert.match(game, /finishParadiseRun\(paradiseRun, Date\.now\(\), \{ multiplier: quoinState\.multiplier \}\)/);
  });

  it('Beam Me Down quoins are benefit 1 and pay through quoinPay with the multiplier', () => {
    const quoins = beamQuoins(BEAM_ME_DOWN);
    assert.equal(quoins.length, 21);
    assert.ok(quoins.every((q) => q.benefit === 1 && q.amount === undefined));
    const feature = read('public/js/features/puzzle-scenes-feature.js');
    assert.match(feature, /const pay = quoinPay\(q\.benefit, engine\.quoinState\?\.multiplier\);/);
    assert.doesNotMatch(feature, /grantMoodXp\(pc, q\.amount\)|creditQuoinStat\(pc, q\.type, q\.amount\)/);
  });

  it('the ticket keeps the source price: 20 x qm to x40, then 20 + (qm - 40) / 4 per qm', () => {
    assert.equal(paradiseTicketCost(1), 20);
    assert.equal(paradiseTicketCost(40), 800);
    assert.equal(paradiseTicketCost(43), 860);
    assert.equal(paradiseTicketCost(44), 924);
    assert.equal(paradiseTicketCost(100), 3500);
  });

  it('matches the source', { skip: !existsSync(join(gsjs, 'items', 'quoin.js')) && 'needs glitch-GameServerJS' }, () => {
    const quoin = readFileSync(join(gsjs, 'items', 'quoin.js'), 'utf8');
    assert.match(quoin, /amount = Math\.round\(amount \* personal_multiplier\);/);
    assert.match(quoin, /case 'paradise iMG':[\s\S]{0,200}?this\.instanceProps\.benefit = "1";/);
    assert.match(quoin, /!this\.container\.isParadiseLocation\(\) && !this\.container\.ignore_quoin_limit[^\n]*\n\t\tpc\.stats_add_quoins_today\(1\);/);
    const ticket = readFileSync(join(gsjs, 'items', 'paradise_ticket.js'), 'utf8');
    assert.match(ticket, /base_cost \+= intval\(\(qm-40\)\/4\);/);
  });
});
