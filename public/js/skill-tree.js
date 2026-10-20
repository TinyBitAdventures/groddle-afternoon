/**
 * The whole skill tree as the Skills panel sees it: categories, families,
 * per-skill study state, prerequisite chains, search/filter, Giant emblem
 * unlocks, and an honest note on what each skill does in this remake.
 *
 * Sources:
 * - inc_data_skills.js (via assets/content/skills.json): names, ranks,
 *   point costs, prerequisites, category ids, Giant affiliations.
 * - inc_data_imagination.js learntime_* upgrades: the seven category names
 *   ("Alchemy skills", "Animal skills", "Cooking skills", "Growing skills",
 *   "Gathering skills", "Industrial skills", "Intellectual skills").
 * - items/emblem_base doSpend/modal_callback: spending a Giant emblem grants
 *   `emblem_skill_unlock_<giant>_1`, the prerequisite for one skill each.
 */

import { getSkillCatalog } from './content-catalogs.js';
import { canLearnSkill, getStudyStatus, studySecondsForSkill } from './skills.js';

export const SKILL_CATEGORIES = Object.freeze({
  6: 'Alchemy',
  8: 'Cooking',
  11: 'Industrial',
  14: 'Animals',
  16: 'Gathering',
  17: 'Growing',
  19: 'Intellectual',
});

export const SKILL_CATEGORY_ORDER = Object.freeze([14, 17, 16, 8, 6, 11, 19]);

/** Status words used by the panel badges and the audit table. */
export const REMAKE_STATUS = Object.freeze({
  live: 'Works here',
  partial: 'Partly here',
  later: 'Not here yet',
  multiplayer: 'Needs other players',
});

/**
 * What each skill does in Groddle Afternoon, by family name, with optional
 * per-rank overrides. `status` is the honest summary; `note` is shown in the
 * panel under "In this remake".
 */
export const SKILL_REMAKE_NOTES = Object.freeze({
  // Animals
  'Animal Kinship': {
    status: 'live',
    note: 'Every rank changes petting, nibbling, squeezing, massaging and milking: faster actions, better success, more daily uses and bigger yields (exact Animal Kinship 1 to 7 tables).',
    ranks: {
      animalkinship_3: { note: 'Faster, surer animal care, and lets you feed Metal Rods to the Sloth for snails.' },
      animalkinship_5: {
        status: 'partial',
        note: 'Better animal care, and you can name Heli Kitties. Naming piggies, chickens and butterflies is not here yet.',
      },
    },
  },
  'Animal Husbandry': {
    status: 'partial',
    note: 'Unlocks the Egg Seasoner recipes. Incubating eggs into new animals is not here yet.',
  },
  'Fox Brushing': {
    status: 'live',
    note: 'Brushing foxes yields 10 to 12 more Fiber per brush, for more iMG and half the Fox Brush wear.',
  },
  Herdkeeping: {
    status: 'later',
    note: 'Capturing piggies, chickens and butterflies with Magic Sticks is not here yet. Learning it still opens Remote Herdkeeping.',
  },
  'Remote Herdkeeping': {
    status: 'later',
    note: 'Meat Collectors, Butterfly Milkers and Piggy Feeders are not here yet.',
  },

  // Growing
  'Soil Appreciation': {
    status: 'live',
    note: 'Digging patches and dirt piles gets faster and cheaper, with loam and soil drops, at each of the five ranks.',
    ranks: {
      soil_appreciation_5: { note: 'The best digging, and (with Tinkering V) unlocks the Ace of Spades recipe on the Tinkertool.' },
    },
  },
  'Light Green Thumb': {
    status: 'live',
    note: 'Petting and watering trees gets faster and surer at each rank (exact Light Green Thumb 1 to 3 tables).',
    ranks: {
      light_green_thumb_3: { note: 'Best tree care, and (with Tinkering V) unlocks the Irrigator 9000 recipe on the Tinkertool.' },
    },
  },
  Croppery: {
    status: 'live',
    note: 'Crop gardens: without Croppery you get half a harvest and watering or picking can fail. Each rank cuts energy and adds mood and iMG; Croppery III adds a 6% double Super Harvest.',
    ranks: {
      croppery_1: { note: 'Full crop harvests, no failed watering or picking, and mood and iMG for planting, watering and hoeing.' },
      croppery_2: { note: 'Cheaper planting and hoeing, more mood and iMG. (The random drops it adds are not here yet.)' },
      croppery_3: { note: 'More mood and iMG, and a 6% chance of a double Super Harvest.' },
    },
  },
  Herbalism: {
    status: 'live',
    note: 'Herb gardens: without Herbalism you get half a harvest and watering or picking can fail. Herbalism II and III add 10% and 20% double Super Harvests. Extracting seeds from herbs is not here yet.',
    ranks: {
      herbalism_1: { note: 'Full herb harvests, no failed watering or picking, cheaper planting, mood and iMG for garden work.' },
      herbalism_2: { note: 'More mood and iMG, and a 10% chance of a double herb Super Harvest.' },
      herbalism_3: { note: 'Cheapest planting, most mood and iMG, and a 20% double Super Harvest.' },
    },
  },
  Botany: {
    status: 'partial',
    note: 'Unlocks the Bean Seasoner, which turns plain beans into seeds for other trees. Poisoning and curing trees are not here yet.',
  },
  'Master Gardener': {
    status: 'later',
    note: 'Needs two imagination upgrades (watering and clearing time) that cannot be bought here yet, and its garden potions are not here.',
  },
  Nudgery: {
    status: 'live',
    note: 'Lets you nudge (move) the cultivation items on your home street.',
  },

  // Gathering
  Arborology: {
    status: 'live',
    note: 'Tree harvesting gets faster, more daily harvests and bigger yields, with Super Harvests (exact Arborology 1 to 5 tables).',
  },
  'Bog Specialization': {
    status: 'live',
    note: 'Lets you harvest Peat from Peat Bogs.',
  },
  'Jellisac Hands': {
    status: 'live',
    note: 'Lets you scoop Jellisacs from Jellisac clumps.',
  },
  'Fruit Changing': {
    status: 'live',
    note: 'The Fruit Changing Machine works without it, but twice as slow, for 25% more energy, and it fails 1 time in 5. With the skill it is fast and never fails.',
  },
  'Spice Milling': {
    status: 'live',
    note: 'The Spice Mill works without it, but twice as slow, for 25% more energy, and it fails 1 time in 5. With the skill it is fast and never fails.',
  },
  Gasmogrification: {
    status: 'live',
    note: 'The Gassifier works without it, but twice as slow, for 25% more energy, and it fails 1 time in 5. With the skill it is fast and never fails.',
  },
  'Bubble Tuning': {
    status: 'live',
    note: 'The Bubble Tuner works without it, but twice as slow, for 25% more energy, and it fails 1 time in 5. With the skill it is fast and never fails.',
  },

  // Cooking
  'EZ Cooking': {
    status: 'live',
    note: 'The Knife & Board needs EZ Cooking I. EZ Cooking II unlocks more recipes and makes every Knife & Board recipe twice as fast for half the energy.',
  },
  Cheffery: {
    status: 'live',
    note: 'The Frying Pan needs Cheffery I. Cheffery II unlocks recipes and halves time and energy; Cheffery III unlocks more and cuts energy by a third.',
  },
  Grilling: {
    status: 'live',
    note: 'The Famous Pugilist Grill needs Grilling I. Grilling II unlocks recipes and halves grill time and energy.',
  },
  Saucery: {
    status: 'live',
    note: 'The Saucepan needs Saucery I. Saucery II unlocks recipes and halves saucepan time and energy.',
  },
  Blending: {
    status: 'live',
    note: 'The Blender needs Blending I. Blending II unlocks recipes and halves blender time and energy.',
  },
  'Cocktail Crafting': {
    status: 'live',
    note: 'The Cocktail Shaker needs Cocktail Crafting I. Level II unlocks recipes and halves shaker time and energy.',
  },
  'Master Chef': {
    status: 'live',
    note: 'The Awesome Pot needs Master Chef I. Master Chef II unlocks recipes and halves pot time and energy.',
  },

  // Alchemy
  'Element Handling': {
    status: 'partial',
    note: 'A step toward Alchemy and Refining. The Elemental Pouch it lets you carry is not here; elements simply stack in your pack.',
  },
  Alchemy: {
    status: 'live',
    note: 'Alchemy I lets you use a Test Tube to combine elements into compounds.',
    ranks: {
      alchemy_2: { note: 'Lets you use Alchemical Tongs to turn Plain Metal into Tin, Copper and Molybdenum.' },
    },
  },
  'Intermediate Admixing': {
    status: 'live',
    note: 'Lets you use a Beaker to mix compounds into powders.',
  },
  Crystallography: {
    status: 'live',
    note: 'Unlocks the Crystalmalizing Chamber: Barnacle Talc (grind Barnacles in a Grinder) and Firefly Jars become Plain Crystals.',
  },
  Distilling: {
    status: 'live',
    note: 'Lets you run a Still: Distill Grain, Corn or Potatoes into its hopper and Collect the Hooch it makes, one every 140 seconds. Also opens Tincturing.',
  },
  Tincturing: {
    status: 'live',
    note: 'Lets you use a Tincturing Kit to make essences from herbs.',
  },
  Potionmaking: {
    status: 'live',
    note: 'Lets you brew potions in a Cauldron; each rank unlocks more potion recipes.',
  },

  // Industrial
  Mining: {
    status: 'live',
    note: 'You need Mining I to swing a pick. Each rank swings faster for less energy, less pick wear and more iMG (exact Mining 1 to 4 tables).',
  },
  Refining: {
    status: 'live',
    note: 'Refining I lets you crush ore in a Grinder. Refining II crushes twice as fast for 3 energy per chunk instead of 4.',
  },
  Smelting: {
    status: 'live',
    note: 'Lets you use a Smelter to turn Metal Rock into Plain Metal.',
  },
  Tinkering: {
    status: 'live',
    note: 'Lets you repair tools with a Tinkertool; each rank repairs faster for less energy. Tinkering III repairs the Tinkertool itself; IV and V unlock tool recipes.',
  },
  Engineering: {
    status: 'live',
    note: 'Lets you assemble a Woodworker, Metalmaker, Fuelmaker or Blockmaker from a Machine Stand and its three parts. With Tinkering IV or V, unlocks most of the Tinkertool tool recipes.',
  },
  Metalworking: {
    status: 'live',
    note: 'Lets you run the Metalmaker for Metal Rods, Posts and Girders.',
  },
  Woodworking: {
    status: 'live',
    note: 'Lets you run a Woodworker (assembled with Engineering) for Boards, Posts and Beams; each burns fuel from its tank.',
  },
  Blockmaking: {
    status: 'live',
    note: 'Lets you run a Blockmaker (assembled with Engineering) to press Earth and Loam into Urth Blocks. The retired Brick and Grade A/AAA Earth Block recipes are not in the source.',
  },
  Fuelmaking: {
    status: 'live',
    note: 'Lets you run a Fuelmaker (assembled with Engineering): Jellisac, Peat and White Gas become Fuel Cells that refuel every machine.',
  },
  Furnituremaking: {
    status: 'later',
    note: 'The Construction Tool and furniture building are not here yet.',
  },
  'Fiber Arts': {
    status: 'live',
    note: 'Fiber Arts I lets you spin seven Fibers into a Thread on a Spindle. Fiber Arts II unlocks the Loomer recipes.',
  },

  // Intellectual
  'Meditative Arts': {
    status: 'live',
    note: 'Lets you meditate with a Focusing Orb for mood and energy; each rank meditates longer for more.',
  },
  'Focused Meditation': {
    status: 'live',
    note: 'Lets you focus a Focusing Orb on energy or mood.',
  },
  Levitation: {
    status: 'live',
    note: 'Lets you imagine levitation with a Focusing Orb. Its Rambler First Class badge (251 streets) is not counted here yet.',
  },
  'Transcendental Radiation': {
    status: 'multiplayer',
    note: 'Radiates mood to other players nearby, so it does nothing on a solo street.',
  },
  'Martial Imagination': {
    status: 'later',
    note: 'For stunning Rooks with a Focusing Orb during Rook attacks, which are not here yet.',
  },
  Piety: {
    status: 'later',
    note: 'For priming shrines against Rook attacks, which are not here yet.',
  },
  Teleportation: {
    status: 'live',
    note: 'Lets you set teleport points and teleport from the Map. Higher ranks add more points, cost less energy and raise daily limits.',
  },
  Penpersonship: {
    status: 'live',
    note: 'With Teleportation IV, lets you write Teleportation Scripts on Paper with a Quill.',
  },
  Eyeballery: {
    status: 'later',
    note: 'Frees the camera to look around the whole street. There is no free camera here yet.',
  },
  'Bureaucratic Arts': {
    status: 'live',
    note: 'The Bureaucrat outside the Bureaucratic Halls on Gregarious Grange, Baeli Bray and Chego Chase sells Your Papers (Complete them for the You Have Papers badge) to those who know Bureaucratic Arts.',
    ranks: {
      bureaucraticarts_2: { status: 'live', note: 'Needs the You Have Papers badge; lets the Bureaucrat sell you General Building Permits for street projects.' },
      bureaucraticarts_3: { status: 'later', note: 'Needs the Impossible Achievement badge, which is impossible by design.' },
    },
  },
});

function catalog() {
  return getSkillCatalog() || {};
}

/** Roman numeral rank label used by the original client (I to VII). */
export function romanRank(level) {
  const n = Math.max(0, Math.floor(Number(level) || 0));
  return ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'][n] || String(n);
}

export function skillTitle(def) {
  if (!def) return '';
  const family = familySize(def.name);
  return family > 1 && def.level ? `${def.name} ${romanRank(def.level)}` : def.name;
}

function familySize(name) {
  return Object.values(catalog()).filter((d) => d.name === name).length;
}

export function skillCategoryName(def) {
  return SKILL_CATEGORIES[def?.categoryId] || 'Other';
}

/** Honest remake note for one skill: { status, label, note }. */
export function skillRemakeNote(classTsid) {
  const def = catalog()[classTsid];
  const family = def ? SKILL_REMAKE_NOTES[def.name] : null;
  const rank = family?.ranks?.[classTsid] || {};
  const status = rank.status || family?.status || 'later';
  return {
    status,
    label: REMAKE_STATUS[status] || REMAKE_STATUS.later,
    note: rank.note || family?.note || 'What this skill unlocks is not here yet.',
  };
}

/** Giant whose emblem unlocks this skill (`emblem_skill_unlock_<giant>_1`). */
export function emblemUnlockFor(classTsid) {
  const def = catalog()[classTsid];
  for (const id of def?.reqAchievements || []) {
    const match = /^emblem_skill_unlock_([a-z]+)_1$/.exec(id);
    if (match) return { achievement: id, giant: match[1], emblem: `emblem_${match[1]}` };
  }
  return null;
}

/**
 * Spend one Giant emblem for its skill unlock (emblem_base modal_callback):
 * removes the pack emblem and returns the achievement to grant.
 * @param {Record<string, number>} inv
 * @param {string[]} unlockedAchievements
 * @param {string} classTsid skill that needs the unlock
 */
export function spendEmblemForSkill(inv, unlockedAchievements, classTsid) {
  const unlock = emblemUnlockFor(classTsid);
  if (!unlock) return { ok: false, reason: 'no_emblem_unlock' };
  if ((unlockedAchievements || []).includes(unlock.achievement)) {
    return { ok: false, reason: 'already_unlocked', ...unlock };
  }
  if (!inv || !(Number(inv[unlock.emblem]) > 0)) return { ok: false, reason: 'no_emblem', ...unlock };
  inv[unlock.emblem] = Number(inv[unlock.emblem]) - 1;
  if (inv[unlock.emblem] <= 0) delete inv[unlock.emblem];
  return { ok: true, reason: 'spent', ...unlock };
}

/**
 * Every prerequisite the skill names, each marked met or not, in the order
 * the source lists them (skills, quests, badges, upgrades, level).
 */
export function prerequisiteRows(state, classTsid, ctx = {}) {
  const def = catalog()[classTsid];
  if (!def) return [];
  const learned = new Set(state?.learned || []);
  const quests = new Set(ctx.completedQuests || []);
  const badges = new Set(ctx.unlockedAchievements || []);
  const upgrades = new Set(ctx.upgrades || []);
  const rows = [];
  if ((def.requiresLevel || 0) > 0) {
    rows.push({ kind: 'level', id: `level_${def.requiresLevel}`, label: `Level ${def.requiresLevel}`, met: (ctx.level ?? 1) >= def.requiresLevel });
  }
  for (const id of def.reqSkills || []) {
    rows.push({ kind: 'skill', id, label: skillTitle(catalog()[id]) || id, met: learned.has(id) });
  }
  for (const id of def.reqQuests || []) {
    rows.push({ kind: 'quest', id, label: ctx.questName?.(id) || id.replace(/_/g, ' '), met: quests.has(id) });
  }
  for (const id of def.reqAchievements || []) {
    const emblem = /^emblem_skill_unlock_([a-z]+)_1$/.exec(id);
    rows.push({
      kind: emblem ? 'emblem' : 'badge',
      id,
      giant: emblem?.[1],
      label: emblem
        ? `Spend an Emblem of ${ctx.giantName?.(emblem[1]) || emblem[1]}`
        : ctx.achievementName?.(id) || id.replace(/_/g, ' '),
      met: badges.has(id),
    });
  }
  for (const id of def.reqUpgrades || []) {
    rows.push({ kind: 'upgrade', id, label: `Upgrade: ${id.replace(/_/g, ' ')}`, met: upgrades.has(id) });
  }
  return rows;
}

/**
 * The full skill ancestry, deepest first, without duplicates: what you would
 * learn on the way to this skill.
 */
export function prerequisiteChain(classTsid) {
  const out = [];
  const seen = new Set();
  const visit = (id) => {
    const def = catalog()[id];
    if (!def || seen.has(id)) return;
    seen.add(id);
    for (const req of def.reqSkills || []) visit(req);
    if (id !== classTsid) out.push(id);
  };
  visit(classTsid);
  return out;
}

/** Skills that list this one as a prerequisite. */
export function unlocksAfter(classTsid) {
  return Object.values(catalog())
    .filter((def) => (def.reqSkills || []).includes(classTsid))
    .map((def) => def.classTsid);
}

/**
 * One skill's full panel state.
 * status: learned | studying | paused | available | locked
 */
export function skillTreeEntry(state, classTsid, ctx = {}, now = Date.now()) {
  const def = catalog()[classTsid];
  if (!def) return null;
  const learned = state?.learned?.includes(classTsid);
  const study = learned ? null : getStudyStatus(state, classTsid, now);
  const check = learned || study ? null : canLearnSkill(state, classTsid, ctx);
  const status = learned
    ? 'learned'
    : study
      ? study.isPaused ? 'paused' : 'studying'
      : check?.ok ? 'available' : 'locked';
  return {
    classTsid,
    def,
    title: skillTitle(def),
    category: skillCategoryName(def),
    status,
    study,
    check,
    seconds: studySecondsForSkill(def),
    prerequisites: prerequisiteRows(state, classTsid, ctx),
    chain: prerequisiteChain(classTsid),
    unlocks: unlocksAfter(classTsid),
    remake: skillRemakeNote(classTsid),
    emblem: emblemUnlockFor(classTsid),
  };
}

/** Families (skills sharing a name) in rank order. */
export function skillFamilies() {
  const families = new Map();
  for (const def of Object.values(catalog())) {
    if (!families.has(def.name)) {
      families.set(def.name, { name: def.name, categoryId: def.categoryId, skills: [] });
    }
    families.get(def.name).skills.push(def);
  }
  for (const family of families.values()) {
    family.skills.sort((a, b) => (a.level || 0) - (b.level || 0));
  }
  return [...families.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Search and filter the tree.
 * @param {object} state skill state
 * @param {{ query?: string, filter?: 'all'|'available'|'learning'|'learned'|'locked', category?: number|string|'all' }} opts
 * @param {object} ctx canLearnSkill context
 */
export function filterSkillTree(state, opts = {}, ctx = {}, now = Date.now()) {
  const query = String(opts.query || '').trim().toLowerCase();
  const filter = opts.filter || 'all';
  const category = opts.category ?? 'all';
  const groups = new Map(SKILL_CATEGORY_ORDER.map((id) => [id, []]));
  let total = 0;
  for (const family of skillFamilies()) {
    if (category !== 'all' && String(family.categoryId) !== String(category)) continue;
    const entries = family.skills.map((def) => skillTreeEntry(state, def.classTsid, ctx, now));
    const familyText = `${family.name} ${SKILL_CATEGORIES[family.categoryId] || ''}`.toLowerCase();
    // A query that matches any rank keeps the whole ladder together.
    const familyMatches = !query || entries.some((entry) =>
      `${familyText} ${entry.title} ${entry.def.description || ''} ${entry.remake.note}`.toLowerCase().includes(query));
    if (!familyMatches) continue;
    const matches = entries.filter((entry) => {
      if (filter === 'available' && entry.status !== 'available') return false;
      if (filter === 'learning' && entry.status !== 'studying' && entry.status !== 'paused') return false;
      if (filter === 'learned' && entry.status !== 'learned') return false;
      if (filter === 'locked' && entry.status !== 'locked') return false;
      return true;
    });
    if (!matches.length) continue;
    total += matches.length;
    if (!groups.has(family.categoryId)) groups.set(family.categoryId, []);
    groups.get(family.categoryId).push({ ...family, entries: matches, allEntries: entries });
  }
  return {
    total,
    groups: [...groups.entries()]
      .filter(([, families]) => families.length)
      .map(([id, families]) => ({ id, name: SKILL_CATEGORIES[id] || 'Other', families })),
  };
}

/** Counts for the panel header and the filter chips. */
export function skillTreeCounts(state, ctx = {}, now = Date.now()) {
  const counts = { all: 0, learned: 0, learning: 0, available: 0, locked: 0 };
  for (const def of Object.values(catalog())) {
    const entry = skillTreeEntry(state, def.classTsid, ctx, now);
    counts.all += 1;
    if (entry.status === 'learned') counts.learned += 1;
    else if (entry.status === 'studying' || entry.status === 'paused') counts.learning += 1;
    else if (entry.status === 'available') counts.available += 1;
    else counts.locked += 1;
  }
  return counts;
}

/** Audit table: every skill with its remake status, for tests and docs. */
export function skillAuditTable() {
  return Object.values(catalog())
    .sort((a, b) => a.classTsid.localeCompare(b.classTsid))
    .map((def) => ({ classTsid: def.classTsid, title: skillTitle(def), ...skillRemakeNote(def.classTsid) }));
}
