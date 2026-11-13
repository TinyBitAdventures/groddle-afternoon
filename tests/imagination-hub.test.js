/**
 * The modern skin's Imagination hub on X (js/ui/imagination-hub.js; HUB, phase 2): seven round
 * tiles in an arc over the avatar (the client's ImgMenuView clouds), the letters S Q U L T H B,
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
  HUB_TILE_HALF_W_COMPACT,
  HUB_TILES,
  hubLayout,
  hubPillText,
  hubStep,
  hubTileForKey,
  isHubCloseKey,
} from '../public/js/ui/imagination-hub.js?v=6928c5b7';
import { hotkeySections } from '../public/js/client-hotkeys.js?v=2922915e';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = join(root, 'public');
const read = (p) => readFileSync(join(PUBLIC, p), 'utf8');
const CLIENT = join(root, '..', 'glitch-client', 'com', 'tinyspeck', 'engine', 'view', 'gameoverlay', 'ImgMenuView.as');

describe('hub tiles and keys', () => {
  it('has the seven tiles in the mock\'s order with Tiny Speck\'s own art (Back to world: ImgMenuBackToWorld)', () => {
    assert.deepEqual(HUB_TILES.map((t) => `${t.key} ${t.label}`), ['S Skills', 'Q Quests', 'U Upgrades', 'L Looks', 'T Teleport', 'H Home', 'B Back to world']);
    for (const t of HUB_TILES) assert.ok(existsSync(join(PUBLIC, t.art)), t.art);
    for (const t of HUB_TILES.filter((x) => x.under)) assert.ok(existsSync(join(PUBLIC, t.under)), t.under);
  });

  it('opens a tile on its plain letter, either case', () => {
    assert.equal(hubTileForKey({ key: 's' }).id, 'skills');
    assert.equal(hubTileForKey({ key: 'Q' }).id, 'quests');
    assert.equal(hubTileForKey({ key: 'u' }).id, 'upgrades');
    assert.equal(hubTileForKey({ key: 'l' }).id, 'looks');
    assert.equal(hubTileForKey({ key: 't' }).id, 'teleport');
    assert.equal(hubTileForKey({ key: 'h' }).id, 'home');
    assert.equal(hubTileForKey({ key: 'B' }).id, 'back');
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
    assert.equal(lay.tiles.length, 7);
    // First and last tile level with the centre, 1.3 R out; the arc's top over the head.
    assert.deepEqual(lay.tiles[0], { x: Math.round(640 - HUB_RADIUS * 1.3), y: 429 });
    assert.deepEqual(lay.tiles[6], { x: Math.round(640 + HUB_RADIUS * 1.3), y: 429 });
    assert.ok(lay.tiles[2].y < 345 && lay.tiles[3].y < 345 && lay.tiles[4].y < 345);
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
    assert.equal(drawer.compact, false);
  });

  // #267 (Friendly, an upright iPhone 402 x 660): Skills and Quests ran off the left edge and Home and
  // Back to world off the right, since the arc needs about 500 px across.
  it('on an upright phone the arc is compact and every tile stays on screen, clear of the Social rail', () => {
    const phone = hubLayout({ head: { x: 200, y: 260 }, feet: { x: 200, y: 330 }, root: { w: 402, h: 660 }, top: 64, bottom: 590, right: 50 });
    assert.equal(phone.compact, true);
    assert.ok(phone.rx < phone.r * 1.3);
    for (const t of phone.tiles) {
      assert.ok(t.x - HUB_TILE_HALF_W_COMPACT >= 8, `left ${t.x}`);
      assert.ok(t.x + HUB_TILE_HALF_W_COMPACT <= 402 - 50 - 8, `right ${t.x}`);
    }
    // Still an arc: the ends level with the centre, the middle tile on top.
    assert.equal(phone.tiles[0].y, phone.cy);
    assert.equal(phone.tiles[6].y, phone.cy);
    assert.equal(phone.tiles[3].x, phone.cx);
    assert.ok(phone.tiles[3].y < phone.tiles[2].y);
    const lay = hubLayout({ head: { x: 640, y: 345 }, feet: { x: 640, y: 513 }, root, bottom: 740 });
    assert.equal(lay.compact, false);
    assert.equal(lay.rx, Math.round(HUB_RADIUS * 1.3));
  });

  // Landscape audit #10 (a phone held sideways, 667 x 335): the arc's top tiles ran over the top bar and
  // the street's name under it. Where the arc cannot fit between them and the pill, it is drawn flat.
  it('sideways on a phone the arc is flat, under the name, with the tiles evenly spaced across', () => {
    const top = 104; // the name's foot (96) + 8
    const side = hubLayout({ head: { x: 330, y: 160 }, feet: { x: 330, y: 250 }, root: { w: 659, h: 335 }, top, bottom: 271, right: 0 });
    assert.equal(side.flat, true);
    assert.equal(side.compact, true);
    for (const t of side.tiles) {
      assert.ok(t.y - 44 >= top, `tile top ${t.y - 44} under ${top}`);
      assert.ok(t.x - HUB_TILE_HALF_W_COMPACT >= 8 && t.x + HUB_TILE_HALF_W_COMPACT <= 659 - 8, `x ${t.x}`);
    }
    const gaps = side.tiles.slice(1).map((t, i) => t.x - side.tiles[i].x);
    assert.ok(Math.max(...gaps) - Math.min(...gaps) <= 1, `even gaps ${gaps}`);
    assert.ok(Math.min(...gaps) >= HUB_TILE_HALF_W_COMPACT * 2, 'tiles never overlap across');
    assert.ok(side.tiles[3].y < side.tiles[1].y && side.tiles[1].y < side.tiles[0].y, 'still an arc');
    // A tall window keeps the round arc.
    assert.equal(hubLayout({ head: { x: 640, y: 345 }, feet: { x: 640, y: 513 }, root, bottom: 740 }).flat, false);
    assert.match(read('js/ui/imagination-hub.js'), /getElementById\('street-nameplate'\)/);
  });

  it('the compact tiles are the size the layout reserves', () => {
    const css = read('style.css');
    assert.match(css, new RegExp(`\\.imagination-hub\\.is-compact \\.hub-tile \\{ width: ${HUB_TILE_HALF_W_COMPACT * 2}px; \\}`));
    assert.match(read('js/ui/imagination-hub.js'), /el\.classList\.toggle\('is-compact', lay\.compact\);/);
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

  it('X and U work at home, but not over Decorate or Cultivate', () => {
    const img = read('js/features/imagination-feature.js');
    assert.match(img, /const blocked = \(\) => !engineRef \|\| engineRef\.busy\(\{ ignoreHome: true \}\) \|\| Boolean\(engineRef\.query\?\.\('homeEditMode', engineRef\)\);/);
    assert.match(img, /\(e\.key === 'x' \|\| e\.key === 'X'\) && !e\.metaKey && !e\.ctrlKey && !e\.altKey && !blocked\(\)\)/);
    assert.match(img, /engineRef\?\.started && !blocked\(\)\) \{/);
    assert.match(read('game.js'), /canOpen: \(\) => state\.started && !engine\.busy\(\{ ignoreHome: true \}\) && !features\.query\('homeEditMode', engine\) && !isScreenViewOpen\(\),/);
  });

  it('the hotkey sheet names the hub\'s letters in the modern skin', () => {
    const menus = (opts) => hotkeySections(opts)[0].rows.find((r) => r[0] === 'Imagination Menu');
    assert.equal(menus({}).length, 2);
    assert.equal(menus({ hub: true })[2], '(then S, Q, U, L, T, H or B)');
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
