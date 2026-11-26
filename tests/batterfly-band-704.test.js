/**
 * Report #704 (Level 3 East, GLI1D3B2U5715LL): many Batterflies flew below the walking platforms,
 * and their Guano ended up too low to reach.
 *
 * Glitch: npc_batterfly.js flyAround 1047-1051 flies a Batterfly in the 400 px over its floor,
 * floor = geo.b, or geo.ground_y when the location sets one (Level 3 East's: -520, the top of its
 * walking plats), and onInterval 1064-1072 drops Guano at its x, y, which falls to the first line
 * below (location.js 2072-2076).
 * Before: the remake measured the band from the floor under x only (street-creatures.js floorUnder:
 * the topmost line within 200 px of the lowest line), which on Level 3 East is the water line 300 to
 * 490 px under the plats, so most of the band was under them. The street data never carried
 * ground_y. Now street-ecology.json has each location's ground_y (build-street-ecology.mjs) and
 * flightFloor never lets the floor be lower than it (street-ecology.js flightGroundFor).
 */
import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { flierAt, flierPlan, flierSeed, flightFloor, flightFloorAt, flightFloorFor, floorUnder } from '../public/js/street-creatures.js?v=9e1c554e';
import { setCreatureEcology, streetObjectLayout } from '../tools/build-realtime-objects.mjs';
import { STREET_INDEX, applyStreetIndex, loadStreetDataFromFs, setZoneStreetsShown } from '../public/js/street-loader.js?v=10376267';
import * as ecologyModule from '../public/js/street-ecology.js?v=f1c11a2d';
import { platformsScreen, streetWidth, isItemSolid } from '../public/js/street-model.js?v=a9a05f9d';
import { stackRestY, landingY } from '../public/js/walk-surface.js?v=f21ce37b';

const { setStreetEcologyCatalog } = ecologyModule;
const root = join(import.meta.dirname, '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');
const L3E = 'GLI1D3B2U5715LL';
const WATER = 'pl1276112657130';
/** The Batterfly streets whose Guano fell under Glitch's band (the trace for #704). */
const SIX = ['Kosi Aracana', 'Nandak Intention', 'Level 3 East', 'Arjun Plunge', 'Malika Whim', 'Sarda Rapt'];

/** The location's ground_y in screen y, as the game takes it (null before the fix). */
const groundFor = (data) => (typeof ecologyModule.flightGroundFor === 'function' ? ecologyModule.flightGroundFor(data) : null);

/** Each Batterfly along its whole round, once a second: where it flies and where its Guano rests. */
function drops(data, layout) {
  const platforms = platformsScreen(data);
  const worldW = streetWidth(data);
  const floor = flightFloorFor(platforms, worldW, groundFor(data));
  const out = [];
  for (const [i, sx, sy] of layout.batterflies) {
    const home = { kind: 'batterfly', seed: flierSeed('batterfly', i, sx), worldW, floor, groundY: sy };
    const plan = flierPlan(home);
    for (let t = 0; t < plan.ms; t += 1000) {
      const p = flierAt(home, t);
      const restY = stackRestY(platforms, p.x, p.y);
      const line = platforms.find((q) => isItemSolid(q) && q.x1 <= p.x && p.x <= q.x2
        && Math.abs(q.y1 + ((p.x - q.x1) / ((q.x2 - q.x1) || 1)) * (q.y2 - q.y1) - restY) < 0.5);
      out.push({ x: p.x, y: p.y, restY, line: line?.id });
    }
  }
  return { platforms, out };
}

let ecology = null;
const streets = [];

before(async () => {
  setZoneStreetsShown(false);
  const index = JSON.parse(read('public/assets/streets/index.json'));
  applyStreetIndex(index);
  ecology = JSON.parse(read('public/assets/content/street-ecology.json'));
  setStreetEcologyCatalog(ecology);
  setCreatureEcology(ecology);
  for (const tsid of Object.keys(index.streets).sort()) {
    let data;
    try {
      data = await loadStreetDataFromFs(tsid, join(root, 'public/assets/streets'));
    } catch {
      continue;
    }
    const layout = streetObjectLayout(data, { starter: tsid === STREET_INDEX.default });
    if (layout.batterflies.length) streets.push({ tsid, label: data.label, data, layout });
  }
});

describe('#704 Batterflies fly over the location\'s ground_y, as in Glitch', () => {
  it('the street data carries each location\'s ground_y, and every flier takes it', () => {
    assert.equal(ecology.groundY?.[L3E], -520, 'Level 3 East\'s ground_y (its location XML)');
    assert.ok(ecology.groundYStreetCount > 900, String(ecology.groundYStreetCount));
    assert.equal(typeof ecologyModule.flightGroundFor, 'function');
    const l3e = streets.find((s) => s.tsid === L3E);
    assert.equal(ecologyModule.flightGroundFor(l3e.data), -520 - l3e.data.bounds.t);
    // Every flier: solo Butterflies, street Butterflies online, Batterflies solo and online.
    assert.match(read('public/game.js'), /floor: flightFloorFor\(streetPlatforms, WORLD_W, flightGroundFor\(currentStreet\)\),/);
    assert.match(read('public/js/features/street-objects-feature.js'), /floor: flightFloorFor\(engine\.platforms, worldW, flightGroundFor\(engine\.street\)\),/);
    assert.match(read('public/js/features/street-objects-feature.js'), /const home = \{ \.\.\.placed, floor: flightFloorFor\(engine\.platforms, Number\(engine\.worldW\) \|\| 2000, flightGroundFor\(engine\.street\)\) \};/);
    assert.match(read('public/js/features/animal-husbandry-feature.js'), /floor: flightFloorFor\(engine\?\.platforms, worldW, flightGroundFor\(engine\?\.street\)\),/);
  });

  it('ground_y is the floor where the lines are lower, and rising ground still lifts it', () => {
    const lines = [
      { x1: 0, y1: 950, x2: 1200, y2: 950 }, // water
      { x1: 0, y1: 600, x2: 1200, y2: 600 }, // plats over it
      { x1: 1200, y1: 400, x2: 2000, y2: 400 }, // ground rising over the ground_y
    ];
    assert.equal(floorUnder(lines, 300), 950);
    const floor = flightFloor(lines, 2000, { groundY: 600 });
    assert.equal(flightFloorAt(floor, 300), 600);
    assert.equal(flightFloorAt(floor, 1800), 400);
    assert.equal(flightFloorAt(flightFloor(lines, 2000), 300), 950, 'no ground_y: the floor under x');
    assert.notEqual(flightFloorFor(lines, 2000, 600), flightFloorFor(lines, 2000), 'kept per ground_y');
  });

  it('on Level 3 East every Batterfly flies over the walking plats and no Guano falls in the water', () => {
    const s = streets.find((q) => q.tsid === L3E);
    const { out, platforms } = drops(s.data, s.layout);
    const plats = platforms.filter((p) => p.pcPerm === -1);
    const water = out.filter((d) => d.line === WATER);
    const under = out.filter((d) => {
      const top = landingY(plats, d.x, -1e9);
      return top != null && d.y > top;
    });
    assert.ok(out.length > 500, String(out.length));
    assert.deepEqual({ water: water.length, under: under.length }, { water: 0, under: 0 });
  });

  it('on no Batterfly street does Guano fall below the lowest place Glitch\'s band could drop it', () => {
    const hit = [];
    for (const s of streets) {
      const g = groundFor(s.data) ?? (Number.isFinite(ecology.groundY?.[s.tsid]) ? ecology.groundY[s.tsid] - s.data.bounds.t : null);
      if (g == null) continue;
      const { out, platforms } = drops(s.data, s.layout);
      // Glitch's lowest drop at x: from the bottom of its band, the ground_y.
      const low = out.filter((d) => {
        const gl = stackRestY(platforms, d.x, g);
        return gl != null && d.restY > gl + 30;
      });
      if (low.length / out.length > 0.05) hit.push(`${s.label} (${s.tsid}) ${Math.round((100 * low.length) / out.length)}%`);
    }
    // Each of the six streets the report's trace found is a Batterfly street with a ground_y.
    for (const label of SIX) assert.ok(streets.some((s) => s.label === label && Number.isFinite(ecology.groundY?.[s.tsid])), label);
    assert.deepEqual(hit, []);
  });
});
