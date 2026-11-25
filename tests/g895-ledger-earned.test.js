/**
 * G895 (#432): what a save's own records say it earned is credited by the site's ledger outside
 * the earning budget (groddle-afternoon-site src/LedgerMath.php earned / markBaseline / check, run
 * through the php CLI on made-up fixture saves), so an honest pack is never corrected for it:
 * a shrine's emblems up to the emblems the shrine record gained, all of them (G1299: no daily count,
 * as Glitch), and Gameshow Tickets up to one a shrine donation, a few a day; a cracked Petrified Rock's pieces and beads up to what the
 * cracks could give, within the rocks the realtime server's Feat rewards handed out. A forged pile beyond the record (or a ticket's day's count) is still
 * taken back.
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

/** One LedgerMath call in PHP. */
function php(op, args) {
  const code = `
    foreach (['Economy', 'LedgerMath'] as $c) require ${JSON.stringify(SITE_DIR)} . "/src/$c.php";
    use Groddle\\Minn\\{Economy, LedgerMath};
    $in = json_decode(stream_get_contents(STDIN), true);
    $e = Economy::shared();
    $a = $in['args'];
    $out = match ($in['op']) {
      'check' => LedgerMath::check($a[0], $a[1], [], $a[2], (float) $a[3], 50000.0, $e, null, fn (): int => (int) ($a[4] ?? 0)),
      'baseline' => LedgerMath::markBaseline($a[0], (int) ($a[1] ?? 0)),
    };
    echo json_encode($out);`;
  const out = execFileSync(PHP, ['-r', code], { input: JSON.stringify({ op, args }) });
  return JSON.parse(String(out), (k, v) => (Array.isArray(v) && !v.length && ['items', 'made', 'runs', 'capped', 'detail', 'held'].includes(k) ? {} : v));
}

const constant = (name) => (skip ? 0 : Number(new RegExp(`const ${name} = (\\d+);`).exec(readFileSync(join(SITE_DIR, 'src/LedgerMath.php'), 'utf8'))?.[1]));
const TICKET_DAILY = constant('TICKET_DAILY');
const TICKET_WAIT = constant('TICKET_WAIT');

const counts = (items = {}, currants = 0) => ({ items, currants });

/** A multiplayer save's entries: the pack and the shrine record (js/shrines.js normalizeShrineState). */
function save({ inv = {}, emblems = {}, donations = 0, cracked = {} } = {}) {
  return {
    playerState: JSON.stringify({
      version: 7,
      inventory: inv,
      player: { currants: 0, xp: 5000, level: 5 },
      systems: { quests: { completed: [] }, achievements: { unlocked: [] }, shrines: { emblems, favor: {}, donations }, features: { artifacts: { version: 1, cracked, made: {} } } },
    }),
  };
}

/** Credited rows as Ledger::credited hands them over (daily kinds without the day). */
function creditedFrom(rows) {
  // The level the save shows is credited already (so no level-up pays currants into these writes).
  const out = { base: { base: 1 }, level: { level: 5 } };
  for (const [kind, ref, n] of rows) (out[kind] ||= {})[ref] = n;
  return out;
}

const rowsOf = (r, kind) => r.rows.filter((x) => x[0] === kind);

describe('G895: the ledger credits a shrine\'s emblems from the save\'s shrine record', { skip }, () => {
  it('marks the record the first time it is seen, without paying', () => {
    assert.deepEqual(php('baseline', [save({ emblems: { lem: 3, zille: 0 } })]), [['mark', 'base', 1], ['mark', 'base905', 1], ['mark', 'emblem:lem', 3]]);
  });

  it('an emblem the record gained stands with no budget at all, and moves the mark', () => {
    const credited = creditedFrom([['mark', 'base', 1], ['mark', 'emblem:lem', 3]]);
    const ledger = counts({ emblem_lem: 3 });
    const r = php('check', [ledger, credited, save({ inv: { emblem_lem: 4 }, emblems: { lem: 4 } }), 0]);
    assert.deepEqual(r.reconciled.clamped, counts());
    assert.deepEqual(r.after.items, { emblem_lem: 4 });
    assert.deepEqual(rowsOf(r, 'mark'), [['mark', 'emblem:lem', 4]]);
    assert.deepEqual(rowsOf(r, 'markday'), [], 'no day\'s count for emblems (G1299)');
    assert.deepEqual(r.credits.detail.earned, { emblem_lem: 1 });
  });

  it('a forged emblem the record does not show goes through the budget and is taken back', () => {
    const credited = creditedFrom([['mark', 'base', 1], ['mark', 'emblem:lem', 3]]);
    const r = php('check', [counts({ emblem_lem: 3 }), credited, save({ inv: { emblem_lem: 5 }, emblems: { lem: 3 } }), 0]);
    assert.deepEqual(r.reconciled.clamped, counts({ emblem_lem: 2 }));
    assert.deepEqual(rowsOf(r, 'mark'), []);
  });

  it('G1299: as many emblems as the record gained stand, with no daily count and none waiting', () => {
    // Glitch (items/emblem_alph.js) had no limit; only the record bounds them (a pile past it goes, above).
    const credited = creditedFrom([['mark', 'base', 1], ['markday', 'emblem', 4]]);
    const pile = 500;
    const r = php('check', [counts(), credited, save({ inv: { emblem_zille: pile, emblem_lem: 9 }, emblems: { zille: pile, lem: 9 } }), 0]);
    assert.deepEqual(r.after.items, { emblem_lem: 9, emblem_zille: pile });
    assert.deepEqual(r.held.items, {}, 'nothing waits');
    assert.deepEqual(r.reconciled.clamped, counts());
    assert.deepEqual(rowsOf(r, 'mark'), [['mark', 'emblem:lem', 9], ['mark', 'emblem:zille', pile]]);
    assert.deepEqual(rowsOf(r, 'markday'), []);
    assert.deepEqual(rowsOf(r, 'waitday'), []);
  });

  it('G1299: an emblem left waiting by the old daily count is credited by the next write, the same day', () => {
    // What a write before G1299 stored for a day of 2 claims past the count: the ledger holds one, the
    // mark keeps the other owed (record 2, mark 1), today's count was used and the wait remembered.
    const credited = creditedFrom([['mark', 'base', 1], ['mark', 'emblem:zille', 1], ['markday', 'emblem', 4], ['waitday', 'emblem_zille', 1]]);
    const r = php('check', [counts({ emblem_zille: 1 }), credited, save({ inv: { emblem_zille: 2 }, emblems: { zille: 2 } }), 0]);
    assert.deepEqual(r.after.items, { emblem_zille: 2 }, 'the waiting one is in the ledger now');
    assert.deepEqual(r.held.items, {});
    assert.deepEqual(r.reconciled.clamped, counts());
    assert.deepEqual(rowsOf(r, 'mark'), [['mark', 'emblem:zille', 2]]);
    assert.deepEqual(rowsOf(r, 'waitday'), [['waitday', 'emblem_zille', 0]], 'its wait is cleared, so a drop no longer says it waits');
  });

  it('an emblem spent in the write that earned it is not kept owed for a forged one later', () => {
    const credited = creditedFrom([['mark', 'base', 1], ['mark', 'emblem:lem', 2]]);
    const r = php('check', [counts({ emblem_lem: 2 }), credited, save({ inv: { emblem_lem: 2 }, emblems: { lem: 3 } }), 0]);
    assert.deepEqual(rowsOf(r, 'mark'), [['mark', 'emblem:lem', 3]]);
    assert.deepEqual(rowsOf(r, 'markday'), []);
  });
});

describe('G895: the ledger credits a Gameshow Ticket a shrine donation gave', { skip }, () => {
  it('a ticket stands with no budget when the shrine record counted a new donation', () => {
    const credited = creditedFrom([['mark', 'base', 1], ['mark', 'donations', 10]]);
    const r = php('check', [counts(), credited, save({ inv: { gameshow_ticket: 1 }, donations: 11 }), 0]);
    assert.deepEqual(r.reconciled.clamped, counts());
    assert.deepEqual(r.after.items, { gameshow_ticket: 1 });
    assert.deepEqual(rowsOf(r, 'mark'), [['mark', 'donations', 11]]);
    assert.deepEqual(rowsOf(r, 'markday'), [['markday', 'ticket', 1]]);
  });

  it('one ticket a donation at most: a second ticket from the same donation is not credited (G905: it waits as a drop\'s)', () => {
    const credited = creditedFrom([['mark', 'base', 1], ['mark', 'donations', 10]]);
    const r = php('check', [counts(), credited, save({ inv: { gameshow_ticket: 2 }, donations: 11 }), 0]);
    assert.deepEqual(r.after.items, { gameshow_ticket: 1 });
    assert.deepEqual(r.reconciled.held, { gameshow_ticket: 1 });
    assert.deepEqual(r.reconciled.clamped, counts());
  });

  it('a ticket with no new donation goes through the budget, as a drop-table ticket does (G905: waiting while it is short)', () => {
    const credited = creditedFrom([['mark', 'base', 1], ['mark', 'donations', 10]]);
    assert.deepEqual(php('check', [counts(), credited, save({ inv: { gameshow_ticket: 1 }, donations: 10 }), 0]).reconciled.held, { gameshow_ticket: 1 });
    assert.deepEqual(php('check', [counts(), credited, save({ inv: { gameshow_ticket: 1 }, donations: 10 }), 1000]).reconciled.clamped, counts());
  });

  it('donations that gave no ticket are not kept owed, and a forged pile stands only to the day\'s count', () => {
    const credited = creditedFrom([['mark', 'base', 1], ['mark', 'donations', 10]]);
    const quiet = php('check', [counts(), credited, save({ donations: 40 }), 0]);
    assert.deepEqual(rowsOf(quiet, 'mark'), [['mark', 'donations', 40]]);
    const forged = php('check', [counts(), creditedFrom([['mark', 'base', 1]]), save({ inv: { gameshow_ticket: 300 }, donations: 300 }), 0]);
    assert.deepEqual(forged.after.items, { gameshow_ticket: TICKET_DAILY });
    assert.deepEqual(forged.held.items, { gameshow_ticket: TICKET_WAIT });
    // G905: past the record, 3 more (3,000 of value) wait as a drop table's would; the rest go.
    assert.deepEqual(forged.reconciled.held, { gameshow_ticket: 3 });
    assert.deepEqual(forged.reconciled.clamped, counts({ gameshow_ticket: 300 - TICKET_DAILY - TICKET_WAIT - 3 }));
  });

  it('a donation that filled a Giant\'s favor gives its emblem and its ticket in one write, both credited', () => {
    const credited = creditedFrom([['mark', 'base', 1], ['mark', 'emblem:zille', 2], ['mark', 'donations', 50]]);
    const r = php('check', [counts({ emblem_zille: 2 }), credited, save({ inv: { emblem_zille: 3, gameshow_ticket: 1 }, emblems: { zille: 3 }, donations: 51 }), 0]);
    assert.deepEqual(r.reconciled.clamped, counts());
    assert.deepEqual(r.after.items, { emblem_zille: 3, gameshow_ticket: 1 });
  });
});

describe('G895: the ledger credits the pieces a cracked Petrified Rock gives', { skip }, () => {
  const CRACK_WAIT = constant('CRACK_WAIT');
  const ROCKS_BASE_MAX = constant('ROCKS_BASE_MAX');

  it('marks the cracks, the rocks held and the Feat rewards so far, without paying', () => {
    const rows = php('baseline', [save({ inv: { petrified_rock_small: 2, petrified_rock_large: 1 }, cracked: { petrified_rock_small: 5 } }), 3]);
    assert.deepEqual(rows, [['mark', 'base', 1], ['mark', 'base905', 1], ['mark', 'crackyield', 15], ['mark', 'rockyield', 15 + 3 * 4], ['mark', 'feats', 3]]);
    const many = php('baseline', [save({ inv: { petrified_rock_small: 500 } }), 0]);
    assert.deepEqual(many.find((r) => r[1] === 'rockyield'), ['mark', 'rockyield', ROCKS_BASE_MAX * 4], 'the rocks held count only so far');
  });

  it('a small rock\'s beads stand with no budget after a Feat reward gave the rock', () => {
    const credited = creditedFrom([['mark', 'base', 1], ['mark', 'crackyield', 6], ['mark', 'rockyield', 6], ['mark', 'feats', 2]]);
    const r = php('check', [counts(), credited, save({ inv: { artifact_necklace_redtigereye_piece: 3 }, cracked: { petrified_rock_small: 3 } }), 0, 3]);
    assert.deepEqual(r.reconciled.clamped, counts());
    assert.deepEqual(r.after.items, { artifact_necklace_redtigereye_piece: 3 });
    assert.deepEqual(rowsOf(r, 'mark'), [['mark', 'crackyield', 9]]);
    assert.deepEqual(rowsOf(r, 'cap'), [['cap', 'artifact_necklace_redtigereye_piece', 3]], 'they count toward the class\'s daily cap');
  });

  it('no more than a crack can give: a fourth bead from one small rock is left to the budget', () => {
    const credited = creditedFrom([['mark', 'base', 1], ['mark', 'crackyield', 6], ['mark', 'rockyield', 6], ['mark', 'feats', 2]]);
    const r = php('check', [counts(), credited, save({ inv: { artifact_necklace_onyx_piece: 4 }, cracked: { petrified_rock_small: 3 } }), 0, 3]);
    assert.deepEqual(r.after.items, { artifact_necklace_onyx_piece: 3 });
    assert.deepEqual(r.reconciled.delta.items, {}, 'the budget pays nothing for the fourth');
    assert.deepEqual(r.reconciled.held, { artifact_necklace_onyx_piece: 1 }, 'a capped drop the budget is short for waits outside the ledger');
  });

  it('a forged crack count with no Feat reward behind it credits nothing', () => {
    const credited = creditedFrom([['mark', 'base', 1], ['mark', 'crackyield', 6], ['mark', 'rockyield', 6], ['mark', 'feats', 2]]);
    const r = php('check', [counts(), credited, save({ inv: { artifact_necklace_onyx_piece: 9 }, cracked: { petrified_rock_small: 50 } }), 0, 2]);
    assert.deepEqual(r.after.items, {});
    assert.deepEqual(rowsOf(r, 'mark'), []);
    assert.equal(r.reconciled.clamped.items.artifact_necklace_onyx_piece, 9 - Object.values(r.reconciled.held).reduce((a, b) => a + b, 0));
  });

  it('a forged pile stands at most to the class\'s daily cap, a few more waiting, whatever the rewards', () => {
    const credited = creditedFrom([['mark', 'base', 1], ['cap', 'artifact_necklace_onyx_piece', 10]]);
    const r = php('check', [counts(), credited, save({ inv: { artifact_necklace_onyx_piece: 400 }, cracked: { petrified_rock_large: 400 } }), 0, 1000]);
    assert.deepEqual(r.after.items, { artifact_necklace_onyx_piece: 5 }, 'the cap of 15 a day, 10 already counted');
    assert.deepEqual(r.held.items, { artifact_necklace_onyx_piece: CRACK_WAIT });
    assert.deepEqual(r.reconciled.clamped, counts({ artifact_necklace_onyx_piece: 400 - 5 - CRACK_WAIT }));
    assert.deepEqual(rowsOf(r, 'cap'), [['cap', 'artifact_necklace_onyx_piece', 15]]);
  });

  it('a medium rock\'s two artifact pieces stand, of different artifacts', () => {
    const credited = creditedFrom([['mark', 'base', 1], ['mark', 'feats', 4]]);
    const r = php('check', [counts(), credited, save({ inv: { artifact_chicken_brick_piece2: 1, artifact_wooden_apple_piece1: 1 }, cracked: { petrified_rock_medium: 1 } }), 0, 5]);
    assert.deepEqual(r.reconciled.clamped, counts());
    assert.deepEqual(r.after.items, { artifact_chicken_brick_piece2: 1, artifact_wooden_apple_piece1: 1 });
  });
});

describe('G895: a capped drop the budget cannot pay yet waits instead of being taken', { skip }, () => {
  const HOLD = skip ? 0 : Number(/CAPPED_HOLD_VALUE = ([\d.]+);/.exec(readFileSync(join(SITE_DIR, 'src/LedgerMath.php'), 'utf8'))?.[1]);
  const ECON = skip ? null : JSON.parse(readFileSync(join(SITE_DIR, 'data/economy.json'), 'utf8'));

  it('a Musicblock found while the budget is low stays in the pack, outside the ledger', () => {
    const r = php('check', [counts(), creditedFrom([['mark', 'base', 1]]), save({ inv: { musicblock_d_green_04: 1 } }), 145]);
    assert.deepEqual(r.reconciled.clamped, counts());
    assert.deepEqual(r.reconciled.held, { musicblock_d_green_04: 1 });
    assert.deepEqual(r.after.items, {}, 'the ledger does not hold it yet, so it cannot be traded on');
    assert.deepEqual(r.rows.filter((x) => x[0] === 'cap'), [], 'nor does it use the day\'s cap');
    // A later write with budget enough pays for it.
    const later = php('check', [counts(), creditedFrom([['mark', 'base', 1]]), save({ inv: { musicblock_d_green_04: 1 } }), 600]);
    assert.deepEqual(later.after.items, { musicblock_d_green_04: 1 });
    assert.deepEqual(later.rows.filter((x) => x[0] === 'cap'), [['cap', 'musicblock_d_green_04', 1]]);
  });

  it('only within the class\'s cap and the hold\'s value: a forged pile of drops is still taken back', () => {
    const cap = ECON.items.musicblock_d_blue_03.cap;
    const v = ECON.items.musicblock_d_blue_03.v;
    const r = php('check', [counts(), creditedFrom([['mark', 'base', 1]]), save({ inv: { musicblock_d_blue_03: 200, musicblock_d_red_03: 200 } }), 0]);
    const held = Object.values(r.reconciled.held).reduce((a, b) => a + b, 0);
    assert.ok(held <= 2 * cap && held * v <= HOLD, `held ${held}`);
    assert.equal(r.reconciled.clamped.items.musicblock_d_blue_03 + r.reconciled.clamped.items.musicblock_d_red_03, 400 - held);
    const over = php('check', [counts(), creditedFrom([['mark', 'base', 1], ['cap', 'musicblock_d_blue_03', cap]]), save({ inv: { musicblock_d_blue_03: 1 } }), 0]);
    assert.deepEqual(over.reconciled.held, {}, 'a class past its cap today waits for nothing');
    assert.deepEqual(over.reconciled.clamped, counts({ musicblock_d_blue_03: 1 }));
  });

  it('an ordinary gain the budget cannot pay is still taken back (it is not a drop)', () => {
    const r = php('check', [counts(), creditedFrom([['mark', 'base', 1]]), save({ inv: { potato: 54 } }), 0]);
    assert.deepEqual(r.reconciled.held, {});
    assert.deepEqual(r.reconciled.clamped, counts({ potato: 54 }));
  });
});
