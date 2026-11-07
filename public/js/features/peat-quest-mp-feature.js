/**
 * Peter out Peat between real players (register G451; the rules and words are js/peat-quest.js, the
 * server's half groddle-afternoon-server objects_peat.go). Multiplayer only: quest-offers-feature
 * asks questStartGate before it starts the quest, as the source's onStarted could refuse, and the
 * server says whether the bog is full and the player close (bog_started). A bog everyone hears
 * "Empty me out! Go!" from (bog_call), and at the end of the 9 s the server says what the bog holds
 * (bog_test): no harvests left is the quest's flag; otherwise its timer runs out, and Try again
 * starts it over, as failQuest did.
 *
 * Solo: the quest is not offered (quests.json solo:false), and quest-offers-feature takes it out
 * of a save that already held it (js/peat-quest.js retireSoloPeatQuest).
 *
 * QA: canvas data peatQuest (the last step: asked, started, refused, emptied, not_emptied).
 */

import { ensureQuestOfferState } from '../quest-offers.js?v=f0fe957c';
import { nodeId } from '../street-objects.js?v=355069d7';
import { PEAT_ANSWER_GRACE_MS, PEAT_EVENT, PEAT_QUEST, PEAT_TEXT, fullBogNear } from '../peat-quest.js?v=c7baea41';

export const PEAT_QUEST_FEATURE_ID = 'peat-quest-mp';

let bound = null;
let reqSeq = 0;
/** The start the server has yet to answer: { req, go, refuse }. */
let asking = null;

function note(engine, text) {
  engine.setData?.('peatQuest', text);
}

function bind(engine) {
  const client = engine.query?.('realtimeClient');
  if (!client || bound === client) return client;
  bound = client;
  client.on('msg:bog_started', (m) => {
    const a = asking;
    if (!a || a.req !== m?.req) return;
    asking = null;
    if (m.ok !== true) {
      note(engine, 'refused');
      a.refuse(String(m.message || PEAT_TEXT.notClose));
      return;
    }
    note(engine, 'started');
    a.go();
    // The server's word ends the quest, a trip after its timer: the timer waits for it.
    const timer = ensureQuestOfferState(engine.questState).timers?.[PEAT_QUEST];
    if (timer) timer.graceUntil = Number(timer.endsAt) + PEAT_ANSWER_GRACE_MS;
  });
  client.on('msg:bog_call', (m) => {
    if (!m || m.street !== engine.streetTsid) return;
    const row = (engine.query?.('streetResourceNodes', engine) || []).find((n) => nodeId(n.key) === m.id);
    if (row?.target) engine.say?.(row.target, PEAT_TEXT.call, PEAT_TEXT.callMs);
  });
  client.on('msg:bog_test', (m) => {
    if (!engine.questState?.active?.[PEAT_QUEST]) return;
    if (m?.emptied === true) {
      note(engine, 'emptied');
      engine.achievement?.(PEAT_EVENT, 1);
    } else {
      note(engine, 'not_emptied');
      // on_remove 163-164: not done, failQuest. The timer ends now.
      const timer = ensureQuestOfferState(engine.questState).timers?.[PEAT_QUEST];
      if (timer) {
        timer.endsAt = 0;
        timer.graceUntil = 0;
      }
    }
    engine.save?.();
    engine.updateHud?.();
  });
  client.on('state', ({ state }) => {
    if (state === 'online' || !asking) return;
    const a = asking;
    asking = null;
    a.refuse(PEAT_TEXT.noServer);
  });
  return client;
}

export const peatQuestMpFeature = {
  id: PEAT_QUEST_FEATURE_ID,

  onTick(dtMs, now, engine) {
    if (engine.mode === 'multiplayer' && engine.started) bind(engine);
  },

  /**
   * quest-offers-feature, before Peter out Peat starts: onStarted's check. { go, refuse } are how
   * it goes on, once the server has answered. Null for any other quest (and in solo).
   */
  questStartGate(classTsid, gate, engine) {
    if (classTsid !== PEAT_QUEST || engine?.mode !== 'multiplayer') return null;
    const client = bind(engine);
    const p = engine.player;
    const row = p ? fullBogNear(engine.query?.('streetResourceNodes', engine), p.x, p.y) : null;
    if (!row) {
      note(engine, 'refused');
      gate.refuse(PEAT_TEXT.notClose);
      return true;
    }
    if (asking) return true;
    reqSeq += 1;
    const req = reqSeq;
    if (!client?.send?.('bog_start', { req, id: nodeId(row.key) })) {
      gate.refuse(PEAT_TEXT.noServer);
      return true;
    }
    asking = { req, go: gate.go, refuse: gate.refuse };
    note(engine, 'asked');
    return true;
  },
};
