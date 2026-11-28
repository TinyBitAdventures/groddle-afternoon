/**
 * Report #669 points 3 and 4 (G1304, Austin 2026-11-25).
 * 3: the "Enter · choose from N" chip that rose over things as you walked past them was ours (R16).
 *    On a computer Glitch drew no words there: what the avatar touched glowed
 *    (MiddleGroundRenderer.as _findInteractionSprites) and the mouse named a thing (getTip). Now a
 *    computer glows what is in reach and names a thing under the mouse; the walk-past chip stays on
 *    phones (the phone gate's 'phone'; a tablet plays as a computer), where it is how Act's choices
 *    are found.
 * Point 4 (the padlock's words) is in tests/home-stack-marks.test.js.
 * Run: node --test tests/enter-hint-669.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { enterHintPick, reachGlowTargets } from '../public/js/enter-chooser.js?v=b37c63e0';

const ROOT = join(import.meta.dirname, '..');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');
const client = join(ROOT, '../glitch-client/com/tinyspeck/engine');

describe('#669 point 3: no walk-past chip on a computer', () => {
  const apple = { classId: 'apple', label: 'Apple' };
  const tree = { classId: 'trant_fruit', label: 'Fruit Tree' };

  it('a computer walking past things shows no chip; a phone still does', () => {
    assert.equal(enterHintPick({ nearest: apple, phone: false }), null);
    assert.deepEqual(enterHintPick({ nearest: apple, phone: true }), { target: apple, via: 'walk-past' });
    assert.equal(enterHintPick({ phone: true }), null);
  });

  it('the mouse names a thing: with Enter in reach, its name alone out of reach', () => {
    assert.deepEqual(enterHintPick({ hover: tree, hoverInReach: true, nearest: apple }), { target: tree, via: 'hover' });
    assert.deepEqual(enterHintPick({ hover: tree, hoverInReach: false, nearest: apple }), { target: tree, via: 'name' });
    // On a phone an out-of-reach "hover" (the last tap) gives way to the nearest, as before.
    assert.deepEqual(enterHintPick({ hover: tree, hoverInReach: false, nearest: apple, phone: true }), { target: apple, via: 'walk-past' });
  });

  it('the keyboard chain\'s thing keeps its hint everywhere', () => {
    assert.deepEqual(enterHintPick({ recent: apple, hover: tree, hoverInReach: true }), { target: apple, via: 'recent' });
    assert.deepEqual(enterHintPick({ recent: apple, phone: true }), { target: apple, via: 'recent' });
  });

  it('what is in reach glows: one per garden, not the hovered thing (its own rim), nothing on a ladder', () => {
    const garden = { classId: 'garden_new' };
    const plotA = { classId: 'garden_plot', state: { gardenEntity: garden } };
    const plotB = { classId: 'garden_plot', state: { gardenEntity: garden } };
    const near = [apple, plotA, plotB, tree].map((target, i) => ({ target, distance: i * 10 }));
    assert.deepEqual(reachGlowTargets(near), [apple, garden, tree]);
    assert.deepEqual(reachGlowTargets(near, { hover: tree }), [apple, garden]);
    assert.deepEqual(reachGlowTargets(near, { climbing: true }), []);
  });

  it('Glitch glowed every sprite the avatar touched, and the mouse named a stack', { skip: !existsSync(client) && 'no client checkout' }, () => {
    const mg = readFileSync(join(client, 'view/renderer/MiddleGroundRenderer.as'), 'utf8');
    assert.match(mg, /renderer\.glow\(\);\s*glowingRenderers\[renderer\] = true;\s*_pc\.apo\._interaction_spV\.push\(renderer\);/);
    assert.match(mg, /if \(apo\.onLadder\) return;/);
    const lis = readFileSync(join(client, 'view/itemstack/LocationItemstackView.as'), 'utf8');
    assert.match(lis, /public function getTip\(tip_target:DisplayObject = null\):Object \{/);
  });

  it('game.js: the hint follows enterHintPick, the nearest only on a phone, a name with no key', () => {
    const game = read('public/game.js');
    assert.match(game, /const pick = enterHintPick\(\{\s*recent,\s*hover: nearHover,\s*hoverInReach,\s*nearest: TOUCH_PHONE && !recent && !hoverInReach \? nearestInteractable\(100\) : null,\s*phone: TOUCH_PHONE,\s*\}\);\s*const near = pick\?\.target \|\| null;/);
    assert.match(game, /key: pick\.via === 'name' \? '' : 'Enter',/);
    assert.doesNotMatch(game, /: nearestInteractable\(100\)\);\n\s*const nearSign/, 'the old walk-past pick is gone');
    assert.match(game, /app\.canvas\.dataset\.enterHint = hintLine;/);
  });

  it('game.js: the reach glow is a computer\'s, in the hover\'s rim, every frame', () => {
    const game = read('public/game.js');
    assert.match(game, /function reachGlowOff\(\) \{\s*if \(TOUCH_PHONE \|\| !state\.started \|\| menuTarget \|\| currentAction \|\| isScreenFxBlocking\(\)\) return true;/);
    assert.match(game, /function reachGlowWanted\(\) \{\s*if \(reachGlowOff\(\)\) return \[\];/);
    assert.match(game, /reachGlowTargets\(near, \{ hover: hoverTarget, climbing: climb\.active \}\)/);
    // #712: a target's rims, one per art part (a Container's art Sprites too).
    assert.match(game, /reachGlows\.set\(t, addTargetRims\(t\)\)/);
    assert.match(game, /dropReachGlow\(target\);\s*target\._hoverGlow = addTargetRims\(target\);/);
    assert.match(game, /run\('reach glow', updateReachGlow\);/);
    // A computer is what the phone gate does not call a phone (play/index.html GRODDLE_DEVICE).
    assert.match(game, /const TOUCH_PHONE = isPhoneDevice\(window\);/);
  });

  it('the rim shows: Pixi 8 has no Container.worldAlpha, so the hover rim read undefined and hid itself', () => {
    const game = read('public/game.js');
    const sync = game.slice(game.indexOf('outline.syncOutlineTexture = () => {'), game.indexOf('outline.syncOutlineTexture();'));
    assert.doesNotMatch(sync, /src\.worldAlpha/);
    assert.match(sync, /outline\.visible = !!src\.visible && \(src\.getGlobalAlpha\?\.\(false\) \?\? src\.alpha \?\? 1\) > 0\.01;/);
    const pixi = readFileSync(join(ROOT, 'public/vendor/pixi/pixi-8.23.0.min.js'), 'utf8');
    assert.match(pixi, /getGlobalAlpha\(r\)\{if\(r\)return this\.renderGroup\?this\.renderGroup\.worldAlpha/, 'worldAlpha lives on the render group');
  });

  it('is registered: the walk-past chip is ours and kept on phones only', () => {
    const reg = JSON.parse(read('tools/inventions/inventions.json'));
    const e = reg.entries.find((x) => x.id === 'enter-walk-past-chip');
    assert.ok(e, 'inventions.json enter-walk-past-chip');
    assert.equal(e.status, 'kept');
    assert.match(e.ruling, /phones/);
    assert.ok(e.rows.includes('G1304'));
    assert.ok(e.where.some((w) => w.file === 'public/js/enter-chooser.js'));
  });
});
