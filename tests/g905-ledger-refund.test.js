/**
 * G905 (#436, #438, #439): the refund for what the save checker took back of the kinds G905 now
 * credits or lets wait (groddle-afternoon-site src/LedgerRefund.php owedG905, paidG895 and run with
 * ref g905; bin/ledger-refund.php ref=g905 runs it on the site). owedG905 runs through the php CLI on
 * made-up clamp rows shaped like the live extract (four characters: a Musicblock collector G895
 * already refunded, a machine room worker, a gardener, a new player); run goes through
 * tests/fixtures/ledger-refund/run-harness.php for its dry run and its apply. Rows G895's refund or
 * Austin's g895-hand refund paid are never paid twice.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SITE_DIR, skipWithoutSite } from '../tools/repos.mjs';
import { HAS_PHP, PHP } from './php.js';

const hasPhp = HAS_PHP;
const skip = skipWithoutSite || !hasPhp;
const HARNESS = join(import.meta.dirname, 'fixtures/ledger-refund/run-harness.php');

function owed(rows, paid = {}) {
  const code = `
    foreach (['Economy', 'LedgerMath', 'Ledger', 'LedgerMail', 'LedgerRefund'] as $c) require ${JSON.stringify(SITE_DIR)} . "/src/$c.php";
    use Groddle\\Minn\\{Economy, LedgerRefund};
    $in = json_decode(stream_get_contents(STDIN), true);
    $paid = [];
    foreach ($in['paid'] as $u => $refs) $paid[(int) $u] = $refs;
    echo json_encode(LedgerRefund::owedG905($in['rows'], Economy::shared(), LedgerRefund::G905_FROM, $paid));`;
  return JSON.parse(String(execFileSync(PHP, ['-r', code], { input: JSON.stringify({ rows, paid }) })));
}

function run(input) {
  return JSON.parse(String(execFileSync(PHP, [HARNESS], { input: JSON.stringify({ site: SITE_DIR, names: {}, credited: [], ...input }) })));
}

let id = 0;
const clamp = (user, at, items, last = null) => ({ id: ++id, user_id: user, at, kind: 'clamp', detail: JSON.stringify({ clamped: { items, currants: 0 }, budget: 100, kept: 0, made: {}, ...(last ? { repeats: 1, last: { clamped: { items: last, currants: 0 } } } : {}) }) });

/** Made-up rows shaped like the extract: characters 7 to 10, no real ids, names or counts. */
const LOG = [
  // 7: Musicblocks; G895 refunded at 18:10 (its capped ones before that), Austin's hand refund the potatoes at 18:20.
  clamp(7, '2026-11-16 16:53:15', { musicblock_d_green_04: 1 }),
  clamp(7, '2026-11-16 17:06:34', { potato: 5 }, { potato: 54 }),
  clamp(7, '2026-11-16 17:12:26', { musicblock_b_brown_05: 1 }, { musicblock_d_blue_03: 1 }),
  clamp(7, '2026-11-16 17:56:33', { dullite: 5 }),
  clamp(7, '2026-11-16 18:37:12', { musicblock_x_shiny_04: 1 }),
  clamp(7, '2026-11-16 18:44:32', { musicblock_d_blue_05: 1 }),
  // 8: a machine room worker who also shook a pouch and mined gems.
  // A Gameshow Ticket dropped while mining a Metal Rock (#438).
  clamp(8, '2026-11-16 18:45:37', { gameshow_ticket: 1 }),
  clamp(8, '2026-11-16 19:05:50', { grade_aa_earth_block: 4 }, { girder: 1 }),
  clamp(8, '2026-11-16 19:08:42', { element_blue: 406, element_shiny: 550 }),
  clamp(8, '2026-11-16 19:22:16', { gem_ruby: 1 }),
  clamp(8, '2026-11-16 19:25:33', { wood_post: 4 }, { beam: 1 }),
  clamp(8, '2026-11-16 19:31:45', { board: 5, plank: 167 }),
  clamp(8, '2026-11-16 20:04:58', { gem_diamond: 1 }, { plain_metal: 1 }),
  // 9: a gardener; the Funpickle's Musicblock twice.
  clamp(9, '2026-11-16 18:53:51', { cucumber: 56 }, { parsnip: 4 }),
  clamp(9, '2026-11-16 18:54:52', { parsnip: 12 }, { corn: 12 }),
  clamp(9, '2026-11-16 19:09:30', { musicblock_goodnight_groddle: 1 }),
  clamp(9, '2026-11-16 19:11:31', { plank: 70 }),
  clamp(9, '2026-11-16 19:15:31', { musicblock_goodnight_groddle: 1 }, { element_blue: 372 }),
  // 10: a new player in the tutorial and on the practice streets.
  clamp(10, '2026-11-16 20:11:53', { musicblock_x_shiny_04: 1 }),
  clamp(10, '2026-11-16 20:13:08', { cherry: 1 }, { cherry: 3 }),
  clamp(10, '2026-11-16 20:14:09', { apple: 1, bean_plain: 3 }, { apple: 1 }),
  clamp(10, '2026-11-16 20:22:17', { meat: 2 }, { apple: 1 }),
  clamp(10, '2026-11-16 20:25:50', { butterfly_lotion: 1 }, { milk_butterfly: 2 }),
  clamp(10, '2026-11-16 20:27:21', { knife_and_board: 1 }, { meat: 5 }),
  clamp(10, '2026-11-16 20:45:31', { hoe: 1 }, { shovel: 1 }),
  // Before the deploy: not this refund's.
  clamp(8, '2026-11-16 12:00:00', { girder: 3 }),
];
const PAID = { 7: { g895: '2026-11-16 18:10:00', 'g895-hand': '2026-11-16 18:20:00' } };
const CREDITED = [[7, 'refund', 'g895', 9, '2026-11-16 18:10:00'], [7, 'refund', 'g895-hand', 99, '2026-11-16 18:20:00']];

const EXPECTED = {
  7: { musicblock_b_brown_05: 1, musicblock_d_blue_05: 1, musicblock_x_shiny_04: 1 },
  8: { beam: 1, board: 5, element_blue: 406, element_shiny: 550, gameshow_ticket: 1, gem_diamond: 1, gem_ruby: 1, girder: 1, grade_aa_earth_block: 4, wood_post: 4 },
  9: { corn: 12, cucumber: 56, element_blue: 372, musicblock_goodnight_groddle: 1, parsnip: 16 },
  10: { bean_plain: 3, butterfly_lotion: 1, cherry: 4, hoe: 1, knife_and_board: 1, meat: 7, milk_butterfly: 2, musicblock_x_shiny_04: 1, shovel: 1 },
};

describe('G905 refund: owedG905', { skip }, () => {
  it('a day shaped like the extract owes the machine output, crops, elements, tutorial gifts and rare finds', () => {
    const out = owed(LOG, PAID);
    assert.deepEqual(Object.fromEntries(out.map((o) => [o.user, o.items])), EXPECTED);
    assert.ok(out.every((o) => o.currants === 0 && o.days.every((d) => d.day === '2026-11-16')));
  });

  it('never pays twice what G895 or the hand refund paid; without those marks the same rows are owed', () => {
    const unpaid = owed(LOG.filter((r) => r.user_id === 7), {});
    assert.deepEqual(unpaid[0].items, { musicblock_b_brown_05: 1, musicblock_d_blue_03: 1, musicblock_d_blue_05: 1, musicblock_d_green_04: 1, musicblock_x_shiny_04: 1, potato: 59 });
    // A capped Musicblock or a ticket clamped after G895's refund ran is G905's to pay; one before it, never.
    const later = owed([clamp(7, '2026-11-16 19:00:00', { musicblock_d_green_04: 1, potato: 3, gameshow_ticket: 1 })], PAID);
    assert.deepEqual(later[0].items, { gameshow_ticket: 1, musicblock_d_green_04: 1, potato: 3 });
    assert.deepEqual(owed([clamp(7, '2026-11-16 17:11:09', { gameshow_ticket: 1 })], PAID), []);
  });

  it('planks, apples, Plain Metal and chunks are not in it: no rule credits them', () => {
    const out = Object.fromEntries(owed(LOG, PAID).map((o) => [o.user, o.items]));
    for (const items of Object.values(out)) for (const c of ['plank', 'apple', 'plain_metal', 'dullite']) assert.equal(items[c], undefined, c);
  });

  it('a forged pile is owed only to the fixed counts', () => {
    const src = readFileSync(join(SITE_DIR, 'src/LedgerRefund.php'), 'utf8');
    const day = (name) => Number(new RegExp(`const ${name} = (\\d+);`).exec(src)[1]);
    const ECON = JSON.parse(readFileSync(join(SITE_DIR, 'data/economy.json'), 'utf8'));
    const out = owed([
      clamp(11, '2026-11-16 18:00:00', { girder: 300, gem_diamond: 300, hoe: 300, element_red: 99999, gameshow_ticket: 300 }),
      clamp(11, '2026-11-17 01:00:00', { girder: 300, hoe: 300 }),
    ])[0];
    const girders = Math.floor(day('G905_TIMED_DAY') / ECON.items.girder.v);
    assert.equal(out.items.girder, 2 * girders, 'a day\'s timed value, each day');
    assert.equal(out.items.gem_diamond, Math.floor(day('G905_DROP_DAY') / ECON.items.gem_diamond.v));
    assert.equal(out.items.hoe, 1, 'a tutorial gift once ever');
    assert.equal(out.items.element_red, 7 * 600, 'SHAKE_DAILY shakes of a full pouch');
    assert.equal(out.items.gameshow_ticket, ECON.items.gameshow_ticket.dcap, 'a drop ticket\'s day');
  });
});

describe('G905 refund: run', { skip }, () => {
  it('the dry run lists what it would send per character and sends nothing', () => {
    const out = run({ log: LOG, credited: CREDITED, calls: [{ apply: false, ref: 'g905' }] });
    const [res] = out.results;
    assert.equal(res.apply, false);
    assert.equal(res.letters, 0);
    assert.deepEqual(out.mail, []);
    assert.deepEqual(Object.fromEntries(res.players.map((p) => [p.user, p.items])), EXPECTED);
    for (const p of res.players) assert.equal(p.letters, Object.keys(EXPECTED[p.user]).length);
  });

  it('apply mails each class once and marks each character; again sends nothing; G895\'s marks stay its own', () => {
    const out = run({ log: LOG, credited: CREDITED, calls: [{ apply: true, ref: 'g905' }, { apply: true, ref: 'g905' }] });
    const [first, second] = out.results;
    const letters = Object.values(EXPECTED).reduce((n, items) => n + Object.keys(items).length, 0);
    assert.equal(first.letters, letters);
    assert.equal(second.letters, 0);
    assert.ok(second.players.every((p) => p.before === true));
    const text = /TEXT_G905 = '([^']*)'/.exec(readFileSync(join(SITE_DIR, 'src/LedgerRefund.php'), 'utf8'))[1];
    assert.ok(out.mail.every((m) => m.text === text && m.currants === 0));
    assert.deepEqual(out.credited.filter((r) => r[2] === 'g905').map((r) => r[0]).sort((a, b) => a - b), [7, 8, 9, 10]);
    assert.equal(out.refundRows.length, 4);
  });

  it('the letter is short, plain, with no em-dash, the mailbox titles it and the script documents it', () => {
    const text = /TEXT_G905 = '([^']*)'/.exec(readFileSync(join(SITE_DIR, 'src/LedgerRefund.php'), 'utf8'))[1];
    assert.ok(text.length <= 300 && !text.includes(String.fromCharCode(0x2014)) && !text.includes(String.fromCharCode(0x2013)));
    assert.match(readFileSync(join(SITE_DIR, 'src/LedgerMail.php'), 'utf8'), /LedgerRefund::TEXT_G905 => LedgerRefund::SUBJECT/);
    assert.match(readFileSync(join(SITE_DIR, 'bin/ledger-refund.php'), 'utf8'), /ref=g905/);
  });
});
