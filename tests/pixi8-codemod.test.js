/**
 * tools/pixi8/graphics-codemod.mjs keeps what Pixi 7 painted: each case is run
 * as written under a Pixi 7 Graphics recorder and, converted, under a Pixi 8
 * one (tools/pixi8/oracle.mjs). b.js t5 is the one known, flagged difference.
 * Run: node --test tests/pixi8-codemod.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { transform, mergeShapeFlush } from '../tools/pixi8/graphics-codemod.mjs';
import { G7, G8, makePIXI, samePaints } from '../tools/pixi8/oracle.mjs';

const casesDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'tools', 'pixi8', 'cases');
const KNOWN = new Set(['b.js:t5']);

describe('Pixi 8 Graphics codemod', () => {
  for (const file of readdirSync(casesDir).filter((f) => f.endsWith('.js'))) {
    it(`${file} paints the same shapes, styles and order`, async () => {
      const src = readFileSync(join(casesDir, file), 'utf8');
      const dir = mkdtempSync(join(tmpdir(), 'pixi8-case-'));
      writeFileSync(join(dir, 'v7.mjs'), src);
      writeFileSync(join(dir, 'v8.mjs'), mergeShapeFlush(transform(src, file).code));
      const m7 = await import(pathToFileURL(join(dir, 'v7.mjs')));
      const m8 = await import(pathToFileURL(join(dir, 'v8.mjs')));
      for (const name of Object.keys(m7).filter((n) => /^t\d/.test(n))) {
        if (KNOWN.has(`${file}:${name}`)) continue;
        for (const args of [[], [true], [false]]) {
          const a = [].concat(m7[name](makePIXI(G7), ...args));
          const b = [].concat(m8[name](makePIXI(G8), ...args));
          a.forEach((g, i) => assert.ok(samePaints(g.paints(), b[i].paints()), `${file} ${name}(${args}) #${i}`));
        }
      }
    });
  }
});
