// Report 322 (Gwendolyn's Task): the open bag's tray (#pack-bag) is role="dialog" inside the pack
// band; the award queue's dialog gate (game.js conversationCardOpen) counted it as a conversation
// card, so the turn-in's award waited for good and Part 2 was never offered.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const game = readFileSync(join(root, 'public/game.js'), 'utf8');
const packRow = readFileSync(join(root, 'public/js/ui/pack-row.js'), 'utf8');

const src = game.slice(game.indexOf('const GATED_DIALOG_IDS'), game.indexOf('/** A scene\'s own way in or out'));

/** A stand-in element: `within` lists the ids of its ancestors. */
function el({ id = '', cls = [], within = [], hidden = false } = {}) {
  return {
    id,
    hidden,
    classList: { contains: (c) => cls.includes(c) },
    closest: (sel) => (sel.startsWith('#') && within.includes(sel.slice(1)) ? {} : null),
    getClientRects: () => [{}],
  };
}

function gate(dialogs) {
  const document = {
    getElementById: (id) => (id === 'game-root' ? { querySelectorAll: () => dialogs } : null),
  };
  const getComputedStyle = () => ({ visibility: 'visible' });
  return new Function('document', 'getComputedStyle', `${src}\nreturn conversationCardOpen;`)(document, getComputedStyle)();
}

describe('#322 an open bag does not hold the award queue', () => {
  it('the bag tray is a non-modal role="dialog" in the pack band', () => {
    assert.match(packRow, /row\.id = 'pack-bag';[\s\S]{0,120}row\.setAttribute\('role', 'dialog'\);\s+row\.setAttribute\('aria-modal', 'false'\);/);
    assert.match(packRow, /const bar = \(\) => \$\('pack-bar'\);/);
  });
  it('an open bag tray alone leaves the gate open', () => {
    assert.ok(src.length > 200);
    assert.equal(gate([el({ id: 'pack-bag', cls: ['pack-bag-row'], within: ['pack-bar', 'game-root'] })]), false);
  });
  it('a feature conversation card still holds it', () => {
    assert.equal(gate([el({ cls: ['crab-talk'], within: ['game-root'] })]), true);
    assert.equal(
      gate([el({ id: 'pack-bag', within: ['pack-bar'] }), el({ cls: ['crab-talk'], within: ['game-root'] })]),
      true
    );
  });
  it('hidden dialogs and the gated screens never held it', () => {
    assert.equal(gate([el({ hidden: true }), el({ id: 'award-screen' })]), false);
  });
});
