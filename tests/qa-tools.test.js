// The QA helpers in tools/qa: the static server, the one-browser lock and the Chrome flags.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Agent, request } from 'node:http';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync, existsSync } from 'node:fs';
import { hostname, tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

import { REALTIME_PORT, resolveRequest, startServer } from '../tools/qa/serve.mjs';
import { acquireLock, judgeLock, lockStatus, OWNER_FILE, parseFlags, pidAlive } from '../tools/qa/browser-lock.mjs';
import { browserArgs } from '../tools/qa/browser.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
const tmp = () => mkdtempSync(join(tmpdir(), 'groddle-qa-'));
const silent = () => {};

// —— serve ——

function rawGet(port, path, agent) {
  return new Promise((done, fail) => {
    const req = request({ host: '127.0.0.1', port, path, method: 'GET', ...(agent ? { agent } : {}) }, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => done({ status: res.statusCode, headers: res.headers, body }));
    });
    req.on('error', fail);
    req.end();
  });
}

test('serve: files, folder redirects and index pages, 404s, and no way out of the root', async () => {
  const dir = tmp();
  const root = join(dir, 'public');
  mkdirSync(join(root, 'play'), { recursive: true });
  writeFileSync(join(root, 'index.html'), '<p>home</p>');
  writeFileSync(join(root, 'play', 'index.html'), '<p>play</p>');
  writeFileSync(join(root, 'game.js'), 'export {};');
  writeFileSync(join(dir, 'secret.txt'), 'nope');
  const server = await startServer({ root, port: 0 });
  try {
    const home = await rawGet(server.port, '/');
    assert.equal(home.status, 200);
    assert.equal(home.body, '<p>home</p>');
    const js = await rawGet(server.port, '/game.js?v=1');
    assert.equal(js.status, 200);
    assert.match(js.headers['content-type'], /^text\/javascript/);
    assert.equal(js.headers['cache-control'], 'no-store');
    const play = await rawGet(server.port, '/play?x=1');
    assert.equal(play.status, 301);
    assert.equal(play.headers.location, '/play/?x=1');
    assert.equal((await rawGet(server.port, '/play/')).body, '<p>play</p>');
    assert.equal((await rawGet(server.port, '/missing.png')).status, 404);
    for (const path of ['/../secret.txt', '/%2e%2e/secret.txt', '/play/%2F..%2F..%2Fsecret.txt', '/..%2Fsecret.txt']) {
      const r = await rawGet(server.port, path);
      assert.notEqual(r.status, 200, path);
      assert.doesNotMatch(r.body, /nope/, path);
    }
    // The game's module burst: 100 connections at once (python's server queues 5; macOS caps any
    // listen queue at kern.ipc.somaxconn, 128), 400 loads over them with keep-alive, none dropped.
    const agent = new Agent({ keepAlive: true, maxSockets: 100 });
    const burst = await Promise.all(Array.from({ length: 400 }, (_, i) => rawGet(server.port, `/game.js?v=${i}`, agent)));
    agent.destroy();
    assert.ok(burst.every((r) => r.status === 200));
  } finally {
    await server.stop();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('serve: resolveRequest keeps every path inside the root', () => {
  const dir = tmp();
  try {
    writeFileSync(join(dir, 'a.txt'), 'a');
    assert.equal(resolveRequest(dir, '/a.txt').file, join(dir, 'a.txt'));
    assert.equal(resolveRequest(dir, '/%2e%2e%2f%2e%2e%2fetc/passwd').status, 403);
    assert.equal(resolveRequest(dir, '/a%00.txt').status, 400);
    assert.equal(resolveRequest(dir, '/%E0%A4%A').status, 400);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('serve: refuses the realtime server port', async () => {
  assert.throws(() => startServer({ root: ROOT, port: REALTIME_PORT }), /realtime/);
});

test('serve: serve-static.mjs is the same server', () => {
  const text = readFileSync(join(ROOT, 'tools', 'serve-static.mjs'), 'utf8');
  assert.match(text, /from '\.\/qa\/serve\.mjs'/);
});

// —— the lock ——

const HOST = 'here';
const alive = (pids) => (pid) => pids.includes(pid);

test('lock: a running owner is never stale, however old', () => {
  const v = judgeLock({ owner: { pid: 100, host: HOST }, ageMs: 10 * 24 * 3600e3, host: HOST, alive: alive([100]), staleMs: 1000 });
  assert.equal(v.stale, false);
});

test('lock: an owner pid that is gone is stale at once', () => {
  const v = judgeLock({ owner: { pid: 100, host: HOST }, ageMs: 5, host: HOST, alive: alive([]), staleMs: 3600e3 });
  assert.equal(v.stale, true);
  assert.match(v.why, /not running/);
});

test('lock: an owner on another machine is never broken here', () => {
  const v = judgeLock({ owner: { pid: 100, host: 'elsewhere' }, ageMs: 10 * 3600e3, host: HOST, alive: alive([]), staleMs: 1000 });
  assert.equal(v.stale, false);
});

test('lock: an ownerless (shell mkdir) lock is stale only after the timeout', () => {
  assert.equal(judgeLock({ owner: null, ageMs: 59 * 60e3, host: HOST, alive: alive([]) }).stale, false);
  assert.equal(judgeLock({ owner: null, ageMs: 61 * 60e3, host: HOST, alive: alive([]) }).stale, true);
  assert.equal(judgeLock({ owner: null, ageMs: 5000, host: HOST, alive: alive([]), staleMs: 1000 }).stale, true);
  assert.equal(judgeLock({ owner: null, ageMs: 10 * 24 * 3600e3, host: HOST, alive: alive([]), staleMs: Infinity }).stale, false);
  // A broken owner file counts as none.
  assert.equal(judgeLock({ owner: { pid: 'x' }, ageMs: 5000, host: HOST, alive: alive([]), staleMs: 60e3 }).stale, false);
});

test('lock: pidAlive', () => {
  assert.equal(pidAlive(process.pid), true);
  assert.equal(pidAlive(0), false);
  assert.equal(pidAlive(-1), false);
  assert.equal(pidAlive(2 ** 22 + 12345), false);
});

test('lock: take, hold out others, release only our own', async () => {
  const dir = tmp();
  const path = join(dir, 'locks', 'browser');
  try {
    const lock = await acquireLock({ path, label: 'test', handleSignals: false, log: silent });
    const owner = JSON.parse(readFileSync(join(path, OWNER_FILE), 'utf8'));
    assert.equal(owner.pid, process.pid);
    assert.equal(owner.host, hostname());
    assert.equal(owner.label, 'test');
    assert.equal(lockStatus({ path }).held, true);
    // A second taker waits, then gives up.
    await assert.rejects(acquireLock({ path, waitMs: 300, pollMs: 50, handleSignals: false, log: silent }), (e) => e.code === 'ELOCKWAIT');
    await assert.rejects(acquireLock({ path, waitMs: 60e3, pollMs: 50, handleSignals: false, log: silent, isAborted: () => 'SIGINT' }), (e) => e.code === 'ELOCKABORT');
    assert.equal(lock.release(), true);
    assert.equal(existsSync(path), false);
    assert.equal(lock.release(), false, 'release runs once');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('lock: release leaves a lock that is no longer ours', async () => {
  const dir = tmp();
  const path = join(dir, 'browser');
  try {
    const lock = await acquireLock({ path, handleSignals: false, log: silent });
    // Someone else's lock now sits at the path (ours was broken and taken).
    writeFileSync(join(path, OWNER_FILE), JSON.stringify({ pid: 1, host: hostname(), token: 'someone-else' }));
    assert.equal(lock.release(), false);
    assert.equal(existsSync(join(path, OWNER_FILE)), true);
    // And a shell script's bare lock (no owner file) is never ours either.
    rmSync(join(path, OWNER_FILE));
    assert.equal(lockStatus({ path }).held, true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('lock: breaks a dead owner\'s lock, waits on a young shell lock, breaks an old one', async () => {
  const dir = tmp();
  const path = join(dir, 'browser');
  try {
    // A dead owner: a pid that has exited.
    const gone = spawnSync(process.execPath, ['-e', 'process.stdout.write(String(process.pid))'], { encoding: 'utf8' });
    mkdirSync(path);
    writeFileSync(join(path, OWNER_FILE), JSON.stringify({ pid: Number(gone.stdout), host: hostname(), token: 't' }));
    const lock = await acquireLock({ path, waitMs: 2000, pollMs: 50, handleSignals: false, log: silent });
    assert.equal(JSON.parse(readFileSync(join(path, OWNER_FILE), 'utf8')).pid, process.pid);
    lock.release();
    // A young ownerless lock (a lane's `mkdir`): waited on, not broken.
    mkdirSync(path);
    await assert.rejects(acquireLock({ path, waitMs: 300, pollMs: 50, staleMs: 60e3, handleSignals: false, log: silent }), (e) => e.code === 'ELOCKWAIT');
    assert.equal(statSync(path).isDirectory(), true);
    // Old enough: broken.
    const old = (Date.now() - 2 * 3600e3) / 1000;
    utimesSync(path, old, old);
    const lock2 = await acquireLock({ path, waitMs: 2000, pollMs: 50, handleSignals: false, log: silent });
    lock2.release();
    assert.equal(existsSync(path), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('lock: the run command takes the lock around a command and releases it after', () => {
  const dir = tmp();
  const path = join(dir, 'browser');
  try {
    const r = spawnSync(process.execPath, [join(ROOT, 'tools/qa/browser-lock.mjs'), 'run', '--label=t', '--', process.execPath, '-e', `const fs=require('fs');process.stdout.write(String(fs.existsSync(${JSON.stringify(join(path, OWNER_FILE))})));process.exit(3)`], { encoding: 'utf8', env: { ...process.env, GRODDLE_BROWSER_LOCK: path } });
    assert.equal(r.stdout, 'true');
    assert.equal(r.status, 3, 'the command\'s exit code');
    assert.equal(existsSync(path), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('lock: parseFlags', () => {
  assert.deepEqual(parseFlags(['--wait=5', '--label=x y', '--', 'node', '--wait=9']), { flags: { wait: '5', label: 'x y' }, rest: ['node', '--wait=9'] });
});

// —— Chrome flags ——

test('browser: the project flags, plus local network access for online', () => {
  assert.deepEqual(browserArgs().slice(0, 2), ['--use-angle=metal', '--enable-gpu']);
  assert.equal(browserArgs().some((a) => a.includes('LocalNetworkAccessChecks')), false);
  assert.ok(browserArgs({ online: true }).some((a) => /^--disable-features=.*LocalNetworkAccessChecks/.test(a)));
});
