/**
 * The administrators' console (/console/): the site's page and routes
 * (groddle-afternoon-site src/AdminConsole.php, AdminConsolePage.php,
 * console/console.js), the realtime server's signed calls (groddle-afternoon-server
 * admin.go), and what a connected game does with them (js/admin-console-mp.js,
 * the realtime client's booted and suspended states, the /play/online/ gate).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { SITE_DIR, sitePath, serverPath, skipWithoutSite, skipWithoutServer, HAS_SITE } from '../tools/repos.mjs';
import { ADMIN_TEXT, ADMIN_TEXT_MAX, adminGiveGoods, adminMessageText, applyAdminGive, applyAdminRefill, bootedLine, showAdminMessage, showBooted } from '../public/js/admin-console-mp.js?v=g407-1';
import { CLOSE_BANNED, CLOSE_BOOTED, createRealtimeClient } from '../public/js/realtime-client.js?v=g409-1';
import { statusText } from '../public/js/features/realtime-feature.js?v=g442-6';
import { GATE_COPY, suspendedNow } from '../public/js/online-boot.js?v=g436-2';

const root = join(import.meta.dirname, '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const hasPhp = spawnSync('php', ['-v']).status === 0;
const flush = () => new Promise((r) => setImmediate(r));

function fakeEngine({ applied = [] } = {}) {
  const seen = new Set(applied);
  const calls = { prompts: [], toasts: [], activity: [], data: {}, saves: 0, sounds: [] };
  return {
    calls,
    inv: { cherry: 2 },
    pc: { currants: 10, mood: 20, energy: 30, energyMax: 140 },
    query(name, id) {
      if (name !== 'ledgerReceipt') return null;
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    },
    prompt: (o) => calls.prompts.push(o),
    toast: (t) => calls.toasts.push(t),
    pushActivity: (t) => calls.activity.push(t),
    setData: (k, v) => { calls.data[k] = v; },
    playSound: (s) => calls.sounds.push(s),
    refreshPack() {},
    save() { calls.saves += 1; },
  };
}

describe('what the console does to a connected game (js/admin-console-mp.js)', () => {
  it('a message opens "Message from an administrator" with the text as plain text, capped', () => {
    const e = fakeEngine();
    assert.equal(showAdminMessage(e, { text: '  <b>Hello</b> there  ' }), true);
    assert.equal(e.calls.prompts[0].title, 'Message from an administrator');
    assert.equal(e.calls.prompts[0].modal, true);
    assert.equal(e.calls.prompts[0].text, '<b>Hello</b> there', 'kept as text; the dialog sets textContent');
    assert.equal([...adminMessageText({ text: 'é'.repeat(ADMIN_TEXT_MAX + 9) })].length, ADMIN_TEXT_MAX);
    assert.equal(showAdminMessage(e, { text: '   ' }), false);
    assert.equal(showAdminMessage(e, {}), false);
  });

  it('a boot says who and why; a ban adds that the account is suspended', () => {
    assert.equal(bootedLine({ reason: 'Take a break' }), 'An administrator signed you out: Take a break.');
    assert.equal(bootedLine({ reason: 'Spam!!' }), 'An administrator signed you out: Spam.');
    assert.equal(bootedLine({}), 'An administrator signed you out.');
    assert.equal(bootedLine({ reason: 'Spam', banned: true }), 'An administrator signed you out: Spam. This account is suspended.');
    const e = fakeEngine();
    showBooted(e, { reason: 'x', banned: true });
    assert.equal(e.calls.prompts[0].title, 'Account suspended');
  });

  it('a give is applied once through ledgerReceipt: items into the pack, currants onto the purse, the site\'s line', () => {
    const e = fakeEngine();
    const msg = { op: 'admin-give-0123456789abcdef', items: [{ c: 'cherry', n: 3 }, { c: 'meat', n: 1 }], currants: 50, text: 'An administrator gave you 3 Cherries, 1 Meat and 50 currants.' };
    assert.equal(applyAdminGive(e, msg), true);
    assert.equal(e.inv.cherry, 5);
    assert.equal(e.inv.meat, 1);
    assert.equal(e.pc.currants, 60);
    assert.deepEqual(e.calls.activity, [msg.text]);
    assert.equal(e.calls.saves, 1);
    assert.equal(applyAdminGive(e, msg), false, 'a second delivery (a reconnect, or the load already applied it) adds nothing');
    assert.equal(e.inv.cherry, 5);
    assert.equal(e.pc.currants, 60);
  });

  it('refuses what is not an admin give', () => {
    assert.equal(adminGiveGoods({ op: 'trade-1', currants: 5 }), null);
    assert.equal(adminGiveGoods({ op: 'admin-give-0123456789abcdef' }), null);
    assert.equal(adminGiveGoods({ op: 'admin-give-0123456789abcdef', items: [{ c: 'Bad Class', n: 1 }] }), null);
    assert.equal(adminGiveGoods({ op: 'admin-give-0123456789abcdef', items: [{ c: 'cherry', n: 0 }] }), null);
    assert.equal(adminGiveGoods({ op: 'admin-give-0123456789abcdef', currants: 7 }).text, ADMIN_TEXT.gave);
  });

  it('a refill fills mood and energy to the tank', () => {
    const e = fakeEngine();
    applyAdminRefill(e);
    assert.equal(e.pc.mood, 140);
    assert.equal(e.pc.energy, 140);
  });

  it('copy is plain, with no em-dashes', () => {
    assert.doesNotMatch(read('public/js/admin-console-mp.js'), /—/);
    assert.equal(statusText('booted'), 'Signed out by an administrator');
    assert.equal(statusText('suspended'), 'Account suspended');
  });
});

function fakeSockets() {
  const made = [];
  class FakeSocket {
    constructor(url) { this.url = url; this.readyState = 0; this.sent = []; made.push(this); }
    send(d) { this.sent.push(JSON.parse(d)); }
    close() { this.readyState = 3; }
    open() { this.readyState = 1; this.onopen?.(); }
    receive(m) { this.onmessage?.({ data: JSON.stringify(m) }); }
    drop(code) { this.readyState = 3; this.onclose?.({ code }); }
  }
  return { WebSocket: FakeSocket, made };
}

function client({ ticket } = {}) {
  const sockets = fakeSockets();
  const timers = [];
  let asked = 0;
  const c = createRealtimeClient({
    ticket: ticket || (async () => { asked += 1; return { ticket: `t${asked}`, path: '/ws' }; }),
    baseUri: 'https://groddle.localhost/play/online/',
    WebSocket: sockets.WebSocket,
    setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
    clearTimeout: () => {},
    random: () => 0.5,
  });
  return { c, sockets, timers, asked: () => asked };
}

describe('the realtime client after a console action', () => {
  for (const [code, state] of [[CLOSE_BOOTED, 'booted'], [CLOSE_BANNED, 'suspended']]) {
    it(`${code} stops at '${state}' and never reconnects by itself`, async () => {
      const t = client();
      const got = [];
      t.c.on('msg:booted', (m) => got.push(m));
      t.c.start();
      await flush();
      const ws = t.sockets.made[0];
      ws.open();
      ws.receive({ t: 'hello', you: { id: 7, name: 'Ada' } });
      ws.receive({ t: 'booted', reason: 'Spam', banned: code === CLOSE_BANNED });
      ws.drop(code);
      assert.equal(t.c.state, state);
      assert.equal(got[0].reason, 'Spam');
      for (const timer of t.timers.splice(0)) timer.fn();
      await flush();
      t.c.start();
      await flush();
      assert.equal(t.sockets.made.length, 1, 'no new socket');
    });
  }

  it("a suspended account's ticket refusal (403 groddle_suspended) stops at 'suspended'", async () => {
    const t = client({ ticket: async () => { throw Object.assign(new Error('no'), { status: 403, code: 'groddle_suspended' }); } });
    t.c.start();
    await flush();
    assert.equal(t.c.state, 'suspended');
    assert.equal(t.sockets.made.length, 0);
  });
});

describe('/play/online/ for a suspended account (js/online-boot.js)', () => {
  it('says so plainly', () => {
    assert.equal(GATE_COPY.suspended.body[0], 'This account is suspended.');
    assert.doesNotMatch(JSON.stringify(GATE_COPY.suspended), /—/);
  });

  it('asks groddle/v1/me with the nonce; anything but suspended true is not suspended', async () => {
    const account = { urls: { api: 'https://groddle.localhost/wp-json/groddle/v1/' }, nonce: 'abcdef0123' };
    const asked = [];
    const answer = (data, ok = true) => async (url, init) => { asked.push({ url, init }); return { ok, json: async () => data }; };
    assert.equal(await suspendedNow(account, { fetch: answer({ signedIn: true, suspended: true }) }), true);
    assert.equal(asked[0].url, 'https://groddle.localhost/wp-json/groddle/v1/me');
    assert.equal(asked[0].init.headers['X-WP-Nonce'], 'abcdef0123');
    assert.equal(await suspendedNow(account, { fetch: answer({ signedIn: true, suspended: false }) }), false);
    assert.equal(await suspendedNow(account, { fetch: answer({ signedIn: true }) }), false);
    assert.equal(await suspendedNow(account, { fetch: answer(null, false) }), false);
    assert.equal(await suspendedNow(account, { fetch: async () => { throw new Error('offline'); } }), false);
  });

  it('the save refusal shows the same gate', () => {
    assert.match(read('public/js/online-boot.js'), /err\?\.code === 'groddle_suspended' \? 'suspended'/);
  });
});

describe('the console page (groddle-afternoon-site console/console.js)', { skip: skipWithoutSite }, async () => {
  const mod = HAS_SITE ? await import(pathToFileURL(sitePath('console/console.js')).href) : {};

  it('reads how long someone has been online', () => {
    assert.equal(mod.onlineFor(42), '42 s');
    assert.equal(mod.onlineFor(12 * 60 + 5), '12 min');
    assert.equal(mod.onlineFor(3 * 3600 + 5 * 60), '3 h 05 min');
    assert.equal(mod.onlineFor(2 * 86400 + 4 * 3600), '2 d 4 h');
  });

  it('offers each player the actions that fit: never banning yourself or an administrator, unban for the banned', () => {
    const ids = (m) => m.filter((i) => i.enabled).map((i) => i.id);
    assert.deepEqual(ids(mod.menuFor({ id: 9 }, { me: 1, online: true })), ['message', 'teleport', 'give', 'refill', 'boot', 'ban']);
    assert.deepEqual(ids(mod.menuFor({ id: 9 }, { me: 1, online: false })), ['message', 'teleport', 'give', 'ban']);
    assert.deepEqual(ids(mod.menuFor({ id: 1, admin: true }, { me: 1, online: true })), ['message', 'give', 'refill']);
    assert.deepEqual(ids(mod.menuFor({ id: 2, admin: true }, { me: 1, online: true })), ['message', 'teleport', 'give', 'refill', 'boot']);
    assert.deepEqual(ids(mod.menuFor({ id: 9, banned: true }, { me: 1 })).slice(-1), ['unban']);
    assert.ok(mod.menuFor({ id: 2, admin: true }, { me: 1 }).find((i) => i.id === 'ban').reason);
  });

  it('searches streets and items', () => {
    const streets = [{ tsid: 'GA1', label: 'Hechey Track', hub: 'Groddle Meadow' }, { tsid: 'GA2', label: 'Gregarious Grange', hub: 'Groddle Meadow' }, { tsid: 'GA3', label: "Scribe's Weald", hub: 'Ix' }];
    assert.deepEqual(mod.findStreets(streets, 'track').map((s) => s.tsid), ['GA1']);
    assert.deepEqual(mod.findStreets(streets, 'scribes').map((s) => s.tsid), ['GA3']);
    assert.deepEqual(mod.findStreets(streets, 'ga2').map((s) => s.tsid), ['GA2']);
    assert.deepEqual(mod.findStreets(streets, 'g').map((s) => s.tsid), ['GA2', 'GA1']);
    const items = [{ c: 'cherry', name: 'Cherry', plural: 'Cherries' }, { c: 'cherry_pie', name: 'Cherry Pie', plural: 'Cherry Pies' }, { c: 'meat', name: 'Meat', plural: 'Meat' }];
    assert.deepEqual(mod.findItems(items, 'cherry').map((i) => i.c), ['cherry', 'cherry_pie']);
    assert.deepEqual(mod.findItems(items, 'pie').map((i) => i.c), ['cherry_pie']);
  });

  it('words each kind of action in the log', () => {
    const line = (kind, detail, delivery = 'live') => mod.logWords({ kind, detail, delivery, player: { id: 9, name: 'Ada' } });
    assert.equal(line('message', { text: 'hi' }), 'messaged Ada: “hi”');
    assert.equal(line('message', { text: 'hi' }, 'queued'), 'messaged Ada: “hi” (offline: waiting for their next connect)');
    assert.equal(line('teleport', { to: { label: 'Hechey Track' } }), 'moved Ada to Hechey Track');
    assert.equal(line('give', { text: '3 Cherries' }, 'saved'), 'gave Ada 3 Cherries (offline: their next load)');
    assert.equal(line('ban', { reason: 'Spam' }), 'banned Ada: Spam');
    assert.equal(line('boot', {}, 'offline'), 'signed Ada out (they were not online)');
  });

  it('sets what people wrote as text, and its copy has no em-dashes', () => {
    const src = readFileSync(sitePath('console/console.js'), 'utf8');
    assert.doesNotMatch(src, /innerHTML|insertAdjacentHTML|outerHTML/);
    assert.doesNotMatch(src, /—/);
    assert.match(src, /'aria-haspopup': 'menu'/);
    assert.match(src, /e\.shiftKey && e\.key === 'F10'/);
    assert.match(src, /e\.key === 'ContextMenu'/);
    assert.match(src, /contextmenu/);
  });
});

describe('the site routes (groddle-afternoon-site AdminConsole, AdminConsolePage)', { skip: skipWithoutSite || (!hasPhp && 'no php') }, () => {
  function php(code) {
    const out = execFileSync('php', ['-r', `foreach (['ServiceCall', 'AdminConsole'] as $c) require ${JSON.stringify(SITE_DIR)} . "/src/$c.php"; use Groddle\\Minn\\{AdminConsole, ServiceCall}; echo json_encode(${code}, JSON_UNESCAPED_UNICODE);`]);
    return JSON.parse(String(out));
  }

  it('keeps messages and reasons plain and short', () => {
    assert.equal(php(`AdminConsole::messageText("  Hi\\x07 there\\r\\n\\n\\n\\nSecond  ")`), 'Hi there\n\nSecond');
    assert.equal(php(`mb_strlen(AdminConsole::messageText(str_repeat('é', 600)))`), 500);
    assert.equal(php(`AdminConsole::messageText(['x'])`), '');
    assert.equal(php(`AdminConsole::reasonText("Take a\\nbreak\\t now")`), 'Take a break now');
    assert.equal(php(`mb_strlen(AdminConsole::reasonText(str_repeat('a', 300)))`), 200);
  });

  it('checks a give: tradeable classes only, caps, each once, something to give', () => {
    const goods = (body) => php(`AdminConsole::giveGoods(${body}, fn ($c) => in_array($c, ['cherry', 'meat'], true))`);
    assert.deepEqual(goods(`['items' => [['c' => 'meat', 'n' => 2], ['c' => 'cherry', 'n' => 3]], 'currants' => 50]`), { items: { cherry: 3, meat: 2 }, currants: 50 });
    assert.deepEqual(goods(`['currants' => 5]`), { items: [], currants: 5 });
    assert.match(goods(`['items' => [['c' => 'note', 'n' => 1]]]`), /not something the ledger carries/);
    assert.match(goods(`['items' => [['c' => 'cherry', 'n' => 1000]]]`), /1 to 999/);
    assert.match(goods(`['items' => [['c' => 'cherry', 'n' => 1], ['c' => 'cherry', 'n' => 1]]]`), /once/);
    assert.match(goods(`['currants' => 100001]`), /0 to 100,000/);
    assert.match(goods(`[]`), /Choose something/);
    assert.equal(php(`AdminConsole::listWords(['3 Cherries', '1 Meat', '50 currants'])`), '3 Cherries, 1 Meat and 50 currants');
    assert.equal(php(`AdminConsole::isGive('admin-give-0123456789abcdef')`), true);
    assert.equal(php(`AdminConsole::isGive('starter-bags-7')`), false);
  });

  it('signs a console call as the server checks it (the vector in admin_test.go)', () => {
    const sig = php(`ServiceCall::sign('POST', '/realtime/v1/boot', 1700000000, '0123456789abcdef', json_encode(['player' => 7, 'reason' => 'Spam']), str_repeat('x', 40))`);
    assert.equal(sig, '1700000000.0123456789abcdef.9MY3KNwUctqbzzlpAAxyoTdMJzr9DOkqYm5bW0LQN-Y');
  });

  it('is for administrators only: every route manage_options, the page judged before anything is drawn', () => {
    const src = readFileSync(sitePath('src/AdminConsole.php'), 'utf8');
    const routes = [...src.matchAll(/#\[Route\(Method::(Get|Post), '([^']+)', policy: new Policy\(([^)]*)\)\)\]/g)];
    assert.ok(routes.length >= 12, `routes ${routes.length}`);
    for (const [, , path, policy] of routes) {
      assert.match(path, /^\/groddle\/v1\/admin\//);
      assert.equal(policy, 'Access::Cap, self::ADMIN', path);
    }
    assert.match(src, /private const ADMIN = 'manage_options';/);
    const page = readFileSync(sitePath('src/AdminConsolePage.php'), 'utf8');
    assert.match(page, /Response::redirect\('\/minn-admin\/login\?redirect_to=' \. rawurlencode\(self::PATH\), 302\)/);
    assert.match(page, /can\(\$user->id, 'manage_options'\)\) \{\s*return Response::html\(self::refused\(\), 403\)/);
    assert.ok(page.indexOf("can($user->id, 'manage_options')") < page.indexOf('$this->document()'), 'the gate comes before the page');
    assert.match(readFileSync(sitePath('src/Extension.php'), 'utf8'), /new AdminConsole\(\$minn\)/);
    assert.match(readFileSync(sitePath('src/Extension.php'), 'utf8'), /routes\(new AdminConsolePage\(\$minn\)\)/);
  });

  it('never bans an administrator or yourself', () => {
    const src = readFileSync(sitePath('src/AdminConsole.php'), 'utf8');
    const ban = src.slice(src.indexOf('public function ban('), src.indexOf('public function unban('));
    assert.match(ban, /\$player\['id'\] === \$admin->id/);
    assert.match(ban, /can\(\$player\['id'\], self::ADMIN\)/);
    assert.ok(ban.indexOf('can($player') < ban.indexOf('INSERT INTO'), 'refused before anything is written');
  });

  it('a suspended account gets no ticket, no save, and /me says so', () => {
    assert.match(readFileSync(sitePath('src/RealtimeTicket.php'), 'utf8'), /AdminConsole::banned\(\$this->minn->db, \$user->id\) !== null\) \{\s*throw new RestError\('groddle_suspended'/);
    const save = readFileSync(sitePath('src/MultiplayerSave.php'), 'utf8');
    assert.equal((save.match(/self::refuseSuspended\(/g) || []).length, 2, 'read and write');
    assert.match(readFileSync(sitePath('src/Player.php'), 'utf8'), /'suspended' => AdminConsole::banned/);
  });

  it('a give is a settled trade from nobody, and never counted applied by age', () => {
    const src = readFileSync(sitePath('src/AdminConsole.php'), 'utf8');
    assert.match(src, /INSERT INTO ' \. \$db->table\(Ledger::TRADES\) \. " \(trade_id, status, a_id, b_id, a_gave, b_gave, b_applied_at, created_at\) VALUES \(\?, 'settled', \?, 0,/);
    assert.match(readFileSync(sitePath('src/Ledger.php'), 'utf8'), /\$old = !AdminConsole::isGive\(\$id\) &&/);
  });

  it('logs every action in one table, the teleport too', () => {
    const manifest = JSON.parse(readFileSync(sitePath('minn.json'), 'utf8'));
    for (const col of ['admin_user_id', 'player_user_id', 'kind', 'detail', 'delivery']) assert.ok(manifest.tables.groddle_admin_actions.some((l) => l.startsWith(col)), col);
    assert.ok(manifest.tables.groddle_bans.some((l) => l.startsWith('user_id')));
    const src = readFileSync(sitePath('src/AdminConsole.php'), 'utf8');
    for (const kind of ['message', 'boot', 'ban', 'unban', 'give', 'refill']) assert.match(src, new RegExp(`->record\\(\\$admin, \\$player\\['id'\\], '${kind}'`), kind);
    assert.match(readFileSync(sitePath('src/AdminTeleport.php'), 'utf8'), /AdminConsole::recordAction\(\$db, \$admin->id, \$player\['id'\], 'teleport'/);
  });

  it('lists, finds and acts on an account with no character name (an administrator under their display name)', () => {
    const src = readFileSync(sitePath('src/AdminConsole.php'), 'utf8');
    const rows = src.slice(src.indexOf('private function rows('), src.indexOf('private function nameOr('));
    assert.match(rows, /namesOf\(\$ids\)/);
    assert.match(rows, /\$db->table\('users'\) \. ' u LEFT JOIN '/);
    assert.doesNotMatch(rows, /FROM " \. \$db->table\(Characters::TABLE\)/);
    assert.match(src, /namesOf\(\[\$id\]\)\[\$id\] \?\? null/);
    assert.match(src, /WHERE c\.user_id IS NULL AND LOWER\(u\.display_name\) LIKE \?/);
  });

  it('the theme serves the console\'s script and styles, keyed', () => {
    assert.ok(existsSync(sitePath('console/console.js')));
    assert.ok(existsSync(sitePath('console/console.css')));
    assert.match(readFileSync(sitePath('src/AdminConsolePage.php'), 'utf8'), /ASSET_KEY = 'g407-1'/);
    const css = readFileSync(sitePath('console/console.css'), 'utf8');
    for (const token of ['--surface', '--border', '--fg', '--muted', '--track', '--row-line']) assert.match(css, new RegExp(`var\\(${token}\\)`), token);
  });
});

describe('the realtime server (groddle-afternoon-server admin.go)', { skip: skipWithoutServer }, () => {
  it('takes each console call only on the site\'s signed POST, and checks bans at auth', () => {
    const src = readFileSync(serverPath('admin.go'), 'utf8');
    for (const call of ['online', 'message', 'boot', 'ban', 'unban', 'bans', 'give', 'refill']) assert.match(src, new RegExp(`serviceHandlers\\["${call}"\\] = `), call);
    assert.doesNotMatch(src, /r\.Handle\(/, 'no socket kinds');
    assert.match(readFileSync(serverPath('main.go'), 'utf8'), /if s\.hub\.Banned\(claims\.Sub\) \{/);
    assert.match(readFileSync(serverPath('admin_test.go'), 'utf8'), /9MY3KNwUctqbzzlpAAxyoTdMJzr9DOkqYm5bW0LQN-Y/);
  });
});
