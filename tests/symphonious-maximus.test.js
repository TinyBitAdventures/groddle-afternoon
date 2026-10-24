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
import { assertStreetGeometry } from '../public/js/street-model.js';
import { arrivalInTarget } from '../public/js/location-navigation.js';
import { inEventBox, runLocationEvent, createEventRuntime } from '../public/js/location-events.js';
import {
  CEBARKUL_DOOR,
  CEBARKUL_TSID,
  CRATERS,
  GROUND_Y,
  ISLANDS,
  STARS,
  STAR_JINGLER,
  SYMPHONIOUS_ARRIVE,
  SYMPHONIOUS_TSID,
  glowAlpha,
  islandYAt,
  ladderGeometry,
  touchesStar,
} from '../public/js/symphonious-maximus.js';
import { symphoniousMaximusFeature, isSymphonious } from '../public/js/features/symphonious-maximus-feature.js';
import { FEATURES } from '../public/js/features/index.js';

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
});
