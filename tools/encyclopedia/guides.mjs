/**
 * #668 (Austin 2026-11-24): the Encyclopedia's "How do I…" guides, written from questions players
 * actually asked. Each guide is data here: the question, a one-sentence answer, its parts (steps or
 * short lists), the words a search for it uses, the pages that link back to it, and its facts.
 *
 *   /encyclopedia/how/          every guide (tools/encyclopedia/build.mjs writes the pages)
 *   /encyclopedia/how/<slug>/   one guide
 *
 * Words are ours, plain and short, and every fact in them is the game's: each guide's `facts` names
 * a piece of its text (`say`) and checks it against the game's own code and data (`ok`), so a guide
 * cannot drift from the game silently. checkGuides() runs them; the builder refuses to write a guide
 * whose fact fails, and tests/encyclopedia-how-668.test.js checks that every number in a guide is
 * one of its facts and that every link resolves to a built page.
 *
 * Links in the text: [[key]] draws the page's own name, [[key|words]] other words. Keys are the
 * encyclopedia's (item:x, streets:x, stores:x, quests:x, ...) plus list:<slug> (a "Streets with…"
 * list), search:<query> (the home search, filled in), page:<path/> (a page by its site path) and
 * how:<slug> (another guide).
 *
 * Search (public/encyclopedia/search-core.js): each guide is an entry of section "how" whose name is
 * its question and whose `words` are strong keywords; a query whose words are all in the question or
 * the words ranks the guide first.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GARDEN_LOCK_MS, SHARED_GARDEN_STREETS } from '../../public/js/shared-gardens.js?v=464472e5';
import { GARDEN_WATER_MS, HERB_GARDEN_STREETS, SEED_CATALOG, gardenActionProfile } from '../../public/js/garden.js?v=fefa7bcd';
import { HERB_SEEDS } from '../../public/js/item-transforms.js?v=35fd8c6e';
import { DROP_TABLES } from '../../public/js/drop-tables-data.js?v=c51a6400';
import { STONE_LEVEL } from '../../public/js/street-furniture.js?v=071203fc';
import { GRAVE_VISIT } from '../../public/js/hell-tickets.js?v=33bd7064';
import { GRAPES_REQUIRED, HELL_QUESTS } from '../../public/js/hell.js?v=0dba5774';
import { DOOR_CLASS, DOOR_JOB, MAX_FLOORS, addFloor, createFloorsState, doorDestination, doorLiftCheck, slideDoor, wallExpandItems } from '../../public/js/home-floors.js?v=73a434ce';
import { CULTIVATION_CLASSES } from '../../public/js/homes-catalog.js?v=0367f90f';
import { createHomeDecorState, interiorWidth, placeFurniture } from '../../public/js/home-decor.js?v=3a84d959';
import { learningTimeModifier } from '../../public/js/imagination-effects.js?v=70169933';
import { BRAIN_CAPACITY_AMOUNTS, BRAIN_CAPACITY_DEFAULT, BRAIN_CAPACITY_LIMIT } from '../../public/js/imagination.js?v=1bdfd77c';
import { BETTER_LEARNING_DISCOUNTS } from '../../public/js/better-learning.js?v=044ff9ff';
import { EMBLEM_SPEND_FAVOR, FAVOR_STUDY_SECONDS } from '../../public/js/shrines.js?v=74b2157f';
import { esc } from './parts.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PUB = join(root, 'public');
const json = (rel) => JSON.parse(readFileSync(join(PUB, rel), 'utf8'));
/** A file of the game's (under public/) says these words, exactly. */
const says = (rel, ...words) => { const text = readFileSync(join(PUB, rel), 'utf8'); return words.every((w) => text.includes(w)); };
/** The stores (encyclopedia data) that sell `id`. */
const sellers = (d, test) => [...d.entries.values()].filter((e) => e.section === 'stores' && (e.shop?.offers || []).some((o) => test(o.classTsid))).map((e) => e.key);

export const HOW_PATH = 'encyclopedia/how/';
export const HOW_TITLE = 'How do I…';

/**
 * The guides, in the order the index shows them. Each:
 *   slug, question, short (the index's few words), answer (one sentence, the page's lead),
 *   parts: [{ h, steps?: [..] (numbered), list?: [..], p?: [..] }], words (strong search keywords),
 *   queries (sample searches that must bring it first, tests/encyclopedia-how-668.test.js),
 *   icon (the key whose picture it shows), covers(d) (pages that link back to it),
 *   facts: [{ say, ok(d) }].
 */
export const GUIDES = [
  /*
   * 1. Community gardens. Glitch: items/include/garden.js (plot states clean, seeds, shoots, crop,
   * dirty; timings.water 12 hours; plant 441-446 "You need to clean that plot first"; water with a
   * watering_can 125-130, hoe a dirty plot 233-238; isPublic 1244-1247 a garden with no owner; the
   * planter's 0.0167 hours 1042-1055), GardenView.as 481-486 (LOCK_LINE). The remake: js/garden.js
   * (GARDEN_SPEEDUP 10, so a watering is 72 minutes), js/shared-gardens.js, the server's gardens.go.
   */
  {
    slug: 'community-gardens',
    question: 'Where are the community gardens, and how do I use one?',
    short: 'Community gardens',
    answer: 'Community gardens are public crop and herb beds on a few streets, and anyone can plant, water and pick there.',
    icon: 'item:proto_crop_garden_large',
    words: 'community gardens public garden crop garden herb garden gardening grow crops',
    queries: ['community garden', 'where gardens', 'community gardens', 'public garden'],
    parts: [
      { h: 'Where they are', p: [
        'The [[list:community-garden]] list shows every street with one, by region, such as [[streets:community-gardens]] and [[streets:kipacre-greens]].',
        'On the three Herb Gardens streets every bed is an herb bed.',
      ] },
      { h: 'How to grow something', steps: [
        'Bring seeds. Crop seeds are sold by the [[stores:gardening_tools]] and the [[stores:gardening]]. Herb seeds come from shucking herbs, or now and then from a [[item:dust_trap]].',
        'Plant in a clean plot. Crop seeds only go in a crop bed, and herb seeds only in an herb bed.',
        'Water it with a [[item:watering_can]]. Seeds only grow while the plot is wet. One watering lasts 72 minutes, and a dry plot stops growing until you water it again.',
        'Pick the crop when it is ripe. Without [[skills:croppery_1]] (or [[skills:herbalism_1]] in an herb bed) you get half the crop.',
        'Clear the picked plot with a [[item:hoe]], and it is clean for the next seeds.',
      ] },
      { h: 'Playing online', list: [
        'Everyone shares the same plots in the public gardens, except the tutorial bed on [[streets:doonboggle-trail]].',
        'When a crop ripens, the player who planted it has 60 seconds to pick it before anyone else can.',
      ] },
    ],
    covers: (d) => ['list:community-garden', ...[...d.entries.values()].filter((e) => e.section === 'streets' && e.street?.gardens > 0).map((e) => e.key)],
    facts: [
      { say: 'three Herb Gardens streets', ok: () => HERB_GARDEN_STREETS.length === 3 },
      { say: 'Crop seeds are sold by', ok: (d) => ['stores:gardening_tools', 'stores:gardening'].every((k) => sellers(d, (id) => /^seed_/.test(id)).includes(k)) },
      // No store sells an herb seed; herb_base extract_seeds (item-transforms.js HERB_SEEDS) and the Dust Trap's drops give them.
      { say: 'Herb seeds come from shucking herbs', ok: (d) => {
        const herbSeeds = Object.values(SEED_CATALOG).filter((s) => s.gardenType === 'herb').map((s) => s.seedId);
        const shucked = new Set(Object.values(HERB_SEEDS).map((r) => r.seed));
        return herbSeeds.length > 0 && herbSeeds.every((id) => shucked.has(id)) && !sellers(d, (id) => herbSeeds.includes(id)).length
          && JSON.stringify(DROP_TABLES.dust_trap).includes('herb_seed_');
      } },
      { say: 'Plant in a clean plot', ok: () => says('js/garden.js', "'Oops. You need to clean that plot first.'") },
      { say: 'Crop seeds only go in a crop bed, and herb seeds only in an herb bed', ok: () => says('js/garden.js', "'Only herb seeds go in an herb garden.'", "'Only crop seeds go in a crop garden.'") },
      { say: 'Seeds only grow while the plot is wet', ok: () => says('js/garden.js', 'Growth only advances while wet') },
      { say: '72 minutes', ok: () => GARDEN_WATER_MS === 72 * 60_000 },
      { say: 'you get half the crop', ok: () => gardenActionProfile('default', 'harvest', []).halfHarvest && gardenActionProfile('herb', 'harvest', []).halfHarvest
        && !gardenActionProfile('default', 'harvest', ['croppery_1']).halfHarvest && !gardenActionProfile('herb', 'harvest', ['herbalism_1']).halfHarvest },
      { say: 'Clear the picked plot with a', ok: () => says('js/garden.js', "'You need a Hoe to clear dirty plots.'") },
      // The ten shared streets are the eleven garden streets without the tutorial's (shared-gardens.js).
      { say: 'except the tutorial bed on', ok: (d) => {
        const doon = d.entries.get('streets:doonboggle-trail');
        return SHARED_GARDEN_STREETS.length === 10 && Boolean(doon) && !SHARED_GARDEN_STREETS.includes(doon.street?.tsid) && says('js/shared-gardens.js', 'Doonboggle Trail is left out');
      } },
      { say: '60 seconds', ok: () => GARDEN_LOCK_MS === 60_000 },
    ],
  },

  /*
   * 2. Visitors. Glitch: players/inc_visiting.js visiting_can_opt_in 1-37 (level 4, a home, 3
   * cultivated items on the home street: home.exterior.cultivation_count_all_items, a Butler) and
   * visiting_visit_random; items/visiting_stone.js verbs. The remake: js/street-furniture.js
   * (STONE_LEVEL), features/street-furniture-feature.js multiplayerStoneVerbs, the site's
   * Neighbours.php canOptIn, features/butler-feature.js (the box at level 3), js/neighbours.js (solo).
   */
  {
    slug: 'get-visitors',
    question: 'How do I get visitors to my home street?',
    short: 'Visitors',
    answer: 'Choose Get visitors at any Visiting Stone, and players who press Visit on a stone can be sent to your home street.',
    icon: 'item:visiting_stone',
    words: 'visitors visitor visit visits visited home street visiting stone random visitors get visitors',
    queries: ['visitors', 'get visitors', 'home street visitors', 'visiting stone visitors'],
    parts: [
      { h: 'Before you can opt in', list: [
        'Reach level 4.',
        'Have your home street.',
        'Cultivate 3 items on your home street.',
        'Unbox your Butler. Its [[item:butler_box]] turns up on your home street once you have a home and reach level 3.',
      ] },
      { h: 'What counts as cultivated', p: [
        'Each thing you set down in Cultivate mode on your home street counts as one: a Patch, a rock, a garden, a [[item:dirt_pile]], a [[item:firefly_hive]] and the rest. Things in your back yard do not count.',
        'Open Cultivate mode with the Cultivate button on your home street, or press Shift+C. Each thing costs iMG, and the price grows with each one you add.',
      ] },
      { h: 'How players get visited', steps: [
        'Walk up to a [[item:visiting_stone]] and choose Get visitors. Stop random visitors opts you out again.',
        'Anyone who chooses Visit at a stone goes to the home street of a random player who opted in.',
        'Friends can also come any time with Visit Home Street, from your name or their buddy list, and a house key lets them inside.',
      ] },
      { h: 'Playing solo', p: [
        'With no other players, Get visitors needs level 4, a home and your Butler. A neighbour then drops by your home street each new game day and leaves a gift with your Butler.',
      ] },
    ],
    covers: () => ['item:visiting_stone', 'item:butler_box', 'item:bag_butler', 'list:visiting-stone'],
    facts: [
      { say: 'Get visitors', ok: () => says('js/street-furniture.js', "label: 'Get visitors'", "label: 'Stop random visitors'") },
      { say: 'Reach level 4', ok: () => STONE_LEVEL === 4 && says('js/features/street-furniture-feature.js', 'const gate = canOptIn({ level: engine.pc.level') },
      { say: 'Cultivate 3 items on your home street', ok: () => says('js/features/street-furniture-feature.js', "neighboursMpApi.cultivations() < 3", "'You need to cultivate 3 items.'") && says('js/features/neighbours-mp-feature.js', 'cultivations: () => homesFeature._state?.().cult?.items?.length') },
      { say: 'reach level 3', ok: () => says('js/features/butler-feature.js', 'own a home and are level 3') },
      { say: 'a Patch, a rock, a garden, a [[item:dirt_pile]], a [[item:firefly_hive]]', ok: () => {
        const defs = Object.values(CULTIVATION_CLASSES);
        return ['Patch', 'Dirt Pile', 'Firefly Hive'].every((l) => defs.some((x) => x.label === l)) && ['rock', 'garden'].every((k) => defs.some((x) => x.kind === k));
      } },
      { say: 'Things in your back yard do not count', ok: () => says('js/features/homes-feature.js', 'let backCult = createBackYardState()') },
      { say: 'press Shift+C', ok: () => says('js/client-hotkeys.js', "['Cultivation Mode', [['Shift', 'C']]") && says('js/features/homes-feature.js', "text: 'Cultivate', onclick") },
      { say: 'the price grows with each one you add', ok: () => says('js/home-cultivation.js', 'cultivation_get_img_cost: cost = (1.15 ^ every cultivated item here') },
      { say: 'a random player who opted in', ok: () => says('js/features/neighbours-mp-feature.js', 'Visit goes to a random opted-in real player') },
      { say: 'Visit Home Street', ok: () => says('js/neighbours-mp.js', "label: 'Visit Home Street'") },
      { say: 'a house key lets them inside', ok: () => says('js/features/neighbours-mp-feature.js', 'The door: Go inside with a key') },
      { say: 'needs level 4, a home and your Butler', ok: () => says('js/street-furniture.js', 'visiting_can_opt_in: level 4, a home street and an unboxed Butler') },
      { say: 'each new game day', ok: () => says('js/neighbours.js', 'makes one neighbour drop by your own home street\n * each new game day') },
    ],
  },

  /*
   * 3. Wine of the Dead. Glitch: players/player.js croak() 1305-1309 (the grave), recognizeDeath()
   * 1430-1477 (Hell One and neither quest: hell_hole; any Naraka street and hell_quest not started:
   * hell_quest; otherwise a drink_ticket); items/graveside_marker.js celebrate/mourn;
   * quests/hell_quest.js (Beelzebooze: the ticket, buy_wotd, drink_wotd, 250 iMG and 150 currants);
   * items/hell_bartender.js grantWine 333-370 (one ticket, one wine); items/wine_of_the_dead.js.
   * The remake: js/hell-tickets.js GRAVE_VISIT (the companions' visit: every croak until Beelzebooze
   * is done, then one in three, 20 to 50 seconds in), js/hell.js, js/hell-bar.js.
   */
  {
    slug: 'wine-of-the-dead',
    question: 'How do I get Wine of the Dead?',
    short: 'Wine of the Dead',
    answer: "Hell's Bartender in the Hell Bar swaps one Diabolical Drink Ticket for one Wine of the Dead, and you get a ticket when someone mourns or celebrates your grave while you are dead.",
    icon: 'item:wine_of_the_dead',
    words: 'wine of the dead wotd drink ticket diabolical drink ticket hell bartender hell bar',
    queries: ['wine of the dead', 'wine dead', 'drink ticket', 'get wine of the dead'],
    parts: [
      { h: 'Step by step', steps: [
        'Croak. When your energy runs out you die, leave a [[item:graveside_marker]] where you fell, and wake in [[streets:hell-one]] in [[places:naraka]].',
        'Wait to be recognised. While you are still dead, a companion may walk past your grave and Mourn or Celebrate it, 20 to 50 seconds after you croak. Until you finish [[quests:hell_quest]] this happens every time you croak; after that, one croak in 3. Online, another player who finds your grave can do it too.',
        'Get a ticket. The first time, you are offered [[quests:hell_hole]]: jump down the Hell Hole. Finishing it offers [[quests:hell_quest]], which gives you your first [[item:drink_ticket]]. After that, each recognition gives you a ticket.',
        'Trade it. Go to [[streets:panka-surazu]] at the far end of Naraka, step into the [[streets:hell-bar]], and choose Buy wine at [[people:hell_bartender]]. One ticket buys one bottle.',
      ] },
      { h: 'Drinking it', list: [
        'In Naraka, drinking it takes away Pooped.',
        'Drinking it among the living kills you.',
        'It does not bring you back to life: squish 11 bunches of [[item:bunch_of_grapes_hell|Hellish Grapes]] for that.',
        'Beelzebooze ends when you drink your first bottle, for 250 iMG and 150 currants.',
        'On your home street, pouring it on something you cultivated wears it out.',
      ] },
    ],
    covers: () => ['item:wine_of_the_dead', 'item:drink_ticket', 'people:hell_bartender', 'item:hell_bartender', 'quests:hell_quest', 'quests:hell_hole', 'streets:hell-bar'],
    facts: [
      { say: 'one Diabolical Drink Ticket for one Wine of the Dead', ok: () => says('js/hell-bar.js', "{ type: 'consume_item', classTsid: 'drink_ticket', count: 1 }", "{ type: 'grant_item', classTsid: 'wine_of_the_dead', count: 1 }") },
      { say: 'When your energy runs out you die', ok: () => says('js/hell.js', 'export function croak(') && says('js/features/hell-feature.js', 'shouldCroak(engine.pc') },
      { say: '20 to 50 seconds after you croak', ok: () => GRAVE_VISIT.minDelayMs === 20_000 && GRAVE_VISIT.maxDelayMs === 50_000 },
      { say: 'one croak in 3', ok: () => GRAVE_VISIT.chance === 1 / 3 && says('js/hell-tickets.js', "hellQuestStatus(opts.questState, 'hell_quest') !== 'done'") },
      { say: 'another player who finds your grave can do it too', ok: () => says('js/hell-tickets.js', 'other players see it\n * and may mourn or celebrate it once') },
      { say: 'jump down the Hell Hole', ok: () => HELL_QUESTS.hell_hole.requirement.desc === 'Jump down the Hell Hole' && HELL_QUESTS.hell_hole.onCompleteOffers === 'hell_quest' },
      { say: 'which gives you your first', ok: () => HELL_QUESTS.hell_quest.acceptedGrant.drink_ticket === 1 },
      { say: 'each recognition gives you a ticket', ok: () => says('js/hell.js', "effects.push({ type: 'grant_item', classTsid: 'drink_ticket', count: 1 });") },
      { say: 'at the far end of Naraka', ok: () => HELL_QUESTS.hell_quest.offer.includes('Hell Bar at the far end of Naraka') },
      { say: 'Buy wine', ok: () => says('js/hell-bar.js', 'Buy wine / Talk to menu') },
      { say: 'takes away Pooped', ok: () => says('js/hell.js', "{ type: 'remove_buff', buff: 'pooped' }") },
      { say: 'among the living kills you', ok: () => says('js/hell.js', 'alive -> croak') },
      { say: 'squish 11 bunches', ok: () => GRAPES_REQUIRED === 11 },
      { say: '250 iMG and 150 currants', ok: () => HELL_QUESTS.hell_quest.rewards.xp === 250 && HELL_QUESTS.hell_quest.rewards.currants === 150 && HELL_QUESTS.hell_quest.requirements.map((r) => r.flag).join() === 'buy_wotd,drink_wotd' },
      { say: 'pouring it on something you cultivated wears it out', ok: () => says('js/features/homes-feature.js', '"pour" works on your home street, on the nearest cultivated item') },
    ],
  },

  /*
   * 4. House floors and Doors. Glitch: items/furniture_door.js (base_cost 2,500; canDropAt only where
   * the house can add a door; onContainerChanged opens job_proto_door; canPickup 531-534 "You can't
   * pick up placed doors." once the project has started or the floor is built; onJobComplete
   * homes_add_floor_at), quests/job_proto_door.js (100 Planks), locations/inc_homes.js
   * homes_can_add_door 418-428 (top floor only), homes_get_expand_costs 2511-2622, config_base.js
   * MAX_FLOORS 3; catalog_recipes.js recipe 260 (the Door); main.js doFurnitureMove 7051-7106 (a
   * placed Door slides along its own floor at its own y, and the other floor's Door then leads to
   * where it stands: target_door.connect.x), HandOfDecorator.as 1269-1273 (the drag keeps to the
   * Door's own plat), inc_homes.js 741-788 (each Door of a pair has its own x). The remake:
   * js/home-floors.js (slideDoor, noteDoorMoved, doorDestination, doorLiftCheck; G1242, #634,
   * tests/g1242-door-slide.test.js), features/homes-feature.js (the move in Decoration Mode and the
   * drag outside it, G369).
   */
  {
    slug: 'house-floors',
    question: 'How do I add a floor to my house, and can I move the Doors?',
    short: 'House floors and Doors',
    answer: 'Set a Door down on the top floor of your house: that starts the Build a New Floor project, and 100 Planks finish it.',
    icon: 'item:furniture_door',
    words: 'add floor floors house upstairs new floor build a new floor door doors move door',
    queries: ['add a floor', 'move door', 'house floor', 'new floor', 'upstairs'],
    parts: [
      { h: 'Adding a floor', steps: [
        'Get a Door. No vendor sells one: make it with a [[item:construction_tool]] from 8 [[item:wood_post|Wood Posts]], 16 [[item:board|Boards]] and 20 [[item:snail|Snails]]. The recipe needs [[skills:engineering_1]] and [[skills:furnituremaking_2]].',
        'In your house, set the Door down on your top floor. That starts the Build a New Floor project.',
        'Bring 100 [[item:plank|Planks]] to the project.',
        'When it is done, the Door is the way up, and a Door down stands in the same place on the new floor. A house can have up to 3 floors.',
      ] },
      { h: 'Can I move a Door?', list: [
        'Yes, sideways: drag a placed Door left or right along its own floor, in Decoration Mode or by dragging it in your house. It stays inside the walls and never goes up, down or to another floor.',
        'Each Door of a pair keeps its own spot, and going through one lands you at the other, wherever it stands.',
        'You can only pick a Door back up before its project starts. After that, and on every finished floor, it slides but never comes up.',
      ] },
      { h: 'Making the house wider', p: [
        'Expanding works on every floor at once, so each new wall segment takes one [[item:wall_segment]] per floor. On two floors it also takes an [[item:grade_aa_earth_block]]; on three floors, 3 of them. Every fourth segment on more than one floor also takes [[item:girder|Girders]].',
      ] },
    ],
    covers: () => ['item:furniture_door'],
    facts: [
      { say: '100 Planks finish it', ok: () => { const r = json('assets/content/quests.json')[DOOR_JOB]?.requirements?.[0]; return r?.classId === 'plank' && r.num === 100; } },
      { say: 'Bring 100', ok: () => json('assets/content/quests.json')[DOOR_JOB]?.requirements?.[0]?.num === 100 },
      { say: 'No vendor sells one', ok: (d) => sellers(d, (id) => id === 'furniture_door').length === 0 },
      { say: 'from 8 [[item:wood_post|Wood Posts]], 16 [[item:board|Boards]] and 20 [[item:snail|Snails]]', ok: () => {
        const q = Object.fromEntries((doorRecipe()?.inputs || []).map((i) => [i.classTsid, i.qty]));
        return q.wood_post === 8 && q.board === 16 && q.snail === 20 && Object.keys(q).length === 3;
      } },
      { say: 'The recipe needs', ok: () => { const r = doorRecipe(); return r?.tool === 'construction_tool' && ['engineering_1', 'furnituremaking_2'].every((s) => r.skills.includes(s)); } },
      { say: 'set the Door down on your top floor', ok: () => says('js/home-floors.js', "notTop: 'A Door can only go on the top floor of your house.'") },
      { say: 'a Door down stands in the same place on the new floor', ok: () => says('js/home-floors.js', "'down' door is made at the same x on the new floor") },
      { say: 'up to 3 floors', ok: () => MAX_FLOORS === 3 },
      // G1242 (#634): home-floors.js slideDoor / noteDoorMoved, as tests/g1242-door-slide.test.js runs them.
      { say: 'drag a placed Door left or right along its own floor', ok: () => { const r = doorSlide(); return r.slid && r.sameY && r.onItsFloor; } },
      { say: 'in Decoration Mode or by dragging it in your house', ok: () => says('js/features/homes-feature.js', 'result = isDoor ? slideDoor(floors, decor,', 'Your furniture outside Decorate (register G369)') },
      { say: 'It stays inside the walls and never goes up, down or to another floor', ok: () => { const r = doorSlide(); return r.insideWalls && r.sameY && r.onItsFloor && says('js/home-floors.js', 'inside the walls (the same clamp as any piece)'); } },
      { say: 'Each Door of a pair keeps its own spot', ok: () => { const r = doorSlide(); return r.upMoved && r.downStayed; } },
      { say: 'going through one lands you at the other, wherever it stands', ok: () => { const r = doorSlide(); return r.upLandsAtDown && r.downLandsAtUp; } },
      { say: 'You can only pick a Door back up before its project starts', ok: () => {
        const fs = { upper: [{}], links: [{ floor: 0, upX: 0, downX: 0, up: 1, down: 2 }], pending: { floor: 1, id: 3 } };
        return doorLiftCheck(fs, 1, 3).ok && !doorLiftCheck(fs, 1, 3, { inProgress: true }).ok && !doorLiftCheck(fs, 0, 1).ok && !doorLiftCheck(fs, 1, 2).ok
          && !doorSlide().liftAfter;
      } },
      { say: 'one [[item:wall_segment]] per floor', ok: () => [1, 2, 3].every((n) => wallExpandItems(n, 6).wall_segment === n) },
      { say: 'On two floors it also takes an', ok: () => wallExpandItems(2, 5).grade_aa_earth_block === 1 && !wallExpandItems(1, 5).grade_aa_earth_block },
      { say: 'on three floors, 3 of them', ok: () => wallExpandItems(3, 5).grade_aa_earth_block === 3 },
      { say: 'Every fourth segment on more than one floor', ok: () => wallExpandItems(2, 3).girder === 1 && !wallExpandItems(2, 4).girder && wallExpandItems(3, 3).girder >= 2 && !wallExpandItems(1, 3).girder },
    ],
  },

  /*
   * 5. Learning time. Glitch: players/inc_skills.js skills_get_learning_time_modifier 1792-1810
   * (config.skill_learning_modifier_step 0.05: 15% for the first skill, else 1.05 to the power of the
   * skills known and queued past brain capacity), skills_increase_brain_capacity 1893-1931,
   * get_skill_info 1852-1886 (favor buys 10, 7 or 5 seconds a point by the Giant's place),
   * skills_start_acceleration 957-999 (at most half the time left), emblem_base (1,000 favor);
   * inc_imagination.js brain_capacity cards. The remake: js/imagination-effects.js 225-259,
   * js/imagination.js (capacity 20 to 60, cards of 1, 3 or 5), js/better-learning.js (G62, the
   * remake's own return of the 2011 skills), js/shrines.js, js/skills.js maxStudyAcceleration.
   */
  {
    slug: 'learning-time',
    question: 'Why does learning a skill take so long?',
    short: 'Learning time',
    answer: 'Once you know more skills than your brain capacity, which starts at 20, each skill past it makes the next one take 5% longer, and that adds up.',
    icon: 'imagination:brain_capacity',
    words: 'learning skill skills slow slower slowly long longer takes time learn faster brain capacity why',
    queries: ['skill slow', 'learning takes long', 'why learning slow', 'learn faster', 'brain capacity slow'],
    parts: [
      { h: 'How it works', list: [
        'Your very first skill takes only 15% of its usual time.',
        'Skills you know and the one you are learning count against your brain capacity of 20.',
        'Past it, the time grows by 5% for each skill over, on top of the last: 10 over is about 63% longer.',
      ] },
      { h: 'How to learn faster', list: [
        'Raise your capacity with [[imagination:brain_capacity|Brain Capacity]] cards: each adds 1, 3 or 5, up to 60. They join your Imagination hand after the [[achievements:first_eleven_skills]] achievement.',
        'Learn [[skills:betterlearning_1]] to [[skills:betterlearning_5]]: the ranks take 2%, 5%, 8%, 12% and then 20% off every skill you learn after them.',
        'Learning Speed cards take time off every skill of one kind.',
        "Spend favor at a Giant's shrine while you learn: each point takes 10 seconds off with the skill's main Giant, 7 with its second Giant and 5 with any other. One spend cuts at most half the time left. An emblem spends as 1,000 favor.",
      ] },
    ],
    covers: () => ['imagination:brain_capacity', 'skills:betterlearning_1', 'skills:betterlearning_2', 'skills:betterlearning_3', 'skills:betterlearning_4', 'skills:betterlearning_5'],
    facts: [
      { say: 'which starts at 20', ok: () => BRAIN_CAPACITY_DEFAULT === 20 },
      { say: '5% longer', ok: () => near(learningTimeModifier(21, 20), 1.05) && learningTimeModifier(20, 20) === 1 },
      { say: '15% of its usual time', ok: () => learningTimeModifier(0, 20) === 0.15 },
      { say: 'brain capacity of 20', ok: () => BRAIN_CAPACITY_DEFAULT === 20 },
      { say: 'the time grows by 5% for each skill over', ok: () => near(learningTimeModifier(22, 20), 1.05 ** 2) },
      { say: '10 over is about 63% longer', ok: () => Math.round((learningTimeModifier(30, 20) - 1) * 100) === 63 },
      { say: 'each adds 1, 3 or 5, up to 60', ok: () => BRAIN_CAPACITY_AMOUNTS.join() === '1,3,5' && BRAIN_CAPACITY_LIMIT === 60 },
      { say: 'They join your Imagination hand after the', ok: () => readImaginationCard().includes('"achievement_id": "first_eleven_skills"') },
      { say: 'take 2%, 5%, 8%, 12% and then 20%', ok: () => Object.values(BETTER_LEARNING_DISCOUNTS).join() === '0.02,0.05,0.08,0.12,0.2' },
      { say: 'Learning Speed cards take time off every skill of one kind', ok: () => says('js/imagination-effects.js', 'then the category reduction (100 - percent) / 100') },
      { say: "each point takes 10 seconds off with the skill's main Giant, 7 with its second Giant and 5 with any other", ok: () => FAVOR_STUDY_SECONDS.p === 10 && FAVOR_STUDY_SECONDS.s === 7 && FAVOR_STUDY_SECONDS.u === 5 },
      { say: 'cuts at most half the time left', ok: () => says('js/skills.js', 'return Math.max(0, Math.round(unacceleratedSeconds / 2));') },
      { say: 'An emblem spends as 1,000 favor', ok: () => EMBLEM_SPEND_FAVOR === 1000 },
    ],
  },

  /*
   * 6. Finding things. The remake's own pages (#668): the search (public/encyclopedia/search-core.js:
   * plurals folded, one typo allowed when nothing matches as typed, the "Streets with…" lists first
   * among equals) and the lists (tools/encyclopedia/street-lists.mjs). Glitch had no encyclopedia.
   */
  {
    slug: 'find-things',
    question: 'How do I find a particular resource or animal?',
    short: 'Finding things',
    answer: 'Search for it by name: the Streets with… list for it comes first, then every street whose page names it.',
    icon: 'animals:npc_salmon',
    words: 'find finding resource resources animal animals locate location where is particular',
    queries: ['find a resource', 'where animals', 'find animal', 'locate resource'],
    parts: [
      { h: 'Step by step', steps: [
        'Type its name in the [[page:encyclopedia/|Encyclopedia search]], for example [[search:salmon|salmon]] or [[search:metal rock|metal rock]]. Plurals work, and one typo is fine.',
        'Open its Streets with… list, such as the [[list:salmon|salmon list]] or the [[list:metal-rock|Metal Rock list]]: every street that has it, by region, with how many when a street has more than one.',
        'Pick a street near you. Each street page shows what lives and grows there, and the other lists it is on.',
      ] },
      { h: 'Other ways in', list: [
        'Browse [[page:encyclopedia/streets/with/|every Streets with… list]]: gardens, shrines, vendors, subway stations, rocks, trees, animals and more.',
        'An animal or item page says where to find it and what gives it, such as [[animals:npc_salmon]] and [[item:metal_rock]].',
        'The [[page:encyclopedia/subway/|subway map]] shows the street each station comes up on.',
      ] },
    ],
    covers: () => ['page:encyclopedia/streets/with/'],
    facts: [
      { say: 'Plurals work, and one typo is fine', ok: () => says('encyclopedia/search-core.js', 'so a plural finds the singular and back', 'One typo (a letter missing, extra, changed or two swapped) is allowed') },
      { say: 'the Streets with… list for it comes first', ok: () => says('encyclopedia/search-core.js', 'ties put the "Streets with…" lists first') },
      { say: 'with how many when a street has more than one', ok: () => says('../tools/encyclopedia/street-lists.mjs', "A number after a street is how many it has.") },
      { say: 'the other lists it is on', ok: () => says('../tools/encyclopedia/streets.mjs', "sub('Other streets with these'") },
    ],
  },
];

const near = (a, b) => Math.abs(a - b) < 1e-9;
/**
 * A two-floor house, its ground floor's Door slid 200 to the right and then far past the wall
 * (home-floors.js slideDoor / noteDoorMoved): what the game did, for the Door guide's facts.
 */
let slid = null;
function doorSlide() {
  if (slid) return slid;
  const ground = createHomeDecorState({ starterKit: true });
  ground.storage[DOOR_CLASS] = 1;
  const door = placeFurniture(ground, {}, DOOR_CLASS, { x: 600 }).item;
  const fs = createFloorsState();
  fs.pending = { floor: 0, id: door.id };
  const res = addFloor(fs, ground);
  const upper = fs.upper[0];
  const down = upper.placed.find((row) => row.id === res.link.down);
  const y = door.y;
  const downX = down.x;
  const a = slideDoor(fs, ground, 0, door.id, { x: 800, y: y - 300 });
  const atX = door.x;
  const wall = slideDoor(fs, ground, 0, door.id, { x: 99999, y });
  const link = fs.links[0];
  slid = {
    slid: a.ok === true && atX === 800,
    sameY: door.y === y,
    onItsFloor: ground.placed.includes(door) && !upper.placed.includes(door),
    insideWalls: wall.ok === true && door.x < 99999 && door.x <= interiorWidth(ground),
    upMoved: link.upX === door.x,
    downStayed: down.x === downX && link.downX === downX,
    upLandsAtDown: doorDestination(fs, 0, door.id)?.x === downX,
    downLandsAtUp: doorDestination(fs, 1, down.id)?.x === door.x,
    liftAfter: doorLiftCheck(fs, 0, door.id).ok || doorLiftCheck(fs, 1, down.id).ok,
  };
  return slid;
}

/** catalog_recipes.js recipe 260, the Door (public/assets/content/recipes.json). */
function doorRecipe() {
  const r = json('assets/content/recipes.json');
  const all = Array.isArray(r) ? r : Object.values(r.recipes || r);
  return all.find((x) => x?.id === '260' && x.outputs?.some((o) => o.classTsid === 'furniture_door')) || null;
}
/** The Brain Capacity card's conditions, from the game's own card data (js/imagination-data.js). */
function readImaginationCard() {
  const text = readFileSync(join(PUB, 'js/imagination-data.js'), 'utf8');
  const at = text.indexOf('"brain_capacity": {');
  return at < 0 ? '' : text.slice(at, text.indexOf('\n }', at));
}

/** Every [[key]] / [[key|words]] in a text: [{ key, words }]. */
export const linksIn = (text) => [...String(text).matchAll(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g)].map(([, key, words]) => ({ key, words: words || '' }));

/** All of a guide's text: answer, then every part, in page order. */
export const guideTexts = (g) => [g.answer, ...g.parts.flatMap((part) => [...(part.p || []), ...(part.steps || []), ...(part.list || [])])];

/** Where a link key points, from the site root ('' when it names nothing the encyclopedia builds). */
export function hrefOf(key, info) {
  const at = key.indexOf(':');
  const kind = key.slice(0, at);
  const id = key.slice(at + 1);
  if (kind === 'list') return `encyclopedia/streets/with/${id}/`;
  if (kind === 'search') return `encyclopedia/?q=${encodeURIComponent(id)}`;
  if (kind === 'page') return id;
  if (kind === 'how') return `${HOW_PATH}${id}/`;
  if (!info(key)) return '';
  return kind === 'item' ? `encyclopedia/items/${id}/` : `encyclopedia/${kind}/${id}/`;
}

/** A link's words when none are given: the page's own name. */
function nameFor(key, info, lists) {
  if (key.startsWith('list:')) return lists?.get(key.slice(5))?.title || key.slice(5);
  if (key.startsWith('how:')) return GUIDES.find((g) => g.slug === key.slice(4))?.question || key.slice(4);
  return info(key)?.name || key.slice(key.indexOf(':') + 1);
}

/** A guide's text as HTML: escaped, with its links drawn from `p` (the page's way to the site root). */
export function guideHtml(text, { p, info, lists }) {
  return esc(text).replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (m, key, words) => {
    const href = hrefOf(key, info);
    const label = esc(words || nameFor(key, info, lists));
    if (!href) throw new Error(`a guide links ${key}, which has no page`);
    return `<a href="${p}${href.replace(/&/g, '&amp;')}">${label}</a>`;
  });
}

/** A guide's text as plain words (for the search's facts and the page description). */
export function guidePlain(text, { info, lists }) {
  return String(text).replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (m, key, words) => words || nameFor(key, info, lists));
}

/**
 * Run every guide's facts against the game. Returns the failures: [{ slug, say, why }] (a fact
 * that does not hold, or one whose words are not in the guide).
 */
export function checkGuides(d) {
  const out = [];
  for (const g of GUIDES) {
    const text = guideTexts(g).join('\n');
    for (const f of g.facts) {
      if (!text.includes(f.say)) out.push({ slug: g.slug, say: f.say, why: 'not in the guide' });
      let ok = false;
      try { ok = Boolean(f.ok(d)); } catch (err) { out.push({ slug: g.slug, say: f.say, why: err.message }); continue; }
      if (!ok) out.push({ slug: g.slug, say: f.say, why: 'the game says otherwise' });
    }
  }
  return out;
}

/** The guides that link from a page (its key, or list:<slug>, or page:<path>), for its "How do I…" links. */
export function guidesFor(key, d) {
  return GUIDES.filter((g) => g.covers(d).includes(key));
}

/** The "How do I…" links a covered page shows (`p`: its way to the site root), or ''. */
export function howLinks(key, d, p) {
  const list = guidesFor(key, d);
  if (!list.length) return '';
  return `<ul class="how-links">${list.map((g) => `<li><a href="${p}${HOW_PATH}${g.slug}/">${esc(g.question)}</a></li>`).join('')}</ul>`;
}

/** Guide search entries for search.json (section "how"): the question as the name, `k` the strong words. */
export function guideEntries(info) {
  return [
    { s: 'how', id: 'all', n: HOW_TITLE, g: 'guides questions help how to', st: 'source', ic: '', h: HOW_PATH, k: 'how do i guides' },
    ...GUIDES.map((g) => ({ s: 'how', id: g.slug, n: g.question, g: g.short, st: 'source', ic: info(g.icon)?.icon?.src || '', h: `${HOW_PATH}${g.slug}/`, k: g.words })),
  ];
}

/** Each guide's facts for the search (search-core.js addFacts): its answer and every line, as plain words. */
export function guideFacts(ctx) {
  return new Map(GUIDES.map((g) => [g.slug, guideTexts(g).map((t) => guidePlain(t, ctx))]));
}
