/**
 * G335 slice 2: the ledger explains gains so its budget can be small
 * (groddle-afternoon-site src/LedgerMath.php check / reconcile / explain /
 * credits / baseline, run through the php CLI on fixture saves): transforms
 * a write's own losses cover (recipes, Cubimal boxes, artifact assembly),
 * exact credits once per character for quests, badges, level-ups and
 * imagination cards, and daily counts for classes only drop tables grant.
 * Each honest fixture session is accepted exactly with no budget at all; its
 * forged twin is clamped. The design is glitch-audit
 * research/coverage/g335-economy.md (section 6: slice 2 as built).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SITE_DIR, skipWithoutSite } from '../tools/repos.mjs';
import { CAPPED_ROLLS, STARTS_WITHOUT_PREREQS, QUESTS_STARTED_WITHOUT_PREREQS } from '../tools/build-economy.mjs';
import { currantRewardForLevel, XP_FOR_LEVEL } from '../public/js/progression.js?v=05ff0260';

const hasPhp = spawnSync('php', ['-v']).status === 0;
const skip = skipWithoutSite || !hasPhp;

/** One LedgerMath call in PHP; `table` swaps in a hand-made economy table. */
function php(op, args, table = null) {
  const code = `
    foreach (['Economy', 'LedgerMath'] as $c) require ${JSON.stringify(SITE_DIR)} . "/src/$c.php";
    use Groddle\\Minn\\{Economy, LedgerMath};
    $in = json_decode(stream_get_contents(STDIN), true);
    $e = is_array($in['table']) ? new Economy($in['table']) : Economy::shared();
    $a = $in['args'];
    $out = match ($in['op']) {
      'check' => LedgerMath::check($a[0], $a[1], $a[2], $a[3], (float) $a[4], (float) $a[5], $e),
      'reconcile' => LedgerMath::reconcile($a[0], $a[1], (float) $a[2], (float) $a[3], $e, $a[4] ?? null),
      'credits' => LedgerMath::credits($a[0], $a[1], $e),
      'baseline' => LedgerMath::baseline($a[0], $e),
      'apply' => LedgerMath::applyTrade($a[0], $a[1], $a[2], $a[3]),
      'round5' => LedgerMath::roundTo5((float) $a[0]),
    };
    echo json_encode($out);`;
  const out = execFileSync('php', ['-r', code], { input: JSON.stringify({ op, args, table }) });
  return JSON.parse(String(out), (k, v) => (Array.isArray(v) && !v.length && ['items', 'made', 'runs', 'capped', 'detail'].includes(k) ? {} : v));
}

const ECON = skip ? null : JSON.parse(readFileSync(join(SITE_DIR, 'data/economy.json'), 'utf8'));
const counts = (items = {}, currants = 0) => ({ items, currants });
const none = counts();

/** A multiplayer save's entries the way the game writes them. */
function save({ inv = {}, currants = 0, level = 5, xp = 5000, mult = 1, owned = [], quests = [], badges = [], cards = {}, skills = [] } = {}) {
  return {
    playerState: JSON.stringify({
      version: 7,
      inventory: inv,
      player: { currants, energy: 50, mood: 50, xp, level, rewardMultiplier: mult, imaginationUpgrades: owned },
      systems: { quests: { completed: quests, active: {} }, achievements: { unlocked: badges, progress: {} }, skills: { learned: skills }, features: { imagination: { counts: cards } } },
      world: {},
      savedAt: 1,
    }),
    location: '{"street":"GA5"}',
  };
}

/** Credited rows as Ledger::credited hands them over, from the baseline of a save. */
function creditedFrom(rows) {
  const out = {};
  for (const [kind, ref, n] of rows) (out[kind] ||= {})[ref] = n;
  return out;
}

/** One write: the ledger before, what was credited before, the save, the budget. */
function write(ledger, credited, entries, budget = 0) {
  return php('check', [ledger, credited, [], entries, budget, 50_000]);
}

// The site's daily room for progression currants (LedgerMath::PROGRESSION_DAILY, G739), read from the source.
const PROGRESSION_DAILY = skip ? 0 : Number(/PROGRESSION_DAILY = (\d+);/.exec(readFileSync(join(SITE_DIR, 'src/LedgerMath.php'), 'utf8'))?.[1]);
// The site's daily count of credited paying level-ups (LedgerMath::LEVELS_DAILY), read from the source.
const LEVELS_DAILY = skip ? 0 : Number(/LEVELS_DAILY = (\d+);/.exec(readFileSync(join(SITE_DIR, 'src/LedgerMath.php'), 'utf8'))?.[1]);

describe('transforms a write\'s losses explain (LedgerMath::explain)', { skip }, () => {
  it('accepts cooking with no budget, and clamps the same dish made without using anything', () => {
    const before = counts({ cabbage: 1, corn: 1, bean_plain: 5 }, 10);
    const honest = php('reconcile', [before, counts({ simple_slaw: 1 }, 10), 0, 50_000]);
    assert.deepEqual(honest.clamped, none);
    assert.deepEqual(honest.made, { simple_slaw: 1 });
    assert.deepEqual(honest.runs, { 'recipe:simple_slaw': 1 });
    assert.equal(honest.budget, 0, 'the inputs a recipe used refund nothing');
    const forged = php('reconcile', [before, counts({ cabbage: 1, corn: 1, bean_plain: 5, simple_slaw: 1 }, 10), 0, 50_000]);
    assert.deepEqual(forged.clamped, counts({ simple_slaw: 1 }));
  });

  it('follows a chain inside one write (grain to flour to a bun); what the chain did not use refunds nothing (G742)', () => {
    const r = php('reconcile', [counts({ grain: 7, pinch_of_salt: 1 }), counts({ bun: 1 }), 0, 50_000]);
    assert.deepEqual(r.clamped, none);
    assert.deepEqual(r.runs, { 'recipe:bun': 1, 'recipe:flour': 1 });
    assert.equal(r.budget, 0, 'the two grains left over are an ordinary loss, which is never banked');
  });

  it('opens a Cubimal box into a figure of its series, and only from a box the save gave up', () => {
    const honest = php('reconcile', [counts({ cubimal_package: 1 }), counts({ npc_cubimal_rube: 1 }), 0, 50_000]);
    assert.deepEqual(honest.clamped, none);
    assert.deepEqual(honest.runs, { 'open:cubimal_package:npc_cubimal_rube': 1 });
    const forged = php('reconcile', [counts({ cubimal_package: 1 }), counts({ cubimal_package: 1, npc_cubimal_rube: 1 }), 0, 50_000]);
    assert.deepEqual(forged.clamped, counts({ npc_cubimal_rube: 1 }));
    const wrongSeries = php('reconcile', [counts({ cubimal_package: 1 }), counts({ npc_cubimal_yeti: 1 }), 0, 50_000]);
    const series2 = ECON.transforms.some((t) => t.s === 'open:cubimal_package:npc_cubimal_yeti');
    assert.equal(wrongSeries.clamped.items.npc_cubimal_yeti === 1, !series2, 'a figure the box cannot hold is not explained');
  });

  it('charges a lucky roll worth more than its box to the budget', () => {
    const table = { fallback: 1000, items: { box: { v: 100 }, rare: { v: 900 } }, transforms: [{ s: 'open:box:rare', i: { box: 1 }, o: { rare: 1 }, r: 1 }] };
    const paid = php('reconcile', [counts({ box: 1 }), counts({ rare: 1 }), 800, 50_000], table);
    assert.deepEqual(paid.clamped, none);
    assert.equal(paid.budget, 0);
    const broke = php('reconcile', [counts({ box: 1 }), counts({ rare: 1 }), 799, 50_000], table);
    assert.deepEqual(broke.clamped, counts({ rare: 1 }), 'not explained, and 799 + the box refund is short of 900');
  });

  it('assembles an artifact from its pieces', () => {
    const pieces = Object.fromEntries([1, 2, 3, 4, 5].map((n) => [`artifact_chicken_brick_piece${n}`, 1]));
    const r = php('reconcile', [counts(pieces), counts({ artifact_chicken_brick: 1 }), 0, 50_000]);
    assert.deepEqual(r.clamped, none);
    assert.deepEqual(r.runs, { 'artifact:chicken_brick': 1 });
  });
});

describe('exact credits once per character (LedgerMath::credits, check)', { skip }, () => {
  const ledger = counts({}, 500);
  const start = save({ currants: 500 });
  const base = creditedFrom(php('baseline', [start]));

  it('marks what a save had already done as credited, without paying it', () => {
    const rows = php('baseline', [save({ quests: ['mini_me_mini_you', 'not_a_quest'], level: 5, xp: 5000, cards: { ticket_to_paradise_cloud_rings: 2 } })]);
    assert.deepEqual(rows, [['base', 'base', 1], ['quest', 'mini_me_mini_you', 0], ['level', 'level', 5], ['card', 'ticket_to_paradise_cloud_rings', 2]]);
    const c = php('credits', [save({ quests: ['mini_me_mini_you'], level: 5, xp: 5000, cards: { ticket_to_paradise_cloud_rings: 2 } }), creditedFrom(rows)]);
    assert.deepEqual(c.goods, none);
  });

  it('finishing the 10,000-currant quest (the most any quest the remake completes pays) is accepted with no budget, once; its forged twins are clamped', () => {
    const done = save({ currants: 10_500, quests: ['mini_me_mini_you'] });
    const w = write(ledger, base, done);
    assert.deepEqual(w.reconciled.clamped, none);
    assert.equal(w.after.currants, 10_500);
    assert.deepEqual(w.rows, [['quest', 'mini_me_mini_you', 1], ['progday', 'currants', 10_000]]);
    assert.deepEqual(w.credits.detail, { quests: { mini_me_mini_you: 10_000 } });
    // Twin 1: the currants with no quest. Twin 2: the same quest paid again on a later write.
    assert.equal(write(ledger, base, save({ currants: 10_500 })).reconciled.clamped.currants, 10_000);
    const again = { ...base, quest: { mini_me_mini_you: 1 } };
    assert.equal(write(counts({}, 10_500), again, save({ currants: 20_500, quests: ['mini_me_mini_you'] })).reconciled.clamped.currants, 10_000);
    // Twin 3: a street job's quest (paid by the Job Board and the ledger's project route, never through the quest log).
    const job = write(ledger, base, save({ currants: 20_500, quests: ['job_standard5_for_new_streets'] }));
    assert.equal(job.reconciled.clamped.currants, 20_000);
    assert.equal(ECON.credits.quests.job_standard5_for_new_streets, undefined);
  });

  it('pays the reward buff and the Fit for a King tier, but never more than the data allows', () => {
    const fit = save({ currants: 13_500, quests: ['mini_me_mini_you'], mult: 1.2, owned: ['quest_reward_bonus_5'] });
    assert.deepEqual(write(ledger, base, fit).reconciled.clamped, none, '10,000 x (1.2 + 0.1) = 13,000');
    const forged = save({ currants: 1_000_500, quests: ['mini_me_mini_you'], mult: 100, owned: ['quest_reward_bonus_5'] });
    const w = write(ledger, base, forged);
    assert.equal(w.credits.detail.quests.mini_me_mini_you, 13_000, 'a multiplier of 100 is read as the best buff, 1.2');
    assert.equal(w.reconciled.clamped.currants, 1_000_000 - 13_000);
  });

  it('credits a quest\'s tradeable items and a badge\'s currants', () => {
    const q = write(ledger, base, save({ currants: 575, inv: { element_red: 100, element_green: 100, element_blue: 100 }, quests: ['elementhandling_buy_elemental_pouch'], badges: ['collection_bubbles'] }));
    assert.deepEqual(q.reconciled.clamped, none);
    assert.deepEqual(q.credits.goods, counts({ element_blue: 100, element_green: 100, element_red: 100 }, 125));
  });

  it('a level-up pays the final level\'s currants when the xp agrees; a forged level is clamped', () => {
    const reward = currantRewardForLevel(6);
    const up = write(ledger, base, save({ currants: 500 + reward, level: 6, xp: XP_FOR_LEVEL[4] }));
    assert.deepEqual(up.reconciled.clamped, none);
    assert.deepEqual(up.rows, [['level', 'level', 6], ['lvlday', 'level', 1], ['progday', 'free', 1]], 'the day\'s first paying level-up, outside the room');
    // A jump of several levels pays the final one only (inc_stats.js, js/progression.js 106-116), as the save shows.
    const jump = write(ledger, base, save({ currants: 500 + currantRewardForLevel(9), level: 9, xp: XP_FOR_LEVEL[7] }));
    assert.deepEqual(jump.reconciled.clamped, none);
    assert.equal(jump.credits.goods.currants, currantRewardForLevel(9));
    assert.equal(jump.after.currants, 500 + currantRewardForLevel(9));
    // The level without the xp for it is not credited.
    const forged = write(ledger, base, save({ currants: 500 + reward, level: 6, xp: 5000 }));
    assert.equal(forged.reconciled.clamped.currants, reward);
    assert.deepEqual(forged.rows, []);
  });

  it('credits at most LEVELS_DAILY paying level-ups a day; the next waits, kept in the save, never clamped (report #246)', () => {
    const reward = currantRewardForLevel(10);
    const busy = { ...base, level: { level: 9 }, lvlday: { level: LEVELS_DAILY } };
    const today = write(ledger, busy, save({ currants: 500 + reward, level: 10, xp: XP_FOR_LEVEL[8] }));
    assert.deepEqual(today.reconciled.clamped, none, 'the pack keeps the level\'s currants');
    assert.equal(today.after.currants, 500, 'but the ledger has not credited them yet');
    assert.deepEqual(today.held, counts({}, reward));
    // #691: what waits is remembered for the day (WAIT_DAY), so an act it is short for says why.
    assert.deepEqual(today.rows, [['level', 'level', 10], ['lvlwait', '10', reward], ['waitday', '$', reward]]);
    // A later day's count credits the waiting level: the ledger and the save agree, nothing is paid twice.
    const waiting = { ...base, level: { level: 10 }, lvlwait: { 10: reward } };
    const tomorrow = write(counts({}, 500), waiting, save({ currants: 500 + reward, level: 10, xp: XP_FOR_LEVEL[8] }));
    assert.deepEqual(tomorrow.reconciled.clamped, none);
    assert.equal(tomorrow.after.currants, 500 + reward);
    assert.deepEqual(tomorrow.rows, [['lvlwait', '10', 0], ['lvlday', 'level', 1], ['progday', 'currants', reward]], 'a level that waited goes through the room');
    const paid = { ...base, level: { level: 10 }, lvlwait: { 10: 0 }, lvlday: { level: 1 } };
    assert.deepEqual(write(counts({}, 500 + reward), paid, save({ currants: 500 + reward, level: 10, xp: XP_FOR_LEVEL[8] })).credits.goods, none, 'credited once');
  });

  it('a level-35 save after a full day of level-ups keeps its 61,860 currants (report #246)', () => {
    assert.equal(currantRewardForLevel(35), 61_860);
    assert.equal(ECON.credits.levels['35'], 61_860);
    // Levels 26 to 34 pay nothing, so they take no place in the day's count.
    let credited = { ...base, level: { level: 25 } };
    let ledgerNow = counts({}, 500);
    for (const level of [26, 27, 28]) {
      const w = write(ledgerNow, credited, save({ currants: 500, level, xp: XP_FOR_LEVEL[level - 2] }));
      assert.deepEqual(w.reconciled.clamped, none);
      assert.deepEqual(w.rows, [['level', 'level', level]], `level ${level} takes no place in the count`);
      credited = { ...credited, level: { level } };
    }
    const w35 = write(ledgerNow, { ...credited, level: { level: 34 } }, save({ currants: 500 + 61_860, level: 35, xp: XP_FOR_LEVEL[33] }));
    assert.deepEqual(w35.reconciled.clamped, none);
    // G739: the day's first paying level-up is outside the 40,000 room: credited whole, at once.
    assert.equal(w35.credits.goods.currants, 61_860, 'credited at once: the count was not used up');
    assert.deepEqual(w35.rows, [['level', 'level', 35], ['lvlday', 'level', 1], ['progday', 'free', 1]]);
    // Even when the day's count is used up by paying levels, the currants stay in the pack.
    const full = write(ledgerNow, { ...credited, level: { level: 34 }, lvlday: { level: LEVELS_DAILY } }, save({ currants: 500 + 61_860, level: 35, xp: XP_FOR_LEVEL[33] }));
    assert.deepEqual(full.reconciled.clamped, none);
    assert.deepEqual(full.held, counts({}, 61_860));
    ledgerNow = full.after;
    // The next write that day sees the same: still kept, still not in the ledger.
    const again = write(ledgerNow, { ...credited, level: { level: 35 }, lvlday: { level: LEVELS_DAILY }, lvlwait: { 35: 61_860 } }, save({ currants: 500 + 61_860, level: 35, xp: XP_FOR_LEVEL[33] }));
    assert.deepEqual(again.reconciled.clamped, none);
    assert.equal(again.after.currants, 500);
  });

  it('a forged level (xp below its threshold) is still refused, waiting or not', () => {
    const forged = save({ currants: 500 + 61_860, level: 35, xp: XP_FOR_LEVEL[33] - 1 });
    for (const credited of [{ ...base, level: { level: 34 } }, { ...base, level: { level: 34 }, lvlday: { level: LEVELS_DAILY } }]) {
      const w = write(ledger, credited, forged);
      assert.equal(w.reconciled.clamped.currants, 61_860);
      assert.deepEqual(w.rows, []);
      assert.deepEqual(w.held, none);
    }
    // A waiting level covers only its own currants: more than that is clamped as before.
    const over = write(ledger, { ...base, level: { level: 34 }, lvlday: { level: LEVELS_DAILY } }, save({ currants: 500 + 61_860 + 10_000, level: 35, xp: XP_FOR_LEVEL[33] }));
    assert.equal(over.reconciled.clamped.currants, 10_000);
    // Spending a waiting level's currants refunds nothing into the budget (only a real credit later does).
    const spent = write(ledger, { ...base, level: { level: 35 }, lvlday: { level: LEVELS_DAILY }, lvlwait: { 35: 61_860 } }, save({ currants: 500, level: 35, xp: XP_FOR_LEVEL[33] }));
    assert.equal(spent.reconciled.budget, 0);
    assert.deepEqual(spent.held, none);
  });

  it('an imagination card hands out its ticket, at most CARD_DAILY of one card a day; a purchase past it keeps its ticket', () => {
    const one = write(ledger, base, save({ currants: 500, inv: { paradise_ticket_cloud_rings: 1 }, cards: { ticket_to_paradise_cloud_rings: 1 } }));
    assert.deepEqual(one.reconciled.clamped, none);
    assert.deepEqual(one.rows, [['cardday', 'ticket_to_paradise_cloud_rings', 1], ['card', 'ticket_to_paradise_cloud_rings', 1]]);
    // A fourth purchase the same day: the ticket stays in the pack, waiting for a later day's count.
    const busy = { ...base, card: { ticket_to_paradise_beam_me_down: 3 }, cardday: { ticket_to_paradise_beam_me_down: 3 } };
    const fourth = write(counts({ paradise_ticket_beam_me_down: 3 }, 500), busy, save({ currants: 500, inv: { paradise_ticket_beam_me_down: 4 }, cards: { ticket_to_paradise_beam_me_down: 4 } }));
    assert.deepEqual(fourth.reconciled.clamped, none);
    assert.deepEqual(fourth.held, counts({ paradise_ticket_beam_me_down: 1 }));
    assert.deepEqual(fourth.after.items, { paradise_ticket_beam_me_down: 3 });
    const next = write(fourth.after, { ...base, card: { ticket_to_paradise_beam_me_down: 3 }, cardday: {} }, save({ currants: 500, inv: { paradise_ticket_beam_me_down: 4 }, cards: { ticket_to_paradise_beam_me_down: 4 } }));
    assert.deepEqual(next.reconciled.clamped, none);
    assert.deepEqual(next.after.items, { paradise_ticket_beam_me_down: 4 }, 'credited once, on the later day');
    // A forged pile: three credited, CARD_WAIT kept waiting, the rest clamped (no budget here).
    const forged = write(ledger, base, save({ currants: 500, inv: { paradise_ticket_cloud_rings: 50 }, cards: { ticket_to_paradise_cloud_rings: 50 } }));
    assert.deepEqual(forged.reconciled.clamped, counts({ paradise_ticket_cloud_rings: 17 }));
    assert.deepEqual(forged.after.items, { paradise_ticket_cloud_rings: 3 });
  });
});

describe('capped classes (drop tables only)', { skip }, () => {
  it('gates drop-only classes with a daily count, and leaves ordinary ones open', () => {
    assert.equal(ECON.items.musicblock_d_red_01.g, 'capped');
    assert.equal(ECON.items.musicblock_d_red_01.cap, 2 * CAPPED_ROLLS, 'a roll gives at most 2 (catalog_drop_tables.js)');
    assert.equal(ECON.items.apple.g, undefined);
    assert.equal(ECON.items.npc_cubimal_rube.g, undefined, 'a Cubimal box makes it');
  });

  it('keeps a capped class to what is left of its day, even with budget to spare', () => {
    const r = php('reconcile', [none, counts({ musicblock_d_red_01: 12 }), 50_000, 50_000]);
    assert.deepEqual(r.clamped, counts({ musicblock_d_red_01: 2 }));
    assert.deepEqual(r.capped, { musicblock_d_red_01: 10 });
    const later = php('reconcile', [none, counts({ musicblock_d_red_01: 1 }), 50_000, 50_000, { musicblock_d_red_01: 0 }]);
    assert.deepEqual(later.clamped, counts({ musicblock_d_red_01: 1 }));
  });

  it('counts today\'s capped gains in the credited rows', () => {
    const w = php('check', [none, { base: { base: 1 }, cap: { musicblock_d_red_01: 4 } }, [], save({ inv: { musicblock_d_red_01: 8 }, level: 1, xp: 0 }), 50_000, 50_000]);
    assert.deepEqual(w.reconciled.clamped, counts({ musicblock_d_red_01: 2 }));
    assert.deepEqual(w.rows, [['cap', 'musicblock_d_red_01', 10]]);
  });
});

describe('the pack keeps a class it ran out of at 0', { skip }, () => {
  it('when a settled trade takes the last of one, so the boot never grants it again', () => {
    const entries = save({ inv: { hatchet: 1, apple: 2 } });
    const out = php('apply', [entries, 't-1', counts({ hatchet: 1 }), counts({}, 5)]);
    assert.deepEqual(JSON.parse(out.playerState).inventory, { hatchet: 0, apple: 2 });
  });

  it('rounds rewards to 5 as the source does (common.js round_to_5)', () => {
    assert.equal(php('round5', [12.5]), 15);
    assert.equal(php('round5', [12.4]), 10);
    assert.equal(php('round5', [26_000]), 26_000);
  });
});

describe('progression credits: a day\'s room, levels in order, quest prerequisites (G739)', { skip }, () => {
  const ledger = counts({}, 500);
  const base = skip ? {} : creditedFrom(php('baseline', [save({ currants: 500 })]));

  it('levels, quests and badges share PROGRESSION_DAILY currants a day; the rest waits, kept in the pack, never clamped', () => {
    assert.equal(PROGRESSION_DAILY, 40_000, 'ours: about twice the honest 90th percentile best day (about 19,000) on live');
    const late = { ...base, progday: { currants: 35_000 } };
    const w = write(ledger, late, save({ currants: 10_500, quests: ['mini_me_mini_you'] }));
    assert.deepEqual(w.reconciled.clamped, none);
    assert.equal(w.credits.goods.currants, 5_000);
    assert.deepEqual(w.held, counts({}, 5_000));
    assert.deepEqual(w.rows, [['quest', 'mini_me_mini_you', 1], ['progwait', 'quest:mini_me_mini_you', 5_000], ['progday', 'currants', 40_000], ['waitday', '$', 5_000]]);
    // The next day: the waiting 5,000 first, then the ledger and the pack agree.
    const next = write(w.after, { ...base, quest: { mini_me_mini_you: 1 }, progwait: { 'quest:mini_me_mini_you': 5_000 } }, save({ currants: 10_500, quests: ['mini_me_mini_you'] }));
    assert.deepEqual(next.reconciled.clamped, none);
    assert.equal(next.after.currants, 10_500);
    assert.deepEqual(next.rows, [['progwait', 'quest:mini_me_mini_you', 0], ['progday', 'currants', 5_000]]);
    // A full day credits nothing more; a waiting row still stands in the pack.
    const full = write(ledger, { ...base, progday: { currants: 40_000 } }, save({ currants: 10_500, quests: ['mini_me_mini_you'] }));
    assert.equal(full.credits.goods.currants, 0);
    assert.deepEqual(full.reconciled.clamped, none);
  });

  it('a level-40 player levelling once in a day gets 97,570 at once; a second paying level-up that day waits for room', () => {
    assert.equal(currantRewardForLevel(40), 97_570);
    const w40 = write(ledger, { ...base, level: { level: 39 } }, save({ currants: 500 + 97_570, level: 40, xp: XP_FOR_LEVEL[38] }));
    assert.deepEqual(w40.reconciled.clamped, none);
    assert.equal(w40.credits.goods.currants, 97_570);
    assert.deepEqual(w40.held, none);
    assert.deepEqual(w40.rows, [['level', 'level', 40], ['lvlday', 'level', 1], ['progday', 'free', 1]]);
    // The same day, level 45 (147,670): the day's room pays 40,000, the rest waits, kept in the pack.
    const r45 = currantRewardForLevel(45);
    const sameDay = { ...base, level: { level: 44 }, lvlday: { level: 1 }, progday: { free: 1 } };
    const w45 = write(w40.after, sameDay, save({ currants: 500 + 97_570 + r45, level: 45, xp: XP_FOR_LEVEL[43] }));
    assert.deepEqual(w45.reconciled.clamped, none);
    assert.equal(w45.credits.goods.currants, PROGRESSION_DAILY);
    assert.deepEqual(w45.held, counts({}, r45 - PROGRESSION_DAILY));
    assert.deepEqual(w45.rows, [['level', 'level', 45], ['progwait', 'level:45', r45 - PROGRESSION_DAILY], ['lvlday', 'level', 2], ['progday', 'currants', PROGRESSION_DAILY], ['waitday', '$', r45 - PROGRESSION_DAILY]]);
    // A quest that day also goes through the room (here already used up): it waits too.
    const q = write(w45.after, { ...sameDay, level: { level: 45 }, progday: { free: 1, currants: PROGRESSION_DAILY }, progwait: { 'level:45': r45 - PROGRESSION_DAILY } }, save({ currants: 500 + 97_570 + r45 + 10_000, level: 45, xp: XP_FOR_LEVEL[43], quests: ['mini_me_mini_you'] }));
    assert.equal(q.credits.goods.currants, 0);
    assert.deepEqual(q.reconciled.clamped, none);
    assert.deepEqual(q.held, counts({}, r45 - PROGRESSION_DAILY + 10_000));
  });

  it('a forged jump from level 21 to 60 pays at most the day\'s room, the rest waiting; an honest 39 to 40 is paid at once', () => {
    const r60 = currantRewardForLevel(60);
    const credited = { ...base, level: { level: 21 } };
    const w = write(ledger, credited, save({ currants: 500 + r60, level: 60, xp: XP_FOR_LEVEL[58] }));
    assert.equal(w.credits.goods.currants, PROGRESSION_DAILY, 'a jump of two or more levels is not the day\'s free level-up');
    assert.deepEqual(w.reconciled.clamped, none, 'what waits stays in the pack, out of trades');
    assert.deepEqual(w.held, counts({}, r60 - PROGRESSION_DAILY));
    assert.deepEqual(w.rows, [['level', 'level', 60], ['progwait', 'level:60', r60 - PROGRESSION_DAILY], ['lvlday', 'level', 1], ['progday', 'currants', PROGRESSION_DAILY], ['waitday', '$', r60 - PROGRESSION_DAILY]]);
    // The free level-up is still there for a single step that day.
    const honest = write(ledger, { ...base, level: { level: 39 } }, save({ currants: 500 + 97_570, level: 40, xp: XP_FOR_LEVEL[38] }));
    assert.equal(honest.credits.goods.currants, 97_570);
    assert.deepEqual(honest.held, none);
    // Never past the xp.
    const short = write(ledger, credited, save({ currants: 500 + r60, level: 60, xp: XP_FOR_LEVEL[57] }));
    assert.equal(short.credits.goods.currants, 0);
    assert.equal(short.reconciled.clamped.currants, r60);
  });

  it('pays a quest only when the save shows its prerequisites done (or the skill that stands in for one)', () => {
    const q = ECON.credits.quests.animalkinship_milk_butterflies;
    assert.deepEqual(q.p, ['animalkinship_massage_butterflies']);
    const without = write(ledger, base, save({ currants: 500 + q.c, quests: ['animalkinship_milk_butterflies'] }));
    assert.equal(without.reconciled.clamped.currants, q.c);
    assert.deepEqual(without.rows, [], 'not marked: it is paid once the prerequisite shows');
    const withPre = write(ledger, base, save({ currants: 500 + q.c + ECON.credits.quests.animalkinship_massage_butterflies.c, quests: ['animalkinship_massage_butterflies', 'animalkinship_milk_butterflies'] }));
    assert.deepEqual(withPre.reconciled.clamped, none);
    // js/quest-offers.js questDone: a learned skill counts for its tutorial quest (prereqProxy).
    const pig = ECON.credits.quests.animalkinship_pet_piggies;
    assert.deepEqual(pig.p, ['animalkinship_1/animalkinship_1']);
    assert.deepEqual(write(ledger, base, save({ currants: 500 + pig.c, quests: ['animalkinship_pet_piggies'], skills: ['animalkinship_1'] })).reconciled.clamped, none);
    assert.equal(write(ledger, base, save({ currants: 500 + pig.c, quests: ['animalkinship_pet_piggies'] })).reconciled.clamped.currants, pig.c);
  });

  it('never asks for the prerequisites of a quest the game starts without them (game.js ignorePrereq)', () => {
    const game = readFileSync(join(import.meta.dirname, '..', 'public', 'game.js'), 'utf8');
    const named = new Set();
    // Every assignQuest(questState, <id>, { ignorePrereq ... }) call; a questId variable is read from its const.
    for (const m of game.matchAll(/assignQuest\(questState, ([\w.]+), \{\s*ignorePrereq: ([^}]*)\}/g)) {
      const [, id, how] = m;
      if (/^[A-Z_]+_ID$/.test(id)) named.add(id);
      else if (id === 'questId') {
        const decl = game.slice(0, m.index).lastIndexOf('const questId =');
        for (const n of game.slice(decl, game.indexOf(';', decl)).match(/\b[A-Z_]+_ID\b/g) || []) named.add(n);
      } else if (id === 'def.classTsid') {
        for (const n of how.match(/\b[A-Z_]+_ID\b/g) || []) named.add(n);
      }
    }
    assert.ok(named.size >= 10, [...named].join(' '));
    for (const n of named) assert.ok(n in STARTS_WITHOUT_PREREQS, `${n} starts without its prerequisites: add it to tools/build-economy.mjs STARTS_WITHOUT_PREREQS`);
    for (const id of QUESTS_STARTED_WITHOUT_PREREQS) assert.equal(ECON.credits.quests[id]?.p, undefined, id);
  });
});
