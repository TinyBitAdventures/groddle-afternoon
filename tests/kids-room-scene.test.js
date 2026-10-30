/**
 * The Kid's Room (G65): js/kids-room-scene.js dresses Mr. Block's playroom from the CC0 k04 decos
 * the players' Snaps show; Four Letter Words (game.js) and Child's Play / Word Up
 * (js/quest-rooms/kids-room.js) both use it.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { KIDS_ROOM_FILES } from '../public/js/kids-room-art.js?v=9f7a7a04';
import {
  KIDS_ROOM_ART,
  KIDS_ROOM_ART_DIR,
  KIDS_ROOM_FLOOR,
  KIDS_ROOM_PIECES,
  KIDS_ROOM_TEMPLATE,
  KIDS_ROOM_W,
  kidsRoomArt,
} from '../public/js/kids-room-scene.js?v=b1592bce';
import { FOUR_LETTER_LAYOUT, FOUR_LETTER_ROOM_ID } from '../public/js/four-letter-quest.js?v=a5574ac7';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const publicDir = path.join(root, 'public');
const plan = JSON.parse(fs.readFileSync(path.join(root, 'tools/room-art/kids_room.json'), 'utf8'));

test('the room is the Kid\'s Room template the Snaps name', () => {
  assert.equal(KIDS_ROOM_TEMPLATE, 'LIF149EVS2A22H1');
  assert.equal(FOUR_LETTER_ROOM_ID, KIDS_ROOM_TEMPLATE);
});

test('every piece is a k04 deco rendered from the CC0 kukubee2 bundle, as plan.json records', () => {
  assert.match(plan.source, /glitch-locations kukubee2\.swf \(CC0\)/);
  const used = new Set(KIDS_ROOM_PIECES.map(([piece]) => piece));
  for (const piece of used) assert.ok(KIDS_ROOM_ART[piece], `${piece} has no deco`);
  for (const [piece, deco] of Object.entries(KIDS_ROOM_ART)) {
    assert.match(deco, /^k04_/);
    const row = plan.pieces[deco];
    assert.ok(row, `${deco} is not in plan.json`);
    assert.equal(row.swf, `bundle:kukubee2.swf#${deco}`);
    const [file, w, h] = kidsRoomArt(piece);
    assert.equal(file, row.file);
    assert.deepEqual([w, h], row.world);
    const bytes = fs.readFileSync(path.join(publicDir, KIDS_ROOM_ART_DIR, file));
    assert.equal(createHash('sha256').update(bytes).digest('hex').slice(0, 16), row.sha, `${file} changed since the build`);
    // The @<d>x name makes js/textures.js give the sprite its world size.
    const density = Number(/@([\d.]+)x\.webp$/.exec(file)[1]);
    assert.equal(density, row.density);
    assert.deepEqual(row.out_px.map((px) => Math.round(px / density)), [w, h]);
  }
  assert.deepEqual(Object.keys(KIDS_ROOM_FILES).sort(), Object.keys(plan.pieces).sort());
});

test('the Snaps\' furniture is all there and the art stays small', () => {
  const decos = new Set(KIDS_ROOM_PIECES.map(([piece]) => KIDS_ROOM_ART[piece]));
  for (const deco of [
    'k04_bed_01', 'k04_doll_01_panda', 'k04_dresser_03', 'k04_table_07', 'k04_teapot_01', 'k04_teacup_01',
    'k04_teddybear_01', 'k04_tallguything_01', 'k04_stool_01', 'k04_table_08', 'k04_craylon_03',
    'k04_blocko_01', 'k04_sneaker_01', 'k04_babyrings_01', 'k04_window_01', 'k04_wallcrack_02',
  ]) assert.ok(decos.has(deco), `${deco} is not placed`);
  const total = Object.values(plan.pieces).reduce((sum, row) => sum + row.bytes, 0);
  assert.ok(total < 450_000, `kids_room art is ${total} bytes`);
});

test('pieces sit in the room, and the tea party has its two speakers', () => {
  for (const [piece, x, bottom] of KIDS_ROOM_PIECES) {
    const [, w] = kidsRoomArt(piece);
    assert.ok(x - w / 2 >= -20 && x + w / 2 <= KIDS_ROOM_W + 20, `${piece} at ${x} is outside the room`);
    assert.ok(bottom <= KIDS_ROOM_FLOOR + 90, `${piece} sinks below the carpet`);
  }
  const ids = KIDS_ROOM_PIECES.map(([, , , opts]) => opts?.id).filter(Boolean);
  assert.deepEqual(ids.sort(), ['bear', 'thing']);
});

test('Four Letter Words keeps its puzzle: spacing, spawn beside the blocks, Mr. Block to their right', () => {
  const xs = FOUR_LETTER_LAYOUT.blockXs;
  assert.equal(xs.length, 4);
  assert.deepEqual(xs.slice(1).map((x, i) => x - xs[i]), [120, 120, 120]);
  assert.ok(FOUR_LETTER_LAYOUT.spawnX < xs[0]);
  assert.ok(xs[0] - FOUR_LETTER_LAYOUT.spawnX <= 160, 'spawn stays next to the blocks');
  assert.ok(FOUR_LETTER_LAYOUT.mrBlock.x >= xs[3]);
  assert.ok(FOUR_LETTER_LAYOUT.mrBlock.x + 80 < KIDS_ROOM_W);
  const game = fs.readFileSync(path.join(publicDir, 'game.js'), 'utf8');
  assert.match(game, /buildKidsRoomScene\(PIXI/);
  assert.match(game, /FOUR_LETTER_LAYOUT\.blockXs/);
  assert.match(game, /WORLD_W = KIDS_ROOM_W/);
  const kids = fs.readFileSync(path.join(publicDir, 'js/quest-rooms/kids-room.js'), 'utf8');
  assert.match(kids, /buildKidsRoomScene\(PIXI/);
});
