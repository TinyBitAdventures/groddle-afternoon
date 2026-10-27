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
import { CAPPED_ROLLS } from '../tools/build-economy.mjs';
import { currantRewardForLevel, XP_FOR_LEVEL } from '../public/js/progression.js';

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
function save({ inv = {}, currants = 0, level = 5, xp = 5000, mult = 1, owned = [], quests = [], badges = [], cards = {} } = {}) {
  return {
    playerState: JSON.stringify({
      version: 7,
      inventory: inv,
      player: { currants, energy: 50, mood: 50, xp, level, rewardMultiplier: mult, imaginationUpgrades: owned },
      systems: { quests: { completed: quests, active: {} }, achievements: { unlocked: badges, progress: {} }, features: { imagination: { counts: cards } } },
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

  it('follows a chain inside one write (grain to flour to a bun), and refunds what the chain did not use', () => {
    const r = php('reconcile', [counts({ grain: 7, pinch_of_salt: 1 }), counts({ bun: 1 }), 0, 50_000]);
    assert.deepEqual(r.clamped, none);
    assert.deepEqual(r.runs, { 'recipe:bun': 1, 'recipe:flour': 1 });
    assert.equal(r.budget, 2 * ECON.items.grain.v, 'the two grains left over refund as an ordinary loss');
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
    assert.deepEqual(w.rows, [['quest', 'mini_me_mini_you', 1]]);
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
    assert.deepEqual(up.rows, [['level', 'level', 6], ['lvlday', 'level', 1]]);
    // A jump of several levels pays the final one only (inc_stats.js, js/progression.js).
    const jump = write(ledger, base, save({ currants: 500 + currantRewardForLevel(9), level: 9, xp: XP_FOR_LEVEL[7] }));
    assert.deepEqual(jump.reconciled.clamped, none);
    assert.equal(jump.credits.goods.currants, currantRewardForLevel(9));
    // The level without the xp for it is not credited.
    const forged = write(ledger, base, save({ currants: 500 + reward, level: 6, xp: 5000 }));
    assert.equal(forged.reconciled.clamped.currants, reward);
    assert.deepEqual(forged.rows, []);
  });

  it('credits at most LEVELS_DAILY level-ups a day, and the next one on a later day', () => {
    const reward = currantRewardForLevel(10);
    const busy = { ...base, lvlday: { level: 3 } };
    const today = write(ledger, busy, save({ currants: 500 + reward, level: 10, xp: XP_FOR_LEVEL[8] }));
    assert.equal(today.reconciled.clamped.currants, reward);
    assert.deepEqual(today.credits.detail, { later: { level: 10 } });
    const tomorrow = write(counts({}, 500), base, save({ currants: 500 + reward, level: 10, xp: XP_FOR_LEVEL[8] }));
    assert.deepEqual(tomorrow.reconciled.clamped, none);
  });

  it('an imagination card hands out its ticket, at most CARD_DAILY of one card a day', () => {
    const one = write(ledger, base, save({ currants: 500, inv: { paradise_ticket_cloud_rings: 1 }, cards: { ticket_to_paradise_cloud_rings: 1 } }));
    assert.deepEqual(one.reconciled.clamped, none);
    assert.deepEqual(one.rows, [['cardday', 'ticket_to_paradise_cloud_rings', 1], ['card', 'ticket_to_paradise_cloud_rings', 1]]);
    const forged = write(ledger, base, save({ currants: 500, inv: { paradise_ticket_cloud_rings: 50 }, cards: { ticket_to_paradise_cloud_rings: 50 } }));
    assert.deepEqual(forged.reconciled.clamped, counts({ paradise_ticket_cloud_rings: 47 }));
    const tomorrow = { ...base, card: { ticket_to_paradise_cloud_rings: 3 }, cardday: {} };
    assert.deepEqual(write(counts({ paradise_ticket_cloud_rings: 3 }, 500), tomorrow, save({ currants: 500, inv: { paradise_ticket_cloud_rings: 50 }, cards: { ticket_to_paradise_cloud_rings: 50 } })).reconciled.clamped, counts({ paradise_ticket_cloud_rings: 44 }));
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
