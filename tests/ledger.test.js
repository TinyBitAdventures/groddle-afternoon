/**
 * G335: the multiplayer ledger (groddle-afternoon-site src/LedgerMath.php,
 * Economy.php, ServiceCall.php, run through the php CLI on fixture saves)
 * and its economy table (tools/build-economy.mjs). The design is
 * glitch-audit research/coverage/g335-economy.md.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHmac, createHash } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { SITE_DIR, skipWithoutSite, skipWithoutServer } from '../tools/repos.mjs';
import { unitValue, FALLBACK_VALUE } from '../tools/build-economy.mjs';

const root = join(import.meta.dirname, '..');
const gsjs = join(root, '..', 'glitch-GameServerJS');
const hasPhp = spawnSync('php', ['-v']).status === 0;
const skip = skipWithoutSite || !hasPhp;

/** Runs one LedgerMath call in PHP: op name and args in, the result out. */
function php(op, ...args) {
  const code = `
    foreach (['Economy', 'LedgerMath', 'ServiceCall'] as $c) require ${JSON.stringify(SITE_DIR)} . "/src/$c.php";
    use Groddle\\Minn\\{Economy, LedgerMath, ServiceCall};
    $in = json_decode(stream_get_contents(STDIN), true);
    $e = Economy::shared();
    $a = $in['args'];
    $out = match ($in['op']) {
      'holdings' => LedgerMath::holdings($a[0], $e),
      'reconcile' => LedgerMath::reconcile($a[0], $a[1], (float) $a[2], (float) $a[3], $e),
      'view' => LedgerMath::view($a[0], $a[1]),
      'remove' => LedgerMath::remove($a[0], $a[1]),
      'apply' => LedgerMath::applyTrade($a[0], $a[1], $a[2], $a[3]),
      'text' => LedgerMath::correctedText($a[0], $e),
      'sign' => ServiceCall::sign($a[0], $a[1], $a[2], $a[3], $a[4], $a[5]),
      'verify' => ServiceCall::verify($a[0], $a[1], $a[2], $a[3], $a[4], $a[5]),
      'value' => $e->value($a[0]),
    };
    echo json_encode($out);`;
  const out = execFileSync('php', ['-r', code], { input: JSON.stringify({ op, args }) });
  // PHP writes an empty map as []: read it back as the {} it means.
  return JSON.parse(String(out), (k, v) => (k === 'items' && Array.isArray(v) && !v.length ? {} : v));
}

/** A multiplayer save's entries the way the game writes them. */
function save({ inv = {}, currants = 0, hold = null, applied = [], storage = {}, placed = [], dropped = {} } = {}) {
  const features = {};
  if (hold || applied.length) features.trade = { hold, applied };
  if (Object.keys(storage).length || placed.length) features.homes = { decor: { storage, placed } };
  return {
    playerState: JSON.stringify({ version: 7, inventory: inv, player: { currants, energy: 50, mood: 50, xp: 0 }, systems: { quests: {}, features }, world: {}, savedAt: 1 }),
    droppedItems: JSON.stringify({ version: 1, nextId: 3, streets: dropped }),
    location: '{"street":"GA5"}',
  };
}
const empty = { items: {}, currants: 0 };
const counts = (items, currants = 0) => ({ items, currants });

describe('economy table (tools/build-economy.mjs)', () => {
  it('is current (node tools/build-economy.mjs, from GSJS)', { skip: skipWithoutSite || skipWithoutServer || !existsSync(gsjs) }, () => {
    execFileSync(process.execPath, ['tools/build-economy.mjs', '--check'], { cwd: root });
  });

  it('values a class at the best haggled price, and a class with no base cost at the fallback', () => {
    assert.equal(unitValue('apple'), 5); // base_cost 5, 0.9 * 5 = 4.5 -> 5 (Math.round)
    assert.equal(unitValue('stoot_barfield_pullstring_doll'), 1199790);
    assert.equal(unitValue('emblem_alph'), FALLBACK_VALUE);
  });

  it('gates classes nothing in the remake grants, and gives tools their points', { skip }, () => {
    const t = JSON.parse(readFileSync(join(SITE_DIR, 'data/economy.json'), 'utf8'));
    assert.equal(t.items.million_currant_trophy.g, 'credit');
    assert.equal(t.items.apple.g, undefined);
    assert.equal(t.items.pick.pts, 100);
    assert.equal(t.items.artifact_bee_key, undefined, 'no_trade classes are not in the ledger');
  });
});

describe('ledger holdings (LedgerMath::holdings)', { skip }, () => {
  it('counts tradeable things in the pack, the hold, home storage, placed furniture, display boxes and street drops', () => {
    const h = php('holdings', save({
      inv: { apple: 3, pick: 1, artifact_bee_key: 1 },
      currants: 40,
      hold: { trade: 'x-1', with: { id: 2, name: 'Bo' }, items: { apple: 2 }, currants: 10 },
      storage: { furniture_chair: 2 },
      placed: [{ id: 1, classTsid: 'bag_furniture_sdb', display: { classTsid: 'cherry', count: 7 } }],
      dropped: { GA5: [{ id: 'w1', classTsid: 'apple', count: 4 }] },
    }));
    assert.deepEqual(h, { items: { apple: 9, bag_furniture_sdb: 1, cherry: 7, furniture_chair: 2, pick: 1 }, currants: 50 });
  });
});

describe('ledger reconcile (LedgerMath::reconcile)', { skip }, () => {
  const ledger = counts({ apple: 10 }, 100);

  it('takes back forged currants and a forged doll, and keeps what the budget pays for', () => {
    const h = counts({ apple: 12, stoot_barfield_pullstring_doll: 500 }, 10_000_000);
    const r = php('reconcile', ledger, h, 50_000, 50_000);
    assert.deepEqual(r.clamped, { items: { stoot_barfield_pullstring_doll: 500 }, currants: 10_000_000 - 100 - 49_990 });
    assert.equal(r.delta.items.apple, 2);
    assert.ok(r.budget < 1);
  });

  it('lets an honest harvest through and never refunds above the capacity', () => {
    const r = php('reconcile', ledger, counts({ apple: 30 }, 100), 1000, 50_000);
    assert.deepEqual(r.clamped, empty);
    assert.equal(r.budget, 900);
    const loss = php('reconcile', ledger, counts({}, 100), 49_990, 50_000);
    assert.equal(loss.budget, 50_000, 'losses refund, up to the capacity');
  });

  it('never accepts a credit-only class as a gain', () => {
    const r = php('reconcile', empty, counts({ million_currant_trophy: 1 }), 50_000, 50_000);
    assert.deepEqual(r.clamped.items, { million_currant_trophy: 1 });
  });

  it('reads a trade not yet applied as the save before the trade, and the applied trade as the ledger', () => {
    // Ada gave 5 apples for 30 currants: the ledger already moved; her save still holds them in the hold.
    const after = counts({ apple: 5 }, 130);
    const pending = [{ trade: 't-1', gave: counts({ apple: 5 }), got: counts({}, 30) }];
    const before = php('holdings', save({ inv: { apple: 5 }, currants: 100, hold: { trade: 't-1', items: { apple: 5 }, currants: 0 } }));
    const r1 = php('reconcile', php('view', after, pending), before, 0, 50_000);
    assert.deepEqual(r1.clamped, empty);
    assert.deepEqual(r1.delta, empty);
    const applied = php('holdings', save({ inv: { apple: 5 }, currants: 130, applied: ['t-1'] }));
    const r2 = php('reconcile', after, applied, 0, 50_000);
    assert.deepEqual(r2.clamped, empty);
    // A save that kept the apples after applying it (a modified client) is held to the ledger.
    const kept = php('holdings', save({ inv: { apple: 10 }, currants: 130, applied: ['t-1'] }));
    assert.deepEqual(php('reconcile', after, kept, 0, 50_000).clamped, counts({ apple: 5 }));
  });

  it('reads moving things between the pack and a stash as no change', () => {
    const a = php('holdings', save({ inv: { furniture_chair: 2 }, currants: 5 }));
    const b = php('holdings', save({ storage: { furniture_chair: 2 }, currants: 5 }));
    const r = php('reconcile', a, b, 0, 50_000);
    assert.deepEqual(r.clamped, empty);
    assert.deepEqual(r.delta, empty);
  });
});

describe('ledger edits to a stored save', { skip }, () => {
  it('takes clamped goods out of the pack first, then the hold, storage and drops', () => {
    const entries = save({ inv: { apple: 2 }, currants: 50, hold: { trade: 'x', items: { apple: 1 }, currants: 20 }, storage: {}, dropped: { GA5: [{ id: 'w1', classTsid: 'apple', count: 5 }] } });
    const out = php('remove', entries, counts({ apple: 6 }, 60));
    const state = JSON.parse(out.playerState);
    // The pack keeps a class it ran out of at 0, as the game does (a missing key gets a starter grant at boot).
    assert.deepEqual(state.inventory, { apple: 0 });
    assert.equal(state.player.currants, 0);
    assert.deepEqual(state.systems.features.trade.hold.items, {});
    assert.equal(state.systems.features.trade.hold.currants, 10);
    assert.deepEqual(JSON.parse(out.droppedItems).streets.GA5[0].count, 2);
    assert.deepEqual(php('holdings', out), counts({ apple: 2 }, 10));
    assert.equal(out.location, entries.location, 'other entries are left as they are');
  });

  it('applies a settled trade as the game does: hold minus gave back, got in, remembered as applied', () => {
    const entries = save({ inv: { apple: 1 }, currants: 100, hold: { trade: 't-9', with: { id: 2, name: 'Bo' }, items: { apple: 4, cherry: 2 }, currants: 30 } });
    const out = php('apply', entries, 't-9', counts({ apple: 3 }, 30), counts({ pick: 1 }, 5));
    const s = JSON.parse(out.playerState);
    assert.deepEqual(s.inventory, { apple: 2, cherry: 2, pick: 1 });
    assert.equal(s.player.currants, 105);
    assert.equal(s.systems.features.trade.hold, null);
    assert.deepEqual(s.systems.features.trade.applied, ['t-9']);
    assert.deepEqual(php('apply', out, 't-9', counts({ apple: 3 }), counts({})), out, 'a trade already applied is left alone');
  });

  it('says what was taken back without em-dashes', () => {
    const text = php('text', counts({ stoot_barfield_pullstring_doll: 500, apple: 1 }, 9_999_800));
    assert.equal(text, 'Your pack was corrected: 1 Apple, 500 Stoot Barfield Pullstring Dolls and 9,999,800 currants could not be accounted for.');
    assert.doesNotMatch(text, /—/);
  });
});

describe('service calls (ServiceCall, ledger.go)', { skip }, () => {
  const secret = 'x'.repeat(40);
  const body = '{"trade":"abc-1"}';
  it('signs the way the Go side does and refuses a stale or altered call', () => {
    const msg = ['groddle-service/1', 'POST', '/groddle/v1/ledger/trade', '1700000000', '0123456789abcdef', createHash('sha256').update(body).digest('hex')].join('\n');
    const sig = createHmac('sha256', secret).update(msg).digest('base64url');
    const want = `1700000000.0123456789abcdef.${sig}`;
    assert.equal(php('sign', 'POST', '/groddle/v1/ledger/trade', 1700000000, '0123456789abcdef', body, secret), want);
    assert.equal(php('verify', want, 'POST', '/groddle/v1/ledger/trade', body, secret, 1700000030), true);
    assert.equal(php('verify', want, 'POST', '/groddle/v1/ledger/trade', body, secret, 1700000061), false);
    assert.equal(php('verify', want, 'POST', '/groddle/v1/ledger/trade/void', body, secret, 1700000000), false);
    assert.equal(php('verify', want, 'POST', '/groddle/v1/ledger/trade', '{"trade":"abc-2"}', secret, 1700000000), false);
    assert.equal(php('verify', want, 'POST', '/groddle/v1/ledger/trade', body, 'y'.repeat(40), 1700000000), false);
    assert.equal(php('verify', null, 'POST', '/groddle/v1/ledger/trade', body, secret, 1700000000), false);
  });
});

describe('the game side of a correction (save-store.js, features/ledger-feature.js)', () => {
  it('passes a corrected answer on, and only that', async () => {
    const { createSaveSync } = await import('../public/js/save-store.js?v=mp2-2');
    const answers = [
      { version: 4, ledger: { corrected: { items: { apple: 2 }, currants: 40 }, text: 'Your pack was corrected: 2 Apples and 40 currants could not be accounted for.' } },
      { version: 5 },
    ];
    const heard = [];
    const sync = createSaveSync({
      url: '/save', version: 3, payload: () => ({}),
      fetch: async () => ({ ok: true, status: 200, headers: { get: () => '' }, json: async () => answers.shift() }),
      timers: { setTimeout: () => 0, clearTimeout: () => {} },
      onLedger: (l) => heard.push(l),
    });
    sync.changed();
    await sync.flush();
    sync.changed();
    await sync.flush();
    assert.equal(heard.length, 1);
    assert.deepEqual(heard[0].corrected, { items: { apple: 2 }, currants: 40 });
    assert.equal(sync.version, 5);
  });

  it('takes a correction out of the pack and purse as changes, never below what is there', async () => {
    const { applyCorrection } = await import('../public/js/features/ledger-feature.js?v=g482-1');
    const inv = { apple: 5, cherry: 1 };
    const pc = { currants: 30 };
    const taken = applyCorrection(inv, pc, { items: { apple: 2, cherry: 4, pick: 1 }, currants: 50 });
    assert.deepEqual(taken, { items: { apple: 2, cherry: 1 }, currants: 30 });
    assert.equal(inv.apple, 3);
    assert.equal(inv.cherry ?? 0, 0);
    assert.equal(pc.currants, 0);
  });
});
