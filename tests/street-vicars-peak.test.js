/**
 * Vicar's Peak, rebuilt behind Thornfad Layers' locked door
 * (js/vicars-peak.js, tools/build-vicars-peak.mjs,
 * features/vicars-peak-feature.js). Register row G93.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertStreetGeometry } from '../public/js/street-model.js?v=g442-6';
import { arrivalInTarget } from '../public/js/location-navigation.js?v=g442-6';
import { planStreetPlacements, populationForStreet } from '../public/js/street-ecology.js';
import {
  BOTTOM_DOOR,
  LADDER_SPOTS,
  MOSSYSTEP_TSID,
  THORNFAD_DOOR,
  THORNFAD_TSID,
  TIERS,
  TOP_DOOR,
  VICARS_PEAK_ARRIVE,
  VICARS_PEAK_POPULATION,
  VICARS_PEAK_TSID,
  isVicarsPeakTsid,
  ladderGeometry,
  vicarsPeakEcology,
} from '../public/js/vicars-peak.js';
import { vicarsPeakFeature } from '../public/js/features/vicars-peak-feature.js';
import { FEATURES } from '../public/js/features/index.js?v=registry-302';

const spike = join(dirname(fileURLToPath(import.meta.url)), '..');
const pub = join(spike, 'public');
const streets = join(pub, 'assets/streets');
const street = (tsid) => JSON.parse(readFileSync(join(streets, `${tsid}.json`), 'utf8'));
const gsjs = join(spike, '../glitch-GameServerJS');
const locations = join(spike, '../streets/mnt/stos/location_data');
const vp = street(VICARS_PEAK_TSID);
const thornfad = street(THORNFAD_TSID);
const { l: L, t: T } = vp.bounds;

/** Platforms whose walk line passes x at y (world), within 1 px. */
const platformAt = (x, y) => vp.platforms.find((p) => x >= p.x1 && x <= p.x2 && Math.abs(p.y1 + ((x - p.x1) / (p.x2 - p.x1)) * (p.y2 - p.y1) - y) <= 1);

describe("Vicar's Peak street", () => {
  it("is written, indexed and current (tools/build-vicars-peak.mjs --check)", () => {
    execFileSync(process.execPath, [join(spike, 'tools/build-vicars-peak.mjs'), '--check'], { stdio: 'pipe' });
    assertStreetGeometry(vp);
    assert.match(vp.source, /^reconstruction/);
    assert.equal(vp.reconstructed, true);
    const index = JSON.parse(readFileSync(join(streets, 'index.json'), 'utf8'));
    const row = index.streets[VICARS_PEAK_TSID];
    assert.deepEqual([row.label, row.hubId, row.hubName, row.reconstructed, row.file], ["Vicar's Peak", '64', 'Groddle Heights', true, `assets/streets/${VICARS_PEAK_TSID}.json`]);
    assert.equal(row.platforms, vp.platforms.length);
  });

  it('is the Groddle Heights street GSJS names but no map draws', { skip: !existsSync(gsjs) && 'GSJS checkout not beside this worktree' }, () => {
    const maps = readFileSync(join(gsjs, 'inc_data_maps_prod.js'), 'utf8');
    assert.match(maps, /"LCR1516SFHM122V"\t: "Vicar's Peak"/);
    const loc = readFileSync(join(gsjs, 'locations/location.js'), 'utf8');
    assert.match(loc, /this\.tsid == 'LCR1516SFHM122V'\)\s*\/\/ Vicar's Peak/);
  });

  it('keeps to the 1500 x 2000 Heights climb with seven ledge tiers', () => {
    assert.deepEqual(vp.bounds, { l: -750, r: 750, t: -2000, b: 0 });
    assert.equal(TIERS.length, 7);
    for (let i = 1; i < TIERS.length; i += 1) {
      const gap = TIERS[i - 1].y - TIERS[i].y;
      assert.ok(gap >= 260 && gap <= 300, `tier ${i} gap ${gap}`);
    }
    for (const tier of TIERS) {
      for (const [a, b] of tier.segs) {
        assert.ok(a >= L && b <= vp.bounds.r && b - a >= 150, `${tier.id} ${a}..${b}`);
        assert.ok(platformAt((a + b) / 2, tier.y), `${tier.id} segment has a platform`);
      }
    }
    assert.equal(TIERS[0].segs[0][0], L);
    assert.equal(TIERS[0].segs[0][1], vp.bounds.r, 'the ground spans the street');
  });

  it('every ladder stands on one ledge and tops out over the next', () => {
    const lads = ladderGeometry();
    assert.equal(vp.ladders.length, LADDER_SPOTS.length);
    assert.ok(vp.ladders.length >= 14, 'many ladders, as in the Snaps');
    for (const lad of vp.ladders) {
      const g = lads.find((x) => x.id === lad.id);
      const lower = TIERS.find((t) => t.id === g.from);
      const upper = TIERS.find((t) => t.id === g.to);
      assert.equal(TIERS.indexOf(upper), TIERS.indexOf(lower) + 1, `${lad.id} joins neighbouring tiers`);
      assert.ok(platformAt(lad.x, lad.y), `${lad.id} foot on a ledge`);
      const top = lad.y - lad.h;
      assert.ok(platformAt(lad.x, upper.y), `${lad.id} head over a ledge`);
      assert.ok(top < upper.y && upper.y - top <= 48, `${lad.id} top ${top} within the ladder-top band of ${upper.y}`);
    }
    // Every tier gap has a ladder, so the top is reachable from the ground.
    for (let i = 0; i + 1 < TIERS.length; i += 1) {
      assert.ok(LADDER_SPOTS.some((s) => s.from === i), `a ladder from ${TIERS[i].id}`);
    }
    // Each ladder has its art: a cap at each end and vined centres between.
    const mg = vp.layers.find((l) => l.name === 'middleground');
    for (const lad of vp.ladders) {
      const tiles = mg.decos.filter((d) => /^ladder_tile_.*_tree$/.test(d.sprite) && d.x === lad.x);
      assert.ok(tiles.length >= 3, `${lad.id} art`);
      assert.ok(tiles.some((d) => d.sprite === 'ladder_tile_cap_1_tree') && tiles.some((d) => d.sprite === 'ladder_tile_cap_0_tree'));
    }
  });

  it('draws only CC0 decos already shipped', () => {
    const manifest = new Set(JSON.parse(readFileSync(join(pub, 'assets/decos/manifest.json'), 'utf8')));
    for (const layer of vp.layers) {
      for (const d of layer.decos) {
        assert.ok(existsSync(join(pub, 'assets/decos/groddle', `${d.sprite}.webp`)), d.sprite);
        assert.ok(manifest.has(d.sprite), `${d.sprite} in the deco manifest`);
      }
    }
    for (const door of vp.doors) assert.ok(existsSync(join(pub, 'assets/decos/groddle', `${door.sprite}.webp`)), door.sprite);
  });

  it("opens from Thornfad Layers' locked door (Door Key 1) and lands on the ground at its connect point", () => {
    const door = thornfad.doors.find((d) => d.id === THORNFAD_DOOR);
    assert.equal(door.connect.street, VICARS_PEAK_TSID);
    assert.equal(door.connect.tsid, 'LCR1516SFHM122V');
    assert.deepEqual([door.is_locked, door.key_id], [true, 1]);
    assert.deepEqual([door.connect.x, door.connect.y], [VICARS_PEAK_ARRIVE.x, VICARS_PEAK_ARRIVE.y]);
    const arrive = arrivalInTarget(vp, door.connect.x, door.connect.y);
    assert.ok(arrive.snapped);
    assert.deepEqual(door.connect.arrive, { x: arrive.x, y: arrive.y });
    assert.equal(arrive.y + T, TIERS[0].y, 'the door drops you on the ground walk line');
  });

  it('the source door really targets it', { skip: !existsSync(locations) && 'street dump not beside this worktree' }, () => {
    const xml = readFileSync(join(locations, `${THORNFAD_TSID}.xml`), 'utf8');
    assert.match(xml, /<objref id="target" tsid="LCR1516SFHM122V" label="Vicar&apos;s Peak"\/>/);
    const moss = readFileSync(join(locations, `${MOSSYSTEP_TSID}.xml`), 'utf8');
    const sources = moss.slice(moss.indexOf('<object id="sources">'));
    assert.match(sources.slice(0, 200), /<int id="LCR1516SFHM122V">1<\/int>/, "Mossystep's sources list Vicar's Peak");
  });

  it('has the arched door on the top ledge to Mossystep and a door back to Thornfad Layers at the bottom', () => {
    const top = vp.doors.find((d) => d.id === TOP_DOOR.id);
    const bottom = vp.doors.find((d) => d.id === BOTTOM_DOOR.id);
    assert.equal(top.sprite, 'heights_door_static');
    assert.equal(top.y + T, TIERS[TIERS.length - 1].y, 'top door stands on the top ledge');
    assert.ok(platformAt(top.x + L, top.y + T));
    assert.equal(top.connect.street, MOSSYSTEP_TSID);
    assert.ok(top.connect.arrive, 'Mossystep landing snapped');
    assert.equal(bottom.y + T, TIERS[0].y);
    assert.equal(bottom.connect.street, THORNFAD_TSID);
    const door = thornfad.doors.find((d) => d.id === THORNFAD_DOOR);
    const back = arrivalInTarget(thornfad, door.x + thornfad.bounds.l, door.y + thornfad.bounds.t);
    assert.deepEqual(bottom.connect.arrive, { x: back.x, y: back.y });
    assert.equal(bottom.connect.arrive.x, door.x, "lands in front of Thornfad's door");
    for (const d of vp.doors) assert.deepEqual([d.is_locked, d.hidden], [false, false]);
    // No ladder foot in a doorway.
    for (const d of vp.doors) for (const lad of vp.ladders) {
      if (lad.y === d.y + T) assert.ok(Math.abs(lad.x - (d.x + L)) > (d.w + lad.w) / 2, `${lad.id} clear of ${d.id}`);
    }
  });
});

describe("Vicar's Peak ecology", () => {
  it("the loading card's 11 Piggies, 7 Chickens and 1 Metal Rock, on this street only", () => {
    // index.js imports it with a ?v= query: a separate module instance, same id.
    assert.ok(FEATURES.some((f) => f.id === vicarsPeakFeature.id));
    assert.deepEqual(VICARS_PEAK_POPULATION, { npc_piggy: 11, npc_chicken: 7, rock_metal_1: 1 });
    assert.equal(vicarsPeakFeature.ecologyOverride({ tsid: 'GCR12NU45AM12BB' }), null);
    for (const tsid of ['GCR1516SFHM122V', 'LCR1516SFHM122V']) assert.ok(isVicarsPeakTsid(tsid));
    const entry = vicarsPeakFeature.ecologyOverride(vp);
    assert.deepEqual(entry, vicarsPeakEcology());
    const pop = populationForStreet(VICARS_PEAK_TSID, entry);
    assert.deepEqual([pop.piggies, pop.chickens, pop.rockClasses], [11, 7, ['rock_metal_1']]);
    assert.deepEqual([pop.butterflies, pop.treeClasses.length, pop.gardens, pop.vendor, pop.shrine], [0, 0, 0, false, false]);
  });

  it('archived rows keep the 6 / 3 caps', () => {
    const pop = populationForStreet('GXX', { counts: { npc_piggy: 11, npc_chicken: 7 } });
    assert.deepEqual([pop.piggies, pop.chickens], [6, 3]);
  });

  it('every animal, the rock and the player get a ledge spot', () => {
    const pop = populationForStreet(VICARS_PEAK_TSID, vicarsPeakEcology());
    const screenPlatforms = vp.platforms.map((p) => ({ ...p, x1: p.x1 - L, x2: p.x2 - L, y1: p.y1 - T, y2: p.y2 - T }));
    const plan = planStreetPlacements(screenPlatforms, [
      { key: 'player', count: 1, clearance: 190 },
      { key: 'rocks', count: pop.rockClasses.length, clearance: 74 },
      { key: 'piggies', count: pop.piggies, clearance: 92 },
      { key: 'chickens', count: pop.chickens, clearance: 86 },
      { key: 'quoins', count: pop.quoins, clearance: 28 },
    ], { worldW: vp.bounds.r - L, seed: VICARS_PEAK_TSID });
    assert.deepEqual([plan.groups.piggies.length, plan.groups.chickens.length, plan.groups.rocks.length], [11, 7, 1]);
    const tierYs = new Set(TIERS.map((t) => t.y - T));
    for (const p of [...plan.groups.piggies, ...plan.groups.chickens, ...plan.groups.rocks, ...plan.groups.player]) {
      assert.ok(tierYs.has(Math.round(p.y)), `spot ${p.x},${p.y} on a ledge`);
    }
  });
});
