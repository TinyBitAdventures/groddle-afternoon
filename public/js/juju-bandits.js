/**
 * Overworld Juju Bandits (pure rules and data: no Pixi, no DOM).
 *
 * Source (tinyspeck/glitch-GameServerJS, CC0):
 *  - items/dust_trap.js doDrop: after a Dust Trap pays out (an organelle or a
 *    drop-table item), a Juju may come. With pc.baqala_times.offer_quest the
 *    chance is 0.5; otherwise it climbs with the Ancestral Nostalgia time
 *    (under 3 min none, then 0.10 / 0.15 / 0.20 / 0.25 / 0.30 / 0.35, and
 *    1.0 from 9 min). A hit runs pc.juju_bandit_curse 1 s later.
 *  - players/inc_special_locations.js juju_bandit_curse: Savanna hubs only
 *    (config regions: Baqala 86, Choru 90, Zhambu 91, Xalanga 95); you must
 *    carry something from the dust_trap drop table (items_has_drops); one
 *    Juju per player at a time; it picks one of those items, appears 250 px
 *    to one side (the other side at a street edge) on the platform below,
 *    and offers Carry That Weight instead of stealing while the quest is
 *    'none' (start_baqala_buff sets offer_quest).
 *  - items/npc_juju_bandit.js: variant red/green/yellow, bandana
 *    blue/black/red; walk speed 75; alert 0.5 s and declaration 1.5 s after
 *    it appears; it starts following once you have moved 25 px; follows
 *    every second, declares again every 15-20 s; within 50 x 50 px (or on
 *    collision) it steals one item (or offers the quest). Stealing near a
 *    signpost (200 x 200 px) or with nothing left to take makes it rage quit
 *    ("You haven't seen the last of the Juju Bandits!", juju_bandits/escaped
 *    for the Slippery Customer badges); it shrinks away 2.5 s later and is
 *    gone 1.5 s after that.
 *
 * The remake has no Ancestral Nostalgia buff (imagination-remake.js: the
 * ancestral_lands_time cards are 'later'), so only the quest-offer chance is
 * wired into play; JUJU_STEAL_CHANCE keeps the source curve for the decision
 * on that timer (features/juju-bandits-feature.js reaches the stealing Juju
 * with &jujudemo=steal).
 */

export const JUJU_SOURCE = 'tinyspeck/glitch-GameServerJS CC0 items/npc_juju_bandit.js, players/inc_special_locations.js, items/dust_trap.js';

/** config_prod.js regions: the Savanna (Ancestral Lands) hubs. */
export const SAVANNA_HUBS = Object.freeze(['86', '90', '91', '95']);
export const isSavannaHub = (hubId) => SAVANNA_HUBS.includes(String(hubId ?? ''));

export const JUJU_QUEST = 'help_juju_bandits';

export const JUJU_BANDIT = Object.freeze({
  classTsid: 'npc_juju_bandit',
  label: 'Juju Bandit',
  curseDelayMs: 1000,
  offerQuestChance: 0.5,
  spawnOffset: 250,
  spawnSearchUp: 800,
  walkSpeed: 75, // px per second (npc_walk_speed; 150 in an instance)
  alertMs: 500,
  declareMs: 1500,
  followAfterDeclareMs: 3000,
  redeclareMs: 15000,
  redeclareJitterMs: 5000,
  followMs: 1000,
  spawnRetryMs: 500,
  spawnMoveTolerance: 25,
  reach: 50, // |dx| <= 50 && |dy| <= 50
  hitBox: 50,
  signpostFear: 200, // |dx| < 200 && |dy| < 200 of a signpost
  rageQuitMs: 2500,
  stealEscapeMs: 2500,
  shrinkMs: 1500,
  variants: Object.freeze(['red', 'green', 'yellow']),
  bandanas: Object.freeze(['blue', 'black', 'red']),
});
export const JUJU_VARIANTS = JUJU_BANDIT.variants;
export const JUJU_BANDANAS = JUJU_BANDIT.bandanas;

/** dust_trap.js: chance by minutes of Ancestral Nostalgia (not wired: the remake has no such timer). */
export const JUJU_STEAL_CHANCE = Object.freeze([
  Object.freeze({ underMinutes: 3, chance: 0 }),
  Object.freeze({ underMinutes: 4, chance: 0.1 }),
  Object.freeze({ underMinutes: 5, chance: 0.15 }),
  Object.freeze({ underMinutes: 6, chance: 0.2 }),
  Object.freeze({ underMinutes: 7, chance: 0.25 }),
  Object.freeze({ underMinutes: 8, chance: 0.3 }),
  Object.freeze({ underMinutes: 9, chance: 0.35 }),
  Object.freeze({ underMinutes: Infinity, chance: 1 }),
]);

export function stealChanceForSeconds(seconds) {
  const min = Math.max(0, Number(seconds) || 0) / 60;
  return JUJU_STEAL_CHANCE.find((row) => min < row.underMinutes).chance;
}

/** npc_juju_bandit.js copy, verbatim ({pc} is the player's name). */
export const JUJU_TEXT = Object.freeze({
  alertOffer: 'One of the notorious Juju Bandits has appeared, and he… needs your help?',
  alertSteal: "One of the notorious Juju Bandits has appeared, and he's got his eye on your stuff!",
  rageQuit: "You haven't seen the last of the Juju Bandits!",
  stolen: 'Oh no! The Juju Bandit has stolen one of your {plural}.',
  gotIt: 'Got it! The Juju Bandits strike again!',
  offerLines: Object.freeze([
    '{pc}! The Juju Bandits need your help.',
    'We need your help, {pc}!',
    'When the fearsome Juju Bandits request your help, {pc}, you don’t refuse.',
    'Come with me if you want to live, {pc}.',
    'If you don’t help us, you’ll regret it!',
    'Our boss wants to see you, {pc}, which means you get seen, or else…',
    'If you know what’s good for you, you’ll follow me to the secret lair of the Juju Bandits!',
  ]),
  stealLines: Object.freeze([
    "{pc}! I know you have {item} and I'm coming to get it!",
    'Your {plural} or your life, {pc}!',
    "This'll teach you to mess with the Juju Bandits, {pc}. We're coming for your {plural}!",
    "I'll get you, {pc}, and your little {name} too!",
    "When the Juju Boss asks for {item} then {item} she'll get, {pc}!",
    "You can't stop us from getting your {plural}, {pc}!",
    "{pc}, I have a riddle for you—what's gelatinous and hecka' mean and about to steal your {plural}? Hint: you're looking at him!",
    '{pc}, give us your {plural} and we sort of maybe promise that no one gets hurt too bad!',
  ]),
});

/**
 * The dust_trap drop table's items with their GSJS article and names (the
 * bandit names what it wants: proto.article, name_single, name_plural).
 */
export const DUST_TRAP_LOOT = Object.freeze({
  paper: ['a', 'Paper', 'Sheets of Paper'],
  gem_sapphire: ['a', 'Showy Sapphire', 'Showy Sapphires'],
  cloudberry_daiquiri: ['a', 'Cloudberry Daiquiri', 'Cloudberry Daiquiris'],
  flaming_humbaba: ['a', 'Flaming Humbaba', 'Flaming Humbabas'],
  gem_ruby: ['a', 'Modestly Sized Ruby', 'Modestly Sized Rubies'],
  gurly_drink: ['a', 'Gurly Drink', 'Gurly Drinks'],
  bubble_tea: ['a', 'Bubble Tea', 'Bubble Teas'],
  lemburger: ['a', 'Lemburger', 'Lemburgers'],
  pungent_sunrise: ['a', 'Pungent Sunrise', 'Pungent Sunrises'],
  chillybusting_chili: ['a', 'Chilly-Busting Chili', 'Chilly-Busting Chilis'],
  awesome_stew: ['an', 'Awesome Stew', 'Awesome Stews'],
  meat_tetrazzini: ['a', 'Meat Tetrazzini', 'Meat Tetrazzinis'],
  expensive_grilled_cheese: ['an', 'Expensive Grilled Cheese', 'Expensive Grilled Cheeses'],
  sno_cone_purple: ['a', 'Purple Sno Cone', 'Purple Sno Cones'],
  herb_seed_hairball_flower: ['a', 'Hairball Flower Seed', 'Hairball Flower Seeds'],
  herb_seed_purple_flower: ['a', 'Purple Flower Seed', 'Purple Flower Seeds'],
  herb_seed_rookswort: ['a', 'Rookswort Seed', 'Rookswort Seeds'],
  herb_seed_rubeweed: ['a', 'Rubeweed Seed', 'Rubeweed Seeds'],
  herb_seed_silvertongue: ['a', 'Silvertongue Seed', 'Silvertongue Seeds'],
  herb_seed_yellow_crumb_flower: ['a', 'Yellow Crumb Flower Seed', 'Yellow Crumb Flower Seeds'],
  herb_seed_gandlevery: ['a', 'Gandlevery Seed', 'Gandlevery Seeds'],
  door_key_6: ['a', 'Purple-Orange Circle Key', 'Purple-Orange Circle Key'],
  door_key_1: ['a', 'Yellow-Purple Triangle Key', 'Yellow-Purple Triangle Key'],
  door_key_2: ['a', 'Green-White Circle Key', 'Green-White Circle Key'],
  door_key_4: ['a', 'Teal-Red Hexagon Key', 'Teal-Red Hexagon Key'],
  door_key_3: ['an', 'Orange-Blue Square Key', 'Orange-Blue Square Key'],
  door_key_5: ['a', 'Red-Green Triangle Key', 'Red-Green Triangle Key'],
  gem_moonstone: ['a', 'Luminous Moonstone', 'Luminous Moonstones'],
  focusing_orb: ['a', 'Focusing Orb', 'Focusing Orbs'],
  gem_diamond: ['a', 'Walloping Big Diamond', 'Walloping Big Diamonds'],
  fairly_hallowed_shrine_powder: ['a', 'Fairly Hallowed Shrine Powder', 'Fairly Hallowed Shrine Powder'],
  extremely_hallowed_shrine_powder: ['an', 'Extremely Hallowed Shrine Powder', 'Extremely Hallowed Shrine Powder'],
});

/** items_has_drops('dust_trap', 1): loot classes the pack holds at least one of. */
export function jujuWants(inv = {}) {
  return Object.keys(DUST_TRAP_LOOT).filter((id) => (Number(inv?.[id]) || 0) >= 1);
}

export function itemWords(classTsid) {
  const [article, name, plural] = DUST_TRAP_LOOT[classTsid] || ['a', classTsid, classTsid];
  return { item: `${article} ${name}`, name, plural };
}

/** Fill {pc}, {item}, {name}, {plural}. */
export function jujuLine(template, pcLabel = JUJU_PLAYER_LABEL, classTsid = null) {
  const words = classTsid ? itemWords(classTsid) : { item: '', name: '', plural: '' };
  const out = String(template)
    .replaceAll('{pc}', pcLabel || JUJU_PLAYER_LABEL)
    .replaceAll('{item}', words.item)
    .replaceAll('{name}', words.name)
    .replaceAll('{plural}', words.plural);
  return out.charAt(0).toUpperCase() + out.slice(1);
}

/** pc.label: the remake has no player names, so GSJS copy says "friend" (js/quests.js). */
export const JUJU_PLAYER_LABEL = 'friend';

/**
 * juju_bandit_curse: should a Juju come now? (Savanna hub, something it
 * wants, nobody already after you, and the dust_trap.js roll.)
 * @returns {{ ok: boolean, reason?: string, mode?: 'offer'|'steal', itemClass?: string }}
 */
export function jujuCurse({ hubId, inv, questStatus, pursued = false, roll = Math.random(), pick = Math.random(), stealChance = 0 } = {}) {
  if (!isSavannaHub(hubId)) return { ok: false, reason: 'not_savanna' };
  const offer = questStatus === 'none';
  const chance = offer ? JUJU_BANDIT.offerQuestChance : stealChance;
  if (!(roll < chance)) return { ok: false, reason: 'roll' };
  const wants = jujuWants(inv);
  if (!wants.length) return { ok: false, reason: 'nothing_to_take' };
  if (pursued) return { ok: false, reason: 'pursued' };
  const itemClass = wants[Math.min(wants.length - 1, Math.floor(pick * wants.length))];
  return { ok: true, mode: offer ? 'offer' : 'steal', itemClass };
}

/**
 * Spawn x: 250 px to a random side, flipped when that would leave the street
 * (screen space: 0..width).
 */
export function jujuSpawnX(playerX, width, sideRoll = Math.random()) {
  const d = JUJU_BANDIT.spawnOffset;
  let offset = sideRoll < 0.5 ? d : -d;
  if (offset > 0 && playerX + offset > width) offset = -d;
  if (offset < 0 && playerX + offset < 0) offset = d;
  return playerX + offset;
}

/** isNearSignpost: the player within 200 x 200 px of any signpost (screen space). */
export function nearSignpost(px, py, signposts = []) {
  const r = JUJU_BANDIT.signpostFear;
  return (signposts || []).some((s) => Math.abs(px - s.x) < r && Math.abs(py - s.y) < r);
}

export const withinReach = (a, b) => Math.abs(a.x - b.x) <= JUJU_BANDIT.reach && Math.abs(a.y - b.y) <= JUJU_BANDIT.reach;

/** makeDeclaration's next call: 15 s plus up to 5 s. */
export const redeclareDelay = (roll = Math.random()) => JUJU_BANDIT.redeclareMs + roll * JUJU_BANDIT.redeclareJitterMs;

/* ------------------------------------------------------------------ */
/* Art                                                                  */
/* ------------------------------------------------------------------ */

/** OGA npc_juju_bandit x1 cell; the feet sit at (148, 185) in it. */
export const JUJU_CELL = Object.freeze({ w: 240, h: 254, footX: 148, footY: 185 });
const BODY = Object.freeze({ x: 99, y: 86, w: 95, h: 102 });
const SPARKLE = Object.freeze({ x: 58, y: 35, w: 182, h: 219 });
const SWIPE = Object.freeze({ x: 99, y: 86, w: 114, h: 102 });

/**
 * States the overworld Juju plays (npc_juju_bandit.as animations), cropped
 * by tools/juju-bandit-art.mjs. `loopFrom` is the .as loop_froms (walk: 8).
 */
export const JUJU_SHEETS = Object.freeze({
  spawn: Object.freeze({ oga: 'spawn', frames: 23, crop: SPARKLE, loop: false }),
  walk: Object.freeze({ oga: 'walk', frames: 16, crop: BODY, loop: true, loopFrom: 8 }),
  walk_end: Object.freeze({ oga: 'walk_end', frames: 16, crop: BODY, loop: false }),
  idle1: Object.freeze({ oga: 'idle1_part1', frames: 60, crop: BODY, loop: true }),
  idle2: Object.freeze({ oga: 'idle2_part1', frames: 75, crop: BODY, loop: true }),
  swipe: Object.freeze({ oga: 'swipe', frames: 14, crop: SWIPE, loop: false }),
  shrink: Object.freeze({ oga: 'shrink', frames: 21, crop: SPARKLE, loop: false }),
});
export const JUJU_SHEET_COLS = 8;

export const jujuSheetUrl = (variant, bandana, state) => `assets/sprites/juju_bandit/juju_${variant}_${bandana}_${state}.webp`;

/** Anchor (0..1) that keeps the source feet point for a cropped state. */
export function jujuAnchor(state) {
  const { crop } = JUJU_SHEETS[state];
  return { x: (JUJU_CELL.footX - crop.x) / crop.w, y: (JUJU_CELL.footY - crop.y) / crop.h };
}
