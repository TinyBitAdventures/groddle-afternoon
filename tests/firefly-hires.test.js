// Fireflies were the only creature sheets without a 3x file (the low-resolution audit of
// 2026-11-12: 3.8 device px per texel on Firebog). FFDec played their glow pulse (sprite 2) on its
// own clock while the OGA sheets hold it on frame 4, so the sweep rejected them; the job now bakes
// the recorder's state with that frame held (tools/vector-sprites/swf-record.mjs `hold`).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { imageSize } from '../tools/vector-sprites/aligned-art.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pub = join(root, 'public');
const SHEETS = ['firefly-full-path', 'firefly-half-path', 'firefly-small-path'].map((n) => `assets/sprites/resources/${n}.webp`);

test('every firefly path sheet has a 3x twin exactly three times its size', async () => {
  const { HIRES_SPRITES } = await import('../public/js/sprite-hires.js?v=d4cce9f9');
  const results = JSON.parse(readFileSync(join(root, 'tools/vector-sprites/results.json'), 'utf8'));
  for (const path of SHEETS) {
    const twin = HIRES_SPRITES.get(path);
    assert.equal(twin, path.replace('.webp', '@3x.webp'), path);
    assert.ok(existsSync(join(pub, twin)), twin);
    const one = imageSize(join(pub, path));
    const hi = imageSize(join(pub, twin));
    assert.deepEqual([hi.w, hi.h], [one.w * 3, one.h * 3], twin);
    assert.equal(results[path].status, 'ok', path);
    assert.ok(results[path].score >= 0.94 && results[path].minFrame >= 0.9, `${path} ${results[path].score}`);
  }
});

test('the firefly job holds the glow pulse where the OGA sheets show it', () => {
  const m = JSON.parse(readFileSync(join(root, 'tools/vector-sprites/sharp-sweep.json'), 'utf8'));
  const job = m.jobs.find((j) => j.name === 'firefly');
  assert.deepEqual(job.record.clips, []);
  assert.deepEqual(job.record.hold, { 2: 4 });
  assert.match(readFileSync(join(root, 'tools/vector-sprites/swf-record.mjs'), 'utf8'), /let childFrame = held\.get\(char\) \?\? 1;/);
});
