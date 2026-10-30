/**
 * The holiday chip sits inside the street nameplate, which lets clicks through to the street
 * (style.css .street-nameplate pointer-events: none), so the chip did nothing when clicked
 * (Austin 2026-10-29). The chip takes pointer events back, and its card comes from the same
 * note-view instance as every other note.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

describe('the holiday chip is clickable', () => {
  it('the nameplate passes clicks through, the chip takes them back', () => {
    const css = read('public/style.css');
    const plate = css.slice(css.indexOf('.street-nameplate {'), css.indexOf('}', css.indexOf('.street-nameplate {')));
    assert.match(plate, /pointer-events: none/);
    const src = read('public/js/features/seasons-feature.js');
    assert.match(src, /\.season-chip \{ pointer-events: auto; cursor: pointer; \}/);
    assert.match(src, /chip\.addEventListener\('click', \(\) => openSeasonCard\(engineRef\)\)/);
  });

  it('imports note-view under the key the other features use', () => {
    const keyIn = (p) => read(p).match(/from '\.\.\/note-view\.js\?v=([^']+)';/)?.[1];
    const seasons = keyIn('public/js/features/seasons-feature.js');
    assert.ok(seasons);
    for (const p of ['street-furniture-feature.js', 'small-items-feature.js', 'home-street-mp-feature.js']) {
      assert.equal(keyIn(`public/js/features/${p}`), seasons, p);
    }
  });

  it('pins the note on a frame the scrolling card cannot clip', () => {
    // The card scrolls (overflow: auto), which cut the pin above its top edge in half (Austin 2026-10-29).
    const src = read('public/js/note-view.js');
    assert.match(src, /\.note-view \.note-frame::before \{ content: ''; position: absolute; z-index: 1; top: -9px;/);
    assert.doesNotMatch(src, /\.note-card::before/);
    assert.match(src, /\.note-view \.note-card \{[^}]*overflow: auto;/);
    assert.match(src, /frame\.appendChild\(card\);/);
  });
});
