/**
 * Harvestable trees (trants) — math extracted from GSJS:
 * - items/include/trants.js (canHarvest, performHarvest, maturity)
 * - items/catalog_skill_packages.js → gardening_harvest (Arborology)
 * - items/trant_*.js → fruitProdMap / fruitCapMap / fruit_class
 * - inc_data_imagination.js → per-tree 4× super-harvest upgrades
 *
 * Maturity 0–10 (0 dead/hole, 1 sprout … 10 max). Fruit only at maturity ≥ 3–4.
 * Capacity/production are 10×10 tables indexed [maturity][health] (1-based in game; 0 unused).
 */

/** Arborology skill ranks → gardening_harvest package (catalog_skill_packages.js). */
export const ARBOROLOGY_HARVEST = {
  no_skill: {
    skillId: null,
    rank: -1,
    intervalLimit: 1, // harvests per tree per game day
    durationMs: 5000,
    energyCost: 5,
    moodBonus: 1,
    xpBonus: 0,
    bonusAmount: 3, // base items taken per harvest
    dropChance: 0,
  },
  gardening_1: {
    skillId: 'gardening_1',
    rank: 1,
    intervalLimit: 1,
    durationMs: 2000,
    energyCost: 5,
    moodBonus: 1,
    xpBonus: 0,
    bonusAmount: 6,
    dropChance: 0,
  },
  gardening_2: {
    skillId: 'gardening_2',
    rank: 2,
    intervalLimit: 2, // twice per game day
    durationMs: 2000,
    energyCost: 5,
    moodBonus: 1,
    xpBonus: 2,
    bonusAmount: 6,
    dropChance: 0,
  },
  gardening_3: {
    skillId: 'gardening_3',
    rank: 3,
    intervalLimit: 2,
    durationMs: 2000,
    energyCost: 2,
    moodBonus: 2,
    xpBonus: 2,
    bonusAmount: 12,
    dropChance: 0.06,
  },
  gardening_4: {
    skillId: 'gardening_4',
    rank: 4,
    intervalLimit: 2,
    durationMs: 2000,
    energyCost: 2,
    moodBonus: 2,
    xpBonus: 5,
    bonusAmount: 12,
    dropChance: 0.09,
  },
  gardening_5: {
    skillId: 'gardening_5',
    rank: 5,
    intervalLimit: 2,
    durationMs: 2000,
    energyCost: 2,
    moodBonus: 2,
    xpBonus: 5,
    bonusAmount: 12,
    dropChance: 0.09,
  },
};

/** Super-harvest imagination upgrades (generic tree, 2×). Per-type 4× when type upgrade owned. */
export const SUPER_HARVEST = {
  gardening_tree_super_harvest_1: { multiplier: 2, chance: 0.06 },
  gardening_tree_super_harvest_2: { multiplier: 2, chance: 0.1 },
  gardening_tree_super_harvest_3: { multiplier: 2, chance: 0.14 },
};

/** Per-fruit-class 4× upgrade ids (inc_data_imagination.js). */
export const TYPE_SUPER_HARVEST = {
  bean_plain: 'gardening_harvest_bean',
  plain_bubble: 'gardening_harvest_bubble',
  egg_plain: 'gardening_harvest_egg',
  cherry: 'gardening_harvest_fruit',
  general_vapour: 'gardening_harvest_gas',
  all_spice: 'gardening_harvest_spice',
};

export const MATURITY_LABELS = [
  'hole', // 0
  'sprout', // 1
  'tiny', // 2
  'small', // 3
  'growing', // 4
  'medium', // 5
  'large', // 6
  'tall', // 7
  'very large', // 8
  'huge', // 9
  'extra large', // 10
];

/** Static meta for living trant classes (production tables loaded from JSON). */
export const TRANT_META = {
  trant_fruit: { label: 'Fruit Tree', fruitClass: 'cherry', fruitLabel: 'Cherries' },
  trant_egg: { label: 'Egg Plant', fruitClass: 'egg_plain', fruitLabel: 'Eggs' },
  trant_bean: { label: 'Bean Tree', fruitClass: 'bean_plain', fruitLabel: 'Beans' },
  trant_bubble: { label: 'Bubble Tree', fruitClass: 'plain_bubble', fruitLabel: 'Bubbles' },
  trant_spice: { label: 'Spice Plant', fruitClass: 'all_spice', fruitLabel: 'Allspice' },
  trant_gas: { label: 'Gas Plant', fruitClass: 'general_vapour', fruitLabel: 'Vapour' },
};

/** Original tree talkback after an ordinary harvest, grouped by Arborology tier. */
export const TRANT_HARVEST_RESPONSES = Object.freeze({
  trant_fruit: Object.freeze({
    low: Object.freeze(['Yup.', 'Mhm.', 'Frooo?', 'Wannit?', "F'yoo."]),
    middle: Object.freeze(["Aa'ight?", 'Takkit.', 'Here.', 'Fruit?', 'Dunnit…']),
    high: Object.freeze(['Fruity!', 'Ta-daaaaaaa…', 'Yaaaaaay!', 'Frooooot!', "C'est la!"]),
  }),
  trant_egg: Object.freeze({
    low: Object.freeze(['This. For you.', 'We grew this. You take.', 'This harvest good. Have it.', 'Ooooof. Take harvest. Heavy.', 'We made this. You can have.']),
    middle: Object.freeze(["You deserve this harvest - No! This 'Bounty'.", 'Your harvesting improves. Well done. Magnificent.', "Egg-Zempleraryaryary harvesting action. Yes, that's a word.", 'Your reach astounds us. Such poise!', 'A grandiose harvesting for a little Glitchling.']),
    high: Object.freeze(['A virtuoso harvester deserves munificent harvest.', 'You have superseded our expectations. Brava!', 'Any more praise is superfluous. Take eggs.', 'You have garnered a mighty, mighty yield, little one.', 'A great and glorious future awaits you… also: eggs.']),
  }),
  trant_bean: Object.freeze({
    low: Object.freeze(["Is that what you've bean looking for?", 'Cool. Beans. Cool beans!', 'Two bean, or not two bean?…', 'You favored us. Now, we fava you. Ha ha. Like "fava bean".', 'Wassssss-sap! Ha ha ha. Oh just take bean then.']),
    middle: Object.freeze(["Your proficiency in this 'field' astounds. Get it? Field?", "Beans, eh? You're barking up the right tree, then…", 'Don\'t forget to say "Trunk You"! Heh. No, was joke.', "Take lots. We're 'rooting' for you. Ha ha. That was joke.", "I think I've run out of puns. Not beans tho'. Take."]),
    high: Object.freeze(["We 'bough' to your superior arborology skills. Ha. We are funny.", 'Heavy crops hurt my \'lumber\' region. Ha ha.', 'Bean good dealing with you, kid.', "A haul beyond beleaf! I've never bean prouder.", "You've got your finger on the pulse, kid. Ha ha ha."]),
  }),
  trant_bubble: Object.freeze({
    low: Object.freeze(['Hey! Pssst. You like bubbles? Here.', 'What? Bubbles? Mine? Why? Well, ok…', "…Fine. Take them. Don't let it get back to The Man…", "Here! But shh… Don't tell anyone they're from me.", 'Bubbles! Now move along before anyone sees you.']),
    middle: Object.freeze(['…know the power you hold in your hands…', 'Bubbles. Precious bubbles. Just for you. Pop-pop!', '…which is why harvesting is crucial to… Oh! Shh.', "Wait, my tin hat didn't fall in with that haul, right?", "…Again? You're up to something, I sense it."]),
    high: Object.freeze(['…and I promised never to tell anyone. Oh! Who are you?', "Ha? Snuck up, eh? You're learning, little'un.", 'If you see my hat anywhere, bring it? Handcrafted? Tin?', "Anyone but you, I'd tell them to bubble off.", '…a sour smell, like scorched batterfly wing, and…']),
  }),
  trant_spice: Object.freeze({
    low: Object.freeze(['Ooooo! Easy there, little grabbyhands…', "Careful what you're yanking, little friend.", "Well now. It's a little spice you're after, is it?", 'My… you\'re a little handsy. Have we been introduced?', 'Oooh! I say! Goosed by a Glitchling.']),
    middle: Object.freeze(['A little of the good stuff? Well, just for you…', 'For you? But of course!', "Oh yes, you're packing some heat now.", 'As they say, spice is the life of varie… that sounds wrong.', "Ooooh, you're a hungry little thing, aren't you?"]),
    high: Object.freeze(['Ahhh, spicy, spicy, spicy…', "My my, you can't get enough of ol' Spicy, can you?", 'You can harvest me whenever you like, poppet.', 'Here, my pretty. Spice up your life.', "As they say, spice is the spice of… no, that's not right."]),
  }),
  trant_gas: Object.freeze({
    low: Object.freeze(['You want gas? Dude, sure.', 'Always happy to share, friend.', 'Yeah, harvest away. Gas is a social thing, friend.', 'Gas? For you? Yeah, man.', "You sure that's enough? Come back for a re-up anytime."]),
    middle: Object.freeze(['My little squishy sibling! You came for gas? Cool.', 'Gas? Yeah… Groovy, child. Groovy.', "Yeah, man. Take all you need, I'm good.", 'Spread the gas, spread the love.', 'Feel free to pump me for this any time.', 'Whatcha gonna do with all that gas? All that gas inside your… inventory?']),
    high: Object.freeze(["Yeah, man, take all you want. I'm cool.", 'You should share this with friends, you dig?', "Glad you're enjoying the produce, dude.", 'Ah, little squishy sibling. For you? Always, man.', 'Here, friend. 100% pure, organic gas.']),
  }),
});

export function trantHarvestResponse(classTsid, arbor, harvestNumber = 1) {
  const rank = Number(arbor?.rank ?? -1);
  const tier = rank >= 4 ? 'high' : rank >= 2 ? 'middle' : 'low';
  const pool = TRANT_HARVEST_RESPONSES[classTsid]?.[tier] || [];
  if (!pool.length) return '';
  const index = Math.max(0, Math.floor(Number(harvestNumber) || 1) - 1) % pool.length;
  return pool[index];
}

export const LIVING_TRANT_CLASS_IDS = Object.freeze(Object.keys(TRANT_META));

function stableStreetHash(value) {
  let hash = 2166136261;
  for (const char of String(value || '')) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/**
 * Give every street a stable run of living-trant species. The original starter
 * street retains Fruit/Egg/Bean for onboarding; the full street catalog rotates
 * through all six official species without random reshuffling on reload.
 */
export function livingTrantPlanForStreet(streetTsid, count = 3) {
  const total = Math.max(0, Math.floor(Number(count) || 0));
  const offset = streetTsid === 'LM411BNOGTUG2'
    ? 0
    : stableStreetHash(streetTsid) % LIVING_TRANT_CLASS_IDS.length;
  return Array.from(
    { length: total },
    (_, index) => LIVING_TRANT_CLASS_IDS[(offset + index) % LIVING_TRANT_CLASS_IDS.length]
  );
}

let tables = null;

/**
 * @param {Record<string, object>} data  assets/content/trants.json
 */
export function setTrantTables(data) {
  tables = data;
}

export function getTrantTables() {
  return tables;
}

/**
 * Highest arborology package the player qualifies for.
 * @param {{ skills?: string[] }|string[]} skillStateOrList
 */
export function resolveArborologyPackage(skillStateOrList) {
  const list = Array.isArray(skillStateOrList)
    ? skillStateOrList
    : skillStateOrList?.learned || skillStateOrList?.skills || [];
  const has = (id) => list.includes(id);
  for (const rank of [5, 4, 3, 2, 1]) {
    if (has(`gardening_${rank}`)) return ARBOROLOGY_HARVEST[`gardening_${rank}`];
  }
  return ARBOROLOGY_HARVEST.no_skill;
}

/**
 * Table cell for maturity/health 1-10: include/trants.js reads
 * map[maturity - 1][health - 1] (updateFruitCap, onFruitCycle); 0 has no cell.
 */
function trantCell(t, maturity, health) {
  const m = Math.min(10, Math.floor(Number(maturity) || 0));
  const h = Math.min(10, Math.floor(Number(health) || 0));
  if (m < 1 || h < 1) return 0;
  return t[m - 1]?.[h - 1] ?? 0;
}

/**
 * Fruit capacity for maturity/health (updateFruitCap).
 * @param {string} classTsid
 * @param {number} maturity 1–10
 * @param {number} health 1–10
 */
export function fruitCapacityAt(classTsid, maturity, health) {
  const t = tables?.[classTsid]?.fruitCapMap;
  if (!t) return 0;
  return trantCell(t, maturity, health);
}

/**
 * Production rate cell (how fast fruit refills — used by tick systems).
 */
export function fruitProductionAt(classTsid, maturity, health) {
  const t = tables?.[classTsid]?.fruitProdMap;
  if (!t) return 0;
  return trantCell(t, maturity, health);
}

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

/**
 * Create runtime state for a planted trant.
 * @param {string} classTsid
 * @param {{ maturity?: number, health?: number, fruitCount?: number }} [opts]
 */
export function createTrantState(classTsid, opts = {}) {
  const maturity = opts.maturity ?? 7;
  const health = opts.health ?? 8;
  const cap = fruitCapacityAt(classTsid, maturity, health);
  return {
    classTsid,
    maturity,
    health,
    fruitCapacity: cap,
    fruitCount: opts.fruitCount ?? cap,
    /** harvests used this game day on this tree */
    harvestsToday: 0,
    petted: false,
    watered: false,
  };
}

/**
 * @param {ReturnType<typeof createTrantState>} state
 * @param {object} arbor  from resolveArborologyPackage
 */
export function canHarvestTrant(state, arbor) {
  if (!state || state.maturity < 3) {
    return { ok: false, reason: 'This tree is too small to harvest.', limit: arbor.intervalLimit };
  }
  if ((state.fruitCount || 0) <= 0) {
    return { ok: false, reason: "There's nothing to pick, cowboy.", limit: arbor.intervalLimit };
  }
  if ((state.harvestsToday || 0) >= arbor.intervalLimit) {
    return {
      ok: false,
      reason: `You can only harvest from each tree ${arbor.intervalLimit} time${arbor.intervalLimit > 1 ? 's' : ''} per game day.`,
      limit: arbor.intervalLimit,
    };
  }
  return { ok: true, limit: arbor.intervalLimit };
}

/**
 * Resolve super-harvest multiplier + chance from upgrades.
 * @param {string[]} upgrades  imagination upgrade ids owned
 * @param {string} fruitClass
 */
export function resolveSuperHarvest(upgrades, fruitClass) {
  const set = new Set(upgrades || []);
  // Type-specific 4× (requires super_harvest_3 + achievement in original; we only check upgrade id)
  const typeId = TYPE_SUPER_HARVEST[fruitClass];
  if (typeId && set.has(typeId)) {
    return { multiplier: 4, chance: 0.1 };
  }
  for (const id of [
    'gardening_tree_super_harvest_3',
    'gardening_tree_super_harvest_2',
    'gardening_tree_super_harvest_1',
  ]) {
    if (set.has(id) && SUPER_HARVEST[id]) {
      return { ...SUPER_HARVEST[id] };
    }
  }
  return { multiplier: 1, chance: 0 };
}

/**
 * Perform one harvest (pure). Mutates state.
 * @param {ReturnType<typeof createTrantState>} state
 * @param {{ learned?: string[], imaginationUpgrades?: string[] }} player
 * @param {{ rng?: () => number }} [opts]  rng → [0,1)
 */
export function harvestTrant(state, player = {}, opts = {}) {
  const rng = opts.rng || Math.random;
  const arbor = resolveArborologyPackage(player.learned || player.skills || []);
  const check = canHarvestTrant(state, arbor);
  if (!check.ok) return { ok: false, reason: check.reason, arbor };

  const meta = TRANT_META[state.classTsid] || tables?.[state.classTsid] || {};
  const fruitClass = meta.fruitClass || tables?.[state.classTsid]?.fruitClass || 'cherry';
  const superH = resolveSuperHarvest(player.imaginationUpgrades || [], fruitClass);

  const willTake = arbor.bonusAmount;
  let superBonus = 0;
  let gotSuper = false;
  if (superH.multiplier > 1 && rng() < superH.chance) {
    superBonus = willTake * (superH.multiplier - 1);
    gotSuper = true;
  }

  // The original removes only the ordinary yield from the tree. A super harvest
  // creates its bonus separately, so the bonus neither requires nor drains fruit.
  const available = Math.max(0, Number(state.fruitCount) || 0);
  const baseGot = Math.min(willTake, available);
  state.fruitCount = available - baseGot;
  state.harvestsToday = (state.harvestsToday || 0) + 1;
  const superGot = gotSuper ? superBonus : 0;
  const got = baseGot + superGot;

  return {
    ok: true,
    fruitClass,
    fruitLabel: meta.fruitLabel || fruitClass,
    amount: got,
    baseAmount: baseGot,
    superAmount: superGot,
    superHarvest: gotSuper && superGot > 0,
    superMultiplier: superH.multiplier,
    energyCost: arbor.energyCost,
    moodBonus: arbor.moodBonus,
    xpBonus: arbor.xpBonus,
    remainingOnTree: state.fruitCount,
    harvestsToday: state.harvestsToday,
    harvestsLimit: arbor.intervalLimit,
    reaction: trantHarvestResponse(state.classTsid, arbor, state.harvestsToday),
    arbor,
  };
}

/**
 * Pet/water tend: health +1 once both have landed this period (performTending);
 * optional free fruit at LGT III (rare — skipped here).
 * @param {ReturnType<typeof createTrantState>} state
 * @param {'pet'|'water'} kind
 */
export function tendTrant(state, kind) {
  if (kind === 'pet') state.petted = true;
  if (kind === 'water') state.watered = true;
  if (state.petted && state.watered) state.health = clamp((state.health || 5) + 1, 1, 10);
  // Refresh capacity if maturity/health changed
  state.fruitCapacity = fruitCapacityAt(state.classTsid, state.maturity, state.health);
  if (state.fruitCount > state.fruitCapacity) state.fruitCount = state.fruitCapacity;
  return state;
}

/**
 * Grow one maturity step if healthy enough (simplified onMaturityCycle).
 * @param {ReturnType<typeof createTrantState>} state
 * @param {() => number} [rng]
 */
export function tickMaturity(state, rng = Math.random) {
  if (state.maturity >= 10) return state;
  if ((state.health || 0) < 5) return state;
  // Use mid-tier chance ~0.2 when health is good
  if (rng() < 0.25) {
    state.maturity = clamp(state.maturity + 1, 0, 10);
    state.fruitCapacity = fruitCapacityAt(state.classTsid, state.maturity, state.health);
    // Partial fill on growth
    state.fruitCount = Math.min(
      state.fruitCapacity,
      state.fruitCount + Math.floor(state.fruitCapacity * 0.3)
    );
  }
  return state;
}

/**
 * Refill fruit toward capacity (respawn between harvests / new day).
 * @param {ReturnType<typeof createTrantState>} state
 * @param {number} [fraction=1] 1 = full refill
 */
export function refillFruit(state, fraction = 1) {
  const cap = fruitCapacityAt(state.classTsid, state.maturity, state.health);
  state.fruitCapacity = cap;
  const target = Math.floor(cap * fraction);
  state.fruitCount = Math.min(cap, Math.max(state.fruitCount, target));
  return state;
}

/** Reset per-tree daily harvest counters (new game day). */
export function resetTrantDay(state) {
  state.harvestsToday = 0;
  state.petted = false;
  state.watered = false;
  return state;
}

export function maturityLabel(m) {
  return MATURITY_LABELS[clamp(m, 0, 10)] || String(m);
}

export function trantStatusLabel(state, meta = TRANT_META[state?.classTsid] || {}) {
  const care = [state?.petted ? 'petted' : '', state?.watered ? 'watered' : '']
    .filter(Boolean)
    .join(' + ');
  const base = `${maturityLabel(state?.maturity)} · ${Math.max(0, Number(state?.fruitCount) || 0)} ${meta.fruitLabel || 'fruit'}`;
  return care ? `${base} · ${care}` : base;
}
