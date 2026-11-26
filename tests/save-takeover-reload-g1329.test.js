/**
 * G1329 (report #670, root R50): "keep this window's game" (MultiplayerSave takeover) applies to the
 * stored save what the kept copy missed (groddle-afternoon-site src/Ledger.php reapply): a Still the
 * site put back on its owner's floor (HouseFloors::returnKept), a gift, a trade. But the site answered
 * only {version, took}, and the page (js/save-store.js) went on holding its own copy, so its next
 * ordinary write stored that copy again and what came in was gone, silently: Ledger::write takes a
 * copy holding less as the player's own loss. Two players' returned Stills vanished this way on
 * 2026-11-25. Now the answer says reload when reapply changed the copy, and the page writes nothing
 * more (keepalive copies included) and loads the stored save. Ours: Glitch kept one copy per player
 * on its server, so a second copy never had to be reconciled.
 *
 * - The routes on a throwaway MariaDB database: tests/fixtures/ledger-reapply/takeover-reload.php.
 * - The page: createMultiplayerSaveStore against a fake site.
 *
 * Run: GRODDLE_SITE_DIR=<site> node --test tests/save-takeover-reload-g1329.test.js (MariaDB as
 * tests/r670-still-house-floors.test.js finds it).
 */
import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SITE_DIR, skipWithoutSite } from '../tools/repos.mjs';
import { PHP as PHP_BIN } from './php.js';
import { SAVE_CHOICE_EVENT, createMultiplayerSaveStore } from '../public/js/save-store.js?v=1ccb1d6b';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/** A PHP with mysqli (the FrankenPHP wrapper's php -v fails: tests that need PHP skip there). */
function php() {
  for (const cmd of [[PHP_BIN], [PHP_BIN, '-d', 'extension=mysqli']]) {
    if (spawnSync(cmd[0], [...cmd.slice(1), '-r', 'exit(function_exists("mysqli_report") ? 0 : 1);']).status === 0) return cmd;
  }
  return null;
}
const PHP = php();

/** The database to make the throwaway one on: GRODDLE_TEST_MYSQL, else the local groddle.localhost's wp-config. */
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
const engineDir = process.env.MINN_ENGINE_DIR || join(homedir(), 'Cove/Sites/minn-engine.localhost/public/minn');
const db = mysql();
const reachable = db && PHP && spawnSync(PHP[0], [...PHP.slice(1), '-r', 'mysqli_report(MYSQLI_REPORT_OFF); $m = @new mysqli($argv[1], $argv[2], $argv[3]); exit($m->connect_errno ? 1 : 0);', db.host, db.user, db.pass]).status === 0;
const skipDb = skipWithoutSite
  || (!PHP && 'no php with mysqli')
  || (!existsSync(join(engineDir, 'src/Minn/Autoloader.php')) && 'Minn Engine not found (set MINN_ENGINE_DIR)')
  || (!reachable && 'no MariaDB to make a throwaway database on (set GRODDLE_TEST_MYSQL)');

describe('G1329 the site: a takeover that added what the copy missed asks the page to reload', { skip: skipDb }, () => {
  let r;
  before(() => {
    r = JSON.parse(execFileSync(PHP[0], [...PHP.slice(1), join(root, 'tests/fixtures/ledger-reapply/takeover-reload.php'), engineDir, SITE_DIR, db.host, db.user, db.pass], { timeout: 120000 }).toString());
  });

  it('ran on its own database and dropped it', () => {
    assert.equal(r.error, undefined, r.error);
    assert.match(r.db, /^test_groddle_keep_[0-9a-f]{8}$/);
    assert.equal(r.dropped, true);
  });

  it('as on 11-25: the window holds the moved copy, the return puts the Still in the stored save only, unclaimed', () => {
    assert.equal(r.firstWrite, 200);
    assert.deepEqual(r.loaded, { stills: 0, ledger: 0 });
    assert.equal(r.returned, 1);
    assert.deepEqual(r.stored, { stills: 1, ledger: 1, writer: '' });
    assert.equal(r.conflict, 'groddle_save_conflict');
  });

  it('the takeover stores the Still ("on takeover") and its answer says the page must reload', () => {
    assert.equal(r.takeover.status, 200);
    assert.equal(r.takeover.took, true);
    assert.deepEqual(r.afterTakeover, { stills: 1, ledger: 1, page: 0 }, 'the page itself still holds no Still');
    assert.equal(r.takeover.reload, true, `the answer was only ${JSON.stringify(r.takeover.answer)}: the page keeps its copy without the Still`);
  });

  it('why: the page\'s own copy written again takes the Still out of the save and the ledger, with no word', () => {
    assert.deepEqual(r.staleWrite, { status: 200, corrected: null, stills: 0, ledger: 0 });
    assert.deepEqual(r.restored, { stills: 1, ledger: 1 });
  });

  it('a page that follows the answer reloads, holds the Still and keeps it through its next writes', () => {
    assert.deepEqual(r.followed, { reloaded: true, status: [200, 200], page: 1, stills: 1, ledger: 1 });
  });

  it('a takeover with nothing to add asks no reload', () => {
    assert.deepEqual(r.plain, { conflict: 'groddle_save_conflict', status: 200, took: true, reload: null });
  });
});

describe('G1329 the site\'s answer', { skip: skipWithoutSite }, () => {
  it('MultiplayerSave answers reload when reapply changed the kept copy', () => {
    const src = readFileSync(join(SITE_DIR, 'src/MultiplayerSave.php'), 'utf8');
    assert.match(src, /\$reload = \$did === 'takeover' && \$entries !== \$save\['entries'\];/);
    assert.match(src, /\$answer\['reload'\] = true;/);
  });
});

// —— The page ——

function fakeTimers() {
  let now = 1_000_000;
  let id = 0;
  const due = new Map();
  return {
    now: () => now,
    setTimeout(fn, ms) { due.set(++id, { at: now + ms, fn }); return id; },
    clearTimeout(t) { due.delete(t); },
    async tick(ms) {
      const until = now + ms;
      for (;;) {
        const next = [...due.entries()].sort((a, b) => a[1].at - b[1].at)[0];
        if (!next || next[1].at > until) break;
        due.delete(next[0]);
        now = next[1].at;
        next[1].fn();
        for (let i = 0; i < 10; i++) await Promise.resolve();
      }
      now = until;
      for (let i = 0; i < 10; i++) await Promise.resolve();
    },
  };
}

function eventScope() {
  const listeners = {};
  const scope = {
    document: { documentElement: { dataset: {} }, visibilityState: 'visible', addEventListener(type, fn) { (listeners[`doc:${type}`] ||= []).push(fn); } },
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init?.detail; } },
    addEventListener(type, fn) { (listeners[type] ||= []).push(fn); },
    dispatchEvent(e) { (listeners[e.type] || []).forEach((fn) => fn(e)); return true; },
    fire(type) { (listeners[type] || []).forEach((fn) => fn({ type })); },
    fireDoc(type) { (listeners[`doc:${type}`] || []).forEach((fn) => fn({ type })); },
  };
  return scope;
}

/** The save route: refuses the page's write after the site rewrote the save (writer ''), then answers the takeover. */
function fakeSite({ reload }) {
  const calls = [];
  const row = { version: 4, writer: '', seq: 0, data: null };
  const fn = async (url, init = {}) => {
    const json = JSON.parse(init.body);
    calls.push({ ...json, keepalive: init.keepalive });
    let status = 200;
    let body;
    if (json.takeover === true || (json.writer === row.writer && json.seq > row.seq) || (row.writer === '' && json.version === row.version)) {
      row.version += 1;
      row.writer = json.writer;
      row.seq = json.seq;
      row.data = json.data;
      body = { version: row.version, updatedAt: '2026-11-25T00:10:46Z', ...(json.takeover === true ? { took: true, ...(reload ? { reload: true } : {}) } : {}) };
    } else {
      status = 409;
      body = { code: 'groddle_save_conflict', data: { status: 409, version: row.version, updatedAt: '2026-11-25T00:10:24Z', savedAt: 7 } };
    }
    return { status, ok: status === 200, headers: { get: () => null }, json: async () => body, text: async () => JSON.stringify(body) };
  };
  return { fn, calls, row };
}

const BOOT = Object.freeze({
  saveUrl: 'https://groddle.localhost/wp-json/groddle/v1/save',
  nonce: 'aaaaaaaaaa',
  version: 3,
  writer: 'aaaa1111bbbb2222',
  updatedAt: '2026-11-25T00:05:00Z',
  entries: { playerState: '{"savedAt":5}', droppedItems: '{"version":1,"nextId":47,"streets":{}}', location: '{"tsid":"LA5101HF7F429V"}' },
  player: { id: 3, name: 'Tester' },
});

/** A page whose save the site rewrote (HouseFloors::returnKept): its next write is refused and the player keeps this window's game. */
async function keptPage({ reload }) {
  const site = fakeSite({ reload });
  const timers = fakeTimers();
  const scope = eventScope();
  const reloads = [];
  scope.location = { reload: () => reloads.push('location') };
  const store = createMultiplayerSaveStore({ boot: BOOT, scope, fetch: site.fn, timers, now: timers.now, debounceMs: 2000, maxWaitMs: 10000 });
  store.set('location', '{"tsid":"LA5101HF7F429V","x":120}');
  await timers.tick(2000);
  assert.equal(store.state, 'conflict');
  scope.dispatchEvent(new scope.CustomEvent(SAVE_CHOICE_EVENT, { detail: { choice: 'keep' } }));
  await timers.tick(0);
  assert.equal(site.calls.at(-1).takeover, true);
  return { site, timers, scope, store, reloads };
}

describe('G1329 the page: after a takeover that added something it reloads and never writes its own copy again', () => {
  it('the answer\'s reload loads the stored save', async () => {
    const { store, reloads } = await keptPage({ reload: true });
    assert.equal(store.state, 'saved');
    assert.deepEqual(reloads, ['location'], 'the page kept its copy without what the takeover added');
    assert.equal(store.reloading, true);
  });

  it('nothing more goes out: no ordinary write, no keepalive copy as the page goes', async () => {
    const { site, timers, scope, store } = await keptPage({ reload: true });
    const sent = site.calls.length;
    store.set('location', '{"tsid":"LA5101HF7F429V","x":140}');
    store.set('droppedItems', '{"version":1,"nextId":47,"streets":{}}x');
    await timers.tick(20000);
    scope.document.visibilityState = 'hidden';
    scope.fireDoc('visibilitychange');
    scope.fire('pagehide');
    await store.flush();
    await timers.tick(0);
    assert.equal(site.calls.length, sent, `the page wrote its own copy again: ${JSON.stringify(site.calls.slice(sent).map((c) => c.seq))}`);
  });

  it('a takeover with nothing added saves on as before, no reload', async () => {
    const { site, timers, store, reloads } = await keptPage({ reload: false });
    assert.deepEqual(reloads, []);
    store.set('location', '{"tsid":"LA5101HF7F429V","x":160}');
    await timers.tick(2000);
    assert.equal(site.calls.at(-1).takeover, undefined);
    assert.equal(site.row.data.entries.location, '{"tsid":"LA5101HF7F429V","x":160}');
    assert.equal(store.state, 'saved');
  });
});
