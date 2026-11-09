/**
 * The home street as a layout (Austin 2026-11-02): js/home-layout.js (the
 * manifest and its rules), js/home-layout-scene.js (the stage walk, fed plain
 * objects here), features/profiles-feature.js (when it is sent), the tags the
 * home street's drawing code carries, and the site side
 * (groddle-afternoon-site src/HomeLayout.php, Profiles, PlayerPages): its
 * limits and tables held to the game's, and the PHP validator and diorama run
 * through php against bad manifests (tests/fixtures/profiles/home-layout.php).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

import {
  HOME_LAYOUT_ART_ROOTS, HOME_LAYOUT_KINDS, HOME_LAYOUT_LIMITS, HOME_LAYOUT_TEXTS, HOME_LAYOUT_VERSION,
  boxFromCorners, buildHomeLayout, describeHomeThing, hexColour, homeLayoutJson, homeLayoutKeyOf, layoutArtPath, splitFrameToSheet,
} from '../public/js/home-layout.js?v=0ed5f834';
import { walkHomeScene } from '../public/js/home-layout-scene.js?v=c112c276';
import { AVATAR_STILL, homeKeyOf } from '../public/js/profiles.js?v=054ca723';
import { HIRES_SPRITES, SPLIT_SPRITES } from '../public/js/sprite-hires.js?v=ac5f0e68';
import { HOUSE_STYLE_KEYS } from '../public/js/features/homes-feature.js?v=4c127611';
import { SITE_DIR, skipWithoutSite } from '../tools/repos.mjs';

const root = join(import.meta.dirname, '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');
const site = (rel) => readFileSync(join(SITE_DIR, rel), 'utf8');

/** Four corners of an unrotated box. */
const corners = (x, y, w, h) => [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }];

describe('art paths (layoutArtPath)', () => {
  it('undoes the loader routes to the 1x file the site serves', () => {
    assert.equal(layoutArtPath('https://groddle.localhost/assets/decos/groddle/bush_3@1.5x.webp?v=1'), 'assets/decos/groddle/bush_3.webp');
    assert.equal(layoutArtPath('assets/decos/groddle/bush_3.png'), 'assets/decos/groddle/bush_3.webp', 'a deco asked for as .png ships as .webp');
    assert.equal(layoutArtPath('assets/sprites/animals/butterfly_milker@3x.webp'), 'assets/sprites/animals/butterfly_milker.webp');
    assert.equal(layoutArtPath('assets/sprites/icons/apple@3x.webp'), 'assets/sprites/icons/apple.webp');
    assert.equal(layoutArtPath('../assets/ui/signpost/signpost_post.webp'), 'assets/ui/signpost/signpost_post.webp');
  });

  it('refuses anything that is not Tiny Speck art under the roots', () => {
    for (const bad of ['', 'data:image/png;base64,AAAA', 'blob:https://x/1', 'https://evil.example/x.png', 'assets/content/quests.json', 'assets/decos/groddle/../../../x.png',
      'assets/decos/groddle/gz_new_rock.webp', 'assets/sprites/made/fire-dragon/idle.png', 'assets/audio/x.mp3', 'assets/sprites/x.p1@3x.webp', 'assets/sprites/a b.png']) {
      assert.equal(layoutArtPath(bad), null, bad);
    }
    assert.deepEqual(HOME_LAYOUT_ART_ROOTS, ['assets/decos/', 'assets/sprites/', 'assets/homes/', 'assets/ui/signpost/']);
  });

  it('puts a split 3x part\'s frame back on its 1x sheet', () => {
    const moved = splitFrameToSheet('assets/sprites/mail-npc/dispatcher_left.p1@3x.webp', { x: 118, y: 0, width: 118, height: 211 });
    assert.equal(moved.sheet, 'assets/sprites/mail-npc/dispatcher_left.webp');
    assert.deepEqual(moved.frame, { x: 118, y: 0, width: 118, height: 211 });
    assert.equal(splitFrameToSheet('assets/sprites/mailbox/x.png', { x: 0, y: 0, width: 1, height: 1 }), null);
  });
});

describe('spots (describeHomeThing)', () => {
  it('names the home street\'s things by their class', () => {
    assert.deepEqual(describeHomeThing({ classId: 'home_door' }), { k: 'door' });
    assert.deepEqual(describeHomeThing({ classId: 'npc_mailbox' }), { k: 'mailbox' });
    assert.deepEqual(describeHomeThing({ classId: 'home_return_marker' }), { k: 'signpost' });
    assert.deepEqual(describeHomeThing({ classId: 'mp_home_signpost', state: { arms: ['A', 'B'] } }), { k: 'signpost', n: 2 });
    assert.deepEqual(describeHomeThing({ classId: 'npc_mail_dispatcher' }), { k: 'dispatcher' });
    assert.deepEqual(describeHomeThing({ classId: 'rock_metal_2' }), { k: 'cultivation', i: 'rock_metal_2' });
    assert.deepEqual(describeHomeThing({ classId: 'trant_bean' }), { k: 'cultivation', i: 'trant_bean' });
    assert.deepEqual(describeHomeThing({ classId: 'proto_peat' }), { k: 'proto', i: 'proto_peat' });
    assert.deepEqual(describeHomeThing({ classId: 'magic_rock' }), { k: 'item', i: 'magic_rock' });
    for (const none of ['garden_plot', 'pc_player', 'mp_furn_sale', 'npc_firefly', 'Bad Class', '<script>', '']) assert.equal(describeHomeThing({ classId: none }), null, none);
  });

  it('takes a display object\'s own description first, with only known fields in range', () => {
    const tag = { k: 'tower', i: 'furniture_tower_chassis', n: 400, name: ' Spire\u0007 of the North and the South and the East ', extra: 'x' };
    assert.deepEqual(describeHomeThing({ classId: 'furniture_tower_chassis', tag }), { k: 'tower', i: 'furniture_tower_chassis', n: 99, name: 'Spire of the North and the South and the' });
    assert.equal(describeHomeThing({ tag: { k: 'portal' } }), null);
    assert.deepEqual(HOME_LAYOUT_KINDS.length, 12);
  });
});

describe('the manifest (buildHomeLayout)', () => {
  it('reads boxes, mirroring and rotation off four corners', () => {
    const plain = boxFromCorners(corners(10, 20, 30, 40));
    assert.deepEqual([plain.w, plain.h, plain.cx, plain.cy, plain.mirrored, plain.r], [30, 40, 25, 40, false, 0]);
    const mirrored = boxFromCorners([{ x: 40, y: 20 }, { x: 10, y: 20 }, { x: 10, y: 60 }, { x: 40, y: 60 }]);
    assert.deepEqual([mirrored.w, mirrored.cx, mirrored.mirrored, mirrored.r], [30, 25, true, 0]);
    const turned = boxFromCorners([{ x: 0, y: 0 }, { x: 0, y: 10 }, { x: -20, y: 10 }, { x: -20, y: 0 }]);
    assert.equal(Math.round(turned.r), 90);
    assert.equal(hexColour(0x5c3b25), '#5c3b25');
    assert.equal(hexColour('red'), null);
  });

  it('keeps what is on stage, dedupes art and boxes each spot round its art', () => {
    const layout = buildHomeLayout({
      w: 960, h: 476,
      draw: [
        { sky: [0xa6effa, 0xeafcfb], rect: [0, 0, 960, 600] },
        { col: 0x5c3b25, rect: [-50, 420, 1200, 240], alpha: 1 },
        { art: 'assets/decos/groddle/bush_3@1.5x.webp', corners: corners(-2000, 0, 50, 50) },
        { art: 'assets/decos/groddle/bush_3.png', corners: corners(100, 380, 80, 40) },
        { art: 'assets/decos/groddle/bush_3.png', corners: [{ x: 300, y: 380 }, { x: 220, y: 380 }, { x: 220, y: 420 }, { x: 300, y: 420 }], tint: 0xc0d0e0 },
        { art: 'https://evil.example/x.png', corners: corners(0, 0, 10, 10) },
        { art: 'assets/sprites/rocks/rock_sheet.png', corners: corners(500, 350, 60, 50), frame: { x: 60, y: 0, width: 60, height: 50 }, sheet: { width: 240, height: 50 }, spot: 0 },
        { art: 'assets/sprites/rocks/rock_sheet.png', corners: corners(500, 340, 60, 20), frame: { x: 0, y: 0, width: 240, height: 50 }, sheet: { width: 240, height: 50 }, spot: 0, alpha: 0.5 },
        { art: 'assets/ui/signpost/signpost_post.webp', corners: corners(590, 190, 40, 210), spot: 2 },
        { txt: 'way_out', corners: corners(600, 200, 60, 14), spot: 2 },
        { txt: 'not_a_text', corners: corners(600, 200, 60, 14) },
        { avatar: true, rect: [700, 250, 98, 141], mirrored: true, spot: 3 },
        { art: 'assets/decos/groddle/bush_3.png', corners: corners(10, 10, 5, 5), alpha: 0 },
      ],
      spots: [
        { desc: { k: 'cultivation', i: 'rock_metal_1' }, aabb: [0, 0, 1, 1] },
        { desc: { k: 'door' }, aabb: [800, 250, 892, 400] },
        { desc: { k: 'signpost' }, aabb: [590, 190, 680, 400] },
        { desc: { k: 'avatar', f: 1 }, aabb: [700, 250, 798, 391] },
        { desc: { k: 'door' }, aabb: [3000, 0, 3100, 100] },
        { desc: { k: 'item', i: 'bag_butler' }, aabb: [10, 10, 100, 100] },
        { desc: { k: 'nonsense' }, aabb: [0, 0, 10, 10] },
      ],
    });
    assert.equal(layout.v, HOME_LAYOUT_VERSION);
    assert.deepEqual(layout.art, ['assets/decos/groddle/bush_3.webp', 'assets/sprites/rocks/rock_sheet.png', 'assets/ui/signpost/signpost_post.webp']);
    assert.deepEqual(layout.draw[0], { sky: ['#a6effa', '#eafcfb'], x: 0, y: 0, w: 960, h: 600 });
    assert.deepEqual(layout.draw[1], { col: '#5c3b25', x: 0, y: 420, w: 960, h: 56 }, 'a band is clipped to the stage');
    assert.deepEqual(layout.draw[2], { a: 0, x: 100, y: 380, w: 80, h: 40 });
    assert.deepEqual(layout.draw[3], { a: 0, x: 220, y: 380, w: 80, h: 40, f: 1, t: '#c0d0e0' });
    assert.deepEqual(layout.draw[4], { a: 1, x: 500, y: 350, w: 60, h: 50, c: [60, 0, 60, 50], s: 0 });
    assert.deepEqual(layout.draw[5], { a: 1, x: 500, y: 340, w: 60, h: 20, o: 0.5, s: 0 }, 'a whole sheet needs no frame');
    assert.deepEqual(layout.draw[6], { a: 2, x: 590, y: 190, w: 40, h: 210, s: 2 });
    assert.deepEqual(layout.draw[7], { txt: 'way_out', x: 600, y: 200, w: 60, h: 14, s: 2 });
    assert.deepEqual(layout.draw[8], { avatar: 1, x: 700, y: 250, w: 98, h: 141, f: 1, s: 3 });
    assert.equal(layout.draw.length, 9);
    // The Butler (a rig, no art file) is not a spot; the door painted on the house is.
    assert.deepEqual(layout.spots, [
      { k: 'cultivation', i: 'rock_metal_1', b: [500, 340, 60, 60] },
      { k: 'door', b: [800, 250, 92, 150] },
      { k: 'signpost', b: [590, 190, 40, 210] },
      { k: 'avatar', f: 1, b: [700, 250, 98, 141] },
    ]);
    assert.ok(homeLayoutJson(layout).bytes < 2048);
    assert.equal(buildHomeLayout({ w: 10, h: 10 }), null, 'no stage, no layout');
    assert.deepEqual(HOME_LAYOUT_TEXTS, { way_out: 'Back to Ur' });
  });

  it('keeps under the caps: scenery goes first, the smallest first, spot art stays', () => {
    const draw = [];
    for (let i = 0; i < HOME_LAYOUT_LIMITS.draw + 50; i++) draw.push({ art: `assets/decos/groddle/d${i % 300}.webp`, corners: corners(i % 900, 10, 1 + (i % 50), 10) });
    draw.push({ art: 'assets/sprites/x/tiny.png', corners: corners(5, 5, 1, 1), spot: 0 });
    const layout = buildHomeLayout({ w: 960, h: 476, draw, spots: [{ desc: { k: 'item', i: 'apple' } }] });
    assert.ok(layout.draw.length <= HOME_LAYOUT_LIMITS.draw);
    assert.ok(layout.art.length <= HOME_LAYOUT_LIMITS.art);
    assert.ok(layout.draw.some((d) => d.s === 0), 'the spot\'s own art is never dropped');
    assert.ok(homeLayoutJson(layout).bytes <= HOME_LAYOUT_LIMITS.bytes);
  });

  it('is keyed by the picture\'s style and hours and by what is on the street, never by where the avatar stands', () => {
    const base = { v: 1, w: 960, h: 476, art: [], draw: [], spots: [{ k: 'door', b: [0, 0, 1, 1] }, { k: 'avatar', b: [10, 0, 1, 1] }] };
    const pic = homeKeyOf('firebog', 0);
    const key = homeLayoutKeyOf(base, pic);
    assert.match(key, /^l1-firebog-0-[0-9a-f]{8}$/);
    assert.match(key, /^[A-Za-z0-9:._-]{1,64}$/, 'the site\'s key rule (Profiles::key)');
    assert.equal(homeLayoutKeyOf({ ...base, spots: [base.spots[0], { k: 'avatar', b: [500, 9, 1, 1] }] }, pic), key);
    assert.notEqual(homeLayoutKeyOf({ ...base, spots: [{ k: 'tower', n: 3, b: [0, 0, 1, 1] }] }, pic), key);
  });
});

describe('the stage walk (walkHomeScene)', () => {
  // A tiny display tree: translation-only containers, sprites with a texture source URL.
  const node = (props, children = []) => {
    const n = { x: 0, y: 0, alpha: 1, visible: true, children, ...props };
    for (const c of children) c.parent = n;
    return n;
  };
  const sprite = (url, x, y, w, h, extra = {}) => node({ x, y, isSprite: true, w, h, texture: { source: { label: url, width: w, height: h }, frame: { x: 0, y: 0, width: w, height: h } }, ...extra });
  const offset = (n) => {
    let x = 0;
    let y = 0;
    for (let p = n; p; p = p.parent) {
      x += p.x;
      y += p.y;
    }
    return { x, y };
  };
  const io = (targets = new Map(), player = null) => ({
    targets,
    player,
    isSprite: (n) => Boolean(n.isSprite),
    localBounds: (n) => (n.isSprite ? { x: 0, y: 0, width: n.w, height: n.h } : n.bounds || null),
    toStage: (n, points) => {
      const o = offset(n);
      return points.map((p) => ({ x: p.x + o.x, y: p.y + o.y }));
    },
  });

  it('walks back to front, by zIndex where children sort, and skips the hidden', () => {
    const a = sprite('assets/decos/groddle/a.webp', 0, 0, 10, 10, { zIndex: 5 });
    const b = sprite('assets/decos/groddle/b.webp', 0, 0, 10, 10, { zIndex: 1 });
    const hidden = sprite('assets/decos/groddle/c.webp', 0, 0, 10, 10, { visible: false });
    const clear = sprite('assets/decos/groddle/d.webp', 0, 0, 10, 10, { alpha: 0 });
    const sky = node({ homeLayoutSky: [1, 2], bounds: { x: 0, y: 0, width: 100, height: 50 } });
    const field = node({ homeLayoutFills: [[0, 40, 100, 10, 0x123456, 0.5]] });
    const world = node({ sortableChildren: true }, [a, b, hidden, clear, sky, field]);
    const { draw } = walkHomeScene(world, io());
    assert.deepEqual(draw.map((d) => d.art || (d.sky ? 'sky' : 'col')), ['sky', 'col', 'assets/decos/groddle/b.webp', 'assets/decos/groddle/a.webp']);
    assert.deepEqual(draw[1], { col: 0x123456, rect: [0, 40, 100, 10], alpha: 0.5, f: 1 });
  });

  it('makes a target or a tagged object a spot owning the art under it, and the avatar the owner\'s still', () => {
    const plant = sprite('assets/sprites/garden/plant.png', 0, -20, 20, 20);
    const garden = node({ x: 100, y: 400, homeLayout: { k: 'cultivation', i: 'proto_herb_garden_small' }, bounds: { x: -50, y: -20, width: 100, height: 22 } }, [plant]);
    const door = node({ x: 300, y: 400, bounds: { x: -46, y: -150, width: 92, height: 150 } });
    const label = node({ homeLayoutText: 'way_out', bounds: { x: 0, y: 0, width: 40, height: 10 } });
    const player = node({ x: 500, y: 400, scale: { y: AVATAR_STILL.scale }, facing: 'right' });
    const world = node({}, [garden, door, label, player]);
    const { draw, spots } = walkHomeScene(world, io(new Map([[door, { classId: 'home_door' }]]), player));
    assert.deepEqual(spots.map((s) => s.desc), [{ k: 'cultivation', i: 'proto_herb_garden_small' }, { k: 'door' }, { k: 'avatar', f: 1 }]);
    assert.equal(draw[0].spot, 0);
    assert.deepEqual(spots[1].aabb, [254, 250, 346, 400]);
    assert.equal(draw[1].txt, 'way_out');
    const av = draw[2];
    assert.equal(av.avatar, true);
    assert.deepEqual(av.rect.map(Math.round), [414, 156, AVATAR_STILL.w, AVATAR_STILL.h]);
    const layout = buildHomeLayout({ w: 960, h: 476, draw, spots });
    assert.deepEqual(layout.spots.map((s) => s.k), ['cultivation', 'door', 'avatar']);
  });

  it('gives art drawn apart from its thing to that thing (a garden\'s bed beside its foot), drawn before or after it', () => {
    const foot = node({ x: 200, y: 400, homeLayout: { k: 'cultivation', i: 'proto_herb_garden_small' }, bounds: { x: -50, y: -10, width: 100, height: 12 } });
    const bed = node({ x: 200, y: 400, homeLayoutPartOf: foot }, [sprite('assets/sprites/garden/garden_bed_polherb_2_2.webp', -50, -40, 100, 40)]);
    const plot = node({ x: 180, y: 380, homeLayoutPartOf: foot }, [sprite('assets/sprites/garden/garden_plots.webp', -10, -20, 20, 20)]);
    const { draw, spots } = walkHomeScene(node({}, [bed, foot, plot]), io());
    assert.equal(spots.length, 1);
    assert.deepEqual(draw.map((d) => d.spot), [0, 0]);
    const layout = buildHomeLayout({ w: 960, h: 476, draw, spots });
    assert.deepEqual(layout.spots, [{ k: 'cultivation', i: 'proto_herb_garden_small', b: [150, 360, 100, 40] }]);
  });
});

describe('the game sends it (features/profiles-feature.js and the tags)', () => {
  const src = read('public/js/features/profiles-feature.js');
  it('sends the layout at the picture\'s settled moment, only to a site that takes layouts, in multiplayer only', () => {
    assert.match(src, /if \(!profile \|\| !Object\.hasOwn\(profile, 'homeLayout'\)\) return false;/);
    assert.match(src, /s\.account\.uploadHomeLayout\(\{ key, layout \}\)/);
    assert.match(src, /if \(!state\.layout\.busy\) uploadLayout\(engine, state\);\n\s*if \(!state\.home\.busy\) uploadHome\(engine, state\);/);
    assert.match(read('public/js/minn-account.js'), /buddyCall\('Saving your home street', 'profile\/home-layout', \{ method: 'PUT', body: \{ key, layout \} \}\)/);
  });

  it('tags what the stage alone cannot say', () => {
    const homes = read('public/js/features/homes-feature.js');
    assert.match(homes, /sky\.homeLayoutSky = style\.sky;/);
    assert.match(homes, /field\.homeLayoutFills = /);
    assert.match(homes, /soilFill\.homeLayoutFills = /);
    assert.match(homes, /house\.homeLayout = \{ k: 'house', s: HOUSES\[houseStyle\] \? houseStyle : 'meadow' \};/);
    assert.match(homes, /target\.sprite\.homeLayout = \{ k: 'cultivation', i: item\.protoClass \};/);
    assert.match(homes, /board\.label\.homeLayoutText = 'way_out';/);
    const tower = read('public/js/features/home-tower-feature.js');
    assert.match(tower, /box\.homeLayout = \{ k: 'tower', i: TOWER_CHASSIS, n: tower\.floors/);
    assert.match(tower, /box\.homeLayout = \{ k: 'scaffolding', i: TOWER_PROTO, p: /);
    assert.match(read('public/js/features/home-street-mp-feature.js'), /box\.homeLayout = \{ k: 'note_pole', i: 'note_pole', n: pole\.note \? 1 : 0 \};/);
  });
});

describe('the site side (groddle-afternoon-site src/HomeLayout.php)', { skip: skipWithoutSite }, () => {
  const php = () => site('src/HomeLayout.php');
  const constant = (name) => {
    const m = new RegExp(`public const ${name} = ([^;]+);`).exec(php());
    assert.ok(m, name);
    return m[1];
  };
  const phpList = (text) => [...text.matchAll(/'([^']*)'/g)].map((m) => m[1]);

  it('holds the same limits, kinds, texts, roots and house styles as the game', () => {
    const L = HOME_LAYOUT_LIMITS;
    assert.equal(constant('MAX_BYTES'), '48 * 1024');
    assert.equal(L.bytes, 48 * 1024);
    for (const [name, value] of [['MIN_W', L.minW], ['MAX_W', L.maxW], ['MIN_H', L.minH], ['MAX_H', L.maxH], ['MAX_ART', L.art], ['MAX_DRAW', L.draw], ['MAX_SPOTS', L.spots], ['REACH', L.reach], ['NAME_MAX', L.nameMax], ['VERSION', HOME_LAYOUT_VERSION]]) {
      assert.equal(Number(constant(name)), value, name);
    }
    assert.deepEqual(phpList(constant('KINDS')), HOME_LAYOUT_KINDS);
    assert.deepEqual(phpList(constant('ART_ROOTS')), HOME_LAYOUT_ART_ROOTS);
    assert.deepEqual(phpList(constant('TEXTS')), Object.entries(HOME_LAYOUT_TEXTS).flat());
    assert.deepEqual(phpList(constant('HOUSE_STYLES')).filter((_, i) => i % 2 === 0), HOUSE_STYLE_KEYS);
  });

  it('declares the layout beside the picture (additive) and answers homeLayout', () => {
    const cols = JSON.parse(site('minn.json')).tables.groddle_profiles.join('\n');
    for (const c of ['home_layout mediumtext NULL', "home_layout_key varchar(64) NOT NULL DEFAULT ''", 'home_layout_at datetime NULL', 'home mediumblob NULL']) assert.ok(cols.includes(c), c);
    const p = site('src/Profiles.php');
    assert.match(p, /\$layout = HomeLayout::accept\(\$body\['layout'\] \?\? null, StaticRoot::fromSite\(\$this->minn\)->dir\);/);
    assert.match(p, /\$this->throttle\(\$character\['id'\], 'home_layout_at'\);/);
    assert.match(p, /'homeLayout' => is_string\(\$row\['home_layout_at'\]/);
  });

  it('draws the diorama when there is a layout, else the picture, and ?home=picture shows the picture', () => {
    const pages = site('src/PlayerPages.php');
    assert.match(pages, /\$diorama = \$this->homeDiorama\(\$who\);/);
    assert.match(pages, /'homePicture' => \$request->query\('home'\) === 'picture',/);
    assert.match(site('style.css'), /\.home-diorama \.hd-stage \{/);
    assert.doesNotMatch(php(), /—/, 'no em-dashes in the page\'s words');
    assert.doesNotMatch(php(), /\b(?:get_option|wp_[a-z_]+|esc_[a-z]+)\s*\(/);
  });

  const engine = process.env.MINN_ENGINE_DIR || join(homedir(), 'Cove/Sites/minn-engine.localhost/public/minn');
  it('takes a good layout, refuses bad ones, and draws only words it writes (php)', { skip: !existsSync(join(engine, 'src/Minn/Autoloader.php')) && 'Minn Engine not found (set MINN_ENGINE_DIR)' }, () => {
    let out;
    try {
      out = JSON.parse(execFileSync('php', [join(root, 'tests/fixtures/profiles/home-layout.php'), engine, SITE_DIR], { encoding: 'utf8' }));
    } catch (err) {
      if (err.code === 'ENOENT') return; // no php here
      throw err;
    }
    if (out.gd === 'no') return;
    assert.equal(out.good, 'ok');
    const refused = ['notObject', 'string', 'version2', 'extraTopKey', 'tooWide', 'hugeNumber', 'nanString', 'urlArt', 'protocolRelative', 'dotDot', 'javascript', 'quoteInPath', 'missingFile',
      'outsideRoots', 'newArt', 'madeArt', 'twinNamed', 'symlinkOut', 'artTwice', 'artIndexOut', 'cropOutside', 'tooManyDraw', 'tooManySpots', 'tooManyArt', 'unknownKind', 'unknownDraw',
      'scriptInText', 'scriptInColour', 'scriptInLabel', 'scriptInItem', 'nameOnDoor', 'longName', 'badStyle', 'twoAvatars', 'spotIndexOut', 'boxShort'];
    for (const name of refused) assert.equal(out[name], 'groddle_home_layout:400', name);
    assert.equal(out.tooBig, 'groddle_home_layout_too_large:413');
    // Normalized: sizes from the files, twins found on disk, an unknown item's spot dropped.
    assert.deepEqual(out.kept.art[1], { p: 'assets/sprites/rocks/rock_sheet.png', w: 400, h: 100, x2: ['assets/sprites/rocks/rock_sheet@3x.webp', '3x'] });
    assert.deepEqual(out.kept.art[0].x2, ['assets/decos/groddle/bush_1@1.5x.webp', '1.5x']);
    assert.equal(out.kept.draw[3].w, 100, 'numbers rounded');
    assert.equal(out.kept.spots.length, 7, 'the spot naming no known item goes; its art would stay');
    assert.deepEqual(out.labels, ['Metal Rock', '#!@$%&*#!@ Spire · Tower · 4 floors', 'Signpost', 'Zz <b>Owner</b>', 'Herb Garden', 'Door', 'House · Firebog']);
    // The page: escaped owner, words from the table, links to the encyclopedia, srcset twins, lazy art.
    assert.match(out.html, /aria-label="Zz &lt;b&gt;Owner&lt;\/b&gt;&#039;s home street"/);
    assert.doesNotMatch(out.html, /<b>Owner/);
    assert.match(out.html, /<span class="hd-sign" aria-hidden="true"[^>]*>Back to Ur<\/span>/);
    assert.match(out.html, /<a href="\/encyclopedia\/items\/rock_metal_1\/" class="hd-spot"/);
    assert.match(out.html, /srcset="\/assets\/sprites\/rocks\/rock_sheet\.png 1x, \/assets\/sprites\/rocks\/rock_sheet@3x\.webp 3x"/);
    assert.match(out.html, /src="\/players\/7\/avatar\?v=1"/);
    assert.doesNotMatch(out.htmlNoAvatar, /data-kind="avatar"|\/players\/7\/avatar/);
    for (const img of out.html.match(/<img [^>]+>/g)) assert.match(img, /loading="lazy"/);
    assert.doesNotMatch(out.html, /—/);
    assert.match(out.scriptName, /data-label="&lt;img src=x onerror=alert\(1\)&gt; · Tower · 4 floors"/);
    assert.doesNotMatch(out.scriptName, /<img src=x/);
  });

  // Austin 2026-11-03: "the mail dispatcher looks blurry but only on the home street mockup".
  it('draws a split 3x sheet\'s frame from its part on sharp screens, as the game does (php)', { skip: !existsSync(join(engine, 'src/Minn/Autoloader.php')) && 'Minn Engine not found (set MINN_ENGINE_DIR)' }, () => {
    let out;
    try {
      out = JSON.parse(execFileSync('php', [join(root, 'tests/fixtures/profiles/home-layout.php'), engine, SITE_DIR, join(root, 'public')], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }));
    } catch (err) {
      if (err.code === 'ENOENT') return;
      throw err;
    }
    if (out.gd === 'no') return;
    // The site reads every split sheet the game's generated js/sprite-hires.js lists, exactly.
    const real = Object.fromEntries([...SPLIT_SPRITES].map(([sheet, s]) => [sheet, { fw: s.fw, fh: s.fh, cols: s.cols, parts: s.parts }]));
    assert.deepEqual(out.realSplits, real);
    assert.ok(out.realSplits['assets/sprites/mail-npc/dispatcher_left.webp'], 'the mail dispatcher is one');
    // Only the generated shape, paths under assets/.
    assert.deepEqual(Object.keys(out.splitSheets), ['assets/sprites/mail-npc/fake_left.png']);
    // Cell 7 (column 3, row 1) is the second part's fourth cell: column 1, row 1 of its 2-column grid.
    assert.deepEqual(out.splitFrame, { src: 'assets/sprites/mail-npc/fake_left.p2@3x.webp', x: 50, y: 80, pw: 100, ph: 160 });
    assert.equal(out.splitSpans, null, 'a frame across two cells stays on the 1x sheet (sprite-hires pointAtPart)');
    assert.equal(out.splitNot, null);
    const html = out.splitHtml;
    assert.match(html, /<span class="hd-crop hd-lo" [^>]*><img src="\/assets\/sprites\/mail-npc\/fake_left\.png" [^>]*style="left:-300%;top:-100%;width:400%;height:200%" \/><\/span>/);
    assert.match(html, /<span class="hd-crop hd-hi" [^>]*><img src="\/assets\/sprites\/mail-npc\/fake_left\.p2@3x\.webp" [^>]*style="left:-100%;top:-100%;width:200%;height:200%" \/><\/span>/);
    assert.equal((html.match(/hd-hi/g) || []).length, 1, 'the spanning frame has no 3x crop');
    // Austin 2026-11-09: the Mail Dispatcher (drawn only for its owner in the game) stays off a player's page.
    assert.doesNotMatch(out.dispatcherHtml, /Mail Dispatcher/);
    assert.equal((out.dispatcherHtml.match(/fake_left/g) || []).length, 1, 'only the loose frame is drawn, not the dispatcher spot\'s');
    assert.match(site('style.css'), /@media \(min-resolution: 1\.5dppx\), \(-webkit-min-device-pixel-ratio: 1\.5\) \{\n\s*\.home-diorama \.hd-stage \.hd-lo \{ display: none; \}\n\s*\.home-diorama \.hd-stage \.hd-hi \{ display: block; \}/);
  });

  it('every other sprite with a 3x render ships it beside the 1x file, where the site looks (HomeLayout::artFile)', () => {
    // A single-file twin is <stem>@3x.webp or <stem>@3x.png; the split sheets are the case above.
    for (const [one, three] of HIRES_SPRITES) {
      const stem = one.replace(/\.[a-z]+$/, '');
      assert.ok(three === `${stem}@3x.webp` || three === `${stem}@3x.png`, `${one} -> ${three}`);
    }
  });
});
