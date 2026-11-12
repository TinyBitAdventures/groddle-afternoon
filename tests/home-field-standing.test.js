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
 * it stays put when the yard grows. The six Firebog exterior styles are laid out this way, and so
 * are the five Firebog back yards with a look of their own (Arid Boglands, Glaring Muddle,
 * Faithful Fen, Unkempt Crypt, Perfus Preference), each from its own snap.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { HOME_LIMITS } from '../public/js/homes-catalog.js?v=10ac34b6';
import { createCultivationState, homeStreetLayout } from '../public/js/home-cultivation.js?v=f1242621';
import { EXTERIOR_STYLES, INTERIOR_STYLES, streetLook, yardLook } from '../public/js/home-styles.js?v=13fe0aaa';
import {
  FIELD_DEPTH,
  fieldDepth,
  landscapeNearSpots,
  nearFeetY,
  streetNearSkip,
  towerDoorway,
} from '../public/js/features/homes-feature.js?v=4889ae38';

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

/**
 * G616 follow-up: the five Firebog back yards drawn from their own snaps (reference only). Each
 * first stood its giant walkers on a backdrop layer at the field's back edge; they stand in the
 * field now, among the ledges, baskets, stones and grass its snap shows.
 */
const YARDS = {
  firebog_1_hor_high: { label: 'Arid Boglands', street: 'firebog_1_high', shows: ['sprout', 'bottletree_face1', 'bottletree_burb_wndw_2'], fringe: ['grass_solid', 'sprout'] },
  firebog_int_1b__high: { label: 'Glaring Muddle', street: 'firebog_1b_high', shows: ['legs_moss_2', 'sprout', 'bottletree_face1'], fringe: ['grass_solid', 'sprout', 'underground_plant_1'] },
  firebog_int_2__high: { label: 'Faithful Fen', street: 'firebog_2_high', shows: ['background_bottletree_hut', 'firebean_1', 'stone_moss_group_3'], fringe: ['grass_solid', 'firebean_2', 'flower_bush_7'] },
  firebog_int_3_hor_high: { label: 'Unkempt Crypt', street: 'firebog_3_high', shows: ['legs_moss_2', 'bottletree_body5_face', 'sprout'], fringe: ['grass_solid', 'underground_plant_1', 'mushrooms'] },
  firebog_int_4_hor_high: { label: 'Perfus Preference', street: 'firebog_4a_high', shows: ['background_bottletree_barred', 'bottletree_body5_face', 'mushrooms'], fringe: ['grass_solid', 'mushroom_amanita_1', 'firebean_2'] },
};
/** A back yard of `segments` 150 px segments: the house's left end is its right edge (homes-feature interiorBackground). */
const yardSpots = (key, segments = HOME_LIMITS.START_BACKYARD_SEGMENTS) => {
  const x0 = segments * 150;
  const look = yardLook(key);
  return { x0, look, spots: landscapeNearSpots(look, `yard:${key}`, x0 + 1400, (x) => x > x0 - 90, { lot: { left: x0, right: null } }) };
};
/** A trunk: a bottletree body, a whole small bottletree, or a bent root trunk. */
const TRUNK = /^bottletree_(body|burb_wndw|city_wndw)|^background_bottletree_(hut|face|barred)$|^legs_moss_\d$/;

describe('the five Firebog back yards with a look of their own stand on their ground (G616 follow-up)', () => {
  it('each is still its own look, by its own name, and the Firebog ground under its own light', () => {
    for (const [key, want] of Object.entries(YARDS)) {
      const row = INTERIOR_STYLES.find((style) => style.key === key);
      assert.equal(row.label, want.label);
      assert.equal(row.lookOf, want.street, `${want.label}: its street`);
      const look = yardLook(key);
      assert.equal(look, row.look, `${want.label}: its own composition`);
      assert.notDeepEqual(look, streetLook(want.street), `${want.label}: not its street's layout`);
      assert.equal(look.field, lit(GROUND, look.nearTint ?? 0xffffff), `${want.label}: the ground decos sit in it without a seam`);
      const rim = look.layers.at(-1);
      assert.equal(rim.f, 1, `${want.label}: the rim moves with the ground`);
      assert.equal(rim.tint, look.nearTint, `${want.label}: lit like the ground`);
      for (const item of rim.items) {
        assert.match(item.s, /^ground_generic_\d_spotless$/);
        const over = 586 - (item.y - item.h * item.scale);
        assert.ok(item.y > 586 + 20 && over > 12 && over < 60, `${want.label} ${item.s}: ${Math.round(over)} px over the edge`);
      }
    }
  });

  it('the first yard a new house has (5 segments) already shows a giant, another trunk, a ledge or a basket, and grass', () => {
    for (const [key, want] of Object.entries(YARDS)) {
      const { x0, look, spots } = yardSpots(key);
      const inField = spots.filter((s) => s.back != null);
      assert.ok(inField.every((s) => s.x <= x0 - 90), `${want.label}: all left of the way into the house`);
      const seen = inField.filter((s) => s.x + s.half > 0);
      const trunks = seen.filter((s) => TRUNK.test(s.row.s));
      assert.ok(trunks.length >= 2, `${want.label}: ${trunks.length} trunks`);
      // a giant: a trunk at least twice the avatar's 115 px, or one up on its root legs
      assert.ok(trunks.some((s) => s.row.h * s.row.scale + (s.item.on || 0) >= 230), `${want.label}: a giant`);
      assert.ok(seen.some((s) => /^legs_(front|back)_set/.test(s.row.s)), `${want.label}: root legs in the ground`);
      assert.ok(seen.some((s) => /^front_ground_|^sprout$|^ground_rootpipe/.test(s.row.s)), `${want.label}: a ledge or a basket`);
      assert.ok(seen.filter((s) => /^grass_solid/.test(s.row.s)).length >= 4, `${want.label}: grass through the field`);
      assert.ok(seen.filter((s) => s.row.s === 'shadow').length >= 2, `${want.label}: the giant and the baskets on their shadows`);
      for (const piece of want.shows) assert.ok(look.near.some((row) => row.s === piece && Number.isFinite(row.inField)), `${want.label}: ${piece} from its snap`);
    }
  });

  it('every piece in a yard\'s field has its feet inside it, and a raised piece belongs to something on the ground', () => {
    let checked = 0;
    for (const [key, want] of Object.entries(YARDS)) {
      const look = yardLook(key);
      const depth = fieldDepth(look);
      const rows = look.near.filter((row) => Number.isFinite(row.inField));
      for (const row of rows) {
        checked += 1;
        assert.ok(row.inField >= 0 && row.inField <= depth, `${want.label} ${row.s}: inField ${row.inField} within the ${depth} px field`);
        assert.ok(row.every > 0, `${want.label} ${row.s}: comes again on a long yard`);
        assert.notEqual(row.side, 'right', `${want.label} ${row.s}: a back yard has only a left`);
        const feet = nearFeetY(row, 680, depth);
        if (row.on > 0) {
          const others = rows.filter((other) => other.group === row.group && other !== row && other.s !== 'shadow');
          assert.ok(row.group && others.some((other) => !(other.on > 0)), `${want.label} ${row.s}: raised ${row.on} px with nothing on the ground under it`);
          const tallest = Math.max(...others.map((other) => other.inField + (other.on || 0) + other.h * other.scale));
          assert.ok(row.inField + row.on <= tallest + 8, `${want.label} ${row.s}: raised ${row.on} px, above its ${row.group}`);
        } else {
          assert.ok(feet >= 680 - depth && feet <= 680 + 22, `${want.label} ${row.s}: feet at ${feet}`);
        }
      }
    }
    assert.ok(checked > 150, `checked ${checked} rows`);
  });

  it('no backdrop layer carries a near giant any more, and the far layers stay on the horizon', () => {
    for (const [key, want] of Object.entries(YARDS)) {
      const look = yardLook(key);
      for (const layer of look.layers) {
        for (const item of layer.items || []) {
          if (item.hang || /^(clouds|treetop_)/.test(item.s)) continue;
          assert.ok(item.y >= 586 - 90, `${want.label} ${item.s}: its foot at y ${item.y}`);
          if (layer.f === 1) continue;
          // What is left on the backdrop is far off: it slides at under half the ground's pace, stands at
          // the field's back edge (behind the rim) and is small. The giants that slid at 0.45 to 0.55 are gone.
          assert.ok(layer.f < 0.45, `${want.label} ${item.s}: on the f ${layer.f} layer`);
          assert.ok(item.y <= 586 + 8, `${want.label} ${item.s}: stands in the field's band at y ${item.y}, on a layer that slides`);
          if (/^(bottletree_body|legs_)/.test(item.s)) assert.ok(item.scale <= 0.22, `${want.label} ${item.s}: far, so small (${item.scale})`);
        }
      }
    }
  });

  it('the front grass and plants of each yard are the rows they were', () => {
    for (const [key, want] of Object.entries(YARDS)) {
      const fringe = yardLook(key).near.filter((row) => !Number.isFinite(row.inField));
      assert.deepEqual(fringe.map((row) => row.s), want.fringe, want.label);
      for (const row of fringe) assert.ok(row.every > 0 && row.jitter > 0 && row.group == null && row.side == null, `${want.label} ${row.s}`);
    }
  });

  it('they are drawn back to front, then the front fringe, and what stands by the house stays when the yard grows', () => {
    const max = HOME_LIMITS.MAX_BACKYARD_SEGMENTS;
    for (const [key, want] of Object.entries(YARDS)) {
      const small = yardSpots(key);
      const grown = yardSpots(key, max);
      for (const { spots } of [small, grown]) {
        const firstFringe = spots.findIndex((s) => s.back == null);
        assert.ok(firstFringe > 0);
        assert.ok(spots.slice(firstFringe).every((s) => s.back == null), `${want.label}: the fringe is drawn last`);
        for (let i = 1; i < firstFringe; i += 1) assert.ok(spots[i].back <= spots[i - 1].back, `${want.label}: ${spots[i].row.s} behind ${spots[i - 1].row.s}`);
      }
      // everything standing within the first yard's width of the house is the same on the full yard
      const byHouse = ({ x0, spots }) => spots
        .filter((s) => s.back != null && !s.item.jitter && x0 - s.x < 600)
        .map((s) => `${Math.round(x0 - s.x)}:${s.row.s}:${s.back}:${s.flip}`)
        .sort();
      assert.ok(byHouse(small).length >= 10, `${want.label}: ${byHouse(small).length} fixed pieces by the house`);
      assert.deepEqual(byHouse(grown), byHouse(small), want.label);
      // and the full 20-segment yard holds the composition twice over, whole groups only
      const trunks = (list) => list.spots.filter((s) => TRUNK.test(s.row.s) && s.back != null).length;
      assert.ok(trunks(grown) >= trunks(small) + 4, `${want.label}: ${trunks(grown)} trunks on the full yard`);
    }
  });

  it('every other yard with a look of its own is laid out as it always was (nothing of theirs stands in the field)', () => {
    let checked = 0;
    for (const row of INTERIOR_STYLES.filter((style) => style.look && !YARDS[style.key])) {
      assert.ok(row.look.near.every((item) => !Number.isFinite(item.inField) && item.group == null), row.label);
      assert.ok(row.look.layers.every((layer) => layer.f !== 1), `${row.label}: no rim`);
      checked += 1;
    }
    assert.ok(checked >= 18, `checked ${checked} other yards`);
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
    assert.match(src, /for \(const spot of landscapeNearSpots\(style, seed, width, skipNear, \{ lot, move: moveNear \}\)\) \{[\s\S]{0,260}near\.addChild\(artist\.sprite\(PIXI, row, spot\.x, nearFeetY\(spot\.item, groundY, depth\), spot\.flip\)\);/);
    assert.match(src, /near\.zIndex = -30;/);
    assert.match(src, /house\.zIndex = -20;/);
    assert.match(src, /lot: \{ left: layout\.lotLeft, right: layout\.lotRight \},/);
    assert.match(src, /lot: \{ left: x0, right: null \},/);
  });
});
