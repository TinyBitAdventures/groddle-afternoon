import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  DEFAULT_DAILY_QUOIN_LIMIT,
  QUOIN_SHEET,
  QUOIN_TYPES,
  QURAZY_REWARDS,
  collectQuoin,
  createQuoinState,
  normalizeQuoinState,
  planStreetQuoins,
  qrazyRewardForLevel,
  quoinDailyLimitFor,
  quoinLimitPrompt,
  resetQuoinDay,
} from '../public/js/quoins.js?v=61be601c';

const publicRoot = join(import.meta.dirname, '..', 'public');

describe('official quoin economy', () => {
  it('maps the official eight animation scenes in sheet order', () => {
    assert.deepEqual(Object.keys(QUOIN_TYPES), ['xp', 'mood', 'energy', 'currants', 'mystery', 'favor', 'time', 'qurazy']);
    assert.deepEqual(Object.values(QUOIN_TYPES).map((row) => row.row), [0, 1, 2, 3, 4, 5, 6, 7]);
    assert.equal(QUOIN_SHEET.columns * QUOIN_SHEET.frameWidth, 960);
    assert.equal(QUOIN_SHEET.rows * QUOIN_SHEET.frameHeight, 360);
  });

  it('builds a stable, varied plan for each street', () => {
    const one = planStreetQuoins('GLI23D3T123', 8);
    assert.deepEqual(planStreetQuoins('GLI23D3T123', 8), one);
    assert.equal(one.length, 8);
    assert.ok(new Set(one).size >= 6);
  });

  it('applies the personal multiplier to iMG and both XP balances', () => {
    const state = createQuoinState({ multiplier: 3 });
    const pc = { imagination: 10, xp: 20, level: 5 };
    const result = collectQuoin(state, 'xp', pc);
    assert.equal(result.amount, 15);
    assert.equal(pc.imagination, 25);
    assert.equal(pc.xp, 35);
    assert.equal(state.collectedToday, 1);
  });

  it('supports currants and caps metabolic rewards at 100', () => {
    const state = createQuoinState();
    const pc = { currants: 2, energy: 97, mood: 96 };
    assert.equal(collectQuoin(state, 'currants', pc).actual, 7);
    assert.equal(pc.currants, 9);
    assert.equal(collectQuoin(state, 'energy', pc).actual, 3);
    assert.equal(collectQuoin(state, 'mood', pc).actual, 4);
  });

  it('reports a whole-number gain when energy holds a fraction', () => {
    const state = createQuoinState();
    const pc = { energy: 97.7, mood: 50.4 };
    assert.equal(collectQuoin(state, 'energy', pc).actual, 3, 'the HUD goes 97 to 100');
    assert.equal(pc.energy, 100);
    assert.equal(collectQuoin(state, 'mood', pc).actual, 10);
  });

  it('counts a mystery quoin toward the day and pays the kind it rolled (reimagined: items/quoin.js has no mystery branch)', () => {
    const state = createQuoinState();
    const pc = { imagination: 0, xp: 0, energy: 0, mood: 0, currants: 0 };
    const result = collectQuoin(state, 'mystery', pc, { rng: () => 0.8 });
    assert.equal(result.typeId, 'mystery');
    assert.equal(result.resolvedTypeId, 'currants');
    assert.equal(result.amount, QUOIN_TYPES.currants.baseAmount, 'no class: the rolled kind\'s base amount');
    assert.deepEqual([pc.currants, pc.xp, pc.energy, pc.mood], [7, 0, 0, 0]);
    assert.deepEqual(state.byType, { currants: 1 }, 'counted as the kind it paid');
    assert.equal(state.collectedToday, 1);
  });

  it('caps energy and mood at the tank and favor at the emblem target', () => {
    const state = createQuoinState();
    const pc = { energy: 120, mood: 140, energyMax: 150 };
    collectQuoin(state, 'energy', pc);
    collectQuoin(state, 'mood', pc);
    assert.equal(pc.energy, 132);
    assert.equal(pc.mood, 150);
    const favor = { spriggan: 998 };
    const f = collectQuoin(state, 'favor', {}, { giantId: 'spriggan', favor, favorCap: () => 1000 });
    assert.equal(favor.spriggan, 1000);
    assert.equal(f.actual ?? 2, 2);
  });

  it('adds favor for the street Giant and accelerates active study', () => {
    const state = createQuoinState({ multiplier: 2 });
    const pc = {};
    const favor = { spriggan: 4 };
    const f = collectQuoin(state, 'favor', pc, { giantId: 'spriggan', favor });
    assert.equal(f.amount, 10);
    assert.equal(favor.spriggan, 14);
    const t = collectQuoin(state, 'time', pc, {
      accelerateStudy: (seconds) => ({ ok: true, applied: seconds }),
    });
    assert.equal(t.amount, 30);
    assert.equal(t.actual, 30);
    assert.equal(t.acceleration.applied, 30);
    assert.equal(state.studyCredit, 0, 'legacy bank is not used by official acceleration');
  });

  it('uses exact level rewards for Qurazy quoins and bypasses the daily limit', () => {
    assert.equal(QURAZY_REWARDS.length, 60);
    assert.equal(qrazyRewardForLevel(5), 30);
    assert.equal(qrazyRewardForLevel(999), 915);
    const state = createQuoinState({ collectedToday: 100, dailyLimit: 100, multiplier: 9 });
    const pc = { imagination: 0, xp: 0, level: 5 };
    assert.equal(collectQuoin(state, 'xp', pc).reason, 'daily_limit');
    const result = collectQuoin(state, 'qurazy', pc);
    assert.equal(result.amount, 30);
    assert.equal(state.collectedToday, 100);
    assert.equal(state.qurazyFound, 1);
  });

  it('ports official daily-limit upgrades and tracks limit streaks on reset', () => {
    assert.equal(quoinDailyLimitFor([]), DEFAULT_DAILY_QUOIN_LIMIT);
    assert.equal(quoinDailyLimitFor(['daily_quoin_limit_3']), 130);
    const state = createQuoinState({ collectedToday: 100, dailyLimit: 100, limitStreak: 4 });
    const result = resetQuoinDay(state, ['daily_quoin_limit_2']);
    assert.equal(result.hitLimit, true);
    assert.equal(state.limitStreak, 5);
    assert.equal(state.bestLimitStreak, 5);
    assert.equal(state.collectedToday, 0);
    assert.equal(state.dailyLimit, 120);
  });

  it('normalizes hostile persisted fields', () => {
    assert.deepEqual(normalizeQuoinState({ dailyLimit: -1, multiplier: 1000, byType: { xp: -3, mood: 2.8, nope: 99 } }), {
      collectedToday: 0,
      dailyLimit: 1,
      totalCollected: 0,
      multiplier: 100,
      studyCredit: 0,
      qurazyFound: 0,
      limitStreak: 0,
      bestLimitStreak: 0,
      byType: { mood: 2 },
      dailyByType: {},
    });
  });
});

describe('quoin client integration', () => {
  it('ships the complete official sheet and wires animated rewards, persistence, and HUD state', () => {
    assert.ok(existsSync(join(publicRoot, QUOIN_SHEET.url)));
    const game = readFileSync(join(publicRoot, 'game.js'), 'utf8');
    const html = readFileSync(join(publicRoot, 'play/index.html'), 'utf8');
    assert.match(game, /new PIXI\.AnimatedSprite\(frames\)/);
    assert.match(game, /collectQuoin\(quoinState/);
    assert.match(game, /applyQuestProgress\(questState, 'quoins_collected'/);
    assert.match(game, /resetQuoinDay\(quoinState/);
    assert.match(game, /quoins: quoinState/);
    assert.match(game, /bootParams\.get\('quoincollect'\) === '1'/);
    assert.match(html, /id="quoin-stat"/);
    assert.match(html, /game\.js\?v=[0-9a-f]{8}/);
  });
});

describe('ticket 94: quest rooms keep the daily quoin limit as a street does', () => {
  const gsjs = join(import.meta.dirname, '..', '..', 'glitch-GameServerJS', 'items/quoin.js');

  it('the source: only games, races, rainbow_run, Paradise, ignore_quoin_limit places and Qurazy skip it', { skip: !existsSync(gsjs) && 'no GSJS' }, () => {
    const src = readFileSync(gsjs, 'utf8');
    assert.match(src, /if \(!this\.container\.is_game && !this\.container\.is_race && !this\.container\.isInstance\('rainbow_run'\) && !this\.container\.isParadiseLocation\(\) && this\.instanceProps\.type != 'qurazy' && pc\.stats\.quoins_today\.value >= pc\.stats\.quoins_today\.top\) return;/);
  });

  it('at the limit a room quoin stays where it is and nothing is taken', async () => {
    const { takeQuoins } = await import('../public/js/quest-rooms/puzzle-kit.js?v=ffbba892');
    const q = { id: 'q0', type: 'xp', x: 100, y: 500, taken: false, spr: { visible: true, destroyed: false, scale: { y: 1 } } };
    let refuse = true;
    const ctx = { player: { x: 100, y: 540 }, bodyScale: () => 1, collectQuoin: () => (refuse ? { ok: false, reason: 'daily_limit', dailyLimit: 100 } : { ok: true }) };
    assert.equal(takeQuoins(ctx, [q]), 0);
    assert.equal(q.taken, false);
    assert.equal(q.spr.visible, true);
    refuse = false;
    assert.equal(takeQuoins(ctx, [q]), 1);
    assert.equal(q.taken, true);
  });

  it('every room and box that pays quoins leaves them at the limit, and none floats "Daily quoin limit"', () => {
    const read = (p) => readFileSync(join(publicRoot, p), 'utf8');
    for (const f of ['clubhouse', 'esquibeth', 'gwendolyn', 'le-miserable', 'puzzle-kit']) {
      const src = read(`js/quest-rooms/${f}.js`);
      assert.match(src, /collectQuoin\([^)]*\)\?\.reason (===|!==) 'daily_limit'/, f);
    }
    for (const f of ['features/quest-instances-feature.js', 'features/puzzles-feature.js', 'features/purple-journey-feature.js']) {
      const src = read(`js/${f}`);
      assert.doesNotMatch(src, /'Daily quoin limit'/, f);
      assert.match(src, /reason === 'daily_limit'/, f);
    }
  });
});

describe('touching a quoin at the limit says nothing', () => {
  it('the source returns silently (quoin.js 159), and only the prompt is left', () => {
    const gs = join(publicRoot, '../../glitch-GameServerJS/items/quoin.js');
    if (existsSync(gs)) {
      const line = readFileSync(gs, 'utf8').split('\n')[158];
      assert.match(line, /pc\.stats\.quoins_today\.value >= pc\.stats\.quoins_today\.top\) return;$/);
    }
    for (const f of ['game.js', 'js/features/quest-instances-feature.js', 'js/features/puzzles-feature.js', 'js/features/purple-journey-feature.js']) {
      assert.doesNotMatch(readFileSync(join(publicRoot, f), 'utf8'), /Wowza/, f);
    }
    assert.match(quoinLimitPrompt().text, /^Wowza! You've reached your limit on quoins for this game day\.$/);
  });
});

describe('report 132: the quoin limit is a prompt, once', () => {
  it('uses the source prompt: its words, a 10 second timeout and one OK (inc_stats.js 687-693)', () => {
    assert.deepEqual(quoinLimitPrompt(), {
      text: "Wowza! You've reached your limit on quoins for this game day.",
      iconButtons: false,
      timeout: 10,
      choices: [{ value: 'ok', label: 'OK' }],
    });
  });

  it('fires on the quoin that reaches the limit, and never for a Qurazy quoin past it', () => {
    const state = createQuoinState({ collectedToday: 98, dailyLimit: 100 });
    const pc = { imagination: 0, xp: 0, level: 5 };
    assert.equal(collectQuoin(state, 'xp', pc).hitLimit, false);
    assert.equal(collectQuoin(state, 'xp', pc).hitLimit, true);
    assert.equal(collectQuoin(state, 'xp', pc).reason, 'daily_limit');
    assert.equal(collectQuoin(state, 'qurazy', pc).hitLimit, false);
    assert.equal(state.collectedToday, 100);
  });

  it('a limit raised after reaching it fires again at the new top, as the source compares value to top', () => {
    const state = createQuoinState({ collectedToday: 100, dailyLimit: 100 });
    state.dailyLimit = 110;
    const pc = { imagination: 0, xp: 0, level: 5 };
    state.collectedToday = 109;
    assert.equal(collectQuoin(state, 'xp', pc).hitLimit, true);
  });

  it('leaves the day streak rule alone', () => {
    const state = createQuoinState({ collectedToday: 100, dailyLimit: 100, limitStreak: 2 });
    assert.equal(resetQuoinDay(state, []).limitStreak, 3);
    const game = readFileSync(new URL('../public/game.js', import.meta.url), 'utf8');
    assert.match(game, /collectedToday\) \|\| 0\) >= 100\) \{\s*announceAchievementUpdates\(applyAchievementProgress\(achieveState, 'coin_count:days_maxed', 1, pc\)\);/);
  });

  it('every collector with its own quoins hands the limit on; no award window is left', () => {
    const game = readFileSync(new URL('../public/game.js', import.meta.url), 'utf8');
    assert.doesNotMatch(game, /Quoin Limit Reached/);
    assert.match(game, /function announceQuoinLimit\(dailyLimit\) \{\s*if \(paradiseRun\) return;\s*engine\.prompt\(quoinLimitPrompt\(\)\);/);
    for (const f of ['puzzles', 'purple-journey', 'quest-instances']) {
      const src = readFileSync(new URL(`../public/js/features/${f}-feature.js`, import.meta.url), 'utf8');
      assert.match(src, /\.hitLimit\) engine\.announceQuoinLimit\?\.\(/);
    }
  });
});
