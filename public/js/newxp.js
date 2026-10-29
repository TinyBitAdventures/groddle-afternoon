/**
 * The original new-player experience ("newxp", Gentle Island tutorial) as an
 * opt-in start. Pure rules and source data; the feature that runs it is
 * js/features/newxp-feature.js.
 *
 * Sources (GameServerJS, design data only):
 *  - config_prod.js newxp_locations (intro LIFBFC7TDJ535UL, training1
 *    LIFBLMAVDJ53NP1, training2 LIFD0KCDEJ53L7K, newbie_island
 *    LA952QGCH3D31E2) and newxp_exits (115 drop points; all imported).
 *  - locations/newxp_intro.js, newxp_training1.js, newxp_training2.js,
 *    newxp_house_exterior.js, inc_newxp.js, newbie_island.js,
 *    skillquest_ak_v2.js / skillquest_lgt_v2.js / skillquest_ezc_v2.js.
 *  - players/inc_newxp.js, players/player.js goToNewNewStartingLevel and
 *    teleportHome, players/inc_physics.js setDefaultPhysics,
 *    items/magic_rock.js, items/npc_sloth.js, locations/home.js.
 *  - quests animalkinship_1 / ezcooking_1 / lightgreenthumb_1 (handed out
 *    finished by the Magic Rock: quests_give_finished, no rewards),
 *    buy_two_bags and leave_gentle_island (normal rewards).
 *  - inc_data_imagination.js walk_speed_1/2, jump_1/2 physics rewards.
 *
 * Lost and rebuilt: the geometry of the three newxp instance templates (no
 * G*.xml for them in the archive). The client overlays' text is Tiny Speck's
 * CC0 overlay art (glitch-overlays/*_instructions.fla, newxp_img1/2/3_overlay.fla,
 * inventory_instructions_overlay.fla) and glitch-client strings and callout
 * PNGs; where the archive has none (first_eat, first_drink) the copy is the
 * remake's own (G310, research/coverage/g310-copy-provenance.md). The Cloud
 * Level's words and every piece of the three levels' scenery are Tiny Speck's
 * own art from newxp_cloud.swf and newxp_misc.swf (CC0): see CLOUD_WORDS and
 * the layouts' `art`; where they stand is rebuilt from the recording
 * K2q5GXruLvE (rudiglitch, 2012) and the Snaps "Cloud Intro" and "TR1".
 * Gentle Island (hub 129, six streets) and the Animal Kinship / Light Green
 * Thumb practice streets are imported and used as they are.
 *
 * Gentle Island scripts (newbie_island.js and the six streets' location
 * events): the quoins with a location_event_id (the Qurazy on Surveyor's
 * Stroll opens the first upgrade hand and Mappery's map reveal; two quoins
 * on High Jumper's Gully; the Exit's Qurazy explains the upgrade menu), the
 * hint signs (sign_txt on invisible groddle_sign_blank decos), the side
 * streets' Musicblock and Spinach garden, the Gameshow Ticket stand and the
 * singing street spirit. Lost and rebuilt: the Qurazy markers and the
 * Collision-triggered Event Boxes were instance items, so their spots are
 * placed in front of what they point at.
 */

export const NEWXP_SAVE_VERSION = 1;

export const NEWXP_LOCATIONS = Object.freeze({
  newxp_intro: 'LIFBFC7TDJ535UL',
  newxp_training1: 'LIFBLMAVDJ53NP1',
  newxp_training2: 'LIFD0KCDEJ53L7K',
  newbie_island: 'LA952QGCH3D31E2',
});

/** Ordered stages. Scene stages are feature-built (geometry lost). */
export const STAGES = Object.freeze(['clouds', 'training1', 'training2', 'house', 'skill', 'island', 'done']);
export const SCENE_STAGES = Object.freeze(['clouds', 'training1', 'training2']);

export const SCENE_TSIDS = Object.freeze({
  clouds: 'NEWXP_CLOUDS',
  training1: 'NEWXP_TRAINING1',
  training2: 'NEWXP_TRAINING2',
});

export function isNewxpSceneTsid(tsid) {
  return Object.values(SCENE_TSIDS).includes(String(tsid || ''));
}

/** Imported Gentle Island (hub 129) and practice streets (G* index keys). */
export const GENTLE_ISLAND = Object.freeze({
  surveyors_stroll: 'GA952QGCH3D31E2', // NB_Street1, the Magic Rock
  high_jumpers_gully: 'GA94O989H3D3RN7',
  diversionary_path: 'GA94AEO5H3D35LP',
  doonboggle_trail: 'GA94GCF7H3D30IM',
  progress_way: 'GA94UK1BH3D3FJL', // the cheap bag vendor
  exit: 'GA93VBH3H3D38HF', // Gentle Island Exit
});
export const GENTLE_ISLAND_TSIDS = Object.freeze(Object.values(GENTLE_ISLAND));
// source: inc_skillquest.js newbie_island arrival (-2302, -77), bounds l -2500 t -1200.
export const ISLAND_ARRIVAL = Object.freeze({ tsid: GENTLE_ISLAND.surveyors_stroll, x: 198, y: 1100 });

/** Street boxes (screen space, bottom-centre) the island script reacts to. */
export const ISLAND_BOXES = Object.freeze({
  // newbie_island.js hitBox street4_check / gentle_island_exit.
  street4_check: { tsid: GENTLE_ISLAND.progress_way, x: 4700, y: 950, w: 200, h: 200 },
  gentle_island_exit: { tsid: GENTLE_ISLAND.exit, x: 5724, y: 1122, w: 600, h: 300 },
});

/**
 * The three first skills (magic_rock.js showSkillChooser / onOverlayClicked)
 * and their practice streets (config newxp_locations). Only Animal Kinship
 * and Light Green Thumb were archived; EZ Cooking's street is lost.
 */
export const FIRST_SKILLS = Object.freeze([
  { id: 'animalkinship_1', quest: 'animalkinship_1', choice: 'skill_animal_kinship', name: 'Animal Kinship', art: 'animalkinship', street: 'GHFRK14DDU53RQQ', finishBox: 'quest:flag:finish_animalkinship', practice: 'So … it’s Animal Kinship, eh? Alright then. Let’s practice!', reply: 'OK' },
  { id: 'ezcooking_1', quest: 'ezcooking_1', choice: 'skill_ezcooking', name: 'EZ Cooking', art: 'ezcooking', street: null, finishBox: null, practice: 'Ah, EZ Cooking. Let\'s get started!', reply: 'Aiight' },
  { id: 'light_green_thumb_1', quest: 'lightgreenthumb_1', choice: 'skill_lightgreenthumb', name: 'Light Green Thumb', art: 'lightgreenthumb', street: 'GUVCT29PSU53G9V', finishBox: 'quest:flag:finish_lightgreenthumb', practice: 'Light Green Thumb? Let’s practice!', reply: 'Aiight' },
]);
// source: quests/*_1.js onStarted teleportToLocationDelayed(..., 123, -958); street bounds t -1000.
export const PRACTICE_ARRIVAL = Object.freeze({ x: 123, y: 42 });

export function firstSkill(id) {
  return FIRST_SKILLS.find((s) => s.id === id || s.choice === id || s.quest === id) || null;
}

/* ------------------------------------------------------------------ */
/* Physics                                                              */
/* ------------------------------------------------------------------ */

// source: inc_physics.js setDefaultPhysics "NEW DEFAULT" imagination layer.
export const NEWXP_DEFAULT_PHYSICS = Object.freeze({ vx_max: 0.4597, vy_jump: 0.7105 });
// source: inc_data_imagination.js reward type 1 data; condition type 1 (in
// tutorial) plus the type 3 prerequisite in `needs`. The last five are the
// Gentle Island hands (newbie_island.js mappery_upgrade / zoom_upgrade /
// other_upgrade quoins).
export const NEWXP_UPGRADES = Object.freeze({
  walk_speed_1: { name: 'Walk Speed I', cost: 2, vx_max: 0.6567 },
  jump_1: { name: 'High Jumper I', cost: 3, vy_jump: 0.907 },
  jump_2: { name: 'High Jumper II', cost: 6, vy_jump: 1, needs: 'walk_speed_1' },
  walk_speed_2: { name: 'Walk Speed II', cost: 6, vx_max: 0.8268 },
  mappery: { name: 'Mappery', cost: 20, needs: 'jump_1' },
  camera_mode: { name: 'Camera Mode', cost: 75, needs: 'jump_2' },
  zoomability: { name: 'Zoomability', cost: 75, needs: 'walk_speed_2' },
  encyclopeddling: { name: 'Encyclopeddling', cost: 90, needs: 'mappery' },
  skill_learning: { name: 'Skill Learning Brain', cost: 500, needs: 'mappery' },
});
export const ISLAND_HAND_SIZE = 3;

/**
 * The hand an island quoin opens (imagination_get_next_upgrades in a newxp
 * location: only tutorial cards, owned ones and unmet prerequisites left
 * out). The source dealt at random; here the deck order of
 * inc_data_imagination.js, so the first island hand is the source's only
 * possible one (Mappery, Camera Mode, Zoomability).
 */
export function islandHand(owned = []) {
  const have = new Set(owned);
  return Object.entries(NEWXP_UPGRADES)
    .filter(([id, u]) => !have.has(id) && (!u.needs || have.has(u.needs)))
    .slice(0, ISLAND_HAND_SIZE)
    .map(([id]) => id);
}

/** inc_imagination.js imagination_reduce_to_hand: top iMG up to the cheapest card in the hand. */
export function reduceToHand(hand, imagination) {
  const costs = (hand || []).map((id) => NEWXP_UPGRADES[id]?.cost).filter((c) => c > 0);
  const cheapest = costs.length ? Math.min(...costs) : 0;
  const have = Math.max(0, Number(imagination) || 0);
  return cheapest && cheapest > have ? cheapest : have;
}
// The remake's normal movement is Walk Speed II + High Jumper II (imagination.js REMAKE_BASELINE_PHYSICS).
const BASELINE = { vx_max: 0.8268, vy_jump: 1 };

/** Remake speed/jump multipliers for the newxp imagination layer. */
export function tutorialPhysics(upgrades = []) {
  const set = new Set(upgrades);
  let vx = NEWXP_DEFAULT_PHYSICS.vx_max;
  let vy = NEWXP_DEFAULT_PHYSICS.vy_jump;
  for (const id of ['walk_speed_1', 'walk_speed_2']) if (set.has(id)) vx = Math.max(vx, NEWXP_UPGRADES[id].vx_max);
  for (const id of ['jump_1', 'jump_2']) if (set.has(id)) vy = Math.max(vy, NEWXP_UPGRADES[id].vy_jump);
  return { speed: vx / BASELINE.vx_max, jump: vy / BASELINE.vy_jump };
}

/**
 * Safe reach for level design in remake pixels: the avatar's apex is 110 px
 * at jump 1 (jump velocity -9.6 * jump, gravity 0.42/frame), scaling with
 * jump squared; the horizontal reach is 60% of the airborne run.
 */
export function reachFor(physics) {
  const jump = physics?.jump ?? 1;
  const speed = physics?.speed ?? 1;
  const apex = 110 * jump * jump;
  const airFrames = (2 * 9.6 * jump) / 0.42;
  return { rise: Math.floor(apex - 10), gap: Math.floor(0.6 * 4.4 * speed * airFrames) };
}

/** Platform ids reachable from `startId` by walking, jumping, dropping and ladders. */
export function reachablePlatforms(platforms, ladders, startId, reach) {
  const byId = new Map(platforms.map((p) => [p.id, p]));
  const seen = new Set([startId]);
  const queue = [startId];
  const yOf = (p) => (p.y1 + p.y2) / 2;
  while (queue.length) {
    const a = byId.get(queue.shift());
    for (const b of platforms) {
      if (seen.has(b.id)) continue;
      const rise = yOf(a) - yOf(b);
      const gap = Math.max(0, b.x1 - a.x2, a.x1 - b.x2);
      let ok = false;
      if (rise <= 0) ok = gap <= reach.gap + Math.min(300, -rise); // drop or level hop
      else ok = rise <= reach.rise && gap <= reach.gap;
      if (!ok) {
        for (const l of ladders || []) {
          const onA = l.x >= a.x1 - 10 && l.x <= a.x2 + 10 && Math.abs(l.yBot - yOf(a)) <= 30;
          const onB = l.x >= b.x1 - 30 && l.x <= b.x2 + 30 && l.yTop <= yOf(b) + 10 && l.yTop >= yOf(b) - reach.rise;
          if (onA && onB) ok = true;
        }
      }
      if (ok) {
        seen.add(b.id);
        queue.push(b.id);
      }
    }
  }
  return seen;
}

/* ------------------------------------------------------------------ */
/* Dialogue (source-exact; <split butt_txt> marks the next button)     */
/* ------------------------------------------------------------------ */

export const LINES = Object.freeze({
  // newxp_intro.js 11-18 move_instructions_overlay: the words on the CC0 overlay
  // art, glitch-overlays/move_instructions.fla LIBRARY/move-overlay.png (two lines).
  moveInstructions: 'Use Arrow Keys to move!<br>(or W,A,S,D Keys if you prefer)',
  // The Cloud Level's own words are Tiny Speck's lettering art, not copy: see CLOUD_WORDS.
  // inc_data_overlays.js 148-152, 165 instruction overlays: the words on each
  // CC0 overlay's art (the bitmap its DOMDocument places), glitch-overlays/
  // button_instructions.fla button-overlay2.png, jump_instructions.fla
  // jump-overlay.png, jumpAcross_instructions.fla jump-across-overlay.png,
  // climb_instructions.fla climb-overlay.png, interact_instructions.fla
  // "interact-overlay.png copy 2".
  buttonInstructions: 'Use Enter to advance through conversations',
  jumpInstructions: 'Use the Space Bar to jump!',
  jumpAcrossInstructions: 'Use Space Bar & Arrow Keys to jump across!',
  climbInstructions: 'Use Up/Down Keys to climb ladders!',
  interactInstructions: 'Use Enter to interact with glowing objects or players',
  // newxp_training1.js
  t1Talk1: 'Well, well — welcome.<br><br>I’m a “Welcoming Flamingo”.<br>But I am not a patient Flamingo.',
  t1Talk2: '… not patient at all, he isn\'t. So, let\'s get a move on. This way!',
  t1Slow1: 'See, this. You walk so slowly.<br>It’s maddening! You’ve got to imagine yourself faster!!',
  t1Slow2: 'Sorry about that.<split butt_txt="It\'s OK">But, you should get to walking faster.<br>You’ll need some imagination.',
  t1CatchUp: 'Good. Now catch up to those flamingos.',
  t1JumpTalk: 'Good. Now follow me up here …',
  t1GoGetQuoin: 'Go and get that quoin.',
  t1JumpHigher: 'Go and get that quoin. You need to jump higher.',
  t1Door1: 'Yeah! You know how to moooove!',
  t1Name: 'And so you deserve the honor of a name. What shall we call you?',
  t1NamePrompt: 'What should we call you?',
  t1Look: 'So, {name}, is it? Surely you don’t imagine yourself looking so very, very plain. Put together a basic look for yourself to get started.',
  t1Bye: 'You seem fairly well set up now, {name}. And we must be off to welcome the next new player. Good luck!',
  // items/npc_sloth.js newxp_talk
  sloth: 'You’re doing greeeeeeeeeeeat…<br>Keep going!',
  // newxp_img1/2/3_overlay: the vector lettering in glitch-overlays/
  // newxp_img1_overlay.fla, newxp_img2_overlay.fla, newxp_img3_overlay.fla
  // (DOMDocument, Scene 1 frame 0; img1 also as LIBRARY/Bitmap 1), CC0.
  img1: { title: 'You got some imagination', body: 'You can use imagination to upgrade and customize your character.', button: 'Choose Upgrade' },
  img2: { title: 'You got more imagination', body: 'At various thresholds, as you earn more, you’ll level up. (But you’ll need a lot more than this.)', button: 'Choose Upgrade' },
  img3: { title: 'Even more imagination', body: 'Nicely done. We’ll sock this one away till later', button: 'Okay' },
  // glitch-client ImaginationHandUI.as 95.
  upgradeHelp: 'Select a card above<br>to learn about the upgrade',
  // newxp_training2.js
  t2Talk1: 'Wow. Okay! Hihi {name}.<br>Let\'s scratch your back, so to speak.',
  t2Talk5: 'And then you scratch mine! HA!<br> Just follow my lead.',
  t2Food: 'Some food, for your energy needs.<br>Feel free to pick it up.',
  t2EatNag: ['Go on. Eat!', 'Eat it. Mmmm!'],
  t2FoodRest: 'You\'ll want the rest of that food later,<br>so pick it up.',
  t2NotYet: 'You need to come on and do<br>what I am telling! For real!',
  t2Drinks: 'Ok! You\'ll need drinks to keep up your mood. Please pick one up.',
  t2DrinkIt: 'Good, now drink it!',
  t2DrinkFirst: 'Ahut! Uht! Look! Drink one<br>of those drinks!',
  t2DrinkRest: 'Snag the rest of those drinks for later. They\'ll come in handy.',
  t2Egg1: 'OK, {name}. I have helped<br>you out. Now it\'s time for you to<br>do the same.<split butt_txt="OK">I\'m an aficionado of EGGs, but without<br>any appendages I can\'t get them myself.',
  t2Egg1c: 'Please jump your way to the EGG PLANT<br>up there and bring me an EGG.',
  t2Egg2: 'Go up to the Egg Plant and get an Egg for the Dustbunny.',
  t2Egg3: 'Mmmm. EGGs! Love \'em!',
  t2HaveEgg: 'You got an EGG! Please gimme it!!!',
  t2NoEgg: 'Heyyyyyyy. You were going to<br>get me an EGG. Fair\'s fair!<br>Go get one!',
  t2GiveHint: 'Drag an Egg onto the Dustbunny. Or, click on the Dustbunny to give it an Egg.',
  t2Harvest: 'Harvest …',
  t2Delicious: 'Delicious!',
  t2Thanks: 'Thank you very much, {name}.<br>That was SO GOOD!<br><split butt_txt="No problem">As a token of my thanks,<br>let me remove these walls.',
  t2FindRock: 'Go and find your magic rock. Should be over on the right …',
  t2Bye: 'Good luck, {name} — enjoy your new home!',
  rockUpHere: '{name}! Up here!',
  rockTicket: '{name}, my new chum.<br>I have a ticket for you.<split butt_txt="Good">You can use it to pick the home street<br>style that fits your vibe the best.<split butt_txt="OK">It\'s pretty easy to change your mind<br>later - just need a little imagination.<split butt_txt="Right">So make your choice and I\'ll meet you<br>at your new place.',
  rockOhRight: 'Oh right, the ticket.',
  // newxp_training2.js 844 first_inv_overlay: its own art was in the lost
  // template, so Tiny Speck's inventory overlay of the same month stands in
  // (inc_data_overlays.js 166, glitch-overlays/inventory_instructions_overlay.fla
  // LIBRARY/inventory-overlay.png, CC0).
  firstInventory: { title: 'Check out your inventory', body: 'When you pick up or buy items (or when someone gives you an item) they’ll end up in your inventory below the game window.', button: 'Makes Sense!' },
  // newxp_training2.js 523 / 578 first_eat_overlay / first_drink_overlay: lost
  // with the template; remake copy (G310).
  firstEat: 'Food fills your energy bar.',
  firstDrink: 'Drinks fill your mood bar.',
  // The words on glitch-client TSEngineAssets/src/assets/graphics/callout_energy.png
  // and callout_mood.png (Assets.as 79-80, 95-96; PlayerInfoUI.as 489 shows the first).
  watchEnergy: 'Watch Your Energy',
  keepMood: 'Keep your mood up',
  // items/homestreet_ticket_dispenser.js 1.
  machine: 'Home Street Selection Machine',
  // items/magic_rock.js (house exterior / home)
  ooof: 'Ooof.',
  homeStreet: 'Well, this is your home street. It’s not much yet, but I’m sure you’ll build it up nicely.',
  chooseSkill: 'There’s so much more you can do with your house and your land — but to do much more you’re going to need some skills, and you’re going to need to get out into the world to put those skills to work.<split butt_txt="OK">Do you want to choose a skill now? Or do you want a few more minutes to look around?',
  giveMinute: 'OK, no problem. Take your time and when you’re ready, come talk to me.',
  takePick: 'Good. I can give you one skill instantly; the rest you’ll have to learn over time. Take your pick …',
  goodChoice: '{skill} is a good choice. I’ll send you to a special place to practice and then you’ll be off to The Island …',
  // newbie_island.js / magic_rock.js on Gentle Island
  islandHello: 'Well, {name}, what did I say?  {skill} was a solid choice.<split butt_txt="Thanks">All that skillin’ is going to get you lots of stuff. And, hmmmm, your inventory is not SO big.<split butt_txt="Hmmm">Looks like you need some bags. You can hold more stuff if you have some bags.',
  watchThis: 'Watch this part: the rock is about to give you a quest.',
  explainQuest: 'You need to go and find the CHEAP BAG VENDOR on PROGRESS WAY.<split butt_txt="OK">Bags cost about 500 currants each, I think. You should get two. I can give you the money, let’s see here …',
  currants: 'Currants are the currency of Ur.//They make it easier to trade with vendors and other players.',
  shortChange: 'Hmmm. Looks like I was a little short — that’s not quite enough for two bags.<split butt_txt="Dang">Oh well — shouldn’t be THAT hard for you to rustle up a few more currants on your way to find the CHEAP BAG VENDOR on PROGRESS WAY (like I previously mentioned). Good luck!',
  thatWasQuest: 'That was a quest. It shows up in your quest log.',
  questLogHint: 'Use the ‘Q’ key to bring up your Quest Log whenever you want',
  goodLuck: 'Good luck …',
  bagReminder: 'You haven\'t gotten your bags from the vendor. Don\'t forget!',
  noBagsYet: 'You haven\'t bought your bags from the vendor yet. You really need to do that …',
  backAndForth: 'You can go back and forth between your home street and world at almost any time',
  // newbie_island.js street4_check, first page (the second, "Use the iMG menu
  // to go back to your home street.", is the Home panel opening instead).
  notSoFast: 'Not so fast — head home first so we can wrap this up',
  // home.js playerEnterCallback (is_postnewxp) and magic_rock.js give-skill-learning.
  homeGift: 'You little adventurer, you — nicely done.<split butt_txt="Yay me">I have a little present for you as well …<split butt_txt="Do Tell!">I got you this very fancy upgrade: the Skill Learning Brain!',
  // home.js closedImaginationMenu (only when no skill is being learned).
  skillBrain: 'Now you have a Skill Learning Brain! You can learn skills on your own, but learning takes time.<split butt_txt="Good">As you learn more and level up, you\'ll unlock all kinds of skills — Teleportation and Mining, Machine use and Potionmaking — the list is long.<split butt_txt="Interesting …">But for now, your choices are a bit more humble. Choose one of the skills you\'ve unlocked so far to begin.',
  // home.js closedImaginationMenu2.
  wellKid: 'Well kid, you seem to know what you’re doing … at least enough to get started.<split butt_txt="Yeah">So I’m going to pipe down now and stick close to your house for later. I have a lot of reading to catch up on.',
  // magic_rock.js checkSideStreetsConvo (force_bye).
  chapterBye: 'This chapter is just fascinating … bye!',
  // magic_rock.js remind-img; the source says "use the iMG Menu" (the remake's
  // way back is the Home panel's Return to Ur, as 'Q' stands in for 'L' above).
  whenReady: 'When you’re ready, use Return to Ur to go back to Gentle Island and head to the real world.',
  relic: 'Lo, a relic of the Island came along with you!',
  greeterTwig: 'It’s a Greeter Twig! You can use it to summon another player to come and say hi.',
  explore: 'Good luck! And just explore … try everything, see what happens. You\'ll learn all you need that way.',
});

/** Fill {name}/{skill} and turn a source talk string into pages. */
export function talkPages(text, vars = {}, finalButton = 'OK') {
  const filled = String(text || '').replace(/\{(\w+)\}/g, (_, k) => (vars[k] != null ? String(vars[k]) : ''));
  const parts = filled.split(/<split\s+butt_txt="([^"]*)"\s*\/?>/);
  const pages = [];
  for (let i = 0; i < parts.length; i += 2) {
    const body = parts[i].replace(/^(<br>\s*)+|(<br>\s*)+$/g, '').trim();
    const button = i + 1 < parts.length ? parts[i + 1] : finalButton;
    pages.push({ text: body, button });
  }
  return pages;
}

/** announce_vog_fade text: '//' separates the faded pages. */
export function vogPages(text) {
  return String(text || '').split('//').map((s) => s.trim()).filter(Boolean);
}

/* ------------------------------------------------------------------ */
/* Items, rewards, prices                                               */
/* ------------------------------------------------------------------ */

// newxp_training2.js special_items (class, count).
export const TRAINING2_FOOD = Object.freeze([
  { id: 'food_2', classTsid: 'common_crudites', count: 1 },
  { id: 'food_3', classTsid: 'flummery', count: 1 },
]);
export const TRAINING2_DRINKS = Object.freeze([
  { id: 'drink_1', classTsid: 'spicy_grog', count: 1 },
  { id: 'drink_2', classTsid: 'fruity_juice', count: 3 },
  { id: 'drink_3', classTsid: 'spicy_grog', count: 3 },
]);
// food_eaten: metabolics_set_energy(80); playerEnter sets energy/mood 99.
export const TRAINING2_ENERGY_AFTER_EAT = 80;
export const TRAINING2_ENTER_METABOLICS = 99;
// newbie_island.js revealCurrants2: stats_add_currants(978).
export const ISLAND_CURRANTS = 978;
// The cheap bag vendor's prices are lost; the rock says "about 500 currants each".
export const CHEAP_BAG_PRICE = 500;
export const BAGS_NEEDED = 2;
// location.js: leave_gentle_island flag 15 s after reaching a real street.
export const LEAVE_FLAG_DELAY_MS = 15_000;
// players/inc_newxp.js newxpQuestReminder: every 5 minutes.
export const BAG_REMINDER_MS = 5 * 60_000;

/** iMG quoins in the training levels (training1 xp benefits from the source; the rest from the playthrough HUD). */
export const QUOIN_BENEFITS = Object.freeze({
  img_pickup_walk: 2, // newxp_training1.js slow_create_coin benefit 2
  img_pickup_jump: 3, // newxp_training1.js timFix benefit 3
  img_pickup_ladder: 1, // playthrough: IMG 0 -> 1
  img_pickup_1: 6, // playthrough: IMG 1 -> 7, buys High Jumper II (6)
  img_pickup_egg_a: 4, // playthrough: "+4 IMG" by the Egg Plant
  img_pickup_egg_b: 6, // playthrough: IMG 1 -> 11 in all, buys Walk Speed II (6)
});

/** The upgrade hands dealt in the playthrough (the buyable card is `buy`). */
export const UPGRADE_HANDS = Object.freeze({
  walk: { cards: ['jump_1', 'walk_speed_2', 'walk_speed_1'], buy: 'walk_speed_1' },
  jump: { cards: ['jump_1', 'walk_speed_2', 'jump_2'], buy: 'jump_1' },
  jump2: { cards: ['walk_speed_2', 'jump_1', 'jump_2'], buy: 'jump_2' },
  walk2: { cards: ['mappery', 'walk_speed_2', 'camera_mode'], buy: 'walk_speed_2' },
});

/* ------------------------------------------------------------------ */
/* Exits                                                                */
/* ------------------------------------------------------------------ */

// config_prod.js newxp_exits [tsid, x, y]: every one is imported (G index key).
export const NEWXP_EXITS = Object.freeze([
  ['LCRR4REARA12CM5', -2295, -1300], ['LHV1AMP8TL02B40', -2355, -1300], ['LLI17P0T8J029N7', 2344, -1300],
  ['LHV1CIQLVL02C6H', -2355, -1300], ['LHV1IHMG1312A0S', 2421, -1300], ['LCRL3F8I3L12O0J', 2525, -1300],
  ['LCR12D911T12E57', 2457, -1300], ['LCR8F1FLBI12F2H', 2320, -1300], ['LCR137T2HK123RR', -2355, -1300],
  ['LHVTUCELRV02V9I', 2293, -1300], ['LA51701PF262LC8', -800, -1300], ['LA5FUB7R0N627KI', -414, -2700],
  ['LA58KK7B9O522PC', 380, -2700], ['LA517MT2M262D0F', -2280, -1300], ['LA519RU9M462NJ1', 2367, -1300],
  ['LA51BMHT2562Q3D', -2207, -1300], ['LA55645B8O528MI', -2525, -1300], ['LHVSU0QSQIA2TIM', 2434, -1300],
  ['LHV1KT9J0LA2IIA', -1425, -1300], ['LHVT10TNRIA23L2', -262, -1300], ['LHV1H71LPKA2P7G', -2488, -1300],
  ['LHV23IAU9LA2E7A', 2267, -1300], ['LHVT0JVHRIA2IE9', -2354, -1300], ['LA912UEGE492F2G', 2301, -1300],
  ['LA91O38QQ192K8J', -2357, -1300], ['LA912LITC492EU2', 808, -1300], ['LA9143HLH4929K7', -2357, -1300],
  ['LA9FDN44SG92SDQ', -2287, -1300], ['LA9I92MRBE92S8Q', 2297, -1300], ['LA9111H84492V1K', 2345, -1300],
  ['LA9BRBV8Q492K6R', -2322, -1300], ['LA99NEQK1F92ICE', -2355, -1300], ['LIF8I91P8J02A85', 1521, -1700],
  ['LHVMCDF3LA32K2R', 1786, -1500], ['LIF13QL5IG02UAI', -1950, -1500], ['LHVQM0MUB032B5S', -1712, -1500],
  ['LHVLJEBAJ832SJA', 1655, -1500], ['LHVMHDIBNA32QPF', 1935, -1500], ['LHV8NMVAGE228A2', -1775, -1500],
  ['LHVVLBM1VL22A6Q', -1382, -1500], ['LIFNRF3P0E02J90', 1821, -1500], ['LHVD0VVK8U2262J', -1777, -1500],
  ['LCR1UERKPIN1G7N', -2473, -1300], ['LCR103UREMK11MT', -2201, -1300], ['LCR143M18PK1774', -2364, -1300],
  ['LCR10S7GVKJ1ABI', -2525, -1300], ['LCR13CE52PK1L81', -2415, -1300], ['LLIF37ASJFE1AVQ', 2182, -1300],
  ['LCR13O9VQEM1M3P', -2423, -1300], ['LLIF3AQTOFE19OR', 2373, -1300], ['LCR10K63BQL14PE', -1389, -1600],
  ['LCR1460502K1790', 2306, -1300], ['LCR131F8U1K1PF9', 2311, -1300], ['LCR1OU9H34K19OE', -160, -2300],
  ['LCRHJHOFQNL1PHP', 1489, -1600], ['LCR12NU45AM12BB', -1563, -1600], ['LCR11JA67NJ15N3', -2400, -1300],
  ['LCRO4M7LH5L1QOO', -2392, -1300], ['LCRVT5V0BDO1HLF', 2508, -1300], ['LCR11DNA3EL10TD', -2443, -1300],
  ['LCR111KI08O1HLB', -2501, -1300], ['LLI334UG2UD1IKQ', 2358, -1300], ['LCR10K0NLRK1GKE', 2390, -1300],
  ['LLI32HBOUTD1GQV', 2438, -1300], ['LCR1664750O1D23', 1242, -1600], ['LCRHSGTEION115H', 2080, -1300],
  ['LIFN3FI0TNU10PS', -2190, -1400], ['LIF1SGGD7EU12T5', 1074, -1400], ['LIF1609JRKV151E', 1859, -1400],
  ['LIF15S7VPRV1DIP', 283, -1500], ['LIFMGTCIQGU13TS', 2478, -1150], ['LIFN5CQH1OU1P61', -1900, -1400],
  ['LHV1BIOIL142P25', 2657, -1300], ['LHV3ISF18352QIP', -2427, -1300], ['LHV17CFO5V327AJ', 2262, -1300],
  ['LHVHP2BJI652O9S', 2328, -1300], ['LHV1FUFU9442AKR', 2333, -1300], ['LHV2JBHA9152QAS', -2722, -1300],
  ['LA9KL58B1D82CDV', -2390, -1300], ['LA9KKVJDTC829U8', 2428, -1300], ['LA9KL68C1D825IA', -2462, -1300],
  ['LA9T11KPMD82B1S', -2372, -1300], ['LA9GLRKMQF82961', 2440, -1300], ['LA961CLV4G8252G', -2405, -1300],
  ['LA9BSVRN5I82JIQ', 2406, -1300], ['LA9L02KJ2D829LS', 2325, -1300], ['LUV1V6AR27G26QO', 2599, -1300],
  ['LUVTKR868NF27QG', -2459, -1300], ['LUVQMVII88F2O29', 2468, -1300], ['LUVL8CLKD5F2TNB', 2310, -1300],
  ['LUVUVJBM5DF2UR6', -2484, -1300], ['LUVL2G4TQ7F2L1T', -1213, -1300], ['LUVMBSKJQ5F289H', -2296, -1300],
  ['LUVNUGNGN5F2BOT', 2270, -1300], ['LUVCMP7BM7F2JET', -495, -1300], ['LIFE9GRB8S62L1H', 695, -1300],
  ['LIFQMHF4MT72V9Q', 2389, -1300], ['LIF16SBFB972GLK', 2400, -1300], ['LIF14KB3T872MAH', 470, -1300],
  ['LIF1AQ6CK972734', -305, -1300], ['LIFCLLMITT727LH', 2418, -1300], ['LIF18TO5NB72AMR', 2522, -1300],
  ['LIFR3G1FFE72K0S', -2401, -1300], ['LTJ103NK29K1TNJ', 834, -1300], ['LTJ112E9DIO1BPE', 2335, -1300],
  ['LTJ13ELOLPQ1DP3', -2388, -1300], ['LLI599R12JI1216', 2488, -1300], ['LLI57EKC2HI1EH8', 2395, -1300],
  ['LIFIEGBN9E72ILT', 2397, -1300], ['LIF16PJS9972LC8', 2331, -1300], ['LIF153KDV872SE5', -2318, -1300],
  ['LIF7SHGS3E72T8L', 2414, -1300], ['LIFVTRAAJE72GHD', -2315, -1300], ['LIF16GDJ89724E3', 2435, -1300],
  ['LIF16IHL8972EAC', -2381, -1300],
]);

/** The imported index key (G...) for a source location tsid (L...). */
export function indexTsid(sourceTsid) {
  const t = String(sourceTsid || '');
  return t.startsWith('L') ? `G${t.slice(1)}` : t;
}

/**
 * player.js teleportHome: choose_one(config.newxp_exits). `exists(tsid)`
 * filters to imported streets; `left` is the street's bounds.l so the
 * source x becomes a screen x (the source y drops you in from above).
 */
export function pickNewxpExit(rng = Math.random, exists = () => true) {
  const rows = NEWXP_EXITS.filter(([tsid]) => exists(indexTsid(tsid)));
  if (!rows.length) return null;
  const [tsid, x, y] = rows[Math.min(rows.length - 1, Math.floor(rng() * rows.length))];
  return { sourceTsid: tsid, tsid: indexTsid(tsid), x, y };
}

/* ------------------------------------------------------------------ */
/* Save                                                                 */
/* ------------------------------------------------------------------ */

/**
 * The island steps in source order. After the bags (buy_two_bags
 * onComplete_custom) the player goes home: newbie_island.js street4_check
 * holds Progress Way ("Not so fast — head home first …") until
 * leave_gentle_island is accepted, and home.js offers that quest only after
 * the Magic Rock's Skill Learning Brain talk on the home street
 * (is_postnewxp, magic_rock.js give-skill-learning / check-sidestreets /
 * remind-img, home.js giveQuests).
 */
export const ISLAND_STEPS = Object.freeze(['arrive', 'quest_given', 'bags_done', 'go_home', 'home_done', 'leaving', 'exited']);

/**
 * The original client's quest progress popup line (QuestQueue.as
 * handleNextThingInQueue 152-158, for GSJS quest.js announceStateChange
 * 798-829 quest_req_state): the quest's title, then the requirement's desc
 * with " (got/need)" when it needs more than one.
 */
export function questQueueLine(title, desc, got, need) {
  const n = Math.max(0, Math.floor(Number(need) || 0));
  const g = Math.max(0, Math.min(n || Infinity, Math.floor(Number(got) || 0)));
  return { title: String(title || 'Quest Update'), line: n > 1 ? `${desc} (${g}/${n})` : String(desc) };
}

/** newbie_island.js hitBox street4_check: null (pass), 'noBags' (back 250) or 'notSoFast' (back 150). */
export function street4Check(island, bagsDone) {
  if (island === 'leaving' || island === 'exited') return null;
  return bagsDone ? 'notSoFast' : 'noBags';
}

/** The Gentle Island Exit box only fires once leave_gentle_island is accepted. */
export function islandExitOpen(island) {
  return island === 'leaving';
}

export function normalizeNewxpSave(seed = {}) {
  const s = seed && typeof seed === 'object' ? seed : {};
  const status = ['off', 'active', 'done', 'skipped'].includes(s.status) ? s.status : 'off';
  const stage = STAGES.includes(s.stage) ? s.stage : 'clouds';
  return {
    v: NEWXP_SAVE_VERSION,
    status,
    stage,
    name: String(s.name || '').replace(/[<>]/g, '').trim().slice(0, 19),
    upgrades: Array.isArray(s.upgrades) ? s.upgrades.filter((id) => NEWXP_UPGRADES[id]) : [],
    homeStyle: ['meadow', 'firebog', 'uralia'].includes(s.homeStyle) ? s.homeStyle : '',
    skill: firstSkill(s.skill)?.id || '',
    island: ISLAND_STEPS.includes(s.island) ? s.island : 'arrive',
    exit: s.exit && typeof s.exit === 'object' && typeof s.exit.tsid === 'string' ? { tsid: s.exit.tsid, x: Number(s.exit.x) || 0 } : null,
    flags: Array.isArray(s.flags) ? [...new Set(s.flags.filter((f) => ISLAND_FLAGS.includes(f)))] : [],
    musicblock: ISLAND_MUSICBLOCKS.includes(s.musicblock) ? s.musicblock : '',
    leftAt: Number.isFinite(s.leftAt) ? s.leftAt : 0,
    startedAt: Number.isFinite(s.startedAt) ? s.startedAt : 0,
    doneAt: Number.isFinite(s.doneAt) ? s.doneAt : 0,
  };
}

/** Begin (or restart) the tutorial at a stage. */
export function startNewxp(save, stage = 'clouds', now = Date.now()) {
  const next = normalizeNewxpSave(save);
  next.status = 'active';
  next.stage = STAGES.includes(stage) && stage !== 'done' ? stage : 'clouds';
  if (next.stage === 'clouds') {
    next.upgrades = [];
    next.flags = [];
    next.musicblock = '';
    next.island = 'arrive';
    next.exit = null;
    next.leftAt = 0;
  }
  next.startedAt = now;
  return next;
}

/** The stage after `stage` (EZ Cooking has no practice street: skill goes straight to the island). */
export function nextStage(stage) {
  const i = STAGES.indexOf(stage);
  return i < 0 || i >= STAGES.length - 1 ? 'done' : STAGES[i + 1];
}

/** Whether a reload should resume the tutorial (QA routes never do). */
export function shouldResume(save, params = {}) {
  if (params.fresh || params.resetgame) return false;
  return save?.status === 'active';
}

/** Bottom-centre box hit (street boxes: x ± w/2, y - h .. y). */
export function inBox(box, x, y) {
  if (!box) return false;
  return x >= box.x - box.w / 2 && x <= box.x + box.w / 2 && y >= box.y - box.h && y <= box.y + 4;
}

/**
 * An archived street hitbox (street4_check, gentle_island_exit) against the
 * avatar's body: the client tested the avatar's box, not its feet. Progress
 * Way's floor under street4_check sits 5-9 px below the box bottom (944-963),
 * so a feet-only test never fired there.
 */
export const AVATAR_BODY_H = 100;
export function inHitBox(box, x, y, bodyH = AVATAR_BODY_H) {
  if (!box) return false;
  return x >= box.x - box.w / 2 && x <= box.x + box.w / 2 && y >= box.y - box.h && y - bodyH <= box.y;
}

/* ------------------------------------------------------------------ */
/* Scene layouts (rebuilt; remake pixels, y down, y = walking surface)  */
/* ------------------------------------------------------------------ */

const plat = (id, x1, y1, x2, y2 = y1, style = 'invisible', extra = {}) => ({ id, x1, y1, x2, y2, style, ...extra });

/**
 * The Cloud Level's words: Tiny Speck's white lettering, one deco per word
 * (newxp_cloud.swf newxptext_*, CC0; the art is the words, so no copy is
 * written here). Four phrases, each on its own cloud, in the order and line
 * breaks of the recording K2q5GXruLvE (0:47-1:22) and the Snap "Cloud Intro"
 * (PIF5BPPLOK535TE 57976). Each row is [word, dx, dy, degrees, scale]: the
 * word's centre from the phrase's anchor (its centre x, the cloud's walking
 * line), measured off the recording at its 0.52 view scale (every word at its
 * stage size but "YOU." and LET'S GO!). Placement is reconstructed: the
 * template that placed them is lost.
 */
export const CLOUD_WORDS = Object.freeze({
  eleven: [
    ['the', -225, -285, 3], ['eleven', -98, -279, 0], ['giants', 63, -287, -1], ['who', 208, -281, -1],
    ['thought', -165, -229, -1.5], ['and', -12, -223, -2], ['sang', 104, -225, 3], ['and', 225, -223, -2.5],
    ['imagined', -160, -173, 0], ['everything', 73, -173, 1.5],
    ['into', -217, -131, -0.5], ['existence_ellipses', -42, -127, 1.5],
  ],
  lucky: [
    ['ellipses', -212, -250, 0], ['these', -131, -258, 0.5], ['giants', 24, -263, 0.5], ['are', 166, -263, 0.5],
    ['sometimes', -110, -208, 0], ['lucky', 94, -210, -0.5],
    ['enough', -152, -158, 0], ['to', -15, -162, 0], ['imagine', 104, -162, -1],
    ['someone', -133, -110, 0], ['like', 40, -96, -3], ['you_period', 171, -94, 2, 1.17],
  ],
  imagination: [
    ['you', -192, -265, -0.5], ['have', -71, -273, -1.5], ['your', 60, -283, -1.5], ['own', 187, -290, 0.5],
    ['imagination_comma', -121, -221, -3], ['and', 85, -233, -5], ['you', 194, -237, -2],
    ['can', -183, -173, -5], ['help', -73, -177, -5], ['grow', 63, -187, -1], ['and', 190, -185, -6],
    ['shape', -137, -123, -1], ['this', -10, -129, 0.5], ['world_period', 123, -135, -3],
  ],
  go: [['lets', -92, -156, -0.5, 2], ['go_exclamation', 106, -154, -2, 2]],
});
/** The deco a CLOUD_WORDS row draws. */
export const cloudWordDeco = (word) => `newxptext_${word}`;
/**
 * The stone GLITCH letters on the first cloud (newxp_cloud.swf
 * newxp_glitchlogo_stone_*, CC0): [letter, dx from the l, base below the
 * walking line, ms after landing that it lightens]. Measured off
 * K2q5GXruLvE 0:31-0:41: the letters are unlit (the _dark decos) when you
 * land and lighten one by one from the middle out; the timing is
 * reconstructed from the recording.
 */
export const CLOUD_LETTERS = Object.freeze([
  ['g', -240, 106, 2200], ['l', 0, 112, 0], ['i', 114, 90, 300], ['t', 227, 119, 600], ['c', 368, 88, 1600], ['h', 542, 194, 3000],
]);
export const cloudLetterDeco = (c, dark = false) => (dark
  ? (c === 'g' ? 'newxp_glitchlogo_stone_g_dark01a' : `newxp_glitchlogo_stone_${c}_dark_01a`)
  : `newxp_glitchlogo_stone_${c}_01a`);
/** locations/inc_geo.js geo_deco_toggle_visibility: a deco fades in over 400 ms unless told otherwise. */
export const CLOUD_WORD_FADE_MS = 400;
/** One word after another, about three a second (K2q5GXruLvE 0:47-0:50, 0:57-0:60): reconstructed. */
export const CLOUD_WORD_STAGGER_MS = 300;
export const CLOUD_LETTER_FADE_MS = 1000;

/**
 * newxp_intro: the Cloud Level (geo jump x 32, y -4171: you start high up).
 * As the recording has it: you wait above a cloud ceiling with Tiny Speck's
 * chain hanging under it (items/newxp_chain.js: pull broadcasts the location
 * event "glitch"); pulling it drops you onto the first cloud and the stone
 * GLITCH letters; from there each cloud ends in a drop onto a lower one, and
 * each holds one phrase, its words appearing as you reach it; LET'S GO! is
 * on the last, and walking off it falls through to Training Level One.
 * Terraces, drop heights and the trigger spots are rebuilt from the
 * recording (the template is lost); a phrase starts to appear where you
 * land on its cloud (`box`, just past the edge above), so it is whole
 * before you walk past it. Each lower cloud starts under the end of
 * the one above, so a step off always lands; a wall at its left end keeps
 * you from walking off backwards.
 */
export function cloudsLayout() {
  const W = 5400;
  const H = 4200;
  const PERCH = 210;
  const terraces = [
    { id: 'cloud_1', x1: 0, x2: 1250, y: 1400 },
    { id: 'cloud_2', x1: 950, x2: 2350, y: 1950, phrase: 'eleven', at: 1700, box: 1260 },
    { id: 'cloud_3', x1: 2050, x2: 3350, y: 2500, phrase: 'lucky', at: 2760, box: 2360 },
    { id: 'cloud_4', x1: 3050, x2: 4350, y: 3050, phrase: 'imagination', at: 3760, box: 3360 },
    { id: 'cloud', x1: 4050, x2: 5000, y: 3600, phrase: 'go', at: 4580, box: 4360 },
  ];
  return {
    width: W,
    height: H,
    cloudY: terraces[0].y,
    spawn: { x: 520, y: PERCH - 10 },
    // Hidden in the ceiling: the avatar waits here until the chain is pulled.
    perch: { id: 'perch', x1: 440, x2: 600, y: PERCH },
    ceilingY: 300,
    // The chain hangs where you fall (K2q5GXruLvE 0:12-0:24); top of its 58 x 505 frame.
    chain: { x: 520, top: 18, w: 58, h: 505 },
    terraces,
    letters: { x: 390, y: terraces[0].y },
    platforms: [
      plat('perch', 440, PERCH, 600, PERCH),
      ...terraces.map((t) => plat(t.id, t.x1, t.y, t.x2, t.y, 'cloud')),
      plat('below', 5010, H - 30, W, H - 30),
    ],
    walls: [],
    barriers: [
      { id: 'cloud_back', x: 30, y: terraces[0].y - 600, h: 600, pc_perm: null },
      ...terraces.slice(1).map((t) => ({ id: `back_${t.id}`, x: t.x1 + 10, y: t.y - 440, h: 440, pc_perm: null })),
    ],
    // Falling past this line (beyond the last cloud's edge) lands in training1.
    dropX: 5010,
    dropY: terraces.at(-1).y + 120,
  };
}

/**
 * newxp_training1: source x + 1500, y + 1720 (floor -119 -> 1601).
 * Mushroom caps are within the newxp default jump (apex 55); the islands up
 * to the door need High Jumper I (apex 90); wall1 waits for Walk Speed I.
 */
export function training1Layout() {
  const FLOOR = 1600;
  const islands = [
    plat('cap1', 2330, 1564, 2420, 1564, 'mushroom'),
    plat('cap2', 2450, 1528, 2540, 1528, 'mushroom'),
    plat('cap3', 2570, 1492, 2660, 1492, 'mushroom'),
    plat('isle_a', 2390, 1420, 2540, 1420, 'grass', { art: 'floatingplatform_green_small_01a_newxpblack' }),
    plat('isle_b', 2220, 1350, 2380, 1350, 'pool', { art: 'floatingplatform_blue_small_01a_newxpblack' }),
    plat('isle_c', 1990, 1280, 2150, 1280, 'red', { art: 'floatingplatform_red_small_01a_newxpblack' }),
    plat('tree_d', 2180, 1210, 2340, 1210, 'branch', { tree: true }),
    plat('tree_e', 2380, 1140, 2520, 1140, 'branch', { tree: true }),
    plat('top', 2380, 760, 3150, 760, 'grass', { art: 'floatingplatform_green_medium_01a_newxpblack' }),
  ];
  return {
    width: 3200,
    height: 1700,
    floorY: FLOOR,
    spawn: { x: 174, y: 300 },
    platforms: [plat('floor', 0, FLOOR, 3200, FLOOR, 'stars'), ...islands],
    ladders: [{ id: 'ladder', x: 2480, yTop: 760, yBot: 1140 }],
    barriers: [
      { id: 'wall1', x: 1750, y: FLOOR - 400, h: 400, pc_perm: null },
      { id: 'left', x: 40, y: FLOOR - 900, h: 900, pc_perm: null },
    ],
    flamingo: { x: 517, y: FLOOR },
    flyaway: 517 + 900,
    mushroom: { x: 2224, y: FLOOR },
    walkCoin: { maxX: 1630, y: FLOOR - 46 },
    jumpCoin: { x: 2615, y: 1462 },
    afterJumpCoin: { x: 2730, y: FLOOR },
    ladderCoin: { x: 2480, y: 950 },
    sloth: { x: 2121, y: 1080, peekBox: { x: 2300, y: 1350, w: 160, h: 200 } },
    doorway: { x: 2714, y: 760 },
    door: { x: 2600, y: 760 },
    tube: { x: 3000, y: 760, box: { x: 3000, y: 760, w: 120, h: 140 } },
    boxes: {
      pre_pickup_walk: { x: 900, y: FLOOR, w: 80, h: 300 },
      jumpInstructions: { x: 2250, y: FLOOR, w: 200, h: 300 },
      spacebarPlusArrows: { x: 2615, y: 1492, w: 200, h: 200 },
      upDownForLadders: { x: 2450, y: 1140, w: 160, h: 120 },
      at_door: { x: 2700, y: 760, w: 300, h: 200 },
    },
  };
}

/**
 * newxp_training2: source x + 3000, y + 1510 (floor -110 -> 1400).
 * location_targets map straight across; the walls and the Egg Plant ledges
 * are rebuilt from the playthrough.
 */
export function training2Layout() {
  const FLOOR = 1400;
  const X = (sx) => sx + 3000;
  return {
    // 5600 wide (was 4100): each style station is a Tiny Speck tube, target, board and picture (530 px),
    // and the Magic Rock's ledge stands past them, as the recording has it (K2q5GXruLvE 7:56-8:20).
    width: 5600,
    height: 1500,
    floorY: FLOOR,
    spawn: { x: X(-2776), y: 500 },
    platforms: [
      plat('floor', 0, FLOOR, 5600, FLOOR, 'stars'),
      // The Egg Plant's climb as the recording shows it (K2q5GXruLvE 6:44-7:16): red, blue, then
      // the green ledge; the Magic Rock on a red ledge past a yellow step, beyond the stations (7:58-8:20).
      plat('egg_p1', 2600, 1325, 2720, 1325, 'grass', { art: 'floatingplatform_red_small_01a_newxpblack' }),
      plat('egg_p2', 2740, 1250, 2860, 1250, 'pool', { art: 'floatingplatform_blue_small_01a_newxpblack' }),
      plat('egg_p3', 2880, 1175, 3000, 1175, 'red', { art: 'floatingplatform_yellow_small_01a_newxpblack' }),
      plat('egg_ledge', 3020, 1100, 3250, 1100, 'grass', { art: 'floatingplatform_green_medium_01a_newxpblack' }),
      plat('rock_step', 5200, 1330, 5310, 1330, 'grass', { art: 'floatingplatform_yellow_small_01a_newxpblack' }),
      plat('rock_ledge', 5340, 1260, 5490, 1260, 'grass', { art: 'floatingplatform_red_medium_01a_newxpblack' }),
    ],
    ladders: [],
    barriers: [
      { id: 'left', x: 40, y: FLOOR - 900, h: 900, pc_perm: null },
      { id: 'wall_to_drinks', x: 1760, y: FLOOR - 500, h: 500, pc_perm: null },
      { id: 'wall_to_eggplant', x: 2260, y: FLOOR - 500, h: 500, pc_perm: null },
      { id: 'tube_building', x: 3300, y: FLOOR - 800, h: 800, pc_perm: null },
    ],
    dustbunny: {
      initial: X(-2460), table1a: X(-1603), table1b: X(-1451), table2a: X(-1092), table2b: X(-856),
      eggs1: X(-607), eggs2: X(-191), building: 3180, y: FLOOR, // source building 644 sits behind the tube wall here
    },
    tables: { food: { x: 1470, y: FLOOR }, drinks: { x: 1968, y: FLOOR } },
    items: {
      food_2: { x: X(-1475), y: FLOOR - 76 },
      food_3: { x: X(-1584), y: FLOOR - 76 },
      drink_1: { x: X(-1096), y: FLOOR - 70 },
      drink_2: { x: X(-1031), y: FLOOR - 70 },
      drink_3: { x: X(-967), y: FLOOR - 70 },
    },
    quoins: {
      img_pickup_1: { x: 1100, y: FLOOR - 46 },
      img_pickup_egg_a: { x: 2800, y: 1214 },
      img_pickup_egg_b: { x: 2940, y: 1139 },
    },
    eggPlant: { x: X(57) + 60, y: 1100 }, // source trant_egg x 57 (+60 onto the rebuilt ledge)
    rock: { x: 5415, y: 1260 },
    // Panel words: the machine's verb names, items/homestreet_ticket_dispenser.js 112, 78, 44.
    // One station per style, as the recording has them (K2q5GXruLvE 7:36-7:56): a holey tube over a
    // target ring, the CHOOSE <STYLE> STYLE board and the style's picture. You stand on the ring.
    machine: { x: 4240, y: FLOOR, choices: [
      { style: 'meadow', label: 'Pick Meadow Style', x: 3700 },
      { style: 'firebog', label: 'Pick Firebog Style', x: 4240 },
      { style: 'uralia', label: 'Pick Uralia Style', x: 4780 },
    ] },
    boxes: {
      to_food: { x: 1300, y: FLOOR, w: 80, h: 300 },
      leave_food: { x: 1720, y: FLOOR, w: 60, h: 300 },
      to_drink: { x: 1800, y: FLOOR, w: 60, h: 300 },
      leave_drink: { x: 2230, y: FLOOR, w: 50, h: 300 },
      dustbunny_egg: { x: 2400, y: FLOOR, w: 80, h: 300 },
      magicrock_reveal: { x: 5000, y: FLOOR, w: 120, h: 300 },
      magicrock_talk: { x: 5415, y: 1260, w: 200, h: 140 },
    },
  };
}

/* ------------------------------------------------------------------ */
/* Gentle Island scripts (newbie_island.js and the six streets' events) */
/* ------------------------------------------------------------------ */

/** newbie_island.js instance_me per street (the location XML's instance_me). */
export const ISLAND_INSTANCE = Object.freeze({
  [GENTLE_ISLAND.surveyors_stroll]: 'NB_Street1',
  [GENTLE_ISLAND.high_jumpers_gully]: 'NB_Street2',
  [GENTLE_ISLAND.progress_way]: 'NB_Street3',
  [GENTLE_ISLAND.exit]: 'NB_Street4',
  [GENTLE_ISLAND.diversionary_path]: 'NB_Side_Street1',
  [GENTLE_ISLAND.doonboggle_trail]: 'NB_Side_Street2',
});

/**
 * Island copy, exact from the source (announce_vog_fade text uses '//' for
 * pages; the client's [[class=…]] css prefix is dropped).
 */
export const ISLAND_LINES = Object.freeze({
  // LA952QGCH3D31E2.xml events crazy / crazy2 (pc_vog).
  crazy: 'Look - a Qurazy Quoin!',
  crazy2: 'You can find Qurazy Quoins as you explore the world. They give you imagination!',
  // newbie_island.js upgradeConfirmed / revealMappery2 / calloutMap.
  mappery: 'Mappery is the full package: it comes with everything …//… a minimap showing your current location …',
  mappery2: '… and a big ol’ area map which lets you set destinations and get directions.',
  mapperyActivity: 'Click on the street “Progress Way” and set it as your destination.',
  camera_mode: 'Press the ‘C’ key to enter Camera Mode, then use the arrow keys to peek around your current location.',
  zoomability: 'Use the + and - keys to zoom in and out. The 0 (zero) key will reset you to normal zoom level.',
  encyclopeddling: 'O, what mystical new power of insight is this!?//Now you can press the "i" key at any time to tap directly into the great Encyclopedia.',
  // LA93VBH3H3D38HF.xml explain_upgrades (pc_vog), then callout_upgrades opens the menu.
  explainUpgrades: 'Oh right! Upgrades! You are now free to choose them whenever you wish.//There’s a special cloud for it in the Imagination menu …',
  // items/street_spirit_groddle.js song_lines (singTo) and onPlayerCollision on NB_Street3.
  song: [
    '♫ … my milkshake brings all the boys to the yard … ♫',
    '♫ … and they’re like •  it’s better than yours … ♫',
    '♫ … damn right •  it’s better than yours … ♫',
    '♫ … I could teach you, but I’d have to charge … ♫',
  ],
  spiritOh: '<b style="font-size:30px">Oh!</b><split butt_txt="Oh?">This is embarrassing! I thought I was alone!<split butt_txt="It’s OK">Well, anyway, {name}, if you are looking for bags on the cheap, I am your girl. Come BUY from me if you need bags!',
  // players/inc_newxp.js newxpReturnToGentleIsland (return_to_gentle_island overlay).
  returnToIsland: 'Though you are on your own now, you are not really alone.//You should find that the other players are pretty helpful, so if you have any questions, just ask.',
});

/**
 * Which upgradeConfirmed lines describe something the remake has. Zoom and
 * the Encyclopedia were never rebuilt, so those cards are granted silently
 * rather than teaching a key that does nothing.
 */
export const ISLAND_CONFIRM = Object.freeze({
  mappery: 'mappery',
  camera_mode: 'camera_mode',
});

/** Source coordinates (x, y from the street's bounds) to remake street pixels. */
export function sourceToStreet(bounds, x, y) {
  return { x: x - (bounds?.l ?? 0), y: y - (bounds?.t ?? 0) };
}

/**
 * The island quoins that carry a location_event_id (newbie_island.js
 * playerEnterCallback). NB_Street2's two are matched by their source x, y;
 * the Qurazy markers on NB_Street1 and NB_Street4 were instance items that
 * were not archived, so their spots are rebuilt (`rebuilt`, street pixels).
 */
export const ISLAND_QUOINS = Object.freeze([
  { id: 'qurazy_stroll', tsid: GENTLE_ISLAND.surveyors_stroll, type: 'qurazy', event: 'mappery_upgrade', rebuilt: { x: 2620, above: 60 } },
  { id: 'zoom_upgrade', tsid: GENTLE_ISLAND.high_jumpers_gully, type: 'xp', event: 'zoom_upgrade', source: { x: -1135, y: -1322 } },
  { id: 'other_upgrade', tsid: GENTLE_ISLAND.high_jumpers_gully, type: 'xp', event: 'other_upgrade', source: { x: 122, y: -1288 } },
  { id: 'qurazy_exit', tsid: GENTLE_ISLAND.exit, type: 'qurazy', event: 'explain_upgrades', rebuilt: { x: 3000, above: 60 } },
]);

/**
 * Hint signs: groddle_sign_blank decos whose sign_txt the client printed
 * (G*.xml), keyed by the deco id the street events show and hide. Each sign
 * is two stacked decos (a mud backing and the face); the text sits on the
 * face, `face: true`.
 */
export const ISLAND_SIGNS = Object.freeze({
  // High Jumper's Gully: spinach_hint_on / spinach_hint2_on.
  groddle_sign_blank_1343929965175: { text: 'Activating Spinach helps you jump Really High!', face: true },
  groddle_sign_blank_1343929965176: { text: 'Activating Spinach helps you jump<br> Really High!' },
  groddle_sign_blank_1343176167389: { text: 'Click Spinach. Activate. Juuuuump!', face: true },
  groddle_sign_blank_1343176167390: { text: 'Click Spinach. Activate. Juuuuump!' },
  // Diversionary Path: butterfly_msg_on.
  groddle_sign_blank_1343260081007: { text: 'Jump and hit the enter key while in the air to get flying butterflies', face: true },
  groddle_sign_blank_1343260081008: { text: 'Jump and hit the enter key while in the air to get flying butterflies' },
  // Doonboggle Trail: musicblock_msg_on / musicblock_msg2_on.
  groddle_sign_blank_1343169537341: { text: 'Musicblocks are collectible. They let you play music for yourself, and others.', face: true },
  groddle_sign_blank_1343260081002: { text: 'Musicblocks are collectible. They let you play music for yourself, and others.' },
  groddle_sign_blank_1343260081003: { text: 'Go ahead and give it a try!', face: true },
  groddle_sign_blank_1343260081004: { text: 'Go ahead and give it a try!' },
  // Progress Way: butterfly_lotion_msg_on / butterfly_msg_on.
  groddle_sign_blank_1342730285889: { text: 'Lotion helps you massage butterflies', face: true },
  groddle_sign_blank_1343260081005: { text: 'Lotion helps you massage butterflies' },
  groddle_sign_blank_1342730285890: { text: 'Jump and hit the enter key while in the air to get flying butterflies', face: true },
  groddle_sign_blank_1343260081006: { text: 'Jump and hit the enter key while in the air to get flying butterflies' },
});

/**
 * The Collision-triggered Event Boxes that fired the island's sign events
 * were instance items, and none was archived. Rebuilt in front of the sign
 * each one shows (street pixels, bottom-centre boxes like the street boxes).
 * `unlessAk`: the source sets has_ak for players with Animal Kinship, which
 * the butterfly events exit on.
 */
export const ISLAND_EVENT_BOXES = Object.freeze([
  { tsid: GENTLE_ISLAND.surveyors_stroll, event: 'crazy', x: 2250, y: 1010, w: 260, h: 500 },
  { tsid: GENTLE_ISLAND.high_jumpers_gully, event: 'spinach_hint_on', x: 1410, y: 1930, w: 520, h: 400 },
  { tsid: GENTLE_ISLAND.diversionary_path, event: 'butterfly_msg_on', x: 3570, y: 1080, w: 420, h: 500, unlessAk: true },
  { tsid: GENTLE_ISLAND.doonboggle_trail, event: 'musicblock_msg_on', x: 1010, y: 1080, w: 420, h: 400 },
  { tsid: GENTLE_ISLAND.progress_way, event: 'butterfly_lotion_msg_on', x: 643, y: 1100, w: 360, h: 400, unlessAk: true },
  { tsid: GENTLE_ISLAND.progress_way, event: 'butterfly_msg_on', x: 1178, y: 1080, w: 360, h: 400, unlessAk: true },
]);

/** newbie_island.js playerEnterCallback NB_Side_Street2: choose_one of these at (-988, -467). */
export const ISLAND_MUSICBLOCKS = Object.freeze([
  'musicblock_b_brown_01', 'musicblock_b_brown_02', 'musicblock_b_brown_03', 'musicblock_b_brown_04', 'musicblock_b_brown_05',
  'musicblock_d_blue_01', 'musicblock_d_blue_02', 'musicblock_d_blue_03', 'musicblock_d_blue_04', 'musicblock_d_blue_05',
  'musicblock_d_green_01', 'musicblock_d_green_02', 'musicblock_d_green_03', 'musicblock_d_green_04', 'musicblock_d_green_05',
  'musicblock_d_red_01', 'musicblock_d_red_02', 'musicblock_d_red_03', 'musicblock_d_red_04', 'musicblock_d_red_05',
  'musicblock_x_shiny_01', 'musicblock_x_shiny_02', 'musicblock_x_shiny_03', 'musicblock_x_shiny_04', 'musicblock_x_shiny_05',
]);
export const ISLAND_MUSICBLOCK_AT = Object.freeze({ x: -988, y: -467 });
/** The Gameshow Ticket stand on High Jumper's Gully (deco newxp_gameshow_ticket_stand_01a, source x, y). */
export const ISLAND_TICKET_AT = Object.freeze({ x: 656, y: -1247 });
/** street_spirit_groddle.js: apiSetHitBox(160, 400) while singing, a line every 3750 ms. */
export const SPIRIT_SING = Object.freeze({ everyMs: 3750, hitW: 160, hitH: 400, lockMs: 2000 });

/** Persistent island flags (once per save, as the source's per-instance flags were once per island). */
export const ISLAND_FLAGS = Object.freeze([
  'mappery_upgrade', 'zoom_upgrade', 'other_upgrade', 'explain_upgrades', 'cray', 'currants_revealed',
  'musicblock', 'garden', 'gst', 'spirit_sang', 'spinach_hint_off_called', 'spinach_hint2_off_called',
  'musicblock_msg_off_called', 'butterfly_lotion_msg_off_called', 'butterfly_msg_off_called', 'returned',
]);

/** The island event boxes on one street. */
export function islandBoxesFor(tsid) {
  return ISLAND_EVENT_BOXES.filter((b) => b.tsid === tsid);
}
