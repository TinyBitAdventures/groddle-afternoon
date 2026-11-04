/**
 * The home street to pan along (Austin 2026-11-03: "left/right arrow keys could allow the viewer to
 * explore the html mockup, like they were in camera mode in the game"): layout version 2 from
 * js/home-layout.js and js/home-layout-scene.js (the whole street, each layer with its parallax
 * factor), the handshake in features/profiles-feature.js, and the site side
 * (groddle-afternoon-site src/HomeLayout.php version 2, players/home-pan.js, style.css): limits held
 * to the game's, the validator and the street's HTML through php
 * (tests/fixtures/profiles/home-layout.php), and the camera script's pure parts against the game's
 * own Camera Mode numbers.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { pathToFileURL } from 'node:url';

import { HOME_LAYOUT_LIMITS, HOME_STREET_LIMITS, HOME_STREET_VERSION, buildHomeLayout, homeLayoutJson, homeLayoutKeyOf } from '../public/js/home-layout.js?v=63b3a9ba';
import { walkHomeScene } from '../public/js/home-layout-scene.js?v=26381582';
import { HOME_LIMITS } from '../public/js/homes-catalog.js?v=7aa9beb0';
import { HOUSE_LOT_W, YARD_SEGMENT_W } from '../public/js/home-cultivation.js?v=ff17225a';
import { CAMERA_RANGE } from '../public/js/features/camera-mode-feature.js?v=ad1ae5ea';
import { SITE_DIR, skipWithoutSite } from '../tools/repos.mjs';

const root = join(import.meta.dirname, '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');
const site = (rel) => readFileSync(join(SITE_DIR, rel), 'utf8');
const corners = (x, y, w, h) => [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }];

describe('version 2: the whole street (buildHomeLayout with street)', () => {
  it('moves each entry into its layer\'s own x, keeps what the camera can reach, and groups layers back to front', () => {
    // The camera stood at x 600 of a 2670 px street; the view is 960 wide.
    const layout = buildHomeLayout({
      w: 960, h: 476, street: { sw: 2670, camX: 600 },
      draw: [
        { sky: [0xa6effa, 0xeafcfb], rect: [0, 0, 960, 600], f: 0 },
        // A far layer (f 0.5): on stage at -300 means layer x 0; beyond its reach (960 + 1710 * 0.5) it goes.
        { art: 'assets/decos/groddle/bush_3.png', corners: corners(-300, 200, 100, 50), f: 0.5 },
        { art: 'assets/decos/groddle/bush_3.png', corners: corners(1600, 200, 100, 50), f: 0.5 },
        // The street (f 1): stage x -600 is street x 0; the far end is in, past it is out.
        { col: 0x5c3b25, rect: [-650, 420, 2770, 240], f: 1 },
        { art: 'assets/sprites/rocks/rock_sheet.png', corners: corners(1600, 350, 60, 50), spot: 0, f: 1 },
        { art: 'assets/sprites/rocks/rock_sheet.png', corners: corners(2100, 350, 60, 50), f: 1 },
        { avatar: true, rect: [300, 250, 98, 141], spot: 1, f: 1 },
      ],
      spots: [{ desc: { k: 'cultivation', i: 'rock_metal_1' } }, { desc: { k: 'avatar' } }, { desc: { k: 'door' }, aabb: [-400, 250, -308, 400] }],
    });
    assert.equal(layout.v, HOME_STREET_VERSION);
    assert.deepEqual([layout.w, layout.h, layout.sw, layout.cx], [960, 476, 2670, 600]);
    assert.deepEqual(layout.layers.map((l) => [l.f, l.draw.length]), [[0, 1], [0.5, 1], [1, 3]]);
    assert.deepEqual(layout.layers[1].draw[0], { a: 0, x: 0, y: 200, w: 100, h: 50 });
    assert.deepEqual(layout.layers[2].draw[0], { col: '#5c3b25', x: 0, y: 420, w: 2670, h: 56 });
    assert.deepEqual(layout.layers[2].draw[1], { a: 1, x: 2200, y: 350, w: 60, h: 50, s: 0 });
    assert.deepEqual(layout.layers[2].draw[2], { avatar: 1, x: 900, y: 250, w: 98, h: 141, s: 1 });
    // A door (no art of its own) keeps the bounds it was read with, moved along the street too.
    assert.deepEqual(layout.spots.map((s) => [s.k, s.b]), [['cultivation', [2200, 350, 60, 50]], ['avatar', [900, 250, 98, 141]], ['door', [200, 250, 92, 150]]]);
    assert.match(homeLayoutKeyOf(layout, 'h2-firebog-1s2o'), /^l2-firebog-1s2o-[0-9a-f]{8}$/, 'a new key, so version 1 layouts are replaced');
  });

  it('art in a parallax layer is scenery, never a spot', () => {
    const layout = buildHomeLayout({ w: 960, h: 476, street: { sw: 2000, camX: 0 }, draw: [{ art: 'assets/decos/groddle/bush_3.png', corners: corners(10, 10, 50, 50), f: 0.3, spot: 0 }], spots: [{ desc: { k: 'item', i: 'apple' } }] });
    assert.equal(layout.layers[0].draw[0].s, undefined);
    assert.deepEqual(layout.spots, []);
  });

  it('a street holds as many entries as the widest home needs, under the site\'s caps', () => {
    const widest = (HOME_LIMITS.MAX_FRONTYARD_LEFT_SEGMENTS + HOME_LIMITS.MAX_FRONTYARD_RIGHT_SEGMENTS) * YARD_SEGMENT_W + HOUSE_LOT_W;
    assert.equal(widest, 6720);
    assert.ok(HOME_STREET_LIMITS.maxSw >= widest);
    const draw = [];
    for (let i = 0; i < 1500; i++) draw.push({ art: `assets/decos/groddle/d${i % 200}.webp`, corners: corners(((i * 7) % 6600) - 100, 300, 80, 60), f: i < 500 ? 0.5 : 1, tint: i % 3 ? null : 0x998877 });
    const layout = buildHomeLayout({ w: 1000, h: 493, street: { sw: widest, camX: 2000 }, draw, spots: [] });
    // Layers alternating more often than the cap (24) is no street the game draws: refused, not cut.
    assert.equal(buildHomeLayout({ w: 1000, h: 493, street: { sw: widest, camX: 0 }, draw: draw.map((d, i) => ({ ...d, f: i % 2 ? 1 : 0.5 })), spots: [] }), null);
    const { bytes } = homeLayoutJson(layout);
    assert.ok(bytes <= HOME_STREET_LIMITS.bytes, `${bytes} bytes`);
    assert.ok(layout.layers.reduce((n, l) => n + l.draw.length, 0) <= HOME_STREET_LIMITS.draw);
    assert.ok(layout.layers.length <= HOME_STREET_LIMITS.layers);
    assert.ok(HOME_STREET_LIMITS.bytes > HOME_LAYOUT_LIMITS.bytes);
  });

  it('the walk carries each layer\'s parallax factor down to its art, the sky at 0', () => {
    const node = (props, children = []) => {
      const n = { x: 0, y: 0, alpha: 1, visible: true, children, ...props };
      for (const c of children) c.parent = n;
      return n;
    };
    const sprite = (x) => node({ x, isSprite: true, texture: { source: { label: 'assets/decos/groddle/a.webp', width: 10, height: 10 }, frame: { x: 0, y: 0, width: 10, height: 10 } } });
    const far = node({ parallaxF: 0.25 }, [sprite(5)]);
    const sky = node({ homeLayoutSky: [1, 2], bounds: { x: 0, y: 0, width: 10, height: 10 } });
    const { draw } = walkHomeScene(node({}, [sky, far, sprite(7)]), {
      targets: new Map(),
      isSprite: (n) => Boolean(n.isSprite),
      localBounds: (n) => (n.isSprite ? { x: 0, y: 0, width: 10, height: 10 } : n.bounds || null),
      toStage: (n, points) => points,
    });
    assert.deepEqual(draw.map((d) => d.f), [0, 0.25, 1]);
  });
});

describe('the game sends version 2 only to a site that takes it (features/profiles-feature.js)', () => {
  it('asks the profile answer\'s homeLayoutVersions', () => {
    const src = read('public/js/features/profiles-feature.js');
    assert.match(src, /collectHomeLayout\(engine, \{ street: Array\.isArray\(profile\.homeLayoutVersions\) && profile\.homeLayoutVersions\.includes\(2\) \}\)/);
    assert.match(read('public/js/home-layout-scene.js'), /street: street \? \{ sw: Number\(engine\.worldW\) \|\| cam\.w, camX: cam\.x \} : null/);
  });
});

describe('the site side, version 2 (groddle-afternoon-site)', { skip: skipWithoutSite }, () => {
  const constant = (name) => {
    const m = new RegExp(`public const ${name} = ([^;]+);`).exec(site('src/HomeLayout.php'));
    assert.ok(m, name);
    return m[1];
  };

  it('holds the same version 2 limits as the game and names the versions it takes', () => {
    const L = HOME_STREET_LIMITS;
    assert.equal(constant('STREET_MAX_BYTES'), '160 * 1024');
    assert.equal(L.bytes, 160 * 1024);
    for (const [name, value] of [['STREET_VERSION', HOME_STREET_VERSION], ['MAX_SW', L.maxSw], ['STREET_MAX_ART', L.art], ['STREET_MAX_DRAW', L.draw], ['STREET_MAX_SPOTS', L.spots], ['MAX_LAYERS', L.layers]]) {
      assert.equal(Number(constant(name)), value, name);
    }
    assert.equal(constant('VERSIONS'), '[1, 2]');
    assert.match(site('src/Profiles.php'), /'homeLayoutVersions' => HomeLayout::VERSIONS,/);
  });

  it('loads the camera script only with a street to pan, and moves each layer by its factor in CSS', () => {
    const pages = site('src/PlayerPages.php');
    assert.match(pages, /if \(str_contains\(\$main, 'hd-pan'\)\) \{\n\s*\$scripts \.= '<script type="module" src="' \. self::HOME_PAN_JS/);
    assert.ok(existsSync(join(SITE_DIR, 'players/home-pan.js')));
    const css = site('style.css');
    assert.match(css, /\.home-diorama \.hd-layer \{ position: absolute; inset: 0; transform: translateX\(calc\(var\(--cam, 0\) \* var\(--f, 1\) \* -100% \/ var\(--w, 1000\)\)\); \}/);
    assert.match(css, /\.home-diorama\.hd-pan \.hd-stage \{ overflow: hidden; overflow: clip; touch-action: pan-y; \}/);
    assert.match(css, /\.home-diorama\.hd-pan \.hd-stage:focus-visible::after \{ box-shadow: inset 0 0 0 3px var\(--accent\); \}/);
  });

  it('the camera script pans as Camera Mode does, held inside the street', async () => {
    const pan = await import(pathToFileURL(join(SITE_DIR, 'players/home-pan.js')).href);
    assert.equal(pan.PAN_SPEED, 0.6, 'features/camera-mode-feature.js PAN_SPEED');
    assert.match(read('public/js/features/camera-mode-feature.js'), /const PAN_SPEED = 0\.6;/);
    assert.match(read('public/game.js'), /dampingAlpha\(0\.08, dt\)/, 'game.js eases the camera by 0.08 a frame');
    assert.equal(pan.EASE, 0.08);
    assert.ok(CAMERA_RANGE > 0);
    assert.equal(pan.clampCam(-50, 2670, 960), 0);
    assert.equal(pan.clampCam(5000, 2670, 960), 1710);
    assert.equal(pan.clampCam(300, 900, 960), 0, 'a street no wider than the view does not move');
    assert.equal(pan.stepTarget(100, 1, 16, 2670, 960), 100 + 0.6 * 16);
    assert.equal(pan.stepTarget(100, -1, 1000, 2670, 960), 40, 'at most 100 ms a frame');
    assert.equal(pan.stepTarget(1700, 1, 50, 2670, 960), 1710);
    assert.ok(Math.abs(pan.easeCam(0, 100, 1000 / 60) - 8) < 1e-9);
    assert.equal(pan.easeCam(0, 100, 16, true), 100, 'reduced motion: no easing');
    assert.equal(pan.easeCam(99.97, 100, 16), 100);
    assert.ok(Math.abs(pan.easeShare(1000 / 30) - (1 - 0.92 ** 2)) < 1e-12);
    assert.equal(pan.camForBox([700, 0, 50, 50], 600, 2670, 960), 600, 'already in view: stays');
    assert.equal(pan.camForBox([2300, 0, 100, 50], 600, 2670, 960), 1710, 'off to the right: centred, held at the end');
    assert.equal(pan.camForBox([100, 0, 92, 150], 600, 2670, 960), 0);
    assert.equal(pan.dragToView(-100, 480, 960), -200);
    assert.equal(pan.tipSide([0, 0, 50, 50], 0, 960), 'start');
    assert.equal(pan.tipSide([2300, 0, 100, 50], 1400, 960), 'end');
    assert.equal(pan.tipSide([1800, 0, 100, 50], 1400, 960), '');
  });

  it('shows each arrow button only while the camera can move that way (Austin 2026-11-03)', async () => {
    const pan = await import(pathToFileURL(join(SITE_DIR, 'players/home-pan.js')).href);
    // A 2670 px street in a 960 px view: the camera runs 0 to 1710.
    assert.deepEqual(pan.arrowsShown(0, 2670, 960), { left: false, right: true }, 'start: only right');
    assert.deepEqual(pan.arrowsShown(800, 2670, 960), { left: true, right: true }, 'middle: both');
    assert.deepEqual(pan.arrowsShown(1710, 2670, 960), { left: true, right: false }, 'end: only left');
    assert.deepEqual(pan.arrowsShown(1709.8, 2670, 960), { left: true, right: false }, 'within half a px of the end is the end');
    assert.deepEqual(pan.arrowsShown(0.3, 2670, 960), { left: false, right: true });
    assert.deepEqual(pan.arrowsShown(0, 960, 960), { left: false, right: false }, 'a street no wider than the view: none');
    assert.deepEqual(pan.arrowsShown(0, 700, 960), { left: false, right: false });
    // A click looks 60% of a view along, held inside the ends; holding pans at Camera Mode's pace.
    assert.equal(pan.STEP_SHARE, 0.6);
    assert.equal(pan.arrowStep(0, 1, 2670, 960), 576);
    assert.equal(pan.arrowStep(576, -1, 2670, 960), 0);
    assert.equal(pan.arrowStep(1500, 1, 2670, 960), 1710);
    assert.equal(pan.arrowStep(100, -1, 2670, 960), 0);
    assert.ok(pan.HOLD_MS > 0 && pan.HOLD_MS <= 400);
    // The keys work page-wide once used, but never while someone types.
    for (const el of [{ tagName: 'TEXTAREA' }, { tagName: 'INPUT', type: 'text' }, { tagName: 'INPUT' }, { tagName: 'INPUT', type: 'search' }, { tagName: 'SELECT' }, { tagName: 'DIV', isContentEditable: true }]) assert.equal(pan.typingTarget(el), true, JSON.stringify(el));
    for (const el of [{ tagName: 'BODY' }, { tagName: 'A' }, { tagName: 'BUTTON' }, { tagName: 'INPUT', type: 'checkbox' }, null]) assert.equal(pan.typingTarget(el), false, JSON.stringify(el));
  });

  it('the arrow buttons are real buttons over the edges, in the site\'s tokens, 44 px, fading out of reach', () => {
    const js = site('players/home-pan.js');
    assert.match(js, /b\.type = 'button';/);
    assert.match(js, /\['left', 'Look left', /);
    assert.match(js, /\['right', 'Look right', /);
    assert.match(js, /b\.setAttribute\('aria-label', label\);/);
    assert.match(js, /if \(!on\[side\] && document\.activeElement === b\) stage\.focus\(\{ preventScroll: true \}\);/, 'a button that goes hands focus to the street');
    const css = site('style.css');
    assert.match(css, /\.home-diorama \.hd-stage > \.hd-arrow \{\n\s*position: absolute; top: 50%; z-index: 200; width: 44px; height: 44px;/);
    assert.match(css, /color: var\(--fg\); background: color-mix\(in srgb, var\(--surface\) 82%, transparent\);/);
    assert.match(css, /\.home-diorama \.hd-stage > \.hd-arrow\[data-off\] \{ opacity: 0; visibility: hidden; pointer-events: none;/);
    assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{ \.home-diorama \.hd-stage > \.hd-arrow/);
    assert.match(site('src/PlayerPages.php'), /HOME_PAN_JS_KEY = 'pan-2'/, 'the script\'s key moved with it');
  });

  const engine = process.env.MINN_ENGINE_DIR || join(homedir(), 'Cove/Sites/minn-engine.localhost/public/minn');
  it('takes a good street, refuses bad ones, and draws it in layers starting at the game\'s frame (php)', { skip: !existsSync(join(engine, 'src/Minn/Autoloader.php')) && 'Minn Engine not found (set MINN_ENGINE_DIR)' }, () => {
    let out;
    try {
      out = JSON.parse(execFileSync('php', [join(root, 'tests/fixtures/profiles/home-layout.php'), engine, SITE_DIR], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }));
    } catch (err) {
      if (err.code === 'ENOENT') return;
      throw err;
    }
    if (out.gd === 'no') return;
    assert.equal(out.good, 'ok', 'version 1 is still taken');
    assert.equal(out.street, 'ok');
    for (const name of ['v2Draw', 'v2NoLayers', 'v2WideStreet', 'v2NarrowStreet', 'v2CamPastEnd', 'v2CamNegative', 'v2Factor', 'v2FactorText', 'v2LayerKey', 'v2LayerList', 'v2TooManyLayers',
      'v2TooManyDraw', 'v2PastStreet', 'v2SpotPastStreet', 'v2ScriptInArt', 'v2TwoAvatars', 'v1WithLayers', 'v3']) {
      assert.equal(out[name], 'groddle_home_layout:400', name);
    }
    assert.equal(out.v2TooBig, 'groddle_home_layout_too_large:413');
    assert.equal(out.wide, 'ok', `a 6720 px street with 1600 entries (${out.wideBytes} bytes) is taken`);
    assert.ok(out.wideBytes <= 160 * 1024);
    // Kept: the far layer's entry pointing at a spot loses it.
    assert.deepEqual(out.streetKept.layers.map((l) => [l.f, l.draw.length]), [[0, 1], [0.5, 2], [1, 5]]);
    assert.equal(out.streetKept.layers[1].draw[1].s, undefined);
    const html = out.streetHtml;
    assert.match(html, /<figure class="profile-home home-diorama hd-pan">/);
    assert.match(html, /<div class="hd-stage" tabindex="0" role="group" aria-label="Zz Pan&#039;s home street" aria-describedby="hd-hint" data-w="960" data-sw="2670" data-cx="600" style="aspect-ratio:960 \/ 476;--w:960;--cam:600">/);
    assert.deepEqual([...html.matchAll(/<div class="hd-layer" style="--f:([0-9.]+);z-index:(\d+)">/g)].map((m) => [m[1], m[2]]), [['0', '1'], ['0.5', '2'], ['1', '3']]);
    assert.match(html, /<span class="hd-hint" id="hd-hint" hidden>Use the arrows, your arrow keys or drag to look around\. <\/span>/);
    assert.doesNotMatch(html, /hd-arrow/, 'the arrow buttons are the script\'s: none without JavaScript');
    // Far from the starting frame (the rock at 2300, the view 600..1560): its art waits.
    assert.match(html, /<img data-src="\/assets\/sprites\/rocks\/rock_sheet\.png" data-srcset="[^"]+"/);
    assert.match(html, /<img class="hd-art" src="\/assets\/ui\/signpost\/signpost_post\.png"/);
    // Spots left to right in the street's layer, each with its box for the camera.
    assert.deepEqual([...html.matchAll(/data-kind="(\w+)"[^>]*data-b="([\d,-]+)"/g)].map((m) => m[1]), ['door', 'signpost', 'avatar', 'cultivation']);
    assert.doesNotMatch(html, /—/);
  });
});
