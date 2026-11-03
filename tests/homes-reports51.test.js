// Player reports 51-57 (2026-11-03, build 69a9345e): the house's side-wall seams, the style
// picker over its piece, the swatch categories read sideways, price tags left behind, the
// signpost editor's dead buttons, and a stay at home that outlived a visit to a friend's.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { END_SEAM, roomPieces } from '../public/js/home-wallpaper.js?v=f1969400';
import { WALLPAPER_MAPS } from '../public/js/home-wallpaper-art.js?v=9f8473e6';

const root = join(import.meta.dirname, '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const gsjs = join(root, '../glitch-GameServerJS');

describe('51b: no sky between the back wall and the side walls', () => {
  const state = { walls: Array(7).fill('grey_unfinished'), floor: 'starter_crappy', ceiling: 'starter_crappy_ceiling' };

  it('each end piece reaches under the back wall; its outer edge stays put', () => {
    const r = roomPieces(state);
    const ends = r.pieces.filter((p) => p.layer === 'wall' && p.h === 458 && !p.outside);
    assert.equal(ends.length, 2);
    const [left, right] = ends.sort((a, b) => a.x - b.x);
    assert.deepEqual([left.x, left.w], [0, 150 + END_SEAM]);
    assert.deepEqual([right.x + right.w, right.w], [r.width, 150 + END_SEAM]);
    assert.ok(END_SEAM >= 1);
  });

  it('the open end into the back yard too; the stamping targets keep the source\'s 150 px', () => {
    const r = roomPieces(state, { leftOpen: true });
    const open = r.pieces.find((p) => p.layer === 'wall' && p.h === 393);
    assert.deepEqual([open.x, open.w], [0, 150 + END_SEAM]);
    assert.ok(r.walls.every((w) => w.w === 150));
  });

  it('a Tower floor\'s right end the same', () => {
    const r = roomPieces({ layout: 'tower', walls: [], wall: 'grey_unfinished', floor: 'starter_crappy', ceiling: 'starter_crappy_ceiling' });
    const end = r.pieces.find((p) => p.layer === 'wall' && p.h === 458);
    assert.equal(end.w, 150 + END_SEAM);
  });
});

describe('51a/c: what the original sold and stored at home (source facts the reply relies on)', () => {
  it('furniture is sold by furniture_base; other things only through a Storage Display Box', { skip: !existsSync(gsjs) }, () => {
    const lamp = readFileSync(join(gsjs, 'items/furniture_tablelamp.js'), 'utf8');
    assert.match(lamp, /verbs\.set_sale_price = \{ \/\/ defined by furniture_base/);
    const sdb = readFileSync(join(gsjs, 'items/bag_furniture_sdb.js'), 'utf8');
    assert.match(sdb, /verbs\.set_selling_price = \{/);
    assert.match(sdb, /stack\.is_bag \|\| stack\.is_trophy \|\| stack\.has_parent\('furniture_base'\)/);
  });

  it('the cabinets were storage: width x height slots, opened by the owner or a key holder', { skip: !existsSync(gsjs) }, () => {
    for (const [cls, w, h] of [['bag_furniture_cabinet', 4, 8], ['bag_furniture_smallcabinet', 4, 4], ['bag_furniture_wallcabinet', 3, 3]]) {
      const src = readFileSync(join(gsjs, `items/${cls}.js`), 'utf8');
      assert.match(src, new RegExp(`"width"\\t: "${w}"`), cls);
      assert.match(src, new RegExp(`"height"\\t: "${h}"`), cls);
      assert.match(src, /type: "cabinet_start"/, cls);
      assert.match(src, /acl_keys_player_has_key\(pc\)/, cls);
    }
  });
});
