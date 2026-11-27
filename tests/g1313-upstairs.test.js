/**
 * G1313, R5 (Austin 2026-11-25: "as Glitch: key holders and let-in visitors go upstairs; upper
 * floors shared like the ground floor"). Upper house floors were the owner's alone (G1249): the
 * realtime server let nobody else onto HOUSE_<id>_<floor>, the site sent no upper floor to a visit,
 * and a visitor's scene had no Door up. Glitch's house was one location, its floors stacked in it
 * (GameServerJS locations/inc_homes.js homes_add_floor_at 189-219) and joined by Doors with no verb
 * that asks who you are (items/furniture_door.js), so whoever pols_canEnter let into the house
 * (a key-holder, or someone the owner let in) walked every floor and shared what stood there.
 *
 * One rule, every floor of the house is the house: the server's homeOwner (homes.go
 * houseFloorOwner, houseStreets), the site's Neighbours::isHousePlace and the game's
 * js/home-floors.js housePlace / isHousePlace. Run: node --test tests/g1313-upstairs.test.js
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { Display, FakeEl, fakePixi } from './fake-scene.js';
import { HAS_SERVER, HAS_SITE, SITE_DIR, serverPath, sitePath } from '../tools/repos.mjs';
import { HAS_PHP, PHP } from './php.js';

globalThis.document ??= { baseURI: 'https://groddle.localhost/', createElement: (t) => new FakeEl(t), createTextNode: (t) => ({ text: t }), head: new FakeEl('head'), body: new FakeEl('body'), getElementById: () => null, querySelector: () => null };
class FakeTexture extends Display {
  constructor(opts = {}) {
    super();
    this.source = opts.source;
  }
}
FakeTexture.EMPTY = new Display();
FakeTexture.from = (src) => new FakeTexture({ source: src });
const pixi = new Proxy({ Container: Display, Graphics: Display, Sprite: Display, Text: Display, TilingSprite: Display, ImageSource: Display, Texture: FakeTexture }, {
  get: (t, k) => (k in t ? t[k] : fakePixi[k]),
});
globalThis.PIXI = pixi;
globalThis.Image ??= class { set src(_) {} };

const { visitorHomeScene, visitorHomeState } = await import('../public/js/features/homes-feature.js?v=cbae6b43');
const { housePlace, housePlaceFloor, isHousePlace } = await import('../public/js/home-floors.js?v=0565b551');
const { homeStreetFor, houseFloorStreet, normalizeHomeView, ownerStacksFor, readHomeStreet, readVisitScene, sharedHomeStreet, visitSceneTsid } = await import('../public/js/neighbours-mp.js?v=f024b835');
const { homePlaceOf, isFloorPlace, isSharedStreet } = await import('../public/js/drops-mp.js?v=351593a6');
const { visitGnomePlace } = await import('../public/js/garden-gnome.js?v=ace7fa8e');

const root = join(import.meta.dirname, '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');
const skipSite = !HAS_SITE ? 'no groddle-afternoon-site checkout' : !HAS_PHP ? 'no php' : false;
const php = (classes, body) => JSON.parse(execFileSync(PHP, ['-r', `foreach (${JSON.stringify(classes)} as $c) require ${JSON.stringify(SITE_DIR)} . "/src/$c.php"; ${body}`]).toString());

describe('R5: one rule for every floor of the house (js/home-floors.js)', () => {
  it('names each floor as a place, and knows a house place from any other', () => {
    assert.deepEqual([0, 1, 2, 3, -1, 'x'].map(housePlace), ['house', 'house:1', 'house:2', 'house:2', 'house', 'house']);
    assert.deepEqual(['house', 'house:1', 'house:2', 'house:3', 'house:0', 'tower:1', 'street', ''].map(isHousePlace), [true, true, true, false, false, false, false, false]);
    assert.deepEqual(['house', 'house:1', 'house:2', 'street'].map(housePlaceFloor), [0, 1, 2, -1]);
  });

  it('the realtime streets and visit scenes of every floor read as the house', () => {
    assert.equal(homeStreetFor(7, 'interior', 1), 'HOUSE_7_1');
    assert.equal(homeStreetFor(7, 'interior', 2), 'HOUSE_7_2');
    assert.equal(homeStreetFor(7, 'interior', 3), 'HOUSE_7', 'a floor no house has is the ground floor');
    assert.equal(houseFloorStreet(7, 1), 'HOUSE_7_1');
    assert.equal(houseFloorStreet(7, 0), '');
    for (const f of [1, 2]) {
      assert.deepEqual(readHomeStreet(`HOUSE_7_${f}`), { owner: 7, room: 'interior', floor: f });
      assert.deepEqual(homePlaceOf(`HOUSE_7_${f}`), { owner: 7, room: 'interior', floor: f }, 'the one parser (drops-mp.js)');
      assert.equal(isSharedStreet(`HOUSE_7_${f}`), true, 'drops there are everyone\'s');
      assert.equal(isFloorPlace(`HOUSE_7_${f}`), true, 'and join like stacks, as the ground floor\'s');
      assert.equal(visitSceneTsid(7, 'interior', f), `MPH_7_IN${f}`);
      assert.deepEqual(readVisitScene(`MPH_7_IN${f}`), { owner: 7, room: 'interior', floor: f });
      assert.equal(visitGnomePlace(readVisitScene(`MPH_7_IN${f}`)), `house:${f}`);
    }
    assert.equal(visitSceneTsid(7, 'interior'), 'MPH_7_IN');
    assert.equal(readVisitScene('MPH_7_IN3'), null);
    assert.equal(homePlaceOf('HOUSE_7_3'), null);
    // A visitor upstairs shares the floor's street with the owner there.
    assert.equal(sharedHomeStreet({ visit: { owner: 7, room: 'interior', floor: 1 }, me: 9 }), 'HOUSE_7_1');
    assert.equal(sharedHomeStreet({ me: 7, inHome: true, room: 'interior', houseFloor: 1 }), 'HOUSE_7_1');
  });

  it('the owner\'s stacks kept in their save on an upper floor show to a visitor there, locked, at their own x', () => {
    const view = normalizeHomeView({ owner: { id: 7, name: 'Ada' }, home: { owned: true }, stacks: [
      { id: 'w1', place: 'house', c: 'cherry', n: 1, x: 100, y: 620 },
      { id: 'w2', place: 'house:1', c: 'cherry', n: 2, x: 300, y: 620 },
      { id: 'w3', place: 'house:3', c: 'cherry', n: 2, x: 300, y: 620 },
    ] });
    assert.deepEqual(view.stacks.map((s) => s.place), ['house', 'house:1']);
    const up = ownerStacksFor(view, 'interior', { floor: 1, roomX: 750, tsid: 'MPH_7_IN1' });
    assert.deepEqual(up.map((s) => [s.count, s.x, s.ownerLocked]), [[2, 300, true]], 'no back yard pushes an upper floor along');
    assert.deepEqual(ownerStacksFor(view, 'interior', { floor: 0, roomX: 750 }).map((s) => s.x), [850]);
  });
});

/** A visit to Ada's two-floor house: the ground floor's Door up at 600, the second floor's down at 300. */
const VIEW = {
  owner: { id: 7, name: 'Ada' },
  home: { style: 'meadow' },
  homes: {
    cult: { items: [] },
    backYard: { items: [] },
    decor: { wallSegments: 9, placed: [{ id: 3, classTsid: 'furniture_door', slot: 'floor', x: 600, y: 620, facingRight: true, z: 1, on: null }] },
    floors: {
      upper: [{ placed: [
        { id: 1, classTsid: 'furniture_door', slot: 'floor', x: 300, y: 620, facingRight: true, z: 1, on: null },
        { id: 2, classTsid: 'furniture_chair', slot: 'floor', x: 800, y: 620, facingRight: true, z: 2, on: null },
      ] }],
      links: [{ floor: 0, up: 3, down: 1, upX: 600, downX: 300 }],
    },
  },
};

function sceneEngine() {
  const layer = new Display();
  const base = { PIXI: pixi, entityLayer: layer, fxLayer: new Display(), spawnGarden: () => null };
  return new Proxy(base, { get: (t, k) => (k in t ? t[k] : typeof k === 'symbol' || String(k).startsWith('spawn') ? undefined : new Display()) });
}

describe('a visitor walks the owner\'s floors (homes-feature visitorHomeScene)', () => {
  it('reads the upper floors and their Doors from the visit', () => {
    const v = visitorHomeState(VIEW);
    assert.equal(v.floors.upper.length, 1);
    assert.deepEqual(v.floors.links, [{ floor: 0, up: 3, down: 1, upX: 600, downX: 300 }]);
    assert.equal(visitorHomeState({ ...VIEW, homes: { ...VIEW.homes, floors: undefined } }).floors.upper.length, 0);
  });

  it('the ground floor\'s Door leads up; the second floor is its own room with its furniture and a Door down', () => {
    const engine = sceneEngine();
    const ground = visitorHomeScene(engine, VIEW, 'interior');
    assert.equal(ground.floor, 0);
    const g = ground.populate(engine);
    assert.ok(g.door, 'the front door');
    assert.deepEqual(g.doors.map((d) => [d.id, d.dest]), [[3, { floor: 1, x: 300, dir: 'up' }]]);
    assert.equal(g.doors[0].label, 'Up to the second floor');
    // Drawn where the owner's piece stands (normalized as the owner's own house reads it), past the back yard.
    assert.equal(g.doors[0].sprite.x, g.roomX + visitorHomeState(VIEW).decor.placed.find((p) => p.id === 3).x);
    assert.ok(!g.pieces.some((p) => p.item.id === 3), 'the Door between floors is its own target, not a piece');

    const up = visitorHomeScene(engine, VIEW, 'interior', { floor: 1 });
    assert.equal(up.floor, 1);
    assert.equal(up.spawnX, 300, 'at the Door down, as the owner arrives');
    const u = up.populate(engine);
    assert.equal(u.door, null, 'no front door upstairs');
    assert.equal(u.roomX, 0);
    assert.deepEqual(u.doors.map((d) => [d.id, d.dest]), [[1, { floor: 0, x: 600, dir: 'down' }]]);
    assert.deepEqual(u.pieces.map((p) => p.item.classTsid), ['furniture_chair']);
    assert.equal(u.gardens.length, 0, 'no back yard upstairs');

    // Down again: beside the Door up.
    const back = visitorHomeScene(engine, VIEW, 'interior', { floor: 0, doorX: 600 });
    assert.equal(back.spawnX, back.populate(engine).roomX + 600);
    // A floor the house does not have (or a view the site kept outside) is the ground floor.
    assert.equal(visitorHomeScene(engine, VIEW, 'interior', { floor: 2 }).floor, 0);
  });

  it('the visit registers each Door with Go up / Go down and walks through it (neighbours-mp-feature)', () => {
    const src = read('public/js/features/neighbours-mp-feature.js');
    assert.match(src, /const CLASS_STAIRS = 'mp_home_floor_door';/);
    assert.match(src, /t\.stairs = \(spots\.doors \|\| \[\]\)\.map\(\(d\) => engine\.register\(\{ classId: CLASS_STAIRS/);
    assert.match(src, /label: dest\.dir === 'up' \? 'Go up' : 'Go down'/);
    assert.match(src, /show\('interior', \{ floor: dest\.floor, doorX: dest\.x, via: 'door' \}\)/);
    assert.match(src, /visit\.floor = room === 'tower' \|\| room === 'interior' \? Number\(built\.floor\) \|\| 0 : 0;/);
    // A walk-out from upstairs takes the upper floors from the copy too.
    assert.match(src, /delete homes\.decor;\s+delete homes\.floors;/);
  });

  it('upstairs keeps the ground floor\'s own things to the ground floor: back yard, boxes, poles and sales', () => {
    assert.match(read('public/js/features/yard-verbs-mp-feature.js'), /scene\.floor > 0 \|\| loading === tsid\) return;/);
    assert.match(read('public/js/features/home-storage-feature.js'), /info\?\.room !== 'interior' \|\| Number\(info\?\.floor\) > 0\)/);
    assert.match(read('public/js/features/home-street-mp-feature.js'), /if \(!visit\?\.data \|\| where\(\) !== 'visit' \|\| visit\.floor > 0\) return;/);
  });
});

describe('the site: every floor of the house goes to whoever may enter (Neighbours.php)', { skip: skipSite }, () => {
  const state = { systems: { features: { homes: {
    decor: { placed: [{ id: 3, classTsid: 'furniture_door' }] },
    floors: { at: 1, pending: null, upper: [{ placed: [{ id: 5, classTsid: 'bag_furniture_cabinet', contents: [{ c: 'apple', n: 3 }] }] }], links: [{ floor: 0, up: 3, down: 1, upX: 600, downX: 300 }] },
    cult: { items: [] },
  } } } };

  it('isHousePlace is the one rule', () => {
    assert.deepEqual(php(['Neighbours'], `use Groddle\\Minn\\Neighbours as N; echo json_encode(array_map([N::class, 'isHousePlace'], ['house', 'house:1', 'house:2', 'house:3', 'tower:1', 'street']));`), [true, true, true, false, false, false]);
  });

  it('the homes slice carries the upper floors and their Doors, never a cabinet\'s contents', () => {
    const slice = php(['WordFilter', 'Neighbours'], `echo json_encode(Groddle\\Minn\\Neighbours::homesSlice(json_decode(${JSON.stringify(JSON.stringify(state))})));`);
    assert.deepEqual(slice.floors.links, [{ floor: 0, up: 3, down: 1, upX: 600, downX: 300 }]);
    assert.equal(slice.floors.upper[0].placed[0].classTsid, 'bag_furniture_cabinet');
    assert.equal(slice.floors.upper[0].placed[0].contents, undefined);
    assert.equal(slice.floors.at, undefined, 'not where the owner stands');
    const bare = php(['WordFilter', 'Neighbours'], `echo json_encode(Groddle\\Minn\\Neighbours::homesSlice(json_decode(${JSON.stringify(JSON.stringify(state))}), false));`);
    assert.equal(bare.floors, undefined, 'the yard and machine answers read none');
  });

  it('forVisitor: inside, every floor; outside, no floor and nothing on one', () => {
    const view = {
      homes: { decor: { placed: [] }, floors: { upper: [{ placed: [] }], links: [] }, cult: { items: [] } },
      gnomes: [{ id: 'g1', place: 'street' }, { id: 'g2', place: 'house:1' }],
      stacks: [{ id: 's1', place: 'house:2' }, { id: 's2', place: 'tower:0' }],
      icons: [{ id: 'icon1', place: 'house:1' }, { id: 'icon2', place: 'street' }],
    };
    const answer = (inside) => php(['Neighbours'], `use Groddle\\Minn\\Neighbours as N; $v = json_decode(${JSON.stringify(JSON.stringify(view))}, true); $v['homes'] = json_decode(json_encode($v['homes'])); echo json_encode(N::forVisitor($v, ${inside ? 'true' : 'false'}));`);
    const out = answer(false);
    assert.equal(out.homes.floors, undefined);
    assert.deepEqual([out.gnomes.map((r) => r.id), out.stacks.map((r) => r.id), out.icons.map((r) => r.id)], [['g1'], ['s2'], ['icon2']]);
    const inside = answer(true);
    assert.equal(inside.homes.floors.upper.length, 1);
    assert.deepEqual([inside.gnomes.length, inside.stacks.length, inside.icons.length], [2, 2, 2]);
  });

  it('a drop on an upper floor is the house\'s at the ledger (LedgerDrop::floorOwner), and an Icon there is reached as the ground floor\'s', () => {
    const owners = php(['LedgerDrop'], `use Groddle\\Minn\\LedgerDrop as D; echo json_encode(array_map([D::class, 'floorOwner'], ['HOUSE-7', 'HOUSE-7-1', 'HOUSE-7-2', 'HOUSE-7-3', 'HOUSE-7-0', 'TOWER-7-1', 'HOME-7']));`);
    assert.deepEqual(owners, [7, 7, 7, 0, 0, 7, 0]);
    const icons = readFileSync(sitePath('src/HomeIcons.php'), 'utf8');
    assert.match(icons, /Neighbours::isHousePlace\(\$place\) && !\(new Neighbours\(\$this->minn\)\)->mayEnter\(\$request, \$owner, \$me\)/);
  });
});

describe('the realtime server: every floor of the house is the house (homes.go)', { skip: !HAS_SERVER && 'no groddle-afternoon-server checkout' }, () => {
  it('homeOwner reads every floor; no owner-only gate is left; walk-outs and drops reach every floor', () => {
    const homes = readFileSync(serverPath('homes.go'), 'utf8');
    assert.match(homes, /func homeOwner\(street string\) \(owner int64, house bool\) \{\n\tif o, _ := houseFloorOwner\(street\); o > 0 \{\n\t\treturn o, true/);
    assert.doesNotMatch(homes, /An upper house floor is the owner's own room \(G153\): nobody else joins it/);
    assert.match(homes, /for _, street := range houseStreets\(id\) \{/);
    const drops = readFileSync(serverPath('drops.go'), 'utf8');
    assert.match(drops, /dropFloorSiteRe = regexp\.MustCompile\(`\^HOUSE-\(\[1-9\]\[0-9\]\{0,17\}\)-\(\[12\]\)\$`\)/);
    // The Go tests: TestEveryFloorOfTheHouseIsTheHouse, TestLetInAndSummonedVisitorsGoUpstairs,
    // TestWalkOutsReachEveryFloor, TestAnUpperHouseFloorsDropsAreShared.
    const tests = readFileSync(serverPath('homes_test.go'), 'utf8');
    for (const name of ['TestEveryFloorOfTheHouseIsTheHouse', 'TestLetInAndSummonedVisitorsGoUpstairs', 'TestWalkOutsReachEveryFloor']) assert.match(tests, new RegExp(`func ${name}\\(`));
  });
});
