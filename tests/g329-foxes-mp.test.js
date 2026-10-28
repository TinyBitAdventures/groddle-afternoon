/**
 * Register G329 / G134: Fox Brushing Preserves between real players and the
 * fox_flurrier badge. The realtime server's foxes.go owns each preserve's
 * foxes and baits from data/foxes.json (tools/build-realtime-foxes.mjs); the
 * multiplayer branch of features/foxes-feature.js draws them (js/foxes-mp.js).
 * Solo is untouched.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import { FOX_TIMING, canSpawnFox } from '../public/js/foxes.js?v=g403-1';
import {
  FOX_FLURRY_COUNTER,
  FOX_LEAVE_MS,
  FOX_PLAYERS_PER_FOX,
  FOX_PRESERVE_CAPACITY,
  igniteBaitXs,
  normalizeBaits,
  normalizeFoxes,
  playersForFoxes,
  playersInside,
  preserveOverCapacity,
  serverCanSpawn,
  serverId,
  spawnIsFlurry,
} from '../public/js/foxes-mp.js?v=g403-1';
import { foxesData, preserveStreets } from '../tools/build-realtime-foxes.mjs';
import { serverPath, skipWithoutServer } from '../tools/repos.mjs';

const root = join(import.meta.dirname, '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

describe('G329 foxes: the source rules', () => {
  it('spawns one fox per three players, so a fourth needs ten (inc_npcs.js:132-135)', () => {
    assert.equal(FOX_PLAYERS_PER_FOX, 3);
    assert.equal(playersForFoxes(1), 1);
    assert.equal(playersForFoxes(2), 4);
    assert.equal(playersForFoxes(3), 7);
    assert.equal(playersForFoxes(4), 10);
    assert.equal(serverCanSpawn(3, 9), false);
    assert.equal(serverCanSpawn(3, 10), true);
    // Solo's own gate agrees for one player.
    assert.equal(canSpawnFox(0, 1), serverCanSpawn(0, 1));
    assert.equal(canSpawnFox(1, 1), serverCanSpawn(1, 1));
  });

  it('counts the flurry only when three foxes were already there (num_foxes > 2)', () => {
    assert.equal(spawnIsFlurry(2), false);
    assert.equal(spawnIsFlurry(3), true);
    assert.equal(FOX_FLURRY_COUNTER, 'fox:three_or_more');
    const ach = JSON.parse(read('public/assets/content/achievements.json')).fox_flurrier;
    assert.deepEqual(ach.conditions.map((c) => `${c.group}:${c.name}:${c.num}`), ['fox:three_or_more:1']);
  });

  it('closes the preserve at eight players past the Ranger (npc_fox_ranger.js:480-497)', () => {
    assert.equal(FOX_PRESERVE_CAPACITY, 8);
    const at = (xs) => xs.map((x) => ({ x }));
    assert.equal(playersInside(at([100, 200, 900, 1200]), 500, 1), 2);
    assert.equal(playersInside(at([100, 200, 900, 1200]), 500, -1), 2);
    assert.equal(preserveOverCapacity(at(Array.from({ length: 7 }, (_, i) => 600 + i)), 500, 1), false);
    assert.equal(preserveOverCapacity(at(Array.from({ length: 8 }, (_, i) => 600 + i)), 500, 1), true);
    assert.equal(preserveOverCapacity(at([600]), Number.NaN, 1), false);
  });

  it('drops three baits 300 px apart from randInt(x, x - 400) (location.js:4347-4362)', () => {
    const xs = igniteBaitXs(2000, 5000, () => 0);
    assert.equal(xs.length, FOX_TIMING.baitDropCount);
    assert.deepEqual(xs, [2000, 2300, 2600]);
    assert.deepEqual(igniteBaitXs(2000, 5000, () => 0.99), [1604, 1904, 2204]);
    const edge = igniteBaitXs(50, 5000, () => 0.99);
    assert.ok(edge.every((x) => x >= 60), 'clamped to the street');
  });

  it('only takes ids and numbers it can trust from the server', () => {
    assert.equal(serverId('f-1a'), 'f-1a');
    assert.equal(serverId('<b>'), '');
    assert.deepEqual(normalizeBaits([{ id: 'b-1', x: 10 }, { id: 'x y', x: 1 }, { id: 'b-2', x: 'no' }]), [{ id: 'b-1', x: 10 }]);
    assert.deepEqual(normalizeFoxes([{ id: 'f-1' }, { id: 'f-2', leaving: true }, {}]), [{ id: 'f-1', leaving: false }, { id: 'f-2', leaving: true }]);
  });
});

describe('G329 foxes: the server data', () => {
  it('lists every preserve (a street with a Fox Ranger) and the source timings', () => {
    const d = foxesData();
    assert.equal(d.preserves.length, preserveStreets().length);
    assert.ok(d.preserves.includes('GA53N05IG9S2BLR'), 'Gyerean Park');
    assert.ok(d.preserves.length >= 40);
    assert.equal(d.spawnDelayMs, 4000);
    assert.equal(d.respawnAfterLeaveMs, 10000);
    assert.equal(d.baitExpireMs, 5 * 60 * 1000);
    assert.equal(d.maxBrushers, 3);
    assert.equal(d.maxBrushes, 21);
    assert.equal(d.leaveMs, FOX_LEAVE_MS);
    assert.equal(d.text.appears, 'A fox appears!');
    assert.equal(d.text.leavesNoBait, 'No more bait remains, so the Fox leaves...');
  });

  it('is current (node tools/build-realtime-foxes.mjs)', { skip: skipWithoutServer }, () => {
    const out = execFileSync(process.execPath, [join(root, 'tools/build-realtime-foxes.mjs'), '--check'], { encoding: 'utf8' });
    assert.match(out, /is current/);
  });

  it('is embedded by the server module, which cites spawn_fox', { skip: skipWithoutServer }, () => {
    const go = readFileSync(serverPath('foxes.go'), 'utf8');
    assert.match(go, /go:embed data\/foxes\.json/);
    assert.match(go, /inc_npcs\.js:130-160 spawn_fox/);
    assert.match(go, /"fox_flurry"/);
  });
});

describe('G329 foxes: the game', () => {
  const src = read('public/js/features/foxes-feature.js');

  it('runs the multiplayer branch only with a realtime client in multiplayer', () => {
    assert.match(src, /engine\.mode === 'multiplayer' && engine\.started\) mpSession\(engine\)/);
    assert.match(src, /engine\.query\?\.\('realtimeClient'\)/);
    assert.match(src, /from '\.\.\/foxes-mp\.js\?v=g403-1'/);
  });

  it('sends ignites, brushes and eats, and counts the flurry the server sends', () => {
    for (const kind of ['fox_ignite', 'fox_brush', 'fox_eat']) assert.ok(src.includes(`'${kind}'`), kind);
    for (const kind of ['fox_state', 'fox_baits', 'fox_bait_gone', 'fox_spawn', 'fox_leave', 'fox_gone', 'fox_flurry']) {
      assert.ok(src.includes(`'msg:${kind}'`), kind);
    }
    assert.match(src, /engine\.achievement\?\.\(FOX_FLURRY_COUNTER, 1\)/);
  });

  it('keeps solo as it was: local spawns, local baits, the local leave', () => {
    assert.match(src, /if \(!pendingSpawnAt\) pendingSpawnAt = now \+ FOX_TIMING\.spawnDelayMs;\n    pendingDrops\.push/);
    assert.match(src, /\} else if \(result\.leave\) \{\n    engine\.pushActivity\(result\.leaveMsg\);/);
    // Every multiplayer path is behind mp, which only mpSession sets.
    assert.equal((src.match(/\bmp = \{/g) || []).length, 1);
  });

  it('is in the feature list under its key', () => {
    assert.match(read('public/js/features/index.js'), /foxes-feature\.js\?v=/);
  });
});
