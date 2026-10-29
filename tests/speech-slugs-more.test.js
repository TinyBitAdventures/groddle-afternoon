/**
 * Slugs on the rest of the source's answers (shrines, the spinning wheel,
 * barnacles, ice, peat, dirt, patches, crabs, foxes, Heli Kitties, rook
 * revives, a failed capture), the failure lines, and energy that was not lost.
 * Run: node --test tests/speech-slugs-more.test.js
 */
import { describe, it, before, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { speechSlugList, slugsFromEffects } from '../public/js/speech-slugs.js?v=g412-1';
import {
  failureResponseKey,
  resourceNodeResponseKey,
  responsePool,
  shrineDonationResponseKey,
  verbResponse,
} from '../public/js/verb-responses.js?v=g414-1';
import { VERB_RESPONSE_POOLS } from '../public/js/verb-responses-data.js?v=g414-1';
import { runVerb } from '../public/content.js?v=g450-1';
import { setTrantTables, createTrantState } from '../public/js/trants.js?v=trant-harvest-2';
import { setMetabolicLossGate } from '../public/js/metabolics.js';
import { createResourceNode, harvestResourceNode } from '../public/js/resource-nodes.js?v=g414-1';
import { talkbackFor } from '../public/js/features/resource-nodes-feature.js?v=g448-4';
import { plotVerbSlugs } from '../public/js/features/patches-feature.js?v=g442-6';
import { createKitty, petKitty } from '../public/js/heli-kitties.js?v=g414-1';
import { createToolConditionState } from '../public/js/tools.js?v=woodcutting-test-8';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const GSJS = join(ROOT, '..', 'glitch-GameServerJS');
const HAVE_GSJS = existsSync(join(GSJS, 'items/include/shrines.js'));
const read = (rel) => readFileSync(join(ROOT, 'public', rel), 'utf8');
const gsjs = (rel) => readFileSync(join(GSJS, rel), 'utf8');
const dead = () => setMetabolicLossGate(() => ({ ok: false, msg: "You would have lost energy, but you're dead!" }));

afterEach(() => setMetabolicLossGate(null));

describe('energy that was not lost gets no slug', () => {
  before(() => {
    setTrantTables(JSON.parse(readFileSync(join(ROOT, 'public/assets/content/trants.json'), 'utf8')));
  });

  it('a dead pet of a tree answers with mood and iMG but no energy, and spends none', () => {
    dead();
    const tree = { classId: 'trant_fruit', state: createTrantState('trant_fruit', { maturity: 7, health: 8, fruitCount: 40 }) };
    const pc = { energy: 40, mood: 40, imagination: 0 };
    const r = runVerb(tree, 'pet', { pc, inv: {}, learned: [], rng: () => 0 });
    assert.equal(r.ok, true);
    assert.equal(pc.energy, 40);
    assert.equal(r.effects.energy, 0);
    assert.equal(r.speech.slugs.energy, undefined);
    assert.ok(!speechSlugList(r.speech.slugs).some((s) => s.type === 'energy'));
  });

  it('a dead water does the same, and an alive one still shows the cost', () => {
    const tree = { classId: 'trant_bean', state: createTrantState('trant_bean', { maturity: 7, health: 8, fruitCount: 40 }) };
    const pc = { energy: 40, mood: 40, imagination: 0 };
    const tools = createToolConditionState();
    const inv = { watering_can: 1 };
    dead();
    const r = runVerb(tree, 'water', { pc, inv, tools, learned: [], rng: () => 0 });
    assert.equal(r.ok, true, r.msgs?.join(' '));
    assert.equal(r.effects.energy, 0);
    assert.equal(r.speech.slugs?.energy, undefined);
    setMetabolicLossGate(null);
    const tree2 = { classId: 'trant_egg', state: createTrantState('trant_egg', { maturity: 7, health: 8, fruitCount: 40 }) };
    const alive = runVerb(tree2, 'pet', { pc, inv, learned: [], rng: () => 0 });
    assert.ok(alive.speech.slugs.energy > 0);
    assert.equal(alive.speech.slugs.energy, -alive.effects.energy);
  });

  it('resource nodes, Heli Kitties: the cost is what metabolics_lose_energy took', () => {
    dead();
    const node = createResourceNode('mortar_barnacle', { seed: 'a' });
    const pc = { energy: 50, imagination: 0, xp: 0 };
    const r = harvestResourceNode(node, { scraper: 1 }, pc, { now: 1_800_000_000_000, dayKey: '2026-01-01', rng: () => 0, toolState: createToolConditionState() });
    assert.equal(r.ok, true, r.message);
    assert.equal(r.costs.energy, 0);
    assert.equal(pc.energy, 50);
    const kitty = createKitty({ x: 0, y: 0, rng: () => 0 });
    const k = petKitty(kitty, { energy: 30, mood: 10 });
    assert.equal(k.energy, 0);
  });
});

describe('failure lines (no slugs)', () => {
  it('picks the source failure keys', () => {
    assert.equal(failureResponseKey('npc_piggy', 'pet'), 'pet_na_fail');
    assert.equal(failureResponseKey('npc_piggy', 'nibble'), 'nibble_na_fail');
    assert.equal(failureResponseKey('trant_gas', 'pet'), 'pet_na_failed');
    assert.equal(failureResponseKey('wood_tree', 'water'), 'water_na_failed');
    // npc_chicken.js keeps squeeze_na_failed in its table but never sends it.
    assert.equal(failureResponseKey('npc_chicken', 'squeeze'), null);
    assert.ok(VERB_RESPONSE_POOLS.npc_piggy.pet_na_fail.length);
  });

  it('a missed tree pet says the tree\'s pet_na_failed line, no slugs, marked failed', () => {
    const tree = { classId: 'trant_spice', state: createTrantState('trant_spice', { maturity: 7, health: 8, fruitCount: 40 }) };
    const pc = { energy: 40, mood: 40, imagination: 0 };
    const r = runVerb(tree, 'pet', { pc, inv: {}, learned: [], rng: () => 0.999 });
    assert.equal(r.ok, false);
    assert.equal(r.speech.failed, true);
    assert.equal(r.speech.key, 'pet_na_failed');
    assert.ok(VERB_RESPONSE_POOLS.trant_spice.pet_na_failed.includes(r.speech.text));
    assert.equal(r.speech.slugs, null);
    assert.match(r.effects.activityLine, /Oops\. You failed!/);
  });

  it('the game shows a failed answer (spoke covers speech.failed)', () => {
    assert.match(read('game.js'), /const spoke = Boolean\(\(result\.ok \|\| result\.speech\?\.failed\) && result\.speech\?\.text\);/);
  });

  it('source failure calls carry no slugs', { skip: !HAVE_GSJS && 'glitch-GameServerJS not present' }, () => {
    const piggy = gsjs('items/npc_piggy.js');
    assert.match(piggy, /this\.sendResponse\('pet_na_fail', pc\);/);
    assert.match(piggy, /this\.sendResponse\('nibble_na_fail', pc\);/);
    assert.doesNotMatch(gsjs('items/npc_chicken.js'), /sendResponse\('squeeze_na_failed'/);
  });
});

describe('shrines, the spinning wheel and the emblem', () => {
  it('tiers a donation by its whole base cost, the lucky bonuses first', () => {
    assert.equal(shrineDonationResponseKey(10), 'donated_item_tier1');
    assert.equal(shrineDonationResponseKey(11), 'donated_item_tier2');
    assert.equal(shrineDonationResponseKey(500), 'donated_item_tier3');
    assert.equal(shrineDonationResponseKey(501), 'donated_item_tier4');
    assert.equal(shrineDonationResponseKey(5, 'huge'), 'super_donation_5x_xp');
    assert.equal(shrineDonationResponseKey(5, 'super'), 'super_donation_20x_xp');
    for (const g of ['alph', 'cosma', 'friendly', 'grendaline', 'humbaba', 'lem', 'mab', 'pot', 'spriggan', 'ti', 'zille']) {
      assert.ok(responsePool(`npc_shrine_${g}`, 'donated_item_tier4')?.length, g);
    }
  });

  it('a donation answer shows iMG, mood and the Giant\'s favor with their icons', () => {
    const r = verbResponse('npc_shrine_mab', 'donated_item_tier2', { rng: () => 0, slugs: { xp: 6, mood: 3, favor: [{ giant: 'mab', points: 3 }] } });
    assert.equal(r.text, VERB_RESPONSE_POOLS.npc_shrine_mab.donated_item_tier2[0]);
    assert.deepEqual(speechSlugList(r.slugs).map((s) => `${s.type}:${s.amount}`), ['imagination:6', 'mood:3', 'favor:3']);
  });

  it('game.js wires donations, the wheel and the emblem', () => {
    const game = read('game.js');
    assert.match(game, /verbResponse\(target\.classId, shrineDonationResponseKey\(result\.baseCost, result\.bonus\), \{/);
    assert.match(game, /slugs: \{ xp: result\.xp, mood: result\.mood, favor: result\.favor \? \[\{ giant: giantId, points: result\.favor \}\] : null \},/);
    assert.match(game, /slugs: r\.kind === 'currants' && r\.amount \? \{ currants: r\.amount \} : null,/);
    assert.match(game, /text: `Congratulations! Your devotion has earned you an emblem of \$\{result\.giant\.name\}!`,/);
  });

  it('matches the source', { skip: !HAVE_GSJS && 'glitch-GameServerJS not present' }, () => {
    const shrines = gsjs('items/include/shrines.js');
    assert.match(shrines, /var base_cost = stack\.hasTag\('no_donate'\) \? 0 : \(stack\.getBaseCost\(\) \* stack\.count\);/);
    assert.match(shrines, /\} else if \(base_cost <= 10\)\{\s*pc\.announce_sound\('DONATION_1ST_TIER'\);\s*this\.sendResponse\('donated_item_tier1', pc, slugs\);/);
    assert.match(shrines, /var txt = "Congratulations! Your devotion has earned you an emblem of "\+giant_text\+"!";\s*this\.sendBubble\(txt, 5000, pc, slugs\);/);
    const wheel = gsjs('items/npc_spinning_wheel.js');
    assert.match(wheel, /slugs\.currants = \(slugs\.currants \? slugs\.currants \+ currants : currants\);/);
  });
});

describe('resource nodes and patches', () => {
  it('keys the talkbacks as the source does', () => {
    assert.equal(resourceNodeResponseKey('mortar_barnacle'), 'scrape');
    assert.deepEqual([1, 2, 3, 4, 5].map((qty) => resourceNodeResponseKey('ice_knob', { qty })), ['scrape', 'scrape_2_ice', 'scrape_3_ice', 'scrape_4_ice', 'scrape']);
    assert.equal(resourceNodeResponseKey('peat_1', { gotDrop: false }), 'harvest_peat_ns_bs');
    assert.equal(resourceNodeResponseKey('peat_2', { gotDrop: true }), 'harvest_peat_drop');
    assert.equal(resourceNodeResponseKey('dirt_pile', { gone: true, loam: true }), 'dirt_pile_gone');
    assert.equal(resourceNodeResponseKey('dirt_pile', { loam: true, helped: true }), 'dig_loam_helped');
    assert.equal(resourceNodeResponseKey('dirt_pile', {}), 'dig_dirt');
    assert.equal(resourceNodeResponseKey('jellisac'), null);
  });

  it('a scrape answers with the energy and iMG it moved, and a drop\'s currants', () => {
    const result = { ok: true, classTsid: 'ice_knob', outputs: [{ classTsid: 'ice', qty: 3 }], effects: { energy: -3, mood: 0, xp: 2 } };
    const t = talkbackFor(result, null);
    assert.equal(t.key, 'scrape_3_ice');
    assert.deepEqual(t.slugs, { xp: 2, energy: 3 });
    const peat = talkbackFor({ ok: true, classTsid: 'peat_1', outputs: [{ classTsid: 'peat', qty: 3 }], effects: { energy: -4, mood: 1, xp: 3 } }, { hit: true, result: { currants: 25, favor: [] } });
    assert.equal(peat.key, 'harvest_peat_drop');
    assert.deepEqual(speechSlugList(peat.slugs).map((s) => s.type), ['imagination', 'energy', 'mood', 'currants']);
    assert.equal(talkbackFor({ ok: false }), null);
  });

  it('a dug-out dirt pile says its gone line', () => {
    const node = createResourceNode('dirt_pile', { seed: 'z' });
    node.units = 2;
    const pc = { energy: 80, imagination: 0, xp: 0, mood: 40 };
    const r = harvestResourceNode(node, { shovel: 1 }, pc, { now: 1_800_000_000_000, dayKey: '2026-01-01', rng: () => 0.99, toolState: createToolConditionState(), learned: ['soil_appreciation_1'] });
    assert.equal(r.ok, true, r.message);
    assert.equal(r.dugOut, true);
    assert.equal(r.loam, false);
    const t = talkbackFor(r);
    assert.equal(t.key, 'dirt_pile_gone');
    assert.ok(VERB_RESPONSE_POOLS.dirt_pile.dirt_pile_gone.includes(t.text));
    assert.equal(t.slugs.energy, 80 - pc.energy);
  });

  it('plot verbs: tend, dig, pet and clear carry slugs; planting does not', () => {
    assert.deepEqual(plotVerbSlugs({ ok: true, verbId: 'tend', costs: { energy: 5, mood: 2, xp: 3 } }), { xp: 3, energy: 5, mood: 2 });
    assert.equal(plotVerbSlugs({ ok: true, verbId: 'plant', costs: { energy: 2 } }), null);
    assert.equal(plotVerbSlugs({ ok: false, verbId: 'tend', costs: {} }), null);
  });

  it('the features pass the slugs to their bubbles', () => {
    assert.match(read('js/features/resource-nodes-feature.js'), /engine\.say\(entity\.target, answer\.text, answer\.durationMs, \{ slugs: answer\.slugs \}\)/);
    assert.match(read('js/features/patches-feature.js'), /if \(result\.response\) talk\(engine, entity, result\.response, speaker, slugs\);/);
    assert.match(read('js/features/crabs-feature.js'), /slugs: slugsFromEffects\(\{ mood: effects\.mood, energy: effects\.energy, xp: effects\.xp, currants: r\.currants \}\),/);
    assert.match(read('js/features/foxes-feature.js'), /\{ slugs: slugsFromEffects\(\{ energy: result\.energy, xp: result\.xp \}\) \}/);
    assert.match(read('js/features/heli-kitties-feature.js'), /\{ slugs: slugsFromEffects\(\{ energy: result\.energy, mood: result\.mood, xp: result\.xp \}\) \}/);
    assert.match(read('js/features/rook-attack-feature.js'), /favor: r\.done && r\.favor \? \[\{ giant: 'all', points: r\.favor \}\] : 0,/);
    assert.match(read('js/features/animal-husbandry-feature.js'), /\{ slugs: slugsFromEffects\(\{ mood: res\.effects\?\.mood \}\) \}/);
    assert.match(read('js/features/enchanted-forest-feature.js'), /\{ slugs: slugsFromEffects\(\{ energy: -\(result\.energyCost \|\| 0\) \}\) \}/);
  });

  it('a revive\'s favor with every Giant is one favor slug', () => {
    assert.deepEqual(speechSlugList(slugsFromEffects({ xp: 25, energy: -25, mood: -25, favor: [{ giant: 'all', points: 10 }] })), [
      { type: 'imagination', amount: 25 },
      { type: 'energy', amount: -25 },
      { type: 'mood', amount: -25 },
      { type: 'favor', amount: 10, giant: 'all' },
    ]);
  });
});
