/**
 * Cubimal Series 1/2 boxes and collectible figures.
 *
 * Source:
 * - items/cubimal_package.js
 * - items/cubimal_package_2.js
 * - items/npc_cubimal_*.js
 */

import {
  addItem,
  countItem,
  ensureItem,
  removeItem,
} from './inventory.js?v=catalog-unified-5';

export const CUBIMAL_PACKAGE_IDS = Object.freeze({
  1: 'cubimal_package',
  2: 'cubimal_package_2',
});

function cubimal(slug, label, cutoff, setFreeImg = 0) {
  return Object.freeze({
    classTsid: `npc_cubimal_${slug}`,
    slug,
    label,
    cutoff,
    setFreeImg,
  });
}

export const CUBIMAL_SERIES = Object.freeze({
  1: Object.freeze([
    cubimal('chick', 'Chick Cubimal', 17, 400),
    cubimal('piggy', 'Piggy Cubimal', 34, 400),
    cubimal('butterfly', 'Butterfly Cubimal', 50, 400),
    cubimal('crab', 'Crab Cubimal', 58, 500),
    cubimal('batterfly', 'Batterfly Cubimal', 66, 500),
    cubimal('frog', 'Frog Cubimal', 74, 500),
    cubimal('firefly', 'Firefly Cubimal', 82, 500),
    cubimal('bureaucrat', 'Bureaucrat Cubimal', 84, 1_000),
    cubimal('cactus', 'Cactus Cubimal', 86, 1_000),
    cubimal('snoconevendor', 'Sno Cone Vendor Cubimal', 88, 1_000),
    cubimal('squid', 'Squid Cubimal', 90, 1_000),
    cubimal('juju', 'JuJu Cubimal', 92, 1_000),
    cubimal('smuggler', 'Smuggler Cubimal', 93.25),
    cubimal('deimaginator', 'Deimaginator Cubimal', 94.5),
    cubimal('greeterbot', 'Greeterbot Cubimal', 95.75),
    cubimal('dustbunny', 'Dustbunny Cubimal', 97),
    cubimal('gwendolyn', 'Gwendolyn Cubimal', 97.5),
    cubimal('unclefriendly', 'Uncle Friendly Cubimal', 98),
    cubimal('helga', 'Helga Cubimal', 98.5),
    cubimal('magicrock', 'Magic Rock Cubimal', 99),
    cubimal('yeti', 'Yeti Cubimal', 99.5),
    cubimal('rube', 'Rube Cubimal', 99.75),
    cubimal('rook', 'Rook Cubimal', 100),
  ]),
  2: Object.freeze([
    cubimal('fox', 'Fox Cubimal', 14.5, 400),
    cubimal('sloth', 'Sloth Cubimal', 29, 400),
    cubimal('emobear', 'Emo-Bear Cubimal', 37, 500),
    cubimal('foxranger', 'Fox Ranger Cubimal', 45, 500),
    cubimal('groddlestreetspirit', 'Groddle Street Spirit Cubimal', 54, 500),
    cubimal('uraliastreetspirit', 'Uralia Street Spirit Cubimal', 61, 500),
    cubimal('firebogstreetspirit', 'Firebog Street Spirit Cubimal', 69, 500),
    cubimal('gnome', 'Gnome Cubimal', 77, 500),
    cubimal('butler', 'Butler Cubimal', 81, 750),
    cubimal('craftybot', 'Craftybot Cubimal', 85, 750),
    cubimal('phantom', 'Phantom Cubimal', 89, 750),
    cubimal('ilmenskiejones', 'Ilmenskie Jones Cubimal', 93, 750),
    cubimal('trisor', 'Trisor Cubimal', 94),
    cubimal('toolvendor', 'Tool Vendor Cubimal', 95),
    cubimal('mealvendor', 'Meal Vendor Cubimal', 96),
    cubimal('gardeningtoolsvendor', 'Gardening Tools Vendor Cubimal', 97),
    cubimal('maintenancebot', 'Maintenance Bot Cubimal', 98),
    cubimal('senorfunpickle', 'Señor Funpickle Cubimal', 99),
    cubimal('hellbartender', 'Hell Bartender Cubimal', 99.5),
    cubimal('scionofpurple', 'Scion of Purple Cubimal', 100),
  ]),
});

const PACKAGE_META = Object.freeze({
  cubimal_package: Object.freeze({
    series: 1,
    label: 'Cubimal Series 1 Box',
    desc: 'Contains one (1) Series 1 Cubimal. Open it up to find out which one is inside. Collect them all!',
  }),
  cubimal_package_2: Object.freeze({
    series: 2,
    label: 'Cubimal Series 2 Box',
    desc: "Contains one (1) Series 2 Cubimal. Open it up to find out which one is inside. Collect 'em all!",
  }),
});

const CUBIMAL_BY_ID = Object.freeze(
  Object.fromEntries(
    Object.entries(CUBIMAL_SERIES).flatMap(([series, rows]) =>
      rows.map((row) => [row.classTsid, Object.freeze({ ...row, series: Number(series) })])
    )
  )
);

export const CUBIMAL_FREE_RESPONSES = Object.freeze([
  'I will remember you always.',
  'You have been, and will always be, my friend',
  'Live long and be merry',
  "Yay, I'm free!",
  "Yay, I'm off to Cosmaland!",
]);

export function cubimalPackageInfo(classTsid) {
  return PACKAGE_META[classTsid] || null;
}

export function cubimalInfo(classTsid) {
  return CUBIMAL_BY_ID[classTsid] || null;
}

export function isCubimalPackage(classTsid) {
  return Boolean(cubimalPackageInfo(classTsid));
}

export function isCubimal(classTsid) {
  return Boolean(cubimalInfo(classTsid));
}

/** Register both boxes and all 43 clean collectible figures in the shared pack catalog. */
export function ensureCubimalItems() {
  for (const [classTsid, meta] of Object.entries(PACKAGE_META)) {
    ensureItem(classTsid, {
      label: meta.label,
      desc: meta.desc,
      baseCost: 5_000,
      stackMax: 1,
    });
  }
  for (const [classTsid, meta] of Object.entries(CUBIMAL_BY_ID)) {
    ensureItem(classTsid, {
      label: meta.label,
      desc: `It's a ${meta.label}! Collect all Series ${meta.series} Cubimals!`,
      baseCost: 0,
      stackMax: 1,
      sellable: false,
      donatable: false,
    });
  }
}

/** Unique figures currently represented in the pack for one official series. */
export function cubimalCollectionProgress(inv, series) {
  const rows = CUBIMAL_SERIES[series] || [];
  const owned = rows.filter((row) => countItem(inv, row.classTsid) > 0);
  return {
    series: Number(series),
    owned: owned.length,
    total: rows.length,
    ids: owned.map((row) => row.classTsid),
  };
}

/** Select with the source cumulative percentage table. */
export function selectCubimal(packageClassTsid, roll = Math.random()) {
  const pack = cubimalPackageInfo(packageClassTsid);
  if (!pack) return null;
  const raw = Number(roll);
  const point = Math.max(0, Math.min(1, Number.isFinite(raw) ? raw : 0)) * 100;
  const rows = CUBIMAL_SERIES[pack.series];
  return rows.find((row) => point <= row.cutoff) || rows.at(-1);
}

/** Replace one box atomically with exactly one source-selected Cubimal. */
export function openCubimalPackage(inv, packageClassTsid, roll = Math.random()) {
  const pack = cubimalPackageInfo(packageClassTsid);
  if (!pack) return { ok: false, reason: 'not_package' };
  if (countItem(inv, packageClassTsid) < 1) {
    return { ok: false, reason: 'missing', message: 'That Cubimal box is no longer in your pack.' };
  }
  const prize = selectCubimal(packageClassTsid, roll);
  if (!prize) return { ok: false, reason: 'empty_table' };
  if (!removeItem(inv, packageClassTsid, 1)) {
    return { ok: false, reason: 'missing', message: 'That Cubimal box is no longer in your pack.' };
  }
  addItem(inv, prize.classTsid, 1);
  return {
    ok: true,
    reason: 'opened',
    package: { classTsid: packageClassTsid, ...pack },
    prize,
    collection: cubimalCollectionProgress(inv, pack.series),
    message: `You opened a ${pack.label}. You got a ${prize.label}!`,
  };
}

/** choose_one(responses.set_free) for a roll in [0, 1). */
export function cubimalFreeResponseIndex(responseRoll) {
  const rawRoll = Number(responseRoll);
  return Math.min(
    CUBIMAL_FREE_RESPONSES.length - 1,
    Math.floor(Math.max(0, Math.min(0.999999999, Number.isFinite(rawRoll) ? rawRoll : 0)) * CUBIMAL_FREE_RESPONSES.length)
  );
}

/** Source "set free, with love" reward. Rare figures with reward 0 cannot be freed. */
export function setCubimalFree(inv, pc, classTsid, responseRoll = Math.random()) {
  const info = cubimalInfo(classTsid);
  if (!info) return { ok: false, reason: 'not_cubimal' };
  if (!info.setFreeImg) {
    return {
      ok: false,
      reason: 'rare',
      message: `${info.label} is too rare to set free for Imagination.`,
    };
  }
  if (countItem(inv, classTsid) < 1 || !removeItem(inv, classTsid, 1)) {
    return { ok: false, reason: 'missing', message: 'That Cubimal is no longer in your pack.' };
  }
  if (pc) {
    pc.imagination = (Number(pc.imagination) || 0) + info.setFreeImg;
    pc.xp = (Number(pc.xp) || 0) + info.setFreeImg;
  }
  const responseIndex = cubimalFreeResponseIndex(responseRoll);
  return {
    ok: true,
    reason: 'freed',
    cubimal: info,
    reward: info.setFreeImg,
    response: CUBIMAL_FREE_RESPONSES[responseIndex],
    effects: { xp: info.setFreeImg },
    message: `You set ${info.label} free, with love.`,
  };
}

// —— Race, name and freedom (npc_cubimal_base) ————————————————————————————
//
// Line numbers are items/npc_cubimal_chick.js; every npc_cubimal_*.js carries
// the same npc_cubimal_base verbs. Race, name, rename and set free are pack
// verbs (ok_states in_pack). Race takes the figure out of the pack, sets it
// down at the player's feet, and puts it back in the pack afterwards
// (returnToPack 966). A dropped figure (takeable drop, verbs.drop 372) offers
// only pick up (verbs.pickup 330), and none while it races (canPickup 525).

/** Figures whose source article is "an" (var article); the rest are "a". */
const AN_ARTICLE = new Set([
  'npc_cubimal_emobear',
  'npc_cubimal_ilmenskiejones',
  'npc_cubimal_unclefriendly',
  'npc_cubimal_uraliastreetspirit',
]);

export function cubimalArticle(classTsid) {
  return AN_ARTICLE.has(classTsid) ? 'an' : 'a';
}

export const CUBIMAL_RACE = Object.freeze({
  /** verbs.race 515: apiSetTimer('onRaceStart', 2000) after CUBIMAL_WIND_UP. */
  windUpMs: 2_000,
  /** onRaceStart 952: npc_walk_speed = randInt(15, 85). */
  speedMin: 15,
  speedMax: 85,
  /** onRaceStart 958: apiSetTimer('onRaceEnd', randInt(2, 10) * 1000). */
  secsMin: 2,
  secsMax: 10,
  /**
   * World pixels per second per npc_walk_speed point. Read literally (1 px/s)
   * the longest run is 85 x 10 = 850 px, 8.5 planks, short of the 8.9-plank
   * badge (loneliness_of_the_long_distance_cubimal) the same file grants. The
   * forum thread "The furthest a cubi can travel?" (2012) reports 8.81, 9.6,
   * 9.8, 10.11, 10.4, 11.5, 11.7, 12.01 and 16.24 planks, so the server moved
   * NPCs about twice that: 2 px/s puts the record at 17 planks.
   */
  pxPerSpeed: 2,
  /** onRaceEnd 930: distance = (x - start_point) / 100. */
  plankPx: 100,
  /** onRaceStart 953: apiFindPath(geo.r - 200, y); the path ends there or at a platform edge (onPathing 895). */
  rightMargin: 200,
  /** onRaceEnd 945: apiSetTimer('returnToPack', 3000). */
  returnMs: 3_000,
  /** onRaceEnd 937: achievements_increment('cubimals_raced', 'long_distance') at 8.9 planks. */
  longDistancePlanks: 8.9,
  longDistanceCounter: 'cubimals_raced:long_distance',
  /** isSwarm 624: 31 racing cubimals in one location grant the_swarm to every owner. */
  swarmSize: 31,
  swarmAchievement: 'the_swarm',
  /** The client's race sheet: 30 fps. */
  fps: 30,
});

/** OGA npc_cubimal_<slug>__x1_race sheets: 20 x 3 cells, 60 frames, [cell w, cell h]. */
export const CUBIMAL_RACE_SHEET = Object.freeze({ cols: 20, rows: 3, frames: 60 });
export const CUBIMAL_RACE_CELLS = Object.freeze(Object.fromEntries(Object.entries({
  batterfly: [36, 39], bureaucrat: [36, 27], butler: [36, 26], butterfly: [38, 36], cactus: [36, 26],
  chick: [36, 32], crab: [38, 31], craftybot: [36, 26], deimaginator: [36, 29], dustbunny: [37, 24],
  emobear: [39, 28], firebogstreetspirit: [37, 29], firefly: [36, 36], fox: [37, 28], foxranger: [36, 26],
  frog: [38, 31], gardeningtoolsvendor: [38, 32], gnome: [38, 31], greeterbot: [36, 28],
  groddlestreetspirit: [39, 33], gwendolyn: [36, 26], helga: [37, 30], hellbartender: [39, 48],
  ilmenskiejones: [37, 30], juju: [36, 27], magicrock: [36, 24], maintenancebot: [36, 28], mealvendor: [38, 29],
  phantom: [36, 33], piggy: [37, 28], rook: [40, 29], rube: [38, 26], scionofpurple: [39, 35],
  senorfunpickle: [43, 33], sloth: [36, 30], smuggler: [37, 26], snoconevendor: [36, 28], squid: [38, 27],
  toolvendor: [36, 29], trisor: [36, 24], unclefriendly: [37, 31], uraliastreetspirit: [39, 30], yeti: [38, 30],
}).map(([slug, cell]) => [`npc_cubimal_${slug}`, Object.freeze(cell)])));

/** Sheet def for js/sprite-sheets.js ({ path, fw, fh, cols, frames }), or null. */
export function cubimalRaceSheet(classTsid) {
  const cell = CUBIMAL_RACE_CELLS[classTsid];
  if (!cell) return null;
  return {
    path: `assets/sprites/cubimals/${classTsid}_race.webp`,
    fw: cell[0],
    fh: cell[1],
    cols: CUBIMAL_RACE_SHEET.cols,
    frames: CUBIMAL_RACE_SHEET.frames,
  };
}

function randInt(min, max, rng = Math.random) {
  const r = Math.max(0, Math.min(0.999999999, Number(rng()) || 0));
  return min + Math.floor(r * (max - min + 1));
}

/** onRaceStart: walk speed and race length (QA may pin either). */
export function rollCubimalRace(rng = Math.random, { speed = null, secs = null } = {}) {
  const pin = (value, min, max) => (Number.isFinite(Number(value)) && value !== null && value !== '' ? Math.max(min, Math.min(max, Math.round(Number(value)))) : null);
  return {
    speed: pin(speed, CUBIMAL_RACE.speedMin, CUBIMAL_RACE.speedMax) ?? randInt(CUBIMAL_RACE.speedMin, CUBIMAL_RACE.speedMax, rng),
    secs: pin(secs, CUBIMAL_RACE.secsMin, CUBIMAL_RACE.secsMax) ?? randInt(CUBIMAL_RACE.secsMin, CUBIMAL_RACE.secsMax, rng),
  };
}

/** World pixels per second for a rolled walk speed. */
export function cubimalRacePxPerSec(speed) {
  return Math.max(0, Number(speed) || 0) * CUBIMAL_RACE.pxPerSpeed;
}

/** onRaceEnd: planks from whole-pixel positions, so at most two decimals (1.47, 7.24). */
export function cubimalRacePlanks(startX, endX) {
  return Math.max(0, Math.round((Number(endX) || 0) - (Number(startX) || 0))) / CUBIMAL_RACE.plankPx;
}

/** buildVerbMessage(count, 'race', 'raced'): "You raced a Butterfly Cubimal." */
export function cubimalRaceVerbMessage(classTsid) {
  const info = cubimalInfo(classTsid);
  return `You raced ${cubimalArticle(classTsid)} ${info?.label || 'Cubimal'}.`;
}

/**
 * onRaceEnd 931: sendActivity("'s " + name_single + " went " + distance +
 * " planks before stopping.", racing_owner), prefixed with the owner's name.
 * The remake has no player names, so the owner reads "Your".
 */
export function cubimalRaceEndMessage(classTsid, planks, owner = 'Your') {
  const info = cubimalInfo(classTsid);
  return `${owner} ${info?.label || 'Cubimal'} went ${planks} planks before stopping.`;
}

/** onRaceEnd 937-943: the badge counter at 8.9 planks; tottlys_toys feat +2 at 5 (feats not in the remake). */
export function cubimalRaceOutcome(planks) {
  const d = Number(planks) || 0;
  return {
    longDistance: d >= CUBIMAL_RACE.longDistancePlanks,
    featPoints: d >= 5 ? 2 : 0,
  };
}

/**
 * One step of the racer along the street: walks right toward targetX over the
 * surface under its feet (npc_can_fall / npc_can_jump / npc_can_climb false,
 * onCreate 872), stopping at a platform edge or the path's end (geo.r - 200).
 * surfaceY(x, y) returns the walkable surface at x near feet y, or null.
 */
export function advanceCubimalRacer(racer, targetX, surfaceY, limitX, stepPx = 2) {
  let { x, y } = racer;
  const goal = Math.min(Number(targetX) || x, limitX);
  let blocked = false;
  while (x < goal) {
    const nx = Math.min(goal, x + stepPx);
    const ny = surfaceY(nx, y);
    if (ny == null) {
      blocked = true;
      break;
    }
    x = nx;
    y = ny;
  }
  return { x, y, blocked: blocked || x >= limitX };
}

// —— Name / Rename (animal_naming.js, verbs.name 424, verbs.rename 456) ————————

export const CUBIMAL_NAMING = Object.freeze({
  maxLength: 32,
  inputLabel: 'My new name:',
  nameTitle: 'Name Me!',
  renameTitle: 'Rename Me!',
  nameTooltip: 'Give this Cubimal a name',
  renameTooltip: "Change this Cubimal's name",
});

/** onInputBoxResponse 41: value.substr(0, 32).replace(/[^a-z0-9 ]/gi, ''). */
export function sanitizeCubimalName(value) {
  return String(value ?? '').substr(0, CUBIMAL_NAMING.maxLength).replace(/[^a-z0-9 ]/gi, '');
}

/**
 * canName for a cubimal in the pack: no Animal Kinship needed (has_parent
 * npc_cubimal_base), and the container is the player's pack, so an unnamed
 * figure or one the player named can always be named (solo remake).
 * Name shows while there is no name, Rename once there is one.
 */
export function cubimalNameVerb(names, classTsid) {
  const current = names?.[classTsid] || '';
  return current
    ? { id: 'rename', label: 'Rename', tooltip: CUBIMAL_NAMING.renameTooltip, title: CUBIMAL_NAMING.renameTitle, value: current }
    : { id: 'name', label: 'Name', tooltip: CUBIMAL_NAMING.nameTooltip, title: CUBIMAL_NAMING.nameTitle, value: '' };
}

/** onInputBoxResponse 43-49: an empty or unchanged name does nothing. */
export function nameCubimal(names, classTsid, value) {
  if (!isCubimal(classTsid)) return { ok: false, reason: 'not_cubimal' };
  const name = sanitizeCubimalName(value);
  const previous = names?.[classTsid] || '';
  if (!name || name === previous) return { ok: false, reason: name ? 'unchanged' : 'empty' };
  names[classTsid] = name;
  return {
    ok: true,
    name,
    previous,
    bubble: `And they shall call me "${name}"`,
    bubbleMs: 5_000,
    counter: `animals_named:${classTsid}`,
  };
}

// —— Set free, with love (verbs.set_free_with_love 393, onConversation 850) ——

export const CUBIMAL_FREE = Object.freeze({
  yes: "Yes, go on, you're free now!",
  no: 'No, I love you too much.',
  /** onConversation 855: createItemStackWithPoof(class, 1, pc.x + 80, pc.y - 60). */
  offsetX: 80,
  offsetY: -60,
  /** sendResponse('set_free') after 300 ms, setFree after 2.5 s. */
  responseMs: 300,
  flyAtMs: 2_500,
  /** setFree 1042: apiMoveToXY(x, y - 1000, 1500) in the race state, then deleted. */
  riseY: 1_000,
  riseMs: 1_500,
  sound: 'SPINACHJUMP',
});

/** The conversation line: "Really, you want to set me free? I'll give you 400 Imagination." */
export function cubimalFreeQuestion(classTsid) {
  const info = cubimalInfo(classTsid);
  if (!info?.setFreeImg) return null;
  return `Really, you want to set me free? I'll give you ${info.setFreeImg} Imagination.`;
}
