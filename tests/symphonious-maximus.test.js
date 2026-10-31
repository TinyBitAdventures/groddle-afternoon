/**
 * Symphonious Maximus, rebuilt behind Cebarkul's wooden door
 * (js/symphonious-maximus.js, tools/build-symphonious-maximus.mjs,
 * features/symphonious-maximus-feature.js). Register row G90.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertStreetGeometry } from '../public/js/street-model.js?v=23b926e5';
import { arrivalInTarget } from '../public/js/location-navigation.js?v=4be109b9';
import { inEventBox, runLocationEvent, createEventRuntime } from '../public/js/location-events.js?v=61e0c5d3';
import {
  CEBARKUL_DOOR,
  CEBARKUL_TSID,
  CRATERS,
  CRATER_BOUNCE,
  FLOOR_BOTTOM_Y,
  GLOW_ORBS,
  GROUND_Y,
  ORB_SHAPE,
  SOIL_CATERPILLARS,
  SOIL_NOTES,
  SOIL_NOTE_ART,
  SOIL_TOP_Y,
  ISLANDS,
  STARS,
  STAR_JINGLER,
  SYMPHONIOUS_ARRIVE,
  SYMPHONIOUS_TSID,
  glowAlpha,
  islandYAt,
  ladderGeometry,
  touchesStar,
} from '../public/js/symphonious-maximus.js?v=345ad437';
import { symphoniousMaximusFeature, isSymphonious } from '../public/js/features/symphonious-maximus-feature.js?v=91d8eb1c';
import { FEATURES } from '../public/js/features/index.js?v=0e4159cb';
import { parallaxLayerOffset } from '../public/js/street-render.js?v=262c3652';

const spike = join(dirname(fileURLToPath(import.meta.url)), '..');
const pub = join(spike, 'public');
const streets = join(pub, 'assets/streets');
const street = (tsid) => JSON.parse(readFileSync(join(streets, `${tsid}.json`), 'utf8'));
const gsjs = join(spike, '../glitch-GameServerJS');
const sym = street(SYMPHONIOUS_TSID);
const ceb = street(CEBARKUL_TSID);
const { l: L, t: T } = sym.bounds;

/** Walk-line y (world) of the highest platform under x within `below` of y, else null. */
function floorUnder(x, y) {
  let best = null;
  for (const p of sym.platforms) {
    if (x < p.x1 || x > p.x2) continue;
    const py = p.y1 + ((x - p.x1) / (p.x2 - p.x1)) * (p.y2 - p.y1);
    if (py >= y && (best === null || py < best)) best = py;
  }
  return best;
}

describe('Symphonious Maximus street', () => {
  it('is written, indexed and current (tools/build-symphonious-maximus.mjs --check)', () => {
    execFileSync(process.execPath, [join(spike, 'tools/build-symphonious-maximus.mjs'), '--check'], { stdio: 'pipe' });
    assertStreetGeometry(sym);
    assert.match(sym.source, /^reconstruction/);
    assert.equal(sym.reconstructed, true);
    const index = JSON.parse(readFileSync(join(streets, 'index.json'), 'utf8'));
    const row = index.streets[SYMPHONIOUS_TSID];
    assert.deepEqual([row.label, row.hubId, row.hubName, row.reconstructed], ['Symphonious Maximus', '51', 'Uralia', true]);
  });

  it('is the hidden Uralia street GSJS names', { skip: !existsSync(gsjs) && 'GSJS checkout not beside this worktree' }, () => {
    const maps = readFileSync(join(gsjs, 'inc_data_maps_prod.js'), 'utf8');
    const hub51 = maps.slice(maps.indexOf('"51"\t: {\n\t\t\t\t"LIF101NCNU112O2"'));
    assert.match(hub51.slice(0, 600), /"LUVR3SGQ6EF3400"\t: "Symphonious Maximus"/);
    const map51 = maps.slice(maps.indexOf('function maps_get_maps_51'), maps.indexOf('function maps_get_maps_52'));
    assert.ok(map51.length > 0 && !map51.includes('LUVR3SGQ6EF3400'), 'not drawn on the Uralia map');
  });

  it('opens Cebarkul\'s wooden door and lands on the floor at its connect point', () => {
    const door = ceb.doors.find((d) => d.id === CEBARKUL_DOOR);
    assert.equal(door.connect.street, SYMPHONIOUS_TSID);
    assert.deepEqual([door.connect.x, door.connect.y], [SYMPHONIOUS_ARRIVE.x, SYMPHONIOUS_ARRIVE.y]);
    const arrive = arrivalInTarget(sym, door.connect.x, door.connect.y);
    assert.equal(arrive.snapped, true);
    assert.deepEqual(door.connect.arrive, { x: arrive.x, y: arrive.y });
    assert.equal(arrive.y + T, GROUND_Y, 'the door drops you on the floor walk line');
    // Not straight into a crater bounce or a star.
    for (const box of sym.eventBoxes) assert.equal(inEventBox(box, arrive.x, arrive.y), false, box.id);
    for (const s of sym.starJinglers.stars) assert.equal(touchesStar(s, arrive.x, arrive.y), false, s.id);
  });

  it('signposts back to Cebarkul, in front of the door', () => {
    assert.equal(sym.signposts.length, 1);
    const [conn] = sym.signposts[0].connects;
    assert.equal(conn.tsid, `L${CEBARKUL_TSID.slice(1)}`);
    assert.equal(conn.label, 'Cebarkul');
    const door = ceb.doors.find((d) => d.id === CEBARKUL_DOOR);
    assert.equal(conn.arrive.x, door.x);
    const back = arrivalInTarget(ceb, door.x + ceb.bounds.l, door.y + ceb.bounds.t);
    assert.equal(back.snapped, true);
    assert.deepEqual(conn.arrive, { x: back.x, y: back.y });
    // The post stands on the last island.
    const last = ISLANDS[ISLANDS.length - 1];
    assert.ok(Math.abs(islandYAt(last, sym.signposts[0].x) - sym.signposts[0].y) <= 1);
  });

  it('has a ladder from the floor to the fourth island', () => {
    const lad = ladderGeometry();
    assert.deepEqual(sym.ladders, [{ id: lad.id, x: lad.x, y: lad.y, w: lad.w, h: lad.h }]);
    assert.equal(lad.y, GROUND_Y);
    const top = islandYAt(ISLANDS.find((i) => i.id === 'yellow_b'), lad.x);
    assert.ok(top !== null && Math.abs(lad.y - lad.h - top) <= 12, 'the ladder tops out at the island surface');
    assert.ok(lad.h > 900, 'a long climb (t0130-t0140)');
  });

  it('lets you hop the top row of islands left to right', () => {
    const ends = ISLANDS.map((isl) => {
      const plats = sym.platforms.filter((p) => p.id.startsWith(`plat_sym_${isl.id}_`));
      const first = plats[0];
      const last = plats[plats.length - 1];
      return { id: isl.id, x0: first.x1, y0: first.y1, x1: last.x2, y1: last.y2 };
    });
    for (let i = 0; i + 1 < ends.length; i += 1) {
      const a = ends[i];
      const b = ends[i + 1];
      assert.ok(b.x0 - a.x1 <= 140, `${a.id} -> ${b.id} gap ${b.x0 - a.x1}`);
      assert.ok(a.y1 - b.y0 <= 100, `${a.id} -> ${b.id} step up ${a.y1 - b.y0}`);
    }
  });

  it('bounces from the bottom of every crater (location event boxes)', () => {
    assert.equal(sym.eventBoxes.length, CRATERS.length);
    const rt = createEventRuntime();
    const fx = runLocationEvent(rt, sym.events, 'crater_bounce', { now: 0, target: true });
    assert.deepEqual(fx.map((f) => f.type), ['physics']);
    assert.ok(rt.physics.gravity.value < 0 && rt.physics.gravity.until > 0);
    for (const c of CRATERS) {
      const box = sym.eventBoxes.find((b) => b.id === `bounce_${c.id}`);
      const bottom = { x: c.x - L, y: GROUND_Y + 56 - T };
      assert.equal(inEventBox(box, bottom.x, bottom.y), true, `${c.id}: standing in the crater fires`);
      assert.equal(inEventBox(box, c.x - c.w / 2 - L - 30, GROUND_Y - T), false, `${c.id}: walking past the lip does not`);
      assert.equal(floorUnder(c.x, GROUND_Y + 1), GROUND_Y + 56, `${c.id}: the floor dips`);
    }
  });

  it('places 51 Star-Jinglers in reach (by jump from a platform, or a crater bounce)', () => {
    const stars = sym.starJinglers.stars;
    assert.equal(stars.length, STARS.length);
    assert.equal(stars.length, 51);
    assert.equal(new Set(stars.map((s) => s.id)).size, stars.length);
    for (const s of stars) {
      const wx = s.x + L;
      const wy = s.y + T;
      const floor = floorUnder(wx, wy);
      // Head reach: the 130 px avatar plus a plain jump's ~110 px apex, plus half a star.
      const byJump = floor !== null && floor - wy <= 262 && floor - wy >= 40;
      const byBounce = CRATERS.some((c) => Math.abs(wx - c.x) <= c.w / 2 + 200) && wy > GROUND_Y - 1100; // ~2 s in the air to steer
      assert.ok(byJump || byBounce, `${s.id} at ${wx},${wy}`);
    }
    for (let i = 0; i < stars.length; i += 1) {
      for (let j = i + 1; j < stars.length; j += 1) {
        assert.ok(Math.hypot(stars[i].x - stars[j].x, stars[i].y - stars[j].y) >= 60, `${stars[i].id} / ${stars[j].id}`);
      }
    }
  });

  it('uses only decos on disk, and the star art', () => {
    const manifest = new Set(JSON.parse(readFileSync(join(pub, 'assets/decos/manifest.json'), 'utf8')));
    for (const layer of sym.layers) {
      for (const d of layer.decos) assert.ok(manifest.has(d.sprite), `${layer.id}: ${d.sprite}`);
    }
    for (const url of [STAR_JINGLER.art, STAR_JINGLER.glowArt]) assert.ok(existsSync(join(pub, url)), url);
  });
});

describe('Star-Jinglers (items/toy_star_1.js)', () => {
  it('match the GSJS item', { skip: !existsSync(gsjs) && 'GSJS checkout not beside this worktree' }, () => {
    const src = readFileSync(join(gsjs, 'items/toy_star_1.js'), 'utf8');
    assert.match(src, /var label = "Star-Jingler-mid";/);
    assert.match(src, /announce_sound_to_all\("BIG_STAR_3", 1, false, true\);\s*this\.setAndBroadcastState\('glow'\);/);
    assert.match(src, /'position': \{"x":-23,"y":-47,"w":46,"h":42\}/);
    assert.equal(STAR_JINGLER.sound, 'BIG_STAR_3');
    assert.deepEqual([STAR_JINGLER.w, STAR_JINGLER.h], [46, 42]);
  });

  it('touch with the avatar\'s body and glow in a 29-frame cycle', () => {
    const s = { x: 500, y: 300 };
    assert.equal(touchesStar(s, 500, 300 + 21 + 100), true, 'head under the star');
    assert.equal(touchesStar(s, 500, 300 - 21), true, 'feet on its top');
    assert.equal(touchesStar(s, 500, 300 + 21 + 130), false, 'too low');
    assert.equal(touchesStar(s, 560, 330), false, 'beside it');
    assert.equal(STAR_JINGLER.glowMs, 1208);
    assert.equal(glowAlpha(0), 1);
    assert.ok(Math.abs(glowAlpha(604) - 0.5) < 0.01);
    assert.equal(glowAlpha(1208), 1, 'the cycle starts again');
  });

  it('feature: registered; empty ecology on this street only', () => {
    // index.js imports it with a ?v= query: a separate module instance, same id.
    assert.ok(FEATURES.some((f) => f.id === symphoniousMaximusFeature.id));
    assert.equal(isSymphonious('LUVR3SGQ6EF3400'), true);
    const eco = symphoniousMaximusFeature.ecologyOverride({ tsid: SYMPHONIOUS_TSID });
    assert.equal(eco.empty, true);
    assert.equal(symphoniousMaximusFeature.ecologyOverride({ tsid: CEBARKUL_TSID }), null);
  });

  it('G104: the peaks leave navy sky above them at the floor and sink out of view as you climb', () => {
    const W = sym.bounds.r - sym.bounds.l;
    const H = sym.bounds.b - sym.bounds.t;
    const VIEW_H = 408;
    const floorCamY = 1582; // camera y with the avatar on the floor (feet at screen 306)
    const floorEdge = 288; // the floor base's top edge on screen at floorCamY
    const view = (layer, camY) => {
      const at = parallaxLayerOffset(layer, 0, camY, 960, VIEW_H, W, H);
      return layer.decos.map((d) => ({ top: d.y - d.h + at.y - camY, feet: d.y + at.y - camY }));
    };
    for (const id of ['bg_peaks', 'bg_peaks_far']) {
      const layer = sym.layers.find((l) => l.id === id);
      assert.ok(layer.decos.length >= 8, id);
      const atFloor = view(layer, floorCamY);
      assert.ok(Math.min(...atFloor.map((p) => p.top)) >= 20, `${id}: sky shows above every peak at the floor`);
      assert.ok(Math.max(...atFloor.map((p) => p.top)) < floorEdge - 120, `${id}: peaks still rise well above the floor`);
      // While the floor's back edge is in view, the peaks' cut-off feet stay behind it.
      for (let up = 0; floorEdge + up < VIEW_H; up += 10) {
        for (const p of view(layer, floorCamY - up)) assert.ok(p.feet >= floorEdge + up, `${id}: feet hidden ${up} px up`);
      }
      // Standing on the island row (camera ~494) no peak is in view.
      assert.ok(view(layer, 494).every((p) => p.top > VIEW_H), `${id}: none behind the island row`);
    }
    assert.deepEqual(sym.gradient, { top: '163460', bottom: '215A76' });
  });

  it('G104 second pass: white haloed glow orbs from the Snaps, clear of the stars and islands', () => {
    // Snap 248953's big orb: disc ~16 Snap px, dark gap to ~19, pale ring to ~23.5.
    assert.ok(Math.abs(ORB_SHAPE.disc - 16 / 23.5) < 0.02 && Math.abs(ORB_SHAPE.gap - 19 / 23.5) < 0.02);
    assert.ok(GLOW_ORBS.length >= 12, 'orbs across the street');
    const radii = GLOW_ORBS.map((o) => o.r);
    assert.ok(Math.min(...radii) >= 18 && Math.max(...radii) <= 56, 'Snap ring diameters ~15-47 px at ~2.4 world px each');
    assert.ok(new Set(radii).size >= 8, 'several sizes');
    for (const o of GLOW_ORBS) {
      assert.ok(o.y < GROUND_Y - o.r - 150, 'in the sky, above the treetops and craters');
      for (const st of STARS) assert.ok(Math.hypot(st.x - o.x, st.y - o.y) > o.r + 40, `orb at ${o.x} clear of ${st.id}`);
    }
    // Islands: an orb never sits inside an island deco's box (it would be hidden behind it).
    const mid = sym.layers.find((l) => l.id === 'middleground');
    const islandBoxes = mid.decos.filter((d) => String(d.id || '').startsWith('island_'));
    assert.equal(islandBoxes.length, ISLANDS.length);
    for (const o of GLOW_ORBS) {
      for (const d of islandBoxes) {
        const inside = Math.abs(o.x - d.x) < d.w / 2 + o.r && o.y + o.r > d.y - d.h && o.y - o.r < d.y;
        assert.ok(!inside, `orb at ${o.x},${o.y} behind ${d.id}`);
      }
    }
    // Written into the street for the feature (screen space, same order).
    assert.equal(sym.glowOrbs.orbs.length, GLOW_ORBS.length);
    assert.deepEqual(sym.glowOrbs.orbs[0], { id: 'orb_1', x: GLOW_ORBS[0].x - L, y: GLOW_ORBS[0].y - T, r: GLOW_ORBS[0].r });
    assert.deepEqual(sym.glowOrbs.shape, { ...ORB_SHAPE });
  });

  it('G104 second pass: a purple soil band under the floor with a music note and striped caterpillars', () => {
    const order = sym.layers.map((l) => l.id);
    const soil = sym.layers.find((l) => l.id === 'T_sym_soil');
    assert.ok(soil, 'soil layer');
    assert.ok(order.indexOf('T_sym_floorbase') < order.indexOf('T_sym_soil') && order.indexOf('T_sym_soil') < order.indexOf('T_sym_floor'), 'between the floor base and the pale floor');
    assert.ok(sym.layers.find((l) => l.id === 'T_sym_floorbase').z < soil.z && soil.z < sym.layers.find((l) => l.id === 'T_sym_floor').z);
    // The floor surfaces end under the crater bowls, over the band's mint cap, inside the 408 px view
    // (the avatar's feet sit ~306 px down it, so ~100 px of floor and soil show below them).
    assert.ok(FLOOR_BOTTOM_Y > GROUND_Y + 76);
    assert.ok(FLOOR_BOTTOM_Y - GROUND_Y < 140, 'soil shows in the bottom of the view');
    assert.ok(SOIL_TOP_Y < FLOOR_BOTTOM_Y, 'the cap tucks under the floor');
    for (const d of sym.layers.find((l) => l.id === 'T_sym_floor').decos.filter((x) => /surface/.test(x.sprite))) {
      assert.equal(d.y, FLOOR_BOTTOM_Y - T);
    }
    // Seamless: ground_2 end to end (overlapping 6 px), mirrored every other piece, covering the street.
    const pieces = soil.decos.filter((d) => d.sprite === 'ground_2');
    pieces.forEach((d, i) => {
      assert.equal(Boolean(d.flip), i % 2 === 1);
      if (i) assert.equal(d.x - pieces[i - 1].x, d.w - 6);
    });
    assert.ok(pieces[0].x - pieces[0].w / 2 <= 0 && pieces.at(-1).x + pieces.at(-1).w / 2 >= sym.bounds.r - sym.bounds.l);
    const cats = soil.decos.filter((d) => d.sprite === 'ground_caterpillar');
    assert.equal(cats.length, SOIL_CATERPILLARS.length);
    for (const c of cats) assert.ok(c.y - c.h > FLOOR_BOTTOM_Y - T - 10, 'caterpillars in the soil, under the floor');
    // The note burrow: zutto1 ground_large_2's top, rendered by tools/symphonious-maximus-art.py --soil.
    assert.ok(existsSync(join(pub, SOIL_NOTE_ART.file)));
    assert.equal(sym.soilArt.length, SOIL_NOTES.length);
    for (const a of sym.soilArt) assert.equal(a.y, SOIL_TOP_Y + SOIL_NOTE_ART.dy - T);
    // Hooked vines under the islands.
    assert.ok(sym.layers.find((l) => l.id === 'middleground').decos.filter((d) => d.sprite === 'liana_2').length >= 2);
  });

  it('G104: the crater bounce stays the fungal recipe (no source for the craters themselves)', () => {
    // The street's location is lost, so the craters are inferred from the video; the only source recipe
    // is the fungal shroom gravity -7.5. The video's two bounces disagree (t0094 peaks ~290 video px,
    // ~680 world, over its crater; t0038 carries the camera past the star grid), so the hold is unchanged.
    assert.deepEqual({ ...CRATER_BOUNCE }, { param: 'gravity', value: -7.5, duration: 1400 });
  });
});

