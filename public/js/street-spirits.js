/**
 * Regional Street Spirits (register G181). GameServerJS has five spirit
 * classes: the generic items/street_spirit.js and its regional children
 * street_spirit_groddle.js, street_spirit_firebog.js, street_spirit_zutto.js
 * (the Uralia spirit: its Cubimal is npc_cubimal_uraliastreetspirit,
 * street_spirit_zutto.js 886-888) and street_spirit_ix.js.
 *
 * What the source says differs between them:
 * - Verbs, stores and quests are the same in all five: buy_sell, talk_to,
 *   reminisce and give_cubimal are all "defined by street_spirit", every
 *   store comes from the instance prop store_id, and every class answers the
 *   same seven quests (blue_and_white, le_miserable, winter_walk,
 *   an_autumn_day). So the store a street sells is unchanged here.
 * - The generic class is legacy: street_spirit.js onLoad (456-462) swaps
 *   every placed street_spirit for a street_spirit_groddle with the same
 *   props, and the client calls it "being deprecated in favor of
 *   street_spirit_*" (glitch-client Item.as 453-455). Its art is the Groddle
 *   one (same skull/eyes/top/bottom/base props).
 * - Art: each has its own SWF and clips (getAssetInfo bounds below).
 * - Idle and talk states: Groddle idle_hold / talk (street_spirit.js
 *   onCreate 438-440); Firebog idle_move, never walks (firebog.js 369-388);
 *   Ix idle / talk / move (ix.js 363-371); Uralia sits on the ground and
 *   rises to hover while a player is within 250 px, talks with hoverTalk,
 *   lowers when they leave, faces the player and never walks (zutto.js
 *   369-430, 452-458, 506-509).
 * - Talk: each region has its own conversations (Groddle "Street Spirit
 *   Stories" + "Sonnets of the Street Spirit", Firebog "Street Spirit
 *   Mysteries", Uralia "When Down Was Up"; Ix has none). Lines in
 *   js/dialogue.js.
 * - Loneliness offsets and the cry state differ (not built: the remake has
 *   no loneliness system).
 *
 * Placement: the location dump names every spirit only by its objref label
 * "Street Spirit" (885 streets), never its class, so the variant comes from
 * the street's hub, using GameServerJS main.js rsp.ambient_hub_map
 * (456-510): the 'firebog' hubs get the Firebog spirit, the 'uralia' hub and
 * its 'caverns' (Ilmenskie Caverns and Deeps, built only from the Uralia art
 * set zutto1.swf; the spirit's own lines are about these caverns) get the
 * Uralia spirit, the 'ix' hub gets the Ix spirit, and everything else the
 * Groddle spirit. No Ix street in the dump holds a spirit, so the Ix spirit
 * is placed nowhere (QA: ?spiritdemo=ix).
 *
 * The world side is features/street-spirits-feature.js.
 */

export const STREET_SPIRITS_SOURCE = 'tinyspeck/glitch-GameServerJS items/street_spirit*.js (CC0)';

/** main.js ambient_hub_map 463-467 ('firebog'). */
export const FIREBOG_HUBS = Object.freeze(['63', '71', '72', '77', '99']);
/** main.js ambient_hub_map 460 ('uralia': 51) and 457-458 ('caverns': 78 Ilmenskie Deeps, 50 Ilmenskie Caverns). */
export const URALIA_HUBS = Object.freeze(['51', '50', '78']);
/** main.js ambient_hub_map 489 ('ix'). */
export const IX_HUBS = Object.freeze(['27']);

export const STREET_SPIRIT_VARIANTS = Object.freeze({
  groddle: Object.freeze({
    classTsid: 'street_spirit_groddle',
    region: 'Groddle',
    gsjs: 'items/street_spirit_groddle.js',
    asset: { x: -84, y: -176, w: 161, h: 201 }, // getAssetInfo 1350
    tags: ['streetspirit', 'no_trade'],
    idle: 'idle',
    talk: 'talk',
    dialogueKey: 'street_spirit',
    conversations: ['street_spirit_stories_1', 'street_spirit_stories_2', 'sonnets_of_the_street_spirit_1', 'sonnets_of_the_street_spirit_2'],
    loneliness: { state: 'idle_cry', size: 250, x: 55, y: 85 },
  }),
  firebog: Object.freeze({
    classTsid: 'street_spirit_firebog',
    region: 'Firebog',
    gsjs: 'items/street_spirit_firebog.js',
    asset: { x: -62, y: -338, w: 117, h: 272 },
    tags: ['firebog', 'streetspirit', 'no_trade'],
    idle: 'idle',
    talk: 'talk',
    dialogueKey: 'street_spirit_firebog',
    conversations: ['street_spirit_mysteries_1', 'street_spirit_mysteries_2'],
    loneliness: { state: 'idle_cry', size: 325, x: 60, y: 85 },
  }),
  zutto: Object.freeze({
    classTsid: 'street_spirit_zutto',
    region: 'Uralia',
    gsjs: 'items/street_spirit_zutto.js',
    asset: { x: -69, y: -97, w: 134, h: 122 },
    tags: ['streetspirit', 'no_trade'],
    idle: 'ground',
    talk: 'talk',
    dialogueKey: 'street_spirit_zutto',
    conversations: ['when_down_was_up_1', 'when_down_was_up_2'],
    loneliness: { state: 'hoverCry', size: 215, x: 55, y: 95 },
    /** checkForPlayers (zutto.js 377): a player within 250 px on both axes wakes it. */
    wakeRadius: 250,
  }),
  ix: Object.freeze({
    classTsid: 'street_spirit_ix',
    region: 'Ix',
    gsjs: 'items/street_spirit_ix.js',
    asset: { x: -64, y: -148, w: 128, h: 149 },
    tags: ['ix', 'streetspirit', 'no_trade'],
    idle: 'idle',
    talk: 'talk',
    dialogueKey: 'street_spirit',
    conversations: [],
    loneliness: null,
  }),
});

export const SPIRIT_VARIANT_IDS = Object.freeze(Object.keys(STREET_SPIRIT_VARIANTS));

/**
 * Streets whose hub in assets/streets/index.json is not the hub of their
 * late-game location object (L*.xml hubid, which GSJS inc_data_maps_prod.js
 * maps_get_streets agrees with) where that changes the spirit. The remake's
 * index differs on 54 spirit streets; these 6 would get the wrong region.
 */
export const SPIRIT_STREET_HUBS = Object.freeze({
  GA5KKVRDKAT2EA2: '121', // Shinso Ello: index Jethimadh (71), maps_get_streets Sura (121)
  GCR13M5UQEM15TA: '56', // Ferncaster End: index Shimla Mirch (63), Groddle Forest (56)
  GLIFIG7BP8G1MU9: '58', // Louise Pasture: index Ix (27), Groddle Meadow (58)
  GTJ12O0H7AO1IBS: '63', // Viscid Pud: index Cauda (120), Shimla Mirch (63)
  GTJ12SJ2RUV1N6R: '72', // Belan Bends: index Kloro (133), Chakra Phool (72)
  GUVNIF7Q9KR2382: '120', // Pandhal Pegs: index Shimla Mirch (63), Cauda (120)
});

/** The regional spirit for a street's hub id. */
export function spiritVariantForHub(hubId) {
  const hub = String(hubId ?? '');
  if (FIREBOG_HUBS.includes(hub)) return 'firebog';
  if (URALIA_HUBS.includes(hub)) return 'zutto';
  if (IX_HUBS.includes(hub)) return 'ix';
  return 'groddle';
}

/**
 * Sheets from the CC0 OGA dump (tools/street-spirit-art.mjs). Each look is
 * one instance-prop combination Tiny Speck exported (Groddle skull/eyes/top/
 * bottom/base, Firebog size, Uralia cap); `cell` is the x1 grid cell, `crop`
 * the union box every state is cut to, `frames` the populated cells kept
 * (every `step`-th one). Strips are 8 columns at
 * assets/sprites/street-spirits/<variant>_<look>_<state>.webp.
 */
export const STREET_SPIRIT_ART = Object.freeze({
  groddle: {
    dir: 'street_spirit_groddle',
    // Each prop combination was exported on its own grid.
    cells: {
      dirt: { w: 98, h: 150 },
      sprout: { w: 132, h: 197 },
      flower: { w: 110, h: 187 },
      lotus: { w: 112, h: 183 },
      leafhat: { w: 105, h: 187 },
      feathers: { w: 126, h: 175 },
    },
    crops: {
      dirt: { x: 15, y: 8, w: 77, h: 99 },
      sprout: { x: 8, y: 5, w: 111, h: 182 },
      flower: { x: 17, y: 0, w: 81, h: 153 },
      lotus: { x: 17, y: 2, w: 81, h: 162 },
      leafhat: { x: 18, y: 0, w: 78, h: 181 },
      feathers: { x: 19, y: 13, w: 107, h: 133 },
    },
    looks: {
      // Item.as 455-461 DEFAULT_CONFIG, the same as street_spirit.js initInstanceProps.
      dirt: 'base_base_L0dirt_bottom_none_eyes_eyes_L0eyes1_skull_skull_L0dirt_top_none',
      sprout: 'base_base_L1dirt_bottom_bottom_L1LeafSkirt_eyes_eyes_L1eyes2_skull_skull_L1dirt_top_top_L1LeafSprout',
      flower: 'base_base_L1dirt_bottom_bottom_L1FlowerBush_eyes_eyes_L1eyes3_skull_skull_L1dirt_top_top_L1FlowerTop',
      lotus: 'base_base_L1dirt_bottom_bottom_L1LotusBottom_eyes_eyes_L1eyes1_skull_skull_L1dirt_top_top_L1LotusTop',
      leafhat: 'base_base_L1wood_bottom_bottom_L1woodRoots_eyes_eyes_L1eyes2_skull_skull_L1wood_top_top_L1woodLeafHat',
      feathers: 'base_base_L1wood_bottom_bottom_L1FallLeaves_eyes_eyes_L1eyes3_skull_skull_L1wood_top_top_L1Feathers',
    },
    states: {
      idle: { oga: 'idle_hold', frames: 85 },
      talk: { oga: 'talk', frames: 73 },
    },
  },
  firebog: {
    dir: 'street_spirit_firebog',
    // Each size is its own grid. firebog.js 46 gives a new spirit size small,
    // the client defaults to large (Item.as 465-469). The small one (29x110,
    // size_small) is too slight to read as a vendor, so streets use these two.
    cells: { medium: { w: 63, h: 189 }, large: { w: 107, h: 244 } },
    crops: { medium: { x: 0, y: 0, w: 63, h: 189 }, large: { x: 10, y: 0, w: 94, h: 244 } },
    looks: { medium: 'size_medium', large: 'size_large' },
    states: {
      idle: { oga: 'idle_move', frames: 24 },
      talk: { oga: 'talk', frames: 62 },
    },
  },
  zutto: {
    dir: 'street_spirit_zutto',
    cell: { w: 151, h: 180 },
    crop: { x: 0, y: 0, w: 151, h: 180 },
    // zutto.js 46 / 431: capPurple unless the instance says otherwise.
    looks: { purple: 'cap_capPurple', aqua: 'cap_capAqua' },
    states: {
      ground: { oga: 'groundIdle', frames: 24 },
      raise: { oga: 'raise', frames: 31, once: true },
      hover: { oga: 'hoverIdle', frames: 23 },
      talk: { oga: 'hoverTalk', frames: 46 },
      lower: { oga: 'lower', frames: 26, once: true },
    },
  },
  ix: {
    dir: 'street_spirit_ix',
    cell: { w: 142, h: 155 },
    crop: { x: 0, y: 0, w: 142, h: 155 },
    looks: { plain: '' },
    states: {
      idle: { oga: 'idle', frames: 58 },
      talk: { oga: 'talk', frames: 122, step: 2 },
    },
  },
});

export const SPIRIT_ART_DIR = 'assets/sprites/street-spirits/';
const STRIP_COLS = 8;

/** Grid cell and crop for one look (Firebog sizes each have their own). */
export function spiritCell(variant, look) {
  const art = STREET_SPIRIT_ART[variant];
  if (!art) return null;
  return { cell: art.cells?.[look] || art.cell, crop: art.crops?.[look] || art.crop };
}

export function spiritSheetName(variant, look, state) {
  return `${variant}_${look}_${state}.webp`;
}

/** sprite-sheets.js sheet def for one state's strip. */
export function spiritSheet(variant, look, state) {
  const sheet = STREET_SPIRIT_ART[variant]?.states?.[state];
  const box = spiritCell(variant, look);
  if (!sheet || !box || STREET_SPIRIT_ART[variant].looks[look] === undefined) return null;
  return {
    path: `${SPIRIT_ART_DIR}${spiritSheetName(variant, look, state)}`,
    fw: box.crop.w,
    fh: box.crop.h,
    cols: STRIP_COLS,
    frames: Math.ceil(sheet.frames / (sheet.step || 1)),
    fps: 30 / (sheet.step || 1),
    once: Boolean(sheet.once),
  };
}

/** Every sheet one look needs. */
export function spiritSheets(variant, look) {
  return Object.keys(STREET_SPIRIT_ART[variant]?.states || {}).map((state) => spiritSheet(variant, look, state)).filter(Boolean);
}

/** Anchor keeping the source cell's centre over the platform point, the crop's bottom on the ground. */
export function spiritAnchor(variant, look) {
  const box = spiritCell(variant, look);
  if (!box) return { x: 0.5, y: 1 };
  return { x: (box.cell.w / 2 - box.crop.x) / box.crop.w, y: 1 };
}

function stableHash(text) {
  let h = 2166136261;
  for (const ch of String(text || '')) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}

/**
 * The look a street's spirit wears. The dump keeps no instance props, so the
 * remake picks one of the exported looks per street, stable across visits.
 */
export function spiritLookFor(variant, tsid) {
  const looks = Object.keys(STREET_SPIRIT_ART[variant]?.looks || {});
  if (!looks.length) return null;
  const id = String(tsid || '');
  const key = id.startsWith('L') ? `G${id.slice(1)}` : id;
  return looks[stableHash(key) % looks.length];
}

/** Variant and look for a street, or a forced variant (QA). */
export function spiritForStreet(street = {}, forced = '') {
  const id = String(street.tsid || '');
  const g = id.startsWith('L') ? `G${id.slice(1)}` : id;
  const hub = SPIRIT_STREET_HUBS[g] ?? street.hubId;
  const variant = STREET_SPIRIT_VARIANTS[forced] ? forced : spiritVariantForHub(hub);
  return { variant, look: spiritLookFor(variant, street.tsid), ...STREET_SPIRIT_VARIANTS[variant] };
}

/**
 * Uralia spirit state machine (zutto.js checkForPlayers 369-408): asleep on
 * the ground; a near player raises it to hover; it lowers when they leave.
 * Returns the clip to play next given the current clip and whether a player
 * is near (or the spirit is talking).
 */
export function zuttoNextClip(clip, near, finished) {
  if (clip === 'raise') return finished ? (near ? 'hover' : 'lower') : 'raise';
  if (clip === 'lower') return finished ? (near ? 'raise' : 'ground') : 'lower';
  if (clip === 'ground' || !clip) return near ? 'raise' : 'ground';
  return near ? clip : 'lower';
}

/** zutto.js 377: within 250 px on both axes. */
export function zuttoNear(spirit, player, radius = STREET_SPIRIT_VARIANTS.zutto.wakeRadius) {
  if (!spirit || !player) return false;
  return Math.abs(player.x - spirit.x) < radius && Math.abs(player.y - spirit.y) < radius;
}
