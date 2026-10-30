/**
 * Solo Feats: the original world-wide Feats as personal goals (register G143).
 *
 * Source:
 *  - glitch-GameServerJS/inc_data_feats_prod.js 1-122: the fifteen production
 *    Feats (title, vog_text, url, epic_id, game_day). Goals are not in GSJS:
 *    groups/feat.js 3-13 doCreate(goal, goal_multiplier, stretch_goal1,
 *    stretch_goal2) took them from the web side, so every goal below is a
 *    remake number (see PERSONAL GOALS).
 *  - players/inc_feats.js 37-113 feats_increment: the first contribution to a
 *    Feat counts feats:contributed (54), epics_contributed:<epic> (56), and
 *    epics_completed:<epic> once every Feat of the epic has been done (58-69);
 *    quick_on_your_feat inside 30 minutes of the Feat starting (72); the
 *    vog_text with {remaining} (74-83); down_to_the_wire on every
 *    contribution (104-106).
 *  - players/inc_feats.js 189 / 242 / 247 and main.js 7692-7733 doBreakIt:
 *    the completion conversation ("Feat Completed!", "The ancient Feat ...
 *    has been successfully recreated by modern Glitches. Your participation
 *    has earned you the following rewards:", OK) and the guaranteed reward
 *    item, one petrified_rock_small "Small Petrified Rock".
 *  - Blog 2012-10-12 "The Epic of Feats": every participant gets at least a
 *    small petrified rock; top contributors also get larger ones (ranking is
 *    G120, multiplayer, not here).
 *
 * Austin 2026-10-25: solo Feats are personal goals; each Feat a player
 * completes on their own gives one Small Petrified Rock.
 *
 * PERSONAL GOALS. World goals were millions (the only one that survives is
 * Groddlocritus's 11,113 minutes, glitch.com forum "The First Feat!!!",
 * staff post). The rule: a personal goal is about one sitting (10 to 20
 * minutes) of that Feat's activity, counted with the source's own increment
 * weights, rounded to a friendly number; a unit the game rations (one qurazy
 * quoin per new street that has one, two hi signs a game day with your
 * Butler, a whole quest) gets a small goal that still takes more than one go.
 * Meditation keeps the one surviving world number at 1/1000 (11 minutes).
 *
 * ACTIVE FEATS. The source ran one Feat per 24 hours on fixed calendar days
 * (feats_get 15-35, feats_get_current 295-309), years apart. A solo save
 * cannot replay that calendar, so every wired Feat is open at once (what the
 * source's own config.enable_all_the_feats switch did, inc_feats.js:21),
 * shown in game_day order.
 *
 * WEEKLY FEATS (register G171). Austin 2026-10-25 (decision desk ROCKS): a
 * finished Feat opens again one game week later, for another Small rock. The
 * source never re-ran a Feat (each ran once on its game_day), so this is a
 * solo adaptation. A game week is the remake's own calendar week:
 * game-day.js DAY_NAMES has eight days (Hairday to Fabday) and GAME_DAY_MS
 * is four real hours, so GAME_WEEK_MS is 8 x 4 h = 32 real hours, counted
 * from the moment the Feat was finished (progress.completedAt). On reopening
 * the run's progress goes back to 0 and the Feat's own per-animal caps are
 * dropped (the source's *_for_feat maps belonged to one Feat run).
 *
 * What a repeat run counts, read from players/inc_feats.js:
 *  - feats:contributed, epics_contributed:<epic> and quick_on_your_feat sit
 *    behind feats_has_contributed(feat_id) (52-72), which stays true for good
 *    once feats.feats[feat_id] is written (feats_gather_rewards 278, checked
 *    at 286). Keyed by Feat id, so a repeat run of the same Feat never counts
 *    them again: Feat First, Quick on Your Feat and Five Feat Under ("five
 *    amazing feats", five different Feats) are not re-earned by repeats.
 *  - feats:contributed_to is feats_gather_rewards' own counter (281), once per
 *    rewards handed out, so it counts each completed run. No badge reads it.
 *  - epics_completed:<epic> counts once, when the epic's last Feat is first
 *    finished.
 */

import { DAY_NAMES, GAME_DAY_MS } from './game-day.js?v=3095e05b';

export const SOLO_FEATS_ID = 'solo-feats';
export const REWARD_ITEM = 'petrified_rock_small';
export const REWARD_LABEL = 'Small Petrified Rock';
/** inc_feats.js:242 args.title. */
export const COMPLETE_TITLE = 'Feat Completed!';
/** inc_feats.js:247 the one choice. */
export const COMPLETE_BUTTON = 'OK';
/** inc_feats.js:334 feats_reset_commit. */
export const LOST_COMMIT_TEXT = 'Whoops! You lost your contribution to the "… And Ask Nothing in Return" Feat!';
/** inc_feats.js:72: within 30 minutes of the Feat's start. */
export const QUICK_MS = 30 * 60 * 1000;
/** location.js:1045: streaking counts at 1,000 px from where you entered. */
export const STREAK_PX = 1000;
/** game-day.js: eight days a week (DAY_NAMES), four real hours a day. */
export const GAME_WEEK_DAYS = DAY_NAMES.length;
export const GAME_WEEK_MS = GAME_WEEK_DAYS * GAME_DAY_MS;

/**
 * The per-animal caps each Feat owns (state.caps key prefixes), dropped when
 * that Feat opens again. Feeds share one cap between Heebo and the commit
 * pile (FEED_CAP), so either reopening frees them.
 */
export const CAP_OWNERS = Object.freeze([
  Object.freeze({ prefix: 'times_fed_for_feat:', feats: Object.freeze(['animal_love', 'pet_only']) }),
  // crabs-feature.js crab:<street>:<verb> (npc_crab.js hugged_for_feat and the rest).
  Object.freeze({ prefix: 'crab:', feats: Object.freeze(['animal_love']) }),
  // heli-kitties-feature.js kitty:<street>:<kitty> (npc_kitty_chicken.js petted_for_feat).
  Object.freeze({ prefix: 'kitty:', feats: Object.freeze(['animal_love']) }),
]);

/** inc_feats.js:189 completion_text. */
export function completionText(title) {
  return `The ancient Feat "${title}" has been successfully recreated by modern Glitches. Your participation has earned you the following rewards:`;
}

/**
 * Every production Feat (inc_data_feats_prod.js, in file order, which is
 * game_day order). `goal` / `unit` / `what` are remake copy; `wired: false`
 * rows carry the reason they stay out of solo. `mp: true` rows have no solo
 * route but take their turn as the shared Feat in multiplayer (js/feats-mp.js).
 */
export const SOLO_FEATS = Object.freeze([
  feat('meditation_of_groddlocritus', {
    line: 2,
    game_day: '24-05-35',
    title: 'The Meditation of Groddlocritus',
    vog_text: 'Your meditation has been counted as a contribution towards recreating the Feat "The Meditation of Groddlocritus". There are {remaining} minutes left to be meditated.',
    url: 'meditation-of-groddlocritus',
    epic_id: 0,
    goal: 11,
    unit: 'minutes',
    what: 'Meditate with a Focusing Orb. Every whole minute counts.',
    source: 'increment code lost; vog_text counts minutes; meditation.js focusing_orb:meditation_time',
  }),
  feat('mihceal_conch', {
    line: 10,
    game_day: '24-08-14',
    title: 'Mihceal, Blow that Conch',
    vog_text: 'Your conch-playing has been counted as a contribution towards recreating the Feat "Mihceal, Blow that Conch". There are {remaining} plays left to be done in order to complete the feat.',
    url: 'mihceal-and-the-conch',
    epic_id: 0,
    wired: false,
    reason: 'Counted plays of the Conch for other Glitches (items/conch.js 271-278 played_for[targetPC], verb "play for" requires_target_pc). Needs other players.',
  }),
  feat('qurazy_quoin_collecting', {
    line: 18,
    game_day: '25-03-08',
    title: "Hispikulus's Amazing Ramble",
    vog_text: 'That qurazy quoin has been counted as a contribution towards recreating the feat of "Hispikulus\'s Amazing Ramble". There are {remaining} qurazy quoins left to be collected in order to complete the feat.',
    url: 'rambunctious-hispikulus',
    epic_id: 2,
    goal: 3,
    unit: 'qurazy quoins',
    what: 'Find qurazy quoins on streets you have not visited before.',
    source: 'increment code lost; vog_text counts qurazy quoins; quoins.js qurazyFound',
  }),
  feat('graves_celebrating_mourning', {
    line: 26,
    game_day: '25-03-14',
    title: 'Deaths & Reminiscences',
    vog_text: 'Your reminiscing of this Grave has been counted as a contribution towards recreating the Feat of "Deaths & Reminiscences". There are {remaining} graves left to be reminisced in order to complete the feat.',
    url: 'deaths-and-reminiscences',
    epic_id: 2,
    wired: false,
    reason: "Celebrate / Mourn another Glitch's graveside marker (items/graveside_marker.js 37-138). The remake's only grave is your own and has no verbs (hell-feature.js 420).",
  }),
  feat('inviting_friends', {
    line: 34,
    game_day: '25-03-20',
    title: 'The Call to Feast',
    vog_text: 'Invitation, ho! Your inviting of this fine friend has been counted as a contribution towards recreating the Feat of "The Call to Feast". There are {remaining} friends left to be invited in order to complete the feat.',
    url: 'the-call-to-feast',
    epic_id: 2,
    wired: false,
    reason: 'Inviting real friends to the game. Nothing to invite in a solo save.',
  }),
  feat('donate_sparkly', {
    line: 42,
    game_day: '25-03-26',
    title: "Sparkla's Shine on the Giants",
    vog_text: 'Those sparkly rocks you just donated? They have advanced all Glitchdom toward accomplishment of the Feat "Sparkla\'s Shine on the Giants". If {remaining} more chunks of sparkly ore are donated to shrines, the Feat will have met its goal.',
    url: 'sparklas-shine',
    epic_id: 2,
    goal: 25,
    unit: 'chunks of Sparkly',
    what: 'Donate chunks of Sparkly at any shrine.',
    source: 'increment code lost; vog_text counts chunks donated to shrines; game.js performShrineDonation',
  }),
  feat('reminscequests', {
    line: 50,
    game_day: '25-03-32',
    title: 'Questing and Contesting',
    vog_text: 'The quest you just completed counted towards  the Feat "Questing and Contesting". There are {remaining} quests left to be completed in order to accomplish the Feat.',
    url: 'the-contests',
    epic_id: 2,
    goal: 5,
    unit: 'quests',
    what: 'Complete quests.',
    source: 'increment code lost; vog_text counts completed quests; quests.js completeQuest state.completed',
  }),
  feat('makeup_feat_1', {
    line: 58,
    game_day: '25-03-38',
    title: 'The Incantations of Absurdity',
    vog_text: 'The incantation you just performed counted towards Feat "The Incantations of Absurdity". There are {remaining} incantations left in order to accomplish the Feat.',
    url: 'the-incantations',
    epic_id: 2,
    wired: false,
    reason: 'Its increment code and phrases are gone; the surviving incantation chain (location.js 4529-4553) feeds makeup_feat_redux. Wiring both to the one chain would count every line twice.',
  }),
  feat('hi_signs_1', {
    line: 66,
    game_day: '25-05-26',
    title: 'A Fine How-Do-You-Do',
    vog_text: 'That hi sign you just sent over? That was nice! And it also advanced all of us towards completing the Feat "A Fine How-Do-You-Do": {remaining} more hi signs must be received to meet the current goal.',
    url: 'how-do-you-do',
    epic_id: 4,
    goal: 3,
    unit: 'hi signs',
    what: 'Trade hi signs with your Butler: yours landing on it, or its landing on you.',
    source: 'increment code lost (main.js 7692 doBreakIt names it); vog_text counts hi signs received; hi-signs-feature.js missile hits',
  }),
  feat('visiting_stones', {
    line: 74,
    game_day: '25-05-33',
    title: 'The Good Neighbor',
    vog_text: 'That nice visiting action you just did? It scored you some points in the Feat "The Good Neighbor". There are {remaining} points still required to hit the current goal.',
    url: 'good-neighbor',
    epic_id: 4,
    wired: false,
    reason: "The one surviving increment is a visitor leaving a package with someone else's Butler (items/bag_butler.js 3802-3805, +2 once per Butler). A solo game's neighbours have no Butler to leave one with, so it runs only in multiplayer (mp).",
    // G172: multiplayer only, where a neighbour's Butler takes your package (server homes_help.go).
    // Two Butlers' first packages (+2 each) make the personal goal; the shared Feat's minimum is 3x.
    mp: true,
    goal: 4,
    unit: 'points',
    what: "Leave a package with a neighbour's Butler. Each Butler counts once per Feat.",
    source: 'items/bag_butler.js 3802-3805 onLeavePackage: feats_increment(visiting_stones, 2) when this Butler holds nothing from you; neighbours-mp-feature butler_left settled',
  }),
  feat('pet_only', {
    line: 82,
    game_day: '25-05-40',
    title: '"… And Ask Nothing in Return"',
    vog_text: 'The actions you performed in the location you just left have been counted as a contribution to the Feat "… And Ask Nothing in Return." Players must contribute {remaining} more pets, massages, singings-to and so on to meet the current goal.',
    url: 'nothing-in-return',
    epic_id: 4,
    goal: 30,
    unit: 'kindnesses',
    what: 'Pet, water, massage and sing to things, then leave the street. Harvesting, milking or nibbling there first loses what you gave.',
    source: 'feats_increment_for_commit / feats_reset_commit (inc_feats.js 321-345, disabled after the Feat); counted on leaving the location (vog_text)',
    commit: true,
  }),
  feat('streaking', {
    line: 90,
    game_day: '25-07-08',
    title: 'The Lucky Streak',
    vog_text: 'That street you just streaked? It counted towards the feat The Lucky Streak. Just {remaining} streets left to streak to meet the next goal!',
    url: 'the-streak',
    epic_id: 0,
    goal: 5,
    unit: 'streets',
    what: 'Go nekkid and cross a street: leave it at least 1,000 pixels from where you came in. One per street per game day. A Cubimal box from the Spinning Wheel counts 5.',
    source: 'locations/location.js 1041-1055 onPlayerExit (nekkid, 1,000 px, once per street per game day); players/inc_skill_packages.js:53-54 spinning_wheel cubimal_package +5',
  }),
  feat('tottlys_toys', {
    line: 98,
    game_day: '25-10-31',
    title: "Tottly's Toys",
    vog_text: "Wow, that was fun! It also counted towards the feat Tottly's Toys! Just {remaining} more fun things to do to reach the next goal!",
    url: 'tottlys-toys',
    epic_id: 0,
    goal: 10,
    unit: 'fun things',
    what: 'Play with toys: Emotional Bear hugs, high fives, kisses and moons, racing Cubimals and setting them free.',
    source: 'emotional_bear.js 124/192/299/380, npc_cubimal_*.js 861 set free, 942 race of 5 planks or more',
  }),
  feat('animal_love', {
    line: 106,
    game_day: '26-03-17',
    title: "Heebo's Happy Accident",
    vog_text: 'You just interacted with an animal, and that counts towards the feat "Heebo\'s Happy Accident". There are {remaining} more animal interactions to reach this feat\'s goal!',
    url: 'animal-love',
    epic_id: 0,
    goal: 50,
    unit: 'animal interactions',
    what: 'Pet, feed, nibble, squeeze, milk, massage, sing to, brush, hug and flatter animals, or pocket and release a Salmon. Each Piggy and Batterfly counts 3 feeds.',
    source: 'feats_increment("animal_love") in npc_piggy, npc_chicken, npc_butterfly, npc_batterfly, npc_crab, npc_fox, npc_sloth, npc_kitty_chicken, npc_salmon, salmon (release), chick, piglet, caterpillar',
  }),
  feat('makeup_feat_redux', {
    line: 114,
    game_day: '26-03-41',
    title: "The First Glimmer of the Giants' Awakening",
    vog_text: 'The incantation you just performed counted towards Feat "The First Glimmer of the Giants\' Awakening". There are {remaining} incantations left in order to accomplish the Feat.',
    url: 'giants-awakening',
    epic_id: 0,
    goal: 6,
    unit: 'incantation points',
    what: 'Say your line in an incantation chain. Saying each of the three lines once makes 6.',
    source: 'locations/location.js 4529-4553 (1, 2 and 3 points for lines 1, 2 and 3); the chain lives in feats.js',
    // game.js's chain already counts feats:contributed for this one (feats.js firstContribution).
    contributionCountedElsewhere: true,
  }),
]);

function feat(id, row) {
  return Object.freeze({ id, wired: true, ...row });
}

export const FEAT_BY_ID = Object.freeze(Object.fromEntries(SOLO_FEATS.map((f) => [f.id, f])));
export const WIRED_FEATS = Object.freeze(SOLO_FEATS.filter((f) => f.wired));
export const UNWIRED_FEATS = Object.freeze(SOLO_FEATS.filter((f) => !f.wired));

/** inc_feats.js:311 feats_count_in_epic, over the whole production list. */
export function featsInEpic(epicId) {
  return SOLO_FEATS.filter((f) => f.epic_id === epicId).length;
}

/**
 * npc_piggy.js 734-739 and npc_batterfly.js 830-840 keep times_fed_for_feat
 * per player on each animal: only an animal's first 3 feeds count. The feed
 * event names the animal (game.js and animal-husbandry-feature pass
 * { animal: '<street tsid>:<class>:<index>' }); one feed takes one place under
 * the cap for every Feat rule it feeds (the source's one counter gates both
 * its animal_love call and the commented-out commit beside it).
 */
export const FEED_CAP = Object.freeze({ name: 'times_fed_for_feat', max: 3 });

/**
 * Game events (badge counters and quest events, feature-host onEvent) that
 * are Feat increments. `amount: 'event'` takes the event's own amount.
 * `commit` rows add to pet_only's pending pile, `reset` rows drop it.
 * `cap` rows count at most cap.max times per animal (the event's detail).
 */
export const EVENT_RULES = Object.freeze([
  // —— Heebo's Happy Accident ——
  rule('animal_love', /^npc_piggy:pet$/, 1, 'npc_piggy.js:1769 onPetComplete'),
  rule('animal_love', /^npc_piggy:nibble$/, 1, 'npc_piggy.js:887 nibble'),
  rule('animal_love', /^npc_piggy:feed\b/, 1, 'npc_piggy.js:738 feed (3 per animal, 734-739)', 'direct', FEED_CAP),
  rule('animal_love', /^npc_chicken:squeeze$/, 1, 'npc_chicken.js:1561 onSqueezeComplete'),
  rule('animal_love', /^eggs_incubated:/, 1, 'npc_chicken.js:924 giveIncubatedItem'),
  rule('animal_love', /^npc_butterfly:(?:milk|massage)$/, 1, 'npc_butterfly.js:739 milk, 816 massage'),
  rule('animal_love', /^npc_butterfly:sing_to$/, 3, 'npc_butterfly.js:685 sing_to'),
  rule('animal_love', /^npc_batterfly:feed$/, 1, 'npc_batterfly.js:839 feed (3 per animal, 830-840)', 'direct', FEED_CAP),
  rule('animal_love', /^animals_grown:(?:chick|piglet|caterpillar)$/, 1, 'chick.js:245, piglet.js:259, caterpillar.js:195 feed that grows it'),
  rule('animal_love', /^fox:fibers_brushed$/, 1, 'npc_fox.js:413 endBrushing'),
  rule('animal_love', /^sloth:snails_received$/, 1, 'npc_sloth.js:303 feed'),
  // G173. npc_salmon.js:207 pocket, only when the Pocket Salmon lands (not the
  // 10% boot); resource-nodes.js counts npc_salmon:pocket on that branch.
  rule('animal_love', /^npc_salmon:pocket$/, 1, 'npc_salmon.js:207 pocket'),
  // G178. salmon.js:92 release, the Pocket Salmon's pack verb
  // (resource-nodes-feature sends its notifyVerb counter salmon:release).
  rule('animal_love', /^salmon:release$/, 1, 'salmon.js:92 release'),
  // —— "… And Ask Nothing in Return": pending until you leave the street ——
  rule('pet_only', /^trants_petted:/, 1, 'include/trants.js:92 onPettingComplete', 'commit'),
  rule('pet_only', /^trants_watered:/, 1, 'include/trants.js:198 onWateringComplete, paper_tree.js:624 onTendComplete', 'commit'),
  rule('pet_only', /^wood_tree:(?:pet|water)$/, 1, 'wood_tree.js:1036 onTendComplete', 'commit'),
  rule('pet_only', /^npc_butterfly:massage$/, 1, 'npc_butterfly.js:1191 onMassageComplete', 'commit'),
  rule('pet_only', /^npc_butterfly:sing_to$/, 3, 'npc_butterfly.js:684 (commented after the Feat)', 'commit'),
  rule('pet_only', /^npc_piggy:pet$/, 1, 'npc_piggy.js:1768 (commented after the Feat)', 'commit'),
  rule('pet_only', /^npc_piggy:feed\b/, 1, 'npc_piggy.js:737 (commented after the Feat, inside the 3-feed cap)', 'commit', FEED_CAP),
  rule('pet_only', /^animals_grown:(?:chick|piglet|caterpillar)$/, 1, 'chick.js:244, piglet.js:258, caterpillar.js:194 (commented after the Feat)', 'commit'),
  rule('pet_only', /^(?:trants_harvested:|completed_harvest:wood_tree$|paper_tree:harvest$)/, 0, 'include/trants.js:435, wood_tree.js:798, paper_tree.js:480 harvests', 'reset'),
  rule('pet_only', /^npc_butterfly:milk$/, 0, 'npc_butterfly.js:1360 onMilkComplete', 'reset'),
  rule('pet_only', /^npc_piggy:nibble$/, 0, 'npc_piggy.js:1668 (commented after the Feat)', 'reset'),
  // G173. Fertilidust is kindness to trees (fertilidust.js:352 +3 when live
  // trants are on the street, fertilidust_lite.js:296 +1 on a tree); a
  // fecundity powder milks every animal at once and drops the pile
  // (powder_of_mild_fecundity.js:376, powder_of_startling_fecundity.js:379).
  // G178: the +3 sits inside fertilidust.js:344 `if (trants)`, so dust that
  // only revives dead trants gives nothing. powders-feature sends
  // fertilidust:trees_grown only when living trees took it; the verb's own
  // fertilidust:disperse fires either way and is not a Feat event.
  rule('pet_only', /^fertilidust:trees_grown$/, 3, 'fertilidust.js:352 onUse (living trees only)', 'commit'),
  rule('pet_only', /^fertilidust_lite:sprinkle$/, 1, 'fertilidust_lite.js:296 onUse', 'commit'),
  rule('pet_only', /^powder_of_(?:mild|startling)_fecundity:disperse$/, 0, 'powder_of_mild_fecundity.js:376, powder_of_startling_fecundity.js:379', 'reset'),
  // —— The Meditation of Groddlocritus: whole minutes ——
  rule('meditation_of_groddlocritus', /^focusing_orb:meditation_time$/, 'event', 'meditation.js focusing_orb:meditation_time (minutes)'),
  // —— Tottly's Toys ——
  rule('tottlys_toys', /^(?:players_hugged|players_high_fived|kissed|players_mooned)$/, 1, 'emotional_bear.js:124/192/299/380 (once per target)'),
  rule('tottlys_toys', /^cubimals_freed:/, 5, 'npc_cubimal_*.js:861 set free'),
  // —— The Lucky Streak: the Spinning Wheel's Cubimal boxes ——
  // G173. inc_skill_packages.js:53-54 runDropTable('spinning_wheel') gives +5
  // for cubimal_package or cubimal_package_2; game.js updateSpinningWheel
  // emits the drop table's own quest counter (inc_skill_packages.js:41).
  rule('streaking', /^drop_table_spinning_wheel_cubimal_package(?:_2)?$/, 5, 'inc_skill_packages.js:54 spinning_wheel cubimal_package'),
]);

function rule(featId, match, amount, source, mode = 'direct', cap = null) {
  return Object.freeze({ featId, match, amount, source, mode, ...(cap ? { cap } : {}) });
}

/**
 * The caps key for one animal: `<cap name>:<animal>`. An event with no animal
 * named shares one key per class, so it can never count more than an animal.
 */
export function capKeyFor(cap, counter, detail) {
  const animal = String(detail?.animal || '').trim().slice(0, 96);
  const cls = String(counter || '').split(':')[0];
  return `${cap.name}:${animal || `${cls}:unnamed`}`;
}

/**
 * The increments one game event makes: [{ featId, amount, mode, cap? }].
 * cap rows carry { key, max } (capKeyFor with the event's detail).
 */
export function eventIncrements(counter, amount = 1, detail = null) {
  const key = String(counter || '');
  if (!key) return [];
  const out = [];
  for (const r of EVENT_RULES) {
    if (!r.match.test(key)) continue;
    const n = r.amount === 'event' ? Math.max(0, Math.floor(Number(amount) || 0)) : r.amount;
    if (r.mode !== 'reset' && n <= 0) continue;
    const row = { featId: r.featId, amount: n, mode: r.mode };
    if (r.cap) row.cap = { key: capKeyFor(r.cap, key, detail), max: r.cap.max };
    out.push(row);
  }
  return out;
}

/**
 * eventIncrements for this save: a capped event takes one place under each
 * cap key it names (npc_piggy.js:739 times_fed_for_feat[pc.tsid]++), and an
 * animal already at its cap drops every row under that key. Mutates
 * state.caps. Rows come back without `cap`.
 */
export function featEventIncrements(state, counter, amount = 1, detail = null) {
  const rows = eventIncrements(counter, amount, detail);
  const open = new Map();
  for (const row of rows) {
    if (!row.cap || open.has(row.cap.key)) continue;
    const used = state.caps[row.cap.key] || 0;
    open.set(row.cap.key, used < row.cap.max);
    if (used < row.cap.max) state.caps[row.cap.key] = used + 1;
  }
  return rows
    .filter((row) => !row.cap || open.get(row.cap.key))
    .map(({ featId, amount: n, mode }) => ({ featId, amount: n, mode }));
}

// —— State ——————————————————————————————————————————————————————————————

const int = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
};

export function createSoloFeatState() {
  return normalizeSoloFeatState({});
}

/**
 * progress: featId -> { value, contributedAt, completedAt, runs }: value is
 * this run's count, contributedAt the first contribution ever (the badge
 * gate), completedAt the last finish (its reopening is a game week later),
 * runs how many times it has been finished. Saves from before G171 have no
 * runs: a finished Feat reads as one run, and its reopening comes from its
 * stored completedAt.
 * pending: pet_only's not-yet-committed pile (feats.to_commit).
 * caps: "<key>" -> times counted (once-per-crab, three-per-kitty limits).
 * streaked: "<day>|<tsid>" keys (location.js 1046-1050 streaking_increments).
 * questBase / qurazyBase: the counts already seen (null until first read).
 */
export function normalizeSoloFeatState(seed = {}) {
  const progress = {};
  for (const f of WIRED_FEATS) {
    const row = seed?.progress?.[f.id];
    if (!row || typeof row !== 'object') continue;
    const value = Math.min(int(row.value), f.goal);
    const contributedAt = int(row.contributedAt);
    const completedAt = int(row.completedAt) || (value >= f.goal ? 1 : 0);
    const runs = Math.max(int(row.runs), completedAt ? 1 : 0);
    if (!value && !contributedAt && !completedAt) continue;
    progress[f.id] = { value, contributedAt, completedAt, runs };
  }
  const caps = {};
  for (const [k, v] of Object.entries(seed?.caps || {})) {
    if (typeof k === 'string' && k.length <= 120 && int(v)) caps[k] = int(v);
  }
  const streaked = [...new Set((Array.isArray(seed?.streaked) ? seed.streaked : [])
    .filter((k) => typeof k === 'string' && k.length <= 80))].slice(-200);
  const base = (v) => (v === null || v === undefined || v === '' ? null : int(v));
  return {
    openedAt: int(seed?.openedAt),
    progress,
    pending: int(seed?.pending),
    caps,
    streaked,
    rocks: int(seed?.rocks),
    questBase: base(seed?.questBase),
    qurazyBase: base(seed?.qurazyBase),
  };
}

export function featProgress(state, featId) {
  return state.progress[featId] || { value: 0, contributedAt: 0, completedAt: 0, runs: 0 };
}

/** When a finished Feat opens again (0 while it is open). */
export function reopensAt(state, featId) {
  const f = FEAT_BY_ID[featId];
  const p = featProgress(state, featId);
  if (!f?.wired || p.value < f.goal) return 0;
  return (p.completedAt || 1) + GAME_WEEK_MS;
}

/**
 * Open again every finished Feat whose game week is up: this run's progress
 * goes back to 0 and the caps it owns (CAP_OWNERS) are dropped. Returns the
 * ids reopened. `only` limits it to one Feat.
 */
export function reopenDueFeats(state, now = Date.now(), only = null) {
  const t = int(now);
  const out = [];
  for (const f of WIRED_FEATS) {
    if (only && f.id !== only) continue;
    const at = reopensAt(state, f.id);
    if (!at || t < at) continue;
    state.progress[f.id].value = 0;
    if (f.commit) state.pending = 0;
    for (const owner of CAP_OWNERS) {
      if (!owner.feats.includes(f.id)) continue;
      for (const key of Object.keys(state.caps)) if (key.startsWith(owner.prefix)) delete state.caps[key];
    }
    out.push(f.id);
  }
  return out;
}

/**
 * The panel line under a Done Feat: "Opens again in 7 game days (about 28
 * hours)." Game days first (the remake's calendar), then real time.
 */
export function reopenText(at, now = Date.now()) {
  const left = Math.max(0, int(at) - int(now));
  if (!left) return 'Opens again now.';
  const minutes = Math.ceil(left / 60_000);
  const real = minutes < 90 ? `${minutes} minute${minutes === 1 ? '' : 's'}` : `${Math.round(minutes / 60)} hours`;
  if (left < GAME_DAY_MS) return `Opens again in about ${real}.`;
  const days = Math.round(left / GAME_DAY_MS);
  return `Opens again in ${days} game day${days === 1 ? '' : 's'} (about ${real}).`;
}

/** Ever finished (any run): the epic test and the Done-before line. */
export function featRuns(state, featId) {
  return featProgress(state, featId).runs || 0;
}

export function isFeatComplete(state, featId) {
  const f = FEAT_BY_ID[featId];
  return Boolean(f?.wired && featProgress(state, featId).value >= f.goal);
}

export function remainingFor(state, featId) {
  const f = FEAT_BY_ID[featId];
  return f?.wired ? Math.max(0, f.goal - featProgress(state, featId).value) : 0;
}

/** inc_feats.js:78 vog_text with {remaining}. */
export function vogTextFor(featId, remaining) {
  const f = FEAT_BY_ID[featId];
  if (!f) return '';
  return f.vog_text.replace(/\{remaining\}/g, String(Math.round(remaining))).replace(/\s+/g, ' ').trim();
}

/**
 * pc.feats_increment(class_tsid, amount) for one player's personal goal.
 * opts.cap = { key, max }: count at most `max` times under `key` (the
 * source's hugged_for_feat / times_fed_for_feat style limits).
 * Returns what the caller announces: { counted, amount, firstContribution,
 * completed, remaining, vogText, counters: [{counter, amount}], grants: [] }.
 */
export function incrementFeat(state, featId, amount = 1, opts = {}, now = Date.now()) {
  const f = FEAT_BY_ID[featId];
  const none = { counted: false, amount: 0, featId, counters: [], grants: [] };
  if (!f || !f.wired) return { ...none, reason: 'not_wired' };
  const n = int(amount);
  if (!n) return { ...none, reason: 'no_amount' };
  const reopened = reopenDueFeats(state, now, featId).length > 0;
  if (isFeatComplete(state, featId)) return { ...none, reason: 'complete', reopensAt: reopensAt(state, featId) };
  if (opts?.cap?.key) {
    const key = String(opts.cap.key).slice(0, 120);
    const max = Math.max(1, int(opts.cap.max) || 1);
    if ((state.caps[key] || 0) >= max) return { ...none, reason: 'capped' };
    state.caps[key] = (state.caps[key] || 0) + 1;
  }
  const row = state.progress[featId] || (state.progress[featId] = { value: 0, contributedAt: 0, completedAt: 0, runs: 0 });
  const before = row.value;
  row.value = Math.min(f.goal, before + n);
  const counters = [];
  const grants = [];
  const firstContribution = !row.contributedAt;
  if (firstContribution) {
    row.contributedAt = int(now) || 1;
    if (!f.contributionCountedElsewhere) counters.push({ counter: 'feats:contributed', amount: 1 });
    if (f.epic_id) counters.push({ counter: `epics_contributed:${f.epic_id}`, amount: 1 });
    // inc_feats.js:72, read solo: within 30 minutes of the Feats opening to you.
    if (state.openedAt && int(now) - state.openedAt <= QUICK_MS) grants.push('quick_on_your_feat');
  }
  // inc_feats.js:104-106.
  grants.push('down_to_the_wire');
  const completed = row.value >= f.goal && before < f.goal;
  let run = 0;
  if (completed) {
    const firstRun = !row.runs;
    row.completedAt = int(now) || 1;
    row.runs = (row.runs || 0) + 1;
    run = row.runs;
    state.rocks += 1;
    // inc_feats.js:58-69: every Feat of the epic done (the rewarded ones plus
    // this one). Once: only the first finish of the epic's last Feat.
    if (f.epic_id && firstRun) {
      const done = SOLO_FEATS.filter((o) => o.epic_id === f.epic_id && featRuns(state, o.id) > 0).length;
      if (done === featsInEpic(f.epic_id)) counters.push({ counter: `epics_completed:${f.epic_id}`, amount: 1 });
    }
    // inc_feats.js:281 feats_gather_rewards: once per rewards handed out, so every run.
    counters.push({ counter: 'feats:contributed_to', amount: 1 });
  }
  const remaining = f.goal - row.value;
  return {
    counted: true,
    featId,
    amount: row.value - before,
    value: row.value,
    goal: f.goal,
    firstContribution,
    // inc_feats.js:74-83: the vog_text only on the first contribution.
    vogText: firstContribution ? vogTextFor(featId, remaining) : '',
    completed,
    run,
    reopened,
    reopensAt: completed ? row.completedAt + GAME_WEEK_MS : 0,
    remaining,
    counters,
    grants,
  };
}

/** feats_increment_for_commit: pile up pet_only points on this street. */
export function addPending(state, amount, now = Date.now()) {
  reopenDueFeats(state, now, 'pet_only');
  if (isFeatComplete(state, 'pet_only')) return 0;
  // Never pile up more than the goal still needs.
  const room = Math.max(0, remainingFor(state, 'pet_only') - state.pending);
  const n = Math.min(int(amount), room);
  state.pending += n;
  return n;
}

/** feats_reset_commit: drop the pile (returns the lost amount). */
export function resetPending(state) {
  const lost = state.pending;
  state.pending = 0;
  return lost;
}

/** feats_get_for_commit: hand the pile over on leaving the street. */
export function takePending(state) {
  const n = state.pending;
  state.pending = 0;
  return n;
}

/**
 * location.js 1041-1055 onPlayerExit: nekkid on a real street, leaving at
 * least 1,000 px (straight line) from where you entered or went nekkid,
 * once per street per game day.
 */
export function streakCheck(state, { tsid, dayKey, entry, exit, nekkid, realStreet }) {
  if (!realStreet || !nekkid || !entry || !exit || !tsid) return { ok: false, reason: 'not_streaking' };
  const distance = Math.hypot((exit.x || 0) - (entry.x || 0), (exit.y || 0) - (entry.y || 0));
  if (distance < STREAK_PX) return { ok: false, reason: 'too_short', distance };
  const key = `${dayKey}|${tsid}`;
  if (state.streaked.includes(key)) return { ok: false, reason: 'already', distance };
  state.streaked.push(key);
  if (state.streaked.length > 200) state.streaked.splice(0, state.streaked.length - 200);
  return { ok: true, distance };
}

/** Panel rows, in game_day order (reopensAt: when a finished one opens again). */
export function featRows(state) {
  return WIRED_FEATS.map((f) => {
    const p = featProgress(state, f.id);
    return {
      reopensAt: reopensAt(state, f.id),
      runs: p.runs || 0,
      id: f.id,
      title: f.title,
      what: f.what,
      unit: f.unit,
      goal: f.goal,
      value: p.value,
      complete: p.value >= f.goal,
      pending: f.commit ? state.pending : 0,
    };
  });
}

/** Canvas data: "id:value/goal" for every wired Feat. */
export function featSummary(state) {
  return WIRED_FEATS.map((f) => `${f.id}:${featProgress(state, f.id).value}/${f.goal}`).join(',');
}
