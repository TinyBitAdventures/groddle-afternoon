/**
 * Lane phonehome (Friendly's iPhone Safari reports, 2026-11-13): the home's Cultivate and Decorate
 * bars, the Groups, Account and Auctions windows and their kin on a phone in portrait.
 * Run: node --test tests/phone-home-panels.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, 'public', p), 'utf8');
const css = read('style.css');
const builderJs = read('js/ui/home-builder.js');

describe('#275 the Cultivate bars on a phone', () => {
  const at = css.indexOf('/* Report #275 (Friendly, iPhone Safari)');
  const block = css.slice(at, css.indexOf('/* The Pack tab\'s slots', at) > 0 ? css.indexOf('Decoration Mode\n   holds the avatar', at) + 200 : at + 4000);
  it('has its phone block', () => assert.ok(at > 0));
  it('keeps the close button on the banner: the buttons wrap and the banner spans the stage', () => {
    assert.match(block, /\.hb-banner \{ left: var\(--hud-inset\); right: calc\(var\(--inset-r, 0px\) \+ var\(--hud-inset\)\); max-width: none; transform: none;/);
    assert.match(block, /\.hb-banner-actions \{ flex: 1 1 auto; flex-wrap: wrap; min-width: 0; \}/);
    assert.match(block, /\.hb-banner \.hb-close \{ margin-left: auto; \}/);
  });
  it('the title steps aside only while there are buttons, and stays readable aloud', () => {
    assert.match(block, /\.hb-banner:has\(\.hb-banner-actions > \*\) \.hb-banner-text \{ position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset\(50%\); \}/);
  });
  it('stacks the Cultivation picker so the choices get the width', () => {
    assert.match(block, /\.hb-panel:has\(> \.hb-aside\) \{ flex-wrap: wrap;/);
    assert.match(block, /\.hb-panel > \.hb-aside \{ flex: 1 1 100%;/);
    assert.match(block, /\.hb-panel:has\(> \.hb-aside\) > \.hb-strip \{ flex: 1 1 0; \}/);
    assert.match(block, /\.hb-panel:has\(> \.hb-aside\) > \.hb-tray-actions \{ flex: 1 1 100%;/);
  });
  it('only on narrow screens (the desktop builder is untouched)', () => {
    const media = block.slice(block.indexOf('@media (max-width: 640px) {'));
    assert.ok(media.startsWith('@media (max-width: 640px) {'));
  });
  it('lifts the stick and Jump over the tray in Cultivation Mode and hides them in Decoration Mode', () => {
    assert.match(css, /:root\.touch-phone\[data-home-builder="cultivate"\] #game-root \.touch-controls \{ bottom: calc\(var\(--hb-tray-up, 0px\) \+ var\(--sp-2\)\); \}/);
    assert.match(css, /:root\.touch-phone\[data-home-builder="decorate"\] #game-root \.touch-controls \{ display: none; \}/);
  });
  it('the builder publishes the tray reach and clears it when it closes', () => {
    assert.match(builderJs, /function syncTrayUp\(\)/);
    assert.match(builderJs, /root\.style\.setProperty\('--hb-tray-up', px\)/);
    assert.match(builderJs, /root\.style\.removeProperty\('--hb-tray-up'\)/);
    assert.match(builderJs, /renderTray\(m\);\n\s+syncTrayUp\(\);/);
  });
});

describe('#279 Cultivate and Change Style under the Social drawer', () => {
  const homes = read('js/features/homes-feature.js');
  it('the home street buttons sit under the drawer, over the HUD', () => {
    const z = (src, re) => Number(src.match(re)?.[1]);
    const modes = z(homes, /\.homes-modes\{[^}]*z-index:calc\(var\(--z-hud\) \+ (\d+)\)/);
    const drawer = z(css, /\.local-chat-dock \{[^}]*z-index: calc\(var\(--z-hud\) \+ (\d+)\);/);
    assert.ok(drawer > 0 && modes > 0, `modes ${modes} drawer ${drawer}`);
    assert.ok(modes < drawer, `modes ${modes} must be under the drawer ${drawer}`);
  });
});
