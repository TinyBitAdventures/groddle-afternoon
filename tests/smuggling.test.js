/**
 * Warm and Smuggly (public/js/smuggling.js): source constants from
 * npc_smuggler.js / npc_deimaginator.js / contraband.js / inc_smuggling.js,
 * the conversations, encounter and catch rules, and routes through the
 * signpost graph to every destination.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';

import {
  CONTRABAND_ITEM,
  CONVERSATIONS,
  DEFAULT_DESTINATIONS,
  DEIMAGINATOR,
  DESTINATIONS,
  EXPLAIN_RESTRICTIONS,
  RECEIVER,
  RECEIVE_REWARDS,
  SMUGGLER,
  SMUGGLER_STREETS,
  TEXT,
  carryObjective,
  chooseDestination,
  createSmugglingState,
  deimaginatorSpawns,
  deimaginatorTouches,
  followDecision,
  giveConversation,
  giveEncounter,
  isSmugglerStreet,
  receiveConversation,
  routeTo,
  sourceKey,
  spawnOffset,
  sparedBySignpost,
} from '../public/js/smuggling.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const GSJS = join(homedir(), 'Documents/glitch-audit/glitch-GameServerJS');
const src = (rel) => (existsSync(join(GSJS, rel)) ? readFileSync(join(GSJS, rel), 'utf8') : null);
const seq = (...vals) => {
  let i = 0;
  return () => vals[Math.min(i++, vals.length - 1)];
};

describe('smuggling source constants', () => {
  it('keeps the smuggler, deimaginator and spawn numbers', () => {
    assert.equal(SMUGGLER.minLevel, 11);
    assert.equal(SMUGGLER.appearChance, 0.2);
    assert.equal(SMUGGLER.seenMs, 3_600_000);
    assert.equal(SMUGGLER.giveTimeoutMs, 30_000);
    assert.deepEqual([SMUGGLER.hitW, SMUGGLER.hitH], [55, 90]);
    assert.equal(DEIMAGINATOR.speed, 65);
    assert.deepEqual([DEIMAGINATOR.hitW, DEIMAGINATOR.hitH], [25, 25]);
    assert.deepEqual([DEIMAGINATOR.appearMs, DEIMAGINATOR.followMs, DEIMAGINATOR.followTickMs], [1000, 3000, 1000]);
    assert.deepEqual([DEIMAGINATOR.spawnMin, DEIMAGINATOR.spawnMax, DEIMAGINATOR.noSpawnChance], [250, 1000, 0.1]);
    assert.deepEqual([DEIMAGINATOR.jumpMin, DEIMAGINATOR.jumpMax, DEIMAGINATOR.farPx, DEIMAGINATOR.jumpChance], [500, 1250, 1500, 0.9]);
    assert.deepEqual([RECEIVER.spawnMin, RECEIVER.spawnMax], [250, 2000]);
    assert.deepEqual(RECEIVE_REWARDS, { xp: 100, currants: 200, item: 'gem_diamond', count: 1 });
    const smug = src('items/npc_smuggler.js');
    if (smug) {
      assert.match(smug, /pc\.stats\.level < 11/);
      assert.match(smug, /is_chance\(0\.2\)/);
      assert.match(smug, /this\.seen\[pc\.tsid\]\+\(60\*60\) < time\(\)/);
      assert.match(smug, /apiSetTimer\('giveTimeOut',30000\)/);
      assert.match(smug, /stats_add_xp\(100 \* msg\.count/);
      assert.match(smug, /stats_add_currants\(200 \* msg\.count\)/);
      assert.match(smug, /createItem\("gem_diamond", 1 \* msg\.count\)/);
    }
    const deim = src('items/npc_deimaginator.js');
    if (deim) {
      assert.match(deim, /npc_walk_speed = this\.npc_climb_speed = 65/);
      assert.match(deim, /apiSetHitBox\(25,25\)/);
      assert.match(deim, /delta > 1500 \|\| delta < -1500/);
      assert.match(deim, /var min_dist = 500;\s*var max_dist = 1250;/);
      assert.match(deim, /apiSetTimer\('targetFollow', 3000\)/);
    }
    const loc = src('locations/inc_smuggling.js');
    if (loc) {
      assert.match(loc, /is_chance\(0\.1\)/);
      assert.match(loc, /randInt\(250, 2000\)/);
      assert.match(loc, /randInt\(250, 1000\)/);
    }
  });

  it('carries the contraband destination map and copy verbatim', () => {
    const file = src('items/contraband.js');
    assert.equal(Object.keys(DESTINATIONS).length, 10);
    assert.equal(DEFAULT_DESTINATIONS.length, 11);
    assert.equal(SMUGGLER_STREETS.length, 10);
    assert.ok(!SMUGGLER_STREETS.includes('LIFPKPACCJ328C9'), 'dev POL excluded');
    if (file) {
      for (const [from, list] of Object.entries(DESTINATIONS)) {
        assert.ok(file.includes(`'${from}': [`), from);
        for (const to of list) assert.ok(file.includes(`'${to}'`), to);
      }
      for (const to of DEFAULT_DESTINATIONS) assert.ok(file.includes(`'${to}'`), to);
      assert.ok(file.includes(CONTRABAND_ITEM.desc), 'description');
      assert.ok(file.includes(TEXT.dropActivity) && file.includes(TEXT.dropFail));
    }
    const ann = src('players/inc_announcements.js');
    if (ann) for (const line of EXPLAIN_RESTRICTIONS) assert.ok(ann.includes(line.replace(/'/g, "\\'")), line);
    assert.ok(existsSync(join(root, 'public/assets/sprites/icons/contraband.png')));
  });

  it('keeps every conversation line and choice from npc_smuggler.js', () => {
    const smug = src('items/npc_smuggler.js');
    assert.equal(Object.keys(CONVERSATIONS).length, 8);
    for (const [id, conv] of Object.entries(CONVERSATIONS)) {
      assert.ok(conv.start, id);
      for (const [nodeId, node] of Object.entries(conv)) {
        for (const ch of node.choices) assert.ok(ch.next === null || conv[ch.next], `${id}:${nodeId} -> ${ch.next}`);
        if (!smug) continue;
        assert.ok(smug.includes(JSON.stringify(node.text).slice(1, -1)), `${id}:${nodeId} text`);
        for (const ch of node.choices) assert.ok(smug.includes(JSON.stringify(ch.label).slice(1, -1)), `${id} choice ${ch.label}`);
      }
      const actions = Object.values(conv).flatMap((n) => n.choices.flatMap((c) => c.actions));
      if (id.startsWith('give')) {
        assert.ok(actions.includes('start'), id);
        assert.ok(actions.includes('decline'), id);
      } else {
        assert.deepEqual(['deliver', 'reward', 'complete'].filter((a) => actions.includes(a)), ['deliver', 'reward', 'complete'], id);
      }
    }
  });
});

describe('smuggling rules', () => {
  it('rolls the give smuggler like onPlayerCollision', () => {
    const s = createSmugglingState();
    const base = { level: 11, street: 'LM413SQ6LRN58', now: 1000 };
    assert.equal(giveEncounter(s, { ...base, level: 10 }, () => 0).reason, 'level');
    assert.equal(giveEncounter(s, { ...base, carrying: true }, () => 0).reason, 'carrying');
    assert.equal(giveEncounter(s, base, () => 0.5).appear, false);
    assert.equal(giveEncounter(s, { ...base, now: 2000 }, () => 0).reason, 'seen');
    assert.equal(giveEncounter(s, { ...base, now: 2000, maxLuck: true }, () => 0.9).appear, true);
    assert.equal(giveEncounter(s, { ...base, now: 2000 + SMUGGLER.seenMs + 1 }, () => 0.1).appear, true);
  });

  it('picks first-time and repeat conversations', () => {
    const s = createSmugglingState();
    assert.equal(giveConversation(s), 'give_first_time');
    s.failed = 1;
    assert.equal(giveConversation(s, seq(0.1)), 'give_repeat1');
    assert.equal(giveConversation(s, seq(0.5, 0.2)), 'give_repeat2');
    assert.equal(giveConversation(s, seq(0.5, 0.5)), 'give_repeat3');
    s.started = 1;
    assert.equal(receiveConversation(s), 'receive_first_time');
    s.started = 2;
    assert.match(receiveConversation(s, seq(0.9, 0.9)), /^receive_repeat3$/);
  });

  it('chooses destinations from the start street, else the defaults', () => {
    assert.ok(DESTINATIONS.LM413SQ6LRN58.includes(chooseDestination('GM413SQ6LRN58', { rng: () => 0.99 })));
    assert.ok(DEFAULT_DESTINATIONS.includes(chooseDestination('LXXXX', { rng: () => 0 })));
    // Unplayable picks are skipped.
    const only = DESTINATIONS.LM413SQ6LRN58[2];
    assert.equal(chooseDestination('LM413SQ6LRN58', { resolve: (t) => (t === only ? t : null), rng: () => 0 }), only);
    assert.equal(sourceKey('GLI2V0UN7RD1T2J'), 'LLI2V0UN7RD1T2J');
    assert.ok(isSmugglerStreet('GM413SQ6LRN58'));
  });

  it('spawns within the source offsets and flips at the street ends', () => {
    for (let i = 0; i < 50; i++) {
      const r = Math.random;
      const x = spawnOffset(1000, { l: 0, r: 4000, min: 250, max: 1000, rng: r });
      assert.ok(Math.abs(x - 1000) >= 250 && Math.abs(x - 1000) <= 1000, String(x));
    }
    assert.equal(spawnOffset(3900, { l: 0, r: 4000, min: 300, max: 300, rng: () => 0.1 }), 3600);
    assert.equal(spawnOffset(100, { l: 0, r: 4000, min: 300, max: 300, rng: () => 0.9 }), 400);
    assert.equal(deimaginatorSpawns(() => 0.05), false);
    assert.equal(deimaginatorSpawns(() => 0.5), true);
  });

  it('follows, jumps or leaves, and catches only on contact', () => {
    assert.equal(followDecision(1500), 'path');
    assert.equal(followDecision(-1501, () => 0.5), 'jump');
    assert.equal(followDecision(1501, () => 0.95), 'leave');
    const d = { x: 500, y: 800 };
    assert.ok(deimaginatorTouches({ x: 520, y: 800 }, d));
    assert.ok(!deimaginatorTouches({ x: 600, y: 800 }, d));
    // Jumping over it: feet above its 25 px box clear it.
    assert.ok(!deimaginatorTouches({ x: 500, y: 770 }, d));
    const signs = [{ x: 900, y: 800 }];
    assert.ok(sparedBySignpost({ x: 850, y: 800 }, { x: 300, y: 800 }, signs));
    assert.ok(!sparedBySignpost({ x: 850, y: 800 }, { x: 800, y: 800 }, signs), 'had not moved 200 px');
  });

  it('routes every destination through the signpost graph', () => {
    const graph = JSON.parse(readFileSync(join(root, 'public/assets/content/signpost-graph.json'), 'utf8')).streets;
    const key = (t) => (graph[t] ? t : graph[`G${t.slice(1)}`] ? `G${t.slice(1)}` : null);
    let routed = 0;
    for (const [from, list] of Object.entries(DESTINATIONS)) {
      assert.ok(key(from), `smuggler street ${from} is playable`);
      for (const to of list) {
        if (!key(to)) continue;
        const path = routeTo(graph, key(from), key(to));
        assert.ok(path && path.length >= 2, `${from} -> ${to}`);
        routed += 1;
      }
    }
    assert.ok(routed >= 40, `routed ${routed}`);
    assert.deepEqual(routeTo({ a: ['b'], b: ['c'], c: [] }, 'a', 'c'), ['a', 'b', 'c']);
    assert.equal(routeTo({ a: [] }, 'a', 'z'), null);
  });

  it('describes the run for the HUD', () => {
    assert.equal(carryObjective({ destinationLabel: 'Fjarcke', nextLabel: 'West Spice' }), 'Destination: Fjarcke · Next signpost: West Spice');
    assert.match(carryObjective({ destinationLabel: 'Fjarcke', arrived: true }), /contact/);
  });

  it('normalizes saves', () => {
    const s = createSmugglingState({ seen: { a: 5, b: 'x' }, run: { from: 'L1', destination: 'L2', startedAt: 9 }, delivered: 2 });
    assert.deepEqual(s.seen, { a: 5 });
    assert.deepEqual(s.run, { from: 'L1', destination: 'L2', startedAt: 9 });
    assert.equal(createSmugglingState({ run: { from: 'x' } }).run, null);
  });
});
