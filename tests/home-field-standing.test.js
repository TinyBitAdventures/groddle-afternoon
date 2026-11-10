/**
 * G616 (report #160): a home street's near trunks, huts and ledges stand in the field, not on
 * its back edge. Tiny Speck's Firebog streets stand their bottletrees right down in the walking
 * ground (the header pictures, reference only); the remake's first recipes stood every backdrop
 * layer on one line 130 px above the walk line, so the big near trunks ended on the same hard
 * line as the far hut, over an empty brown band.
 *
 * The rule (homes-feature landscapeNearSpots, nearFeetY; tools/home-styles/recipes.mjs): a
 * `near` row with `inField` stands that many px behind the walk line, inside the field, drawn
 * behind the house and everything on the street; it is counted from the house lot outward, so
 * it stays put when the yard grows. The six Firebog exterior styles are laid out this way.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { HOME_LIMITS } from '../public/js/homes-catalog.js?v=10ac34b6';
import { createCultivationState, homeStreetLayout } from '../public/js/home-cultivation.js?v=9571e110';
import { EXTERIOR_STYLES, streetLook, yardLook } from '../public/js/home-styles.js?v=5b49a731';
import {
  FIELD_DEPTH,
  fieldDepth,
  landscapeNearSpots,
  nearFeetY,
  streetNearSkip,
  towerDoorway,
} from '../public/js/features/homes-feature.js?v=6f689019';

const read = (rel) => readFileSync(join(import.meta.dirname, '..', 'public', 'js', rel), 'utf8');
const FIREBOG = ['firebog_1_high', 'firebog_1b_high', 'firebog_3_high', 'firebog_4_high', 'firebog_2_high', 'firebog_4a_high'];
/** Tiny Speck's Firebog ground brown (ground_generic_*, the foot of grass_solid). */
const GROUND = 0x4c3b2a;
/** The big Firebog pieces: bottletree bodies and whole trees, root legs, treetops, ledges. */
const BIG = /^(bottletree_|background_bottletree_(hut|face|barred)|legs_|treetop_|front_ground_)/;
const maxLeft = HOME_LIMITS.MAX_FRONTYARD_LEFT_SEGMENTS - HOME_LIMITS.START_FRONTYARD_LEFT_SEGMENTS;
const maxRight = HOME_LIMITS.MAX_FRONTYARD_RIGHT_SEGMENTS - HOME_LIMITS.START_FRONTYARD_RIGHT_SEGMENTS;
const lotOf = (layout) => ({ left: layout.lotLeft, right: layout.lotRight });
const spotsOn = (look, key, state, opts = {}) => {
  const layout = homeStreetLayout(createCultivationState(state));
  return { layout, spots: landscapeNearSpots(look, look.seed || key, layout.width, streetNearSkip(layout, opts), { lot: lotOf(layout) }) };
};
const lit = (color, light) => [16, 8, 0].reduce((out, sh) => out | (Math.round((((color >> sh) & 255) * ((light >> sh) & 255)) / 255) << sh), 0);

describe('where a near piece stands (nearFeetY)', () => {
  it('a piece with inField stands that far behind the walk line, never past the field', () => {
    assert.equal(nearFeetY({ inField: 0 }, 870), 870);
    assert.equal(nearFeetY({ inField: 60 }, 870), 810);
    assert.equal(nearFeetY({ inField: 500 }, 870), 870 - FIELD_DEPTH, 'clamped to the back edge');
    assert.equal(nearFeetY({ inField: 500 }, 870, 190), 680, 'a deeper field takes a deeper piece');
    assert.equal(nearFeetY({ inField: -20 }, 870), 870, 'never in front of the walk line');
  });

  it('`on` raises a piece over the ground there (a tuft on a ledge) or lowers it (a shadow)', () => {
    assert.equal(nearFeetY({ inField: 60, on: 50 }, 870), 760);
    assert.equal(nearFeetY({ inField: 60, on: -12 }, 870), 822);
  });

  it('a piece without inField is the front fringe, as before', () => {
    assert.equal(nearFeetY({}, 870), 892);
    assert.equal(nearFeetY({ below: 18 }, 870), 910);
  });
});

describe('the Firebog home streets stand on their ground (G616)', () => {
  it('each style stands trunks, huts or ledges in the field on both sides of the house', () => {
    for (const key of FIREBOG) {
      const look = streetLook(key);
      const { layout, spots } = spotsOn(look, key, {});
      const big = spots.filter((s) => s.back != null && BIG.test(s.row.s));
      const left = big.filter((s) => s.x < layout.lotLeft);
      const right = big.filter((s) => s.x > layout.lotRight);
      assert.ok(left.length >= 3, `${key}: ${left.length} big pieces left of the house`);
      assert.ok(right.length >= 6, `${key}: ${right.length} big pieces right of the house`);
      assert.ok(big.some((s) => /^bottletree_body|^bottletree_(burb|city)_wndw|^background_bottletree_/.test(s.row.s)), `${key}: a trunk or a hut`);
      assert.ok(big.some((s) => /^front_ground_/.test(s.row.s)), `${key}: ledges`);
      assert.ok(spots.filter((s) => s.back != null && s.row.s === 'grass_solid').length >= 12, `${key}: grass through the field`);
    }
  });

  it('every piece in the field has its feet inside it, and a raised piece belongs to something on the ground', () => {
    let checked = 0;
    for (const key of FIREBOG) {
      const look = streetLook(key);
      const depth = fieldDepth(look);
      const rows = look.near.filter((row) => Number.isFinite(row.inField));
      for (const row of rows) {
        checked += 1;
        assert.ok(row.inField >= 0 && row.inField <= depth, `${key} ${row.s}: inField ${row.inField} within the ${depth} px field`);
        const feet = nearFeetY(row, 870, depth);
        if (row.on > 0) {
          // a treetop on its trunk, a tuft on a ledge: its group stands on the ground and reaches up to it
          const others = rows.filter((other) => other.group === row.group && other !== row && other.s !== 'shadow');
          assert.ok(row.group && others.some((other) => !(other.on > 0)), `${key} ${row.s}: raised ${row.on} px with nothing on the ground under it`);
          const tallest = Math.max(...others.map((other) => other.inField + (other.on || 0) + other.h * other.scale));
          assert.ok(row.inField + row.on <= tallest + 8, `${key} ${row.s}: raised ${row.on} px, above its ${row.group}`);
        } else {
          // on the ground: between the field's back edge and the walk line (a shadow may reach a little under its trunk)
          assert.ok(feet >= 870 - depth && feet <= 870 + 22, `${key} ${row.s}: feet at ${feet}`);
        }
      }
    }
    assert.ok(checked > 200, `checked ${checked} rows`);
  });

  it('the near backdrop layer carries no trunk, hut or lantern any more: they stand in the field instead', () => {
    for (const key of FIREBOG) {
      const look = streetLook(key);
      for (const layer of look.layers) {
        // the layers that slid at 0.7 of the street and more held the big near trunks; f 1 is the field's own rim
        if (!(layer.f >= 0.7) || layer.f === 1) continue;
        for (const item of layer.items || []) {
          if (item.hang) continue;
          assert.doesNotMatch(item.s, /^(bottletree_|background_bottletree_|legs_|lantern_stacked|mushrooms)/, `${key}: ${item.s} on the f ${layer.f} layer`);
        }
      }
    }
  });

  it('the field is Tiny Speck\'s Firebog ground under the style\'s light, and its back edge is rolling ground', () => {
    for (const key of FIREBOG) {
      const look = streetLook(key);
      assert.equal(look.field, lit(GROUND, look.nearTint ?? 0xffffff), `${key}: the ground decos sit in it without a seam`);
      const rim = look.layers.at(-1);
      assert.equal(rim.f, 1, `${key}: the rim moves with the ground`);
      assert.equal(rim.tint, look.nearTint, `${key}: lit like the ground`);
      for (const item of rim.items) {
        assert.match(item.s, /^ground_generic_\d_spotless$/);
        // its foot is under the field's back edge (y 586 in recipe coordinates), its top a low mound over it
        const over = 586 - (item.y - item.h * item.scale);
        assert.ok(item.y > 586 + 20 && over > 12 && over < 60, `${key} ${item.s}: ${Math.round(over)} px over the edge`);
      }
    }
  });

  it('the far layers stay on the horizon: nothing of theirs floats over the field\'s back edge', () => {
    for (const key of FIREBOG) {
      for (const layer of streetLook(key).layers) {
        for (const item of layer.items || []) {
          if (item.hang || /^(clouds|treetop_)/.test(item.s)) continue;
          // far silhouettes may stand up to 50 px up the horizon's hills; nothing stands in mid air
          assert.ok(item.y >= 586 - 90, `${key} ${item.s}: its foot at y ${item.y}`);
        }
      }
    }
  });

  it('the Firebog yard that shares its street\'s look (Easy Ash) stands on its ground too', () => {
    const look = yardLook('firebog_int_4__high');
    assert.equal(look, streetLook('firebog_4_high'));
    const width = HOME_LIMITS.START_BACKYARD_SEGMENTS * 150;
    const spots = landscapeNearSpots(look, 'yard:firebog_int_4__high', width + 1400, (x) => x > width - 90, { lot: { left: width, right: null } });
    const big = spots.filter((s) => s.back != null && BIG.test(s.row.s));
    assert.ok(big.length >= 3, `${big.length} big pieces in the yard`);
    assert.ok(big.every((s) => s.x < width), 'all left of the house');
  });
});

describe('pieces in the field are laid out from the house lot (landscapeNearSpots)', () => {
  it('they come back to front, then the front fringe in the recipe\'s order', () => {
    for (const key of FIREBOG) {
      const { spots } = spotsOn(streetLook(key), key, {});
      const firstFringe = spots.findIndex((s) => s.back == null);
      assert.ok(firstFringe > 0);
      assert.ok(spots.slice(firstFringe).every((s) => s.back == null), `${key}: the fringe is drawn last`);
      for (let i = 1; i < firstFringe; i += 1) assert.ok(spots[i].back <= spots[i - 1].back, `${key}: ${spots[i].row.s} behind ${spots[i - 1].row.s}`);
    }
  });

  it('a side row keeps to its side of the house, and nothing stands behind the house itself', () => {
    for (const key of FIREBOG) {
      for (const state of [{}, { yardLeft: maxLeft, yardRight: maxRight }]) {
        const { layout, spots } = spotsOn(streetLook(key), key, state);
        for (const s of spots.filter((spot) => spot.back != null)) {
          if (s.item.side === 'left') assert.ok(s.x <= layout.lotLeft + 40, `${key} ${s.row.s} at ${Math.round(s.x)}`);
          if (s.item.side === 'right') assert.ok(s.x >= layout.lotRight - 40, `${key} ${s.row.s} at ${Math.round(s.x)}`);
          assert.ok(s.x <= layout.lotLeft + 40 || s.x >= layout.lotRight - 40, `${key} ${s.row.s} at ${Math.round(s.x)} behind the house`);
        }
      }
    }
  });

  it('what stands by the house stays where it is when the yard grows', () => {
    for (const key of FIREBOG) {
      const look = streetLook(key);
      const small = spotsOn(look, key, {});
      const grown = spotsOn(look, key, { yardLeft: 4, yardRight: 2 });
      const byLot = ({ layout, spots }, reach) => spots
        .filter((s) => s.back != null && !s.item.jitter)
        .map((s) => (s.x < layout.lotLeft ? `L${Math.round(layout.lotLeft - s.x)}` : `R${Math.round(s.x - layout.lotRight)}`) + `:${s.row.s}:${s.back}`)
        .filter((tag) => Number(tag.slice(1).split(':')[0]) < reach)
        .sort();
      // everything within the first yard's 400 px on each side is the same on the grown street
      const before = byLot(small, 400);
      const after = byLot(grown, 400);
      assert.ok(before.length >= 6, `${key}: ${before.length} fixed pieces by the house`);
      assert.deepEqual(after, before, key);
      assert.ok(grown.spots.length > small.spots.length, `${key}: new ground brings new pieces`);
    }
  });

  it('a trunk, its treetop and its shadow are skipped together (a Tower\'s doorway)', () => {
    let skipped = 0;
    for (const key of FIREBOG) {
      const look = streetLook(key);
      const { layout, spots: all } = spotsOn(look, key, {});
      const parts = (spots) => {
        const count = new Map();
        for (const s of spots) if (s.part) count.set(s.part, (count.get(s.part) || 0) + 1);
        return count;
      };
      const whole = parts(all);
      for (let towerX = layout.lotRight + 200; towerX < layout.width - 200; towerX += 53) {
        const { spots } = spotsOn(look, key, {}, { towerX });
        const door = towerDoorway(towerX);
        for (const s of spots) assert.ok(!(s.x + s.half > door.x1 && s.x - s.half < door.x2), `${key} ${s.row.s} over the Tower door at ${towerX}`);
        for (const [part, n] of parts(spots)) assert.equal(n, whole.get(part), `${key}: ${part} is whole with a Tower at ${towerX}`);
        if (parts(spots).size < whole.size) skipped += 1;
      }
    }
    assert.ok(skipped > 20, `a Tower stood over a group ${skipped} times`);
  });

  it('a look with nothing in the field is laid out as it always was, lot or no lot', () => {
    let checked = 0;
    for (const row of EXTERIOR_STYLES.filter((style) => style.built && !FIREBOG.includes(style.key))) {
      const look = streetLook(row.key);
      if (look.near.some((item) => Number.isFinite(item.inField))) continue;
      const layout = homeStreetLayout(createCultivationState({}));
      const plain = landscapeNearSpots(look, look.seed || row.key, layout.width, streetNearSkip(layout));
      const lot = landscapeNearSpots(look, look.seed || row.key, layout.width, streetNearSkip(layout), { lot: lotOf(layout) });
      assert.deepEqual(lot.map((s) => [s.row.s, s.x, s.flip]), plain.map((s) => [s.row.s, s.x, s.flip]), row.key);
      assert.ok(plain.every((s) => s.back == null));
      checked += 1;
    }
    assert.ok(checked >= 25, `checked ${checked} other styles`);
  });

  it('is drawn behind the house and the street\'s own things, from the lot the street and the yard name', () => {
    const src = read('features/homes-feature.js');
    assert.match(src, /for \(const spot of landscapeNearSpots\(style, seed, width, skipNear, \{ lot \}\)\) \{[\s\S]{0,260}near\.addChild\(decoSprite\(PIXI, row, spot\.x, nearFeetY\(spot\.item, groundY, depth\), spot\.flip\)\);/);
    assert.match(src, /near\.zIndex = -30;/);
    assert.match(src, /house\.zIndex = -20;/);
    assert.match(src, /lot: \{ left: layout\.lotLeft, right: layout\.lotRight \},/);
    assert.match(src, /lot: \{ left: x0, right: null \},/);
  });
});
