// Newxp (Gentle Island tutorial): source data, rebuilt layouts and their
// reach under the tutorial's own walk/jump physics, exits, save rules.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  CHEAP_BAG_PRICE,
  BAGS_NEEDED,
  FIRST_SKILLS,
  GENTLE_ISLAND,
  ISLAND_BOXES,
  ISLAND_STEPS,
  ISLAND_CURRANTS,
  LEAVE_FLAG_DELAY_MS,
  LINES,
  NEWXP_EXITS,
  NEWXP_LOCATIONS,
  NEWXP_UPGRADES,
  QUOIN_BENEFITS,
  STAGES,
  TRAINING2_DRINKS,
  TRAINING2_FOOD,
  UPGRADE_HANDS,
  cloudsLayout,
  inBox,
  inHitBox,
  indexTsid,
  isNewxpSceneTsid,
  islandExitOpen,
  nextStage,
  normalizeNewxpSave,
  pickNewxpExit,
  reachFor,
  reachablePlatforms,
  shouldResume,
  startNewxp,
  street4Check,
  talkPages,
  training1Layout,
  training2Layout,
  tutorialPhysics,
  vogPages,
} from '../public/js/newxp.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
const street = (tsid) => JSON.parse(readFileSync(join(ROOT, 'assets/streets', `${tsid}.json`), 'utf8'));
const GS = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'glitch-GameServerJS');

describe('newxp source data', () => {
  it('keeps the config_prod.js locations and the 115 exits', () => {
    assert.equal(NEWXP_LOCATIONS.newxp_intro, 'LIFBFC7TDJ535UL');
    assert.equal(NEWXP_LOCATIONS.newxp_training1, 'LIFBLMAVDJ53NP1');
    assert.equal(NEWXP_LOCATIONS.newxp_training2, 'LIFD0KCDEJ53L7K');
    assert.equal(NEWXP_LOCATIONS.newbie_island, 'LA952QGCH3D31E2');
    assert.equal(NEWXP_EXITS.length, 115);
    if (existsSync(join(GS, 'config_prod.js'))) {
      const src = readFileSync(join(GS, 'config_prod.js'), 'utf8');
      const block = src.slice(src.indexOf('var newxp_exits'), src.indexOf('];', src.indexOf('var newxp_exits')));
      const rows = [...block.matchAll(/tsid:\s*'(\w+)',\s*x:\s*(-?\d+),\s*y:\s*(-?\d+)/g)].map((m) => [m[1], Number(m[2]), Number(m[3])]);
      assert.deepEqual(rows, NEWXP_EXITS.map((r) => [...r]));
    }
  });

  it('has every exit street imported', () => {
    for (const [tsid] of NEWXP_EXITS) assert.ok(existsSync(join(ROOT, 'assets/streets', `${indexTsid(tsid)}.json`)), tsid);
  });

  it('picks exits like choose_one over imported streets', () => {
    assert.equal(pickNewxpExit(() => 0).sourceTsid, NEWXP_EXITS[0][0]);
    assert.equal(pickNewxpExit(() => 0.9999).sourceTsid, NEWXP_EXITS.at(-1)[0]);
    const only = pickNewxpExit(() => 0.5, (t) => t === 'GCR10S7GVKJ1ABI');
    assert.equal(only.tsid, 'GCR10S7GVKJ1ABI');
    assert.equal(only.x, -2525);
    assert.equal(pickNewxpExit(() => 0.5, () => false), null);
  });

  it('uses the source physics, rewards and timers', () => {
    // inc_physics.js setDefaultPhysics and inc_data_imagination.js rewards.
    assert.equal(NEWXP_UPGRADES.walk_speed_1.vx_max, 0.6567);
    assert.equal(NEWXP_UPGRADES.walk_speed_1.cost, 2);
    assert.equal(NEWXP_UPGRADES.jump_1.vy_jump, 0.907);
    assert.equal(NEWXP_UPGRADES.jump_1.cost, 3);
    const start = tutorialPhysics([]);
    assert.ok(Math.abs(start.speed - 0.4597 / 0.8268) < 1e-9);
    assert.equal(start.jump, 0.7105);
    assert.deepEqual(tutorialPhysics(['walk_speed_1', 'walk_speed_2', 'jump_1', 'jump_2']), { speed: 1, jump: 1 });
    assert.equal(QUOIN_BENEFITS.img_pickup_walk, 2);
    assert.equal(QUOIN_BENEFITS.img_pickup_jump, 3);
    // Every hand's card is affordable from the quoins before it.
    assert.ok(QUOIN_BENEFITS.img_pickup_walk >= NEWXP_UPGRADES[UPGRADE_HANDS.walk.buy].cost);
    assert.ok(QUOIN_BENEFITS.img_pickup_jump >= NEWXP_UPGRADES[UPGRADE_HANDS.jump.buy].cost);
    assert.ok(QUOIN_BENEFITS.img_pickup_1 >= NEWXP_UPGRADES[UPGRADE_HANDS.jump2.buy].cost);
    assert.ok(QUOIN_BENEFITS.img_pickup_egg_a + QUOIN_BENEFITS.img_pickup_egg_b >= NEWXP_UPGRADES[UPGRADE_HANDS.walk2.buy].cost);
    assert.equal(ISLAND_CURRANTS, 978);
    // "not quite enough for two bags"
    assert.ok(ISLAND_CURRANTS < CHEAP_BAG_PRICE * BAGS_NEEDED);
    assert.equal(LEAVE_FLAG_DELAY_MS, 15000);
    assert.deepEqual(TRAINING2_FOOD.map((f) => [f.classTsid, f.count]), [['common_crudites', 1], ['flummery', 1]]);
    assert.deepEqual(TRAINING2_DRINKS.map((f) => [f.classTsid, f.count]), [['spicy_grog', 1], ['fruity_juice', 3], ['spicy_grog', 3]]);
  });

  it('quotes the source dialogue', () => {
    if (!existsSync(join(GS, 'locations/newxp_training1.js'))) return;
    const t1 = readFileSync(join(GS, 'locations/newxp_training1.js'), 'utf8');
    const t2 = readFileSync(join(GS, 'locations/newxp_training2.js'), 'utf8');
    const unq = (s) => s.replace(/\\'/g, "'").replace(/\\"/g, '"');
    for (const key of ['t1Talk1', 't1Slow1', 't1JumpTalk', 't1Door1', 't1Name']) assert.ok(unq(t1).includes(LINES[key]), key);
    for (const key of ['t2Talk5', 't2Food', 't2Drinks', 't2Egg1c', 't2HaveEgg', 't2Delicious']) assert.ok(unq(t2).includes(LINES[key]), key);
  });

  it('splits talk pages on butt_txt and fills the name', () => {
    const pages = talkPages(LINES.t2Thanks, { name: 'Pip' }, 'OK');
    assert.equal(pages.length, 2);
    assert.match(pages[0].text, /Thank you very much, Pip\./);
    assert.equal(pages[0].button, 'No problem');
    assert.equal(pages[1].button, 'OK');
    assert.equal(talkPages(LINES.rockTicket, { name: 'Pip' }).length, 4);
    assert.deepEqual(vogPages(LINES.currants).length, 2);
  });
});

describe('newxp layouts', () => {
  const by = (L, id) => L.platforms.find((p) => p.id === id);

  it('clouds: land on the cloud, the drop is past its edge', () => {
    const L = cloudsLayout();
    const cloud = by(L, 'cloud');
    assert.ok(L.spawn.x > cloud.x1 && L.spawn.x < cloud.x2);
    assert.ok(L.dropX > cloud.x2);
    assert.equal(L.beats.length, 4);
    assert.equal(L.beats.at(-1).text, 'LET’S GO!');
  });

  it('training1: mushrooms need Walk Speed I; the islands need High Jumper I; the top needs the tree and ladder', () => {
    const L = training1Layout();
    const base = L.platforms.filter((p) => !p.tree);
    const walk = reachablePlatforms(base, [], 'floor', reachFor(tutorialPhysics(['walk_speed_1'])));
    for (const id of ['cap1', 'cap2', 'cap3']) assert.ok(walk.has(id), id);
    assert.ok(!walk.has('isle_a'), 'isle_a waits for High Jumper I');
    const slow = reachablePlatforms(base, [], 'floor', reachFor(tutorialPhysics([])));
    assert.ok(slow.has('cap3') && !slow.has('isle_a'), 'the default jump clears only the mushroom tops');
    const jump = reachFor(tutorialPhysics(['walk_speed_1', 'jump_1']));
    const noTree = reachablePlatforms(base, L.ladders, 'floor', jump);
    for (const id of ['isle_a', 'isle_b', 'isle_c']) assert.ok(noTree.has(id), id);
    assert.ok(!noTree.has('top'), 'the top waits for the sloth to leave');
    const all = reachablePlatforms(L.platforms, L.ladders, 'floor', jump);
    assert.ok(all.has('top'));
    // The jump coin hangs within the default jump over cap3.
    const cap3 = by(L, 'cap3');
    assert.ok(cap3.y1 - L.jumpCoin.y < 55 && L.jumpCoin.x >= cap3.x1 && L.jumpCoin.x <= cap3.x2);
    // The walk coin stays in front of wall1.
    assert.ok(L.walkCoin.maxX < L.barriers.find((b) => b.id === 'wall1').x);
  });

  it('training2: the Egg Plant and the rock ledge are reachable after High Jumper II', () => {
    const L = training2Layout();
    const reach = reachFor(tutorialPhysics(['walk_speed_1', 'jump_1', 'jump_2']));
    const got = reachablePlatforms(L.platforms, [], 'floor', reach);
    for (const p of L.platforms) assert.ok(got.has(p.id), p.id);
    const ledge = by(L, 'egg_ledge');
    assert.ok(L.eggPlant.x >= ledge.x1 && L.eggPlant.x <= ledge.x2 && L.eggPlant.y === ledge.y1);
    // The food and drinks sit on their tables, under 160 px above the floor.
    for (const spot of Object.values(L.items)) assert.ok(L.floorY - spot.y < 160);
    // Walls in source order: drinks, egg plant, the tube building.
    const xs = ['wall_to_drinks', 'wall_to_eggplant', 'tube_building'].map((id) => L.barriers.find((b) => b.id === id).x);
    assert.deepEqual([...xs].sort((a, b) => a - b), xs);
    assert.ok(L.items.drink_1.x > xs[0] && L.items.drink_3.x < xs[1]);
    assert.ok(L.dustbunny.building < xs[2], 'the egg is handed over this side of the tube wall');
  });
});

describe('newxp imported streets', () => {
  it('finds the Gentle Island boxes the island script uses', () => {
    for (const [id, box] of Object.entries(ISLAND_BOXES)) {
      const s = street(box.tsid);
      const row = (s.boxes || []).find((b) => b.id === id);
      assert.ok(row, id);
      assert.deepEqual([row.x, row.y, row.w, row.h], [box.x, box.y, box.w, box.h]);
    }
    for (const tsid of Object.values(GENTLE_ISLAND)) assert.equal(street(tsid).hubId, '129');
    assert.ok(inBox(ISLAND_BOXES.gentle_island_exit, 5724, 1000));
    assert.ok(!inBox(ISLAND_BOXES.gentle_island_exit, 5000, 1000));
  });

  it('has practice streets for the archived first skills', () => {
    for (const s of FIRST_SKILLS) {
      if (!s.street) {
        assert.equal(s.id, 'ezcooking_1');
        continue;
      }
      const data = street(s.street);
      assert.ok((data.boxes || []).some((b) => b.id === s.finishBox), s.finishBox);
      assert.equal(data.musicFile, 'NEW_XP_TRAINING1');
    }
  });

  it('keeps the tutorial quests and their source rewards in the catalog', () => {
    const quests = JSON.parse(readFileSync(join(ROOT, 'assets/content/quests.json'), 'utf8'));
    assert.deepEqual(quests.leave_gentle_island.rewards, { xp: 300, currants: 500, mood: 100, energy: 100 });
    assert.deepEqual(quests.buy_two_bags.rewards, { xp: 150, currants: 500, mood: 20, energy: 20 });
    assert.equal(quests.buy_two_bags.requirements[0].name, 'generic_bag_purchased');
    assert.equal(quests.buy_two_bags.requirements[0].num, BAGS_NEEDED);
    for (const s of FIRST_SKILLS) assert.ok(quests[s.quest], s.quest);
  });
});

describe('newxp save', () => {
  it('normalizes and starts', () => {
    const s = normalizeNewxpSave({ status: 'weird', stage: 'nope', upgrades: ['walk_speed_1', 'bogus'], name: '<b>Pip</b>' });
    assert.equal(s.status, 'off');
    assert.equal(s.stage, 'clouds');
    assert.deepEqual(s.upgrades, ['walk_speed_1']);
    assert.equal(s.name, 'bPip/b');
    const started = startNewxp(s, 'clouds', 5);
    assert.equal(started.status, 'active');
    assert.deepEqual(started.upgrades, []);
    assert.equal(startNewxp(s, 'island').stage, 'island');
  });

  it('never resumes on fresh/resetgame routes, only for an active tutorial', () => {
    const s = startNewxp(normalizeNewxpSave(), 'training1');
    assert.equal(shouldResume(s, {}), true);
    assert.equal(shouldResume(s, { fresh: true }), false);
    assert.equal(shouldResume(s, { resetgame: true }), false);
    assert.equal(shouldResume(normalizeNewxpSave(), {}), false);
    assert.equal(shouldResume({ ...s, status: 'done' }, {}), false);
  });

  it('walks the stages in order', () => {
    assert.deepEqual(STAGES.slice(0, -1).map(nextStage), STAGES.slice(1));
    assert.ok(isNewxpSceneTsid('NEWXP_TRAINING1'));
    assert.ok(!isNewxpSceneTsid('GA952QGCH3D31E2'));
  });

  it('is registered as a feature', () => {
    const src = readFileSync(join(ROOT, 'js/features/index.js'), 'utf8');
    assert.match(src, /newxpFeature/);
  });
});

describe('newxp island order (newbie_island.js, home.js, magic_rock.js)', () => {
  it('goes home after the bags and only then offers On to the Big Time', () => {
    assert.deepEqual([...ISLAND_STEPS], ['arrive', 'quest_given', 'bags_done', 'go_home', 'home_done', 'leaving', 'exited']);
    // street4_check: back 250 without bags, back 150 with bags until the quest is accepted.
    assert.equal(street4Check('quest_given', false), 'noBags');
    for (const step of ['bags_done', 'go_home', 'home_done']) assert.equal(street4Check(step, true), 'notSoFast', step);
    assert.equal(street4Check('leaving', true), null);
    for (const step of ISLAND_STEPS) assert.equal(islandExitOpen(step), step === 'leaving', step);
    assert.equal(normalizeNewxpSave({ island: 'go_home' }).island, 'go_home');
    assert.equal(normalizeNewxpSave({ island: 'home_done' }).island, 'home_done');
  });

  it('tests the archived island boxes against the avatar body, so Progress Way\'s gate fires', () => {
    // Progress Way's floor under street4_check is at y 959 (944-963), below the box bottom (950).
    assert.equal(inBox(ISLAND_BOXES.street4_check, 4700, 959), false);
    assert.equal(inHitBox(ISLAND_BOXES.street4_check, 4700, 959), true);
    assert.equal(inHitBox(ISLAND_BOXES.street4_check, 4500, 959), false);
    assert.equal(inHitBox(ISLAND_BOXES.gentle_island_exit, 5724, 1122), true);
    assert.equal(inHitBox(ISLAND_BOXES.gentle_island_exit, 5000, 1122), false);
  });

  it('uses the source wording for the home wrap-up', () => {
    assert.deepEqual(talkPages(LINES.homeGift, {}, 'Nice').map((p) => p.button), ['Yay me', 'Do Tell!', 'Nice']);
    assert.deepEqual(talkPages(LINES.skillBrain, {}, 'Will do').map((p) => p.button), ['Good', 'Interesting …', 'Will do']);
    assert.deepEqual(talkPages(LINES.wellKid, {}, 'OK').map((p) => p.button), ['Yeah', 'OK']);
    if (!existsSync(join(GS, 'locations/newbie_island.js'))) return;
    const island = readFileSync(join(GS, 'locations/newbie_island.js'), 'utf8');
    const home = readFileSync(join(GS, 'locations/home.js'), 'utf8');
    const rock = readFileSync(join(GS, 'items/magic_rock.js'), 'utf8');
    const bags = readFileSync(join(GS, 'quests/buy_two_bags.js'), 'utf8');
    assert.ok(island.includes(LINES.notSoFast), 'notSoFast');
    assert.ok(island.includes(LINES.noBagsYet), 'noBagsYet');
    assert.ok(bags.includes(LINES.backAndForth), 'backAndForth');
    for (const key of ['homeGift', 'skillBrain', 'wellKid']) assert.ok(home.includes(LINES[key].replace(/"/g, '\\"')), key);
    assert.ok(rock.includes(LINES.chapterBye), 'chapterBye');
    // The one adaptation: the source's "use the iMG Menu" is the Home panel's Return to Ur here.
    assert.ok(home.includes(LINES.whenReady.replace('use Return to Ur', 'use the iMG Menu')), 'whenReady');
  });
});
