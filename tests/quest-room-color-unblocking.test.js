/**
 * Colour Unblocking's look (G69): js/quest-rooms/color-unblocking.js dresses the level as its
 * players' Snaps show it (white void, felt blocks, charcoal felt floor, purple door, Keita's
 * finale page). The switch mechanics are held by tests/quest-instance.test.js.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { COLOR_UNBLOCKING_FILES } from '../public/js/color-unblocking-art.js?v=ea2b7e7f';
import * as mod from '../public/js/quest-rooms/color-unblocking.js?v=31d09442';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const plan = JSON.parse(fs.readFileSync(path.join(root, 'tools/room-art/color_unblocking.json'), 'utf8'));
const src = fs.readFileSync(path.join(root, 'public/js/quest-rooms/color-unblocking.js'), 'utf8');

test('every switch group wears a felt colour from the Snaps and the finale drawing', () => {
  const groups = new Set(mod.colorLayout().switches.map((s) => s.color));
  for (const color of groups) assert.ok(mod.FELT[color], `${color} has a felt`);
  assert.equal(mod.FELT.red.hex, 0xdb2d2b);
  assert.equal(mod.FELT.green.label, 'Yellow');
  assert.equal(mod.FELT.purple.label, 'Charcoal');
  assert.equal(mod.FELT.purple.hex, mod.FELT_FLOOR);
  const labels = Object.values(mod.FELT).map((f) => f.label);
  assert.equal(new Set(labels).size, labels.length, 'switch names stay distinct');
});

test('the void is white and the old toy-box dressing is gone', () => {
  assert.match(src, /\[\[0, '#ffffff'\], \[1, '#ffffff'\]\]/);
  for (const gone of ['block_cloud01', 'block_tree01', 'block_mushroom01', 'block_grass01', 'door_asset_yellowPurple', 'COLORS[b.color].block']) {
    assert.ok(!src.includes(gone), `${gone} removed`);
  }
});

test('the finale page and the purple door are CC0 room-art renders matching their plan', () => {
  assert.match(plan.source, /glitch-locations arbito1\.swf, quest01\.swf \(CC0\)/);
  assert.equal(plan.pieces[mod.FINALE_ART].swf, 'bundle:quest01.swf#unclutter_your_mind_keita_pic');
  assert.equal(plan.pieces.door_asset_purple.swf, 'bundle:arbito1.swf#door_asset_purple');
  for (const [name, row] of Object.entries(plan.pieces)) {
    const [file, w, h] = COLOR_UNBLOCKING_FILES[name];
    assert.deepEqual([file, w, h], [row.file, ...row.world]);
    const bytes = fs.readFileSync(path.join(root, 'public/assets/sprites/quest-rooms/color_unblocking', file));
    assert.equal(createHash('sha256').update(bytes).digest('hex').slice(0, 16), row.sha, `${file} changed since the build`);
  }
  assert.ok(mod.FINALE_MS >= 2000 && mod.FINALE_MS <= 5000);
});

test('G98: the finale drawing fills the view down to the floor the avatar stands on, as in the Snaps', () => {
  const [, w, h] = COLOR_UNBLOCKING_FILES[mod.FINALE_ART];
  // The room view is 960 x 408 with the avatar's feet ~306 px down.
  const p = mod.finaleArtPlacement(960, 408, 306, h);
  const top = p.bottom - h * p.scale;
  assert.ok(top >= 0 && top <= 408 * 0.06, `top ${top}: just under the view's top edge`);
  assert.ok(p.bottom >= 306 && p.bottom <= 312, 'resting on the felt floor');
  assert.ok((w * p.scale) / 960 >= 0.44, 'spans close to half the wide view (the Snaps: ~68% of 640)');
  assert.ok(p.x / 960 > 0.5 && p.x / 960 < 0.65, 'a little right of centre');
  // The room card steps aside and the avatar stays in front of the page.
  assert.match(src, /ctx\.coverHud\?\.\(true\)/);
  assert.match(src, /player\.zIndex = 901/);
});
