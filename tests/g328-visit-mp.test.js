/**
 * G328 MPVISIT / G438: visitors mine a home street's rocks, harvest its
 * resource nodes and climb its Tower in multiplayer: js/yard-stock-mp.js (the
 * shared rules), the Tower's realtime streets (js/neighbours-mp.js), the
 * site's src/HomeYard.php judgeStock (through php -r) and Neighbours'
 * Tower slice, and the server's home_yard.go / homes.go (their Go tests).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  ROCK_RESPAWN_MS,
  STOCK_NODE_VERBS,
  STOCK_NODE_YIELD,
  STOCK_POOL,
  applyStockAct,
  homeNodes,
  homeRocks,
  isNodeId,
  isRockId,
  normalizeStockView,
  visitorNode,
  visitorRock,
} from '../public/js/yard-stock-mp.js?v=3e809484';
import { normalizeYardActs } from '../public/js/yard-verbs-mp.js?v=ed2df6c2';
import { nodeKeyMap, rockItems } from '../public/js/features/homes-feature.js?v=4399d4f5';
import { homeStreetFor, readVisitScene, sharedHomeStreet, visitSceneTsid } from '../public/js/neighbours-mp.js?v=a8d5544e';
import { streetObjectsFeature } from '../public/js/features/street-objects-feature.js?v=5697fd19';
import { HAS_SERVER, HAS_SITE, SITE_DIR, serverPath } from '../tools/repos.mjs';

const root = join(import.meta.dirname, '..');
const gsjs = join(root, '..', 'glitch-GameServerJS');
const hasPhp = spawnSync('php', ['-v']).status === 0;
const skipSite = !HAS_SITE ? 'no groddle-afternoon-site checkout' : !hasPhp ? 'no php' : false;

function php(body) {
  const code = `foreach (["HomePool", "HomeYard"] as $c) require ${JSON.stringify(SITE_DIR)} . "/src/$c.php"; use Groddle\\Minn\\HomeYard; ${body}`;
  return JSON.parse(execFileSync('php', ['-r', code]).toString());
}

const ITEMS = [
  { id: 1, protoClass: 'proto_metal_rock', endClass: 'rock_metal_2', rx: -300, wear: 0 },
  { id: 2, protoClass: 'proto_peat', endClass: 'peat_2', rx: -600, wear: 0 },
  { id: 3, protoClass: 'proto_barnacle_pod', endClass: 'barnacle_pod', rx: -900, wear: 0 },
  { id: 4, protoClass: 'proto_beryl_rock', endClass: 'rock_beryl_1', rx: -1200, wear: 0, depleted: true },
  { id: 5, protoClass: 'proto_firefly_hive', endClass: 'firefly_hive', rx: -1500, wear: 0, placedAt: 0 },
  { id: 6, protoClass: 'proto_sparkly_rock', endClass: 'rock_sparkly_1', rx: -1800, wear: 0 },
  { id: 7, protoClass: 'proto_jellisac_mound', endClass: 'jellisac_mound', rx: -2100, wear: 0 },
];

describe('the pool amounts are the handlers\' own (GSJS)', () => {
  const at = (file, line) => readFileSync(join(gsjs, file), 'utf8').split('\n')[line - 1];
  const cases = [
    ['rock:metal_rock', 'items/include/mining.js', 391],
    ['rock:dullite', 'items/include/mining.js', 394],
    ['rock:beryl', 'items/include/mining.js', 397],
    ['rock:sparkly', 'items/include/mining.js', 400],
    ['node:peat_1', 'items/peat_1.js', 301],
    ['node:dirt_pile', 'items/dirt_pile.js', 470],
    ['node:mortar_barnacle', 'items/mortar_barnacle.js', 304],
    ['node:jellisac', 'items/jellisac.js', 234],
  ];
  for (const [key, file, line] of cases) {
    it(`${key} is ${STOCK_POOL[key]} (${file}:${line})`, () => {
      const m = /cultivation_add_img_rewards\(pc, ([\d.]+)\)/.exec(at(file, line));
      assert.ok(m, `${file}:${line} adds to the pool`);
      assert.equal(Number(m[1]), STOCK_POOL[key]);
    });
  }
  it('the Tower is a public home location anyone not blocked may enter (tower.js:22, inc_pols.js:452-455)', () => {
    assert.match(at('locations/tower.js', 22), /is_public = true/);
    assert.match(at('locations/inc_pols.js', 452), /is_public/);
  });
});

describe('a home street\'s rocks and nodes (js/yard-stock-mp.js)', () => {
  it('numbers rocks and nodes as the owner\'s own street does (homes-feature rockItems, nodeKeyMap)', () => {
    const rocks = homeRocks(ITEMS);
    assert.deepEqual(rocks.map((r) => r.itemId), rockItems(ITEMS).map((r) => r.id));
    assert.deepEqual(rocks.map((r) => [r.id, r.classId]), [['rock:0', 'rock_metal_1'], ['rock:1', 'rock_sparkly_1']]);
    const keys = nodeKeyMap(ITEMS, 0);
    const nodes = homeNodes(ITEMS, 0);
    for (const n of nodes) assert.ok(keys.get(n.itemId).includes(n.key), `${n.key} is ${n.itemId}'s`);
    assert.deepEqual(nodes.filter((n) => n.cls !== 'npc_firefly').map((n) => n.id), ['node:peat_1:0', 'node:mortar_barnacle:0', 'node:mortar_barnacle:1', 'node:mortar_barnacle:2', 'node:jellisac:0', 'node:jellisac:1']);
    assert.equal(nodes[0].classTsid, 'peat_2');
    // HOMES2: the hive's Fireflies are a visitor's to whistle too, keyed as the owner's street keys them.
    assert.ok(nodes.some((n) => n.id === 'node:npc_firefly:0'));
  });

  it('ids and the acts the site sends', () => {
    assert.ok(isRockId('rock:0') && !isRockId('rock:x'));
    assert.ok(isNodeId('node:peat_1:0') && isNodeId('node:npc_firefly:0') && !isNodeId('node:salmon:0') && !isNodeId('node:peat_1'));
    const acts = normalizeYardActs([
      { id: 'yd-0000000000000001', kind: 'rock', target: 'rock:0', verb: 'mine', took: 7, at: 5, left: 43, from: { id: 9, name: 'Bo' } },
      { id: 'yd-0000000000000002', kind: 'node', target: 'node:peat_1:0', verb: 'harvest', took: 1, at: 6 },
      { id: 'yd-0000000000000003', kind: 'rock', target: 'patch:0', verb: 'mine' },
    ]);
    assert.equal(acts.length, 2);
    assert.equal(acts[0].left, 43);
  });

  it('a visitor\'s copies: the site\'s stock, the visitor\'s own daily counts', () => {
    const view = normalizeStockView({
      rocks: [{ id: 'rock:0', classId: 'rock_metal_1', rx: -300, rock: { chunksRemaining: 12, depleted: false, respawnAt: 0 } }, { id: 'bad' }],
      nodes: [{ id: 'node:peat_1:0', classTsid: 'peat_2', rx: -600, dy: 0, node: { units: 2, regrowAt: 0, dayKey: 'old', dailyCounts: { harvest: 1 } } }],
    });
    assert.equal(view.rocks.length, 1);
    assert.equal(visitorRock(view.rocks[0], 0).chunksRemaining, 12);
    const fresh = visitorNode(view.nodes[0], {}, 'today');
    assert.equal(fresh.units, 2);
    assert.deepEqual(fresh.dailyCounts, {}, 'the owner\'s counts are not the visitor\'s');
    assert.deepEqual(visitorNode(view.nodes[0], { 'harvest:node:peat_1:0': 1 }, 'today').dailyCounts, { harvest: 1 });
    assert.deepEqual(STOCK_NODE_VERBS, { peat_1: 'harvest', dirt_pile: 'dig', mortar_barnacle: 'scrape', jellisac: 'scoop', npc_firefly: 'open' });
    assert.deepEqual(STOCK_NODE_YIELD.peat_1, ['peat', 3]);
  });

  it('the owner\'s game takes a visitor\'s swing off its rock, and a mined-out rock reforms', () => {
    const rocks = [{ classId: 'rock_metal_1', rock: { classTsid: 'rock_metal_1', chunksRemaining: 10, chunksMax: 50, depleted: false, respawnAt: 0 } }];
    const swing = (took, at, left) => applyStockAct({ rocks, nodes: {}, items: ITEMS }, { kind: 'rock', target: 'rock:0', verb: 'mine', took, at, left }, at);
    const a = swing(4, 1000);
    assert.equal(a.rock.chunksRemaining, 6);
    assert.equal(a.wearItem, 1, 'a swing wears the cultivation');
    const b = swing(9, 2000);
    assert.equal(b.rock.depleted, true);
    assert.equal(b.rock.respawnAt, 2000 + ROCK_RESPAWN_MS);
    const c = applyStockAct({ rocks, nodes: {}, items: ITEMS }, { kind: 'rock', target: 'rock:0', verb: 'mine', took: 3, at: 2000 + ROCK_RESPAWN_MS + 1 }, 2000 + ROCK_RESPAWN_MS + 1);
    assert.equal(c.rock.chunksRemaining, 47, 'reformed with 50, then the swing');
    // A rock the owner never stood by yet: a fresh slot.
    const empty = [];
    applyStockAct({ rocks: empty, nodes: {}, items: ITEMS }, { kind: 'rock', target: 'rock:1', verb: 'mine', took: 5, at: 1 }, 1);
    assert.equal(empty[1].rock.chunksRemaining, 45);
  });

  it('the owner\'s game takes a use off its node (peat one off, a barnacle back to its first state)', () => {
    const nodes = { 'peat_1:0': { classTsid: 'peat_1', variant: null, units: 4, unitsMax: 4, depleted: false, regrowAt: 0, respawnAt: 0, dayKey: '', dailyCounts: {}, totalHarvests: 2 } };
    const p = applyStockAct({ rocks: [], nodes, items: ITEMS }, { kind: 'node', target: 'node:peat_1:0', verb: 'harvest', took: 1, at: 1000 }, 1000);
    assert.equal(p.node.units, 3);
    assert.equal(p.node.totalHarvests, 3, 'wear follows from the harvests (homes-feature wearFromNodes)');
    assert.ok(p.node.regrowAt > 1000);
    assert.equal(nodes['peat_1:0'], p.node, 'the slot\'s own node, so a drawn one follows');
    const b = applyStockAct({ rocks: [], nodes, items: ITEMS }, { kind: 'node', target: 'node:mortar_barnacle:1', verb: 'scrape', took: 1, at: 1000 }, 1000);
    assert.equal(b.node.units, 1);
  });
});

describe('a granted harvest lands in the visitor\'s pack', () => {
  // QA 2026-11-01: the site took a visitor's Peat harvest, but the re-run of the verb was claimed by the
  // street objects feature ("The street is still connecting") and the peat never reached the pack.
  it('the street objects feature leaves a visited home street\'s nodes and rocks to yard-verbs-mp', () => {
    const target = { classId: 'peat_1', resourceKey: 'peat_1:0', yardVisit: { kind: 'node', id: 'node:peat_1:0' }, sprite: { x: 0, y: 0 } };
    const client = { state: 'online', wanted: 'HOME_7', street: 'HOME_7', me: { id: 9 }, on: () => () => {}, send: () => true };
    const toasts = [];
    const engine = {
      mode: 'multiplayer',
      streetTsid: 'MPH_7',
      learnedSkills: [],
      pc: { imaginationUpgrades: [] },
      toast: (line) => toasts.push(line),
      query(hook) {
        if (hook === 'realtimeClient') return client;
        if (hook === 'streetResourceNodes') return [{ target, key: 'peat_1:0', classTsid: 'peat_1', ready: () => true }];
        return null;
      },
    };
    streetObjectsFeature._reset();
    assert.equal(streetObjectsFeature.runVerbOverride(target, 'harvest', engine), null);
    assert.equal(streetObjectsFeature.runVerbOverride({ ...target, yardVisit: { kind: 'rock', id: 'rock:0' } }, 'mine', engine), null);
    assert.deepEqual(toasts, []);
    streetObjectsFeature._reset();
  });
});

describe('a Tower floor is a street of its own, the same for its owner and visitors', () => {
  it('TOWER_<id>_<floor>', () => {
    assert.equal(homeStreetFor(7, 'tower', 3), 'TOWER_7_3');
    assert.equal(visitSceneTsid(7, 'tower', 2), 'MPH_7_T2');
    assert.deepEqual(readVisitScene('MPH_7_T2'), { owner: 7, room: 'tower', floor: 2 });
    assert.deepEqual(readVisitScene('MPH_7_IN'), { owner: 7, room: 'interior' });
    assert.equal(sharedHomeStreet({ visit: { owner: 7, room: 'tower', floor: 1 } }), 'TOWER_7_1');
    assert.equal(sharedHomeStreet({ me: 7, inHome: true, ownTowerFloor: 1, towerFloor: false }), 'TOWER_7_1');
    assert.equal(sharedHomeStreet({ me: 7, inHome: true, towerFloor: true }), '', 'an upper house floor stays the owner\'s room');
  });
});

describe('the site decides a swing or a harvest (HomeYard::judgeStock)', { skip: skipSite }, () => {
  const state = {
    systems: { features: { homes: { cult: { items: ITEMS } } } },
    world: { streets: { RH_HOME_EXT: {
      rocks: [{ classId: 'rock_metal_1', rock: { chunksRemaining: 5, depleted: false, respawnAt: 0 } }],
      features: { 'resource-nodes': { nodes: { 'peat_1:0': { units: 1, regrowAt: 0, totalHarvests: 3 } } } },
    } } },
  };
  const now = 1_800_000_000_000;
  const judge = (waiting, uses, upgrades, kind, id, verb) => php(`$s = json_decode(${JSON.stringify(JSON.stringify(state))}, false); echo json_encode(HomeYard::judgeStock(HomeYard::rules(), $s, ${JSON.stringify(waiting).replace(/\{/g, '[').replace(/\}/g, ']').replace(/":/g, '"=>')}, ${uses}, ${upgrades}, ${JSON.stringify(kind)}, ${JSON.stringify(id)}, ${JSON.stringify(verb)}, ${now}, fn($a, $b) => $b));`);

  it('a swing takes the roll; mining a rock out pays the owner 25 for metal', () => {
    const a = judge([], '[]', '[]', 'rock', 'rock:0', 'mine');
    assert.deepEqual(a, { pool: 'rock:metal_rock', took: 9, got: { metal_rock: 9 }, left: 0 });
    const b = judge([{ id: 'yd-1', kind: 'rock', target: 'rock:0', verb: 'mine', took: 9, at_ms: now - 1000 }], '[]', '[]', 'rock', 'rock:0', 'mine');
    assert.equal(b.why, 'empty', 'mined out for everyone until it reforms');
    const c = judge([{ id: 'yd-1', kind: 'rock', target: 'rock:0', verb: 'mine', took: 9, at_ms: now - 50000 }], '[]', '[]', 'rock', 'rock:1', 'mine');
    assert.equal(c.pool, '', 'a swing that leaves chunks pays nothing (mining.js:388)');
    assert.equal(c.left, 43, 'a fresh Sparkly Rock less its 7');
  });

  it('a node: its stock, the visitor\'s daily limit, the yield credited', () => {
    assert.deepEqual(judge([], '[]', '[]', 'node', 'node:peat_1:0', 'harvest'), { pool: 'node:peat_1', took: 1, got: { peat: 3 }, left: 0 });
    assert.equal(judge([], '["harvest:node:peat_1:0" => 1]', '[]', 'node', 'node:peat_1:0', 'harvest').why, 'limit');
    assert.equal(judge([], '["harvest:node:peat_1:0" => 1]', '["bog_specialization_dig_peat_bog_twice"]', 'node', 'node:peat_1:0', 'harvest').pool, 'node:peat_1');
    assert.equal(judge([{ id: 'yd-2', kind: 'node', target: 'node:mortar_barnacle:1', verb: 'scrape', took: 1, at_ms: now - 1000 }], '[]', '[]', 'node', 'node:mortar_barnacle:1', 'scrape').why, 'not_ready');
    assert.equal(judge([], '[]', '[]', 'node', 'node:peat_1:0', 'dig').why, 'gone', 'only the node\'s own verb');
  });

  it('a worn-out cultivation takes no more (cultivation.js addWear)', () => {
    const worn = JSON.parse(JSON.stringify(state));
    worn.systems.features.homes.cult.items[0].wear = 39;
    const r = php(`$s = json_decode(${JSON.stringify(JSON.stringify(worn))}, false); echo json_encode([HomeYard::judgeStock(HomeYard::rules(), $s, [], [], [], 'rock', 'rock:0', 'mine', ${now}, fn($a, $b) => $a), HomeYard::judgeStock(HomeYard::rules(), $s, [['id' => 'yd-3', 'kind' => 'rock', 'target' => 'rock:0', 'verb' => 'mine', 'took' => 3, 'at_ms' => ${now - 10}]], [], [], 'rock', 'rock:0', 'mine', ${now}, fn($a, $b) => $a)]);`);
    assert.equal(r[0].took, 3);
    assert.equal(r[1].why, 'worn');
  });

  it('acts the owner\'s save already applied are not counted again', () => {
    const r = php(`$s = json_decode(${JSON.stringify(JSON.stringify({ systems: { features: { 'yard-verbs-mp': { applied: ['yd-00000000000000aa'] } } } }))}, false); echo json_encode(HomeYard::unapplied($s, [['id' => 'yd-00000000000000aa'], ['id' => 'yd-00000000000000bb']]));`);
    assert.deepEqual(r, [{ id: 'yd-00000000000000bb' }]);
  });

  it('a visit shows the owner\'s Tower and its floors (Neighbours::homesSlice)', () => {
    const src = readFileSync(join(SITE_DIR, 'src', 'Neighbours.php'), 'utf8');
    assert.match(src, /'home-tower'/);
    assert.match(src, /towerDecor/);
  });
});

describe('the server: home_yard takes rocks and nodes, homes lets anyone with a pass onto a Tower floor', { skip: !HAS_SERVER && 'no server checkout' }, () => {
  it('home_yard.go and homes.go', () => {
    const yard = readFileSync(serverPath('home_yard.go'), 'utf8');
    assert.match(yard, /yardRockRe/);
    assert.match(yard, /yardNodeRe/);
    assert.match(readFileSync(serverPath('homes.go'), 'utf8'), /func towerOwner/);
  });
});
