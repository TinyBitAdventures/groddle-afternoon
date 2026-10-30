/**
 * G335, live report 2026-10-30 #2: online, a new character's first visit
 * inside their house said "Your pack was corrected: 1 Small Cabinet, 2
 * Shelves and 1 Table could not be accounted for", again on every save.
 *
 * - The cause: js/home-decor.js grantStarterKit hands over the house's
 *   starter furniture (players/inc_furniture.js furniture_populate 73-113),
 *   and nothing told the ledger (groddle-afternoon-site src/LedgerMath.php),
 *   so the set was paid from the new player's budget, smallest gain first,
 *   and the dearest pieces were clamped.
 * - The fix: the economy table carries the set (credits.homeKit, from
 *   tools/build-economy.mjs) and LedgerMath::check credits it once per
 *   character when the save shows decor.starterKit, for what the write shows
 *   beyond the ledger only.
 * - The repeat: features/ledger-feature.js took a correction out of the pack
 *   alone, so pieces standing in the house came back with the next save and
 *   were corrected again. It now takes the rest out of the house too
 *   (homes-feature ledgerTakeBack, js/ledger-house.js), as the site's remove did.
 * - Also: pieces on an upper floor of the house (G153, homes floors.upper)
 *   count as held, so moving one upstairs and down is no gain.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SITE_DIR, skipWithoutSite } from '../tools/repos.mjs';
import { FURNITURE_STARTER_KIT } from '../public/js/homes-catalog.js?v=29713fa8';
import { arrangeStarterRoom, createHomeDecorState, grantStarterKit } from '../public/js/home-decor.js?v=95ba0a91';
import { takeFromHouse } from '../public/js/ledger-house.js?v=258ef99e';
import { applyCorrection } from '../public/js/features/ledger-feature.js?v=5c347d75';

const root = join(import.meta.dirname, '..');
const hasPhp = spawnSync('php', ['-v']).status === 0;
const skip = skipWithoutSite || !hasPhp;

function php(op, args) {
  const code = `
    foreach (['Economy', 'LedgerMath'] as $c) require ${JSON.stringify(SITE_DIR)} . "/src/$c.php";
    use Groddle\\Minn\\{Economy, LedgerMath};
    $in = json_decode(stream_get_contents(STDIN), true);
    $e = Economy::shared();
    $a = $in['args'];
    $out = match ($in['op']) {
      'check' => LedgerMath::check($a[0], $a[1], $a[2], $a[3], (float) $a[4], (float) $a[5], $e),
      'holdings' => LedgerMath::holdings($a[0], $e),
      'remove' => LedgerMath::remove($a[0], $a[1]),
      'baseline' => LedgerMath::baseline($a[0], $e),
    };
    echo json_encode($out);`;
  const out = execFileSync('php', ['-r', code], { input: JSON.stringify({ op, args }) });
  return JSON.parse(String(out), (k, v) => (Array.isArray(v) && !v.length && ['items', 'made', 'runs', 'capped', 'detail'].includes(k) ? {} : v));
}

/** The entries a multiplayer save writes, with the homes slice as homes-feature saves it. */
function save({ inv = {}, decor = null, upper = [] } = {}) {
  const homes = decor ? { decor, towerDecor: [], floors: { at: 0, upper: upper.map(({ storage, styles, ...rest }) => rest) } } : null;
  return {
    playerState: JSON.stringify({
      version: 7,
      inventory: inv,
      player: { currants: 0, energy: 50, mood: 50, xp: 150, level: 2 },
      systems: { quests: { completed: [], active: {} }, achievements: { unlocked: [] }, features: homes ? { homes } : {} },
      savedAt: 1,
    }),
    location: '{"street":"LIF12PMQ5121D68"}',
  };
}

/** A house on its first visit inside, as homes-feature homeScene makes it. */
function firstVisitHouse() {
  const decor = createHomeDecorState({});
  grantStarterKit(decor);
  arrangeStarterRoom(decor);
  return JSON.parse(JSON.stringify(decor));
}

const kitTotal = Object.values(FURNITURE_STARTER_KIT).reduce((a, b) => a + b, 0);
const ledgerOf = (items = {}, currants = 0) => ({ items, currants });
const credit = (rows) => {
  const out = {};
  for (const [k, r, n] of rows) (out[k] ||= {})[r] = n;
  return out;
};

describe('the starter furniture in the economy table (tools/build-economy.mjs)', { skip }, () => {
  it('is the set furniture_populate gives, every piece of it tradeable', () => {
    const econ = JSON.parse(readFileSync(join(SITE_DIR, 'data/economy.json'), 'utf8'));
    assert.deepEqual(econ.credits.homeKit, Object.fromEntries(Object.entries(FURNITURE_STARTER_KIT).sort(([a], [b]) => a.localeCompare(b))));
    for (const c of Object.keys(FURNITURE_STARTER_KIT)) assert.ok(econ.items[c], `${c} is tradeable`);
    const src = readFileSync(join(root, '..', 'glitch-GameServerJS', 'players', 'inc_furniture.js'), 'utf8');
    const block = /function furniture_populate\(force\)\{[\s\S]*?var to_give = (\{[\s\S]*?\});/.exec(src);
    assert.ok(block, 'furniture_populate found');
    assert.deepEqual(JSON.parse(block[1].replace(/'/g, '"')), { ...FURNITURE_STARTER_KIT });
  });
});

describe('the first visit inside the house (LedgerMath::check homeKit)', { skip }, () => {
  it('main: the set was paid from the budget and the dearest pieces clamped (the report), now it stands with no budget at all', () => {
    const entries = save({ decor: firstVisitHouse() });
    const before = php('holdings', [entries]);
    assert.equal(Object.values(before.items).reduce((a, b) => a + b, 0), kitTotal, 'every piece is counted, placed or stored');
    const c = php('check', [ledgerOf(), credit([['base', 'base', 1]]), [], entries, 0, 50_000]);
    assert.deepEqual(c.reconciled.clamped, { items: {}, currants: 0 });
    assert.deepEqual(c.after.items, before.items);
    assert.ok(c.rows.some(([k, r, n]) => k === 'home' && r === 'kit' && n === 1));
    assert.ok(c.credits.detail.homeKit);
  });

  it('once per character: a second set (the house reset by hand) is not credited again', () => {
    const house = firstVisitHouse();
    const again = JSON.parse(JSON.stringify(house));
    for (const [cls, n] of Object.entries(FURNITURE_STARTER_KIT)) again.storage[cls] = (again.storage[cls] || 0) + n;
    const first = php('check', [ledgerOf(), credit([['base', 'base', 1]]), [], save({ decor: house }), 0, 50_000]);
    const credited = credit([['base', 'base', 1], ...first.rows]);
    const c = php('check', [first.after, credited, [], save({ decor: again }), 0, 50_000]);
    assert.equal(Object.values(c.reconciled.clamped.items).reduce((a, b) => a + b, 0), kitTotal);
    assert.ok(!c.rows.some(([k]) => k === 'home'));
  });

  it('a ledger seeded from a save that already held the set gains nothing from it', () => {
    const entries = save({ decor: firstVisitHouse() });
    const seeded = php('holdings', [entries]);
    const c = php('check', [seeded, credit([['base', 'base', 1]]), [], entries, 0, 50_000]);
    assert.deepEqual(c.after.items, seeded.items);
    assert.deepEqual(c.reconciled.delta.items, {});
    assert.equal(c.reconciled.budget, 0, 'no phantom loss refunds the budget');
  });

  it('a house before its first visit (no starterKit) is credited nothing, and the marker stays unset', () => {
    const decor = createHomeDecorState({});
    const c = php('check', [ledgerOf(), credit([['base', 'base', 1]]), [], save({ decor }), 0, 50_000]);
    assert.ok(!c.rows.some(([k]) => k === 'home'));
  });
});

describe('furniture on an upper floor of the house (G153 floors.upper)', { skip }, () => {
  it('counts as held, and a correction can take it from there', () => {
    const ground = createHomeDecorState({});
    const upper = createHomeDecorState({ placed: [{ id: 4, classTsid: 'furniture_table', x: 400 }] });
    const entries = save({ decor: ground, upper: [upper] });
    assert.deepEqual(php('holdings', [entries]).items, { furniture_table: 1 });
    const out = php('remove', [entries, { items: { furniture_table: 1 }, currants: 0 }]);
    assert.deepEqual(php('holdings', [out]).items, {});
  });
});

describe('the game takes a correction out of the house too (ledger-feature, js/ledger-house.js)', () => {
  it('takes storage first, then display boxes and placed pieces on every floor, and clears what rested on a piece taken', () => {
    const ground = createHomeDecorState({
      storage: { furniture_shelf: 1 },
      placed: [
        { id: 1, classTsid: 'furniture_table', x: 400 },
        { id: 2, classTsid: 'furniture_tabledeco', x: 400, on: 1 },
        { id: 3, classTsid: 'bag_furniture_sdb', x: 700, display: { classTsid: 'apple', count: 5 } },
      ],
    });
    const upper = createHomeDecorState({ placed: [{ id: 7, classTsid: 'furniture_shelf', x: 300, y: 430 }] });
    const taken = takeFromHouse([ground, upper], { furniture_shelf: 2, furniture_table: 1, apple: 3, furniture_chair: 1 });
    assert.deepEqual(taken, { furniture_shelf: 2, furniture_table: 1, apple: 3 });
    assert.equal(ground.storage.furniture_shelf, undefined);
    assert.deepEqual(ground.placed.map((r) => r.id), [2, 3]);
    assert.equal(ground.placed[0].on, null);
    assert.equal(ground.placed[1].display.count, 2);
    assert.deepEqual(upper.placed, []);
  });

  it('applyCorrection hands what the pack lacks to the house and counts it as taken', () => {
    const inv = { apple: 1 };
    const pc = { currants: 10 };
    let asked = null;
    const taken = applyCorrection(inv, pc, { items: { apple: 3, furniture_table: 1 }, currants: 0 }, (rest) => {
      asked = rest;
      return { apple: 1, furniture_table: 1, furniture_chair: 9 };
    });
    assert.deepEqual(asked, { apple: 2, furniture_table: 1 });
    assert.deepEqual(taken.items, { apple: 2, furniture_table: 1 });
    assert.equal(countOf(inv, 'apple'), 0);
  });

  it('settles once: after the game takes the correction out of the house, the next write is not corrected again', { skip }, () => {
    // The report's path on main: a correction of furniture standing in the house.
    const decor = firstVisitHouse();
    const first = php('check', [ledgerOf(), credit([['base', 'base', 1], ['home', 'kit', 1]]), [], save({ decor }), 2000, 50_000]);
    assert.ok(Object.keys(first.reconciled.clamped.items).length > 0, 'a kit nobody credited is clamped');
    // The pack holds none of it: before this fix nothing was taken and the next save showed it all again.
    const taken = applyCorrection({}, { currants: 0 }, first.reconciled.clamped, (rest) => takeFromHouse([decor], rest));
    assert.deepEqual(taken.items, first.reconciled.clamped.items);
    const credited = credit([['base', 'base', 1], ['home', 'kit', 1], ...first.rows]);
    const next = php('check', [first.after, credited, [], save({ decor }), 0, 50_000]);
    assert.deepEqual(next.reconciled.clamped, { items: {}, currants: 0 });
  });
});

function countOf(inv, c) {
  const v = inv[c];
  return typeof v === 'number' ? v : Number(v?.count || 0);
}
