/**
 * G571: a player with the rocks for Dullite, Beryl and Sparkly (mining_mine_rocks, offered by the
 * Magic Rock on learning Mining I, turned in through it) who had not accepted the quest got no word
 * why nothing happened. Now, when the pack holds everything an offered quest wants, the game says
 * to accept it first (js/quest-offers.js readyOfferedQuests, features/quest-offers-feature.js
 * nudgeReadyOffers). The original said nothing: quests_changed_item (inc_quests.js 107-116) only
 * counts accepted quests.
 */
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadContentCatalogsFromDir, resetContentCatalogs, getQuestCatalog } from '../public/js/content-catalogs.js?v=10b118dd';
import { createQuestState } from '../public/js/quests.js?v=40c71a37';
import { acceptOffer, declineOffer, markOffered, readyOfferText, readyOfferedQuests } from '../public/js/quest-offers.js?v=d18bee8b';

const root = join(import.meta.dirname, '..');
const ROCKS = { dullite: 17, beryl: 13, sparkly: 11 };

before(async () => {
  resetContentCatalogs();
  await loadContentCatalogsFromDir(join(root, 'public/assets/content'));
});

describe('G571: items in hand for an offered quest not yet accepted', () => {
  it('Mining 2 is Dullite, Beryl and Sparkly: the rocks the Magic Rock takes', () => {
    const def = getQuestCatalog().mining_mine_rocks;
    assert.equal(def.title, 'Dullite, Beryl and Sparkly');
    assert.equal(def.familiarTurnin, true);
    assert.deepEqual(Object.fromEntries(def.requirements.map((r) => [r.classId, r.num])), ROCKS);
  });

  it('is ready once every rock is in the pack, waiting or put off, and not once accepted', () => {
    const qs = createQuestState();
    markOffered(qs, 'mining_mine_rocks', 1000);
    assert.deepEqual(readyOfferedQuests(qs, { dullite: 17, beryl: 13, sparkly: 10 }), [], 'one short');
    const ready = readyOfferedQuests(qs, { ...ROCKS, pick: 1 });
    assert.deepEqual(ready.map((r) => [r.classTsid, r.putOff]), [['mining_mine_rocks', false]]);
    // Not startable, so it cannot be put off now; a save from before G229 may hold it declined (the log accepts it).
    declineOffer(qs, 'mining_mine_rocks', 2000);
    assert.deepEqual(readyOfferedQuests(qs, ROCKS).map((r) => [r.classTsid, r.putOff]), [['mining_mine_rocks', true]]);
    assert.equal(acceptOffer(qs, 'mining_mine_rocks', { inv: { ...ROCKS } }).ok, true);
    assert.deepEqual(readyOfferedQuests(qs, ROCKS), [], 'accepted: it turns in on its own');
  });

  it('a quest that is not offered, or wants more than items, or hands in at an NPC, is never nudged', () => {
    const qs = createQuestState();
    assert.deepEqual(readyOfferedQuests(qs, ROCKS), [], 'never offered');
    const catalog = getQuestCatalog();
    const counterQuest = Object.keys(catalog).find((id) => catalog[id].requirements?.length && catalog[id].requirements.every((r) => r.type === 'counter'));
    markOffered(qs, counterQuest, 1);
    assert.deepEqual(readyOfferedQuests(qs, { pick: 99 }), []);
    const npcItem = Object.keys(catalog).find((id) => (catalog[id].endNpcs || []).length && !catalog[id].familiarTurnin && catalog[id].requirements?.length && catalog[id].requirements.every((r) => r.type === 'item'));
    if (npcItem) {
      markOffered(qs, npcItem, 2);
      const inv = Object.fromEntries(catalog[npcItem].requirements.map((r) => [r.classId, r.num]));
      assert.deepEqual(readyOfferedQuests(qs, inv), [], npcItem);
    }
  });

  it('says where to accept it, plainly', () => {
    const def = getQuestCatalog().mining_mine_rocks;
    assert.equal(readyOfferText({ def, putOff: false }), "You have everything for “Dullite, Beryl and Sparkly”, but you haven't accepted that quest yet. Accept it from your quest log (Q). Your Magic Rock takes them once you do.");
    assert.match(readyOfferText({ def, putOff: true }), /Accept it in the Offered tab of your quest log \(Q\)\./);
    for (const putOff of [false, true]) assert.doesNotMatch(readyOfferText({ def, putOff }), /—|Glitch/);
  });

  it('the feature nudges once per quest while it stays ready, after each pack sync', () => {
    const src = readFileSync(join(root, 'public/js/features/quest-offers-feature.js'), 'utf8');
    assert.match(src, /finish\(sync\.completable, engine\);\n\s+nudgeReadyOffers\(engine, now\);/);
    const fn = src.slice(src.indexOf('function nudgeReadyOffers'), src.indexOf('/** QuestsDialog.as updateCountToast'));
    assert.match(fn, /if \(!ids\.has\(id\)\) nudgedReady\.delete\(id\)/, 'ready again after the rocks go: told again');
    assert.match(fn, /if \(nudgedReady\.has\(row\.classTsid\)\) continue;/);
    assert.match(fn, /engine\.toast\?\.\(text, 6000\);\n\s+engine\.pushActivity\(text\);/);
  });
});
