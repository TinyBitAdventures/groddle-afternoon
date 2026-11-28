// G892: the skill-package words other players see in a bubble over a Glitch at work
// (public/js/skill-bubbles.js, features/skill-bubbles-feature.js), held to the GSJS calls they
// cite, the wire word to the server's word rule, and Butterfly care to no drawn stand-ins.
// G923 (#460): every GSJS skill package is accounted for, and every tool one the others see
// draws that tool's own tool_animation.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  BUBBLE_ITEMS,
  bubbleItemIcon,
  bubbleItemPlace,
  GSJS_SKILL_PACKAGES,
  SKILL_BUBBLE,
  SKILL_BUBBLES,
  SKILL_BUBBLE_OFF,
  SKILL_TOOL_PACKAGES,
  bubbleItemSheet,
  itemBubbleWord,
  parseSkillBubbleWord,
  skillBubbleFor,
  skillBubbleWord,
  skillToolClass,
  skillToolFor,
} from '../public/js/skill-bubbles.js?v=e96957c2';
import { SKILL_BUBBLE_WORD } from '../public/js/realtime-client.js?v=7e402304';
import { onSkillBubble, skillBubblesFeature } from '../public/js/features/skill-bubbles-feature.js?v=b5cf5cd2';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const gsjs = join(root, '..', 'glitch-GameServerJS');
const hasGsjs = existsSync(join(gsjs, 'players/inc_skill_packages.js'));
const manifest = JSON.parse(readFileSync(join(root, 'public/assets/sprites/overlays/overlays-more.json'), 'utf8'));

describe('skill-bubbles: which verb shows which word', () => {
  it('maps the verbs GSJS runs with an overlay_id', () => {
    assert.equal(skillBubbleFor('npc_butterfly', 'milk'), 'butterfly_milk');
    assert.equal(skillBubbleFor('npc_butterfly', 'massage'), 'butterfly_massage');
    assert.equal(skillBubbleFor('npc_piggy', 'pet'), 'pig_pet');
    assert.equal(skillBubbleFor('npc_piggy', 'nibble'), 'pig_nibble');
    assert.equal(skillBubbleFor('npc_chicken', 'squeeze'), 'chicken_squeeze');
    assert.equal(skillBubbleFor('trant_bean', 'pet'), 'trant_pet');
    assert.equal(skillBubbleFor('wood_tree', 'pet'), 'trant_pet');
    assert.equal(skillBubbleFor('trant_fruit', 'harvest'), 'trant_harvest');
    assert.equal(skillBubbleFor('npc_piggy', 'rook_revive'), 'rooked_revive');
    assert.equal(skillBubbleFor('jellisac', 'scoop'), 'jellisac_scoop');
    // A tool package (wood_tree harvest plays the hatchet) and plain verbs show nothing.
    assert.equal(skillBubbleFor('wood_tree', 'harvest'), null);
    assert.equal(skillBubbleFor('npc_piggy', 'feed:cherry'), null);
    assert.equal(skillBubbleFor('rock_beryl_1', 'mine'), null);
  });

  it('every word is built, and every cited call names its overlay_id', { skip: !hasGsjs }, () => {
    const sp = readFileSync(join(gsjs, 'players/inc_skill_packages.js'), 'utf8');
    // The bubble to the others: 40 x 40 (or bubble_width), delta_y -110.
    assert.match(sp, /delta_y: args\.pc_delta_y \? args\.pc_delta_y : -110,\s*bubble: true,\s*width: args\.bubble_width \? args\.bubble_width : 40,\s*height: 40/);
    assert.equal(SKILL_BUBBLE.wh, 40);
    assert.equal(SKILL_BUBBLE.dy, -110);
    for (const [key, row] of Object.entries(SKILL_BUBBLES)) {
      const art = row.overlay || key;
      assert.ok(manifest[art], `${art} built`);
      // Every call cited (G923: each one, not only the first; a bare file name is in items/).
      for (const part of row.src.split(', ')) {
        const [name, line] = part.split(' ');
        const file = name.includes('/') ? name : `items/${name}`;
        const text = readFileSync(join(gsjs, file), 'utf8').split('\n');
        // An overlay_id on the call, or (G923 part C) the announcement sent to the others naming the overlay just above it.
        const near = text.slice(Math.max(0, Number(line) - 12), Number(line)).join('\n');
        assert.match(near, new RegExp(`overlay_id\\s*[:=]\\s*'${art}'|overlay_key_to_url\\('${art}'\\)`), part);
      }
    }
    assert.match(readFileSync(join(gsjs, 'items/include/rook.js'), 'utf8'), /overlay_id:'rooked_revive'[^\n]*bubble_width: 75/);
    assert.equal(SKILL_BUBBLES.rooked_revive.wh, 75);
  });
});

describe('skill-bubbles: every skill package (G923)', () => {
  it('lists every package in catalog_skill_packages.js, and only those', { skip: !hasGsjs }, () => {
    const src = readFileSync(join(gsjs, 'items/catalog_skill_packages.js'), 'utf8');
    const ids = [...src.matchAll(/^\t"([a-z_0-9]+)" : \{/gm)].map((m) => m[1]).sort();
    assert.equal(ids.length, 64);
    assert.deepEqual(Object.keys(GSJS_SKILL_PACKAGES).sort(), ids);
  });

  it('every shared package has its row, and every row its art', () => {
    const toolPkgs = Object.values(SKILL_TOOL_PACKAGES).flatMap((r) => r.pkgs);
    for (const [pkg, how] of Object.entries(GSJS_SKILL_PACKAGES)) {
      if (how === 'tool') assert.ok(toolPkgs.includes(pkg), `${pkg} has a tool row`);
      else assert.ok(!toolPkgs.includes(pkg), `${pkg} is not a tool row`);
      if (how !== 'overlay' && how !== 'tool' && how !== 'making') assert.match(how, /^none: /, pkg);
    }
    for (const [key, row] of Object.entries(SKILL_TOOL_PACKAGES)) {
      assert.ok(Object.keys(row.on).length > 0, key);
      for (const tool of row.tools) {
        assert.ok(BUBBLE_ITEMS.includes(tool), `${key}: ${tool} has a wire code`);
        const def = bubbleItemSheet(tool);
        assert.ok(def, `${key}: ${tool} has a tool_animation`);
        assert.ok(existsSync(join(root, 'public', def.path)), def.path);
      }
    }
    for (const tool of BUBBLE_ITEMS) assert.ok(bubbleItemSheet(tool) || bubbleItemIcon(tool), `${tool} draws`);
    // The making packages' tools (smelting, spinning, crystallizing, refining): the Make panel's bubble.
    for (const tool of ['smelter', 'spindle', 'splendid_spindle', 'crystallizer', 'ore_grinder', 'grand_ol_grinder']) assert.ok(BUBBLE_ITEMS.includes(tool), tool);
  });

  it('each tool row cites a runSkillPackage call with a tool_item', { skip: !hasGsjs }, () => {
    for (const [key, row] of Object.entries(SKILL_TOOL_PACKAGES)) {
      const [file, line] = row.src.split(' ');
      const text = readFileSync(join(gsjs, file), 'utf8').split('\n');
      const [from, to] = line.replace(',', '').split('-').map(Number);
      const lines = text.slice(from - 1, to || from).join('\n');
      assert.match(lines, /runSkillPackage\(/, row.src);
      assert.match(lines, /tool_item: |args\.tool_item|package_name/, row.src);
    }
  });

  it('maps the remake verbs to their package and tool (#460: mining, digging, peat)', () => {
    assert.equal(skillToolFor('rock_beryl_1', 'mine'), 'mining');
    assert.equal(skillToolFor('rock_metal_1', 'mine'), 'mining');
    assert.equal(skillToolFor('dirt_pile', 'dig'), 'dig_dirt_pile');
    assert.equal(skillToolFor('peat_2', 'harvest'), 'peat_harvest');
    assert.equal(skillToolFor('mortar_barnacle', 'scrape'), 'scraping');
    assert.equal(skillToolFor('patch', 'tend'), 'soil_appreciation');
    assert.equal(skillToolFor('trant_gas_dead', 'clear'), 'dead_trant_clearing');
    assert.equal(skillToolFor('wood_tree', 'harvest'), 'wood_tree_harvest');
    assert.equal(skillToolFor('trant_bean', 'water'), 'watering');
    assert.equal(skillToolFor('garden_new', 'water'), null, 'a garden sends its own bubble (shared-gardens)');
    assert.equal(skillToolFor('npc_piggy', 'pet'), null);
    assert.equal(skillBubbleFor('paper_tree', 'pet'), 'trant_pet');
    // The tool the player works with: a working Fancy Pick first, an Irrigator first, else what they own.
    assert.equal(skillToolClass('mining', { pick: 1 }), 'pick');
    assert.equal(skillToolClass('mining', { pick: 1, fancy_pick: 1 }), 'fancy_pick');
    assert.equal(skillToolClass('watering', { watering_can: 1, irrigator_9000: 1 }), 'irrigator_9000');
    assert.equal(skillToolClass('dig_dirt_pile', { shovel: 1 }), 'shovel');
    assert.equal(skillToolClass('soil_appreciation', {}), 'hoe');
  });
});

describe('skill-bubbles: what else Glitch showed the street (G923 part C)', () => {
  it('every item another client can be told about draws: its own sheet, or a musicblock\'s icon', () => {
    for (const cls of BUBBLE_ITEMS) {
      const def = bubbleItemSheet(cls);
      const icon = bubbleItemIcon(cls);
      assert.ok(def || icon, `${cls} draws`);
      assert.ok(existsSync(join(root, 'public', def ? def.path : icon)), cls);
    }
    for (const cls of ['potion_rook_balm', 'potion_garden_water', 'fertilidust', 'sneezing_powder', 'wine_of_the_dead', 'musicblock_d_red_01', 'tinkertool']) assert.ok(BUBBLE_ITEMS.includes(cls), cls);
    assert.ok(BUBBLE_ITEMS.length <= 26 * 26);
  });

  it('stands each kind where GSJS put it: tools 110 px up, potions 135, powders and musicblocks 120, all 40 px', { skip: !hasGsjs }, () => {
    assert.deepEqual(bubbleItemPlace('pick'), { wh: 40, dy: -110 });
    assert.deepEqual(bubbleItemPlace('potion_charades'), { wh: 40, dy: -135 });
    assert.deepEqual(bubbleItemPlace('fertilidust'), { wh: 40, dy: -120 });
    assert.deepEqual(bubbleItemPlace('musicblock_x_shiny_02'), { wh: 40, dy: -120 });
    const at = (file, line) => readFileSync(join(gsjs, file), 'utf8').split('\n').slice(line - 1, line + 14).join('\n');
    assert.match(at('items/potion_charades.js', 399), /delta_y: -135,\s*bubble: true,\s*width: 40,\s*height: 40/);
    assert.match(at('items/fertilidust.js', 473), /delta_y: -120,\s*bubble: true,\s*width: 40,\s*height: 40/);
    assert.match(at('items/musicblock_d_red_01.js', 153), /delta_y: -120,\s*bubble: true,\s*width: 40,\s*height: 40/);
    assert.match(at('items/tinkertool.js', 489), /item_class: this\.class_tsid,\s*state: 'tool_animation'/);
  });

  it('the actor\'s own drawing asks for the bubble: bottles, shakers, musicblocks, repairs, the Wine pour, the crack', () => {
    const read = (f) => readFileSync(join(root, 'public', f), 'utf8');
    assert.match(read('js/potion-bottle-fx.js'), /engine\.query\?\.\('itemBubbleStarted', classTsid, durationMs, engine\)/);
    assert.match(read('js/features/powders-feature.js'), /engine\.query\?\.\('itemBubbleStarted', classTsid, POWDER_SHAKE\.ms, engine\)/);
    assert.match(read('js/features/homes-feature.js'), /'itemBubbleStarted', 'wine_of_the_dead', WOTD_TOOL\.durationMs, engine, \{ flipped: ap\.flipped \}/);
    assert.match(read('js/features/artifacts-feature.js'), /'overlayBubbleStarted', 'petrified_open', use\.durationMs, engine/);
    const game = read('game.js');
    assert.match(game, /features\.query\('itemBubbleStarted', def\.classTsid, def\.durationMs, engine\)/);
    assert.match(game, /features\.query\('itemBubbleStarted', 'tinkertool', plan\.durationMs, engine\)/);
    assert.equal(skillBubbleFor('paper_tree', 'harvest'), 'trant_harvest');
  });

  it('online, a pour, a shake, a crack each send their word; solo none', () => {
    const sent = [];
    const online = fakeEngine('multiplayer', sent);
    skillBubblesFeature.itemBubbleStarted('potion_rook_balm', 2500, online);
    skillBubblesFeature.itemBubbleStarted('fertilidust', 3000, online);
    skillBubblesFeature.itemBubbleStarted('wine_of_the_dead', 3000, online, { flipped: true });
    skillBubblesFeature.overlayBubbleStarted('petrified_open', 2000, online);
    skillBubblesFeature.itemBubbleStarted('apple', 2000, online);
    assert.deepEqual(sent, [itemBubbleWord('potion_rook_balm', 2500), itemBubbleWord('fertilidust', 3000), itemBubbleWord('wine_of_the_dead', 3000, { flipped: true }), 'sp_petrified_open_2']);
    assert.deepEqual(parseSkillBubbleWord('sp_petrified_open_2'), { key: 'petrified_open', durationMs: 2000 });
    skillBubblesFeature.itemBubbleStarted('potion_rook_balm', 2500, fakeEngine('solo', sent));
    assert.equal(sent.length, 4);
    skillBubblesFeature.onStreetClear();
  });
});

describe('skill-bubbles: the wire word', () => {
  it('item words: a two-letter code, mirrored as im, in the server and pre-G923 client rules', () => {
    for (const tool of BUBBLE_ITEMS) {
      for (const flipped of [false, true]) {
        const w = itemBubbleWord(tool, 99_000, { flipped });
        assert.match(w, /^[a-z0-9_]{1,24}$/, w);
        assert.match(w, SKILL_BUBBLE_WORD, w);
        assert.deepEqual(parseSkillBubbleWord(w), { item: tool, flipped, durationMs: 99_000 });
      }
    }
    assert.equal(itemBubbleWord('pick', 12_400), 'sp_i_aa_12');
    assert.equal(itemBubbleWord('pick', 300_000, { flipped: true }), 'sp_im_aa_99');
    assert.equal(itemBubbleWord('not_a_tool', 1000), null);
    assert.equal(parseSkillBubbleWord('sp_i_zz_3'), null, 'a code this build does not know');
    assert.deepEqual(parseSkillBubbleWord(SKILL_BUBBLE_OFF), { off: true });
    assert.match(SKILL_BUBBLE_OFF, SKILL_BUBBLE_WORD);
    // A pre-G923 client parsed sp_<key>_<s> against its nine overlays only: the new words are not among them.
    for (const w of ['sp_i_aa_3', 'sp_im_aa_3', SKILL_BUBBLE_OFF]) assert.ok(!SKILL_BUBBLES[/^sp_([a-z_]+)_\d+$/.exec(w)[1]]);
  });

  it('round-trips whole seconds and fits the server word rule (hub.go wordRe [a-z0-9_]{1,24})', () => {
    for (const key of Object.keys(SKILL_BUBBLES)) {
      const w = skillBubbleWord(key, 99_000);
      assert.match(w, /^[a-z0-9_]{1,24}$/, w);
      assert.match(w, SKILL_BUBBLE_WORD, w);
      assert.deepEqual(parseSkillBubbleWord(w), { key, durationMs: 99_000 });
    }
    assert.equal(skillBubbleWord('pig_pet', 2600), 'sp_pig_pet_3');
    assert.equal(skillBubbleWord('pig_pet', 100), 'sp_pig_pet_1');
    assert.equal(skillBubbleWord('nope', 1000), null);
    assert.equal(parseSkillBubbleWord('sp_nope_3'), null);
    assert.equal(parseSkillBubbleWord('eyeballing'), null);
    assert.equal(parseSkillBubbleWord('sp_pig_pet_0'), null);
  });
});

function fakeEngine(mode, sent, over = {}) {
  const data = {};
  return {
    mode,
    data,
    query(hook) { return hook === 'realtimeClient' ? { emote: (e) => (sent.push(e), true), on: () => () => {} } : null; },
    setData(k, v) { data[k] = String(v); },
    param: () => null,
    ...over,
  };
}

describe('skill-bubbles feature', () => {
  it('online, a timed milk sends its word for the verb\'s seconds; solo sends nothing', () => {
    const sent = [];
    const online = fakeEngine('multiplayer', sent);
    skillBubblesFeature.verbStarted({ classId: 'npc_butterfly' }, { id: 'milk', durationMs: 3000 }, online);
    assert.deepEqual(sent, ['sp_butterfly_milk_3']);
    assert.equal(online.data.skillBubbleSent, 'sp_butterfly_milk_3');
    skillBubblesFeature.verbStarted({ classId: 'npc_piggy' }, { id: 'feed:cherry', durationMs: 3000 }, online);
    assert.equal(sent.length, 1);
    const solo = fakeEngine('solo', sent);
    skillBubblesFeature.verbStarted({ classId: 'npc_piggy' }, { id: 'pet', durationMs: 2000 }, solo);
    assert.equal(sent.length, 1);
  });

  it('online, a mine sends the pick the player works with, mirrored for a rock on the left (#460)', () => {
    const sent = [];
    const online = fakeEngine('multiplayer', sent, { inv: { pick: 1 }, toolState: null, player: { x: 500, y: 0 } });
    skillBubblesFeature.verbStarted({ classId: 'rock_beryl_1', sprite: { x: 400 } }, { id: 'mine', durationMs: 12_000 }, online);
    assert.deepEqual(sent, ['sp_im_aa_12']);
    skillBubblesFeature.verbStarted({ classId: 'dirt_pile', sprite: { x: 600 } }, { id: 'dig', durationMs: 4000 }, { ...online, inv: { shovel: 1 } });
    assert.equal(sent[1], itemBubbleWord('shovel', 4000));
    // The cancel takes it down for the others; a cancel of something else does not.
    skillBubblesFeature.verbCancelled({ classId: 'rock_beryl_1' }, 'mine', online);
    assert.equal(sent.length, 2);
    const pile = { classId: 'dirt_pile', sprite: { x: 600 } };
    skillBubblesFeature.verbStarted(pile, { id: 'dig', durationMs: 4000 }, { ...online, inv: { shovel: 1 } });
    skillBubblesFeature.verbCancelled(pile, 'dig', online);
    assert.equal(sent.at(-1), SKILL_BUBBLE_OFF);
    skillBubblesFeature.onStreetClear();
  });

  it('a make sends its tool for the batch, again past 99 s, and off when stopped early', () => {
    const sent = [];
    const online = fakeEngine('multiplayer', sent);
    skillBubblesFeature.itemBubbleStarted('smelter', 150_000, online);
    assert.deepEqual(sent, [itemBubbleWord('smelter', 99_000)]);
    skillBubblesFeature.itemBubbleStopped(online);
    assert.deepEqual(sent.at(-1), SKILL_BUBBLE_OFF);
    skillBubblesFeature.itemBubbleStopped(online);
    assert.equal(sent.length, 2, 'nothing running, nothing sent');
    const game = readFileSync(join(root, 'public/game.js'), 'utf8');
    assert.match(game, /features\.query\('itemBubbleStarted', recipe\.tool,/);
    assert.match(game, /features\.query\('itemBubbleStopped', engine\)/);
  });

  it('another player\'s word draws a bubble over that player only while they are here', () => {
    const sent = [];
    let here = true;
    const engine = fakeEngine('multiplayer', sent, { query: (hook) => (hook === 'remoteAvatar' && here ? { x: 10, y: 20 } : null) });
    assert.equal(onSkillBubble(engine, { id: 4, e: 'sp_pig_pet_2' }), true);
    assert.equal(onSkillBubble(engine, { id: 4, e: 'eyeballing' }), false);
    assert.equal(onSkillBubble(engine, { id: 4, e: 'sp_im_aa_12' }), true);
    assert.equal(onSkillBubble(engine, { id: 4, e: SKILL_BUBBLE_OFF }), true);
    here = false;
    assert.equal(onSkillBubble(engine, { id: 4, e: 'sp_pig_pet_2' }), false);
  });
});

describe('Butterfly care draws no stand-ins (G892)', () => {
  it('no emoji float, burst dots or squash on milk and massage', () => {
    const game = readFileSync(join(root, 'public/game.js'), 'utf8');
    assert.ok(!game.includes('🥛'));
    const fn = game.slice(game.indexOf('function playButterflyCareAnimation'), game.indexOf('function playHatchetAnimation'));
    assert.ok(fn.length > 0 && !/burst\(|scale|floatText/.test(fn), 'the care only holds the Butterfly still');
    const husbandry = readFileSync(join(root, 'public/js/features/animal-husbandry-feature.js'), 'utf8');
    const step = husbandry.slice(husbandry.indexOf('function stepButterflyCare'), husbandry.indexOf('function setWalkPose'));
    assert.ok(!/scale|rotation/.test(step));
  });
});
