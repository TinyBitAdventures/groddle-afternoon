/**
 * Moderation that Grok Bot can run (Austin 2026-11-09), without IMs: Austin then scrapped IM reports
 * ("maybe scrap looking at IMs. I don't want to deal with privacy changes"), since the live privacy
 * policy promises only an IM's two players read it, administrators included. What a purge does to
 * open windows (js/chat-purge.js, features/chat-purge-feature.js), the site's flags, token and routes
 * (groddle-afternoon-site src/ModReports.php, ModTokens.php, Moderation.php, ChatHistory.php) and the
 * realtime server's half (groddle-afternoon-server moderation.go, modsignals.go).
 *
 * The rules that matter most are checked over the source too: no route returns an IM's words, reported
 * or not, and nothing in the game reports one; a moderator token reaches no other route; moderation
 * refuses administrators. GRODDLE_LIVE=1 also asks groddle.localhost that POST mod/report/im is gone.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { SITE_DIR, serverPath, sitePath, skipWithoutServer, skipWithoutSite } from '../tools/repos.mjs';
import { purgeOf, purged, withoutPurged } from '../public/js/chat-purge.js?v=6c41f62d';

const root = join(import.meta.dirname, '..');
const game = (f) => readFileSync(join(root, 'public', f), 'utf8');
const site = (f) => readFileSync(sitePath(f), 'utf8');
const hasPhp = spawnSync('php', ['-v']).status === 0;

describe('nothing in the game reports an IM', () => {
  it('no Report on an IM line or a conversation, no report window, no report call, in either skin', () => {
    assert.equal(existsSync(join(root, 'public/js/im-report.js')), false);
    assert.equal(existsSync(join(root, 'public/js/features/im-report-feature.js')), false);
    const drawer = game('js/ui/social-drawer.js');
    assert.doesNotMatch(drawer, /reporting|data-line-report|data-im-report|REPORT_TEXT/);
    const im = game('js/features/player-im-feature.js');
    assert.doesNotMatch(im, /data-im-report|im_deleted|imReport|imLines/);
    assert.doesNotMatch(game('js/features/index.js'), /imReportFeature/);
    assert.doesNotMatch(game('js/minn-account.js'), /reportIm|mod\/report/);
    assert.doesNotMatch(game('js/features/buddies-feature.js'), /blockPlayer/);
    for (const css of [game('style.css'), game('css/classic.css')]) assert.doesNotMatch(css, /\.line-report|\.mod-report-|can-report/);
  });
});

describe('a purge leaves every open window', () => {
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

  it('the drawer, the channels and the IMs all handle chat_purged', () => {
    assert.match(game('js/ui/social-drawer.js'), /purge\(test\) \{/);
    assert.match(game('js/features/groups-feature.js'), /client\.on\('msg:chat_purged'/);
    assert.match(game('js/features/player-im-feature.js'), /client\.on\('msg:chat_purged'/);
    const feat = game('js/features/chat-purge-feature.js');
    assert.match(feat, /client\.on\('msg:chat_purged'/);
    assert.match(feat, /engine\.mode !== 'multiplayer'/, 'solo: nothing');
    assert.match(game('js/features/index.js'), /FEATURES\.push\(chatPurgeFeature\)/);
  });
});

describe('the site: the queue, the token and the routes', { skip: skipWithoutSite }, () => {
  it('no route returns an IM\'s words, reported or not, and POST mod/report/im is gone', () => {
    // Every query on groddle_im_lines lives in ChatHistory: the two players' own routes, the server's
    // ingest and a purge (which empties words by player id). Moderation and ModReports never touch it.
    const files = readdirSync(sitePath('src')).filter((f) => f.endsWith('.php'));
    const readers = files.filter((f) => /ChatHistory::IMS|self::IMS|groddle_im_lines/.test(site(`src/${f}`)));
    assert.deepEqual(readers, ['ChatHistory.php']);
    for (const f of files) {
      const src = site(`src/${f}`);
      assert.doesNotMatch(src, /report\/im|reportIm|im_reports_from|gameExcerpt|deleteIm|'im_delete'/, `${f} still reports or deletes an IM`);
    }
    const routes = files.flatMap((f) => [...site(`src/${f}`).matchAll(/#\[Route\(Method::\w+, '([^']+)'/g)].map((m) => m[1]));
    assert.ok(routes.length > 100);
    assert.ok(!routes.some((r) => /^\/groddle\/v1\/mod\/report\//.test(r)), 'no route answers mod/report/*: the router 404s');
    assert.doesNotMatch(site('console/moderation.js'), /r\.lines|reporter|lineDeletable|delete_line', \{ report/);
    const hist = site('src/ChatHistory.php');
    // The players' own IM routes leave a purged line out.
    for (const name of ['conversations', 'ims', 'imThread', 'imNotices']) {
      const body = hist.slice(hist.indexOf(`function ${name}(`), hist.indexOf('function ', hist.indexOf(`function ${name}(`) + 10));
      assert.match(body, /deleted_ms = 0/, `${name} leaves deleted IM lines out`);
    }
    // A purge empties an IM's words at once, and answers counts only.
    assert.match(hist, /SET text = '', reactions = NULL, deleted_ms = \?, deleted_by = \? WHERE from_id = \?/);
    assert.match(hist, /return \['lines' => \$lines, 'ims' => \$ims\];/);
    const mod = site('src/Moderation.php');
    const purge = mod.slice(mod.indexOf('public function purge('), mod.indexOf('public function', mod.indexOf('public function purge(') + 10));
    assert.doesNotMatch(purge, /text'\]|\['lines'\]\)|->rows\(/, 'the purge answer is counts, never lines');
    // The queue keeps no words: its IM-report columns are gone (nothing is live, so dropped outright).
    const cols = JSON.parse(site('minn.json')).tables.groddle_mod_reports.map((c) => c.split(' ')[0]);
    for (const c of ['excerpt', 'verified', 'im_row', 'note', 'reporter_id']) assert.ok(!cols.includes(c), c);
  });

  it('POST mod/report/im answers 404 on groddle.localhost', { skip: process.env.GRODDLE_LIVE !== '1' && 'GRODDLE_LIVE=1 only' }, async () => {
    const r = await fetch('https://groddle.localhost/wp-json/groddle/v1/mod/report/im', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ with: 9, line: 1, at: 1 }),
    });
    assert.equal(r.status, 404);
    assert.equal((await r.json()).code, 'rest_no_route');
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

  it('restrictions reach the ticket, the web\'s say and IMs; a purge and a delete reach the server', () => {
    assert.match(site('src/RealtimeTicket.php'), /\$payload\['mod'\] = \$mod;/);
    const hist = site('src/ChatHistory.php');
    assert.match(hist, /Moderation::silenced\(\$db, \$me\)/);
    assert.match(hist, /Moderation::imRestricted\(\$db, \$me, \(int\) \$with\)/);
    assert.match(hist, /case 'purge':/);
    assert.match(hist, /case 'flag':/);
    const mod = site('src/Moderation.php');
    for (const call of ['mod_restrict', 'mod_purge', 'chat_delete', 'ban', 'unban', 'message']) {
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
  it('purge and restrictions are the site\'s signed calls, no call names an IM line; signals carry no words', () => {
    const m = go('moderation.go');
    for (const call of ['mod_restrict', 'mod_purge']) assert.match(m, new RegExp(`serviceHandlers\\["${call}"\\]`));
    assert.match(m, /"t": "chat_purged"/);
    assert.doesNotMatch(m, /im_delete|im_deleted/);
    assert.doesNotMatch(go('im.go'), /im_deleted/);
    const s = go('modsignals.go');
    assert.doesNotMatch(s, /Text:/, 'a flag has no text');
    for (const k of ['modFanoutFlag', 'modRefusedFlag', 'modFilteredFlag', 'modChatFlag']) assert.match(s, new RegExp(`${k}\\s+= \\d+`));
    assert.match(go('im.go'), /modIMRestrictedLocked\(from, to\)/);
    assert.match(go('im.go'), /signalIMSentLocked\(from, name, to, l\.Text != text\)/);
  });
});
