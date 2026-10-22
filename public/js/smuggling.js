/**
 * Warm and Smuggly: carry a Smuggler's Contraband to a far street without a
 * Deimaginator catching you. Pure rules for js/features/smuggling-feature.js.
 *
 * Source (Tiny Speck GameServerJS, CC0):
 *   quests/smuggling_basic.js      flag contraband_delivered, repeatable,
 *                                  doProvided: one Contraband
 *   items/npc_smuggler.js          give (red) and receive (green) smugglers:
 *                                  onPlayerCollision (level 11+, not carrying,
 *                                  once an hour per smuggler unless Max Luck,
 *                                  then 20%), arrive/idle/talk/give/take/exit
 *                                  states, 30 s give timeout, the seven
 *                                  conversations, 100 iMG + 200 currants + a
 *                                  Walloping Big Diamond on delivery
 *   items/contraband.js            check the address, drop (fails the quest),
 *                                  the destination map by starting street
 *   items/npc_deimaginator.js      the catcher: appears 1 s after you enter,
 *                                  follows from 3 s at 65 px/s, re-checks
 *                                  every second, jumps after you (90%) when
 *                                  more than 1,500 px away, catches on
 *                                  contact (25 x 25 hit box), spares you near
 *                                  a signpost once you have moved 200 px
 *   locations/inc_smuggling.js     receiver 250-2,000 px away, deimaginator
 *                                  250-1,000 px away and only on 90% of
 *                                  streets (never in Hell or an instance)
 *   locations/inc_npcs.js          location_spawns while Don't Get Caught!
 *   players/inc_announcements.js   the familiar's restriction / destination
 *                                  overlays, then the map opens on the path
 *   players/inc_teleportation.js, items/subway_gate.js  no teleporting or
 *                                  subway while carrying
 *
 * Where the give smugglers stood is lost with the location objects; the
 * contraband's `destinations` map is keyed by the ten streets the quest starts
 * from, so the remake stands one there (dev Simon's POL excluded).
 */

export const SMUGGLING_QUEST = 'smuggling_basic';
export const DELIVERED_FLAG = 'contraband_delivered';
export const CONTRABAND = 'contraband';
export const SMUGGLER_CLASS = 'npc_smuggler';
export const DEIMAGINATOR_CLASS = 'npc_deimaginator';
export const CARRY_BUFF = 'dont_get_caught';
/** quests/smuggle_the_smuggler_part1.js: the imprisoned-friend line the Smuggler offers. */
export const STS_PART1 = 'smuggle_the_smuggler_part1';
export const STS_TOOLS = Object.freeze(['shovel', 'ace_of_spades']);

/** npc_smuggler.js onPlayerCollision / giveAppearForPlayer / timers. */
export const SMUGGLER = Object.freeze({
  minLevel: 11,
  appearChance: 0.2,
  seenMs: 60 * 60 * 1000,
  giveTimeoutMs: 30_000,
  idleMinMs: 2000,
  idleMaxMs: 7000,
  talkDelayMs: 700,
  giveDisappearMs: 500,
  cancelDisappearMs: 2000,
  receiveDisappearMs: 3000,
  resetMs: 1000,
  timeoutResetMs: 1500,
  deleteMs: 1000,
  bubbleMs: 10_000,
  hitW: 55,
  hitH: 90,
  talkOffset: 100,
});

/** npc_deimaginator.js + inc_smuggling.js smuggling_spawn_deimaginator. */
export const DEIMAGINATOR = Object.freeze({
  noSpawnChance: 0.1,
  spawnMin: 250,
  spawnMax: 1000,
  appearMs: 1000,
  followMs: 3000,
  followTickMs: 1000,
  speed: 65,
  hitW: 25,
  hitH: 25,
  farPx: 1500,
  jumpChance: 0.9,
  jumpMin: 500,
  jumpMax: 1250,
  jumpMs: 1000,
  goAwayMs: 500,
  deleteMs: 1500,
  signpostPx: 200,
  dropMs: 2000,
  finishMs: 2000,
  leaveAfterCatchMs: 2000,
  leaveEmptyMs: 2500,
});

/** inc_smuggling.js smuggling_spawn_receiver. */
export const RECEIVER = Object.freeze({ spawnMin: 250, spawnMax: 2000 });

/** npc_smuggler.js receive conversations: stats_add_xp(100), stats_add_currants(200), gem_diamond. */
export const RECEIVE_REWARDS = Object.freeze({ xp: 100, currants: 200, item: 'gem_diamond', count: 1 });

/** contraband.js `destinations`, by the street the quest starts from. */
export const DESTINATIONS = Object.freeze({
  LCRGEU0PUP12CLS: ['LIFFBC4MNO72556', 'LIF1AQ6CK972734', 'LIFEL8CPH08259V', 'LHV2JBHA9152QAS', 'LCR10H9E3QJ1E2P'],
  LLICF642CTI16R1: ['LIFMOLVTLHV1RAR', 'LIF10O20NQU1B2P', 'LM416LNIKVLM1', 'LCR111KI08O1HLB', 'LTJOCVQUMHV1K83'],
  LLIF3AQTOFE19OR: ['LCR10199TPJ1DA3', 'LCR10K0NLRK1GKE', 'LLIFINFQT8G13OU', 'LCR16VUKOQL18DU', 'LCR13VM1REM1GHI'],
  LIF18V95I972R96: ['LA93B4PV0I82IH7', 'LA9L02KJ2D829LS', 'LA9FDN44SG92SDQ', 'LA97Q5LV0F92PU6', 'LA9NRNJSB792OG4'],
  LM413SQ6LRN58: ['LTJ11KEKAKO196V', 'LCR10157DMK1L0G', 'LCR131F8U1K1PF9', 'LCR143M18PK1774', 'LTJ12E6VSFQ1V4E'],
  LA9KL9UE1D82RFO: ['LHVAKM1MR032IGJ', 'LHFD24US63D2QO6', 'LIF14VBBV872N2I', 'LHVH2BF13132CUF', 'LHFTQ7GLV2D2GG1'],
  LTJ13TRDHKV1970: ['LA9111M11LA2VAT', 'LA9TIJ7S4JA2CNF', 'LA9U04T3OAA2R2L', 'LIFMOLVTLHV1RAR', 'LIF102S56SV16TJ'],
  LDOVUDD84DD2U4U: ['LHFNBKJMP4D2S9M', 'LA96CLEAK692K72', 'LA99NEQK1F92ICE', 'LA95G0P137927B4'],
  LHV17CFO5V327AJ: ['LHV12AQNBB32CJ2', 'LIF13QL5IG02UAI', 'LA512IH5226256P', 'LA517KBQL262H3U', 'LCR1303AT622I0Q'],
  LA55645B8O528MI: ['LHV4U1QMFC42NBP', 'LHVB16RSG652GJ4', 'LHV43I0BI352TG6', 'LIF16SBFB972GLK', 'LIF103GH4C72BHJ'],
});

/** contraband.js `default_destinations` (a start that is not in the map). */
export const DEFAULT_DESTINATIONS = Object.freeze([
  'LLIFIG7BP8G1MU9', 'LLIERMJ93DE1H25', 'LLI32J0SVTD114U', 'LCR11DNA3EL10TD', 'LCR143M18PK1774', 'LLI2V0UN7RD1T2J',
  'LCR103UREMK11MT', 'LCR195Q63RK143M', 'LIF101NCNU112O2', 'LIF102FDNU11314', 'LIF2IUQJQ571TFL',
]);

/** The give smugglers' streets: the destination map's starting points. */
export const SMUGGLER_STREETS = Object.freeze(Object.keys(DESTINATIONS));

export const TEXT = Object.freeze({
  smugglerLabel: 'Smuggler',
  smugglerSub: 'A member of the [REDACTED] movement',
  deimLabel: 'Deimaginator',
  deimSub: 'Enemy of imagination',
  talkTip: 'Discuss a matter of grave importance',
  talked: 'We already talked!',
  giveArrive: (name) => `psssst! ${name}! There's something really important we need you to do for us! Come talk to me...`,
  giveTimeout: "Never mind... I guess you're busy.",
  giveCancel: "I hadn't finished talking to you! How rude!",
  giveLuck: 'Good luuuuuuuuuuuuuuuck...',
  receiveArrive: (name) => `psssst! ${name}! Have you got something for me?`,
  receiveBye: 'Byeeeeeeeeeeeeeeeeee...',
  deimAppear: 'There is a Deimaginator here, and it wants your contraband!',
  caught: 'Oh no! The Deimaginator caught you.',
  caughtBubble: 'Well, well! What have we here?',
  caughtFail: "Well gosh darn it! They did warn you to stay away from those deimaginators, didn't they, kid? Better luck next time...",
  emptyBubble: "Huh. You don't have anything I want. Carry on.",
  lostFail: 'Oh no! You lost your package. Better luck next time...',
  dropActivity: "Clumsy! The Contraband doesn't take kindly to being dropped, and disappears...",
  dropFail: "Rule 1 of delivery, kid - don't drop the package! Better luck next time!",
  dropTip: 'Dropping this is probably a bad idea',
  checkTip: "Remind yourself of this package's destination",
  offPath: 'Hmm. You seem to be off the path right now. Your contraband is temporarily confused about where it needs to go.',
  teleport: "That fragile Contraband won't survive teleportation.",
  subway: "I'm sorry: public transportation is not available to those engaging in journeys of dubious purpose.",
  needTool: 'You need some sort of tool to help you out. You dig?',
  buffName: "Don't Get Caught!",
  buffDesc: "You've been entrusted with an important delivery. Don't let it fall into the wrong hands",
});

/** players/inc_announcements.js overlay_script_smuggling_explain_restrictions. */
export const EXPLAIN_RESTRICTIONS = Object.freeze([
  "How exciting! Remember, don't let the deimaginators get too close to you or they'll confiscate your contraband.",
  'Also… the contents of that package won\'t fare too well on public transit, and are too fragile for teleportation.',
  "Whenever you're ready, your top secret delivery destination will be revealed.",
]);

/** overlay_script_smuggling_reveal_destination (one of these). */
export const REVEAL_DESTINATION = Object.freeze([
  "And today's destination is...",
  "Today you'll be hauling those goods to...",
  'This time around, that bundle of joy needs to get to...',
  'The destination you need to hustle your way to is...',
]);

export const CONTRABAND_ITEM = Object.freeze({
  label: 'Contraband',
  namePlural: 'Contraband',
  desc: "This is a surprisingly light package of *something* given to you by a smuggler who might ask you to take it from one place to another for reasons you cannot fully grasp. Still, a job's a job, right? What business is it of yours what's in the package. It DOES smell familiar, though…",
  stackMax: 1,
  baseCost: 0,
  sellable: false,
  donatable: false,
  tags: ['contraband', 'smuggling', 'no_rube', 'no_discovery_dialog', 'no_auction', 'no_trade', 'quest-item'],
});

/* ------------------------------------------------------------------ */
/* Conversations (npc_smuggler.js conversation_run_*)                   */
/* ------------------------------------------------------------------ */

/*
 * Each node: { text, choices: [{ label, next, actions }] }. `actions` run when
 * the choice is picked, in the order the source handler ran them:
 *   start    giveStartQuest (quest + Contraband, giveBox)
 *   decline  exitWithBox, reset 1 s later
 *   explain  idleNoBox, gone 0.5 s later, restriction overlay then the map
 *   reveal   idleNoBox, gone 0.5 s later, destination overlay then the map
 *   deliver  Don't Get Caught! ends, the Contraband goes, flag, takeBox
 *   reward   100 iMG, 200 currants, a Walloping Big Diamond
 *   complete gone 3 s later, the quest completes
 * A node with no choices is the last line (closed with OK).
 */
const c = (label, next, actions = []) => ({ label, next, actions });

export const CONVERSATIONS = Object.freeze({
  give_first_time: {
    start: {
      text: "Hey there. So... we have some, ahem, \"stuff\" which we need to get from A (here) to B (somewhere else)… without attracting attention. If you know what I'm saying. Some might call it smuggling, but we find that word a bit uncouth.",
      choices: [c('Smuggling, you say? I might be interested in that.', 'yes'), c('No way! Move your own "stuff", chum.', 'no')],
    },
    yes: { text: 'You wanna smuggle? For realz? Sweet!', choices: [c("I'm excited!", 'take', ['start'])] },
    take: {
      text: 'Okay, so just take this package and deliver it. But be careful - there are deimaginators out there who will try to stop you from delivering. Avoid them at all costs!',
      choices: [c('Okay...', null, ['explain'])],
    },
    no: {
      text: "That's okay, buddy. Not everyone can be an exciting, dynamic young go-getter. Some folks just lack a sense of adventure.",
      choices: [c('I resent that.', 'resent')],
    },
    resent: { text: "I'm sure you do, Captain Sensible. I'm sure you do.", choices: [c('Hmph.', null, ['decline'])] },
  },
  give_repeat1: {
    start: {
      text: 'Well I\'ll be… Back for another bite of the hot smuggling action, are we? The fire of questionably legal package delivery pumping through your veins, is it?',
      choices: [c('You bet. I was born for this.', 'drill', ['start']), c('On second thoughts, no.', 'no')],
    },
    no: { text: 'Your choice, friend. Maybe next time, eh?', choices: [c('Meh. Maybe.', null, ['decline'])] },
    drill: {
      text: "That's the stuff, comrade. You know the drill by now, right? Take the package, get it to the destination, avoid the deimaginators...",
      choices: [c('How could I forget?', 'ready')],
    },
    ready: { text: "Let's do this thing! Are you ready?", choices: [c('I was born ready.', null, ['reveal'])] },
  },
  give_repeat2: {
    start: {
      text: "You again? You just can't get enough of this smuggling lark, can you?",
      choices: [c('I think I may have found my calling.', 'listen', ['start']), c("Meh: I'm kinda over it.", 'no')],
    },
    no: {
      text: 'They all say that at first... but the urge to get back to the front line, battling to help save freedom of imagination through high-stakes package delivery usually wins out in the end.',
      choices: [c("I'm strong-willed.", null, ['decline'])],
    },
    listen: {
      text: 'Then listen very carefully: I will say this only once.  The deimaginators want this one, and they want it bad. Convey it to its intended destination, without delay.',
      choices: [c('Deimaginator: bad, destination: good. Got it.', null, ['reveal'])],
    },
  },
  give_repeat3: {
    start: {
      text: 'More smuggling? Excellent. Our movement needs dedicated smugglologist operatives like yourself. Ready for another run? ',
      choices: [c("Yup. Number one smuggloperative. That's me.", 'eyes', ['start']), c("Nah, you're thinking of someone else.", 'no')],
    },
    no: { text: 'Yeah. Someone cooler. Be on your way, good little citizen… ', choices: [c("You don't impress me, hoodlum. ", null, ['decline'])] },
    eyes: {
      text: 'Keep your eyes open, little comrade, the cause is depending on you. And the deimaginators are talking about stepping up their game.',
      choices: [c("Don't worry. I'm sharp. Like fox.", 'fox')],
    },
    fox: {
      text: 'Like a?… Whatever. All the words we just spoke will self-destruct in 5 seconds. Stay sharp, or foxy, whichever you prefer.',
      choices: [c('You can count on it.', null, ['reveal'])],
    },
  },
  receive_first_time: {
    start: { text: 'You made it! How perfectly frabjous! ', choices: [c('Frab-what?', 'thing')] },
    thing: { text: "Frabjous. But never mind that. Do you have the... thing?... With the stuff? Y'know, the…", choices: [c('The contraband?', 'that')] },
    that: { text: 'Yes, that.', choices: [c('I do! Here you go...', 'lovely', ['deliver'])] },
    lovely: {
      text: "Lovely! Thank you so much. I hope those deimaginators weren't too much trouble.",
      choices: [c("I got here, didn't I?", 'did', ['reward'])],
    },
    did: {
      text: "You did. Much to our surprise, and unlike so many who have tried before, you did.  How, I'll never know - but before I go, here's a little something for your trouble. ",
      choices: [c('Thanks!', 'thanks', ['complete'])],
    },
    thanks: { text: 'On the contrary, comrade: we thank YOU.', choices: [] },
  },
  receive_repeat1: {
    start: {
      text: "You made it! Again! And those people in the movement said you'd never survive what the deimaginators had planned for you.",
      choices: [c('What the deimaginati-what now?', 'nothing')],
    },
    nothing: {
      text: "Oh, nothing. Just trust me: if you've made it this far, you've either got luck or some pretty powerful friends. Now, let's get this - *ahem* - business concluded before anyone gets suspicious.",
      choices: [c('Hang on… ungh! Right: here you go! One package of "stuff".', 'moist', ['deliver'])],
    },
    moist: {
      text: 'It\'s, um, a tad... moist isn\'t it? Or would you say it\'s more "clammy"? How did you actually transport this, by the way?',
      choices: [c("Look, it's HERE, isn't it?", 'grateful', ['reward'])],
    },
    grateful: {
      text: "It certainly is. And we're grateful: no questions asked. To prove it - a little something-something to say thanks for supporting the cause.",
      choices: [c('Ooh, shiny.', 'more', ['complete'])],
    },
    more: { text: "There's always more where that came from.", choices: [] },
  },
  receive_repeat2: {
    start: {
      text: 'You managed to get here? Inconceivable! ',
      choices: [c('Is it? I mean, I just followed the map, avoided the deimaginators and brought the package…', 'piece')],
    },
    piece: {
      text: 'And you managed to bring the package in one piece too?!? INCONCEIVABLE! ',
      choices: [c("I don't think that word means what you think it means. But, here you go.", 'boom', ['deliver'])],
    },
    boom: { text: 'BOOM! Stay free, comrade. Free in the mind, free for all time!', choices: [c('What?', 'slogan', ['reward'])] },
    slogan: {
      text: 'Just testing out a new slogan. Help yourself to some of our communal cause stash, comrade.',
      choices: [c('Now this is my kind of cause!', 'rob', ['complete'])],
    },
    rob: { text: "That's right, we rob from the deimaginator rich and give to, well, you. Until next time, friend!", choices: [] },
  },
  receive_repeat3: {
    start: { text: "What's the password?", choices: [c('Password?', 'yeah')] },
    yeah: {
      text: "YEAH! PASSWORD, NOW, or I'll… Ha! Kidding! I'm having fun with you, comrade. You got the stuff?",
      choices: [c('Yes! Stuff. Let me tell you, it was pretty hairy getting it he…', 'peach', ['deliver'])],
    },
    peach: { text: "Whatever, kid. This is great. You're a peach.", choices: [c('I am?', 'peaches', ['reward'])] },
    peaches: {
      text: 'Yeah, you know. Fuzzy? Sweet? Good at smuggling stuff and following maps? You know: peaches! ',
      choices: [c('Sorry, what?…', 'esteem', ['complete'])],
    },
    esteem: {
      text: 'Whatever, comrade. The movement wanted me to pass on these tokens of our esteem. Stay free in the brain, kid.',
      choices: [],
    },
  },
});

/* ------------------------------------------------------------------ */
/* State                                                                */
/* ------------------------------------------------------------------ */

const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);

/**
 * Persistent smuggling state.
 *  seen       street -> when that street's give smuggler last rolled for you
 *  run        the delivery in progress ({ from, destination, startedAt }) or null
 *  started / delivered / failed   run counters (first-time vs repeat talk)
 */
export function createSmugglingState(seed = {}) {
  const seen = {};
  for (const [k, v] of Object.entries(seed.seen || {})) if (Number.isFinite(Number(v))) seen[k] = Number(v);
  const run = seed.run && typeof seed.run.destination === 'string'
    ? { from: String(seed.run.from || ''), destination: seed.run.destination, startedAt: num(seed.run.startedAt) }
    : null;
  return {
    seen,
    run,
    started: Math.max(0, num(seed.started)),
    delivered: Math.max(0, num(seed.delivered)),
    failed: Math.max(0, num(seed.failed)),
    caught: Math.max(0, num(seed.caught)),
  };
}

/** giveDoConversation: status done or fail_repeat -> a repeat greeting. */
export function giveConversation(state, rng = Math.random) {
  if (!(state.delivered + state.failed > 0)) return 'give_first_time';
  if (rng() < 0.33) return 'give_repeat1';
  if (rng() < 0.33) return 'give_repeat2';
  return 'give_repeat3';
}

/** receiveDoConversation: qi.repeats -> a repeat greeting. */
export function receiveConversation(state, rng = Math.random) {
  if (!(state.started > 1)) return 'receive_first_time';
  if (rng() < 0.33) return 'receive_repeat1';
  if (rng() < 0.33) return 'receive_repeat2';
  return 'receive_repeat3';
}

/**
 * onPlayerCollision for a give smuggler. ctx: { level, carrying, packFull,
 * maxLuck, street, now }. Mutates `seen` exactly as the source does.
 */
export function giveEncounter(state, ctx, rng = Math.random) {
  const now = num(ctx.now, Date.now());
  if (num(ctx.level) < SMUGGLER.minLevel) return { appear: false, reason: 'level' };
  if (ctx.carrying) return { appear: false, reason: 'carrying' };
  if (ctx.packFull) return { appear: false, reason: 'pack_full' };
  const street = String(ctx.street || '');
  const last = state.seen[street];
  if (last != null) {
    if (last + SMUGGLER.seenMs < now) delete state.seen[street];
    else if (!ctx.maxLuck) return { appear: false, reason: 'seen' };
  }
  state.seen[street] = now;
  if (ctx.maxLuck || rng() < SMUGGLER.appearChance) return { appear: true, reason: 'roll' };
  return { appear: false, reason: 'roll' };
}

/** cleanSeenIntervals: forget rolls older than an hour. */
export function cleanSeen(state, now = Date.now()) {
  for (const [k, at] of Object.entries(state.seen)) if (at + SMUGGLER.seenMs < now) delete state.seen[k];
}

/**
 * setSmugglingDestination: a random destination for the starting street,
 * else a default. `resolve(tsid)` maps a source TSID to a playable street
 * (null when the remake lacks it); unplayable picks are skipped.
 */
export function chooseDestination(fromTsid, { resolve = (t) => t, rng = Math.random } = {}) {
  const key = sourceKey(fromTsid);
  const pool = (DESTINATIONS[key] || DEFAULT_DESTINATIONS).filter((t) => resolve(t) && sourceKey(t) !== key);
  const list = pool.length ? pool : DEFAULT_DESTINATIONS.filter((t) => resolve(t) && sourceKey(t) !== key);
  if (!list.length) return null;
  return list[Math.min(list.length - 1, Math.floor(rng() * list.length))];
}

/** Street-index TSIDs use G for L (street-loader.js); compare on the source L form. */
export function sourceKey(tsid) {
  const t = String(tsid || '');
  return t.startsWith('G') ? `L${t.slice(1)}` : t;
}

export function isSmugglerStreet(tsid) {
  return SMUGGLER_STREETS.includes(sourceKey(tsid));
}

export function sameStreet(a, b) {
  return Boolean(a) && sourceKey(a) === sourceKey(b);
}

/**
 * A spawn x the way inc_smuggling.js picks one: half the time to the right
 * (flipped left when that leaves the street), else to the left (flipped right).
 */
export function spawnOffset(x, { l = 0, r = Infinity, min, max, rng = Math.random } = {}) {
  const span = () => min + Math.floor(rng() * (max - min + 1));
  let offset;
  if (rng() < 0.5) {
    offset = span();
    if (x + offset > r) offset = -span();
  } else {
    offset = -span();
    if (x + offset < l) offset = span();
  }
  return x + offset;
}

/** smuggling_spawn_deimaginator: about 10% of streets stay empty. */
export function deimaginatorSpawns(rng = Math.random) {
  return !(rng() < DEIMAGINATOR.noSpawnChance);
}

/** targetFollow: keep pathing, or (beyond 1,500 px) jump after you 90% of the time, else leave. */
export function followDecision(dx, rng = Math.random) {
  if (Math.abs(dx) <= DEIMAGINATOR.farPx) return 'path';
  return rng() < DEIMAGINATOR.jumpChance ? 'jump' : 'leave';
}

/**
 * Hit test between the avatar (feet at px,py; body ~40 x 70) and a
 * deimaginator's 25 x 25 box at its feet. Jumping over it clears the box
 * ("Deimaginators can be evaded by acrobatic manuevers").
 */
export function deimaginatorTouches(player, deim, body = { w: 40, h: 70 }) {
  if (!player || !deim) return false;
  const halfX = DEIMAGINATOR.hitW / 2 + body.w / 2;
  if (Math.abs(player.x - deim.x) > halfX) return false;
  const top = deim.y - DEIMAGINATOR.hitH;
  return player.y > top && player.y - body.h < deim.y;
}

/** The smuggler's 55 x 90 box against the avatar's feet point. */
export function smugglerTouches(player, x, y, body = { w: 40 }) {
  if (!player) return false;
  return Math.abs(player.x - x) <= SMUGGLER.hitW / 2 + body.w / 2 && player.y > y - SMUGGLER.hitH && player.y - 70 < y;
}

/**
 * onPlayerCollision lag rule: once you have moved 200 px from where you
 * stood when it arrived, being within 200 px of a signpost spares you.
 */
export function sparedBySignpost(player, startedAt, signposts = []) {
  if (!player || !startedAt) return false;
  const moved = Math.abs(player.x - startedAt.x) > DEIMAGINATOR.signpostPx || Math.abs(player.y - startedAt.y) > DEIMAGINATOR.signpostPx;
  if (!moved) return false;
  return signposts.some((s) => Math.abs(s.x - player.x) < DEIMAGINATOR.signpostPx && Math.abs(s.y - player.y) < DEIMAGINATOR.signpostPx);
}

/**
 * Breadth-first route through visible signposts (the client path the map
 * drew). graph: tsid -> neighbour tsids (street-index keys). Returns the
 * street list from `from` to `to` inclusive, or null.
 */
export function routeTo(graph, from, to) {
  if (!graph || !from || !to) return null;
  if (from === to) return [from];
  const prev = new Map([[from, null]]);
  const queue = [from];
  while (queue.length) {
    const cur = queue.shift();
    for (const next of graph[cur] || []) {
      if (prev.has(next)) continue;
      prev.set(next, cur);
      if (next === to) {
        const path = [to];
        for (let at = cur; at != null; at = prev.get(at)) path.unshift(at);
        return path;
      }
      queue.push(next);
    }
  }
  return null;
}

/** HUD copy for the run in progress. */
export function carryObjective({ destinationLabel = '', nextLabel = '', arrived = false, offPath = false } = {}) {
  if (arrived) return `You made it to ${destinationLabel}. Look around for your contact.`;
  if (offPath) return `Destination: ${destinationLabel}. ${TEXT.offPath}`;
  return nextLabel ? `Destination: ${destinationLabel} · Next signpost: ${nextLabel}` : `Destination: ${destinationLabel}`;
}
