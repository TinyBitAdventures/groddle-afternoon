/**
 * PHONEKEYS (Austin 2026-11-12, on his iPhone): a phone (html.touch-phone, the phone gate's device)
 * has no keyboard and no street map. No key letter shows on it (bar, sheets, the Menu, the verb menu,
 * "Esc close", the Map's "M or G map"), the street map is never built there, the Map's head and its
 * line under the map fit, a sheet's title keeps its close button on its row, and the shrine's Learn
 * Faster? box stacks on a narrow window. Computers and tablets keep what they had.
 * Run: node --test tests/phone-keys.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { minimapOffOnDevice } from '../public/js/features/street-minimap-feature.js?v=d03e00f8';
import { hubMapSubtitle } from '../public/js/panel-copy.js?v=85c3e029';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const css = read('public/style.css');
const game = read('public/game.js');
const feature = read('public/js/features/street-minimap-feature.js');
const block = css.slice(css.indexOf('/* PHONEKEYS (Austin 2026-11-12'), css.indexOf('/* end PHONEKEYS */'));
const rules = block.replace(/\/\*[\s\S]*?\*\//g, '');

describe('PHONEKEYS: no key letters on a phone', () => {
  it('one rule hides every key cap, hint and Esc line, in both skins', () => {
    assert.ok(block.length > 100, 'the PHONEKEYS block is there');
    const hide = rules.match(/:root\.touch-phone :is\(([^)]*)\) \{ display: none !important; \}/);
    assert.ok(hide, 'one display:none rule under :root.touch-phone (no skin)');
    const parts = hide[1].split(',').map((s) => s.trim());
    for (const sel of ['.kcap', '.vm-key', '.ui-sheet-esc', 'span.count-pop-esc', '.count-pop-key', '#map-panel .map-hint', '[data-street-map-control]']) {
      assert.ok(parts.includes(sel), `hides ${sel}`);
    }
    // The Menu's key caps are drawn from data-key, not .kcap.
    assert.match(rules, /:root\.touch-phone \.more-list \[data-key\]::after,\s*:root\.touch-phone \.more-list \[data-key-mod\]::before \{ content: none; display: none; \}/);
  });
  it('every rule in the block is for a phone only', () => {
    for (const sel of rules.split('}').map((r) => r.split('{')[0].trim()).filter(Boolean)) {
      for (const one of sel.split(/,\s*(?![^(]*\))/)) assert.match(one.trim(), /^:root\.touch-phone/, one);
    }
  });
  it('the vendor count pop keeps its purse line without the key', () => {
    assert.match(game, /<p class="count-pop-esc mp-modern-only"><span class="count-pop-key"><span class="kcap">Esc<\/span> back · <\/span>\$\{isBuy/);
  });
  it('the street toast names no keys on a phone', () => {
    assert.match(game, /toast\(`\$\{currentStreet\?\.label \|\| 'Hechey Track'\} loaded\.\$\{TOUCH_PHONE \? '' : ' Press L for look · G for map\.'\}`\);/);
  });
});

describe('PHONEKEYS: the Map on a phone', () => {
  it('the region box takes the head; the title steps aside unless the tutorial hides the box', () => {
    assert.match(rules, /body:not\(\.nx-island-map\) #map-panel \.map-head > h2 \{\s*position: absolute; width: 1px; height: 1px;[^}]*clip-path: inset\(50%\)/);
    assert.match(rules, /#map-panel \.map-head \.map-hub-picker \{ flex: 1 1 auto; min-width: 0; margin-right: 0; \}/);
    assert.match(rules, /body:not\(\.nx-island-map\) #map-panel \.map-head > \.ui-sheet-icon \{ display: none; \}/);
    assert.match(rules, /#map-panel \.map-head \.combo-input \{ text-overflow: ellipsis; \}/);
  });
  it('the line under the map takes the width and wraps, and says tap', () => {
    assert.match(rules, /#map-panel \.map-card\.map-hub > \.map-sub \{ padding-right: var\(--space-4\); white-space: normal; text-overflow: clip; \}/);
    const view = { streets: [{ loaded: true }, { loaded: false }] };
    assert.equal(hubMapSubtitle(view, { touch: true }), '2 streets · 1 playable here · tap a street to set a destination or teleport · red star = you');
    assert.match(hubMapSubtitle(view), / click a street /);
    assert.match(game, /sub\.textContent = hubMapSubtitle\(view, \{ touch: TOUCH_PHONE \}\);/);
  });
  it('a sheet title shares its row with the close button', () => {
    assert.match(rules, /:root\.touch-phone\[data-ui="modern"\] #game-root :is\(\.ui-sheet-head, #achieve-panel \.side-head, #skills-panel \.side-head, #buffs-panel \.side-head\) > h2 \{ flex: 1 1 0; \}/);
  });
});

describe('no street map on a phone', () => {
  it('a phone goes without it; a tablet and a computer keep it', () => {
    assert.equal(minimapOffOnDevice({ GRODDLE_DEVICE: 'phone' }), true);
    assert.equal(minimapOffOnDevice({ GRODDLE_DEVICE: 'tablet' }), false);
    assert.equal(minimapOffOnDevice({ GRODDLE_DEVICE: 'computer' }), false);
    assert.equal(minimapOffOnDevice({}), false);
    assert.equal(minimapOffOnDevice(null), false);
  });
  it('init builds no card there, so no snapshot and no tick work', () => {
    const init = feature.slice(feature.indexOf('  init(engine) {'), feature.indexOf('createStreetMinimap(document, host'));
    assert.match(init, /if \(minimapOffOnDevice\(globalThis\)\) \{\s*engine\.setData\?\.\('streetMap', 'phone'\);\s*return;\s*\}/);
    // onTick does nothing without a view.
    assert.match(feature, /onTick\(dtMs, now, engine\) \{\s*if \(!view\) return;/);
  });
});

describe('the shrine on a narrow window', () => {
  it('Learn Faster? stacks: words full width, the button under them', () => {
    const at = css.indexOf('@media (max-width: 520px) {\n  .shrine-learn');
    assert.ok(at > 0);
    const media = css.slice(at, css.indexOf('\n}\n', at));
    assert.match(media, /\.shrine-learn \{ grid-template-columns: minmax\(0, 1fr\); \}/);
    assert.match(media, /\.shrine-learn > \[data-shrine-learn-spend\] \{ grid-column: 1; grid-row: auto; justify-self: stretch;/);
    // The favor chips scroll sideways and fade at the edge they scroll toward.
    assert.match(media, /\.shrine-all-favor \{ mask-image: linear-gradient\(to right/);
  });
});
