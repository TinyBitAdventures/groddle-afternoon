/**
 * G902 (#433): on an upright phone the arrival notices ("A new afternoon begins on ...",
 * "... loaded.") lay over the route card ("You Have Arrived!"), which stands under the street's
 * name below 760 px, right where the notice stack starts. The card is an obstacle: the stack goes
 * under it.
 * Run: node --test tests/notices-clear-route-card.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { placeBelow } from '../public/js/notify.js?v=c9d79ec5';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const view = readFileSync(join(root, 'public/js/notify-view.js'), 'utf8');
const css = readFileSync(join(root, 'public/style.css'), 'utf8');

describe('G902: notices keep clear of the route card', () => {
  it('the route card is one of the stack\'s obstacles', () => {
    assert.match(view, /const gps = relRect\(root\.querySelector\('\.route-gps'\), rr\);\s*if \(gps\) blockers\.push\(gps\);/);
    // Measured before the zones are built from the blockers.
    assert.ok(view.indexOf("root.querySelector('.route-gps')") < view.indexOf('zones = {\n      top: plate'));
  });

  it('under 760 px the card stands under the street name, where the stack starts', () => {
    assert.match(css, /@media \(max-width: 760px\) \{\s*\[data-ui="modern"\] #game-root \.route-gps \{ top: calc\(2 \* var\(--hud-h\)/);
  });

  it('an upright phone (402 px): the stack under the card, two notices one under the other', () => {
    // Boxes measured in WebKit at 402x812 (#game-root px): the card under the street name, the stack's start.
    const card = { left: 132, top: 104, right: 342, bottom: 160 };
    const stack = { left: 12, right: 390, top: 101, bottom: 161 };
    const place = placeBelow(stack, [card], { margin: 6, maxBottom: 500 });
    assert.deepEqual(place, { dy: 160 + 6 - 101, wait: false });
    // A wide window: the card top right, the stack centred under the name, they never meet.
    assert.deepEqual(placeBelow({ left: 420, right: 860, top: 60, bottom: 120 }, [{ left: 1010, top: 60, right: 1268, bottom: 116 }]), { dy: 0, wait: false });
  });
});
