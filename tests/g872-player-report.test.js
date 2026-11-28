/**
 * G872 (report #417, Austin 2026-11-16): a player reports another player, with the public chat they
 * could see, never IMs. Glitch's Report Abuse (glitch-client ChatDropdown.as 77, TSFrontController.as
 * 2602-2680, InteractionMenuController.as 869-875). The game's Report row and window (js/buddies.js,
 * js/player-report.js, features/buddies-feature.js, js/ui/player-menu.js, js/minn-account.js), the
 * site's route, table and console (groddle-afternoon-site src/PlayerReports.php, AdminTickets.php,
 * console/console.js) and the realtime server's report_lines (groddle-afternoon-server reports.go).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { SITE_DIR, HAS_SITE, serverPath, sitePath, skipWithoutServer, skipWithoutSite } from '../tools/repos.mjs';
import { BUDDY_VERBS, buddyVerbs, normalizeList } from '../public/js/buddies.js?v=4457d8a4';
import { BLOCKED_PLAYER_VERBS, FROM_LIST_VERBS, blockedPlayerVerbs, playerMenuRows } from '../public/js/ui/player-menu.js?v=fc31e1d5';
import { PLAYER_REPORT_NOTE_MAX, PLAYER_REPORT_TEXT, playerReportView } from '../public/js/player-report.js?v=8d7e5653';
import { createMinnAccount } from '../public/js/minn-account.js?v=7e3d7279';
import { HAS_PHP, PHP } from './php.js';

const root = join(import.meta.dirname, '..');
const game = (f) => readFileSync(join(root, 'public', f), 'utf8');
const site = (f) => readFileSync(sitePath(f), 'utf8');
const hasPhp = HAS_PHP;

describe('the Report row on another player\'s menu', () => {
  const list = normalizeList({ buddies: [], reverse: [], ignoring: [{ id: 9, name: 'Boz' }] });

  it('sits under Block or Un-Block, for a blocked player too', () => {
    const open = buddyVerbs(list, { id: 7, name: 'Cyd' });
    assert.deepEqual(open.map((v) => v.id), [BUDDY_VERBS.add, BUDDY_VERBS.ignore, BUDDY_VERBS.report]);
    const report = open.at(-1);
    assert.equal(report.label, 'Report');
    assert.equal(report.tooltip, 'Report Cyd to the administrators');
    assert.ok(report.sort > open[1].sort, 'below Block');
    const blocked = buddyVerbs(list, { id: 9, name: 'Boz' });
    assert.deepEqual(blocked.map((v) => v.id), [BUDDY_VERBS.add, BUDDY_VERBS.unignore, BUDDY_VERBS.report]);
    // Solo or before the list is in: no rows at all (buddies-feature does nothing in solo).
    assert.deepEqual(buddyVerbs(null, { id: 7 }), []);
  });

  it('is on the menu from a list (a chat name, a Who\'s here row) and on a blocked player\'s', () => {
    assert.ok(FROM_LIST_VERBS.includes(BUDDY_VERBS.report));
    assert.ok(BLOCKED_PLAYER_VERBS.includes(BUDDY_VERBS.report));
    const verbs = buddyVerbs(list, { id: 9, name: 'Boz' });
    assert.ok(blockedPlayerVerbs(verbs).some((v) => v.id === BUDDY_VERBS.report));
    assert.ok(playerMenuRows(verbs, { here: false }).some((r) => r.id === BUDDY_VERBS.report && r.label === 'Report'));
  });

  it('never on yourself: the menu does not open for your own name (game.js openPlayerListMenu)', () => {
    assert.match(game('game.js'), /if \(GAME_MODE !== 'multiplayer' \|\| !opensPlayerMenu\(id, selfPlayerId\(\)\)\) return false;/);
  });

  it('the buddies feature runs it, and Added you rows have it beside Block (Block\'s own confirm keeps its two buttons)', () => {
    const f = game('js/features/buddies-feature.js');
    assert.match(f, /else if \(verbId === BUDDY_VERBS\.report\) report\(p\);/);
    assert.match(f, /\{ kind: 'ignore', label: BUDDY_TEXT\.ignoreVerb, run: \(\) => confirmIgnore\(r\) \}, \{ kind: 'report', label: PLAYER_REPORT_TEXT\.verb, run: \(\) => report\(r\) \}/);
    assert.match(f, /const confirmIgnore = \(p\) => ask\(BUDDY_TEXT\.ignoreConfirm\(p\.name\), \(\) => ignore\(p\)\);/);
    assert.match(f, /send: \(id, note\) => account\.reportPlayer\(id, note\)/);
  });
});

describe('the report window', () => {
  const engine = () => {
    const data = {};
    const toasts = [];
    return { data, toasts, setData: (k, v) => { data[k] = v; }, toast: (t) => toasts.push(t), pushActivity: () => {} };
  };

  it('a note (optional, at most 500), Send report as the confirm, then Glitch\'s thanks', async () => {
    const e = engine();
    const sent = [];
    const view = playerReportView({ player: { id: 9, name: 'Boz' }, send: async (id, note) => { sent.push([id, note]); return { status: 'reported', ticket: 41 }; }, engine: e });
    assert.equal(view.title, 'Report Boz?');
    assert.equal(view.send, 'Send report');
    assert.equal(view.maxWhy, PLAYER_REPORT_NOTE_MAX);
    assert.match(view.hint, /never your IMs/);
    assert.equal(e.data.playerReport, 'open:9');
    assert.deepEqual(await view.onSend('x'.repeat(600)), { ok: true });
    assert.deepEqual(sent, [[9, 'x'.repeat(500)]]);
    assert.equal(e.data.playerReport, 'sent:9:41');
    assert.deepEqual(e.toasts, ['Reported! Thanks for taking the time to make this report.']);
  });

  it('a refusal stays in the window with the site\'s words', async () => {
    const e = engine();
    const view = playerReportView({ player: { id: 9, name: 'Boz' }, send: async () => { throw Object.assign(new Error('You reported Boz a little while ago.'), { code: 'groddle_report_again' }); }, engine: e });
    assert.deepEqual(await view.onSend(''), { ok: false, text: 'You reported Boz a little while ago.' });
    assert.equal(e.data.playerReport, 'refused:groddle_report_again');
    assert.equal(playerReportView({ player: { id: 0 }, send: async () => ({}) }), null);
  });

  it('posts players/{id}/report with the note only: the game never sends a chat line', async () => {
    const calls = [];
    const fetch = async (url, init) => {
      calls.push({ url: String(url), init });
      return new Response(JSON.stringify({ status: 'reported', ticket: 3, lines: 4 }), { status: 201, headers: { 'Content-Type': 'application/json' } });
    };
    const out = await createMinnAccount({ baseUri: 'https://groddle.example/', fetch, nonce: 'abcdef1234' }).reportPlayer('9', 'rude');
    assert.equal(out.ticket, 3);
    assert.equal(calls.length, 1);
    assert.match(calls[0].url, /\/wp-json\/groddle\/v1\/players\/9\/report$/);
    assert.equal(calls[0].init.method, 'POST');
    assert.deepEqual(JSON.parse(calls[0].init.body), { note: 'rude' });
    for (const f of ['js/player-report.js', 'js/minn-account.js']) assert.doesNotMatch(game(f), /reportIm|mod\/report|imLines/);
  });
});

describe('the site: route, limits, the kept lines and the console', { skip: skipWithoutSite }, () => {
  const php = (code) => JSON.parse(execFileSync(PHP, ['-r', `foreach (['BugReports', 'ChatHistory', 'AdminConsole', 'PlayerReports'] as $c) require ${JSON.stringify(SITE_DIR)} . "/src/$c.php"; use Groddle\\Minn\\PlayerReports as P; ${code}`]).toString());

  it('keeps only street, public channel and party lines: an IM or a group line can never be kept', { skip: !hasPhp }, () => {
    const answer = {
      status: 'ok',
      lines: [
        { at: '2026-11-16T10:00:00.000Z', kind: 'local', where: 'GA5ONE', id: 9, name: 'Boz', text: 'go away', reported: true },
        { at: '2026-11-16T10:00:01.000Z', kind: 'im', where: 'GA5ONE', id: 9, name: 'Boz', text: 'private words' },
        { at: '2026-11-16T10:00:02.000Z', kind: 'channel', where: 'group:5', id: 9, name: 'Boz', text: 'group words' },
        { at: '2026-11-16T10:00:03.000Z', kind: 'channel', where: 'global', id: 3, name: 'Cyd', text: 'oh no', filtered: true, shown: 'oh n#' },
        { at: '2026-11-16T10:00:04.000Z', kind: 'party', where: 'party-7-x', id: 9, name: 'Boz', text: 'party words', deleted: true },
        { kind: 'local', where: '../etc', id: 9, text: 'bad where' },
        { kind: 'local', where: 'GA5ONE', id: '9', text: 'id as a string' },
      ],
    };
    const out = php(`echo json_encode(P::lines(json_decode(${JSON.stringify(JSON.stringify(answer))}, true)));`);
    assert.equal(out.status, 'ok');
    assert.deepEqual(out.lines.map((l) => l.text), ['go away', 'oh no', 'party words']);
    assert.ok(!JSON.stringify(out).includes('private words') && !JSON.stringify(out).includes('group words'));
    assert.deepEqual(out.lines[0], { at: '2026-11-16T10:00:00.000Z', kind: 'local', where: 'GA5ONE', id: 9, name: 'Boz', text: 'go away', shown: '', deleted: false, reported: true });
    assert.equal(out.lines[1].shown, 'oh n#');
    assert.equal(out.lines[2].deleted, true);
    const many = { status: 'ok', lines: Array.from({ length: 60 }, (_, i) => ({ kind: 'local', where: 'GA5ONE', id: 9, text: `l${i}` })) };
    const capped = php(`echo json_encode(P::lines(json_decode(${JSON.stringify(JSON.stringify(many))}, true)));`);
    assert.equal(capped.lines.length, 50);
    assert.equal(capped.lines.at(-1).text, 'l59', 'the newest kept');
    assert.deepEqual(php('echo json_encode([P::lines(null), P::lines(["status" => "off"]), P::lines(["status" => "ok"])]);'), [{ status: 'down', lines: [] }, { status: 'off', lines: [] }, { status: 'down', lines: [] }]);
  });

  it('limits: one report of the same player an hour, 5 a day per login, and the bug reports\' own', { skip: !hasPhp }, () => {
    const out = php('echo json_encode(["ok" => P::refusal(4, 0, false), "day" => P::refusal(5, 0, false), "again" => P::refusal(0, 1, false), "tickets" => P::refusal(0, 0, true), "perDay" => P::PER_DAY, "hour" => P::PER_TARGET_SECONDS]);');
    assert.deepEqual(out, { ok: null, day: 'groddle_report_slow', again: 'groddle_report_again', tickets: 'groddle_report_slow', perDay: 5, hour: 3600 });
    const src = site('src/PlayerReports.php');
    assert.match(src, /#\[Route\(Method::Post, '\/groddle\/v1\/players\/\{id:\[1-9\]\[0-9\]\{0,18\}\}\/report', policy: new Policy\(Access::SignedIn\)\)\]/);
    assert.match(src, /WHERE reporter_login = \? AND created_at >= \?/, 'the day counts the login, every character of it');
    assert.match(src, /\$logins->sameLogin\(\$reported, \$user->id\)/, 'not yourself, nor another character of yours');
    assert.match(src, /post\('report_lines', \['reporter' => \$user->id, 'reported' => \$reported, 'name' => \$name\]\)/);
    assert.match(site('src/Extension.php'), /new PlayerReports\(\$minn\)/);
  });

  it('the first message names the player and the reporter\'s words; the lines are kept apart, for administrators only', { skip: !hasPhp }, () => {
    const msg = php('echo json_encode(P::message("Boz", ""));');
    assert.equal(msg.split('\n')[0], 'Reporting a player: Boz');
    assert.match(msg, /\(No note\.\)/);
    assert.match(msg, /IMs never do\./);
    const table = JSON.parse(site('minn.json')).tables.groddle_player_reports;
    const cols = table.map((c) => c.split(' ')[0]);
    for (const c of ['ticket_id', 'reporter_id', 'reporter_login', 'reported_id', 'lines_status', 'chat_lines', 'created_at']) assert.ok(cols.includes(c), c);
    for (const c of ['email', 'ip', 'user_email']) assert.ok(!cols.includes(c), c);
    // The reporter's own thread (Tickets) never reads the table; the administrators' does.
    assert.doesNotMatch(site('src/Tickets.php'), /PlayerReports/);
    const admin = site('src/AdminTickets.php');
    assert.match(admin, /PlayerReports::reportedOf\(\$this->minn->db/);
    assert.match(admin, /'playerReport' => \$report,/);
    const out = php('echo json_encode(P::linesOut([["at" => "2026-11-16T10:00:00.000Z", "kind" => "local", "where" => "GA5ONE", "id" => 9, "name" => "Boz", "text" => "go away", "shown" => "", "deleted" => false, "reported" => true], ["kind" => "im", "where" => "x", "id" => 9, "text" => "never"]], ["GA5ONE" => ["label" => "Groddle Meadow"]]));');
    assert.deepEqual(out, [{ at: '2026-11-16T10:00:00.000Z', kind: 'local', place: 'Groddle Meadow', id: 9, name: 'Boz', text: 'go away', shown: '', deleted: false, reported: true }]);
  });

  it('the console marks a player report and shows the lines with theirs marked', async () => {
    const page = site('src/AdminConsolePage.php');
    assert.match(page, /data-console-player-report hidden/);
    const js = site('console/console.js');
    assert.match(js, /t\.playerReport \? el\('span', \{ class: 'console-chip console-chip-player', text: 'Player report' \}\) : null/);
    assert.match(js, /'data-theirs': l\.reported \? '1' : null/);
    if (!HAS_SITE) return;
    const { playerReportNote } = await import(pathToFileURL(sitePath('console/console.js')).href);
    assert.equal(playerReportNote({ reported: { name: 'Boz' }, linesStatus: 'ok', windowMinutes: 30, lines: [{}, {}] }), "2 public chat lines the reporter could see in the 30 minutes before (street, channel and party chat; never IMs). Boz's lines are marked.");
    assert.equal(playerReportNote({ linesStatus: 'down', lines: [] }), 'The realtime server did not answer, so no chat came with it.');
    assert.equal(playerReportNote({ linesStatus: 'ok', lines: [] }), 'No public chat the reporter could see in the 30 minutes before.');
  });
});

describe('the realtime server\'s report_lines (reports.go)', { skip: skipWithoutServer }, () => {
  it('reads the chat log only, never the IM path; public kinds only', () => {
    const go = readFileSync(serverPath('reports.go'), 'utf8');
    assert.match(go, /serviceHandlers\["report_lines"\] = reportLinesService/);
    const code = go.slice(go.indexOf('\nimport ('));
    for (const bad of ['*ims', 'im_send', 'imFile', 'chatstore']) assert.ok(!code.includes(bad), bad);
    assert.match(go, /reportChannels = map\[string\]bool\{"global": true, "help": true, "newbie": true, "trade": true\}/);
    assert.match(go, /reportWindow\s+= 30 \* time\.Minute/);
    assert.match(go, /reportMaxLines\s+= 50/);
    assert.match(readFileSync(serverPath('reports_test.go'), 'utf8'), /TestReportCarriesThePublicLinesTheReporterSawAndNeverAnIM/);
  });
});
