/**
 * The abandoned towers' 15 upper floors behind the lobby lifts (register row
 * G144; js/tower-floors.js, tools/build-tower-floors.mjs,
 * features/tower-floors-feature.js).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertStreetGeometry, platformYAt } from '../public/js/street-model.js?v=23b926e5';
import { arrivalInTarget } from '../public/js/location-navigation.js?v=4be109b9';
import { populationForStreet } from '../public/js/street-ecology.js?v=fd79899d';
import { pickAwayConnection, pickConnection, planSignpostTravel, resolveLoadedTsid } from '../public/js/travel.js?v=a2c6427f';
import { validateShippedStreet } from '../public/js/builder/validate.js?v=6d3bc6e2';
import {
  HAUKI_FLOOR_1,
  HAUKI_FLOOR_2,
  HAUKI_FLOOR_3,
  HAUKI_PILASTERS,
  PANORAMA_LAYOUTS,
  TOWER_DEFAULT_DOORS,
  TOWER_DEFAULT_NOTE,
  TOWER_FLOORS,
  TOWER_FLOOR_BOUNDS,
  TOWER_FLOOR_SIGNPOST,
  TOWER_LIFT,
  TOWERS,
  defaultTowerLayout,
  isTowerFloorTsid,
  towerFloorEcology,
  towerFloorFor,
  towerFloorLayout,
  towerForLobby,
} from '../public/js/tower-floors.js?v=45fe0f93';
import { towerFloorsFeature } from '../public/js/features/tower-floors-feature.js?v=7f87d087';
import { FEATURES } from '../public/js/features/index.js?v=1caaf2b6';

const spike = join(dirname(fileURLToPath(import.meta.url)), '..');
const pub = join(spike, 'public');
const streets = join(pub, 'assets/streets');
const street = (tsid) => JSON.parse(readFileSync(join(streets, `${tsid}.json`), 'utf8'));
const locations = join(spike, '../streets/mnt/stos/location_data');
const gsjs = join(spike, '../glitch-GameServerJS');
const index = JSON.parse(readFileSync(join(streets, 'index.json'), 'utf8'));
const loaded = new Set(Object.keys(index.streets));
const manifest = new Set(JSON.parse(readFileSync(join(pub, 'assets/decos/manifest.json'), 'utf8')));

/** The floors built so far (a floor is built once it has a layout) and the towers with every floor built. */
const BUILT = TOWER_FLOORS.filter((f) => towerFloorLayout(f));
const BUILT_TOWERS = TOWERS.filter((t) => t.floors.every((f) => towerFloorLayout(f)));
const lift = (s) => (s.signposts || []).find((p) => (p.connects || []).some((c) => isTowerFloorTsid(c.tsid)));
/** A platform under screen x within 2 px of screen y (an arrival lands on a floor). */
const landsOnFloor = (target, arrive) => target.platforms.some((p) => {
  const y = platformYAt(p, arrive.x + target.bounds.l, 0);
  return y != null && Math.abs(y - (arrive.y + target.bounds.t)) <= 2 && (p.pc_perm ?? -1) !== 1;
});

describe('tower floors: street JSON', () => {
  it('fifteen floors over five towers, written, indexed and current (tools/build-tower-floors.mjs --check)', () => {
    execFileSync(process.execPath, [join(spike, 'tools/build-tower-floors.mjs'), '--check'], { stdio: 'pipe' });
    assert.equal(TOWER_FLOORS.length, 15);
    assert.deepEqual([BUILT.length, BUILT_TOWERS.length], [15, 5]);
    assert.deepEqual(TOWERS.map((t) => [t.label, t.floors.length]), [
      ['Hauki Seeks Manor', 3], ['Egret Taun Towers', 3], ['Sabudana Drama Towers', 4], ['Hakusan Heaps Towers', 2], ['Gregarious Towers', 3],
    ]);
    for (const f of BUILT) {
      const s = street(f.tsid);
      assertStreetGeometry(s);
      assert.match(s.source, /^reconstruction/);
      assert.equal(s.reconstructed, true);
      assert.equal(s.label, `${f.tower.label}, floor ${f.n}`);
      assert.deepEqual(s.bounds, { ...TOWER_FLOOR_BOUNDS });
      assert.equal(s.noMap, true, 'off the map, like the lobbies');
      const lobby = street(f.tower.lobby);
      assert.deepEqual([s.hubId, s.hubName, s.musicFile], [lobby.hubId, lobby.hubName, lobby.musicFile]);
      const row = index.streets[f.tsid];
      assert.deepEqual([row.label, row.reconstructed, row.file, row.platforms, row.decos], [s.label, true, `assets/streets/${f.tsid}.json`, s.platforms.length, s.stats.decoCount]);
      assert.equal(s.stats.decoCount, s.layers.reduce((n, l) => n + l.decos.length, 0));
    }
  });

  it('every floor is laid out from its Tribute Blog panorama (post id and lift plate cited); no default marker is left', () => {
    // [post id, hall doors as the picture shows them]
    const pictures = {
      LDOBRJIEU2V2Q2G: ['48476742859', 6], LDOBRKREU2V2F9B: ['48484112182', 8], LHF9DOUO7K03OUA: ['48540615574', 3],
      LUVMHFM3U2V2T72: ['41722396690', 8], LUVMHGV3U2V2J7M: ['41805000800', 2], LUVMHH74U2V245O: ['41813899873', 6],
      LNV6EBBIS2V2JB8: ['40948529639', 4], LNV6ECKIS2V26JU: ['40956964858', 4], LNV6EDVIS2V2SFD: ['40965287278', 3], LNV6EEAJS2V26B2: ['40973309005', 7],
      LA9TBQS1V2V2G34: ['43506277838', 7], LA9TBR62V2V23E2: ['43514874358', 5],
      LDOBRLULU2V24DS: ['53465948360', 8], LDOBRNDMU2V2Q34: ['53473055375', 8], LDOBROOMU2V2GCK: ['53480119891', 8],
    };
    for (const f of BUILT) {
      const s = street(f.tsid);
      const doors = Number(s.why.hallDoors.split(' ')[0]);
      assert.match(s.why.layout, /^panorama: /, f.label);
      assert.match(s.why.layout, new RegExp(pictures[f.source][0]));
      assert.match(s.why.layout, new RegExp(`plate ${f.n}\\)|post 48540615574`), f.label);
      assert.equal(doors, pictures[f.source][1], f.label);
      assert.equal(doors, towerFloorLayout(f).bays.filter(([, , k]) => k === 'door').length);
      assert.ok(!s.source.includes(TOWER_DEFAULT_NOTE) && !JSON.stringify(s.why).includes(TOWER_DEFAULT_NOTE), f.label);
      assert.equal(s.internalLabel, `Abandoned ${f.label}`);
    }
    assert.deepEqual(Object.keys(PANORAMA_LAYOUTS).sort(), Object.keys(pictures).sort());
    assert.equal(TOWER_FLOORS.filter((f) => !PANORAMA_LAYOUTS[f.source]).length, 0);
  });

  it('round 5\'s floors keep what their pictures show: open windows and torn walls, posts, columns, bricks, the room seen through a wall', () => {
    const L = (src) => towerFloorLayout(towerFloorFor(src));
    const kinds = (src) => L(src).bays.map(([, , k, o]) => `${k}${o.open ? ':open' : ''}${o.room ? ':room' : ''}`);
    const sprites = (src) => L(src).props.map(([sp]) => sp);
    // Egret Taun: lit, windows open to the sky; floor 2's garden rooms with columns and planter beds.
    assert.ok(L('LUVMHFM3U2V2T72').light && kinds('LUVMHFM3U2V2T72').filter((k) => k === 'window:open').length === 4);
    assert.equal(sprites('LUVMHGV3U2V2J7M').filter((sp) => sp === 'column_1').length, 8);
    assert.equal(sprites('LUVMHGV3U2V2J7M').filter((sp) => sp === 'firebog_planter_box_3x4').length, 4);
    // Sabudana Drama: braced posts on floors 1 and 4, the torn walls on floors 2 and 3, the room behind floor 1's last bay.
    assert.equal(sprites('LNV6EBBIS2V2JB8').filter((sp) => sp === 'wood_cover_middleplus').length, 6);
    assert.equal(kinds('LNV6EBBIS2V2JB8')[11], 'torn:room');
    assert.deepEqual([kinds('LNV6ECKIS2V26JU').filter((k) => k === 'torn').length, kinds('LNV6EDVIS2V2SFD').filter((k) => k === 'torn').length], [6, 6]);
    // Hakusan Heaps floor 2: the room seen through the torn left end.
    assert.deepEqual(kinds('LA9TBR62V2V23E2').slice(0, 2), ['torn:room', 'torn:room']);
    // Gregarious: bricks under the plaster on every floor, filing cabinets on floor 3.
    for (const src of ['LDOBRLULU2V24DS', 'LDOBRNDMU2V2Q34', 'LDOBROOMU2V2GCK']) assert.equal(L(src).bricks, true);
    assert.equal(sprites('LDOBROOMU2V2GCK').filter((sp) => sp === 'cubicle_cabinet_stack').length, 4);
    // Every lit floor has the sky through its windows; Hauki Seeks Manor's stay dark, as in their pictures.
    for (const f of BUILT) assert.deepEqual(street(f.tsid).gradient.top, f.tower.id === 'hauki' ? '0A0705' : '8FB9E6', f.label);
  });

  it('every floor shares Hauki Seeks Manor\'s plan of bays, the fallback default too', () => {
    const plan = (layout) => layout.bays.map(([a, b]) => `${a}..${b}`);
    assert.deepEqual(plan(HAUKI_FLOOR_1), plan(HAUKI_FLOOR_2));
    assert.deepEqual(plan(defaultTowerLayout(TOWER_FLOORS[3])), plan(HAUKI_FLOOR_1));
    for (const f of TOWER_FLOORS.filter((x) => x.tower.id !== 'hauki')) assert.deepEqual(plan(towerFloorLayout(f)), plan(HAUKI_FLOOR_1), f.label);
    assert.equal(HAUKI_PILASTERS.length, 14);
    // Floor 3's right side is the same bays (its left end is the barred room).
    HAUKI_FLOOR_3.bays.slice(-6).forEach(([a, b], i) => {
      const [c, d] = HAUKI_FLOOR_1.bays.slice(-6)[i];
      assert.ok(Math.abs(a - c) <= 8 && Math.abs(b - d) <= 8, `bay ${i}: ${a}..${b} vs ${c}..${d}`);
    });
    // Floor 1: the avatar stands at picture x 692 (world 127), the lobby XML's arrival 125.
    assert.ok(Math.abs(Math.round(692 * 3110 / 1280 - 1555) - towerFloorFor('LDOBRJIEU2V2Q2G').arrive.x) <= 4);
  });

  it('floor 3 keeps what the panorama shows (bays, doors, windows, holes, the lift centred, the rug)', () => {
    const kinds = HAUKI_FLOOR_3.bays.map(([, , k]) => k);
    assert.deepEqual(kinds.filter((k) => k === 'door').length, 3);
    assert.deepEqual(kinds.filter((k) => k === 'window').length, 3);
    assert.deepEqual(kinds.filter((k) => k === 'hole').length, 2);
    assert.deepEqual(HAUKI_FLOOR_3.bays.filter(([, , k]) => k === 'door').map(([, , , o]) => o.boards), ['cross', 'three', 'one']);
    // Picture px -> world: x * 3110 / 1280 - 1555. The avatar stands at picture x 695 (world 134),
    // where the lobby XML's arrival (131, -107) puts you; the lift door at picture x 638 (world 5).
    const px = (x) => Math.round(x * 3110 / 1280 - 1555);
    const floor3 = towerFloorFor('LHF9DOUO7K03OUA');
    assert.ok(Math.abs(px(695) - floor3.arrive.x) <= 6);
    assert.ok(Math.abs(px(638) - TOWER_LIFT.x) <= 8);
    assert.ok(Math.abs(px(693) - (HAUKI_FLOOR_3.rug[0] - HAUKI_FLOOR_3.rug[1] / 2)) <= 8);
    const s = street(floor3.tsid);
    assert.equal(s.barriers.length, 1, 'the barred room at the left end is closed off');
    assert.ok(s.barriers[0].x < floor3.arrive.x - 900);
  });

  it('draw only CC0 decos the game already ships; the panorama itself never ships', () => {
    for (const f of BUILT) {
      for (const layer of street(f.tsid).layers) {
        for (const d of layer.decos) {
          assert.ok(manifest.has(d.sprite), `${f.label}: ${d.sprite} in the deco manifest`);
          assert.ok(existsSync(join(pub, 'assets/decos/groddle', `${d.sprite}.webp`)), `${f.label}: ${d.sprite}`);
        }
      }
    }
    const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [e.name]));
    assert.ok(!walk(join(pub, 'assets')).some((n) => /tumblr|me4gckP3Ug1rlttf2o1/i.test(n)));
  });

  it('the fallback default layout (for a floor with no picture) varies per floor and is deterministic', () => {
    const shapes = new Set(TOWER_FLOORS.map((f) => JSON.stringify(defaultTowerLayout(f))));
    assert.ok(shapes.size >= 12);
    const f = TOWER_FLOORS[0];
    assert.deepEqual(defaultTowerLayout(f), defaultTowerLayout(f));
  });
});

describe('tower floors: the lifts', () => {
  it('each lobby lift names exactly its floors, now loaded, landing in front of each floor\'s lift', () => {
    for (const t of BUILT_TOWERS) {
      const lobby = street(t.lobby);
      const l = lift(lobby);
      assert.ok(l, `${t.label} has a lift`);
      const floors = l.connects.map((c) => towerFloorFor(c.tsid)).filter(Boolean);
      assert.deepEqual(floors.map((f) => f.source).sort(), t.floors.map((f) => f.source).sort());
      for (const c of l.connects) {
        const f = towerFloorFor(c.tsid);
        if (!f) continue;
        assert.equal(resolveLoadedTsid(c.tsid, loaded), f.tsid);
        assert.equal(c.label, f.label);
        assert.ok(landsOnFloor(street(f.tsid), c.arrive), `${c.label}: lands on the floor`);
        assert.deepEqual(c.arrive, { x: f.arrive.x - TOWER_FLOOR_BOUNDS.l, y: f.arrive.y - TOWER_FLOOR_BOUNDS.t });
      }
      assert.equal(towerForLobby(t.lobby), t);
    }
  });

  it('each floor\'s lift lists what its lobby\'s lists, in its order (tower.js copies one list), and every row leads somewhere loaded', () => {
    for (const f of BUILT) {
      const s = street(f.tsid);
      assert.equal(s.signposts.length, 1);
      const sign = s.signposts[0];
      assert.equal(sign.id, TOWER_FLOOR_SIGNPOST);
      assert.deepEqual([sign.x, sign.w, sign.h], [TOWER_LIFT.x, 392, 422], 'the lobby lift\'s size');
      const lobbyLift = lift(street(f.tower.lobby));
      assert.deepEqual(sign.connects.map((c) => [c.tsid, c.label]), lobbyLift.connects.map((c) => [c.tsid, c.label]));
      for (const c of sign.connects) {
        const to = resolveLoadedTsid(c.tsid, loaded);
        assert.ok(to, `${f.label}: ${c.label} is loaded`);
        assert.ok(c.arrive && landsOnFloor(street(to), c.arrive), `${f.label}: ${c.label} lands on a floor`);
      }
      assert.ok(sign.connects.some((c) => c.tsid.slice(1) === f.tower.lobby.slice(1)), 'back to the lobby');
    }
  });

  it('no lift row anywhere leads nowhere', () => {
    for (const t of BUILT_TOWERS) {
      for (const c of lift(street(t.lobby)).connects) assert.ok(resolveLoadedTsid(c.tsid, loaded), `${t.label}: ${c.label}`);
    }
  });

  it('every floor is reachable from its lobby and back (the arms), and T never picks the floor you are on', () => {
    for (const t of BUILT_TOWERS) {
      const lobby = street(t.lobby);
      for (const f of t.floors) {
        const into = lift(lobby).connects.find((c) => towerFloorFor(c.tsid) === towerFloorFor(f.source));
        assert.equal(pickConnection({ connects: [into] }, loaded).tsid, f.tsid);
        const s = street(f.tsid);
        const back = s.signposts[0].connects.find((c) => c.tsid.slice(1) === t.lobby.slice(1));
        const home = pickConnection({ connects: [back] }, loaded);
        assert.equal(home.tsid, t.lobby);
        assert.ok(landsOnFloor(lobby, home.arrive));
        // T at the lift: the first row that is not this floor.
        const here = f.arrive.x - TOWER_FLOOR_BOUNDS.l;
        const plan = planSignpostTravel(s, here, loaded, 140);
        assert.equal(plan.ok, true);
        assert.notEqual(plan.toTsid, f.tsid, `${f.label}: T leaves the floor`);
      }
      // And from the lobby, T takes the lift up (it used to name the lobby itself first at some lifts).
      const lobbyPlan = planSignpostTravel(lobby, lift(lobby).x - lobby.bounds.l, loaded, 140);
      assert.ok(lobbyPlan.ok && isTowerFloorTsid(lobbyPlan.toTsid), t.label);
    }
  });

  it('pickAwayConnection skips the street you stand on, and keeps it when it is the only one', () => {
    const sign = { connects: [{ tsid: 'LAAA', label: 'Here' }, { tsid: 'LBBB', label: 'There' }] };
    assert.equal(pickAwayConnection(sign, 'GAAA', ['GAAA', 'GBBB']).tsid, 'GBBB');
    assert.equal(pickAwayConnection(sign, 'GAAA', ['GAAA']).tsid, 'GAAA');
    assert.equal(pickAwayConnection(sign, 'GCCC', ['GAAA', 'GBBB']).tsid, 'GAAA');
  });

  it('the level builder\'s reach check passes on every floor, from every lift arrival', () => {
    for (const f of BUILT) {
      const s = street(f.tsid);
      const arrivals = BUILT.filter((o) => o.tower === f.tower)
        .map((o) => ({ x: f.arrive.x - TOWER_FLOOR_BOUNDS.l, y: f.arrive.y - TOWER_FLOOR_BOUNDS.t, from: o.label }));
      const report = validateShippedStreet(s, arrivals);
      const bad = report.findings.filter((x) => x.severity === 'error' || x.severity === 'fatal');
      assert.deepEqual(bad.map((x) => `${x.rule} ${x.message}`), [], f.label);
    }
  });

  it('matches the lobbies\' location XML: connect points, labels, quarter groups', { skip: !existsSync(locations) && 'location XML not beside this worktree' }, () => {
    for (const t of TOWERS) {
      const xml = readFileSync(join(locations, `${t.lobby}.xml`), 'utf8');
      assert.match(xml, new RegExp(`<str id="quarter">${t.quarter}</str>`));
      for (const f of t.floors) {
        const at = xml.indexOf(`tsid="${f.source}"`);
        assert.ok(at > 0, `${f.label} in ${t.lobby}.xml`);
        const block = xml.slice(xml.lastIndexOf('<object id=', at), xml.indexOf('</object>', at));
        const m = [/<int id="x">(-?\d+)<\/int>/.exec(block)?.[1], /<int id="y">(-?\d+)<\/int>/.exec(block)?.[1], /label="([^"]+)"/.exec(block)?.[1]];
        assert.deepEqual([Number(m[0]), Number(m[1]), m[2]], [f.arrive.x, f.arrive.y, f.label]);
        assert.ok(!existsSync(join(locations, `${f.tsid}.xml`)), `${f.label} was never archived`);
      }
    }
  });

  it('GSJS: apartment halls had eight units; tower lifts share one connects list', { skip: !existsSync(gsjs) && 'GSJS checkout not beside this worktree' }, () => {
    assert.match(readFileSync(join(gsjs, 'inc_data_pols_prod.js'), 'utf8'), /"apartment_8units"\t: \{/);
    assert.match(readFileSync(join(gsjs, 'locations/tower.js'), 'utf8'), /connects : utils\.copy_hash\(connects\)/);
  });
});

describe('tower floors: in the game', () => {
  it('the feature is registered and keeps each floor an empty room indoors', () => {
    assert.ok(FEATURES.some((f) => f.id === towerFloorsFeature.id));
    for (const f of BUILT) {
      const row = towerFloorsFeature.ecologyOverride({ tsid: f.tsid });
      assert.deepEqual(row, towerFloorEcology(f.tsid));
      const pop = populationForStreet(f.tsid, row);
      assert.deepEqual([pop.interior, pop.quoins, pop.piggies, pop.treeClasses.length, pop.vendor, pop.shrine], [true, 0, 0, 0, false, false]);
    }
    assert.equal(towerFloorsFeature.ecologyOverride({ tsid: 'GA9H1V6OGRU2FSB' }), null, 'lobbies keep their own row');
  });

  it('the plate draws the floor number and the QA data names the floor', () => {
    const data = {};
    const added = [];
    class Text { constructor({ text }) { this.text = text; this.anchor = { set() {} }; } destroy() { this.destroyed = true; } }
    const engine = { PIXI: { Text }, entityLayer: { addChild: (c) => { added.push(c); c.parent = { removeChild() {} }; } }, setData: (k, v) => { data[k] = v; } };
    const f = towerFloorFor('LHF9DOUO7K03OUA');
    towerFloorsFeature.onStreetEnter(street(f.tsid), engine);
    assert.equal(added[0].text, '3');
    assert.deepEqual([data.abandonedFloor, data.abandonedFloorLayout], ['hauki:3', 'panorama']);
    towerFloorsFeature.onStreetEnter(street('GA9H1V6OGRU2FSB'), engine);
    assert.equal(added[0].destroyed, true);
    assert.equal(data.abandonedFloor, '');
  });

  it('the re-lay how-to lives in tower-floors.js', () => {
    const src = readFileSync(join(pub, 'js/tower-floors.js'), 'utf8');
    assert.match(src, /Re-laying a floor from a panorama \(the how-to\)/);
    assert.match(src, /PANORAMA_LAYOUTS/);
  });
});
