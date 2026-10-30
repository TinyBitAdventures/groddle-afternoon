/**
 * Soft lines (platform_pc_perm 0) are no floor for the avatar. The 2012 client:
 * PlatformLine.as pc_solid_from_top / pc_solid_from_bottom (341-347) are both false
 * for pc_perm 0, and AvatarPhysicsHandler.as (955-957) skips such a line entirely
 * ("not a collider for pcs at all"). Items go by platform_item_perm instead, so most
 * of these lines are item shelves (item_perm -1): things rest on them, players walk
 * and fall through. The remake stood the avatar on every pc_perm 0 line no event
 * switched, Odena Odes' full-width cave line among them (stand mid-cave, 195-378 px
 * over the chamber floor). street-model.js isStandable now refuses them.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  groundBeneath,
  isSolidFromBelow,
  isStandable,
  platformYAt,
  platformsScreen,
  resolveGround,
  streetWidth,
} from '../public/js/street-model.js?v=77584eff';
import { buildPlatformCandidates, planStreetPlacements } from '../public/js/street-ecology.js?v=face8516';
import { landingY } from '../public/js/walk-surface.js?v=cf02de0e';
import { OWNED_STREETS } from '../public/js/location-events.js?v=b45cd9c3';

const spike = join(import.meta.dirname, '..');
const streetsDir = join(spike, 'public/assets/streets');
const CLIENT = join(spike, '../glitch-client/com/tinyspeck/engine');
const street = (tsid) => JSON.parse(readFileSync(join(streetsDir, `${tsid}.json`), 'utf8'));
const triggers = JSON.parse(readFileSync(join(spike, 'public/assets/content/puzzle-triggers.json'), 'utf8')).streets;

/** Every archived street with its own events plus the puzzle triggers' rebuilt ones. */
function allStreets() {
  const out = [];
  for (const f of readdirSync(streetsDir)) {
    if (!/^G[A-Z0-9]+\.json$/.test(f)) continue;
    const s = JSON.parse(readFileSync(join(streetsDir, f), 'utf8'));
    if (!Array.isArray(s.platforms)) continue;
    const def = triggers[s.tsid] || triggers[`L${s.tsid.slice(1)}`];
    out.push({ s, def, events: { ...(s.events || {}), ...(def?.events || {}) } });
  }
  return out;
}

function softLines() {
  const rows = [];
  for (const { s, def, events } of allStreets()) {
    const named = new Set();
    const on = new Set();
    for (const acts of Object.values(events)) {
      for (const a of acts) {
        if (a.type !== 'plat' || !a.plat) continue;
        named.add(a.plat);
        if (a.pc_perm !== 0) on.add(a.plat);
      }
    }
    for (const p of s.platforms) {
      if (p.pc_perm !== 0) continue;
      const kind = !named.has(p.id) ? 'untoggled' : !on.has(p.id) ? 'only-off' : 'switchable';
      rows.push({ tsid: s.tsid, id: p.id, kind, strict: def?.strict === true, owner: OWNED_STREETS[s.tsid] || null });
    }
  }
  return rows;
}

describe('soft lines (pc_perm 0) are no floor for the avatar', () => {
  it('follows the client source', { skip: !existsSync(CLIENT) }, () => {
    const line = readFileSync(join(CLIENT, 'data/location/PlatformLine.as'), 'utf8');
    assert.match(line, /get pc_solid_from_top\(\):Boolean \{\s*return !\(platform_pc_perm == 1 \|\| platform_pc_perm == 0\);/);
    assert.match(line, /get pc_solid_from_bottom\(\):Boolean \{\s*return !\(platform_pc_perm == -1 \|\| platform_pc_perm == 0\);/);
    const physics = readFileSync(join(CLIENT, 'physics/avatar/AvatarPhysicsHandler.as'), 'utf8');
    assert.match(physics, /if \(!\(line\.pc_solid_from_top \|\| line\.pc_solid_from_bottom\)\) \{\s*\/\/ line is not a collider for pcs at all, pass through/);
  });

  it('isStandable is pc_solid_from_top, isSolidFromBelow pc_solid_from_bottom', () => {
    const perms = [-1, 0, 1, null, undefined];
    assert.deepEqual(perms.map((pcPerm) => isStandable({ pcPerm })), [true, false, false, true, true]);
    assert.deepEqual(perms.map((pcPerm) => isSolidFromBelow({ pcPerm })), [false, false, true, true, false]);
    // Raw street lines (world space) carry pc_perm.
    assert.deepEqual(perms.map((pc_perm) => isStandable({ pc_perm })), [true, false, false, true, true]);
    assert.equal(isStandable({ x1: 0, y1: 0, x2: 1, y2: 0 }), true, 'a hand-built line is a plain floor');
  });

  it('counts the lines it drops: 34 no event names on 22 streets, and one events only switch off', () => {
    const rows = softLines();
    const untoggled = rows.filter((r) => r.kind === 'untoggled');
    assert.equal(untoggled.length, 34);
    assert.equal(new Set(untoggled.map((r) => r.tsid)).size, 22);
    assert.ok(untoggled.some((r) => r.tsid === 'GA9KL9UE1D82RFO' && r.id === 'plat_1312406393104'), "Odena Odes' cave line");
    // High Jumper's Gully's Gameshow Ticket stand: hide_gst sets it to 0, nothing sets it on.
    assert.deepEqual(rows.filter((r) => r.kind === 'only-off').map((r) => `${r.tsid} ${r.id}`), ['GA94O989H3D3RN7 plat_1344547379043']);
    // Every line an event switches on starts out of the list (strict streets, location-events-feature),
    // or is on Radial Heights, whose Paradise course takes only the street's stars: no soft line was
    // kept standable as a walkable fallback, so the rule changes no event's street.
    const switchable = rows.filter((r) => r.kind === 'switchable');
    assert.equal(switchable.length, 196);
    assert.deepEqual(switchable.filter((r) => !r.strict).map((r) => `${r.tsid} ${r.owner}`), ['GHFQOLEIHN63P27 paradise', 'GHFQOLEIHN63P27 paradise']);
  });

  it("drops the avatar through Odena Odes' cave line to the chamber floor", () => {
    const odena = street('GA9KL9UE1D82RFO');
    const lines = platformsScreen(odena);
    const cave = lines.find((p) => p.id === 'plat_1312406393104');
    for (const x of [100, 900, 1400, 2000, 2600]) {
      const y = platformYAt(cave, x, 0);
      assert.equal(resolveGround(lines, x, y - 1, 2), null, `x ${x}: nothing to land on at the line`);
      const below = groundBeneath(lines, x, y);
      assert.ok(below && below.platform !== cave && below.y > y + 150, `x ${x}: the floor under it`);
    }
  });

  it('places nothing (the arrival spot included) on a soft line', () => {
    const odena = street('GA9KL9UE1D82RFO');
    const lines = platformsScreen(odena);
    const plan = planStreetPlacements(lines, [{ key: 'player', count: 1, clearance: 190 }], { worldW: streetWidth(odena), seed: odena.tsid });
    const spot = plan.groups.player[0];
    assert.notEqual(spot.id.slice(0, spot.id.lastIndexOf(':')), 'plat_1312406393104');
    let checked = 0;
    for (const { s } of allStreets()) {
      const all = platformsScreen(s);
      const soft = new Set(all.filter((p) => p.pcPerm === 0).map((p) => p.id));
      if (!soft.size) continue;
      const bad = buildPlatformCandidates(all, { worldW: streetWidth(s), seed: s.tsid })
        .filter((c) => soft.has(c.id.slice(0, c.id.lastIndexOf(':'))));
      assert.deepEqual(bad, [], s.tsid);
      checked += 1;
    }
    assert.equal(checked, 29);
  });

  it('still lets items land on an item shelf (walk-surface landingY)', () => {
    const nylon = street('GDOK0A8OG1E2C7O');
    const lines = platformsScreen(nylon);
    const shelf = lines.find((p) => p.id === 'plat_1317866545615');
    const x = (shelf.x1 + shelf.x2) / 2;
    assert.equal(landingY(lines, x, shelf.y1 - 30), platformYAt(shelf, x, 0));
  });

  it('a soft line an event switches on stands', async () => {
    const { locationEventsFeature, locationEventsApi } = await import('../public/js/features/location-events-feature.js?fresh=soft-lines');
    const s = {
      tsid: 'GTESTSOFTLINE01',
      bounds: { l: 0, t: -100, r: 100, b: 0 },
      platforms: [{ id: 'plat_soft', x1: 0, y1: -50, x2: 100, y2: -50, pc_perm: 0 }],
      events: { player_enter: [], open: [{ type: 'plat', plat: 'plat_soft', pc_perm: -1 }], shut: [{ type: 'plat', plat: 'plat_soft', pc_perm: 0 }] },
    };
    locationEventsApi.register({ strict: (st) => st?.tsid === s.tsid });
    const data = {};
    const engine = {
      street: s,
      streetTsid: s.tsid,
      platforms: platformsScreen(s),
      decoViews: new Map(),
      started: true,
      transientInstance: () => false,
      homeContext: () => ({ inHome: false }),
      setData: (k, v) => { data[k] = v; },
      param: () => null,
    };
    locationEventsFeature.onStreetEnter(s, engine);
    assert.equal(resolveGround(engine.platforms, 50, 49), null);
    assert.ok(locationEventsApi.fire(engine, 'open'));
    assert.equal(resolveGround(engine.platforms, 50, 49)?.y, 50);
    locationEventsApi.fire(engine, 'shut');
    assert.equal(resolveGround(engine.platforms, 50, 49), null);
  });
});
