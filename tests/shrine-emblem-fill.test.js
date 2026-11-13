// rules-b (2026-11-12): the donation that fills a Giant's favor brings the emblem (include/shrines.js 632,
// 78-166), no_donate items are refused (300-303), evalDonate's "Do you still want to donate?" (171-343),
// a full pack holds the emblem back (93-99), and favor from anywhere else stops at the emblem target
// with its prompt (players/inc_stats.js 955-998).
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  addGiantFavor,
  claimShrineEmblem,
  createShrineState,
  donateToShrine,
  donationLimitWarning,
  donationValueFor,
  emblemCostFor,
  emblemWaitingLine,
  favorReadyLine,
  isNoDonate,
  listShrineDonationOptions,
  quoteShrineDonation,
} from '../public/js/shrines.js?v=4d558b8b';

const game = readFileSync(join(import.meta.dirname, '..', 'public', 'game.js'), 'utf8');

describe('shrine emblem on the filling donation', () => {
  it('every donation ends in give_emblem, and the emblem replaces the tier answer', () => {
    const give = game.slice(game.indexOf('function doShrineDonation('), game.indexOf('function shrineToolOpts('));
    assert.match(give, /const emblem = canClaimEmblem\(shrineState, giantId\) && grantShrineEmblem\(target, \{ slugs \}\);/);
    assert.match(give, /if \(!emblem\) \{[\s\S]*soundForDonation\(result\.baseCost, result\.bonus\)/);
  });

  it('the first emblem badge gets its card', () => {
    assert.match(game, /announceAchievementUpdates\(applyAchievementProgress\(achieveState, `emblems_acquired:\$\{giantId\}`, 1, pc\)\)/);
  });

  it('a full pack keeps the favor for a later emblem, a first emblem is never held', () => {
    const state = createShrineState();
    state.emblems.alph = 1;
    state.favor.alph = emblemCostFor(state, 'alph');
    const inv = {};
    assert.equal(claimShrineEmblem(state, 'alph', inv, null, { fits: false }).reason, 'pack_full');
    assert.equal(state.favor.alph, 1100);
    assert.equal(claimShrineEmblem(state, 'alph', inv, null, { fits: true }).ok, true);
    assert.equal(state.favor.alph, 0);
    const fresh = createShrineState();
    fresh.favor.mab = 1000;
    assert.equal(claimShrineEmblem(fresh, 'mab', {}, null, { fits: false }).ok, true);
  });

  it('#293: Claim with a full pack says the pack is the reason, as the panel does, not more favor', () => {
    assert.equal(emblemWaitingLine('pot'), 'Pot is ready to grant an emblem once your pack has room for it.');
    const claim = game.slice(game.indexOf('function claimActiveShrineEmblem('), game.indexOf('let shrineEmblemInside'));
    assert.match(claim, /toast\(canClaimEmblem\(shrineState, giantId\) \? emblemWaitingLine\(giantId\) : 'More favor is needed/);
    assert.match(game, /=== 0 \? emblemWaitingLine\(giantId\)/, 'the panel note is the same line');
    // The held emblem comes once there is room: the same claim, now fitting.
    const state = createShrineState();
    state.emblems.pot = 15;
    state.favor.pot = emblemCostFor(state, 'pot');
    const inv = {};
    assert.equal(claimShrineEmblem(state, 'pot', inv, null, { fits: false }).reason, 'pack_full');
    assert.equal(claimShrineEmblem(state, 'pot', inv, null, { fits: true }).ok, true);
    assert.equal(inv.emblem_pot, 1);
  });
});

describe('no_donate items and worthless items', () => {
  it('no_donate classes are refused with the bemused line and never listed', () => {
    assert.equal(isNoDonate('conch'), true);
    assert.equal(isNoDonate('apple'), false);
    const state = createShrineState();
    const q = quoteShrineDonation(state, 'alph', { conch: 2 }, 'conch', 1);
    assert.equal(q.ok, false);
    assert.equal(q.reason, 'no_donate');
    assert.match(q.text, /^Your attempt to donate 1 .+ does not anger the giants, nor does it please them\. In fact, it merely bemuses them\.$/);
    assert.equal(listShrineDonationOptions(state, 'alph', { conch: 2 }).length, 0);
  });

  it('an item with no base cost is worth nothing, not 1', () => {
    assert.equal(donationValueFor('no_such_item_anywhere'), 0);
  });
});

describe('evalDonate warning', () => {
  it('asks only when a limit would be passed, with the source words', () => {
    const state = createShrineState();
    const inv = { metal_post: 10000 };
    const small = quoteShrineDonation(state, 'alph', inv, 'metal_post', 1, { xp: 0 });
    assert.equal(donationLimitWarning(state, small, { level: 1 }), null);
    state.dailyFavor.alph = 990;
    const over = quoteShrineDonation(state, 'alph', inv, 'metal_post', 1000, { xp: 0 });
    const text = donationLimitWarning(state, over, { level: 1 });
    assert.match(text, /^You are currently at 990 out of your possible 1000 daily favor from donations to Alph/);
    assert.match(text, /Do you still want to donate\?$/);
    state.dailyFavor.alph = 1000;
    state.dailyXp = over.xpLimit;
    const full = quoteShrineDonation(state, 'alph', inv, 'metal_post', 1, { xp: 0 });
    assert.match(donationLimitWarning(state, full, { level: 1 }), /^You have reached your maximum of 1000 possible daily favor from donations to Alph and your maximum daily iMG of \d+ from shrine donations\. You will receive no favor or iMG from this donation\./);
    // Level 60 never weighs the iMG limit (shrines.js 256).
    state.dailyFavor.alph = 0;
    assert.equal(donationLimitWarning(state, quoteShrineDonation(state, 'alph', inv, 'metal_post', 1, { xp: 0 }), { level: 60 }), null);
  });
});

describe('favor from rewards stops at the emblem target', () => {
  it('caps each Giant, never lowers favor already past it, and says when it filled', () => {
    const state = createShrineState();
    state.favor.lem = 990;
    state.favor.pot = 1200;
    const rows = addGiantFavor(state, 'all', 50);
    assert.equal(state.favor.lem, 1000);
    assert.equal(state.favor.pot, 1200);
    assert.equal(state.favor.alph, 50);
    assert.deepEqual(rows.filter((r) => r.reached).map((r) => r.giant), ['lem']);
    assert.equal(addGiantFavor(state, 'tii', 5)[0].giant, 'ti');
    assert.equal(favorReadyLine(state, 'lem'), 'You have reached 1000 favor points with Lem. Get to a shrine and collect your emblem!');
  });

  it('quest, project, Paradise, level-up and quoin favor all go through it', () => {
    assert.match(game, /creditGiantFavor\('all', levelUpdate\.favor\)/);
    assert.match(game, /addFavor: \(id, n\) => creditGiantFavor\(id, n\)/);
    const quests = readFileSync(join(import.meta.dirname, '..', 'public', 'js', 'quests.js'), 'utf8');
    assert.match(quests, /pc\.addGiantFavor\(/);
    const jobs = readFileSync(join(import.meta.dirname, '..', 'public', 'js', 'features', 'street-jobs-feature.js'), 'utf8');
    assert.match(jobs, /pc\.addGiantFavor\(/);
  });

  it('a full donation still lands its favor up to the target', () => {
    const state = createShrineState();
    const pc = { xp: 0, imagination: 0, mood: 50 };
    const r = donateToShrine(state, 'alph', { metal_post: 200 }, pc, 'metal_post', 200, { rng: () => 0.5, ticketRoll: 1 });
    assert.equal(r.ok, true);
    assert.equal(state.favor.alph, 1000);
  });
});
