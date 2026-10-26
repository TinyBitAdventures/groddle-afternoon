/**
 * A small static server for QA of the built game (the spike's public/ or a worktree's):
 *   node tools/serve-static.mjs <root> <port>
 * python3 -m http.server resets connections under the game's parallel module and asset loads,
 * and the game stalls at the loading card; this one keeps up. Local only (127.0.0.1).
 */
import { createServer } from 'node:http';
import { createReadStream, statSync } from 'node:fs';
import { join, extname, normalize } from 'node:path';
const [root, port] = [process.argv[2], Number(process.argv[3])];
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.wasm': 'application/wasm' };
createServer((req, res) => {
  let p = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname));
  let file = join(root, p);
  if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
  try { if (statSync(file).isDirectory()) file = join(file, 'index.html'); statSync(file); } catch { res.writeHead(404).end(); return; }
  res.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream' });
  createReadStream(file).pipe(res);
}).listen(port, '127.0.0.1');
