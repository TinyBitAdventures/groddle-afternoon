/**
 * #672: a gem found while mining reaches the Activity log, and a full pack says where it went.
 *
 * Glitch: a skill package's drop ran runDropTable, which sent its own Activity line
 * "You got 1 Showy Sapphire!" (players/inc_skill_packages.js 38, sendOnlineActivity at 120-123),
 * beside the verb's own line. The remake floated "You also found a ..." for about 2 s and the
 * log kept only "You mine 3 Sparkly...", so a player looking back saw no gem.
 *
 * With the pack full, the gem is held by the magic rock (js/pack-slots.js), and the bags feature
 * says so in Glitch's rewards_store words (inc_rewards.js 80-84, PACK_COPY.rockHolding) when the
 * pack is laid out again, which runVerbFinish does (updateHud) after it logs the verb's lines.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runVerb } from '../public/content.js?v=10c358ca';
import { createInventory, countItem } from '../public/js/inventory.js?v=6414dbdc';
import { createMineRock, setMiningBuffs } from '../public/js/mining.js?v=29eaf67f';
import { createToolConditionState } from '../public/js/tools.js?v=4156bba8';
import { GEM_ITEMS } from '../public/js/imagination-effects.js?v=70169933';
import { dropItemName } from '../public/js/drop-tables.js?v=1ed0b596';
import { ITEM_PLURALS } from '../public/js/item-plurals-data.js?v=62e96051';
import { PACK_COPY } from '../public/js/pack-slots.js?v=38e4aea5';
import { bagsFeature } from '../public/js/features/bags-feature.js?v=17bcf98a';

const ROOT = join(import.meta.dirname, '..');
const GSJS = join(ROOT, '..', 'glitch-GameServerJS');
const GEMS = Object.keys(GEM_ITEMS);
const LEARNED = ['mining_1', 'mining_2', 'mining_3', 'mining_4'];

/** One Sparkly swing with a Truly Outrageous card and Max Luck, so it always finds a gem (inc_skill_packages.js 541). */
function swingWithGem(inv, extra = {}) {
  const pc = { energy: 1e9, mood: 100, imaginationUpgrades: ['mining_drop_4'] };
  const target = { classId: 'rock_sparkly_1', state: { rock: createMineRock('rock_sparkly_1') } };
  setMiningBuffs((id) => id === 'max_luck');
  try {
    return runVerb(target, 'mine', { pc, inv, tools: createToolConditionState(), learned: LEARNED, skills: { learned: LEARNED }, rng: () => 0, talkRng: () => 0, ...extra });
  } finally {
    setMiningBuffs(null);
  }
}

const foundGem = (inv) => GEMS.find((g) => countItem(inv, g) > 0);

describe('#672 a gem while mining is its own Activity line', () => {
  it('the swing carries "You got 1 <gem>!" for the log, beside the mining line (inc_skill_packages.js 38)', () => {
    const inv = createInventory({ pick: 1 });
    const done = swingWithGem(inv);
    assert.equal(done.ok, true);
    const gem = foundGem(inv);
    assert.ok(gem, 'Max Luck with a card always finds a gem');
    const line = `You got 1 ${GEM_ITEMS[gem].label}!`;
    assert.deepEqual(done.effects.dropLines, [line]);
    assert.ok(done.msgs.includes(line), 'the same words float from the rock');
    assert.match(done.effects.activityLine, /^You mine \d+ Sparkly/, 'the mining line stays the verb\'s own');
    assert.doesNotMatch(done.effects.activityLine, new RegExp(GEM_ITEMS[gem].label), 'the gem is not folded into the mining line');
  });

  it('online: the same line when the realtime server rolled the chunks (ctx.sharedChunks)', () => {
    const inv = createInventory({ pick: 1 });
    const done = swingWithGem(inv, { sharedChunks: 4 });
    assert.equal(done.ok, true);
    assert.match(done.effects.activityLine, /^You mine 4 Sparkly/);
    assert.deepEqual(done.effects.dropLines, [`You got 1 ${GEM_ITEMS[foundGem(inv)].label}!`]);
  });

  it('game.js logs each drop line after the verb\'s line, in the one finish solo and online share', () => {
    const src = readFileSync(join(ROOT, 'public', 'game.js'), 'utf8');
    const fin = src.slice(src.indexOf('function runVerbFinish('));
    const body = fin.slice(0, fin.indexOf('\nfunction ', 10));
    assert.match(body, /sharedChunks: sharedGrant\?\.chunks/, 'online swings finish here too');
    const logged = body.indexOf('for (const line of result.effects?.dropLines || []) logGain(line);');
    assert.ok(logged > 0, 'drop lines go to the log (notify.gain, a log line of their own)');
    assert.ok(body.indexOf('logGain(feedLine)') < logged, 'after the mining line');
    assert.ok(logged < body.indexOf('if (result.miningChanged)'), 'before the pack is laid out again (the magic rock line follows)');
  });

  it('names are the source\'s name_single / name_plural, as runDropTable pluralize()d them', (t) => {
    for (const gem of GEMS) {
      assert.equal(dropItemName(gem, 1), `1 ${GEM_ITEMS[gem].label}`);
      assert.equal(dropItemName(gem, 2), `2 ${ITEM_PLURALS[gem] || GEM_ITEMS[gem].namePlural}`);
    }
    if (!existsSync(join(GSJS, 'items', 'gem_sapphire.js'))) return t.skip('no glitch-GameServerJS');
    for (const gem of GEMS) {
      const file = readFileSync(join(GSJS, 'items', `${gem}.js`), 'utf8');
      assert.equal(dropItemName(gem, 1), `1 ${file.match(/var name_single = "([^"]+)"/)[1]}`);
      assert.equal(dropItemName(gem, 3), `3 ${file.match(/var name_plural = "([^"]+)"/)[1]}`);
    }
  });

  it('no card, no gem, no drop line', () => {
    const inv = createInventory({ pick: 1 });
    const pc = { energy: 1e9, mood: 100, imaginationUpgrades: [] };
    const target = { classId: 'rock_sparkly_1', state: { rock: createMineRock('rock_sparkly_1') } };
    setMiningBuffs((id) => id === 'max_luck');
    const done = runVerb(target, 'mine', { pc, inv, tools: createToolConditionState(), learned: LEARNED, skills: { learned: LEARNED }, rng: () => 0, talkRng: () => 0 });
    setMiningBuffs(null);
    assert.equal(done.ok, true);
    assert.deepEqual(done.effects.dropLines || [], []);
  });
});

describe('#672 a full pack: the magic rock holds the gem and says so', () => {
  it('the pack laid out after the swing says "Your magic rock is holding a <gem> for you..."', () => {
    // A full pack: the pick, a Sparkly stack with room (so the chunks fit) and 14 other stacks.
    const inv = createInventory({});
    for (const k of Object.keys(inv)) if (typeof inv[k] === 'number') inv[k] = 0;
    inv.pick = 1;
    inv.sparkly = 1;
    for (let i = 0; i < 14; i++) inv[`zz_full_${i}`] = 1;
    const said = [];
    const engine = { mode: 'solo', inv, started: true, setData() {}, pushActivity: (text) => said.push(text), toast() {}, param: () => null };
    bagsFeature.restore({ v: 1, migrated: true }, engine);
    const before = bagsFeature.packLayout(engine);
    assert.equal(before.free, 0, 'the pack is full');
    assert.deepEqual(said, []);

    const done = swingWithGem(inv);
    assert.equal(done.ok, true);
    const gem = foundGem(inv);
    assert.equal(countItem(inv, gem), 1, 'the gem is still the player\'s');
    const after = bagsFeature.packLayout(engine);
    assert.deepEqual(after.rock, { [gem]: 1 }, 'only the gem is held by the magic rock');
    const a = /^[aeiou]/i.test(GEM_ITEMS[gem].label) ? 'an' : 'a';
    assert.deepEqual(said, [PACK_COPY.rockHolding(`${a} ${GEM_ITEMS[gem].label}`, false)]);
    assert.equal(said[0], `Your magic rock is holding ${a} ${GEM_ITEMS[gem].label} for you. Make room in your pack to hold it.`);
    // Laid out again with nothing new: said once.
    bagsFeature.packLayout(engine);
    assert.equal(said.length, 1);
  });
});
