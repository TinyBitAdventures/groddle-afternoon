/**
 * Jethimadh Tower: Mid (G41): the rebuilt Stairs and Mezzanine
 * (js/tower-mid-rooms.js, tools/build-tower-rooms.mjs), the Greeterbot,
 * museum door and Stoot Shrine teleporters (features/mid-tower-feature.js).
 * The Hall of Rejected Concepts behind the Mezzanine (G73) has its own file,
 * tests/hall-rejected-concepts.test.js.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertStreetGeometry } from '../public/js/street-model.js';
import { insideBottomRect } from '../public/js/doors.js';
import {
  GREETERBOT,
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
} from '../public/js/tower-mid-rooms.js';
import { greet, greeterAction, midTowerFeature } from '../public/js/features/mid-tower-feature.js';
import { towerRoomsFeature } from '../public/js/features/tower-rooms-feature.js';
import { populationForStreet } from '../public/js/street-ecology.js';

const spike = join(dirname(fileURLToPath(import.meta.url)), '..');
const streets = join(spike, 'public/assets/streets');
const street = (tsid) => JSON.parse(readFileSync(join(streets, `${tsid}.json`), 'utf8'));
const index = JSON.parse(readFileSync(join(streets, 'index.json'), 'utf8')).streets;
const mapsFile = join(spike, '../glitch-GameServerJS/inc_data_maps_prod.js');
const stairs = midTowerRoomByTsid(STAIRS_TSID);
const mezz = midTowerRoomByTsid(MEZZANINE_TSID);

/** Plain jump in remake units (game.js): vy -9.6 px/frame, gravity 0.42, walk 4.4 (as tests/tower-rooms.test.js). */
const JUMP = { vy: 9.6, g: 0.42, vx: 4.4 };
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

  it('the Mezzanine keeps unnnn\'s clone data: bounds, floor height, the street-sized Rook Hall spotlights', () => {
    const unnnn = street(STOOT_SHRINE_TSID);
    assert.deepEqual({ l: mezz.bounds.l, r: mezz.bounds.r, t: mezz.bounds.t }, { l: unnnn.bounds.l, r: unnnn.bounds.r, t: unnnn.bounds.t });
    assert.equal(unnnn.platforms[0].y1, MEZZ.floor);
    const layer = unnnn.layers.find((l) => l.id === 'T_1311832165202');
    assert.equal(layer.w, unnnn.bounds.r - unnnn.bounds.l); // street-sized: no parallax
    const archived = layer.decos.filter((d) => d.sprite === 'rookhall_spotlight').map((d) => `${d.x + unnnn.bounds.l},${d.y + unnnn.bounds.t},${d.w},${d.h},${d.r || 0}`).sort();
    const rebuilt = mezz.decos.filter((d) => d.sprite === 'rookhall_spotlight').map((d) => `${d.x},${d.y},${d.w},${d.h},${d.r}`).sort();
    assert.equal(archived.length, 11);
    assert.deepEqual(rebuilt, archived);
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

  it('flight 1 climbs from the arrival to the landing with walks and plain jumps', () => {
    const segs = floors(stairs).filter((p) => /st_f1|st_bottom|st_landing/.test(p.id));
    assertChain(segs, 'flight 1');
    assert.ok(stairs.flights.f1.high.y < STAIRS.arrival.y);
  });

  it('the landing ladder climbs to flight 2, which climbs to the Mezzanine door', () => {
    const [ladder] = stairs.ladders;
    const { f1, f2 } = stairs.flights;
    assert.equal(ladder.y, f1.high.y);
    assert.equal(ladder.y - ladder.h, f2.low.y);
    assert.ok(floorAt(stairs.platforms, ladder.x, f1.high.y) === f1.high.y, 'ladder foot on the landing');
    assert.ok(floorAt(stairs.platforms, ladder.x, f2.low.y) === f2.low.y, 'deck over the ladder top');
    const segs = floors(stairs).filter((p) => /st_f2|st_upper|st_top/.test(p.id));
    assertChain(segs, 'flight 2');
    const door = stairs.doors.find((d) => d.connect.label === 'Mezzanine');
    assert.equal(floorAt(stairs.platforms, door.x, door.y), door.y);
  });

  it('the flights never overlap: 400+ px between them wherever both run', () => {
    for (let x = stairs.flights.f2.high.x; x <= stairs.flights.f1.high.x; x += 50) {
      const lower = floorAt(floors(stairs).filter((p) => /st_f1/.test(p.id)), x, 0);
      const upper = floorAt(floors(stairs).filter((p) => /st_f2/.test(p.id)), x, -2000);
      if (lower == null || upper == null) continue;
      assert.ok(lower - upper >= 400, `x ${x}: ${lower} vs ${upper}`);
    }
  });

  it('the Mezzanine: floorboards solid from below, a ladder down in the corner to the crawlspace', () => {
    const under = mezz.platforms.find((p) => p.id === 'plat_mz_floor_underside');
    assert.equal(under.pc_perm, 1);
    const [ladder] = mezz.ladders;
    assert.ok(ladder.x > under.x2, 'the ladder shaft is open');
    assert.equal(ladder.y, MEZZ.crawl);
    assert.equal(ladder.y - ladder.h, MEZZ.floor);
    assert.equal(floorAt(mezz.platforms, ladder.x, MEZZ.floor), MEZZ.floor, 'deck over the ladder top');
    assert.ok(MEZZ.crawl - MEZZ.floor > APEX * 2, 'no jumping up through the floorboards');
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
