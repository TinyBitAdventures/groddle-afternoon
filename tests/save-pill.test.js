// The multiplayer save pill (Austin 2026-10-28): it sits in the pack under its hint, not over the
// slots or the award and new-day screens, and a routine autosave stays "Saved" (js/online-boot.js).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pillStateFor, SAVING_SHOWN_AFTER_MS } from '../public/js/online-boot.js?v=g409-1';

const root = join(import.meta.dirname, '..');
const boot = readFileSync(join(root, 'public/js/online-boot.js'), 'utf8');
const build = readFileSync(join(root, 'tools/play-online/build.mjs'), 'utf8');

describe('save pill', () => {
  it('a routine autosave reads as Saved; only a slow save shows Saving', () => {
    assert.equal(pillStateFor('pending'), 'saved');
    assert.equal(pillStateFor('saving'), 'saved');
    assert.equal(pillStateFor('saving', { slow: true }), 'saving');
    assert.equal(SAVING_SHOWN_AFTER_MS, 1500);
  });
  it('problems show at once', () => {
    for (const s of ['offline', 'error', 'conflict', 'signed-out', 'saved']) assert.equal(pillStateFor(s), s);
  });
  it('mounts in the pack under its hint, the window corner only without a pack', () => {
    assert.match(boot, /document\.querySelector\('\.pack-hint'\)/);
    assert.match(boot, /side\.append\(hint, pill\);\n\s+pill\.classList\.add\('in-pack'\);/);
    assert.match(build, /\.save-pill\.in-pack \{ position: static; z-index: auto;/);
  });
});
