/**
 * G507, G605: a rooting street Piggy sniffs with its own clip. The published npc_piggy.swf and the
 * OGA sheets have no sniff; Tiny Speck's authoring file glitch-items/inhabitants/piggy/npc_piggy.fla
 * keeps the pig clip's "root" (frames 251-299), which tools/vector-sprites/fla-labels.mjs draws
 * (CC0) with the placement it finds on the chew the shipped sheets do have. Before it the chew
 * stood in (features/animal-mood-feature.js PIGGY_MOOD_SHEETS).
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { imageSize } from '../tools/image-size.mjs';

const root = join(import.meta.dirname, '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

describe('the Piggy\'s sniff, from Tiny Speck\'s authoring file', () => {
  it('the root sheet is drawn from npc_piggy.fla, placed by the chew it reproduces, with its 3x twin', async () => {
    const results = JSON.parse(read('tools/vector-sprites/fla-labels-results.json'));
    const r = results.sheets['assets/sprites/npc_piggy__x1_root'];
    assert.deepEqual([r.fla, r.clip, r.label, r.frames, r.flaFrames, r.fw, r.fh, r.cols], ['inhabitants/piggy/npc_piggy.fla', 'pig', 'root', 49, [251, 299], 88, 62, 10]);
    assert.ok(r.refScore >= 0.95, `the chew drawn the same way lands on the shipped chew: ${r.refScore}`);
    const one = imageSize(join(root, 'public/assets/sprites/npc_piggy__x1_root.webp'));
    const three = imageSize(join(root, 'public/assets/sprites/npc_piggy__x1_root@3x.webp'));
    assert.deepEqual([one.w, one.h], [880, 310]);
    assert.deepEqual([three.w, three.h], [2640, 930]);
    const { HIRES_SPRITES } = await import('../public/js/sprite-hires.js?v=ac5f0e68');
    assert.equal(HIRES_SPRITES.get('assets/sprites/npc_piggy__x1_root.webp'), 'assets/sprites/npc_piggy__x1_root@3x.webp');
    execFileSync(process.execPath, [join(root, 'tools/vector-sprites/fla-labels.mjs'), '--check'], { stdio: 'pipe' });
  });

  it('a rooting stop and a shared path\'s sniff play it; the chew no longer stands in', () => {
    const src = read('public/js/features/animal-mood-feature.js');
    assert.match(src, /root: Object\.freeze\(\{ path: 'assets\/sprites\/npc_piggy__x1_root\.webp', fw: 88, fh: 62, cols: 10, frames: 49 \}\)/);
    assert.equal((src.match(/PIGGY_MOOD_SHEETS\.root, \{ restore: false \}/g) || []).length, 2);
    assert.doesNotMatch(src, /lookScreen : PIGGY_MOOD_SHEETS\.chew/);
  });
});
