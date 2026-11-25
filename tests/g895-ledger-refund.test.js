/**
 * G895 (#432): the refund for what the save checker took back from earned gains before the fix
 * (groddle-afternoon-site src/LedgerRefund.php owedG895 and run with ref g895; bin/ledger-refund.php
 * ref=g895 runs it on the site). owedG895 runs through the php CLI on made-up clamp rows; run goes
 * through tests/fixtures/ledger-refund/run-harness.php, an in-memory stand-in for the database, for
 * its dry run (lists, sends nothing) and its apply (mails once, marks the character, logs a row).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SITE_DIR, skipWithoutSite } from '../tools/repos.mjs';

const hasPhp = spawnSync('php', ['-v']).status === 0;
const skip = skipWithoutSite || !hasPhp;
const HARNESS = join(import.meta.dirname, 'fixtures/ledger-refund/run-harness.php');

function owed(rows, from = null) {
  const code = `
    foreach (['Economy', 'LedgerMath', 'Ledger', 'LedgerMail', 'LedgerRefund'] as $c) require ${JSON.stringify(SITE_DIR)} . "/src/$c.php";
    use Groddle\\Minn\\{Economy, LedgerRefund};
    $in = json_decode(stream_get_contents(STDIN), true);
    echo json_encode($in['from'] === null ? LedgerRefund::owedG895($in['rows'], Economy::shared()) : LedgerRefund::owedG895($in['rows'], Economy::shared(), $in['from']));`;
  return JSON.parse(String(execFileSync('php', ['-r', code], { input: JSON.stringify({ rows, from }) })));
}

function run(input) {
  return JSON.parse(String(execFileSync('php', [HARNESS], { input: JSON.stringify({ site: SITE_DIR, names: {}, credited: [], ...input }) })));
}

const clamp = (id, at, items, extra = {}, user = 7) => ({ id, user_id: user, at, kind: 'clamp', detail: JSON.stringify({ clamped: { items, currants: 0 }, budget: 100, kept: 0, made: {}, ...extra }) });

/** Made-up clamp rows shaped like #432's: six rows after the deploy, two with a later write folded in. */
const DAY = [
  clamp(11, '2026-11-16 16:31:20', { artifact_necklace_onyx_piece: 1, artifact_necklace_redtigereye_piece: 3 }),
  clamp(12, '2026-11-16 16:50:10', { emblem_lem: 1 }),
  clamp(13, '2026-11-16 16:53:15', { musicblock_d_green_04: 1 }),
  clamp(14, '2026-11-16 16:57:21', { musicblock_d_red_03: 1 }, { repeats: 1, last: { clamped: { items: { emblem_zille: 1, gameshow_ticket: 1 }, currants: 0 } } }),
  clamp(15, '2026-11-16 17:04:32', { musicblock_d_blue_03: 1 }),
  clamp(16, '2026-11-16 17:06:34', { potato: 5 }, { repeats: 1, last: { clamped: { items: { potato: 54 }, currants: 0 } } }),
  // Before the deploy: not this refund's.
  clamp(10, '2026-11-16 12:00:00', { emblem_mab: 1 }),
  // Another character's ordinary gain only: nothing owed.
  clamp(17, '2026-11-16 17:00:00', { cherry: 40 }, {}, 8),
];

const EXPECTED = {
  artifact_necklace_onyx_piece: 1,
  artifact_necklace_redtigereye_piece: 3,
  emblem_lem: 1,
  emblem_zille: 1,
  gameshow_ticket: 1,
  musicblock_d_blue_03: 1,
  musicblock_d_green_04: 1,
  musicblock_d_red_03: 1,
};

describe('G895 refund: owedG895', { skip }, () => {
  it('a day shaped like #432 owes the emblems, ticket, beads and Musicblocks, never the potatoes', () => {
    const out = owed(DAY);
    assert.equal(out.length, 1, 'only the character with earned kinds is owed');
    assert.equal(out[0].user, 7);
    assert.deepEqual(out[0].items, EXPECTED);
    assert.equal(out[0].currants, 0);
    assert.ok(out[0].days.every((d) => d.day === '2026-11-16'));
  });

  it('reads a folded row\'s "last" only when writes were folded into it, and starts where it is told', () => {
    const rows = [clamp(1, '2026-11-16 18:00:00', { emblem_lem: 1 }, { last: { clamped: { items: { emblem_pot: 1 } } } })];
    assert.deepEqual(owed(rows)[0].items, { emblem_lem: 1 }, 'repeats 0: last is not a separate write');
    assert.deepEqual(owed(DAY, '2026-11-16 17:00:00')[0].items, { musicblock_d_blue_03: 1 });
    assert.deepEqual(owed(DAY, '2026-11-16 11:00:00')[0].items.emblem_mab, 1);
  });

  it('a forged pile is owed only to the fixed rules\' counts a day', () => {
    const rows = [
      clamp(1, '2026-11-16 18:00:00', { emblem_lem: 300, gameshow_ticket: 300, musicblock_d_blue_03: 300, artifact_necklace_onyx_piece: 300 }),
      clamp(2, '2026-11-17 01:00:00', { emblem_zille: 300 }),
    ];
    const ECON = JSON.parse(readFileSync(join(SITE_DIR, 'data/economy.json'), 'utf8'));
    const src = readFileSync(join(SITE_DIR, 'src/LedgerMath.php'), 'utf8');
    const n = (name) => Number(new RegExp(`const ${name} = (\\d+);`).exec(src)[1]);
    // G1299 took the emblem count out of LedgerMath; the refund keeps the G895 fix's own (G895_EMBLEM_DAY).
    const emblemDay = Number(/const G895_EMBLEM_DAY = (\d+);/.exec(readFileSync(join(SITE_DIR, 'src/LedgerRefund.php'), 'utf8'))[1]);
    assert.equal(emblemDay, 4);
    assert.deepEqual(owed(rows)[0].items, {
      artifact_necklace_onyx_piece: ECON.items.artifact_necklace_onyx_piece.cap,
      emblem_lem: emblemDay,
      emblem_zille: emblemDay,
      gameshow_ticket: n('TICKET_DAILY'),
      musicblock_d_blue_03: ECON.items.musicblock_d_blue_03.cap,
    });
  });
});

describe('G895 refund: run', { skip }, () => {
  it('the dry run lists what it would send per character and sends nothing', () => {
    const out = run({ log: DAY, names: { 7: 'Testy McTest' }, calls: [{ apply: false, ref: 'g895' }] });
    const [res] = out.results;
    assert.equal(res.apply, false);
    assert.equal(res.ref, 'g895');
    assert.equal(res.letters, 0, 'nothing sent');
    assert.deepEqual(out.mail, []);
    assert.equal(out.credited.length, 0);
    assert.equal(res.players.length, 1);
    const p = res.players[0];
    assert.equal(p.name, 'Testy McTest');
    assert.deepEqual(p.items, EXPECTED);
    assert.equal(p.letters, Object.keys(EXPECTED).length, 'one letter a class');
    assert.equal(p.before, false);
    assert.equal(p.paid, false);
  });

  it('apply mails each class once with the plain letter, marks the character and logs a refund row; again sends nothing', () => {
    const out = run({ log: DAY, calls: [{ apply: true, ref: 'g895' }, { apply: true, ref: 'g895' }, { apply: false, ref: 'defer246' }] });
    const [first, second, other] = out.results;
    assert.equal(first.letters, Object.keys(EXPECTED).length);
    assert.equal(second.letters, 0);
    assert.equal(second.players[0].before, true, 'never paid twice');
    const text = /TEXT_G895 = '([^']*)'/.exec(readFileSync(join(SITE_DIR, 'src/LedgerRefund.php'), 'utf8'))[1];
    assert.ok(out.mail.every((m) => m.to === 7 && m.text === text && m.currants === 0));
    assert.deepEqual(Object.fromEntries(out.mail.map((m) => [m.class, m.count])), EXPECTED);
    assert.deepEqual(out.credited, [[7, 'refund', 'g895', 10]]);
    assert.equal(out.refundRows.length, 1);
    assert.equal(JSON.parse(out.refundRows[0].detail).ref, 'g895');
    assert.deepEqual(other.players, [], '#246\'s refund is its own: these rows owe it nothing');
  });

  it('the letter is short, plain, with no em-dash, and the mailbox titles it', () => {
    const src = readFileSync(join(SITE_DIR, 'src/LedgerRefund.php'), 'utf8');
    const text = /TEXT_G895 = '([^']*)'/.exec(src)[1];
    assert.ok(text.length <= 300 && !text.includes(String.fromCharCode(0x2014)) && !text.includes(String.fromCharCode(0x2013)));
    assert.match(readFileSync(join(SITE_DIR, 'src/LedgerMail.php'), 'utf8'), /LedgerRefund::TEXT_G895 => LedgerRefund::SUBJECT/);
    assert.match(readFileSync(join(SITE_DIR, 'bin/ledger-refund.php'), 'utf8'), /ref=g895/);
  });
});
