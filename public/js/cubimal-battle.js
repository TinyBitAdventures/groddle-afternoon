/**
 * Cubimal battles (register G40): the rules every Cubimal figure carries in
 * GameServerJS npc_cubimal_base, line numbers from items/npc_cubimal_chick.js
 * (the 43 Series 1 and 2 figures share them; npc_cubimal_factorydefect_chick.js
 * has no battle verbs, and npc_combat_cubimal.js, "testing cubimal combat
 * idea", is the same code on a test class nothing spawns).
 *
 * The verbs (in_pack, no conditions): Panache (battle) paper_battle 112,
 * Wile (battle) scissors_battle 234 and Gumption (battle) battle 282, each
 * "Battle against another cubimal to level up". The figure leaves the pack
 * and is set down at its owner's feet (apiPutItemIntoPosition, pc.x, pc.y)
 * with CUBIMAL_WIND_UP, its Ego (H) the figure's health. One second later
 * search 994 looks on the street for another player's figure set down to
 * fight, not done fighting, within 450 px and reachable on foot, and pairs
 * the two ("<owner>'s <label> VS. <owner>'s <label>" to the street). With
 * none it says "Come at me, Bro!" and waits on the ground, where the next
 * figure set down to fight will find it; its owner may pick it up meanwhile
 * (canPickup 525: nobody else may, and nobody once it has an opponent).
 *
 * A fight (onBattleStart 696, onBattleLoop 673, checkWin 536, taunt 1065):
 * the one that searched strikes first, then they take turns. A strike picks
 * an insult by a roll of randInt(level, level + 3 + mod) (18 to 21 + mod from
 * level 18), with a 1 in 10 chance (1 in 12 from level 10) of "*choke*",
 * which does no harm. The insult shows for 920 ms ("No, " in front when it
 * repeats the opponent's last one), and unless it choked the opponent's Ego
 * drops by a second roll in the same range, or by half the first roll
 * (rounded up) when both said the same thing. The striker runs at the
 * opponent (speed 150, stopping 40 px short), and 700 ms later (1400 ms on
 * the first strike, when both shout their style, "Gumption!", "Panache!" or
 * "Wile!") walks back (speed 100) to its own side of the middle, 50 px from
 * it. With the opponent's Ego above 0 both owners read "<label>'s Ego
 * remaining: N" and 1500 ms later the opponent strikes back. At 0: "<owner>'s
 * <label> defeated <owner>'s <label>" to the street, a smoke puff
 * (PROTO_PUFF) on the loser, which goes back to its pack, and a second later
 * the winner earns ten experience points for each of the loser's levels:
 * at next_level_amount it goes up a level (that amount x 2.2 next time, the
 * rest carried over, two more Ego), with a "LEVEL n!" bubble, else "+Nxp!",
 * and four seconds after that it goes home too. Tottly's Toys gets 1 for the
 * win and 1 more for a level (makeWinner 645-671). Labels are getLabel 580:
 * the figure's name (or its kind), " Lvl.", its level.
 *
 * Styles, as written (getType 591): Gumption beats Wile (+1 to the roll's
 * top), Panache beats Gumption, Wile beats Panache; the losing side of each
 * gets -1, except that the source's table has no row for Panache against
 * Wile (0 there). In the source the Panache and Gumption verbs stored their
 * letter as this.style while getType and the first-strike shouts read
 * this.type (only Wile set it), so only Wile ever shouted and the table never
 * applied; the remake gives each verb its own letter, as the verbs' names
 * and the shouts mean (register G40 notes the choice).
 *
 * The remake keeps each figure's level and experience with that figure (its
 * copy's words in js/tools.js, beside its name: the source's instance props
 * level, xp, next_level_amount and health travel with the item), from which
 * its Ego and next level follow. Who fights whom and every roll is the
 * realtime server's (groddle-afternoon-server cubimal_battle.go, from
 * data/cubimal_battle.json, which tools/build-realtime-cubimal-battle.mjs
 * writes from this file). Solo has no other player's figure, so it does what
 * the source does on a street with none: "Come at me, Bro!", and the figure
 * waits until picked up.
 */

import { cubimalArticle, cubimalInfo, isCubimal } from './cubimals.js?v=bea49c0b';

export const CUBIMAL_BATTLE = Object.freeze({
  /** Verb order as the source file lists them (all sort_on 50). */
  styles: Object.freeze(['p', 's', 'r']),
  verbs: Object.freeze({
    p: Object.freeze({ id: 'cubimal_battle_p', label: 'Panache (battle)', shout: 'Panache!', source: 'paper_battle 112' }),
    s: Object.freeze({ id: 'cubimal_battle_s', label: 'Wile (battle)', shout: 'Wile!', source: 'scissors_battle 234' }),
    r: Object.freeze({ id: 'cubimal_battle_r', label: 'Gumption (battle)', shout: 'Gumption!', source: 'battle 282' }),
  }),
  tooltip: 'Battle against another cubimal to level up',
  /** initInstanceProps 27-34. */
  base: Object.freeze({ level: 1, xp: 0, next: 10, health: 10 }),
  /** makeWinner 645-671. */
  healthPerLevel: 2,
  nextFactor: 2.2,
  xpPerLoserLevel: 10,
  /** The remake's ceiling on a kept level (the source had none; 2.2x per level makes 40 out of reach). */
  levelMax: 99,
  xpMax: 1_000_000_000,
  /** onBattleStart 734-738: the insult roll stops rising at level 18. */
  insultLevelCap: 18,
  /** onBattleStart 742-749: Math.floor(Math.random() * 12) from level 10, else * 10; 0 chokes. */
  chokeFrom: 10,
  chokeOddsHigh: 12,
  chokeOddsLow: 10,
  /** onBattleStart 699-721; index 0 is the choke. */
  insults: Object.freeze([
    '*choke*',
    'Yo Momma so slooow!',
    "You're more like a spherimal!",
    "you're a Noobimal.",
    "Any squarer and you'd be round.",
    "You're so 2 dimensional!",
    'You smell like guano',
    "You're a Cubifail!",
    "Tryin' to wind me up, or somethin'?",
    'Your springs are rusted.',
    'Your smack is wack!',
    "You're more common than dirt.",
    'You race like a sloth.',
    "I've collected like 100 of you.",
    "You're barely square!",
    "I hope you're releasable.",
    'My wit is going to unwind you',
    'Cubimal? More like a RUBE-imal.',
    "You couldn't race your way out of a bigger bag!",
    "You've got the right angles, but the wrong moves!",
    "Your mama's so square her milk comes out in cartons.",
    "I'd rather collect the box",
  ]),
  text: Object.freeze({
    comeAtMe: 'Come at me, Bro!', // search 1035
    no: 'No, ', // showInsult 1058-1061
    levelUp: (level) => `LEVEL ${level}!`, // makeWinner 659
    xp: (n) => `+${n}xp!`, // makeWinner 668
    vs: (a, b) => `${a} VS. ${b}`, // search 1023
    defeated: (a, b) => `${a} defeated ${b}`, // checkWin 542
    ego: (label, h) => `${label}'s Ego remaining: ${h}`, // checkWin 575-576
    pickedUp: 'You picked it up.',
  }),
  /** ms, from the timers in the verbs and functions above. */
  timing: Object.freeze({
    searchMs: 1_000, // verbs 150/271/318: apiSetTimer('search', 1000)
    startMs: 10, // search 1037: onBattleStart after 10
    insultDelayMs: 100, // onBattleStart 754: showInsult after 100
    insultMs: 920, // showInsult 1062
    shoutMs: 1_400, // onBattleStart 836-841
    firstLoopMs: 1_400, // onBattleStart 844
    loopMs: 700, // onBattleStart 832
    tauntMs: 1_500, // onBattleLoop 690
    comeAtMeMs: 3_000, // search 1035
    loserHomeMs: 40, // checkWin 567 (apiSetTimer counts ms)
    winnerMs: 1_000, // checkWin 570
    winnerHomeMs: 4_000, // makeWinner 670
    bubbleMs: 4_000, // makeWinner 659, 668
  }),
  /** search 1001-1009; onBattleStart 794-830; onBattleLoop 685-686 (npc_walk_speed). */
  searchRange: 450,
  strikeGap: 40,
  middleGap: 50,
  strikeSpeed: 150,
  backSpeed: 100,
  /** The remake's stand-in for apiFindPath reachability: the two stand on ground this close in height. */
  sameGroundPx: 60,
  /** makeWinner 650, 661. */
  feat: 'tottlys_toys',
  featWin: 1,
  featLevel: 1,
  sounds: Object.freeze({ windUp: 'CUBIMAL_WIND_UP', race: 'CUBIMAL_RACE', windDown: 'CUBIMAL_WIND_DOWN', puff: 'PROTO_PUFF' }),
});

const VERB_STYLE = Object.freeze(Object.fromEntries(CUBIMAL_BATTLE.styles.map((s) => [CUBIMAL_BATTLE.verbs[s].id, s])));

/** The style a battle verb id picks ('p' | 's' | 'r'), or ''. */
export function battleStyleOfVerb(verbId) {
  return VERB_STYLE[verbId] || '';
}

/** A figure can battle (the 43 Series figures; not the factory-defect Chick). */
export function canBattle(classTsid) {
  return isCubimal(classTsid);
}

const whole = (v, lo, hi, dflt) => {
  const n = typeof v === 'number' && Number.isFinite(v) ? Math.floor(v) : dflt;
  return Math.max(lo, Math.min(hi, n));
};

/**
 * A figure's name from its copy's words: a string (a named figure that has never won), or
 * { name, level, xp } once it has.
 */
export function cubimalTagName(tag) {
  if (typeof tag === 'string') return tag;
  if (tag && typeof tag === 'object' && !Array.isArray(tag) && typeof tag.name === 'string') return tag.name;
  return '';
}

/** A figure's level and experience from its copy's words (a new or only-named figure is level 1, 0 xp). */
export function cubimalBattleStats(tag) {
  if (!tag || typeof tag !== 'object' || Array.isArray(tag)) return { level: CUBIMAL_BATTLE.base.level, xp: CUBIMAL_BATTLE.base.xp };
  return {
    level: whole(tag.level, 1, CUBIMAL_BATTLE.levelMax, 1),
    xp: whole(tag.xp, 0, CUBIMAL_BATTLE.xpMax, 0),
  };
}

/** The words a figure keeps: just its name until it has a level or experience, then { name, level, xp }. */
export function cubimalTagWith(tag, { name, level, xp } = {}) {
  const n = name === undefined ? cubimalTagName(tag) : typeof name === 'string' ? name : '';
  const cur = cubimalBattleStats(tag);
  const lv = level === undefined ? cur.level : whole(level, 1, CUBIMAL_BATTLE.levelMax, 1);
  const x = xp === undefined ? cur.xp : whole(xp, 0, CUBIMAL_BATTLE.xpMax, 0);
  if (lv <= 1 && x <= 0) return n || null;
  return { name: n, level: lv, xp: x };
}

/**
 * next_level_amount at a level: 10 at level 1, then intval(amount) x 2.2 at each level up
 * (makeWinner 656 stores the product, 650 reads it back with intval).
 */
export function nextLevelAmount(level) {
  let n = CUBIMAL_BATTLE.base.next;
  for (let l = 1; l < whole(level, 1, CUBIMAL_BATTLE.levelMax, 1); l += 1) n = Math.floor(n * CUBIMAL_BATTLE.nextFactor);
  return n;
}

/** Health (the Ego a fight starts with): 10, two more a level (makeWinner 657). */
export function cubimalEgo(level) {
  return CUBIMAL_BATTLE.base.health + CUBIMAL_BATTLE.healthPerLevel * (whole(level, 1, CUBIMAL_BATTLE.levelMax, 1) - 1);
}

/** getLabel 580: the name, else the kind, then " Lvl." and the level. */
export function cubimalBattleLabel(classTsid, name, level) {
  return `${name || cubimalInfo(classTsid)?.label || 'Cubimal'} Lvl.${whole(level, 1, CUBIMAL_BATTLE.levelMax, 1)}`;
}

/** linkifyPlayer(pc, true) + " " + getLabel(): "Ada's Chick Cubimal Lvl.1". */
export function ownedBattleLabel(owner, label) {
  return `${owner || 'Someone'}'s ${label}`;
}

/** buildVerbMessage(count, 'battle', 'battled'): "You battled a Chick Cubimal." */
export function cubimalBattleVerbMessage(classTsid) {
  return `You battled ${cubimalArticle(classTsid)} ${cubimalInfo(classTsid)?.label || 'Cubimal'}.`;
}

/** getType 591-622 as written: the striker's change to the top of its roll. */
export function battleStyleMod(mine, theirs) {
  if (mine === 'r' && theirs === 's') return 1;
  if (mine === 'r' && theirs === 'p') return -1;
  if (mine === 's' && theirs === 'r') return -1;
  if (mine === 'p' && theirs === 'r') return 1;
  if (mine === 's' && theirs === 'p') return 1;
  return 0;
}

/** common.js randInt(lo, hi): lo + floor(random * (1 + hi - lo)). */
export function battleRandInt(lo, hi, rng = Math.random) {
  return lo + Math.floor(rng() * (1 + hi - lo));
}

/**
 * One strike's rolls (onBattleStart 724-765): { index, insult, damage, choke }. `index` is the
 * insult roll (0 when it chokes), `damage` the Ego it takes, given the opponent's last insult.
 * Rolls in source order: the insult, the damage, the choke. An index past the list's end (level
 * 18 and up with the style's +1) keeps the last insult (the source showed nothing there).
 */
export function rollBattleStrike({ level, mod = 0, opponentInsult = null }, rng = Math.random) {
  const lv = whole(level, 1, CUBIMAL_BATTLE.levelMax, 1);
  let index = lv >= CUBIMAL_BATTLE.insultLevelCap
    ? battleRandInt(CUBIMAL_BATTLE.insultLevelCap, CUBIMAL_BATTLE.insultLevelCap + 3 + mod, rng)
    : battleRandInt(lv, lv + 3 + mod, rng);
  const actual = battleRandInt(lv, lv + 3 + mod, rng);
  const odds = lv >= CUBIMAL_BATTLE.chokeFrom ? CUBIMAL_BATTLE.chokeOddsHigh : CUBIMAL_BATTLE.chokeOddsLow;
  const choke = Math.floor(rng() * odds) === 0;
  if (choke) index = 0;
  index = Math.max(0, Math.min(CUBIMAL_BATTLE.insults.length - 1, index));
  const insult = CUBIMAL_BATTLE.insults[index];
  let damage = 0;
  if (index !== 0) damage = insult === opponentInsult ? Math.ceil(index / 2) : actual;
  return { index, insult, damage, choke: index === 0 };
}

/** showInsult 1057: what the bubble says. */
export function battleInsultBubble(insult, opponentInsult) {
  if (insult === opponentInsult && insult !== CUBIMAL_BATTLE.insults[0] && insult != null) return CUBIMAL_BATTLE.text.no + insult;
  return insult;
}

/**
 * makeWinner 645-671: the winner's new level and experience for beating a figure of `loserLevel`.
 * { level, xp, earned, levelUp, bubble, feat }.
 */
export function battleWinnerGain({ level, xp }, loserLevel) {
  const lv = whole(level, 1, CUBIMAL_BATTLE.levelMax, 1);
  const have = whole(xp, 0, CUBIMAL_BATTLE.xpMax, 0);
  const earned = whole(loserLevel, 1, CUBIMAL_BATTLE.levelMax, 1) * CUBIMAL_BATTLE.xpPerLoserLevel;
  const nla = nextLevelAmount(lv);
  if (have + earned >= nla && lv < CUBIMAL_BATTLE.levelMax) {
    const next = lv + 1;
    return { level: next, xp: Math.min(CUBIMAL_BATTLE.xpMax, have + earned - nla), earned, levelUp: true, bubble: CUBIMAL_BATTLE.text.levelUp(next), feat: CUBIMAL_BATTLE.featWin + CUBIMAL_BATTLE.featLevel };
  }
  return { level: lv, xp: Math.min(CUBIMAL_BATTLE.xpMax, have + earned), earned, levelUp: false, bubble: CUBIMAL_BATTLE.text.xp(earned), feat: CUBIMAL_BATTLE.featWin };
}

/** onBattleStart 794-813: the striker's own side of the middle, 50 px from it. */
export function battleRestX(x, opponentX) {
  const dis = Math.abs(x - opponentX);
  return opponentX < x ? x - dis / 2 + CUBIMAL_BATTLE.middleGap : x + dis / 2 - CUBIMAL_BATTLE.middleGap;
}

/** onBattleStart 818-829: where a strike runs to, 40 px short of the opponent. */
export function battleStrikeX(x, opponentX) {
  return opponentX < x ? opponentX + CUBIMAL_BATTLE.strikeGap : opponentX - CUBIMAL_BATTLE.strikeGap;
}

/** The data the realtime server reads (tools/build-realtime-cubimal-battle.mjs writes it). */
export function cubimalBattleServerData() {
  const B = CUBIMAL_BATTLE;
  return {
    _doc: 'Cubimal battles (G40): npc_cubimal_base in GameServerJS items/npc_cubimal_*.js. Written by the game repo\'s tools/build-realtime-cubimal-battle.mjs from js/cubimal-battle.js; do not edit.',
    styles: B.styles,
    shouts: Object.fromEntries(B.styles.map((s) => [s, B.verbs[s].shout])),
    base: B.base,
    healthPerLevel: B.healthPerLevel,
    nextFactor: B.nextFactor,
    xpPerLoserLevel: B.xpPerLoserLevel,
    levelMax: B.levelMax,
    xpMax: B.xpMax,
    insultLevelCap: B.insultLevelCap,
    chokeFrom: B.chokeFrom,
    chokeOddsHigh: B.chokeOddsHigh,
    chokeOddsLow: B.chokeOddsLow,
    insults: B.insults,
    text: {
      comeAtMe: B.text.comeAtMe,
      no: B.text.no,
      levelUp: B.text.levelUp('%d'),
      xp: B.text.xp('%d'),
      vs: B.text.vs('%s', '%s'),
      defeated: B.text.defeated('%s', '%s'),
      ego: B.text.ego('%s', '%d'),
    },
    timing: B.timing,
    searchRange: B.searchRange,
    strikeGap: B.strikeGap,
    middleGap: B.middleGap,
    strikeSpeed: B.strikeSpeed,
    backSpeed: B.backSpeed,
    sameGroundPx: B.sameGroundPx,
    feat: B.feat,
    featWin: B.featWin,
    featLevel: B.featLevel,
    labels: battleKinds(),
  };
}

let kinds = null;
/** Every battling figure's kind label, for the server's getLabel when a figure has no name. */
function battleKinds() {
  if (kinds) return kinds;
  kinds = {};
  for (const slug of BATTLE_SLUGS) {
    const c = `npc_cubimal_${slug}`;
    if (cubimalInfo(c)) kinds[c] = cubimalInfo(c).label;
  }
  return kinds;
}

/** The 43 figures with battle verbs (every npc_cubimal_*.js but factorydefect_chick). */
export const BATTLE_SLUGS = Object.freeze(['batterfly', 'bureaucrat', 'butler', 'butterfly', 'cactus', 'chick', 'crab', 'craftybot', 'deimaginator', 'dustbunny', 'emobear', 'firebogstreetspirit', 'firefly', 'fox', 'foxranger', 'frog', 'gardeningtoolsvendor', 'gnome', 'greeterbot', 'groddlestreetspirit', 'gwendolyn', 'helga', 'hellbartender', 'ilmenskiejones', 'juju', 'magicrock', 'maintenancebot', 'mealvendor', 'phantom', 'piggy', 'rook', 'rube', 'scionofpurple', 'senorfunpickle', 'sloth', 'smuggler', 'snoconevendor', 'squid', 'toolvendor', 'trisor', 'unclefriendly', 'uraliastreetspirit', 'yeti']);
