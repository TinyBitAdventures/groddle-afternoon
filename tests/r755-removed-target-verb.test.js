/**
 * Report #755, second fault: acting on something just removed threw. game.js requestVerb passed a
 * target whose sprite was already destroyed straight to beginVerbAction, which asked
 * features/street-objects-feature.js outOfReach, and that read the sprite's x: a destroyed Pixi
 * sprite's position is gone (Container.destroy sets _position to null), so `spr.x` threw a
 * TypeError. In Glitch a verb on a thing that is gone does nothing; now the verb quietly does
 * nothing and nothing throws.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { streetObjectsFeature } from '../public/js/features/street-objects-feature.js?v=2235c767';

const root = join(import.meta.dirname, '..');
const game = readFileSync(join(root, 'public/game.js'), 'utf8');

/** A sprite as Pixi 8 leaves it after destroy(): flagged, its position nulled, so x and y throw. */
function destroyedSprite() {
  const s = { destroyed: true, _position: null };
  Object.defineProperty(s, 'x', { get() { return this._position.x; } });
  Object.defineProperty(s, 'y', { get() { return this._position.y; } });
  return s;
}

function onlineEngine() {
  const client = { state: 'online', wanted: 'GSTREET', on: () => () => {}, send: () => true };
  return {
    mode: 'multiplayer',
    streetTsid: 'GSTREET',
    player: { x: 100, y: 500 },
    toast() {},
    setData() {},
    query: (hook) => (hook === 'realtimeClient' ? client : null),
  };
}

describe('#755: a verb on a thing just removed', () => {
  it('the reach check before the swing does not read a destroyed sprite (no throw, no refusal)', () => {
    streetObjectsFeature._reset();
    const engine = onlineEngine();
    const rock = { classId: 'rock_dullite_1', label: 'Dullite Rock', rockIndex: 1, sprite: destroyedSprite() };
    assert.throws(() => rock.sprite.x, TypeError, 'the stand-in sprite throws as Pixi\'s does');
    let out;
    assert.doesNotThrow(() => { out = streetObjectsFeature.verbOutOfReach(rock, 'mine', engine); });
    assert.equal(out, null);
    assert.doesNotThrow(() => { out = streetObjectsFeature.verbOutOfReach(rock, 'mine', engine, { x: 200, y: 500 }); });
    assert.equal(out, null);
    streetObjectsFeature._reset();
  });

  it('game.js: requestVerb drops a verb whose thing is gone instead of running it, and beginVerbAction does too', () => {
    const fn = game.slice(game.indexOf('function requestVerb('), game.indexOf('function stepToMineStand('));
    assert.match(fn, /if \(target\?\.sprite\?\.destroyed\) return false;[^\n]*\n\s*if \(!target\?\.sprite \|\| !player \|\| !verb\) return go\(\);/);
    const begin = game.slice(game.indexOf('function beginVerbAction('), game.indexOf('function beginVerbAction(') + 600);
    assert.match(begin, /if \(!target \|\| !verb \|\| currentAction\) return false;\s*if \(target\.sprite\?\.destroyed\) return false;[\s\S]*const tooFar = features\.query\('verbOutOfReach'/);
  });
});
