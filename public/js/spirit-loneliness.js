/**
 * Street Spirit loneliness (register G185, row G185 loneliness lane): pure
 * rules, copy and timings. No DOM, no Pixi, no storage. The world side is
 * features/spirit-loneliness-feature.js; the cry clip and the invite's
 * porthole art are js/street-spirits.js STREET_SPIRIT_LONELY_ART.
 *
 * What the source does (tinyspeck/glitch-GameServerJS, CC0):
 * - items/include/loneliness.js (included by include/street_spirits.js 2, so
 *   by all five spirit classes: street_spirit, _groddle, _firebog, _zutto,
 *   _ix). Nothing in GSJS starts it: staff ran it from the admin tools.
 *   lonelinessAdminGetData 18-26 showed them each spirit's recent_visits
 *   (onLonelinessPlayerEnter 589: +1 for every player who enters its street)
 *   and whether its street was empty; startLoneliness 168-218 then picked up
 *   to num_players online players who could get there (canDoLoneliness,
 *   inc_world_events.js 93-111: not on that street already, not in an
 *   instance, not dead, a path at least 3 long), chose type A (70%, a race:
 *   is_chance(0.7)) or B (a party), and invited each one.
 * - The invite (inc_world_events.js 16-72): the spirit appears in the top
 *   right corner in a porthole (state loneliness_in, loneliness after 1 s,
 *   loneliness_out at 13 s, 14.5 s in all; the class's loneliness_size and
 *   corner offsets) with a speech bubble holding one of nine pleas
 *   (lonelinessGetText stage 0, option randInt(0, 8)). 15 s later a prompt:
 *   "A Street Spirit in X needs your help. Would you like to set that as your
 *   destination?" Yes sets the route (prompts_loneliness_callback 133-142).
 * - On the street: the spirit stops and cries (onLonelinessStart, idle_cry as
 *   its idle; Uralia cries in short bursts with a sad line every 10-15 s,
 *   street_spirit_zutto.js 410-418, 479-481). Type A shows "There is a
 *   lonely street spirit here. Hurry! Hurry!" to anyone who has not visited;
 *   type B "End the loneliness with a party! n/m players here now".
 * - Walking into the spirit is the visit (onPlayerCollision -> lonelinessVisit
 *   280-371). A: it thanks you (stage 1, the reply matching your plea),
 *   tells you your place ("BTW, you are kind people who came to here in the
 *   1st place today.") and pays race XP (lonelinessComputeRaceXP 595-615);
 *   once every invited player has come, the loneliness ends. B: it waits for
 *   everyone, then "Finally you are here at last..." and 5 s later the party:
 *   200 XP and Party Time! for each visitor still there, six fireworks over
 *   47 s, and 55 s later one last line (lonelinessFinishParty 224-244).
 * - A race ends after 15 minutes (apiSetTimer('clearLoneliness', 900000));
 *   anyone still invited is told "Someone else cheered up the Street Spirit
 *   in X. Looks like you missed your chance!" (cancelLoneliness).
 *
 * Solo reading (the remake has one player):
 * - apiGetNLocalOnlinePlayers finds one player, so total_players is 1: the
 *   first visit ends a race, and a party starts the moment you arrive.
 * - Nobody runs the admin tools, so the game looks for a lonely spirit
 *   itself. "No players passing by" becomes your own visits: a spirit you
 *   have met (you entered its street) and have not visited for a whole game
 *   day (4 real hours, the day every other remake system uses) has no recent
 *   visitors. Every 15 minutes (the race's own window, so two never overlap)
 *   the game picks the one you have left alone longest, among those at
 *   least 3 streets away, and starts it; after one starts, the next waits a
 *   game day (staff ran these as occasional events, not on a clock).
 * - A party's 5-minute duration is declared but never armed in the source
 *   (startLoneliness 201-204: only the race sets a timer). With one player
 *   it would cry for ever if you said No, so the remake ends it after those
 *   5 minutes with the same "missed your chance" prompt.
 * - Race XP: the source's lonelinessComputeRaceXP pays 1000 to the first
 *   visitor; its later tiers read this.loneliness_num_visitors, which is
 *   always undefined, so everyone after the first got 100 (kept). Solo, you
 *   are always first: 1000, through the mood bonus (stats_add_xp, no
 *   no_bonus flag).
 */

export const LONELINESS_SOURCE = 'tinyspeck/glitch-GameServerJS items/include/loneliness.js, players/inc_world_events.js (CC0)';

/** One game day (animal-mood.js GAME_DAY_MS): 4 real hours. */
const GAME_DAY_MS = 4 * 60 * 60 * 1000;

export const LONELY_RULES = Object.freeze({
  /** inc_world_events.js 54: args.duration = 14500 (the porthole and bubble). */
  announceMs: 14500,
  /** 45-46, 69-70: events_add(loneliness, 1 s) and (loneliness_out, 13 s). */
  loopAtMs: 1000,
  outAtMs: 13000,
  /** 41: apiSetTimer('showLonelinessPrompt', 15000). */
  promptDelayMs: 15000,
  /** loneliness.js 197-199: type A lasts 60 * 15 s. */
  raceMs: 15 * 60 * 1000,
  /** 202: type B duration 60 * 5 s (declared only; armed here, see above). */
  partyMs: 5 * 60 * 1000,
  /** 186: is_chance(0.7) ? 'A' : 'B'. */
  raceChance: 0.7,
  /** inc_world_events.js 107: path.length >= 3. */
  minPath: 3,
  /** 340: apiSetTimer('lonelinessFinishParty', 5000). */
  partyStartMs: 5000,
  /** 336: sendBubble(text, 5000, pc). */
  partyStartBubbleMs: 5000,
  /** 243: apiSetTimer('lonelinessPartyJabber', 55000). */
  partyJabberMs: 55000,
  /** 233: stats_add_xp(200). */
  partyXp: 200,
  /** 235: buffs_apply('party_time'). */
  partyBuff: 'party_time',
  /** 466: sendBubble(speech, 4000, pc) after a race reward while others are still invited. */
  stillLonelyBubbleMs: 4000,
  /** 302: sendBubble(speech, 5000, pc) on a party revisit. */
  partyRevisitBubbleMs: 5000,
  /** street_spirit.js declareLoneliness 363-373 / stopCrying 653-659: every 5-10 s, cry 8 s. */
  cryEveryMs: Object.freeze([5000, 10000]),
  cryMs: 8000,
  /** onLonelinessVisit 507-509: the first visitor gets 3-5 s before the next cry. */
  afterVisitMs: Object.freeze([3000, 5000]),
  /** street_spirit_zutto.js 410-418, 479-481: first after 5-10 s, then every 10-15 s, hoverCry 5 s. */
  zuttoFirstMs: Object.freeze([5000, 10000]),
  zuttoEveryMs: Object.freeze([10000, 15000]),
  zuttoCryMs: 5000,
  /** lonelinessShowRaceOverlay 497-507: full opacity, to 0.5 after 3 s over 300 ms. */
  overlayDimAfterMs: 3000,
  overlayDimMs: 300,
  overlayDim: 0.5,
  /** lonelinessEndPartyOverlay 373-463: six fireworks, 2 s each, LONELINESS_FIREWORKS with each. */
  fireworks: Object.freeze([
    Object.freeze({ at: 0, key: 'fireworks_1', x: 0.5, y: 0.75 }),
    Object.freeze({ at: 4000, key: 'fireworks_2', x: 0.3, y: 0.3 }),
    Object.freeze({ at: 8000, key: 'fireworks_3', x: 0.7, y: 0.3 }),
    Object.freeze({ at: 35000, key: 'fireworks_1', x: 0.5, y: 0.75 }),
    Object.freeze({ at: 39000, key: 'fireworks_2', x: 0.3, y: 0.3 }),
    Object.freeze({ at: 43000, key: 'fireworks_3', x: 0.7, y: 0.3 }),
  ]),
  fireworkMs: 2000,
  fireworkSound: 'LONELINESS_FIREWORKS',
  // Solo reading (no admin tools): see the header.
  /** How often the game looks for a lonely spirit: the race's own 15-minute window. */
  checkEveryMs: 15 * 60 * 1000,
  /** After one starts, the next waits a game day. */
  eventGapMs: GAME_DAY_MS,
  /** A spirit you have not visited for a game day has had no recent visitors. */
  quietMs: GAME_DAY_MS,
});

/** inc_announcements.js 709-745 defaults and the class props (street_spirit_*.js 25-30). */
export const INVITE_ART = Object.freeze({
  /** announce_remote_item_speech: corner tr, offset 65 / 45, size 300 unless the class says otherwise. */
  item: Object.freeze({ corner: 'tr', x: 65, y: 45, size: 300 }),
  /** The bubble: corner tr, offset 170 / 80, size 250 (loneliness_quest_bubble_overlay). */
  bubble: Object.freeze({ corner: 'tr', x: 170, y: 80, size: 250 }),
});

/**
 * The invite's porthole box for one variant (inc_world_events.js 55-65 reads
 * loneliness_size, loneliness_x_offset, loneliness_y_offset; Firebog's x is
 * misnamed and falls back to 65).
 * @param {{ size?: number, x?: number, y?: number, xRead?: boolean }|null} loneliness STREET_SPIRIT_VARIANTS[v].loneliness
 */
export function inviteBox(loneliness) {
  const l = loneliness || {};
  return {
    size: l.size || INVITE_ART.item.size,
    x: l.xRead === false ? INVITE_ART.item.x : l.x || INVITE_ART.item.x,
    y: l.y || INVITE_ART.item.y,
  };
}

/**
 * Where a corner-tr overlay sits in a viewport of width `vpW`
 * (InWindowAnnouncementOverlay.placeInCorner 325-345): its centre is
 * vp_w - w/2 - offset_x across and h/2 + offset_y down.
 */
export function cornerCentre(vpW, w, h, offX, offY) {
  return { x: vpW - Math.round(w / 2) - offX, y: Math.round(h / 2) + offY };
}

/** Player-facing copy, verbatim from loneliness.js and inc_world_events.js. */
export const LONELY_TEXT = Object.freeze({
  /** lonelinessGetText stage 0 (35-61), options 0-8. */
  invite: Object.freeze([
    "Hi $PLAYERNAME, could you come to here? and then please chat to me? I can't bear this loneliness any longer. I am at $LOCATION. Please...",
    'Hey $PLAYERNAME. I am so lonely.... Because I haven’t met anybody recently. I want to talk to anyone. I am at $LOCATION.',
    'How do you do, sir? And good bye, sir. I will die soon because too lonely. I am at $LOCATION. I want to talk with someone before pass away....',
    'Hey $PLAYERNAME, what was a "Friend"? Can I buy it? Please let me know about "Friend" to come here. I am at $LOCATION.',
    '.... Please ...... $PLAYERNAME ......... Please ..... Come ... to .... $LOCATION .......',
    "Hi $PLAYERNAME. Here is a quiet place. Because there is nobody else. It's like a empty. Sigh, could you come to $LOCATION?",
    'Everything is blurred these days. Also something like a water is dripping down from my eyes always. What is this? I\'m at $LOCATION. Visit me.',
    "H Hi $PLAYERNAME,, oh sor-ry I ca-n't ta-lk well. bec-ause I ha-ve not talked wit-h any-one recently. Vis-it m-e at $LOCATION.",
    'My role is only to sell stuff from morning till night. Because of this, I am loneliness! Therefore, could you come to $LOCATION?',
  ]),
  /** Stage 1 (63-104): the reply to each plea (9: no plea on record) and its button. */
  arrive: Object.freeze([
    Object.freeze({ text: 'Wow unbelievable! $PLAYERNAME is here! Thank you for coming!', choice: "You're welcome!" }),
    Object.freeze({ text: 'Wow amazing!! $PLAYERNAME is here! Thank you for coming!', choice: "You're welcome!" }),
    Object.freeze({ text: "Sir $PLAYERNAME!! Wooooooow!! What a wonderful day! I'm no longer loneliness! Yeah!", choice: 'Um…\u00a0sure!' }),
    Object.freeze({ text: '$PLAYERNAME!! Finally I remembered about "Friend"! You are my true friend, right?', choice: 'Of course!' }),
    Object.freeze({ text: '......Really? ... Are you $PLAYERNAME? ......Whoop! Whooop! Whooooooop!', choice: 'Whoooop!' }),
    Object.freeze({ text: '$PLAYERNAME!!!! Wow!!! Here is not quiet place already!!! Here is not empty!!! It\'s lively like a festival!!!', choice: 'Yeah!' }),
    Object.freeze({ text: "Wow! $PLAYERNAME! Wow it's double surprised!!! Because I can see clearly. It's not blurred and not wet yet!! Wow!!!", choice: "I'm not sure what that means." }),
    Object.freeze({ text: "$PLAYERNAME!! Wow, it's a great! Wow!!! I could speak very smoothly! Unbelievable!!!", choice: "You're welcome!" }),
    Object.freeze({ text: "Thank you $PLAYERNAME!! I'm so glad to see you. We are friends from today, right? Of course you are also customer at same time.", choice: 'Right on.' }),
    Object.freeze({ text: '$PLAYERNAME!! I was crying because I was loneliness, but seeing you as a friend made me happy again.', choice: 'Glad to help, I think…' }),
  ]),
  /** Stage 2, type A (107-130). The source joins the two sentences with no space; the remake adds one. */
  ranking: 'BTW, you are kind people who came to here in the $RANKING place today.',
  othersVisited: 'I was also visited today by $OTHERS!',
  othersChoice: 'Delightful.',
  /** Stage 2 (no one else) and stage 3 (128, 137). */
  thanks: 'This is in return for your kindness. Thank you!',
  okChoice: 'OK',
  /** Stage 2, type B (131-133). */
  partyWait: 'BTW, I am going to have a party because I think this is a rare opportunity!! Could you wait here until after $NUMBEROFPLAYERS players? Thank you!',
  /** 140-142: any other stage. */
  forgot: 'Hi I thought I had a thing to tell to you. I forgot it....',
  /** lonelinessGetChatter 158-166. */
  chatter: Object.freeze([
    'Oh, but I am still loneliness.',
    'I wish more people would come to visit to me.',
    'It is still like a empty here. Sigh…',
    'There is water coming down from my eyes always.',
    'What is a feeling? It is the loneliness.',
  ]),
  /** 296-300: a party guest who comes back to the spirit. */
  partyRevisit: Object.freeze([
    '$PLAYERNAME! It will be time for the party soon so please wait for a little bit longer.',
    'I hope the party is good!! Please invite your friends!',
    '$PLAYERNAME! Tell your friends and this will be the best party.',
  ]),
  /** 335: the last guest arrives. */
  partyStart: '$PLAYERNAME!! Finally you are here at last and now we can start a party! Please everyone be friends and enjoy a party together.',
  /** 225: lonelinessFinishParty. */
  partyFinish: 'Wow! It is so lively now. It is a real party! Yes!! Please take these. Thank you very much for being good friends!',
  /** 248: lonelinessPartyJabber. */
  partyJabber: 'It was the best party. Therefore, I am not loneliness anymore. Thank you everybody!!',
  /** 465: a race guest leaves while others are still invited. */
  stillLonely: 'But I am still loneliness. So I hope that the others will come and visit me soon......',
  /** lonelinessShowRaceOverlay 494 (the <br /> is a line break). */
  raceOverlay: Object.freeze(['There is a lonely street spirit here.', 'Hurry! Hurry!']),
  /** lonelinessShowPartyOverlay 476-477: three lines, the count in the middle. */
  partyOverlay: Object.freeze(['End the loneliness with a party!', '$N/$M', 'players here now']),
  /** onLonelinessPlayerEnter 583. */
  partyActivity: 'The street spirit here is having a party! Invite all your friends.',
  /** inc_world_events.js 124. */
  prompt: 'A Street Spirit in $LOCATION needs your help. Would you like to set that as your destination?',
  promptYes: 'Yes',
  promptNo: 'No',
  /** inc_world_events.js 79. */
  missed: 'Someone else cheered up the Street Spirit in $LOCATION. Looks like you missed your chance!',
  /** lonelinessGiveRaceXP 622 and lonelinessFinishParty 234 (the source says xp; the remake's XP is iMG). */
  raceReward: "You brightened a street spirit's day. You received $XP iMG.",
  partyReward: "You brightened a street spirit's day! You received $XP iMG.",
});

/** The source's numberth: 1st, 2nd, 3rd, 4th, 11th, 21st. */
export function numberth(n) {
  const v = Math.trunc(Number(n) || 0);
  const two = Math.abs(v) % 100;
  const one = Math.abs(v) % 10;
  const suffix = two >= 11 && two <= 13 ? 'th' : one === 1 ? 'st' : one === 2 ? 'nd' : one === 3 ? 'rd' : 'th';
  return `${v}${suffix}`;
}

/** text.replace("$X", y): the source replaces the first one only. */
function fill(text, vars = {}) {
  let out = String(text || '');
  for (const [k, v] of Object.entries(vars)) out = out.replace(`$${k}`, String(v ?? ''));
  return out;
}

export function inviteText(option, name, location) {
  return fill(LONELY_TEXT.invite[option] ?? LONELY_TEXT.invite[0], { PLAYERNAME: name, LOCATION: location });
}

export function promptText(location) {
  return fill(LONELY_TEXT.prompt, { LOCATION: location });
}

export function missedText(location) {
  return fill(LONELY_TEXT.missed, { LOCATION: location });
}

/** The arrival reply for a plea (option 9 when the player has none on record, loneliness.js 285-286). */
export function arriveLine(option, name) {
  const row = LONELY_TEXT.arrive[Number.isInteger(option) && option >= 0 && option <= 8 ? option : 9];
  return { text: fill(row.text, { PLAYERNAME: name }), choice: row.choice };
}

/**
 * lonelinessComputeRaceXP 595-615 as it ran: 1000 for the first visitor;
 * the later tiers compare this.loneliness_num_visitors (undefined), so every
 * later visitor fell through to 100.
 */
export function raceXp(numVisitors) {
  return Number(numVisitors) === 1 ? 1000 : 100;
}

/**
 * The race conversation (stages 1-3) as scripted-dialogue beats, and its XP.
 * `others` are other visitors' names (always none solo).
 */
export function raceConversation({ option, name, numVisitors = 1, others = [] }) {
  const first = arriveLine(option, name);
  const ranking = fill(LONELY_TEXT.ranking, { RANKING: numberth(numVisitors) });
  const xp = raceXp(numVisitors);
  const beats = [{ text: first.text, response: first.choice }];
  if (others.length) {
    const shown = others.slice(Math.max(others.length - 3, 0));
    const list = shown.length > 1 ? `${shown.slice(0, -1).join(', ')} and ${shown[shown.length - 1]}` : shown[0];
    beats.push({ text: `${ranking} ${fill(LONELY_TEXT.othersVisited, { OTHERS: list })}`, response: LONELY_TEXT.othersChoice });
    beats.push({ text: LONELY_TEXT.thanks, response: LONELY_TEXT.okChoice });
  } else {
    beats.push({ text: `${ranking} ${LONELY_TEXT.thanks}`, response: LONELY_TEXT.okChoice });
  }
  return { beats, xp };
}

export function partyStartLine(name) {
  return fill(LONELY_TEXT.partyStart, { PLAYERNAME: name });
}

export function partyOverlayLines(here, total) {
  return LONELY_TEXT.partyOverlay.map((l) => fill(l, { N: here, M: total }));
}

export function rewardText(kind, xp) {
  return fill(kind === 'party' ? LONELY_TEXT.partyReward : LONELY_TEXT.raceReward, { XP: xp });
}

/* ------------------------------------------------------------ state */

export function createLonelyState() {
  return { visits: {}, event: null, nextCheckAt: 0, lastStartAt: 0, cured: 0, parties: 0, missed: 0, seeded: false };
}

function normalizeEvent(e) {
  if (!e || typeof e !== 'object' || !e.tsid) return null;
  const type = e.type === 'B' ? 'B' : 'A';
  return {
    tsid: String(e.tsid),
    label: String(e.label || e.tsid),
    variant: String(e.variant || 'groddle'),
    look: String(e.look || ''),
    type,
    option: Number.isInteger(e.option) ? e.option : 0,
    uid: String(e.uid || ''),
    startAt: Number(e.startAt) || 0,
    endsAt: Number(e.endsAt) || 0,
    prompted: Boolean(e.prompted),
    answer: e.answer === 'yes' || e.answer === 'no' ? e.answer : '',
    visitedAt: Number(e.visitedAt) || 0,
    partyAt: Number(e.partyAt) || 0,
  };
}

export function normalizeLonelyState(seed = {}) {
  const s = seed && typeof seed === 'object' ? seed : {};
  const visits = {};
  for (const [tsid, v] of Object.entries(s.visits || {})) {
    if (!tsid) continue;
    visits[tsid] = { n: Math.max(0, Math.floor(Number(v?.n) || 0)), lastAt: Number(v?.lastAt) || 0 };
  }
  return {
    visits,
    event: normalizeEvent(s.event),
    nextCheckAt: Number(s.nextCheckAt) || 0,
    lastStartAt: Number(s.lastStartAt) || 0,
    cured: Math.max(0, Number(s.cured) || 0),
    parties: Math.max(0, Number(s.parties) || 0),
    missed: Math.max(0, Number(s.missed) || 0),
    seeded: Boolean(s.seeded),
  };
}

/** G and L street TSIDs name the same street. */
export const streetKey = (tsid) => {
  const t = String(tsid || '');
  return t.startsWith('L') ? `G${t.slice(1)}` : t;
};

/** onLonelinessPlayerEnter: recent_visits++ (your own visits, solo). */
export function noteVisit(state, tsid, now = Date.now()) {
  const key = streetKey(tsid);
  if (!key) return state;
  const row = state.visits[key] || { n: 0, lastAt: 0 };
  state.visits[key] = { n: row.n + 1, lastAt: now };
  return state;
}

/** A save from before G185: the streets it has seen count as met, long ago (lastAt 0). */
export function seedVisits(state, tsids = []) {
  if (state.seeded) return state;
  for (const t of tsids) {
    const key = streetKey(t);
    if (key && !state.visits[key]) state.visits[key] = { n: 1, lastAt: 0 };
  }
  state.seeded = true;
  return state;
}

/** isLonely: the event is running (not visited, not over). */
export function isRunning(event, now = Date.now()) {
  return Boolean(event && !event.visitedAt && now < event.endsAt);
}

/** The porthole's clip `ms` after the invite (inc_world_events.js 45-71), '' once it has gone. */
export function portraitStateAt(ms) {
  if (ms < 0 || ms >= LONELY_RULES.announceMs) return '';
  if (ms < LONELY_RULES.loopAtMs) return 'in';
  if (ms < LONELY_RULES.outAtMs) return 'loop';
  return 'out';
}

/** showLonelinessPrompt: 15 s after the invite, while the event still runs and you have not answered. */
export function promptDue(event, now = Date.now()) {
  return Boolean(event && !event.prompted && isRunning(event, now) && now - event.startAt >= LONELY_RULES.promptDelayMs);
}

/** clearLoneliness on the race timer (or the party's declared duration): over, unvisited. */
export function expired(event, now = Date.now()) {
  return Boolean(event && !event.visitedAt && now >= event.endsAt);
}

/**
 * Which spirit is lonely now (solo reading): one you have met, not visited
 * for a game day, at least 3 streets away; the one left alone longest, ties
 * broken by `rng`.
 * @param {object} state
 * @param {{ tsid: string, pathLength: number }[]} candidates spirit streets with their route length from here
 */
export function pickLonelySpirit(state, candidates, { now = Date.now(), rng = Math.random } = {}) {
  const rows = [];
  for (const c of candidates || []) {
    const v = state.visits[streetKey(c.tsid)];
    if (!v || v.n < 1) continue;
    if (now - v.lastAt < LONELY_RULES.quietMs) continue;
    if (!(c.pathLength >= LONELY_RULES.minPath)) continue;
    rows.push({ tsid: c.tsid, lastAt: v.lastAt });
  }
  if (!rows.length) return null;
  const oldest = Math.min(...rows.map((r) => r.lastAt));
  const pool = rows.filter((r) => r.lastAt === oldest);
  return pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))].tsid;
}

/** canDoLoneliness (inc_world_events.js 93-111) for the one player. */
export function canInvite({ here = '', lonely = '', offWorld = false, dead = false, pathLength = 0 } = {}) {
  if (offWorld || dead || !lonely) return false;
  if (streetKey(here) === streetKey(lonely)) return false;
  return pathLength >= LONELY_RULES.minPath;
}

/** Whether the game should look for a lonely spirit now. */
export function checkDue(state, now = Date.now()) {
  return !state.event && now >= state.nextCheckAt;
}

/**
 * startLoneliness + the player's startLoneliness: the event, its type, and
 * the plea you are sent (option randInt(0, 8)).
 */
export function startEvent(state, { tsid, label, variant, look, now = Date.now(), rng = Math.random, type = '', option = null } = {}) {
  const t = type === 'A' || type === 'B' ? type : rng() < LONELY_RULES.raceChance ? 'A' : 'B';
  const opt = Number.isInteger(option) && option >= 0 && option <= 8 ? option : Math.floor(rng() * 9);
  state.event = normalizeEvent({
    tsid: streetKey(tsid),
    label,
    variant,
    look,
    type: t,
    option: opt,
    uid: `${streetKey(tsid)}_${Math.floor(now / 1000)}`,
    startAt: now,
    endsAt: now + (t === 'A' ? LONELY_RULES.raceMs : LONELY_RULES.partyMs),
  });
  state.lastStartAt = now;
  state.nextCheckAt = now + LONELY_RULES.eventGapMs;
  return state.event;
}

/** lonelinessVisit for the one invited player: the race or the party, and the event ends. */
export function visitEvent(state, now = Date.now()) {
  const e = state.event;
  if (!isRunning(e, now)) return null;
  e.visitedAt = now;
  if (e.type === 'B') {
    e.partyAt = now + LONELY_RULES.partyStartMs;
    state.parties += 1;
    return { kind: 'party', partyAt: e.partyAt };
  }
  state.cured += 1;
  return { kind: 'race', numVisitors: 1 };
}

/** The event is over (told, missed, or the party is done): forget it. */
export function clearEvent(state, { missed = false } = {}) {
  if (missed) state.missed += 1;
  state.event = null;
  return state;
}

/** A random pause in [lo, hi] ms (randInt). */
export function between([lo, hi], rng = Math.random) {
  return Math.round(lo + (hi - lo) * rng());
}
