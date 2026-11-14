/**
 * G617: players are told how gems are found. A street project's gem ask carries a line, and a
 * rock's Mine tooltip carries one for a player with no Truly Outrageous card (and nothing more
 * for a player who has one). The words are the remake's own; odds, costs and drops are untouched.
 * Rules: js/gem-hints.js (GEM_HINTS, isGem, miningGemHint), content.js (the rock's mine verb),
 * js/features/street-jobs-feature.js (the project panel's requirement rows).
 * Run: node --test tests/gem-hints.test.js
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getVerbsFor, runVerb } from '../public/content.js?v=288cbcba';
import { createInventory } from '../public/js/inventory.js?v=f49c8998';
import { createMineRock, miningProfile } from '../public/js/mining.js?v=b28fef74';
import { createToolConditionState } from '../public/js/tools.js?v=48542c24';
import { GEM_ITEMS, GEM_SMALL_DROPS } from '../public/js/imagination-effects.js?v=70169933';
import { GEM_CARD_NAME, GEM_HINTS, isGem, miningGemHint } from '../public/js/gem-hints.js?v=4b65f7ac';
import { IMAGINATION_UPGRADES } from '../public/js/imagination-data.js?v=4a85e7fe';

const root = join(import.meta.dirname, '..');
const CARDS = ['mining_drop_1', 'mining_drop_2', 'mining_drop_3', 'mining_drop_4'];
const jobs = JSON.parse(readFileSync(join(root, 'public/assets/content/street-jobs.json'), 'utf8'));

describe('G617: the words', () => {
  it('the two lines, exactly', () => {
    assert.equal(GEM_HINTS.project, 'Gems turn up while mining once you have a Truly Outrageous upgrade card.');
    assert.equal(GEM_HINTS.mining, 'Gems need a Truly Outrageous upgrade card.');
    for (const line of Object.values(GEM_HINTS)) assert.doesNotMatch(line, /—/, 'no em-dash');
  });

  it('they use the card\'s own name from the Upgrades shop', () => {
    assert.deepEqual(CARDS.map((id) => IMAGINATION_UPGRADES[id].name), ['I', 'II', 'III', 'IV'].map((n) => `${GEM_CARD_NAME} ${n}`));
    for (const id of CARDS) assert.match(IMAGINATION_UPGRADES[id].desc, /chance of a bonus Gem when you mine/);
  });

  it('are true for every gem a street project asks for: each is a mining gem', () => {
    const mined = new Set(GEM_SMALL_DROPS.map(([, id]) => id));
    const asked = new Set();
    for (const def of Object.values(jobs.classes)) for (const r of def.requirements || []) if (/^gem_/.test(r.classId || '')) asked.add(r.classId);
    assert.ok(asked.has('gem_moonstone'), 'the moonstone ask is there');
    for (const id of asked) {
      assert.ok(isGem(id), `${id} is a gem`);
      assert.ok(mined.has(id), `${id} drops while mining with the card`);
    }
    assert.deepEqual([...mined].sort(), Object.keys(GEM_ITEMS).sort(), 'all five gems are mining gems');
    assert.equal(isGem('gem_moonstone'), true);
    assert.equal(isGem('plank'), false);
    assert.equal(isGem(undefined), false);
  });
});

describe('G617: no balance change', () => {
  it('the gem table and the four cards\' chances are as they were', () => {
    assert.deepEqual(GEM_SMALL_DROPS, [[50, 'gem_amber'], [70, 'gem_sapphire'], [85, 'gem_ruby'], [95, 'gem_moonstone'], [100, 'gem_diamond']]);
    assert.equal(miningProfile(['mining_1'], 'pick', []).dropChance, 0);
    assert.deepEqual(CARDS.map((id) => miningProfile(['mining_1'], 'pick', [id]).dropChance), [4, 5, 6, 8]);
    for (const id of CARDS) assert.equal(miningProfile(['mining_1'], 'pick', [id]).dropClassId, 'gem_small');
  });

  it('a swing without a card never finds a gem, with or without the hint', () => {
    const inv = createInventory({ pick: 1 });
    const pc = { energy: 500, mood: 100, imaginationUpgrades: [] };
    const target = { classId: 'rock_beryl_1', state: { rock: createMineRock('rock_beryl_1') } };
    const done = runVerb(target, 'mine', { pc, inv, tools: createToolConditionState(), learned: ['mining_1'], skills: { learned: ['mining_1'] }, rng: () => 0 });
    assert.equal(done.ok, true);
    assert.equal(Object.keys(GEM_ITEMS).some((id) => (inv.items?.[id] || inv[id] || 0) > 0), false);
    assert.doesNotMatch(done.msgs.join(' '), /You also found/);
  });
});

describe('G617: the Mine tooltip', () => {
  const mineVerb = (upgrades, { ctxUpgrades, pick = 'pick', learned = ['mining_1'], rock = createMineRock('rock_beryl_1'), inv = createInventory({ [pick]: 1 }) } = {}) =>
    getVerbsFor({ classId: 'rock_beryl_1', state: { rock } }, {
      pc: { energy: 500, mood: 100, imaginationUpgrades: upgrades },
      inv,
      tools: createToolConditionState(),
      learned,
      skills: { learned },
      ...(ctxUpgrades ? { imaginationUpgrades: ctxUpgrades } : {}),
    }).find((v) => v.id === 'mine');

  it('a player with no Truly Outrageous card is told', () => {
    const rock = createMineRock('rock_beryl_1');
    const v = mineVerb([], { rock });
    assert.equal(v.tooltip, `Swing your pick (${rock.chunksRemaining} chunks left). Gems need a Truly Outrageous upgrade card.`);
    assert.equal(v.enabled, true);
    // Other mining cards are not gem cards.
    assert.match(mineVerb(['mining_time_1', 'mining_expert_beryl']).tooltip, /Gems need a Truly Outrageous upgrade card\.$/);
    assert.match(mineVerb([], { pick: 'fancy_pick' }).tooltip, /^Swing your fancy pick \(\d+ chunks left\)\. Gems need a Truly Outrageous upgrade card\.$/);
  });

  it('a player with any one of the four cards sees the tooltip as it was', () => {
    for (const id of CARDS) {
      const rock = createMineRock('rock_beryl_1');
      assert.equal(mineVerb([id], { rock }).tooltip, `Swing your pick (${rock.chunksRemaining} chunks left)`, id);
    }
    // The verb context's own card list counts too (content.js reads ctx.imaginationUpgrades first).
    assert.doesNotMatch(mineVerb([], { ctxUpgrades: ['mining_drop_2'] }).tooltip, /Gems/);
  });

  it('the other tooltips (no pick, mined out) are as they were', () => {
    assert.equal(mineVerb([], { inv: createInventory({}) }).tooltip, 'Requires a Pick in your pack');
    const empty = createMineRock('rock_beryl_1');
    empty.chunksRemaining = 0;
    empty.depleted = true;
    empty.respawnAt = Date.now() + 60000;
    assert.equal(mineVerb([], { rock: empty }).tooltip, 'This rock is mined out');
  });

  it('miningGemHint reads the swing the way mineRock does', () => {
    assert.equal(miningGemHint(miningProfile(['mining_1'], 'pick', [])), GEM_HINTS.mining);
    assert.equal(miningGemHint(miningProfile(undefined, 'pick', [])), GEM_HINTS.mining);
    for (const id of CARDS) assert.equal(miningGemHint(miningProfile(['mining_4'], 'fancy_pick', [id])), '');
    assert.equal(miningGemHint(null), '');
  });
});

describe('G617: the project panel', () => {
  const src = readFileSync(join(root, 'public/js/features/street-jobs-feature.js'), 'utf8');

  it('puts the line under a gem ask that is still open, in the one panel solo and multiplayer share', () => {
    assert.match(src, /if \(r\.type === 'item' && isGem\(r\.classId\) && !r\.done\) text\.append\(el\('small', \{ class: 'sj-hint', dataset: \{ sjHint: 'gems' \} \}, GEM_HINTS\.project\)\);/);
    assert.equal(src.match(/GEM_HINTS\.project/g).length, 1, 'one place draws it');
    // The row is drawn by renderPanel for a shared (multiplayer) project and a solo one alike.
    const at = src.indexOf('GEM_HINTS.project');
    const fn = src.lastIndexOf('\nfunction ', at);
    assert.match(src.slice(fn, fn + 40), /^\nfunction renderPanel\(engine\)/);
    assert.match(src, /G617[^\n]*the remake's own line/);
  });

  it('marks the mining line as the remake\'s own too', () => {
    const content = readFileSync(join(root, 'public/content.js'), 'utf8');
    assert.match(content, /G617[^\n]*the remake's own line/);
    const hints = readFileSync(join(root, 'public/js/gem-hints.js'), 'utf8');
    assert.match(hints, /register G617/);
    assert.match(hints, /the remake's own \(the original had no such hint\)/);
  });
});
