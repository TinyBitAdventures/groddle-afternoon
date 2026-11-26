// G892 (stand-ins audit 2026-11-16, class A, scenes and props): code-drawn shapes swapped for Tiny
// Speck's own CC0 art where it survives.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { TRAINING2_TABLE_ART, TRAINING2_TABLE_SCALE, training2Layout, training2TableTop } from '../public/js/newxp.js?v=0d81aa52';
import { PARADISE_COURSES, PARADISE_EXIT_ART, STARLIT_NIGHT_CLOUDS, STARLIT_NIGHT_CLOUD_SPRITE, PARADISE_STAR_SIDE, paradisePickupTouches, paradiseSourcePoints, paradiseStarArt } from '../public/js/paradise-flight.js?v=1bc7c0c5';
import { POTION_ART } from '../public/js/potion-art.js?v=9d731b38';
import { ROOK_WOODS_BIRDS } from '../public/js/rook-woods.js?v=0aab151e';
import { FURNITURE_UPGRADES } from '../public/js/furniture-upgrades-data.js?v=0b2cf3cc';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
const AUDIT = join(process.env.HOME || '', 'Documents/glitch-audit');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

describe('training2 tables (A2, A2b)', () => {
  it('are the shipped furniture renders, with their own plats and feet', () => {
    for (const art of Object.values(TRAINING2_TABLE_ART)) {
      const row = FURNITURE_UPGRADES[art.classTsid].upgrades[art.upgrade];
      assert.equal(row.art.path, art.path);
      assert.equal(row.art.w, art.w);
      assert.equal(row.art.h, art.h);
      assert.equal(art.rest, row.platY - row.art.foot, `${art.classTsid} ${art.upgrade} rest`);
      assert.ok(existsSync(join(ROOT, art.path)), art.path);
      if (existsSync(join(AUDIT, 'glitch-items'))) assert.ok(existsSync(join(AUDIT, 'glitch-items', art.swf)), art.swf);
    }
    assert.equal(FURNITURE_UPGRADES.furniture_table.upgrades['63'].name, 'White Tablecloth Table');
    assert.equal(FURNITURE_UPGRADES.furniture_counter.upgrades['408'].name, 'Firebog Counter');
  });

  it('stand the food and drinks (GSJS location_targets) on their tops', () => {
    const L = training2Layout();
    for (const id of ['food_2', 'food_3']) assert.ok(Math.abs(training2TableTop('food', L.floorY) - L.items[id].y) <= 2, id);
    for (const id of ['drink_1', 'drink_2', 'drink_3']) assert.ok(Math.abs(training2TableTop('drinks', L.floorY) - L.items[id].y) <= 2, id);
    // Every item stands over its table's art, not past its ends.
    for (const [kind, ids] of [['food', ['food_2', 'food_3']], ['drinks', ['drink_1', 'drink_2', 'drink_3']]]) {
      const half = (TRAINING2_TABLE_ART[kind].w * TRAINING2_TABLE_SCALE) / 2;
      for (const id of ids) assert.ok(Math.abs(L.items[id].x - L.tables[kind].x) < half - 10, id);
    }
  });

  it('are drawn from that art, not as shapes', () => {
    const src = read('js/features/newxp-feature.js');
    const at = src.indexOf('function buildTraining2(');
    const body = src.slice(at, src.indexOf('\n}\n', at));
    assert.match(body, /TRAINING2_TABLE_ART\[kind\]/);
    assert.doesNotMatch(body, /ellipse\(|roundRect\(|0x9a5a2b|0xf4f4f4/);
  });
});

const game = () => read('game.js');
const fnBody = (src, name) => {
  const at = src.indexOf(`function ${name}(`);
  return src.slice(at, src.indexOf('\n}\n', at));
};
const street = (tsid) => JSON.parse(read(`assets/streets/${tsid}.json`));
const XML = (tsid) => join(AUDIT, 'streets/mnt/stos/location_data', `${tsid}.xml`);

describe('Radial Heights stars and way out (A6, A7)', () => {
  it('each star pickup is its source star deco at the source size and turn', () => {
    const data = street('GHFQOLEIHN63P27');
    const stars = data.layers.find((l) => l.name === 'yellow stars').decos;
    assert.equal(stars.length, 53);
    for (const deco of stars) {
      // js/paradise-flight.js paradiseSourcePoints
      const point = { radius: Math.max(10, Math.min(28, deco.w * 0.42)), major: deco.sprite === 'star_asset_01', r: deco.r };
      const art = paradiseStarArt(point);
      assert.equal(art.asset, deco.sprite);
      assert.ok(Math.abs(art.side - deco.w) <= 0.6, `${deco.id} ${art.side} vs ${deco.w}`);
      assert.equal(art.rotation, (deco.r * Math.PI) / 180);
      assert.ok(existsSync(join(ROOT, `assets/decos/groddle/${deco.sprite}.webp`)));
    }
    assert.equal(PARADISE_STAR_SIDE, 2.38);
    assert.deepEqual(paradiseSourcePoints(PARADISE_COURSES.radial_heights, data).map((p) => p.r), stars.map((d) => d.r || 0));
  });

  it('the stars are drawn from the decos, the box and the collision unchanged', () => {
    const src = game();
    assert.doesNotMatch(src, /function vectorStar\(/);
    const spawn = fnBody(src, 'spawnParadisePickup');
    assert.match(spawn, /sprite = paradiseStarPickup\(point\);\n\s*sprite\.baseScale = 1;/);
    assert.match(fnBody(src, 'paradiseStarPickup'), /textureFromUrl\(`assets\/decos\/groddle\/\$\{art\.asset\}\.png`\)/);
    // The touch box is still the radius each way at drawn scale 1.
    const course = PARADISE_COURSES.radial_heights;
    assert.equal(paradisePickupTouches(course, { x: 0, y: 0, radius: 23.9 }, { x: 0, y: 40 }, { drawnScale: 1 }),
      paradisePickupTouches(course, { x: 0, y: 0, radius: 23.9 }, { x: 0, y: 40 }));
  });

  it('the way out is the street signpost under its source sign, the drawn arch only where nothing survives', () => {
    const art = PARADISE_EXIT_ART.radial_heights;
    assert.equal(art.kind, 'signpost');
    const data = street('GHFQOLEIHN63P27');
    const post = data.signposts[0];
    const exit = PARADISE_COURSES.radial_heights.exit;
    assert.ok(Math.abs(post.x - data.bounds.l - exit.x) <= 2 && Math.abs(post.y - data.bounds.t - exit.y) <= 20, 'the exit stands at the source signpost');
    const sign = data.layers.flatMap((l) => l.decos || []).find((d) => d.id === 'groddle_sign_blank_1340666150610');
    assert.deepEqual([sign.x, sign.y, sign.w, sign.h], [art.sign.x, art.sign.y, art.sign.w, art.sign.h]);
    if (existsSync(XML('GHFQOLEIHN63P27'))) assert.match(readFileSync(XML('GHFQOLEIHN63P27'), 'utf8'), /<str id="sign_txt">Exit's down here!<\/str>/);
    const src = game();
    const spawn = fnBody(src, 'spawnParadiseExit');
    assert.match(spawn, /oneArmSignpost\(PIXI, art\.arm/);
    assert.match(spawn, /const arrow = art \? null : paradiseExitArch\(course, root\)/);
    assert.match(src, /if \(paradiseExit\.arrow\) paradiseExit\.arrow\.visible = true;/);
    assert.match(fnBody(src, 'buildRadialBackground'), /PARADISE_EXIT_ART\.radial_heights\.sign/);
    assert.doesNotMatch(src, /EXIT'S DOWN HERE!/);
  });
});

describe('Starlit Night cloud floor and way out (A7, A8)', () => {
  it('lays the street\'s six cloud_blueShade3 decos where it placed them', () => {
    const data = street('GHFCVOD2GN631RJ');
    const mg = data.layers.find((l) => l.id === 'middleground');
    const src = mg.decos.filter((d) => d.sprite === STARLIT_NIGHT_CLOUD_SPRITE);
    assert.equal(src.length, 6);
    assert.equal(STARLIT_NIGHT_CLOUDS.length, 6);
    for (const d of src) {
      const row = STARLIT_NIGHT_CLOUDS.find((c) => c.z === d.z);
      assert.deepEqual([row.x, row.y, row.w, row.h, row.r, Boolean(row.flip)],
        [d.x - data.bounds.l, d.y - data.bounds.t, d.w, d.h, d.r, Boolean(d.flip)], `cloud z ${d.z}`);
    }
    assert.ok(existsSync(join(ROOT, `assets/decos/groddle/${STARLIT_NIGHT_CLOUD_SPRITE}.webp`)));
    // The front puffs (cloud_vpuff2) are in no CC0 set: none ships.
    assert.ok(!existsSync(join(ROOT, 'assets/decos/groddle/cloud_vpuff2.webp')));
    const body = fnBody(game(), 'buildStarlitBackground');
    assert.match(body, /STARLIT_NIGHT_CLOUDS\.map/);
    assert.doesNotMatch(body, /ellipse\(/);
  });

  it('the way out is the street\'s exit door, boarded until the sky is lit', () => {
    const art = PARADISE_EXIT_ART.starlit_night;
    assert.deepEqual([art.kind, art.sprite, art.w, art.h], ['door', 'door_asset_apartment_hall_right', 50, 138]);
    assert.ok(existsSync(join(ROOT, `assets/decos/groddle/${art.sprite}.webp`)));
    if (existsSync(XML('GHFCVOD2GN631RJ'))) {
      const xml = readFileSync(XML('GHFCVOD2GN631RJ'), 'utf8');
      assert.match(xml, /<bool id="instance_exit">true<\/bool>[\s\S]*<str id="sprite_class">door_asset_apartment_hall_right<\/str>/);
    }
    // The exit's touch point is unchanged.
    assert.deepEqual({ ...PARADISE_COURSES.starlit_night.exit }, { x: 1380, y: 700 });
    const spawn = fnBody(game(), 'spawnParadiseExit');
    assert.match(spawn, /art\?\.kind === 'door'/);
    assert.doesNotMatch(game(), /paradiseExitShutSign|text: 'SHUT'/); // G978
  });
});

describe('Alphabet Sauce (A9)', () => {
  it('is alphabet_sauce.swf\'s own loop, rendered by tools/potion-art.py', () => {
    const art = POTION_ART.alphabet_sauce;
    assert.ok(art, 'potion-art.js has the sheet');
    assert.equal(art.url, 'assets/sprites/potions/alphabet_sauce.webp');
    assert.match(art.source, /^glitch-items\/alchemy\/alphabet_sauce_unreleased\/alphabet_sauce\.swf sprite 84, every 2 frame\(s\) at zoom 2$/);
    // 79 frames, every second one: 40 cells, drawn at world size.
    assert.equal(art.frames, 40);
    assert.equal(art.scale, 0.5);
    assert.deepEqual(art.labels.loop, [0, 40]);
    assert.ok(existsSync(join(ROOT, art.url)));
    const tool = readFileSync(join(ROOT, '../tools/potion-art.py'), 'utf8');
    assert.match(tool, /'alphabet_sauce': \('alchemy\/alphabet_sauce_unreleased\/alphabet_sauce\.swf', 84, 2, 1,/);
    assert.match(tool, /--check/);
    if (existsSync(join(AUDIT, 'glitch-items'))) assert.ok(existsSync(join(AUDIT, 'glitch-items/alchemy/alphabet_sauce_unreleased/alphabet_sauce.swf')));
  });

  it('the poured sauce plays that sheet, not a drawn puddle', () => {
    const src = read('js/features/potions-feature.js');
    const body = fnBody(src, 'drawSauce');
    assert.match(body, /framesFor\(engine, 'alphabet_sauce'\)/);
    assert.match(body, /new PIXI\.AnimatedSprite\(frames\)/);
    assert.doesNotMatch(body, /ellipse\(|0xc8432b/);
    assert.match(src, /export const ALPHABET_SAUCE_SPEED = 12 \/ 60;/);
  });
});

describe('Rooks\' Woods birds (A10)', () => {
  it('are the shipped rook silhouette sheet (rook_fly_side.swf sprite 53), where the strokes were', () => {
    const B = ROOK_WOODS_BIRDS;
    assert.ok(existsSync(join(ROOT, B.sheet)), B.sheet);
    assert.equal(B.cols * B.rows, B.frames);
    assert.equal(B.frames, 18);
    // The sheet's grid is exactly the cells named here (888 x 435).
    const head = readFileSync(join(ROOT, B.sheet));
    const kind = head.toString('ascii', 12, 16);
    const bits = head.readUInt32LE(21);
    const size = kind === 'VP8X' ? [head.readUIntLE(24, 3) + 1, head.readUIntLE(27, 3) + 1] : [(bits & 0x3fff) + 1, ((bits >> 14) & 0x3fff) + 1];
    assert.equal(kind === 'VP8X' || kind === 'VP8L', true, kind);
    assert.deepEqual(size, [B.fw * B.cols, B.fh * B.rows]);
    assert.match(read('js/quest-rooms/an-autumn-day.js'), /crow\.png is rook_fly_side\.swf\s*\n?\s*\*?\s*sprite 53/);
    assert.equal(B.spots.length, 8);
    assert.deepEqual(B.spots.map((p) => [p.x, p.y]), Array.from({ length: 8 }, (_, i) => [330 + i * 245, 215 + (i % 3) * 44]));
    // About as wide as the strokes were (29 px).
    assert.ok(Math.abs(B.fw * B.scale - 29) < 4);
    const body = fnBody(game(), 'drawRookWoodsBackground');
    assert.match(body, /new PIXI\.AnimatedSprite\(birdFrames\)/);
    assert.doesNotMatch(body, /quadraticCurveTo/);
  });
});

describe('Arbor Hollow nest and egg (A12)', () => {
  it('stay drawn, with the reason: the only nest deco is the black rook_nest silhouette', () => {
    const src = read('js/paradise-course-runtime.js');
    assert.match(src, /G892 \(stand-ins audit A12\): they stay drawn/);
    const svg = read('assets/decos/groddle/rook_nest.svg');
    const fills = new Set([...svg.matchAll(/fill="(#[0-9a-fA-F]{6})"/g)].map((m) => m[1].toLowerCase()));
    assert.deepEqual([...fills], ['#000000']);
  });
});
