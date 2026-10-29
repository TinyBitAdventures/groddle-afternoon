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
  SUMMERS_DAY_ROUTE,
  SUMMERS_DAY_SOURCE_SPAWN,
  SUMMERS_DAY_STREET_TSID,
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
  summersDayStreetPoint,
} from '../public/js/summers-day.js?v=g452-1';

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

test('the street\'s moments count once each, in any order, and the go_bonus box ends the memory', () => {
  const run = createSummersDayRun({ now: 0 });
  assert.equal(advanceSummersDayCheckpoint(run, 'bird_1', 100).ok, true);
  assert.equal(advanceSummersDayCheckpoint(run, 'bird_1', 200).reason, 'already_complete');
  assert.equal(advanceSummersDayCheckpoint(run, 'nope', 200).reason, 'unknown');
  assert.equal(run.checkpoints.length, 1);
  assert.match(summersDayObjective(run), /first stone/i);
  // Each source event gates only on its own flag: a player may take the orbs in any order.
  assert.equal(advanceSummersDayCheckpoint(run, 'orb_3', 300).ok, true);
  assert.match(summersDayObjective(run), /first stone/i);
  assert.equal(enterSummersDayBonus(run, 400).reason, 'main_incomplete');
  // callback_blue_and_white_go_bonus asked for nothing else.
  assert.equal(advanceSummersDayCheckpoint(run, 'exit', 500).reason, 'main_complete');
  assert.equal(enterSummersDayBonus(run, 600).ok, true);
  // The second stone raises the boulder the first dot hangs off.
  assert.ok(SUMMERS_DAY_CHECKPOINTS.indexOf('stone_2') < SUMMERS_DAY_CHECKPOINTS.indexOf('dot_1'));
});

const LOCATIONS = path.join(root, '../streets/mnt/stos/location_data');
const puzzle = JSON.parse(fs.readFileSync(path.join(root, 'public/assets/content/puzzle-triggers.json'), 'utf8'))
  .streets[SUMMERS_DAY_STREET_TSID];
const summerStreet = JSON.parse(fs.readFileSync(path.join(root, `public/assets/streets/${SUMMERS_DAY_STREET_TSID}.json`), 'utf8'));

test('the memory is Tiny Speck\'s imported copy of the main template', { skip: !fs.existsSync(LOCATIONS) }, () => {
  const xml = fs.readFileSync(path.join(LOCATIONS, 'LNVV9IM8PL4301V.xml'), 'utf8');
  assert.match(xml, /<str id="instance_of">LNVIH6NU3M13MJJ<\/str>/);
  assert.match(xml, /<str id="instance_id">blue_and_white<\/str>/);
  // The signs print the street's own sign_txt, word for word.
  const g = fs.readFileSync(path.join(LOCATIONS, 'GNVV9IM8PL4301V.xml'), 'utf8');
  const unescape = (t) => t.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
  for (const [id, text] of Object.entries(puzzle.signs)) {
    const at = g.indexOf(`<object id="${id}">`);
    assert.ok(at > 0, id);
    const body = g.slice(at, g.indexOf('</object>', at));
    assert.equal(unescape(/<str id="sign_txt">([^<]*)<\/str>/.exec(body)[1]), text, id);
  }
});

test('the rebuilt boxes run the street\'s own events and report every moment once', () => {
  assert.equal(summerStreet.tsid, SUMMERS_DAY_STREET_TSID);
  assert.equal(Object.keys(summerStreet.events).length, 44);
  assert.equal(puzzle.instance, 'summers-day');
  assert.equal(puzzle.strict, true);
  const moments = puzzle.triggers.filter((t) => t.moment).map((t) => t.moment);
  assert.deepEqual([...moments].sort(), [...SUMMERS_DAY_CHECKPOINTS].sort());
  for (const t of puzzle.triggers) {
    for (const name of [...(t.onEnter || []), ...(t.onExit || [])]) assert.ok(summerStreet.events[name], `${t.id}: ${name}`);
  }
  // The exit is the archived box itself, not a rebuilt one.
  const exit = puzzle.triggers.find((t) => t.moment === 'exit');
  const box = summerStreet.boxes.find((b) => b.id === 'blue_and_white_go_bonus');
  assert.deepEqual([exit.x, exit.y, exit.w, exit.h], [box.x, box.y, box.w, box.h]);
  // The swim is the street's set_phys / reset_phys, not a remake buoyancy.
  const water = puzzle.triggers.find((t) => t.moment === 'water');
  assert.deepEqual(water.onEnter, ['set_phys', 'swim_on']);
  assert.ok(summerStreet.events.set_phys.some((a) => a.type === 'physics' && a.param === 'jetpack' && a.value === 1));
  assert.ok(puzzle.triggers.filter((t) => t.onEnter.includes('reset_phys')).length >= 2);
  // The drowning teleporter lands in a reset box.
  const drown = puzzle.triggers.find((t) => t.teleport);
  const reset = puzzle.triggers.filter((t) => t.onEnter.includes('reset_phys'));
  assert.ok(reset.some((t) => Math.abs(drown.teleport.x - t.x) <= t.w / 2 && drown.teleport.y <= t.y && drown.teleport.y >= t.y - t.h));
  // Spawn: onStarted's questInstanceLocation x, y in the street's screen space.
  assert.deepEqual(puzzle.start, summersDayStreetPoint(SUMMERS_DAY_SOURCE_SPAWN));
});

test('the QA route stands inside each moment\'s box', () => {
  const bodyH = 58; // the 0.622 pc_scale avatar, as puzzles-feature measures it
  for (const step of SUMMERS_DAY_ROUTE) {
    const at = summersDayStreetPoint(step);
    const boxes = step.id === 'reset'
      ? puzzle.triggers.filter((t) => t.onEnter.includes('reset_phys'))
      : puzzle.triggers.filter((t) => t.moment === step.id);
    const hit = boxes.some((t) => {
      if (Math.abs(at.x - t.x) > t.w / 2) return false;
      const top = t.y - t.h;
      const bottom = t.y + 4;
      return t.body ? at.y >= top && at.y - bodyH <= bottom : at.y <= bottom && at.y >= top;
    });
    assert.ok(hit, step.id);
  }
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

test('client integration runs the real street, its HUD and deterministic QA', () => {
  const game = fs.readFileSync(path.join(root, 'public/game.js'), 'utf8');
  const html = fs.readFileSync(path.join(root, 'public/play/index.html'), 'utf8');
  const css = fs.readFileSync(path.join(root, 'public/style.css'), 'utf8');
  // The Annex is still drawn from its recovered decos.
  for (const file of ['pulseDot.png', 'firebog_ladder.png']) {
    assert.equal(
      fs.existsSync(path.join(root, 'public/assets/decos/groddle', file.replace(/\.png$/, '.webp'))),
      true,
      file
    );
  }
  assert.match(game, /startSummersDay/);
  assert.match(game, /advanceSummersDayMoment/);
  assert.match(game, /await enterStreet\(SUMMERS_DAY_STREET_TSID, \{/);
  assert.match(game, /heldInstance: \(\) => summersDayHeldInstance\(\)/);
  assert.match(game, /summerautoplay/);
  assert.match(game, /source-pulse-dots-and-ladder/);
  assert.match(game, /tiny-speck-street/);
  assert.match(game, /source-flitterbug/);
  assert.match(game, /recovered-firebog-ladder/);
  assert.match(game, /summerDayAnnexDotReward/);
  assert.match(game, /summerDayGuide/);
  // The drawn stand-ins are gone: the street, its flitterbugs and its own swim replace them.
  for (const gone of ['drawSummersDayMainBackground', 'makeSummersDayCheckpoint', 'handleSummersDayBuoyancyInput', 'summersDayBuoyancyPhysics', 'white-memory-silhouettes', 'source-white-owl', 'owl_1.png']) {
    assert.doesNotMatch(game, new RegExp(gone), gone);
  }
  // G99: the memory opts out of the Dametime tint through the general ownLight flag.
  assert.match(game, /The memory's blue-and-white light is its own: no Dametime tint\.\n\s*currentStreet\.ownLight = true/);
  assert.match(game, /The memory's blue-and-white light is its own: no Dametime tint\.\n\s*ownLight: true/);
  assert.match(game, /const preserveAuthoredLight = Boolean\(currentStreet\?\.ownLight\)/);
  assert.match(game, /SUMMERS_DAY_COMPLETION\.replace\('\{pc_label\}', 'friend'\)/);
  assert.match(game, /dataset\.summerDayMainTsid/);
  assert.match(game, /dataset\.summerDayStreet = SUMMERS_DAY_STREET_TSID/);
  assert.match(html, /id="summers-day-hud"/);
  assert.match(html, /summer=summers-day-7/);
  assert.match(css, /\.summers-day-hud/);
});
