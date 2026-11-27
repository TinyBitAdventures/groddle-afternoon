// #534 (Austin's ruling, 2026-11-19: live, eight directions): the phone street sheet lists the
// signposts and stations with the way each stands from you. The arrow was worked out once, left or
// right, when the sheet opened; now it follows you while the sheet is open (an auto-walk is when it
// matters) and points in eight directions, so a street with vertical spread (Jutuan Central) reads
// right. A dead zone keeps an arrow from flickering between neighbours.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { PHONE_SIGN_DEAD, PHONE_SIGN_DIRS, PHONE_SIGN_NEAR, phoneSignDir, phoneSignRefresh, phoneSignRows } from '../public/js/features/street-minimap-feature.js?v=e19baaee';

const root = join(import.meta.dirname, '..');
const feature = readFileSync(join(root, 'public/js/features/street-minimap-feature.js'), 'utf8');
const css = readFileSync(join(root, 'public/style.css'), 'utf8');
const at = (deg, d = 500) => [d * Math.cos((deg * Math.PI) / 180), d * Math.sin((deg * Math.PI) / 180)];

describe('phoneSignDir: the way a signpost stands from you', () => {
  it('eight ways, screen space (y grows down)', () => {
    assert.equal(phoneSignDir(400, 0), 'right');
    assert.equal(phoneSignDir(-400, 0), 'left');
    assert.equal(phoneSignDir(0, -400), 'up');
    assert.equal(phoneSignDir(0, 400), 'down');
    assert.equal(phoneSignDir(300, -300), 'up-right');
    assert.equal(phoneSignDir(-300, -300), 'up-left');
    assert.equal(phoneSignDir(300, 300), 'down-right');
    assert.equal(phoneSignDir(-300, 300), 'down-left');
    for (let i = 0; i < 8; i += 1) assert.equal(phoneSignDir(...at(i * 45)), PHONE_SIGN_DIRS[i]);
  });

  it('here within the near radius, whichever way', () => {
    assert.equal(phoneSignDir(0, 0), 'here');
    assert.equal(phoneSignDir(40, -40), 'here');
    assert.equal(phoneSignDir(PHONE_SIGN_NEAR + 1, 0), 'right');
    // A signpost straight above you on a tall street is up, not here (the old rule only looked at x).
    assert.equal(phoneSignDir(10, -600), 'up');
    assert.equal(phoneSignDir(NaN, 0), 'here');
  });

  it('a dead zone: an arrow holds past its edge until the way is clearly the neighbour\'s', () => {
    // 25 degrees below the horizontal: just into down-right's sector, but right holds.
    assert.equal(phoneSignDir(...at(25)), 'down-right');
    assert.equal(phoneSignDir(...at(25), 'right'), 'right');
    assert.equal(phoneSignDir(...at(22.5 + PHONE_SIGN_DEAD.deg - 1), 'right'), 'right');
    assert.equal(phoneSignDir(...at(22.5 + PHONE_SIGN_DEAD.deg + 1), 'right'), 'down-right');
    // And back: down-right holds until well inside right.
    assert.equal(phoneSignDir(...at(20), 'down-right'), 'down-right');
    assert.equal(phoneSignDir(...at(10), 'down-right'), 'right');
    // Across the wrap at 180 degrees.
    assert.equal(phoneSignDir(...at(-160), 'left'), 'left');
    assert.equal(phoneSignDir(...at(170), 'left'), 'left');
    // Leaving 'here' needs a little more than arriving.
    assert.equal(phoneSignDir(PHONE_SIGN_NEAR + 5, 0, 'here'), 'here');
    assert.equal(phoneSignDir(PHONE_SIGN_NEAR + PHONE_SIGN_DEAD.px + 1, 0, 'here'), 'right');
  });
});

describe('the rows and their refresh', () => {
  it('rows take the way from where you stand, x and y', () => {
    const marks = [
      { id: 'top', x: 900, y: 100, tip: 'Up the hill' },
      { id: 'low', x: 200, y: 1200, tip: 'Down below' },
      { id: 'side', x: 1600, y: 800, tip: 'Along' },
    ];
    const rows = phoneSignRows(marks, { x: 1000, y: 800 });
    assert.deepEqual(rows.map((r) => [r.id, r.side]), [['low', 'down-left'], ['top', 'up'], ['side', 'right']]);
    // An x alone still works (left or right only).
    assert.deepEqual(phoneSignRows(marks, 1000).map((r) => r.side), ['left', 'left', 'right']);
  });

  it('the list updates as you move: only the arrows whose way changed', () => {
    const el = () => ({ dataset: {} });
    const items = phoneSignRows([{ id: 'a', x: 2000, y: 500 }, { id: 'b', x: 100, y: 500 }], { x: 1000, y: 500 })
      .map((r) => ({ el: el(), x: r.x, y: r.y, side: r.side }));
    assert.deepEqual(items.map((i) => [i.side, i.el.dataset.side]), [['left', undefined], ['right', undefined]], 'b (x 100) first, left to right');
    assert.equal(phoneSignRefresh(items, { x: 1000, y: 500 }), 0, 'standing still changes nothing');
    // Walk right past a (x 2000): only a's arrow turns.
    assert.equal(phoneSignRefresh(items, { x: 2600, y: 500 }), 1);
    assert.deepEqual(items.map((i) => i.el.dataset.side), [undefined, 'left']);
    // Climb far above both: both are below you.
    assert.equal(phoneSignRefresh(items, { x: 1050, y: -5000 }), 2);
    assert.deepEqual(items.map((i) => i.el.dataset.side), ['down', 'down']);
    // Back down beside them, between: left and right again.
    assert.equal(phoneSignRefresh(items, { x: 1000, y: 520 }), 2);
    assert.deepEqual(items.map((i) => i.el.dataset.side), ['left', 'right']);
    assert.equal(phoneSignRefresh(items, null), 0);
  });
});

describe('wiring', () => {
  it('the open sheet refreshes its arrows every tick on the ground, and forgets them on close', () => {
    assert.match(feature, /phone\.signs\.push\(\{ el: b, x: row\.x, y: row\.y, side: row\.side \}\);/);
    assert.match(feature, /if \(me && me\.onGround !== false && phoneSignRefresh\(phone\.signs, \{ x: me\.x, y: me\.y \}\)\)/);
    // Only while open: the refresh sits after the closed-sheet return.
    const tick = feature.slice(feature.indexOf('onTick(dtMs, now, engine) {'));
    assert.ok(tick.indexOf('if (!view) return;') < tick.indexOf('phoneSignRefresh('));
    assert.match(feature, /phone\.sheet = null;\n\s*phone\.signs = \[\];/);
  });

  it('style.css draws all eight in the existing arrow style: the same glyph, turned', () => {
    assert.match(css, /\.smm-sheet-sign:is\(\[data-side="left"\], \[data-side="up-left"\], \[data-side="down-left"\]\)::before \{ content: "←" \/ ""; \}/);
    assert.match(css, /\.smm-sheet-sign:is\(\[data-side="right"\], \[data-side="up-right"\], \[data-side="down-right"\], \[data-side="up"\], \[data-side="down"\]\)::after \{ content: "→" \/ ""; \}/);
    for (const [side, pos, deg] of [['up-left', 'before', 45], ['down-left', 'before', -45], ['up-right', 'after', -45], ['down-right', 'after', 45], ['up', 'after', -90], ['down', 'after', 90]]) {
      assert.ok(css.includes(`.smm-sheet-sign[data-side="${side}"]::${pos} { transform: rotate(${deg}deg); }`), side);
    }
});
});
