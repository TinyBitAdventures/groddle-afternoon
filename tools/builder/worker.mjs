#!/usr/bin/env node
/**
 * LEVEL BUILDER: the builder worker (spec 8.4). A small Node server on 127.0.0.1:8794 that runs, for
 * the site's routes (groddle-afternoon-site src/AdminBuilderAgent.php through src/BuilderWorker.php),
 * what PHP cannot: the validator (public/js/builder/validate.js), renders with the game's own
 * renderer (tools/builder/render.mjs, Chrome under the browser lock, closed after 60 s idle), the
 * deco catalog search, the style profiles and the guide.
 *
 *   node tools/builder/worker.mjs [--port 8794]
 *   node tools/builder/worker.mjs --restart          stop the running worker (its pid file) and start again
 *   node --watch tools/builder/worker.mjs           restarts by itself whenever a file it loaded changes
 *
 * It loads the validator once, so after a code change it is stale: GET /health says so
 * ({stale: true, changed: [files]}), every answer carries X-Builder-Worker-Stale: 1, and it logs it.
 * Restart it (--restart), or run it under `node --watch`.
 *
 * Every call is a POST signed by the site the ServiceCall way (X-Groddle-Worker, prefix
 * groddle-builder-worker/1, 60 s window, each nonce once), with a secret derived from the builder
 * master (~/.config/groddle/builder.secret, or GRODDLE_BUILDER_SECRET_FILE; the site's option
 * groddle_builder_secret_file names the same file). It listens on loopback only, and answers
 * nothing unsigned except GET /health. It serves this checkout's game files (public/), so run it in
 * the checkout whose validator and renderer you want; when it is not running the site answers 503.
 *
 *   POST /validate {zone, rules?, reach?, assetFiles?}                   the report (spec 7.2)
 *   POST /render   {draft, rev, zone, params, assetFiles?, art?}          image/png; X-Builder-Findings: <error>,<warn>
 *   POST /decos    {q?, layer?, hub?, family?, animated?, limit?}         {decos:[...]}
 *   POST /style    {profile}                                             a style profile
 *   POST /guide    {}                                                    the guide (spec 8.6)
 */
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { configDir } from './sign.mjs';
import { pathToFileURL } from 'node:url';
import { readMaster, masterFile, workerSecret, verifyWorker, WORKER_HEADER } from './sign.mjs';
import { loadValidatorContext } from './validator-context.mjs';
import { validateZone } from '../../public/js/builder/validate.js?v=faa3883f';
import { createRenderer, renderInput } from './render.mjs';
import { catalog, searchDecos, styleProfile } from './catalog.mjs';
import { builderGuide } from './guide.mjs';
import { RENDER } from './limits.mjs';

export const PORT = 8794;
export const HOST = '127.0.0.1';
const MAX_BODY = 16 * 1024 * 1024;
const NONCE_KEEP_MS = 120_000;
const CACHE_MAX = 40;

class Refusal extends Error {
  constructor(status, code, message, data = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.data = data;
  }
}

/** PURE: a validator ctx for one call: the loaded data plus the call's rules and stored new art. */
export function callContext(base, { rules = null, assetFiles = null } = {}) {
  const ctx = { ...base };
  if (Array.isArray(rules) && rules.length) ctx.rules = rules.map((r) => String(r).replace(/\*$/, ''));
  if (assetFiles && typeof assetFiles === 'object') ctx.assetFiles = new Map(Object.entries(assetFiles).map(([name, sha256]) => [name, { sha256 }]));
  return ctx;
}

/** The worker's handlers, without the HTTP (tests call these). */
export function createHandlers({ renderer = null, ctx = null } = {}) {
  let base = ctx;
  const ctxBase = () => (base ??= loadValidatorContext());
  let rend = renderer;
  const cache = new Map();
  return {
    validate(body) {
      if (!body?.zone || typeof body.zone !== 'object') throw new Refusal(400, 'builder_bad_call', 'Send {zone}.');
      const report = validateZone(body.zone, callContext(ctxBase(), body));
      if (body.reach !== true) delete report.reach;
      return report;
    },
    async render(body) {
      const p = body?.params || {};
      if (!body?.zone || typeof p.street !== 'string') throw new Refusal(400, 'builder_bad_call', 'Send {zone, params: {street, ...}}.');
      const scale = Number(p.scale ?? 0.25);
      if (!(scale >= RENDER.scale[0] && scale <= RENDER.scale[1])) throw new Refusal(400, 'builder_bad_render', 'scale is 0.05 to 1.');
      const key = createHash('sha256').update(JSON.stringify([body.zone, p])).digest('hex');
      if (cache.has(key)) {
        const hit = cache.get(key);
        cache.delete(key);
        cache.set(key, hit);
        return { ...hit, cached: true };
      }
      let input;
      try {
        input = renderInput(body.zone, p.street, callContext(ctxBase(), body), p);
      } catch (e) {
        throw new Refusal(e.status || 422, e.code || 'builder_invalid', e.message, e.data || {});
      }
      rend ??= createRenderer({ label: 'builder worker render' });
      const out = await rend.render(input, body.art || {});
      const done = { png: out.png, width: out.width, height: out.height, counts: input.counts };
      cache.set(key, done);
      while (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
      return done;
    },
    decos(body) {
      return { decos: searchDecos(catalog(), body || {}) };
    },
    style(body) {
      const p = styleProfile(body?.profile || 'default');
      if (!p) throw new Refusal(404, 'builder_not_found', `No style profile "${body?.profile}". Try default or hub-<id>.`);
      return p;
    },
    guide() {
      return builderGuide();
    },
    async close() {
      await rend?.close();
    },
  };
}

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
/** The code the worker runs: the builder's tools and the game's modules (their mtimes). */
export function codeStamp(root = ROOT) {
  const out = new Map();
  const walk = (dir) => {
    if (!existsSync(dir)) return;
    for (const d of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, d.name);
      if (d.isDirectory()) walk(p);
      else if (/\.m?js$/.test(d.name)) out.set(p.slice(root.length + 1), statSync(p).mtimeMs);
    }
  };
  walk(join(root, 'tools/builder'));
  walk(join(root, 'public/js'));
  return out;
}
/** PURE: the files that changed (or came or went) between two stamps. */
export function staleFiles(then, now) {
  const out = [];
  for (const [f, t] of now) if (then.get(f) !== t) out.push(f);
  for (const f of then.keys()) if (!now.has(f)) out.push(f);
  return out.sort();
}
/** Where a running worker keeps its pid (for --restart). */
export const pidFile = (env = process.env) => join(configDir(env), 'builder-worker.pid');

/** The HTTP server. `stale()` answers the files changed since it started ([] when none). */
export function createWorker({ secret, handlers = createHandlers(), log = () => {}, stale = () => [] }) {
  const seen = new Map();
  let warned = false;
  const send = (res, status, body, headers = {}) => {
    const buf = Buffer.isBuffer(body) ? body : Buffer.from(JSON.stringify(body));
    const changed = stale();
    if (changed.length && !warned) {
      warned = true;
      log(`stale: ${changed.length} file(s) changed since start (${changed.slice(0, 3).join(', ')}); restart with --restart, or run under node --watch`);
    }
    res.writeHead(status, { 'Content-Type': Buffer.isBuffer(body) ? 'image/png' : 'application/json', 'Content-Length': buf.length, 'Cache-Control': 'no-store', ...(changed.length ? { 'X-Builder-Worker-Stale': '1' } : {}), ...headers });
    res.end(buf);
  };
  const fail = (res, e) => {
    const status = e instanceof Refusal ? e.status : 500;
    send(res, status, { code: e.code || 'builder_worker_error', message: e.message || 'The worker failed.', data: { status, ...(e.data || {}) } });
  };
  return createServer(async (req, res) => {
    const route = new URL(req.url, 'http://worker').pathname;
    if (req.method === 'GET' && route === '/health') {
      const changed = stale();
      return send(res, 200, { ok: true, pid: process.pid, stale: changed.length > 0, changed: changed.slice(0, 20) });
    }
    const chunks = [];
    let size = 0;
    try {
      for await (const c of req) {
        size += c.length;
        if (size > MAX_BODY) throw new Refusal(413, 'builder_too_large', 'At most 16 MB a call.');
        chunks.push(c);
      }
      const raw = Buffer.concat(chunks).toString('utf8');
      const name = route.slice(1);
      if (req.method !== 'POST' || !['validate', 'render', 'decos', 'style', 'guide'].includes(name)) throw new Refusal(404, 'builder_no_call', 'No such worker call.');
      const now = Date.now();
      for (const [n, t] of seen) if (t < now) seen.delete(n);
      const v = verifyWorker(req.headers[WORKER_HEADER.toLowerCase()], { secret, method: 'POST', route, body: raw });
      if (!v.ok) throw new Refusal(401, 'builder_worker_refused', `The call is not signed by the site (${v.reason}).`, { reason: v.reason });
      if (seen.has(v.nonce)) throw new Refusal(401, 'builder_worker_refused', 'That nonce was already used.', { reason: 'replay' });
      seen.set(v.nonce, now + NONCE_KEEP_MS);
      const body = raw ? JSON.parse(raw) : {};
      const t0 = Date.now();
      const out = await handlers[name](body);
      log(`${name} ${Date.now() - t0} ms`);
      if (name === 'render') {
        const c = out.counts || {};
        return send(res, 200, out.png, { 'X-Builder-Findings': `${(c.fatal || 0) + (c.error || 0)},${c.warn || 0}`, 'X-Builder-Size': `${out.width}x${out.height}`, 'X-Builder-Cached': out.cached ? '1' : '0' });
      }
      return send(res, 200, out);
    } catch (e) {
      if (e instanceof SyntaxError) return fail(res, new Refusal(400, 'builder_bad_call', 'The body is not JSON.'));
      log(`refused ${route}: ${e.message}`);
      return fail(res, e);
    }
  });
}

/** --restart: stop the worker its pid file names, and wait for its port to come free. */
async function stopRunning(port) {
  const file = pidFile();
  const pid = existsSync(file) ? Number(readFileSync(file, 'utf8').trim()) : 0;
  if (pid > 0) {
    try {
      process.kill(pid, 'SIGTERM');
      console.log(`stopped the worker (pid ${pid})`);
    } catch {
      console.log(`no worker with pid ${pid} (a stale pid file)`);
    }
  }
  for (let i = 0; i < 50; i += 1) {
    const up = await fetch(`http://${HOST}:${port}/health`).then(() => true, () => false);
    if (!up) return true;
    await new Promise((r) => setTimeout(r, 100));
  }
  return false;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const at = process.argv.indexOf('--port');
  const port = at > 0 ? Number(process.argv[at + 1]) : PORT;
  if (port === 8793) {
    console.error('Port 8793 is the realtime server\'s.');
    process.exit(2);
  }
  if (process.argv.includes('--restart') && !(await stopRunning(port))) {
    console.error(`Something still answers on ${HOST}:${port} and its pid file does not name it; stop it by hand.`);
    process.exit(2);
  }
  const master = readMaster();
  if (!master) {
    console.error(`No builder master secret at ${masterFile()}. Make one: umask 077; openssl rand -hex 32 > ${masterFile()}`);
    process.exit(2);
  }
  const handlers = createHandlers();
  const started = codeStamp();
  let lastCheck = 0;
  let changed = [];
  const stale = () => {
    if (Date.now() - lastCheck > 2000) {
      lastCheck = Date.now();
      changed = staleFiles(started, codeStamp());
    }
    return changed;
  };
  const server = createWorker({ secret: workerSecret(master), handlers, stale, log: (m) => console.log(`${new Date().toISOString().slice(11, 19)} ${m}`) });
  server.listen(port, HOST, () => {
    try {
      mkdirSync(configDir(), { recursive: true });
      writeFileSync(pidFile(), `${process.pid}\n`, { mode: 0o600 });
    } catch { /* no pid file: --restart cannot find it */ }
    console.log(`builder worker on http://${HOST}:${port} (master ${masterFile()}, pid ${process.pid})`);
  });
  const stop = async () => {
    try {
      if (existsSync(pidFile()) && Number(readFileSync(pidFile(), 'utf8').trim()) === process.pid) rmSync(pidFile());
    } catch { /* gone */ }
    server.close();
    await handlers.close();
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}
