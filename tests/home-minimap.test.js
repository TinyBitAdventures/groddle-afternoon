/**
 * HOMEMAP: the street map on a home street (and every other scene a feature builds), snapped from
 * the live scene as the 2012 client re-snapped it (TSFrontController.resnapMiniMap, getSnapshot
 * SNAPSHOT_TYPE_NORMAL, HandOfDecorator maybeResnapMiniMap; MiniMapView.as maybeAddSignpost's
 * location.is_home). js/ui/street-minimap.js snapshotStreetView, parallaxStretch, snapsWithScene,
 * sceneSignMarks; features/street-minimap-feature.js; game.js renderHomeScene's bounds.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  SCENE_SIGN_CLASSES,
  parallaxStretch,
  sceneSignMarks,
  snapshotStreetView,
  snapsWithScene,
} from '../public/js/ui/street-minimap.js?fresh=home-minimap';
import { RESNAP_MIN_MS, RESNAP_SETTLE_MS, isLiveScene, sceneEntities } from '../public/js/features/street-minimap-feature.js?fresh=home-minimap';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

/** A Pixi-shaped node: position, scale, visible, children, parent. */
function node({ x = 0, y = 0, ...props } = {}) {
  const n = {
    position: { x: 0, y: 0, set(x, y) { this.x = x; this.y = y; } },
    scale: { x: 1, y: 1, set(x, y) { this.x = x; this.y = y ?? x; } },
    visible: true,
    destroyed: false,
    children: [],
    parent: null,
    ...props,
  };
  Object.defineProperty(n, 'x', { get() { return n.position.x; }, set(v) { n.position.x = v; }, enumerable: true });
  Object.defineProperty(n, 'y', { get() { return n.position.y; }, set(v) { n.position.y = v; }, enumerable: true });
  n.position.set(x, y);
  return n;
}
function add(parent, child) {
  parent.children.push(child);
  child.parent = parent;
  return child;
}
function fakePixi() {
  return {
    RenderTexture: { create: (o) => ({ ...o, destroyed: false, destroy() { this.destroyed = true; } }) },
    Matrix: class { constructor() { this.a = 1; this.d = 1; } scale(x, y) { this.a = x; this.d = y; return this; } },
  };
}

describe('home map: parallax over the whole street (getSnapshot: every layer the middleground\'s size)', () => {
  it('a layer that moves with the camera (f 1) covers the street as it is', () => {
    assert.equal(parallaxStretch(1, 2670, 1280), 1);
  });
  it('a far layer stretches: the window shows f x (W - view) + view of it', () => {
    const k = parallaxStretch(0.08, 2670, 1280);
    assert.ok(Math.abs(k - 2670 / (0.08 * 1390 + 1280)) < 1e-9);
    assert.ok(k > 1.9 && k < 2);
  });
  it('a street no wider than the window, a bad factor or no street: no stretch', () => {
    assert.equal(parallaxStretch(0.2, 1000, 1600), 1);
    assert.equal(parallaxStretch('x', 2000, 1000), 1);
    assert.equal(parallaxStretch(0.5, 0, 1000), 1);
  });
});

describe('home map: what the snapshot draws (hidePCsTemporarily, hideItemstacksTemporarily)', () => {
  it('cultivations, fixtures and furniture stay; players and walking characters go', () => {
    for (const id of ['garden_new', 'garden_plot', 'rock_metal_1', 'patch', 'peat_1', 'mortar_barnacle', 'butler_box', 'magic_rock', 'home_return_marker', 'mp_home_signpost', 'tower_elevator', 'npc_mailbox', 'npc_mail_dispatcher']) {
      assert.equal(snapsWithScene(id), true, id);
    }
    for (const id of ['npc_rube', 'npc_piggy', 'npc_crafty_bot', 'pc_player', 'bag_butler', 'mp_butler', '', null]) {
      assert.equal(snapsWithScene(id), false, String(id));
    }
  });

  it('the scene\'s posts are signposts on the map: the World Gate by its name, the friends\' signpost by its friends', () => {
    assert.deepEqual([...SCENE_SIGN_CLASSES], ['home_return_marker', 'mp_home_gate', 'mp_home_signpost']);
    const marks = sceneSignMarks([
      { classId: 'home_return_marker', label: 'World Gate', sprite: { x: 490.4, y: 870 } },
      { classId: 'mp_home_signpost', label: 'Signpost', state: { owner: true, arms: ['Zz Mer Maid', ' ', 'Pal40'] }, sprite: { x: 620, y: 872 } },
      { classId: 'mp_home_signpost', label: 'Signpost', state: { arms: [] }, sprite: { x: 700, y: 872 } },
      { classId: 'garden_new', label: 'Garden', sprite: { x: 1300, y: 870 } },
      { classId: 'mp_home_gate', label: 'World Gate', sprite: { x: 1, y: 2, destroyed: true } },
      null,
    ]);
    assert.deepEqual(marks, [
      { kind: 'sign', id: 'scene:home_return_marker:0', x: 490, y: 870, tip: 'World Gate' },
      { kind: 'sign', id: 'scene:mp_home_signpost:1', x: 620, y: 872, tip: 'Zz Mer Maid\nPal40' },
      { kind: 'sign', id: 'scene:mp_home_signpost:2', x: 700, y: 872, tip: null },
    ]);
  });

  it('the entity layer: kept things by their top child, furniture layers, never the player', () => {
    const layer = node({ label: 'entities' });
    const garden = add(layer, node());
    const plot = add(garden, node({ x: 1239 }));
    const rube = add(layer, node({ x: 900 }));
    const player = add(layer, node({ x: 550 }));
    const furniture = add(layer, node({ label: 'home-furniture' }));
    add(furniture, node({ x: 420, y: 638 }));
    const prompt = add(layer, node());
    const engine = {
      entityLayer: layer,
      player,
      interactables: [
        { classId: 'garden_plot', sprite: plot },
        { classId: 'npc_rube', sprite: rube },
        { classId: 'pc_player', sprite: player },
      ],
    };
    const ents = sceneEntities(engine);
    assert.equal(ents.layer, layer);
    assert.deepEqual([garden, rube, player, furniture, prompt].map((c) => ents.keep(c)), [true, false, false, true, false]);
    assert.deepEqual(ents.rows, ['garden_plot:310:0', 'f:105:160']);
  });

  it('a live scene is any view that is not a street-render street', () => {
    assert.equal(isLiveScene({ parallaxLayers: [] }), false);
    assert.equal(isLiveScene({ children: [] }), true);
    assert.equal(isLiveScene({ destroyed: true }), false);
    assert.equal(isLiveScene(null), false);
  });
});

describe('home map: the snapshot of a live scene (resnapMiniMap)', () => {
  function homeScene() {
    const view = node({ worldH: 972 });
    const sky = add(view, node());
    const far = add(view, node({ parallaxF: 0.08 }));
    far.x = 300;
    const house = add(view, node());
    view.updateParallax = (camX, camY, vpW, vpH, skyH) => {
      sky.x = camX;
      sky.y = camY;
      sky.scale.set(vpW / 100, skyH / 100);
      far.x = camX * (1 - far.parallaxF);
    };
    const layer = node();
    const plot = add(layer, node({ x: 1300 }));
    const player = add(layer, node({ x: 550 }));
    return { view, sky, far, house, layer, plot, player };
  }

  it('poses the scene as a camera as wide as the street, draws the kept entities, then puts everything back', () => {
    const s = homeScene();
    s.sky.scale.set(12.8, 5.4);
    const seen = [];
    const renderer = {
      render: ({ container, target, clear, transform }) => {
        seen.push({
          container,
          clear,
          w: target.width,
          sx: transform.a,
          sy: transform.d,
          skyScale: [s.sky.scale.x, s.sky.scale.y],
          farX: s.far.x,
          farScale: s.far.scale.x,
          plot: s.plot.visible,
          player: s.player.visible,
        });
      },
      extract: { canvas: () => 'picture' },
    };
    const out = snapshotStreetView(fakePixi(), renderer, s.view, { width: 384, height: 140 }, {
      W: 2670,
      H: 540,
      viewW: 1280,
      entities: { layer: s.layer, keep: (c) => c === s.plot },
    });
    assert.equal(out, 'picture');
    assert.equal(seen.length, 2, 'the view, then the entity layer');
    assert.equal(seen[0].container, s.view);
    assert.equal(seen[0].clear, true);
    assert.equal(seen[1].container, s.layer);
    assert.equal(seen[1].clear, false);
    assert.equal(seen[0].sx, 384 / 2670);
    assert.equal(seen[0].sy, 140 / 972, 'the view\'s own height wins over the bounds');
    assert.deepEqual(seen[0].skyScale, [26.7, 9.72], 'the sky covers the street');
    assert.equal(seen[0].farX, 0);
    assert.equal(seen[0].farScale, parallaxStretch(0.08, 2670, 1280));
    assert.deepEqual([seen[1].plot, seen[1].player], [true, false]);
    assert.deepEqual([s.sky.scale.x, s.sky.scale.y, s.far.x, s.far.scale.x, s.player.visible], [12.8, 5.4, 300, 1, true], 'put back');
  });

  it('a view with no size of its own takes the street\'s; nothing to draw gives null', () => {
    const view = node();
    let drawn = null;
    const renderer = { render: ({ transform }) => (drawn = transform), extract: { canvas: () => 'c' } };
    assert.equal(snapshotStreetView(fakePixi(), renderer, view, { width: 192, height: 40 }, { W: 1800, H: 738 }), 'c');
    assert.equal(drawn.a, 192 / 1800);
    assert.equal(drawn.d, 40 / 738);
    assert.equal(snapshotStreetView(fakePixi(), renderer, view, { width: 192, height: 40 }), null);
  });

  it('a failed render leaves the scene as it was', () => {
    const s = homeScene();
    const renderer = { render: () => { throw new Error('lost context'); }, extract: { canvas: () => 'c' } };
    const warn = console.warn;
    console.warn = () => {};
    try {
      assert.equal(snapshotStreetView(fakePixi(), renderer, s.view, { width: 10, height: 10 }, { W: 2670, H: 972, entities: { layer: s.layer, keep: () => false } }), null);
    } finally {
      console.warn = warn;
    }
    assert.deepEqual([s.far.x, s.far.scale.x, s.plot.visible, s.player.visible], [300, 1, true, true]);
  });
});

describe('home map: the wiring', () => {
  const feature = read('public/js/features/street-minimap-feature.js');
  const ui = read('public/js/ui/street-minimap.js');
  const game = read('public/game.js');

  it('a home room is as tall as its scene (the dots stood below a 540 high map)', () => {
    const render = game.slice(game.indexOf('async function renderHomeScene('), game.indexOf('/** G249'));
    assert.match(render, /bounds: \{ l: 0, r: WORLD_W, t: 0, b: Number\(bgLayer\.worldH\) \|\| AUTHORED_VIEW_H \}/);
    assert.match(game, /get viewWidth\(\) \{\n    return VIEW_W;/);
  });

  it('the snapshot gets the street\'s size, the window\'s width and, in a live scene, its entities', () => {
    assert.match(feature, /snapshotStreetView\(engine\.PIXI, engine\.renderer, engine\.streetView, size, \{\n    W: geom\?\.W,\n    H: geom\?\.H,\n    viewW: engine\.viewWidth,\n    entities: live \? sceneEntities\(engine\) : null,/);
  });

  it('re-snaps: the same street built again keeps its picture; a change settles, then at most once a second', () => {
    assert.equal(RESNAP_SETTLE_MS, 300);
    assert.equal(RESNAP_MIN_MS, 1000);
    assert.match(feature, /const REBUILD_SNAP_AT_MS = \[250, 1500\];/);
    assert.match(feature, /view\.setStreet\(street, \{ platforms: engine\.platforms \|\| \[\], keepPicture: rebuilt \}\);/);
    assert.match(feature, /if \(snapKey && liveKey\(engine\) !== snapKey\) requestResnap\(engine\);/);
    assert.match(ui, /const kept = keepPicture && snapPic && next && String\(next\.tsid \|\| ''\) === snapTsid \? snapPic : null;/);
    // A resize rebuild keeps it too.
    assert.equal((ui.match(/keepPicture: true/g) || []).length, 2);
  });

  it('the scene\'s posts go on the map; a post with no tip is still named', () => {
    assert.match(feature, /view\.setSceneSigns\(marks\);/);
    assert.match(ui, /el\.setAttribute\('aria-label', mark\.tip \? `Signpost to \$\{mark\.tip\.split\('\\n'\)\.join\(', '\)\}` : 'Signpost'\);/);
    assert.match(read('public/js/features/home-street-mp-feature.js'), /state: \{ owner, arms: arms\.map\(\(n\) => n\.name\) \}/);
  });
});
