/**
 * The Rube's yard (G66): js/rube-yard-scene.js dresses The Wrizzards and The Rube's yard from the
 * CC0 Groddle bling and Firebog decos its two player Snaps show, and js/quest-rooms/rube-yard.js
 * hides the Wrizzards behind that junk (gameplay unchanged: tests/quest-instance.test.js).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { RUBE_YARD_FILES } from '../public/js/rube-yard-art.js?v=0a67d3e6';
import {
  YARD_ART_DIR, YARD_FLOOR, YARD_FRONT, YARD_PIECES, YARD_W, TIER1, TIER2, LAWN_TOP,
} from '../public/js/rube-yard-scene.js?v=74c9b6bd';
import * as room from '../public/js/quest-rooms/rube-yard.js?v=6186a47e';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const publicDir = path.join(root, 'public');
const plan = JSON.parse(fs.readFileSync(path.join(root, 'tools/room-art/rube_yard.json'), 'utf8'));

/** Where a yard piece's file lives: the room-art set, else the shared Groddle decos. */
function fileOf(name) {
  if (RUBE_YARD_FILES[name]) return path.join(publicDir, YARD_ART_DIR, RUBE_YARD_FILES[name][0]);
  return path.join(publicDir, 'assets/decos/groddle', `${name}.webp`);
}

test('every yard piece, cover and prop ships as a CC0 deco', () => {
  const names = new Set([...YARD_PIECES, ...YARD_FRONT].map(([name]) => name));
  for (const spot of room.HIDING_SPOTS) {
    if (spot.cover) names.add(spot.cover);
    for (const [name] of spot.props || []) names.add(name);
  }
  // The Snaps' signature pieces are all there.
  for (const want of ['bling_flamingo_1', 'bling_lollipop_1', 'bling_candycane_1', 'bling_birdbath', 'bling_treehole_1',
    'mushroom_amanita_1', 'rook_hall_skull_deco', 'table', 'lantern', 'open_house_sign', 'bureaucratic_hall_sign_wait_1']) {
    assert.ok(names.has(want), `${want} is in the yard`);
  }
  for (const name of names) assert.ok(fs.existsSync(fileOf(name)), `${name}: ${fileOf(name)}`);
});

test('the room-art set matches its plan (tools/room-art/build.py rube_yard)', () => {
  assert.match(plan.source, /glitch-locations .*firebog\.swf.*\(CC0\)/);
  assert.deepEqual(Object.keys(plan.pieces).sort(), Object.keys(RUBE_YARD_FILES).sort());
  for (const [name, row] of Object.entries(plan.pieces)) {
    const [file, w, h] = RUBE_YARD_FILES[name];
    assert.equal(file, row.file);
    assert.deepEqual([w, h], row.world);
    const bytes = fs.readFileSync(path.join(publicDir, YARD_ART_DIR, file));
    assert.equal(createHash('sha256').update(bytes).digest('hex').slice(0, 16), row.sha, `${file} changed since the build`);
  }
});

test('the yard keeps its gameplay geometry and terraces stay behind the lawn', () => {
  assert.equal(YARD_W, 1900);
  assert.equal(YARD_FLOOR, 620);
  assert.ok(TIER1 < TIER2 && TIER2 < LAWN_TOP && LAWN_TOP < YARD_FLOOR);
  for (const [name, x] of [...YARD_PIECES, ...YARD_FRONT]) assert.ok(x >= 0 && x <= YARD_W, `${name} at ${x}`);
  // Every hiding spot but the stash, the birdhouse post and the face tree has a cover in front of it.
  const bare = room.HIDING_SPOTS.filter((s) => !s.cover).map((s) => s.id).sort();
  assert.deepEqual(bare, ['roof', 'stash', 'tree']);
  // The birdhouse post and the face tree the bare Wrizzards cling to are in the yard.
  const near = (name, x) => YARD_PIECES.some(([n, px]) => n === name && Math.abs(px - x) < 40);
  assert.ok(near('bling_birdhouse_1', room.HIDING_SPOTS.find((s) => s.id === 'roof').wx));
  assert.ok(near('bling_treeface_1', room.HIDING_SPOTS.find((s) => s.id === 'tree').wx));
});
