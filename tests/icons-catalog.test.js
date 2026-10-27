/**
 * Item Catalog icons added for register G174 (tools/icon-hires plan entries
 * with an `oga` 1x or a `seed` 1x made from the SWF render).
 * Run: node --test tests/icons-catalog.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HIRES_ICONS } from '../public/js/icon-hires.js?v=g373-1';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const icons = join(root, 'public/assets/sprites/icons');
const plan = JSON.parse(readFileSync(join(root, 'tools/icon-hires/plan.json'), 'utf8'));
const added = Object.entries(plan).filter(([, p]) => p.oga || p.seed);
const SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Width and height of a PNG, after checking its signature and IHDR chunk. */
function png(file) {
  const b = readFileSync(file);
  assert.ok(b.length > 33 && b.subarray(0, 8).equals(SIG), `${file}: not a PNG`);
  assert.equal(b.toString('ascii', 12, 16), 'IHDR', `${file}: no IHDR`);
  // 8-bit RGBA, grey + alpha or palette: ImageMagick picks the smallest, as for the shipped @3x icons.
  assert.ok(b[24] === 8 && [3, 4, 6].includes(b[25]), `${file}: depth ${b[24]} colour type ${b[25]}`);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

describe('G174 catalog icons', () => {
  it('adds the icons the catalog was missing', () => {
    assert.ok(added.length >= 236, `${added.length} plan entries`);
    const catalog = new Set(JSON.parse(readFileSync(join(root, 'public/items/data.json'), 'utf8')).items.map((i) => i.id));
    // Items left out by decision drop from the catalog but keep their recovered icon (G333: greeters, Austin 2026-10-27).
    const leftOut = new Set(['bag_greeter_badge']);
    for (const [id] of added) if (!leftOut.has(id)) assert.ok(catalog.has(id), `${id} is not a catalog item`);
  });

  it('each one is a 1x PNG plus an @3x PNG exactly three times its size, and listed', () => {
    for (const [id, p] of added) {
      const one = join(icons, `${id}.png`);
      const three = join(icons, `${id}@3x.png`);
      assert.ok(existsSync(one) && existsSync(three), id);
      const a = png(one);
      const b = png(three);
      assert.ok(a.w > 0 && a.h > 0, id);
      assert.deepEqual(b, { w: a.w * 3, h: a.h * 3 }, id);
      if (p.seed) assert.ok(Math.max(a.w, a.h) <= 160, `${id}: seed icon ${a.w}x${a.h} over SEED_MAX`);
      assert.ok(HIRES_ICONS.has(id), `${id} missing from js/icon-hires.js`);
    }
  });

  it('an `oga` 1x is the Tiny Speck PNG byte for byte (when the OGA extract is on this machine)', () => {
    let checked = 0;
    for (const [id, p] of added) {
      if (!p.oga) continue;
      const src = p.oga.replace(/^~/, homedir());
      if (!existsSync(src)) continue;
      assert.ok(readFileSync(src).equals(readFileSync(join(icons, `${id}.png`))), id);
      checked++;
    }
    assert.ok(checked === 0 || checked >= 90, `${checked} checked`);
  });

  it('seed_size keeps the zoom-1 size and caps the longest side at 160', () => {
    const py = 'import sys; sys.path.insert(0, "tools/icon-hires"); import hires, json; '
      + 'print(json.dumps([hires.seed_size(r, z) for r, z in [((132, 120, 0, 0, 0, 0), 3), ((1200, 600, 0, 0, 0, 0), 2), ((10, 4, 0, 0, 0, 0), 4)]]))';
    const out = JSON.parse(execFileSync('python3', ['-I', '-B', '-c', py], { cwd: root, encoding: 'utf8' }));
    assert.deepEqual(out, [[44, 40], [160, 80], [2, 1]]);
  });
});
