/**
 * G178: the Pocket Salmon's Release (items/salmon.js 30-100), rules in
 * js/resource-nodes.js SALMON_RELEASE, the pack button in
 * features/resource-nodes-feature.js, and its Heebo's Happy Accident point
 * (js/solo-feats.js salmon:release).
 * Run: node --test tests/salmon-release.test.js
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  SALMON_RELEASE,
  createResourceNode,
  harvestResourceNode,
  pickReleasedSalmon,
  releaseSalmon,
  respawnReleasedSalmon,
  salmonReleaseConditions,
  swimmingSalmonCount,
  tickResourceNode,
} from '../public/js/resource-nodes.js?v=g414-1';
import { MOOD_XP_SOURCES } from '../public/js/mood-xp.js';
import { resourceNodesFeature } from '../public/js/features/resource-nodes-feature.js?v=g417-1';
import { eventIncrements } from '../public/js/solo-feats.js?v=g370-1';

const ROOT = join(import.meta.dirname, '..');
const GSJS = join(ROOT, '..', 'glitch-GameServerJS');
const hasGsjs = existsSync(join(GSJS, 'items', 'salmon.js'));

// Full mood (x1.2 in mood-xp.js) unless a test says otherwise.
const pcAt = (energy = 50, mood = 50) => ({ energy, mood, moodMax: 100, imagination: 0, xp: 0 });

describe('Pocket Salmon Release rules', () => {
  it('reads the verb from salmon.js', { skip: !hasGsjs && 'glitch-GameServerJS not checked out' }, () => {
    const src = readFileSync(join(GSJS, 'items', 'salmon.js'), 'utf8');
    const body = src.slice(src.indexOf('verbs.release = {'), src.indexOf('verbs.pickup = {'));
    assert.match(body, /"ok_states"\s*: \["in_pack"\]/);
    assert.match(body, /"tooltip"\s*: "Release the Salmon!"/);
    assert.match(body, /pc\.location\.hubid == 136 \|\| pc\.location\.hubid == 140/);
    assert.match(body, /if\(salmonNum\.length<71\)\s*\{\s*return \{state:'enabled'\};\s*\}\s*else\s*\{\s*return \{state:null\};/);
    assert.match(body, /createItemStack\('npc_salmon', 1, pc\.x, pc\.y\)/);
    assert.match(body, /metabolics_add_energy\(-1 \* 4\)/);
    assert.match(body, /stats_add_xp\(5, false, context\)/);
    assert.match(body, /announce_sound\('SALMON_RELEASE'\)/);
    assert.match(body, /feats_increment\('animal_love', 1\)/);
    assert.match(body, /buildVerbMessage\(msg\.count, 'release', 'released'/);
    assert.match(body, /this\.apiDelete\(\);/);
    assert.deepEqual([...SALMON_RELEASE.hubs], ['136', '140']);
    assert.equal(SALMON_RELEASE.maxSalmon, 71);
    assert.equal(SALMON_RELEASE.energy, 4);
    assert.equal(SALMON_RELEASE.xp, 5);
    assert.equal(SALMON_RELEASE.tooltip, 'Release the Salmon!');
  });

  it('is offered only in Jal and Samudra with fewer than 71 Salmon', () => {
    assert.deepEqual(salmonReleaseConditions({ hubId: '136', salmonCount: 0 }), { state: 'enabled' });
    assert.deepEqual(salmonReleaseConditions({ hubId: 140, salmonCount: 70 }), { state: 'enabled' });
    assert.deepEqual(salmonReleaseConditions({ hubId: '140', salmonCount: 71 }), { state: null, reason: 'crowded' });
    assert.deepEqual(salmonReleaseConditions({ hubId: '56', salmonCount: 0 }), { state: null, reason: 'hub' });
    assert.deepEqual(salmonReleaseConditions({}), { state: null, reason: 'hub' });
  });

  it('takes one Pocket Salmon, 4 energy and gives 5 iMG with the source message', () => {
    const inv = { salmon: 2 };
    // Mood at 75% of the tank: x1, so the 5 iMG land as 5.
    const pc = pcAt(50, 75);
    const res = releaseSalmon(inv, pc, { hubId: '136', salmonCount: 3 });
    assert.equal(res.ok, true);
    assert.equal(inv.salmon, 1);
    assert.equal(pc.energy, 46);
    assert.equal(pc.imagination, 5);
    assert.equal(res.message, 'You released a Pocket Salmon. -4 Energy +5 iMG');
    assert.equal(res.sound, 'SALMON_RELEASE');
    assert.deepEqual(res.achievementCounters, [{ counter: 'salmon:release', amount: 1 }]);
  });

  it('shows the energy actually lost, takes the mood bonus, and has no energy gate', () => {
    const pc = pcAt(2, 100);
    const res = releaseSalmon({ salmon: 1 }, pc, { hubId: '140', salmonCount: 0 });
    assert.equal(res.ok, true);
    assert.equal(pc.energy, 0);
    // stats_add_xp(5, false): full mood is x1.2 (inc_stats.js 229-258).
    assert.equal(res.message, 'You released a Pocket Salmon. -2 Energy +6 iMG');
    assert.ok(Object.keys(MOOD_XP_SOURCES.scaled).includes('salmon_release'));
  });

  it('changes nothing when it is not offered or there is no Pocket Salmon', () => {
    const inv = { salmon: 1 };
    const pc = pcAt();
    assert.equal(releaseSalmon(inv, pc, { hubId: '56' }).reason, 'hub');
    assert.equal(releaseSalmon(inv, pc, { hubId: '136', salmonCount: 71 }).reason, 'crowded');
    assert.equal(releaseSalmon({}, pc, { hubId: '136' }).reason, 'no_salmon');
    assert.equal(inv.salmon, 1);
    assert.equal(pc.energy, 50);
    assert.equal(pc.imagination, 0);
  });

  it('brings back the nearest pocketed Salmon at once, or none when all swim', () => {
    const swim = (x) => ({ classTsid: 'npc_salmon', x, node: createResourceNode('npc_salmon', { seed: `s${x}` }) });
    const rows = [swim(100), swim(400), swim(900), { classTsid: 'npc_firefly', x: 410, node: { depleted: true } }];
    assert.equal(pickReleasedSalmon(rows, 380), null);
    assert.equal(swimmingSalmonCount(rows), 3);
    for (const row of [rows[0], rows[2]]) {
      harvestResourceNode(row.node, {}, { energy: 50 }, { now: 1_000, dayKey: 'd', rng: () => 0.5 });
      assert.equal(row.node.depleted, true);
    }
    assert.equal(swimmingSalmonCount(rows), 1);
    const back = pickReleasedSalmon(rows, 700);
    assert.equal(back, rows[2]);
    assert.equal(respawnReleasedSalmon(back.node), true);
    assert.equal(back.node.depleted, false);
    assert.equal(back.node.units, 1);
    assert.equal(back.node.respawnAt, 0);
    // A respawned node stays put on the next tick (no pending timer).
    assert.equal(tickResourceNode(back.node, 2_000), false);
    assert.equal(swimmingSalmonCount(rows), 2);
    assert.equal(respawnReleasedSalmon({ classTsid: 'npc_firefly' }), false);
  });

  it('counts toward Heebo\'s Happy Accident', () => {
    assert.deepEqual(eventIncrements('salmon:release').map((r) => `${r.featId}:${r.mode}:${r.amount}`), ['animal_love:direct:1']);
  });
});

describe('Pocket Salmon Release pack button', () => {
  const fakeEngine = (hubId, extra = {}) => {
    const calls = { achievement: [], activity: [], sound: [], data: {} };
    return {
      inv: { salmon: 1 },
      pc: pcAt(50, 75),
      player: { x: 300, y: 500 },
      platforms: [],
      street: { hubId },
      streetTsid: 'GUVCLS8RV5D3VGT',
      param: () => null,
      achievement: (counter, amount) => calls.achievement.push([counter, amount]),
      pushActivity: (line) => calls.activity.push(line),
      playSound: (key) => calls.sound.push(key),
      floatText() {},
      updateHud() {},
      refreshPack() {},
      save() {},
      setData: (k, v) => { calls.data[k] = String(v); },
      calls,
      ...extra,
    };
  };

  it('shows Release on the Pocket Salmon in Samudra and hides it elsewhere', () => {
    const sea = fakeEngine('140');
    assert.deepEqual(resourceNodesFeature.packVerbs('salmon', sea), [
      { id: 'release', label: 'Release', tooltip: 'Release the Salmon!', enabled: true },
    ]);
    assert.equal(sea.calls.data.salmonRelease, 'enabled');
    const forest = fakeEngine('56');
    assert.deepEqual(resourceNodesFeature.packVerbs('salmon', forest), []);
    assert.equal(forest.calls.data.salmonRelease, 'hidden:hub');
    assert.deepEqual(resourceNodesFeature.packVerbs('boot', sea), []);
    assert.deepEqual(resourceNodesFeature.packVerbs('salmon', fakeEngine('140', { inv: {} })), []);
  });

  it('runs the release from the pack: item, energy, iMG, sound, counter', () => {
    const engine = fakeEngine('136');
    assert.equal(resourceNodesFeature.runPackVerb('salmon', 'release', engine), true);
    assert.equal(engine.inv.salmon ?? 0, 0);
    assert.equal(engine.pc.energy, 46);
    assert.equal(engine.pc.imagination, 5);
    assert.deepEqual(engine.calls.achievement, [['salmon:release', 1]]);
    assert.deepEqual(engine.calls.sound, ['SALMON_RELEASE']);
    assert.deepEqual(engine.calls.activity, ['You released a Pocket Salmon. -4 Energy +5 iMG']);
    // No pocketed Salmon on this (empty) street: a new one joins at the player.
    assert.match(engine.calls.data.salmonRelease, /^released:new:release:\d+$/);
    assert.equal(resourceNodesFeature.runPackVerb('salmon', 'eat', engine), false);
    assert.equal(resourceNodesFeature.runPackVerb('boot', 'release', engine), false);
    resourceNodesFeature.onStreetClear();
  });
});
