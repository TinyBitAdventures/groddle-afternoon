/**
 * DECOPACK (Austin 2026-11-01, Modern UI, Decoration Mode): with the Furniture tab the tray is one
 * card (tabs, tiles, filter chips, the Furniture Store); with the Pack tab the tabs shrank to a card of
 * their own and the pack was the HUD row in a separate card beside it: "the pack tab doesn't show the
 * packed items within its tab".
 *
 * The Pack tab now shows the pack inside the same tray, as the other tabs show theirs: the same card
 * and size, the paging arrows, the slots as the tray's tiles (name, count badge, wear and bag bars),
 * the footer with its note and the Furniture Store. The pack's own row (game.js renderPackRow and
 * js/ui/pack-row.js) is docked over the panel rather than redrawn, so every click, drag (to the room,
 * between bags, onto a vendor or a player), open bag, menu, search and the save cloud keep working.
 * PackTabberUI.as (glitch-client pack/) showed the Inventory tab's pack where the furniture bag shows.
 * The builder side is tested in tests/home-builder.test.js ("the Pack tab lays the pack's own row").
 *
 * Run: node --test tests/decor-pack-tab.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
/** The text of one rule (selector through its closing brace). */
const rule = (css, selector) => {
  const at = css.indexOf(`${selector} {`);
  assert.ok(at >= 0, selector);
  return css.slice(at, css.indexOf('}', at) + 1);
};

describe('the Pack tab shows the pack inside the tray', () => {
  it('hands the builder the pack\'s band and its scroller, with the Pack tab\'s note (homes-feature decorateModel)', () => {
    const src = read('public/js/features/homes-feature.js');
    const body = src.slice(src.indexOf('function decorateModel(engine)'), src.indexOf('/** The furniture bag: every piece you can place'));
    assert.match(body, /if \(tabId === 'pack'\) \{/);
    assert.match(body, /dock: \{ node, scroller: document\.getElementById\('pack-scroll'\), owns: 'pack-row' \}/);
    assert.match(body, /note: BUILDER_TEXT\.packNote/);
    // The hint line from DECOITEMS stays the Pack tab's.
    assert.match(body, /hint: tab === 'pack' \? BUILDER_TEXT\.packHint/);
    // The old split: the panel hidden and the HUD row shown beside the tabs, only without a pack band.
    assert.equal((body.match(/panelHidden: true/g) || []).length, 1);
    assert.match(body, /if \(!node\) return \{ \.\.\.model, panelHidden: true/);
  });

  it('wraps the bags and stacks in one scroller, a plain box everywhere else (both pages)', () => {
    for (const page of ['public/play/index.html', 'public/play/online/index.html']) {
      const html = read(page);
      const row = html.slice(html.indexOf('<nav class="pack-row" id="pack-row"'), html.indexOf('</nav>', html.indexOf('id="pack-row"')));
      const scroll = row.indexOf('<div class="pack-scroll" id="pack-scroll">');
      assert.ok(scroll > 0, page);
      const close = row.indexOf('</div>', row.indexOf('id="pack-items"'));
      const inside = row.slice(scroll, close + 6);
      for (const id of ['id="pack-bags"', 'class="pack-vsep"', 'id="pack-items"']) assert.ok(inside.includes(id), `${page} ${id}`);
      // The count, search and the save cloud stay at the row's end, outside the scroller.
      for (const id of ['id="pack-pager"', 'id="pack-count"', 'id="pack-search"', 'id="pack-search-btn"', 'id="pack-hint"']) {
        assert.ok(row.indexOf(id) > close, `${page} ${id} after the scroller`);
      }
    }
    assert.match(read('public/style.css'), /\n\.pack-scroll \{ display: contents; \}/);
  });

  it('docks the band over the tray in both skins: its top and height, the row over the dock box', () => {
    const style = read('public/style.css');
    assert.match(rule(style, '#game-root #pack-bar[data-hb-dock]'), /top: var\(--hb-dock-top\); bottom: auto; height: var\(--hb-dock-h\);/);
    assert.match(rule(style, '#game-root #pack-bar[data-hb-dock] .pack-row'), /position: absolute; left: var\(--hb-dock-x\); top: var\(--hb-dock-y\); width: var\(--hb-dock-w\); height: var\(--hb-dock-rh\);/);
    assert.match(rule(style, '#game-root #pack-bar[data-hb-dock] .pack-scroll'), /overflow-x: auto;/);
    // Its own pager gives way to the tray's arrows; the stacks scroll with the bags.
    assert.match(rule(style, '#game-root #pack-bar[data-hb-dock] .pack-pager'), /display: none;/);
    assert.match(rule(style, '#game-root #pack-bar[data-hb-dock] .pack-slots.pack-items'), /overflow: visible;/);
    // Two ids: the dock beats every skin's band and row rules (Classic's :root[data-ui] ... #game-root .pack-bar).
    const classic = read('public/css/classic.css');
    assert.match(classic, /:root\[data-ui="classic"\]:not\(\.stage-pinned\) #game-root \.pack-bar \{/);
  });

  it('the tray keeps one size and place on every tab: no Pack tab special case left (Modern, Classic)', () => {
    const style = read('public/style.css');
    const classic = read('public/css/classic.css');
    assert.doesNotMatch(style, /\.hb-tray\[data-tab="pack"\]/);
    assert.doesNotMatch(classic, /\.hb-tray\[data-tab="pack"\]/);
    // The dock box is a strip's height: Modern 80 px tiles and 2 px padding; Classic's panel row is fixed.
    assert.match(style, /\[data-ui="modern"\] #game-root \.hb-dock \{ min-height: 84px; \}/);
    assert.match(classic, /grid-template-rows: 0 calc\(81 \* var\(--cu\)\) auto;/);
    // Phones: the tabs, the filter chips and the note keep to one row each.
    const phone = style.slice(style.indexOf('@media (max-width: 640px) {\n  [data-ui="modern"] #game-root .hb-tray {'));
    assert.match(phone, /\.hb-tray \.hb-tabs \{ min-width: 0; max-width: 100%; overflow-x: auto;/);
    assert.match(phone, /\.hb-tray \.hb-filters \{ flex-wrap: nowrap;/);
    assert.match(phone, /\.hb-tray \.hb-tray-note \{ overflow: hidden; text-overflow: ellipsis; white-space: nowrap; \}/);
  });

  it('draws the slots as the tray\'s tiles: Modern 76 x 80 with the name and the corner count, Classic 70 x 70', () => {
    const style = read('public/style.css');
    const tile = rule(style, '[data-ui="modern"] #game-root #pack-bar[data-hb-dock] .pack-scroll .pack-slot');
    assert.match(tile, /width: 76px;\s+height: 80px;/);
    assert.match(rule(style, '[data-ui="modern"] #game-root .hb-tile'), /width: 76px;\s+height: 80px;/);
    assert.match(style, /#pack-bar\[data-hb-dock\] \.pack-scroll \.pack-slot\[data-pack-name\]::after \{ content: attr\(data-pack-name\);/);
    assert.match(rule(style, '[data-ui="modern"] #game-root #pack-bar[data-hb-dock] .pack-scroll .pack-slot .count'), /top: 3px; right: 3px; bottom: auto;[^}]*background: var\(--moss\);/);
    // The open bag's tray keeps the pack's own small slots (the tile look is the scroller's only).
    assert.doesNotMatch(style, /#pack-bar\[data-hb-dock\] \.pack-slots \.pack-slot/);
    const classic = read('public/css/classic.css');
    assert.match(rule(classic, ':root[data-ui="classic"] #game-root #pack-bar[data-hb-dock] .pack-scroll .pack-slot'), /width: calc\(70 \* var\(--cu\)\);\s+height: calc\(70 \* var\(--cu\)\);/);
    assert.match(rule(classic, ':root[data-ui="classic"] #game-root .hb-tile'), /width: calc\(70 \* var\(--cu\)\);\s+height: calc\(70 \* var\(--cu\)\);/);
  });

  it('keeps every pack action: the same row, its scroll moves a stack\'s menu, the drawer stays put', () => {
    const view = read('public/js/ui/pack-row.js');
    assert.match(view, /\$\('pack-scroll'\)\?\.addEventListener\('scroll', \(\) => \{ hideTip\(\); onScroll\(\); \}, \{ passive: true \}\);/);
    const game = read('public/game.js');
    const live = game.slice(game.indexOf('function updateLocalChatDockPosition()'), game.indexOf('function showLocalChatBubble('));
    assert.match(live, /if \(pack\.dataset\.hbDock\) return;/);
    // A stack set down and dragged back is over the pack when it is over the tray (DECOITEMS).
    const homes = read('public/js/features/homes-feature.js');
    assert.match(homes, /function overPack\(clientX, clientY\) \{\n  if \(ui\?\.builder\?\.trayHit\?\.\(clientX, clientY\)\) return true;/);
    // The band lit as a drop target would outline the whole stage width: the tray lights instead.
    assert.match(read('public/style.css'), /#game-root #pack-bar\[data-hb-dock\]\.is-drop-target \{ box-shadow: none; \}/);
  });

  it('says it in plain words, without dashes', () => {
    assert.doesNotMatch(read('public/js/ui/home-builder.js'), /\u2014/);
  });
});
