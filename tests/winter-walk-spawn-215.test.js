/**
 * #215 follow-up (Friendly, live 2026-11-12): "the first area, it shows you at like a signpost
 * or something, and then the screen refreshes you and puts you where you need to be. In ...
 * Winter Haven, it starts with your character further to the left ... and then puts you to the
 * right. The last street (Homeward) is similar."
 *
 * Cause: startWinterWalk, enterWinterHavenStage and reenterWinterWalkStage awaited
 * enterStreetWithTransition, which lifts the loading card once the street is in (the avatar on
 * the street's own spawn, a signpost), and only then ran setupWinterWalkStage, which puts the
 * avatar and camera on the route's start. Now each passes it as `arrive`, which streetTripTo
 * runs right after enterStreet inside the card's onMid, before the card lifts.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const game = readFileSync(join(root, 'public', 'game.js'), 'utf8');
const fn = (name) => {
  const at = game.search(new RegExp(`(?:async )?function ${name}\\(`));
  assert.ok(at >= 0, name);
  return game.slice(at, game.indexOf('\n}\n', at));
};

describe('#215 the walk\'s streets open with the avatar already on its spawn', () => {
  it('streetTripTo runs opts.arrive after enterStreet, inside onMid (before the card lifts) and on the no-card path', () => {
    const trip = fn('streetTripTo');
    assert.match(trip, /onMid: async \(\) => \{\n\s+data = await enterStreet\(tsid, \{ \.\.\.opts, quiet: true \}\);\n(?:\s+\/\/[^\n]*\n)*\s+opts\.arrive\?\.\(data\);\n\s+\},/);
    assert.match(trip, /if \(!useFx \|\| !el\) \{\n\s+const arrived = await enterStreet\(tsid, opts\);\n\s+opts\.arrive\?\.\(arrived\);\n\s+return arrived;/);
  });

  for (const [name, stage, street] of [
    ['startWinterWalk', 'surface', 'WINTER_WALK_STREET_ID'],
    ['enterWinterHavenStage', 'haven', 'WINTER_HAVEN_STREET_ID'],
    ['reenterWinterWalkStage', 'return', 'WINTER_WALK_STREET_ID'],
  ]) {
    it(`${name} sets up the ${stage} stage as the street arrives, not after the card`, () => {
      const body = fn(name);
      const enter = body.indexOf(`await enterStreetWithTransition(${street}, {`);
      assert.ok(enter >= 0, `${name} enters ${street}`);
      const call = body.slice(enter, body.indexOf('});', enter));
      assert.match(call, new RegExp(`arrive: \\(\\) => winterWalkState && setupWinterWalkStage\\('${stage}'\\),`));
      // Nothing places the avatar again once the card is gone.
      assert.doesNotMatch(body.slice(body.indexOf('});', enter)), /setupWinterWalkStage\(/);
    });
  }

  it('setupWinterWalkStage puts the avatar and the camera on the route start in one go', () => {
    const setup = fn('setupWinterWalkStage');
    assert.match(setup, /player\.x = clamp\(start\.x,[^\n]*\n\s+player\.y = start\.y;/);
    assert.match(setup, /camTarget = cameraTargetForPlayer\(player\.x\);\n\s+camY = [^\n]+\n\s+world\.x = -camTarget;\n\s+world\.y = -camY;/);
  });
});
