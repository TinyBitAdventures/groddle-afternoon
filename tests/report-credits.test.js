/**
 * REPORT CREDITS (Austin 2026-11-03): points for the players whose bug reports
 * led to a change, and the Contribute page's "Thank you, testers" board of the
 * top ten. The site (groddle-afternoon-site, skipped without it): minn.json's
 * groddle_report_credits table, src/ReportCredits.php (the rubric, the board's
 * order), src/AdminReportCredits.php (the console's admin routes),
 * src/ContributeCredits.php (the board, blocks/contribute-credits) and the
 * console's Credit box and Credits tab. The game: tools/reports/credits.mjs
 * (the scoring agent's read, check and apply) and tools/contribute/to-minn.mjs
 * (the testers band on the Contribute page).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { HAS_SITE, SITE_DIR, sitePath, skipWithoutSite } from '../tools/repos.mjs';
import { CAP, EXCLUDED, KINDS, citedTickets, cookieHeader, isLocal, pointsFor, proposalProblems, proposalsMarkdown, rank, readAllTickets, totalsFrom } from '../tools/reports/credits.mjs';
import { BANDS, THANKS_LEAD, contributeContent, thanksBand, withCredits } from '../tools/contribute/to-minn.mjs';

const root = join(import.meta.dirname, '..');
const hasPhp = spawnSync('php', ['-v']).status === 0;
const engine = process.env.MINN_ENGINE_DIR || join(homedir(), 'Cove/Sites/minn-engine.localhost/public/minn');
const noEngine = !existsSync(join(engine, 'src/Minn/Autoloader.php')) && 'Minn Engine not found (set MINN_ENGINE_DIR)';
const src = (p) => readFileSync(sitePath(p), 'utf8');

/** Totals with every tie the board breaks, and the players it leaves off. */
const TOTALS = [
  { id: 5, points: 6, reports: 2, first: '2026-11-02 00:00:00' },
  { id: 6, points: 6, reports: 3, first: '2026-11-03 00:00:00' },
  { id: 7, points: 6, reports: 2, first: '2026-11-01 00:00:00' },
  { id: 1, points: 99, reports: 9, first: '2026-10-01 00:00:00' },
  { id: 54, points: 50, reports: 9, first: '2026-10-01 00:00:00' },
  { id: 8, points: 40, reports: 9, first: '2026-10-01 00:00:00', banned: true },
  { id: 9, points: 0, reports: 0, first: null },
  { id: 3, points: 6, reports: 2, first: '2026-11-01 00:00:00' },
  ...Array.from({ length: 9 }, (_, i) => ({ id: 100 + i, points: 1, reports: 1, first: `2026-11-0${(i % 3) + 1} 00:00:00` })),
];
// More points, then more reports, then the earliest first report, then the lower id; 1, 54, the banned 8 and the pointless 9 are left off.
const ORDER = [6, 3, 7, 5, 100, 103, 106, 101, 104, 107];

const proposal = (over = {}) => ({ ticket: 12, player: { id: 500, name: 'mr granberry' }, status: 'closed', subject: 'Picks', createdAt: '2026-10-31T20:50:08Z', kind: 'bug_fixed', points: 4, items: ['revives', 'picks'], reason: 'Two real bugs, fixed.', refs: ['game 3cfc9a44d', 'game v0.8.0'], ...over });

describe('the scoring rules (tools/reports/credits.mjs)', () => {
  it('scores a report by its best change, plus 1 for each other, up to 8', () => {
    assert.deepEqual(KINDS, { safety_fix: 5, bug_fixed: 3, improvement_shipped: 2, partial_or_clue: 1, none: 0 });
    assert.equal(CAP, 8);
    assert.equal(pointsFor('bug_fixed'), 3);
    assert.equal(pointsFor('bug_fixed', 1), 4);
    assert.equal(pointsFor('improvement_shipped', 2), 4);
    assert.equal(pointsFor('safety_fix', 6), 8, 'capped');
    assert.equal(pointsFor('none', 4), 0);
    assert.equal(pointsFor('partial_or_clue', -2), 1);
    assert.throws(() => pointsFor('great'));
  });

  it('checks each proposal: the kind, the arithmetic, a short kind reason, refs, and never Austin\'s accounts', () => {
    assert.deepEqual(proposalProblems(proposal()), []);
    assert.deepEqual(proposalProblems(proposal({ kind: 'none', points: 0, items: [], refs: [], reason: 'Thanks: this is how Glitch worked.' })), []);
    const one = (over) => proposalProblems(proposal(over)).join('; ');
    assert.match(one({ points: 5 }), /not bug_fixed \+ 1 extra \(4\)/);
    assert.match(one({ points: 9, items: [] }), /not 0 to 8/);
    assert.match(one({ kind: 'none', points: 3 }), /kind none has no points/);
    assert.match(one({ points: 0 }), /at least 1 point/);
    assert.match(one({ points: 2, items: undefined }), /under bug_fixed's 3/);
    assert.match(one({ kind: 'great' }), /not one of/);
    assert.match(one({ reason: '' }), /no reason/);
    assert.match(one({ reason: 'x'.repeat(201) }), /over 200/);
    assert.match(one({ reason: 'Fixed — thanks' }), /em-dash/);
    assert.match(one({ reason: 'mail me at a@b.c' }), /email or an IP/);
    assert.match(one({ refs: [] }), /no refs/);
    assert.match(one({ refs: ['x'.repeat(65)] }), /not a short text/);
    assert.match(one({ player: { id: 1, name: 'Aeghor' } }), /never scored/);
    assert.match(one({ player: { id: 54, name: 'Review' } }), /never scored/);
  });

  it('ranks the board by points, then reports, then the earliest first report, leaving off banned, excluded and pointless players', () => {
    assert.deepEqual(EXCLUDED, [1, 54]);
    assert.deepEqual(rank(TOTALS).map((t) => t.id), ORDER);
    assert.deepEqual(rank(TOTALS, 3).map((t) => t.id), [6, 3, 7]);
    const totals = totalsFrom([proposal(), proposal({ ticket: 13, points: 7, items: [1, 2, 3, 4, 5], createdAt: '2026-10-31T21:46:45Z' }), proposal({ ticket: 20, kind: 'none', points: 0, items: [], refs: [], createdAt: '2026-10-01T00:00:00Z' })]);
    assert.deepEqual(totals, [{ id: 500, name: 'mr granberry', points: 11, reports: 2, first: '2026-10-31T20:50:08Z' }], 'a report with no points is not a first credit');
  });

  it('finds the tickets a commit cites', () => {
    assert.deepEqual(citedTickets('🐛 FIX: Picks\n\n- ticket 12, and #21 too'), [12, 21]);
    assert.deepEqual(citedTickets('- tickets 51-57 (Friendly)'), [51, 52, 53, 54, 55, 56, 57]);
    assert.deepEqual(citedTickets('- tickets 12 and 13, ticket #37'), [12, 13, 37]);
    assert.deepEqual(citedTickets('colour #ff0000 and v0.12.0'), []);
  });

  it('reads a curl cookie jar for one host, and only writes to *.localhost without --live', () => {
    const jar = ['# Netscape HTTP Cookie File', '#HttpOnly_groddleafternoon.com\tFALSE\t/\tTRUE\t0\twordpress_logged_in_x\tabc', '.groddleafternoon.com\tTRUE\t/\tTRUE\t0\t__cf_bm\tdef', 'other.com\tFALSE\t/\tTRUE\t0\tnope\tghi'].join('\n');
    assert.equal(cookieHeader(jar, 'groddleafternoon.com'), 'wordpress_logged_in_x=abc; __cf_bm=def');
    assert.equal(cookieHeader(jar, 'example.com'), '');
    assert.ok(isLocal('https://groddle.localhost'));
    assert.ok(!isLocal('https://groddleafternoon.com'));
    const dir = mkdtempSync(join(tmpdir(), 'credits-'));
    try {
      const file = join(dir, 'proposals.json');
      writeFileSync(file, JSON.stringify({ version: 1, proposals: [proposal()] }));
      const r = spawnSync(process.execPath, [join(root, 'tools/reports/credits.mjs'), 'apply', '--site=https://groddleafternoon.com', `--proposals=${file}`, '--yes'], { encoding: 'utf8' });
      assert.equal(r.status, 1);
      assert.match(r.stderr, /not a \*\.localhost site: add --live, and only with Austin's OK/);
      const c = spawnSync(process.execPath, [join(root, 'tools/reports/credits.mjs'), 'check', `--proposals=${file}`, `--md=${join(dir, 'p.md')}`], { encoding: 'utf8' });
      assert.equal(c.status, 0, c.stdout + c.stderr);
      assert.match(c.stdout, /1 proposals, 0 with problems/);
      assert.match(readFileSync(join(dir, 'p.md'), 'utf8'), /\| 12 \| mr granberry \| 4 \| bug_fixed \| Two real bugs, fixed\. \| game 3cfc9a44d, game v0\.8\.0 \|/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('writes the review table with the board and the judgement calls', () => {
    const md = proposalsMarkdown({ source: 'https://x', read_at: 'now', proposals: [proposal({ reason: 'a | b' })], skipped: [{ ticket: 1, player: { name: 'Aeghor' }, why: 'own test' }], notes: ['Ticket 12: look at it'] });
    assert.match(md, /a \\\| b/);
    assert.match(md, /\| 1 \| mr granberry \(500\) \| 4 \| 1 \| 2026-10-31T20:50:08Z \|/);
    assert.match(md, /## Skipped\n\n- 1 \(Aeghor\): own test/);
    assert.match(md, /## Judgement calls\n\n- Ticket 12: look at it/);
  });

  it('documents the release step', () => {
    const readme = readFileSync(join(root, 'tools/reports/README.md'), 'utf8');
    assert.ok(readme.includes('After posting replies, score each closed ticket with tools/reports/credits.mjs and apply after Austin\'s OK.'));
    assert.doesNotMatch(readme, /—/);
  });
});

describe('the testers band on the Contribute page (tools/contribute/to-minn.mjs)', () => {
  it('comes last, after the ledger, as an alternate band with its words in core blocks', () => {
    assert.deepEqual(BANDS.at(-1), ['thanks', 'Thank you, testers']);
    assert.deepEqual(BANDS.at(-2)[0], 'ledger');
    const band = thanksBand();
    assert.match(band, /<section class="wp-block-group band band-alt" id="thanks">/);
    assert.match(band, /<h2 class="wp-block-heading" id="thanks-h">Thank you, testers<\/h2>/);
    assert.ok(band.includes(THANKS_LEAD));
    assert.match(band, /<!-- wp:groddle\/contribute-credits \/-->/);
    assert.doesNotMatch(band, /—/);
  });

  it('adds the band to a page as it stands, once, keeping every other word', () => {
    const fresh = contributeContent();
    assert.equal(withCredits(fresh), fresh, 'a new page has it already');
    const old = fresh.replace(`\n\n${thanksBand()}`, '').replace(' <a href="#thanks">Thank you, testers</a>', '').replace('free to play', 'free to play (edited in Minn Admin)');
    assert.ok(!old.includes('contribute-credits'));
    const added = withCredits(old);
    assert.equal(added, fresh.replace('free to play', 'free to play (edited in Minn Admin)'));
    assert.equal(withCredits(added), added);
    // A page without a ledger: before the footnote.
    const noLedger = '<!-- wp:paragraph {"className":"jump"} -->\n<p class="jump"><a href="#about">What this is</a></p>\n<!-- /wp:paragraph -->\n\n<!-- wp:group {"className":"wrap report-foot"} -->\n<div>foot</div>\n<!-- /wp:group -->';
    const placed = withCredits(noLedger);
    assert.ok(placed.indexOf('contribute-credits') < placed.indexOf('report-foot'));
    assert.match(placed, /<a href="#about">What this is<\/a> <a href="#thanks">Thank you, testers<\/a><\/p>/);
  });

  it('reads stdin and prints the page for WP-CLI', () => {
    const old = contributeContent().replace(`\n\n${thanksBand()}`, '');
    const out = execFileSync(process.execPath, [join(root, 'tools/contribute/to-minn.mjs'), '--add-credits', '--stdin'], { input: old, encoding: 'utf8' });
    assert.ok(out.includes('<!-- wp:groddle/contribute-credits /-->'));
  });
});

describe('the site keeps a score per report (groddle-afternoon-site)', { skip: skipWithoutSite }, () => {
  it('declares an additive table and the block, and bumps the schema', () => {
    const minn = JSON.parse(src('minn.json'));
    assert.deepEqual(minn.tables.groddle_report_credits, [
      'ticket_id bigint(20) unsigned NOT NULL',
      'player_user_id bigint(20) unsigned NOT NULL',
      'points int(11) NOT NULL DEFAULT 0',
      'kind varchar(24) NOT NULL',
      "reason varchar(255) NOT NULL DEFAULT ''",
      'refs text NOT NULL',
      'scored_by varchar(8) NOT NULL',
      'scored_at datetime NOT NULL',
      'PRIMARY KEY  (ticket_id)',
      'KEY player_points (player_user_id,points)',
    ]);
    assert.ok(minn.blocks.includes('groddle/contribute-credits'));
    const [maj, min, patch] = minn.version.split('.').map(Number);
    assert.ok(maj > 0 || min > 5 || (min === 5 && patch >= 36), minn.version);
    const block = JSON.parse(src('blocks/contribute-credits/block.json'));
    assert.equal(block.name, 'groddle/contribute-credits');
    assert.match(block.attributes.how.default, /5 for a fix that keeps saves or accounts safe, 3 for a bug fixed, 2 for an idea that shipped and 1 for a clue or a partial fix/);
    assert.match(block.attributes.how.default, /up to 8\.$/);
    for (const a of Object.values(block.attributes)) assert.doesNotMatch(a.default, /—/);
  });

  it('keeps the rubric the tool uses', () => {
    const php = src('src/ReportCredits.php');
    for (const [kind, n] of Object.entries(KINDS)) assert.match(php, new RegExp(`'${kind}' => ${n},`), kind);
    assert.match(php, /public const CAP = 8;/);
    assert.match(php, /public const EXCLUDED = \[1, 54\];/);
    assert.match(php, /public const BOARD = 10;/);
    assert.match(php, /'REPLACE INTO ' \. \$this->db->table\(self::TABLE\)/, 'scoring again replaces the row');
    assert.match(php, /AND t\.player_user_id NOT IN \(\?\) ORDER BY t\.id ASC', \[self::SCORABLE, self::EXCLUDED\]\);/, 'Austin\'s own reports are never waiting to be scored');
    assert.match(php, /LEFT JOIN ' \. \$db->table\(AdminConsole::BANS\) \. ' b ON b\.user_id = c\.player_user_id/, 'banned players are known to rank');
  });

  it('has admin-only routes, each score logged like other admin actions', () => {
    const php = src('src/AdminReportCredits.php');
    const routes = [...php.matchAll(/#\[Route\(Method::(\w+), '([^']+)', policy: new Policy\(([^)]*)\)\)\]/g)].map((m) => [m[1], m[2], m[3]]);
    assert.deepEqual(routes, [
      ['Get', '/groddle/v1/admin/tickets/{id:\\d+}/credit', 'Access::Cap, self::ADMIN'],
      ['Put', '/groddle/v1/admin/tickets/{id:\\d+}/credit', 'Access::Cap, self::ADMIN'],
      ['Get', '/groddle/v1/admin/credits', 'Access::Cap, self::ADMIN'],
    ]);
    assert.match(php, /private const ADMIN = 'manage_options';/);
    assert.match(php, /AdminConsole::recordAction\(\$this->minn->db, \$admin->id, \$player, 'credit', \[/);
    assert.match(src('src/Extension.php'), /new AdminReportCredits\(\$minn\)/);
    assert.match(src('src/Extension.php'), /ContributeCredits::register\(\$minn\);/);
  });

  it('the rules, the order and the board drawn empty and full (php)', { skip: (!hasPhp && 'no php') || noEngine }, () => {
    const dir = mkdtempSync(join(tmpdir(), 'credits-php-'));
    let out;
    try {
      writeFileSync(join(dir, 'totals.json'), JSON.stringify(TOTALS));
      out = JSON.parse(execFileSync('php', [join(root, 'tests/fixtures/minn-accounts/credits.php'), engine, SITE_DIR, join(dir, 'totals.json')], { encoding: 'utf8' }));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
    assert.deepEqual(out.kinds, KINDS);
    assert.equal(out.cap, CAP);
    assert.deepEqual(out.excluded, EXCLUDED);
    const i = out.inputs;
    assert.deepEqual(i.kind, { kind: 'bug_fixed', points: 3, reason: 'Fixed the pick.', refs: ['game abc1234', 'game v0.8.0'], by: 'admin' });
    assert.deepEqual(i.kindPoints, { kind: 'bug_fixed', points: 5, reason: 'Two fixes', refs: ['game a1', 'game a2'], by: 'admin' });
    assert.deepEqual(i.pointsOnly, { kind: 'improvement_shipped', points: 2, reason: 'Shipped', refs: [], by: 'agent' });
    assert.deepEqual(i.none, { kind: 'none', points: 0, reason: 'How Glitch worked', refs: [], by: 'admin' });
    const codes = { noneWithPoints: 'groddle_credit_points', kindZero: 'groddle_credit_points', overCap: 'groddle_credit_points', stringPoints: 'groddle_credit_points', badKind: 'groddle_credit_kind', nothing: 'groddle_credit_kind', oddPoints: 'groddle_credit_kind', noReason: 'groddle_credit_reason', longReason: 'groddle_credit_reason', badBy: 'groddle_credit_by', longRef: 'groddle_credit_refs', manyRefs: 'groddle_credit_refs', refObject: 'groddle_credit_refs' };
    for (const [k, code] of Object.entries(codes)) assert.deepEqual([i[k].code, i[k].status], [code, 400], k);
    assert.deepEqual(out.out, { ticket: 12, points: 4, kind: 'bug_fixed', reason: 'Two bugs', refs: ['game 3cfc9a44d', 'game v0.8.0'], by: 'agent', at: '2026-11-03T21:00:00Z' });
    // The site's order is the tool's.
    assert.deepEqual(out.rank.map((t) => t.id), ORDER);
    assert.deepEqual(out.rank3.map((t) => t.id), [6, 3, 7]);
    assert.deepEqual(out.rank.map((t) => t.id), rank(TOTALS).map((t) => t.id));
    // A link and a picture only for a public page: level 5 and a slug (the Players page's rule).
    assert.deepEqual(out.entries.public, { id: 7, points: 3, reports: 1, name: 'Ada', slug: 'ada', avatarAt: '2026-11-01 00:00:00' });
    assert.deepEqual([out.entries.level4.slug, out.entries.level4.avatarAt], [null, null]);
    assert.deepEqual([out.entries.noSlug.slug, out.entries.noSlug.avatarAt], [null, null]);
    assert.equal(out.entries.nameless.name, 'A tester', 'never the username');
    // Empty: says so, with the line on how points work (its links kept, its script not).
    assert.match(out.drawEmpty, /^<div class="cc-board cc-board-empty"><p class="cc-empty">Nobody is on the board yet\./);
    assert.match(out.drawEmpty, /<p class="cc-how">Points <a href="\/x\/">come<\/a> from /);
    assert.doesNotMatch(out.drawEmpty, /<script/);
    assert.match(out.drawEmptyWords, /<p class="cc-empty">Be the first\.<\/p><\/div>$/);
    // Full: four rows in order, linked only where public, names escaped, words for one and many.
    const full = out.drawFull;
    const rows = [...full.matchAll(/<li class="cc-row([^"]*)">([\s\S]*?)<\/li>/g)];
    assert.equal(rows.length, 4);
    assert.deepEqual(rows.map((r) => r[1].trim()), ['cc-top cc-linked', 'cc-top cc-linked', 'cc-top', '']);
    assert.match(rows[0][2], /<img class="cc-art" src="\/players\/502\/avatar\?v=\d+" width="172" height="248" alt=""/);
    assert.match(rows[0][2], /<a class="cc-name" href="\/players\/friendly\/">Friendly<\/a><span class="cc-reports">53 reports that led to a change<\/span>/);
    assert.match(rows[0][2], /<b>179<\/b> <span>points<\/span>/);
    assert.match(rows[1][2], /<a class="cc-name" href="\/players\/mr-granberry\/">mr &lt;b&gt;granberry&lt;\/b&gt;<\/a>/, 'a name is text');
    assert.match(rows[1][2], /<svg class="cc-art player-ghost"/, 'no picture yet: the silhouette');
    assert.doesNotMatch(rows[2][2], /<a |<img /, 'below level 5: no link and no picture');
    assert.match(rows[2][2], /1 report that led to a change/);
    assert.match(rows[2][2], /<b>1<\/b> <span>point<\/span>/);
    assert.match(rows[3][2], /<span class="cc-name">A tester<\/span>/);
    assert.match(full, /<ol class="cc-list" role="list" aria-label="Testers by points">/);
    assert.match(full, /<p class="cc-how">How points work\.<\/p><\/div>$/);
  });

  it('keeps the board to ten and puts every other tester behind View more, in a pop-up (Austin 2026-11-10)', { skip: (!hasPhp && 'no php') || noEngine }, () => {
    const dir = mkdtempSync(join(tmpdir(), 'credits-php-'));
    let out;
    try {
      writeFileSync(join(dir, 'totals.json'), JSON.stringify(TOTALS));
      out = JSON.parse(execFileSync('php', [join(root, 'tests/fixtures/minn-accounts/credits.php'), engine, SITE_DIR, join(dir, 'totals.json')], { encoding: 'utf8' }));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
    const rowsIn = (html) => [...html.matchAll(/<li class="cc-row[^"]*">[\s\S]*?<\/li>/g)].map((m) => m[0]);
    const rank = (row) => Number(/<span class="cc-rank" aria-hidden="true">(\d+)<\/span>/.exec(row)[1]);
    // Ten or fewer: no button, no pop-up.
    assert.equal(rowsIn(out.drawTen).length, 10);
    assert.doesNotMatch(out.drawTen, /cc-more|popover/);
    assert.doesNotMatch(out.drawFull, /cc-more|popover/);
    // Eleven: one more, in the singular.
    assert.match(out.drawEleven, /<button type="button" class="cc-more-open" popovertarget="cc-more">View 1 more tester<\/button>/);
    // Thirteen: ten on the board, three in the pop-up, ranks carrying on, the how line last.
    const html = out.drawThirteen;
    const [board, pop] = html.split('<div class="cc-pop"');
    assert.deepEqual(rowsIn(board).map(rank), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    assert.deepEqual(rowsIn(pop).map(rank), [11, 12, 13]);
    assert.match(board, /<p class="cc-more"><button type="button" class="cc-more-open" popovertarget="cc-more">View 3 more testers<\/button><\/p>$/);
    assert.match(pop, /^ id="cc-more" popover role="dialog" aria-labelledby="cc-more-title">/);
    assert.match(pop, /<h3 class="cc-pop-title" id="cc-more-title">More testers<\/h3>/);
    assert.match(pop, /<button type="button" class="cc-pop-close" popovertarget="cc-more" popovertargetaction="hide" aria-label="Close">/);
    assert.match(pop, /<ol class="cc-list cc-list-more" role="list" start="11" aria-label="More testers by points">/);
    assert.doesNotMatch(rowsIn(pop).join(''), /cc-top/, 'only the first three are marked');
    assert.match(rowsIn(pop)[1], /<a class="cc-name" href="\/players\/tester-12\/">Tester 12<\/a>/, 'a public page links from the pop-up too');
    assert.match(html, /<\/ol><\/div><p class="cc-how">How\.<\/p><\/div>$/);
    assert.doesNotMatch(html, /<script/, 'the pop-up is the browser\'s own popover: no script');
    // The board asks for everyone ranked; draw does the cutting.
    assert.match(src('src/ContributeCredits.php'), /ReportCredits::rank\(\(new ReportCredits\(\$db\)\)->totals\(\), PHP_INT_MAX\)/);
    const css = src('style.css');
    assert.match(css, /\.cc-pop \{[^}]*max-height: min\(80vh, 720px\);[^}]*overflow: auto;/);
    assert.match(css, /\.cc-list\.cc-list-more \{ grid-template-columns: minmax\(0, 1fr\);/);
  });

  it('styles the board from the site\'s tokens, both themes, 1440 and 390 wide', () => {
    const css = src('style.css');
    const ours = css.slice(css.indexOf('/* The testers board'));
    assert.ok(ours.length > 1000);
    const tokens = new Set([...readFileSync(join(root, 'public/restoration/restoration.css'), 'utf8').matchAll(/(--[a-z-]+):/g)].map((m) => m[1]));
    for (const [, name] of ours.matchAll(/var\((--[a-z-]+)/g)) assert.ok(tokens.has(name), name);
    assert.doesNotMatch(ours, /#[0-9a-f]{3,6}\b/i, 'no fixed colours');
    assert.match(ours, /@media \(max-width: 760px\) \{\n  \.cc-list \{ grid-template-columns: minmax\(0, 1fr\); \}/);
  });

  it('the console: a Credit box on each report, a Credits tab, and the log in words', async () => {
    const page = src('src/AdminConsolePage.php');
    for (const hook of ['data-console-tab="credits"', 'data-console-credit-form', 'data-console-credit-kind', 'data-console-credit-points', 'data-console-credits', 'data-console-board', 'data-console-unscored']) assert.ok(page.includes(hook), hook);
    for (const [kind, n] of Object.entries(KINDS)) assert.ok(page.includes(`<option value="${kind}">`) && page.includes(`(${n})</option>`), kind);
    assert.match(page, /name="points" type="number" min="0" max="8"/);
    assert.match(page, /name="reason" type="text" maxlength="200" required/);
    const js = src('console/console.js');
    for (const route of ['admin/tickets/${id}/credit', 'admin/tickets/${creditFor}/credit', "method: 'PUT'", "api.call('admin/credits')"]) assert.ok(js.includes(route), route);
    const mod = HAS_SITE ? await import(pathToFileURL(sitePath('console/console.js')).href) : {};
    assert.deepEqual(mod.CREDIT_KINDS, KINDS);
    assert.equal(mod.CREDIT_CAP, CAP);
    assert.deepEqual(mod.refsFrom(' game a1,  game  v0.8.0 ,, game a1 '), ['game a1', 'game v0.8.0']);
    assert.deepEqual(mod.creditBody({ kind: 'bug_fixed', points: '', reason: ' Fixed ', refs: 'game a1' }), { kind: 'bug_fixed', points: 3, reason: 'Fixed', refs: ['game a1'] });
    assert.deepEqual(mod.creditBody({ kind: 'bug_fixed', points: '5', reason: 'x', refs: '' }).points, 5);
    assert.equal(mod.creditWords(null), 'Not scored yet');
    assert.equal(mod.creditWords({ points: 4, kind: 'bug_fixed', by: 'agent' }), '4 points, Bug fixed, by the agent');
    assert.equal(mod.creditWords({ points: 1, kind: 'partial_or_clue', by: 'admin' }), '1 point, Partial fix or clue');
    assert.equal(mod.logWords({ kind: 'credit', player: { name: 'Ada' }, detail: { subject: 'Pigs', points: 0, kind: 'none', by: 'admin' }, delivery: 'stored' }), 'scored Ada\'s report “Pigs”: 0 points, No change');
    for (const w of Object.values(mod.CREDIT_WORDS)) assert.doesNotMatch(w, /—/);
  });
});

// Site 3c79b40: admin/tickets pages by 200 from offset and says total; credits reads every page.
describe('credits read: every page of admin/tickets (readAllTickets)', () => {
  const site = (n, { paging = true, per = 200 } = {}) => {
    const all = Array.from({ length: n }, (_, i) => ({ id: n - i, status: 'closed' }));
    const calls = [];
    const rest = async (method, route) => {
      calls.push(route);
      const offset = paging ? Number(/[?&]offset=(\d+)/.exec(route)?.[1] || 0) : 0;
      const rows = all.slice(offset, offset + per);
      return paging ? { tickets: rows, more: offset + per < n, total: n } : { tickets: rows, more: per < n };
    };
    return { rest, calls };
  };

  it('pages with offset until more is false, so reports past the first 200 count', async () => {
    const { rest, calls } = site(418);
    const warned = [];
    const r = await readAllTickets(rest, { warn: (m) => warned.push(m) });
    assert.equal(r.tickets.length, 418);
    assert.equal(r.total, 418);
    assert.equal(r.pages, 3);
    assert.deepEqual(calls, ['/groddle/v1/admin/tickets?status=all', '/groddle/v1/admin/tickets?status=all&offset=200', '/groddle/v1/admin/tickets?status=all&offset=400']);
    assert.equal(new Set(r.tickets.map((t) => t.id)).size, 418);
    assert.deepEqual(warned, []);
  });

  it('one page when it all fits', async () => {
    const { rest, calls } = site(12);
    const r = await readAllTickets(rest, { warn: () => assert.fail('no warning') });
    assert.equal(r.tickets.length, 12);
    assert.equal(calls.length, 1);
  });

  it('a site without paging (no total): the first page, with a warning, and no loop', async () => {
    const { rest, calls } = site(230, { paging: false });
    const warned = [];
    const r = await readAllTickets(rest, { warn: (m) => warned.push(m) });
    assert.equal(r.tickets.length, 200);
    assert.equal(r.paged, false);
    assert.equal(calls.length, 1);
    assert.match(warned[0], /does not page admin\/tickets/);
  });

  it('a ticket on two pages (the list moved) is kept once; a page with nothing new stops it', async () => {
    let n = 0;
    const rest = async (m, route) => {
      n += 1;
      if (n === 1) return { tickets: [{ id: 3 }, { id: 2 }], more: true, total: 3 };
      if (n === 2) return { tickets: [{ id: 2 }, { id: 1 }], more: true, total: 3 };
      return { tickets: [{ id: 1 }], more: true, total: 3 };
    };
    const warned = [];
    const r = await readAllTickets(rest, { warn: (m) => warned.push(m) });
    assert.deepEqual(r.tickets.map((t) => t.id), [3, 2, 1]);
    assert.equal(n, 3);
    assert.match(warned[0], /no new tickets at offset 4/);
  });

  it('read() uses it', () => {
    const src = readFileSync(join(root, 'tools/reports/credits.mjs'), 'utf8');
    const body = src.slice(src.indexOf('async function read(args)'), src.indexOf('function load('));
    assert.match(body, /const list = await readAllTickets\(/);
    assert.doesNotMatch(body, /\?status=all'\)/);
  });
});
