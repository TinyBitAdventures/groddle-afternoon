/**
 * The loading card on a phone (Austin's iPhone, 2026-11-12): "Loading Groddle Afternoon" sat right of
 * centre and ran off the 402 px screen. Its 92vw was wider than the room inside the loader's padding, so
 * the grid's auto column grew past the screen.
 * Run: node --test tests/boot-loader-centred.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const css = readFileSync(join(root, 'public/style.css'), 'utf8');
const rule = (sel) => {
  const at = css.indexOf(`\n${sel} {`);
  assert.ok(at >= 0, sel);
  return css.slice(at, css.indexOf('\n}', at));
};

describe('the loading card on a phone', () => {
  it('one column the screen\'s width, 16 px gutters', () => {
    const loader = rule('.boot-loader');
    assert.match(loader, /place-items: center;/);
    assert.match(loader, /grid-template-columns: minmax\(0, 1fr\);/);
    assert.match(loader, /padding: var\(--sp-12\) var\(--sp-8\);/);
  });
  it('the card is at most the column, never a share of the window', () => {
    const card = rule('.boot-loader-card');
    assert.match(card, /width: min\(410px, 100%\);/);
    assert.doesNotMatch(card, /vw/);
  });
});
