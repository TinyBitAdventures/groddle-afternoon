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
import { decorDragTarget } from '../public/js/features/homes-feature.js?v=1cd58b1b';

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

describe('#277 Decoration Mode on a phone', () => {
  const homes = read('js/features/homes-feature.js');
  it('a finger drag moves the camera the other way (the room follows the finger)', () => {
    assert.deepEqual(decorDragTarget({ from: { x: 1200, y: null }, dx: 240, dy: 0 }), { x: 960, y: null });
    assert.deepEqual(decorDragTarget({ from: { x: null, y: null }, dx: -100, dy: 0, playerX: 500 }), { x: 600, y: null });
    assert.deepEqual(decorDragTarget({ from: { x: 800, y: -20 }, dx: 0, dy: 90 }), { x: 800, y: -90 });
  });
  it('only a touch on the bare room pans; a mouse keeps the desktop ways (keys, wheel, edge)', () => {
    assert.ok(homes.includes("} else if (!item && !press && e.pointerType !== 'mouse' && scene.room === 'interior') {"));
    assert.match(homes, /press = \{ kind: 'pan', x: e\.clientX, y: e\.clientY, pointerId: e\.pointerId, dragging: false, from: \{ x: decorCamX, y: decorPan \} \};/);
    assert.match(homes, /if \(press\.kind === 'pan'\) \{[\s\S]{0,300}dragDecorCamera\(engine, press, e\);/);
  });
  it('the tray takes the whole width and the stick and Jump wait (the avatar is held)', () => {
    assert.match(css, /\[data-ui="modern"\] #game-root \.hb-tray \{ right: var\(--hud-inset\); \}/);
    assert.match(css, /:root\.touch-phone\[data-home-builder="decorate"\] #game-root \.touch-controls \{ display: none; \}/);
  });
  it('the Display field keeps 16 px (no iOS zoom) and the actions grow to meet it', () => {
    assert.match(css, /:root\.touch-phone :is\(input:not\(\[type="range"\], \[type="checkbox"\], \[type="radio"\], \[type="button"\], \[type="submit"\]\), textarea, select\) \{ font-size: var\(--fs-lg\) !important; \}/);
    assert.match(css, /:root\.touch-phone\[data-ui="modern"\] #game-root \.hb-pop \.hb-bt \{ min-height: 36px; padding: 0 var\(--sp-6\); font-size: var\(--fs-base\); \}/);
    assert.match(css, /:root\.touch-phone\[data-ui="modern"\] #game-root \.hb-pop \.hb-display-pick \{ flex: 1 1 10rem; min-width: 0; \}/);
  });
});

describe('#272 Groups and #280 Account: Menu windows fit the screen Safari leaves', () => {
  const FAMILY = [
    ['js/features/groups-feature.js', 'grp-panel', 'grp-close'],
    ['js/features/account-backup-feature.js', 'account-panel', 'account-close'],
    ['js/features/buddies-feature.js', 'buddies-panel', 'buddies-close'],
    ['js/features/neighbours-mp-feature.js', 'keys-panel', 'keys-close'],
    ['js/features/home-street-mp-feature.js', 'hs-panel', 'hs-close'],
  ];
  const block = css.slice(css.indexOf('/* PHONEPANELS'), css.indexOf('/* end PHONEPANELS */'));
  it('each window is as tall as the visible screen at most and scrolls inside itself', () => {
    for (const [file, panel] of [...FAMILY, ['js/classic/classic-prefs.js', 'prefs-window']]) {
      const src = read(file);
      const rule = src.match(new RegExp(`\\.${panel} \\{[^}]*\\}`))?.[0] || '';
      assert.match(rule, /max-height: calc\(100vh - 2rem\); max-height: calc\(100dvh - 2rem\); overflow: auto; overscroll-behavior: contain;/, file);
    }
  });
  it('on a phone the title and the close button stay at the top of each', () => {
    assert.ok(block.length > 100, 'the PHONEPANELS block');
    for (const [file, panel, close] of FAMILY) {
      assert.ok(block.includes(`.${panel}`) && block.includes(`.${close}`), panel);
      // The sticky head leans on the close button then the title opening the window.
      assert.match(read(file), /\.append\(x, el\('h2', \{ id: '[a-z]+-title' \}/, file);
    }
    assert.match(block, /> h2:first-of-type \{\n\s+position: sticky; top: 0;/);
    assert.match(block, /:first-child \{\n\s+position: sticky; top: var\(--sp-1\);/);
    assert.match(block, /\.prefs-window > h2 \{ position: sticky; top: 0;/);
  });
});

describe('#278 the Auctions window stops above Safari\'s toolbar', () => {
  for (const [file, shade, win] of [['js/features/auctions-feature.js', 'auc-shade', 'auc-win'], ['js/features/snaps-feature.js', 'snap-shade-win', 'snap-win']]) {
    it(`${win}: its top gap and height are of the screen Safari leaves (dvh), vh kept as the fallback`, () => {
      const src = read(file);
      assert.match(src.match(new RegExp(`\\.${shade} \\{[^}]*\\}`))[0], /padding: 7vh var\(--sp-8\) var\(--sp-8\); padding-top: 7dvh;/);
      assert.match(src.match(new RegExp(`\\.${win} \\{[^}]*\\}`))[0], /max-height: 84vh; max-height: 84dvh;/);
    });
  }
});
