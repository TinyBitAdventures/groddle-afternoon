/**
 * Moderation that Grok Bot can run (Austin 2026-11-09): reporting an IM in the game
 * (js/im-report.js, features/im-report-feature.js, the drawer's REPORTING), what a purge or a deleted
 * reported line does to open windows, the site's queue, token and routes
 * (groddle-afternoon-site src/ModReports.php, ModTokens.php, Moderation.php, ChatHistory.php) and the
 * realtime server's half (groddle-afternoon-server moderation.go, modsignals.go).
 *
 * The rules that matter most are checked over the source too: no route returns an IM's words except
 * the lines a recipient reported; a moderator token reaches no other route; moderation refuses
 * administrators.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { SITE_DIR, serverPath, sitePath, skipWithoutServer, skipWithoutSite } from '../tools/repos.mjs';
import {
  REPORT_LINES,
  REPORT_TEXT,
  imLineOf,
  mayReport,
  newestFrom,
  purgeOf,
  purged,
  reportBody,
  reportNote,
  reportResultText,
  withoutPurged,
} from '../public/js/im-report.js?v=93211487';

const root = join(import.meta.dirname, '..');
const game = (f) => readFileSync(join(root, 'public', f), 'utf8');
const site = (f) => readFileSync(sitePath(f), 'utf8');
const hasPhp = spawnSync('php', ['-v']).status === 0;

describe('reporting an IM in the game (js/im-report.js)', () => {
  it('Report is on IM lines the other player sent, never yours, a note or a channel line', () => {
    const theirs = { name: 'Bramble', text: 'hi', mine: false, rk: 'im:9:4' };
    assert.equal(mayReport('im:9', theirs), true);
    assert.deepEqual(imLineOf('im:9', theirs), { with: 9, line: 4 });
    assert.equal(mayReport('im:9', { ...theirs, mine: true }), false);
    assert.equal(mayReport('im:9', { ...theirs, note: true }), false);
    assert.equal(mayReport('im:7', theirs), false, 'the key must be this conversation\'s');
    assert.equal(mayReport('global', { ...theirs, rk: 'l:1730000000123' }), false);
    assert.equal(mayReport('im:9', { ...theirs, rk: '' }), false);
  });

  it('the report carries the line, the note and at most REPORT_LINES lines of the two players', () => {
    const lines = [];
    for (let i = 1; i <= 40; i++) lines.push({ id: i, from: i % 2 ? 9 : 7, text: `line ${i}`, at: 1000 + i });
    lines.push({ id: 41, from: 9, text: 'a reply', at: 2000, parent: 3 });
    const body = reportBody({ withId: 9, me: 7, line: { id: 35, at: 1035 }, lines, note: '  rude\nwords\u0007 ' });
    assert.equal(body.with, 9);
    assert.equal(body.line, 35);
    assert.equal(body.at, 1035);
    assert.equal(body.note, 'rude words');
    assert.ok(body.lines.length <= REPORT_LINES);
    assert.ok(body.lines.some((l) => l.id === 35));
    assert.ok(body.lines.every((l) => l.from === 7 || l.from === 9));
    assert.ok(!body.lines.some((l) => l.text === 'a reply'), 'thread replies stay out of the main excerpt');
    assert.equal(reportBody({ withId: 9, me: 7, line: { id: 2, at: 1002 }, lines }), null, 'your own line is not reportable');
    assert.equal(reportBody({ withId: 9, me: 7, line: null, lines }), null);
    assert.equal([...reportNote('é'.repeat(900))].length, 500);
  });

  it('the head\'s Report takes the other player\'s newest line', () => {
    assert.deepEqual(newestFrom([{ id: 1, from: 9 }, { id: 2, from: 7 }, { id: 3, from: 9 }, { id: 4, from: 7 }], 9), { id: 3, from: 9 });
    assert.equal(newestFrom([{ id: 2, from: 7 }], 9), null);
  });

  it('what the player is told, in plain words with no em-dashes', () => {
    assert.equal(reportResultText({ status: 'reported' }), REPORT_TEXT.sent);
    assert.equal(reportResultText({ status: 'already' }), REPORT_TEXT.already);
    assert.equal(reportResultText(null, { message: 'You have sent a lot of reports.' }), 'You have sent a lot of reports.');
    const words = JSON.stringify(Object.values(REPORT_TEXT).map((v) => (typeof v === 'function' ? v('Bramble') : v)));
    assert.doesNotMatch(words, /—/);
    assert.doesNotMatch(words, /Glitch/);
  });
});

describe('a purge and a deleted line leave every open window', () => {
  it('purged() matches the player\'s lines since then in every line shape', () => {
    const opts = { player: 9, since: 500, me: 7 };
    assert.equal(purged({ playerId: 9, at: 600 }, opts), true, 'a drawer line');
    assert.equal(purged({ playerId: 9, at: 400 }, opts), false, 'before the window');
    assert.equal(purged({ from: 9, at: 600 }, opts), true, 'an IM line');
    assert.equal(purged({ id: 9, at: 600 }, opts), true, 'a channel line (groups.js chatLine)');
    assert.equal(purged({ playerId: 0, mine: true, at: 600 }, opts), false, 'your own line, not the purged player\'s');
    assert.equal(purged({ playerId: 0, mine: true, at: 600 }, { ...opts, me: 9 }), true, 'the purged player\'s own window loses theirs');
    const list = [{ from: 7, at: 600 }, { from: 9, at: 600 }];
    assert.deepEqual(withoutPurged(list, opts), [{ from: 7, at: 600 }]);
    const none = [{ from: 7, at: 1 }];
    assert.equal(withoutPurged(none, opts), none, 'the same array when nothing went');
    assert.deepEqual(purgeOf({ player: '9', since: 12 }), { player: 9, since: 12 });
    assert.equal(purgeOf({ player: 0 }), null);
  });

  it('the drawer, the channels, the IMs and the report window all handle chat_purged and im_deleted', () => {
    const drawer = game('js/ui/social-drawer.js');
    assert.match(drawer, /reporting: online \?/);
    assert.match(drawer, /purge\(test\) \{/);
    assert.match(drawer, /'data-line-report'/);
    assert.match(drawer, /'\[data-im-report\]'/, 'the conversation\'s menu has the head\'s Report');
    assert.match(game('js/features/groups-feature.js'), /client\.on\('msg:chat_purged'/);
    const im = game('js/features/player-im-feature.js');
    assert.match(im, /client\.on\('msg:chat_purged'/);
    assert.match(im, /client\.on\('msg:im_deleted'/);
    assert.match(im, /'data-im-report'/);
    const rep = game('js/features/im-report-feature.js');
    assert.match(rep, /client\.on\('msg:chat_purged'/);
    assert.match(rep, /client\.on\('msg:im_deleted'/);
    assert.match(rep, /engine\.mode !== 'multiplayer'/, 'solo: nothing');
    assert.match(game('js/features/buddies-feature.js'), /blockPlayer\(id, name\)/);
  });

  it('both skins dress the Report button and the report window, with tokens only', () => {
    const css = game('style.css');
    const classic = game('css/classic.css');
    for (const sel of ['.line-report', '.mod-report-window', '.mod-report-foot']) {
      assert.ok(css.includes(sel), `Modern ${sel}`);
      assert.ok(classic.includes(`:root[data-ui="classic"] ${sel}`), `Classic ${sel}`);
    }
  });
});

describe('the site: the queue, the token and the routes', { skip: skipWithoutSite }, () => {
  it('no route returns an IM\'s words but the lines a recipient reported', () => {
    // Every query on groddle_im_lines lives in ChatHistory (the two players' own routes, the server's
    // ingest, a purge) or ModReports (the reported line and its neighbours); Moderation names a row
    // only to delete a reported line, never selecting its text.
    const files = readdirSync(sitePath('src')).filter((f) => f.endsWith('.php'));
    const readers = files.filter((f) => /ChatHistory::IMS|self::IMS|groddle_im_lines/.test(site(`src/${f}`)));
    assert.deepEqual(readers.sort(), ['ChatHistory.php', 'ModReports.php', 'Moderation.php']);
    const mod = site('src/Moderation.php');
    for (const m of mod.matchAll(/SELECT ([^"']+?) FROM ' \. \$db->table\(ChatHistory::IMS\)/g)) {
      assert.doesNotMatch(m[1], /text|\*/, `Moderation selects ${m[1]} from the IM lines`);
    }
    const rep = site('src/ModReports.php');
    assert.match(rep, /AND line_id = \? AND at_ms = \? AND deleted_ms = 0/, 'the reported line, by the reporter\'s pair');
    assert.match(rep, /\(int\) \$hit\['from_id'\] === \$me\) \{\s*return null;/, 'never the reporter\'s own line');
    assert.match(rep, /AND at_ms >= \? AND \(at_ms < \?/, 'nothing from before reports began');
    const hist = site('src/ChatHistory.php');
    // The players' own IM routes leave a purged or deleted line out.
    for (const name of ['conversations', 'ims', 'imThread', 'imNotices']) {
      const body = hist.slice(hist.indexOf(`function ${name}(`), hist.indexOf('function ', hist.indexOf(`function ${name}(`) + 10));
      assert.match(body, /deleted_ms = 0/, `${name} leaves deleted IM lines out`);
    }
    // A purge empties an IM's words at once.
    assert.match(hist, /SET text = '', reactions = NULL, deleted_ms = \?, deleted_by = \? WHERE from_id = \?/);
  });

  it('a moderator token reaches the moderation routes and nothing else', () => {
    const files = readdirSync(sitePath('src')).filter((f) => f.endsWith('.php'));
    for (const f of files) {
      const src = site(`src/${f}`);
      if (f === 'Moderation.php' || f === 'ModTokens.php') continue;
      assert.doesNotMatch(src, /ModTokens::(fromHeaders|HEADER)|->verify\(\$token/, `${f} reads a moderator token`);
    }
    const mod = site('src/Moderation.php');
    const routes = [...mod.matchAll(/#\[Route\(Method::\w+, '([^']+)'/g)].map((m) => m[1]);
    assert.ok(routes.length >= 16);
    assert.ok(routes.every((r) => r.startsWith('/groddle/v1/mod/')), routes.join(' '));
    // The token routes take the session only; every other route names its capability.
    assert.equal((mod.match(/\$this->actor\(\$request, null\)/g) || []).length, 3);
    // Every action refuses administrators (target()), and none acts without its capability.
    for (const fn of ['silence', 'imRestrict', 'lift', 'ban', 'unban', 'purge', 'notice', 'undo']) {
      const body = mod.slice(mod.indexOf(`public function ${fn}(`), mod.indexOf('public function', mod.indexOf(`public function ${fn}(`) + 10));
      assert.match(body, /\$this->actor\(\$request, 'moderate'\)/, `${fn} needs moderate`);
      assert.match(body, /\$this->target\(\$actor/, `${fn} checks its player`);
    }
    assert.match(mod, /Moderation never acts on administrators\./);
    // The admin routes still take a session with manage_options (a token signs nobody in).
    assert.match(site('src/AdminConsole.php'), /policy: new Policy\(Access::Cap, self::ADMIN\)/);
  });

  it('the token is stored hashed and shown once', { skip: !hasPhp }, () => {
    const php = `require ${JSON.stringify(SITE_DIR + '/src/ModTokens.php')}; use Groddle\\Minn\\ModTokens as T;
      $t = 'gmod_0123456789abcdef_' . str_repeat('A', 43);
      echo json_encode([
        'parse' => T::parse($t), 'bad' => T::parse('gmod_xyz'),
        'bearer' => T::fromHeaders('Bearer ' . $t, null), 'header' => T::fromHeaders(null, $t), 'basic' => T::fromHeaders('Basic abc', null),
        'hash' => T::hash(str_repeat('A', 43)), 'caps' => T::CAPS,
      ]);`;
    const out = JSON.parse(execFileSync('php', ['-r', php]).toString());
    assert.deepEqual(out.parse, ['0123456789abcdef', 'A'.repeat(43)]);
    assert.equal(out.bad, null);
    assert.ok(out.bearer.startsWith('gmod_') && out.header === out.bearer && out.basic === null);
    assert.match(out.hash, /^[0-9a-f]{64}$/);
    assert.deepEqual(out.caps, ['read', 'moderate']);
    const tokens = site('src/ModTokens.php');
    assert.match(tokens, /secret_hash/);
    assert.match(tokens, /\$id, \$label, implode\(',', \$caps\), self::hash\(\$secret\)/, 'only the hash of the secret is stored');
  });

  it('the game\'s copy of a line stands in only when fresh, the other player\'s, and after reports began', { skip: !hasPhp }, () => {
    const php = `require ${JSON.stringify(SITE_DIR + '/src/ChatHistory.php')}; require ${JSON.stringify(SITE_DIR + '/src/ModReports.php')}; use Groddle\\Minn\\ModReports as R;
      $lines = [['id' => 1, 'from' => 7, 'text' => 'hi', 'at' => 100000], ['id' => 2, 'from' => 9, 'text' => 'buy now', 'at' => 100500], ['id' => 3, 'from' => 5, 'text' => 'not theirs', 'at' => 100600]];
      echo json_encode([
        'ok' => R::gameExcerpt($lines, 7, 9, 2, 100500, 0, 101000),
        'old' => R::gameExcerpt($lines, 7, 9, 2, 100500, 0, 100500 + R::UNVERIFIED_FRESH + 1),
        'mine' => R::gameExcerpt($lines, 7, 9, 1, 100000, 0, 101000),
        'before' => R::gameExcerpt($lines, 7, 9, 2, 100500, 100400, 101000),
        'cutoff' => R::gameExcerpt($lines, 7, 9, 2, 100500, 100600, 101000),
        'note' => R::note("  a\\nb  "),
      ]);`;
    const out = JSON.parse(execFileSync('php', ['-r', php]).toString());
    assert.equal(out.ok.row, 0);
    assert.deepEqual(out.ok.lines.map((l) => l.id), [1, 2], 'a third player\'s line never comes');
    assert.equal(out.ok.lines[1].reported, true);
    assert.equal(out.old, null);
    assert.equal(out.mine, null, 'your own line is not reportable');
    assert.deepEqual(out.before.lines.map((l) => l.id), [2], 'lines from before reports began stay out');
    assert.equal(out.cutoff, null, 'a line from before reports began is refused');
    assert.equal(out.note, 'a b');
  });

  it('restrictions reach the ticket, the web\'s say and IMs; a purge and a delete reach the server', () => {
    assert.match(site('src/RealtimeTicket.php'), /\$payload\['mod'\] = \$mod;/);
    const hist = site('src/ChatHistory.php');
    assert.match(hist, /Moderation::silenced\(\$db, \$me\)/);
    assert.match(hist, /Moderation::imRestricted\(\$db, \$me, \(int\) \$with\)/);
    assert.match(hist, /case 'purge':/);
    assert.match(hist, /case 'flag':/);
    const mod = site('src/Moderation.php');
    for (const call of ['mod_restrict', 'mod_purge', 'im_delete', 'chat_delete', 'ban', 'unban', 'message']) {
      assert.ok(mod.includes(`'${call}'`) || hist.includes(`'${call}'`), call);
    }
    assert.match(mod, /A purge is final/);
    assert.match(site('src/Buddies.php'), /ModReports::afterBlock\(\$db, \$id\)/);
    const tables = JSON.parse(site('minn.json')).tables;
    for (const t of ['groddle_mod_reports', 'groddle_mod_restrictions', 'groddle_mod_tokens', 'groddle_mod_actions']) assert.ok(tables[t], t);
    assert.ok(tables.groddle_im_lines.some((c) => c.startsWith('deleted_ms ')), 'IM lines can be marked deleted (additive)');
  });
});

describe('the realtime server\'s half (moderation.go, modsignals.go)', { skip: skipWithoutServer }, () => {
  const go = (f) => readFileSync(serverPath(f), 'utf8');
  it('purge, restrictions and IM deletes are the site\'s signed calls; signals carry no words', () => {
    const m = go('moderation.go');
    for (const call of ['mod_restrict', 'mod_purge', 'im_delete']) assert.match(m, new RegExp(`serviceHandlers\\["${call}"\\]`));
    assert.match(m, /"t": "chat_purged"/);
    assert.match(m, /"t": "im_deleted"/);
    const s = go('modsignals.go');
    assert.doesNotMatch(s, /Text:/, 'a flag has no text');
    for (const k of ['modFanoutFlag', 'modRefusedFlag', 'modFilteredFlag', 'modChatFlag']) assert.match(s, new RegExp(`${k}\\s+= \\d+`));
    assert.match(go('im.go'), /modIMRestrictedLocked\(from, to\)/);
    assert.match(go('im.go'), /signalIMSentLocked\(from, name, to, l\.Text != text\)/);
  });
});
