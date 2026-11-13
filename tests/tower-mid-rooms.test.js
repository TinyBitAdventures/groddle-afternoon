/**
 * Jethimadh Tower: Mid (G41): the rebuilt Stairs and Mezzanine
 * (js/tower-mid-rooms.js, tools/build-tower-rooms.mjs), the Greeterbot,
 * museum door and Stoot Shrine teleporters (features/mid-tower-feature.js).
 * The Hall of Rejected Concepts behind the Mezzanine (G73) has its own file,
 * tests/hall-rejected-concepts.test.js.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { GRAVITY, JUMP_SPEED, WALK_MAX } from '../public/js/avatar-step.js?v=43b1182e';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FRAME_DT_CAP, assertStreetGeometry, platformYAt, resolveGround } from '../public/js/street-model.js?v=b6cb6a4e';
import { insideBottomRect } from '../public/js/doors.js?v=727d0e0b';
import {
  GREETERBOT,
  HALL_TSID,
  MEZZ,
  MEZZANINE_TSID,
  MID_TOWER_DOOR_LINKS,
  MID_TOWER_ROOMS,
  MUSEUM_DOOR_ID,
  STAIRS,
  STAIRS_TSID,
  STOOT_RETURN,
  STOOT_SHRINE_TSID,
  STOOT_TELEPORTER_ID,
  TOWER_ST_WEST_TSID,
  boxToScreen,
  midTowerRoomByTsid,
  midTowerRoomStreet,
} from '../public/js/tower-mid-rooms.js?v=678fdc50';
import { greet, greeterAction, midTowerFeature } from '../public/js/features/mid-tower-feature.js?v=4903d734';
import { towerRoomsFeature } from '../public/js/features/tower-rooms-feature.js?v=6085c4f0';
import { populationForStreet } from '../public/js/street-ecology.js?v=c8d6fa5b';
import { reachStreet } from '../public/js/builder/reach-graph.js?v=d03eeab1';

const spike = join(dirname(fileURLToPath(import.meta.url)), '..');
const streets = join(spike, 'public/assets/streets');
const street = (tsid) => JSON.parse(readFileSync(join(streets, `${tsid}.json`), 'utf8'));
const index = JSON.parse(readFileSync(join(streets, 'index.json'), 'utf8')).streets;
const mapsFile = join(spike, '../glitch-GameServerJS/inc_data_maps_prod.js');
const stairs = midTowerRoomByTsid(STAIRS_TSID);
const mezz = midTowerRoomByTsid(MEZZANINE_TSID);
const DOOR_H = mezz.doors[0].h;

/** Plain jump in remake units (js/avatar-step.js, the client's numbers), as tests/tower-rooms.test.js. */
const JUMP = { vy: -JUMP_SPEED, g: GRAVITY, vx: WALK_MAX };
const APEX = JUMP.vy ** 2 / (2 * JUMP.g);
function reach(rise) {
  const disc = JUMP.vy ** 2 - 2 * JUMP.g * rise;
  if (disc < 0) return -1;
  return ((JUMP.vy + Math.sqrt(disc)) / JUMP.g) * JUMP.vx;
}
const floors = (room) => room.platforms.filter((p) => p.pc_perm === -1);
const lowestFloor = (room) => Math.max(...floors(room).flatMap((p) => [p.y1, p.y2]));
/** The floor under x nearest to y (world). */
function floorAt(platforms, x, y) {
  let best = null;
  for (const p of platforms) {
    if (p.pc_perm !== -1 || x < p.x1 || x > p.x2) continue;
    const fy = p.x2 === p.x1 ? p.y1 : p.y1 + ((x - p.x1) / (p.x2 - p.x1)) * (p.y2 - p.y1);
    if (best == null || Math.abs(fy - y) < Math.abs(best - y)) best = fy;
  }
  return best;
}

describe('Jethimadh Tower: Mid rooms: street data', () => {
  it('are written and indexed under hub 96 with the source names', () => {
    for (const room of MID_TOWER_ROOMS) {
      const json = street(room.tsid);
      assert.equal(json.label, room.label);
      assert.equal(json.reconstructed, true);
      assertStreetGeometry(json);
      assert.equal(index[room.tsid].hubId, '96');
      assert.equal(index[room.tsid].hubName, 'Jethimadh Tower: Mid');
    }
    assert.deepEqual(MID_TOWER_ROOMS.map((r) => r.sourceTsid), ['LIFFUV4ATQ72I6D', 'LIFGJ2246R72LJL', 'LA9L33D5CNE3I0J']);
  });

  it('keep the hub 96 names from inc_data_maps_prod.js', { skip: !existsSync(mapsFile) && 'GSJS checkout not beside this worktree' }, () => {
    const maps = readFileSync(mapsFile, 'utf8');
    assert.match(maps, /"LIFFUV4ATQ72I6D"\s*:\s*"Stairs"/);
    assert.match(maps, /"LIFGJ2246R72LJL"\s*:\s*"Mezzanine"/);
    assert.match(maps, /"name"\s*:\s*"Jethimadh Tower: Mid"/);
  });

  it('use only art on disk (decos, the Greeterbot\'s widgetWood frame)', () => {
    const decos = join(spike, 'public/assets/decos/groddle');
    for (const room of MID_TOWER_ROOMS) {
      for (const d of room.decos) assert.ok(existsSync(join(decos, `${d.sprite}.webp`)), `${room.label}: ${d.sprite}`);
      for (const d of room.doors) assert.ok(existsSync(join(decos, `${d.sprite}.webp`)), `${room.label}: ${d.sprite}`);
    }
    assert.ok(existsSync(join(spike, 'public', GREETERBOT.art)));
  });

  it('the Stairs keep the corridor set (G72 Snap) with an EXIT plaque by the low door, in front of both flights and clear of the FG pillar', () => {
    const plaques = stairs.decos.filter((d) => d.sprite === 'jethimadh_int_door_sign');
    const signs = stairs.decos.filter((d) => d.signText).map((d) => d.signText);
    assert.deepEqual(signs, ['EXIT', 'Mezzanine']);
    const backdrop = Math.max(...stairs.decos.filter((d) => d.layer === 'mg' && !d.signText && d.sprite !== 'jethimadh_int_door_sign').map((d) => d.z));
    for (const p of plaques) assert.ok(p.z > backdrop, `plaque z ${p.z} over ${backdrop}`);
    const exit = plaques.find((p) => Math.abs(p.y - (stairs.doors[0].y - 70)) <= 1);
    const out = stairs.doors.find((d) => d.connect.label === 'Tower St West');
    assert.ok(exit.x > out.x && exit.x - out.x < 450);
    for (const pillar of stairs.decos.filter((d) => d.layer === 'fg' && /pillar/.test(d.sprite) && d.y > out.y - 600)) {
      assert.ok(Math.abs(pillar.x - exit.x) >= (pillar.w + exit.w) / 2 - 20, `pillar at ${pillar.x} covers the plaque at ${exit.x}`);
    }
    assert.match(stairs.why.decor, /firebog\/1316548751\.swf/);
  });

  it('keep 300+ px of world under the lowest floor', () => {
    for (const room of MID_TOWER_ROOMS) assert.ok(room.bounds.b - lowestFloor(room) >= 300, room.label);
  });

  it('the Mezzanine keeps unnnn\'s clone data: top, floor height, the street-sized Rook Hall spotlights at their world positions', () => {
    const unnnn = street(STOOT_SHRINE_TSID);
    assert.equal(mezz.bounds.t, unnnn.bounds.t);
    assert.equal(unnnn.platforms[0].y1, MEZZ.floor);
    const layer = unnnn.layers.find((l) => l.id === 'T_1311832165202');
    assert.equal(layer.w, unnnn.bounds.r - unnnn.bounds.l); // street-sized: no parallax
    const archived = layer.decos.filter((d) => d.sprite === 'rookhall_spotlight').map((d) => `${d.x + unnnn.bounds.l},${d.y + unnnn.bounds.t},${d.w},${d.h},${d.r || 0}`).sort();
    const rebuilt = mezz.decos.filter((d) => d.sprite === 'rookhall_spotlight').map((d) => `${d.x},${d.y},${d.w},${d.h},${d.r}`).sort();
    assert.equal(archived.length, 11);
    assert.deepEqual(rebuilt, archived);
  });

  it('R5 (post 57550578382): the lobby is the picture\'s width, ~1,560 px at the Greeterbot\'s and the door\'s own scale (unnnn\'s clone was 1,000)', () => {
    // The picture: 1,280 px from the lobby's left end to the far pillar; the Greeterbot (72 x 84 art) is ~64 x 69 px in it, the arched door (196 x 214) ~164 x 185.
    const scale = [72 / 64, 84 / 69, 196 / 164, 214 / 185];
    const k = scale.reduce((a, b) => a + b) / scale.length;
    const width = mezz.bounds.r - mezz.bounds.l;
    assert.ok(Math.abs(width - 1290 * k) < 60, `width ${width} vs ${Math.round(1290 * k)}`);
    assert.ok(width > street(STOOT_SHRINE_TSID).bounds.r - street(STOOT_SHRINE_TSID).bounds.l);
    // Pillars: one between the EXIT arrow and the Rook Museum plaque, two past the Hall door (the nearer in front).
    const pillars = mezz.decos.filter((d) => d.sprite === 'jethimadh_int_pillar_1').sort((a, b) => a.x - b.x);
    assert.equal(pillars.length, 3);
    const sign = (text) => mezz.decos.find((d) => d.signText === text);
    assert.ok(pillars[0].x > sign('EXIT').x && pillars[0].x < sign('Rook\nMuseum').x);
    const hallDoor = mezz.doors.find((d) => d.id === 'door_mz_hall');
    assert.ok(pillars[1].x > hallDoor.x + hallDoor.w / 2 && pillars[2].layer === 'fg');
    // The floor: the firebog room floor slab over warm floorboards; no lanterns.
    assert.ok(mezz.decos.some((d) => d.sprite === 'room_background3a_floor'));
    assert.equal(mezz.decos.filter((d) => d.sprite === 'jethimadh_int_lantern_1').length, 0);
    const manifest = new Set(JSON.parse(readFileSync(join(spike, 'public/assets/decos/manifest.json'), 'utf8')));
    for (const d of mezz.decos) assert.ok(manifest.has(d.sprite), `${d.sprite} is shipped CC0 deco art`);
  });

  it('G88: the footage order, left to right: Stairs door, EXIT arrow pointing left, Rook Museum plaque, museum door with the Greeterbot, Hall plaque and door', () => {
    const signs = mezz.decos.filter((d) => d.signText);
    assert.deepEqual(signs.map((d) => d.signText).sort(), ['EXIT', 'Hall of Rejected\nConcepts', 'Rook\nMuseum'].sort());
    const exit = signs.find((d) => d.signText === 'EXIT');
    const museumSign = signs.find((d) => d.signText === 'Rook\nMuseum');
    assert.equal(exit.sprite, 'sign_arrow_1');
    assert.equal(exit.flip, true, 'the arrow points left, back at the Stairs door');
    const door = (label) => mezz.doors.find((d) => d.connect.label === label);
    const stairsDoor = door('Stairs');
    const museumDoor = door('Museum of the Rook');
    const hallSign = signs.find((d) => d.signText === 'Hall of Rejected\nConcepts');
    const hallDoor = door('Hall of Rejected Concepts');
    const xs = [stairsDoor.x, exit.x, museumSign.x, museumDoor.x, hallSign.x, hallDoor.x];
    assert.deepEqual(xs, [...xs].sort((a, b) => a - b));
    // Beside the doors, not over them (R5: the Hall plaque left of its door too): clear of the door frames, and hung within the doors' height.
    const clear = (sign, d) => Math.abs(sign.x - d.x) >= (sign.w + d.w) / 2;
    assert.ok(clear(exit, stairsDoor) && clear(museumSign, museumDoor) && clear(hallSign, hallDoor) && clear(hallSign, museumDoor));
    assert.ok(exit.x + exit.w / 2 <= museumSign.x - museumSign.w / 2);
    for (const s of [exit, museumSign, hallSign]) assert.ok(s.y > MEZZ.floor - DOOR_H && s.y - s.h < MEZZ.floor - 60, s.signText);
    // The Greeterbot stands in front of the museum door, a little left of its middle.
    assert.ok(mezz.greeterbot.x < museumDoor.x && museumDoor.x - mezz.greeterbot.x < museumDoor.w / 4);
    assert.match(readFileSync(join(spike, 'public/js/tower-mid-rooms.js'), 'utf8'), /i11hPtqFN8E/);
    // The street JSON carries the text (tower-rooms-feature paints it).
    const mg = street(MEZZANINE_TSID).layers.find((l) => l.id === 'middleground');
    assert.deepEqual(mg.decos.filter((d) => d.signText).map((d) => d.signText).sort(), signs.map((d) => d.signText).sort());
  });
});

describe('Jethimadh Tower: Mid rooms: doors', () => {
  it('Tower St West\'s archived tower door leads into the Stairs at its archived arrival', () => {
    assert.deepEqual(MID_TOWER_DOOR_LINKS, [{ street: TOWER_ST_WEST_TSID, door: 'door_1313235999202', room: STAIRS_TSID }]);
    const door = street(TOWER_ST_WEST_TSID).doors.find((d) => d.id === 'door_1313235999202');
    assert.equal(door.connect.street, STAIRS_TSID);
    assert.deepEqual([door.connect.x, door.connect.y], [STAIRS.arrival.x, STAIRS.arrival.y]);
    const floor = floorAt(stairs.platforms, STAIRS.arrival.x, STAIRS.arrival.y);
    assert.ok(Math.abs(floor - STAIRS.arrival.y) <= 2);
    assert.deepEqual(door.connect.arrive, { x: STAIRS.arrival.x - stairs.bounds.l, y: Math.round(floor - stairs.bounds.t) });
  });

  it('the Stairs lead back out to the tower door and up to the Mezzanine; the Mezzanine back down', () => {
    const st = street(STAIRS_TSID);
    const out = st.doors.find((d) => d.connect.label === 'Tower St West');
    assert.equal(out.connect.street, TOWER_ST_WEST_TSID);
    const tsw = street(TOWER_ST_WEST_TSID).doors[0];
    assert.ok(Math.abs(out.connect.arrive.x - tsw.x) <= 2 && Math.abs(out.connect.arrive.y - tsw.y) <= 4, 'arrives at the tower door');
    const up = st.doors.find((d) => d.connect.label === 'Mezzanine');
    assert.equal(up.connect.street, MEZZANINE_TSID);
    const mz = street(MEZZANINE_TSID);
    const down = mz.doors.find((d) => d.connect.label === 'Stairs');
    assert.equal(down.connect.street, STAIRS_TSID);
    assert.deepEqual(up.connect.arrive, { x: down.x, y: down.y });
    assert.deepEqual(down.connect.arrive, { x: up.x, y: up.y });
  });

  it('the museum door has no street (the museum is the quest instance); the Hall door leads to the rebuilt Hall (G73)', () => {
    const mz = street(MEZZANINE_TSID);
    const museum = mz.doors.find((d) => d.id === MUSEUM_DOOR_ID);
    assert.equal(museum.connect.tsid, 'LA91BDTNHS82D36');
    assert.equal(museum.connect.street, null);
    const hall = mz.doors.find((d) => d.connect.tsid === 'LA9L33D5CNE3I0J');
    assert.equal(hall.connect.label, 'Hall of Rejected Concepts');
    assert.equal(hall.connect.street, 'GA9L33D5CNE3I0J');
    assert.equal(mezz.hallLock, undefined, 'the Hall door is no longer locked');
  });
});

describe('Jethimadh Tower: Mid rooms: the climb', () => {
  /** Walk along a chain of floor segments: every gap is a plain running jump. */
  function assertChain(segs, label) {
    const sorted = [...segs].sort((a, b) => a.x1 - b.x1);
    for (let i = 1; i < sorted.length; i += 1) {
      const a = sorted[i - 1];
      const b = sorted[i];
      if (b.x1 <= a.x2 + 1) {
        assert.ok(Math.abs(b.y1 - a.y2) <= 30, `${label}: ${a.id} -> ${b.id} joint`);
        continue;
      }
      // Either way along the flight: the harder (upward) direction must be a plain jump.
      const gap = b.x1 - a.x2;
      const rise = Math.abs(a.y2 - b.y1);
      assert.ok(rise < APEX - 10 && gap < reach(rise) - 20, `${label}: ${a.id} -> ${b.id} gap ${gap} rise ${rise}`);
    }
  }

  it('R5 (post 57559495026): one straight tube climbs from the arrival to the Mezzanine door with walks and plain jumps', () => {
    assertChain(floors(stairs).filter((p) => p.y1 > stairs.bounds.t + 100), 'the tube');
    assert.deepEqual(stairs.ladders, []);
    const { low, high } = stairs.flight;
    const out = stairs.doors.find((d) => d.connect.label === 'Tower St West');
    const up = stairs.doors.find((d) => d.connect.label === 'Mezzanine');
    assert.ok(out.x < low.x + 200 && up.x > high.x, 'EXIT at the low left end, the Mezzanine door at the high right end');
    assert.equal(floorAt(stairs.platforms, up.x, up.y), up.y);
    const deg = (Math.atan2(low.y - high.y, high.x - low.x) * 180) / Math.PI;
    assert.ok(deg > 7 && deg < 9, `climbs ${deg.toFixed(1)} degrees`);
  });

  it('R5: one frame round the whole tube, past both doors', () => {
    const frames = stairs.decos.filter((d) => d.sprite === 'jethimadh_int_frame_50percent');
    assert.equal(frames.length, 1);
    const [f] = frames;
    const half = (f.w / 2) * Math.cos((f.r * Math.PI) / 180);
    for (const d of stairs.doors) assert.ok(Math.abs(d.x - f.x) < half - 50, `${d.id} inside the frame`);
    assert.ok(stairs.decos.filter((d) => /pillar/.test(d.sprite)).length >= 8);
    assert.ok(stairs.decos.filter((d) => d.sprite === 'jethimadh_int_lantern_1').length >= 8);
  });

  it('the Mezzanine: floorboards solid from below, a drop past the far pillar and a ladder back up', () => {
    const under = mezz.platforms.find((p) => p.id === 'plat_mz_floor_underside');
    assert.equal(under.pc_perm, 1);
    const [ladder] = mezz.ladders;
    assert.ok(ladder.x - ladder.w / 2 > under.x2, 'the ladder shaft is open');
    assert.equal(ladder.y, MEZZ.crawl);
    assert.equal(ladder.y - ladder.h, MEZZ.floor);
    assert.equal(floorAt(mezz.platforms, ladder.x, MEZZ.floor), MEZZ.floor, 'deck over the ladder top');
    assert.ok(MEZZ.crawl - MEZZ.floor > APEX * 2, 'no jumping up through the floorboards');
    // d4IOWnzw0Y0 t0003-t0005: walking on past the far pillar drops you under the floor.
    const wall = mezz.barriers.find((b) => b.id === 'wall_mz_right');
    const lobby = mezz.platforms.find((p) => p.id === 'plat_mz_floor');
    assert.ok(wall.x - lobby.x2 >= 40, 'a drop between the floor\'s end and the wall');
    assert.equal(floorAt(mezz.platforms, (wall.x + lobby.x2) / 2, MEZZ.floor), MEZZ.crawl);
    const front = mezz.decos.find((d) => d.sprite === 'jethimadh_int_pillar_1' && d.layer === 'fg');
    assert.ok(Math.abs(front.x - ladder.x) < front.w / 2, 'the near pillar stands in front of the way down');
  });

  it('R5 (post 57550578382): six currant quoins in a row under the floorboards, each a grab from the crawlspace floor', () => {
    assert.equal(mezz.quoins.length, 6);
    const xs = mezz.quoins.map((q) => q.x);
    assert.deepEqual(xs, [...xs].sort((a, b) => a - b));
    // game.js grabs a quoin within 44 px of (feet x, feet - 28); a plain jump lifts the feet APEX px.
    for (const q of mezz.quoins) {
      assert.equal(q.type, 'currants');
      assert.equal(q.quoinClass, 'slow medium-large currants');
      assert.ok(q.y > MEZZ.underside && q.y < MEZZ.crawl, 'under the floorboards, over the crawlspace floor');
      assert.equal(floorAt(mezz.platforms, q.x, MEZZ.crawl), MEZZ.crawl);
      assert.ok(MEZZ.crawl - q.y - 28 - 44 < APEX, `quoin at ${q.x} within a jump`);
      assert.ok(q.x > mezz.teleports[0].x + mezz.teleports[0].w / 2, 'clear of the teleporter');
    }
    // The feature hands them to game.js in screen space; elsewhere it stays out of the way.
    const spots = midTowerFeature.quoinSpots(street(MEZZANINE_TSID));
    assert.deepEqual(spots.map((q) => [q.x, q.y]), mezz.quoins.map((q) => [q.x - mezz.bounds.l, q.y - mezz.bounds.t]));
    assert.ok(spots.every((q) => q.exactY && q.type === 'currants'));
    assert.equal(midTowerFeature.quoinSpots(street(STAIRS_TSID)), null);
    assert.equal(midTowerFeature.quoinSpots({ tsid: 'GIF15OTSM102353' }), null);
    const game = readFileSync(join(spike, 'public/game.js'), 'utf8');
    assert.match(game, /features\.query\('quoinSpots', data, engine\)/);
    assert.match(game, /useExactY: spot\.exactY === true/);
  });

  it('the level builder\'s reach graph: every door from every way in, the crawlspace and its way back up, no traps', () => {
    const json = street(MEZZANINE_TSID);
    const arrivals = [
      ...[street(STAIRS_TSID).doors.find((d) => d.connect.street === MEZZANINE_TSID), street(HALL_TSID).doors.find((d) => d.connect.street === MEZZANINE_TSID)]
        .map((d) => ({ x: d.connect.arrive.x, y: d.connect.arrive.y, from: d.id })),
      { x: STOOT_RETURN.to.x - mezz.bounds.l, y: STOOT_RETURN.to.y - mezz.bounds.t, from: 'unnnn' },
    ];
    const r = reachStreet(json, arrivals);
    assert.ok(r.arrivals.every((a) => a.stands));
    for (const t of r.targets) assert.deepEqual(t.reachedFrom, [true, true, true], t.id);
    assert.deepEqual(r.unreached, []);
    assert.deepEqual(r.traps, []);
    assert.deepEqual(r.deckless, []);
    assert.ok(r.surfaces.filter((x) => x.line === 'plat_mz_crawl').every((x) => x.reached));
  });
});

describe('Jethimadh Tower: Mid rooms: the Stoot Shrine teleporters', () => {
  const mzJson = street(MEZZANINE_TSID);
  const tp = mzJson.boxes.find((b) => b.id === STOOT_TELEPORTER_ID);
  const crawlY = MEZZ.crawl - mezz.bounds.t;

  it('a plain jump at the crawlspace\'s left end reaches the teleporter; standing does not', () => {
    assert.ok(!insideBottomRect(tp, tp.x, crawlY), 'standing');
    assert.ok(insideBottomRect(tp, tp.x, crawlY - (APEX - 20)), 'jump apex');
    assert.equal(tp.teleport.street, STOOT_SHRINE_TSID);
    const unnnn = street(STOOT_SHRINE_TSID);
    assert.equal(tp.teleport.arrive.y, unnnn.platforms[0].y1 - unnnn.bounds.t);
  });

  it('unnnn\'s way back is its left end, clear of the arrival, and lands beside the teleporter', () => {
    const unnnn = street(STOOT_SHRINE_TSID);
    assert.deepEqual(STOOT_RETURN.bounds, unnnn.bounds);
    const box = boxToScreen(STOOT_RETURN.bounds, STOOT_RETURN.box);
    assert.ok(!insideBottomRect(box, tp.teleport.arrive.x, tp.teleport.arrive.y), 'arrival outside the way back');
    assert.ok(insideBottomRect(box, 10, tp.teleport.arrive.y), 'the left end');
    const back = { x: STOOT_RETURN.to.x - mezz.bounds.l, y: STOOT_RETURN.to.y - mezz.bounds.t };
    assert.equal(STOOT_RETURN.to.y, MEZZ.crawl);
    assert.ok(!insideBottomRect(tp, back.x, back.y), 'lands outside the teleporter');
  });

  it('the feature lists the teleporter in the Mezzanine and the way back in unnnn', () => {
    const engine = fakeEngine();
    midTowerFeature.onStreetEnter({ ...unnnnStreet() }, engine);
    assert.deepEqual(midTowerFeature._state().boxes.map((b) => [b.id, b.street]), [['stoot_return', MEZZANINE_TSID]]);
    midTowerFeature.onStreetEnter({ tsid: 'GIF15OTSM102353', boxes: [] }, engine);
    assert.deepEqual(midTowerFeature._state().boxes, []);
  });
});

function unnnnStreet() {
  return street(STOOT_SHRINE_TSID);
}

function fakeEngine(questState = { active: {}, completed: [] }) {
  const calls = { museum: 0, said: [], dialogues: [], data: {} };
  return {
    calls,
    questState,
    setData: (k, v) => { calls.data[k] = v; },
    param: () => null,
    startRookMuseum: () => { calls.museum += 1; },
    scriptedDialogue: (opts) => calls.dialogues.push(opts),
    say: (_t, text) => calls.said.push(text),
    unregister() {},
  };
}

describe('mid-tower feature: the Greeterbot', () => {
  it('follows npc_quest_giver_widget.doTalk: museum while called, hall_repeat once done, else its no-quest line', () => {
    assert.equal(greeterAction({ active: {}, completed: [] }), 'refuse');
    assert.equal(greeterAction({ active: { rook_hall_start: {} }, completed: [] }), 'museum');
    assert.equal(greeterAction({ active: { rook_hall: {} }, completed: ['rook_hall_start'] }), 'museum');
    assert.equal(greeterAction({ active: {}, completed: ['rook_hall_start'] }), 'museum');
    assert.equal(greeterAction({ active: {}, completed: ['rook_hall_start', 'rook_hall'] }), 'repeat');
  });

  it('uncalled: says the source no_quest_text and stays out of the museum', () => {
    const engine = fakeEngine();
    greet(engine, {});
    assert.equal(engine.calls.museum, 0);
    assert.deepEqual(engine.calls.said, ['I\'m afraid one cannot simply enter the Museum of the Rook on a whim, little Glitch. One must be called to do so.']);
    assert.equal(engine.calls.data.greeterbot, 'refused');
  });

  it('called (It\'s Educational under way): starts the museum instance', () => {
    const engine = fakeEngine({ active: { rook_hall_start: {} }, completed: [] });
    greet(engine, {});
    assert.equal(engine.calls.museum, 1);
    assert.equal(engine.calls.data.greeterbot, 'museum');
  });

  it('done: the hall_repeat conversation, Yes re-enters, No gets the source reply', () => {
    const engine = fakeEngine({ active: {}, completed: ['rook_hall_start', 'rook_hall'] });
    greet(engine, {});
    const [ask] = engine.calls.dialogues;
    assert.equal(ask.beats[0].text, 'Would you like to return to the Museum of the Rook, in order to review its artifacts?');
    assert.equal(ask.primaryLabel, 'Yes.');
    assert.equal(ask.cancelLabel, 'No.');
    ask.onComplete();
    assert.equal(engine.calls.museum, 1);
    ask.onCancel();
    assert.equal(engine.calls.dialogues[1].beats[0].text, 'Very well then. Please speak with me again if you are ever so inclined.');
    assert.equal(engine.calls.dialogues[1].beats[0].response, 'Will do.');
  });

  it('takes over only the museum door\'s Enter', () => {
    const verbs = midTowerFeature.verbOverride({ classId: 'street_door', door: { id: MUSEUM_DOOR_ID } });
    assert.equal(verbs.length, 1);
    assert.equal(verbs[0].label, 'Enter');
    assert.equal(midTowerFeature.verbOverride({ classId: 'street_door', door: { id: 'door_mz_hall' } }), null);
    assert.equal(midTowerFeature.verbOverride({ classId: 'npc_piggy' }), null);
    assert.equal(midTowerFeature.runVerbOverride({}, 'enter', fakeEngine()), null);
    const engine = fakeEngine({ active: { rook_hall_start: {} }, completed: [] });
    assert.equal(midTowerFeature.runVerbOverride({ door: { id: MUSEUM_DOOR_ID } }, verbs[0].id, engine), true);
    assert.equal(engine.calls.museum, 1);
  });

  it('the rooms are indoors: tower-rooms-feature gives them an interior row with nothing in it', () => {
    for (const room of MID_TOWER_ROOMS) {
      const row = towerRoomsFeature.ecologyOverride({ tsid: room.tsid });
      assert.equal(row.interior, true, room.label);
      const pop = populationForStreet(room.tsid, row);
      assert.equal(pop.piggies + pop.chickens + pop.butterflies + pop.apples + pop.musicblocks + pop.quoins, 0, room.label);
    }
  });

  it('the street JSON is the builder output', () => {
    for (const room of MID_TOWER_ROOMS) {
      const built = midTowerRoomStreet(room);
      const json = street(room.tsid);
      assert.deepEqual(json.platforms, built.platforms);
      assert.deepEqual(json.layers, built.layers);
      assert.deepEqual(json.ladders, built.ladders);
      assert.deepEqual(json.doors.map((d) => d.id), built.doors.map((d) => d.id));
    }
  });
});

describe('G97: hopping along the Stairs\' tube on slow frames', () => {
  const st = street(STAIRS_TSID);
  const L = st.bounds.l;
  const T = st.bounds.t;
  const plats = st.platforms.map((p) => ({ ...p, x1: p.x1 - L, y1: p.y1 - T, x2: p.x2 - L, y2: p.y2 - T }));
  const tube = plats.filter((p) => /^plat_st_f[12]_/.test(p.id) && p.pc_perm === -1);
  const tubeFloorAt = (x) => {
    let best = null;
    for (const p of tube) {
      const y = platformYAt(p, x);
      if (y != null && (best == null || y > best)) best = y;
    }
    return best;
  };

  it('every hop along the tube, either way, lands back on its floor at the dt cap', () => {
    const misses = [];
    const from = stairs.flight.low.x - L + 60;
    const to = stairs.flight.high.x - L - 60;
    for (let x0 = from; x0 <= to; x0 += 7) {
      for (const vx of [-4.4, 4.4]) {
        // game.js physics(): vy += GRAVITY * dt; x += vx * dt; y += vy * dt; land when y >= ground.
        let x = x0;
        let y = tubeFloorAt(x0);
        if (y == null) continue;
        let vy = -8.3; // a hop
        let landed = null;
        for (let i = 0; i < 40 && !landed; i++) {
          vy += GRAVITY * FRAME_DT_CAP;
          x += vx * FRAME_DT_CAP;
          y += vy * FRAME_DT_CAP;
          const hit = resolveGround(plats, x, y, vy, 16);
          if (hit && y >= hit.y && vy >= 0) landed = hit;
        }
        if (!landed || !/^plat_st_(f[12]_|bottom_lip|top_lip)/.test(landed.platform.id)) misses.push(`${x0}${vx > 0 ? '>' : '<'}${landed?.platform.id || 'none'}`);
      }
    }
    assert.deepEqual(misses, []);
  });
});
