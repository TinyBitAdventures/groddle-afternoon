import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  SUMMERS_DAY_BONUS_DURATION_MS,
  SUMMERS_DAY_BONUS_DOT_COUNT,
  SUMMERS_DAY_BONUS_DOT_IMG,
  SUMMERS_DAY_BONUS_PRODUCTION_TSID,
  SUMMERS_DAY_CHECKPOINTS,
  SUMMERS_DAY_FIRST_OFFER_COOLDOWN_MS,
  SUMMERS_DAY_FIRST_PRODUCTION_TSID,
  SUMMERS_DAY_GUIDE_LINES,
  SUMMERS_DAY_MAIN_DURATION_MS,
  SUMMERS_DAY_MAIN_PRODUCTION_TSID,
  SUMMERS_DAY_QUEST_ID,
  SUMMERS_DAY_QURAZY_OFFSETS,
  SUMMERS_DAY_REPEAT_COOLDOWN_MS,
  SUMMERS_DAY_REPEAT_QUEST_ID,
  advanceSummersDayCheckpoint,
  canOfferSummersDay,
  collectSummersDayBonusQuoin,
  createSummersDayRun,
  ensureSummersDayStory,
  enterSummersDayBonus,
  expireSummersDay,
  finishSummersDay,
  markSummersDayOffered,
  summersDayObjective,
  summersDayQurazyPoints,
  summersDayRemainingMs,
} from '../public/js/summers-day.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function questState() {
  return { active: {}, completed: [], story: {} };
}

function completeMain(run, now = 1000) {
  for (const checkpoint of SUMMERS_DAY_CHECKPOINTS) {
    assert.equal(advanceSummersDayCheckpoint(run, checkpoint, now).ok, true);
  }
}

test('A Summer’s Day preserves the source quest ids, production templates, and timers', () => {
  assert.equal(SUMMERS_DAY_QUEST_ID, 'blue_and_white_part1');
  assert.equal(SUMMERS_DAY_REPEAT_QUEST_ID, 'blue_and_white_part2');
  assert.equal(SUMMERS_DAY_FIRST_PRODUCTION_TSID, 'LNVIABSR3M139C7');
  assert.equal(SUMMERS_DAY_MAIN_PRODUCTION_TSID, 'LNVIH6NU3M13MJJ');
  assert.equal(SUMMERS_DAY_BONUS_PRODUCTION_TSID, 'LNVIL1E14M13K5I');
  assert.equal(SUMMERS_DAY_MAIN_DURATION_MS, 300000);
  assert.equal(SUMMERS_DAY_BONUS_DURATION_MS, 120000);
  assert.equal(SUMMERS_DAY_BONUS_DOT_COUNT, 8);
  assert.equal(SUMMERS_DAY_BONUS_DOT_IMG, 8);
  assert.deepEqual(SUMMERS_DAY_GUIDE_LINES, {
    bird_1: 'Hey, I’m up here!\nCan you reach me?',
    bird_2: 'Not bad.\nTry this next one.',
    bird_3: 'Almost there.',
    bird_4: 'Wow, you’re pretty good!\nI’ve got something upstairs for you.',
  });
});

test('the recovered collision event graph advances in order and is idempotent', () => {
  const run = createSummersDayRun({ now: 0 });
  assert.equal(advanceSummersDayCheckpoint(run, 'stone_1', 100).reason, 'out_of_order');
  assert.equal(advanceSummersDayCheckpoint(run, 'bird_1', 100).ok, true);
  assert.equal(advanceSummersDayCheckpoint(run, 'bird_1', 200).reason, 'already_complete');
  assert.equal(run.checkpoints.length, 1);
  assert.match(summersDayObjective(run), /first stone/i);
});

test('the main memory opens the two-minute Annex and Annex quoins are unique', () => {
  const run = createSummersDayRun({ now: 0 });
  assert.equal(enterSummersDayBonus(run, 100).reason, 'main_incomplete');
  completeMain(run);
  assert.equal(enterSummersDayBonus(run, 2000).ok, true);
  assert.equal(run.expiresAt, 122000);
  assert.equal(collectSummersDayBonusQuoin(run, 0, 2100).amount, 8);
  assert.equal(collectSummersDayBonusQuoin(run, 0, 2200).reason, 'already_collected');
  assert.equal(collectSummersDayBonusQuoin(run, 8, 2200).reason, 'invalid_quoin');
  assert.equal(collectSummersDayBonusQuoin(run, 1, 2300).amount, 8);
  assert.equal(run.bonusImgEarned, 16);
  assert.match(summersDayObjective(run), /Annex/i);
});

test('first completion creates five persisted Qurazy quoins; repeats do not', () => {
  const firstState = questState();
  const first = createSummersDayRun({
    now: 0,
    sourceLocation: { tsid: 'GLI2V0UN7RD1T2J', x: 400, y: 700 },
  });
  completeMain(first);
  enterSummersDayBonus(first, 2000);
  const firstDone = finishSummersDay(first, firstState, 3000);
  assert.equal(firstDone.qurazyCount, 5);
  assert.equal(ensureSummersDayStory(firstState).pendingQurazies, 5);
  assert.equal(ensureSummersDayStory(firstState).qurazyStreetTsid, 'GLI2V0UN7RD1T2J');
  assert.deepEqual(summersDayQurazyPoints({ x: 400, y: 700 }), [
    { index: 0, x: 290, y: 625 },
    { index: 1, x: 325, y: 560 },
    { index: 2, x: 400, y: 520 },
    { index: 3, x: 475, y: 560 },
    { index: 4, x: 510, y: 625 },
  ]);
  assert.equal(SUMMERS_DAY_QURAZY_OFFSETS.length, 5);

  const repeatState = questState();
  const repeat = createSummersDayRun({ now: 0, repeat: true });
  completeMain(repeat);
  enterSummersDayBonus(repeat, 2000);
  assert.equal(finishSummersDay(repeat, repeatState, 3000).qurazyCount, 0);
  assert.equal(ensureSummersDayStory(repeatState).pendingQurazies, 0);
});

test('offer and repeat cooldowns match the recovered GSJS rules', () => {
  const state = questState();
  assert.equal(canOfferSummersDay(state, { now: 1000 }).ok, true);
  markSummersDayOffered(state, 1000);
  assert.equal(
    canOfferSummersDay(state, { now: 1000 + SUMMERS_DAY_FIRST_OFFER_COOLDOWN_MS - 1 }).reason,
    'cooldown'
  );
  assert.equal(
    canOfferSummersDay(state, { now: 1000 + SUMMERS_DAY_FIRST_OFFER_COOLDOWN_MS }).ok,
    true
  );
  state.completed.push(SUMMERS_DAY_QUEST_ID);
  ensureSummersDayStory(state).firstCompletedAt = 2000;
  assert.equal(
    canOfferSummersDay(state, {
      repeat: true,
      now: 2000 + SUMMERS_DAY_REPEAT_COOLDOWN_MS - 1,
    }).reason,
    'cooldown'
  );
  assert.equal(
    canOfferSummersDay(state, {
      repeat: true,
      now: 2000 + SUMMERS_DAY_REPEAT_COOLDOWN_MS,
    }).ok,
    true
  );
});

test('main and Annex expiry are exact and block late progress', () => {
  const main = createSummersDayRun({ now: 5000 });
  assert.equal(summersDayRemainingMs(main, 304999), 1);
  assert.equal(expireSummersDay(main, null, 304999).reason, 'time_remaining');
  assert.equal(advanceSummersDayCheckpoint(main, 'bird_1', 305000).reason, 'expired');

  const annex = createSummersDayRun({ now: 0 });
  completeMain(annex);
  enterSummersDayBonus(annex, 1000);
  assert.equal(summersDayRemainingMs(annex, 120999), 1);
  assert.equal(collectSummersDayBonusQuoin(annex, 0, 121000).reason, 'expired');
});

test('client integration uses recovered clean decos, HUD, buoyancy, and deterministic QA', () => {
  const game = fs.readFileSync(path.join(root, 'public/game.js'), 'utf8');
  const html = fs.readFileSync(path.join(root, 'public/play/index.html'), 'utf8');
  const css = fs.readFileSync(path.join(root, 'public/style.css'), 'utf8');
  for (const file of [
    'backhill1_blue.png',
    'boulder_1.png',
    'wall_shelf1.png',
    'pulseDot.png',
    'water_ripple_double_1.png',
    'owl_1.png',
    'firebog_ladder.png',
    'vine_rope.png',
  ]) {
    assert.equal(
      fs.existsSync(path.join(root, 'public/assets/decos/groddle', file)),
      true,
      file
    );
  }
  assert.match(game, /startSummersDay/);
  assert.match(game, /advanceSummersDayMoment/);
  assert.match(game, /handleSummersDayBuoyancyInput/);
  assert.match(game, /summerautoplay/);
  assert.match(game, /source-pulse-dots-and-ladder/);
  assert.match(game, /white-memory-silhouettes/);
  assert.match(game, /source-white-owl/);
  assert.match(game, /recovered-firebog-ladder/);
  assert.match(game, /summerDayAnnexDotReward/);
  assert.match(game, /summerDayGuide/);
  assert.match(game, /The Giants’ memory keeps its own light/);
  assert.match(game, /SUMMERS_DAY_COMPLETION\.replace\('\{pc_label\}', 'friend'\)/);
  assert.match(game, /dataset\.summerDayMainTsid/);
  assert.match(html, /id="summers-day-hud"/);
  assert.match(html, /summer=summers-day-7/);
  assert.match(css, /\.summers-day-hud/);
});
