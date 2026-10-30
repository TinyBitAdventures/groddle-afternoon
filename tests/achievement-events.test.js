/**
 * Original GSJS achievement event routing and gameplay-video badge acceptance.
 * Run: node --test tests/achievement-events.test.js
 */
import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  achievementCounter,
  achievementConditionLabel,
  worldVerbAchievementCounter,
  worldVerbAchievementCounters,
  makingToolAchievementCounter,
  createAchievementState,
  seedAchievementNearCompletion,
  applyAchievementProgress,
  getAchievementProgress,
  makingOutputAchievementCounters,
  consumeAchievementCounters,
  resetAchievementCounter,
  purchaseAchievementUpdates,
} from '../public/js/achievements.js?v=g403-1';
import { createResourceNode, harvestResourceNode } from '../public/js/resource-nodes.js?v=g414-1';
import { createPlot, growTree, tickPlot } from '../public/js/patches.js?v=g414-1';
import { slothsChewing } from '../public/js/features/resource-nodes-feature.js?v=g463-2';
import { supplyFeature } from '../public/js/features/supply-feature.js?v=g443-1';
import { createToolConditionState } from '../public/js/tools.js?v=woodcutting-test-8';
import { loadContentCatalogsFromDir } from '../public/js/content-catalogs.js?v=g403-1';
import { normalizeAchievementSnapshot } from '../public/js/player-save.js?v=g424-1';

const here = dirname(fileURLToPath(import.meta.url));
const publicRoot = join(here, '../public');

before(async () => {
  await loadContentCatalogsFromDir(join(publicRoot, 'assets/content'));
});

describe('canonical GSJS achievement events', () => {
  it('turns mined condition ids into player-facing labels', () => {
    assert.equal(
      achievementConditionLabel({
        name: 'musicblock_d_green_01',
        desc: 'musicblock_d_green_01',
      }),
      'Musicblock DG-1'
    );
    assert.equal(
      achievementConditionLabel({ name: 'trant_bubble', desc: 'trant_bubble' }),
      'Bubble'
    );
    assert.equal(
      achievementConditionLabel({ name: 'awesome_pot', desc: 'awesome_pot' }, 'Awesome Pot'),
      'Awesome Pot'
    );
  });

  it('routes animal, trant-care, and Making verbs to exact group:label counters', () => {
    assert.equal(achievementCounter('npc_piggy', 'pet'), 'npc_piggy:pet');
    assert.equal(worldVerbAchievementCounter('npc_piggy', 'pet'), 'npc_piggy:pet');
    assert.equal(worldVerbAchievementCounter('npc_piggy', 'nibble'), 'npc_piggy:nibble');
    assert.equal(worldVerbAchievementCounter('npc_butterfly', 'massage'), 'npc_butterfly:massage');
    assert.equal(worldVerbAchievementCounter('trant_bean', 'pet'), 'trants_petted:trant_bean');
    assert.equal(worldVerbAchievementCounter('trant_bean', 'water'), 'trants_watered:trant_bean');
    assert.equal(worldVerbAchievementCounter('trant_bean', 'harvest'), 'trants_harvested:trant_bean');
    assert.deepEqual(
      worldVerbAchievementCounters('trant_bean', 'harvest', {
        fruitClass: 'bean_plain',
        baseAmount: 12,
        superAmount: 36,
      }),
      [
        { counter: 'trants_harvested:trant_bean', amount: 1 },
        { counter: 'trants_fruit_harvested:bean_plain', amount: 12 },
      ]
    );
    assert.equal(makingToolAchievementCounter('fruit_changing_machine'), 'making_tool:fruit_changing_machine');
  });

  it('unlocks all three badge moments shown in the gameplay video on the matching final action', () => {
    const cases = [
      ['betterthanlousy_douser', 'trants_watered:trant_bean', 'grendaline', 300, 40],
      ['notquitepro_bean_tree_fondler', 'trants_petted:trant_bean', 'grendaline', 300, 40],
      ['novice_fruit_metamorphosizer', 'making_tool:fruit_changing_machine', 'spriggan', 200, 25],
    ];
    for (const [id, counter, giant, xp, favor] of cases) {
      const state = createAchievementState();
      const pc = { imagination: 0, xp: 0, giantFavor: {} };
      const seeded = seedAchievementNearCompletion(state, id, 1);
      assert.equal(seeded.ok, true, id);
      const updates = applyAchievementProgress(state, counter, 1, pc);
      assert.ok(state.unlocked.includes(id), id);
      assert.equal(updates.find((row) => row.classTsid === id)?.unlocked, true, id);
      assert.equal(pc.xp, xp, id);
      assert.equal(pc.imagination, xp, id);
      assert.equal(pc.giantFavor[giant], favor, id);
    }
  });

  it('keeps progression tiered and persists partial and unlocked badge state', () => {
    const state = createAchievementState();
    seedAchievementNearCompletion(state, 'pork_fondler', 2);
    applyAchievementProgress(state, 'npc_piggy:pet', 1, { xp: 0, imagination: 0 });
    assert.equal(state.unlocked.includes('pork_fondler'), false);
    const partial = normalizeAchievementSnapshot(state);
    assert.equal(partial.progress.pork_fondler.progress.pet, 10);
    applyAchievementProgress(state, 'npc_piggy:pet', 1, { xp: 0, imagination: 0 });
    const unlocked = normalizeAchievementSnapshot(state);
    assert.ok(unlocked.unlocked.includes('pork_fondler'));
    assert.equal(unlocked.progress.pork_fondler, undefined);
  });

  it('unlocks fruit-count badges from the base yield, excluding super bonus fruit', () => {
    const state = createAchievementState();
    const pc = { imagination: 0, xp: 0, giantFavor: {} };
    seedAchievementNearCompletion(state, 'entrylevel_fruit_tree_harvester', 3);
    const events = worldVerbAchievementCounters('trant_fruit', 'harvest', {
      fruitClass: 'cherry',
      baseAmount: 3,
      superAmount: 9,
    });
    for (const event of events) {
      applyAchievementProgress(state, event.counter, event.amount, pc);
    }
    assert.ok(state.unlocked.includes('entrylevel_fruit_tree_harvester'));
    assert.equal(pc.xp, 100);
    assert.equal(pc.giantFavor.spriggan, 15);
  });
});

describe('video badge client integration', () => {
  it('ships original 180px badge art for the three recorded award screens', () => {
    const iconMap = JSON.parse(readFileSync(join(publicRoot, 'assets/content/badge-icons.json'), 'utf8'));
    for (const id of [
      'betterthanlousy_douser',
      'notquitepro_bean_tree_fondler',
      'novice_fruit_metamorphosizer',
      'pork_fondler',
    ]) {
      const relative = iconMap[id];
      assert.ok(relative, `${id} mapped`);
      const path = join(publicRoot, relative);
      assert.ok(existsSync(path), `${id} file`);
      const png = readFileSync(path);
      assert.equal(png.readUInt32BE(16), 180, `${id} width`);
      assert.equal(png.readUInt32BE(20), 180, `${id} height`);
    }
  });

  it('uses recovered official art for the visible musicblock catalog and an honest neutral fallback', () => {
    const iconMap = JSON.parse(readFileSync(join(publicRoot, 'assets/content/badge-icons.json'), 'utf8'));
    assert.ok(Object.keys(iconMap).length >= 75, 'substantial recovered badge set');
    for (const id of [
      'collection_musicblocks_bb',
      'collection_musicblocks_db',
      'collection_musicblocks_dg',
      'collection_musicblocks_dr',
      'collection_musicblocks_xs',
      'novice_precipitator',
    ]) {
      const relative = iconMap[id];
      assert.ok(relative, `${id} mapped`);
      const png = readFileSync(join(publicRoot, relative));
      assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10], `${id} PNG`);
      assert.ok([60, 180].includes(png.readUInt32BE(16)), `${id} source width`);
      assert.equal(png.readUInt32BE(16), png.readUInt32BE(20), `${id} square`);
    }

    const game = readFileSync(join(publicRoot, 'game.js'), 'utf8');
    const style = readFileSync(join(publicRoot, 'style.css'), 'utf8');
    assert.match(game, /achievementBadgeFallback/);
    assert.match(game, /neutral-unrecovered/);
    assert.doesNotMatch(
      game.slice(game.indexOf('function renderAchievePanel'), game.indexOf('function openAchievePanel')),
      /icons\/apple\.png/
    );
    assert.match(style, /\.badge-card \.badge-art-missing/);
  });

  it('ships a searchable, filtered, incrementally rendered full badge catalog', () => {
    const game = readFileSync(join(publicRoot, 'game.js'), 'utf8');
    const html = readFileSync(join(publicRoot, 'play/index.html'), 'utf8');
    const style = readFileSync(join(publicRoot, 'style.css'), 'utf8');
    assert.match(html, /id="achieve-search"/);
    assert.match(html, /data-achieve-status="progress"/);
    assert.match(html, /id="achieve-category"/);
    assert.match(game, /browseAchievementLog\(achieveState, achievementBrowser\)/);
    assert.match(game, /ACHIEVEMENT_PAGE_SIZE\s*=\s*40/);
    assert.match(game, /badge-load-more/);
    assert.match(game, /Secret Achievement/);
    assert.match(game, /badgeRendered/);
    assert.match(game, /function resetAchievementBrowserPage/);
    assert.match(game, /scroller\.scrollTop\s*=\s*0/);
    assert.match(style, /\.badge-browser-tools/);
    assert.match(style, /\.badge-status-filters button\.active/);
  });

  it('wires canonical events, original status prose, Giant rewards, QA state, and cache busting', () => {
    const game = readFileSync(join(publicRoot, 'game.js'), 'utf8');
    const html = readFileSync(join(publicRoot, 'play/index.html'), 'utf8');
    assert.match(game, /worldVerbAchievementCounters\(target\.classId, verbId, result\)/);
    assert.match(game, /makingToolAchievementCounter\(record\.recipe\.tool\)/);
    // G225: the card prints desc; the rock's bubble says status_text (AchievementView.as 347-349, 552).
    assert.match(game, /body: update\.def\.desc \|\| update\.def\.description \|\| '',\n\s+status: update\.def\.statusText \|\| update\.def\.status_text \|\| '',/);
    assert.match(game, /rewards\.favor\?\.points/);
    assert.match(game, /achievementdemo/);
    assert.match(game, /achievementUnlocked/);
    assert.match(game, /badge-icons\.json\?v=catalog-art-3/);
    assert.match(game, /screen-fx\.js\?v=g470-1/);
    assert.match(html, /game\.js\?v=official-ecology-1/);
    assert.match(html, /badges=catalog-art-3/);
    assert.match(game, /muted: loadMutedPreference\(\)/);
  });
});

/**
 * G116-G119 (inventory 84129480): counters the remake never incremented and
 * badges GSJS grants outright. Each case runs the remake's action, checks the
 * counter moved, then that the badge unlocks exactly at its threshold.
 */
describe('GSJS counter groups wired for G116-G119', () => {
  const pc = () => ({ imagination: 0, xp: 0, currants: 0, giantFavor: {} });
  const apply = (state, rows, who = pc()) => rows.flatMap((row) => applyAchievementProgress(state, row.counter, row.amount, who));
  const current = (state, id) => getAchievementProgress(state, id).conditions[0].current;

  /** One action's rows bump the badge from 0, and the same rows finish it from `gap` short. */
  function assertEarns(id, rows, gap) {
    const fresh = createAchievementState();
    apply(fresh, rows);
    assert.equal(fresh.unlocked.includes(id), false, `${id} not on the first action`);
    assert.equal(current(fresh, id), gap, `${id} counted ${gap}`);
    const near = createAchievementState();
    seedAchievementNearCompletion(near, id, gap + 1);
    apply(near, rows);
    assert.equal(near.unlocked.includes(id), false, `${id} one short`);
    apply(near, rows);
    assert.ok(near.unlocked.includes(id), `${id} at its threshold`);
  }

  it('elements_refined: the Grinder counts every element it makes (ore_grinder.js:612)', () => {
    const beryl = [{ classTsid: 'element_red', qty: 20 }, { classTsid: 'element_green', qty: 2 }, { classTsid: 'element_blue', qty: 4 }];
    const rows = makingOutputAchievementCounters('ore_grinder', beryl);
    assert.deepEqual(rows.map((r) => `${r.counter}=${r.amount}`), ['elements_refined:element_red=20', 'elements_refined:element_green=2', 'elements_refined:element_blue=4']);
    assert.deepEqual(makingOutputAchievementCounters('grand_ol_grinder', beryl), rows);
    assertEarns('minor_refiner_red_class', rows.slice(0, 1), 20);
    assertEarns('minor_refiner_shiny_class', makingOutputAchievementCounters('ore_grinder', [{ classTsid: 'element_shiny', qty: 6 }]), 6);
  });

  it('smelter, crystallizer and construction tool outputs (smelter.js:565, item.js:738, construction_tool.js:314)', () => {
    const smelt = makingOutputAchievementCounters('smelter', [{ classTsid: 'plain_metal', qty: 1 }]);
    assert.deepEqual(smelt, [{ counter: 'smelter:ingots_created', amount: 1 }, { counter: 'smelter:metal_smelted', amount: 5 }]);
    assertEarns('crucible_jockey', smelt, 1);
    assertEarns('plain_crystallizer', makingOutputAchievementCounters('crystallizer', [{ classTsid: 'plain_crystal', qty: 1 }]), 1);
    const lamp = makingOutputAchievementCounters('construction_tool', [{ classTsid: 'furniture_floorlamp', qty: 1 }]);
    assert.deepEqual(lamp.map((r) => r.counter), ['furniture_items:made', 'furniture_lamps:made']);
    assertEarns('novice_furniturer', lamp, 1);
    assertEarns('into_the_light', lamp, 1);
    assertEarns('captain_tchotchke', makingOutputAchievementCounters('construction_tool', [{ classTsid: 'furniture_roomdeco', qty: 1 }]), 1);
    assertEarns('corporate_cabinetmaker', makingOutputAchievementCounters('construction_tool', [{ classTsid: 'bag_furniture_cabinet', qty: 1 }]), 1);
    assert.deepEqual(makingOutputAchievementCounters('frying_pan', [{ classTsid: 'plain_metal', qty: 1 }]), []);
  });

  it('items_eaten, meals_eaten and items_drank (food.js:194-201, drink.js:123-125)', () => {
    const meat = consumeAchievementCounters('meat', { kind: 'food', baseCost: 10 });
    // base_cost x count must be over 10 to count as a meal.
    assert.deepEqual(meat, [{ counter: 'items_eaten:meat', amount: 1 }]);
    assertEarns('protein_time', meat, 1);
    assertEarns('eggy_wegger', consumeAchievementCounters('egg_plain', { kind: 'food', baseCost: 5 }), 1);
    assert.deepEqual(consumeAchievementCounters('abbasid_ribs', { kind: 'food', baseCost: 201 }).map((r) => r.counter), ['meals_eaten:abbasid_ribs', 'items_eaten:abbasid_ribs']);
    const hooch = consumeAchievementCounters('hooch', { kind: 'drink', tags: ['drink', 'alcohol'] });
    assert.deepEqual(hooch, [{ counter: 'items_drank:hooch', amount: 1 }, { counter: 'items_drank:alcohol', amount: 1 }]);
    assertEarns('promising_lush', hooch, 1);
    assertEarns('bubble_tea_aficionado', consumeAchievementCounters('bubble_tea', { kind: 'drink', tags: ['drink'] }), 1);
  });

  it('chicken:squoze and completed_harvest:wood_tree ride the world verbs', () => {
    assert.deepEqual(worldVerbAchievementCounters('npc_chicken', 'squeeze').map((r) => r.counter), ['npc_chicken:squeeze', 'chicken:squoze']);
    assertEarns('hen_hugger', worldVerbAchievementCounters('npc_chicken', 'squeeze'), 1);
    assert.deepEqual(worldVerbAchievementCounters('wood_tree', 'harvest'), [{ counter: 'completed_harvest:wood_tree', amount: 1 }]);
    assertEarns('wood_wacker', worldVerbAchievementCounters('wood_tree', 'harvest'), 1);
  });

  it('jellisac:scoop, mortar_barnacle:scrape and paper_tree:harvest (item.js:738 notifyVerb)', () => {
    const ctx = { now: 1_800_000_000_000, dayKey: '2026-01-01', rng: () => 0.5 };
    const scoop = harvestResourceNode(createResourceNode('jellisac'), {}, { energy: 40 }, ctx);
    assert.equal(scoop.ok, true);
    assertEarns('slime_harvester', scoop.achievementCounters, 1);
    const scrape = harvestResourceNode(createResourceNode('mortar_barnacle'), { scraper: 1 }, { energy: 50 }, { ...ctx, toolState: createToolConditionState() });
    assert.equal(scrape.ok, true, scrape.message);
    assertEarns('amateur_decrustifier', scrape.achievementCounters, 1);
    const paper = harvestResourceNode(createResourceNode('paper_tree'), {}, { energy: 50 }, { ...ctx, verbId: 'harvest' });
    assert.equal(paper.ok, true, paper.message);
    assertEarns('paper_plucker', paper.achievementCounters, 1);
  });

  it('wood_tree:maxed when care brings a Wood Tree to maturity 6 (wood_tree.js:1012)', () => {
    const plot = createPlot('patch');
    plot.stage = 'seedling';
    plot.seedling = { trantClass: 'wood_tree', petted: 3, minAt: 0, maxAt: 1e12, thirdPetAt: 0, growLevel: 0 };
    const tree = growTree(plot, 0);
    tree.state.maturity = 5;
    const events = [];
    for (let day = 0; day < 6 && tree.state.maturity < 6; day += 1) {
      tree.state.petted = true;
      tree.state.watered = true;
      events.push(...tickPlot(plot, 10).events);
      tree.state.petted = false;
      tree.state.watered = false;
      events.push(...tickPlot(plot, 10).events);
    }
    assert.equal(tree.state.maturity, 6);
    assert.equal(events.filter((e) => e === 'maxed').length, 1);
    assertEarns('wood_abettor', [{ counter: 'wood_tree:maxed', amount: 1 }], 1);
  });

  it('coin_count:days_maxed is a streak: a short day starts it over (player.js:987-991)', () => {
    const state = createAchievementState();
    seedAchievementNearCompletion(state, 'numismatizer_leprechaun_class', 1);
    assert.equal(resetAchievementCounter(state, 'coin_count:days_maxed') >= 1, true);
    assert.equal(current(state, 'numismatizer_leprechaun_class'), 0);
    for (let day = 1; day <= 4; day += 1) apply(state, [{ counter: 'coin_count:days_maxed', amount: 1 }]);
    assert.equal(state.unlocked.includes('numismatizer_leprechaun_class'), false);
    apply(state, [{ counter: 'coin_count:days_maxed', amount: 1 }]);
    assert.ok(state.unlocked.includes('numismatizer_leprechaun_class'));
  });

  it('movement:jumped counts every jump (main.js:1612-1628)', () => {
    assertEarns('bounder_untenured', [{ counter: 'movement:jumped', amount: 1 }], 1);
  });

  it('still:collected_in_pol only in your own home (still.js:454-455)', () => {
    supplyFeature._reset();
    const counted = [];
    const engine = (inHome) => ({
      inv: { still: 1 },
      pc: { energy: 100 },
      toolState: createToolConditionState(),
      learnedSkills: ['distilling_1'],
      param: () => null,
      setData: () => {},
      homeContext: () => ({ inHome }),
      achievement: (counter, amount) => counted.push(`${counter}=${amount}`),
    });
    supplyFeature.restore({ still: { hopper: 0, hooch: 2 } });
    supplyFeature.runPackVerb('still', 'collect', engine(false));
    assert.deepEqual(counted, []);
    supplyFeature.restore({ still: { hopper: 0, hooch: 3 } });
    supplyFeature.runPackVerb('still', 'collect', engine(true));
    assert.deepEqual(counted, ['still:collected_in_pol=3']);
    assertEarns('moonshiner', [{ counter: 'still:collected_in_pol', amount: 3 }], 3);
  });
});

describe('G117 badges GSJS grants outright', () => {
  it('Big Spender, El Big Spenderino, Moneybags Magoo on one big vendor purchase (inc_stores.js:225-235)', () => {
    const state = createAchievementState();
    assert.deepEqual(purchaseAchievementUpdates(state, 1008), []);
    assert.deepEqual(purchaseAchievementUpdates(state, 1009).map((u) => u.classTsid), ['big_spender']);
    assert.deepEqual(purchaseAchievementUpdates(state, 5003).map((u) => u.classTsid), ['el_big_spenderino', 'moneybags_magoo']);
    assert.deepEqual(purchaseAchievementUpdates(state, 9999), []);
  });

  it('Cheesemongerer on compressing Butterfly Butter (butterfly_butter.js:211)', () => {
    supplyFeature._reset();
    const granted = [];
    const engine = {
      inv: { butterfly_butter: 1 },
      pc: { energy: 100 },
      learnedSkills: [],
      param: () => null,
      setData: () => {},
      grantAchievement: (id) => granted.push(id),
    };
    supplyFeature.runPackVerb('butterfly_butter', 'compress:1', engine);
    assert.equal(engine.inv.cheese, 1);
    assert.deepEqual(granted, ['cheesemongerer']);
  });

  it('Circle Crunch counts the Sloths still chewing your rods (npc_sloth.js:290-301)', () => {
    const now = 1000;
    const sloth = (busyUntil) => ({ classTsid: 'npc_sloth', node: { busyUntil } });
    assert.equal(slothsChewing([sloth(2000), sloth(3000), sloth(500), { classTsid: 'jellisac', node: { busyUntil: 9e9 } }], now), 2);
    assert.equal(slothsChewing([sloth(2000), sloth(3000), sloth(1001)], now), 3);
    const src = readFileSync(join(publicRoot, 'js/features/resource-nodes-feature.js'), 'utf8');
    assert.match(src, /slothsChewing\(entities, Date\.now\(\)\) >= 3\) engine\.grantAchievement\?\.\('circle_crunch'\)/);
  });

  it('game.js grants First Eleven Skills, Down to the Wire and wires every new counter', () => {
    const game = readFileSync(join(publicRoot, 'game.js'), 'utf8');
    assert.match(game, /skillsLearnedCount\(\) >= 11\) engine\.grantAchievement\('first_eleven_skills'\)/);
    assert.match(game, /result\.participant === 'Ur'\) engine\.grantAchievement\('down_to_the_wire'\)/);
    assert.match(game, /purchaseAchievementUpdates\(achieveState, r\.cost, pc\)/);
    assert.match(game, /makingOutputAchievementCounters\(record\.recipe\.tool, record\.recipe\.outputs, spin\)/);
    assert.match(game, /consumeAchievementCounters\(classTsid, \{ kind: ordinaryInfo\.kind/);
    assert.match(game, /'coin_count:days_maxed', 1, pc[\s\S]{0,80}resetAchievementCounter\(achieveState, 'coin_count:days_maxed'\)/);
    assert.equal((game.match(/countPlayerJump\(\);/g) || []).length, 2);
    assert.match(game, /achievements\.js\?v=g403-1/);
  });
});
