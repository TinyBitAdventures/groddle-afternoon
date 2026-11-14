/**
 * A rock's base texture is its sheet's own URL (lane chk2, found while tracing #312): spawnMineRock
 * asked for `${worldSheet}?v=exact-rock-cells-1`, which is the _1 sheets' SHEETS URL but not the
 * _2 and _3 shapes' (ROCK_SHAPE_SHEETS lists them bare), so every shaped rock's street loaded a
 * second copy of its sheet under another URL. It now takes SHEETS[textureKey].url.
 * Run: node --test tests/rock-sheet-url.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROCK_CATALOG, ROCK_SHAPES, ROCK_SHAPE_SHEETS, rockShapeSheet } from '../public/js/mining.js?v=b28fef74';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const game = readFileSync(join(root, 'public/game.js'), 'utf8');
const spawn = game.slice(game.indexOf('function spawnMineRock('), game.indexOf('\n}\n', game.indexOf('function spawnMineRock(')));

describe('a rock draws from the one copy of its sheet', () => {
  it('spawnMineRock takes the base texture from the SHEETS row loadSheets loaded', () => {
    assert.match(spawn, /const fallbackTexture = textureFromUrl\(SHEETS\[look\.textureKey\]\?\.url \|\|/);
  });
  it('every shape has a SHEETS row under its textureKey (via ROCK_SHAPE_SHEETS)', () => {
    for (const [cls, shapes] of Object.entries(ROCK_SHAPES)) {
      for (const shape of Object.keys(shapes)) {
        const look = rockShapeSheet(cls, Number(shape));
        assert.equal(ROCK_SHAPE_SHEETS[look.textureKey]?.url, look.worldSheet, `${cls} ${shape}`);
      }
    }
    assert.match(game, /\.\.\.ROCK_SHAPE_SHEETS,/);
  });
  it("each _1 sheet's SHEETS URL is the one the yard and home rocks ask for", () => {
    for (const def of Object.values(ROCK_CATALOG)) {
      const row = new RegExp(`${def.textureKey}: \\{\\n\\s+url: '${def.worldSheet.replace(/[.]/g, '\\.')}\\?v=exact-rock-cells-1'`);
      assert.match(game, row, def.classTsid);
    }
  });
});
