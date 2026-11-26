/**
 * #642: a mined-out rock stayed on the street as a faint ghost (drawn at 35%). Glitch drew it as
 * nothing until it reformed (include/mining.js 3-6 buildState: 'visible:false' while it has no
 * chunks; onRespawn 143-171 gives it 50 or 150 again), with no rubble or faded state, so the remake
 * hides it, and a rock that is not there is never pointed at or reached.
 * Run: node --test tests/rock-gone-642.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createMineRock, crumbleRock, rockShown, tickMineRock } from '../public/js/mining.js?v=7ecaa572';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const game = readFileSync(join(root, 'public/game.js'), 'utf8');
const gsjs = (() => { try { return readFileSync(join(root, '../glitch-GameServerJS/items/include/mining.js'), 'utf8'); } catch { return ''; } })();

describe('#642: a mined-out rock is gone until it reforms', () => {
  it('is shown with chunks, gone when crumbled, back when it reforms', () => {
    const rock = createMineRock('rock_beryl_1');
    assert.equal(rockShown(rock), true);
    crumbleRock(rock, [], { now: 1000, rng: () => 0.99 });
    assert.equal(rockShown(rock), false);
    assert.equal(tickMineRock(rock, rock.respawnAt + 1), true);
    assert.equal(rockShown(rock), true);
    assert.equal(rockShown(null), false);
  });

  it('as Glitch drew it: invisible while it has no chunks', { skip: gsjs ? false : 'needs glitch-GameServerJS beside the repo' }, () => {
    assert.match(gsjs, /function buildState\(\)\{\n\tif \(!this\.isUseable\(\)\) return 'visible:false';/);
  });

  it('the street hides it and leaves it out of the pointer and the Enter key, with no ghost', () => {
    assert.doesNotMatch(game, /rockSprite\.alpha = rock\.depleted \? 0\.35/);
    assert.match(game, /root\.visible = rockShown\(rock\);\n\s+root\.rockSprite\.alpha = 1;\n\s+target\.absent = !root\.visible;/);
    assert.match(game, /if \(!t\.sprite \|\| t\.sprite\.destroyed \|\| t\.absent\) continue;/, 'the pointer');
    assert.match(game, /if \(!t\?\.sprite \|\| t\.sprite\.destroyed \|\| t\.absent\) return Infinity;/, 'the Enter key');
  });
});
