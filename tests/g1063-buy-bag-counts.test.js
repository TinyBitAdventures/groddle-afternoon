/**
 * G1063 (#556): Enlarge Yer Slots (buy_bag) stayed at "Purchase a Generic Bag 0/1" after a Generic
 * Bag was bought. Since G979 game.js started it with assignQuest, so the run was never marked
 * managed, and the offer engine routes events for managed runs only (quest-offers-feature
 * questContext managedOnly): the vendor buy never reached it. Runs are now accepted as the engine
 * accepts them, and a run started that way is adopted on load.
 *
 * Austin 2026-11-20: when the quest starts, or a save loads with it at 0, a Generic or Bigger Bag
 * beyond the tutorial's two counts as the purchase (a remake change: Glitch counted only a purchase
 * made while it ran, inc_stores.js 224-225, and started it at the first skill,
 * learn_first_skill.js 74-76).
 */
import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadContentCatalogsFromDir } from '../public/js/content-catalogs.js?v=b6a173ae';
import { createQuestState, assignQuest } from '../public/js/quests.js?v=15aab2e3';
import {
  FIRST_SKILL_QUEST_ID,
  TUTORIAL_GENERIC_BAGS,
  acceptOffer,
  claimFirstSkillQuest,
  genericBagsOwned,
  routeQuestEvent,
  settleFirstSkillQuest,
  turnInQuest,
} from '../public/js/quest-offers.js?v=36e610b5';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CONTENT = join(ROOT, 'public/assets/content');
const read = (rel) => readFileSync(join(ROOT, 'public', rel), 'utf8');
const progress = (qs) => qs.active[FIRST_SKILL_QUEST_ID]?.progress?.generic_bag_purchased ?? null;
// The offer engine's own routing context (quest-offers-feature questContext).
const engineCtx = (inv) => ({ inv, managedOnly: true, pc: { currants: 0, xp: 0, energy: 50, mood: 50 } });

/** As game.js startFirstSkillQuest now does: the first skill claims it, then the engine's accept. */
function startAtFirstSkill(inv) {
  const qs = createQuestState();
  assert.equal(claimFirstSkillQuest(qs, { skills: 1 }), true);
  assert.equal(acceptOffer(qs, FIRST_SKILL_QUEST_ID, { inv, now: 1 }).ok, true);
  return qs;
}

/** A save from v0.48.0 to v0.52.0: started with assignQuest, never marked managed. */
function oldRun() {
  const qs = createQuestState();
  claimFirstSkillQuest(qs, { skills: 1 });
  assignQuest(qs, FIRST_SKILL_QUEST_ID, { ignorePrereq: true });
  return qs;
}

describe('G1063: Enlarge Yer Slots counts the bag', () => {
  before(async () => { await loadContentCatalogsFromDir(CONTENT); });

  it('a Generic Bag bought with the first-skill run going counts through the engine (#556)', () => {
    const qs = startAtFirstSkill({ bag_generic: 1 });
    const r = routeQuestEvent(qs, 'vendor_bought:bag_generic', 1, engineCtx({ bag_generic: 2 }));
    assert.equal(progress(qs), 1);
    assert.deepEqual(r.completable.map((row) => [row.classTsid, row.turnIn]), [[FIRST_SKILL_QUEST_ID, 'familiar']]);
  });

  it('a run an older build started is adopted on load, then a coloured bag bought counts', () => {
    const qs = oldRun();
    routeQuestEvent(qs, 'vendor_bought:bag_generic', 1, engineCtx({}));
    assert.equal(progress(qs), 0, 'the report: the engine passed it by');
    const s = settleFirstSkillQuest(qs, { bag_generic: 1 }, { countOwned: true, now: 5 });
    assert.equal(s.adopted, true);
    assert.equal(s.credited, false, 'one bag owned is not beyond the tutorial\'s two');
    assert.equal(settleFirstSkillQuest(qs, {}, { countOwned: true }).adopted, false, 'once');
    routeQuestEvent(qs, 'vendor_bought:bag_generic_blue', 1, engineCtx({}));
    assert.equal(progress(qs), 1);
  });

  it('started with three bags: 1/1 and ready for the familiar', () => {
    const inv = { bag_generic: 1, bag_bigger: 2 };
    assert.equal(genericBagsOwned(inv), 3);
    assert.equal(TUTORIAL_GENERIC_BAGS, 2);
    const qs = startAtFirstSkill(inv);
    const s = settleFirstSkillQuest(qs, inv, { countOwned: true });
    assert.equal(s.credited, true);
    assert.equal(progress(qs), 1);
    assert.deepEqual(s.completable.map((row) => [row.classTsid, row.turnIn]), [[FIRST_SKILL_QUEST_ID, 'familiar']]);
    assert.equal(turnInQuest(qs, FIRST_SKILL_QUEST_ID, { currants: 0, xp: 0, energy: 50, mood: 50 }, { inv }).ok, true);
    assert.ok(qs.completed.includes(FIRST_SKILL_QUEST_ID));
  });

  it('started with two bags: 0/1, and a bag gained later by other means does not count', () => {
    const qs = startAtFirstSkill({ bag_generic: 2 });
    let s = settleFirstSkillQuest(qs, { bag_generic: 2 }, { countOwned: true });
    assert.equal(s.credited, false);
    assert.equal(progress(qs), 0);
    assert.deepEqual(s.completable, []);
    // Mid-run (no start, no load) a third bag from a trade or the mail is not a purchase.
    s = settleFirstSkillQuest(qs, { bag_generic: 2, bag_generic_pink: 1 }, { countOwned: false });
    assert.equal(progress(qs), 0);
    // Other bags (toolboxes, cabinets) are not generic bags (inc_stores.js 99).
    s = settleFirstSkillQuest(qs, { bag_generic: 2, bag_toolbox_red: 1, bag_elemental_pouch: 1 }, { countOwned: true });
    assert.equal(progress(qs), 0);
  });

  it('a save loaded with the run at 0 and a third bag already owned: credited, then turned in', () => {
    const qs = oldRun();
    const inv = { bag_generic: 2, bag_bigger_green: 1 };
    const s = settleFirstSkillQuest(qs, inv, { countOwned: true, now: 9 });
    assert.equal(s.adopted, true);
    assert.equal(s.credited, true);
    assert.equal(progress(qs), 1);
    assert.equal(s.completable.length, 1);
    assert.equal(turnInQuest(qs, FIRST_SKILL_QUEST_ID, { currants: 0, xp: 0, energy: 50, mood: 50 }, { inv }).ok, true);
    // Nothing to settle once it is done.
    assert.deepEqual(settleFirstSkillQuest(qs, inv, { countOwned: true }), { adopted: false, credited: false, completable: [] });
  });

  it('game.js accepts it as the engine does; the engine settles each run once per page, at its start or on load', () => {
    const game = read('game.js');
    const fn = game.slice(game.indexOf('function startFirstSkillQuest()'), game.indexOf('function handleSkillCompletions('));
    assert.match(fn, /acceptOffer\(questState, FIRST_SKILL_QUEST_ID, \{ inv, countItem, addItem, now: Date\.now\(\) \}\)/);
    assert.doesNotMatch(fn, /assignQuest\(/);
    const feature = read('js/features/quest-offers-feature.js');
    assert.match(feature, /const countOwned = bagRunCounted !== \(bagRun\.startedAt \?\? 0\);/);
    assert.match(feature, /settleFirstSkillQuest\(qs, engine\.inv, \{ \.\.\.questContext\(engine, now\), countOwned \}\)/);
    assert.match(feature, /finish\(bags\.completable, engine\);/);
    assert.match(feature, /init\(engine\) \{[\s\S]*bagRunCounted = null;/);
  });
});
