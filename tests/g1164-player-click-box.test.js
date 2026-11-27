/**
 * G1164: a group digging could not click the dirt pile with players standing at it. The click
 * picks the smallest box under the pointer (game.js pickInteractableAt) and another player's box
 * was 64 x 172 (to the top of the name plate), padded 8 px each way: 80 x 188 over a 195 x 71 pile.
 * Glitch's avatar hit box was 66 x 123, its bottom 10 px under the feet (AbstractAvatarView.as
 * drawHitBox 139-150), drawn as the clickable rect. Now both the online players' boxes
 * (party-feature.js) and the solo stand-ins' (game.js makeLocalCompanion) are that box, clicked as
 * drawn. Where a player and the pile overlap the player still wins, as in Glitch (avatars drew over
 * items), and the Enter chooser still lists every touched thing with players last (G206).
 *
 * Run: node --test tests/g1164-player-click-box.test.js
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { AVATAR_HIT_BOX, playerClickBox } from '../public/js/reach.js?v=456da8a8';
import { orderChoices, buildEnterChoices } from '../public/js/enter-chooser.js?v=297c6d15';

const game = readFileSync(new URL('../public/game.js', import.meta.url), 'utf8');
const party = readFileSync(new URL('../public/js/features/party-feature.js', import.meta.url), 'utf8');

/** One top-level function out of game.js by name. */
function fnSource(name) {
  const at = game.indexOf(`function ${name}(`);
  assert.ok(at >= 0, `${name} in game.js`);
  let depth = 0;
  for (let i = game.indexOf('{', at); i < game.length; i++) {
    if (game[i] === '{') depth++;
    else if (game[i] === '}' && --depth === 0) return game.slice(at, i + 1);
  }
  throw new Error(`unclosed ${name}`);
}

const makePick = new Function(
  'interactables',
  'nearestPlotIndex',
  `${fnSource('spriteWorldHitBox')}\n${fnSource('pointInHitBox')}\n${fnSource('pickInteractableAt')}\nreturn { pick: pickInteractableAt, box: spriteWorldHitBox };`,
);

const FLOOR = 600;
/** A dirt pile (195 x 71, bottom-centre on the floor). */
const pile = (x) => ({ classId: 'dirt_pile', label: 'Dirt Pile', sprite: { x, y: FLOOR, width: 195, height: 71, anchor: { x: 0.5, y: 1 } } });
/** Another player as party-feature.js registers one now. */
const playerAt = (x, y = FLOOR) => ({ classId: 'pc_remote', label: 'Someone', sprite: playerClickBox({ x, y }) });
/** The box before G1164: 64 x 172 over the feet, padded like any item. */
const oldPlayerAt = (x, y = FLOOR) => ({ classId: 'pc_remote', label: 'Someone', sprite: { x, y, _worldHitW: 64, _worldHitH: 172 } });

describe('G1164 players are clicked by Glitch\'s avatar hit box', () => {
  it('the box is 66 x 123 with its bottom 10 px under the feet, no pad', () => {
    assert.deepEqual(AVATAR_HIT_BOX, { w: 66, h: 123, below: 10 });
    const { box } = makePick([], () => -1);
    const b = box(playerAt(500).sprite, 0);
    assert.deepEqual({ left: b.left, right: b.right, top: b.top, bottom: b.bottom }, { left: 467, right: 533, top: FLOOR - 113, bottom: FLOOR + 10 });
    assert.equal(playerAt(500).sprite._worldHitExact, true);
  });

  it('the pile beside a player\'s body is the pile\'s again (the old padded box took it)', () => {
    const p = pile(500);
    const pointer = { x: 537, y: FLOOR - 40 }; // 37 px right of the player's middle, on the pile
    assert.equal(makePick([p, oldPlayerAt(500)], () => -1).pick(pointer.x, pointer.y).classId, 'pc_remote', 'before: the player');
    assert.equal(makePick([p, playerAt(500)], () => -1).pick(pointer.x, pointer.y).classId, 'dirt_pile');
  });

  it('the pile\'s top above a player\'s head is the pile\'s (a player in front of a pile on a higher floor)', () => {
    const p = pile(500); // the pile's top at FLOOR - 71
    const front = FLOOR + 50; // the player stands 50 px lower, in front
    const pointer = { x: 500, y: FLOOR - 68 };
    assert.equal(makePick([p, oldPlayerAt(500, front)], () => -1).pick(pointer.x, pointer.y).classId, 'pc_remote', 'before: the name plate\'s box');
    assert.equal(makePick([p, playerAt(500, front)], () => -1).pick(pointer.x, pointer.y).classId, 'dirt_pile');
  });

  it('a crowd of three standing across a pile leaves its ends to click', () => {
    const p = pile(500); // 402.5 to 597.5
    const crowd = [playerAt(440), playerAt(500), playerAt(560)];
    const { pick } = makePick([p, ...crowd], () => -1);
    assert.equal(pick(597, FLOOR - 30).classId, 'dirt_pile');
    assert.equal(pick(404, FLOOR - 30).classId, 'dirt_pile');
    const old = makePick([p, oldPlayerAt(440), oldPlayerAt(500), oldPlayerAt(560)], () => -1).pick;
    assert.equal(old(597, FLOOR - 30).classId, 'pc_remote', 'before: covered');
    assert.equal(old(404, FLOOR - 30).classId, 'pc_remote', 'before: covered');
  });

  it('over a player\'s body the player still wins, as in Glitch (avatars drew over items)', () => {
    const { pick } = makePick([pile(500), playerAt(500)], () => -1);
    assert.equal(pick(500, FLOOR - 30).classId, 'pc_remote');
  });

  it('the Enter chooser still lists players last', () => {
    // The player nearer than the pile: still listed after it.
    const near = [{ target: playerAt(500), distance: 0 }, { target: pile(500), distance: 20 }];
    const choices = orderChoices(buildEnterChoices({ near }));
    assert.deepEqual(choices.map((c) => c.kind), ['item', 'pc']);
    assert.equal(choices.at(-1).kind, 'pc');
  });

  it('online and solo players both use it', () => {
    assert.match(party, /playerClickBox\(hit\);/);
    assert.doesNotMatch(party, /_worldHitH = HIT_H/);
    assert.match(fnSource('makeLocalCompanion'), /playerClickBox\(root\);/);
  });
});
