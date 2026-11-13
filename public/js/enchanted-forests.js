/**
 * Enchanted Forests and Enchanted Wood Trees (pure data, rules and a street
 * builder: no Pixi, no DOM).
 *
 * Source (tinyspeck/glitch-GameServerJS, CC0):
 *  - items/wood_tree_enchanted.js: a Wood Tree subclass (proxy_item
 *    "wood_tree", same name "Wood Tree") whose onLoad sets
 *    plankProdMap [10, 15, 22, 32, 45, 60] (the plain tree's is
 *    [25, 30, 40, 50, 60, 80]) and the same maturityMap [2, 3, 4, 5, 6, 0];
 *    pc_action_distance 25. onDie does not leave a Patch: it becomes a
 *    patch_seedling with trant_class wood_tree_enchanted, petted = 3, and
 *    setTimers(pc), so it grows back after the seedling's 5 minute minimum.
 *  - items/patch_seedling.js: onMaxTimePassed (4 h) never kills an enchanted
 *    seedling; petting one that is already at 3 costs 2 energy and answers
 *    pet_no_more ("You don't need to pet this seedling any more. Just wait a
 *    few minutes.").
 *  - items/wood_tree.js: trantsform and apply poison conditions return null
 *    for wood_tree_enchanted (no Tree Poison, no Trantsformation Fluid).
 *  - endHarvest is shared: the same yields by maturity, harvest counters and
 *    the 2 s onDie timer at maturity 0.
 *  - Glitch change log 2012-04-12 (twitter glitchlog 190501447316684801):
 *    "The new enchanted wood trees were oversouped! Now they're as the giants
 *    imagined. The max harvest will net you 60 planks instead of 80."
 *
 * Where they grow: the three Enchanted Forests ("wood tree hollows", Glitch
 * blog 2012-04-16), reached by the mini door on an enchanted tree. The doors
 * survive in the archived parent streets (door_1334185795362 and friends,
 * dated 2012-04-11 like the ENCHANTED_WOOD music upload 1334190845); the
 * hollows themselves (LDODG1KQLOS2GNO, LDOLMQFMNOS24AJ, LUVNMB7AOOS28EK) were
 * never archived (locations.js lists them as "Enchanted forests"). Tree counts
 * come from the Glitch wiki "Enchanted Forest" table.
 *
 * Reconstruction (each hollow carries a `why`): the Glitch Tribute Blog
 * (johnexploresur.tumblr.com, reference only) posted a full-height panorama
 * of each hollow with every Wood Tree in view: Grimssea Hollow post
 * 54865968635, Afar Cleft 48940157335, Magha Pleat 52343141868. Each one is
 * the inside of a giant trunk: bracket-fungus shelves up the bark walls, the
 * Wood Trees on the shelves, peg ladders knocked into the wood, and an arched
 * door out at the foot. HOLLOW_LAYOUTS below is each panorama measured in its
 * own pixels (900 wide); the builder scales it by HOLLOW_SCALE (the door and
 * the avatar both measure 1.25 world px per panorama px) about the trunk's
 * centre, with the floor at the archived door's connect y. The art is Tiny
 * Speck's own Enchanted Forest set, enchant_tree.swf (the et1 decos, CC0),
 * and the music ENCHANTED_WOOD, the track uploaded the day they opened.
 * Where a step of the original is out of the remake's 105 px jump, a ladder
 * runs on to the shelf above, and where pegs end beside a shelf its lip
 * reaches under the top peg, so every ladder has a deck (each ladder's `why`
 * says what moved). The panorama px are image px; the jump figures are world px.
 */

export const ENCHANTED_SOURCE = 'tinyspeck/glitch-GameServerJS CC0 items/wood_tree_enchanted.js';
import { loseEnergy } from './metabolics.js?v=1383e6fd';
export const ENCHANTED_FOREST_SOURCE = 'reconstruction: Enchanted Forest hollows (not in tinyspeck/glitch-locations), laid out from the Glitch Tribute Blog panoramas in Tiny Speck\'s enchant_tree.swf art (CC0)';


/** wood_tree_enchanted.js onLoad and patch_seedling.js timers. */
export const ENCHANTED_WOOD_TREE = Object.freeze({
  classTsid: 'wood_tree_enchanted',
  proxyClass: 'wood_tree',
  label: 'Wood Tree',
  plankYieldByMaturity: Object.freeze([10, 15, 22, 32, 45, 60]),
  maturityMap: Object.freeze([2, 3, 4, 5, 6, 0]),
  actionDistance: 25,
  variants: 4,
  /** endHarvest: apiSetTimerX('onDie', 2000) once maturity reaches 0. */
  dieDelayMs: 2000,
  /** patch_seedling.js setTimers: min_time 5 minutes (no imagination upgrade on a street seedling). */
  seedlingMinMs: 5 * 60 * 1000,
  /** onDie sets petted = 3: the seedling never needs (or wants) petting. */
  seedlingPetted: 3,
  /** onPetted: pc.metabolics_lose_energy(2) before the count check. */
  seedlingPetEnergy: 2,
  /** growUp: apiNewItem(trant_class); initInstanceProps maturity "1". */
  regrowMaturity: 1,
});

export const SEEDLING_PET_NO_MORE = "You don't need to pet this seedling any more. Just wait a few minutes.";

/** patch_seedling.js responses (pet_no_more), verbatim. */
export const SEEDLING_PET_NO_MORE_LINES = Object.freeze([
  'Shhhh! Leave me to concentrate on biggificating.',
  'Cease and desist! In the nicest way possible: Go away.',
  'Avast! Pet me not. I need to focus on sprouting.',
  'Halt! No more petting. This I must do alone.',
  'Stop right there! I must do the final spurt myself!',
]);

/** Art: wood_tree_enchanted.swf sprites 13 / 26 / 39 / 52 (variants 1-4), frames = maturity 1-6. */
export const ENCHANTED_TREE_SHEETS = Object.freeze([
  Object.freeze({ variant: 1, url: 'assets/sprites/wood_tree_enchanted/wood_tree_enchanted_v1@3x.webp', fw: 93, fh: 138 }),
  Object.freeze({ variant: 2, url: 'assets/sprites/wood_tree_enchanted/wood_tree_enchanted_v2@3x.webp', fw: 88, fh: 138 }),
  Object.freeze({ variant: 3, url: 'assets/sprites/wood_tree_enchanted/wood_tree_enchanted_v3@3x.webp', fw: 94, fh: 135 }),
  Object.freeze({ variant: 4, url: 'assets/sprites/wood_tree_enchanted/wood_tree_enchanted_v4@3x.webp', fw: 87, fh: 121 }),
]);


export const ENCHANTED_MUSIC = 'ENCHANTED_WOOD';
/** World px per panorama px: the door (69 x 168 art) and the avatar measure the same. */
export const HOLLOW_SCALE = 1.25;

/**
 * The three hollows. `door` is the archived mini door on the parent street;
 * `arrive` its connect x/y (world, inside the hollow).
 */
export const ENCHANTED_FORESTS = Object.freeze([
  Object.freeze({
    id: 'grimssea',
    tsid: 'GDODG1KQLOS2GNO',
    sourceTsid: 'LDODG1KQLOS2GNO',
    label: 'Grimssea Hollow',
    hubId: '56',
    hubName: 'Groddle Forest',
    parent: 'GCR195Q63RK143M',
    door: 'door_1334185795362',
    arrive: Object.freeze({ x: 151, y: -53 }),
    woodTrees: 17,
    why: 'Wiki "Enchanted Forest": Grimssea Hollow, from Grimssea Bottom in Groddle Forest, 17 Wood Trees. Door door_1334185795362 (archived) arrives at 151,-53.',
  }),
  Object.freeze({
    id: 'afar',
    tsid: 'GDOLMQFMNOS24AJ',
    sourceTsid: 'LDOLMQFMNOS24AJ',
    label: 'Afar Cleft',
    hubId: '92',
    hubName: 'Tamila',
    parent: 'GIF7SHGS3E72T8L',
    door: 'door_1334186258299',
    arrive: Object.freeze({ x: -87, y: -75 }),
    woodTrees: 9,
    why: 'Wiki "Enchanted Forest" and "Afar Cleft": from Afar Whence in Tamila, 9 Wood Trees. Door door_1334186258299 (archived) arrives at -87,-75.',
  }),
  Object.freeze({
    id: 'magha',
    tsid: 'GUVNMB7AOOS28EK',
    sourceTsid: 'LUVNMB7AOOS28EK',
    label: 'Magha Pleat',
    hubId: '109',
    hubName: 'Rasana',
    parent: 'GUV22FOR7AF2TIE',
    door: 'door_1334186505811',
    arrive: Object.freeze({ x: 126, y: -66 }),
    woodTrees: 21,
    why: 'Wiki "Enchanted Forest" and "Magha Pleat": through a hollow tree on Magha Shank in Rasana, 21 Wood Trees. Door door_1334186505811 (archived) arrives at 126,-66.',
  }),
]);

/*
 * Each hollow measured on its panorama, in that image's pixels (x 0..900 left
 * to right, y 0..h top to bottom). A shelf is its walkable top edge (a
 * polyline) and the x of every Wood Tree standing on it; `art: false` marks a
 * little fungus drawn on the bark that nothing stands on. A ladder runs from
 * `bottom` up to `top`. Wall decos are placed by their own art: a crack light
 * by its slit, the rest by their box (x centre, top, bottom).
 */
export const HOLLOW_LAYOUTS = Object.freeze({
  grimssea: {
    post: '54865968635',
    // Measured again 2026-11-12 on Cleops's full-street snap (research/eleven-snaps/Groddle Forest/cleops,
    // reference only), the same 900 x 1800 picture as the panorama and the Goodnight Groddle full-street
    // template. It is not street-sized: the avatar stands 100 px tall in it and 125 px on Cleops's 1:1
    // Grimssea Bottom snap, so 1 snap px = 1.25 world px, as HOLLOW_SCALE has it. Walk lines run through
    // the feet of the Wood Trees (a tree stands 2 px under its line); `drawn` is the fungus the snap shows
    // where a walk line runs on under a ladder's top peg.
    snap: 'Cleops\'s full-street snap (eleven-snaps, Groddle Forest), the same picture: shelves, tree feet, pegs, slits and the door re-measured 2026-11-12',
    w: 900,
    h: 1800,
    door: 666,
    // The snap's shelves are one or two big pieces each, about 390 world px wide and 200 deep.
    fungus: { overlap: 1.12, maxH: 240 },
    shelves: [
      { id: 'top_left', pieces: 2, pts: [[62, 287], [128, 281], [272, 266], [393, 278], [498, 295], [585, 302]], trees: [128, 272, 393, 498] },
      { id: 'top_right', pieces: 1, pts: [[525, 192], [600, 178], [640, 172], [770, 196], [835, 204]], trees: [640, 770] },
      { id: 'upper_right', pieces: 1, pts: [[593, 412], [728, 402], [830, 405]], trees: [728] },
      { id: 'upper_middle', pieces: 2, pts: [[140, 612], [195, 612], [342, 603], [430, 598], [455, 585], [560, 578], [648, 585]], drawn: [195, 648], trees: [342] },
      { id: 'middle_right', pieces: 1, pts: [[500, 778], [632, 762], [760, 758], [840, 754]], trees: [632, 760] },
      { id: 'middle_left', pieces: 2, pts: [[60, 860], [250, 854], [360, 860], [480, 868], [545, 870]], drawn: [60, 480], trees: [360] },
      { id: 'grave_right', pieces: 1, pts: [[575, 1068], [760, 1068], [838, 1062]], trees: [760] },
      { id: 'lower_left', pieces: 2, pts: [[55, 1080], [128, 1075], [252, 1100], [375, 1117], [475, 1128]], trees: [128, 252, 375] },
      { id: 'bottom', pieces: 2, pts: [[285, 1500], [345, 1500], [470, 1512], [632, 1520], [770, 1532], [845, 1540]], drawn: [345, 845], trees: [632, 770] },
      { id: 'middle_left_under', pieces: 1, pts: [[100, 902], [460, 912]], trees: [], walk: false },
      { id: 'grave_cap_1', pieces: 1, pts: [[683, 972], [753, 970]], trees: [], walk: false },
      { id: 'grave_cap_2', pieces: 1, pts: [[782, 1000], [830, 998]], trees: [], walk: false },
    ],
    ladders: [
      { id: 'floor_left', x: 303, bottom: 'floor', top: 1500, why: 'pegs from the floor to beside the bottom shelf (snap: pegs 1460 to the floor); the shelf\'s walk line reaches 60 px left of its lip, under the top peg, to step off onto' },
      { id: 'centre', x: 522, bottom: 1515, top: 869, why: 'the long middle climb from the bottom shelf, behind the stump, to the middle left shelf\'s end (snap: pegs 850 to 1420, none above it); the shelf\'s walk line reaches 65 px right of its lip, under the top peg' },
      { id: 'top', x: 545, bottom: 579, top: 188, why: 'pegs from the upper middle shelf up past the top left shelf (snap: pegs 380 to 560); they run on to the top right shelf, whose lip is 137 world px over the top left one\'s end and out of a 105 px jump' },
      { id: 'left', x: 152, bottom: 857, top: 612, why: 'pegs up the left wall from the middle left shelf (snap: pegs 591 to 787); the upper middle shelf\'s walk line reaches 55 px left of its lip, under the top peg' },
    ],
    stumps: [{ x: 502, on: 'bottom', w: 85 }],
    wall: [
      { sprite: 'tree_cracklight_01a_et1', slit: [182, 105, 150] },
      { sprite: 'tree_cracklight_01b_et1', slit: [818, 485, 625], flip: true },
      { sprite: 'tree_cracklight_01c_et1', slit: [145, 1135, 1310] },
      { sprite: 'tree_cracklight_01a_et1', slit: [793, 1262, 1338] },
      { sprite: 'tree_knot_01c_et1', box: [152, 450, 600] },
      { sprite: 'tree_knot_01a_et1', box: [425, 935, 1040] },
      { sprite: 'tree_knot_01b_et1', box: [668, 1220, 1345] },
      { sprite: 'tree_knot_01a_et1', box: [662, 1325, 1440] },
      { sprite: 'treemoss_dark_01a_et1', box: [150, 1170, 1600] },
      { sprite: 'treemoss_dark_01b_et1', box: [785, 1110, 1370] },
      { sprite: 'treemoss_dark_01a_et1', box: [120, 560, 810] },
      { sprite: 'treemoss_dark_01d_et1', box: [380, 1560, 1745] },
      { sprite: 'treemoss_dark_01c_et1', box: [745, 880, 1010] },
      { sprite: 'treemoss_dark_01b_et1', box: [320, 330, 470] },
      { sprite: 'treemoss_01c_et1', box: [440, 520, 600] },
      { sprite: 'treemoss_01d_et1', box: [710, 1420, 1500] },
    ],
  },
  afar: {
    post: '48940157335',
    w: 900,
    h: 900,
    door: 272,
    shelves: [
      { id: 'top_left', pts: [[65, 238], [230, 232], [400, 246], [560, 258]], trees: [185, 335, 455] },
      { id: 'top_middle', pts: [[480, 126], [670, 124]], trees: [] },
      { id: 'top_right', pts: [[650, 222], [845, 218]], trees: [755] },
      { id: 'middle', pts: [[443, 422], [700, 420]], trees: [] },
      { id: 'left', pts: [[60, 520], [230, 515], [415, 500]], trees: [112, 228, 335] },
      { id: 'right', pts: [[515, 614], [700, 612], [835, 630]], trees: [640, 765] },
      { id: 'right_cap', pts: [[745, 292], [838, 290]], trees: [], walk: false },
    ],
    ladders: [
      { id: 'floor', x: 455, bottom: 'floor', top: 385, why: 'pegs from the floor up past the left shelf to the middle shelf (48940157335), whose lip reaches 52 px further left, under the top peg' },
      { id: 'top', x: 615, bottom: 421, top: 125, why: 'pegs from the middle shelf to the top right shelf; they run on to the top middle shelf, 90 px over the top of the pegs and out of a 105 px jump' },
    ],
    stumps: [{ x: 470, on: 'floor', w: 100 }],
    wall: [
      { sprite: 'tree_cracklight_01a_et1', slit: [155, 345, 470] },
      { sprite: 'tree_cracklight_01b_et1', slit: [730, 330, 520], flip: true },
      { sprite: 'tree_crack_01b_et1', box: [385, 40, 160] },
      { sprite: 'tree_knot_01b_et1', box: [487, 115, 185] },
      { sprite: 'tree_knot_01c_et1', box: [215, 585, 665] },
      { sprite: 'treemoss_dark_01a_et1', box: [470, 560, 840] },
      { sprite: 'treemoss_dark_01c_et1', box: [190, 740, 840] },
      { sprite: 'treemoss_dark_01d_et1', box: [720, 660, 840] },
      { sprite: 'treemoss_dark_01b_et1', box: [420, 290, 400] },
      { sprite: 'treemoss_dark_01c_et1', box: [250, 40, 160] },
    ],
  },
  magha: {
    post: '52343141868',
    w: 900,
    h: 1800,
    door: 665,
    shelves: [
      { id: 'top_left', pts: [[55, 262], [250, 255], [445, 258]], trees: [135, 262, 368] },
      { id: 'top_right', pts: [[500, 198], [560, 180], [845, 172]], trees: [620, 760] },
      { id: 'top_small', pts: [[455, 326], [640, 322]], trees: [] },
      { id: 'upper_right', pts: [[620, 414], [840, 410]], trees: [745] },
      { id: 'upper_left', pts: [[50, 540], [250, 520], [400, 478], [540, 470]], trees: [150, 280, 405] },
      { id: 'middle', pts: [[90, 800], [300, 788], [450, 776], [747, 767]], trees: [215, 335, 450] },
      { id: 'middle_right', pts: [[575, 954], [845, 950]], trees: [] },
      { id: 'lower_middle', pts: [[128, 1042], [300, 1022], [450, 1036], [560, 1050]], trees: [310, 450] },
      { id: 'lower_right', pts: [[475, 1240], [560, 1226], [840, 1212]], trees: [545, 662, 765] },
      { id: 'lower_left', pts: [[55, 1344], [442, 1340]], trees: [285] },
      { id: 'low_small', pts: [[230, 1528], [405, 1524]], trees: [320] },
      { id: 'low_right_1', pts: [[480, 1462], [655, 1460]], trees: [580] },
      { id: 'low_right_2', pts: [[670, 1474], [845, 1470]], trees: [765] },
      { id: 'low_right_under', pts: [[585, 1512], [750, 1510]], trees: [], walk: false },
    ],
    ladders: [
      { id: 'floor', x: 430, bottom: 'floor', top: 1300, why: 'pegs from the floor up between the low shelves (52343141868); the lower left shelf reaches 47 px further right, under the top peg' },
      { id: 'left', x: 140, bottom: 1342, top: 990, why: 'pegs up the left wall from the lower left shelf to the lower middle shelf, whose lip reaches 57 px further left, under the top peg' },
      { id: 'right', x: 735, bottom: 1213, top: 740, why: 'pegs from the middle right shelf to the middle shelf\'s end; they start on the lower right shelf, since the middle right shelf is 98 px over the lower middle one and out of a 105 px jump; the middle shelf reaches 37 px further right, under the top peg' },
      { id: 'upper', x: 570, bottom: 771, top: 324, why: 'pegs from the middle shelf up past the upper left shelf; they run on to the small top shelf, 80 px over the top of the pegs' },
    ],
    stumps: [{ x: 500, on: 'floor', w: 120 }],
    wall: [
      { sprite: 'tree_cracklight_01c_et1', slit: [80, 30, 160] },
      { sprite: 'tree_knot_01a_et1', box: [690, 265, 355] },
      { sprite: 'tree_knot_01c_et1', box: [265, 600, 705] },
      { sprite: 'tree_knot_01b_et1', box: [372, 1145, 1270] },
      { sprite: 'tree_crack_01a_et1', box: [315, 1590, 1650] },
      { sprite: 'tree_knot_01c_et1', box: [592, 1520, 1610] },
      { sprite: 'treemoss_dark_01a_et1', box: [130, 590, 960] },
      { sprite: 'treemoss_dark_01a_et1', box: [785, 470, 1010] },
      { sprite: 'treemoss_dark_01b_et1', box: [650, 1520, 1720] },
      { sprite: 'treemoss_dark_01d_et1', box: [370, 1640, 1750] },
      { sprite: 'treemoss_dark_01c_et1', box: [300, 290, 400] },
      { sprite: 'treemoss_01d_et1', box: [550, 1260, 1330] },
      { sprite: 'treemoss_01c_et1', box: [290, 1355, 1420] },
    ],
  },
});

export const enchantedForestByTsid = (tsid) =>
  ENCHANTED_FORESTS.find((f) => f.tsid === tsid || f.sourceTsid === tsid) || null;
export const enchantedForestById = (id) => ENCHANTED_FORESTS.find((f) => f.id === id) || null;
export const isEnchantedForest = (tsid) => Boolean(enchantedForestByTsid(tsid));

/* ------------------------------------------------------------------ */
/* Tree rules                                                           */
/* ------------------------------------------------------------------ */

function whole(value, fallback = 0, min = 0, max = 999999) {
  const n = Math.floor(Number(value));
  return Math.max(min, Math.min(max, Number.isFinite(n) ? n : fallback));
}

/** plankProdMap[maturity - 1] for an enchanted tree. */
export function enchantedPlankYield(maturity) {
  return ENCHANTED_WOOD_TREE.plankYieldByMaturity[whole(maturity, 1, 1, 6) - 1];
}

/** Sheet + frame for a tree's look (variant 1-4, maturity 1-6). */
export function enchantedTreeFrame(variant, maturity) {
  const sheet = ENCHANTED_TREE_SHEETS[whole(variant, 1, 1, 4) - 1];
  return { sheet, index: whole(maturity, 1, 1, 6) - 1 };
}

/** wood_tree.js onCreate: variant = floor(4 * random) + 1. Deterministic per hollow slot here. */
export function enchantedVariantFor(seed) {
  let h = 2166136261;
  for (const ch of String(seed)) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return (h % ENCHANTED_WOOD_TREE.variants) + 1;
}

/**
 * One hollow tree record (saved in the hollow's street slot). `state` is the
 * ordinary Wood Tree state (js/woodcutting.js) flagged enchanted, so the
 * shared harvest, pet and water verbs run on it unchanged.
 */
export function createEnchantedTree({ seed = '', maturity = 6, variant = null } = {}) {
  return {
    stage: 'tree',
    variant: variant ?? enchantedVariantFor(seed),
    dieAt: 0,
    growAt: 0,
    seedlingPets: 0,
    state: { maturity: whole(maturity, 6, 1, 6), harvestCount: 0, harvestedToday: false, totalHarvests: 0, petted: false, watered: false, enchanted: true },
  };
}

/** Repair a saved record in place (and return it). */
export function normalizeEnchantedTree(tree, seed = '') {
  const t = tree && typeof tree === 'object' ? tree : createEnchantedTree({ seed });
  t.stage = t.stage === 'seedling' ? 'seedling' : 'tree';
  t.variant = whole(t.variant, enchantedVariantFor(seed), 1, 4);
  t.dieAt = whole(t.dieAt, 0, 0, Number.MAX_SAFE_INTEGER);
  t.growAt = whole(t.growAt, 0, 0, Number.MAX_SAFE_INTEGER);
  t.seedlingPets = whole(t.seedlingPets, 0);
  t.state = t.state && typeof t.state === 'object' ? t.state : createEnchantedTree({ seed }).state;
  // Its care counts moved onto the state, where every Wood Tree keeps them (js/woodcutting.js
  // noteWoodCare, adoptPlotWoodCounts; not imported here, woodcutting.js imports this module).
  if (t.woodPetted != null || t.woodWatered != null) {
    t.state.carePets = Math.max(whole(t.state.carePets, 0), whole(t.woodPetted, 0));
    t.state.careWaters = Math.max(whole(t.state.careWaters, 0), whole(t.woodWatered, 0));
  }
  delete t.woodPetted;
  delete t.woodWatered;
  delete t.seenPetted;
  delete t.seenWatered;
  delete t.seenHarvests;
  t.state.enchanted = true;
  return t;
}

/**
 * Advance one tree to `now`: a harvested-out tree (maturity 0) becomes a
 * seedling 2 s later; the seedling grows into a fresh maturity-1 tree 5 min
 * after that. Catches up across reloads. Returns 'died' | 'grew' | null.
 */
export function advanceEnchantedTree(tree, now = Date.now()) {
  if (!tree) return null;
  let event = null;
  if (tree.stage === 'tree' && whole(tree.state?.maturity, 1) <= 0) {
    if (!tree.dieAt) tree.dieAt = now + ENCHANTED_WOOD_TREE.dieDelayMs;
    if (now >= tree.dieAt) {
      tree.stage = 'seedling';
      tree.growAt = tree.dieAt + ENCHANTED_WOOD_TREE.seedlingMinMs;
      tree.dieAt = 0;
      tree.seedlingPets = 0;
      event = 'died';
    }
  }
  if (tree.stage === 'seedling' && tree.growAt && now >= tree.growAt) {
    // growUp: a brand-new item, so the daily harvest/care marks start clean.
    tree.stage = 'tree';
    tree.growAt = 0;
    tree.state = {
      maturity: ENCHANTED_WOOD_TREE.regrowMaturity,
      harvestCount: 0,
      harvestedToday: false,
      totalHarvests: 0,
      petted: false,
      watered: false,
      enchanted: true,
    };
    event = 'grew';
  }
  return event;
}

/** Milliseconds until a seedling grows (0 when not a seedling). */
export function seedlingRemainingMs(tree, now = Date.now()) {
  if (tree?.stage !== 'seedling' || !tree.growAt) return 0;
  return Math.max(0, tree.growAt - now);
}

/**
 * patch_seedling.js onPetted on an enchanted seedling (petted is already 3):
 * 2 energy, the pet_no_more bubble, and no progress.
 */
export function petEnchantedSeedling(tree, pc = {}, turn = 0) {
  if (tree?.stage !== 'seedling') return { ok: false, reason: 'not_seedling' };
  const energy = ENCHANTED_WOOD_TREE.seedlingPetEnergy;
  // G289: metabolics_lose_energy, nothing lost while dead (inc_metabolics.js 108-122).
  const energyLost = loseEnergy(pc, energy);
  tree.seedlingPets = whole(tree.seedlingPets, 0) + 1;
  const lines = SEEDLING_PET_NO_MORE_LINES;
  return {
    ok: false,
    energyCost: energyLost,
    bubble: lines[whole(turn, 0) % lines.length],
    msg: SEEDLING_PET_NO_MORE,
  };
}

export function seedlingStatusLabel(tree, now = Date.now()) {
  const ms = seedlingRemainingMs(tree, now);
  const min = Math.ceil(ms / 60000);
  return ms > 0 ? `Enchanted seedling · grows back in ${min} min` : 'Enchanted seedling · growing now';
}

/** wood_tree.js poison / trantsform conditions: null for an enchanted tree. */
export const isEnchantedTreeState = (state) => Boolean(state && state.enchanted === true);


/* ------------------------------------------------------------------ */
/* Hollow street builder                                                */
/* ------------------------------------------------------------------ */

/** The decos a hollow uses, at their own size (world px: the 2x files halved). */
export const ET1_SIZES = Object.freeze({
  fungus_oyster_01a_et1: [169, 77],
  fungus_oyster_01b_et1: [173, 72],
  fungus_oyster_01c_et1: [182, 75],
  fungus_oyster_01d_et1: [130, 72],
  door_asset_woodtreedoor_01a_et1: [69, 167.5],
  tree_floor_stump_01a_et1: [85.5, 83.5],
  tree_floor_01a_et1: [843, 262],
  tree_background_tile_01a_et1: [900, 400],
  top_gradient_et1: [900, 400],
  tree_cracklight_01a_et1: [130, 131],
  tree_cracklight_01b_et1: [245, 234],
  tree_cracklight_01c_et1: [569, 452],
  tree_crack_01a_et1: [15, 190],
  tree_crack_01b_et1: [13, 127],
  tree_knot_01a_et1: [40, 159],
  tree_knot_01b_et1: [25, 116],
  tree_knot_01c_et1: [58, 286],
  treemoss_dark_01a_et1: [97, 368],
  treemoss_dark_01b_et1: [65, 201],
  treemoss_dark_01c_et1: [88, 107],
  treemoss_dark_01d_et1: [113, 122],
  treemoss_01c_et1: [88, 107],
  treemoss_01d_et1: [109, 118],
});
/** Where the slit sits in each crack light's art (x, top, bottom as shares of its box). */
const SLIT = Object.freeze({ x: 0.06, top: 0.06, bottom: 0.35 });
/** The shelves' fungus, in turn. */
const FUNGUS = Object.freeze(['fungus_oyster_01c_et1', 'fungus_oyster_01a_et1', 'fungus_oyster_01b_et1', 'fungus_oyster_01d_et1']);
/** A fungus piece's walkable top lies this share of its height above its foot. */
const FUNGUS_TOP = 0.66;
/** No fungus piece deeper than this (a short shelf is one wide piece, as flat as the long ones). */
const FUNGUS_MAX_H = 112;
/** The floor art's floor lies this share of its height above its foot (tree_floor_01a_et1). */
const FLOOR_TOP = 0.27;
/**
 * Peg ladders: the panoramas' flat plank pegs are groddle1.swf's trunk_ladder_1 (three staggered
 * planks a piece), as Tiny Speck's own enchant_tree rooms in Balzare use them (Nemo Sana). One
 * piece at most this tall, stacked up the ladder.
 */
const PEG_PIECE_H = 108;
const PEG_PIECE_W = 90;
/** Bark, peg and shelf layer colours, matched by eye to the panoramas (pale shelves, dark bark). */
export const HOLLOW_FILTERS = Object.freeze({
  wall: Object.freeze({ brightness: -28, saturation: -18 }),
  pegs: Object.freeze({ brightness: -12, saturation: -20 }),
  shelves: Object.freeze({ brightness: -2, saturation: -52 }),
});
export const HOLLOW_GRADIENT = Object.freeze({ top: '120A05', bottom: '3B3128' });

const round = (v) => Math.round(v * 100) / 100;

/** Height of a polyline at x (clamped to its ends). */
export function polylineY(pts, x) {
  if (x <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i += 1) {
    const [x0, y0] = pts[i - 1];
    const [x1, y1] = pts[i];
    if (x <= x1) return y0 + ((x - x0) / (x1 - x0)) * (y1 - y0);
  }
  return pts[pts.length - 1][1];
}

/**
 * A hollow's measured layout in world space: bounds, floor y, each walkable
 * shelf (world polyline), ladders, tree spots, door x. `layout` defaults to
 * HOLLOW_LAYOUTS[forest.id].
 */
export function hollowGeometry(forest, layout = HOLLOW_LAYOUTS[forest.id]) {
  const S = HOLLOW_SCALE;
  const X = (px) => Math.round((px - layout.w / 2) * S);
  const Y = (py) => Math.round((py - layout.h) * S);
  const W = Math.round(layout.w * S);
  const H = Math.round(layout.h * S);
  const bounds = { l: -Math.round(W / 2), r: W - Math.round(W / 2), t: -H, b: 0 };
  const floorY = forest.arrive.y;
  const shelves = layout.shelves.map((s) => ({
    id: s.id,
    walk: s.walk !== false,
    pts: s.pts.map(([x, y]) => [X(x), Y(y)]),
    drawn: s.drawn ? s.drawn.map(X) : null,
    pieces: s.pieces || 0,
    trees: s.trees.map((tx) => ({ x: X(tx), y: round(Y(polylineY(s.pts, tx))) })),
  }));
  const ladders = layout.ladders.map((l) => {
    const bottom = l.bottom === 'floor' ? floorY : Y(l.bottom);
    const top = Y(l.top);
    return { id: l.id, x: X(l.x), bottom, top, why: l.why };
  });
  const trees = shelves.flatMap((s) => s.trees.map((t) => ({ ...t, shelf: s.id })));
  return { S, X, Y, W, H, bounds, floorY, shelves, ladders, trees, doorX: X(layout.door), wallL: X(48), wallR: X(layout.w - 48) };
}

/** World x,y of every Wood Tree in a hollow, in the panorama's shelf order (top to bottom). */
export const hollowTreeSpots = (forest) => hollowGeometry(forest).trees;

/**
 * Build a hollow's street JSON. The parent street gives the way out its
 * destination (the mini door) and the swf list.
 * @param {object} forest an ENCHANTED_FORESTS row
 * @param {object} parent the parent street JSON (assets/streets/<parent>.json)
 */
export function buildEnchantedForestStreet(forest, parent) {
  const layout = HOLLOW_LAYOUTS[forest.id];
  if (!layout) throw new Error(`${forest.label}: no layout`);
  const g = hollowGeometry(forest, layout);
  const { S, X, Y, W, H, bounds, floorY } = g;
  const local = (x, y) => ({ x: round(x - bounds.l), y: round(y - bounds.t) });
  const size = (sprite) => ET1_SIZES[sprite];

  // Walkable lines: the floor wall to wall, and every shelf (solid from the top only).
  const plat = (id, x1, y1, x2, y2, solid = false) => ({ id: `plat_ench_${forest.id}_${id}`, x1, y1, x2, y2, pc_perm: solid ? null : -1, item_perm: -1 });
  const platforms = [plat('floor', g.wallL, floorY, g.wallR, floorY, true)];
  for (const s of g.shelves) {
    if (!s.walk) continue;
    s.pts.slice(1).forEach(([x2, y2], i) => {
      const [x1, y1] = s.pts[i];
      platforms.push(plat(`${s.id}${s.pts.length > 2 ? `_${i}` : ''}`, x1, y1, x2, y2));
    });
  }
  const barriers = [
    { id: `wall_ench_${forest.id}_left`, x: g.wallL, y: bounds.t, h: H, pc_perm: null },
    { id: `wall_ench_${forest.id}_right`, x: g.wallR, y: bounds.t, h: H, pc_perm: null },
  ];
  const ladders = g.ladders.map((l) => ({ id: `ladder_ench_${forest.id}_${l.id}`, x: l.x, y: l.bottom, w: 50, h: l.bottom - l.top }));

  // Bark: the trunk tile up the whole height, the dark top, cracks, knots and moss.
  const wall = [];
  const [tw, th] = size('tree_background_tile_01a_et1');
  const tileH = Math.round((th * W) / tw);
  for (let i = 0, y = bounds.b; y > bounds.t; i += 1, y -= tileH) {
    wall.push({ sprite: 'tree_background_tile_01a_et1', ...local(0, y), w: W, h: tileH, z: i, r: 0 });
  }
  const [gw, gh] = size('top_gradient_et1');
  wall.push({ sprite: 'top_gradient_et1', ...local(0, bounds.t + Math.round((gh * W) / gw)), w: W, h: Math.round((gh * W) / gw), z: 90, r: 0 });
  layout.wall.forEach((d, i) => {
    const [nw, nh] = size(d.sprite);
    let x;
    let y;
    let h;
    if (d.slit) {
      const [sx, st, sb] = d.slit;
      h = ((sb - st) * S) / (SLIT.bottom - SLIT.top);
      const w = (h * nw) / nh;
      x = X(sx) + (0.5 - SLIT.x) * w * (d.flip ? -1 : 1);
      y = Y(st) - SLIT.top * h + h;
    } else {
      const [bx, bt, bb] = d.box;
      h = (bb - bt) * S;
      x = X(bx);
      y = Y(bb);
    }
    const w = (h * nw) / nh;
    wall.push({ sprite: d.sprite, ...local(x, y), w: Math.round(w), h: Math.round(h), z: 20 + i, r: 0, ...(d.flip ? { flip: true } : {}) });
  });

  // Shelves: overlapping fungus along each shelf's top, the pegs behind them.
  const shelfArt = [];
  const pegs = [];
  g.shelves.forEach((s, si) => {
    // The fungus as drawn: a walk line may run on past it, under a ladder's top peg.
    const [x1, x2] = s.drawn || [s.pts[0][0], s.pts[s.pts.length - 1][0]];
    const span = x2 - x1;
    // A layout's `fungus` and a shelf's `pieces` set the pieces as its picture shows them.
    const n = s.pieces || Math.max(1, Math.round(span / 250));
    const step = span / n;
    for (let i = 0; i < n; i += 1) {
      const sprite = FUNGUS[(si + i) % FUNGUS.length];
      const [nw, nh] = size(sprite);
      const pw = step * (layout.fungus?.overlap ?? 1.3);
      const ph = Math.min(layout.fungus?.maxH ?? FUNGUS_MAX_H, (pw * nh) / nw);
      const cx = x1 + (i + 0.5) * step;
      const top = polylineY(s.pts, cx);
      shelfArt.push({ sprite, ...local(cx, top + FUNGUS_TOP * ph), w: Math.round(pw), h: Math.round(ph), z: 100 + si * 10 + (i % 2 ? 0 : 5), r: 0, ...((si + i) % 2 ? { flip: true } : {}) });
    }
  });
  g.ladders.forEach((l, li) => {
    const len = l.bottom - l.top;
    const n = Math.max(1, Math.ceil(len / PEG_PIECE_H));
    const ph = len / n;
    for (let i = 0; i < n; i += 1) {
      pegs.push({ sprite: 'trunk_ladder_1', ...local(l.x, l.bottom - i * ph), w: PEG_PIECE_W, h: Math.round(ph), z: 10 + li, r: 0, ...(i % 2 ? { flip: true } : {}) });
    }
  });

  // Middleground: the rooty floor and the stumps.
  const [fw, fh] = size('tree_floor_01a_et1');
  const floorH = Math.round((fh * W) / fw);
  const middle = [{ sprite: 'tree_floor_01a_et1', ...{ x: 0, y: round(floorY + FLOOR_TOP * floorH) }, w: W, h: floorH, z: 1, r: 0 }];
  for (const st of layout.stumps || []) {
    const [sw, sh] = size('tree_floor_stump_01a_et1');
    const w = st.w * S;
    const h = (w * sh) / sw;
    const shelf = layout.shelves.find((s) => s.id === st.on);
    const foot = shelf ? Y(polylineY(shelf.pts, st.x)) + 0.1 * h : floorY + 0.12 * h;
    const deco = { sprite: 'tree_floor_stump_01a_et1', x: X(st.x), y: round(foot), w: Math.round(w), h: Math.round(h), z: 5, r: 0 };
    middle.push(deco);
  }

  const layers = [
    { id: 'T_ench_bark', name: 'bark', z: -3, w: W, h: H, filters: { ...HOLLOW_FILTERS.wall }, decos: wall },
    { id: 'T_ench_pegs', name: 'pegs', z: -2, w: W, h: H, filters: { ...HOLLOW_FILTERS.pegs }, decos: pegs },
    { id: 'T_ench_shelves', name: 'shelves', z: -1, w: W, h: H, filters: { ...HOLLOW_FILTERS.shelves }, decos: shelfArt },
    { id: 'middleground', name: 'middleground', z: 0, w: W, h: H, decos: middle },
  ];

  // The way out: the arched door at the foot of the trunk, back to the parent's mini door.
  const parentDoor = (parent.doors || []).find((d) => d.id === forest.door);
  if (!parentDoor) throw new Error(`${parent.label} has no ${forest.door}`);
  const back = { x: parentDoor.x + parent.bounds.l, y: parentDoor.y + parent.bounds.t };
  const [dw, dh] = size('door_asset_woodtreedoor_01a_et1');
  const doors = [{
    id: `door_${forest.id}_wayout`,
    x: g.doorX - bounds.l,
    y: floorY - bounds.t,
    w: dw,
    h: Math.round(dh),
    sprite: 'door_asset_woodtreedoor_01a_et1',
    key_id: 0,
    requires_level: 0,
    is_locked: false,
    hidden: false,
    connect: {
      tsid: `L${parent.tsid.slice(1)}`,
      label: parent.label,
      street: null,
      x: back.x,
      y: back.y,
      hub_id: forest.hubId,
    },
  }];
  const decoCount = layers.reduce((n, layer) => n + layer.decos.length, 0);
  return {
    source: ENCHANTED_FOREST_SOURCE,
    reconstructed: true,
    enchantedForest: forest.id,
    tsid: forest.tsid,
    label: forest.label,
    hubId: forest.hubId,
    hubName: forest.hubName,
    musicFile: ENCHANTED_MUSIC,
    swf_file: 'enchant_tree.swf',
    bounds,
    platforms,
    layers,
    signposts: [],
    stats: {
      platformCount: platforms.length,
      layerCount: layers.length,
      decoCount,
      signpostCount: 0,
      doorCount: doors.length,
      ladderCount: ladders.length,
      barrierCount: barriers.length,
    },
    gradient: { ...HOLLOW_GRADIENT },
    doors,
    barriers,
    ladders,
    why: {
      hollow: forest.why,
      layout: `Laid out from the Glitch Tribute Blog panorama, johnexploresur.tumblr.com post ${layout.post} (reference only): ${layout.w} x ${layout.h} px at ${S} world px per px, about the trunk's centre, the floor at the door's connect y. ${g.trees.length} Wood Trees where the panorama shows them.${layout.snap ? ` Checked against ${layout.snap}.` : ''}`,
      ladders: g.ladders.map((l) => `ladder_ench_${forest.id}_${l.id}: ${l.why}`).join('; '),
      look: 'Tiny Speck\'s enchant_tree.swf set (CC0): bark tile, fungus shelves, knots, crack lights, moss, the rooty floor and stump, the arched door; the pegs are groddle1.swf trunk_ladder_1, as in Tiny Speck\'s own enchant_tree rooms. The shelves are pale and the bark dark, as in the panoramas.',
      music: 'ENCHANTED_WOOD (inc_data_sounds.js, uploaded 2012-04-11, the day the hollow doors were placed).',
    },
  };
}

/** assets/streets/index.json row for a built hollow. */
export function enchantedForestIndexEntry(forest, street) {
  return {
    label: forest.label,
    file: `assets/streets/${forest.tsid}.json`,
    hubId: forest.hubId,
    hubName: forest.hubName,
    platforms: street.platforms.length,
    decos: street.stats.decoCount,
    reconstructed: true,
  };
}
