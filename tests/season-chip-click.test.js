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
    assert.match(read('public/js/features/seasons-feature.js'), /from '\.\.\/note-view\.js\?v=note-g175';/);
  });
});
