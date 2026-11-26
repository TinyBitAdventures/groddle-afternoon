/**
 * Austin's ruling 2026-11-26 ("Both as Glitch"): a Dust Trap was sometimes empty. items/dust_trap.js
 * onPlayerEnter (207-212): with no one else on the street, a trap sprang itself empty 20% of the time
 * (doPlayerResponse(null): down at once, no drop, 160-161). Ours never did. Solo here; online the
 * realtime server rolls it (objects_dust_trap.go).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { DUST_TRAP_EMPTY_CHANCE, createResourceNode, resourceNodeFrame, springDustTrapsOnArrival } from '../public/js/resource-nodes.js?v=e2d1cbc9';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const GSJS = join(root, '../glitch-GameServerJS');
const hasGsjs = existsSync(join(GSJS, 'items/dust_trap.js'));

describe('the source', () => {
  it('a trap sprang itself empty 20% of the time for a player alone on the street', { skip: !hasGsjs && 'glitch-GameServerJS not beside the repo' }, () => {
    const trap = readFileSync(join(GSJS, 'items/dust_trap.js'), 'utf8');
    assert.match(trap, /function onPlayerEnter\(pc\)\{ \/\/ defined by dust_trap\s*\/\/ If no one else is here\.\.\.\s*if\(num_keys\(this\.container\.getActivePlayers\(\)\) == 1 && is_chance\(0\.2\)\) \{\s*this\.doPlayerResponse\(null\);/);
    assert.match(trap, /\} else \{\s*this\.stayDown\(\);\s*\}/);
    assert.equal(DUST_TRAP_EMPTY_CHANCE, 0.2);
  });
});

describe('a Dust Trap sprung empty for a player alone (solo)', () => {
  const trapItem = (now) => ({ key: 'dust_trap:0', classTsid: 'dust_trap', node: createResourceNode('dust_trap', { now }) });

  it('one in five ready traps springs itself: down at once, no drop, the source\'s reset wait', () => {
    const now = 5_000_000;
    const a = trapItem(now - 10 * 60_000);
    const b = trapItem(now);
    const rolls = [0.19, 0.2];
    const sprung = springDustTrapsOnArrival([a, b], { now, rng: () => rolls.shift() });
    assert.deepEqual(sprung, ['dust_trap:0']);
    assert.deepEqual([a.node.units, a.node.depleted], [0, true]);
    // Ready 10 minutes: down 2 x 600 s (doPlayerResponse 132-145), raised 250 ms + 1 s on.
    assert.equal(a.node.respawnAt, now + 1_200_000 + 1250);
    // stayDown at once (160-161): no smackDown.
    assert.equal(resourceNodeFrame(a.node, now).sheetKey, 'down');
    assert.equal(b.node.depleted, false, 'a roll of 0.2 is no chance');
  });

  it('a trap already down, or anything else, is not rolled', () => {
    const now = 5_000_000;
    const down = trapItem(now);
    down.node.depleted = true;
    down.node.units = 0;
    let rolled = 0;
    springDustTrapsOnArrival([down, { key: 'dirt_pile:0', classTsid: 'dirt_pile', node: createResourceNode('dirt_pile', { now }) }], { now, rng: () => { rolled += 1; return 0; } });
    assert.equal(rolled, 0);
  });

  it('runs on each street entry, solo only (online the server rolls it)', () => {
    const src = readFileSync(join(root, 'public/js/features/resource-nodes-feature.js'), 'utf8');
    const body = src.slice(src.indexOf('  onStreetEnter(street, engine) {'), src.indexOf('  pendingTargets()'));
    assert.match(body, /if \(engine\.mode !== 'multiplayer'\) springDustTrapsOnArrival\(items, \{ now: Date\.now\(\) \}\);/);
  });
});
