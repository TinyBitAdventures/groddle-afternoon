/**
 * The Butler (items/bag_butler.js, Nov 2012) for a one-player Ur: pure rules,
 * the recovered copy and the art table. js/features/butler-feature.js puts it
 * on the home street.
 *
 * Source map (GameServerJS):
 *  - Delivery: players/inc_butler.js giveButlerBox (level 3, a home, no
 *    Butler yet) drops a "Special One-Time Delivery" (items/butler_box.js) on
 *    the home street from locations/home.js playerEnterCallback. Read label
 *    runs conversation_run_read_label (four beats); Open puffs the box and
 *    createButler makes the Butler 750 ms later at the box's x, randomizes its
 *    look and runs doIntro two seconds after that.
 *  - The Butler is an npc_mailbox child: it can open your mailbox
 *    (access_mailbox → checkMail), takes packages and messages from visitors
 *    (leave_package / leave_message → packages.list / messages.list keyed by
 *    giver, limits capacity 5, package_limit 5, message_limit 10) and hands
 *    them to the owner (retrieve_messages / retrieve_packages →
 *    giveNextMessage / giveNextPackage, one at a time, "Thanks!" for the next).
 *  - It stands at a post (target_loc, default 660 "to the right of the door";
 *    set post moves it to where you stand), wanders up to 300 px either side
 *    while idle and walks back after wait_time 15 s without a command.
 *  - Owner verbs: name (19 characters, tags stripped, nameSuccess /
 *    nameShortened), customize (the client's Customizer, eight parts), set post, mailbox,
 *    messages, packages, who visited?, give (a gift handed to each visitor
 *    once per class), muffle / dispense butlerly wisdom (hints), zip it /
 *    chatter (idle chatter), and the IM commands dance (faster, faster
 *    again falls over), jump and zombie. The after_greeting_owner and teach
 *    conversations give "talk to" its menu and the alphy jokes.
 *  - Hints (items/include/butler_hints.js giveHint): from ten minutes after the
 *    intro, when the owner comes within near_dist 250, at most every 7 min
 *    (level 7 and under), 30 min (12 and under) or an hour.
 *  - Quests (doQuests, bag_butler.js 2095-2110): players/inc_stats.js gives
 *    the Butler Join the Club at 30128 iMG; once instance_exit_via_signpost is
 *    set, the owner coming home within 600 px (onPlayerEnter 4180-4184) or
 *    into the far hit box sets talk_to_butler and turns the quest in.
 *  - Idle chatter (onIdle): five minutes apart, two minutes after the last
 *    command; 20% of the time at level 18+ without a Tower it is
 *    buildTowerComment instead.
 *
 * Solo remake: the visitors are the six neighbours of js/neighbours.js. A
 * neighbour who drops by while you are out (Visiting Stone opt-in) leaves the
 * gift as a package and the line as a message with the Butler, as a visiting
 * player did; letters that come by post stay in the mailbox.
 */

import { getGameDayKey } from './game-day.js?v=dametime-1';
import { normalizeButlerHi } from './hi-signs.js?v=hi-signs-1';

/** classProps and onCreate numbers. */
export const BUTLER = Object.freeze({
  CLASS: 'bag_butler',
  NEAR_DIST: 250,
  FAR_DIST: 550,
  AT_DIST: 50,
  STEP_AWAY_DIST: 100,
  REQUIRED_CLICK_DELAY: 3000,
  CAPACITY: 5,
  PACKAGE_LIMIT: 5,
  MESSAGE_LIMIT: 10,
  WAIT_TIME: 15_000,
  /** npc_walk_speed, px/s. */
  WALK_SPEED: 75,
  /** startMoving: never more than 300 px from the post. */
  WANDER_RANGE: 300,
  /**
   * lookAtPlayer (bag_butler.js 2971-3020): facing away from the player, it plays turnBack
   * (playAnim 633 ms, held: playAnim sets no endAnim for turnBack, 2337) and 1500 ms later
   * facePlayer (2183-2193) turns it round and plays turnFront (667 ms).
   */
  TURN_BACK_MS: 633,
  TURN_FRONT_MS: 667,
  FACE_DELAY_MS: 1500,
  /** onStepping done (4549-4559): look at a player within 300 px. */
  STEP_LOOK_DIST: 300,
  /** stateChange('idle'): 2-30 s before the next stroll. */
  IDLE_MIN_MS: 2000,
  IDLE_MAX_MS: 30_000,
  NAME_MAX: 19,
  MESSAGE_MAX: 431,
  /** inc_butler.js createButler: doIntro after 2 s. */
  INTRO_DELAY_MS: 2000,
  /** butler_box.js open: createButler after 750 ms. */
  OPEN_DELAY_MS: 750,
  /** giveButlerBox: stats_get_level() >= 3. */
  BOX_MIN_LEVEL: 3,
  /** onIdle: idle comments at most every 5 min, 2 min after a command. */
  IDLE_SPEAK_GAP_MS: 5 * 60_000,
  IDLE_QUIET_MS: 2 * 60_000,
  /** giveHint: start_delay 10 min after the intro. */
  HINT_START_DELAY_MS: 10 * 60_000,
  /** The source's chance of buildTowerComment over the usual idle line. */
  TOWER_COMMENT_CHANCE: 0.2,
  TOWER_COMMENT_LEVEL: 18,
  /** One Glitch game day (game_days_since), for "You haven't been home for N days." */
  GAME_DAY_MS: 14_400 * 1000,
});

/** butler_box.js (label, description, conversation_run_read_label). */
export const BUTLER_BOX = Object.freeze({
  CLASS: 'butler_box',
  label: 'Special One-Time Delivery',
  description: 'Special delivery, just for you! Whatever could it be?',
  notYours: 'This delivery box is for somebody else. Maybe you have a delivery too?',
  beats: Object.freeze([
    Object.freeze({ text: 'A special shipment from Tiny Speck, Inc. Greetings and salutations! Inside this package you will find one, slightly worn but very loving Butler!', response: 'Butler? What? Where?' }),
    Object.freeze({ text: 'We made the Butlers out of some old dolls that were originally made by the Toymakers — who existed in a previous world that the Giants never finished imagining — so we kinda had to guess about how to hook them up … ', response: 'And...?' }),
    Object.freeze({ text: 'Well, they may still have a few kinks, but your Butler knows how to do all sorts of interesting and helpful things. For example, it can take messages and packages from visitors.', response: 'That’s good!' }),
    Object.freeze({ text: 'So open me up and meet your new-to-you Butler.', response: 'Roger dodger.' }),
  ]),
});

/** bag_butler.js label / description. */
export const BUTLER_ITEM = Object.freeze({
  label: 'Butler',
  description: 'Sewn from scraps of imagination and brought to life with a breath of happy servitude, your personally customized Butler or Butlerina enjoys buttling on your Home Street and can help you with many things. These include: mail, taking messages and packages, handing out gifts, and chatting with you.',
});

/** items/include/butler_strings.js strTable, the lines the solo Butler can say (verbatim). */
export const BUTLER_STRINGS = Object.freeze({
  ownerGreeting: 'Welcome home.',
  ownerAwayTime: " You haven't been home for $time_away days.",
  ownerAwayTimeLong: ' I must admit I feel slightly neglected.',
  ownerNumVisitors: ' $visitors people have stopped by today.',
  ownerMessagesAndPackages: ' $pc left you $num_messages $messages and $num_packages $packages.',
  ownerSingleMessager: ' $pc left you $num_messages $messages.',
  ownerMultipleMessagers: ' You have $num_messages_today recent $messages_recent, and $num_older_messages older $messages_older.',
  ownerPackagesAfterMessages: ' And I have $num_packages $packages for you.',
  ownerMessages: ' I have $num_messages $messages for you.',
  ownerPackages: ' I have $num_packages $packages for you.',
  ownerMessagesPackagesNew: ' I have $num_messages $messages for you, and $num_packages $packages.',
  ownerMail: 'You have mail.',
  ownerMailAlso: ' Also, you have mail.',
  ownerPopular: ' You seem to be very popular today.',
  ownerGenerous: ' Your friends have been very generous today.',
  greetingNoResponse: "Oh, well. I'll be around if you need me.",
  ownerSuggestPackages: 'Would you like your packages now?',
  ownerSuggestMessages: 'Would you like to see your messages?',
  ownerSuggestVisitors: "Would you like me to tell you about today's visitors?",
  ownerNoSuggestions: ' Please click on me if you need anything.',
  normalClickResponseList: ['Hello, how can I help you?', 'Bonjour! What shall I do for you?', 'At your service!', 'Greetings! How can I be of service?'],
  somewhatAnnoyedClickResponseList: ['Hey, that tickles!', 'What?', 'Stop it!', 'Go poke somebody else.', 'Hey!', 'Stop touching me!'],
  reallyAnnoyedClickResponseList: ['Quit poking me!', 'HEY! Stop that!', 'Go squeeze a chicken or something.', 'That hurts!', 'Ow.'],
  reallyReallyAnnoyedClickResponseList: ['STOP IT!', 'WHY ARE YOU DOING THIS?', 'QUIT IT!', ':-(   :-(   :-(   :-(   :-('],
  fasterFall: ["I'm so dizzy.", 'Fall down, go boom.', 'Ouch.', 'Ooof.'],
  teachOwnerSuccess: 'Ok, I will say $owner_greeting to you.',
  teachIdleSuccess: 'Ok, I will say $idle_comment when I\'m bored.',
  messageFail: "Sorry, I can't remember any more messages.",
  visitorGiftTooltip: 'Leave a gift for your visitors. Current gift: $param.',
  visitorGiftPrevious: 'Right now I have $param for visitors, which you will have to take back if you give me something new. ',
  visitorGiftSame: 'I already have $param. ',
  visitorGiftNoPrevious: 'If you give me something, I will hand it out to your visitors. ',
  visitorGiftConfirmPlural: 'Do you want me to take these $param?',
  visitorGiftConfirm: 'Do you want me to take this $param?',
  visitorGiftNo: "Oh, you don't want me to take that? Ok.",
  visitorGiftAccept: "Thanks! I'll give this to the next visitor I see.",
  visitorGiftAcceptPlural: "Thanks! I'll give these to visitors.",
  packageFail: "Sorry, I can't carry any more packages.",
  packageTypeFail: "Sorry, I'm not equipped to carry that.",
  nameResponse: 'My name is $butler.',
  nameSuccess: ['Delightful. From now on, I shall be known as $butler.', 'A wise choice, if I may say so. I am now called $butler.', '$butler it shall be. That is, until you decide otherwise...', "I've always liked the name $butler. And now, it is mine!"],
  nameShortened: ['Terribly sorry, but I can only remember $butler.', 'Unfortunately, I can only recall $butler.', '$butler is all I have the room left for, I’m afraid.', 'My apologies. $butler is all the letters I have room for!'],
  thanksResponse: "You're welcome",
  jumpFail: "I don't feel like jumping right now.",
  summonSucceed: "I'm on my way. ",
  alreadyDancing: "I'm dancing!",
  danceFail: 'Not right now.',
  goAwaySucceed: "Ok, I'm walking away.",
  alreadyDoingIt: 'I already am!',
  waitASec: 'Give me a second.',
  clickSummon: "I'm coming.",
  fasterFailList: ["Sorry, I can't do this any faster.", 'I could if I was dancing...', "I don't understand what you want from me.", 'Zoom zoom.', "I'm too dizzy"],
  visitorNumTimes: '$pc visited $param times',
  visitorOnce: '$pc visited once',
  visitorNone: 'Nobody has visited lately.',
  visitorsMany: "There were a lot of visitors, I'll IM you the list.",
  visitorsIntro: 'Since the last time you asked me, the following people have visited your street:',
  visitorsTooMany: " I think there were more, but that's all I can remember.",
  visitorNotifyOwnerHere: '$pc is on your Home Street.',
  visitorNotifyOwnerLeft: '$pc just left.',
  giftItem: 'Here is your $param from $owner. I hope you enjoy it!',
  packagesNone: 'I have no packages for you.',
  packagesStart: '$pc left you ',
  messageFromGiver: ' and told me to tell you: $message_text ($message_time).',
  packageNoMessage: " but didn't leave a message ($param).",
  packagesEnd: "That's all I have for you.",
  messagesStart: ['Yes, yes, let me get those for you!', "Alright, let's take a look!", 'Certainly, let me retrieve them!'],
  messagesNone: 'I have no messages for you.',
  messagesGive: '$pc asked me to tell you: $message_text ($message_time). ',
  moveAwayStuck: "I'm sorry, $pc. I don't have space to move away.",
  stepAwayList: ['Sorry!', 'Excuse me.', 'Pardon.', "I'll get out of your way."],
  stepAwayStuck: 'Excuse me, $pc. I seem to be boxed in here.',
  defaultIdleComment: ['Lovely weather today.', 'I like it here.', "I can't decide which Giant is my favorite.", 'Do dee da da, shaba do dee da da dee da doo', 'Oops, my stuffing is all bunched up.', 'Yaawn.', "I'm a butler and this is crazy...", ':-) :-) :-)', 'I say, the players in this game are lovely.', 'You are awesome!', 'Today is the best day ever!'],
  setPostConfirm: 'Are you sure you want to set my assigned post to where you are standing?',
  buildTowerComment: 'You know what would look great cultivated here? A tower!',
});

/** bag_butler.js doIntro (pc.label: the remake's players have no name, so "friend"). */
export const BUTLER_INTRO = (name = 'friend') => `Thank you. I am very happy to be here with you, ${name}. I look forward to being of service.`;
export const BUTLER_INTRO_REPLY = 'Welcome!';

/** conversation_run_after_greeting_owner: the talk-to menu, in source order. */
export const BUTLER_SERVICE = Object.freeze({
  text: 'How can I be of service?',
  choices: Object.freeze([
    Object.freeze({ value: 'mailbox', txt: 'Access my mailbox!' }),
    Object.freeze({ value: 'messages', txt: 'Give me my messages!' }),
    Object.freeze({ value: 'packages', txt: 'Give me my packages!' }),
    Object.freeze({ value: 'chat', txt: 'I just wanna chat.' }),
    Object.freeze({ value: 'nothing', txt: "I don't need anything." }),
    Object.freeze({ value: 'teach', txt: 'I have something to teach you.' }),
  ]),
});

/**
 * conversation_run_teach. The friend and stranger greetings are for visiting
 * players, so the solo menu keeps the owner greeting and the idle comment.
 */
export const BUTLER_TEACH = Object.freeze({
  text: 'What would you like to teach me?',
  inputTitle: 'Teach Me!',
  inputLabel: 'What I should say:',
  choices: Object.freeze([
    Object.freeze({ value: 'owner_greeting', txt: 'A greeting for me.' }),
    Object.freeze({ value: 'idle_comment', txt: "Something to say when you're bored." }),
    Object.freeze({ value: 'nothing', txt: 'Nothing.' }),
  ]),
});

/** butler_strings.js `alphy`: the jokes behind "I just wanna chat." (buildAndRunConvo). */
export const BUTLER_JOKES = Object.freeze([
  [['So the other day, a piggy walked into a bar.', 'The only bar I know of is the Hell Bar. So it was a dead piggy?'],
    ["I guess. But it doesn't matter!", 'Ok, ok. Go on.'],
    ["So the piggy says to the bartender 'I think you set your bar too high!'", "How come dead piggies don't come back to life the way Glitchen do?"],
    ['TOO HIGH. The piggy walked into the bar because piggies are SHORT and the bar was TOO HIGH.', 'Ok, ok, I get it already.'],
    ["Then why aren't you laughing? You have no sense of humour!", 'I guess not.']],
  [['Why did the chicken cross the road?', "I don't know. What's a road?"], ['To get to the chicken stick! HA HA HA!', 'Ha ha?']],
  [['What did the Glitchmas Yeti say when he found a house with three Patches?', 'What?'], ['Hoe, hoe, hoe! LOL!', 'Very funny.']],
  [['Why did the bureaucrat cross the road?', 'Why?'], ['Because he had the correct permit, filled out in triplicate. HEE HEE HEE!', 'Um...']],
  [['Why did the Glitch not buy a meditation device?', 'Why not?'], ['Because he orb-ready had one. HA HA', 'Ha. I guess.']],
  [['What did the Sparkly in Ajaya Bliss say?', 'What?'], ["Hey! Why's everyone picking on me?!?", 'Ha ha!']],
  [['Why should you swap a Bean for a Cubimal if you get the chance?', 'Why?'], ['Because it would be Rube not to.', '...Thanks.']],
  [['What do giant devotees prefer to drink with breakfast?', 'What?'], ['A nice cup of Tii. ROFL!', '...lol.']],
  [['Why do philosophy students study Dirt Piles?', 'Why?'], ['Because Loam is where Descartes is. LOL LOL LOL', "I think that's actually the worst joke I've ever heard"]],
  [["Why is the novice chef's food so bad?", 'Why?'], ['He keeps making a Hash of it.', 'Very funny.']],
  [['Why was the Glitch happy to see a ghost?', 'Why?'], ['It raised her spirits. HEE HEE HEE!', 'Um...']],
  [['Why did the Glitch refuse to visit Newcot Close?', 'Why?'], ['He had a fear of Heights. HA HA HA', 'Ha. I guess.']],
].map((joke) => Object.freeze(joke.map(([text, response]) => Object.freeze({ text, response })))));

/**
 * The looks. bag_butler.swf composes eight parts (bag_butler.as
 * config_options, the GSJS instance props of bag_butler.js 41-48 / 67-79);
 * js/butler-rig.js paints any combination from the SWF's vectors
 * (assets/butler-rig/butler.json, tools/avatar-compositor/butler.mjs).
 * The CC0 OGA archive has whole-butler sheets for four combinations; the
 * three complete ones (BUTLER_LOOKS) are the part choices of saves made
 * before the rig, and Look 1's idle0 / walk4 sheets the fallback art while
 * the rig loads (BUTLER_FALLBACK).
 */
export const BUTLER_OPTIONS = Object.freeze({
  accessory: Object.freeze(Array.from({ length: 12 }, (_, i) => `${i + 1}`)),
  bod: Object.freeze(Array.from({ length: 16 }, (_, i) => `body${i + 1}`)),
  skull: Object.freeze(Array.from({ length: 22 }, (_, i) => `skull${i + 1}`)),
  face: Object.freeze(Array.from({ length: 13 }, (_, i) => `face${i + 1}`)),
  closeArm: Object.freeze(Array.from({ length: 12 }, (_, i) => `${i + 1}`)),
  farArm: Object.freeze(Array.from({ length: 12 }, (_, i) => `${i + 1}`)),
  closeLeg: Object.freeze(Array.from({ length: 13 }, (_, i) => `${i + 1}`)),
  farLeg: Object.freeze(Array.from({ length: 11 }, (_, i) => `${i + 1}`)),
});
export const BUTLER_PART_NAMES = Object.freeze({
  accessory: 'Accessory', bod: 'Body', skull: 'Head', face: 'Face',
  closeArm: 'Arm 1', farArm: 'Arm 2', closeLeg: 'Leg 1', farLeg: 'Leg 2',
});
/** bag_butler.as config_option_names_sort. */
export const BUTLER_PART_ORDER = Object.freeze(['skull', 'face', 'accessory', 'bod', 'closeArm', 'farArm', 'closeLeg', 'farLeg']);

const look = (id, name, parts, cell, anchor, cols) => Object.freeze({ id, name, parts: Object.freeze(parts), cell: Object.freeze(cell), anchor: Object.freeze(anchor), cols: Object.freeze(cols) });
/** Columns per sheet; the frame counts match across looks (FRAMES). */
const COLS_124 = { idle0: 1, idle1: 8, idle2: 8, idle3: 5, idle4: 8, talk: 8, bow: 8, acknowledge: 7, wave: 8, startle0: 6, startle1: 8, startle2: 7, danceStart: 7, dance: 7, fastDance: 8, fall: 8, jump: 8, walk4: 7, walk3: 8, stepBack: 8 };
const COLS_164 = { idle0: 1, idle1: 6, idle2: 6, idle3: 5, idle4: 6, talk: 6, bow: 6, acknowledge: 5, wave: 6, startle0: 6, startle1: 5, startle2: 6, danceStart: 5, dance: 6, fastDance: 6, fall: 22, jump: 6, walk4: 5, walk3: 6, stepBack: 6 };

export const BUTLER_LOOKS = Object.freeze([
  look('v10', 'Look 1', { accessory: '10', bod: 'body10', skull: 'skull10', face: 'face10', closeArm: '10', farArm: '10', closeLeg: '10', farLeg: '10' },
    { w: 124, h: 141 }, { x: 49 / 124, y: 122 / 141 }, COLS_124),
  look('v11', 'Look 2', { accessory: '11', bod: 'body11', skull: 'skull11', face: 'face11', closeArm: '11', farArm: '11', closeLeg: '11', farLeg: '11' },
    { w: 124, h: 141 }, { x: 49 / 124, y: 122 / 141 }, COLS_124),
  look('v22', 'Look 3', { accessory: '10', bod: 'body6', skull: 'skull22', face: 'face9', closeArm: '10', farArm: '10', closeLeg: '9', farLeg: '11' },
    { w: 164, h: 155 }, { x: 66 / 164, y: 136 / 155 }, COLS_164),
]);

/** Frames per animation (measured: last populated cell; 30 fps, the SWF rate). */
export const BUTLER_FRAMES = Object.freeze({
  idle0: 1, idle1: 154, idle2: 110, idle3: 9, idle4: 85, talk: 102, bow: 40, acknowledge: 20, wave: 52,
  startle0: 11, startle1: 15, startle2: 27, danceStart: 25, dance: 34, fastDance: 16, fall: 169, jump: 51,
  walk4: 20, walk3: 24, stepBack: 16,
});
/**
 * Doll clips with no OGA sheet, painted by the rig only (butler.json labels). The game plays
 * turnBack / turnFront where bag_butler.js does (lookAtPlayer, facePlayer). walk1 and walk2 stay
 * unused: chooseWalk (bag_butler.js 1971-1984) always picks walk4 (walk3 is the zombie walk) and
 * has the walk1 / walk2 picks commented out.
 */
export const BUTLER_RIG_FRAMES = Object.freeze({ walk1: 21, walk2: 41, turnBack: 19, turnFront: 20 });
/** bag_butler.as loopers (of the shipped clips). */
export const BUTLER_LOOPERS = Object.freeze(['dance', 'walk3', 'walk4', 'talk', 'stepBack', 'fastDance']);
export const BUTLER_FPS = 30;

export function butlerLook(id) {
  return BUTLER_LOOKS.find((l) => l.id === id) || BUTLER_LOOKS[0];
}

/**
 * The loading fallback (and &butlerart=oga): only Look 1's standing pose and walk ship as
 * sheets. Every Butler shows them until the rig has loaded, whatever its parts; other clips
 * stand in as the walk (walk3, stepBack) or the standing pose, for the clip's own length.
 * The OGA archive keeps all four combinations (opengameart/extracted_butler).
 */
export const BUTLER_FALLBACK = Object.freeze({ look: 'v10', clips: Object.freeze(['idle0', 'walk4']) });

/** The shipped fallback clip that stands in for `clip`. */
export function fallbackClip(clip) {
  if (BUTLER_FALLBACK.clips.includes(clip)) return clip;
  return clip === 'walk3' || clip === 'stepBack' ? 'walk4' : 'idle0';
}

/** The fallback sheet for a clip (the look argument is kept for callers; one look ships). */
export function butlerSheetUrl(_lookId, anim) {
  return `assets/sprites/butler/butler_${BUTLER_FALLBACK.look}_${fallbackClip(anim)}.webp`;
}
export const BUTLER_BOX_ART = 'assets/sprites/butler/butler_box.png';

/**
 * Part choices of the OGA combinations (their file names): the three looks,
 * and the fourth, partial one (accessory 12 / body 12 / head 12, farLeg 1).
 */
export const BUTLER_LEGACY_LOOKS = Object.freeze({
  ...Object.fromEntries(BUTLER_LOOKS.map((l) => [l.id, l.parts])),
  v12: Object.freeze({ accessory: '12', bod: 'body12', skull: 'skull12', face: 'face12', closeArm: '12', farArm: '12', closeLeg: '12', farLeg: '1' }),
});

/** Valid part choices: each option from `raw`, else from the look `fallback` (v10). */
export function normalizeButlerParts(raw, fallback = 'v10') {
  const base = BUTLER_LEGACY_LOOKS[fallback] || BUTLER_LOOKS[0].parts;
  const src = raw && typeof raw === 'object' ? raw : {};
  const out = {};
  for (const [k, list] of Object.entries(BUTLER_OPTIONS)) {
    const v = String(src[k] ?? '');
    // The GSJS default instance prop is "accessory1" while the choices are "1".."12".
    const fixed = k === 'accessory' ? v.replace(/^accessory/, '') : v;
    out[k] = list.includes(fixed) ? fixed : base[k];
  }
  return out;
}

/** The OGA look these parts are, or 'custom'. */
export function lookIdForParts(parts) {
  const hit = BUTLER_LOOKS.find((l) => BUTLER_PART_ORDER.every((k) => l.parts[k] === parts?.[k]));
  return hit ? hit.id : 'custom';
}

/** The OGA look sharing the most parts (fallback art while the rig loads). */
export function nearestButlerLook(parts) {
  let best = BUTLER_LOOKS[0];
  let score = -1;
  for (const l of BUTLER_LOOKS) {
    const n = BUTLER_PART_ORDER.reduce((a, k) => a + (l.parts[k] === parts?.[k] ? (k === 'skull' || k === 'bod' ? 3 : 1) : 0), 0);
    if (n > score) { best = l; score = n; }
  }
  return best;
}

/** randomize (bag_butler.js 5227-5270): one choice per option. */
export function randomButlerParts(rand = Math.random) {
  const out = {};
  for (const [k, list] of Object.entries(BUTLER_OPTIONS)) out[k] = list[Math.min(list.length - 1, Math.floor(rand() * list.length))];
  return out;
}

/** "Head 3 of 22": a part's 1-based index in its option list. */
export function partIndex(option, value) {
  return BUTLER_OPTIONS[option] ? BUTLER_OPTIONS[option].indexOf(String(value)) : -1;
}

/** Step one option to the previous (-1) or next (+1) choice, wrapping. */
export function stepButlerPart(parts, option, dir = 1) {
  const list = BUTLER_OPTIONS[option];
  if (!list) return { ...parts };
  const i = Math.max(0, list.indexOf(String(parts[option])));
  return { ...parts, [option]: list[(i + (dir < 0 ? list.length - 1 : 1)) % list.length] };
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

function whole(value, max = Number.MAX_SAFE_INTEGER) {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) ? Math.max(0, Math.min(max, n)) : 0;
}

function cleanId(value) {
  return String(value || '').replace(/[^a-zA-Z0-9_:-]/g, '').slice(0, 80);
}

function cleanLine(value, max) {
  return String(value ?? '').replace(/<(?:.|\s)*?>/g, '').replace(/\s+/g, ' ').trim().slice(0, max);
}

export const BUTLER_STATE_VERSION = 1;

export function createButlerState() {
  return normalizeButlerState({});
}

function normalizeStack(row) {
  const classTsid = cleanId(row?.classTsid);
  const count = whole(row?.count, 9999);
  return classTsid && count > 0 ? { classTsid, count } : null;
}

export function normalizeButlerState(seed = {}) {
  const s = seed && typeof seed === 'object' ? seed : {};
  const packages = (Array.isArray(s.packages) ? s.packages : []).map((p) => {
    const stack = normalizeStack(p);
    if (!stack || !cleanId(p.from)) return null;
    return { id: cleanId(p.id) || '', from: cleanId(p.from), fromName: cleanLine(p.fromName || p.from, 80), ...stack, time: whole(p.time) };
  }).filter(Boolean).slice(0, BUTLER.PACKAGE_LIMIT);
  const messages = (Array.isArray(s.messages) ? s.messages : []).map((m) => {
    const text = cleanLine(m?.text, BUTLER.MESSAGE_MAX);
    if (!text || !cleanId(m.from)) return null;
    return { id: cleanId(m.id) || '', from: cleanId(m.from), fromName: cleanLine(m.fromName || m.from, 80), text, time: whole(m.time), withPackage: cleanId(m.withPackage) || null };
  }).filter(Boolean).slice(0, BUTLER.MESSAGE_LIMIT);
  let next = Math.max(1, whole(s.nextId));
  for (const row of [...packages, ...messages]) if (!row.id) row.id = `b${next++}`;
  const visitors = {};
  for (const [id, list] of Object.entries(s.visitors && typeof s.visitors === 'object' ? s.visitors : {})) {
    const key = cleanId(id);
    const times = (Array.isArray(list) ? list : []).map((t) => whole(t)).filter((t) => t > 0).slice(-50);
    if (key && times.length) visitors[key] = times;
  }
  const visitorNames = {};
  for (const [id, name] of Object.entries(s.visitorNames && typeof s.visitorNames === 'object' ? s.visitorNames : {})) {
    if (cleanId(id)) visitorNames[cleanId(id)] = cleanLine(name, 80);
  }
  const gifts = {};
  for (const [id, cls] of Object.entries(s.gifts && typeof s.gifts === 'object' ? s.gifts : {})) {
    if (cleanId(id) && cleanId(cls)) gifts[cleanId(id)] = cleanId(cls);
  }
  const owned = s.owned === true;
  const post = Number(s.post);
  // Saves before the rig hold only a look id (v10 / v11 / v22): its parts.
  const parts = normalizeButlerParts(s.parts, BUTLER_LEGACY_LOOKS[s.look] ? s.look : BUTLER_LOOKS[0].id);
  return {
    v: BUTLER_STATE_VERSION,
    owned,
    boxRead: s.boxRead === true || owned,
    name: cleanLine(s.name, BUTLER.NAME_MAX),
    namedAt: whole(s.namedAt),
    /** The eight part choices (GSJS instance props); look is the OGA look they match, or 'custom'. */
    parts,
    look: lookIdForParts(parts),
    /** Post x relative to the house centre (homeStreetLayout().houseX). */
    post: Number.isFinite(post) ? Math.round(post) : null,
    createdAt: whole(s.createdAt),
    introDone: s.introDone === true,
    lastOwnerVisit: whole(s.lastOwnerVisit),
    hintsOff: s.hintsOff === true,
    muted: s.muted === true,
    ownerGreeting: cleanLine(s.ownerGreeting, 140),
    idleComment: cleanLine(s.idleComment, 140),
    packages,
    messages,
    nextId: next,
    gift: normalizeStack(s.gift),
    gifts,
    visitors,
    visitorNames,
    lastWhoVisited: whole(s.lastWhoVisited),
    givenHints: (Array.isArray(s.givenHints) ? s.givenHints : []).map(cleanId).filter(Boolean).slice(-40),
    lastHintAt: whole(s.lastHintAt),
    lastSpokeAt: whole(s.lastSpokeAt),
    /** Its hi sign (items/include/butler_emotes.js; rules in js/hi-signs.js). */
    hi: normalizeButlerHi(s.hi),
  };
}

export function serializeButlerState(state) {
  return JSON.parse(JSON.stringify(normalizeButlerState(state)));
}

/** giveButlerBox: a home, level 3, no Butler. */
export function boxDue(state, { homeOwned = false, level = 1 } = {}) {
  return !state.owned && homeOwned === true && whole(level) >= BUTLER.BOX_MIN_LEVEL;
}

/** Set the eight part choices (customize's Save, randomize); keeps `look` in step. */
export function setButlerParts(state, parts) {
  state.parts = normalizeButlerParts(parts, state.look in BUTLER_LEGACY_LOOKS ? state.look : 'v10');
  state.look = lookIdForParts(state.parts);
  return state.parts;
}

/** createButler (players/inc_butler.js 2-42): one Butler, randomized part by part, posted where the box stood. */
export function createButler(state, { post = 0, now = Date.now(), rand = Math.random } = {}) {
  if (state.owned) return { ok: false, reason: 'You already have a Butler.' };
  state.owned = true;
  state.boxRead = true;
  setButlerParts(state, randomButlerParts(rand));
  state.post = Math.round(Number(post) || 0);
  state.createdAt = whole(now);
  state.lastOwnerVisit = whole(now);
  state.introDone = false;
  return { ok: true };
}

/** getLabel for the owner: the given name, else "Butler". */
export function butlerName(state) {
  return state?.name || BUTLER_ITEM.label;
}

// ---------------------------------------------------------------------------
// Text
// ---------------------------------------------------------------------------

function pick(list, rand = Math.random) {
  return list[Math.min(list.length - 1, Math.floor(rand() * list.length))];
}

/** utils.js ago() on seconds. */
export function ago(ms, now = Date.now()) {
  if (!ms) return 'a long time ago';
  const s = Math.round((now - ms) / 1000);
  if (s > 60 * 60 * 36) return `${Math.round(s / (60 * 60 * 24))} days ago`;
  if (s > 60 * 90) return `${Math.round(s / (60 * 60))} hr ago`;
  if (s > 90) return `${Math.round(s / 60)} min ago`;
  if (s < 2) return 'just now';
  return `${s} sec ago`;
}

/** common.js pluralize. */
export function pluralize(count, single, plural) {
  return count === 1 ? `1 ${single}` : `${count} ${plural}`;
}

const plural = (n, word) => (n === 1 ? word : `${word}s`);

/** Counts the strings read (getNumMessagesTotal etc.). */
export function butlerCounts(state, now = Date.now()) {
  // is_same_day on game time.
  const dayKey = (t) => getGameDayKey(t);
  const today = dayKey(now);
  const packages = state.packages.length;
  const messages = state.messages.length;
  const withPackage = state.messages.filter((m) => m.withPackage).length;
  return {
    packages,
    messages,
    withPackage,
    /** $num_messages: messages that did not come with a package. */
    plainMessages: messages - withPackage,
    messagesToday: state.messages.filter((m) => !m.withPackage && dayKey(m.time) === today).length,
    packagesToday: state.packages.filter((p) => dayKey(p.time) === today).length,
  };
}

/**
 * getTextString: one line (a random one from a list), with $-substitution.
 * Like the source, each placeholder is replaced once (String.replace).
 */
export function butlerText(key, vars = {}, rand = Math.random) {
  let s = BUTLER_STRINGS[key];
  if (s == null) return '';
  if (Array.isArray(s)) s = pick(s, rand);
  const order = ['butler', 'pc', 'owner_greeting', 'owner', 'location', 'time_away', 'message_time', 'message_text', 'visitors', 'speech',
    'friend_greeting', 'stranger_greeting', 'idle_comment', 'info', 'num_messages_today', 'messages_recent', 'num_older_messages',
    'messages_older', 'item', 'num_visits', 'num_packages', 'num_messages', 'messages', 'packages', 'param'];
  for (const k of order) if (vars[k] != null) s = s.replace(`$${k}`, String(vars[k]));
  return s;
}

/** The $-variables that come from the Butler's own state. */
export function butlerVars(state, now = Date.now(), extra = {}) {
  const c = butlerCounts(state, now);
  const older = c.plainMessages - c.messagesToday;
  return {
    butler: butlerName(state),
    owner_greeting: state.ownerGreeting || '',
    idle_comment: state.idleComment || '',
    visitors: 0,
    num_packages: c.packages,
    num_messages: c.plainMessages,
    messages: plural(c.plainMessages, 'message'),
    packages: plural(c.packages, 'package'),
    num_messages_today: c.messagesToday,
    messages_recent: plural(c.messagesToday, 'message'),
    num_older_messages: older,
    messages_older: plural(older, 'message'),
    ...extra,
  };
}

/** getGameDaysSinceSeen for the owner, toFixed(2) as the source prints it. */
export function daysAway(state, now = Date.now()) {
  if (!state.lastOwnerVisit) return 0;
  return Math.max(0, (now - state.lastOwnerVisit) / BUTLER.GAME_DAY_MS);
}

/** greetPlayer, owner branch (bag_butler.js 2816-2820 + getGreetingForOwner): bow and say this. */
export function ownerGreeting(state, now = Date.now()) {
  let greeting = BUTLER_STRINGS.ownerGreeting;
  if (state.ownerGreeting) greeting += ` ${state.ownerGreeting}`;
  const days = daysAway(state, now);
  const timeAway = days.toFixed(2);
  if (days > 2) greeting += butlerText('ownerAwayTime', { time_away: timeAway });
  if (days > 10) greeting += BUTLER_STRINGS.ownerAwayTimeLong;
  return greeting;
}

/** onPlayerEnter for the owner (getPackagesAndMessagesForOwner): what is waiting. */
export function packagesAndMessagesForOwner(state, { mail = false, now = Date.now() } = {}) {
  const v = butlerVars(state, now);
  const c = butlerCounts(state, now);
  let text = '';
  if (c.plainMessages > 0 && c.packages > 0) text += butlerText('ownerMessagesPackagesNew', v);
  else if (c.plainMessages > 0) text += butlerText('ownerMessages', v);
  else if (c.packages > 0) text += butlerText('ownerPackages', v);
  if (mail && text.length > 0) text += BUTLER_STRINGS.ownerMailAlso;
  else if (mail) text += BUTLER_STRINGS.ownerMail;
  return text.trim();
}

/**
 * getAfterGreetingForOwner (minus the IM): who left what, then the
 * suggestion the Butler waits for an answer to.
 */
export function afterGreetingForOwner(state, now = Date.now()) {
  const c = butlerCounts(state, now);
  const v = butlerVars(state, now);
  let greeting = '';
  const messagers = new Map();
  for (const m of state.messages) if (!m.withPackage) messagers.set(m.from, m.fromName);
  const packagers = new Map();
  for (const p of state.packages) packagers.set(p.from, p.fromName);
  const one = (map) => (map.size === 1 ? [...map.entries()][0] : null);
  const soleMessager = one(messagers);
  const solePackager = one(packagers);
  if (soleMessager && solePackager && soleMessager[0] === solePackager[0]) {
    greeting += butlerText('ownerMessagesAndPackages', { ...v, pc: solePackager[1] });
  } else {
    // The source tests getNumMessagesTotal here, which counts messages left
    // with a package, and names the loop's last messager; a lone package with
    // its note then read "X left you 0 messages." Count loose messages only.
    if (c.plainMessages > 0) {
      if (soleMessager) greeting += butlerText('ownerSingleMessager', { ...v, pc: soleMessager[1] });
      else {
        if (c.messagesToday > 3) greeting += BUTLER_STRINGS.ownerPopular;
        greeting += butlerText('ownerMultipleMessagers', v);
      }
    }
    if (c.packages > 0) {
      greeting += butlerText(c.plainMessages > 0 ? 'ownerPackagesAfterMessages' : 'ownerPackages', v);
      if (c.packagesToday > 3) greeting += BUTLER_STRINGS.ownerGenerous;
    }
  }
  let suggest = 'none';
  if (c.packages > 0) suggest = 'packages';
  else if (c.messages > 0) suggest = 'messages';
  const line = suggest === 'packages' ? BUTLER_STRINGS.ownerSuggestPackages
    : suggest === 'messages' ? BUTLER_STRINGS.ownerSuggestMessages
      : BUTLER_STRINGS.ownerNoSuggestions.trim();
  return { text: greeting.trim(), suggest, suggestion: line };
}

// ---------------------------------------------------------------------------
// Visitors: packages, messages, gifts
// ---------------------------------------------------------------------------

/** leave_package conditions: room for one more package and its message. */
export function canTakeDelivery(state, { withMessage = true } = {}) {
  const c = butlerCounts(state);
  const capacity = BUTLER.CAPACITY + (state.gift ? 1 : 0);
  const contents = c.packages + (state.gift ? 1 : 0);
  const packagesNoMessages = c.packages - c.withPackage;
  if (contents >= capacity || c.packages >= BUTLER.PACKAGE_LIMIT || (c.messages + packagesNoMessages) >= BUTLER.MESSAGE_LIMIT) {
    return { ok: false, reason: BUTLER_STRINGS.packageFail };
  }
  if (withMessage && c.messages >= BUTLER.MESSAGE_LIMIT) return { ok: false, reason: BUTLER_STRINGS.messageFail };
  return { ok: true };
}

/** onPlayerEnter for a visitor: one timestamp per visit, keyed by visitor. */
export function recordVisitor(state, { id, name, now = Date.now() }) {
  const key = cleanId(id);
  if (!key) return;
  const list = state.visitors[key] || (state.visitors[key] = []);
  list.push(whole(now));
  if (list.length > 50) list.splice(0, list.length - 50);
  if (name) state.visitorNames[key] = cleanLine(name, 80);
}

/**
 * A neighbour drops by while you are out: onLeavePackage + takeMessage
 * (withPackage), or a lone takeMessage when they brought nothing. Returns
 * { ok, package, message } or { ok: false, reason } when the Butler is full.
 */
export function takeVisitorDelivery(state, { from, fromName, attachment = null, text = '', now = Date.now() } = {}) {
  const giver = cleanId(from);
  if (!state.owned || !giver) return { ok: false, reason: 'no_butler' };
  const stack = normalizeStack(attachment);
  const line = cleanLine(text, BUTLER.MESSAGE_MAX);
  if (stack) {
    const room = canTakeDelivery(state, { withMessage: Boolean(line) });
    if (!room.ok) return room;
  } else {
    const c = butlerCounts(state);
    if (!line) return { ok: false, reason: 'empty' };
    if (c.messages >= BUTLER.MESSAGE_LIMIT || c.messages + (c.packages - c.withPackage) >= BUTLER.MESSAGE_LIMIT) return { ok: false, reason: BUTLER_STRINGS.messageFail };
  }
  const name = cleanLine(fromName || from, 80);
  let pkg = null;
  if (stack) {
    pkg = { id: `b${state.nextId++}`, from: giver, fromName: name, ...stack, time: whole(now) };
    // packages.list[pc.tsid].unshift(gift): newest first per giver.
    state.packages.push(pkg);
  }
  let message = null;
  if (line) {
    message = { id: `b${state.nextId++}`, from: giver, fromName: name, text: line, time: whole(now), withPackage: pkg ? pkg.id : null };
    state.messages.push(message);
  }
  return { ok: true, package: pkg, message };
}

/**
 * The next thing the Butler hands over (giveNextMessage, then
 * giveNextPackage), removed from its state. Kind 'message' is text only;
 * 'package' carries `give` ({ classTsid, count }) for the pack. 'none' when
 * it has nothing left.
 */
export function nextHandover(state, { now = Date.now(), itemName = (cls, n) => `${n} ${cls}` } = {}) {
  // giveNextMessage: the first message without a package (or one whose package is gone).
  const loose = state.messages.find((m) => !m.withPackage || !state.packages.some((p) => p.id === m.withPackage));
  if (loose) {
    state.messages = state.messages.filter((m) => m !== loose);
    const text = butlerText('messagesGive', { pc: loose.fromName, message_text: loose.text, message_time: ago(loose.time, now) }).trim();
    return { kind: 'message', text, from: loose.fromName };
  }
  // giveNextPackage: one stack from the first giver, with its message.
  const pkg = state.packages[0];
  if (!pkg) return { kind: 'none', text: '' };
  state.packages = state.packages.slice(1);
  let text = butlerText('packagesStart', { pc: pkg.fromName }) + itemName(pkg.classTsid, pkg.count);
  const msg = state.messages.find((m) => m.withPackage === pkg.id);
  if (msg) {
    state.messages = state.messages.filter((m) => m !== msg);
    text += butlerText('messageFromGiver', { message_text: msg.text, message_time: ago(msg.time, now) });
  } else {
    text += butlerText('packageNoMessage', { param: ago(pkg.time, now) });
  }
  return { kind: 'package', text, from: pkg.fromName, give: { classTsid: pkg.classTsid, count: pkg.count } };
}

/** retrieve_messages / retrieve_packages verb states (one of the two shows). */
export function retrieveVerbs(state) {
  const c = butlerCounts(state);
  if (c.packages > 0) {
    const messages = c.messages - c.withPackage;
    const p = c.packages > 1 ? 'Packages' : 'Package';
    const tip = messages > 0 ? `You have ${c.packages} ${p} and ${messages} ${messages > 1 ? 'Messages' : 'Message'}` : `You have ${c.packages} ${p}`;
    return [{ id: 'retrieve_packages', label: 'packages', enabled: true, reason: '', tooltip: tip }];
  }
  if (c.messages > 0) {
    return [{ id: 'retrieve_messages', label: 'messages', enabled: true, reason: '', tooltip: c.messages > 1 ? `You have ${c.messages} Messages` : 'You have 1 Message' }];
  }
  return [{ id: 'retrieve_messages', label: 'messages', enabled: false, reason: BUTLER_STRINGS.messagesNone, tooltip: '' }];
}

/**
 * give (a gift for visitors): what the Butler says before taking `count` of
 * a stack, and whether the old gift comes back. stackMax limits merging.
 */
export function giftOffer(state, { classTsid, count, names, stackMax = 999 }) {
  const n = whole(count);
  const name = names(classTsid, n);
  let prefix;
  let returns = null;
  if (state.gift && (state.gift.classTsid !== classTsid || state.gift.count + n > stackMax)) {
    prefix = butlerText('visitorGiftPrevious', { param: names(state.gift.classTsid, state.gift.count) });
    returns = { ...state.gift };
  } else if (state.gift) {
    prefix = butlerText('visitorGiftSame', { param: names(state.gift.classTsid, state.gift.count) });
  } else {
    prefix = BUTLER_STRINGS.visitorGiftNoPrevious;
  }
  const ask = butlerText(n > 1 ? 'visitorGiftConfirmPlural' : 'visitorGiftConfirm', { param: name });
  return { text: prefix + ask, returns };
}

/** onLeaveVisitorGift: take the stack (merging a same-class gift), hand back the old one. */
export function setGift(state, { classTsid, count, stackMax = 999 }) {
  const n = whole(count);
  const cls = cleanId(classTsid);
  if (!cls || n < 1) return { ok: false };
  let returned = null;
  if (state.gift && state.gift.classTsid === cls && state.gift.count + n <= stackMax) {
    state.gift = { classTsid: cls, count: state.gift.count + n };
  } else {
    if (state.gift) returned = { ...state.gift };
    state.gift = { classTsid: cls, count: n };
    state.gifts = {};
  }
  const text = state.gift.count > 1 ? BUTLER_STRINGS.visitorGiftAcceptPlural : BUTLER_STRINGS.visitorGiftAccept;
  return { ok: true, returned, text };
}

/** giveGift: one of the gift to a visitor, once per visitor per class. */
export function giveGiftTo(state, visitorId) {
  const id = cleanId(visitorId);
  if (!state.gift || !id || state.gifts[id] === state.gift.classTsid || state.gift.count <= 0) return null;
  const given = { classTsid: state.gift.classTsid, count: 1 };
  state.gifts[id] = state.gift.classTsid;
  state.gift.count -= 1;
  if (state.gift.count <= 0) {
    state.gift = null;
    state.gifts = {};
  }
  return given;
}

/** getVisitors: who came since the last time you asked (names in arrival order). */
export function visitorsReport(state) {
  const names = [];
  let count = 0;
  for (const [id, times] of Object.entries(state.visitors)) {
    const recent = times.filter((t) => !state.lastWhoVisited || t - state.lastWhoVisited >= 0).length;
    if (recent <= 0) continue;
    count += 1;
    if (names.length < 20) names.push(state.visitorNames[id] || id);
  }
  let output = '';
  if (names.length) {
    output = BUTLER_STRINGS.visitorsIntro;
    names.forEach((name, n) => {
      if (names.length === 1) output += ` ${name}.`;
      else if (n + 1 === names.length) output += ` and ${name}.`;
      else if (n + 2 === names.length) output += ` ${name}`;
      else output += ` ${name},`;
    });
    if (count > 20) output += BUTLER_STRINGS.visitorsTooMany;
  }
  return { count, output, many: count > 5 };
}

// ---------------------------------------------------------------------------
// Naming, teaching, clicks, chatter
// ---------------------------------------------------------------------------

/** onName: tags stripped, 19 characters, nameSuccess or nameShortened. */
export function renameButler(state, txt, { now = Date.now(), rand = Math.random } = {}) {
  const raw = String(txt ?? '').replace(/<(?:.|\s)*?>/g, '').trim();
  if (!raw) return { ok: false };
  const shortened = raw.length > BUTLER.NAME_MAX;
  state.name = raw.slice(0, BUTLER.NAME_MAX);
  state.namedAt = whole(now);
  return { ok: true, shortened, text: butlerText(shortened ? 'nameShortened' : 'nameSuccess', { butler: state.name }, rand) };
}

/** onTeach (phrase_limit 1: the newest phrase replaces the old). */
export function teachButler(state, type, txt) {
  const line = cleanLine(txt, 140);
  if (!line) return { ok: false };
  if (type === 'owner_greeting') {
    state.ownerGreeting = line;
    return { ok: true, text: butlerText('teachOwnerSuccess', { owner_greeting: line }) };
  }
  if (type === 'idle_comment') {
    state.idleComment = line;
    return { ok: true, text: butlerText('teachIdleSuccess', { idle_comment: line }) };
  }
  return { ok: false };
}

/** doClickAnim: which reaction a click plays. */
export function clickAnim(num = 0, rand = Math.random) {
  let n = whole(num);
  if (n > 11) n = Math.floor(rand() * 3);
  if (n % 3 === 0) {
    const anims = ['startle0', 'acknowledge', 'bow', 'wave'];
    const times = [467, 667, 1333, 1733];
    const i = Math.min(3, Math.floor(rand() * 4));
    return { anim: anims[i], ms: times[i] };
  }
  if (n % 3 === 1) return { anim: 'startle1', ms: 500 };
  return { anim: 'startle2', ms: 900 };
}

/** getShortGreeting(num): friendlier the first few clicks, then annoyed. */
export function shortGreeting(num = 0, rand = Math.random) {
  const n = whole(num);
  if (n <= 5) return butlerText('normalClickResponseList', {}, rand);
  if (n <= 13) return butlerText('somewhatAnnoyedClickResponseList', {}, rand);
  if (n <= 21) return butlerText('reallyAnnoyedClickResponseList', {}, rand);
  return butlerText('reallyReallyAnnoyedClickResponseList', {}, rand);
}

/**
 * doClick: clicks within required_click_delay of the last one stack up.
 * `clicks` is the in-memory history (newest first). Returns the line and the
 * reaction animation.
 */
export function clickResponse(clicks, now = Date.now(), rand = Math.random) {
  const last = clicks[0] || 0;
  let num = 0;
  if (Math.abs(now - last) > BUTLER.REQUIRED_CLICK_DELAY) clicks.length = 0;
  else num = clicks.length;
  clicks.unshift(now);
  return { num, text: shortGreeting(num, rand), ...clickAnim(num, rand) };
}

/**
 * onIdle: an idle comment when it has been quiet long enough, unless the
 * Butler was told to zip it. The Tower line needs level 18 and no Tower.
 */
export function idleChatter(state, { now = Date.now(), lastCommandAt = 0, level = 1, hasTower = true, force = false, rand = Math.random } = {}) {
  if (state.muted && !force) return null;
  if (!force) {
    if (now - (state.lastSpokeAt || 0) <= BUTLER.IDLE_SPEAK_GAP_MS) return null;
    if (now - (lastCommandAt || 0) <= BUTLER.IDLE_QUIET_MS) return null;
  }
  let text = state.idleComment || butlerText('defaultIdleComment', {}, rand);
  if (whole(level) >= BUTLER.TOWER_COMMENT_LEVEL && !hasTower && rand() < BUTLER.TOWER_COMMENT_CHANCE) text = BUTLER_STRINGS.buildTowerComment;
  state.lastSpokeAt = whole(now);
  return text;
}

// ---------------------------------------------------------------------------
// Hints (butler_hints.js getHintPreReqs / getHintNoPreReqs)
// ---------------------------------------------------------------------------

/**
 * The hints whose conditions the solo game can answer, verbatim (links become
 * plain text). Left out: UI and website pointers (Info Mode, zoom keys,
 * hotkeys, calendar, bug icon, Snaps, Global Chat, Facebook, Twitter, Glitch
 * Mash, wardrobe), friends and buddy towers, hub visit counts, the fox
 * preserve route, /house and /tower chat commands, feats and rook alerts.
 */
export const BUTLER_HINTS = Object.freeze([
  { id: 'salt', when: (c) => c.level <= 7, text: "A little butler's tip for you, madamsir: you can make your own salt the same way you can make many spices: by grinding Allspice with a Spice Mill. Obvious when you know how, no?" },
  { id: 'cheese', when: (c) => c.level <= 7, text: 'As unlikely as it sounds, I heard that you can make your own cheese from butterfly milk. Not sure how one goes about that. Begin by shaking it, I assume?' },
  { id: 'skill_picker', when: (c) => !c.learning && c.skillCount < 50, text: "Far be it from me to to judge, madamsir, but you don't appear to be currently learning anything. Perhaps a visit to the Skill Picker is in order? Wouldn't want to waste that marvellous brain of yours..." },
  { id: 'visiting_stones', when: (c) => c.canOptIn && !c.allowVisits, text: "I hope you don't mind me saying so, sirmadam, but I do love meeting new people. If you find a Visiting Stone and request new visitors, I'd meet Glitches from every corner of Ur: and you'd get more iMG from your Magic Rock! You could also use the Visiting Stone to visit random Glitches' butlers... I mean, their home streets." },
  { id: 'tower_quest_1', group: 'tower_quest', when: (c) => c.level >= 12 && c.towerQuestNone, text: "Gwendolyn's story makes me shed salty eye-fluff every time I hear of it. I'd tell you the story myself, but she tells it far better. Oh, how I wish I could go to Jethimadh Tower to hear it with my own clothy ear-holes..." },
  { id: 'tower_quest_2', group: 'tower_quest', when: (c) => c.level >= 12 && c.towerQuestNone, text: 'Have you heard of the Jethimadh Tower? I hear on the buttlevine that the ghost who haunts it - Gwendolyn, I believe? - has much of interest to show you...' },
  { id: 'fiber_arts', when: (c) => !c.fiberArts, text: 'String, sirmadam, is not to be sniffed at. Very useful, and you can spin it yourself out of fiber. My left arm is feeling a little loose, perhaps, if you learned Fiber Arts, you might one day fix it for me?' },
  { id: 'high_class_hoe', when: (c) => c.hasHoe && !c.hasHighClassHoe, text: "Have you considered trading that common Hoe for something more refined? Top players prefer employing the services of a High-Class Hoe. You can't just pick them up at any old Street Spirit, though, you'll need to ask around. Oh DO get a High Class Hoe, I shall be the envy of all the butlers!" },
  { id: 'near_level', when: (c) => c.nearLevel != null, text: (c) => `Goodness Gracious, madamsir! Have you noticed that you're only about ${c.nearLevel.xp.toLocaleString('en-US')} iMG away from Level ${c.nearLevel.next}?!? Oh to be the butler of a Level ${c.nearLevel.next} Glitch! I will be the toast of the buttling community! I cannot wait!` },
  { id: 'sdb', when: (c) => (c.hasTower && !c.sdbPlaced) || (!c.hasTower && c.level > 10 && !c.sdbPlaced), text: (c) => `Speaking as a butler (and qualified neatfreak), I can highly recommend Storage Display Boxes. They're very handy for storing a lot of the same thing, and you can use them to sell things too. ${c.sdbOwned ? 'It looks like you have one already. Why don\'t you give it a try?' : 'You can make them, or buy one in auction.'}` },
].map((h) => Object.freeze(h)));

/** giveHint's interval for this level. */
export function hintInterval(level) {
  const l = whole(level);
  if (l <= 7) return 7 * 60_000;
  if (l <= 12) return 30 * 60_000;
  return 60 * 60_000;
}

/** Is a hint due (ten minutes after the intro, then the interval)? */
export function hintDue(state, { now = Date.now(), level = 1, force = false } = {}) {
  if (state.hintsOff && !force) return false;
  if (force) return true;
  if (!state.createdAt || now - state.createdAt <= BUTLER.HINT_START_DELAY_MS) return false;
  return now - (state.lastHintAt || 0) > hintInterval(level);
}

/**
 * getHint: a random hint not given yet (the tower-quest pair counts as one);
 * when every hint has been given, the list starts over.
 */
export function pickHint(state, ctx = {}, { now = Date.now(), rand = Math.random } = {}) {
  const given = new Set(state.givenHints);
  const groupGiven = new Set(BUTLER_HINTS.filter((h) => h.group && given.has(h.id)).map((h) => h.group));
  const ok = (h) => h.when(ctx) && !given.has(h.id) && !(h.group && groupGiven.has(h.group));
  let pool = BUTLER_HINTS.filter(ok);
  if (!pool.length) {
    state.givenHints = [];
    given.clear();
    groupGiven.clear();
    pool = BUTLER_HINTS.filter((h) => h.when(ctx));
  }
  if (!pool.length) return null;
  const hint = pick(pool, rand);
  state.givenHints.push(hint.id);
  state.lastHintAt = whole(now);
  return { id: hint.id, text: typeof hint.text === 'function' ? hint.text(ctx) : hint.text };
}

/** The near-level condition: within 10% of the next level (thousands rounded). */
export function nearLevel(info) {
  if (!info || !info.next || !info.needed) return null;
  const remaining = info.remaining;
  if (remaining / info.needed > 0.1) return null;
  const xp = remaining > 1000 ? Math.round(remaining / 1000) * 1000 : remaining;
  return { xp, next: info.level + 1 };
}
