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
  ISLAND_CONFIRM,
  ISLAND_EVENT_BOXES,
  ISLAND_FLAGS,
  ISLAND_INSTANCE,
  ISLAND_LINES,
  ISLAND_MUSICBLOCKS,
  ISLAND_MUSICBLOCK_AT,
  ISLAND_QUOINS,
  ISLAND_SIGNS,
  ISLAND_TICKET_AT,
  islandHand,
  reduceToHand,
  sourceToStreet,
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
  CLOUD_LETTERS,
  CLOUD_WORDS,
  cloudLetterDeco,
  cloudWordDeco,
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
} from '../public/js/newxp.js?v=d5978ec1';

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

  it('G310: overlay and callout words come from CC0 sources, none from the playthrough', () => {
    const AUDIT = join(GS, '..');
    // The overlay art each instruction / imagination line is read from.
    for (const fla of ['move_instructions', 'button_instructions', 'jump_instructions', 'jumpAcross_instructions', 'climb_instructions', 'interact_instructions', 'inventory_instructions_overlay', 'newxp_img1_overlay', 'newxp_img2_overlay', 'newxp_img3_overlay']) {
      const file = join(AUDIT, 'glitch-overlays', `${fla}.fla`);
      if (existsSync(join(AUDIT, 'glitch-overlays'))) assert.ok(existsSync(file), fla);
    }
    assert.equal(LINES.moveInstructions, 'Use Arrow Keys to move!<br>(or W,A,S,D Keys if you prefer)');
    assert.equal(LINES.jumpAcrossInstructions, 'Use Space Bar & Arrow Keys to jump across!');
    assert.match(LINES.img2.body, /a lot more than this\.\)$/);
    assert.deepEqual(Object.keys(LINES.firstInventory), ['title', 'body', 'button']);
    const hand = join(AUDIT, 'glitch-client/com/tinyspeck/engine/view/ui/imagination/ImaginationHandUI.as');
    if (existsSync(hand)) assert.ok(readFileSync(hand, 'utf8').includes(LINES.upgradeHelp), 'upgradeHelp');
    const disp = join(GS, 'items/homestreet_ticket_dispenser.js');
    if (existsSync(disp)) {
      const src = readFileSync(disp, 'utf8');
      for (const c of training2Layout().machine.choices) assert.match(src, new RegExp(`"name"\\s*:\\s*"${c.label}"`), c.label);
    }
    // The transcribed lines are gone.
    const all = JSON.stringify(LINES);
    for (const gone of ['ELEVEN GIANTS WHO', 'LET’S GO', 'Hold an Arrow Key', 'Eating food gives you energy', 'The higher your mood', 'Things you pick up']) assert.ok(!all.includes(gone), gone);
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

  it('clouds: wait on the perch, drop cloud to cloud, the last drop is past the last edge', () => {
    const L = cloudsLayout();
    const cloud = by(L, 'cloud');
    const perch = by(L, 'perch');
    // You wait on the perch over the ceiling until the chain is pulled, over the first cloud.
    assert.ok(L.spawn.x > perch.x1 && L.spawn.x < perch.x2 && L.spawn.y < perch.y1);
    assert.ok(perch.y1 < L.ceilingY && L.chain.x === L.spawn.x);
    const first = L.terraces[0];
    assert.ok(L.spawn.x > first.x1 && L.spawn.x < first.x2 && first.y > L.ceilingY);
    // Each lower cloud starts under the end of the one above, so a step off always lands.
    for (let i = 1; i < L.terraces.length; i++) {
      const [a, b] = [L.terraces[i - 1], L.terraces[i]];
      assert.ok(b.y > a.y && b.x1 < a.x2 && b.x2 > a.x2, b.id);
      const wall = L.barriers.find((w) => w.id === `back_${b.id}`);
      assert.ok(wall && wall.x < a.x2 && wall.y + wall.h === b.y && wall.y > a.y, `${b.id} keeps you from walking off backwards`);
    }
    assert.equal(L.terraces.at(-1), L.terraces.find((t) => t.id === 'cloud'));
    assert.ok(L.dropX > cloud.x2);
    // G310: the words are Tiny Speck's lettering art (newxp_cloud.swf), one phrase per lower cloud.
    assert.equal(LINES.cloudBeats, undefined, 'no remake copy');
    assert.deepEqual(L.terraces.filter((t) => t.phrase).map((t) => t.phrase), Object.keys(CLOUD_WORDS));
    for (const t of L.terraces.filter((q) => q.phrase)) assert.ok(t.box > t.x1 && t.box < t.at && t.at < t.x2, t.id);
    const decos = new Set(JSON.parse(readFileSync(join(ROOT, 'assets/decos/manifest.json'), 'utf8')));
    for (const [w] of Object.values(CLOUD_WORDS).flat()) assert.ok(decos.has(cloudWordDeco(w)), w);
    for (const [c] of CLOUD_LETTERS) for (const dark of [false, true]) assert.ok(decos.has(cloudLetterDeco(c, dark)), `${c} ${dark}`);
    for (const p of [...training1Layout().platforms, ...training2Layout().platforms]) if (p.art) assert.ok(decos.has(p.art), p.art);
    // The words read in the recording's order: the first phrase starts THE ELEVEN GIANTS WHO.
    assert.deepEqual(CLOUD_WORDS.eleven.slice(0, 4).map(([w]) => w), ['the', 'eleven', 'giants', 'who']);
    assert.deepEqual(CLOUD_WORDS.go.map(([w]) => w), ['lets', 'go_exclamation']);
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
    // The three style stations (board at -160, picture at +160, each 208 wide) stand apart, inside the room.
    const stations = L.machine.choices.map((c) => c.x);
    for (let i = 1; i < stations.length; i++) assert.ok(stations[i] - stations[i - 1] >= 2 * (160 + 104), 'stations do not overlap');
    // The stations stand past the tube building's wall, and the Magic Rock's ledge past them (K2q5GXruLvE 7:36-8:20).
    const wall = L.barriers.find((b) => b.id === 'tube_building');
    assert.ok(stations[0] - 264 > wall.x && stations.at(-1) + 264 < by(L, 'rock_step').x1 && by(L, 'rock_ledge').x2 < L.width);
    assert.ok(L.boxes.magicrock_reveal.x > stations.at(-1) && L.boxes.magicrock_reveal.x < L.rock.x);
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

  it('keeps the street under the clouds quiet: no arrival lines, no Qurazy roll (G339)', () => {
    const src = readFileSync(join(ROOT, 'js/features/newxp-feature.js'), 'utf8');
    assert.match(src, /arrivalQuiet\(engine\) \{\n\s+if \(pendingStage \|\| inTutorialScene\(engine\)\) return true;\n(?:\s+\/\/[^\n]*\n)*\s+if \(active\(\) && save\.stage !== 'island'\) return true;\n\s+return !engine\?\.started && startCardShown && !hadSave \? true : null;/);
    const game = readFileSync(join(ROOT, 'game.js'), 'utf8');
    assert.match(game, /if \(features\.query\('arrivalQuiet', engine\) !== true\) \{\n\s+toast\(`\$\{currentStreet\?\.label \|\| 'Hechey Track'\} loaded\./);
    const qurazy = readFileSync(join(ROOT, 'js/features/qurazy-feature.js'), 'utf8');
    assert.match(qurazy, /\} else if \(engine\.query\?\.\('arrivalQuiet', engine\) === true\) \{[^}]*lastRoll = 'skip:tutorial:0';/);
  });

  it('offers no skip in multiplayer, at the start or on the pill (Austin 2026-10-26)', () => {
    const src = readFileSync(join(ROOT, 'js/features/newxp-feature.js'), 'utf8');
    assert.match(src, /if \(skip\) skip\.hidden = engineRef\?\.mode === 'multiplayer';/);
    assert.match(src, /\[data-nx-skip\]'\)\.addEventListener\('click', \(\) => \{\n    if \(engineRef\?\.mode === 'multiplayer'\) return;/);
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

const LOC = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'streets', 'mnt', 'stos', 'location_data');
const decodeXml = (t) => t.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

describe('newxp Gentle Island scripts (newbie_island.js and the street events)', () => {
  const owned = ['walk_speed_1', 'jump_1', 'jump_2', 'walk_speed_2'];

  it('deals the tutorial hands and tops iMG up to the cheapest card (imagination_reduce_to_hand)', () => {
    assert.deepEqual(islandHand(owned), ['mappery', 'camera_mode', 'zoomability']);
    assert.deepEqual(islandHand([...owned, 'mappery']), ['camera_mode', 'zoomability', 'encyclopeddling']);
    assert.deepEqual(islandHand([...owned, 'mappery', 'camera_mode']), ['zoomability', 'encyclopeddling', 'skill_learning']);
    assert.deepEqual(islandHand(['walk_speed_1']), ['jump_1', 'jump_2', 'walk_speed_2']);
    assert.equal(reduceToHand(['mappery', 'camera_mode', 'zoomability'], 5), 20);
    assert.equal(reduceToHand(['mappery', 'camera_mode', 'zoomability'], 33), 33);
    assert.equal(reduceToHand(['camera_mode', 'zoomability', 'encyclopeddling'], 0), 75);
    assert.equal(reduceToHand([], 4), 4);
    // inc_data_imagination.js costs.
    assert.deepEqual(['mappery', 'camera_mode', 'zoomability', 'encyclopeddling', 'skill_learning'].map((id) => NEWXP_UPGRADES[id].cost), [20, 75, 75, 90, 500]);
    // Only the confirmations the remake can keep: no zoom, no Encyclopedia.
    assert.deepEqual(Object.keys(ISLAND_CONFIRM).sort(), ['camera_mode', 'mappery']);
  });

  it('puts each event quoin on its street, with the street event it fires', () => {
    const events = { mappery_upgrade: GENTLE_ISLAND.surveyors_stroll, zoom_upgrade: GENTLE_ISLAND.high_jumpers_gully, other_upgrade: GENTLE_ISLAND.high_jumpers_gully, explain_upgrades: GENTLE_ISLAND.exit };
    for (const q of ISLAND_QUOINS) {
      assert.equal(events[q.event], q.tsid, q.id);
      assert.ok(street(q.tsid).events[q.event], `${q.tsid} has ${q.event}`);
      assert.ok(q.source || q.rebuilt, q.id);
    }
    // NB_Street2's two quoins, by their source x, y; into street pixels.
    const gully = street(GENTLE_ISLAND.high_jumpers_gully);
    assert.deepEqual(sourceToStreet(gully.bounds, -1135, -1322), { x: 365, y: 678 });
    assert.deepEqual(sourceToStreet(gully.bounds, 122, -1288), { x: 1622, y: 712 });
    assert.deepEqual(Object.values(ISLAND_INSTANCE).sort(), ['NB_Side_Street1', 'NB_Side_Street2', 'NB_Street1', 'NB_Street2', 'NB_Street3', 'NB_Street4']);
    if (!existsSync(join(GS, 'locations/newbie_island.js'))) return;
    const island = readFileSync(join(GS, 'locations/newbie_island.js'), 'utf8');
    for (const q of ISLAND_QUOINS.filter((x) => x.source)) assert.ok(island.includes(`q.x == ${q.source.x} && q.y == ${q.source.y}`), q.id);
    for (const q of ISLAND_QUOINS) assert.ok(island.includes(`'${q.event}'`) || island.includes(`"${q.event}"`) || q.event === 'explain_upgrades', q.event);
    assert.ok(island.includes("quoin_event_id = 'explain_upgrades'"));
    for (const key of ['mappery', 'mappery2', 'mapperyActivity', 'camera_mode', 'zoomability']) assert.ok(island.includes(ISLAND_LINES[key]), key);
    assert.ok(island.includes(ISLAND_LINES.encyclopeddling.replace(/"/g, '\\"').replace('O, what', '[[class=nuxp_big]]O, what')), 'encyclopeddling');
    const choices = /choose_one\(\[([\s\S]*?)\]\)/.exec(island)[1].match(/'([^']+)'/g).map((x) => x.slice(1, -1));
    assert.deepEqual(choices, [...ISLAND_MUSICBLOCKS]);
    assert.ok(island.includes(`createItemStack(block_class, 1, ${ISLAND_MUSICBLOCK_AT.x}, ${ISLAND_MUSICBLOCK_AT.y})`));
  });

  it('keeps the rebuilt Qurazy spots on reachable ground', () => {
    const reach = reachFor({ speed: 1, jump: 1 });
    for (const q of ISLAND_QUOINS.filter((x) => x.rebuilt)) {
      const s = street(q.tsid);
      const plats = s.platforms.map((p) => ({ ...p, x1: p.x1 - s.bounds.l, x2: p.x2 - s.bounds.l, y1: p.y1 - s.bounds.t, y2: p.y2 - s.bounds.t }))
        .filter((p) => p.pc_perm !== 0);
      // groundBelow(x, 0): the top walk line at x, as the feature places it.
      const top = (x) => plats.filter((p) => Math.min(p.x1, p.x2) <= x && Math.max(p.x1, p.x2) >= x)
        .sort((a, b) => Math.min(a.y1, a.y2) - Math.min(b.y1, b.y2))[0];
      const under = top(q.rebuilt.x);
      const entry = top(300); // both streets are entered from the left
      assert.ok(under && entry, q.id);
      assert.ok(reachablePlatforms(plats, [], entry.id, reach).has(under.id), `${q.id} on ${under.id}`);
    }
  });

  it('prints the hint signs the street events show, from the decos\' sign_txt', () => {
    const byStreet = new Map();
    for (const tsid of Object.values(GENTLE_ISLAND)) {
      for (const layer of street(tsid).layers || []) for (const d of layer.decos || []) if (d.id) byStreet.set(d.id, tsid);
    }
    for (const [id, sign] of Object.entries(ISLAND_SIGNS)) {
      const tsid = byStreet.get(id);
      assert.ok(tsid, `${id} is a deco on the island`);
      const shown = Object.values(street(tsid).events).some((acts) => acts.some((a) => a.type === 'deco_show' && a.deco === id));
      assert.ok(shown, `${id} is shown by an event`);
      assert.ok(sign.text.length > 8, id);
    }
    // One face per pair.
    assert.equal(Object.values(ISLAND_SIGNS).filter((s) => s.face).length, 7);
    if (!existsSync(LOC)) return;
    for (const [id, sign] of Object.entries(ISLAND_SIGNS)) {
      const xml = readFileSync(join(LOC, `${byStreet.get(id)}.xml`), 'utf8');
      const at = xml.indexOf(`<object id="${id}">`);
      const txt = /<str id="sign_txt">([^<]*)<\/str>/.exec(xml.slice(at, at + 900))?.[1];
      assert.equal(decodeXml(txt || '').replace(/<\/?font[^>]*>/g, ''), sign.text, id);
    }
  });

  it('rebuilds a trigger box for each sign event, on the street that has the event', () => {
    for (const box of ISLAND_EVENT_BOXES) {
      const s = street(box.tsid);
      assert.ok(s.events[box.event], `${box.tsid} ${box.event}`);
      assert.ok(box.x > 0 && box.x < s.bounds.r - s.bounds.l, box.event);
      assert.ok(box.y > 0 && box.y < s.bounds.b - s.bounds.t + 200, box.event);
    }
    // The sign events: deco_show of signs whose text the island prints (crazy is a VOG).
    for (const box of ISLAND_EVENT_BOXES.filter((b) => b.event !== 'crazy')) {
      const shows = street(box.tsid).events[box.event].filter((a) => a.type === 'deco_show').map((a) => a.deco);
      assert.ok(shows.some((id) => ISLAND_SIGNS[id]), box.event);
    }
    const stroll = street(GENTLE_ISLAND.surveyors_stroll).events;
    assert.deepEqual(stroll.crazy.find((a) => a.type === 'pc_vog').lines, [ISLAND_LINES.crazy]);
    assert.deepEqual(stroll.crazy2.find((a) => a.type === 'pc_vog').lines, [ISLAND_LINES.crazy2]);
    const exit = street(GENTLE_ISLAND.exit).events;
    assert.equal(exit.explain_upgrades.find((a) => a.type === 'pc_vog').lines.join('//'), ISLAND_LINES.explainUpgrades);
    // The ticket stand deco sits where the Gameshow Ticket goes.
    const gully = street(GENTLE_ISLAND.high_jumpers_gully);
    const stand = gully.layers.flatMap((l) => l.decos || []).find((d) => d.sprite === 'newxp_gameshow_ticket_stand_01a');
    assert.deepEqual([stand.x, stand.y], [ISLAND_TICKET_AT.x, ISLAND_TICKET_AT.y]);
  });

  it('quotes the street spirit and the return overlay from the source', () => {
    if (!existsSync(join(GS, 'items/street_spirit_groddle.js'))) return;
    const spirit = readFileSync(join(GS, 'items/street_spirit_groddle.js'), 'utf8');
    for (const line of ISLAND_LINES.song) assert.ok(spirit.includes(line), line);
    assert.ok(spirit.includes('This is embarrassing! I thought I was alone!<split butt_txt=\\"It’s OK\\">Well, anyway, '));
    assert.ok(spirit.includes('if you are looking for bags on the cheap, I am your girl. Come BUY from me if you need bags!'));
    assert.deepEqual(talkPages(ISLAND_LINES.spiritOh, { name: 'Pip' }, 'OK').map((p) => p.button), ['Oh?', 'It’s OK', 'OK']);
    const players = readFileSync(join(GS, 'players/inc_newxp.js'), 'utf8');
    assert.ok(players.includes(ISLAND_LINES.returnToIsland));
  });

  it('saves the island flags and the chosen Musicblock', () => {
    const s = normalizeNewxpSave({ flags: ['mappery_upgrade', 'bogus', 'mappery_upgrade', 'gst'], musicblock: 'musicblock_d_red_03' });
    assert.deepEqual(s.flags, ['mappery_upgrade', 'gst']);
    assert.equal(s.musicblock, 'musicblock_d_red_03');
    assert.equal(normalizeNewxpSave({ musicblock: 'apple' }).musicblock, '');
    const fresh = startNewxp(s, 'clouds');
    assert.deepEqual(fresh.flags, []);
    assert.equal(fresh.musicblock, '');
    assert.equal(startNewxp(s, 'island').flags.length, 2);
    for (const q of ISLAND_QUOINS) assert.ok(ISLAND_FLAGS.includes(q.event), q.event);
  });
});

describe('the look step opens the new-player picker', () => {
  it('opens the builder on Start fresh, as open_avatar_picker did (newxp_training1.js 586)', () => {
    const src = readFileSync(join(ROOT, 'js/features/newxp-feature.js'), 'utf8');
    assert.match(src, /getElementById\('avatar-btn'\)\?\.click\(\);[\s\S]{0,200}#avatar-tabs \[data-slot="fresh"\]'\)\?\.click\(\)/);
    const game = readFileSync(join(ROOT, 'game.js'), 'utf8');
    assert.match(game, /\['fresh', 'Start fresh'\]/);
  });
});
