/**
 * G786 (#361): a donation Feat counts every chunk the player really gave, as Glitch did
 * (groups/feat.js increment adds the full amount, its clamp at line 29 commented out;
 * players/inc_feats.js feats_increment passes it through; the donate_sparkly vog_text counts each
 * chunk donated). The page's report names a spend id the trade slice marks applied as the chunks
 * leave the pack; the realtime server spends them from the ledger (the site's LedgerSpend.php,
 * why feat_donation) and counts all of a settled spend (feats.go donation, its Go test:
 * feats_donation_test.go); what the ledger cannot confirm counts at the pace and the rest is
 * carried over. The site's PHP runs here through php -r (skipped without the site or php).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { DONATION_OP_RE, MP_DONATIONS, MP_PACE, donationOp, reportFor } from '../public/js/feats-mp.js?v=49ed2393';
import { featTable } from '../tools/build-realtime-feats.mjs';
import { HAS_SITE, SITE_DIR } from '../tools/repos.mjs';
import { HAS_PHP, PHP } from './php.js';

const root = join(import.meta.dirname, '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');
const hasPhp = HAS_PHP;
const skipSite = !HAS_SITE ? 'no groddle-afternoon-site checkout' : !hasPhp ? 'no php' : false;

describe('G786: a donation report names its spend', () => {
  const run = { feat: 'donate_sparkly', run: 7 };

  it('a 189-chunk donation reports 189 with a spend id and the class', () => {
    const op = donationOp(() => 0.5);
    assert.match(op, DONATION_OP_RE);
    assert.equal(op, 'fdon-8888888888888888');
    assert.deepEqual(reportFor(run, 'donate_sparkly', 189, { op }), { feat: 'donate_sparkly', n: 189, op, c: 'sparkly' });
    // No spend id (offline trade slice, an older page): the plain report, which the server paces and carries over.
    assert.deepEqual(reportFor(run, 'donate_sparkly', 189), { feat: 'donate_sparkly', n: 189 });
    assert.deepEqual(reportFor(run, 'donate_sparkly', 189, { op: 'party-0000000000000000' }), { feat: 'donate_sparkly', n: 189 });
    // Other Feats never carry one.
    assert.deepEqual(reportFor({ feat: 'animal_love' }, 'animal_love', 3, { op }), { feat: 'animal_love', n: 3 });
  });

  it('the server\'s table names the class, and keeps the pace for what the ledger cannot confirm', () => {
    assert.deepEqual(MP_DONATIONS, { donate_sparkly: 'sparkly' });
    const t = featTable();
    assert.equal(t.feats.donate_sparkly.donate, 'sparkly');
    assert.deepEqual(t.feats.donate_sparkly.pace, { n: MP_PACE.donate_sparkly.n, everyMs: MP_PACE.donate_sparkly.everyMs, burst: MP_PACE.donate_sparkly.burst });
    assert.equal(t.feats.animal_love.donate, undefined);
    assert.equal(spawnSync('node', ['tools/build-realtime-feats.mjs', '--check'], { cwd: root }).status, 0, 'data/feats.json is current');
  });

  it('marks the spend applied with the trades before it reports (trade-feature ledgerReceipt)', () => {
    const src = read('public/js/features/solo-feats-feature.js');
    assert.match(src, /if \(engine\.query\?\.\('ledgerReceipt', id, engine\) === true\) op = id;/);
    // G968: owed with its spend id until the server answers (js/feat-owed.js sends it as op).
    assert.match(src, /oweReport\(owed, \{ feat: featId, n: amount, act: opts\.act, street: opts\.street, op, cap \}, run\)/);
    // The shrine's donation still reports the chunks given (game.js doShrineDonation).
    assert.match(read('public/game.js'), /if \(result\.classTsid === 'sparkly'\) engine\.featsIncrement\('donate_sparkly', result\.qty\);/);
  });
});

describe('G786: the site spends a donation from the ledger (LedgerSpend.php)', { skip: skipSite }, () => {
  it('takes sparkly, one class, under its own spend prefix', () => {
    const code = `foreach (['Economy', 'LedgerMath', 'LedgerSpend'] as $c) require ${JSON.stringify(SITE_DIR)} . "/src/$c.php";
      use Groddle\\Minn\\LedgerSpend;
      $g = fn (array $items, int $cur = 0) => ['items' => $items, 'currants' => $cur];
      echo json_encode([
        LedgerSpend::accepts('fdon-00000000000000a1', 'feat_donation', $g(['sparkly' => 189])),
        LedgerSpend::accepts('party-00000000000000a1', 'feat_donation', $g(['sparkly' => 189])),
        LedgerSpend::accepts('fdon-00000000000000a1', 'feat_donation', $g(['beryl' => 5])),
        LedgerSpend::accepts('fdon-00000000000000a1', 'feat_donation', $g(['sparkly' => 5, 'beryl' => 1])),
        LedgerSpend::accepts('fdon-00000000000000a1', 'feat_donation', $g(['sparkly' => 5], 3)),
        LedgerSpend::accepts('fdon-00000000000000a1', 'game_teleporter', $g([], 50)),
        LedgerSpend::accepts('gtele-00000000000000a1', 'game_teleporter', $g([], 50)),
      ]);`;
    assert.deepEqual(JSON.parse(execFileSync(PHP, ['-r', code]).toString()), [true, false, false, false, false, false, true]);
  });
});
