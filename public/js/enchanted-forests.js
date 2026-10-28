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
 * Reconstruction (each hollow carries a `why`): the geometry and art are a
 * slice of the parent street's own CC0 location (its platforms, middleground
 * and parallax layers, cut to the hollow's width with the parent's parallax
 * ratio kept), shaded purple ("the lovely purple shadows", forum) and
 * scored with ENCHANTED_WOOD, the track uploaded the day they opened. The
 * door's own connect x/y is the arrival point, and the way out stands there.
 */

export const ENCHANTED_SOURCE = 'tinyspeck/glitch-GameServerJS CC0 items/wood_tree_enchanted.js';
import { loseEnergy } from './metabolics.js';
export const ENCHANTED_FOREST_SOURCE = 'reconstruction: Enchanted Forest hollows (not in tinyspeck/glitch-locations); a purple-shaded slice of the parent street\'s CC0 location';

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
/** A purple wash over every layer (tint filter, as the source layers use). */
export const ENCHANTED_TINT = Object.freeze({ tintColor: 0x6b3fa0, tintAmount: 45 });
/** The client viewport width the parallax formula uses (js/street-render.js). */
export const VIEW_W = 960;
/** Horizontal room per tree in a hollow, plus the margin at each end. */
export const TREE_SPACING = 170;
export const HOLLOW_MARGIN = 350;

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
    woodPetted: 0,
    woodWatered: 0,
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
  t.woodPetted = whole(t.woodPetted, 0);
  t.woodWatered = whole(t.woodWatered, 0);
  t.state = t.state && typeof t.state === 'object' ? t.state : createEnchantedTree({ seed }).state;
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
    tree.woodPetted = 0;
    tree.woodWatered = 0;
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

/** Walkable floor (lowest platform) at world x, or null. */
export function floorAt(platforms, x) {
  let best = null;
  for (const p of platforms || []) {
    const a = Math.min(p.x1, p.x2);
    const b = Math.max(p.x1, p.x2);
    if (x < a || x > b || b === a) continue;
    const y = p.y1 + ((x - p.x1) / (p.x2 - p.x1)) * (p.y2 - p.y1);
    if (best === null || y > best) best = y;
  }
  return best;
}

/**
 * The flattest stretch of `width` on the parent street (floor range, sampled
 * every 50 px, every sample on a platform). Ties keep the leftmost.
 */
export function flattestWindow(street, width, step = 50) {
  const { l, r } = street.bounds;
  const xs = [];
  for (let x = l; x <= r; x += step) xs.push(x);
  const floors = xs.map((x) => floorAt(street.platforms, x));
  const span = Math.round(width / step);
  let best = null;
  for (let i = 0; i + span < xs.length; i += 1) {
    const seg = floors.slice(i, i + span + 1);
    if (seg.some((v) => v === null)) continue;
    const range = Math.max(...seg) - Math.min(...seg);
    if (!best || range < best.range - 1e-9) best = { x0: xs[i], x1: xs[i] + width, range, low: Math.max(...seg), high: Math.min(...seg) };
  }
  return best;
}

/** Clip a platform to [a, b] (world x), interpolating y at the cut. */
export function clipPlatform(p, a, b) {
  const lo = Math.min(p.x1, p.x2);
  const hi = Math.max(p.x1, p.x2);
  if (hi <= a || lo >= b) return null;
  const yAt = (x) => (p.x2 === p.x1 ? p.y1 : p.y1 + ((x - p.x1) / (p.x2 - p.x1)) * (p.y2 - p.y1));
  const x1 = Math.max(lo, a);
  const x2 = Math.min(hi, b);
  if (x2 - x1 < 1) return null;
  const left = p.x1 <= p.x2;
  return {
    ...p,
    x1: left ? x1 : x2,
    y1: yAt(left ? x1 : x2),
    x2: left ? x2 : x1,
    y2: yAt(left ? x2 : x1),
  };
}

/** Hollow width: the wiki's tree count at TREE_SPACING plus a margin each side. */
export const hollowWidth = (forest) => forest.woodTrees * TREE_SPACING + 2 * HOLLOW_MARGIN;

const round = (v) => Math.round(v * 100) / 100;

/**
 * Build a hollow's street JSON from its parent street JSON.
 * @param {object} forest an ENCHANTED_FORESTS row
 * @param {object} parent the parent street JSON (assets/streets/<parent>.json)
 */
export function buildEnchantedForestStreet(forest, parent) {
  const W = hollowWidth(forest);
  const win = flattestWindow(parent, W);
  if (!win) throw new Error(`${forest.label}: no ${W} px floor on ${parent.label}`);
  const a = win.x0;
  const b = win.x1;
  // Hollow world = parent world shifted so the door's arrival sits HOLLOW_MARGIN
  // in from the left edge, on the slice's floor.
  const l = forest.arrive.x - HOLLOW_MARGIN;
  const dx = l - a;
  const floorThere = floorAt(parent.platforms, a + HOLLOW_MARGIN);
  const dy = Math.round(forest.arrive.y - floorThere);
  const bounds = { l, r: l + W, t: parent.bounds.t + dy, b: parent.bounds.b + dy };
  const H = bounds.b - bounds.t;

  const platforms = (parent.platforms || [])
    .map((p) => clipPlatform(p, a, b))
    .filter(Boolean)
    .map((p, i) => ({ ...p, id: `plat_ench_${forest.id}_${i}`, x1: round(p.x1 + dx), y1: round(p.y1 + dy), x2: round(p.x2 + dx), y2: round(p.y2 + dy) }));
  const inX = (x) => x >= a && x <= b;
  const barriers = (parent.barriers || []).filter((w) => inX(w.x)).map((w) => ({ ...w, x: w.x + dx, y: w.y + dy }));
  const ladders = (parent.ladders || []).filter((d) => inX(d.x)).map((d) => ({ ...d, x: d.x + dx, y: d.y + dy }));

  const parentW = parent.bounds.r - parent.bounds.l;
  const f0 = (a - parent.bounds.l) / (parentW - VIEW_W);
  const f1 = (b - VIEW_W - parent.bounds.l) / (parentW - VIEW_W);
  const tint = (filters) => (filters?.tintAmount ? { ...filters } : { ...(filters || {}), ...ENCHANTED_TINT });
  const layers = (parent.layers || []).map((layer) => {
    const out = { ...layer, filters: tint(layer.filters) };
    if (layer.id === 'middleground') {
      const margin = 400;
      out.decos = (layer.decos || [])
        .filter((d) => d.x >= a - margin && d.x <= b + margin)
        .map((d) => ({ ...d, x: d.x + dx, y: d.y + dy }));
      out.w = W;
      out.h = H;
      return out;
    }
    // Parallax layer: keep the parent's slide ratio over the narrower street.
    const L = layer.w || parentW;
    const o = Math.max(0, f0 * (L - VIEW_W));
    const Lh = Math.round(Math.max(VIEW_W, (f1 - f0) * (L - VIEW_W) + VIEW_W));
    const margin = 600;
    out.decos = (layer.decos || [])
      .filter((d) => d.x >= o - margin && d.x <= o + Lh + margin)
      .map((d) => ({ ...d, x: Math.round(d.x - o) }));
    out.w = Lh;
    return out;
  });

  // The way out: the parent's mini door at the arrival point, back to the parent door.
  const parentDoor = (parent.doors || []).find((d) => d.id === forest.door);
  if (!parentDoor) throw new Error(`${parent.label} has no ${forest.door}`);
  const back = { x: parentDoor.x + parent.bounds.l, y: parentDoor.y + parent.bounds.t };
  const doors = [{
    id: `door_${forest.id}_wayout`,
    x: forest.arrive.x - l,
    y: Math.round((floorAt(platforms, forest.arrive.x) ?? forest.arrive.y) - bounds.t),
    w: parentDoor.w,
    h: parentDoor.h,
    sprite: parentDoor.sprite,
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
  const decoCount = layers.reduce((n, layer) => n + (layer.decos?.length || 0), 0);
  return {
    source: ENCHANTED_FOREST_SOURCE,
    reconstructed: true,
    enchantedForest: forest.id,
    tsid: forest.tsid,
    label: forest.label,
    hubId: forest.hubId,
    hubName: forest.hubName,
    musicFile: ENCHANTED_MUSIC,
    swf_file: parent.swf_file,
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
    gradient: parent.gradient ? { ...parent.gradient } : { top: '3B2A5C', bottom: '9C7FC4' },
    doors,
    barriers,
    ladders,
    why: {
      hollow: forest.why,
      slice: `Parent ${parent.label} x ${a}..${b} (floor range ${Math.round(win.range)} px), shifted by ${dx},${dy}.`,
      look: 'Purple tint over every layer: "the lovely purple shadows" (forum, a player\'s house in the Enchanted Forest); the enchant_tree.swf decos were never recovered.',
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
