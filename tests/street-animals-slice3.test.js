/**
 * Salmon, foxes' walks and Fire Dragons in the same place for everyone online (slice 3 of
 * research/plans/street-animals-shared.md):
 *   - a street's Salmon are shared nodes (the server keeps whether each is there; one pocketed is
 *     gone for everyone until its 10 s respawn) and swim on the server's clock (salmonSwimAt);
 *   - the server runs a preserve's foxes (foxes_walk.go) and every page draws its legs
 *     (js/foxes-mp.js foxLegFrom, foxOnLeg) on the layout every page lays out (data/foxes.json);
 *   - a Fire Dragon is a walker like a Crab (dragonWalkAt), held by a pet.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';

import { DRAGON_PLAN_MOVES, SALMON_SWIM, creatureOf, dragonPlan, dragonWalkAt, salmonSwimAt } from '../public/js/street-creatures.js?v=8ba71c8a';
import { FIRE_DRAGON_WALK } from '../public/js/fire-dragon.js?v=b7f3d751';
import { foxLegFrom, foxOnLeg } from '../public/js/foxes-mp.js?v=5bbee4df';
import { FOX_TIMING } from '../public/js/foxes.js?v=59323f35';
import { SHARED_NODE_CLASSES, applyNodeState, freshenNode, sharedNodeVerb } from '../public/js/street-objects.js?v=c594cb8d';
import { createResourceNode } from '../public/js/resource-nodes.js?v=7a77fd73';
import { streetObjectsFeature } from '../public/js/features/street-objects-feature.js?v=5012b372';
import { serverPath, skipWithoutServer } from '../tools/repos.mjs';

describe('a shared Salmon', () => {
  it('swims to and fro its range at the solo pace, turns at each end, and is the same on every page', () => {
    const start = { offset0: 40, dir0: 1, range: 150, phase: 1.2 };
    const leg = (2 * 150) / SALMON_SWIM.speed;
    let turns = 0;
    let was = false;
    for (let t = 0; t < 2 * leg + 2 * SALMON_SWIM.turnMs; t += 50) {
      const a = salmonSwimAt(start, t);
      assert.ok(a.offset >= -150 && a.offset <= 150, `${t}: ${a.offset}`);
      assert.ok(Math.abs(a.bob) <= SALMON_SWIM.bob + 1e-9);
      if (a.turning && !was) turns += 1;
      was = a.turning;
    }
    assert.equal(turns, 2, 'one turn at each end of a round');
    assert.ok(Math.abs(salmonSwimAt(start, 0).offset - 40) < 1e-9, 'it starts where its key put it, heading its way');
    assert.ok(Math.abs(salmonSwimAt(start, 1000).offset - (40 + SALMON_SWIM.speed * 1000)) < 1e-9);
    assert.deepEqual(salmonSwimAt(start, 98765432), salmonSwimAt({ ...start }, 98765432));
    // turnRight is 11 frames at 0.42 a 60 fps frame.
    assert.equal(SALMON_SWIM.turnMs, Math.round((11 / 0.42) * (1000 / 60)));
  });

  it('is a shared node: one pocketed is gone until the server\'s respawn', () => {
    assert.ok(SHARED_NODE_CLASSES.includes('npc_salmon'));
    assert.equal(sharedNodeVerb('npc_salmon', 'pocket'), true);
    const node = createResourceNode('npc_salmon', { seed: 'S:npc_salmon:0', now: 1000 });
    applyNodeState(node, { id: 'node:npc_salmon:0', units: 0, in: 7000 }, 50000);
    assert.equal(node.depleted, true);
    assert.equal(node.respawnAt, 57000);
    freshenNode(node);
    assert.equal(node.depleted, false);
    assert.equal(node.units, 1);
  });

  it('swims on the street\'s clock only while the street is shared', () => {
    streetObjectsFeature._reset();
    assert.equal(streetObjectsFeature.sharedClockNow({ mode: 'multiplayer', streetTsid: 'S' }), null);
  });
});

describe('a fox the server runs', () => {
  it('reads a leg and draws the fox on it: running at 500 px/s, eating, pausing, brushed', () => {
    const run = foxLegFrom({ x0: 800, x1: 538, t0: 1000, ms: 524, pose: 'run' });
    assert.deepEqual(run, { x0: 800, x1: 538, t0: 1000, ms: 524, pose: 'run' });
    assert.deepEqual(foxOnLeg(run, 1262), { x: 669, dir: -1, state: 'run' });
    assert.equal(foxOnLeg(run, 99999).x, 538, 'it stays at the end of its leg until the next comes');
    const eat = foxLegFrom({ x0: 1700, x1: 1700, t0: 5000, ms: FOX_TIMING.eatResumeMs, pose: 'eat' });
    assert.equal(foxOnLeg(eat, 5200).state, 'eatStart');
    assert.equal(foxOnLeg(eat, 5700).state, 'eat');
    assert.equal(foxOnLeg(eat, 6500).state, 'eatEnd');
    assert.equal(foxOnLeg(foxLegFrom({ x0: 3, x1: 3, t0: 1, ms: 1000, pose: 'pause' }), 2).state, 'pause');
    assert.equal(foxOnLeg(foxLegFrom({ x0: 3, x1: 3, t0: 1, ms: 600, pose: 'brushed' }), 2).state, 'brushed');
    assert.equal(foxLegFrom({ x0: 1, x1: 2, t0: 1, ms: 1, pose: 'dance' }), null);
    assert.equal(foxLegFrom(null), null);
  });

  it('data/foxes.json lays out every preserve for the server to run its foxes', { skip: skipWithoutServer }, () => {
    const data = JSON.parse(readFileSync(serverPath('data/foxes.json'), 'utf8'));
    assert.equal(Object.keys(data.layouts).length, data.preserves.length);
    for (const [tsid, lay] of Object.entries(data.layouts)) {
      assert.ok(lay.w > 0 && lay.ranger > 0 && lay.spawner > 0 && Array.isArray(lay.markers), tsid);
      for (const x of lay.markers) assert.ok(x > 0 && x < lay.w, `${tsid} marker ${x}`);
    }
  });
});

describe('a shared Fire Dragon', () => {
  const home = { l: 100, r: 2400, x0: 1200 };
  it('roams 220 to 380 px at 55 to 65 px/s, rests 3 to 8 s, and comes back round', () => {
    const plan = dragonPlan(home, 12345);
    assert.ok(plan.speed >= FIRE_DRAGON_WALK.speedMin && plan.speed <= FIRE_DRAGON_WALK.speedMax);
    const walks = plan.segs.filter((g) => g.pose === 'walk');
    assert.ok(walks.length >= DRAGON_PLAN_MOVES - 3);
    for (const g of walks.slice(0, -1)) {
      const d = Math.abs(g.to - g.x);
      assert.ok((d >= 220 && d <= 380) || g.to === 100 || g.to === 2400, `a roam of ${d}`);
    }
    const rests = plan.segs.filter((g, i) => g.pose === 'stand' && i > 0 && g.ms !== FIRE_DRAGON_WALK.stuckWaitMs);
    for (const g of rests) assert.ok(g.ms >= FIRE_DRAGON_WALK.restMin && g.ms <= FIRE_DRAGON_WALK.restMax, g.ms);
    for (let t = 0; t < plan.ms; t += 400) {
      const p = dragonWalkAt(home, t, 12345);
      assert.ok(p.x >= 100 && p.x <= 2400);
    }
    assert.ok(Math.abs(dragonWalkAt(home, plan.ms - 1, 12345).x - 1200) < 1);
  });

  it('is a street animal by its spawn index; a demo dragon is not', () => {
    assert.deepEqual(creatureOf({ classId: 'npc_fire_dragon', featureId: 'fire-dragon', dragonKey: 'dragon:1' }), { id: 'dragon:1', kind: 'dragon', index: 1 });
    assert.equal(creatureOf({ classId: 'npc_fire_dragon', featureId: 'fire-dragon' }), null);
  });

  it('the server holds it for a pet as long as the game stands it', { skip: skipWithoutServer }, () => {
    const data = JSON.parse(readFileSync(serverPath('data/objects.json'), 'utf8'));
    assert.equal(data.rules.holds.dragonPet, FIRE_DRAGON_WALK.menuWaitMs);
    assert.deepEqual(data.rules.nodes.npc_salmon, { model: 'respawn', min: 0, max: 1, initial: 1, ready: 1, verbs: ['pocket'], regrow: [10000, 10000, 10000] });
    const salmon = Object.values(data.streets).reduce((n, s) => n + (s.nodes || []).filter((r) => r[1] === 'npc_salmon').length, 0);
    assert.ok(salmon > 200, `${salmon} street Salmon`);
  });
});
