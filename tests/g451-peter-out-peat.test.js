/**
 * G451, Austin's ruling 2026-11-07: Peter out Peat stays as the original, works online and is not
 * offered in solo (quests/bogspecialization_harvest_full_peat_bog_in_time_period.js 67-92,
 * items/catalog_buffs.js 149-169). The server's half is groddle-afternoon-server objects_peat.go
 * (TestPeterOutPeat).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import { PEAT_ANSWER_GRACE_MS, PEAT_EVENT, PEAT_FULL, PEAT_QUEST, PEAT_REACH, PEAT_TEXT, fullBogNear, retireSoloPeatQuest } from '../public/js/peat-quest.js?v=c7baea41';
import { MULTIPLAYER_QUESTS, creditedMultiplayerQuests } from '../public/js/quests-mp.js?v=1fc5ff58';
import { ensureQuestOfferState, tickQuestTimers } from '../public/js/quest-offers.js?v=89511e1e';
import { peatQuestMpFeature } from '../public/js/features/peat-quest-mp-feature.js?v=f8f6ad90';
import { FEATURES } from '../public/js/features/index.js?v=7d8b4c97';

const root = join(import.meta.dirname, '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');
const quest = read('../glitch-GameServerJS/quests/bogspecialization_harvest_full_peat_bog_in_time_period.js');
const catalog = JSON.parse(read('public/assets/content/quests.json'));
const node = (x, y, units, classTsid = 'peat_1') => ({ key: `${classTsid}:0`, classTsid, node: { units }, target: { sprite: { x, y } } });

describe('G451 Peter out Peat', () => {
  it('keeps the source rules', () => {
    assert.match(quest, /stack\.getInstanceProp\('harvests_remaining'\) == 4/);
    assert.equal(PEAT_FULL, 4);
    assert.match(quest, /pc\.findCloseStack\(is_bog, 100\)/);
    assert.equal(PEAT_REACH, 100);
    assert.ok(quest.includes(`error: '${PEAT_TEXT.notClose}'`));
    assert.ok(quest.includes(`bog.sendBubble('${PEAT_TEXT.call}', ${PEAT_TEXT.callMs})`));
    assert.equal(catalog[PEAT_QUEST].timer.durationSec, 9);
    for (const line of Object.values(PEAT_TEXT)) assert.doesNotMatch(String(line), /—/);
  });

  it('is multiplayer only: solo no longer offers it, online it is credited', () => {
    assert.equal(catalog[PEAT_QUEST].solo, false);
    assert.equal(catalog[PEAT_QUEST].soloReason, 'needs_other_players');
    assert.deepEqual([...catalog[PEAT_QUEST].offerTriggers.map((t) => t.skill)], ['bogspecialization_1'], 'Bog Specialization I still offers it');
    assert.equal(MULTIPLAYER_QUESTS[PEAT_QUEST].offer, 'source');
    assert.ok(creditedMultiplayerQuests().includes(PEAT_QUEST));
  });

  it('the event the quest waits for is in the route table, and the feature is registered', () => {
    assert.match(read('public/js/quest-offers.js'), new RegExp(`counter: 'peat_bog_fully_harvested', event: '${PEAT_EVENT}'`));
    assert.ok(FEATURES.includes(peatQuestMpFeature));
  });

  it('finds only a full bog within 100 px', () => {
    assert.equal(fullBogNear([node(150, 500, 4)], 100, 500)?.classTsid, 'peat_1');
    assert.equal(fullBogNear([node(150, 500, 3)], 100, 500), null, 'three left is no full bog');
    assert.equal(fullBogNear([node(201, 500, 4)], 100, 500), null, 'too far');
    assert.equal(fullBogNear([node(150, 500, 4, 'dirt_pile')], 100, 500), null, 'not a bog');
    assert.equal(fullBogNear([node(180, 500, 4), node(120, 500, 4)], 100, 500).target.sprite.x, 120, 'the nearest');
  });

  it('the start asks: solo never, online with the source refusal when no full bog is near', () => {
    assert.equal(peatQuestMpFeature.questStartGate(PEAT_QUEST, {}, { mode: 'solo' }), null);
    assert.equal(peatQuestMpFeature.questStartGate('some_other_quest', {}, { mode: 'multiplayer' }), null);
    const said = [];
    const engine = { mode: 'multiplayer', player: { x: 0, y: 0 }, setData() {}, query: (name) => (name === 'streetResourceNodes' ? [node(900, 0, 4)] : null) };
    assert.equal(peatQuestMpFeature.questStartGate(PEAT_QUEST, { go: () => said.push('go'), refuse: (m) => said.push(m) }, engine), true);
    assert.deepEqual(said, [PEAT_TEXT.notClose]);
  });

  it('the timer waits for the server\'s word past its 9 s, then fails it', () => {
    const qs = { active: { [PEAT_QUEST]: { progress: {} } } };
    const offers = ensureQuestOfferState(qs);
    offers.timers[PEAT_QUEST] = { startedAt: 0, endsAt: 9000, graceUntil: 9000 + PEAT_ANSWER_GRACE_MS };
    assert.deepEqual(tickQuestTimers(qs, 9500), [], 'waiting for bog_test');
    assert.deepEqual(tickQuestTimers(qs, 9000 + PEAT_ANSWER_GRACE_MS), [PEAT_QUEST]);
    assert.ok(offers.failed[PEAT_QUEST]);
  });

  it('a solo save that held it lets it go, with one line; a save that never did is left alone', () => {
    assert.equal(retireSoloPeatQuest({ active: {}, offers: { queue: [], offered: {}, declined: {} } }), false);
    const qs = { active: { [PEAT_QUEST]: { progress: {} }, other: { progress: {} } }, completed: [] };
    const offers = ensureQuestOfferState(qs);
    offers.managed[PEAT_QUEST] = true;
    offers.failed[PEAT_QUEST] = 5;
    offers.timers[PEAT_QUEST] = { startedAt: 0, endsAt: 1 };
    assert.equal(retireSoloPeatQuest(qs), true);
    assert.equal(qs.active[PEAT_QUEST], undefined);
    assert.ok(qs.active.other, 'other quests stay');
    assert.equal(offers.managed[PEAT_QUEST], undefined);
    assert.equal(offers.failed[PEAT_QUEST], undefined);
    assert.equal(offers.timers[PEAT_QUEST], undefined);
    assert.equal(retireSoloPeatQuest(qs), false, 'once');
    // Put off with "Not right now": the log card goes too.
    const put = { active: {} };
    ensureQuestOfferState(put).declined[PEAT_QUEST] = 7;
    assert.equal(retireSoloPeatQuest(put), true);
    assert.equal(put.offers.declined[PEAT_QUEST], undefined);
    // Only waiting to be offered: gone without a word.
    const queued = { active: {} };
    ensureQuestOfferState(queued).queue.push(PEAT_QUEST);
    assert.equal(retireSoloPeatQuest(queued), false);
    assert.deepEqual(queued.offers.queue, []);
  });
});
