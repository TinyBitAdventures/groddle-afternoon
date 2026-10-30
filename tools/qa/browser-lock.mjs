#!/usr/bin/env node
/**
 * The one-browser lock. Groddle tabs take 1.5-2 GB each, so every lane and every QA script
 * shares ONE headless Chrome at a time. The lock is a folder: `mkdir` either makes it (you
 * hold the lock) or fails (someone else does), atomically, which is what the lanes' shell
 * scripts already do by hand (`mkdir <lock>`, wait, `rmdir` on exit).
 *
 * Where: $GRODDLE_BROWSER_LOCK, else ~/.cache/groddle/locks/browser. Lanes that share a
 * scratch folder set GRODDLE_BROWSER_LOCK=<scratch>/locks/browser so these tools and their
 * shell scripts take the same lock.
 *
 * This module writes an owner.json inside the folder (pid, host, label, when, a random
 * token), so a waiter can tell a live holder from a dead one. The rules:
 *   - Release removes the lock only when owner.json carries our own token. It never removes
 *     someone else's lock.
 *   - A waiter breaks a lock only when it is provably stale: owner.json names a pid on this
 *     host that is no longer running, or there is no owner.json (a shell script's bare mkdir)
 *     and the folder is older than the stale timeout (default 60 min). A lock whose owner is
 *     still running is never broken, however old.
 *   - Breaking renames the folder aside first (one waiter wins the rename), then removes it.
 *   - Release runs on exit and on SIGINT, SIGTERM and SIGHUP (unless you take the signals).
 *
 *   node tools/qa/browser-lock.mjs status                     who holds it (JSON)
 *   node tools/qa/browser-lock.mjs run [opts] -- <cmd...>     wait, take it, run cmd, release
 *   node tools/qa/browser-lock.mjs wait [opts]                wait until it is free (does not take it)
 *     --wait=<s>    give up after this many seconds (default 1800; exit 75)
 *     --stale=<s>   ownerless locks older than this are stale (default 3600)
 *     --label=<t>   what the holder is doing (shown in status)
 *
 * As a module: `const lock = await acquireLock({ label })`, then `lock.release()`.
 */
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, rmSync, rmdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { homedir, hostname } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const DEFAULT_STALE_MS = 60 * 60 * 1000;
export const DEFAULT_WAIT_MS = 30 * 60 * 1000;
export const OWNER_FILE = 'owner.json';

/** The lock folder this process uses. */
export function lockPath(env = process.env) {
  return resolve(env.GRODDLE_BROWSER_LOCK || join(homedir(), '.cache', 'groddle', 'locks', 'browser'));
}

/** Whether a pid is running here (EPERM means it runs as someone else: still alive). */
export function pidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === 'EPERM';
  }
}

/**
 * Whether a lock someone holds is stale (pure: tests feed it every case).
 *   owner     the parsed owner.json, or null when the folder has none (a shell mkdir)
 *   ageMs     how long ago the folder was made
 *   host      this machine's hostname
 *   alive     (pid) => bool
 *   staleMs   the ownerless timeout
 * Returns { stale, why }.
 */
export function judgeLock({ owner, ageMs, host, alive, staleMs = DEFAULT_STALE_MS }) {
  if (owner && Number.isInteger(owner.pid) && owner.pid > 0) {
    if (owner.host && owner.host !== host) {
      return { stale: false, why: `held from another machine (${owner.host}); never broken here` };
    }
    if (alive(owner.pid)) return { stale: false, why: `held by running pid ${owner.pid}` };
    return { stale: true, why: `owner pid ${owner.pid} is not running` };
  }
  if (!Number.isFinite(staleMs)) return { stale: false, why: 'no owner file; ownerless locks are never broken (stale timeout off)' };
  if (ageMs > staleMs) return { stale: true, why: `no owner file and ${Math.round(ageMs / 1000)} s old (stale after ${Math.round(staleMs / 1000)} s)` };
  return { stale: false, why: `no owner file, ${Math.round(ageMs / 1000)} s old (a shell lock; stale after ${Math.round(staleMs / 1000)} s)` };
}

/** What is at the lock path now: null when free, else { owner, ageMs, ino }. */
export function readLock(path = lockPath()) {
  let st;
  try { st = statSync(path); } catch { return null; }
  let owner = null;
  try { owner = JSON.parse(readFileSync(join(path, OWNER_FILE), 'utf8')); } catch {}
  return { owner, ageMs: Math.max(0, Date.now() - st.mtimeMs), ino: st.ino, mtimeMs: st.mtimeMs };
}

/** status as JSON-able data. */
export function lockStatus({ path = lockPath(), staleMs = DEFAULT_STALE_MS } = {}) {
  const now = readLock(path);
  if (!now) return { path, held: false };
  const verdict = judgeLock({ owner: now.owner, ageMs: now.ageMs, host: hostname(), alive: pidAlive, staleMs });
  return { path, held: true, owner: now.owner, ageSeconds: Math.round(now.ageMs / 1000), ...verdict };
}

/** One try: { ok: true, token } when we made the folder, else { ok: false }. */
function tryTake(path, label) {
  mkdirSync(dirname(path), { recursive: true });
  try {
    mkdirSync(path);
  } catch (e) {
    if (e.code === 'EEXIST') return { ok: false };
    throw e;
  }
  const token = randomBytes(12).toString('hex');
  const owner = { pid: process.pid, host: hostname(), label: label || null, since: new Date().toISOString(), token };
  writeFileSync(join(path, OWNER_FILE), `${JSON.stringify(owner)}\n`);
  return { ok: true, token, owner };
}

/** Breaks a lock judged stale, if it is still the very folder that was judged. */
function breakStale(path, seen, log) {
  let st;
  try { st = statSync(path); } catch { return true; }
  if (st.ino !== seen.ino || st.mtimeMs !== seen.mtimeMs) return false;
  const aside = `${path}.stale-${Date.now()}-${process.pid}`;
  try {
    renameSync(path, aside);
  } catch {
    return false;
  }
  rmSync(aside, { recursive: true, force: true });
  log(`broke a stale browser lock at ${path}`);
  return true;
}

/**
 * Waits for the lock and takes it. Options:
 *   path, label, staleMs, waitMs (Infinity waits forever), pollMs,
 *   log (a function; default console.log),
 *   handleSignals (default true: SIGINT/SIGTERM/SIGHUP release and exit 130/143/129),
 *   isAborted (a function; a truthy answer stops the wait with code 'ELOCKABORT').
 * Resolves { path, owner, release() }; rejects with code 'ELOCKWAIT' after waitMs.
 * release() runs at most once and only removes the lock while it is still ours.
 */
export async function acquireLock({
  path = lockPath(), label = '', staleMs = DEFAULT_STALE_MS, waitMs = DEFAULT_WAIT_MS,
  pollMs = 2000, log = console.log, handleSignals = true, isAborted = () => false,
} = {}) {
  const started = Date.now();
  let saidWaiting = 0;
  for (;;) {
    const stop = isAborted();
    if (stop) {
      const e = new Error(`stopped waiting for the browser lock: ${stop}`);
      e.code = 'ELOCKABORT';
      throw e;
    }
    const took = tryTake(path, label);
    if (took.ok) {
      const lock = makeHandle(path, took, log, handleSignals);
      log(`browser lock taken (${path})`);
      return lock;
    }
    const now = readLock(path);
    if (now) {
      const verdict = judgeLock({ owner: now.owner, ageMs: now.ageMs, host: hostname(), alive: pidAlive, staleMs });
      if (verdict.stale) {
        log(`browser lock is stale: ${verdict.why}`);
        breakStale(path, now, log);
        continue;
      }
      if (Date.now() - saidWaiting > 30000) {
        saidWaiting = Date.now();
        log(`waiting for the browser lock (${path}): ${verdict.why}${now.owner?.label ? `, "${now.owner.label}"` : ''}`);
      }
    }
    if (Date.now() - started > waitMs) {
      const e = new Error(`gave up waiting for the browser lock after ${Math.round(waitMs / 1000)} s (${path})`);
      e.code = 'ELOCKWAIT';
      throw e;
    }
    await new Promise((r) => setTimeout(r, pollMs));
  }
}

function makeHandle(path, took, log, handleSignals) {
  let held = true;
  const handlers = [];
  const release = () => {
    if (!held) return false;
    held = false;
    process.off('exit', release);
    for (const [sig, fn] of handlers) process.off(sig, fn);
    let owner = null;
    try { owner = JSON.parse(readFileSync(join(path, OWNER_FILE), 'utf8')); } catch {}
    if (!owner || owner.token !== took.token) {
      log(`browser lock at ${path} is no longer ours; left as it is`);
      return false;
    }
    try { unlinkSync(join(path, OWNER_FILE)); } catch {}
    try { rmdirSync(path); } catch (e) { log(`could not remove the browser lock: ${e.message}`); return false; }
    log('browser lock released');
    return true;
  };
  process.on('exit', release);
  if (handleSignals) {
    for (const [sig, code] of [['SIGINT', 130], ['SIGTERM', 143], ['SIGHUP', 129]]) {
      const fn = () => { release(); process.exit(code); };
      handlers.push([sig, fn]);
      process.on(sig, fn);
    }
  }
  return { path, owner: took.owner, release, get held() { return held; } };
}

/** Waits until the lock is free without taking it. */
export async function waitFree({ path = lockPath(), staleMs = DEFAULT_STALE_MS, waitMs = DEFAULT_WAIT_MS, pollMs = 2000, log = console.log } = {}) {
  const started = Date.now();
  for (;;) {
    const st = lockStatus({ path, staleMs });
    if (!st.held || st.stale) return st;
    if (Date.now() - started > waitMs) {
      const e = new Error(`still held after ${Math.round(waitMs / 1000)} s: ${st.why}`);
      e.code = 'ELOCKWAIT';
      throw e;
    }
    await new Promise((r) => setTimeout(r, pollMs));
  }
}

/** Parses `--name=value` flags before a `--`; returns { flags, rest }. */
export function parseFlags(argv) {
  const flags = {};
  const rest = [];
  let i = 0;
  for (; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--') { i++; break; }
    const m = /^--([a-z-]+)(?:=(.*))?$/.exec(a);
    if (m) flags[m[1]] = m[2] ?? true;
    else rest.push(a);
  }
  rest.push(...argv.slice(i));
  return { flags, rest };
}

const seconds = (v, fallback) => (v === undefined || v === true ? fallback : (Number(v) === Infinity || v === 'off' ? Infinity : Number(v) * 1000));

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const [cmd, ...more] = process.argv.slice(2);
  const { flags, rest } = parseFlags(more);
  const staleMs = seconds(flags.stale, DEFAULT_STALE_MS);
  const waitMs = seconds(flags.wait, DEFAULT_WAIT_MS);
  const log = (s) => console.error(s);
  if (cmd === 'status') {
    console.log(JSON.stringify(lockStatus({ staleMs }), null, 2));
  } else if (cmd === 'wait') {
    try { console.log(JSON.stringify(await waitFree({ staleMs, waitMs, log }))); } catch (e) { log(e.message); process.exit(75); }
  } else if (cmd === 'run' && rest.length) {
    let lock;
    try {
      lock = await acquireLock({ label: flags.label || rest.join(' ').slice(0, 120), staleMs, waitMs, log, handleSignals: false });
    } catch (e) {
      log(e.message);
      process.exit(75);
    }
    const child = spawn(rest[0], rest.slice(1), { stdio: 'inherit' });
    for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => child.kill(sig));
    child.on('error', (e) => { log(e.message); lock.release(); process.exit(127); });
    child.on('exit', (code, signal) => {
      lock.release();
      process.exit(code ?? (signal ? 128 + ({ SIGINT: 2, SIGTERM: 15, SIGHUP: 1 }[signal] || 1) : 1));
    });
  } else {
    console.error('usage: node tools/qa/browser-lock.mjs status | wait [--wait=<s>] | run [--wait=<s>] [--stale=<s>] [--label=<t>] -- <cmd...>');
    process.exit(2);
  }
}
