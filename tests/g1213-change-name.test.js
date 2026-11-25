/**
 * G1213 (report #636): a player changes their character's name in the multiplayer Account panel.
 * Glitch's Account page had "Change name" for 100 currants about once in two months; Austin
 * 2026-11-23: "1000 currants and a month cooldown".
 *
 * - The game (js/change-name.js, minn-account-core nameChange/changeName, realtime-client "renamed",
 *   the Account panel): checks first, asks before charging, applies the receipt once.
 * - The site (groddle-afternoon-site src/CharacterName.php) on a throwaway MariaDB database
 *   (tests/fixtures/character-name/character-name.php): the name rules, the 30 day wait, the 1,000
 *   currants out of the ledger in the same transaction, the old address, "formerly" for 30 days.
 * - The realtime server's rename call (groddle-afternoon-server rename.go) is tested in Go; here only
 *   that the site calls it and the server handles it.
 *
 * Run: GRODDLE_SITE_DIR=<site> GRODDLE_SERVER_DIR=<server> node --test tests/g1213-change-name.test.js
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { SITE_DIR, serverPath, sitePath, skipWithoutServer, skipWithoutSite } from '../tools/repos.mjs';
import { CHANGE_NAME_COPY, RENAME_COST, RENAME_DAYS, applyRename, mountChangeName, renameDate, renameProblem } from '../public/js/change-name.js?v=4685ccda';
import { createMinnAccountCore } from '../public/js/minn-account-core.js?v=5baee954';
import { createRealtimeClient } from '../public/js/realtime-client.js?v=9471ca67';
import { PHP } from './php.js';

const root = join(import.meta.dirname, '..');
const pub = (f) => readFileSync(join(root, 'public', f), 'utf8');
const BASE = 'https://groddle.localhost/';
const flush = () => new Promise((r) => setImmediate(r));
const NOW = 1_800_000_000;

/** A purse, a trade slice's applied list and the calls the game would make. */
function fakeEngine(currants = 1500) {
  const applied = new Set();
  const calls = [];
  return {
    pc: { currants },
    applied,
    calls,
    query(name, op) {
      if (name !== 'ledgerReceipt') return undefined;
      if (applied.has(op)) return false;
      applied.add(op);
      return true;
    },
    pushActivity: (t) => calls.push(['activity', t]),
    toast: (t) => calls.push(['toast', t]),
    setData: (k, v) => calls.push(['data', k, v]),
    refreshPack: () => calls.push(['refresh']),
    save: () => calls.push(['save']),
  };
}

const renamed = { ok: true, status: 'renamed', player: { id: 7, name: 'Ada Two' }, was: 'Ada', receipt: { op: 'rename-0123456789abcdef', gave: { items: [], currants: 1000 }, got: { items: [], currants: 0 } }, nextAt: NOW + 30 * 86400, live: true };

describe('G1213: Change name in the game', () => {
  it('costs 1,000 currants once in 30 days (Austin 2026-11-23), in plain words with no em dashes', () => {
    assert.equal(RENAME_COST, 1000);
    assert.equal(RENAME_DAYS, 30);
    assert.equal(CHANGE_NAME_COPY.help(), 'Costs 1,000 currants. You can change it once every 30 days.');
    assert.equal(CHANGE_NAME_COPY.confirm('Ada', 'Ada Two'), "Change your name from Ada to Ada Two for 1,000 currants? You can't change it again for 30 days.");
    for (const v of Object.values(CHANGE_NAME_COPY)) {
      const text = typeof v === 'function' ? v('A', 'B') : v;
      assert.doesNotMatch(String(text), /—/);
    }
  });

  it('checks before asking: the new character name rules, the same name, the wait with its date, the purse', () => {
    const state = { name: 'Ada', cost: 1000, nextAt: null, currants: 1500 };
    assert.equal(renameProblem('Ada Two', state, { purse: 1500, now: NOW }), '');
    assert.match(renameProblem('x', state, { now: NOW }), /2 to 19/);
    assert.match(renameProblem('-Ada', state, { now: NOW }), /2 to 19/);
    assert.equal(renameProblem('Ada', state, { now: NOW }), CHANGE_NAME_COPY.same);
    assert.equal(renameProblem('ADA', state, { purse: 1500, now: NOW }), '', 'only the letter case is a change');
    assert.equal(renameProblem('Ada Two', { ...state, nextAt: NOW + 3 * 86400 }, { now: NOW }), `You can change your name again on ${renameDate(NOW + 3 * 86400)}.`);
    assert.equal(renameProblem('Ada Two', state, { purse: 999, now: NOW }), 'Changing your name costs 1,000 currants. You have 999.');
    assert.equal(renameDate(Date.UTC(2026, 11, 23, 12) / 1000), 'December 23');
  });

  it('applies the receipt once: the purse loses 1,000 once, the boot data takes the new name, the game saves', () => {
    const engine = fakeEngine(1500);
    const scope = { GRODDLE_MP_BOOT: { player: { id: 7, name: 'Ada' } } };
    assert.equal(applyRename(engine, renamed, { scope }), true);
    assert.equal(engine.pc.currants, 500);
    assert.equal(scope.GRODDLE_MP_BOOT.player.name, 'Ada Two');
    assert.ok(engine.applied.has('rename-0123456789abcdef'), 'listed in the trade slice\'s applied list');
    assert.ok(engine.calls.some((c) => c[0] === 'save'));
    assert.ok(engine.calls.some((c) => c[0] === 'toast' && c[1] === "You're Ada Two now. 1,000 currants were taken from your purse."));
    assert.equal(applyRename(engine, renamed, { scope }), false, 'a second time (a load caught it up) takes nothing');
    assert.equal(engine.currants ?? engine.pc.currants, 500);
  });

  it('the account calls: GET and POST characters/name, refusals keep the site\'s words and the next date', async () => {
    const seen = [];
    const answers = [
      { status: 200, body: { name: 'Ada', cost: 1000, days: 30, nextAt: null, currants: 1500, formerly: null } },
      { status: 200, body: { ...renamed, ok: undefined } },
      { status: 429, body: { code: 'name_change_wait', message: 'You can change your name once every 30 days. Your next change is allowed on December 23 (in 30 days).', fields: {}, nextAt: NOW } },
    ];
    const fn = async (url, init = {}) => {
      seen.push({ url: String(url), method: init.method || 'GET', body: init.body });
      const a = answers.shift();
      return { status: a.status, ok: a.status < 300, headers: { get: () => null }, json: async () => a.body };
    };
    const account = createMinnAccountCore({ baseUri: BASE, fetch: fn, nonce: 'abcdef0123' });
    assert.equal((await account.nameChange()).cost, 1000);
    const ok = await account.changeName('  Ada   Two ');
    assert.equal(ok.ok, true);
    assert.equal(ok.receipt.op, 'rename-0123456789abcdef');
    const wait = await account.changeName('Ada Three');
    assert.deepEqual([wait.ok, wait.code, wait.status, wait.nextAt], [false, 'name_change_wait', 429, NOW]);
    assert.match(wait.message, /next change is allowed on December 23/);
    assert.deepEqual(seen.map((s) => [s.method, s.url.replace(BASE, '')]), [['GET', 'wp-json/groddle/v1/characters/name'], ['POST', 'wp-json/groddle/v1/characters/name'], ['POST', 'wp-json/groddle/v1/characters/name']]);
    assert.equal(JSON.parse(seen[1].body).name, 'Ada Two');
  });

  it('asks before charging: nothing is sent until Yes; Cancel sends nothing; done shows the new name', async () => {
    const doc = fakeDocument();
    const host = doc.createElement('div');
    const sent = [];
    const account = {
      nameChange: async () => ({ name: 'Ada', cost: 1000, days: 30, nextAt: null, currants: 1500, formerly: null }),
      changeName: async (name) => { sent.push(name); return { ...renamed, player: { id: 7, name } }; },
    };
    const engine = fakeEngine(1500);
    const heard = [];
    const { ready } = mountChangeName(host, { account, engine, doc, scope: {}, onRenamed: (r) => heard.push(r) });
    await ready;
    const q = (attr) => find(host, attr);
    assert.equal(q('data-change-name-now').textContent, 'Now: Ada');
    q('data-change-name-input').value = 'Ada Two';
    q('data-account-change-name').fire('submit');
    assert.equal(q('data-change-name-confirm').hidden, false, 'the question shows');
    assert.equal(q('data-change-name-confirm-text').textContent, CHANGE_NAME_COPY.confirm('Ada', 'Ada Two'));
    assert.deepEqual(sent, [], 'nothing sent yet');
    q('data-change-name-no').fire('click');
    assert.equal(q('data-change-name-confirm').hidden, true);
    assert.deepEqual(sent, [], 'Cancel sends nothing');
    q('data-account-change-name').fire('submit');
    await q('data-change-name-yes').fire('click');
    await flush();
    assert.deepEqual(sent, ['Ada Two']);
    assert.equal(engine.pc.currants, 500);
    assert.equal(q('data-change-name-now').textContent, 'Now: Ada Two');
    assert.equal(q('data-change-name-said').textContent, "You're Ada Two now. 1,000 currants were taken from your purse.");
    assert.equal(q('data-change-name-formerly').textContent, CHANGE_NAME_COPY.formerly('Ada'));
    assert.equal(q('data-change-name-input').disabled, true, 'the wait starts');
    assert.deepEqual(heard, [{ name: 'Ada Two', was: 'Ada' }]);
  });

  it('a purse short of 1,000 never reaches the question', async () => {
    const doc = fakeDocument();
    const host = doc.createElement('div');
    const account = { nameChange: async () => ({ name: 'Ada', cost: 1000, nextAt: null, currants: 400 }), changeName: async () => assert.fail('sent') };
    const { ready } = mountChangeName(host, { account, engine: fakeEngine(400), doc, scope: {} });
    await ready;
    find(host, 'data-change-name-input').value = 'Ada Two';
    find(host, 'data-account-change-name').fire('submit');
    assert.equal(find(host, 'data-change-name-confirm').hidden, true);
    assert.match(find(host, 'data-change-name-input').getAttribute('aria-invalid'), /true/);
  });

  it('the Account panel mounts it under the email and password, and its Playing as line follows', () => {
    const panel = pub('js/features/account-backup-feature.js');
    assert.match(panel, /import \{ mountChangeName \} from '\.\.\/change-name\.js\?v=[0-9a-f]{8}';/);
    assert.match(panel, /mountChangeName\(host\.querySelector\('\[data-account-settings\]'\) \|\| host, \{/);
    assert.match(panel, /onRenamed: \(\{ name \}\) => \{ playing\.textContent = `Playing as \$\{name\}\./);
  });
});

describe('G1213: everyone sees the new name at once (realtime-client)', () => {
  it('a renamed message renames a player on your street, and you when it is you', async () => {
    let sock = null;
    class FakeSocket {
      constructor(url) { this.url = url; this.readyState = 0; sock = this; }
      send() {}
      close() { this.readyState = 3; }
    }
    const client = createRealtimeClient({ ticket: async () => ({ ticket: 't', path: '/ws' }), baseUri: BASE, WebSocket: FakeSocket, setTimeout: () => 0, clearTimeout: () => {}, now: () => 0, random: () => 0.5 });
    const events = [];
    for (const t of ['renamed', 'roster']) client.on(t, (d) => events.push([t, d]));
    client.start();
    await flush();
    sock.readyState = 1;
    sock.onopen?.();
    const receive = (m) => sock.onmessage({ data: JSON.stringify(m) });
    receive({ t: 'hello', you: { id: 7, name: 'Ada' } });
    client.join({ street: 'S1' });
    receive({ t: 'street', street: 'S1', players: [{ id: 8, name: 'Bo' }] });
    events.length = 0;
    receive({ t: 'renamed', id: 8, name: 'Bo Two', was: 'Bo' });
    assert.deepEqual(events[0], ['renamed', { id: 8, name: 'Bo Two', was: 'Bo', mine: false, here: true }]);
    assert.equal(events[1][0], 'roster');
    assert.equal(client.players[0].name, 'Bo Two');
    receive({ t: 'renamed', id: 7, name: 'Ada Two', was: 'Ada' });
    assert.equal(client.me.name, 'Ada Two');
    receive({ t: 'renamed', id: 99, name: 'Cy Two', was: 'Cy' });
    assert.deepEqual(events.at(-1), ['renamed', { id: 99, name: 'Cy Two', was: 'Cy', mine: false, here: false }]);
    receive({ t: 'renamed', id: 8, name: '  ' });
    assert.equal(client.players[0].name, 'Bo Two', 'an empty name is ignored');
  });

  it('the street redraws a renamed Glitch with its new nameplate and notes it in Local chat', () => {
    const feature = pub('js/features/realtime-feature.js');
    assert.match(feature, /if \(r && r\.name !== p\.name\) \{\s*dropRemote\(r\);\s*\}\s*if \(!remotes\.has\(p\.id\)\) remotes\.set\(p\.id, makeRemote\(p\)\);/);
    assert.match(feature, /client\.on\('renamed', \(r\) => \{ if \(r\.here && !r\.mine && r\.was && !engine\.query\?\.\('realtimeHidden', r\.id\)\) addLog\(\{ note: true, text: `\$\{r\.was\} is now called \$\{r\.name\}\.` \}\); \}\);/);
  });
});

describe('G1213: the site keeps it and tells the realtime server', { skip: skipWithoutSite }, () => {
  const src = (f) => readFileSync(sitePath('src', f), 'utf8');

  it('the route is registered, priced and timed as Austin ruled, and calls the server at once', () => {
    assert.match(src('Extension.php'), /new CharacterRoutes\(\$minn\), new CharacterName\(\$minn\)/);
    const cn = src('CharacterName.php');
    assert.match(cn, /public const COST = 1000;/);
    assert.match(cn, /public const DAYS = 30;/);
    assert.match(cn, /#\[Route\(Method::Post, '\/groddle\/v1\/characters\/name', policy: new Policy\(Access::SignedIn\)\)\]/);
    assert.match(cn, /Logins::guard\(\$request, \$me\);/);
    assert.match(cn, /\$out = Ledger::atomically\(\$db, fn \(\) => \$this->rename\(\$me, \$name, time\(\)\)\);/);
    assert.match(cn, /\(new RealtimeCall\(\$this->minn\)\)->post\('rename', \['player' => \$me, 'name' => \$name\]\)/);
    assert.match(cn, /\$state = \$ledger->lock\(\$me, \$now\);[\s\S]*\$next = self::nextAt\(\$db, \$me, \$now\);/, 'the ledger row is locked before the wait is read');
    assert.doesNotMatch(cn.match(/WORDS = \[[\s\S]*?\];/)[0] + cn.match(/function waitWords[\s\S]*?\n {4}\}/)[0], /—/);
  });

  it('shows "formerly" on the profile page and in the /chat/ people lists', () => {
    assert.match(src('PlayerPages.php'), /'formerly' => CharacterName::formerly\(\$db, \[\$id\], time\(\)\)\[\$id\] \?\? null,/);
    assert.match(src('PlayerPages.php'), /<p class="profile-formerly">formerly ' \. Html::esc\(\$who\['formerly'\]\)/);
    assert.match(src('ChatPeople.php'), /\$formerly = CharacterName::formerly\(\$db, array_keys\(\$names\), time\(\)\);/);
    const chat = readFileSync(sitePath('community/chat-app.js'), 'utf8');
    assert.equal((chat.match(/\.\.\.formerlyNote\(info\)/g) || []).length, 2, 'the buddies list and Who\'s around');
    assert.match(chat, /`formerly \$\{info\.formerly\}`/);
  });

  it('the realtime server answers the site\'s rename call', { skip: skipWithoutServer }, () => {
    const go = readFileSync(serverPath('rename.go'), 'utf8');
    assert.match(go, /func init\(\) \{ serviceHandlers\["rename"\] = renameService \}/);
    assert.match(go, /b, _ := json\.Marshal\(map\[string\]any\{"t": "renamed", "id": id, "name": name, "was": was\}\)/);
  });

  const engineDir = process.env.MINN_ENGINE_DIR || join(homedir(), 'Cove/Sites/minn-engine.localhost/public/minn');
  const hasPhp = spawnSync(PHP, ['-r', 'exit(extension_loaded("mysqli") ? 0 : 1);']).status === 0;
  function mysql() {
    const env = String(process.env.GRODDLE_TEST_MYSQL || '').trim();
    if (env) {
      const [host, user, ...pass] = env.split(/\s+/);
      return { host, user, pass: pass.join(' ') };
    }
    const cfg = join(homedir(), 'Cove/Sites/groddle.localhost/public/wp-config.php');
    if (!existsSync(cfg)) return null;
    const text = readFileSync(cfg, 'utf8');
    const def = (k) => text.match(new RegExp(`define\\(\\s*'${k}',\\s*'([^']*)'`))?.[1];
    return def('DB_HOST') && def('DB_USER') ? { host: def('DB_HOST'), user: def('DB_USER'), pass: def('DB_PASSWORD') || '' } : null;
  }
  const db = mysql();
  const reachable = db && hasPhp && spawnSync(PHP, ['-r', 'mysqli_report(MYSQLI_REPORT_OFF); $m = @new mysqli($argv[1], $argv[2], $argv[3]); exit($m->connect_errno ? 1 : 0);', db.host, db.user, db.pass]).status === 0;
  const skipDb = (!hasPhp && 'no php with mysqli')
    || (!existsSync(join(engineDir, 'src/Minn/Autoloader.php')) && 'Minn Engine not found (set MINN_ENGINE_DIR)')
    || (!reachable && 'no MariaDB to make a throwaway database on (set GRODDLE_TEST_MYSQL)');

  it('on a throwaway database: the rules, the wait, the cost in the same transaction, the old address, formerly', { skip: skipDb }, () => {
    const r = JSON.parse(execFileSync(PHP, [join(root, 'tests/fixtures/character-name/character-name.php'), engineDir, SITE_DIR, db.host, db.user, db.pass], { timeout: 90000 }).toString());
    assert.equal(r.error, undefined, r.error);
    assert.equal(r.dropped, true);
    assert.deepEqual(r.before.body, { name: 'Ada', cost: 1000, days: 30, nextAt: null, currants: 1500, formerly: null });
    const code = (a) => [a.status, a.body?.code ?? a.code];
    assert.deepEqual(code(r.refusals.short), [422, 'groddle_invalid']);
    assert.deepEqual(code(r.refusals.filter), [422, 'groddle_invalid'], 'the word filter');
    assert.deepEqual(code(r.refusals.taken), [422, 'name_taken'], 'another character\'s name, letter case aside');
    assert.deepEqual(code(r.refusals.same), [409, 'name_same']);
    assert.deepEqual(code(r.refusals.poor), [409, 'name_change_currants']);
    assert.equal(r.refusals.poor.body.message, 'Changing your name costs 1,000 currants. You have 300.');
    assert.deepEqual(code(r.refusals.otherWindow), [409, 'character_changed']);
    assert.deepEqual(r.afterRefusals, { currants: 1500, trades: 0, renames: 0 }, 'a refusal writes and spends nothing');
    assert.equal(r.renamed.status, 200);
    assert.equal(r.renamed.body.player.name, 'Ada Two', 'spaces tidied as a new character\'s are');
    assert.match(r.renamed.body.receipt.op, /^rename-[0-9a-f]{16}$/);
    assert.equal(r.renamed.body.live, false, 'no realtime server here');
    const s = r.stored;
    assert.equal(s.currants, 500, '1,000 out of the ledger');
    assert.deepEqual([s.name, s.display, s.nickname], ['Ada Two', 'Ada Two', 'Ada Two']);
    assert.deepEqual([s.trade.status, s.trade.a_id, s.trade.b_id, JSON.parse(s.trade.a_gave).currants, s.trade.waiting], ['settled', 10, 0, 1000, 1], 'a settled trade with nobody the save has yet to apply');
    assert.deepEqual(s.pending, [r.renamed.body.receipt.op], 'a load applies it if the game never did (Ledger::catchUp)');
    assert.deepEqual(s.row, { user_id: 10, old_name: 'Ada', old_slug: 'ada', new_name: 'Ada Two', admin_user_id: 0 });
    assert.equal(s.log.why, 'rename');
    assert.equal(s.oldHeld, true, 'the old name is held, not free');
    assert.deepEqual(r.redirect, [10, 'ada-two'], 'the old /players/ address finds them');
    assert.equal(r.after.body.formerly, 'Ada');
    assert.equal(r.after.body.nextAt, r.renamed.body.nextAt);
    assert.deepEqual(code(r.again), [429, 'name_change_wait']);
    assert.match(r.again.body.message, /^You can change your name once every 30 days\. Your next change is allowed on [A-Z][a-z]+ \d{1,2} \(in 30 days\)\.$/);
    assert.equal(r.nextAtAfter30, null);
    assert.match(r.waitWords, /\(in 4 days\)\.$/);
    assert.deepEqual(r.formerly, { now: { 10: 'Ada' }, day29: { 10: 'Ada' }, day31: [] });
    assert.equal(r.caseOnly.status, 200, 'only the letter case of your own name');
    assert.deepEqual(r.caseFormerly, [], 'and no "formerly" for it');
    assert.equal(r.adminRename.status, 200);
    assert.deepEqual(r.afterAdmin, { formerly: [], nextAt: null }, 'an administrator\'s rename shows no old name and starts no wait');
    assert.equal(r.afterAdminChange.status, 200);
    assert.deepEqual(r.afterAdminFormerly, { 40: 'Eve Renamed' });
    assert.deepEqual(code(r.banned), [403, 'groddle_suspended']);
    // The old name is held for 30 days, as a retired character's name is (Logins::NAME_HOLD): nobody can take it and pass as them.
    const h = r.hold;
    assert.deepEqual([h.other, h.self, h.day29, h.day31], [true, false, true, false], 'held from others, letter case aside, for 30 days; never from its owner');
    assert.deepEqual(code(h.newCharacter), [422, 'name_taken'], 'not as a new character');
    assert.deepEqual(code(h.otherRename), [422, 'name_taken'], 'not by another player\'s rename');
    assert.deepEqual(code(h.backTooSoon), [429, 'name_change_wait'], 'its owner takes it back only once the wait allows a change');
    assert.equal(h.backAfterWait.status, 200);
    assert.equal(h.backAfterWait.body.player.name, 'Ada');
    assert.deepEqual(r.adminHoldsNothing, { eve: false, eveRenamed: true }, 'an administrator\'s rename holds nothing; a player\'s own does');
  });
});

// —— A DOM just big enough for mountChangeName ——

function fakeDocument() {
  const make = (tag) => {
    const attrs = new Map();
    const listeners = {};
    const node = {
      tagName: tag.toUpperCase(),
      children: [],
      dataset: {},
      textContent: '',
      value: '',
      disabled: false,
      hidden: false,
      setAttribute(k, v) { attrs.set(k, String(v)); if (k === 'hidden') node.hidden = true; },
      getAttribute: (k) => (attrs.has(k) ? attrs.get(k) : null),
      hasAttribute: (k) => attrs.has(k),
      removeAttribute: (k) => attrs.delete(k),
      append(...kids) { node.children.push(...kids); },
      focus() {},
      addEventListener(type, fn) { (listeners[type] ||= []).push(fn); },
      async fire(type) { for (const fn of listeners[type] || []) await fn({ preventDefault() {}, type }); },
    };
    return node;
  };
  return { createElement: make };
}

function find(node, attr) {
  if (node.hasAttribute?.(attr)) return node;
  for (const kid of node.children || []) {
    const hit = find(kid, attr);
    if (hit) return hit;
  }
  return null;
}
