/**
 * The Cauldron's quaff and pour potions that had no verb yet (register row
 * G149), as pure rules. js/features/potions-feature.js binds them to the pack
 * and the street.
 *
 * Sources (GameServerJS, CC0):
 * - potion_base (in every items/potion_*.js): Quaff and Pour are pack verbs
 *   that need `can_quaff` / `can_pour`; a dead player gets "This is no time
 *   to be messing about with potions. You're dead!"; canQuaff / canPour
 *   errors disable the verb. The handler plays a 2.5 s overlay with
 *   announce_sound('POTION_GENERIC') (the client's tool class sound is
 *   POTION_<CLASS>), then onQuaffComplete / onPourComplete: onQuaff / onPour,
 *   use(1) and achievements_increment('potions_used', class) unless the
 *   result says no_use, and buildVerbMessage "You quaffed an Amorous
 *   Philtre." with the result's msg. tool_base: points_capacity uses per
 *   bottle (display_wear 1); an empty bottle is consumed and the next one in
 *   the stack starts full.
 * - potion_amorous_philtre.js + catalog_buffs.js feeling_called_love (+10% of
 *   max mood, 60 s; player collisions are for other players).
 * - potion_elixir_of_avarice.js + catalog_buffs.js crazy_coin_collector
 *   (today's quoin limit + 50; player.js:997-1001 ends it at the new day).
 * - potion_favor.js: 111 favor with the bottle's Giant (onLoad
 *   choose_one(config.giants)), capped at the emblem target, once a day.
 * - potion_keycutter_tonic.js: one key you choose becomes a random
 *   door_key_1..6 (never the same one).
 * - potion_charades.js / potion_ancestral_spirits.js: their own refusals.
 * - potion_animal_youth.js: the closest Piggy, Chicken or Butterfly within
 *   200 px becomes a Piglet, Chick or Caterpillar.
 * - potion_avatar_large.js / potion_avatar_small.js / potion_rainbow_juice.js
 *   + avatar_embiggenifier.js / avatar_smallifier.js / anti_gravitys_rainbow.js
 *   (physics items): a cloud or rainbow at your feet that changes the
 *   physics of whoever walks into it.
 * - potion_trantsformation_fluid.js: the closest tree within 200 px becomes a
 *   different random tree.
 * - furniture_rug.js verbs.munch: FOX_EAT and feeling_called_love.
 */

/** potion_base: apiSetTimerX('onQuaffComplete' | 'onPourComplete', 2500). */
export const POTION_ACTION_MS = 2500;
/** potion_animal_youth / potion_trantsformation_fluid findCloseStack(…, 200). */
export const POUR_RANGE = 200;
/** canPour: no pouring within 150 px (x and y) of a signpost. */
export const SIGNPOST_RANGE = 150;

const potion = (name, article, verb, tooltip, capacity, extra = {}) =>
  Object.freeze({ name, article, verb, label: verb === 'quaff' ? 'Quaff' : 'Pour', tooltip, capacity, ...extra });

/** classProps (quaff_tooltip / pour_tooltip, points_capacity) and the item's name. */
export const POTIONS = Object.freeze({
  potion_amorous_philtre: potion('Amorous Philtre', 'an', 'quaff', 'Get the feeling of love.', 5),
  potion_elixir_of_avarice: potion('Elixir of Avarice', 'an', 'quaff', 'Become a crazy quoin collector.', 5),
  // potion_favor.js has no quaff_tooltip: canQuaff writes it per bottle.
  potion_favor: potion('Draught of Giant Amicability', 'a', 'quaff', '', 11),
  potion_keycutter_tonic: potion('Keycutter Tonic', 'a', 'quaff', 'Turn one of your keys into a random key', 5),
  potion_charades: potion('Charades Potion', 'a', 'quaff', "Let's play a game", 1),
  potion_ancestral_spirits: potion('Ancestral Spirits', 'an', 'quaff', 'Spend more quality time with your ancestors', 1),
  potion_animal_youth: potion('Potion of Animal Youth', 'a', 'pour', 'Babify an animal', 3),
  potion_avatar_large: potion('Embiggenifying Potion', 'an', 'pour', 'Create an embiggening cloud', 5, { spawns: 'avatar_embiggenifier' }),
  potion_avatar_small: potion('De-Embiggenifying Potion', 'a', 'pour', 'Create a smallifying cloud', 5, { spawns: 'avatar_smallifier' }),
  potion_rainbow_juice: potion('Rainbow Juice', 'a', 'pour', 'Taste the rainbow', 1, { spawns: 'anti_gravitys_rainbow' }),
  potion_trantsformation_fluid: potion('Trantsformation Fluid', 'a', 'pour', 'Turn a tree into a random different tree', 3),
});

export const POTION_TEXT = Object.freeze({
  dead: "This is no time to be messing about with potions. You're dead!",
  notHookedUp: "This potion ain't hooked up right!",
  love: "This doesn't fit my plans, no.",
  avarice: 'You are already collecting coins like crazy.',
  avariceDone: 'Your quoin limit for today has increased by 50!',
  favorDaily: 'You can only quaff this once per day',
  noKeys: "You don't have any keys.",
  charades: 'You need other people around to play Charades. Trying to play with yourself is grossly inappropriate.',
  ancestral: 'You can only drink this in the Ancestral Lands.',
  ancestralOnce: 'You can only use this once per visit.',
  ancestralDone: 'Your nostalgia subsides somewhat.',
  noAnimals: 'There are no animals around here.',
  noAnimal: 'There is no animal here.',
  signpost: "You can't pour this close to a sign post.",
  cantPourHere: "You can't pour this here",
  unfair: "I'd say, doing that would give you an unfair advantage.",
  noTree: 'You must be near a tree to apply this.',
  treeSmall: 'This tree is too small to be trantsformed',
  treeWeak: 'This tree is too weak to be trantsformed',
  othersTree: "You can't trantsform somebody else's tree.",
});

export function isPotion(classTsid) {
  return Boolean(POTIONS[classTsid]);
}

/** item.js buildVerbMessage(1, 'quaff', 'quaffed', failed, msgs): "You quaffed an Amorous Philtre. <msgs>" */
export function potionMessage(classTsid, msgs = [], failed = false) {
  const def = POTIONS[classTsid];
  const verb = def?.verb || 'quaff';
  const item = def ? `${def.article} ${def.name}` : classTsid;
  const head = failed ? `You tried to ${verb} ${item}.` : `You ${verb === 'quaff' ? 'quaffed' : 'poured'} ${item}.`;
  return [head, ...(Array.isArray(msgs) ? msgs : [msgs]).filter(Boolean)].join(' ');
}

/** tool_base: uses left in the open bottle (a fresh bottle is full). */
export function potionUsesLeft(classTsid, uses) {
  const def = POTIONS[classTsid];
  if (!def) return 0;
  const n = Number(uses);
  return Number.isFinite(n) ? Math.max(0, Math.min(def.capacity, Math.floor(n))) : def.capacity;
}

/**
 * tool_base use(1) after a successful quaff or pour: { uses, emptied }; an
 * emptied bottle is consumed (apiConsume) and the next one starts full.
 */
export function usePotion(classTsid, uses) {
  const left = potionUsesLeft(classTsid, uses) - 1;
  return left <= 0 ? { uses: null, emptied: true } : { uses: left, emptied: false };
}

/**
 * The pack button: potion_base conditions (dead first), then the potion's own
 * canQuaff / canPour. `check` is that result: { ok, error, tooltip }.
 * Label "Quaff (3/5)" like getTooltipLabel's wear display.
 */
export function potionButton(classTsid, { uses, dead = false, check = { ok: true } } = {}) {
  const def = POTIONS[classTsid];
  if (!def) return null;
  const left = potionUsesLeft(classTsid, uses);
  let reason = '';
  if (dead) reason = POTION_TEXT.dead;
  else if (!check?.ok) reason = check?.error || POTION_TEXT.notHookedUp;
  const label = def.capacity > 1 ? `${def.label} (${left}/${def.capacity})` : def.label;
  return { id: def.verb, label, tooltip: check?.tooltip || def.tooltip || POTION_TEXT.notHookedUp, enabled: !reason, reason, primary: !reason };
}

/* ------------------------------------------------------------------ */
/* Quaff potions                                                        */
/* ------------------------------------------------------------------ */

/** potion_amorous_philtre canQuaff. */
export function amorousCheck({ loveActive = false } = {}) {
  return loveActive ? { ok: false, error: POTION_TEXT.love } : { ok: true };
}

/** catalog_buffs.js feeling_called_love on_apply: metabolics_add_mood(max * 0.10). */
export function loveMood(maxMood) {
  return Math.max(0, Number(maxMood) || 0) * 0.1;
}

/** potion_elixir_of_avarice canQuaff. */
export function avariceCheck({ crazyActive = false } = {}) {
  return crazyActive ? { ok: false, error: POTION_TEXT.avarice } : { ok: true };
}

/** crazy_coin_collector on_apply: stats_set_quoins_max_today(imagination_get_quoin_limit() + 50). */
export const CRAZY_QUOIN_BONUS = 50;
export function crazyQuoinLimit(baseLimit) {
  return Math.max(0, Math.floor(Number(baseLimit) || 0)) + CRAZY_QUOIN_BONUS;
}

/** potion_favor.js: capitalize(giant), with Ti spelled Tii. */
export function favorGiantName(giant) {
  const id = String(giant || '');
  if (id === 'ti') return 'Tii';
  return id ? id.charAt(0).toUpperCase() + id.slice(1) : '';
}

/** potion_favor.js onLoad: choose_one(config.giants). */
export const FAVOR_GIANTS = Object.freeze(['alph', 'cosma', 'friendly', 'grendaline', 'humbaba', 'lem', 'mab', 'pot', 'spriggan', 'ti', 'zille']);
export const FAVOR_POTION_POINTS = 111;

export function chooseFavorGiant(rng = Math.random) {
  return FAVOR_GIANTS[Math.min(FAVOR_GIANTS.length - 1, Math.floor(rng() * FAVOR_GIANTS.length))];
}

/**
 * potion_favor.js canQuaff: once a day, and only with favor still to gain
 * before the emblem (favor_to_gain = min(111, max - current)). The tooltip is
 * written per bottle.
 */
export function favorCheck({ giant, quaffedToday = false, favor = 0, maxFavor = 0 } = {}) {
  if (quaffedToday) return { ok: false, error: POTION_TEXT.favorDaily };
  const name = favorGiantName(giant);
  const gain = Math.min(FAVOR_POTION_POINTS, Math.max(0, Math.floor(Number(maxFavor) - Number(favor)) || 0));
  if (gain <= 0) return { ok: false, error: `You must collect the Emblem of ${name} before you can quaff this`, gain: 0 };
  const tooltip = gain < FAVOR_POTION_POINTS ? `Gain ${gain} favor with ${name} to earn an Emblem` : `Gain ${gain} favor with ${name}`;
  return { ok: true, gain, tooltip };
}

/** potion_favor.js verbs.shake: three shakes a game day, each to a different Giant. */
export const FAVOR_SHAKES = 3;
const SHAKE_TOOLTIPS = ['Change the amicable giant. Three more shakes remaining today', 'Two more shakes remaining today', 'Last shake today'];

export function favorShakeButton(shakesToday = 0) {
  const n = Math.max(0, Math.floor(Number(shakesToday) || 0));
  const reason = n >= FAVOR_SHAKES ? 'Giants have had enough shaking for today. Try again tomorrow' : '';
  return { id: 'shake', label: 'Shake', tooltip: SHAKE_TOOLTIPS[n] || 'No more shakes today', enabled: !reason, reason, primary: false };
}

/** verbs.shake handler: choose_one(config.giants) until it differs from the bottle's. */
export function shakeFavorGiant(current, rng = Math.random) {
  const pool = FAVOR_GIANTS.filter((g) => g !== current);
  const giant = pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))];
  return { giant, message: `You shook the Draught of Giant Amicability. Quaffing it will now give favor with ${favorGiantName(giant)}` };
}

/** potion_favor.js onQuaff message. */
export function favorMessage(giant, gained) {
  return `You gained ${gained} favor with ${favorGiantName(giant)}`;
}

/** potion_keycutter_tonic.js replacements. */
export const KEY_REPLACEMENTS = Object.freeze(['door_key_1', 'door_key_2', 'door_key_3', 'door_key_4', 'door_key_5', 'door_key_6']);

export const isKeyClass = (classTsid) => /^door_key_\d+$/.test(String(classTsid || ''));

/** items/door_key_1..12.js name_single (the keys tagged `key`). */
export const KEY_NAMES = Object.freeze({
  door_key_1: 'Yellow-Purple Triangle Key',
  door_key_2: 'Green-White Circle Key',
  door_key_3: 'Orange-Blue Square Key',
  door_key_4: 'Teal-Red Hexagon Key',
  door_key_5: 'Red-Green Triangle Key',
  door_key_6: 'Purple-Orange Circle Key',
  door_key_7: 'Yellow-Teal Square Key',
  door_key_8: 'Blue-White Hexagon Key',
  door_key_9: 'Teal-White Triangle Key',
  door_key_10: 'Blue-Yellow Circle Key',
  door_key_11: 'Purple-Red Square Key',
  door_key_12: 'Green-Orange Hexagon Key',
});

/** valid_items: one row per key class in the pack. */
export function keyChoices(inv = {}) {
  return Object.keys(inv || {}).filter((id) => isKeyClass(id) && (Number(inv[id]) || 0) > 0).sort((a, b) => keyNumber(a) - keyNumber(b));
}

function keyNumber(id) {
  return Number(/(\d+)$/.exec(id)?.[1]) || 0;
}

export function keycutterCheck({ keys = [] } = {}) {
  return keys.length ? { ok: true } : { ok: false, error: POTION_TEXT.noKeys };
}

/** onQuaff: choose_one(replacements) until it is not the key you gave. */
export function keycutterReplacement(fromClass, rng = Math.random) {
  const pool = KEY_REPLACEMENTS.filter((id) => id !== fromClass);
  return pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))];
}

/** onQuaff response: a / an by the new key's first letter (config.vowels). */
export function keycutterMessage(oldLabel, newLabel) {
  const an = /^[aeiou]/i.test(String(newLabel || ''));
  return `Your ${oldLabel} has been replaced with ${an ? 'an' : 'a'} ${newLabel}.`;
}

/** potion_charades.js canQuaff: fewer than two players here. */
export function charadesCheck({ players = 1 } = {}) {
  return players < 2 ? { ok: false, error: POTION_TEXT.charades } : { ok: true };
}

/** potion_ancestral_spirits.js canQuaff: only under Overwhelming Ancestral Nostalgia, once per visit. */
export function ancestralCheck({ nostalgia = false, usedThisVisit = false } = {}) {
  if (!nostalgia) return { ok: false, error: POTION_TEXT.ancestral };
  if (usedThisVisit) return { ok: false, error: POTION_TEXT.ancestralOnce };
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* Pour potions                                                         */
/* ------------------------------------------------------------------ */

/** potion_animal_youth.js onPour: the baby each animal becomes. */
export const ANIMAL_BABIES = Object.freeze({ npc_chicken: 'chick', npc_piggy: 'piglet', npc_butterfly: 'caterpillar' });

/** findCloseStack(test, range): the closest candidate within range of x, or null. */
export function closestWithin(candidates = [], x = 0, range = POUR_RANGE, y = null) {
  let best = null;
  let bestD = Infinity;
  for (const c of candidates) {
    const dx = (Number(c.x) || 0) - x;
    const dy = y == null || c.y == null ? 0 : (Number(c.y) || 0) - y;
    const d = Math.hypot(dx, dy);
    if (d <= range && d < bestD) {
      best = c;
      bestD = d;
    }
  }
  return best;
}

/** potion_animal_youth canPour (+ getValidTargets). */
export function animalYouthCheck(target) {
  return target && ANIMAL_BABIES[target.classId] ? { ok: true } : { ok: false, error: POTION_TEXT.noAnimals };
}

/** canPour for the cloud and rainbow potions: not within 150 px of a signpost (x and y). */
export function nearSignpost(x, y, signposts = []) {
  return (signposts || []).some((s) => Math.abs(x - (Number(s.x) || 0)) < SIGNPOST_RANGE && Math.abs(y - (Number(s.y) || 0)) < SIGNPOST_RANGE);
}

/**
 * potion_rainbow_juice.js canPour refuses in the puzzle and memory rooms
 * (is_puzzle, and these instance ids); the remake's own room ids for them.
 */
export const RAINBOW_REFUSED_ROOMS = Object.freeze([
  'light_perspective', 'radiant_glare', 'mental_block', 'color_unblocking', 'picto_pattern',
]);

/**
 * canPour for Embiggenifying / De-Embiggenifying Potion and Rainbow Juice.
 * `room` is the street or scene id (lower case); `memory` is true inside the
 * game.js-run memories (Winter Walk, A Summer's Day, Paradise), which Rainbow
 * Juice refuses (level_quest_winter_*, blue_and_white).
 */
export function physicsPourCheck(classTsid, { x = 0, y = 0, signposts = [], room = '', memory = false, inLocation = true } = {}) {
  if (!inLocation) return { ok: false, error: POTION_TEXT.cantPourHere };
  const r = String(room || '').toLowerCase();
  if (classTsid === 'potion_rainbow_juice' && (memory || r.includes('puzzle') || RAINBOW_REFUSED_ROOMS.some((id) => r.includes(id)))) {
    return { ok: false, error: POTION_TEXT.unfair };
  }
  // potion_avatar_small.js: not inside Le Misérable.
  if (classTsid === 'potion_avatar_small' && r.includes('le_miserable')) return { ok: false, error: POTION_TEXT.cantPourHere };
  if (nearSignpost(x, y, signposts)) return { ok: false, error: POTION_TEXT.signpost };
  return { ok: true };
}

/**
 * The physics items the pours create (initInstanceProps): hitbox, the
 * physics they hand whoever touches them for `durationSec`, and how long the
 * item stays (onCreate apiSetTimer('apiDelete', …)).
 */
export const PHYSICS_ITEMS = Object.freeze({
  avatar_embiggenifier: Object.freeze({ w: 75, h: 130, pcScale: 1.2, gravity: 1, durationSec: 10, lifeSec: 120, removesOthers: true, sound: 'BIGENNIFY' }),
  avatar_smallifier: Object.freeze({ w: 75, h: 130, pcScale: 0.6, gravity: 1, durationSec: 10, lifeSec: 120, removesOthers: true, sound: 'SMALLIFY' }),
  anti_gravitys_rainbow: Object.freeze({ w: 25, h: 25, pcScale: 1, gravity: -5, durationSec: 2, lifeSec: 300, removesOthers: false, sound: '' }),
});

/** physics.js hitBox: w x h centred on the item, rising from its feet. */
export function touchesPhysicsItem(item, px, py, bodyH = 90) {
  const def = PHYSICS_ITEMS[item?.classTsid];
  if (!def) return false;
  const left = item.x - def.w / 2;
  const right = item.x + def.w / 2;
  const top = item.y - def.h;
  return px >= left && px <= right && py >= top && py - bodyH <= item.y;
}

/**
 * addCTPCPhysics: the effect a touch adds, keyed by the item; a cloud
 * (removes_ctpc_effects) first clears every other item's effect.
 * effects: { [itemId]: { classTsid, until } }
 */
export function touchPhysicsItem(effects, item, now = Date.now()) {
  const def = PHYSICS_ITEMS[item?.classTsid];
  if (!def) return { effects, sound: '' };
  const prev = Object.values(effects).find((e) => e.classTsid === item.classTsid && e.until > now);
  const next = def.removesOthers ? {} : { ...effects };
  next[item.id] = { classTsid: item.classTsid, until: now + def.durationSec * 1000 };
  // onPlayerCollision: the sound only when the scale changes.
  const sound = def.sound && !(prev && PHYSICS_ITEMS[prev.classTsid].pcScale === def.pcScale) ? def.sound : '';
  return { effects: next, sound };
}

/** Stacked physics of the running effects: scale (latest cloud) and gravity (product). */
export function physicsOf(effects = {}, now = Date.now()) {
  let scale = 1;
  let gravity = 1;
  let latest = -Infinity;
  for (const e of Object.values(effects)) {
    if (!(e.until > now)) continue;
    const def = PHYSICS_ITEMS[e.classTsid];
    if (!def) continue;
    gravity *= def.gravity;
    if (def.pcScale !== 1 && e.until > latest) {
      latest = e.until;
      scale = def.pcScale;
    }
  }
  return { scale, gravity };
}

/** The trees Trantsformation Fluid can become (this.replacements). */
export const TRANTSFORM_CLASSES = Object.freeze(['trant_bean', 'trant_bubble', 'trant_egg', 'trant_fruit', 'trant_gas', 'trant_spice', 'wood_tree']);

/**
 * getValidTargets is_trant: a trant or Wood Tree, an Egg Plant only on a
 * home street (pols_is_pol), never a poisoned one.
 */
export function isTrantsformable(target, { home = false, poisoned = false } = {}) {
  if (!target || !TRANTSFORM_CLASSES.includes(target.classId)) return false;
  if (target.classId === 'trant_egg' && !home) return false;
  return !poisoned;
}

/** canPour: maturity and health 4 or more (and someone else's tree on their home: not here). */
export function trantsformCheck(target) {
  if (!target) return { ok: false, error: POTION_TEXT.noTree };
  const state = target.state || {};
  if ((Number(state.maturity) || 0) < 4) return { ok: false, error: POTION_TEXT.treeSmall };
  if ((Number(state.health) || 0) < 4) return { ok: false, error: POTION_TEXT.treeWeak };
  return { ok: true };
}

/**
 * onPour: a different tree (no Egg Plant off a home street) at health 4 and
 * maturity max(4, maturity - 3).
 */
export function trantsformOutcome(classId, maturity, { home = false, rng = Math.random } = {}) {
  const pool = TRANTSFORM_CLASSES.filter((id) => id !== classId && (home || id !== 'trant_egg'));
  const choice = pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))];
  return { classId: choice, health: 4, maturity: Math.max(4, Math.floor(Number(maturity) || 0) - 3) };
}

/** onPour response: "The Fruit Tree is now a Bean Tree." (an for vowels). */
export function trantsformMessage(oldLabel, newLabel) {
  const an = /^[aeiou]/i.test(String(newLabel || ''));
  return `The ${oldLabel} is now ${an ? 'an' : 'a'} ${newLabel}.`;
}

/* ------------------------------------------------------------------ */
/* The Rug                                                              */
/* ------------------------------------------------------------------ */

/** furniture_rug.js verbs.munch: no conditions; FOX_EAT and feeling_called_love. */
export const RUG_MUNCH = Object.freeze({
  classTsid: 'furniture_rug',
  verb: 'munch',
  label: 'Munch',
  sound: 'FOX_EAT',
  buff: 'feeling_called_love',
  message: 'You munched a Rug.',
});
