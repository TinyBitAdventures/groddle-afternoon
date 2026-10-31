/**
 * Items go by platform_item_perm, the twin of the avatar's platform_pc_perm. The
 * 2012 client: PlatformLine.as item_solid_from_top / item_solid_from_bottom
 * (349-355), and getPlatsSolidFromTopForItems (127) is what items rest on. The
 * street JSON never carried the field, so every dropped thing, animal and NPC
 * rested on every line, ceilings and Odena Odes' cave line among them.
 * build-street-layers.mjs restores it (`item_perm`), street-model.js isItemSolid
 * reads it, walk-surface.js uses it by default, and the avatar keeps isStandable.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  groundBeneath,
  isItemFloor,
  isItemSolid,
  isSolidFromBelow,
  isStandable,
  platformYAt,
  platformsScreen,
  resolveGround,
  streetWidth,
} from '../public/js/street-model.js?v=23b926e5';
import { buildPlatformCandidates, planStreetPlacements } from '../public/js/street-ecology.js?v=7e30da8f';
import { landingY, nearestSurfaceY, walkSurfaceY } from '../public/js/walk-surface.js?v=764d5f5a';
import { parseLocationEvents, runLocationEvent, createEventRuntime } from '../public/js/location-events.js?v=61e0c5d3';
import { convertLocationXml } from '../public/js/location-xml.js?v=a4db2433';

const root = join(import.meta.dirname, '..');
const streetsDir = join(root, 'public/assets/streets');
const CLIENT = join(root, '../glitch-client/com/tinyspeck');
const GSJS = join(root, '../glitch-GameServerJS');
const xmlRoot = join(root, '../streets/mnt/stos/location_data');
const read = (rel) => readFileSync(join(root, rel), 'utf8');
const street = (tsid) => JSON.parse(readFileSync(join(streetsDir, `${tsid}.json`), 'utf8'));
const everyLine = () => true;

function allStreets() {
  const out = [];
  for (const f of readdirSync(streetsDir)) {
    if (!/^[GL][A-Z0-9]+\.json$/.test(f)) continue;
    const s = JSON.parse(readFileSync(join(streetsDir, f), 'utf8'));
    if (Array.isArray(s.platforms)) out.push(s);
  }
  return out;
}

describe('the source', () => {
  it('client: items rest on item_solid_from_top lines', { skip: !existsSync(CLIENT) }, () => {
    const line = readFileSync(join(CLIENT, 'engine/data/location/PlatformLine.as'), 'utf8');
    assert.match(line, /get item_solid_from_top\(\):Boolean \{\s*return !\(platform_item_perm == 1 \|\| platform_item_perm == 0\);/);
    assert.match(line, /get item_solid_from_bottom\(\):Boolean \{\s*return !\(platform_item_perm == -1 \|\| platform_item_perm == 0\);/);
    assert.match(line, /\/\*\* Returns all plats that items can rest on \*\/\s*public static function getPlatsSolidFromTopForItems[\s\S]{0,200}return platformLine\.item_solid_from_top;/);
    // An unset perm: `public var platform_item_perm:*;` stays undefined, which is neither 1 nor 0: solid.
    assert.match(line, /public var platform_item_perm:\*; \/\/ must be able to be an int or null/);
    // The editor drew a new line's item perm with its pc perm (a floor -1, a roof 1).
    const loco = readFileSync(join(CLIENT, 'engine/admin/locodeco/LocoDecoSWFBridge.as'), 'utf8');
    assert.match(loco, /pl\.platform_pc_perm = \(_keyboard\.pressed\(Keyboard\.CONTROL\) \? 1 : -1\);\s*pl\.platform_item_perm = \(_keyboard\.pressed\(Keyboard\.CONTROL\) \? 1 : -1\);/);
    // A thing that obeys physics has to sit on a platform.
    const admin = readFileSync(join(CLIENT, 'engine/admin/AdminDialog.as'), 'utf8');
    assert.match(admin, /Item obeys physics, so must be on platform/);
  });

  it('GSJS: events set item_perm only when named; drops obey physics; NPCs, trees, rocks and quoins do not', { skip: !existsSync(GSJS) }, () => {
    const events = readFileSync(join(GSJS, 'locations/inc_events.js'), 'utf8');
    assert.match(events, /if \(utils\.has_key\('item_perm', act\)\)\{\s*if \(all_plats\[act\.plat_id\]\.platform_item_perm != act\.item_perm\)/);
    const takeable = readFileSync(join(GSJS, 'items/include/takeable.js'), 'utf8');
    assert.match(takeable, /var dest_y = \(no_offset\) \? pc\.y : pc\.y-20;/);
    assert.match(takeable, /apiPutItemIntoPosition\(this, dest_x, dest_y\)/);
    const obeys = (cls) => readFileSync(join(GSJS, `items/${cls}.js`), 'utf8').match(/obey_physics\s*:\s*(true|false)/)?.[1];
    for (const cls of ['apple', 'musicblock_b_brown_01', 'pumpkin_carved_1', 'icon_alph']) assert.equal(obeys(cls), 'true', cls);
    for (const cls of ['npc_piggy', 'npc_chicken', 'npc_butterfly', 'npc_fox', 'npc_crab', 'trant_fruit', 'rock_beryl_1', 'quoin', 'garden_new', 'furniture_chair']) {
      assert.equal(obeys(cls), 'false', cls);
    }
  });
});

describe('street data (build-street-layers.mjs item_perm)', () => {
  it('carries every archived line\'s item perm: 89,734 lines on 1,422 streets', () => {
    const counts = { '-1': 0, 0: 0, 1: 0, null: 0 };
    const cross = new Map();
    let streets = 0;
    for (const s of allStreets()) {
      if (/^(reconstruction|groddle-builder )/.test(s.source || '')) continue;
      streets += 1;
      for (const p of s.platforms) {
        assert.ok('item_perm' in p, `${s.tsid} ${p.id}`);
        counts[String(p.item_perm)] += 1;
        const key = `${p.pc_perm}/${p.item_perm}`;
        cross.set(key, (cross.get(key) || 0) + 1);
      }
    }
    assert.equal(streets, 1422);
    assert.deepEqual(counts, { '-1': 87497, 0: 156, 1: 2047, null: 34 });
    // Most lines agree with pc_perm; these are where they do not (pc/item).
    assert.deepEqual(Object.fromEntries([...cross].filter(([k]) => !['-1/-1', '1/1', '0/0', 'null/null'].includes(k)).sort()), {
      '-1/0': 1, // Umbra's walkway: the avatar stands, items fall through
      '-1/null': 14,
      '0/-1': 55, // shelves: items rest, the avatar walks through
      '0/1': 20, // Odena Odes' cave line, Blooian's puzzle lines: neither
      '0/null': 2, // Uncle Friendly's counter
      '1/-1': 12, // undersides items rest on top of
      '1/0': 1,
      'null/-1': 55,
    });
  });

  it('the rebuilt streets: the ones copied from an archived street carry it, the 34 drawn by hand have none', () => {
    const rebuilt = allStreets().filter((s) => /^reconstruction/.test(s.source || ''));
    assert.equal(rebuilt.length, 38);
    // tools/build-enchanted-forests.mjs slices the parent street; tools/build-forest-machine-room.mjs
    // copies the Meadow room's template.
    const copied = rebuilt.filter((s) => /Enchanted Forest hollows|Forest Community Machine Room/.test(s.source));
    assert.equal(copied.length, 4);
    assert.ok(copied.every((s) => s.platforms.every((p) => 'item_perm' in p)));
    assert.ok(rebuilt.filter((s) => !copied.includes(s)).every((s) => s.platforms.every((p) => !('item_perm' in p))));
  });

  it('build-street-layers.mjs --check: the JSON matches the XML', { skip: !existsSync(xmlRoot) && 'needs ../streets (locations-xml.zip)' }, () => {
    const out = execFileSync('node', [join(root, 'build-street-layers.mjs'), '--check'], { cwd: root, encoding: 'utf8', timeout: 120000 });
    assert.match(out, / 89734 line item perms \(-1: 87497, 0: 156, 1: 2047, null: 34\)/);
  });

  it('the runtime XML loader reads platform_item_perm', { skip: !existsSync(xmlRoot) && 'needs ../streets (locations-xml.zip)' }, () => {
    for (const tsid of ['GA9KL9UE1D82RFO', 'GM4118MEHFDMM']) {
      const converted = convertLocationXml(readFileSync(join(xmlRoot, `${tsid}.xml`), 'utf8'));
      const json = new Map(street(tsid).platforms.map((p) => [p.id, p.item_perm]));
      assert.equal(converted.platforms.length, json.size, tsid);
      for (const p of converted.platforms) assert.equal(p.item_perm, json.get(p.id), `${tsid} ${p.id}`);
    }
    // Odena's cave line is 1; Uncle Friendly's counter edge is <null id="platform_item_perm"/>.
    const odena = convertLocationXml(readFileSync(join(xmlRoot, 'GA9KL9UE1D82RFO.xml'), 'utf8'));
    assert.equal(odena.platforms.find((p) => p.id === 'plat_1312406393104').item_perm, 1);
    const uncle = convertLocationXml(readFileSync(join(xmlRoot, 'GM4118MEHFDMM.xml'), 'utf8'));
    assert.equal(uncle.platforms.find((p) => p.id === 'plat_1300400138273').item_perm, null);
  });
});

describe('isItemSolid is item_solid_from_top', () => {
  it('reads itemPerm (screen) or item_perm (raw), like isStandable reads pc perms', () => {
    const perms = [-1, 0, 1, null];
    assert.deepEqual(perms.map((itemPerm) => isItemSolid({ itemPerm, pcPerm: -1 })), [true, false, false, true]);
    assert.deepEqual(perms.map((item_perm) => isItemSolid({ item_perm, pc_perm: -1 })), [true, false, false, true]);
    // A line with neither perm (a scene floor) is solid; a rebuilt line with only a
    // pc perm takes it, as the editor drew lines.
    assert.equal(isItemSolid({ x1: 0, y1: 0, x2: 1, y2: 0 }), true);
    assert.deepEqual([-1, 0, 1, null].map((pcPerm) => isItemSolid({ pcPerm })), [true, false, false, true]);
    // The item perm wins over the pc perm when both are there.
    assert.equal(isItemSolid({ pcPerm: 0, itemPerm: -1 }), true);
    assert.equal(isItemSolid({ pcPerm: -1, itemPerm: 0 }), false);
    assert.deepEqual([[-1, -1], [0, -1], [-1, 0], [1, -1]].map(([pcPerm, itemPerm]) => isItemFloor({ pcPerm, itemPerm })), [true, false, false, false]);
  });

  it('platformsScreen carries itemPerm beside pcPerm', () => {
    const lines = platformsScreen(street('GA9KL9UE1D82RFO'));
    const cave = lines.find((p) => p.id === 'plat_1312406393104');
    assert.equal(cave.pcPerm, 0);
    assert.equal(cave.itemPerm, 1);
  });

  it('leaves the avatar\'s rule as it was (isStandable, isSolidFromBelow)', () => {
    const perms = [-1, 0, 1, null, undefined];
    for (const itemPerm of [-1, 0, 1, null]) {
      assert.deepEqual(perms.map((pcPerm) => isStandable({ pcPerm, itemPerm })), [true, false, false, true, true]);
      assert.deepEqual(perms.map((pcPerm) => isSolidFromBelow({ pcPerm, itemPerm })), [false, false, true, true, false]);
    }
    // groundBeneath stays the avatar's rule unless a caller names the item rule.
    const lines = [{ x1: 0, y1: 100, x2: 100, y2: 100, pcPerm: 0, itemPerm: -1 }, { x1: 0, y1: 300, x2: 100, y2: 300, pcPerm: -1, itemPerm: -1 }];
    assert.equal(groundBeneath(lines, 50, 90)?.y, 300);
    assert.equal(groundBeneath(lines, 50, 90, 6, isItemSolid)?.y, 100);
  });
});

describe('Odena Odes: the cave line holds nothing', () => {
  const odena = street('GA9KL9UE1D82RFO');
  const lines = platformsScreen(odena);
  const cave = lines.find((p) => p.id === 'plat_1312406393104');

  it('a thing dropped over it falls through to the chamber floor; it used to stop on it', () => {
    for (const x of [100, 900, 1400, 2000, 2600]) {
      const y = platformYAt(cave, x, 0);
      const before = landingY(lines, x, y - 30, everyLine);
      assert.ok(before <= y + 0.01, `x ${x}: every line caught it at or over the cave line (${before})`);
      const after = landingY(lines, x, y - 30);
      assert.ok(after > y + 150, `x ${x}: lands ${after} under the cave line at ${y}`);
      // Nor does an animal walk along it, or spawn on it.
      assert.notEqual(walkSurfaceY(lines, x, y), y);
      assert.notEqual(nearestSurfaceY(lines, x, y), y);
    }
  });

  it('the avatar falls through it as before', () => {
    const y = platformYAt(cave, 1400, 0);
    assert.equal(resolveGround(lines, 1400, y - 1, 2), null);
  });
});

describe('the other lines the rule changes', () => {
  it('a shelf still holds items while the avatar walks through it (Nylon Phool)', () => {
    const lines = platformsScreen(street('GDOK0A8OG1E2C7O'));
    const shelf = lines.find((p) => p.id === 'plat_1317866545615');
    assert.deepEqual([shelf.pcPerm, shelf.itemPerm], [0, -1]);
    const x = (shelf.x1 + shelf.x2) / 2;
    assert.equal(landingY(lines, x, shelf.y1 - 30), platformYAt(shelf, x, 0));
    assert.equal(resolveGround(lines, x, shelf.y1 - 1, 2), null);
  });

  it("Umbra's walkway holds the avatar but lets items through, and the planner puts nothing there", () => {
    const umbra = street('GDOSHD9J6NT2HUJ');
    const lines = platformsScreen(umbra);
    const walk = lines.find((p) => p.id === 'plat_1351549922585');
    assert.deepEqual([walk.pcPerm, walk.itemPerm], [-1, 0]);
    const x = (walk.x1 + walk.x2) / 2;
    const y = platformYAt(walk, x, 0);
    assert.equal(resolveGround(lines, x, y - 1, 2)?.y, y);
    assert.ok(landingY(lines, x, y - 30) > y);
    assert.equal(landingY(lines, x, y - 30, isStandable), y);
  });

  it('an underside no longer catches a falling thing', () => {
    // Every pc_perm 1 / item_perm 1 line with a floor under it: things fall past.
    let checked = 0;
    for (const s of allStreets()) {
      const lines = platformsScreen(s);
      for (const p of lines) {
        if (p.pcPerm !== 1 || p.itemPerm !== 1) continue;
        const x = (p.x1 + p.x2) / 2;
        const y = platformYAt(p, x, 0);
        if (y == null) continue;
        const at = landingY(lines, x, y - 2);
        assert.notEqual(at, y, `${s.tsid} ${p.id}`);
        checked += 1;
      }
    }
    assert.ok(checked > 1900, `${checked}`);
  });

  it("2,237 lines on 269 streets hold no items; the two rules disagree on 70 lines on 32 streets", () => {
    let soft = 0;
    let softStreets = 0;
    let disagree = 0;
    const disagreeStreets = new Set();
    for (const s of allStreets()) {
      let n = 0;
      for (const p of s.platforms) {
        if (!isItemSolid(p)) n += 1;
        if (isItemSolid(p) !== isStandable(p)) {
          disagree += 1;
          disagreeStreets.add(s.tsid);
        }
      }
      soft += n;
      if (n) softStreets += 1;
    }
    assert.equal(soft, 2237);
    assert.equal(softStreets, 269);
    assert.equal(disagree, 70);
    assert.equal(disagreeStreets.size, 32);
  });
});

describe('the street planner', () => {
  it('puts only the arrival on a floor items fall through', () => {
    const lines = [
      { id: 'walk', x1: 40, y1: 500, x2: 1960, y2: 500, pcPerm: -1, itemPerm: 0 },
      { id: 'floor', x1: 40, y1: 520, x2: 1960, y2: 520, pcPerm: -1, itemPerm: -1 },
    ];
    const plan = planStreetPlacements(lines, [
      { key: 'player', count: 1, clearance: 40 },
      { key: 'trees', count: 6, clearance: 40 },
      { key: 'quoins', count: 6, clearance: 28 },
    ], { worldW: 2000, seed: 'item-lines' });
    const line = (spot) => spot.id.slice(0, spot.id.lastIndexOf(':'));
    for (const key of ['trees', 'quoins']) {
      assert.equal(plan.groups[key].length, 6);
      assert.ok(plan.groups[key].every((spot) => line(spot) === 'floor'), key);
    }
    const candidates = buildPlatformCandidates(lines, { worldW: 2000, seed: 'item-lines' });
    assert.ok(candidates.some((c) => c.id.startsWith('walk:') && c.item === false));
  });

  it('keeps every archived street\'s planned things on lines that hold items', () => {
    for (const s of allStreets()) {
      const lines = platformsScreen(s);
      if (lines.every((p) => isItemSolid(p) === isStandable(p))) continue;
      const plan = planStreetPlacements(lines, [
        { key: 'player', count: 1, clearance: 190 },
        { key: 'trees', count: 4, clearance: 135 },
        { key: 'quoins', count: 8, clearance: 28 },
      ], { worldW: streetWidth(s), seed: s.tsid });
      const byId = new Map(lines.map((p, i) => [p.id || String(i), p]));
      for (const key of ['trees', 'quoins']) {
        for (const spot of plan.groups[key]) {
          const p = byId.get(spot.id.slice(0, spot.id.lastIndexOf(':')));
          assert.ok(p && isItemFloor(p), `${s.tsid} ${key} ${spot.id}`);
        }
      }
    }
  });
});

describe('location events carry item_perm', () => {
  it('parses item_perm only when the action names it', () => {
    const xml = `<object id="events"><object id="go"><object id="actions">
      <object id="0"><str id="type">plat</str><str id="plat_id">plat_a</str><int id="pc_perm">-1</int><int id="item_perm">-1</int></object>
      <object id="1"><str id="type">plat</str><str id="plat_id">plat_b</str><int id="pc_perm">0</int></object>
      <object id="2"><str id="type">wall</str><str id="wall_id">wall_a</str><int id="pc_perm">0</int><int id="item_perm">0</int></object>
    </object></object></object>`;
    const events = parseLocationEvents(xml);
    assert.deepEqual(events.go, [
      { type: 'plat', plat: 'plat_a', pc_perm: -1, item_perm: -1 },
      { type: 'plat', plat: 'plat_b', pc_perm: 0 },
      { type: 'wall', wall: 'wall_a', pc_perm: 0, item_perm: 0 },
    ]);
    const fx = runLocationEvent(createEventRuntime(), events, 'go');
    assert.deepEqual(fx.filter((f) => f.type === 'plat'), [
      { type: 'plat', id: 'plat_a', pc_perm: -1, item_perm: -1 },
      { type: 'plat', id: 'plat_b', pc_perm: 0 },
    ]);
  });

  it('the street data has them: 1,031 actions on 8 streets', () => {
    let actions = 0;
    const streets = new Set();
    for (const s of allStreets()) {
      for (const acts of Object.values(s.events || {})) {
        for (const a of acts) {
          if ((a.type === 'plat' || a.type === 'wall') && 'item_perm' in a) {
            actions += 1;
            streets.add(s.tsid);
            assert.equal(a.item_perm, a.pc_perm, `${s.tsid} ${a.plat || a.wall}`);
          }
        }
      }
    }
    assert.equal(actions, 1031);
    assert.equal(streets.size, 8);
  });

  it('setPlatform sets itemPerm; a pc_perm 0 line still leaves the list as before', async () => {
    const { locationEventsFeature, locationEventsApi } = await import('../public/js/features/location-events-feature.js?fresh=item-lines');
    const s = {
      tsid: 'GTESTITEMLINE01',
      bounds: { l: 0, t: -100, r: 100, b: 0 },
      platforms: [
        { id: 'plat_door', x1: 0, y1: -50, x2: 100, y2: -50, pc_perm: -1, item_perm: -1 },
        { id: 'plat_floor', x1: 0, y1: 0, x2: 100, y2: 0, pc_perm: -1, item_perm: -1 },
      ],
      events: {
        player_enter: [],
        shut: [{ type: 'plat', plat: 'plat_door', pc_perm: 0, item_perm: 0 }],
        open: [{ type: 'plat', plat: 'plat_door', pc_perm: -1 }],
        itemsoff: [{ type: 'plat', plat: 'plat_door', pc_perm: -1, item_perm: 0 }],
      },
    };
    locationEventsApi.register({ strict: (st) => st?.tsid === s.tsid });
    const engine = {
      street: s,
      streetTsid: s.tsid,
      platforms: platformsScreen(s),
      decoViews: new Map(),
      started: true,
      transientInstance: () => false,
      homeContext: () => ({ inHome: false }),
      setData: () => {},
      param: () => null,
    };
    locationEventsFeature.onStreetEnter(s, engine);
    const door = () => engine.platforms.find((p) => p.id === 'plat_door');
    assert.equal(landingY(engine.platforms, 50, 40), 50);
    locationEventsApi.fire(engine, 'shut');
    assert.equal(door(), undefined, 'out of the list, as before');
    assert.equal(landingY(engine.platforms, 50, 40), 100);
    // Back on with a pc-only action: the line keeps the item perm the shut set (GSJS keeps it).
    locationEventsApi.fire(engine, 'open');
    assert.deepEqual([door().pcPerm, door().itemPerm], [-1, 0]);
    assert.equal(resolveGround(engine.platforms, 50, 49)?.y, 50);
    assert.equal(landingY(engine.platforms, 50, 40), 100);
    locationEventsApi.fire(engine, 'itemsoff');
    assert.deepEqual([door().pcPerm, door().itemPerm], [-1, 0]);
  });
});

describe('call sites', () => {
  const game = read('public/game.js');

  it('a pack drop lands by the item rule from takeable_drop\'s pc.y - 20', () => {
    assert.match(game, /const y = landingY\(streetPlatforms, x, player\.y - 20\) \?\? player\.y;/);
  });

  it('the avatar\'s moves stay on isStandable', () => {
    assert.match(game, /const floorY = airborne \? landingY\(streetPlatforms, player\.x, player\.y, isStandable\) : null;/);
    assert.match(read('public/js/features/crabs-feature.js'), /engine\.player\.y = \(walkSurfaceY\(engine\.platforms, crab\.sprite\.x \+ dx, feet, \{ up: 24, down: 24 \}, isStandable\)/);
    const smuggling = read('public/js/features/smuggling-feature.js');
    assert.match(smuggling, /walkSurfaceY\(engine\.platforms, x, npc\.y, \{ up: 40, down: 60 \}, isStandable\)/);
    assert.match(read('public/js/features/seasons-feature.js'), /engine\.player\.y = groundAt\(engine, engine\.player\.x, d\.sprite\.y, isStandable\) - 2;/);
    // Companions stand in for players: groundBeneath's default rule.
    assert.match(game, /groundBeneath\(streetPlatforms, sprite\.x, sprite\.y\)\?\.y/);
  });

  it('Juju Bandits walk by the item rule', () => {
    const juju = read('public/js/features/juju-bandits-feature.js');
    assert.match(juju, /groundBeneath\(platforms, nx, bandit\.y, STEP_UP, isItemSolid\)/);
  });
});
