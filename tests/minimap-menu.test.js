/**
 * RIGHTCLICK (Austin 2026-11-03, right-click audit later batch item 6): on the minimap a
 * right-click, a long press, Shift+F10 or the Menu key on another player's dot opens their menu
 * (they are on your street: the world's player menu), on a signpost Walk here (what a click does)
 * and that post's arms; anywhere else on the map nothing opens and the browser's menu is stopped.
 * Glitch's minimap had no menus (MiniMapView.as 430-460); a right-click never walks.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { markHasMenu } from '../public/js/ui/street-minimap.js?fresh=minimap-menu';
import { menuFromMap } from '../public/js/features/street-minimap-feature.js?fresh=minimap-menu';

const src = (p) => readFileSync(new URL(`../public/${p}`, import.meta.url), 'utf8');

describe('which minimap marks have a menu (js/ui/street-minimap.js markHasMenu)', () => {
  it('another player\'s dot and a signpost; not you, the Rube or solo\'s companions', () => {
    assert.equal(markHasMenu({ kind: 'player', id: 1582 }), true);
    assert.equal(markHasMenu({ kind: 'sign', id: 'sign-0' }), true);
    assert.equal(markHasMenu({ kind: 'sign', id: 'scene:mp_home_signpost:0' }), true);
    assert.equal(markHasMenu({ kind: 'player', id: 'local-butler' }), false);
    assert.equal(markHasMenu({ kind: 'item', id: 'rube' }), false);
    assert.equal(markHasMenu({ kind: 'you' }), false);
    assert.equal(markHasMenu(null), false);
  });
});

describe('a mark\'s menu (features/street-minimap-feature.js menuFromMap)', () => {
  const engine = () => {
    const calls = [];
    return {
      calls,
      openPlayerMenu: (o) => { calls.push(['player', o]); return true; },
      openSignpostMenu: (o) => { calls.push(['sign', o]); return true; },
      walkTo: (goal) => { calls.push(['walk', goal]); return true; },
      setData: () => {},
    };
  };

  it('a player\'s dot: their menu from their id and name, at the pointer', () => {
    const e = engine();
    const el = { id: 'dot' };
    assert.equal(menuFromMap(e, { kind: 'player', id: 1582, label: 'Cy', x: 10, y: 20 }, { at: { x: 1300, y: 90 }, el, mark: 'player:1582' }), true);
    const [kind, o] = e.calls[0];
    assert.equal(kind, 'player');
    assert.deepEqual({ id: o.id, name: o.name, at: o.at, keys: o.keys, anchor: o.anchor, opener: o.opener }, { id: 1582, name: 'Cy', at: { x: 1300, y: 90 }, keys: false, anchor: el, opener: el });
    assert.equal(typeof o.findOpener, 'function');
  });

  it('a signpost: its menu, whose Walk here walks to it as a click on it does', () => {
    const e = engine();
    menuFromMap(e, { kind: 'sign', id: 's1', x: 400, y: -80 }, { keys: true });
    const [kind, o] = e.calls[0];
    assert.equal(kind, 'sign');
    assert.deepEqual({ id: o.id, x: o.x, y: o.y, keys: o.keys }, { id: 's1', x: 400, y: -80, keys: true });
    o.walk();
    assert.deepEqual(e.calls[1], ['walk', { kind: 'sign', id: 's1', x: 400, y: -80 }]);
  });

  it('anything else opens nothing', () => {
    const e = engine();
    assert.equal(menuFromMap(e, { kind: 'item', id: 'rube' }), false);
    assert.equal(e.calls.length, 0);
  });
});

describe('the wiring', () => {
  const view = src('js/ui/street-minimap.js');
  const feature = src('js/features/street-minimap-feature.js');
  const game = src('game.js');

  it('the widget: the map is ours (data-ctx), its marks open through onMenu by right-click, keys and long press; a right-click never walks', () => {
    assert.match(view, /root\.dataset\.ctx = 'minimap';/);
    assert.match(view, /bindContextTrigger\(card, \{\n\s+rowOf: menuMark,[\s\S]{0,700}longPress: true,/);
    assert.match(view, /return row && markHasMenu\(row\.mark\) \? el : null;/);
    assert.match(view, /root\.addEventListener\('contextmenu', \(e\) => e\.preventDefault\(\)\);/);
    // The walk is the click's alone (contextmenu sends no click).
    assert.match(view, /card\.addEventListener\('click', \(e\) => \{\n\s+if \(!geom \|\| !street \|\| state !== 'shown'/);
  });

  it('the feature hands the marks to the engine', () => {
    assert.match(feature, /onMenu: \(goal, how\) => menuFromMap\(engine, goal, how\),/);
    assert.match(feature, /isMenuOpen: \(mark\) => Boolean\(engine\.isMinimapMenuOpen\?\.\(mark\)\),/);
  });

  it('game.js: the post\'s rows are Walk here, then its arms (each takes its road as a click on it does)', () => {
    const fn = game.slice(game.indexOf('function openMinimapSignpostMenu('), game.indexOf('const ROAD_NOT_IN_GAME'));
    assert.match(fn, /const rows = \[\{ id: 'walk', label: 'Walk here', tip: 'Walk to this signpost\.' \}, \.\.\.arms\];/);
    assert.match(fn, /if \(rowId === 'walk'\) walk\?\.\(\);\n\s+else if \(row\?\.view && row\.board\) takeSignBoard\(\{ view: row\.view, board: row\.board \}\);/);
    assert.match(fn, /owner: `minimap-sign:\$\{id\}`/);
    assert.match(game, /openSignpostMenu: \(opts\) => openMinimapSignpostMenu\(opts\),/);
    const views = game.slice(game.indexOf('function minimapSignViews('), game.indexOf('function openMinimapSignpostMenu('));
    assert.match(views, /String\(v\.signpost\.id \|\| ''\) === key/);
    assert.match(views, /sceneSignViews\(\)\.filter/);
  });
});
