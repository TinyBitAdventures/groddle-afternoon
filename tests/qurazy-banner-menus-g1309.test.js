/**
 * G1309 (Austin 2026-11-25): since the phone's "choose from" chooser stands above the controls
 * (lane chooserk), the "OMG! There's a Qurazy" banner (canvas.overlay-art, --z-overlay) drew over
 * its title for its few seconds: the chooser sits at --z-hud + 15 and Classic's verb menu at
 * --z-world + 3, both under --z-overlay. Lifting them would lift their shade over the HUD, the quest
 * card and Act (which comes up over the chooser to choose), so the banner steps aside instead while
 * a chooser or verb menu is open.
 * Run: node --test tests/qurazy-banner-menus-g1309.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const css = readFileSync(join(ROOT, 'public/style.css'), 'utf8');
const overlayJs = readFileSync(join(ROOT, 'public/js/overlay-art.js'), 'utf8');

describe('G1309: an open chooser or verb menu is never under the Qurazy banner', () => {
  it('the banner hides while the chooser or the verb menu is open', () => {
    assert.match(css, /#game-root:has\(:is\(#enter-chooser, #verb-menu\):not\(\[hidden\]\)\) > canvas\.overlay-art \{ visibility: hidden; \}/);
  });

  it('by visibility: the banner sets its own opacity every frame, so an opacity rule would lose', () => {
    assert.match(overlayJs, /canvas\.style\.opacity = String\(overlayAlpha\(/);
    assert.doesNotMatch(overlayJs, /style\.visibility/);
  });

  it('the menus keep their layers under the banner\'s (nothing lifted over the HUD)', () => {
    assert.match(css, /\.enter-chooser \{\s*z-index: calc\(var\(--z-hud\) \+ 15\);\s*\}/);
    assert.match(css, /\.verb-menu \{\s*position: absolute;\s*inset: 0;\s*z-index: calc\(var\(--z-world\) \+ 3\);/);
    assert.match(css, /#game-root > canvas\.overlay-art \{ z-index: var\(--z-overlay\); \}/);
    const z = (name) => Number(css.match(new RegExp(`--z-${name}: (\\d+);`))[1]);
    assert.ok(z('hud') + 15 < z('overlay') && z('world') + 3 < z('overlay'), 'both under the banner, which is why it steps aside');
  });

  it('the chooser and the verb menu live in #game-root, beside the banner', () => {
    const html = readFileSync(join(ROOT, 'public/play/index.html'), 'utf8');
    const root = html.indexOf('id="game-root"');
    assert.ok(root > 0 && html.indexOf('id="verb-menu"') > root);
    const game = readFileSync(join(ROOT, 'public/game.js'), 'utf8');
    assert.match(game, /mount: document\.getElementById\('verb-menu'\)\?\.parentElement,/);
  });
});
