// G318 copy sweep, batch of 2026-11-09: NPC words, item descriptions and the store and food lines the
// remake had written itself where the original's own words survive in GSJS. Each line is checked in
// the game and, when the source is beside the game, in the GSJS file it came from.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ITEM_CATALOG, createInventory, getItemUseInfo, registerItemUse } from '../public/js/inventory.js?v=5be47371';
import { VENDOR_PROFILES, vendorBuy, vendorSell } from '../public/js/vendor.js?v=592caaf1';
import { canEatFood, createFoodState } from '../public/js/food.js?v=1b39e06a';

const root = join(import.meta.dirname, '..');
const game = (f) => readFileSync(join(root, 'public', f), 'utf8').replace(/\\'/g, "'").replace(/\\"/g, '"');
const gsjs = (f) => {
  try {
    return readFileSync(join(root, '..', 'glitch-GameServerJS', f), 'utf8')
      .replace(/<a [^>]*>(.*?)<\\\/a>/g, '$1').replace(/\\'/g, "'").replace(/\\"/g, '"').replace(/\\\//g, '/');
  } catch { return null; }
};
/** items/<class>.js `var description`, links stripped (null without the source). */
const srcDesc = (cls) => {
  const s = gsjs(`items/${cls}.js`);
  if (!s) return null;
  const m = s.match(/^var description = "([\s\S]*?)";$/m);
  return m ? m[1] : null;
};

// [file under public/, the line, the GSJS file it comes from]
const LINES = [
  ['game.js', 'A block with a letter on it.', 'items/npc_letterblock.js'],
  ['js/quest-rooms/kids-room.js', 'A block with a letter on it.', 'items/npc_letterblock.js'],
  ['game.js', 'An ikkle fwuffy cutesy wutesy Dust Bunny.', 'items/npc_dustbunny.js'],
  ['game.js', 'Shiny, but you can barely see the shine so it ends up a little dull.', 'items/small_worthless.js'],
  ['game.js', 'Professor of porkthropology, obtainer of rare artifacts', 'items/npc_piggy_explorer.js'],
  ['js/quest-rooms/juju-camp.js', 'The scourge of the Baqala', 'items/npc_juju_bandit.js'],
  ['js/quest-rooms/juju-camp.js', 'The meanest and most mercenary of the Juju band', 'items/npc_juju_grandma.js'],
  ['js/features/foxes-feature.js', 'Guardian of the Fox Reserves', 'items/npc_fox_ranger.js'],
  ['js/quest-rooms/penalty.js', 'Discuss a matter of grave importance', 'items/npc_smuggler.js'],
  ['content.js', 'Click to spin this letter block and see what you get!', 'items/letter_block.js'],
  ['content.js', 'Talk to Mr. Block', 'items/npc_letterblock.js'],
  ['content.js', 'Get yourself out of here!', 'items/npc_letterblock.js'],
  ['js/features/hell-feature.js', 'Someone died here.', 'items/graveside_marker.js'],
  ['js/ghost-quest.js', 'Find what cannot be found.', 'quests/phantom_glitch.js'],
  ['js/legalize-it.js', 'Activate Card Carrying Qualification', 'quests/card_carrying_qualification.js'],
  ['js/rook-woods.js', 'Smash the Rook Egg', 'quests/rook_egg_smash.js'],
  ['js/food.js', "You can't eat anymore food today.", 'items/include/food.js'],
  ['game.js', 'You are stuffed.', 'items/catalog_buffs.js'],
  ['js/resource-nodes.js', 'You petted a Paper Tree.', null],
  ['js/vendor.js', 'This store no longer sells that item.', 'players/inc_stores.js'],
  ['js/vendor.js', "Sorry, you can't afford that.", 'players/inc_stores.js'],
  ['js/vendor.js', "Sorry, you don't have as much as you tried to sell.", 'players/inc_stores.js'],
];

describe('G318 batch 2: the original words where they survive', () => {
  for (const [file, line, src] of LINES) {
    it(`${file}: ${line.slice(0, 48)}`, (t) => {
      assert.ok(game(file).includes(line), `${file} lacks the line`);
      if (!src) return;
      const source = gsjs(src);
      if (!source) return t.skip('needs glitch-GameServerJS beside the game');
      assert.ok(source.includes(line), `${src} lacks it`);
    });
  }

  it('the base pack items carry their item files\' descriptions, links stripped', (t) => {
    const classes = ['apple', 'milk_butterfly', 'butterfly_lotion', 'grain', 'plank', 'hatchet', 'cherry', 'egg_plain',
      'bean_plain', 'plain_bubble', 'all_spice', 'general_vapour', 'meat', 'flour', 'pinch_of_salt', 'bun', 'sammich', 'waffles'];
    if (!srcDesc('apple')) return t.skip('needs glitch-GameServerJS beside the game');
    for (const cls of classes) assert.equal(ITEM_CATALOG[cls].desc, srcDesc(cls), cls);
  });

  it('item descriptions written elsewhere in the game are the source text too', (t) => {
    if (!srcDesc('lips')) return t.skip('needs glitch-GameServerJS beside the game');
    const where = {
      'game.js': ['card_carrying_qualification', 'your_papers', 'ice', 'small_worthless', 'lips', 'moon'],
      'js/garden.js': ['watering_can', 'hoe'],
      'js/patches.js': ['earth', 'loam'],
      'js/spinning-wheel.js': ['cubimal_package', 'cubimal_package_2', 'sno_cone_blue', 'sno_cone_green', 'sno_cone_orange', 'sno_cone_red', 'sno_cone_purple'],
      'js/features/newxp-feature.js': ['greeter_twig', 'bag_generic'],
      'js/features/homes-feature.js': ['wall_segment'],
    };
    for (const [file, classes] of Object.entries(where)) {
      const text = game(file);
      for (const cls of classes) assert.ok(text.includes(srcDesc(cls)), `${file} ${cls}`);
    }
  });

  it('a store kept by its own vendor shows that vendor\'s description', (t) => {
    const byStore = { sno_cone: 'npc_sno_cone_vending_machine', tools: 'npc_tool_vendor', gardening_tools: 'npc_gardening_vendor',
      emporium: 'npc_jabba1', liquor: 'npc_jabba2', meals: 'npc_cooking_vendor' };
    if (!srcDesc('npc_jabba1')) return t.skip('needs glitch-GameServerJS beside the game');
    for (const [key, cls] of Object.entries(byStore)) assert.equal(VENDOR_PROFILES[key].desc, srcDesc(cls), key);
  });

  it('eating and drinking say item.js buildVerbMessage\'s line', () => {
    assert.equal(getItemUseInfo('apple').message, 'You ate an Apple.');
    assert.equal(getItemUseInfo('milk_butterfly').message, 'You drank a Butterfly Milk.');
    assert.equal(getItemUseInfo('orange_juice').message, 'You drank an Orange Juice.');
    assert.equal(getItemUseInfo('flour').verb, 'Eat');
    registerItemUse('g318_test_onion', { kind: 'food', energy: 3 }, { label: 'Onion Test' });
    assert.equal(getItemUseInfo('g318_test_onion').message, 'You ate an Onion Test.');
  });

  it('buying and selling say the store\'s lines (inc_stores.js 179, 378)', () => {
    const offers = [{ classTsid: 'cherry', label: 'Cherry', buyPrice: 3, sellPrice: 2 }, { classTsid: 'apple', label: 'Apple', buyPrice: 5, sellPrice: 3 }];
    const pc = { currants: 100 };
    const inv = createInventory({});
    assert.equal(vendorBuy(pc, inv, offers, 'apple', 1).msgs[0], 'You bought an Apple.');
    assert.equal(vendorBuy(pc, inv, offers, 'cherry', 3).msgs[0], 'You bought 3 Cherries.');
    assert.equal(vendorBuy({ currants: 0 }, inv, offers, 'apple', 1).msgs[0], "Sorry, you can't afford that.");
    assert.equal(vendorBuy(pc, inv, offers, 'nothing_here', 1).msgs[0], 'This store no longer sells that item.');
    assert.match(vendorSell(pc, inv, offers, 'cherry', 3).msgs[0], /^You sold 3 Cherries for \d+ currants\.$/);
    assert.equal(vendorSell(pc, inv, offers, 'cherry', 5).msgs[0], "Sorry, you don't have as much as you tried to sell.");
  });

  it('a full stomach refuses with include/food.js\'s line', () => {
    const state = createFoodState({ foodToday: 1e6 });
    const r = canEatFood(state, { energy: 10 }, 100);
    assert.equal(r.ok, false);
    assert.equal(r.reason, "You can't eat anymore food today.");
  });

  it('the invented wording is gone, and our own lines never say Glitch', () => {
    const all = ['game.js', 'content.js', 'js/inventory.js', 'js/vendor.js', 'js/food.js', 'js/rook-mp.js', 'js/follow-mp.js', 'js/profiles.js',
      'js/quest-rooms/juju-camp.js', 'js/quest-rooms/penalty.js', 'js/features/foxes-feature.js'].map(game).join('\n');
    for (const old of ['A charming blockhead', 'A remarkably present little Dust Bunny', 'Famed explorer', 'One of Grandma’s grandsons',
      'He says he is innocent', 'Guardian of the Fox Preserve', 'Spin to the next letter', 'Round and round it goes',
      'A Spinning Wheel appeared!', 'Questionable ethics', 'Squeezed from a willing chicken', 'Need ${cost} currants',
      'working Glitch', 'Glitches too busy', 'More Glitches arrive', "'That Glitch'", 'your Glitch,', "You're stuffed!"]) {
      assert.ok(!all.includes(old), old);
    }
  });
});
