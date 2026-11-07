/**
 * G369: your furniture moves and restyles outside Decorate. HandOfDecorator.as locDragStartHandler
 * 551-558 (can_decorate, WorldModel.as 59: the home's own interior), startFurnitureUpgrade 456-513
 * (no decorator mode), FurnUpgradeDialog.as 401-408 (the camera on the piece), items/furniture_*.js
 * verbs.upgrade and change_style. The gesture itself is checked in a real browser (see the commit);
 * this holds the wiring that keeps a click a click and every lock in force.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const pub = join(import.meta.dirname, '../public');
const homes = readFileSync(join(pub, 'js/features/homes-feature.js'), 'utf8');
const storage = readFileSync(join(pub, 'js/features/home-storage-feature.js'), 'utf8');
const game = readFileSync(join(pub, 'game.js'), 'utf8');
const fn = (src, start) => {
  const at = src.indexOf(start);
  assert.ok(at >= 0, start);
  return src.slice(at, src.indexOf('\n}\n', at));
};
const bind = fn(homes, '\nfunction bindPointer(');
const pressDown = bind.slice(bind.indexOf("root.addEventListener('pointerdown'"), bind.indexOf('if (!mode || !scene || !isCanvas(e)) return;', bind.indexOf("root.addEventListener('pointerdown'")));

describe('G369 who may', () => {
  it('only the owner, in their own interior, outside the edit modes, with nothing else up', () => {
    const room = fn(homes, '\nfunction looseRoom(');
    assert.match(room, /if \(mode \|\| !scene \|\| scene\.room !== 'interior' \|\| scene\.construction\) return false;/);
    assert.match(room, /ctx\?\.inHome && ctx\.owned/);
    assert.match(room, /!placing && !upgradePickerOpen\(\) && !engine\.busy\?\.\(\{ ignoreHome: true \}\)/);
  });

  it('a visit never sets the scene these read', () => {
    assert.doesNotMatch(fn(homes, '\nexport function visitorHomeScene('), /\n\s+scene = \{/);
  });
});

describe('G369 a click stays a click', () => {
  it('the press never stops the event: game.js still opens what it opened', () => {
    assert.ok(pressDown.includes('looseRoom(engine)'));
    assert.doesNotMatch(pressDown, /stopPropagation|stopImmediatePropagation|preventDefault/);
  });

  it('only the main button, and not a Mac\'s Ctrl+click, which is a right-click', () => {
    assert.match(pressDown, /e\.button === 0 && !\(e\.pointerType === 'mouse' && e\.ctrlKey\)/);
  });

  it('what stands in front of a piece keeps the click', () => {
    const at = fn(homes, '\nfunction looseItemAt(');
    assert.match(at, /if \(stackAt\(engine, p\)\) return null;/);
    assert.match(at, /engine\.interactableAt\?\.\(p\.x, p\.y\)/);
    assert.match(at, /!front \|\| targetIsPiece\(front, item\) \? item : null/);
    assert.match(game, /interactableAt: \(x, y\) => pickInteractableAt\(x, y\)/);
  });

  it('it only lifts past DRAG_DIST, and a piece\'s own menu gives way to the drag', () => {
    const move = bind.slice(bind.indexOf('const onPressMove'), bind.indexOf('const endLoosePress'));
    assert.match(move, /if \(moved < DRAG_DIST\) return;/);
    assert.match(move, /targetIsPiece\(engine\.interactionTarget\?\.\(\), \{ id: press\.id \}\)\) engine\.closeVerbMenu\?\.\(\)/);
  });

  it('a finger must hold first, so a tap or a slide never lifts a piece', () => {
    const move = bind.slice(bind.indexOf('const onPressMove'), bind.indexOf('const endLoosePress'));
    assert.match(move, /press\.loose && press\.touch && !press\.held/);
    assert.match(pressDown, /mine\.held = true/);
    assert.match(pressDown, /touch: e\.pointerType !== 'mouse'/);
  });

  it('the world\'s right-click still has everything but a plain piece', () => {
    const ctx = fn(homes, '\nfunction loosePieceContext(');
    assert.match(ctx, /!item \|\| engine\.interactableAt\?\.\(p\.x, p\.y\)\) return false/);
  });
});

describe('G369 the locks stay', () => {
  it('the drag goes through beginMove, with the Door\'s lift check', () => {
    const move = bind.slice(bind.indexOf('const onPressMove'), bind.indexOf('const endLoosePress'));
    assert.match(move, /else beginMove\(engine, press\.id\);\n\s+if \(!placing\) \{/);
    assert.match(fn(homes, '\nfunction beginMove('), /doorLiftCheck\(floors, houseFloorHere\(\) \?\? -1, id, \{ inProgress: doorJobStarted\(\) \}\)/);
  });

  it('the style is off while the piece is for sale', () => {
    const row = fn(homes, '\nfunction pieceStyleRow(');
    assert.match(row, /engine\.query\?\.\('furnitureSaleLock', decor, item\.id, engine\)/);
    assert.match(row, /disabled: Boolean\(locked\), reason: locked \? UPGRADE_TEXT\.forSale : ''/);
  });

  it('nothing here picks a piece up: storagePickupLock and the rest stay on Decorate\'s Pick up', () => {
    const start = homes.indexOf('// --- your furniture outside Decorate');
    assert.doesNotMatch(homes.slice(start, homes.indexOf('\n/** The world x span of the room on show', start)), /pickUpFurniture|'pickup'/);
    const end = fn(homes, '\nfunction endDrag(');
    assert.match(end, /if \(overTray \|\| was\.over === 'tray'\)/);
    assert.match(fn(homes, '\nfunction runFurnitureAction('), /storagePickupLock\(placedItem\(decor, id\), \{ income \}\)/);
  });

  it('a cabinet or a box offers its style from its own menu, for its owner', () => {
    assert.match(storage, /const style = homesFeature\.pieceStyleVerb\?\.\(uid, engine\);/);
    assert.match(storage, /if \(own && \(verbId === 'upgrade' \|\| verbId === 'change_style'\)\) return homesFeature\.openPieceStyle\(uid, engine\), true;/);
    assert.ok(storage.indexOf('const style =') > storage.indexOf('if (target?.state?.owner) {'), 'inside the owner\'s branch');
  });
});

describe('G369 online', () => {
  it('a piece that can be sold has a menu of its own: its style joins it, and only for its owner', () => {
    const mp = readFileSync(join(pub, 'js/features/home-street-mp-feature.js'), 'utf8');
    assert.match(mp, /const style = w === 'house' \? homesFeature\.pieceStyleVerb\?\.\(e\.uid, engine\) : null;/);
    assert.match(mp, /target\.classId === CLASS_SALE && \(verbId === 'upgrade' \|\| verbId === 'change_style'\)/);
  });
});

describe('G369 after the drop', () => {
  it('nothing stays selected, and a piece in hand is let go on leaving the room', () => {
    assert.match(fn(homes, '\nfunction endDrag('), /if \(was\.loose\) \{\n\s+selected = null;\n\s+renderFurniture\(engine\);/);
    assert.match(homes, /onStreetClear\(engine\) \{[\s\S]{0,160}if \(drag\?\.loose\) \{\n\s+\/\/[^\n]*\n\s+drag = null;\n\s+placing = null;/);
  });

  it('Escape cancels the drag and the picker, and the avatar waits while the picker is up', () => {
    assert.match(bind, /if \(e\.key === 'Escape' && drag\?\.loose\) \{\n\s+e\.stopImmediatePropagation\(\);\n\s+cancelCarry\(engine\);/);
    assert.match(bind, /else if \(panKey\(e\.key\) \|\| e\.key === ' ' \|\| [^\n]*\{\n\s+e\.stopImmediatePropagation\(\);/);
  });

  it('the camera scrolls at the edge while carrying and holds on the piece for the picker', () => {
    const look = fn(homes, '\nfunction interiorCameraLook(');
    assert.match(look, /if \(drag\?\.loose\) tickDecorPan\(/);
    assert.match(look, /else if \(!upgradePickerOpen\(\)\) decorCamX = null;/);
    assert.match(fn(homes, '\nfunction frameUpgradePiece('), /if \(scene\?\.room !== 'interior'\) return false;/);
  });
});
