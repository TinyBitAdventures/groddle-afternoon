/**
 * DECOITEMS (Austin 2026-11-01, live): "I can now place objects in my house however I don't
 * know how to pick them up or move them", and a diamond still floating over his Basic Wooden
 * Shelf.
 *
 * - The house floor is solid from the top (inc_homes.js 928-933, platform_pc_perm -1): as an
 *   underside (pc_perm 1) the avatar stood on the yard's line 60 px under it, and every click on a
 *   thing set on a shelf or a table said "Could not get close enough :(".
 * - In Decoration Mode a stack set down is selected, dragged to another shelf, table or the floor,
 *   or onto the pack, and has Move and Pick up (HandOfDecorator.as startWithItemFromLocation
 *   1250-1323, dropFromLocationOnTargetPlatform 1445-1620; main.js doModifyItem 4873-4910).
 * - Stacks keep the piece they rest on (`on`) and rest on it as it stands now: moved, restyled,
 *   picked up, or with its surface fixed (settleStacks).
 * - Every piece rests things on its art: the sweep is tools/furniture-upgrades/tops.mjs --check.
 *
 * Run: node --test tests/home-stacks.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FURNITURE_CATALOG } from '../public/js/homes-catalog.js?v=7aa9beb0';
import { FURNITURE_UPGRADES } from '../public/js/furniture-upgrades-data.js?v=ced89b64';
import { createHomeDecorState, INTERIOR, placeFurniture, settleStacks, stackSurfaceAt, STALE_REST_GIVE, surfaceHeight } from '../public/js/home-decor.js?v=6735c85f';
import { normalizeDroppedItemState } from '../public/js/world-items.js?v=2f0f2022';
import { isStandable } from '../public/js/street-model.js?v=505d8990';
import { BUILDER_TEXT } from '../public/js/ui/home-builder.js?v=90f759e8';
import { hasMagick, itemBottoms } from '../tools/furniture-upgrades/tops.mjs';
import { basePlats, surfaceFrom } from '../tools/furniture-upgrades/build.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

/** Austin's house as his save had it: x0 1140, the Basic Wooden Shelf (94) and his table. */
function austinsRoom() {
  const state = createHomeDecorState({});
  state.placed.length = 0;
  state.placed.push(
    { id: 3, classTsid: 'furniture_table', slot: 'floor', x: 558, y: 620, facingRight: true, z: 3, on: null },
    { id: 7, classTsid: 'furniture_shelf', slot: 'wall', x: 690, y: 410, facingRight: true, z: 7, on: null, upgradeId: '94' },
  );
  return state;
}

describe('the house floor holds the avatar', () => {
  it('every line of the house and the home street is solid from the top (inc_homes.js 928-933)', () => {
    const homes = read('public/js/features/homes-feature.js');
    for (const id of ['home-yard', 'home-yard-ramp', 'home-floor', 'home-ground']) {
      const lines = [...homes.matchAll(new RegExp(`\\{ id: '${id}',[^}]*\\}`, 'g'))].map((m) => m[0]);
      assert.ok(lines.length, id);
      for (const line of lines) {
        assert.match(line, /pc_perm: -1/, line);
        assert.equal(isStandable({ pc_perm: -1 }), true);
      }
    }
    const gsjs = join(process.env.HOME || '', 'Documents/glitch-audit/eleven-gsjs/locations/inc_homes.js');
    try {
      const src = readFileSync(gsjs, 'utf8');
      assert.match(src.slice(src.indexOf("'platform_item_perm'\t: -1,"), src.indexOf("'platform_item_perm'\t: -1,") + 120), /'platform_pc_perm'\t: -1,/);
    } catch (e) {
      if (e.code !== 'ENOENT') throw e;
    }
  });
});

describe('what is set down keeps the piece it rests on (settleStacks)', () => {
  it("rests Austin's diamond, set down before HOUSEFIX at 52 px, on his Basic Wooden Shelf's plank (33 px)", () => {
    const state = austinsRoom();
    const rows = [{ id: 'world-item-2', classTsid: 'gem_diamond', count: 1, x: 1830, y: 358 }];
    assert.equal(settleStacks(state, rows, 1140), 1);
    assert.deepEqual({ x: rows[0].x, y: rows[0].y, on: rows[0].on }, { x: 1830, y: 410 - 33, on: 7 });
    assert.equal(settleStacks(state, rows, 1140), 0, 'settled stays settled');
  });

  it('rests a stack set on an upgraded table at its old front-edge plat on the table top', () => {
    const state = austinsRoom();
    state.placed[0].upgradeId = '59';
    const rows = [{ id: 'a', classTsid: 'apple', count: 3, x: 1140 + 600, y: 620 - 52 }];
    settleStacks(state, rows, 1140);
    assert.equal(rows[0].on, 3);
    assert.equal(rows[0].y, 620 - surfaceHeight('furniture_table', '59'));
  });

  it('leaves a stack on the floor (under a table, in the open) on the floor, and one far over a piece where it is', () => {
    const state = austinsRoom();
    const rows = [
      { id: 'a', classTsid: 'apple', count: 1, x: 1140 + 558, y: INTERIOR.floorY },
      { id: 'b', classTsid: 'apple', count: 1, x: 1140 + 900, y: INTERIOR.floorY },
      { id: 'c', classTsid: 'apple', count: 1, x: 1140 + 690, y: 410 - 33 - STALE_REST_GIVE - 5 },
    ];
    assert.equal(settleStacks(state, rows, 1140), 0);
    assert.equal(rows.some((r) => r.on), false);
  });

  it('follows its piece when the piece is restyled, and falls to the floor when the piece is picked up', () => {
    const state = austinsRoom();
    const rows = [{ id: 'd', classTsid: 'gem_diamond', count: 1, x: 1140 + 690, y: 377, on: 7 }];
    state.placed[1].upgradeId = '97';
    settleStacks(state, rows, 1140);
    assert.equal(rows[0].y, 410 - surfaceHeight('furniture_shelf', '97'));
    state.placed.splice(1, 1);
    settleStacks(state, rows, 1140);
    assert.equal(rows[0].y, INTERIOR.floorY);
    assert.equal(rows[0].on, undefined);
  });

  it('falls onto a table under a shelf taken away', () => {
    const state = austinsRoom();
    state.placed[1].x = 558;
    const rows = [{ id: 'd', classTsid: 'gem_diamond', count: 1, x: 1140 + 558, y: 377, on: 7 }];
    state.placed.splice(1, 1);
    settleStacks(state, rows, 1140);
    assert.deepEqual({ y: rows[0].y, on: rows[0].on }, { y: 620 - surfaceHeight('furniture_table'), on: 3 });
  });

  it('keeps inside the ends of a narrower piece', () => {
    const state = austinsRoom();
    const rows = [{ id: 'e', classTsid: 'gem_diamond', count: 1, x: 1140 + 690 + 100, y: 377, on: 7 }];
    state.placed[1].upgradeId = '99'; // Small Basic Wooden Shelf, 151 px
    settleStacks(state, rows, 1140);
    assert.ok(rows[0].x <= 1140 + 690 + Math.round(151 / 2 - 6), String(rows[0].x));
  });

  it('the dropped-stack record keeps `on` through a save', () => {
    const state = normalizeDroppedItemState({ nextId: 3, streets: { RH_HOME_INT: [{ id: 'world-item-2', classTsid: 'gem_diamond', count: 1, x: 1, y: 2, on: 7 }, { id: 'world-item-3', classTsid: 'apple', count: 1, x: 1, y: 2, on: 'x' }] } });
    assert.equal(state.streets.RH_HOME_INT[0].on, 7);
    assert.equal('on' in state.streets.RH_HOME_INT[1], false);
  });

  it('a placed piece from placeFurniture is a piece stacks can rest on', () => {
    const state = createHomeDecorState({});
    state.storage.furniture_shelf = 1;
    const shelf = placeFurniture(state, {}, 'furniture_shelf', { x: 300, y: 400 }).item;
    const rows = [{ id: 'f', classTsid: 'apple', count: 1, x: 300, y: shelf.y - surfaceHeight('furniture_shelf') }];
    settleStacks(state, rows, 0);
    assert.equal(rows[0].on, shelf.id);
  });
});

describe('every piece rests things on its art', () => {
  it('each upgrade of a piece with a surface has its measured top, and nothing rests above it', () => {
    let n = 0;
    for (const [cls, def] of Object.entries(FURNITURE_CATALOG)) {
      if (!def.surface) continue;
      for (const [id, row] of Object.entries(FURNITURE_UPGRADES[cls]?.upgrades || {})) {
        if (!row.art) continue;
        // A seat's style with no plat holds nothing (SEATSELECT): the seats' own describe proves it.
        if (def.platOnly && row.platY == null) continue;
        assert.ok(Number.isInteger(row.art.top) && row.art.top >= 0 && row.art.top < row.art.h, `${cls}/${id} top ${row.art.top}`);
        const h = surfaceHeight(cls, id);
        assert.ok(h > 0 && h <= row.art.h - row.art.top + 1, `${cls}/${id}: rests ${h}, visible top ${row.art.h - row.art.top}`);
        n += 1;
      }
    }
    assert.ok(n >= 150, n);
  });

  it('the Foresty Fireplace rests things on its hearth (its plat 10 px under the stage bottom, 27 px above the art bottom)', () => {
    assert.equal(FURNITURE_UPGRADES.furniture_fireplace.upgrades['721'].platY, -10);
    assert.equal(surfaceHeight('furniture_fireplace', '721'), 17);
  });

  it('the sweep over every piece\'s art passes (tools/furniture-upgrades/tops.mjs --check)', { skip: !hasMagick() && 'ImageMagick missing' }, () => {
    const out = execFileSync(process.execPath, [join(root, 'tools/furniture-upgrades/tops.mjs'), '--check'], { cwd: root, encoding: 'utf8' });
    assert.match(out, /^ok: \d+ pieces rest things on their art/m);
  });
});

describe('the plain pieces rest things on their own plats (DECOPOLISH, Austin 2026-11-02)', () => {
  // "Placed items seem to float above the table. Can we bump them down a bit?": a Musicblock and
  // Bubbles on the plain round table, Wheat on the small cabinet. The plain pieces had hand-set
  // heights 5 px under the art's top edge (the back edge of the tabletop); the original rested
  // things on the plat items/<class>.js getFurnitureBaseGeo gives, over the SWF stage's bottom.
  const base = JSON.parse(read('tools/furniture-upgrades/base.json'));
  const gsjs = join(process.env.HOME || '', 'Documents/glitch-audit/glitch-GameServerJS/items/furniture_table.js');
  const haveGsjs = (() => {
    try {
      readFileSync(gsjs);
      return true;
    } catch {
      return false;
    }
  })();

  it('the round table, the small cabinet, the shelf and the counter rest things on their plats, under the old heights', () => {
    const want = { furniture_table: [80, 68], bag_furniture_smallcabinet: [72, 65], furniture_shelf: [40, 30], furniture_counter: [76, 64], furniture_coffeetable: [54, 45], furniture_sidetable: [50, 45], furniture_desk: [66, 62] };
    for (const [cls, [was, now]] of Object.entries(want)) {
      const def = FURNITURE_CATALOG[cls];
      assert.equal(surfaceHeight(cls), now, cls);
      assert.equal(def.platY - def.art.foot, now, `${cls}: plat ${def.platY} - foot ${def.art.foot}`);
      assert.ok(now < was, `${cls}: lower than the hand-set ${was}`);
      assert.ok(now <= def.art.h - def.art.top, `${cls}: under its visible top`);
    }
  });

  it('reads each plat from the source and each foot from the base SWF (base.json)', { skip: !haveGsjs && 'GSJS missing' }, () => {
    assert.equal(surfaceFrom(basePlats('furniture_table')), 43, 'furniture_table.js getFurnitureBaseGeo: y -42 .. -43');
    assert.equal(base.furniture_table.foot, -25);
    assert.equal(surfaceFrom(basePlats('bag_furniture_smallcabinet')), 41);
    for (const [cls, def] of Object.entries(FURNITURE_CATALOG)) {
      if (def.platY == null) continue;
      assert.equal(def.platY, surfaceFrom(basePlats(cls)), cls);
      assert.equal(def.art.foot, base[cls].foot, cls);
    }
    // No plat, no change: the bookcase and cabinets held nothing in the original; the SDB has plats null.
    assert.equal(basePlats('furniture_bookcase'), null);
    assert.equal(basePlats('bag_furniture_sdb'), null);
    assert.equal(surfaceHeight('furniture_bookcase'), FURNITURE_CATALOG.furniture_bookcase.surface);
    // The Fireplace draws its sheet's first cell, the base SWF's frame (SEATSELECT): its mantel plat,
    // furniture_fireplace.js getFurnitureBaseGeo y -97 .. -96, over a foot of -24.
    assert.equal(FURNITURE_CATALOG.furniture_fireplace.platY, 97);
    assert.equal(surfaceHeight('furniture_fireplace'), 121);
  });

  it('things set on the round table before the fix come down onto it when the room loads', () => {
    const state = austinsRoom();
    const rows = [
      { id: 'mb', classTsid: 'musicblock_d_blue_05', count: 1, x: 1140 + 540, y: 620 - 80, on: 3 },
      { id: 'pb', classTsid: 'plain_bubble', count: 4, x: 1140 + 580, y: 620 - 80 },
    ];
    assert.equal(settleStacks(state, rows, 1140), 2);
    for (const row of rows) assert.deepEqual({ y: row.y, on: row.on }, { y: 620 - 68, on: 3 });
  });

  it('what rests on a piece rests by its own bottom: no world-art state has clear rows under it', { skip: !hasMagick() && 'ImageMagick missing' }, () => {
    const { files, problems } = itemBottoms();
    assert.ok(files > 1500, String(files));
    assert.deepEqual(problems, []);
  });
});

describe('the seats rest things on their seat plats, as in the original (SEATSELECT, Austin 2026-11-02)', () => {
  // "Seat furniture: yes let's do the original and let stuff rest on top." Every seat class's
  // items/<class>.js getFurnitureBaseGeo has one plat with platform_item_perm -1 (an item rests on
  // it), and so has every style's catalog_furniture row but two hidden test sofas.
  const SEATS = { furniture_chair: [28, -17, 45], furniture_armchair: [22, -25, 47], furniture_bench: [21, -20, 41], furniture_stool: [26, -13, 39], furniture_sofa: [21, -22, 43], furniture_loveseat: [22, -22, 44], furniture_bed: [14, -45, 59] };

  it('each plain seat rests things on its plat, over its foot, under its visible top', () => {
    for (const [cls, [plat, foot, rest]] of Object.entries(SEATS)) {
      const def = FURNITURE_CATALOG[cls];
      assert.equal(def.platOnly, true, cls);
      assert.equal(def.platY, plat, cls);
      assert.equal(def.art.foot, foot, cls);
      assert.equal(surfaceHeight(cls), rest, cls);
      assert.ok(rest < def.art.h - def.art.top, `${cls}: ${rest} under its visible top ${def.art.h - def.art.top}`);
    }
  });

  it('every style of every seat rests things on its own plat; the two plat-less test sofas hold nothing', () => {
    let n = 0;
    const none = [];
    for (const cls of Object.keys(SEATS)) {
      for (const [id, row] of Object.entries(FURNITURE_UPGRADES[cls].upgrades)) {
        if (row.platY == null) {
          none.push(`${cls}/${id}`);
          assert.equal(surfaceHeight(cls, id), 0, `${cls}/${id}`);
          continue;
        }
        assert.equal(surfaceHeight(cls, id), Math.round(row.platY - row.art.foot), `${cls}/${id}`);
        n += 1;
      }
    }
    assert.deepEqual(none, ['furniture_sofa/406', 'furniture_sofa/577']);
    assert.ok(n >= 115, String(n));
  });

  it('a thing set down over a chair rests on its seat, moves with it and falls to the floor when it goes', () => {
    const state = createHomeDecorState({});
    state.storage.furniture_chair = 1;
    const chair = placeFurniture(state, {}, 'furniture_chair', { x: 400, y: INTERIOR.floorY }).item;
    const hit = stackSurfaceAt(state, 400, INTERIOR.floorY - 80);
    assert.deepEqual(hit, { x: 400, y: chair.y - 45, on: chair.id });
    const rows = [{ id: 'a', classTsid: 'apple', count: 1, x: hit.x, y: hit.y, on: hit.on }];
    chair.x = 600;
    assert.equal(settleStacks(state, rows, 0), 1);
    assert.deepEqual({ x: rows[0].x, y: rows[0].y, on: rows[0].on }, { x: 600 - 30, y: chair.y - 45, on: chair.id });
    state.placed = state.placed.filter((row) => row.id !== chair.id);
    settleStacks(state, rows, 0);
    assert.deepEqual({ y: rows[0].y, on: rows[0].on }, { y: INTERIOR.floorY, on: undefined });
  });
});

describe('Decoration Mode moves and takes back what is set down', () => {
  const homes = read('public/js/features/homes-feature.js');
  const game = read('public/game.js');

  it('says how on the Pack tab, by a selected stack and after the first set-down', () => {
    assert.match(BUILDER_TEXT.packHint, /pack to pick/);
    assert.match(BUILDER_TEXT.stackHint, /Drag it to move it/);
    assert.doesNotMatch(`${BUILDER_TEXT.packHint}${BUILDER_TEXT.stackHint}${BUILDER_TEXT.packNote}`, /—|Glitch/);
    assert.match(homes, /hint: tab === 'pack' \? BUILDER_TEXT\.packHint/);
    assert.match(homes, /sub: BUILDER_TEXT\.stackHint/);
  });

  it('a pressed stack is selected before the piece behind it, and drags to a surface or onto the pack', () => {
    const down = homes.slice(homes.indexOf("const stack = mode === 'decorate' ? stackAt(engine, p) : null;"));
    assert.match(down.slice(0, 600), /selectStack\(engine, stack\.id\)/);
    const end = homes.slice(homes.indexOf('function endStackDrag('));
    assert.match(end.slice(0, 1200), /if \(overPack\(e\.clientX, e\.clientY\)\) return pickUpStack\(engine, was\.id\);/);
    // DECOPOLISH: onto a Storage Display Box it goes in the box (tests/decor-display-box.test.js), else it moves.
    assert.match(end.slice(0, 1200), /const p = toRoom\(worldPoint\(engine, e\)\);[\s\S]{0,200}return moveStack\(engine, was\.id, p\);/);
    const move = homes.slice(homes.indexOf('function moveStack('));
    assert.match(move.slice(0, 500), /const target = stackSurfaceAt\(decor, p\.x, p\.y\);/);
  });

  it('Pick up is the item\'s own pickup (the pack and the ledger see one move), and a moved piece takes its stacks', () => {
    const fn = game.slice(game.indexOf('pickUpDroppedStack(id, count = Infinity) {'));
    assert.match(fn.slice(0, 300), /return target \? pickupDroppedWorldItem\(target, count\) : false;/);
    assert.match(homes, /for \(const row of roomStackRows\(engine\)\) \{\s+if \(row\.on !== placing\.moveId \|\| !dx\) continue;\s+row\.x \+= dx;/);
    // SEATSELECT: saved and redrawn where they went (before, they stayed drawn behind until a reload).
    assert.match(homes, /if \(carried\) engine\.droppedItemsChanged\?\.\(\);/);
    // Only x, y and `on` change on a move: no item is made or lost.
    const mv = homes.slice(homes.indexOf('function moveStack('), homes.indexOf('function pickUpStack('));
    assert.doesNotMatch(mv, /count|addItem|removeItem|inv\b/);
  });

  it('no Enter hint over the room while decorating (the avatar is hidden)', () => {
    assert.match(homes, /quietEnterHint\(\) \{\s+return scene && mode === 'decorate' \? true : null;/);
  });
});
