/**
 * Sno Cones (items/sno_cone_blue|green|orange|red|purple|rainbow.js over
 * their shared include sno_cone_base), as pure rules.
 * js/features/sno-cones-feature.js binds them to the pack and the street.
 *
 * sno_cone_base replaces food's Eat: no energy at all, but iMG (classProps
 * eat_xp), a level gate (classProps eat_min_level) and, from the fourth cone
 * of a game day, a 50% brain freeze that empties your mood instead of the
 * iMG and counts brain:frozen (The Walking Frozed). The food variety verbs
 * (Eat • Bonus iMG) never show: sno cones lack the foodbonus tag
 * (include/food.js food_gives_bonus returns "none").
 *
 * A dropped cone: Pick up only at home ("You can't unscramble an egg"),
 * Bemoan for a little iMG (and the cone is gone), and it melts away 30
 * minutes after the drop (drop handler apiSetTimer onMelt).
 *
 * The Rainbo Sno Cone's eat_min_level is 0 (the sno_cone_base default) though
 * its info page says level 15; the eat handler reads the classProp, so any
 * level may eat one.
 */

/** classProps eat_min_level / eat_xp and the bemoan verb's iMG and line, per cone. */
export const SNO_CONES = Object.freeze({
  sno_cone_blue: Object.freeze({ minLevel: 2, xp: 37, bemoanXp: 19, bemoan: 'Sigh. You should have known not to drop a cone.' }),
  sno_cone_green: Object.freeze({ minLevel: 4, xp: 75, bemoanXp: 37, bemoan: 'Oy. A dropped cone is a real wasted opportunity.' }),
  sno_cone_orange: Object.freeze({ minLevel: 6, xp: 150, bemoanXp: 75, bemoan: 'Drat, drat, drat. A dropped cone. I hope you learned something.' }),
  sno_cone_red: Object.freeze({ minLevel: 8, xp: 300, bemoanXp: 150, bemoan: 'Grrr. Pffft. A dropped sno cone is a painful thing to behold.' }),
  sno_cone_purple: Object.freeze({ minLevel: 11, xp: 550, bemoanXp: 275, bemoan: 'Aiy! Wail!! That is an expensive lesson.' }),
  sno_cone_rainbow: Object.freeze({ minLevel: 0, xp: 1100, bemoanXp: 550, bemoan: 'Aiy! Wail!! That is an expensive lesson.' }),
});

export const SNO_CONE_TEXT = Object.freeze({
  eatTooltip: 'Gives some iMG',
  eatTooltipRisky: 'Careful! Eating this might freeze your brain, which will cost you all your mood!',
  almost: 'This Sno Cone almost gave you a Brain Freeze! I would consider carefully before eating another one today.',
  froze: 'Aiiiiiii! Can\'t… feel… my brain?!? Brain freeze!',
  lucky: 'Huh! No brain freeze! Lucky!',
  level: (n) => `You must be at least level ${n} to eat this sno cone.`,
  bemoanTooltip: 'Grieve, for you cannot eat it',
  pickupTooltip: 'You saved it!',
  pickupRefused: "You can't unscramble an egg. And once you drop a sno cone, you're out of luck.",
});

/** sno_cone_base drop: apiSetTimer('onMelt', 30 * 60 * 1000). */
export const SNO_CONE_MELT_MS = 30 * 60 * 1000;

/** Brain freeze odds from the fourth cone of the day: is_chance(0.5). */
export const BRAIN_FREEZE_CHANCE = 0.5;

export function isSnoCone(classTsid) {
  return Object.prototype.hasOwnProperty.call(SNO_CONES, String(classTsid || ''));
}

/** achievements_get_daily_group_sum('sno_cones_eaten') for `day` ({ day, eaten }). */
export function conesEatenToday(state, day) {
  return state && state.day === day ? Math.max(0, Math.floor(Number(state.eaten) || 0)) : 0;
}

/**
 * The Eat button: the handler has no conditions (the level check fails inside
 * it), and get_tooltip warns once more than three cones went down today.
 */
export function snoConeEatButton(classTsid, eatenToday = 0) {
  if (!isSnoCone(classTsid)) return null;
  return {
    id: 'eat',
    label: 'Eat',
    tooltip: eatenToday > 3 ? SNO_CONE_TEXT.eatTooltipRisky : SNO_CONE_TEXT.eatTooltip,
    enabled: true,
    reason: '',
    primary: true,
  };
}

/**
 * sno_cone_base eat handler for one cone (is_single). Mutates pc (xp,
 * imagination, mood) and returns { ok, msgs, eatenToday, froze, xp,
 * achievementCounters }. A failed level check eats nothing; otherwise the
 * cone is used up (apiDelete) whether or not your brain froze.
 */
export function eatSnoCone(classTsid, pc, { eatenToday = 0, rng = Math.random } = {}) {
  const def = SNO_CONES[classTsid];
  if (!def) return { ok: false, msgs: [], eatenToday };
  const level = Math.max(0, Math.floor(Number(pc?.level) || 0));
  if (level < def.minLevel) {
    return { ok: false, reason: 'level', msgs: [SNO_CONE_TEXT.level(def.minLevel)], eatenToday, achievementCounters: [] };
  }
  const eaten = Math.max(0, Math.floor(Number(eatenToday) || 0)) + 1;
  const msgs = [];
  const rows = [];
  let froze = false;
  if (eaten === 3) {
    msgs.push(SNO_CONE_TEXT.almost);
  } else if (eaten > 3) {
    if (rng() < BRAIN_FREEZE_CHANCE) {
      froze = true;
      msgs.push(SNO_CONE_TEXT.froze);
      rows.push({ counter: 'brain:frozen', amount: 1 });
      pc.mood = 0;
    } else {
      msgs.push(SNO_CONE_TEXT.lucky);
    }
  }
  let xp = 0;
  if (!froze) {
    xp = def.xp;
    pc.imagination = (Number(pc.imagination) || 0) + xp;
    pc.xp = (Number(pc.xp) || 0) + xp;
  }
  return { ok: true, msgs, eatenToday: eaten, froze, xp, achievementCounters: rows };
}

/** The bemoan verb (in location): 19-550 iMG per cone and the cones are gone. */
export function bemoanSnoCone(classTsid, pc, count = 1) {
  const def = SNO_CONES[classTsid];
  if (!def) return null;
  const n = Math.max(1, Math.floor(Number(count) || 1));
  const xp = def.bemoanXp * n;
  pc.imagination = (Number(pc.imagination) || 0) + xp;
  pc.xp = (Number(pc.xp) || 0) + xp;
  return { ok: true, xp, count: n, msgs: [def.bemoan] };
}

/** onMelt: a dropped stack 30 minutes after its drop (droppedAt) is gone. */
export function snoConeMelted(stack, now = Date.now()) {
  if (!isSnoCone(stack?.classTsid)) return false;
  const at = Number(stack.droppedAt) || 0;
  return at > 0 && now - at >= SNO_CONE_MELT_MS;
}
