/**
 * Chat moderation from inside the game, and the 30-day clearing of deleted words (Austin's rulings,
 * 2026-11-07).
 *
 * G567: an administrator deletes a channel line from the game, as /chat/ does (tests/chat-delete.test.js
 * has the site route, the server's chat_delete and /chat/'s menu):
 * - the site's groddle/v1/me says "admin" (manage_options, src/Player.php isAdmin); js/minn-account-core.js
 *   and js/online-boot.js carry it into the boot data; features/groups-feature.js connects the drawer's
 *   moderation only then (js/chat-delete.js, js/ui/social-drawer.js MODERATION);
 * - Global Chat, Live Help and the Trade Channel lines (and their thread replies) get Delete line; never
 *   Local, the party, a group or an IM; the confirm step is the game's menu, Cancel focused;
 * - the delete still goes through the site's DELETE route, whose policy (manage_options) refuses anyone
 *   else: tests/fixtures/chat-admin/chat-admin.php reads the route's own attribute and judges it as the
 *   engine's gate does; the game shows the site's refusal and keeps the line.
 *
 * G568: 30 days after a deletion the words go (ChatHistory::clearDeletedText, run at most hourly by
 * clearWhenDue from ingest and the delete route), with the replies hidden with the line and the console
 * record's copy; the record stays. The fixture runs it on a throwaway MariaDB database with a fake clock
 * (the local Cove one by default, GRODDLE_TEST_MYSQL="host user password" overrides); without the site,
 * the engine, php or a database those parts skip.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SITE_DIR, sitePath, skipWithoutSite } from '../tools/repos.mjs';
import { DELETE_CONFIRM_FOCUS, DELETE_TEXT, deletableChannel, deleteConfirmRows, lineLidOf, mayDelete } from '../public/js/chat-delete.js?v=c55a1043';
import { createMinnAccount } from '../public/js/minn-account.js?v=460de12b';
import { bootDataFrom } from '../public/js/online-boot.js?v=ef90a7af';
import { mountSocialDrawer } from '../public/js/ui/social-drawer.js?v=2eafb350';
import { createNotifier } from '../public/js/notify.js?v=1fb97b21';
import { FakeEl, memoryStore, page } from './social-fake-dom.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const game = (f) => readFileSync(join(root, 'public', f), 'utf8');
const EM_DASH = /—/;
const BASE = 'https://groddle.localhost/';

describe('who may delete what (js/chat-delete.js)', () => {
  it('an administrator, on a kept line of Global Chat, Live Help or the Trade Channel only', () => {
    const line = { name: 'Bo', text: 'oops', rk: 'l:12' };
    for (const chatId of ['global', 'help', 'trade']) assert.equal(mayDelete({ admin: true, chatId, line }), true, chatId);
    for (const chatId of ['local', 'party', 'group:12', 'im:7', 'butler', 'activity', '']) assert.equal(mayDelete({ admin: true, chatId, line }), false, chatId);
    assert.equal(mayDelete({ admin: false, chatId: 'global', line }), false, 'a player never');
    assert.equal(mayDelete({ admin: 'true', chatId: 'global', line }), false, 'only a real true');
    assert.equal(mayDelete({ admin: true, chatId: 'global', line: { ...line, rk: '' } }), false, 'a line not kept yet has no lid');
    assert.equal(mayDelete({ admin: true, chatId: 'global', line: { ...line, rk: 'im:7:3' } }), false, 'an IM line never');
    assert.equal(mayDelete({ admin: true, chatId: 'global', line: { note: true, text: 'Welcome', rk: 'l:1' } }), false, 'a note never');
    assert.equal(deletableChannel('help'), 'help');
    assert.equal(deletableChannel('group:3'), '');
    assert.equal(lineLidOf('l:4021'), 4021);
    assert.equal(lineLidOf('im:7:3'), 0);
  });

  it('the confirm step: Delete for everyone, then Cancel, which is focused; plain words', () => {
    assert.deepEqual(deleteConfirmRows().map((r) => r.id), ['confirm', 'cancel']);
    assert.equal(DELETE_CONFIRM_FOCUS, 1);
    assert.equal(DELETE_TEXT.title, 'Delete this line for everyone?');
    for (const v of Object.values(DELETE_TEXT)) assert.doesNotMatch(typeof v === 'function' ? `${v('Ada')} ${v('')}` : v, EM_DASH);
    for (const r of deleteConfirmRows()) assert.doesNotMatch(`${r.label} ${r.tip}`, EM_DASH);
    assert.equal(DELETE_TEXT.buttonLabel('Ada'), 'Delete Ada\'s line for everyone');
    for (const f of ['js/chat-delete.js', 'js/ui/social-drawer.js', 'js/features/groups-feature.js']) assert.doesNotMatch(game(f), /window\.confirm\(|[^\w.]confirm\(/, `${f}: no window.confirm`);
  });
});

describe('the admin flag reaches the game (minn-account-core session, online-boot bootDataFrom)', () => {
  const fetchFor = (me) => async (url) => {
    if (String(url).includes('rest-nonce')) return { status: 200, ok: true, headers: { get: () => null }, text: async () => 'abcdef0123', json: async () => null };
    return { status: 200, ok: true, headers: { get: () => null }, json: async () => me };
  };

  it('present only when the site says true; carried into the boot data', async () => {
    const admin = await createMinnAccount({ baseUri: BASE, fetch: fetchFor({ signedIn: true, player: { id: 1, name: 'Ada' }, admin: true }) }).session();
    assert.equal(admin.admin, true);
    const player = await createMinnAccount({ baseUri: BASE, fetch: fetchFor({ signedIn: true, player: { id: 2, name: 'Bo' }, admin: false }) }).session();
    assert.equal('admin' in player, false);
    const account = { urls: { api: `${BASE}wp-json/groddle/v1/`, nonce: `${BASE}wp-admin/admin-ajax.php?action=rest-nonce` }, nonce: 'abcdef0123' };
    assert.equal(bootDataFrom({ account, session: admin, save: { version: 0, data: null } }).admin, true);
    assert.equal('admin' in bootDataFrom({ account, session: player, save: { version: 0, data: null } }), false);
  });

  it('the delete goes to the site\'s route; a refusal throws with the site\'s words', async () => {
    const calls = [];
    const ok = createMinnAccount({ baseUri: BASE, nonce: 'abcdef0123', fetch: async (url, init) => { calls.push([String(url), init.method, init.headers['X-WP-Nonce']]); return { status: 200, ok: true, headers: { get: () => null }, json: async () => ({ status: 'deleted', lid: 12, parent: 0, live: true }) }; } });
    assert.deepEqual(await ok.deleteChannelLine('help', 12), { status: 'deleted', lid: 12, parent: 0, live: true });
    assert.deepEqual(calls, [[`${BASE}wp-json/groddle/v1/chat/channels/help/lines/12`, 'DELETE', 'abcdef0123']]);
    const no = createMinnAccount({ baseUri: BASE, nonce: 'abcdef0123', fetch: async () => ({ status: 403, ok: false, headers: { get: () => null }, json: async () => ({ code: 'rest_forbidden', message: 'Sorry, you are not allowed to do that.', data: { status: 403 } }) }) });
    await assert.rejects(no.deleteChannelLine('global', 12), (e) => e.status === 403 && e.message === 'Sorry, you are not allowed to do that.');
  });
});

const SAVED = ['document', 'addEventListener', 'CSS', 'requestAnimationFrame', 'groddleSocial', 'groddleGroups', 'groddleRealtime', 'groddleBuddies', 'GRODDLE_MP_BOOT', 'fetch'];

/** A fake of the game's menu (js/ui/context-menu.js createContextMenu): what was opened, and a pick. */
function fakeMenu() {
  const m = {
    opened: [],
    cur: null,
    open(o) { m.cur = o; m.opened.push(o); return true; },
    isOpenFor: (owner) => m.cur?.owner === owner,
    close() { m.cur = null; return true; },
    pick(id) { const o = m.cur; m.cur = null; o.onPick?.(id, { keys: o.keys }); },
  };
  return m;
}

function drawerRig() {
  const t = page();
  globalThis.document = t.doc;
  globalThis.addEventListener = () => {};
  globalThis.CSS = { escape: (s) => s };
  globalThis.requestAnimationFrame = (fn) => fn();
  const menu = fakeMenu();
  t.data = {};
  let drawer = null;
  const notifier = createNotifier({ onChange: () => drawer?.update() });
  drawer = mountSocialDrawer({ root: t.game, dock: t.dock, notifier, mode: 'online', storage: memoryStore(), width: () => 1920, playerMenu: () => true, contextMenu: () => menu, setData: (k, v) => { t.data[k] = v; } });
  const log = () => t.dock.querySelector('[data-social-log]');
  const rows = () => log().children.filter((c) => c.tagName === 'P');
  return { t, drawer, menu, log, rows };
}

describe('the drawer\'s Delete line (js/ui/social-drawer.js MODERATION)', () => {
  const saved = {};
  let r;
  const removed = [];
  before(() => {
    for (const k of SAVED) saved[k] = globalThis[k];
    r = drawerRig();
  });
  after(() => {
    for (const [k, v] of Object.entries(saved)) globalThis[k] = v;
  });

  it('solo has none; online nothing until a moderator connects (a player\'s game never connects one)', () => {
    const solo = page();
    assert.equal(mountSocialDrawer({ root: solo.game, dock: solo.dock, notifier: createNotifier({}), mode: 'solo', storage: memoryStore(), width: () => 1920 }).moderation, null);
    globalThis.document = r.t.doc;
    r.drawer.channel('global', { label: 'Global Chat', threads: true });
    r.drawer.channel('group:12', { label: 'Zebra Club', threads: true });
    r.drawer.channel('im:7', { label: 'Ada', threads: true });
    const at = Date.now();
    r.drawer.push('global', { name: 'Bo', text: 'oops', playerId: 9, at, rk: 'l:100' });
    r.drawer.push('global', { note: true, text: 'Welcome to Global Chat' });
    r.drawer.push('group:12', { name: 'Bo', text: 'group words', playerId: 9, at, rk: 'l:300' });
    r.drawer.push('im:7', { name: 'Ada', text: 'private words', playerId: 7, at, rk: 'im:7:5' });
    r.drawer.push('local', { name: 'Bo', text: 'street words', playerId: 9, at, rk: 'l:400' });
    r.drawer.select('global');
    assert.equal(r.drawer.moderation.connected, false);
    assert.equal(r.log().querySelectorAll('[data-line-delete]').length, 0);
  });

  it('connected, only the moderator\'s lines get the button, after the reply button, keyboard reachable', () => {
    r.drawer.threads.connect({ send: () => true, load: () => {} });
    r.drawer.moderation.connect({ can: (chatId, line) => mayDelete({ admin: true, chatId, line }), remove: (chatId, line) => { removed.push([chatId, line.rk]); return true; } });
    const btns = r.log().querySelectorAll('[data-line-delete]');
    assert.equal(btns.length, 1, 'the note has none');
    const b = btns[0];
    assert.equal(b.tagName, 'BUTTON', 'a real button: Tab reaches it');
    assert.equal(b.getAttribute('data-line-delete'), 'l:100');
    assert.equal(b.getAttribute('aria-label'), 'Delete Bo\'s line for everyone');
    assert.equal(b.getAttribute('aria-haspopup'), 'menu');
    const row = r.rows()[0];
    assert.ok(row.classList.contains('can-delete'));
    const kids = row.children;
    assert.equal(kids.indexOf(b), kids.indexOf(row.querySelector('[data-thread-reply]')) + 1, 'right after the reply button');
    for (const id of ['group:12', 'im:7', 'local']) {
      r.drawer.select(id);
      assert.equal(r.log().querySelectorAll('[data-line-delete]').length, 0, `${id}: none`);
    }
    r.drawer.select('global');
  });

  it('a click opens the confirm menu by the button, Cancel focused; Cancel deletes nothing', () => {
    const b = r.log().querySelector('[data-line-delete="l:100"]');
    b.dispatch('click', { detail: 1, clientX: 40, clientY: 50 });
    const o = r.menu.opened.at(-1);
    assert.equal(o.title, 'Delete this line for everyone?');
    assert.deepEqual(o.rows.map((x) => x.label), ['Delete for everyone', 'Cancel']);
    assert.equal(o.focusIndex, 1);
    assert.equal(o.owner, 'delete:global#l:100');
    assert.deepEqual(o.at, { x: 40, y: 50 });
    assert.equal(o.keys, false);
    assert.equal(o.anchor, b);
    r.menu.pick('cancel');
    assert.deepEqual(removed, []);
  });

  it('from the keys (Enter on the button) the menu remembers it, and Delete for everyone hands the line over', () => {
    const b = r.log().querySelector('[data-line-delete="l:100"]');
    b.dispatch('click', { detail: 0 });
    const o = r.menu.opened.at(-1);
    assert.equal(o.keys, true);
    assert.equal(o.at, null);
    assert.equal(o.opener, b, 'focus goes back to the button');
    r.menu.pick('confirm');
    assert.deepEqual(removed, [['global', 'l:100']]);
    assert.equal(r.t.data.socialDelete, 'delete:global#l:100');
  });

  it('in a thread: its line and its replies have the button too', () => {
    r.drawer.threads.open('global', 'l:100');
    r.drawer.threads.setReplies('l:100', [{ name: 'Cy', text: 'a reply', playerId: 11, at: Date.now() + 1, rk: 'l:101' }]);
    assert.deepEqual(r.log().querySelectorAll('[data-line-delete]').map((x) => x.getAttribute('data-line-delete')), ['l:100', 'l:101']);
    r.log().querySelector('[data-line-delete="l:101"]').dispatch('click', { detail: 0 });
    r.menu.pick('confirm');
    assert.deepEqual(removed.at(-1), ['global', 'l:101']);
    r.drawer.threads.close();
  });

  it('disconnected, the buttons go', () => {
    r.drawer.moderation.connect(null);
    assert.equal(r.log().querySelectorAll('[data-line-delete]').length, 0);
    assert.equal(r.rows()[0].classList.contains('can-delete'), false);
  });
});

const ANSWER = {
  max: 20,
  count: 0,
  groups: [],
  invites: [],
  channels: { global: true, help: 'newbie', trade: false, silenced: [] },
  watch: { token: 'gtok.sig', expiresIn: 3600 },
};

function fakeClient(me) {
  const listeners = new Map();
  const sent = [];
  return {
    state: 'online',
    me,
    players: [],
    here: 1,
    sent,
    on(type, fn) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(fn); return () => listeners.get(type).delete(fn); },
    emit(type, payload) { for (const fn of listeners.get(type) || []) fn(payload); },
    msg(m) { this.emit(`msg:${m.t}`, m); },
    send(kind, payload = {}) { sent.push({ t: kind, ...payload }); return true; },
  };
}

const wait = (ms = 0) => new Promise((res) => setTimeout(res, ms));
/** What players said in Live Help (its welcome note left out). */
const said = (g) => g.drawer.lines('help').filter((l) => !l.note).map((l) => l.text);

/** groups-feature (a fresh copy each, so each has its own session) on a drawer, with a fake site answering `deleteAnswer`. */
async function gameRig({ boot, copy, deleteAnswer }) {
  const r = drawerRig();
  globalThis.GRODDLE_MP_BOOT = boot;
  const asked = [];
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url);
    if (init.method === 'DELETE') {
      asked.push([u, init.method]);
      return { status: deleteAnswer.status, ok: deleteAnswer.status < 300, headers: { get: () => null }, json: async () => structuredClone(deleteAnswer.body) };
    }
    return { status: 200, ok: true, headers: { get: () => null }, json: async () => structuredClone(ANSWER) };
  };
  const client = fakeClient(boot.player);
  const toasts = [];
  const engine = {
    mode: 'multiplayer',
    started: true,
    social: r.drawer,
    pc: { level: 4, imaginationUpgrades: [] },
    query: (hook) => (hook === 'realtimeClient' ? client : null),
    setData: (k, v) => { engine.data[k] = v; },
    data: {},
    toast: (x) => toasts.push(x),
    prompt: (p) => { p.onChoice?.(true); return 'uid'; },
    chatLine: (name, text) => r.drawer.localLine(name, text),
  };
  const mod = copy === 'admin'
    ? await import('../public/js/features/groups-feature.js?fresh=chat-admin')
    : await import('../public/js/features/groups-feature.js?fresh=chat-player');
  mod.groupsFeature.onTick(16, 0, engine);
  await wait(5);
  client.msg({ t: 'groups_status', groups: [], channels: ['global', 'help'], open: [] });
  await globalThis.groddleGroups.openChat('help', { intro: false });
  client.msg({ t: 'channel_joined', channel: 'help', history: [{ id: 9, name: 'Bo', text: 'd/leave', at: 1, lid: 77 }, { id: 9, name: 'Bo', text: 'how do I leave?', at: 2, lid: 78 }] });
  r.drawer.select('help');
  return { ...r, client, engine, toasts, asked, deleteAnswer };
}

describe('groups-feature: an administrator\'s game deletes, a player\'s has nothing and is refused', () => {
  const saved = {};
  before(() => {
    for (const k of SAVED) saved[k] = globalThis[k];
  });
  after(() => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete globalThis[k];
      else globalThis[k] = v;
    }
  });

  it('a player (no admin in the boot data): no moderator, no button on any line', async () => {
    const g = await gameRig({ boot: { nonce: 'abcdef0123', player: { id: 9, name: 'Bo' } }, copy: 'player', deleteAnswer: { status: 403, body: { code: 'rest_forbidden', message: 'Sorry, you are not allowed to do that.' } } });
    assert.deepEqual(said(g), ['d/leave', 'how do I leave?']);
    assert.equal(g.drawer.moderation.connected, false);
    assert.equal(g.log().querySelectorAll('[data-line-delete]').length, 0);
  });

  it('a forged delete (a player who sets admin by hand): the site refuses it, the game says so and keeps the line', async () => {
    const g = await gameRig({ boot: { nonce: 'abcdef0123', player: { id: 9, name: 'Bo' }, admin: true }, copy: 'admin', deleteAnswer: { status: 403, body: { code: 'rest_forbidden', message: 'Sorry, you are not allowed to do that.' } } });
    const b = g.log().querySelector('[data-line-delete="l:77"]');
    assert.ok(b, 'the flag only draws the button');
    b.dispatch('click', { detail: 0 });
    g.menu.pick('confirm');
    await wait(5);
    assert.deepEqual(g.asked, [['https://groddle.localhost/wp-json/groddle/v1/chat/channels/help/lines/77', 'DELETE']]);
    assert.deepEqual(g.toasts, ['Sorry, you are not allowed to do that.']);
    assert.equal(g.engine.data.groupsDeleteAsked, 'help:77:refused');
    assert.deepEqual(said(g), ['d/leave', 'how do I leave?'], 'nothing deleted');
    // An administrator's: the site deletes it; the line goes now, and the server's chat_deleted changes nothing more.
    Object.assign(g.deleteAnswer, { status: 200, body: { status: 'deleted', lid: 77, parent: 0, live: true } });
    g.log().querySelector('[data-line-delete="l:77"]').dispatch('click', { detail: 0 });
    g.menu.pick('confirm');
    await wait(5);
    assert.equal(g.toasts.at(-1), 'Line deleted for everyone.');
    assert.equal(g.engine.data.groupsDeleteAsked, 'help:77:ok');
    assert.deepEqual(said(g), ['how do I leave?']);
    g.client.msg({ t: 'chat_deleted', channel: 'help', lid: 77 });
    assert.deepEqual(said(g), ['how do I leave?']);
  });

  it('the feature connects the drawer only for a boot data admin of true', () => {
    const src = game('js/features/groups-feature.js');
    assert.match(src, /if \(boot\.admin === true && social\?\.moderation\) \{\n\s*social\.moderation\.connect\(\{\n\s*can: \(chatId, line\) => mayDelete\(\{ admin: true, chatId, line \}\),/);
    assert.match(src, /await account\.deleteChannelLine\(key, lid\);/);
  });

  it('both interfaces dress the button with design tokens (style.css, css/classic.css)', () => {
    const modern = game('style.css');
    assert.match(modern, /\.social-msg\.can-delete:hover > \.line-delete, \.social-msg\.can-delete:focus-within > \.line-delete/);
    assert.match(modern, /\.line-delete:focus-visible \{ opacity: 1; outline: 2px solid var\(--focus\)/);
    assert.match(modern, /@media \(hover: none\) \{ \.line-delete \{ opacity: 0\.7; \} \}/);
    const classic = game('css/classic.css');
    assert.match(classic, /:root\[data-ui="classic"\] \.line-delete \{/);
    assert.match(classic, /:root\[data-ui="classic"\] \.line-delete:focus-visible/);
  });
});

describe('the site: me says admin; the delete route stays administrators only (src/Player.php, src/ChatHistory.php)', { skip: skipWithoutSite }, () => {
  it('me answers admin from manage_options, the capability the delete route checks', () => {
    const p = readFileSync(sitePath('src/Player.php'), 'utf8');
    assert.match(p, /public const ADMIN = 'manage_options';/);
    assert.match(p, /'admin' => self::isAdmin\(\$this->minn->db, \$user->id\),/);
    assert.match(p, /return \$id > 0 && Capabilities::fromDb\(\$db\)->can\(\$id, self::ADMIN\);/);
    const c = readFileSync(sitePath('src/ChatHistory.php'), 'utf8');
    assert.match(c, /private const ADMIN = 'manage_options';/);
  });

  it('the 30-day clearing runs from ingest and the delete route, at most hourly; the table has its key', () => {
    const c = readFileSync(sitePath('src/ChatHistory.php'), 'utf8');
    assert.equal(c.split('self::clearWhenDue($this->minn->site, $db, Community::ms());').length - 1, 2);
    assert.match(c, /public const DELETED_KEEP_DAYS = 30;/);
    assert.match(c, /public const CLEAR_EVERY = 3600;/);
    const t = JSON.parse(readFileSync(sitePath('minn.json'), 'utf8')).tables.groddle_chat_lines;
    assert.ok(t.includes('KEY deleted_ms (deleted_ms)'));
  });

  it('the console words a cleared deletion without its words', async () => {
    const { logWords } = await import(`${new URL(`file://${sitePath('console/console.js')}`).href}`);
    assert.equal(logWords({ kind: 'chat_delete', delivery: 'live', player: { id: 7, name: 'Ada' }, detail: { where: 'Live Help', text: '', cleared: true } }), 'deleted Ada\'s line in Live Help (its words were cleared after 30 days)');
    assert.equal(logWords({ kind: 'chat_delete', delivery: 'live', player: { id: 7, name: 'Ada' }, detail: { where: 'Live Help', text: 'oops' } }), 'deleted Ada\'s line in Live Help: “oops”');
    assert.match(readFileSync(sitePath('src/AdminConsolePage.php'), 'utf8'), /ASSET_KEY = 'skin-6'/);
  });
});

// —— On a throwaway database (tests/fixtures/chat-admin/chat-admin.php) ——
const engineDir = process.env.MINN_ENGINE_DIR || join(homedir(), 'Cove/Sites/minn-engine.localhost/public/minn');
const hasPhp = spawnSync('php', ['-v']).status === 0;
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
  const host = def('DB_HOST');
  const user = def('DB_USER');
  return host && user ? { host, user, pass: def('DB_PASSWORD') || '' } : null;
}
const db = mysql();
const reachable = db && hasPhp && spawnSync('php', ['-r', 'mysqli_report(MYSQLI_REPORT_OFF); $m = @new mysqli($argv[1], $argv[2], $argv[3]); exit($m->connect_errno ? 1 : 0);', db.host, db.user, db.pass]).status === 0;
const skipDb = skipWithoutSite
  || (!hasPhp && 'no php')
  || (!existsSync(join(engineDir, 'src/Minn/Autoloader.php')) && 'Minn Engine not found (set MINN_ENGINE_DIR)')
  || (!reachable && 'no MariaDB to make a throwaway database on (set GRODDLE_TEST_MYSQL)');

describe('on a throwaway database, with a fake clock', { skip: skipDb }, () => {
  let r;
  const DAY = 86_400_000;
  const NOW = 1_794_096_000_000;
  before(() => {
    r = JSON.parse(execFileSync('php', [join(root, 'tests/fixtures/chat-admin/chat-admin.php'), engineDir, SITE_DIR, db.host, db.user, db.pass], { timeout: 90000 }).toString());
  });
  const text = (rows, lid) => rows.find((x) => x.lid === lid).text;

  it('ran on its own database and dropped it', () => {
    assert.equal(r.error, undefined, r.error);
    assert.match(r.db, /^test_groddle_chat_[0-9a-f]{8}$/);
    assert.equal(r.dropped, true);
    assert.equal(r.deletedKey, true);
  });

  it('G567: only an administrator is admin, and the delete route refuses a player (403) and a stranger (401)', () => {
    assert.deepEqual(r.isAdmin, { 7: true, 9: false, 0: false });
    assert.equal(r.deletePolicy.method, 'Delete');
    assert.equal(r.deletePolicy.access, 'Cap');
    assert.deepEqual(r.deletePolicy.caps, ['manage_options']);
    assert.equal(r.deletePolicy.public, false);
    assert.deepEqual(r.deleteGate, { 7: 'allowed', 9: 'rest_forbidden (403)', 0: 'signed out (401)' });
    assert.equal(r.mePolicy.public, true, 'me answers anyone (signed out is signedIn false)');
  });

  it('G568: 30 days after a deletion its words go, and the replies hidden with it; 29 days on they stay', () => {
    assert.deepEqual(r.first, { lines: 2, replies: 2, actions: 1 });
    const a = r.afterFirst;
    for (const lid of [101, 102, 103, 302]) assert.equal(text(a, lid), '', `${lid} cleared`);
    assert.equal(text(a, 201), 'a newer stray line', 'deleted 29 days ago: kept');
    assert.equal(text(a, 202), 'its reply');
    for (const lid of [301, 303, 401, 501, 502]) assert.equal(text(a, lid), r.before.find((x) => x.lid === lid).text, `${lid} untouched`);
  });

  it('G568: the record stays: who said it, when, where, when it was deleted and by whom, its reactions', () => {
    for (const lid of [101, 102, 302]) {
      const was = r.before.find((x) => x.lid === lid);
      const now = r.afterFirst.find((x) => x.lid === lid);
      assert.deepEqual({ ...now, text: was.text }, was, `${lid}: only the words changed`);
    }
    assert.equal(r.afterFirst.find((x) => x.lid === 101).deleted, NOW - 31 * DAY);
    assert.equal(r.afterFirst.find((x) => x.lid === 101).by, 7);
  });

  it('G568: the console\'s record loses its copy of the words, keeps the rest; other actions are untouched', () => {
    const [first, second, other] = r.actionsFirst;
    assert.deepEqual(first, { kind: 'chat_delete', admin: 7, player: 11, at: '2026-10-08 00:00:00', detail: { where: 'Global Chat', lid: 101, reply: false, text: '', cleared: true } });
    assert.equal(second.detail.text, 'a newer stray line');
    assert.deepEqual(other.detail, { text: 'an administrator\'s message stays' });
    assert.equal(r.actionsTwoDays[1].detail.cleared, true);
    assert.equal(r.actionsTwoDays[2].detail.text, 'an administrator\'s message stays');
  });

  it('G568: idempotent, then the clock moves on two days and the next one goes', () => {
    assert.deepEqual(r.again, { lines: 0, replies: 0, actions: 0 });
    assert.deepEqual(r.twoDaysLater, { lines: 1, replies: 1, actions: 1 });
    assert.equal(text(r.afterTwoDays, 201), '');
    assert.equal(text(r.afterTwoDays, 202), '');
    assert.equal(text(r.afterTwoDays, 303), 'a reply nobody deleted');
    assert.deepEqual(r.early, { lines: 0, replies: 0, actions: 0 }, 'a clock before the window clears nothing');
  });

  it('G568: from the routes it runs at most once an hour (the option says when next)', () => {
    assert.deepEqual(r.due.first, { lines: 1, replies: 0, actions: 0 });
    assert.equal(r.due.next, NOW / 1000 + 3600);
    assert.equal(r.due.tenMinutes, null);
    assert.equal(r.due.text602Waiting, 'deleted while it was not due');
    assert.deepEqual(r.due.anHourLater, { lines: 1, replies: 0, actions: 0 });
    assert.equal(r.due.text602, '');
  });
});
