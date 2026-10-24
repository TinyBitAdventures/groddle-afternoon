/**
 * Small pack verbs the original gave single items, as pure rules: the
 * sixteen spices' examine verbs (Spice Examiner), the six gases' verbs (Mad
 * Gasser) and Ice's crunch (Holy Zamboni, The Walking Frozed).
 * js/features/item-verbs-feature.js binds them to the pack.
 *
 * Every row is transcribed from that item's own verb in GameServerJS
 * (items/<class>.js verbs.<verb>: conditions, handler). Effects on other
 * players in the location are left out (there are none in a solo street).
 * A successful verb runs items/item.js:719 notifyVerb, which counts
 * `<class>:<verb>` and `VERB:<verb>:<class>` (itemVerbAchievementCounters).
 */

const ENERGY = "You don't have enough energy to do this.";
const DEPRESSED = 'You are too depressed to do this.';

/**
 * @typedef {{ classTsid: string, verb: string, label: string, tooltip: string, badge?: string,
 *   energyAbove?: number, moodAbove?: number, energyReason?: string, moodReason?: string,
 *   energy?: number, mood?: number, xp?: number, consume?: boolean, buff?: string, message: string, source: string }} ItemVerb
 */
const row = (classTsid, verb, label, tooltip, badge, rules, message, source) =>
  Object.freeze({ classTsid, verb, label, tooltip, badge, ...rules, message, source });

const spice = (classTsid, verb, label, rules, message, line = 201) =>
  row(classTsid, verb, label, 'Examine the spice', 'spice_examiner', rules, message, `items/${classTsid}.js:${line}`);

const gas = (classTsid, verb, label, tooltip, rules, message, line = 71) =>
  row(classTsid, verb, label, tooltip, 'mad_gasser', rules, message, `items/${classTsid}.js:${line}`);

/** Conditions return state null once the badge is owned: the verb is gone. */
export const ITEM_VERBS = Object.freeze([
  spice('black_pepper', 'sniff', 'Sniff', { counter: 'black_pepper:sniff', energyAbove: 2, energy: -2, xp: 3, consume: true }, 'You launch into a sneezing fit. You were expecting something different?'),
  spice('cumin', 'lick', 'Lick', { counter: 'cumin:lick', xp: 2, consume: true }, "Powdery cumin coats your tongue. It's not unpleasant, but it's not exactly pleasant, either."),
  spice('curry', 'scrutinize', 'Scrutinize', { counter: 'curry:scrutinize', energyAbove: 1, energy: -1, mood: 1 }, "Yep, that's curry all right."),
  spice('ginger', 'sniff', 'Sniff', { counter: 'ginger:sniff', energyAbove: 3, energy: -3, mood: 2 }, 'Ah, sweetly aromatic ginger. Tickly to the nose, soothing to the senses.'),
  spice('camphor', 'study', 'Study', { counter: 'camphor:study', energyAbove: 2, moodAbove: 2, energy: -2, mood: -2, xp: 2 }, 'Camphor is bitter, but knowledge is sweet. Slightly sticky, too.'),
  spice('cardamom', 'watch', 'Watch', { counter: 'cardamom:watch' }, 'You observe the cardamom closely for several minutes. Not surprisingly, it does nothing.'),
  spice('all_spice', 'consider', 'Consider', { counter: 'all_spice:consider', energyAbove: 5, energy: -5, xp: 2 }, 'Allspice may be the most basic of spices, but it deserves some consideration, too. Together you share a moment of mutual contemplation.', 228),
  spice('hot_pepper', 'blow_on', 'Blow on', { counter: 'hot_pepper:blow_on', moodAbove: 5, mood: -5, consume: true }, 'A cloud of hot pepper rises in the air. Your eyes! Your eyes!'),
  spice('licorice', 'flatter', 'Flatter', { counter: 'licorice:flatter', energyAbove: 1, energy: -1 }, 'The licorice seems stalwartly immune to your charms. Or is it?', 258),
  spice('mustard', 'plaster', 'Plaster', { counter: 'mustard:plaster', moodAbove: 4, mood: -4, energy: 10, consume: true }, "Ah, a good old-fashioned mustard plaster. It's good for what ails you."),
  spice('nutmeg', 'rub', 'Rub', { counter: 'nutmeg:rub', energyAbove: 5, energy: -5, mood: 3 }, 'You polish the nutmeg to a shiny gloss. This is strangely rewarding.'),
  spice('older_spice', 'gaze_at', 'Gaze at', { counter: 'older_spice:gaze_at', energyAbove: 5, energy: -5, buff: 'buff_remembering' }, 'This colorful handful of old(er) spice almost reminds you of something. Now if only you could remember what it is.'),
  spice('saffron', 'love', 'Love', { counter: 'saffron:love', energyAbove: 2, energy: -2, mood: 2 }, 'Awww. The saffron loves you back.'),
  spice('cinnamon', 'pinch', 'Pinch', { counter: 'cinnamon:pinch', energyAbove: 3, energy: -3, xp: 1 }, 'You\'ve always wondered what recipes mean when they ask for "a pinch of cinnamon." Now you know.'),
  spice('turmeric', 'palpitate', 'Palpitate', { counter: 'turmeric:palpitate', energyAbove: 2, energy: -2, mood: 2, xp: 10, consume: true }, 'Feels real turmericky, for sure.'),
  gas('helium', 'inhale', 'Inhale', 'Always tempting', { counter: 'helium:inhale', energyAbove: 3, energy: -3, mood: 15, xp: 5, consume: true }, 'True to form, inhaling helium makes you sound funny. And then you fall down.', 29),
  gas('laughing_gas', 'uncork', 'Uncork', "Just a bit can't hurt", { counter: 'laughing_gas:uncork', energyAbove: 2, energyReason: 'You are too exhausted for laughter.', energy: -2, mood: 2 }, 'The tiniest whiff of laughing gas escapes the vial, causing you to smirk uncontrollably before you wisely re-cork it.'),
  gas('general_vapour', 'shake', 'Shake', 'Probably futile', { counter: 'general_vapour:shake', energyAbove: 5, energy: -5, xp: 1 }, "What?!? Didn't your mother ever warn you not to shake your gases? You're lucky general vapor isn't volatile."),
  gas('crying_gas', 'sniff', 'Sniff', 'Certainly inadvisable', { counter: 'crying_gas:sniff', moodAbove: 2, mood: -2 }, 'Just a tiny sniff of crying gas makes you sniffle. *sniff*'),
  gas('heavy_gas', 'lift', 'Lift', 'A difficult-to-resist challenge', { counter: 'heavy_gas:lift', energyAbove: 3, moodAbove: 3, energy: -3, mood: -3, xp: 4, consume: true }, "Ooch! You forgot to lift with your legs. You're going to hurt in the morning. Actually, you hurt already."),
  gas('white_gas', 'smash', 'Smash', 'Smashing seems unnecessary', { counter: 'white_gas:smash', energyAbove: 2, moodAbove: 2, energy: -2, mood: -2, xp: 5, consume: true }, "Oh, dear. You probably shouldn't have smashed that. White gas can be extremely useful. Live and learn, right?"),
]);

/** garlic.js verbs.eat (an ordinary Eat in the remake) is the sixteenth Spice Examiner verb. */
export const GARLIC_EAT_COUNTER = 'garlic:eat';

export function itemVerbsFor(classTsid) {
  return ITEM_VERBS.filter((v) => v.classTsid === classTsid);
}

/**
 * The pack button: hidden (null) once its badge is owned, else the source
 * conditions. `ctx` = { energy, mood, unlocked: string[] }.
 */
export function itemVerbButton(def, ctx = {}) {
  if (!def) return null;
  if (def.badge && (ctx.unlocked || []).includes(def.badge)) return null;
  const energy = Number(ctx.energy) || 0;
  const mood = Number(ctx.mood) || 0;
  let reason = '';
  if (def.energyAbove != null && energy <= def.energyAbove) reason = def.energyReason || ENERGY;
  else if (def.moodAbove != null && mood <= def.moodAbove) reason = def.moodReason || DEPRESSED;
  return { id: def.verb, label: def.label, tooltip: def.tooltip, enabled: !reason, reason };
}

/** items/item.js:738-739 notifyVerb on a successful verb. */
export function itemVerbAchievementCounters(classTsid, verb, count = 1) {
  const n = Math.max(1, Math.floor(Number(count) || 1));
  return [
    { counter: `${classTsid}:${verb}`, amount: 1 },
    { counter: `VERB:${verb}:${classTsid}`, amount: n },
  ];
}

// ---------------------------------------------------------------------------
// Ice: crunch (items/ice.js:30-100)
// ---------------------------------------------------------------------------

export const ICE_TEXT = Object.freeze({
  tooltip: (n) => `Break it up. Costs ${3 * n} energy per cube`,
  tooTired: 'You are too tired to crunch ice.',
  notEnough: "You don't have enough energy to crunch that quantity of ice",
  chronic: 'You have chronic brain freeze from too many crunched cubes. You have nothing more to learn from crunching ice.',
  freeze: 'Ack, brain freeze! You can\'t feel your brain. Brrr…',
  crunched: 'The ice is crunched into many smaller tasty pieces as you crunch away. It is oddly pleasing.',
});

/** ice.js crunch conditions: more than 1 energy. */
export function iceCrunchButton(ctx = {}) {
  const tired = (Number(ctx.energy) || 0) <= 1;
  return { id: 'crunch', label: 'Crunch', tooltip: ICE_TEXT.tooltip(1), enabled: !tired, reason: tired ? ICE_TEXT.tooTired : '' };
}

/**
 * ice.js crunch handler for `count` cubes. Mutates pc (energy, mood, xp,
 * imagination) and returns { ok, msgs, consumed, achievementCounters }.
 * The cubes count toward Holy Zamboni before the energy check, as in the
 * source; then 3 energy per cube, and until the badge: 3 iMG per cube and
 * a 10% brain freeze (mood to zero, brain:frozen) instead of +6 mood per cube.
 */
export function crunchIce(pc, count = 1, ctx = {}) {
  const n = Math.max(1, Math.floor(Number(count) || 1));
  const rng = typeof ctx.rng === 'function' ? ctx.rng : Math.random;
  const rows = [{ counter: 'ice:cubes_crunched', amount: n }];
  if ((Number(pc.energy) || 0) <= n) return { ok: false, consumed: 0, msgs: [ICE_TEXT.notEnough], achievementCounters: rows };
  const msgs = [];
  if ((ctx.unlocked || []).includes('ice_cruncher')) {
    msgs.push(ICE_TEXT.chronic);
  } else {
    pc.imagination = (Number(pc.imagination) || 0) + 3 * n;
    pc.xp = (Number(pc.xp) || 0) + 3 * n;
    if (rng() < 0.1) {
      pc.mood = 0;
      rows.push({ counter: 'brain:frozen', amount: 1 });
      msgs.push(ICE_TEXT.freeze);
    } else {
      msgs.push(ICE_TEXT.crunched);
      const cap = Math.max(1, Number(ctx.moodMax) || 100);
      pc.mood = Math.min(cap, (Number(pc.mood) || 0) + 6 * n);
    }
  }
  pc.energy = Math.max(0, (Number(pc.energy) || 0) - 3 * n);
  return { ok: true, consumed: n, msgs, achievementCounters: [...rows, ...itemVerbAchievementCounters('ice', 'crunch', n)] };
}

/**
 * Apply one ItemVerb to pc. Returns { ok, msgs, consume, buff, effects }.
 * `ctx.energyMax` / `ctx.moodMax` cap the gains.
 */
export function runItemVerb(def, pc, ctx = {}) {
  const button = itemVerbButton(def, { energy: pc.energy, mood: pc.mood, unlocked: ctx.unlocked });
  if (!button) return { ok: false, msgs: [] };
  if (!button.enabled) return { ok: false, msgs: [button.reason] };
  const effects = {};
  const energyCap = Math.max(1, Number(ctx.energyMax) || 100);
  const moodCap = Math.max(1, Number(ctx.moodMax) || 100);
  if (def.energy) {
    const before = Number(pc.energy) || 0;
    pc.energy = Math.max(0, Math.min(energyCap, before + def.energy));
    effects.energy = pc.energy - before;
  }
  if (def.mood) {
    const before = Number(pc.mood) || 0;
    pc.mood = Math.max(0, Math.min(moodCap, before + def.mood));
    effects.mood = pc.mood - before;
  }
  if (def.xp) {
    pc.imagination = (Number(pc.imagination) || 0) + def.xp;
    pc.xp = (Number(pc.xp) || 0) + def.xp;
    effects.xp = def.xp;
  }
  return {
    ok: true,
    msgs: [def.message],
    consume: Boolean(def.consume),
    buff: def.buff || null,
    effects,
    // notifyVerb: `<class>:<verb>` (the row's own literal) and `VERB:<verb>:<class>`.
    achievementCounters: [{ counter: def.counter, amount: 1 }, ...itemVerbAchievementCounters(def.classTsid, def.verb).slice(1)],
  };
}
