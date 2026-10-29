/**
 * G328 / G201: visitors' verbs on another player's home street in
 * multiplayer: js/yard-verbs-mp.js (the shared rules), the feature's solo
 * silence, the site's src/HomeYard.php (checked through php -r) and its
 * data/yard-verbs.json, and the server's home_yard.go.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  YARD_POOL,
  allowedVerbs,
  animalActs,
  animalUses,
  applyYardAct,
  gameDayStart,
  keepApplied,
  normalizeYardActs,
  normalizeYardView,
  poolKey,
  treeActs,
  treeSnapshot,
  visitorAnimalState,
  visitorTreeState,
} from '../public/js/yard-verbs-mp.js?v=g414-1';
import { yardVerbsMpFeature } from '../public/js/features/yard-verbs-mp-feature.js?v=g419-1';
import { HAS_SERVER, HAS_SITE, SITE_DIR, serverPath, sitePath } from '../tools/repos.mjs';

const root = join(import.meta.dirname, '..');
const gsjs = join(root, '..', 'glitch-GameServerJS');
const hasPhp = spawnSync('php', ['-v']).status === 0;
const skipSite = !HAS_SITE ? 'no groddle-afternoon-site checkout' : !hasPhp ? 'no php' : false;

function php(classes, body) {
  const code = `foreach (${JSON.stringify(classes)} as $c) require ${JSON.stringify(SITE_DIR)} . "/src/$c.php"; ${body}`;
  return JSON.parse(execFileSync('php', ['-r', code]).toString());
}

describe('the pool amounts are the handlers\' own (GSJS)', () => {
  const at = (file, line) => readFileSync(join(gsjs, file), 'utf8').split('\n')[line - 1];
  const cases = [
    ['npc_piggy:pet', 'items/npc_piggy.js', 1764],
    ['npc_piggy:nibble', 'items/npc_piggy.js', 1664],
    ['npc_butterfly:massage', 'items/npc_butterfly.js', 1187],
    ['npc_butterfly:milk', 'items/npc_butterfly.js', 1356],
    ['npc_chicken:squeeze', 'items/npc_chicken.js', 1560],
    ['patch:dig', 'items/patch.js', 615],
    ['patch:tend', 'items/patch.js', 714],
    ['trant:pet', 'items/include/trants.js', 90],
    ['trant:water', 'items/include/trants.js', 196],
    ['trant:harvest', 'items/include/trants.js', 420],
    ['wood_tree:pet', 'items/wood_tree.js', 1018],
  ];
  for (const [key, file, line] of cases) {
    it(`${key} is ${YARD_POOL[key]} (${file}:${line})`, () => {
      const m = /cultivation_add_img_rewards\(pc, ([\d.]+)\)/.exec(at(file, line));
      assert.ok(m, `${file}:${line} adds to the pool`);
      assert.equal(Number(m[1]), YARD_POOL[key]);
    });
  }
  it('set free is the owner\'s, the yard verbs are anyone\'s', () => {
    const butterfly = readFileSync(join(gsjs, 'items/npc_butterfly.js'), 'utf8');
    assert.match(butterfly, /verbs\.set_free[\s\S]{0,900}this\.container\.owner != pc/);
    assert.deepEqual(allowedVerbs('animal', 'npc_piggy'), ['pet', 'nibble', 'talk_to']);
    assert.deepEqual(allowedVerbs('tree', 'wood_tree'), ['pet', 'water', 'talk_to']);
    assert.deepEqual(allowedVerbs('plot', 'patch'), ['tend', 'dig']);
    assert.equal(poolKey('tree', 'trant_fruit', 'harvest'), 'trant:harvest');
    assert.equal(poolKey('plot', 'patch_dark', 'dig'), 'patch:dig');
  });
});

describe('a visitor\'s copies carry the visitor\'s own uses', () => {
  it('an animal copy has my counts today, not the owner\'s', () => {
    const row = { id: 'a1', classId: 'npc_piggy', state: { petUsesToday: 1, petted: true, mood: 1, hunger: 1 } };
    const copy = visitorAnimalState(row, {});
    assert.equal(copy.petUsesToday, 0);
    assert.equal(copy.petted, false);
    assert.equal(copy.mood, 1);
    const after = visitorAnimalState(row, { 'pet:a1': 1 });
    assert.equal(after.petUsesToday, 1);
    assert.deepEqual(animalActs(animalUses('npc_piggy', copy), animalUses('npc_piggy', { petUsesToday: 1, nibbleUsesToday: 1 })), ['pet', 'nibble']);
  });
  it('a tree copy is tended as the owner\'s is today and harvested only by me', () => {
    const now = Date.now();
    const plot = { stage: 'tree', tree: { classId: 'trant_fruit', resetAt: now, state: { classTsid: 'trant_fruit', maturity: 7, health: 7, fruitCount: 9, harvestsToday: 1, petted: true, watered: false } } };
    const s = visitorTreeState(plot, 'patch:0', {}, now);
    assert.equal(s.harvestsToday, 0);
    assert.equal(s.petted, true);
    const stale = visitorTreeState({ ...plot, tree: { ...plot.tree, resetAt: gameDayStart(now) - 1 } }, 'patch:0', { 'harvest:patch:0': 1 }, now);
    assert.equal(stale.petted, false, 'the owner\'s game has not turned the day: yesterday\'s petting is gone');
    assert.equal(stale.harvestsToday, 1);
    assert.deepEqual(treeActs(treeSnapshot(s), treeSnapshot({ petted: true, watered: true, harvestsToday: 1 })), ['water', 'harvest']);
  });
});

describe('the owner\'s game applies what visitors did', () => {
  const now = Date.now();
  const acts = normalizeYardActs([
    { id: 'yd-0000000000000001', from: { id: 9, name: 'Bo' }, kind: 'plot', target: 'patch:0', verb: 'dig', at: now },
    { id: 'yd-0000000000000002', from: { id: 9, name: 'Bo' }, kind: 'tree', target: 'patch:1', verb: 'water', at: now },
    { id: 'yd-0000000000000003', from: { id: 9, name: 'Bo' }, kind: 'animal', target: 'a1', verb: 'pet', at: now },
    { id: 'bad', kind: 'plot', target: 'patch:0', verb: 'dig' },
    { id: 'yd-0000000000000004', kind: 'animal', target: 'patch:0', verb: 'pet' },
  ]);
  it('keeps only well-formed acts', () => assert.equal(acts.length, 3));
  it('a dug Patch, a watered tree and a happier Piggy', () => {
    const plots = {
      'patch:0': { classTsid: 'patch', kind: 'patch', stage: 'dirty', since: 0, dueAt: 0 },
      'patch:1': { stage: 'tree', tree: { classId: 'trant_fruit', resetAt: now - 1000, state: { classTsid: 'trant_fruit', maturity: 7, health: 7, fruitCount: 0, petted: true, watered: false } } },
    };
    const animals = [{ id: 'a1', classId: 'npc_piggy', state: { mood: 0, hunger: 1 } }];
    assert.equal(applyYardAct({ plots, animals }, acts[0])?.what, 'Patch');
    assert.equal(plots['patch:0'].stage, 'dug');
    assert.ok(plots['patch:0'].dueAt > now);
    assert.equal(applyYardAct({ plots, animals }, acts[1])?.what, 'Fruit Tree');
    assert.equal(plots['patch:1'].tree.state.watered, true);
    assert.equal(plots['patch:1'].tree.state.health, 8, 'petted and watered: health +1 (trants.js performTending)');
    applyYardAct({ plots, animals }, acts[2]);
    assert.equal(animals[0].state.mood, 1, 'onPetComplete incMood');
    assert.equal(applyYardAct({ plots, animals }, acts[0]), null, 'a hole is not dug twice');
  });
  it('remembers applied ids, at most 200', () => {
    const many = Array.from({ length: 250 }, (_, i) => `yd-${String(i).padStart(16, '0')}`);
    assert.equal(keepApplied([], many).length, 200);
    assert.equal(keepApplied(['yd-0000000000000001'], ['yd-0000000000000001']).length, 1);
  });
  it('reads the site\'s visit view', () => {
    const v = normalizeYardView({ owner: 7, name: 'Ada', cult: {}, patches: [{ key: 'patch:0', rx: 470, plot: { stage: 'dirty' } }, { key: 'rock:1', rx: 1, plot: {} }], animals: [{ id: 'a1', classId: 'npc_piggy', x: 300, state: {} }, { id: 'a2', classId: 'npc_rook', x: 1 }], mine: { 'pet:a1': 1, 'x': 'y' } });
    assert.equal(v.patches.length, 1);
    assert.equal(v.animals.length, 1);
    assert.deepEqual(v.mine, { 'pet:a1': 1 });
    assert.equal(normalizeYardView({ owner: 0 }), null);
  });
});

describe('solo never runs it', () => {
  it('answers nothing outside multiplayer', () => {
    const engine = { mode: 'solo', started: true, query: () => { throw new Error('asked'); } };
    yardVerbsMpFeature.onTick(16, Date.now(), engine);
    assert.equal(yardVerbsMpFeature.decorateVerbs({ classId: 'npc_piggy', yardVisit: { kind: 'animal', id: 'a1' } }, [{ id: 'set_free' }]), null);
    assert.equal(yardVerbsMpFeature.runVerbOverride({ classId: 'npc_piggy' }, 'pet', engine), null);
    assert.deepEqual(yardVerbsMpFeature.verbsFor({}), []);
    assert.equal(yardVerbsMpFeature.save(), undefined);
    yardVerbsMpFeature.restore({ applied: ['yd-0000000000000001'] }, engine);
    assert.equal(yardVerbsMpFeature.save(), undefined, 'a solo restore keeps nothing');
  });
  it('is registered before street-objects under one key', () => {
    const index = readFileSync(join(root, 'public/js/features/index.js'), 'utf8');
    const at = index.indexOf("yard-verbs-mp-feature.js?v=g419-1'");
    assert.ok(at > 0 && at < index.indexOf('street-objects-feature.js'));
    const feature = readFileSync(join(root, 'public/js/features/yard-verbs-mp-feature.js'), 'utf8');
    assert.match(feature, /yard-verbs-mp\.js\?v=g414-1'/);
  });
});

describe('the site decides (src/HomeYard.php)', { skip: skipSite }, () => {
  it('data/yard-verbs.json is current', () => {
    assert.equal(spawnSync('node', ['tools/build-yard-verbs.mjs', '--check'], { cwd: root }).status, 0);
  });
  const judge = (state, waiting, uses, skills, kind, id, verb) => php(['HomePool', 'HomeYard'],
    `use Groddle\\Minn\\HomeYard as Y; $s = json_decode(${JSON.stringify(JSON.stringify(state))}); echo json_encode(Y::judge(Y::rules(), $s, json_decode(${JSON.stringify(JSON.stringify(waiting))}, true), json_decode(${JSON.stringify(JSON.stringify(uses))}, true), json_decode(${JSON.stringify(JSON.stringify(skills))}, true), ${JSON.stringify(kind)}, ${JSON.stringify(id)}, ${JSON.stringify(verb)}, ${Date.now()}));`);
  const now = Date.now();
  const owner = {
    systems: { home: { owned: true }, features: { homes: { cult: { items: [{ id: 1, protoClass: 'proto_patch', endClass: 'patch', rx: 470 }, { id: 2, protoClass: 'proto_patch', endClass: 'patch', rx: 900 }] } } } },
    world: { streets: { RH_HOME_EXT: { features: {
      patches: { plots: {
        'patch:0': { classTsid: 'patch', kind: 'patch', stage: 'dirty', since: 0, dueAt: 0 },
        'patch:1': { stage: 'tree', tree: { classId: 'trant_fruit', resetAt: now, state: { maturity: 7, health: 7, fruitCount: 5, petted: false, watered: false } } },
      } },
      'animal-husbandry': { animals: [{ id: 'a1', classId: 'npc_piggy', x: 300, state: {} }, { id: 'a2', classId: 'npc_butterfly', x: 600, state: {} }] },
    } } } },
  };
  it('a Piggy: pet once a day at rank 0, nibble after a pet, meat for the visitor', () => {
    assert.deepEqual(judge(owner, [], {}, [], 'animal', 'a1', 'pet'), { pool: 'npc_piggy:pet', got: [] });
    assert.equal(judge(owner, [], { 'pet:a1': 1 }, [], 'animal', 'a1', 'pet').text, 'You can only pet this Piggy 1 time per game day.');
    assert.equal(judge(owner, [], { 'pet:a1': 1 }, ['animalkinship_4'], 'animal', 'a1', 'pet').pool, 'npc_piggy:pet', 'AK IV: twice');
    assert.equal(judge(owner, [], {}, [], 'animal', 'a1', 'nibble').why, 'warmup');
    assert.deepEqual(judge(owner, [], { 'pet:a1': 1 }, [], 'animal', 'a1', 'nibble'), { pool: 'npc_piggy:nibble', got: { meat: 1 } });
    assert.equal(judge(owner, [], {}, [], 'animal', 'a1', 'milk').why, 'gone', 'a Piggy is not milked');
    assert.equal(judge(owner, [], {}, [], 'animal', 'a9', 'pet').why, 'gone');
  });
  it('a Patch: tend when weedy, dig unless dug, earth by Soil Appreciation', () => {
    assert.deepEqual(judge(owner, [], {}, [], 'plot', 'patch:0', 'tend'), { pool: 'patch:tend' });
    assert.deepEqual(judge(owner, [], {}, ['soil_appreciation_2'], 'plot', 'patch:0', 'dig'), { pool: 'patch:dig', got: { earth: 3 } });
    const dug = [{ id: 'yd-0000000000000001', kind: 'plot', target: 'patch:0', verb: 'dig', took: 0, at_ms: now - 1000 }];
    assert.equal(judge(owner, dug, {}, [], 'plot', 'patch:0', 'dig').text, 'There is already a hole there.');
    assert.equal(judge(owner, dug, {}, [], 'plot', 'patch:0', 'tend').text, 'Nope, no tending needed.');
    const longAgo = [{ ...dug[0], at_ms: now - 11 * 60 * 1000 }];
    assert.equal(judge(owner, longAgo, {}, [], 'plot', 'patch:0', 'dig').pool, 'patch:dig', 'the hole filled in (patch.js onFillTimer, 10 min)');
    assert.equal(judge(owner, [], {}, [], 'plot', 'patch:1', 'dig').why, 'gone', 'a tree stands there');
  });
  it('a tree: pet and water once a day by anyone, a harvest takes the fruit the visitor\'s Arborology says', () => {
    assert.deepEqual(judge(owner, [], {}, [], 'tree', 'patch:1', 'water'), { pool: 'trant:water' });
    const watered = [{ id: 'yd-0000000000000002', kind: 'tree', target: 'patch:1', verb: 'water', took: 0, at_ms: now - 1000 }];
    assert.equal(judge(owner, watered, {}, [], 'tree', 'patch:1', 'water').text, "I don't want to be watered!");
    assert.deepEqual(judge(owner, [], {}, [], 'tree', 'patch:1', 'harvest'), { pool: 'trant:harvest', took: 3, got: { cherry: 3 } });
    assert.deepEqual(judge(owner, [], {}, ['gardening_1'], 'tree', 'patch:1', 'harvest'), { pool: 'trant:harvest', took: 5, got: { cherry: 5 } }, 'no more than the tree holds');
    assert.equal(judge(owner, [], { 'harvest:patch:1': 1 }, [], 'tree', 'patch:1', 'harvest').why, 'limit');
    assert.equal(judge(owner, [], {}, [], 'tree', 'patch:1', 'poison').why, 'gone');
  });
  it('the route is registered and the table declared', () => {
    assert.match(readFileSync(sitePath('src/Extension.php'), 'utf8'), /new HomeYard\(\$minn\)/);
    const minn = JSON.parse(readFileSync(sitePath('minn.json'), 'utf8'));
    assert.ok(minn.tables.groddle_home_yard);
  });
});

describe('the server checks the street (home_yard.go)', { skip: !HAS_SERVER && 'no groddle-afternoon-server checkout' }, () => {
  it('names the route the site serves', () => {
    let go = '';
    try { go = readFileSync(serverPath('home_yard.go'), 'utf8'); } catch { return; }
    assert.match(go, /ledgerRouteHomeYard = "\/groddle\/v1\/homes\/yard"/);
    assert.match(go, /cl\.Street\(\) != homeStreetPrefix/);
  });
});

describe('a home street\'s hub is the source\'s Homes', () => {
  it('hub 117 is "Homes" (inc_data_maps_prod.js 957-966) and the game says so', () => {
    assert.match(readFileSync(join(gsjs, 'inc_data_maps_prod.js'), 'utf8'), /maps_get_hubs_117\(\)\{\s*return \{\s*"name"\s*: "Homes"/);
    for (const f of ['public/game.js', 'public/js/homes.js', 'public/js/locations.js', 'public/js/features/neighbours-mp-feature.js']) {
      const text = readFileSync(join(root, f), 'utf8');
      assert.doesNotMatch(text, /(hubName|toHub|fromHub): 'Home'/, f);
      assert.match(text, /(hubName|toHub): 'Homes'/, f);
    }
  });
});
