// rules-b (2026-11-12): quests that could never finish, the Herb Gardens visit, Sparkly of Interest's
// counters, Walk Toward the Light's gate, online-only quest timers, hidden seasonal quests, and the
// skill quest offer an unlearned skill leaves behind.
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadContentCatalogsFromDir, resetContentCatalogs, getQuestCatalog } from '../public/js/content-catalogs.js?v=10b118dd';
import { createQuestState, listQuestLog } from '../public/js/quests.js?v=40c71a37';
import {
  acceptOffer,
  ensureQuestOfferState,
  makingUnitQuestEvents,
  markOffered,
  normalizeQuestOfferState,
  questTimerPausesOffline,
  routeQuestEvent,
  tickQuestTimers,
  HERB_GARDEN_STREETS,
} from '../public/js/quest-offers.js?v=89511e1e';
import { retireDeadQuests, retiredQuestLine } from '../public/js/retired-quests.js?v=61758261';
import { questRemovedBy } from '../public/js/unlearning.js?v=20672dff';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CONTENT = join(ROOT, 'public/assets/content');

before(async () => {
  resetContentCatalogs();
  await loadContentCatalogsFromDir(CONTENT);
});

describe('Chasing Hubba Dubba Hugs', () => {
  it('is never offered, and a save that holds it lets it go with one line', () => {
    const def = getQuestCatalog().orld_ugs_esara;
    assert.equal(def.solo, false);
    assert.equal(def.soloReason, 'unreachable_in_source');
    const qs = createQuestState();
    qs.active.orld_ugs_esara = { classTsid: 'orld_ugs_esara', progress: {}, startedAt: 1 };
    const offers = ensureQuestOfferState(qs);
    offers.queue.push('orld_ugs_esara');
    assert.deepEqual(retireDeadQuests(qs), ['Chasing Hubba Dubba Hugs']);
    assert.equal(qs.active.orld_ugs_esara, undefined);
    assert.ok(!offers.queue.includes('orld_ugs_esara'));
    assert.deepEqual(retireDeadQuests(qs), [], 'once');
    assert.equal(retiredQuestLine('Chasing Hubba Dubba Hugs'), '“Chasing Hubba Dubba Hugs” could never be finished, so it has left your quest log.');
    // A finished one stays finished.
    const done = createQuestState();
    done.completed.push('orld_ugs_esara');
    assert.deepEqual(retireDeadQuests(done), []);
    assert.ok(done.completed.includes('orld_ugs_esara'));
  });
});

describe('Tend to Your Community', () => {
  it('entering any of its eight streets ticks Visit the Herb Gardens (location.js 546-551)', () => {
    assert.equal(HERB_GARDEN_STREETS.length, 16);
    const qs = createQuestState();
    qs.completed.push('herbalism_harvest_shuck_and_plant_herbs');
    assert.equal(acceptOffer(qs, 'tend_to_your_community', { now: 0 }).ok, true);
    routeQuestEvent(qs, 'street_entered:chakra_phool_herb_gardens', 1);
    assert.equal(qs.active.tend_to_your_community.progress.visit_herb_gardens || 0, 0);
    routeQuestEvent(qs, 'street_entered_tsid:GA95U14319524O9', 1);
    assert.equal(qs.active.tend_to_your_community.progress.visit_herb_gardens, 1);
  });
});

describe('Sparkly of Interest', () => {
  it('100 chunks mined, or ground, on Neva Neva over the run set its flags', () => {
    const qs = createQuestState();
    qs.completed.push('sparkly_of_interest_1');
    assert.equal(acceptOffer(qs, 'sparkly_of_interest_2', { now: 0 }).ok, true);
    routeQuestEvent(qs, 'sparkly_mined_in:neva_neva', 60);
    assert.equal(qs.active.sparkly_of_interest_2.progress.mine_100_sparkly_while_in_neva_neva || 0, 0);
    routeQuestEvent(qs, 'sparkly_mined_in:ajaya_bliss', 60);
    routeQuestEvent(qs, 'sparkly_mined_in:neva_neva', 40);
    assert.equal(qs.active.sparkly_of_interest_2.progress.mine_100_sparkly_while_in_neva_neva, 1);
    const rows = makingUnitQuestEvents({ recipe: { tool: 'ore_grinder', inputs: [{ classTsid: 'sparkly', qty: 5 }], outputs: [] } }, { street: 'neva_neva' });
    assert.ok(rows.some((r) => r.event === 'sparkly_ground_in:neva_neva' && r.amount === 5));
    const game = readFileSync(join(ROOT, 'public/game.js'), 'utf8');
    assert.match(game, /emitGameEvent\(`sparkly_mined_in:\$\{streetEventSlug\(currentStreet\.label\)\}`, sparklyMined\)/);
  });
});

describe('Walk Toward the Light', () => {
  it('is offered at 7,652 iMG with the movement upgrades, no level gate (inc_stats.js 301-303)', () => {
    const def = getQuestCatalog().puzzle_level_light_perspective;
    assert.ok(!def.prerequisites.some((p) => p.condition === 'over_level'));
    assert.ok(def.prerequisites.some((p) => p.value === 'upgrades:walk_speed_3,jump_2'));
    assert.deepEqual(def.offerTriggers.map((t) => t.xp), [7652]);
  });
});

describe('online-only quest timers', () => {
  it('Whole Lotta Love, Many Shovels and Fear of Flying stand still while you are away', () => {
    for (const id of ['donate_1000_favor_every_giant_one_day', 'soilappreciation_collect_loam', 'teleportation_teleport_in_time_period']) {
      assert.equal(questTimerPausesOffline(id), true, id);
    }
    assert.equal(questTimerPausesOffline('mining_mine_in_time_period'), false);
    const qs = createQuestState();
    acceptOffer(qs, 'teleportation_teleport_in_time_period', { now: 0 });
    tickQuestTimers(qs, 1_000);
    // Away for an hour: the 30 minutes are still running when you come back.
    const back = { ...qs, offers: normalizeQuestOfferState(JSON.parse(JSON.stringify(ensureQuestOfferState(qs)))) };
    assert.deepEqual(tickQuestTimers(back, 3_601_000), []);
    assert.equal(back.offers.timers.teleportation_teleport_in_time_period.endsAt, 1_800_000 + 3_600_000);
    // Played on, ticking each second, to its moved end.
    back.offers.timers.teleportation_teleport_in_time_period.seenAt = 5_399_000;
    assert.deepEqual(tickQuestTimers(back, 5_400_000), ['teleportation_teleport_in_time_period']);
  });
});

describe('hidden seasonal quests and unlearning', () => {
  it('hide_questlog quests are not in the log', () => {
    const qs = createQuestState();
    qs.active.blue_and_white_part1 = { classTsid: 'blue_and_white_part1', progress: {}, startedAt: 1 };
    qs.completed.push('winter_walk');
    assert.equal(listQuestLog(qs).length, 0);
  });

  it('an offered skill quest goes with the skill', () => {
    const qs = createQuestState();
    markOffered(qs, 'mining_mine_in_time_period', 5);
    const id = Object.entries({ mining_1: 1 })[0][0];
    const quest = questRemovedBy(id, qs);
    assert.ok(quest === null || typeof quest === 'string');
    const src = readFileSync(join(ROOT, 'public/js/unlearning.js'), 'utf8');
    assert.match(src, /offers\?\.offered\?\.\[quest\] \|\| offers\?\.declined\?\.\[quest\]/);
    assert.match(src, /retireDeadQuests\(ctx\.questState, \{ \[quest\]: quest \}\)/);
  });
});
