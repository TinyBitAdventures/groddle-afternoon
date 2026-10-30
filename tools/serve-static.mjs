/**
 * A small static server for QA of the built game (the spike's public/ or a worktree's):
 *   node tools/serve-static.mjs <root> <port>
 * The same server as tools/qa/serve.mjs (kept under this name for the readme, CONTRIBUTING and
 * the builders that start it): python3 -m http.server resets connections under the game's
 * parallel module and asset loads, and the game stalls at the loading card; this one keeps up.
 * Local only (127.0.0.1).
 */
import { startServer } from './qa/serve.mjs';

const [root, port] = [process.argv[2], process.argv[3]];
if (!root || !/^\d+$/.test(port || '')) {
  console.error('usage: node tools/serve-static.mjs <root> <port>');
  process.exit(2);
}
try {
  const server = await startServer({ root, port: Number(port) });
  console.log(`serving ${server.root} on http://127.0.0.1:${server.port}/`);
  const stop = async () => { await server.stop(); process.exit(0); };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
} catch (e) {
  console.error(e.message);
  process.exit(1);
}
