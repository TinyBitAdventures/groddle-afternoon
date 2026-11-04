import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { reachStreet } from '../public/js/builder/reach-graph.js?v=40bfbc44';

import {
  SUMMERS_DAY_ANNEX_BOWL,
  SUMMERS_DAY_ANNEX_CX,
  SUMMERS_DAY_ANNEX_EXIT,
  SUMMERS_DAY_ANNEX_FLOOR_Y,
  SUMMERS_DAY_ANNEX_JUMP_REACH,
  SUMMERS_DAY_ANNEX_LADDER,
  SUMMERS_DAY_ANNEX_PICKUPS,
  SUMMERS_DAY_ANNEX_PICKUP_RISE,
  SUMMERS_DAY_ANNEX_REVEAL,
  SUMMERS_DAY_ANNEX_RISE,
  SUMMERS_DAY_ANNEX_ROOF,
  SUMMERS_DAY_ANNEX_SHELVES,
  SUMMERS_DAY_ANNEX_SPAWN,
  SUMMERS_DAY_ANNEX_TOP_SHELF,
  SUMMERS_DAY_ANNEX_VEIL_Y,
  SUMMERS_DAY_ANNEX_WALLS,
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
  summersDayAnnexAtExit,
  summersDayAnnexStreet,
  summersDayStreetPoint,
} from '../public/js/summers-day.js?v=680eca6e';

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
  // The Annex's seven quoins; its iMG ones pay +6 (306_7Jvz8RQ 1:21-1:28).
  assert.equal(SUMMERS_DAY_BONUS_DOT_COUNT, 7);
  assert.equal(SUMMERS_DAY_BONUS_DOT_IMG, 6);
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

test('the Annex is laid out as the recordings show: a three-column lattice over a bowl, under a pitched roof', () => {
  const byId = Object.fromEntries(SUMMERS_DAY_ANNEX_SHELVES.map((s) => [s.id, s]));
  const mid = (s) => (s.x1 + s.x2) / 2;
  // Bottom up: a pair, a centre shelf, three times over (306_7Jvz8RQ 1:19-1:24).
  assert.deepEqual(SUMMERS_DAY_ANNEX_SHELVES.map((s) => s.id), [
    'pair1_left', 'pair1_right', 'centre1', 'pair2_left', 'pair2_right', 'centre2', 'pair3_left', 'pair3_right', 'centre_top',
  ]);
  const rows = [...new Set(SUMMERS_DAY_ANNEX_SHELVES.map((s) => s.y1))];
  assert.equal(rows.length, 6);
  for (let i = 1; i < rows.length; i += 1) assert.equal(rows[i - 1] - rows[i], SUMMERS_DAY_ANNEX_RISE);
  // Three columns: left and right pairs mirror each other about the centre shelves.
  for (const k of [1, 2, 3]) {
    const l = byId[`pair${k}_left`];
    const r = byId[`pair${k}_right`];
    assert.equal(l.y1, r.y1);
    assert.equal(SUMMERS_DAY_ANNEX_CX - mid(l), mid(r) - SUMMERS_DAY_ANNEX_CX);
    assert.ok(mid(l) < SUMMERS_DAY_ANNEX_CX - 120 && mid(r) > SUMMERS_DAY_ANNEX_CX + 120);
  }
  for (const id of ['centre1', 'centre2', 'centre_top']) assert.equal(mid(byId[id]), SUMMERS_DAY_ANNEX_CX);
  // The ladder stands on the top centre shelf, in the middle, and climbs into the roof.
  assert.equal(SUMMERS_DAY_ANNEX_TOP_SHELF.id, 'centre_top');
  assert.equal(SUMMERS_DAY_ANNEX_LADDER.x, SUMMERS_DAY_ANNEX_CX);
  assert.equal(SUMMERS_DAY_ANNEX_LADDER.y, SUMMERS_DAY_ANNEX_TOP_SHELF.y1);
  assert.deepEqual({ ...SUMMERS_DAY_ANNEX_EXIT }, { x: SUMMERS_DAY_ANNEX_CX, y: SUMMERS_DAY_ANNEX_TOP_SHELF.y1 });
  const { left, right } = SUMMERS_DAY_ANNEX_WALLS;
  assert.equal(SUMMERS_DAY_ANNEX_CX - left, right - SUMMERS_DAY_ANNEX_CX);
  // The roof: from the walls' tops up to a peak over the ladder, the ladder's top above it.
  const roof = SUMMERS_DAY_ANNEX_ROOF;
  assert.equal(roof[0].x, left);
  assert.equal(roof.at(-1).x, right);
  const peak = roof.reduce((a, b) => (b.y < a.y ? b : a));
  assert.equal(peak.x, SUMMERS_DAY_ANNEX_CX);
  for (let i = 1; i < roof.length; i += 1) {
    assert.ok(roof[i].x > roof[i - 1].x);
    assert.ok(roof[i].x <= peak.x ? roof[i].y < roof[i - 1].y : roof[i].y > roof[i - 1].y);
  }
  assert.ok(roof[0].y < SUMMERS_DAY_ANNEX_TOP_SHELF.y1 - 80);
  assert.ok(SUMMERS_DAY_ANNEX_LADDER.y - SUMMERS_DAY_ANNEX_LADDER.h < peak.y);
  // The bowl: down from each wall to a flat floor in the middle, under the lowest pair.
  const bowl = SUMMERS_DAY_ANNEX_BOWL;
  assert.equal(bowl[0].x, left);
  assert.equal(bowl.at(-1).x, right);
  const floor = bowl.filter((p) => p.y === SUMMERS_DAY_ANNEX_FLOOR_Y);
  assert.equal(floor.length, 2);
  assert.ok(floor[0].x < SUMMERS_DAY_ANNEX_CX && floor[1].x > SUMMERS_DAY_ANNEX_CX);
  for (let i = 1; i < bowl.length; i += 1) {
    assert.ok(bowl[i].x > bowl[i - 1].x);
    if (bowl[i].x <= floor[0].x) assert.ok(bowl[i].y > bowl[i - 1].y, 'left side goes down');
    if (bowl[i - 1].x >= floor[1].x) assert.ok(bowl[i].y < bowl[i - 1].y, 'right side goes up');
  }
  assert.ok(bowl[0].y > byId.pair1_left.y1 && bowl.at(-1).y > byId.pair1_right.y1);
  // The spawn is on the floor; the reveal bubble hangs over it (a jump reaches it), under the veil's rim.
  assert.equal(SUMMERS_DAY_ANNEX_SPAWN.y, SUMMERS_DAY_ANNEX_FLOOR_Y);
  assert.ok(SUMMERS_DAY_ANNEX_REVEAL.y > SUMMERS_DAY_ANNEX_VEIL_Y);
  assert.ok(SUMMERS_DAY_ANNEX_FLOOR_Y - 28 - SUMMERS_DAY_ANNEX_JUMP_REACH - SUMMERS_DAY_ANNEX_REVEAL.y < 46 - 15);
  assert.ok(SUMMERS_DAY_ANNEX_VEIL_Y > byId.pair1_left.y1);
});

test('the Annex pays its seven quoins in the recorded places: currants low left, mood middle right, iMG elsewhere', () => {
  assert.equal(SUMMERS_DAY_ANNEX_PICKUPS.length, SUMMERS_DAY_BONUS_DOT_COUNT);
  const by = Object.fromEntries(SUMMERS_DAY_ANNEX_PICKUPS.map((p) => [p.shelf, `${p.type}:${p.amount}`]));
  assert.deepEqual(by, {
    pair1_left: 'currants:51',
    pair1_right: 'xp:6',
    centre1: 'xp:6',
    pair2_left: 'xp:6',
    pair2_right: 'mood:5',
    pair3_left: 'xp:6',
    pair3_right: 'xp:6',
  });
  // None over the middle centre shelf or the ladder's shelf.
  assert.equal(by.centre2, undefined);
  assert.equal(by.centre_top, undefined);
  for (const p of SUMMERS_DAY_ANNEX_PICKUPS) {
    const s = SUMMERS_DAY_ANNEX_SHELVES.find((row) => row.id === p.shelf);
    // Walked into: over the shelf's middle (game.js collects within 46 px of mid-body, 28 px up).
    assert.equal(p.x, (s.x1 + s.x2) / 2);
    assert.equal(s.y1 - p.y, SUMMERS_DAY_ANNEX_PICKUP_RISE);
    assert.ok(Math.abs(SUMMERS_DAY_ANNEX_PICKUP_RISE - 28) < 46);
    assert.match(p.source, /306 1:\d\d/);
    assert.match(p.source, /cYK 3:\d\d/);
  }
});

test('every shelf, quoin and the ladder are reached on the remake jump, and no fall strands the player', () => {
  const street = summersDayAnnexStreet();
  // Every rise between rows stays at least 15 px under the measured reach.
  assert.ok(SUMMERS_DAY_ANNEX_JUMP_REACH - SUMMERS_DAY_ANNEX_RISE >= 15);
  const ladder = SUMMERS_DAY_ANNEX_LADDER;
  street.doors = [{ id: 'annex_exit', x: ladder.x, y: ladder.y, w: 40, h: 120 }];
  const arrivals = [
    { x: SUMMERS_DAY_ANNEX_SPAWN.x, y: SUMMERS_DAY_ANNEX_SPAWN.y - 4, from: 'spawn' },
    // Coming back down from the top shelf.
    { x: SUMMERS_DAY_ANNEX_CX - 30, y: SUMMERS_DAY_ANNEX_TOP_SHELF.y1 - 4, from: 'top' },
  ];
  const r = reachStreet(street, arrivals);
  assert.ok(r.arrivals.every((a) => a.stands));
  const exit = r.targets.find((t) => t.id === 'annex_exit');
  assert.deepEqual(exit.reachedFrom, [true, true]);
  // No jump on the way is tight for a keyboard player (PHY-006).
  assert.ok(exit.margin >= 1, `margin ${exit.margin}`);
  // Only the floor behind the walls is out of reach.
  assert.deepEqual(r.unreached.map((u) => u.line).sort(), ['outside_left', 'outside_right']);
  assert.deepEqual(r.traps, []);
  for (const s of SUMMERS_DAY_ANNEX_SHELVES) {
    const runs = r.surfaces.filter((x) => x.line === s.id);
    assert.ok(runs.length && runs.every((x) => x.reached), s.id);
  }
  // The ladder rests on the top shelf; its top is the way out.
  const deck = r.deckless.find((d) => d.id === ladder.id);
  assert.equal(deck.foot, true);
  assert.equal(summersDayAnnexAtExit({ x: ladder.x, y: ladder.y - ladder.h + 20 }), true);
  assert.equal(summersDayAnnexAtExit({ x: ladder.x, y: ladder.y }), false);
  // A jump from the top shelf never reaches the exit: it takes the ladder.
  assert.equal(summersDayAnnexAtExit({ x: ladder.x, y: ladder.y - SUMMERS_DAY_ANNEX_JUMP_REACH }), false);
});

test('the Annex quoins pay their kinds once each, and only iMG counts as Annex iMG', () => {
  const run = createSummersDayRun({ now: 0 });
  completeMain(run);
  assert.equal(enterSummersDayBonus(run, 2000).ok, true);
  assert.equal(run.expiresAt, 122000);
  const first = collectSummersDayBonusQuoin(run, 0, 2100);
  assert.deepEqual([first.type, first.amount], ['currants', 51]);
  assert.equal(collectSummersDayBonusQuoin(run, 0, 2200).reason, 'already_collected');
  assert.equal(collectSummersDayBonusQuoin(run, 7, 2200).reason, 'invalid_quoin');
  const img = collectSummersDayBonusQuoin(run, 1, 2300);
  assert.deepEqual([img.type, img.amount], ['xp', 6]);
  const mood = collectSummersDayBonusQuoin(run, 4, 2400);
  assert.deepEqual([mood.type, mood.amount], ['mood', 5]);
  assert.equal(run.bonusImgEarned, 6);
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
  // The Annex is drawn from the main memory's own decos.
  for (const file of ['pulseDot.png', 'firebog_ladder.png', 'wall_shelf1.png', 'railing.png', 'plant_grass_1.png', 'plant_fern_4.png']) {
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
  assert.match(game, /memory-wall-shelves-quoins-and-ladder/);
  // The Annex walks the same street data the reach test checks, in the memory's white light.
  assert.match(game, /const annex = summersDayAnnexStreet\(\);/);
  assert.match(game, /streetPlatforms = platformsScreen\(annex\);/);
  assert.match(game, /streetWalls = wallsScreen\(annex\);/);
  assert.match(game, /entityLayer\.filters = \[summersDayLightFilter\(SUMMERS_DAY_ENTITY_LIGHT\)\]/);
  assert.match(game, /if \(summersDayAnnexAtExit\(player\)\) \{\n\s*completeSummersDay\(\);/);
  // A save made in the Annex holds where the memory was entered from, never the Annex.
  assert.match(game, /savePlayerLocation\(summersDaySourceLocation\)/);
  assert.doesNotMatch(game, /pale iMG dots/);
  // The switch over the bowl is the main memory's own pulseDot, playing; it lifts the veil.
  assert.match(game, /sceneAnim\(PIXI, 'pulseDot'/);
  assert.match(game, /veil\.alpha = 1 - reveal\.fade/);
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
  assert.match(html, /"game\.js\?v=[0-9a-f]{8}"/);
  assert.match(css, /\.summers-day-hud/);
});
