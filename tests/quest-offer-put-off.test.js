/**
 * G229: "Not right now" is the source's accept without start. quest.js
 * get_status 1102-1124 gives a startable quest (onStarted) accept_and_start
 * and accept (button_decline); every other quest only accept. Plain accept
 * leaves the quest in the log not started (main.js 6034-6049) until "Try it"
 * (QuestElementUI.as 224-232).
 */
import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { getQuestCatalog, loadContentCatalogsFromDir, resetContentCatalogs } from '../public/js/content-catalogs.js?v=g403-1';
import { createQuestState } from '../public/js/quests.js';
import {
  acceptOffer,
  listDeclinedOffers,
  markOffered,
  offerCanWait,
  pendingQuestOffers,
  putOffOffer,
  questOfferCard,
  questStatus,
} from '../public/js/quest-offers.js?v=g403-1';
import { questOffersFeature, showWaitingOffer } from '../public/js/features/quest-offers-feature.js?v=g425-1';

const PUBLIC = join(dirname(fileURLToPath(import.meta.url)), '../public');
const read = (p) => readFileSync(join(PUBLIC, p), 'utf8');

before(async () => {
  resetContentCatalogs();
  await loadContentCatalogsFromDir(join(PUBLIC, 'assets/content'));
});

function offerEngine({ level = 5, skills = [], params = {} } = {}) {
  const data = {};
  const dialogs = [];
  const activity = [];
  return {
    started: true,
    data,
    dialogs,
    activity,
    dialogOpen: false,
    pc: { level, xp: 0, energy: 50, mood: 50, imagination: 0, currants: 0, giantFavor: {} },
    inv: {},
    learnedSkills: skills,
    unlockedAchievements: [],
    shrineState: {},
    questState: createQuestState(),
    street: { tsid: 'GLI2V0UN7RD1T2J', hubId: '56', label: 'Hechey Track' },
    streetTsid: 'GLI2V0UN7RD1T2J',
    param: (k) => params[k] ?? null,
    activeBuffIds: () => [],
    streetCardUp: () => false,
    screenFxScreenUp: () => false,
    busy: () => false,
    questOffersHeld: () => false,
    questDialogueOpen() {
      return this.dialogOpen;
    },
    offerQuestDialogue(opts) {
      this.dialogOpen = true;
      dialogs.push(opts);
    },
    playSound() {},
    setData: (k, v) => {
      data[k] = v;
    },
    updateHud() {},
    refreshPack() {},
    save() {},
    pushActivity: (line) => activity.push(line),
    award() {},
  };
}

describe('G229 quest offers: "Not right now" puts a startable quest in the log', () => {
  it('only startable quests (onStarted) can wait; their custom button_decline labels are all startable', () => {
    const cat = getQuestCatalog();
    assert.equal(offerCanWait(cat.ezcooking_1), true);
    assert.equal(offerCanWait(cat.blending_make_level1_recipes), false);
    assert.equal(questOfferCard('ezcooking_1').startable, true);
    assert.equal(questOfferCard('blending_make_level1_recipes').startable, false);
    // build-quests keeps button_decline only when it differs: an_autumn_day "Nah", btc_room_3, ...
    const custom = Object.values(cat).filter((def) => def.declineLabel);
    assert.ok(custom.length >= 5);
    for (const def of custom) assert.equal(def.needsStart, true, `${def.classTsid} has a decline label`);
  });

  it('putOffOffer records the quest as put off (in the log, not started) and refuses plain quests', () => {
    const qs = createQuestState();
    markOffered(qs, 'ezcooking_1', 5);
    assert.deepEqual(putOffOffer(qs, 'ezcooking_1', 6), { ok: true, status: 'declined' });
    assert.ok(!qs.active.ezcooking_1, 'not started: no progress counts yet');
    assert.deepEqual(listDeclinedOffers(qs).map((r) => r.classTsid), ['ezcooking_1']);
    assert.ok(!pendingQuestOffers(qs, null, { skills: ['ezcooking_1'], level: 5 }).some((r) => r.classTsid === 'ezcooking_1'), 'never offered again');
    // Try it: accept, which starts it.
    assert.equal(acceptOffer(qs, 'ezcooking_1', { now: 7 }).ok, true);
    assert.equal(questStatus(qs, 'ezcooking_1'), 'active');
    assert.equal(listDeclinedOffers(qs).length, 0);
    // A quest with no onStarted cannot be put off.
    markOffered(qs, 'blending_make_level1_recipes', 8);
    assert.equal(putOffOffer(qs, 'blending_make_level1_recipes', 9).reason, 'not_startable');
    assert.equal(questStatus(qs, 'blending_make_level1_recipes'), 'offered');
  });

  it('the card of a plain quest has only its accept button', () => {
    const engine = offerEngine({ level: 3, skills: ['blending_1'] });
    questOffersFeature.init(engine);
    markOffered(engine.questState, 'blending_make_level1_recipes', Date.now());
    assert.equal(showWaitingOffer(engine), true);
    const card = engine.dialogs.at(-1);
    assert.equal(card.declinable, false);
    assert.equal(card.onDecline, null);
    card.onAccept();
    assert.equal(questStatus(engine.questState, 'blending_make_level1_recipes'), 'active');
  });

  it('"Not right now" on a startable quest leaves it in the log with a truthful line', () => {
    const engine = offerEngine({ level: 5, skills: ['ezcooking_1'] });
    questOffersFeature.init(engine);
    markOffered(engine.questState, 'ezcooking_1', Date.now());
    assert.equal(showWaitingOffer(engine), true);
    const card = engine.dialogs.at(-1);
    assert.equal(card.declinable, true);
    assert.equal(card.declineLabel, 'Not right now');
    card.onDecline();
    engine.dialogOpen = false;
    assert.equal(engine.data.questOfferResult, 'putoff');
    assert.equal(questStatus(engine.questState, 'ezcooking_1'), 'declined');
    assert.equal(engine.data.questOffersPutOff, '1');
    assert.equal(engine.data.questOffersWaiting, '0', 'no longer a new quest');
    assert.match(engine.activity.at(-1), /is in your quest log, not started yet\. Choose Try it there/);
    assert.doesNotMatch(engine.activity.at(-1), /—/);
    // Node has no document: the log cards are built in the browser only.
    assert.deepEqual(questOffersFeature.questLogCards(engine), []);
  });

  it('wires the game side: an offer with no decline hides the button, the log asks for put-off cards', () => {
    const game = read('game.js');
    assert.match(game, /onCancel: declinable === false \? null : onDecline/);
    assert.match(game, /\|\| questDialogueState\.noDecline === true;/);
    assert.match(game, /const putOff = features\.collect\('questLogCards', engine\);/);
    const feature = read('js/features/quest-offers-feature.js');
    assert.match(feature, /go\.textContent = def\.needsStart \? 'Try it' : def\.acceptLabel/);
    assert.doesNotMatch(feature, /from your quest log later/);
  });
});
