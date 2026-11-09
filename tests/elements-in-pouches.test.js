/**
 * Austin's ruling, 2026-11-07: match the original. Elements only go in Elemental Pouches
 * (bag_elemental_pouch.js 651-659, bag.js canContain 434-441, bag_generic 588-590), and what does not
 * fit is destroyed. A stack an existing save holds in a pack slot stays.
 */
import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { layoutPack, moveStack, packAccepts, packKeeps, roomFor, stackUp, isElementClass } from '../public/js/pack-slots.js?v=6cf9f397';
import { smashTrophy } from '../public/js/item-verbs-more.js?v=f495e9e8';
import { canCraft, grindsElements, grinderResultLine, NEED_POUCH_LINE, recipeBlockedLine, isGrinderRecipe } from '../public/js/making.js?v=25bf06a4';
import { getVerbsFor } from '../public/content.js?v=a409dfed';
import { loadContentCatalogsFromDir } from '../public/js/content-catalogs.js?v=10b118dd';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const GS = join(root, '../glitch-GameServerJS');
const POUCH = 'bag_elemental_pouch';
const RED = 'element_red';
const GREEN = 'element_green';
const BLUE = 'element_blue';
const SHINY = 'element_shiny';
before(async () => loadContentCatalogsFromDir(join(root, 'public/assets/content')));

const counts = (layout, cls) => {
  const inPack = layout.pack.slots.filter((s) => s.kind === 'stack' && s.cls === cls).reduce((a, s) => a + s.count, 0);
  const inBags = Object.values(layout.bags).flatMap((b) => b.slots).filter((s) => s.cls === cls).reduce((a, s) => a + s.count, 0);
  return { inPack, inBags, rock: layout.rock[cls] || 0 };
};

/** A save from before the rule: a full pouch's worth in the pouch, the overflow in a pack slot. */
function oldSave(extra = 0) {
  const inv = { [POUCH]: 1, [RED]: 5000 + 300 + extra };
  const first = layoutPack({ [POUCH]: 1 }, null);
  const key = first.pack.slots.find((s) => s.kind === 'bag').key;
  const prefs = {
    bags: [{ key, cls: POUCH }],
    place: { pack: [`@${key}`, RED], [key]: [RED] },
    n: { pack: [0, 300], [key]: [5000] },
  };
  return { inv, prefs, key };
}

describe('the source', { skip: !existsSync(GS) && 'glitch-GameServerJS is not beside the game' }, () => {
  const src = (f) => readFileSync(join(GS, f), 'utf8');
  it('holds the rule', () => {
    assert.match(src('items/bag_elemental_pouch.js'), /if \(stack\.getProp\('is_element'\)\)\{\s*var remaining = stack\.getProp\('stackmax'\) - this\.countItemClass\(stack\.class_tsid\);/);
    assert.match(src('items/bag.js'), /function canContain\(stack\)\{[\s\S]{0,120}if \(stack\.getProp\('is_element'\)\) return 0;/);
    assert.match(src('items/bag_generic.js'), /stack\.getProp\('is_element'\)[^\n]*\? 0/);
    assert.match(src('items/element_red.js'), /function canPickup\(pc, drop_stack\)\{ \/\/ defined by element_base\s*return \{ok: 0\};/);
    assert.match(src('items/ore_grinder.js'), /You need an Elemental Pouch to use this\./);
    assert.match(src('items/ore_grinder.js'), /pc\.createItemFromGround\(outputs\[i\]\.class_tsid, to_get, \(this\.class_crushing != "barnacle"\)\)/);
    assert.match(src('items/trophy_street_creator_rock_piece1.js'), /createItemFromSource\('element_green', n_green, this, true\)/);
  });
});

describe('where elements can go', () => {
  it('only a pouch takes new ones', () => {
    for (const cls of [RED, GREEN, BLUE, SHINY]) {
      assert.equal(isElementClass(cls), true);
      assert.equal(packAccepts(cls), false, cls);
      assert.equal(packKeeps(cls), true, cls);
    }
    assert.equal(packAccepts('apple'), true);
    assert.equal(isElementClass('apple'), false);
  });

  it('no pouch: no room at all, whatever the pack has free', () => {
    assert.equal(roomFor({ apple: 1 }, null, RED, 100), 0);
  });

  it('a pouch holds one stack of 5000 of each element, two pouches twice that', () => {
    assert.equal(roomFor({ [POUCH]: 1 }, null, RED, 6000), 5000);
    assert.equal(roomFor({ [POUCH]: 1, [RED]: 4990 }, null, RED, 100), 10);
    assert.equal(roomFor({ [POUCH]: 1, [RED]: 5000 }, null, RED, 1), 0);
    assert.equal(roomFor({ [POUCH]: 2, [RED]: 5000 }, null, RED, 6000), 5000);
  });

  it('what lands past the pouches is the magic rock\'s, never a pack slot (a reward, createItemFromFamiliar)', () => {
    const out = layoutPack({ [POUCH]: 1, [RED]: 5100 }, null);
    assert.deepEqual(counts(out, RED), { inPack: 0, inBags: 5000, rock: 100 });
    assert.deepEqual(counts(layoutPack({ [RED]: 40 }, null), RED), { inPack: 0, inBags: 0, rock: 40 });
  });
});

describe('a save from before the rule', () => {
  it('keeps every element, in the slots they sat in', () => {
    const { inv, prefs } = oldSave();
    assert.deepEqual(counts(layoutPack(inv, prefs), RED), { inPack: 300, inBags: 5000, rock: 0 });
  });

  it('the pack slot takes no more, and gives no room', () => {
    const { inv, prefs } = oldSave();
    assert.equal(roomFor(inv, prefs, RED, 1), 0);
    const more = oldSave(50);
    assert.deepEqual(counts(layoutPack(more.inv, more.prefs), RED), { inPack: 300, inBags: 5000, rock: 50 });
  });

  it('with room in a pouch, new ones go to the pouch and the slot stays as it was', () => {
    const { prefs, key } = oldSave();
    prefs.n[key] = [100];
    const inv = { [POUCH]: 1, [RED]: 100 + 300 };
    assert.equal(roomFor(inv, prefs, RED, 10), 10);
    inv[RED] += 10;
    assert.deepEqual(counts(layoutPack(inv, prefs), RED), { inPack: 300, inBags: 110, rock: 0 });
  });

  it('using them comes off the first stack in slot order, and an emptied pack slot is gone for good', () => {
    const { prefs, key } = oldSave();
    prefs.place.pack = [RED, `@${key}`];
    prefs.n.pack = [300, 0];
    const inv = { [POUCH]: 1, [RED]: 5000 };
    const out = layoutPack(inv, prefs);
    assert.deepEqual(counts(out, RED), { inPack: 0, inBags: 5000, rock: 0 });
    assert.deepEqual(counts(layoutPack(inv, out.prefs), RED), { inPack: 0, inBags: 5000, rock: 0 });
  });

  it('can be dragged into a pouch with room; a pouch stack can\'t come back out', () => {
    const { prefs, key } = oldSave();
    prefs.n[key] = [100];
    const inv = { [POUCH]: 1, [RED]: 400 };
    const packIndex = layoutPack(inv, prefs).pack.slots.findIndex((s) => s.cls === RED);
    const move = moveStack(inv, prefs, { container: 'pack', index: packIndex }, { bag: key });
    assert.equal(move.ok, true);
    assert.deepEqual(counts(layoutPack(inv, move.prefs), RED), { inPack: 0, inBags: 400, rock: 0 });
    const back = moveStack(inv, move.prefs, { container: key, index: 0 }, { container: 'pack' });
    assert.equal(back.ok, false);
    assert.match(back.reason, /can't hold that/);
    assert.equal(moveStack({ [POUCH]: 1, [RED]: 40 }, null, { container: key, index: 0 }, { container: 'pack' }).ok, false);
  });

  it('a pouch that arrives takes one element stack out of the pack', () => {
    const inv = { [RED]: 300, apple: 2 };
    const prefs = { bags: [], place: { pack: ['apple', RED] }, n: { pack: [2, 300] } };
    assert.deepEqual(counts(layoutPack(inv, prefs), RED), { inPack: 300, inBags: 0, rock: 0 });
    inv[POUCH] = 1;
    assert.deepEqual(counts(layoutPack(inv, prefs), RED), { inPack: 0, inBags: 300, rock: 0 });
  });

  it('Stack Up empties the pack stack into the pouch, not the other way', () => {
    const { prefs, key } = oldSave();
    prefs.place.pack = [RED, `@${key}`];
    prefs.n.pack = [300, 0];
    prefs.n[key] = [100];
    const inv = { [POUCH]: 1, [RED]: 400 };
    const up = stackUp(inv, prefs);
    assert.deepEqual(counts(layoutPack(inv, up.prefs), RED), { inPack: 0, inBags: 400, rock: 0 });
  });
});

describe('every source', () => {
  const room = (inv, prefs = null) => {
    const trial = { ...inv };
    return (cls, n) => {
      const fits = roomFor(trial, prefs, cls, n);
      trial[cls] = (trial[cls] || 0) + fits;
      return fits;
    };
  };

  it('a smash with no pouch destroys all of it, in the source\'s words', () => {
    const out = smashTrophy('trophy_street_creator_rock_piece1', room({ apple: 1 }));
    assert.deepEqual(out.give, {});
    assert.match(out.message, /Green Elements were created, but destroyed, because you couldn't carry them\./);
  });

  it('a smash with a nearly full pouch keeps what fits and reports the rest', () => {
    const def = smashTrophy('trophy_street_creator_rock_piece1');
    const n = def.give.element_green;
    const out = smashTrophy('trophy_street_creator_rock_piece1', room({ [POUCH]: 1, [GREEN]: 5000 - 2 }));
    assert.equal(out.give.element_green, 2);
    assert.match(out.message, new RegExp(`^You smashed .*${n - 2} Green Elements were created, but destroyed`));
  });

  it('the Grinder refuses rock without a pouch (ore_grinder.js 335-336), not barnacles', () => {
    const rock = { tool: 'ore_grinder', outputs: [{ classTsid: RED, qty: 5 }], inputs: [{ classTsid: 'dullite', qty: 1 }] };
    const barnacle = { tool: 'ore_grinder', outputs: [{ classTsid: 'barnacle_talc', qty: 1 }], inputs: [{ classTsid: 'barnacle', qty: 1 }] };
    assert.equal(isGrinderRecipe(rock), true);
    assert.equal(grindsElements(rock), true);
    assert.equal(grindsElements(barnacle), false);
    const inv = { ore_grinder: 1, dullite: 1, barnacle: 1 };
    const check = canCraft(inv, rock, { learned: ['refining_1'] });
    assert.deepEqual([check.ok, check.reason], [false, 'pouch']);
    assert.equal(recipeBlockedLine(rock, check, { inv }), NEED_POUCH_LINE);
    assert.equal(canCraft({ ...inv, [POUCH]: 1 }, rock, { learned: ['refining_1'] }).ok, true);
    assert.equal(canCraft(inv, barnacle, { learned: ['refining_1'] }).ok, true);
  });

  it('the Grinder\'s full pouch: its room is the pouch, its line the source\'s', () => {
    assert.equal(roomFor({ [POUCH]: 1, [RED]: 5000, apple: 1 }, null, RED, 20), 0);
    const line = grinderResultLine({ input: 'dullite', crushed: 3, energy: -12, outputs: [{ classTsid: RED, made: 15, destroyed: 15 }, { classTsid: GREEN, made: 24, destroyed: 0 }] });
    assert.match(line, /15 .*were created, but destroyed, because you couldn't carry them\. You got 24 /);
  });

  it('the Make panel hands the Grinder its pack check', () => {
    const game = readFileSync(join(root, 'public/game.js'), 'utf8');
    assert.match(game, /isGrinderRecipe\(recipe\) \? \{ \.\.\.opts, room: grinderPackRoom \} : opts/);
    assert.match(game, /features\.query\('packRoom', cls, n, engine\)/);
  });

  it('smash asks the same room', () => {
    const f = readFileSync(join(root, 'public/js/features/item-verbs-more-feature.js'), 'utf8');
    assert.match(f, /engine\.query\?\.\('packRoom', cls, n, \{ inv: trial \}\)/);
  });

  it('an element left on the ground (#139) picks up only into a pouch', () => {
    const target = (classTsid) => ({ classId: 'dropped_item', state: { classTsid, count: 3 }, label: 'x' });
    const pick = (t, inv) => getVerbsFor(t, { pc: {}, inv }).find((v) => v.id === 'pickup');
    assert.equal(pick(target('apple'), {}).enabled, true);
    assert.equal(pick(target(RED), {}).enabled, false);
    assert.equal(pick(target(RED), {}).reason, 'You need an Elemental Pouch to pick up elements.');
    assert.equal(pick(target(RED), { [POUCH]: 1 }).enabled, true);
    assert.match(pick(target(RED), { [POUCH]: 1 }).tooltip, /in your Elemental Pouch$/);
    const game = readFileSync(join(root, 'public/game.js'), 'utf8');
    assert.match(game, /if \(element && !hasPouch\(inv\)\) \{\s*refusePickup\(PACK_COPY\.elementNoPouch\);/);
    assert.match(game, /refusePickup\(element \? PACK_COPY\.elementPouchFull : PACK_COPY\.pickupFull\);/);
  });
});
