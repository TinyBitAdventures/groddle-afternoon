/**
 * Report #728 follow-up, root R57: things in a player's house sat wrong against the floor.
 *
 * The house's floor line moved between releases while what lay on it kept the y it was saved at:
 * Oct 27-30 a pack drop went in 74 px over the feet (game.js dropPackItem) and floats there still;
 * Oct 31-Nov 1 (a531c873e78) the house walk line fell to the yard's 680, so drops were saved 60 px
 * under the floor; 63226ecc787 put the floor back and left them (v0.77.0's lift brings those up).
 * Nothing re-settled saved rows when a floor moved; only the home street had a saved-ground marker.
 *
 * Glitch: a stack always fell onto the plat beneath it (takeable.js takeable_drop 164-167, item
 * obey_physics; HandOfDecorator.as calculateTargetPlatformLineForRegStackFromPt), so nothing lay
 * over or under a floor. Austin's ruling (2026-11-27): every saved stack settles onto the floor under
 * it when a place loads (house floors, Tower floors, the back yard, the home street; the save's own
 * and the shared ones), and a test moves each floor line and checks stored rows land on it.
 *
 * Exempt: a stack resting on a piece of furniture (`on`: a shelf, a table, a seat) keeps the height its
 * piece gives it (home-decor.js settleStacks). Placed furniture and machines are not stack rows: their
 * height comes from the floor itself on load (home-decor.js, home-machines-feature home.groundY).
 *
 * Run: node --test tests/r728-floor-moves.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as walk from '../public/js/walk-surface.js?v=76def2f6';
import * as homes from '../public/js/features/homes-feature.js?v=7871a7e1';
import { createHomeDecorState, INTERIOR, interiorWidth, surfaceHeight } from '../public/js/home-decor.js?v=d84c139d';
import { roomPieces } from '../public/js/home-wallpaper.js?v=5d3594e4';
import { normalizeHomeView, ownerStacksFor } from '../public/js/neighbours-mp.js?v=55e3976b';

const root = join(import.meta.dirname, '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const { BACK_YARD_GROUND_Y, STREET_GROUND_Y, housePlatforms } = homes;
const { stackRestY } = walk;

const FLOOR = INTERIOR.floorY; // 620
const X0 = 900; // the back yard's width: the house room starts here
const OLD_FLOAT = FLOOR - 74; // v0.1.0-v0.6.0 (Oct 27-30)
const OLD_UNDER = BACK_YARD_GROUND_Y; // v0.7.0-v0.11.0 (Oct 31-Nov 1): 680

/** An empty room (no furniture), as wide as a new house. */
function emptyRoom() {
  const state = createHomeDecorState({});
  state.placed.length = 0;
  return state;
}
const decor = emptyRoom();
const W = interiorWidth(decor);
const ground = (state = decor, dy = 0, yardDy = 0) => {
  const room = roomPieces(state, { floorY: FLOOR, leftOpen: true });
  return housePlatforms({ ...room, groundY: room.groundY + yardDy }, X0, X0 + interiorWidth(state)).map((p) => (
    p.id === 'home-floor' ? { ...p, y1: p.y1 + dy, y2: p.y2 + dy } : p.id === 'home-yard-ramp' ? { ...p, y2: p.y2 + dy } : p));
};
const upper = (state = decor, dy = 0) => housePlatforms(roomPieces(state, { floorY: FLOOR, leftOpen: false }), 0, interiorWidth(state))
  .map((p) => ({ ...p, y1: p.y1 + dy, y2: p.y2 + dy }));
const street = (dy = 0) => [{ id: 'home-ground', x1: 0, y1: STREET_GROUND_Y + dy, x2: 4000, y2: STREET_GROUND_Y + dy, pc_perm: -1 }];

/** Where the game draws a stack saved at (x, y) here (game.js restingStackY). */
const drawn = (lines, x, y, place, on = null) => walk.restingStackYAt(lines, x, y, { place, on });
/** The stored rows after the place loads (homes-feature settleRoomStacks / settleHomeStreetSave). */
function settled(rows, lines, state = null, x0 = 0) {
  const moved = homes.settleStacksOntoFloor(rows, lines, state, x0);
  return { moved, rows };
}

/** A room with one table (id 3) at room x 500 and one wall shelf (id 7) at room x 800. */
function furnishedRoom() {
  const state = emptyRoom();
  state.placed.push(
    { id: 3, classTsid: 'furniture_table', slot: 'floor', x: 500, y: FLOOR, facingRight: true, z: 3, on: null },
    { id: 7, classTsid: 'furniture_shelf', slot: 'wall', x: 800, y: 410, facingRight: true, z: 7, on: null },
  );
  return state;
}

describe('#728: the floating drops from Oct 27-30 come down onto the floor', () => {
  it('house ground floor: a stack saved 74 px over the floor is drawn on it and saved on it', () => {
    assert.equal(typeof walk.restingStackYAt, 'function', 'walk-surface.js restingStackYAt');
    assert.equal(drawn(ground(), X0 + 300, OLD_FLOAT, 'room'), FLOOR);
    const { moved, rows } = settled([{ id: 'a', x: X0 + 300, y: OLD_FLOAT }], ground(), decor, X0);
    assert.equal(moved, 1);
    assert.equal(rows[0].y, FLOOR);
    assert.equal(homes.settleStacksOntoFloor(rows, ground(), decor, X0), 0, 'settled stays settled');
  });

  it('upper house floor and Tower floor: the same', () => {
    assert.equal(drawn(upper(), 300, OLD_FLOAT, 'room'), FLOOR);
    assert.equal(settled([{ id: 'a', x: 300, y: OLD_FLOAT }], upper(), decor, 0).rows[0].y, FLOOR);
  });

  it('the ones saved under the floor (Oct 31-Nov 1) still come up', () => {
    assert.equal(drawn(ground(), X0 + 300, OLD_UNDER, 'room'), FLOOR);
    assert.equal(settled([{ id: 'a', x: X0 + 300, y: OLD_UNDER }], ground(), decor, X0).rows[0].y, FLOOR);
  });

  it('home street: a stack under its ground comes up (it only ever fell before)', () => {
    assert.equal(drawn(street(), 500, STREET_GROUND_Y + 40, 'home-street'), STREET_GROUND_Y);
    assert.equal(settled([{ id: 'a', x: 500, y: STREET_GROUND_Y + 40 }], street()).rows[0].y, STREET_GROUND_Y);
  });

  it('a shared stack (drops.go keeps its y) is drawn on the floor by every player alike', () => {
    // The server keeps the row as it is; every game draws it through the same rule and lines.
    for (const y of [OLD_FLOAT, OLD_UNDER, FLOOR - 20]) assert.equal(drawn(ground(), X0 + 500, y, 'room'), FLOOR, String(y));
  });
});

describe('R57: move any floor line and every stored row lands on it', () => {
  const deltas = [-120, -74, -60, -20, -9, 9, 20, 60, 74, 120];
  // Rows saved on the old line, floating over it as Oct 27-30's, and under it as Oct 31-Nov 1's.
  const savedAt = (line) => [line, line - 74, line + 60];
  const places = [
    { name: 'house ground floor', kind: 'room', x: X0 + 300, old: FLOOR, lines: (d) => ground(decor, d), now: (d) => FLOOR + d, state: decor, x0: X0 },
    { name: 'upper house floor', kind: 'room', x: 300, old: FLOOR, lines: (d) => upper(decor, d), now: (d) => FLOOR + d, state: decor, x0: 0 },
    { name: 'Tower floor', kind: 'room', x: 300, old: FLOOR, lines: (d) => upper(decor, d), now: (d) => FLOOR + d, state: decor, x0: 0 },
    { name: 'back yard', kind: 'room', x: X0 - 300, old: BACK_YARD_GROUND_Y, lines: (d) => ground(decor, 0, d), now: (d) => BACK_YARD_GROUND_Y + d, state: decor, x0: X0 },
    { name: 'home street', kind: 'home-street', x: 500, old: STREET_GROUND_Y, lines: (d) => street(d), now: (d) => STREET_GROUND_Y + d, state: null, x0: 0 },
  ];
  for (const place of places) {
    it(`${place.name}: drawn and saved on the moved line`, () => {
      for (const d of deltas) {
        const lines = place.lines(d);
        const want = place.now(d);
        for (const y of savedAt(place.old)) {
          assert.equal(drawn(lines, place.x, y, place.kind), want, `drawn: saved at ${y}, line moved ${d}`);
          const rows = [{ id: 'a', classTsid: 'apple', count: 1, x: place.x, y }];
          homes.settleStacksOntoFloor(rows, lines, place.state, place.x0);
          assert.equal(rows[0].y, want, `saved: saved at ${y}, line moved ${d}`);
          assert.equal(homes.settleStacksOntoFloor(rows, lines, place.state, place.x0), 0, 'once');
        }
      }
    });
  }

  it('a public street keeps its own rule: a stack falls to the line under it, and is left where no line is under it', () => {
    const lines = street();
    assert.equal(drawn(lines, 500, STREET_GROUND_Y - 74, ''), STREET_GROUND_Y);
    assert.equal(drawn(lines, 500, STREET_GROUND_Y + 40, ''), stackRestY(lines, 500, STREET_GROUND_Y + 40) ?? STREET_GROUND_Y + 40);
  });
});

describe('R57: what rests on furniture keeps its height', () => {
  const tableTop = FLOOR - surfaceHeight('furniture_table');
  const shelfTop = 410 - surfaceHeight('furniture_shelf');

  it('a stack on a piece (`on`) is drawn and kept where its piece holds it, wherever the floor goes', () => {
    const state = furnishedRoom();
    for (const d of [-60, 0, 74]) {
      assert.equal(drawn(ground(state, d), X0 + 800, shelfTop, 'room', 7), shelfTop);
      const rows = [{ id: 's', x: X0 + 800, y: shelfTop, on: 7 }, { id: 't', x: X0 + 500, y: tableTop, on: 3 }];
      assert.equal(homes.settleStacksOntoFloor(rows, ground(state, d), state, X0), 0);
      assert.deepEqual(rows.map((r) => [r.y, r.on]), [[shelfTop, 7], [tableTop, 3]]);
    }
  });

  it('a stack floating over a table falls onto the table top, as onto a plat in Glitch; under it, it stays on the floor', () => {
    const state = furnishedRoom();
    const rows = [
      { id: 'over', x: X0 + 500, y: tableTop - 90 },
      { id: 'under', x: X0 + 500, y: FLOOR },
      { id: 'beside', x: X0 + 200, y: OLD_FLOAT },
    ];
    homes.settleStacksOntoFloor(rows, ground(state), state, X0);
    assert.deepEqual(rows.map((r) => [r.y, r.on ?? null]), [[tableTop, 3], [FLOOR, null], [FLOOR, null]]);
  });

  it('a stack (a bag too) whose piece is gone falls to the floor', () => {
    const state = furnishedRoom();
    const rows = [{ id: 'b', x: X0 + 250, y: 300, on: 99, contents: [{ classTsid: 'apple', count: 1 }] }];
    assert.equal(homes.settleStacksOntoFloor(rows, ground(state), state, X0), 1);
    assert.deepEqual([rows[0].y, rows[0].on], [FLOOR, undefined]);
  });

  it("a visitor sees the owner's stack on a shelf there (the site's `on` comes through to the draw)", () => {
    const view = normalizeHomeView({ owner: { id: 7, name: 'Ada' }, home: { owned: true }, stacks: [
      { id: 'w1', place: 'house', c: 'cherry', n: 1, x: 800, y: shelfTop, on: 7 },
      { id: 'w2', place: 'house', c: 'cherry', n: 1, x: 200, y: OLD_FLOAT },
    ] });
    const rows = ownerStacksFor(view, 'interior', { roomX: X0, tsid: 'MPH_7_IN' });
    assert.equal(rows[0].on, 7);
    assert.equal(drawn(ground(), rows[0].x, rows[0].y, 'room', rows[0].on ?? null), shelfTop);
    assert.equal(drawn(ground(), rows[1].x, rows[1].y, 'room', rows[1].on ?? null), FLOOR);
  });
});

describe('R57: the game settles on load and draws through the one rule', () => {
  const game = read('public/game.js');
  const homesSrc = read('public/js/features/homes-feature.js');
  const fn = (src, name) => {
    const at = src.indexOf(`function ${name}(`);
    assert.ok(at >= 0, name);
    return src.slice(at, src.indexOf('\n}\n', at) + 2);
  };

  it('restingStackY draws every dropped stack through restingStackYAt, with its piece', () => {
    assert.match(fn(game, 'restingStackY'), /restingStackYAt\(streetPlatforms, x, y, \{ place: homeStackPlace\(\), on: stack\?\.on \?\? null \}\)/);
    assert.match(fn(game, 'spawnDroppedItemStack'), /spr\.baseY = restingStackY\(stack\.x, stack\.y, stack\);/);
  });

  it('homeStackPlace: your house and Tower floors and a visit\'s are rooms; your home street and a visit\'s are the home street', () => {
    const body = fn(game, 'homeStackPlace');
    assert.match(body, /if \(homeIsInstanced\(\)\) return tsid === HOME_INTERIOR_TSID \? 'room' : 'home-street';/);
    const re = new RegExp(/\/(\^MPH_[^/]+)\/\.exec/.exec(body)[1]);
    for (const t of ['MPH_42_IN', 'MPH_42_IN1', 'MPH_42_IN2', 'MPH_42_T0', 'MPH_42_T3']) assert.ok(re.exec(t)?.[1], t);
    assert.ok(re.test('MPH_42') && !re.exec('MPH_42')[1], 'a visit\'s home street');
    for (const t of ['MPH_42_IN3', 'RH_HOME_EXT', 'LIF101']) assert.ok(!re.test(t), t);
  });

  it('entering a room settles the save\'s stacks there; building the home street settles its stacks and piles', () => {
    assert.match(fn(homesSrc, 'settleRoomStacks'), /settleStacks\(decor, rows, roomX0\(\)\) \+ settleStacksOntoFloor\(rows, scene\.background\?\.platformsScreen, decor, roomX0\(\)\)/);
    assert.match(homesSrc, /const streetSettled = settleHomeStreetSave\(engine, background\.platformsScreen\);/);
    assert.match(homesSrc, /if \(streetSettled\) engine\.droppedItemsChanged\?\.\(\);/);
  });

  it('settleHomeStreetSave: the save\'s stacks and the Guano and Piggy Plop piles land on the ground', () => {
    const rows = [{ id: 'a', x: 500, y: 620 }, { id: 'b', x: 700, y: STREET_GROUND_Y + 30 }, { id: 'c', x: 900, y: STREET_GROUND_Y }];
    const husbandry = { guano: [{ id: 'g1', x: 400, y: STREET_GROUND_Y - 50, count: 2 }], plops: [{ id: 'p1', x: 450, y: STREET_GROUND_Y + 20, seedClass: 'seed_potato', seedCount: 1 }] };
    let saved = 0;
    const engine = { droppedItems: { streets: { RH_HOME_EXT: rows } }, streetSlot: (id, tsid) => (id === 'animal-husbandry' && tsid === 'RH_HOME_EXT' ? husbandry : null), save() { saved += 1; } };
    assert.equal(homes.settleHomeStreetSave(engine, street()), 2);
    assert.deepEqual(rows.map((r) => r.y), [STREET_GROUND_Y, STREET_GROUND_Y, STREET_GROUND_Y]);
    assert.deepEqual([husbandry.guano[0].y, husbandry.plops[0].y], [STREET_GROUND_Y, STREET_GROUND_Y]);
    assert.equal(saved, 1);
  });

  it('Decoration Mode picks a shared stack where it is drawn', () => {
    assert.match(fn(homesSrc, 'roomStacks'), /restingStackYAt\(lines, Number\(row\.x\), Number\(row\.y\), \{ place: 'room' \}\)/);
  });

  it('a stack set on a piece from the pack is the piece\'s from the start (drawn there, not on the floor)', () => {
    assert.match(fn(homesSrc, 'packDropOpts'), /\.\.\.\(target\?\.on != null \? \{ on: target\.on \} : \{\}\)/);
    assert.match(game, /if \(on != null && !floor\) \{\n[^\n]*\n\s+if \(row && row\.on == null\) row\.on = on;/);
  });
});
