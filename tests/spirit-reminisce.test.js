/**
 * G562: the memory repeats (blue_and_white_part2, winter_walk_part2,
 * an_autumn_day_part2) come only from a Street Spirit's reminisce verb
 * (GSJS items/street_spirit.js 207-245), never from the Magic Rock or the
 * quest log's Offered tab, and a save holding one there loses it.
 */
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadContentCatalogsFromDir, resetContentCatalogs, getQuestCatalog } from '../public/js/content-catalogs.js?v=10b118dd';
import { createQuestState } from '../public/js/quests.js?v=c8d9d0a4';
import { ensureQuestOfferState, npcQuestOffers, pendingQuestOffers, waitingOffers } from '../public/js/quest-offers.js?v=a304c912';
import {
  REMINISCE_VERB,
  SPIRIT_REMINISCE_TEXT,
  SPIRIT_REPEAT_QUESTS,
  dropSpiritRepeatOffers,
  isStreetSpiritClass,
  spiritReminisceOffers,
  withReminisceVerb,
} from '../public/js/spirit-reminisce.js?v=c6d5ef8e';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const gsjs = join(root, '../glitch-GameServerJS');
const read = (p) => readFileSync(join(root, p), 'utf8');

before(async () => {
  resetContentCatalogs();
  await loadContentCatalogsFromDir(join(root, 'public/assets/content'));
});

describe('G562: the reminisce verb', () => {
  it('uses the source verb, wording and order', () => {
    assert.deepEqual(SPIRIT_REPEAT_QUESTS, ['blue_and_white_part2', 'winter_walk_part2', 'an_autumn_day_part2']);
    assert.equal(REMINISCE_VERB.id, 'reminisce');
    assert.equal(REMINISCE_VERB.label, 'reminisce');
    assert.equal(REMINISCE_VERB.tooltip, 'A remembering');
    assert.equal(SPIRIT_REMINISCE_TEXT.choose, "I've got something for you...");
    assert.equal(SPIRIT_REMINISCE_TEXT.accept, "Ok, I'll do it!");
    assert.equal(SPIRIT_REMINISCE_TEXT.decline, 'Not right now');
    for (const text of Object.values(SPIRIT_REMINISCE_TEXT)) assert.ok(!text.includes('—'), text);
  });

  it('matches GameServerJS where it is cloned', { skip: !existsSync(join(gsjs, 'items/street_spirit.js')) }, () => {
    const src = readFileSync(join(gsjs, 'items/street_spirit.js'), 'utf8');
    const verb = src.slice(src.indexOf('verbs.reminisce'), src.indexOf('verbs.buy_sell'));
    assert.match(verb, /"name"\s*:\s*"reminisce"/);
    assert.match(verb, /"tooltip"\s*:\s*"A remembering"/);
    for (const id of SPIRIT_REPEAT_QUESTS) assert.ok(verb.includes(`quests.offered['${id}']`), id);
    const talk = src.slice(src.indexOf('verbs.talk_to'));
    for (const id of SPIRIT_REPEAT_QUESTS) assert.ok(talk.includes(`delete quests.offered['${id}']`), id);
    for (const id of SPIRIT_REPEAT_QUESTS) {
      const quest = readFileSync(join(gsjs, `quests/${id}.js`), 'utf8');
      assert.match(quest, /var hide_questlog = 1;/, id);
      assert.match(quest, /var is_repeatable = 1;/, id);
    }
    assert.match(readFileSync(join(gsjs, 'items/street_spirit_groddle.js'), 'utf8'), /"got_quest_text"\s*:\s*"I've got something for you\.\.\."/);
  });

  it('shows only when a repeat can be offered, Summer and Winter after their first part', () => {
    const done = new Set(['blue_and_white_part1']);
    const all = () => true;
    assert.deepEqual(spiritReminisceOffers({ canOffer: all, done: (id) => done.has(id) }), ['blue_and_white_part2', 'an_autumn_day_part2']);
    done.add('winter_walk');
    assert.deepEqual(spiritReminisceOffers({ canOffer: all, done: (id) => done.has(id) }), SPIRIT_REPEAT_QUESTS);
    assert.deepEqual(spiritReminisceOffers({ canOffer: (id) => id === 'winter_walk_part2', done: (id) => done.has(id) }), ['winter_walk_part2']);
    assert.deepEqual(spiritReminisceOffers({ canOffer: () => false, done: () => true }), []);

    const verbs = [{ id: 'browse', sort: 10 }, { id: 'talk_to', sort: 20 }];
    assert.equal(withReminisceVerb(verbs, []), null, 'no offer: the verb is not in the menu (state null)');
    const menu = withReminisceVerb(verbs, ['winter_walk_part2']);
    assert.deepEqual(menu.map((v) => v.id), ['reminisce', 'browse', 'talk_to']);
    assert.equal(menu[0].enabled, true);
    assert.equal(withReminisceVerb(menu, ['winter_walk_part2']), null, 'never added twice');
    assert.ok(isStreetSpiritClass('street_spirit_groddle') && isStreetSpiritClass('street_spirit_groceries') && isStreetSpiritClass('street_spirit'));
    assert.ok(!isStreetSpiritClass('npc_piggy'));
  });
});

describe('G562: no Magic Rock offer and no Offered entry', () => {
  it('gives An Autumn Day\'s repeat the Street Spirit giver only', () => {
    const def = getQuestCatalog().an_autumn_day_part2;
    assert.ok(def.offerTriggers.length > 0);
    assert.ok(def.offerTriggers.every((t) => t.type === 'npc' && /^street_spirit/.test(t.npc)), JSON.stringify(def.offerTriggers));
    assert.ok(def.prerequisites.some((p) => p.value === 'hour_after:an_autumn_day'), 'canOffer 73-87: the hour waits');
    assert.equal(def.hideQuestlog, true);
  });

  it('never offers a repeat from the Magic Rock, however long since the first parts', () => {
    const qs = createQuestState();
    qs.completed.push('blue_and_white_part1', 'winter_walk', 'an_autumn_day', ...SPIRIT_REPEAT_QUESTS);
    const ctx = { level: 60, xp: 1e9, customPrereq: () => true, includeCustom: true };
    const familiar = pendingQuestOffers(qs, { xp: 1e9 }, ctx).map((r) => r.classTsid);
    for (const id of SPIRIT_REPEAT_QUESTS) assert.ok(!familiar.includes(id), id);
  });

  it('lets a Street Spirit offer An Autumn Day\'s repeat when its hour is up, and not before', () => {
    const qs = createQuestState();
    qs.completed.push('blue_and_white_part1', 'an_autumn_day');
    const offered = (hourUp) => npcQuestOffers(qs, 'street_spirit_groddle', { xp: 1e9 }, { level: 60, customPrereq: () => hourUp })
      .offered.map((c) => c.classTsid);
    assert.ok(offered(true).includes('an_autumn_day_part2'));
    assert.ok(!offered(false).includes('an_autumn_day_part2'));
    assert.ok(!npcQuestOffers(qs, 'npc_piggy', { xp: 1e9 }, { level: 60, customPrereq: () => true }).offered.some((c) => c.classTsid === 'an_autumn_day_part2'));
  });

  it('drops a repeat a save left in Offered, put off or queued, and nothing else', () => {
    const qs = createQuestState();
    const offers = ensureQuestOfferState(qs);
    offers.offered.an_autumn_day_part2 = 100;
    offers.offered.animalkinship_milk_butterflies = 101;
    offers.declined.winter_walk_part2 = 102;
    offers.queue.push('blue_and_white_part2', 'top_of_tree');
    qs.completed.push('an_autumn_day');
    assert.deepEqual(waitingOffers(qs).map((r) => r.classTsid), ['an_autumn_day_part2', 'animalkinship_milk_butterflies']);
    assert.deepEqual(dropSpiritRepeatOffers(qs), SPIRIT_REPEAT_QUESTS);
    assert.deepEqual(waitingOffers(qs).map((r) => r.classTsid), ['animalkinship_milk_butterflies']);
    assert.deepEqual(Object.keys(offers.declined), []);
    assert.deepEqual(offers.queue, ['top_of_tree']);
    assert.deepEqual(dropSpiritRepeatOffers(qs), [], 'a clean save is left alone');
  });

  it('wires the verb, the log and the save clean-up in the game', () => {
    const game = read('public/game.js');
    const log = game.slice(game.indexOf('function appendStoryQuestOffers('), game.indexOf('function appendQuestEncyclopediaLink('));
    assert.match(log, /SPIRIT_REPEAT_QUESTS\.includes\(classTsid\)\) continue;/);
    const boot = game.slice(game.indexOf('dropBootStarterQuests(questState);'));
    assert.match(boot.slice(0, 500), /dropSpiritRepeatOffers\(questState\);/);
    const feature = read('public/js/features/street-spirits-feature.js');
    assert.match(feature, /decorateVerbs\(target, verbs, engine\)/);
    assert.match(feature, /verbId === 'reminisce' && isStreetSpiritClass/);
    // Summer and Winter open with the source's buttons from the spirit, Autumn through the offer engine.
    assert.match(feature, /openStoryQuestOffer\?\.\(id, \{ kicker, acceptLabel: SPIRIT_REMINISCE_TEXT\.accept/);
    assert.match(feature, /acceptOffer\(engine\.questState, id, reminisceCtx\(engine\)\)/);
  });
});
