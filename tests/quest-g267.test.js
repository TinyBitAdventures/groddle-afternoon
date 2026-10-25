/**
 * G267: quest follow-ups.
 *
 * - The home's yes / no questions are confirms with two buttons (wine_of_the_dead.js
 *   187-199, CultManager.as 119-126, HouseStylesDialog.as 113-118,
 *   HouseExpandDialog.as 202-209), not Magic Rock quest offers.
 * - location.js 2666-2671: is_race / is_game locations set no_starting_quests
 *   (races-feature answers for the race courses, the Hog Haul and the Game of Crowns).
 * - The Firefly Whistle offer is startable (firefly_whistle.js 52): two buttons,
 *   "Not right now" puts it in the log with the G229 line.
 * - Go Moloko Loco, Butterfly Style is Animal Kinship IV's offer
 *   (inc_data_skills.js 235, 3915), timed and startable: no longer assigned at boot,
 *   and an old save's boot copy is dropped.
 * - World-verb counters skip offer-system quests that the badge event already routes
 *   (one pet, milk or watering counted once, not twice).
 * - Timer buffs lead the buff strip (BuffViewManager.as 57).
 */
import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { getQuestCatalog, loadContentCatalogsFromDir, resetContentCatalogs } from '../public/js/content-catalogs.js';
import { applyQuestProgress, createQuestState } from '../public/js/quests.js';
import {
  BOOT_STARTER_LEFTOVERS,
  acceptOffer,
  dropBootStarterQuests,
  ensureQuestOfferState,
  routeQuestEvent,
  routesCounter,
} from '../public/js/quest-offers.js';
import { racesFeature } from '../public/js/features/races-feature.js?v=card-15';
import { raceSceneTsid } from '../public/js/races.js?v=races-4';
import { HOG_HAUL_STREET_ID } from '../public/js/hog-haul.js?v=hog-haul-2';
import { CROWNS_STREET } from '../public/js/game-of-crowns.js?v=crowns-1';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = join(ROOT, 'public');
const read = (p) => readFileSync(join(PUBLIC, p), 'utf8');
const GSJS = join(ROOT, '..', 'glitch-GameServerJS');
const CLIENT = join(ROOT, '..', 'glitch-client', 'com', 'tinyspeck', 'engine');
const MOLOKO = 'animalkinship_milk_butterflies';

before(async () => {
  resetContentCatalogs();
  await loadContentCatalogsFromDir(join(PUBLIC, 'assets/content'));
});

describe('home confirms have two buttons and are not quest offers', () => {
  const src = read('js/features/homes-feature.js');

  it('homes-feature asks no question through offerQuestDialogue', () => {
    assert.equal((src.match(/offerQuestDialogue/g) || []).length, 0);
    assert.match(src, /function confirmDialog\(engine, \{ title, kicker, beats, yes, no, onYes \}\) \{\n  engine\.scriptedDialogue\(\{[\s\S]*?cancelable: true,/);
    // The four questions: pour, style, the placement warning, un-expand.
    assert.equal((src.match(/^\s+confirmDialog\(engine, \{/gm) || []).length, 4);
  });

  it('the placement warning uses the client confirm wording', { skip: !existsSync(CLIENT) && 'glitch-client not beside the spike' }, () => {
    const cult = readFileSync(join(CLIENT, 'port/CultManager.as'), 'utf8');
    assert.ok(cult.includes("warning_cdVO.title = 'Are you sure?';"));
    assert.ok(cult.includes("{value: true, label: 'Yes, Do It!!'}"));
    assert.ok(cult.includes("{value: false, label: 'No, Forget It'}"));
    assert.match(src, /title: 'Are you sure\?', yes: 'Yes, Do It!!', no: 'No, Forget It'/);
  });
});

describe('no_starting_quests in races and games (location.js 2666-2671)', () => {
  const engineAt = (tsid) => ({ streetTsid: tsid });

  it('race courses, the Hog Haul and the Game of Crowns arena', () => {
    assert.equal(racesFeature.noStartingQuests(engineAt(raceSceneTsid('race_1'))), true);
    assert.equal(racesFeature.noStartingQuests(engineAt(HOG_HAUL_STREET_ID)), true);
    assert.equal(racesFeature.noStartingQuests(engineAt(CROWNS_STREET)), true);
  });

  it('null elsewhere, so party spaces and others can answer', () => {
    assert.equal(racesFeature.noStartingQuests(engineAt('LCR10K3BPJK1U6F')), null);
  });

  it('the source sets it for is_race and is_game', { skip: !existsSync(GSJS) && 'GSJS not beside the spike' }, () => {
    const loc = readFileSync(join(GSJS, 'locations/location.js'), 'utf8');
    assert.match(loc, /if \(this\.is_race \|\| this\.is_game\)\{[\s\S]{0,140}geo\.no_starting_quests = true;/);
  });
});

describe('Firefly Whistle offer', () => {
  it('is startable and an emergency, so it has two buttons and the rays', () => {
    const def = getQuestCatalog().firefly_whistle;
    assert.equal(def.needsStart, true);
    assert.equal(def.isEmergency, true);
  });

  it('"Not right now" puts it in the log with the G229 line', () => {
    const src = read('js/features/resource-nodes-feature.js');
    assert.ok(!src.includes('from your quest log later'));
    assert.ok(src.includes('is in your quest log, not started yet. Choose Try it there when you are ready.'));
    assert.match(src, /declinable: startable,/);
    assert.match(src, /putOffOffer\(engine\.questState, FIREFLY_WHISTLE_QUEST/);
    assert.match(src, /markOffered\(engine\.questState, FIREFLY_WHISTLE_QUEST/);
  });

  it('no other offer still uses the old line', () => {
    for (const file of ['js/features/resource-nodes-feature.js', 'js/features/hell-tickets-feature.js', 'js/features/quest-offers-feature.js']) {
      assert.ok(!read(file).includes('from your quest log later'), file);
    }
  });
});

describe('Go Moloko Loco, Butterfly Style', () => {
  it('is Animal Kinship IV\'s timed, startable offer', () => {
    const def = getQuestCatalog()[MOLOKO];
    assert.equal(def.needsStart, true);
    assert.equal(def.timer.buff, 'go_moloko_loco');
    assert.deepEqual(def.offerTriggers, [{ type: 'skill', skill: 'animalkinship_4' }]);
    assert.deepEqual(BOOT_STARTER_LEFTOVERS, [MOLOKO]);
  });

  it('game.js no longer assigns it at boot, and drops an old save\'s copy', () => {
    const game = read('game.js');
    assert.ok(!game.includes(`assignQuest(questState, '${MOLOKO}'`));
    assert.match(game, /rehydrateSavedBuffs\(\);\n\s+dropBootStarterQuests\(questState\);/);
  });

  it('drops the boot copy (active, not managed, no timer)', () => {
    const qs = createQuestState();
    qs.active[MOLOKO] = { classTsid: MOLOKO, progress: { butterflies_milked: 2 }, startedAt: 1 };
    assert.equal(dropBootStarterQuests(qs), true);
    assert.equal(qs.active[MOLOKO], undefined);
    assert.equal(dropBootStarterQuests(qs), false);
  });

  it('keeps one the familiar handed out', () => {
    const qs = createQuestState();
    assert.equal(acceptOffer(qs, MOLOKO, { now: 1000 }).ok, true);
    assert.ok(ensureQuestOfferState(qs).timers[MOLOKO]);
    assert.equal(dropBootStarterQuests(qs), false);
    assert.ok(qs.active[MOLOKO]);
  });
});

describe('world-verb counters count an offer-system quest once', () => {
  it('routesCounter knows the routed counters and the legacy aliases', () => {
    assert.equal(routesCounter('milk_butterfly'), true);
    assert.equal(routesCounter('pet_piggy'), true);
    assert.equal(routesCounter('trees_watered'), true);
    // Not routed by the offer system: game.js keeps counting these itself.
    assert.equal(routesCounter('squeeze_chicken'), false);
    assert.equal(routesCounter('harvest_tree'), false);
  });

  it('a milk counts once for a managed quest, and the legacy path still counts a boot quest', () => {
    const qs = createQuestState();
    acceptOffer(qs, MOLOKO, { now: Date.now() });
    qs.active.animalkinship_pet_piggies = { classTsid: 'animalkinship_pet_piggies', progress: { piggies_petted: 0 }, startedAt: 1 };
    // The badge counter reaches quest-offers-feature onEvent ...
    routeQuestEvent(qs, 'npc_butterfly:milk', 1, { managedOnly: true });
    // ... and game.js's world-verb path runs for the same milk.
    applyQuestProgress(qs, 'milk_butterfly', 1, null, { skipManaged: routesCounter('milk_butterfly') });
    assert.equal(qs.active[MOLOKO].progress.butterflies_milked, 1);
    applyQuestProgress(qs, 'pet_piggy', 1, null, { skipManaged: routesCounter('pet_piggy') });
    assert.equal(qs.active.animalkinship_pet_piggies.progress.piggies_petted, 1, 'an unmanaged quest still counts here');
  });

  it('game.js passes skipManaged on the world-verb counter', () => {
    assert.match(read('game.js'), /applyQuestProgress\(questState, questEvent, 1, pc, \{ skipManaged: routesCounter\(questEvent\) \}\)/);
  });
});

describe('timer buffs lead the buff strip (BuffViewManager.as 57)', () => {
  it('renderBuffStrip sorts isTimer first', () => {
    assert.match(read('game.js'), /listPendingBuffs\(buffState, now\)\]\n\s+\.sort\(\(a, b\) => Number\(Boolean\(b\.def\?\.isTimer\)\) - Number\(Boolean\(a\.def\?\.isTimer\)\)\)/);
  });

  it('the client adds a running timer buff at the front', { skip: !existsSync(CLIENT) && 'glitch-client not beside the spike' }, () => {
    const mgr = readFileSync(join(CLIENT, 'view/gameoverlay/BuffViewManager.as'), 'utf8');
    assert.ok(mgr.includes('active_holder.addChildAt(buff_ui, buff.is_timer && buff.remaining_duration > 0 ? 0 :'));
  });
});
