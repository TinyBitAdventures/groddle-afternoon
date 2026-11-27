/**
 * G1192: a pack stack dragged onto the street drops at your feet; in your own house it is set down where
 * it is let go, as the original's pack drag did.
 *
 * glitch-client LocationInputHandler.as: _packDragMoveHandler 657-690 makes the location itself the drag
 * target when nothing under the stack takes it and the stack is dropable, with the tip "Drop at your
 * feet"; _packDragCompleteHandler 745-776 opens the drop verb on the dragged stack (one goes at once, more
 * ask how many: InteractionMenuController.as 976-985). Where you can decorate (your own interior or
 * tower, WorldModel.as 59, location.js 2699-2706) the stack goes on the plat under the pointer
 * (HandOfDecorator.as dropItemFromPackOnTargetPlatform). takeable_drop (takeable.js 157-206) has no
 * rule against dropping in the air: the stack falls to the line under it.
 *
 * Run: node --test tests/g1192-drag-drop-street.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { registerDropTarget, beginDrag, resolveDrop, endDrag } from '../public/js/drop-targets.js?v=3ae8ae5c';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const game = read('public/game.js');
const world = read('public/js/features/world-drop-feature.js');
const homes = read('public/js/features/homes-feature.js');

const orderOf = (src, id) => Number(new RegExp(`id: '${id}',\\s+order: (\\d+),`).exec(src)?.[1]);

describe('the street itself is the last drop target', () => {
  it('asks after every thing, player, box and the own-house placing', () => {
    const street = orderOf(world, 'street');
    assert.ok(street > orderOf(world, 'world'), 'a thing on the street takes it first');
    assert.ok(street > orderOf(homes, 'home-place'), 'your own house sets it down where it is let go');
    assert.ok(orderOf(homes, 'home-place') > orderOf(world, 'world'), 'a thing in the house takes it first');
    assert.ok(orderOf(homes, 'home-place') > orderOf(homes, 'home-display-box'));
  });

  it('with the registry: a point no thing takes goes to the street, one a thing takes stays the thing\'s', () => {
    const el = { contains: () => true };
    const off = [
      registerDropTarget({ id: 't-world', order: orderOf(world, 'world'), scope: () => el, over: (d, at) => (at.thing ? { ok: true } : null), drop() {} }),
      registerDropTarget({ id: 't-street', order: orderOf(world, 'street'), scope: () => el, over: () => ({ ok: true }), drop() {} }),
    ];
    try {
      beginDrag({ from: 'pack', cls: 'cherry', count: 3 });
      assert.equal(resolveDrop({ x: 1, y: 1, el }).target.id, 't-street');
      assert.equal(resolveDrop({ x: 1, y: 1, el, thing: true }).target.id, 't-world');
    } finally {
      endDrag();
      off.forEach((f) => f());
    }
  });

  it('shows the original\'s tip, or Drop\'s own reason in red, and drops through the engine', () => {
    assert.match(world, /export const WORLD_DROP_FEET = 'Drop at your feet';/);
    const t = world.slice(world.indexOf("id: 'street',"), world.indexOf("exposeQA('groddleWorldDrop'"));
    assert.match(t, /const why = engine\.packDropBlocked\?\.\(feet\.cls\) \|\| '';/);
    assert.match(t, /showTip\(why \|\| WORLD_DROP_FEET, Boolean\(why\), at\.x, at\.y\);\s+return \{ ok: !why \};/);
    assert.match(t, /if \(!st \|\| res\?\.ok === false\) return;[\s\S]{0,80}engine\.dropDraggedAtFeet\(st\);/);
  });
});

describe('at your feet: the dragged stack\'s own Drop', () => {
  const fn = game.slice(game.indexOf('  dropDraggedAtFeet(stack) {'), game.indexOf('  /** A dropped stack drawn here back into the pack'));

  it('a bag goes whole; the dragged stack is the menu\'s; one goes at once, more ask how many', () => {
    assert.match(fn, /if \(stack\.bag\) \{\s+dropPackBag\(cls, stack\.bag\);/);
    assert.match(fn, /findPackSlotElement\(cls, Number\.isInteger\(stack\.copy\) \? stack\.copy : null, null, place\)/);
    assert.match(fn, /renderPackPopover\(cls, anchor\);\s+if \(!isPackPopoverOpen\(\)\) return false;/);
    assert.match(fn, /if \(count <= 1\) \{\s+dropPackItem\(cls, 1\);/);
    assert.match(fn, /packDropMode = true;\s+renderPackPopover\(cls, anchor\);/);
    assert.match(game, /packDropBlocked\(classTsid\) \{\s+return packDropBlockReason\(classTsid\);/);
  });

  it('Drop has no rule against the air: the stack lands on the line under the drop point (takeable.js 166-167)', () => {
    const drop = game.slice(game.indexOf('function dropPackItem('), game.indexOf('function dropPackBag('));
    assert.match(drop, /const y = landingY\(streetPlatforms, x, player\.y - 20\) \?\? player\.y;/);
    assert.doesNotMatch(drop, /onGround|grounded|airborne|isJumping|jumping/);
  });
});

describe('in your own house, outside Decorate', () => {
  const t = homes.slice(homes.indexOf('const placeTarget = (engine) => ({'), homes.indexOf('/** The home\'s drop targets'));

  it('a stack (not furniture, a tool or a bag) goes on the shelf, table or floor under the pointer, whole', () => {
    assert.match(t, /st\.from === 'pack' && st\.cls && !st\.bag && !st\.tool && !FURNITURE_CATALOG\[st\.cls\] && boxDropHere\(engine\)/);
    assert.match(t, /const target = packDropTarget\(engine, \{ clientX: at\.x, clientY: at\.y \}\);/);
    assert.match(t, /engine\.dropPackStackAt\?\.\(was\.classTsid, count, target\.x \+ roomX0\(\), target\.y, packDropOpts\(engine, was, target\)\)/);
    assert.match(homes, /registerDropTarget\(placeTarget\(engine\)\);/);
    // boxDropHere: your own house, not decorating (Decorate has its own drop, order 30).
    const here = homes.slice(homes.indexOf('function boxDropHere('), homes.indexOf('function endBoxDrag('));
    assert.match(here, /if \(mode === 'decorate'/);
    assert.match(here, /ctx\?\.inHome && ctx\.room === 'interior'/);
  });
});
