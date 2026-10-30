#!/usr/bin/env node
/**
 * A static server for QA of the built game (the repo's public/ or a worktree's):
 *
 *   node tools/qa/serve.mjs <dir> <port>        e.g. node tools/qa/serve.mjs public 8940
 *
 * `python3 -m http.server` resets connections under the game's burst of parallel module and
 * asset loads, and the game stalls at the loading card. This one keeps up: a deep listen
 * backlog, keep-alive, no per-request logging, nothing cached (every load reads the files as
 * they are now). Local only (127.0.0.1). A folder without its slash redirects to it (so a
 * page's relative links work, as python's server does) and then serves its index.html.
 * Paths never leave <dir>. Port 0 picks a free port; the line it prints names the port.
 * SIGINT or SIGTERM closes it cleanly (open keep-alive sockets too) and exits 0.
 * It refuses 8793, the realtime server's port.
 *
 * As a module: `const server = await startServer({ root, port })`, `server.port`,
 * `await server.stop()`.
 */
import { createServer } from 'node:http';
import { createReadStream, statSync } from 'node:fs';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The realtime server's port; a QA server must never take it. */
export const REALTIME_PORT = 8793;

/** Pending connections the kernel queues before refusing (python's default is 5; macOS caps it at kern.ipc.somaxconn, 128). */
export const BACKLOG = 1024;

export const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
  '.xml': 'application/xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.wasm': 'application/wasm',
};

/**
 * Where a request path lands inside root: { file } or { redirect } or { status }.
 * Pure apart from stat, so tests can point it at a temp folder.
 */
export function resolveRequest(root, rawUrl) {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(rawUrl, 'http://x').pathname);
  } catch {
    return { status: 400 };
  }
  if (pathname.includes('\0')) return { status: 400 };
  const base = resolve(root);
  const file = resolve(base, `.${pathname}`);
  if (file !== base && !file.startsWith(base + sep)) return { status: 403 };
  let st;
  try { st = statSync(file); } catch { return { status: 404 }; }
  if (st.isDirectory()) {
    if (!pathname.endsWith('/')) {
      const u = new URL(rawUrl, 'http://x');
      return { redirect: `${u.pathname}/${u.search}` };
    }
    const index = join(file, 'index.html');
    try { st = statSync(index); } catch { return { status: 404 }; }
    if (!st.isFile()) return { status: 404 };
    return { file: index, size: st.size };
  }
  if (!st.isFile()) return { status: 404 };
  return { file, size: st.size };
}

/** Starts the server; resolves once it listens. */
export function startServer({ root, port = 0, host = '127.0.0.1', backlog = BACKLOG } = {}) {
  if (!root) throw new Error('startServer: root is required');
  if (Number(port) === REALTIME_PORT) throw new Error(`port ${REALTIME_PORT} is the realtime server's; pick another`);
  const base = resolve(root);
  try {
    if (!statSync(base).isDirectory()) throw new Error();
  } catch {
    throw new Error(`not a folder: ${base}`);
  }
  const server = createServer((req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { Allow: 'GET, HEAD' }).end();
      return;
    }
    const hit = resolveRequest(base, req.url || '/');
    if (hit.redirect) {
      res.writeHead(301, { Location: hit.redirect, 'Content-Length': 0 }).end();
      return;
    }
    if (hit.status) {
      res.writeHead(hit.status, { 'Content-Type': 'text/plain; charset=utf-8' }).end(`${hit.status}\n`);
      return;
    }
    res.writeHead(200, {
      'Content-Type': TYPES[extname(hit.file).toLowerCase()] || 'application/octet-stream',
      'Content-Length': hit.size,
      'Cache-Control': 'no-store',
    });
    if (req.method === 'HEAD') {
      res.end();
      return;
    }
    const stream = createReadStream(hit.file);
    stream.on('error', () => res.destroy());
    stream.pipe(res);
  });
  server.keepAliveTimeout = 30000;
  server.headersTimeout = 35000;
  server.requestTimeout = 0;
  return new Promise((resolvePromise, reject) => {
    server.once('error', reject);
    server.listen({ port: Number(port), host, backlog }, () => {
      server.off('error', reject);
      server.port = server.address().port;
      server.root = base;
      server.stop = () => new Promise((done) => {
        server.close(() => done());
        server.closeAllConnections?.();
      });
      resolvePromise(server);
    });
  });
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const [dir, portText] = process.argv.slice(2);
  if (!dir || portText === undefined || !/^\d+$/.test(portText)) {
    console.error('usage: node tools/qa/serve.mjs <dir> <port>');
    process.exit(2);
  }
  try {
    const server = await startServer({ root: dir, port: Number(portText) });
    console.log(`serving ${server.root} on http://127.0.0.1:${server.port}/`);
    let stopping = false;
    const stop = async () => {
      if (stopping) process.exit(0);
      stopping = true;
      await server.stop();
      process.exit(0);
    };
    process.on('SIGINT', stop);
    process.on('SIGTERM', stop);
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
