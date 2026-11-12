/**
 * G40: Cubimal battles between real players. The realtime server referees
 * every fight (groddle-afternoon-server cubimal_battle.go) by the rules in
 * js/cubimal-battle.js (GameServerJS npc_cubimal_base); this writes them for
 * it: insults, timings, the level and Ego curve, the words, each figure's kind.
 *
 * Run from the game repo root:
 *   node tools/build-realtime-cubimal-battle.mjs          (write)
 *   node tools/build-realtime-cubimal-battle.mjs --check  (fail when stale)
 * Writes data/cubimal_battle.json in the realtime server repo (go:embed in its
 * cubimal_battle.go; found by tools/repos.mjs: GRODDLE_SERVER_DIR, else
 * ../groddle-afternoon-server).
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { requireServer, serverPath } from './repos.mjs';
import { ensureCubimalItems } from '../public/js/cubimals.js?v=3a284648';
import { cubimalBattleServerData } from '../public/js/cubimal-battle.js?v=5ad120a0';

const outPath = serverPath('data', 'cubimal_battle.json');

export function cubimalBattleData() {
  ensureCubimalItems();
  return cubimalBattleServerData();
}

async function main() {
  requireServer();
  const out = cubimalBattleData();
  const text = `${JSON.stringify(out)}\n`;
  const figures = Object.keys(out.labels).length;
  if (process.argv.includes('--check')) {
    const now = await readFile(outPath, 'utf8').catch(() => '');
    if (now !== text) {
      console.error(`${outPath} is stale: run node tools/build-realtime-cubimal-battle.mjs`);
      process.exit(1);
    }
    console.log(`${outPath} is current (${figures} figures, ${out.insults.length} insults)`);
    return;
  }
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, text);
  console.log(`${figures} figures, ${out.insults.length} insults -> ${outPath}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await main();
