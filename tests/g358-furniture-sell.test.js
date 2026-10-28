// G358 lane FURNSELL: the paid furniture styles (credits_cost > 0) sell for
// currants at CURRANTS_PER_CREDIT, the rate players sold credit styles at in
// the 2012 Marketplace forum. Covers the rate and its basis, the prices, the
// picker's buy and refusal, ownership after a buy, persistence, the history
// trim, the homes feature wiring, and the ledger taking the spend in
// multiplayer (site LedgerMath::reconcile through php, skipped without it).
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { FURNITURE_UPGRADES } from '../public/js/furniture-upgrades-data.js';
import {
  CURRANTS_PER_CREDIT,
  HISTORY_LIMIT,
  applyBonusUpgrade,
  applyUpgrade,
  cleanHistory,
  currantsText,
  listHasPaid,
  listUpgrades,
  pieceOwns,
  purseText,
  saveButtonText,
  styleCurrants,
  UPGRADE_TEXT,
} from '../public/js/furniture-upgrades.js';
import {
  createHomeDecorState,
  listPlaceable,
  normalizeHomeDecorState,
  pickUpFurniture,
  placeFurniture,
} from '../public/js/home-decor.js?v=g418-1';
import { SITE_DIR, skipWithoutSite } from '../tools/repos.mjs';

const root = join(import.meta.dirname, '..');
const pub = join(root, 'public');
const CHAIR = 'furniture_chair';
const CRAB = '112'; // Crab Chair, 25 credits (catalog_furniture.js)

/** The cheapest paid style of a class and its id. */
function cheapestPaid(cls) {
  return Object.entries(FURNITURE_UPGRADES[cls].upgrades)
    .filter(([, r]) => r.art && r.visible && r.credits > 0)
    .sort((a, b) => a[1].credits - b[1].credits || Number(a[0]) - Number(b[0]))[0];
}

describe('the exchange rate (lane FURNSELL)', () => {
  it('is 1,000 currants a credit, one named constant', () => {
    assert.equal(CURRANTS_PER_CREDIT, 1000);
    assert.equal(styleCurrants(25), 25_000);
    assert.equal(styleCurrants(0), 0);
    assert.equal(styleCurrants('x'), 0);
    assert.equal(currantsText(25_000), '25,000 currants');
    assert.equal(currantsText(1), '1 currant');
    assert.equal(purseText(1234), 'You have 1,234 currants');
  });

  const forum = join(root, '..', 'research', 'wayback', 'raw', 'forum', 'marketplace-threads.tsv');
  it('rests on the Marketplace forum titles it cites', { skip: !existsSync(forum) && 'no research/wayback forum dump' }, () => {
    const lines = readFileSync(forum, 'utf8').split('\n');
    const at = (n) => lines[n - 1];
    assert.match(at(3446), /Master list of affordable furniture sellers - incl\. Credit \(1k per\)/);
    for (const n of [1817, 2080, 2577, 2662, 2846, 3004, 3038, 3069, 3155, 3307]) assert.match(at(n), /1k|1K/, `line ${n}`);
    for (const n of [1842, 1925, 1955, 2031, 2109, 2115]) assert.match(at(n), /1500|1\.5k/, `line ${n}`);
    for (const n of [1751, 1792, 1929]) assert.match(at(n), /2k/, `line ${n}`);
    assert.match(at(3014), /700 per credit/);
    assert.match(at(3498), /25credits \(will pay 50k\)/);
    // The cited rates, one per thread: the median is the 1k the master list names.
    const rates = [...Array(3).fill(2000), ...Array(6).fill(1500), ...Array(10).fill(1000), 700, 1000].sort((a, b) => a - b);
    assert.equal(rates[Math.floor(rates.length / 2)], CURRANTS_PER_CREDIT);
  });
});

describe('what the styles cost', () => {
  const paid = [];
  for (const [cls, def] of Object.entries(FURNITURE_UPGRADES)) {
    for (const [id, row] of Object.entries(def.upgrades)) if (row.art && row.credits > 0) paid.push({ cls, id, currants: styleCurrants(row.credits) });
  }
  const sorted = paid.map((p) => p.currants).sort((a, b) => a - b);

  it('prices all 452 paid styles from 5,000 to 75,000 currants, median 25,000', () => {
    assert.equal(paid.length, 452);
    assert.deepEqual([sorted[0], sorted[Math.floor((sorted.length - 1) / 2)], sorted.at(-1)], [5_000, 25_000, 75_000]);
  });

  it('puts a common piece\'s styles well above the piece, within a mid-game purse', () => {
    const range = (cls) => {
      const v = paid.filter((p) => p.cls === cls).map((p) => p.currants).sort((a, b) => a - b);
      return [v[0], v.at(-1)];
    };
    assert.deepEqual(range('furniture_chair'), [15_000, 40_000]);
    assert.deepEqual(range('furniture_table'), [15_000, 25_000]);
    assert.deepEqual(range('furniture_tablelamp'), [10_000, 25_000]);
    assert.deepEqual(range('furniture_floorlamp'), [15_000, 40_000]);
    assert.deepEqual(range('furniture_bed'), [15_000, 55_000]);
    // The listed price follows the catalog: the Crab Chair is 25 credits.
    assert.equal(listUpgrades({ id: 1, classTsid: CHAIR }, 'Chair').find((r) => r.id === CRAB).currants, 25_000);
  });
});

describe('buying a style in the picker', () => {
  it('turns the locked line into a buy when the purse covers it', () => {
    const piece = { id: 1, classTsid: CHAIR };
    const list = listUpgrades(piece, 'Chair');
    assert.equal(listHasPaid(list), true);
    const crab = list.find((r) => r.id === CRAB);
    assert.deepEqual([crab.paid, crab.currants, crab.text], [true, 25_000, '25,000 currants']);
    assert.deepEqual(saveButtonText(piece, crab, { currants: 25_000 }), { text: 'Change style for 25,000 currants', disabled: false, cost: 25_000 });
  });

  it('refuses plainly when the purse is short (FurnUpgradeDialog, credits there)', () => {
    const piece = { id: 1, classTsid: CHAIR };
    const crab = listUpgrades(piece, 'Chair').find((r) => r.id === CRAB);
    const button = saveButtonText(piece, crab, { currants: 24_999 });
    assert.deepEqual(button, { text: 'Change style for 25,000 currants', disabled: true, cost: 25_000, short: true, tip: 'You need more currants' });
    const r = applyUpgrade(piece, CRAB, { currants: 24_999 });
    assert.deepEqual(r, { ok: false, reason: 'currants', msg: "You don't have enough currants.", cost: 25_000 });
    assert.equal(piece.upgradeId, undefined);
    assert.equal(piece.upgradeHistory, undefined);
  });

  it('spends the price once; the piece owns the style after and changes back for nothing', () => {
    const piece = { id: 1, classTsid: CHAIR };
    const r = applyUpgrade(piece, CRAB, { currants: 30_000, now: 2_000_000, baseLabel: 'Chair' });
    assert.deepEqual(r, { ok: true, id: CRAB, name: 'Crab Chair', cost: 25_000, counter: 'upgraded:furniture_chair' });
    assert.equal(piece.upgradeId, CRAB);
    assert.deepEqual(piece.upgradeHistory, [{ from: '0', to: CRAB, when: 2000 }]);
    assert.equal(pieceOwns(piece, CRAB), true);
    // Back to the plain Chair (free), then the Crab Chair again: owned, so free.
    assert.equal(applyUpgrade(piece, '0', { baseLabel: 'Chair' }).cost, 0);
    const crab = listUpgrades(piece, 'Chair').find((row) => row.id === CRAB);
    assert.deepEqual([crab.owned, crab.paid, crab.currants, crab.text], [true, false, 0, UPGRADE_TEXT.owned]);
    assert.deepEqual(saveButtonText(piece, crab, { currants: 0 }), { text: 'Change style', disabled: false });
    assert.deepEqual(applyUpgrade(piece, CRAB, { currants: 0 }).cost, 0);
  });

  it('keeps free styles free and a card style owned, whatever the purse', () => {
    const piece = { id: 1, classTsid: CHAIR };
    assert.deepEqual(saveButtonText(piece, listUpgrades(piece, 'Chair').find((r) => r.id === '1'), { currants: 0 }), { text: 'Change style for FREE!', disabled: false });
    assert.equal(applyUpgrade(piece, '1', { currants: 0 }).ok, true);
    assert.equal(applyBonusUpgrade(piece, CRAB), true);
    applyUpgrade(piece, '1', { currants: 0 });
    assert.equal(applyUpgrade(piece, CRAB, { currants: 0 }).cost, 0, 'Bonus Furniture Upgrade styles are owned');
  });

  it('never forgets a bought style however often the piece changes', () => {
    const piece = { id: 1, classTsid: CHAIR };
    applyUpgrade(piece, CRAB, { currants: 25_000 });
    for (let i = 0; i < 60; i++) applyUpgrade(piece, i % 2 ? '1' : '14', { currants: 0 });
    assert.ok(piece.upgradeHistory.length <= HISTORY_LIMIT);
    assert.equal(pieceOwns(piece, CRAB), true);
    assert.equal(listUpgrades(piece, 'Chair').find((r) => r.id === CRAB).paid, false);
    // A long history of distinct styles keeps one row each.
    const rows = Array.from({ length: 47 }, (_, i) => ({ from: '0', to: String(i + 1), when: i }));
    assert.equal(cleanHistory(rows).length, 47);
    assert.equal(cleanHistory([...rows, ...rows]).length, 47);
  });
});

describe('a bought style lasts', () => {
  it('survives the save, a pick-up and a new placement', () => {
    const state = createHomeDecorState({ storage: { furniture_chair: 1 } });
    const placed = placeFurniture(state, {}, CHAIR, { x: 400 }).item;
    assert.equal(applyUpgrade(placed, CRAB, { currants: 25_000, baseLabel: 'Chair' }).cost, 25_000);
    const loaded = normalizeHomeDecorState(JSON.parse(JSON.stringify(state)));
    const again = loaded.placed.find((p) => p.classTsid === CHAIR);
    assert.equal(again.upgradeId, CRAB);
    assert.equal(pieceOwns(again, CRAB), true);
    pickUpFurniture(loaded, again.id);
    const row = listPlaceable(loaded, {}).find((r) => r.classTsid === CHAIR && r.style != null);
    assert.equal(row.label, 'Crab Chair');
    const back = placeFurniture(loaded, {}, CHAIR, { x: 300 }, { style: row.style }).item;
    assert.equal(back.upgradeId, CRAB);
    applyUpgrade(back, '0', { baseLabel: 'Chair' });
    assert.equal(applyUpgrade(back, CRAB, { currants: 0 }).ok, true, 'still owned after the round trip');
  });
});

describe('wiring and copy', () => {
  it('the homes feature takes the price from the purse and the picker reads it', () => {
    const src = readFileSync(join(pub, 'js/features/homes-feature.js'), 'utf8');
    assert.match(src, /currants: \(\) => Number\(engine\.pc\?\.currants\) \|\| 0/);
    assert.match(src, /applyUpgrade\(item, upgradeId, \{ baseLabel: furnitureDef\(item\.classTsid\)\.label, currants: purse \}\)/);
    assert.match(src, /engine\.pc\.currants = Math\.max\(0, purse - result\.cost\)/);
    const picker = readFileSync(join(pub, 'js/furniture-upgrade-picker.js'), 'utf8');
    assert.match(picker, /saveButtonText\(current\.piece, current\.chosen, \{ currants: purse\(\) \}\)/);
    assert.match(picker, /data-upgrade-purse/);
  });

  it('uses no em-dashes in the new copy', () => {
    for (const t of [UPGRADE_TEXT.youHave, UPGRADE_TEXT.needCurrants, UPGRADE_TEXT.notEnough, currantsText(5000), purseText(5)]) assert.ok(!/—/.test(t), t);
  });

  it('the picker\'s first paid tile is the cheapest style (the QA route buys it)', () => {
    const [id, row] = cheapestPaid(CHAIR);
    assert.equal(listUpgrades({ id: 1, classTsid: CHAIR }, 'Chair').find((r) => r.paid).id, id);
    assert.equal(styleCurrants(row.credits), 15_000);
  });
});

const hasPhp = spawnSync('php', ['-v']).status === 0;
describe('multiplayer: the ledger takes the spend (site LedgerMath::reconcile)', { skip: skipWithoutSite || (!hasPhp && 'no php') }, () => {
  it('a save write 25,000 currants lower stands as a loss, nothing clamped', () => {
    const code = `
      foreach (['Economy', 'LedgerMath'] as $c) require ${JSON.stringify(SITE_DIR)} . "/src/$c.php";
      use Groddle\\Minn\\{Economy, LedgerMath};
      $r = LedgerMath::reconcile(['items' => ['furniture_chair' => 1], 'currants' => 30000], ['items' => ['furniture_chair' => 1], 'currants' => 5000], 0.0, 50000.0, Economy::shared());
      echo json_encode([$r['delta']['currants'], $r['clamped']['currants'], $r['delta']['items']['furniture_chair'] ?? 0]);`;
    const [delta, clamped, chairs] = JSON.parse(String(execFileSync('php', ['-r', code])));
    assert.deepEqual([delta, clamped, chairs], [-25_000, 0, 0]);
  });
});
