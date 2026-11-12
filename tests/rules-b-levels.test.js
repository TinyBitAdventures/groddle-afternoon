// rules-b (2026-11-12): quoins that skip or keep the day's limit, level-ups (refill gate, XP cap,
// words, the street line online), teleport costs from your own tank, the Energy Tank card, the
// musicblock game day, low mood warnings and the new day's holds.
import assert from 'node:assert/strict';
import { describe, it, afterEach } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { collectQuoin, createQuoinState } from '../public/js/quoins.js?v=61be601c';
import { MAX_XP, XP_FOR_LEVEL, reconcilePlayerProgression } from '../public/js/progression.js?v=72b2b22a';
import { loseMood, setMetabolicGainGate, setMoodLossNotice } from '../public/js/metabolics.js?v=1383e6fd';
import { gameDayIndex } from '../public/js/musicblocks.js?v=f1bf2ad6';
import { GAME_EPOCH_MS, GAME_DAY_MS } from '../public/js/game-day.js?v=84569fa2';
import { levelUpStreetLine } from '../public/js/features/level-up-mp-feature.js?v=22659e6d';

const pub = (...p) => readFileSync(join(import.meta.dirname, '..', 'public', ...p), 'utf8');

afterEach(() => {
  setMetabolicGainGate(null);
  setMoodLossNotice(null);
});

describe('quoins past the day\'s limit (items/quoin.js 159, 236)', () => {
  it('Rainbow Run skips the limit and does not count; Top of the Tree stops at it but does not count', () => {
    const state = createQuoinState({ collectedToday: 100, dailyLimit: 100 });
    const pc = { mood: 10, energyMax: 100, xp: 0, imagination: 0 };
    const run = collectQuoin(state, 'mood', pc, { amount: 5, skipLimit: true, uncounted: true });
    assert.equal(run.ok, true);
    assert.equal(state.collectedToday, 100);
    assert.equal(collectQuoin(state, 'mood', pc, { amount: 5, uncounted: true }).reason, 'daily_limit');
    const below = createQuoinState({ collectedToday: 50, dailyLimit: 100 });
    assert.equal(collectQuoin(below, 'mood', pc, { amount: 5, uncounted: true }).ok, true);
    assert.equal(below.collectedToday, 50);
    assert.match(pub('js', 'quest-rooms', 'top-of-tree.js'), /if \(!ctx\.collectQuoin\(q\.type, q\.x, q\.y, \{ uncounted: true \}\)\?\.ok\) continue;/);
  });

  it('a full meter still shows the quoin\'s own amount', () => {
    const game = pub('game.js');
    assert.match(game, /if \(result\.resolvedTypeId === 'energy'\) return `\+\$\{result\.amount\} energy`;/);
    assert.doesNotMatch(game, /Energy already full/);
  });
});

describe('level-ups (players/inc_stats.js 338, 363-374)', () => {
  it('Super Pooped refills mood only; dead refills nothing', () => {
    let pooped = true;
    let dead = false;
    setMetabolicGainGate((stat) => (dead || (pooped && stat === 'energy') ? { ok: false, msg: '' } : { ok: true }));
    const pc = { level: 2, xp: XP_FOR_LEVEL[1], energy: 10, mood: 10, energyMax: 100 };
    let up = reconcilePlayerProgression(pc);
    assert.equal(up.leveledUp, true);
    assert.equal(pc.energy, 10);
    assert.equal(pc.mood, 100);
    pooped = false;
    dead = true;
    const ghost = { level: 2, xp: XP_FOR_LEVEL[1], energy: 0, mood: 0, energyMax: 100 };
    up = reconcilePlayerProgression(ghost);
    assert.equal(ghost.energy, 0);
    assert.equal(ghost.mood, 0);
  });

  it('XP stops at level 60\'s threshold; iMG is untouched', () => {
    const pc = { level: 60, xp: MAX_XP + 5000, imagination: 9, energy: 50, mood: 50 };
    reconcilePlayerProgression(pc);
    assert.equal(pc.xp, MAX_XP);
    assert.equal(pc.imagination, 9);
    assert.equal(pc.level, 60);
  });

  it('the words: "Woo! you\'ve reached level N!!!" and, online, "<name> just reached level N!"', () => {
    assert.match(pub('game.js'), /const activity = `Woo! you've reached level \$\{levelUpdate\.toLevel\}!!!`;/);
    assert.equal(levelUpStreetLine('Ada', 7), 'Ada just reached level 7!');
    assert.match(pub('js', 'features', 'index.js'), /FEATURES\.push\(levelUpMpFeature\);/);
  });
});

describe('teleporting and the Energy Tank card', () => {
  it('the energy cost is a share of your own tank (inc_teleportation.js 920-937)', () => {
    const src = pub('js', 'features', 'teleportation-feature.js');
    assert.doesNotMatch(src, /const TANK = 100;/);
    assert.match(src, /const tankOf = \(engine\) => energyMax\(engine\?\.pc\);/);
    // A gone script's refund is iMG only (teleportation_script.js 323).
    assert.doesNotMatch(src, /engine\.pc\.xp = \(engine\.pc\.xp \|\| 0\) \+ out\.refundImg;/);
  });

  it('an Energy Tank card refills energy and mood, never while dead (inc_imagination.js 140-142)', () => {
    const src = pub('js', 'features', 'imagination-feature.js');
    assert.match(src, /if \(refill && !hellFeature\.isDead\?\.\(\)\) \{\s*pc\.energy = pc\.energyMax;\s*pc\.mood = pc\.energyMax;/);
  });
});

describe('days and moods', () => {
  it('the musicblock day starts at the game epoch (musicblock_d_green_01.js 177-200)', () => {
    assert.equal(gameDayIndex(GAME_EPOCH_MS), 0);
    assert.equal(gameDayIndex(GAME_EPOCH_MS + GAME_DAY_MS - 1), 0);
    assert.equal(gameDayIndex(GAME_EPOCH_MS + GAME_DAY_MS), 1);
    // An hour before the epoch's 4 h mark is still the earlier day.
    const mark = GAME_EPOCH_MS + 10 * GAME_DAY_MS;
    assert.equal(gameDayIndex(mark - 3_600_000), 9);
  });

  it('every mood loss at or under the line warns, the idle loss keeps its crossing (inc_metabolics.js 205-213)', () => {
    const told = [];
    setMoodLossNotice((pc) => told.push(pc.mood));
    const pc = { mood: 40, energyMax: 100 };
    loseMood(pc, 5);
    loseMood(pc, 5, { noWarn: true });
    assert.deepEqual(told, [35]);
    assert.match(pub('js', 'features', 'mood-decay-feature.js'), /loseMood\(pc, res\.loss, \{ quiet: true, noWarn: true \}\);/);
  });

  it('a new day waits in the waterfalls, refills after the intro, and its screen waits for an hour played (player.js 866-905)', () => {
    const game = pub('game.js');
    assert.match(game, /if \(!opts\.force && features\.query\('holdNewDay', engine\) === true\) return false;/);
    assert.match(game, /const introDone = features\.query\('tutorialRunning', engine\) !== true;/);
    assert.match(game, /const NEW_DAY_SCREEN_PLAYED_S = 3600;/);
    assert.match(pub('js', 'features', 'quest-instances-feature.js'), /holdNewDay\(\) \{\s*return run && String\(run\.questId \|\| ''\)\.startsWith\('last_pilgrimage_of_esquibeth'\)/);
    assert.match(pub('js', 'new-player.js'), /playedSeconds: 0/);
  });
});
