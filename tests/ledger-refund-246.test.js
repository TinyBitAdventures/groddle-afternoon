/**
 * Report #246: the refund helper for what the save ledger took back from a level-up or a card
 * purchase put off to a later day (groddle-afternoon-site src/LedgerRefund.php owed and letters,
 * run through the php CLI on fixture log rows; bin/ledger-refund.php runs it on the site).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SITE_DIR, skipWithoutSite } from '../tools/repos.mjs';

const hasPhp = spawnSync('php', ['-v']).status === 0;
const skip = skipWithoutSite || !hasPhp;

function php(op, args) {
  const code = `
    foreach (['Economy', 'LedgerMath', 'Ledger', 'LedgerMail', 'LedgerRefund'] as $c) require ${JSON.stringify(SITE_DIR)} . "/src/$c.php";
    use Groddle\\Minn\\{Economy, LedgerRefund};
    $in = json_decode(stream_get_contents(STDIN), true);
    $a = $in['args'];
    echo json_encode(match ($in['op']) {
      'owed' => LedgerRefund::owed($a[0], Economy::shared()),
      'letters' => LedgerRefund::letters($a[0], $a[1]),
    });`;
  return JSON.parse(String(execFileSync('php', ['-r', code], { input: JSON.stringify({ op, args }) })));
}

const row = (id, at, kind, detail, user = 7) => ({ id, user_id: user, at, kind, detail: JSON.stringify(detail) });

describe('LedgerRefund (report #246)', { skip }, () => {
  it('finds a put-off paying level and what the same write clamped, once a level', () => {
    const rows = [
      row(1, '2026-11-10 20:00:00', 'credit', { later: { level: 27 } }),
      row(2, '2026-11-10 21:00:00', 'credit', { later: { level: 35 } }),
      row(3, '2026-11-10 21:00:00', 'clamp', { clamped: { items: {}, currants: 56_855 }, budget: 5005 }),
      row(4, '2026-11-10 21:00:30', 'credit', { later: { level: 35 } }),
      row(5, '2026-11-10 23:00:00', 'clamp', { clamped: { items: {}, currants: 999 } }),
    ];
    const [p] = php('owed', [rows]);
    assert.equal(p.user, 7);
    assert.equal(p.currants, 56_855, 'level 27 pays nothing; the unrelated clamp later that day is not counted');
    assert.deepEqual(p.levels, [{ level: 35, at: '2026-11-10 21:00:00', pays: 61_860, clamped: 56_855 }]);
  });

  it('reads a clamp folded into an earlier row by its "last", and never refunds more than the level pays', () => {
    const rows = [
      row(1, '2026-11-10 21:00:00', 'clamp', { clamped: { items: {}, currants: 5 }, repeats: 1, last: { clamped: { items: {}, currants: 90_000 } } }),
      row(2, '2026-11-10 21:00:40', 'credit', { later: { level: 35 } }),
    ];
    assert.equal(php('owed', [rows])[0].currants, 61_860);
  });

  it('lists a repeatable card\'s clamped items, at most CARD_WAIT a class a day, and nothing else', () => {
    const rows = [
      row(1, '2026-11-11 09:00:00', 'clamp', { clamped: { items: { paradise_ticket_beam_me_down: 1, apple: 4 }, currants: 0 } }),
      row(2, '2026-11-12 09:00:00', 'clamp', { clamped: { items: { paradise_ticket_beam_me_down: 47 }, currants: 0 } }),
      row(3, '2026-11-12 09:00:00', 'clamp', { clamped: { items: { apple: 4 }, currants: 0 } }, 8),
    ];
    const out = php('owed', [rows]);
    assert.equal(out.length, 1, 'a clamp with no card item is no refund');
    assert.deepEqual(out[0].items, { paradise_ticket_beam_me_down: 31 });
    assert.equal(out[0].currants, 0);
  });

  it('splits a refund into letters the mail can carry', () => {
    assert.deepEqual(php('letters', [1_200_000, { paradise_ticket_beam_me_down: 2 }]), [
      { class: '', count: 0, currants: 999_999 },
      { class: '', count: 0, currants: 200_001 },
      { class: 'paradise_ticket_beam_me_down', count: 2, currants: 0 },
    ]);
  });

  it('the letter is short, plain and has its mailbox subject', () => {
    const src = readFileSync(join(SITE_DIR, 'src/LedgerRefund.php'), 'utf8');
    const text = /public const TEXT = '([^']*)'/.exec(src)[1];
    assert.ok(text.length <= 300 && !text.includes(String.fromCharCode(0x2014)));
    assert.match(readFileSync(join(SITE_DIR, 'src/LedgerMail.php'), 'utf8'), /LedgerRefund::TEXT => LedgerRefund::SUBJECT/);
  });
});
