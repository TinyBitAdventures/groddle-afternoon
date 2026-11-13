/**
 * EDGE TO EDGE (Austin 2026-11-13): the play pages ask for viewport-fit=cover, so the street runs
 * under an iPhone's notch and home indicator, and the HUD at each screen edge keeps inside the safe
 * area (style.css LANDSCAPE-HUD, --safe-* = env(safe-area-inset-*), 0 on computers).
 * Browser check: Chromium's Emulation.setSafeAreaInsetsOverride gives real env() values (WebKit can't
 * fake them); the lane's QA sweep found no HUD control inside a 59 px notch on either side, the 21 px
 * home indicator sideways, or a 62 / 34 px top and bottom upright.
 * Run: node --test tests/landscape-safe-area.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');
const css = read('public/style.css');
const start = css.indexOf('/* === LANDSCAPE-HUD (land1) === */');
const end = css.indexOf('/* === end LANDSCAPE-HUD === */');
const block = css.slice(start, end);
const rule = (sel) => {
  const i = block.indexOf(`${sel} {`);
  assert.ok(i >= 0, `rule for ${sel}`);
  return block.slice(i, block.indexOf('}', i));
};

describe('edge to edge on a phone', () => {
  it('both play pages cover the whole screen', () => {
    for (const page of ['public/play/index.html', 'public/play/online/index.html']) {
      assert.match(read(page), /<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" \/>/, page);
    }
  });
  it('one block, above the tickets, with the four insets as tokens', () => {
    assert.ok(start > 0 && end > start);
    const tickets = css.indexOf('/* == TICKETS ==');
    if (tickets >= 0) assert.ok(end < tickets);
    for (const side of ['top', 'right', 'bottom', 'left']) {
      assert.match(block, new RegExp(`--safe-${side[0]}: env\\(safe-area-inset-${side}, 0px\\);`));
    }
  });
  it('the top bar, the name, the drawer, the pack, the buffs and the route card keep inside it', () => {
    const bar = rule('html:not(.stage-pinned)[data-ui="modern"] #wrap > .top-bar');
    assert.match(bar, /top: calc\(var\(--space-1\) \+ var\(--safe-t\)\)/);
    assert.match(bar, /left: calc\(var\(--hud-inset\) \+ var\(--safe-l\)\)/);
    assert.match(bar, /right: calc\(var\(--hud-inset\) \+ var\(--safe-r\)\)/);
    assert.match(rule('[data-ui="modern"] .street-nameplate'), /var\(--safe-t\)/);
    assert.match(rule('[data-ui="modern"] .street-nameplate.is-placed.is-under'), /var\(--safe-t\)/);
    assert.match(rule('.local-chat-dock.social-drawer'), /right: calc\(var\(--hud-inset, 8px\) \+ var\(--safe-r\)\)/);
    const pack = rule('#game-root .pack-bar:not([data-hb-dock])');
    assert.match(pack, /bottom: var\(--safe-b\)/);
    assert.match(pack, /padding-left: max\(calc\(var\(--pack-inset\) \+ var\(--safe-l\)\), var\(--pack-clear-l, 0px\)\)/);
    assert.match(pack, /padding-right: max\(calc\(var\(--pack-inset\) \+ var\(--safe-r\)\), var\(--pack-clear-r, 0px\)\)/);
    assert.match(rule('[data-ui="modern"] #game-root:not([data-sheet]) #buff-strip'), /left: calc\(var\(--hud-inset\) \+ var\(--safe-l\)\)/);
    assert.match(rule('[data-ui="modern"] #game-root .route-gps'), /right: max\(calc\(var\(--hud-inset\) \+ var\(--safe-r\)\), var\(--inset-r\)\)/);
  });
  it('the stick, Jump and the prompts over them already add the insets', () => {
    assert.match(css, /\.touch-stick \{[^}]*left: max\(var\(--sp-4\), env\(safe-area-inset-left, 0px\)\)/);
    assert.match(css, /\.touch-jump \{[^}]*right: max\(var\(--sp-6\), env\(safe-area-inset-right, 0px\)\)/);
    assert.match(css, /\.touch-controls \{[^}]*bottom: calc\(var\(--pack-live-height, 72px\) \+ env\(safe-area-inset-bottom, 0px\)\)/);
  });
});
