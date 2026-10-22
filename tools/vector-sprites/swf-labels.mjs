#!/usr/bin/env node
/**
 * List every DefineSprite in a SWF with its frame count and FrameLabels
 * (label -> 1-based frame range), from FFDec's -dumpSWF tag dump.
 * Usage: node tools/vector-sprites/swf-labels.mjs <file.swf> [--json]
 */
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import os from 'node:os';

export const JAVA = '/opt/homebrew/opt/openjdk@21/bin/java';
export const FFDEC = `${os.homedir()}/Documents/glitch-audit/tools/ffdec/ffdec.jar`;

export function swfSprites(swf) {
  const out = execFileSync(JAVA, ['-jar', FFDEC, '-dumpSWF', swf], { encoding: 'utf8', maxBuffer: 1 << 28 });
  const sprites = [];
  let cur = null;
  let depth = 0;
  for (const line of out.split('\n')) {
    // Indices are right-aligned, so nesting shows in the column where `N.` ends.
    const m = /^[0-9a-f]+:(\s+\d+)\.\s+(\S+)(.*)$/.exec(line);
    if (!m) continue;
    const indent = m[1].length;
    const tag = m[2];
    if (tag === 'DefineSprite') {
      const id = Number(/chid:\s*(\d+)/.exec(m[3])[1]);
      cur = { id, frames: 0, labels: [] };
      depth = indent;
      sprites.push(cur);
      continue;
    }
    if (cur && indent <= depth) cur = null;
    if (!cur) continue;
    if (tag === 'ShowFrame') cur.frames += 1;
    else if (tag === 'FrameLabel') cur.labels.push({ name: /name:\s*"([^"]*)"/.exec(m[3])[1], start: cur.frames + 1 });
  }
  for (const s of sprites) {
    s.labels.forEach((l, i) => { l.end = (s.labels[i + 1]?.start ?? s.frames + 1) - 1; l.count = l.end - l.start + 1; });
  }
  return sprites;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const sprites = swfSprites(process.argv[2]);
  if (process.argv.includes('--json')) console.log(JSON.stringify(sprites, null, 1));
  else for (const s of sprites.filter((x) => x.labels.length)) {
    console.log(`sprite ${s.id} (${s.frames} frames)`);
    for (const l of s.labels) console.log(`  ${l.name}: ${l.start}-${l.end} (${l.count})`);
  }
}
