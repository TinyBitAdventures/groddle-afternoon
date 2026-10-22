// Check the Graphics codemod against fake Pixi 7 / Pixi 8 recorders.
// Usage: node tools/pixi8/check-graphics.mjs tools/pixi8/cases/*.js
// Each case module exports t<N>(PIXI, flag) functions returning Graphics.
// Runs the original under G7 and the converted code under G8 and compares
// the painted shapes, styles and order (runs of one style as multisets).
// Case b.t5 is a known, flagged difference (a shape drawn while a polygon
// is still open, with fill and line both active).
import { transform, mergeShapeFlush } from './graphics-codemod.mjs';
import { G7, G8, makePIXI, samePaints } from './oracle.mjs';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, basename } from 'node:path';
import { pathToFileURL } from 'node:url';

const dir = mkdtempSync(join(tmpdir(), 'pixi8-gfx-'));
let fail = 0;
for (const f of process.argv.slice(2)) {
  const src = readFileSync(f, 'utf8');
  const r = transform(src, f);
  for (const fl of r.flags) console.log(`  flag ${f}:${fl.line} ${fl.msg}`);
  const o7 = join(dir, `${basename(f)}.v7.mjs`);
  const o8 = join(dir, `${basename(f)}.v8.mjs`);
  writeFileSync(o7, src);
  writeFileSync(o8, mergeShapeFlush(r.code));
  const m7 = await import(pathToFileURL(o7));
  const m8 = await import(pathToFileURL(o8));
  for (const name of Object.keys(m7)) {
    if (!/^t\d/.test(name)) continue;
    for (const args of [[], [true], [false]]) {
      const a = [].concat(m7[name](makePIXI(G7), ...args));
      const b = [].concat(m8[name](makePIXI(G8), ...args));
      for (let i = 0; i < a.length; i++) {
        if (!samePaints(a[i].paints(), b[i].paints())) {
          fail++;
          console.log(`MISMATCH ${f} ${name}(${args}) #${i}`);
        }
      }
    }
  }
}
console.log(fail ? `${fail} mismatches (converted code in ${dir})` : 'all equal');
