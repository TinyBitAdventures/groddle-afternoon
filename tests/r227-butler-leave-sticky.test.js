/**
 * Report #227 (live, Friendly): "Leave it" on the Butler's Leave a package box only showed after
 * scrolling to the bottom of a long pick list. The box (the keyring's .keys-panel) scrolls as a whole;
 * its row of buttons (.butler-actions: How many and Leave it, or the message box's No message and
 * Leave message) now sticks to the box's foot, so it stays in view while the list scrolls under it.
 * The 2012 Butler asked through its choices dialog; this box is ours, so there is no original layout.
 * Run: node --test tests/r227-butler-leave-sticky.test.js
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const src = readFileSync(join(import.meta.dirname, '..', 'public', 'js', 'features', 'neighbours-mp-feature.js'), 'utf8');
const style = src.slice(src.indexOf('const STYLE = `'), src.indexOf('`;', src.indexOf('const STYLE = `')));

/** The declarations of every rule for a selector, joined. */
function rule(selector) {
  const out = [];
  const re = new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`, 'g');
  for (const m of style.matchAll(re)) out.push(m[1]);
  return out.join(';');
}

describe('report 227: the Butler box keeps its buttons in view', () => {
  it('the box scrolls, padded by --sp-9 at the foot', () => {
    const panel = rule('.keys-panel');
    assert.match(panel, /overflow: auto/);
    assert.match(panel, /max-height: calc\(100vh - 2rem\)/);
    assert.match(panel, /padding: var\(--sp-8\) var\(--sp-9\) var\(--sp-9\)/);
  });

  it('the button row sticks to the foot, over the list, edge to edge', () => {
    const actions = rule('.keys-panel .butler-actions');
    assert.match(actions, /position: sticky/);
    // Exactly the box's bottom padding, so the row sits on the box's edge, not 18 px above it.
    assert.match(actions, /bottom: calc\(-1 \* var\(--sp-9\)\)/);
    assert.match(actions, /margin: var\(--sp-3\) calc\(-1 \* var\(--sp-9\)\) calc\(-1 \* var\(--sp-9\)\)/);
    assert.match(actions, /padding: var\(--sp-5\) var\(--sp-9\) var\(--sp-9\)/);
    assert.match(actions, /background: var\(--surface-card\)/, 'opaque: the list scrolls under it');
    assert.match(actions, /z-index: var\(--z-raised\)/);
    assert.equal((style.match(/\.keys-panel \.butler-actions \{/g) || []).length, 1, 'one rule');
  });

  it('Leave it sits in that row, the last thing in the box', () => {
    const fn = src.slice(src.indexOf('function leavePackage('), src.indexOf('function boxLabel('));
    assert.match(fn, /const actions = el\('div', \{ class: 'butler-actions' \}\);/);
    assert.match(fn, /actions\.append\(label, ok\);\n\s+panel\.append\(grid, actions\);/);
    assert.match(fn, /'data-butler-leave': ''/);
  });
});
