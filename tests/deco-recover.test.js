/**
 * G431: street decos the streets placed but the game never shipped, recovered from Tiny Speck's
 * bundle SWFs (tools/deco-pipeline/recover.py): frame 1, as the client stopped every deco not
 * flagged animated (DecoRenderer.as 301-305), at the 2x size every source PNG has.
 * Run: node --test tests/deco-recover.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const python = '/opt/homebrew/bin/python3.11';
const locations = join(homedir(), 'Documents/glitch-audit/research/audio-hunt/raw/glitch-locations');
const rec = JSON.parse(readFileSync(join(root, 'tools/deco-pipeline/recovered.json'), 'utf8')).decos;
const manifest = new Set(JSON.parse(readFileSync(join(root, 'public/assets/decos/manifest.json'), 'utf8')));
const missing = JSON.parse(readFileSync(join(root, 'public/assets/streets/missing-decos.json'), 'utf8'));
const tool = readFileSync(join(root, 'tools/deco-pipeline/recover.py'), 'utf8');

describe('recovered street decos (G431)', () => {
  it('ships every recovered deco: source PNG, manifest entry, 2x WebP, frame 1 of its SWF', () => {
    const names = Object.keys(rec);
    assert.ok(names.length >= 185, `${names.length} recovered`);
    for (const n of names) {
      assert.ok(manifest.has(n), `${n} in manifest.json`);
      assert.ok(existsSync(join(root, `assets-src/decos/groddle/${n}.png`)), `${n}.png source`);
      assert.ok(existsSync(join(root, `public/assets/decos/groddle/${n}.webp`)), `${n}.webp`);
      assert.equal(rec[n].frame, 1, n);
      assert.match(rec[n].swf, /^bundle:[\w-]+\.swf#|^[\w-]+\/[\w-]+\.swf$/, n);
    }
    // The three backgrounds most streets were missing (Austin 2026-10-29).
    for (const n of ['tree_group_bg2_1', 'mountain_trees_darker_1', 'tree_coniferous_bare_1']) assert.ok(rec[n], n);
  });

  it('keeps out the placeholder photo', () => {
    for (const n of ['rook_hall_placeholder_painting']) {
      assert.ok(!manifest.has(n), `${n} held`);
      assert.ok(missing.missing.includes(n), `${n} listed missing`);
      assert.match(tool, new RegExp(`'${n}': '`), `${n} has a reason in recover.py HELD`);
    }
  });

  it('ships the decos the client only played once they play (G435: their frame 1 is the still)', () => {
    for (const n of ['bubble_test', 'stars_fade']) {
      assert.ok(manifest.has(n), `${n} shipped`);
      assert.ok(!missing.missing.includes(n), `${n} not missing`);
      assert.ok(rec[n], `${n} recovered`);
      assert.ok(existsSync(join(root, `public/assets/decos/animated/${n}.json`)), `${n} has a strip`);
    }
  });

  it('keeps the missing inventory consistent', () => {
    assert.equal(missing.missingCount, missing.missing.length);
    assert.equal(missing.present + missing.missingCount, missing.referenced);
    for (const n of missing.missing) assert.ok(!manifest.has(n), `${n} both shipped and missing`);
  });

  it('recover.py --check: nothing recoverable left, files and lists current',
    { skip: (!existsSync(python) && 'needs python3.11') || (!existsSync(locations) && 'needs glitch-locations') }, () => {
      const out = execFileSync(python, ['-I', join(root, 'tools/deco-pipeline/recover.py'), '--check'], { encoding: 'utf8', timeout: 600000 });
      assert.match(out, / 0 problems$/m);
    });
});
