// No animation sheet in game.js plays a blank cell (Austin, 2026-10-25: the Spinning Wheel and the
// Bureaucratic Hall clerks blinked out once a loop). A sheet that ends in nothing on purpose is listed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const game = readFileSync(join(root, 'public/game.js'), 'utf8');
// The wheel's disappear clip ends blank: the wheel is gone (its sprite is removed after it).
const ENDS_EMPTY = new Set(['wheelDisappear']);
// The Phantom's appear clip (played once) starts from nothing as it fades in.
const ALLOWED = new Set(['phantomAppear cell 0']);

test('every game.js sheet plays only cells with art', () => {
  const rows = [];
  const re = /(\w+): \{\n\s+url: '([^']+)',\n\s+fw: (\d+), fh: (\d+), cols: (\d+), rows: (\d+)(?:, frameCount: (\w+))?/g;
  const jsDir = join(root, 'public/js');
  const sources = [game, ...readdirSync(jsDir).filter((f) => f.endsWith('.js')).map((f) => readFileSync(join(jsDir, f), 'utf8'))];
  const constant = (name) => Number(sources.map((s) => s.match(new RegExp(`const ${name} = (\\d+);`))?.[1]).find(Boolean));
  for (const m of game.matchAll(re)) {
    if (ENDS_EMPTY.has(m[1])) continue;
    rows.push({ name: m[1], path: join(root, 'public', m[2].split('?')[0]), fw: +m[3], fh: +m[4], cols: +m[5], rows: +m[6], n: m[7] ? (/^\d+$/.test(m[7]) ? +m[7] : constant(m[7])) : +m[5] * +m[6] });
  }
  assert.ok(rows.length > 40, `found ${rows.length} sheets`);
  // Pillow does the pixel work (python3.11 has it); the test skips if it is missing.
  const py = `import json,sys
from PIL import Image
out=[]
for r in json.load(sys.stdin):
    im=Image.open(r['path']).convert('RGBA')
    for i in range(r['n']):
        c,w=i%r['cols'],i//r['cols']; b=(c*r['fw'],w*r['fh'],c*r['fw']+r['fw'],w*r['fh']+r['fh'])
        if b[2]>im.width or b[3]>im.height or not im.crop(b).getchannel('A').getbbox(): out.append(f"{r['name']} cell {i}")
print(json.dumps(out))`;
  let blank;
  try {
    blank = JSON.parse(execFileSync('python3.11', ['-I', '-c', py], { input: JSON.stringify(rows), encoding: 'utf8' }));
  } catch (err) {
    if (/ENOENT|No module named/.test(String(err))) return;
    throw err;
  }
  assert.deepEqual(blank.filter((b) => !ALLOWED.has(b)), []);
});
