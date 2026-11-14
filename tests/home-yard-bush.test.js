/**
 * YARDBUSH (Austin 2026-11-11: "the bushes look like they should either go in front of the garden
 * or be moved to the left/right of the garden"). A Crop Garden on his home street had the street's
 * flowering bushes poking out at both ends and from behind its middle.
 *
 * Glitch: a cultivation was an itemstack put down where the player chose
 * (locations/inc_cultivation.js cultivation_purchase 113-160, the decos untouched); placement kept
 * clear of other cultivations and signposts only (ContiguousPlatformLineSet.as calculateRanges
 * 73-133); every middleground deco lay in the bitmap under the item holders
 * (MiddleGroundRenderer.as setupEndShapes 111-171), and the yard's front row of bushes stood well
 * below where items stand (2012 housing demo, JPJgjWNX1vE 1:06-1:20). The remake's front fringe
 * stands in front of the walk line but draws behind the cultivations, so a piece over one's art
 * steps aside, just outside it on its nearer side (homes-feature fringeMover), and is only not
 * drawn when there is no clear spot near; what stands in the field stays behind.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { HOME_LIMITS } from '../public/js/homes-catalog.js?v=10ac34b6';
import {
  createBackYardState,
  createCultivationState,
  cultivate,
  cultivationSpans,
  footprint,
  homeStreetLayout,
  listCultivationClasses,
  nearestFreeRx,
  placementCheck,
} from '../public/js/home-cultivation.js?v=a3135ffd';
import { EXTERIOR_STYLES, INTERIOR_STYLES, streetLook, yardLook } from '../public/js/home-styles.js?v=13fe0aaa';
import {
  FRINGE_CORE,
  FRINGE_GAP,
  FRINGE_REACH,
  HOUSE_STYLE_KEYS,
  cultivationArtHalf,
  fringeMover,
  homeFringeMovers,
  houseFront,
  landscapeNearSpots,
  streetNearSkip,
  streetTrimSpots,
} from '../public/js/features/homes-feature.js?v=349dd21e';

const read = (rel) => readFileSync(join(import.meta.dirname, '..', 'public', 'js', rel), 'utf8');
const RICH = { level: 60, imagination: 1e9 };
const lotOf = (layout) => ({ left: layout.lotLeft, right: layout.lotRight });
const at = (s) => `${s.row.s}@${s.x.toFixed(3)}`;
/** The middle of a fringe sprite over a span (what may not be). */
const coreOver = (x, half, span) => x + half * FRINGE_CORE > span.x1 && x - half * FRINGE_CORE < span.x2;
/** The whole sprite, with the gap, clear of a span. */
const clearOf = (x, half, span) => x + half + FRINGE_GAP <= span.x1 || x - half - FRINGE_GAP >= span.x2;
const near = (a, b) => Math.abs(a - b) < 1e-6;

/** A yard with `rows` ([protoClass, rx]) cultivated there if it fits (or `nearest`: the nearest spot that does). */
function yard(rows, seed = {}, { nearest = false, state = null } = {}) {
  const st = state || createCultivationState(seed);
  for (const [protoClass, want] of rows) {
    const rx = nearest ? nearestFreeRx(st, protoClass, want) : want;
    if (rx != null && placementCheck(st, protoClass, rx).ok) cultivate(st, RICH, protoClass, rx, { now: 0, rng: () => 0 });
  }
  return st;
}

function streetSpots(styleKey, st, { moved = true } = {}) {
  const look = streetLook(styleKey);
  const layout = homeStreetLayout(st);
  return landscapeNearSpots(look, look.seed || styleKey, layout.width, streetNearSkip(layout), {
    lot: lotOf(layout),
    move: moved ? homeFringeMovers(st).near : null,
  });
}

describe('the yard\'s front fringe steps aside from what a player cultivated (YARDBUSH)', () => {
  it('Austin\'s view: the bushes at a Crop Garden\'s ends move just outside it, the rest stay', () => {
    // Forgotten Growth's flowering bushes stand at rx 566 and 882 (both ends of a garden at 720).
    const st = yard([['proto_crop_garden_medium', 720]], { yardRight: 2 });
    assert.equal(st.items.length, 1);
    const layout = homeStreetLayout(st);
    const [span] = homeFringeMovers(st).spans;
    const half = footprint('proto_crop_garden_medium');
    assert.deepEqual([span.x1, span.x2], [layout.houseX + 720 - half, layout.houseX + 720 + half], 'a garden\'s art is its bed');
    const bare = streetSpots('_ruin_high', st, { moved: false });
    const now = streetSpots('_ruin_high', st);
    assert.equal(now.length, bare.length, 'nothing is lost');
    const bushes = (spots) => spots.filter((s) => s.row.s === 'flower_bush_3' && s.x > span.x1 - 300 && s.x < span.x2 + 300).map((s) => s.x).sort((a, b) => a - b);
    const [b1, b2] = bushes(bare);
    assert.ok(coreOver(b1, 101, span) && coreOver(b2, 101, span), 'both stood over the bed');
    const [a1, a2] = bushes(now);
    const bh = now.find((s) => s.row.s === 'flower_bush_3').half;
    assert.ok(near(a1, span.x1 - FRINGE_GAP - bh), `the left one beside the left end (${a1})`);
    assert.ok(near(a2, span.x2 + FRINGE_GAP + bh), `the right one beside the right end (${a2})`);
    // Every other piece is where it was.
    for (const s of bare) {
      if (s.back == null && coreOver(s.x, s.half, span)) continue;
      assert.ok(now.some((t) => t.row.s === s.row.s && near(t.x, s.x)), `${at(s)} stays`);
    }
  });

  it('every street style, every kind and size of cultivation, anywhere: no fringe over it, moved ones clear and near', () => {
    let checked = 0;
    let moved = 0;
    let hidden = 0;
    const maxRight = HOME_LIMITS.MAX_FRONTYARD_RIGHT_SEGMENTS - HOME_LIMITS.START_FRONTYARD_RIGHT_SEGMENTS;
    const seed = { yardLeft: 4, yardRight: maxRight };
    for (const row of EXTERIOR_STYLES.filter((r) => r.built)) {
      const bare = streetSpots(row.key, createCultivationState(seed), { moved: false });
      for (const def of listCultivationClasses()) {
        for (let rx = -1300; rx <= 3300; rx += 211) {
          const st = yard([[def.protoClass, rx]], seed);
          if (!st.items.length) continue;
          const layout = homeStreetLayout(st);
          const { spans } = homeFringeMovers(st);
          const [span] = spans;
          const now = streetSpots(row.key, st);
          const field = (list) => list.filter((s) => s.back != null).map(at).join('|');
          assert.equal(field(now), field(bare), `${row.key}: the field is untouched by ${def.protoClass}`);
          for (const s of now) {
            checked += 1;
            if (s.back == null) assert.ok(!coreOver(s.x, s.half, span), `${row.key} ${s.row.s} at ${Math.round(s.x)} over ${def.protoClass} at ${rx}`);
          }
          const fringeNow = now.filter((s) => s.back == null);
          for (const s of bare.filter((b) => b.back == null)) {
            if (now.some((t) => t.row.s === s.row.s && near(t.x, s.x))) continue;
            assert.ok(coreOver(s.x, s.half, span), `${row.key} ${at(s)} changed though not over ${def.protoClass}`);
            const left = span.x1 - FRINGE_GAP - s.half;
            const right = span.x2 + FRINGE_GAP + s.half;
            // Only a side within reach is its own (a farther one would be another piece's spot).
            const sides = [left, right].filter((x) => Math.abs(x - s.x) <= FRINGE_REACH);
            const there = fringeNow.find((t) => t.row.s === s.row.s && sides.some((x) => near(t.x, x)));
            if (there) {
              moved += 1;
              assert.ok(clearOf(there.x, s.half, span), 'clear of the art, with the gap');
              assert.ok(there.x - s.half >= 0 && there.x + s.half <= layout.width, 'on the street');
              assert.ok(!(there.x > layout.lotLeft + 40 && there.x < layout.lotRight - 40), 'not onto the house lot');
            } else hidden += 1;
          }
        }
      }
    }
    assert.ok(checked > 20000, `swept ${checked} sprites`);
    assert.ok(moved > 10 * hidden, `mostly moved (${moved} moved, ${hidden} not drawn)`);
  });

  it('a yard of many cultivations: each piece stays, moves beside one, or has no clear spot near; the same every time', () => {
    const plan = [
      ['proto_crop_garden_small', -560], ['proto_herb_garden_medium', 520], ['proto_patch', 900],
      ['proto_crop_garden_large', 1300], ['proto_metal_rock', 1700], ['proto_peat', 1950],
      ['proto_firefly_hive', 2200], ['proto_furniture_tower_chassis', 2550],
    ];
    const st = yard(plan, { yardLeft: 2, yardRight: 6 }, { nearest: true });
    assert.equal(st.items.length, plan.length);
    const { spans } = homeFringeMovers(st);
    const layout = homeStreetLayout(st);
    for (const key of ['basic', '_ruin_high', 'meadow_ext_default_high']) {
      const bare = streetSpots(key, st, { moved: false }).filter((s) => s.back == null);
      const now = streetSpots(key, st).filter((s) => s.back == null);
      for (const s of now) for (const span of spans) assert.ok(!coreOver(s.x, s.half, span), `${key} ${at(s)} over a cultivation`);
      for (const s of bare) {
        if (!spans.some((span) => coreOver(s.x, s.half, span))) {
          assert.ok(now.some((t) => t.row.s === s.row.s && near(t.x, s.x)), `${key} ${at(s)} stays`);
          continue;
        }
        if (now.some((t) => t.row.s === s.row.s && near(t.x, s.x))) assert.fail(`${key} ${at(s)} still over a cultivation`);
      }
    }
    // A visitor draws the owner's saved yard: a copy through the save gives the same street.
    const copy = createCultivationState(JSON.parse(JSON.stringify(st)));
    assert.deepEqual(streetSpots('basic', copy).map(at), streetSpots('basic', st).map(at));
    assert.ok(layout.width > 0);
  });

  it('the mover: an edge brushing an end stays, the middle goes to the nearer side, else the other, else nowhere', () => {
    const span = { x1: 1000, x2: 1320 };
    const move = fringeMover([span], { minX: 0, maxX: 3000 });
    const half = 100;
    assert.equal(move(span.x1 - half * FRINGE_CORE - 1, half), span.x1 - half * FRINGE_CORE - 1, 'its edge over the end: stays');
    assert.equal(move(1100, half), span.x1 - FRINGE_GAP - half, 'left of the middle: just left of the bed');
    assert.equal(move(1250, half), span.x2 + FRINGE_GAP + half, 'right of the middle: just right of it');
    assert.equal(move(1100, half, { inField: 40 }), 1100, 'standing in the field: stays behind it');
    assert.equal(move(1100, half, { group: 'tree' }), null, 'a group is never pulled apart');
    // A narrow gap on the near side (another cultivation): the far side.
    const tight = fringeMover([span, { x1: 700, x2: 950 }], { minX: 0, maxX: 3000 });
    assert.equal(tight(1150, half), span.x2 + FRINGE_GAP + half);
    // Both sides shut (a fixture right, a cultivation left), or past the reach: not drawn.
    const shut = fringeMover([span, { x1: 700, x2: 950 }], { minX: 0, maxX: 3000, blocked: (x) => x > 1320 && x < 1600 });
    assert.equal(shut(1150, half), null);
    const wide = { x1: 1000, x2: 1700 };
    assert.equal(fringeMover([wide], { minX: 0, maxX: 3000 })(1350, half), null, 'the middle of a very wide bed is too far from either end');
    // Off the street's end.
    assert.equal(fringeMover([{ x1: 40, x2: 300 }], { minX: 0, maxX: 3000 })(150, half), 300 + FRINGE_GAP + half);
  });

  it('the overlap test uses the drawn art, so a Patch or a rock clears less than its spacing footprint', () => {
    for (const def of listCultivationClasses()) {
      const half = cultivationArtHalf({ protoClass: def.protoClass, endClass: def.endItems[0] });
      assert.ok(half > 20 && half < 250, `${def.protoClass}: ${half}`);
      if (def.kind === 'garden') assert.equal(half, footprint(def.protoClass), 'a garden\'s footprint is its bed');
    }
    assert.ok(cultivationArtHalf({ protoClass: 'proto_patch', endClass: 'patch' }) < footprint('proto_patch'));
    assert.ok(cultivationArtHalf({ protoClass: 'proto_metal_rock', endClass: 'rock_metal_1' }) < footprint('proto_metal_rock'));
    assert.ok(cultivationArtHalf({ protoClass: 'proto_metal_rock', depleted: true }) > 0, 'a worn-out proto has its proto art');
    const st = yard([['proto_patch', 900]], { yardRight: 2 });
    const [art] = homeFringeMovers(st).spans;
    const [foot] = cultivationSpans(st);
    assert.ok(art.x1 > foot.x1 && art.x2 < foot.x2);
  });

  it('the planted border by the house steps aside too, never onto the house front', () => {
    let changed = 0;
    for (const row of EXTERIOR_STYLES.filter((r) => r.built)) {
      const look = streetLook(row.key);
      for (const house of HOUSE_STYLE_KEYS) {
        const layout = homeStreetLayout(createCultivationState({}));
        const trim = streetTrimSpots(look, layout, house);
        if (!trim.length) continue;
        const st = yard([['proto_crop_garden_medium', Math.round(trim[0].x - layout.houseX) - footprint('proto_crop_garden_medium')]], {}, { nearest: true });
        if (!st.items.length) continue;
        const movers = homeFringeMovers(st, { houseStyle: house });
        const after = streetTrimSpots(look, layout, house, { move: movers.trim });
        const front = houseFront(layout, house);
        for (const s of after) {
          for (const span of movers.spans) assert.ok(!coreOver(s.x, s.half, span), `${row.key} ${house} ${s.meta.s} over the garden`);
          if (!trim.some((t) => near(t.x, s.x))) assert.ok(!coreOver(s.x, s.half, front), `${row.key} ${house} ${s.meta.s} moved onto the house`);
        }
        if (after.length !== trim.length || after.some((s, i) => !near(s.x, trim[i]?.x))) changed += 1;
      }
    }
    assert.ok(changed > 0, 'some border stood over a garden');
  });

  it('the back yard\'s fringe steps aside from its cultivations the same way', () => {
    const st = yard([['proto_herb_garden_small', -260], ['proto_patch', -560], ['proto_crop_garden_large', -900]], {}, { nearest: true, state: createBackYardState({ yardLeft: 3 }) });
    assert.equal(st.items.length, 3);
    const x0 = homeStreetLayout(st).houseX;
    const spans = cultivationSpans(st, cultivationArtHalf);
    for (const span of spans) assert.ok(span.x2 <= x0, 'every span is left of the house');
    const move = fringeMover(spans, { minX: 0, maxX: x0, blocked: (x) => x > x0 - 90 });
    let total = 0;
    for (const row of INTERIOR_STYLES.filter((r) => r.built)) {
      const look = yardLook(row.key);
      const spots = landscapeNearSpots(look, `yard:${row.key}`, x0 + 1400, (x) => x > x0 - 90, { lot: { left: x0, right: null }, move });
      for (const s of spots) if (s.back == null) for (const span of spans) assert.ok(!coreOver(s.x, s.half, span), `${row.key} ${s.row.s} at ${Math.round(s.x)}`);
      total += spots.length;
    }
    assert.ok(total > 50);
  });

  it('draws from those spots: the street, its border, the back yard, owner and visitor alike', () => {
    const src = read('features/homes-feature.js');
    // streetBackground runs under withOwnersHome for a visitor, so `cult` is the owner's yard.
    assert.match(src, /const movers = homeFringeMovers\(cult, \{ houseStyle \}\);/);
    assert.match(src, /moveNear: movers\.near,/);
    assert.match(src, /streetTrimSpots\(style, layout, houseStyle, \{ move: movers\.trim \}\)/);
    assert.match(src, /const moveNear = fringeMover\(cultivationSpans\(backCult, cultivationArtHalf\), \{ minX: 0, maxX: x0, blocked: \(x\) => x > x0 - 90 \}\);/);
    assert.match(src, /landscapeNearSpots\(style, seed, width, skipNear, \{ lot, move: moveNear \}\)/);
  });
});
