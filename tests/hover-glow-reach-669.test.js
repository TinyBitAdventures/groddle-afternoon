/**
 * #669 (Austin 2026-11-26, "Glow only in reach, as Glitch"): on a computer the mouse-over rim showed
 * on anything under the mouse at any distance, in the in-reach glow's colour, so a far tree looked
 * reachable. Glitch glowed only what the avatar touched (MiddleGroundRenderer.as glowRenderer
 * 1157-1165); a mouse-over only set has_mouse and the name tip (LocationItemstackView.as 665-668).
 * Now a computer's mouse-over rim shows only on a thing in reach (the in-reach glow's rule: within
 * 100 of interactReach, by garden, not on a ladder, not under a menu or an act), the name tip at any
 * distance; a click, a garden's tend focus and a drop target keep their rim, and phones keep theirs.
 * Run: node --test tests/hover-glow-reach-669.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { hoverRimShown } from '../public/js/enter-chooser.js?v=74f4964a';

const ROOT = join(import.meta.dirname, '..');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');
const client = join(ROOT, '../glitch-client/com/tinyspeck/engine');

describe('#669: on a computer the mouse-over glow shows only in reach', () => {
  it('a mouse-over rims a thing in reach, not one out of reach; a phone and a click keep theirs', () => {
    assert.equal(hoverRimShown({ pointer: true, inReach: true }), true);
    assert.equal(hoverRimShown({ pointer: true, inReach: false }), false, 'a far tree does not glow under the mouse');
    assert.equal(hoverRimShown({ pointer: true, inReach: false, phone: true }), true, 'phones keep what they have');
    assert.equal(hoverRimShown({ pointer: false, inReach: false }), true, 'a click, a tend focus or a drop target keeps its rim');
  });

  it('game.js: the mouse paths ask for the reach rule, re-read with the reach glow', () => {
    const game = read('public/game.js');
    assert.match(game, /const hit = pickInteractableAt\(wx, wy\);\s*if \(hit\) setHoverTarget\(hit, \{ pointer: true \}\);/);
    assert.match(game, /spr\.on\('pointerover', \(\) => \{[\s\S]{0,300}setHoverTarget\(target, \{ pointer: true \}\);/);
    assert.match(game, /hoverRimShown\(\{ pointer: hoverByPointer, phone: TOUCH_PHONE, inReach: inGlowReach\(hoverTarget\) \}\)/);
    // The same rule as the in-reach glow: within 100 of interactReach, one per garden, off on a ladder.
    const rule = game.slice(game.indexOf('function inGlowReach('), game.indexOf('function inGlowReach(') + 400);
    assert.match(rule, /reachGlowOff\(\) \|\| climb\.active/);
    assert.match(rule, /groupHead\(t\) === head && interactReach\(t\) < 100/);
    const update = game.slice(game.indexOf('function updateReachGlow('), game.indexOf('function updateReachGlow(') + 700);
    assert.match(update, /syncHoverRims\(\);/, 'walking into reach lights the hovered thing, walking off puts it out');
  });

  it('Glitch: the mouse-over set has_mouse only; the glow came from the avatar\'s touch', { skip: !existsSync(client) && 'no client checkout' }, () => {
    const lis = readFileSync(join(client, 'view/itemstack/LocationItemstackView.as'), 'utf8');
    assert.match(lis, /protected function _mouseOverHandler\(e:MouseEvent\):void \{\s*if \(getTimer\(\) - StageBeacon\.last_mouse_move > 1000\) return;\s*has_mouse = true;\s*\}/);
    const mg = readFileSync(join(client, 'view/renderer/MiddleGroundRenderer.as'), 'utf8');
    assert.match(mg, /if \(_avatarView && _avatarView\.hit_target\.hitTestObject\(renderer\.hit_target\)\)\{\s*renderer\.glow\(\);/);
  });
});
