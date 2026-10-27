/**
 * G335 slice 3: server outcomes as signed credits. The realtime server
 * (groddle-afternoon-server credits.go) credits a currants quoin, its
 * shards, a race win and what a player takes from shared rocks, trees and
 * nodes; the site keeps each as a receipt (src/LedgerCredits.php) and a save
 * write that shows it takes the gain exactly, outside the earning budget
 * (src/LedgerMath.php check $receipts). Run through the php CLI on fixture
 * saves. The design is glitch-audit research/coverage/g335-economy.md
 * (section 7: slice 3 as built).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SERVER_DIR, SITE_DIR, skipWithoutServer, skipWithoutSite } from '../tools/repos.mjs';

const hasPhp = spawnSync('php', ['-v']).status === 0;
const skip = skipWithoutSite || !hasPhp;

/** One LedgerMath / LedgerCredits call in PHP. */
function php(op, args) {
  const code = `
    foreach (['Economy', 'LedgerMath', 'LedgerCredits'] as $c) require ${JSON.stringify(SITE_DIR)} . "/src/$c.php";
    use Groddle\\Minn\\{Economy, LedgerMath, LedgerCredits};
    $in = json_decode(stream_get_contents(STDIN), true);
    $e = Economy::shared();
    $a = $in['args'];
    $out = match ($in['op']) {
      'check' => LedgerMath::check($a[0], $a[1], $a[2], $a[3], (float) $a[4], (float) $a[5], $e, $a[6]),
      'reconcile' => LedgerMath::reconcile($a[0], $a[1], (float) $a[2], (float) $a[3], $e),
      'charged' => LedgerCredits::charged($a[0]),
      'event' => LedgerCredits::event($a[0], $e),
      'overlap' => LedgerCredits::overlap($a[0], $a[1]),
      'minus' => LedgerCredits::minus($a[0], $a[1]),
      'worth' => LedgerCredits::worth($a[0], $e),
    };
    echo json_encode($out);`;
  const out = execFileSync('php', ['-r', code], { input: JSON.stringify({ op, args }) });
  return JSON.parse(String(out), (k, v) => (Array.isArray(v) && !v.length && ['items', 'made', 'runs', 'capped', 'detail'].includes(k) ? {} : v));
}

const ECON = skip ? null : JSON.parse(readFileSync(join(SITE_DIR, 'data/economy.json'), 'utf8'));
const counts = (items = {}, currants = 0) => ({ items, currants });
const none = counts();

/** A multiplayer save's entries: a level 5 character with this pack and purse. */
function save(inv = {}, currants = 0) {
  return {
    playerState: JSON.stringify({
      version: 7,
      inventory: inv,
      player: { currants, energy: 50, mood: 50, xp: 5000, level: 5, rewardMultiplier: 1, imaginationUpgrades: [] },
      systems: { quests: { completed: [], active: {} }, achievements: { unlocked: [], progress: {} }, features: {} },
      world: {},
      savedAt: 1,
    }),
  };
}

// Whatever this save had done is already credited (slice 2's baseline), so only receipts explain gains here.
const CREDITED = { base: { base: 1 }, level: { level: 5 } };

/** One write: the ledger before, the save, the budget, the receipts not yet shown. */
const write = (ledger, entries, budget, receipts) => php('check', [ledger, CREDITED, [], entries, budget, 50_000, receipts]);

describe('a save that shows the realtime server\'s outcomes (LedgerMath::check $receipts)', { skip }, () => {
  const before = counts({ apple: 3 }, 100);

  it('takes a quoin run, a race win and a rock\'s take exactly, with no budget at all', () => {
    const receipts = counts({ beryl: 9 }, 30 + 2 + 100);
    const w = write(before, save({ apple: 3, beryl: 9 }, 232), 0, receipts);
    assert.deepEqual(w.reconciled.clamped, none);
    assert.deepEqual(w.allowed, receipts);
    assert.deepEqual(w.after, counts({ apple: 3, beryl: 9 }, 232));
    assert.equal(w.reconciled.budget, 0, 'nothing was paid from the budget');
  });

  it('covers only what the server decided: more than that is an ordinary gain, clamped past the budget', () => {
    const w = write(before, save({ apple: 3, beryl: 15 }, 500), 0, counts({ beryl: 9 }, 100));
    assert.deepEqual(w.allowed, counts({ beryl: 9 }, 100));
    assert.deepEqual(w.reconciled.clamped, counts({ beryl: 6 }, 300), 'the extra past the receipts, with no budget');
    assert.deepEqual(w.after, counts({ apple: 3, beryl: 9 }, 200));
  });

  it('a receipt the save does not show is no loss: nothing refunds, the ledger stays, the receipt waits', () => {
    const w = write(before, save({ apple: 3 }, 100), 250, counts({ cherry: 12 }, 40));
    assert.deepEqual(w.allowed, none);
    assert.deepEqual(w.after, before);
    assert.equal(w.reconciled.budget, 250, 'the budget did not grow from it');
  });

  it('still takes losses and a sale beside the receipts', () => {
    // Sold the 3 apples (a loss), grabbed 5 quoin currants: the sale's currants go through the budget as before.
    const w = write(before, save({ apple: 0 }, 100 + 5 + 9), 0, counts({}, 5));
    assert.deepEqual(w.reconciled.clamped, none);
    assert.deepEqual(w.allowed, counts({}, 5));
    assert.deepEqual(w.after, counts({}, 114));
  });

  it('a covered gain of a capped class does not count toward its day', () => {
    const capped = Object.entries(ECON.items).find(([, it]) => it.g === 'capped')[0];
    const w = write(before, save({ apple: 3, [capped]: 1 }, 100), 0, counts({ [capped]: 1 }, 0));
    assert.deepEqual(w.reconciled.clamped, none);
    assert.deepEqual(w.reconciled.capped, {});
  });

  it('a forged save past every receipt is still clamped', () => {
    const w = write(before, save({ apple: 3, stoot_barfield_pullstring_doll: 500 }, 1_000_100), 5000, counts({}, 40));
    assert.equal(w.reconciled.clamped.items.stoot_barfield_pullstring_doll, 500);
    assert.ok(w.reconciled.clamped.currants >= 1_000_000 - 40 - 5000);
    assert.ok(w.after.currants <= 100 + 40 + 5000);
  });

  it('without receipts the write is exactly slice 2\'s', () => {
    const entries = save({ apple: 3, beryl: 2 }, 100);
    const a = php('check', [before, CREDITED, [], entries, 100, 50_000, null]);
    assert.deepEqual(a.allowed, none);
    assert.deepEqual(a.reconciled.delta, counts({ beryl: 2 }, 0));
  });
});

describe('the site\'s side of a credit (LedgerCredits)', { skip }, () => {
  it('reads an event the way credits.go writes it, tradeable classes only', () => {
    const ev = php('event', [{ id: 'cr-t-0a1b2c3d-1z', user: 7, why: 'take', got: { items: [{ c: 'cherry', n: 12 }, { c: 'not_a_class_at_all', n: 3 }], currants: 0 }, at: 1_800_000_000 }]);
    assert.deepEqual(ev, { id: 'cr-t-0a1b2c3d-1z', user: 7, why: 'take', got: counts({ cherry: 12 }), at: 1_800_000_000 });
  });

  it('refuses what is not an event', () => {
    const good = { id: 'cr-q-0a1b2c3d-1', user: 7, why: 'quoin', got: { items: [], currants: 3 } };
    for (const bad of [
      { ...good, id: 'feat-r-1' },
      { ...good, id: 'cr-Q-UPPER' },
      { ...good, user: 0 },
      { ...good, user: '7' },
      { ...good, why: 'gift' },
      { ...good, got: null },
      { ...good, got: { items: [], currants: 10_001 } },
      { ...good, got: { items: [{ c: 'plank', n: 1001 }], currants: 0 } },
    ]) assert.equal(php('event', [bad]), null, JSON.stringify(bad));
  });

  it('remembers what a write charged the budget: the kept gains no transform made', () => {
    const r = php('reconcile', [counts({ cabbage: 1, corn: 1, bean_plain: 5 }, 10), counts({ simple_slaw: 1, cherry: 4 }, 25), 1000, 50_000]);
    assert.deepEqual(r.made, { simple_slaw: 1 });
    assert.deepEqual(php('charged', [r]), counts({ cherry: 4 }, 15));
  });

  it('matches goods class by class', () => {
    assert.deepEqual(php('overlap', [counts({ beryl: 9, cherry: 2 }, 30), counts({ beryl: 4, plank: 5 }, 100)]), counts({ beryl: 4 }, 30));
    assert.deepEqual(php('minus', [counts({ beryl: 9, cherry: 2 }, 30), counts({ beryl: 4, cherry: 5 }, 100)]), counts({ beryl: 5 }, 0));
    assert.equal(php('worth', [counts({ beryl: 2 }, 7)]), 7 + 2 * ECON.items.beryl.v);
  });
});

describe('the two sides agree', { skip: skip || skipWithoutServer }, () => {
  const go = readFileSync(join(SERVER_DIR, 'credits.go'), 'utf8');
  const site = readFileSync(join(SITE_DIR, 'src/LedgerCredits.php'), 'utf8');

  it('on the route, the whys and the batch size', () => {
    assert.match(go, /ledgerRouteCredits = "\/groddle\/v1\/ledger\/credits"/);
    assert.match(site, /ROUTE = '\/groddle\/v1\/ledger\/credits'/);
    const whys = [...go.match(/creditWhy = map\[string\]string\{([^}]*)\}/)[1].matchAll(/"([a-z]+)": "[a-z]"/g)].map((m) => m[1]).sort();
    const siteWhys = [...site.match(/WHY = \[([^\]]*)\]/)[1].matchAll(/'([a-z]+)'/g)].map((m) => m[1]).sort();
    assert.deepEqual(whys, siteWhys);
    assert.ok(Number(go.match(/creditBatch\s+= (\d+)/)[1]) <= Number(site.match(/BATCH = (\d+)/)[1]));
  });

  it('on what one event may carry', () => {
    // A quoin's most: long random large currants (100) times quoin_capacity_limit (100).
    assert.equal(Number(site.match(/MOST_CURRANTS = (\d+)/)[1]), 100 * 100);
    assert.match(go, /raceWinCurrants = 100/);
  });
});
