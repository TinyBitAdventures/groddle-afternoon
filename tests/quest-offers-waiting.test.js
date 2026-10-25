/**
 * G225: ordinary Magic Rock offers wait in the quest log with a count and open
 * inside the Quests dialog; only is_emergency offers pop on the street, with
 * no close (QuestsDialog.as 131-138, 222-252, 335-360; QuestConversationUI.as
 * 147-155; QuestManager.as 115-143).
 */
import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadContentCatalogsFromDir, resetContentCatalogs } from '../public/js/content-catalogs.js';
import { createQuestState } from '../public/js/quests.js';
import { questStatus, waitingOffers } from '../public/js/quest-offers.js';
import { questCountToast, questOffersFeature, showWaitingOffer } from '../public/js/features/quest-offers-feature.js?v=offers-9';

const PUBLIC = join(dirname(fileURLToPath(import.meta.url)), '../public');
const read = (p) => readFileSync(join(PUBLIC, p), 'utf8');

before(async () => {
  resetContentCatalogs();
  await loadContentCatalogsFromDir(join(PUBLIC, 'assets/content'));
});

function offerEngine({ level = 5, skills = [], params = {} } = {}) {
  const data = {};
  const dialogs = [];
  const sounds = [];
  const engine = {
    started: true,
    data,
    dialogs,
    sounds,
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
    playSound: (id) => sounds.push(id),
    setData: (k, v) => {
      data[k] = v;
    },
    updateHud() {},
    refreshPack() {},
    save() {},
    pushActivity() {},
    award() {},
  };
  return engine;
}

describe('G225 waiting quest offers', () => {
  it('words the Quests dialog toast as QuestsDialog.updateCountToast did', () => {
    assert.deepEqual(questCountToast(0), { count: 0, text: '', button: 'Show me' });
    assert.deepEqual(questCountToast(1), { count: 1, text: 'You have 1 new quest', button: 'Show me' });
    assert.deepEqual(questCountToast(3), { count: 3, text: 'You have 3 new quests', button: 'Show me one' });
  });

  it('pops an emergency offer on the street with no close, and an ordinary one waits', () => {
    // Level 2 + Alchemy: buy_bag (an emergency) first, then ordinary offers.
    const engine = offerEngine({ level: 2, skills: ['alchemy_1'] });
    questOffersFeature.init(engine);
    const t0 = Date.now();
    questOffersFeature.onTick(16, t0 + 12_500, engine);
    assert.equal(engine.dialogs.length, 1, 'the emergency pops');
    assert.equal(engine.dialogs[0].urgent, true);
    assert.equal(engine.dialogs[0].inLog, false);
    assert.equal(engine.data.questOfferCard, 'buy_bag:street');
    // Closed by force without an answer: it shows again on the next check (onEmergencyTick).
    engine.dialogOpen = false;
    questOffersFeature.onTick(16, t0 + 12_600, engine);
    assert.equal(questStatus(engine.questState, 'buy_bag'), 'offered');
    questOffersFeature.onTick(16, t0 + 43_000, engine);
    assert.equal(engine.dialogs.length, 2);
    assert.equal(engine.dialogs[1].title, engine.dialogs[0].title);
    engine.dialogs[1].onAccept();
    engine.dialogOpen = false;
    assert.equal(questStatus(engine.questState, 'buy_bag'), 'active');
  });

  it('puts an ordinary offer in the log with a count, opens it from "Show me", and keeps it on close', () => {
    const engine = offerEngine({ level: 2, skills: ['alchemy_1'] });
    questOffersFeature.init(engine);
    const qs = engine.questState;
    // Skip the emergency so the next offer is an ordinary one.
    qs.completed.push('buy_bag');
    questOffersFeature.onTick(16, Date.now() + 1_000, engine);
    assert.equal(engine.data.questOffersWaiting, '0');
    questOffersFeature.onTick(16, Date.now() + 12_500, engine);
    assert.equal(engine.dialogs.length, 0, 'nothing pops on the street');
    const waiting = waitingOffers(qs);
    assert.equal(waiting.length, 1);
    assert.equal(waiting[0].emergency, false);
    assert.equal(engine.data.questOffersWaiting, '1');
    assert.ok(engine.sounds.includes('QUEST_ADDED'), 'the count rises with QUEST_ADDED');
    assert.equal(showWaitingOffer(engine), true);
    assert.equal(engine.dialogs.length, 1);
    assert.equal(engine.dialogs[0].inLog, true);
    assert.equal(engine.dialogs[0].urgent, false);
    assert.equal(engine.data.questOfferCard, `${waiting[0].classTsid}:log`);
    assert.equal(showWaitingOffer(engine), false, 'one card at a time');
    // The X / Escape: the card goes, the offer keeps waiting.
    engine.dialogOpen = false;
    questOffersFeature.onTick(16, Date.now() + 13_000, engine);
    assert.equal(questStatus(qs, waiting[0].classTsid), 'offered');
    assert.equal(engine.data.questOffersWaiting, '1');
    // Show me again, then accept.
    showWaitingOffer(engine);
    engine.dialogs[1].onAccept();
    engine.dialogOpen = false;
    assert.equal(questStatus(qs, waiting[0].classTsid), 'active');
    assert.equal(engine.data.questOffersWaiting, '0');
    assert.equal(engine.data.questOfferResult, 'accepted');
  });

  it('pops ordinary offers again with &questofferpop=1 (older QA routes)', () => {
    const engine = offerEngine({ level: 2, skills: ['alchemy_1'], params: { questofferpop: '1' } });
    questOffersFeature.init(engine);
    engine.questState.completed.push('buy_bag');
    questOffersFeature.onTick(16, Date.now() + 12_500, engine);
    assert.equal(engine.dialogs.length, 1);
    assert.equal(engine.dialogs[0].inLog, false);
    assert.equal(engine.dialogs[0].urgent, false);
  });

  it('wires the game side: no Escape for street emergencies, the X keeps a log offer waiting', () => {
    const game = read('game.js');
    assert.match(game, /questDialogueState\?\.urgent === true && !questDialogueState\.inLog && opts\.cancel !== true && opts\.force !== true/);
    assert.match(game, /closeQuestDialogue\(\{ cancel: questDialogueState\?\.inLog !== true, force: questDialogueState\?\.inLog === true \}\)/);
    assert.match(game, /if \(!inLog\) closeQuestPanel\(\);/);
    assert.match(game, /function questLogCardSpot\(modal\) \{/);
    const css = read('style.css');
    assert.match(css, /\.quest-btn-count \{[^}]*background: #b21f00/);
    assert.match(css, /\.quest-dialogue\[data-look="familiar"\]\[data-in-log="true"\] \.quest-dialogue-card \{[^}]*left: var\(--fam-log-x, 10px\)/);
  });
});
