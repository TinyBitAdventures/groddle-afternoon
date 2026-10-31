/**
 * The modern skin's Imagination hub on X (js/ui/imagination-hub.js; HUB, phase 2): six round
 * tiles in an arc over the avatar (the client's ImgMenuView clouds), the letters S Q U L T H,
 * the arrows, Enter, Esc and X, and the wiring that makes X, the top bar's Imagination
 * button and the hotkey sheet lead to it.
 * Run: node --test tests/imagination-hub.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  HUB_RADIUS,
  HUB_RADIUS_MIN,
  HUB_TILES,
  hubLayout,
  hubPillText,
  hubStep,
  hubTileForKey,
  isHubCloseKey,
} from '../public/js/ui/imagination-hub.js?v=972868f3';
import { hotkeySections } from '../public/js/client-hotkeys.js?v=0eeb8604';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = join(root, 'public');
const read = (p) => readFileSync(join(PUBLIC, p), 'utf8');
const CLIENT = join(root, '..', 'glitch-client', 'com', 'tinyspeck', 'engine', 'view', 'gameoverlay', 'ImgMenuView.as');

describe('hub tiles and keys', () => {
  it('has the six tiles in the mock\'s order with the game\'s own card art', () => {
    assert.deepEqual(HUB_TILES.map((t) => `${t.key} ${t.label}`), ['S Skills', 'Q Quests', 'U Upgrades', 'L Looks', 'T Teleport', 'H Home']);
    for (const t of HUB_TILES) assert.ok(existsSync(join(PUBLIC, t.art)), t.art);
  });

  it('opens a tile on its plain letter, either case', () => {
    assert.equal(hubTileForKey({ key: 's' }).id, 'skills');
    assert.equal(hubTileForKey({ key: 'Q' }).id, 'quests');
    assert.equal(hubTileForKey({ key: 'u' }).id, 'upgrades');
    assert.equal(hubTileForKey({ key: 'l' }).id, 'looks');
    assert.equal(hubTileForKey({ key: 't' }).id, 'teleport');
    assert.equal(hubTileForKey({ key: 'h' }).id, 'home');
    assert.equal(hubTileForKey({ key: 's', shiftKey: true }), null);
    assert.equal(hubTileForKey({ key: 'q', metaKey: true }), null);
    assert.equal(hubTileForKey({ key: 'x' }), null);
    assert.equal(hubTileForKey({ key: 'Enter' }), null);
  });

  it('closes on Esc and X, and moves with the arrows and Tab', () => {
    assert.equal(isHubCloseKey({ key: 'Escape' }), true);
    assert.equal(isHubCloseKey({ key: 'x' }), true);
    assert.equal(isHubCloseKey({ key: 'X' }), true);
    assert.equal(isHubCloseKey({ key: 'x', ctrlKey: true }), false);
    assert.equal(hubStep({ key: 'ArrowLeft' }), -1);
    assert.equal(hubStep({ key: 'ArrowUp' }), -1);
    assert.equal(hubStep({ key: 'ArrowRight' }), 1);
    assert.equal(hubStep({ key: 'ArrowDown' }), 1);
    assert.equal(hubStep({ key: 'Tab' }), 1);
    assert.equal(hubStep({ key: 'Tab', shiftKey: true }), -1);
    assert.equal(hubStep({ key: 'a' }), 0);
  });

  it('follows the client\'s Imagination menu where its source is present (ImgMenuView.as)', { skip: !existsSync(CLIENT) && 'needs glitch-client beside the game' }, () => {
    const src = readFileSync(CLIENT, 'utf8');
    for (const k of ['S, onSkillsClick', 'Q, onQuestsClick', 'U, onUpgradeClick', 'T, onTeleportClick', 'X, onDoneClick', 'ESCAPE, onEscKey']) {
      assert.match(src, new RegExp(`KEY_DOWN_\\+Keyboard\\.${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`), k);
    }
  });

  it('says the iMG there is to spend', () => {
    assert.equal(hubPillText(5640), '5,640 iMG to spend');
    assert.equal(hubPillText(-3), '0 iMG to spend');
  });
});

describe('hub layout', () => {
  const root = { w: 1280, h: 800 };
  it('puts the arc over the avatar at the mock\'s radius, 1.3 times as wide', () => {
    const lay = hubLayout({ head: { x: 640, y: 345 }, feet: { x: 640, y: 513 }, root, bottom: 740 });
    assert.equal(lay.r, HUB_RADIUS);
    assert.equal(lay.cx, 640);
    assert.equal(lay.cy, 429);
    assert.equal(lay.tiles.length, 6);
    // First and last tile level with the centre, 1.3 R out; the arc's top over the head.
    assert.deepEqual(lay.tiles[0], { x: Math.round(640 - HUB_RADIUS * 1.3), y: 429 });
    assert.deepEqual(lay.tiles[5], { x: Math.round(640 + HUB_RADIUS * 1.3), y: 429 });
    assert.ok(lay.tiles[2].y < 345 && lay.tiles[3].y < 345);
    assert.ok(lay.pill.y > 513 && lay.pill.y <= 740 - 44);
  });

  it('shrinks on a short window and stays on screen, clear of the drawer', () => {
    const short = hubLayout({ head: { x: 20, y: 100 }, feet: { x: 20, y: 220 }, root: { w: 1024, h: 640 }, top: 56, bottom: 580 });
    assert.ok(short.r < HUB_RADIUS && short.r >= HUB_RADIUS_MIN);
    for (const t of short.tiles) {
      assert.ok(t.x - 46 >= 8 && t.x + 46 <= 1024 - 8, `x ${t.x}`);
      assert.ok(t.y - 50 >= 56, `y ${t.y}`);
    }
    const drawer = hubLayout({ head: { x: 1800, y: 500 }, feet: { x: 1800, y: 650 }, root: { w: 1920, h: 1080 }, right: 316 });
    for (const t of drawer.tiles) assert.ok(t.x + 46 <= 1920 - 316 - 8, `x ${t.x}`);
  });
});

describe('the game wires the hub', () => {
  it('X opens the hub in the modern skin; the hub\'s Upgrades does what X did before', () => {
    const img = read('js/features/imagination-feature.js');
    assert.match(img, /if \(engineRef\?\.imaginationHubOpen\?\.\(\)\) return;/);
    assert.match(img, /if \(!engineRef\.imaginationHub\?\.\(\)\) openPanel\(\);/);
    const game = read('game.js');
    assert.match(game, /upgrades: \(\) => document\.getElementById\('img-btn'\)\?\.click\(\),/);
    assert.match(game, /imaginationHub: \(\) => \(modernUi\(\) && imaginationHub \? imaginationHub\.open\(\) \|\| true : false\),/);
    assert.match(game, /function modernUi\(\) \{\n\s+return uiState\(\)\.mode === MODERN;/);
    assert.match(game, /if \(now\.mode !== MODERN\) imaginationHub\?\.close\(\);/);
    assert.match(game, /onImagination: \(\) => \(modernUi\(\) && imaginationHub \? imaginationHub\.toggle\(\) : document\.getElementById\('img-btn'\)\?\.click\(\)\),/);
  });

  it('the hotkey sheet names the hub\'s letters in the modern skin', () => {
    const menus = (opts) => hotkeySections(opts)[0].rows.find((r) => r[0] === 'Imagination Menu');
    assert.equal(menus({}).length, 2);
    assert.equal(menus({ hub: true })[2], '(then S, Q, U, L, T or H)');
  });

  it('draws the look only under the modern skin, with reduced motion respected', () => {
    const css = read('style.css');
    const block = css.slice(css.indexOf('/* —— HUB: Imagination hub —— */'), css.indexOf('/* —— end HUB —— */'));
    assert.ok(block.length > 200);
    assert.match(block, /\[data-ui="modern"\] \.imagination-hub/);
    assert.match(block, /@media \(prefers-reduced-motion: reduce\)/);
    assert.match(block, /\.imagination-hub\[hidden\] \{ display: none; \}/);
  });
});
