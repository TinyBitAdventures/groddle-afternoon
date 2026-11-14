/**
 * Report #318 (Radiant Glare, floor 3): the room's hint says clicking a bulb works from anywhere,
 * but a click on the totem's top bank from the two-tone disc (the intended way to switch to
 * purple) was refused: the bank hangs just under the disc the player stands on, so game.js's
 * click guard (behindFloorFromPlayer) saw a floor between them, and the verb's 300 px range
 * (verbReachFrom) applied too. This runs game.js's own two reach checks, the ones the click
 * handler and requestVerb make, against the room's real floor 3 with blue lit.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { avatarHitBox, behindFloor } from '../public/js/reach.js?v=8e52df56';
import { avatarHeadReach } from '../public/js/street-model.js?v=b6cb6a4e';
import { inVerbReach, verbRange } from '../public/js/walk-over.js?v=277ab977';
import { litByTier, radiantLayout, walkable } from '../public/js/quest-rooms/radiant-glare.js?v=d743533a';

const root = join(import.meta.dirname, '..');
const game = readFileSync(join(root, 'public/game.js'), 'utf8');
const roomSrc = readFileSync(join(root, 'public/js/quest-rooms/radiant-glare.js'), 'utf8');

/** A top-level function's source from game.js. */
function fnSource(name) {
  const start = game.indexOf(`\nfunction ${name}(`);
  assert.ok(start >= 0, name);
  const end = game.indexOf('\n}\n', start);
  return game.slice(start, end + 3);
}

/** The bulb's hit area (radiant-glare.js makeBulb: rect(-18, -34, 36, 42)). */
const hitBox = (s) => ({ left: s.x - 18, top: s.y - 34, right: s.x + 18, bottom: s.y + 8 });

function reachChecks(platforms) {
  const deps = {
    streetPlatforms: platforms,
    features: { query: () => undefined },
    engine: {},
    avatarHeadReach,
    avatarHitBox,
    behindFloor,
    inVerbReach,
    spriteWorldHitBox: (s) => hitBox(s),
    verbWalkRange: (t, v) => verbRange(t?.classId, v),
    interactDistance: (t, px, py) => {
      const b = hitBox(t.sprite);
      return Math.hypot(Math.min(Math.max(px, b.left), b.right) - px, Math.min(Math.max(py, b.top), b.bottom) - py);
    },
  };
  const names = Object.keys(deps);
  const body = `let player = null;\n${fnSource('behindFloorFromPlayer')}\n${fnSource('verbReachFrom')}\nreturn { behindFloorFromPlayer, verbReachFrom };`;
  return new Function(...names, body)(...names.map((n) => deps[n]));
}

describe('#318 Radiant Glare bulbs click from anywhere', () => {
  const layout = radiantLayout();
  const light = { lampUntil: {}, mixer: {}, totem: { a: 'blue', b: null } };
  const platforms = walkable(layout, litByTier(light));
  const junction = layout.platforms.find((p) => p.junction);
  const stand = { x: (junction.x1 + junction.x2) / 2, y: junction.y };
  const top = layout.bulbs.filter((b) => b.panel === 'totem' && b.bank === 'b');
  const { behindFloorFromPlayer, verbReachFrom } = reachChecks(platforms);
  const target = (b, extra = {}) => ({ classId: 'radiant_bulb', sprite: { x: b.x, y: b.y, destroyed: false }, rgBulb: b, ...extra });

  it('the two-tone disc is lit in blue and the top bank hangs under it', () => {
    assert.ok(platforms.some((p) => p.id === `rg_${junction.id}`));
    assert.equal(top.length, 3);
    for (const b of top) assert.ok(b.y > junction.y, b.id);
  });

  it('a bulb target without the exemption is behind the disc (the refusal players met)', () => {
    for (const b of top) assert.equal(behindFloorFromPlayer(target(b), stand), true, b.id);
  });

  it('the room registers its bulbs as reachable from anywhere', () => {
    assert.match(roomSrc, /classId: 'radiant_bulb',[\s\S]{0,400}reachAnywhere: true,/);
  });

  it('from the two-tone disc each top-bank bulb passes the click guard and the verb reach', () => {
    for (const b of top) {
      const t = target(b, { reachAnywhere: true });
      assert.equal(behindFloorFromPlayer(t, stand), false, b.id);
      assert.equal(verbReachFrom(t, 'press', stand), true, b.id);
    }
  });

  it('and from the far end of the room, past the 300 px range', () => {
    const far = { x: 40, y: 3240 };
    const t = target(top[0], { reachAnywhere: true });
    assert.equal(verbReachFrom(t, 'press', far), true);
    assert.equal(verbReachFrom(target(top[0]), 'press', far), false);
  });

  it('the click handler and requestVerb still go through these two checks', () => {
    assert.match(game, /if \(!\/\^pc_\/\.test\(String\(best\.classId \|\| ''\)\) && behindFloorFromPlayer\(best\) && !walkOverReaches\(best\)\) \{/);
    assert.match(game, /function requestVerb\(target, verb, \{ label = '', run = null \} = \{\}\) \{[\s\S]{0,200}if \(verbReachFrom\(target, verb\.id\)\) return go\(\);/);
  });
});
