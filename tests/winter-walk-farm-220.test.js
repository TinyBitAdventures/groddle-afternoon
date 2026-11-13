/**
 * #220 (Friendly, live 2026-11-12): "Winter Walk still allows you to leave or time out after
 * collecting quoins, and then you can just play it over and over collecting img quoins", with
 * motes of "+864", "+7,906" and "+19,800 iMG".
 *
 * The farm: leaving or timing out fails the first walk and takes it out of the log
 * (winter_walk.js onExitLocation 96-107, quests_fail_and_remove), so it is offered again at once,
 * and every retry spawned all fifteen motes again. A run now lasts until the walk is finished:
 * the motes taken in it are kept in the quest save and a retry leaves them out
 * (js/winter-walk.js winterWalkRun). Finishing clears the run, so a repeat walk starts full.
 *
 * The values: a mote is a quoin with a fixed benefit (items/quoin.js 165) times the player's quoin
 * multiplier (171-174) times the mood bonus (184 -> inc_stats.js stats_xp_apply_bonus 559-562).
 * The table held Lily Linguistic's shown amounts (2Xko9Hy-cLE: +120, +3000, +600, +720 and a
 * white +1098), which already carried her x1.2 mood bonus, and the game applied the player's own
 * multiplier and mood on top: Friendly at x6 got 120 x6 x1.2 = 864, 3000 x6 x1.1 = 19,800, and
 * 1098 x6 x1.2 = 7,906. The +1098 was a Qurazy quoin: 915 is qurazy_rewards[59] (level 60,
 * config_base.js 263-323) x1.2; a Qurazy pays by level, takes no multiplier (quoin.js 207-210) and
 * stays outside the daily limit (159, 236).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  WINTER_MOTE_REWARDS,
  WINTER_WALK_QUEST_ID,
  WINTER_WALK_REPEAT_QUEST_ID,
  canOfferWinterWalk,
  collectWinterMote,
  createWinterWalkState,
  enterWinterHaven,
  failInterruptedWinterWalk,
  noteWinterMoteTaken,
  noteWinterWalkEnd,
  returnToWinterWalk,
  winterMoteKind,
  winterWalkProgress,
  winterWalkRun,
} from '../public/js/winter-walk.js?v=f830b2aa';
import { collectQuoin, createQuoinState } from '../public/js/quoins.js?v=61be601c';

const root = join(import.meta.dirname, '..');
const T = 1_800_000_000_000;
const quests = (completed = [], active = {}) => ({ completed: [...completed], active: { ...active }, story: {} });

/** Takes a mote the way game.js collectWinterWalkMote does: the walk's state, then the run. */
function take(qs, state, stage, index, now) {
  const r = collectWinterMote(state, stage, index, now);
  if (r.ok) noteWinterMoteTaken(qs, { repeat: state.repeat, stage, index });
  return r;
}

describe('#220 a left or timed-out walk keeps the motes it took', () => {
  it('the first walk: leave after six motes, start again, and those six stay gone', () => {
    const qs = quests(['blue_and_white_part1'], { [WINTER_WALK_QUEST_ID]: { progress: {} } });
    let state = createWinterWalkState({ now: T, run: winterWalkRun(qs) });
    for (const i of [0, 1, 2, 3, 4, 5]) assert.equal(take(qs, state, 'surface', i, T + 1000).ok, true);
    // Left early (or ran out of time): failed and taken out of the log, offered again at once.
    delete qs.active[WINTER_WALK_QUEST_ID];
    noteWinterWalkEnd(qs, { repeat: false, outcome: 'failed', now: T + 2000 });
    assert.equal(canOfferWinterWalk(qs, { now: T + 3000, level: 19 }).ok, true);

    state = createWinterWalkState({ now: T + 4000, run: winterWalkRun(qs) });
    assert.deepEqual(state.collected.surface, [0, 1, 2, 3, 4, 5]);
    assert.deepEqual(winterWalkProgress(state), { collected: 6, total: 15 });
    for (const i of [0, 2, 5]) assert.equal(collectWinterMote(state, 'surface', i, T + 5000).reason, 'already_collected');
    // The haven's and the way home's motes are still there to take.
    enterWinterHaven(state, T + 6000);
    assert.equal(take(qs, state, 'haven', 0, T + 6100).ok, true);
    returnToWinterWalk(state, T + 7000);
    assert.equal(take(qs, state, 'return', 1, T + 7100).ok, true);

    // A third try: nothing taken twice.
    noteWinterWalkEnd(qs, { repeat: false, outcome: 'failed', now: T + 8000 });
    state = createWinterWalkState({ now: T + 9000, run: winterWalkRun(qs) });
    assert.deepEqual(state.collected, { surface: [0, 1, 2, 3, 4, 5], haven: [0], return: [1] });
  });

  it('a walk lost with the page keeps its run too', () => {
    const qs = quests(['blue_and_white_part1'], { [WINTER_WALK_QUEST_ID]: { progress: {} } });
    const state = createWinterWalkState({ now: T, run: winterWalkRun(qs) });
    take(qs, state, 'surface', 2, T + 1000);
    assert.deepEqual(failInterruptedWinterWalk(qs, T + 2000), [WINTER_WALK_QUEST_ID]);
    assert.deepEqual(createWinterWalkState({ now: T + 3000, run: winterWalkRun(qs) }).collected.surface, [2]);
  });

  it('finishing the walk ends the run: the repeat starts with every mote, and a failed repeat keeps its own', () => {
    const qs = quests(['blue_and_white_part1']);
    const first = createWinterWalkState({ now: T, run: winterWalkRun(qs) });
    take(qs, first, 'surface', 0, T + 100);
    noteWinterWalkEnd(qs, { repeat: false, outcome: 'complete', now: T + 200 });
    assert.equal(qs.story.winterWalk.runs[WINTER_WALK_QUEST_ID], undefined);

    const repeat = createWinterWalkState({ now: T + 1000, repeat: true, run: winterWalkRun(qs, { repeat: true }) });
    assert.deepEqual(winterWalkProgress(repeat).collected, 0);
    take(qs, repeat, 'surface', 2, T + 1100);
    noteWinterWalkEnd(qs, { repeat: true, outcome: 'failed', now: T + 1200 });
    const retry = createWinterWalkState({ now: T + 3_700_000, repeat: true, run: winterWalkRun(qs, { repeat: true }) });
    assert.deepEqual(retry.collected.surface, [2]);
    noteWinterWalkEnd(qs, { repeat: true, outcome: 'complete', now: T + 3_800_000 });
    const next = createWinterWalkState({ now: T + 7_500_000, repeat: true, run: winterWalkRun(qs, { repeat: true }) });
    assert.deepEqual(winterWalkProgress(next).collected, 0);
  });

  it('a saved run is cleaned on read (unknown stages, out-of-range and repeated indexes dropped)', () => {
    const qs = quests();
    qs.story.winterWalk = { runs: { [WINTER_WALK_QUEST_ID]: { collected: { surface: [2, 2, '1', 99, -1, 'x'], bogus: [1], haven: 'no' } } } };
    assert.deepEqual(winterWalkRun(qs).collected, { surface: [1, 2], haven: [], return: [] });
    assert.deepEqual(winterWalkRun(qs, { repeat: true }).collected, { surface: [], haven: [], return: [] });
    assert.ok(qs.story.winterWalk.runs[WINTER_WALK_REPEAT_QUEST_ID]);
  });
});

describe('#220 mote values follow the quoin rule', () => {
  const pc = (mood) => ({ level: 19, mood, energyMax: 100, imagination: 0, xp: 0 });
  const pay = (benefit, { multiplier = 6, mood = 100, kind = 'xp' } = {}) => {
    const qs = createQuoinState({ multiplier, dailyLimit: 110 });
    return collectQuoin(qs, kind, pc(mood), { amount: benefit }).actual;
  };

  it('the old table explains Friendly\'s three numbers (her x6 on amounts that already held a x1.2)', () => {
    assert.equal(pay(120), 864);
    assert.equal(pay(1098), 7906);
    assert.equal(pay(3000, { mood: 85 }), 19800);
  });

  it('the table is now the benefit before mood (Lily\'s amounts / 1.2), and her run comes back exactly', () => {
    assert.deepEqual(WINTER_MOTE_REWARDS.surface, [100, 100, 2500, 100, 100, 200]);
    assert.deepEqual(WINTER_MOTE_REWARDS.haven, [100, 100, 100, 200, 100, 100]);
    assert.deepEqual(WINTER_MOTE_REWARDS.return.slice(1), [500, 600]);
    // Lily: multiplier 1, mood over 90%, level 60.
    const lily = (benefit, kind = 'xp') => {
      const qs = createQuoinState({ multiplier: 1 });
      return collectQuoin(qs, kind, { level: 60, mood: 100, energyMax: 100 }, { amount: benefit }).actual;
    };
    assert.deepEqual([100, 2500, 500, 600].map((b) => lily(b)), [120, 3000, 600, 720]);
    assert.equal(lily(0, 'qurazy'), 1098);
  });

  it('the return\'s first mote is a Qurazy: paid by level, no multiplier, outside the daily limit', () => {
    assert.equal(winterMoteKind('return', 0), 'qurazy');
    assert.equal(winterMoteKind('surface', 2), 'xp');
    const state = createWinterWalkState({ now: T });
    enterWinterHaven(state, T + 1);
    returnToWinterWalk(state, T + 2);
    assert.equal(collectWinterMote(state, 'return', 0, T + 3).kind, 'qurazy');
    // Level 19: qurazy_rewards[18] = 153, x1.2 mood, whatever the multiplier.
    assert.equal(pay(0, { kind: 'qurazy' }), 184);
    const full = createQuoinState({ multiplier: 6, dailyLimit: 110, collectedToday: 110 });
    const r = collectQuoin(full, 'qurazy', pc(100), { amount: 0 });
    assert.equal(r.ok, true);
    assert.equal(full.collectedToday, 110);
  });

  it('at Friendly\'s x6 and full mood a whole walk now pays 35,280 iMG plus the Qurazy, not 50,242', () => {
    const benefit = Object.values(WINTER_MOTE_REWARDS).flat().reduce((a, b) => a + b, 0);
    assert.equal(benefit, 4900);
    assert.equal(Object.values(WINTER_MOTE_REWARDS).flat().reduce((sum, b) => sum + (b ? pay(b) : 0), 0), 35280);
  });
});

describe('#220 game.js keeps the run', () => {
  const game = readFileSync(join(root, 'public', 'game.js'), 'utf8');
  const fn = (name) => {
    const at = game.indexOf(`function ${name}(`);
    assert.ok(at >= 0, name);
    return game.slice(at, game.indexOf('\n}\n', at));
  };

  it('starts a walk from its saved run, notes every mote taken, and saves', () => {
    assert.match(fn('startWinterWalk'), /createWinterWalkState\(\{[\s\S]*?run: winterWalkRun\(questState, \{ repeat \}\),[\s\S]*?\}\)/);
    const collect = fn('collectWinterWalkMote');
    assert.match(collect, /noteWinterMoteTaken\(questState, \{ repeat: winterWalkState\.repeat, stage: entry\.stage, index: entry\.index \}\)/);
    assert.match(collect, /savePlayerState\(\);\n\s+return true;/);
  });

  it('draws the Qurazy mote with the Qurazy art, untinted', () => {
    const spawn = fn('spawnWinterMotes');
    assert.match(spawn, /const kind = winterMoteKind\(stage, index\);\n\s+const sprite = new PIXI\.AnimatedSprite\(quoinFrames\(kind\)\);/);
    assert.match(spawn, /if \(kind !== 'qurazy'\) sprite\.tint = /);
  });
});
