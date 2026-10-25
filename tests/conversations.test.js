/**
 * Conversations (register G189): every conversation an animal, tree, rock,
 * peat bog, barnacle, patch or shrine tells, checked line by line against
 * Tiny Speck's GameServerJS; the gates and chains that lead to the four
 * shrine conversations the Street Spirits wait on; the shared record's
 * rules (players/inc_conversations.js); and the hand-over of the spirits'
 * old saved ledger.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { CONVERSATIONS, TELLERS } from '../public/js/conversations-data.js?v=g189-1';
import {
  CONVERSATION_RULES,
  adoptLegacyTalks,
  canDoChain,
  canOfferConversation,
  completeConversation,
  conversationBeats,
  conversationRecord,
  gateCheck,
  hasCompleted,
  hasOffered,
  mergeRecords,
  normalizeRecord,
  offerFor,
  offerRules,
  offeredForClass,
  offeredForItem,
  prerequisitesOf,
  recordOffer,
  resetConversationRecord,
  restoreConversationRecord,
  talkableFor,
} from '../public/js/conversations.js?v=g189-1';
import { SPIRIT_CONVERSATIONS, TALK_CLASSES, TALK_ORDER, UNBUILT_GATES, canOffer as spiritCanOffer, offerNext } from '../public/js/street-spirit-talks.js?v=g189-1';
import { GIANT_ICON_DATA } from '../public/js/giant-icons-data.js';
import { buildConversations } from '../tools/build-conversations.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const GSJS = join(ROOT, '../glitch-GameServerJS');
const item = (name) => readFileSync(join(GSJS, 'items', `${name}.js`), 'utf8');
const SHRINE_GATES = ['facts_of_the_giants_4', 'voicemail_of_the_giants_3', 'rituals_of_the_giants_3', 'from_the_books_of_the_giants_3'];
const M = 60 * 1000;

/** Independent of the build: one conversation_run_<id> body's title, lines, answers and completion. */
function gsjsRun(src, id) {
  const start = src.indexOf(`function conversation_run_${id}(`);
  assert.ok(start >= 0, id);
  const body = src.slice(start, src.indexOf('\n}\n', start));
  const str = (raw) => JSON.parse(`"${raw}"`);
  const title = str(body.match(/var conversation_title = "((?:[^"\\]|\\.)*)"/)[1]);
  const answers = [...body.matchAll(/= \{txt: "((?:[^"\\]|\\.)*)", value: '([\w-]+)'\};/g)].map((m) => ({ txt: str(m[1]), value: m[2] }));
  const lines = [...body.matchAll(/this\.conversation_(?:start|reply)\(pc, (?:msg, )?"((?:[^"\\]|\\.)*)", choices\['(\d+)'\]/g)].map((m) => str(m[1]));
  const calls = (body.match(/this\.conversation_(?:start|reply)\(/g) || []).length;
  const complete = body.match(/if \(msg\.choice == "([\w-]+)"\)\{\s*pc\.conversations_complete\(this\.class_tsid, conversation_id, chain\);/)?.[1];
  return { title, answers, lines, calls, complete, body };
}

function gsjsCanoffer(src, id) {
  const start = src.indexOf(`function conversation_canoffer_${id}(`);
  const body = src.slice(start, src.indexOf('\n}\n', start));
  const chain = body.match(/id: "(\w+)",\s*level: (\d+),\s*max_level: (\d+)/);
  return {
    after: [...body.matchAll(/conversations_has_completed\(null, "(\w+)"\)/g)].map((m) => m[1]),
    level: Number(body.match(/pc\.stats\.level >= (\d+)/)?.[1] || 0),
    quest: body.match(/getQuestStatus\("(\w+)"\) == 'done'/)?.[1] || '',
    chain: chain ? { id: chain[1], level: Number(chain[2]), max: Number(chain[3]) } : null,
  };
}

/** Every item class with a non-empty `var conversations` list and its ids. */
function gsjsLists() {
  const out = {};
  for (const f of readdirSync(join(GSJS, 'items')).filter((n) => n.endsWith('.js'))) {
    const src = readFileSync(join(GSJS, 'items', f), 'utf8');
    const m = src.match(/^var conversations = \[([\s\S]*?)\];/m);
    if (!m) continue;
    const ids = [...m[1].matchAll(/"(\w+)"/g)].map((x) => x[1]);
    if (ids.length) out[f.slice(0, -3)] = { ids, src };
  }
  return out;
}

test.describe('conversation text against GameServerJS (G189)', () => {
  test('the data is the build of the source as it stands', () => {
    const built = buildConversations(GSJS);
    assert.deepEqual(JSON.parse(JSON.stringify(TELLERS)), JSON.parse(JSON.stringify(built.tellers)));
    assert.deepEqual(JSON.parse(JSON.stringify(CONVERSATIONS)), JSON.parse(JSON.stringify(built.convos)));
    assert.equal(Object.keys(CONVERSATIONS).length, 79);
  });

  test('every step is verbatim, for every teller that lists it', () => {
    let steps = 0;
    for (const def of Object.values(CONVERSATIONS)) {
      for (const cls of def.tellers) {
        const want = gsjsRun(item(cls), def.id);
        assert.equal(def.title, want.title, `${def.id} @ ${cls}`);
        assert.equal(want.calls, want.lines.length, `${def.id}: every line parsed`);
        assert.deepEqual(def.steps.map((s) => s.text), want.lines, `${def.id} @ ${cls}`);
        assert.deepEqual(def.steps.map((s) => s.choice), want.answers.map((a) => a.txt), `${def.id} @ ${cls}`);
        assert.deepEqual(want.answers.map((a) => a.value), def.steps.map((_, i) => `${def.id}-${i}-2`), `${def.id}: one answer per step`);
        assert.equal(want.complete, `${def.id}-${def.steps.length - 1}-2`, `${def.id}: the last answer completes it`);
      }
      assert.deepEqual(conversationBeats(def.id), def.steps.map((s) => ({ text: s.text, response: s.choice })));
      steps += def.steps.length;
      // The source range starts at the canoffer and ends at the run's closing brace.
      const [file, range] = def.source.split(' ');
      const [from, to] = range.split('-').map(Number);
      const lines = readFileSync(join(GSJS, file), 'utf8').split('\n');
      assert.match(lines[from - 1], new RegExp(`^function conversation_canoffer_${def.id}\\(`), def.id);
      assert.equal(lines[to - 1], '}', def.id);
    }
    assert.equal(steps, 433);
  });

  test('gates and chains are the canoffer functions', () => {
    for (const def of Object.values(CONVERSATIONS)) {
      for (const cls of def.tellers) {
        const want = gsjsCanoffer(item(cls), def.id);
        assert.deepEqual([...def.gate.after], want.after, def.id);
        assert.equal(def.gate.level, want.level, def.id);
        assert.equal(def.gate.quest, want.quest, def.id);
        assert.deepEqual(def.chain ? { ...def.chain } : null, want.chain, def.id);
      }
      for (const after of def.gate.after) assert.ok(CONVERSATIONS[after], `${def.id} waits on ${after}`);
    }
  });

  test('the one reward: 250 Cherries on the third answer of The Surfeit of Cherries 3', () => {
    const rewards = Object.values(CONVERSATIONS).flatMap((d) => d.steps.map((s, i) => (s.reward ? `${d.id}:${i}:${JSON.stringify(s.reward)}` : '')).filter(Boolean));
    assert.deepEqual(rewards, ['surfeit_of_cherries_3:2:{"item":"cherry","count":250}']);
    const { body } = gsjsRun(item('trant_fruit'), 'surfeit_of_cherries_3');
    assert.match(body, /if \(\(msg\.choice == "surfeit_of_cherries_3-2-2"\) && \(!replay\)\)\{\s*if \(this\.isOnGround\(\)\)\{\s*var val = pc\.createItemFromSource\("cherry", 250 \* msg\.count, this\);/);
    // No other built conversation gives anything.
    for (const def of Object.values(CONVERSATIONS)) {
      for (const cls of def.tellers) {
        const { body: b } = gsjsRun(item(cls), def.id);
        if (def.id !== 'surfeit_of_cherries_3') assert.doesNotMatch(b, /\(!replay\)|stats_add|createItem|achievements_/, def.id);
      }
    }
  });

  test('teller lists are each class’s `var conversations`, and the Talk to lookup is the source’s', () => {
    for (const [cls, t] of Object.entries(TELLERS)) {
      const src = item(cls);
      const m = src.match(/^var conversations = \[([\s\S]*?)\];/m);
      assert.deepEqual([...t.list], [...m[1].matchAll(/"(\w+)"/g)].map((x) => x[1]), cls);
      const talk = src.slice(src.indexOf('verbs.talk_to = {'), src.indexOf('};', src.indexOf('verbs.talk_to = {')));
      assert.equal(t.talk, /conversations_offered_for_item\(this\)/.test(talk) ? 'item' : 'class', cls);
      assert.equal(t.talk === 'item', cls.startsWith('npc_shrine_'), cls);
      assert.match(src, /pc\.conversations_offer\(this, conversations\[i\]\)/, cls);
    }
  });

  test('every GameServerJS conversation is built, kept by its own system, or listed as not built', () => {
    const icons = new Set(Object.values(GIANT_ICON_DATA).flatMap((g) => g.conversations.map((c) => c.id)));
    // Classes whose conversations run outside the offer system (quest NPCs: no canoffer) or never reach a player.
    const NOT_BUILT = {
      npc_kitty_chicken: 'offers the chicken conversations, but its talk_to is always hidden',
      npc_test: 'test class',
      test_item3: 'test class',
    };
    for (const [cls, { ids, src }] of Object.entries(gsjsLists())) {
      const lore = ids.filter((id) => src.includes(`function conversation_canoffer_${id}(`));
      if (!lore.length) continue; // quest NPC dialogue (bag_butler, npc_letterblock ...): no canoffer
      for (const id of lore) {
        const home = CONVERSATIONS[id] ? 'data' : SPIRIT_CONVERSATIONS[id] ? 'spirit' : icons.has(id) ? 'icon' : '';
        if (NOT_BUILT[cls]) {
          assert.ok(CONVERSATIONS[id] || id === 'rime_of_the_barnacle_1', `${cls} ${id}`);
          continue;
        }
        assert.ok(home, `${cls}: ${id} is not built`);
        if (home === 'data') assert.ok(CONVERSATIONS[id].tellers.includes(cls), `${cls} tells ${id}`);
      }
    }
  });
});

test.describe('the chain to the shrine conversations', () => {
  test('43 conversations lead to the four shrine gates, starting from the chickens, piggies, Bubble Trees and the rocks', () => {
    const chain = new Set();
    for (const g of SHRINE_GATES) {
      chain.add(g);
      for (const id of prerequisitesOf(g)) chain.add(id);
    }
    assert.equal(chain.size, 43);
    const roots = [...chain].filter((id) => !CONVERSATIONS[id].gate.after.length).sort();
    assert.deepEqual(roots, [
      'brief_thoughts_of_the_fruit_tree_1',
      'chickens_cautionary_tales_1',
      'common_complaints_of_beryl_1',
      'piggy_tales_1',
      'tales_of_the_sparkly_1',
      'the_bubble_conspiracies_1',
      'the_dramatic_history_of_dullite_1',
    ]);
    assert.deepEqual(prerequisitesOf('facts_of_the_giants_1').slice(-4), ['creator_of_the_universe_3', 'perspectives_of_a_patch_1', 'perspectives_of_a_patch_2', 'perspectives_of_a_patch_3', 'perspectives_of_a_patch_4'].slice(-4));
    // The four shrine gates are the four chain ends, told at shrines.
    assert.deepEqual(CONVERSATIONS.facts_of_the_giants_4.chain, { id: 'facts_of_the_giants', level: 4, max: 4 });
    for (const g of SHRINE_GATES) assert.ok(CONVERSATIONS[g].tellers.every((c) => c.startsWith('npc_shrine_')), g);
    // The spirits' first talks wait on them for real: nothing is met by default.
    assert.deepEqual([...UNBUILT_GATES], []);
    const spiritGates = Object.values(SPIRIT_CONVERSATIONS).map((d) => d.gate).filter((g) => CONVERSATIONS[g]);
    assert.deepEqual(spiritGates.sort(), [...SHRINE_GATES].sort());
  });

  test('a new player walking into every teller hears the whole chain and unlocks every spirit talk', () => {
    const rec = normalizeRecord();
    let now = 1_000_000_000;
    const told = [];
    const ctx = () => ({ now, sessionStart: 0, streetEnteredAt: 0, shrinesDone: true, level: 10, questDone: () => true });
    for (let round = 0; round < 500 && told.length < 79; round++) {
      let any = false;
      for (const cls of Object.keys(TELLERS)) {
        const res = offerFor(rec, cls, ctx());
        if (!res.id) continue;
        // Talk to: the teller runs its first offered conversation.
        assert.equal(talkableFor(rec, cls, now)[0], res.id, `${cls} tells ${res.id}`);
        now += 20 * 1000;
        completeConversation(rec, cls, res.id, CONVERSATIONS[res.id].chain, now);
        told.push(res.id);
        any = true;
        break;
      }
      // Nobody could offer: wait out the gap (30 minutes; 15 s while a chain is in progress).
      now += any ? 16 * 1000 : 31 * M;
    }
    assert.equal(told.length, 79, 'every built conversation is reachable');
    assert.equal(new Set(told).size, 79);
    for (const id of told) for (const after of CONVERSATIONS[id].gate.after) assert.ok(told.indexOf(after) < told.indexOf(id), `${after} before ${id}`);
    assert.deepEqual(rec.chainsInProgress, {});
    assert.equal(Object.keys(rec.chainsCompleted).length, 11);
    // Every spirit's first talk is offered now; with none of it, none was.
    now += 31 * M;
    const spiritCtx = { now, sessionStart: 0, streetEnteredAt: 0, shrinesDone: true };
    for (const variant of Object.keys(TALK_CLASSES)) assert.equal(spiritCanOffer(rec, TALK_ORDER[variant][0], spiritCtx).ok, true, variant);
    for (const variant of Object.keys(TALK_CLASSES)) assert.equal(spiritCanOffer(normalizeRecord(), TALK_ORDER[variant][0], spiritCtx).reason.startsWith('gate:'), true, variant);
    assert.equal(offerNext(rec, 'groddle', spiritCtx).id, 'street_spirit_stories_1');
  });

  test('the first conversation needs level 2 and donate_to_all_shrines; Fruit Trees, peat and rocks level 5; egg and gas plants level 10', () => {
    const rec = normalizeRecord();
    assert.equal(gateCheck(rec, 'chickens_cautionary_tales_1', { level: 1, questDone: () => true }).reason, 'level:2');
    assert.equal(gateCheck(rec, 'chickens_cautionary_tales_1', { level: 2, questDone: () => false }).reason, 'quest:donate_to_all_shrines');
    assert.equal(gateCheck(rec, 'chickens_cautionary_tales_1', { level: 2, questDone: () => true }).ok, true);
    assert.equal(CONVERSATIONS.brief_thoughts_of_the_fruit_tree_1.gate.level, 5);
    assert.equal(CONVERSATIONS.the_chronicles_of_peat.gate.level, 5);
    assert.equal(CONVERSATIONS.ruminations_of_an_egg_plant_1.gate.level, 10);
    assert.equal(CONVERSATIONS.flashbacks_of_the_gas_plant_1.gate.level, 10);
    assert.equal(gateCheck(rec, 'ages_of_the_world_1', { level: 9, questDone: () => true }).reason, 'gate:chickens_cautionary_tales_1');
  });
});

test.describe('the shared record (players/inc_conversations.js)', () => {
  const inc = readFileSync(join(GSJS, 'players/inc_conversations.js'), 'utf8');

  test('timings and the order of the offer checks', () => {
    const offer = inc.slice(inc.indexOf('function conversations_offer('), inc.indexOf('function conversations_force_offer('));
    assert.match(offer, /if \(num_keys\(this\.conversations\.chains_inprogress\)\) timeout = config\.is_dev \? 5 : 15;/);
    assert.equal(CONVERSATION_RULES.chainTimeoutMs, 15 * 1000);
    assert.equal(CONVERSATION_RULES.devChainTimeoutMs, 5 * 1000);
    assert.match(offer, /if \(source_item\.can_be_rooked && source_item\.isRooked\(\)\) return false;\s*if \(source_item\.is_poisoned\) return false;/);
    const rec = normalizeRecord();
    const t0 = 10_000_000;
    const ctx = (extra = {}) => ({ now: t0 + 6 * M, sessionStart: t0, streetEnteredAt: t0, shrinesDone: true, ...extra });
    assert.equal(offerRules(rec, 'x', ctx({ rooked: true })).reason, 'rooked');
    assert.equal(offerRules(rec, 'x', ctx({ poisoned: true })).reason, 'poisoned');
    assert.equal(offerRules(rec, 'x', ctx({ now: t0 + 4 * M })).reason, 'login');
    assert.equal(offerRules(rec, 'x', ctx({ streetEnteredAt: t0 + 6 * M - 5000 })).reason, 'street');
    assert.equal(offerRules(rec, 'x', ctx({ shrinesDone: false })).reason, 'donate_to_all_shrines');
    assert.equal(offerRules(rec, 'x', ctx({ shrinesDone: false, dev: true, now: t0 + 20 * 1000 })).ok, true);
    recordOffer(rec, 'npc_chicken', 'y', t0 + 6 * M);
    assert.equal(offerRules(rec, 'x', ctx({ now: t0 + 20 * M })).reason, 'cooldown');
    assert.equal(offerRules(rec, 'x', ctx({ now: t0 + 37 * M })).ok, true);
    // On a chain the gap is 15 seconds.
    rec.chainsInProgress.ages_of_the_world = t0;
    assert.equal(offerRules(rec, 'x', ctx({ now: t0 + 6 * M + 10 * 1000 })).reason, 'cooldown');
    assert.equal(offerRules(rec, 'x', ctx({ now: t0 + 6 * M + 16 * 1000 })).ok, true);
  });

  test('chains: outside a chain waits on any in progress; the last level clears every chain in progress', () => {
    assert.match(inc, /if \(chain\.level == chain\.max_level\)\{\s*this\.conversations\.chains_completed\[chain\.id\] = time\(\);\s*delete this\.conversations\.chains_inprogress;/);
    const rec = normalizeRecord();
    const a = { id: 'a', level: 1, max: 2 };
    assert.equal(canDoChain(rec, null), true);
    completeConversation(rec, 'cls', 'a1', a, 1);
    assert.deepEqual(rec.chainsInProgress, { a: 1 });
    assert.equal(canDoChain(rec, null), false);
    assert.equal(canDoChain(rec, { id: 'a', level: 2, max: 2 }), true);
    assert.equal(canDoChain(rec, { id: 'b', level: 1, max: 3 }), false);
    rec.chainsInProgress.b = 2;
    completeConversation(rec, 'cls', 'a2', { id: 'a', level: 2, max: 2 }, 3);
    assert.deepEqual(rec.chainsInProgress, {});
    assert.deepEqual(rec.chainsCompleted, { a: 3 });
    // A chain gate in the data.
    const r2 = normalizeRecord();
    r2.chainsInProgress.ages_of_the_world = 1;
    completeConversation(r2, 'trant_bubble', 'the_bubble_conspiracies_1', null, 1);
    assert.equal(canOfferConversation(r2, 'trant_bubble', 'the_bubble_conspiracies_2', { now: 10 * M, dev: true, level: 99, questDone: () => true }).reason, 'chain');
  });

  test('offered: by class keeps expired offers, by item (shrines) drops them; completing drops every class’s offer', () => {
    const rec = normalizeRecord();
    recordOffer(rec, 'npc_shrine_humbaba', 'facts_of_the_giants_1', 1000);
    recordOffer(rec, 'npc_chicken', 'chickens_cautionary_tales_1', 1000);
    assert.deepEqual(offeredForClass(rec, 'npc_chicken'), ['chickens_cautionary_tales_1']);
    assert.deepEqual(talkableFor(rec, 'npc_chicken', 1000 + 40 * M), ['chickens_cautionary_tales_1']);
    // Any Humbaba shrine (regional classes too) tells it while the offer stands.
    assert.deepEqual(talkableFor(rec, 'npc_shrine_uralia_humbaba', 2000), ['facts_of_the_giants_1']);
    assert.deepEqual(talkableFor(rec, 'npc_shrine_humbaba', 1000 + 31 * M), []);
    assert.deepEqual(offeredForItem(rec, ['facts_of_the_giants_1'], 1000 + 5000, true), ['facts_of_the_giants_1']);
    assert.deepEqual(offeredForItem(rec, ['facts_of_the_giants_1'], 1000 + 11000, true), []);
    assert.equal(hasOffered(rec, 'chickens_cautionary_tales_1', 1000 + 29 * M), true);
    completeConversation(rec, 'npc_chicken', 'chickens_cautionary_tales_1', null, 5000);
    assert.equal(hasCompleted(rec, 'chickens_cautionary_tales_1'), true);
    assert.equal(hasCompleted(rec, 'chickens_cautionary_tales_1', 'npc_piggy'), false);
    assert.deepEqual(Object.keys(rec.offered), ['npc_shrine_humbaba']);
  });
});

test.describe('the Street Spirits’ saved ledger moves onto the record', () => {
  const OLD = {
    completed: { street_spirit_zutto: { when_down_was_up_1: 500 } },
    offered: { street_spirit_groddle: { street_spirit_stories_1: 900 }, street_spirit_zutto: { when_down_was_up_1: 100 } },
    lastOffer: 900,
  };

  test('either restore order gives the same record, and a told offer is not revived', () => {
    const saved = normalizeRecord({ completed: { npc_chicken: { chickens_cautionary_tales_1: 700 } }, lastOffer: 650, heard: { chickens_cautionary_tales_1: 600 } });
    resetConversationRecord();
    adoptLegacyTalks(OLD);
    const a = JSON.parse(JSON.stringify(restoreConversationRecord(saved)));
    resetConversationRecord();
    restoreConversationRecord(saved);
    adoptLegacyTalks(OLD);
    const b = JSON.parse(JSON.stringify(conversationRecord()));
    assert.deepEqual(a, b);
    assert.deepEqual(a.completed, { npc_chicken: { chickens_cautionary_tales_1: 700 }, street_spirit_zutto: { when_down_was_up_1: 500 } });
    assert.deepEqual(a.offered, { street_spirit_groddle: { street_spirit_stories_1: 900 } });
    assert.equal(a.lastOffer, 900);
    assert.deepEqual(a.heard, { chickens_cautionary_tales_1: 600 });
    // Merging twice changes nothing.
    assert.deepEqual(JSON.parse(JSON.stringify(mergeRecords(normalizeRecord(a), OLD))), a);
  });

  test('the spirit feature hands over an old slice once and saves a marker', async () => {
    const { streetSpiritsFeature } = await import('../public/js/features/street-spirits-feature.js?v=g189-1');
    resetConversationRecord();
    streetSpiritsFeature.restore(OLD);
    assert.equal(hasCompleted(conversationRecord(), 'when_down_was_up_1'), true);
    assert.deepEqual(streetSpiritsFeature.save(), { moved: 'conversations' });
    resetConversationRecord();
    streetSpiritsFeature.restore({ moved: 'conversations' });
    assert.deepEqual(conversationRecord().completed, {});
    // The spirits read the same record the conversations feature saves.
    const { conversationsFeature } = await import('../public/js/features/conversations-feature.js?v=g189-1');
    resetConversationRecord();
    conversationsFeature.restore(OLD);
    assert.equal(streetSpiritsFeature._talks().talks, conversationRecord());
    assert.equal(conversationsFeature.save(), conversationRecord());
  });
});

test.describe('the conversations feature in a stub world', () => {
  function stubWorld({ classId, state = {}, label = 'Teller', params = {} }) {
    const sprite = { x: 500, y: 300, destroyed: false };
    const target = { classId, state, label, sprite };
    const said = [];
    let dialogue = null;
    const engine = {
      player: { x: 520, y: 296, vx: 0, vy: 0 },
      interactables: [target],
      pc: { level: 12 },
      inv: {},
      questState: { completed: ['donate_to_all_shrines'], active: {} },
      param: (k) => params[k] ?? null,
      setData() {},
      save() {},
      say: (t, text) => said.push(text),
      busy: () => false,
      query: () => null,
      pushActivity() {},
      refreshPack() {},
      questDialogueOpen: () => Boolean(dialogue),
      targetVerbs: (t) => conversationsFeatureRef.verbOverride(t, engine) ?? [{ id: 'talk_to', label: 'inspect', sort: 40 }],
      scriptedDialogue: (opts) => { dialogue = opts; },
    };
    let conversationsFeatureRef = null;
    return {
      target, said, engine,
      set feature(f) { conversationsFeatureRef = f; },
      get dialogue() { return dialogue; },
      finish() {
        dialogue.beats.forEach((b) => b.onAnswer?.());
        const d = dialogue;
        dialogue = null;
        d.onComplete();
      },
    };
  }

  test('a rock walked into offers, gets a Talk to, and tells its conversation step by step', async () => {
    const { conversationsFeature: f, CONVO_TALK_VERB } = await import('../public/js/features/conversations-feature.js?v=g189-1');
    resetConversationRecord();
    const w = stubWorld({ classId: 'rock_beryl_1', label: 'Beryl Rock', state: { rock: { chunksRemaining: 10 } }, params: { convo: 'dev' } });
    w.feature = f;
    f.init(w.engine);
    f.onStreetEnter({}, w.engine);
    // Before 10 s on the street nothing is offered; the beryl rock's first is gated on level 5 and the shrine quest.
    const t = Date.now();
    const realNow = Date.now;
    try {
      Date.now = () => t + 11_000;
      f.onTick(16, 0, w.engine);
      assert.equal(w.said.length, 1);
      assert.deepEqual(offeredForClass(conversationRecord(), 'rock_beryl_1'), ['common_complaints_of_beryl_1']);
      const verbs = w.engine.targetVerbs(w.target);
      assert.deepEqual(verbs.map((v) => `${v.id}:${v.label}`), ['talk_to:inspect', `${CONVO_TALK_VERB}:talk to`]);
      assert.equal(f.runVerbOverride(w.target, CONVO_TALK_VERB, w.engine), true);
      assert.equal(w.dialogue.title, 'Common Complaints of Beryl');
      assert.equal(w.dialogue.kicker, 'Beryl Rock');
      assert.equal(w.dialogue.beats.length, CONVERSATIONS.common_complaints_of_beryl_1.steps.length);
      assert.equal(conversationRecord().heard.common_complaints_of_beryl_1 > 0, true);
      w.finish();
      assert.equal(hasCompleted(conversationRecord(), 'common_complaints_of_beryl_1', 'rock_beryl_1'), true);
      assert.deepEqual(offeredForClass(conversationRecord(), 'rock_beryl_1'), []);
      // A mined-out rock does not offer (include/mining.js isUseable).
      w.target.state.rock.chunksRemaining = 0;
      Date.now = () => t + 60_000;
      f.onStreetEnter({}, w.engine);
      Date.now = () => t + 90_000;
      w.engine.player.x = 2000;
      f.onTick(16, 0, w.engine);
      w.engine.player.x = 520;
      Date.now = () => t + 91_000;
      f.onTick(16, 0, w.engine);
      assert.deepEqual(offeredForClass(conversationRecord(), 'rock_beryl_1'), []);
    } finally {
      Date.now = realNow;
    }
  });

  test('a Fruit Tree’s Surfeit of Cherries 3 hands over 250 Cherries on its third answer; Talk to stays the tree’s own otherwise', async () => {
    const { conversationsFeature: f } = await import('../public/js/features/conversations-feature.js?v=g189-1');
    const rec = resetConversationRecord();
    for (const id of prerequisitesOf('surfeit_of_cherries_3')) completeConversation(rec, CONVERSATIONS[id].tellers[0], id, CONVERSATIONS[id].chain, 1);
    rec.chainsInProgress = { surfeit_of_cherries: 1 };
    const w = stubWorld({ classId: 'trant_fruit', label: 'Fruit Tree' });
    w.feature = f;
    assert.equal(f.runVerbOverride(w.target, 'talk_to', w.engine), null, 'nothing offered: the single lines');
    recordOffer(rec, 'trant_fruit', 'surfeit_of_cherries_3', Date.now());
    // The tree already has a "talk to" (content.js), so no second one is added.
    w.engine.targetVerbs = () => [{ id: 'talk_to', label: 'talk to', sort: 40 }];
    assert.equal(f.verbOverride(w.target, w.engine), null);
    assert.equal(f.runVerbOverride(w.target, 'talk_to', w.engine), true);
    const beats = w.dialogue.beats;
    assert.equal(beats.filter((b) => b.onAnswer).length, 1);
    assert.equal(beats.findIndex((b) => b.onAnswer), 2);
    beats[2].onAnswer();
    assert.equal(w.engine.inv.cherry, 250);
    const game = readFileSync(join(ROOT, 'public/game.js'), 'utf8');
    const fn = game.slice(game.indexOf('function advanceQuestDialogue'), game.indexOf('function advanceQuestDialogue') + 400);
    assert.match(fn, /beats\[questDialogueState\.index\]\?\.onAnswer\?\.\(\);\n  if \(questDialogueState\.index < beats\.length - 1\)/);
  });

  test('the feature is registered last and imports the record under one key', () => {
    const index = readFileSync(join(ROOT, 'public/js/features/index.js'), 'utf8');
    assert.match(index, /import \{ conversationsFeature \} from '\.\/conversations-feature\.js\?v=[\w-]+'; FEATURES\.push\(conversationsFeature\);/);
    // One record: every importer names conversations.js with the same key.
    const files = ['public/js/street-spirit-talks.js', 'public/js/features/street-spirits-feature.js', 'public/js/features/conversations-feature.js'];
    const keys = new Set(files.flatMap((f) => [...readFileSync(join(ROOT, f), 'utf8').matchAll(/conversations\.js\?v=([\w-]+)'/g)].map((m) => m[1])));
    assert.deepEqual([...keys], ['g189-1']);
  });
});
