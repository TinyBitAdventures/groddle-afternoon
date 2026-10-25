/**
 * Street Spirit conversations (register G185): the Groddle, Firebog and
 * Uralia spirits' multi-step talks, with their gates and offer rules.
 * The Ix spirit and the legacy street_spirit class have none.
 *
 * Source (Tiny Speck GameServerJS, CC0):
 * - items/street_spirit_groddle.js 990-1271: "Street Spirit Stories" 1-2 and
 *   "Sonnets of the Street Spirit" 1-2.
 * - items/street_spirit_firebog.js 897-1019: "Street Spirit Mysteries" 1-2.
 * - items/street_spirit_zutto.js 947-1104: "When Down Was Up" 1-2.
 *   Each conversation_run_<id> is a line of spirit text and one choice per
 *   step; the last choice completes it (pc.conversations_complete). None
 *   gives a reward: rewards are null in every conversation_reply.
 * - Gates, conversation_canoffer_<id>: the first of each pair needs a
 *   conversation already completed with a shrine (facts_of_the_giants_4,
 *   voicemail_of_the_giants_3, rituals_of_the_giants_3,
 *   from_the_books_of_the_giants_3, on the npc_shrine_* classes); the second
 *   needs the first.
 * - Offers, players/inc_conversations.js conversations_offer 82-113: on
 *   collision (street_spirit onPlayerCollision, e.g. firebog.js 539-544) the
 *   spirit offers the first conversation in its list that the player has
 *   neither completed nor been offered in the last 30 minutes, when: 5
 *   minutes have passed since login, 10 seconds on this street, 30 minutes
 *   since the last offer and since the last completed conversation, the
 *   player has finished donate_to_all_shrines, and the gate holds. It then
 *   calls out with one of convo_bubble_choices (237-260) for 10 seconds.
 *   Dev servers (config.is_dev) skip the login and shrine rules and use 10
 *   second timeouts. Completed conversations are never offered again, so
 *   each runs once per player.
 * - Talk to (talk_to handler, firebog.js 348-357): runs the first offered
 *   conversation of the spirit's class. An offer is kept per class, so any
 *   spirit of that region can tell it.
 *
 * The shrine gates (G189): the shrine conversations and the chain of
 * animal, tree, rock and patch conversations before them are built
 * (js/conversations-data.js), so every gate is real. UNBUILT_GATES is
 * empty; `strict` (QA ?spiritgates=strict) is kept and changes nothing.
 *
 * The ledger is the player's one conversation record (js/conversations.js),
 * shared with every other teller: the offer rules, the chain rule (a
 * conversation outside a chain waits while one is in progress) and the
 * completions are the same functions. The spirits' own saved ledger (G185)
 * is folded into it on load.
 *
 * The world side is features/street-spirits-feature.js.
 */

import {
  CONVERSATION_RULES,
  CONVO_BUBBLE_CHOICES,
  canDoChain,
  completeConversation,
  hasCompleted as recordHasCompleted,
  hasOffered as recordHasOffered,
  normalizeRecord,
  offerBubble as recordOfferBubble,
  offerRules,
  offeredForClass,
  recordOffer,
} from './conversations.js?v=g189-1';

export { CONVO_BUBBLE_CHOICES };

export const SPIRIT_TALKS_SOURCE = 'tinyspeck/glitch-GameServerJS items/street_spirit_{groddle,firebog,zutto}.js, players/inc_conversations.js (CC0)';

/** inc_conversations.js conversations_offer / conversations_has_offered (js/conversations.js). */
export const TALK_RULES = Object.freeze({
  offerTimeoutMs: CONVERSATION_RULES.offerTimeoutMs, // 59, 91: offered expiry, and the gap after any offer or completion
  devTimeoutMs: CONVERSATION_RULES.devTimeoutMs, // config.is_dev
  loginGraceMs: CONVERSATION_RULES.loginGraceMs, // 88
  streetDwellMs: CONVERSATION_RULES.streetDwellMs, // 89
  bubbleMs: CONVERSATION_RULES.bubbleMs, // conversations_offer_bubble 258
  shrineQuest: CONVERSATION_RULES.shrineQuest, // 97-100
});

/**
 * The shrine conversations the spirits' first talks wait on
 * (facts_of_the_giants_4, voicemail_of_the_giants_3,
 * rituals_of_the_giants_3, from_the_books_of_the_giants_3) are built in
 * G189, so none is met by default any more.
 */
export const UNBUILT_GATES = Object.freeze([]);

/** Spirit class per region (the remake's vendor spirits are dressed as these). */
export const TALK_CLASSES = Object.freeze({
  groddle: 'street_spirit_groddle',
  firebog: 'street_spirit_firebog',
  zutto: 'street_spirit_zutto',
});

/**
 * Every conversation, verbatim: `text` is the spirit's line, `choice` the
 * one answer button after it. Order within a region is the class's
 * `conversations` list (the offer order).
 */
export const SPIRIT_CONVERSATIONS = Object.freeze({
  street_spirit_stories_1: Object.freeze({
    id: 'street_spirit_stories_1',
    title: "Street Spirit Stories",
    variant: 'groddle',
    gate: 'facts_of_the_giants_4',
    source: 'items/street_spirit_groddle.js 990-1071',
    steps: Object.freeze([
      { text: "How-do there, Little?", choice: "How-do." },
      { text: "Lush, ain’t it?", choice: "Lush?" },
      { text: "Lush. Not like “Y’all see him o’er ? He’s a Friend of Friendly and no mistake” lush. Like “My, ain’t we looking Purdy an’ Green an’ Fertile terday?” lush. ", choice: "Ah. Yes. Very lush." },
      { text: "See, in the lives the Giants had before, there weren’t no such thing as lush. Sure been such things as ‘bleak’, and ‘barren’, and a whole heap of ‘goshforsaken’, but lushness? No sir there weren’t a dribblin’ of lush.", choice: "Oh." },
      { text: "So when the world came springin’ all to be, lushness was the first thing there was. Green, fertile, flower-filled sunshine-bathed lushness everywhere. Course, some of them giants didn’t like it.", choice: "No?" },
      { text: "No, L’il Honeybadger, no. Not one tiny bitty.", choice: "So what happened?" },
      { text: "No one knows for sure. All we knewed was that one day there was some mighty wind, and you could hear the giants roarin’, and the ground all fell to shakin’, and then, the half the dern forest fell cattywampus into itself, and rocks came tumblin’ on top of it and buried it all in caverns and caves an’ all.", choice: "So there’s forest UNDER the caverns? " },
      { text: "Who can say? P’raps there is, praps there ain’t But sometimes, I swear I can hear it growin’ down there.", choice: "I see." },
    ]),
  }),
  street_spirit_stories_2: Object.freeze({
    id: 'street_spirit_stories_2',
    title: "Street Spirit Stories",
    variant: 'groddle',
    gate: 'street_spirit_stories_1',
    source: 'items/street_spirit_groddle.js 1073-1154',
    steps: Object.freeze([
      { text: "Gosh DARN It!", choice: "Huh?" },
      { text: "Darn it, I said. I was nappin’. Y’all new round these parts? ", choice: "New-ish?" },
      { text: "Dang, Small, all a y’all are new compared to us.", choice: "So I hear." },
      { text: "Jis’ woked up from a nap, and clean forgot where I was for a tick. Thought it was way back when. You know, back then, alla this were forest.", choice: "Like Groddle Forest, you mean?" },
      { text: "Well, I know. Technically, quite a lot of this ‘ere still IS forest. But I’m sayin’, all was forest, once. But only because forest was all there was. There wasn’t anything else. The whole world was forest.", choice: "All of it?" },
      { text: "All of it. There was nothing but forest in the beginning.", choice: "So what happened to it?" },
      { text: "Happened? Nothing, little mucker. Mosta the forest there WAS still IS. But all the other world grew up around it. As the giants’ imagination expanded, the world took off in all manner of bizarre directions. I heard talk of deserts and firebogs, though I never believed them to be true.", choice: "Welllll…" },
      { text: "And won’t hear any different. Far as I’m concerned, forest is all there be. I know what I know: the forest was the first land that ever was. I know, for I was there in it when it came into being.", choice: "I see." },
    ]),
  }),
  sonnets_of_the_street_spirit_1: Object.freeze({
    id: 'sonnets_of_the_street_spirit_1',
    title: "Sonnets of the Street Spirit",
    variant: 'groddle',
    gate: 'from_the_books_of_the_giants_3',
    source: 'items/street_spirit_groddle.js 1156-1209',
    steps: Object.freeze([
      { text: "When came the Glitch to walk upon this land?", choice: "Um…" },
      { text: "What Lemmish map did lead them to this place?\nThis ground was shaped by naught but Giant’s hand\nEach feature caused a smile upon Giants’ face.", choice: "Oh, well, I think it was…" },
      { text: "Age upon age, this land stood, icy still\nThe only sound the flap of butt’ry wings", choice: "Sounds nice?" },
      { text: "And yet, of late - an influx: sudden fill\nOf Glitchlife and the chaos that it brings.\nWho knows what tree they might plant somewhere next?\nWho knows how long that tree might get to live?\nOur firstly instinct was to get quite vexed.\nBut life with giants has taught us to forgive.\nWhichever way the Glitchy whims might bend\nThe world will find its balance in the end.", choice: "Hmmm." },
    ]),
  }),
  sonnets_of_the_street_spirit_2: Object.freeze({
    id: 'sonnets_of_the_street_spirit_2',
    title: "Sonnets of the Street Spirit",
    variant: 'groddle',
    gate: 'sonnets_of_the_street_spirit_1',
    source: 'items/street_spirit_groddle.js 1211-1271',
    steps: Object.freeze([
      { text: "There was a time, before you Glitches came\nWhen through these lands some other feet did tread\nI knew them by the noise before the name", choice: "Oh?" },
      { text: "Their voices cut all earholes into shreds.", choice: "Woah." },
      { text: "Those were, I think, the supplicants of Pot\nWhose bawdy songs in keys too high to hear\nWould cause the rocks themselves to blush a lot.\n(Though rocks themselves say things that shame your ears).", choice: "You don’t have to tell me twice" },
      { text: "Some swore eternal loyalty to Lem\nAnd wore the Lemmish stripes upon their leg.\nThey boasted of the ground covered by them.\nHow far they’d hoofed o’er land and sea and weg.", choice: "What’s a weg?" },
      { text: "That’s not the point. The fact is, before you\nWere here, lived lives, and left their own mark, too.", choice: "Interesting." },
    ]),
  }),
  street_spirit_mysteries_1: Object.freeze({
    id: 'street_spirit_mysteries_1',
    title: "Street Spirit Mysteries",
    variant: 'firebog',
    gate: 'voicemail_of_the_giants_3',
    source: 'items/street_spirit_firebog.js 897-964',
    steps: Object.freeze([
      { text: "Darklee sat yon giants, brooding in their funk.\nIn darkly times, they grizzled at their woe.", choice: "What? Why? Huh?" },
      { text: "They grumbled! After the furny blast did blasty-raze the wood\nAnd leave but twiggybits!", choice: "Twiggybits?" },
      { text: "For surishly maybelike! Twiggybits just! No mores!\nWell, no more but wetly peat-ash and jellicle-spores.", choice: "Oh! The firebog!" },
      { text: "Sayso! Firelybogs from forests green did spring\nAnd giantly grumbles echoly did ring. For eons long!", choice: "Wowzers." },
      { text: "Full rightly wowzers say you, tiny Glitch.\nThis fizzling firebog once all forest was.\nAnd giantly sads was deep and thick and flub.", choice: "Flub." },
      { text: "Flub.", choice: "Right." },
    ]),
  }),
  street_spirit_mysteries_2: Object.freeze({
    id: 'street_spirit_mysteries_2',
    title: "Street Spirit Mysteries",
    variant: 'firebog',
    gate: 'street_spirit_mysteries_1',
    source: 'items/street_spirit_firebog.js 966-1019',
    steps: Object.freeze([
      { text: "Yay, listen Glitchy, while history surrounds ‘ee", choice: "Right." },
      { text: "Tight-wovened strings that binded giants were\nTill Rookling first did swoop upon the world.\nIt tore with toothied beak and razored claw\nStraight through the imaginings so careful-wrought.", choice: "Dark." },
      { text: "And in their sleep giant tears rolled down giant chins,\nTo watch their frabjous world be torn in bits.\nThe rook is part of them they cannot kill.\nThe knowledge of it heavy on them sits.\nAnd breaks their sleeps.", choice: "Sleep." },
      { text: "Sleeps.", choice: "Whatever. That’s sad." },
    ]),
  }),
  when_down_was_up_1: Object.freeze({
    id: 'when_down_was_up_1',
    title: "When Down Was Up",
    variant: 'zutto',
    gate: 'rituals_of_the_giants_3',
    source: 'items/street_spirit_zutto.js 947-1021',
    steps: Object.freeze([
      { text: "SPOING!!! Ha?!? What? Say? Hi!", choice: "Woah. What?" },
      { text: "Woah! Yah! Woaaaaahh! Hee-hee! Spoing!", choice: "Calm down!" },
      { text: "Hee! No calm! Too much! Look! Look you talking! You talking! To me! ", choice: "Sheeeeesh." },
      { text: "Zille frowns on jollity. And fun. And floating. Floating is fun.", choice: "You’re floating…" },
      { text: "Me? No. This? No no no. This is just a hangover from a time before, when down was up and up was down.", choice: "What?" },
      { text: "When time that Cosma forgot and most other giants ignored. Who are they to care if caverns are suddenly the tunnels of the sky?", choice: "Tunnels of the…" },
      { text: "So then I hung upside down, now I hang downside up. Whatever. All helps to get the stardusts out of my earryholes.", choice: "Interesting." },
    ]),
  }),
  when_down_was_up_2: Object.freeze({
    id: 'when_down_was_up_2',
    title: "When Down Was Up",
    variant: 'zutto',
    gate: 'when_down_was_up_1',
    source: 'items/street_spirit_zutto.js 1023-1104',
    steps: Object.freeze([
      { text: "Hi hi hi hi! SPOING!!!!", choice: "Woah there, pickle." },
      { text: "Shhh, here is a secret. Come closer. Not that close.", choice: "I haven’t moved." },
      { text: "Hee! Oooh! Here! During an age in the middle of the ages that I cannot summon the energy to remember, but it is written down somewhere…", choice: "Where?" },
      { text: "Some. Somewhere. Theresome. Anyway but. The caverns filled with water.", choice: "These caverns?" },
      { text: "No no no no no no no no no no.", choice: "No?" },
      { text: "No.", choice: "Right." },
      { text: "Other caverns, elsewhere else. And those? Those filled with things of life and sea and sealife things. But I? I kept all dry. And why?", choice: "Go on?" },
      { text: "I don’t know. I just liked the rhyme. Why. Dry. Fly. Try. Pie. I. Rye.", choice: "Buh-bye." },
    ]),
  }),
});

/** Offer order per region (each class's `var conversations`). */
export const TALK_ORDER = Object.freeze({
  groddle: Object.freeze(['street_spirit_stories_1', 'street_spirit_stories_2', 'sonnets_of_the_street_spirit_1', 'sonnets_of_the_street_spirit_2']),
  firebog: Object.freeze(['street_spirit_mysteries_1', 'street_spirit_mysteries_2']),
  zutto: Object.freeze(['when_down_was_up_1', 'when_down_was_up_2']),
});

const num = (v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : 0);

/** The player's conversation record (js/conversations.js normalizeRecord): { completed, offered, lastOffer, chainsCompleted, chainsInProgress, heard }. */
export function normalizeTalkState(raw = {}) {
  return normalizeRecord(raw);
}

/** conversations_has_completed(null, id): completed with any class. */
export function hasCompleted(state, id) {
  return recordHasCompleted(state, id);
}

/** conversations_has_offered(null, id): offered by any class within the timeout. */
export function hasOffered(state, id, now, timeoutMs = TALK_RULES.offerTimeoutMs) {
  return recordHasOffered(state, id, now, timeoutMs);
}

/** A conversation's gate: completed in the record (UNBUILT_GATES is empty since G189). */
export function gateMet(state, gate, { strict = false } = {}) {
  if (!gate) return true;
  if (hasCompleted(state, gate)) return true;
  return !strict && UNBUILT_GATES.includes(gate);
}

/**
 * conversations_offer for one id. ctx: { now, dev, strict, sessionStart,
 * streetEnteredAt, shrinesDone }. Returns { ok, reason }. The shared rules
 * first, then conversation_canoffer_<id>: the chain rule (chain null) and
 * the gate.
 */
export function canOffer(state, id, ctx = {}) {
  const def = SPIRIT_CONVERSATIONS[id];
  if (!def) return { ok: false, reason: 'unknown' };
  const rules = offerRules(state, id, ctx);
  if (!rules.ok) return rules;
  if (!canDoChain(state, null)) return { ok: false, reason: 'chain' };
  if (!gateMet(state, def.gate, ctx)) return { ok: false, reason: `gate:${def.gate}` };
  return { ok: true, reason: '' };
}

/**
 * onPlayerCollision: offer the first conversation the region's spirit can,
 * recording it. Returns { id, reason } (id '' when none; reason is why the
 * first not-yet-told conversation was held).
 */
export function offerNext(state, variant, ctx = {}) {
  const cls = TALK_CLASSES[variant];
  let reason = 'none';
  for (const id of TALK_ORDER[variant] || []) {
    const res = canOffer(state, id, ctx);
    if (res.ok) {
      recordOffer(state, cls, id, num(ctx.now) || Date.now());
      return { id, reason: '' };
    }
    if (reason === 'none' && res.reason !== 'completed') reason = res.reason;
  }
  return { id: '', reason };
}

/** conversations_offered_for_class: every id this class has offered (expired offers stay until told). */
export function offeredFor(state, variant) {
  return offeredForClass(state, TALK_CLASSES[variant]).filter((id) => SPIRIT_CONVERSATIONS[id]?.variant === variant);
}

/** conversations_complete: drop the offer everywhere, record the completion under the class. */
export function completeTalk(state, variant, id, now = Date.now()) {
  return completeConversation(state, TALK_CLASSES[variant], id, null, now);
}

/** Scripted-dialogue beats: the spirit's line with its one answer. */
export function talkBeats(id) {
  return (SPIRIT_CONVERSATIONS[id]?.steps || []).map((s) => ({ text: s.text, response: s.choice }));
}

/** The call-out bubble (js/conversations.js offerBubble). */
export function offerBubble(pick = Math.random(), label = 'friend') {
  return recordOfferBubble(pick, label);
}
