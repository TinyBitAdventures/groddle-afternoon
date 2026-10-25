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
 * - Loneliness offsets and the cry state differ (G185: built by
 *   js/spirit-loneliness.js and features/spirit-loneliness-feature.js; the
 *   cry clip and the invite's porthole portrait are STREET_SPIRIT_LONELY_ART
 *   below). Firebog's x offset is declared as "loneliness_offset_x"
 *   (street_spirit_firebog.js 30), a name inc_world_events.js 60 never
 *   reads, so its invite uses the default corner offset.
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
    // x is declared as loneliness_offset_x (firebog.js 30): never read (inc_world_events.js 60).
    loneliness: { state: 'idle_cry', size: 325, x: 60, y: 85, xRead: false },
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

/**
 * Loneliness art (register G185), from the same CC0 OGA dump
 * (tools/street-spirit-art.mjs writes these strips too).
 *
 * - `cry`: the street clip a lonely spirit plays, the class prop
 *   loneliness_state (Groddle and Firebog idle_cry, Uralia hoverCry; Ix has
 *   idleCry but is placed nowhere). Same grid as the look's idle sheet; its
 *   own crop (the tears fall below the feet), anchored so the look's ground
 *   line stays put. Loaded only when a spirit is lonely.
 * - `portrait`: the invite's porthole (inc_world_events.js 45-71:
 *   loneliness_in, then loneliness at 1 s, loneliness_out at 13 s). Each
 *   state has its own grid; strips are cut to the porthole and drawn centred.
 *   Firebog only exported the porthole for size_large (the size_medium
 *   loneliness clips are its plain body), so every Firebog invite uses it.
 *   `frames` counts from cell 0 (loneliness_in's first cell is blank).
 */
export const STREET_SPIRIT_LONELY_ART = Object.freeze({
  groddle: {
    cry: {
      oga: 'idle_cry',
      frames: 33,
      crops: {
        dirt: { x: 0, y: 29, w: 90, h: 121 },
        sprout: { x: 0, y: 21, w: 105, h: 173 },
        flower: { x: 0, y: 19, w: 96, h: 168 },
        lotus: { x: 0, y: 21, w: 96, h: 162 },
        leafhat: { x: 0, y: 19, w: 96, h: 158 },
        feathers: { x: 3, y: 38, w: 118, h: 137 },
      },
    },
    portrait: {
      in: {
        oga: 'loneliness_in',
        frames: 21,
        cells: { dirt: { w: 164, h: 165 }, sprout: { w: 192, h: 186 }, flower: { w: 164, h: 181 }, lotus: { w: 192, h: 178 }, leafhat: { w: 164, h: 166 }, feathers: { w: 164, h: 165 } },
        crops: {
          dirt: { x: 0, y: 1, w: 163, h: 162 },
          sprout: { x: 28, y: 22, w: 163, h: 162 },
          flower: { x: 0, y: 17, w: 163, h: 162 },
          lotus: { x: 28, y: 14, w: 163, h: 162 },
          leafhat: { x: 0, y: 2, w: 163, h: 162 },
          feathers: { x: 0, y: 1, w: 163, h: 162 },
        },
      },
      loop: { oga: 'loneliness', frames: 56, cell: { w: 153, h: 153 }, crop: { x: 1, y: 1, w: 151, h: 151 } },
      out: {
        oga: 'loneliness_out',
        frames: 15,
        cells: { dirt: { w: 164, h: 165 }, sprout: { w: 192, h: 186 }, flower: { w: 164, h: 181 }, lotus: { w: 192, h: 178 }, leafhat: { w: 164, h: 166 }, feathers: { w: 164, h: 165 } },
        crops: {
          dirt: { x: 1, y: 1, w: 162, h: 162 },
          sprout: { x: 29, y: 22, w: 162, h: 162 },
          flower: { x: 1, y: 17, w: 162, h: 162 },
          lotus: { x: 29, y: 14, w: 162, h: 162 },
          leafhat: { x: 1, y: 2, w: 162, h: 162 },
          feathers: { x: 1, y: 1, w: 162, h: 162 },
        },
      },
    },
  },
  firebog: {
    cry: { oga: 'idle_cry', frames: 24, crops: { medium: { x: 0, y: 0, w: 63, h: 189 }, large: { x: 0, y: 0, w: 107, h: 244 } } },
    portraitLook: 'large',
    portrait: {
      in: { oga: 'loneliness_in', frames: 19, cell: { w: 183, h: 183 }, crop: { x: 1, y: 1, w: 181, h: 181 } },
      loop: { oga: 'loneliness', frames: 75, cell: { w: 167, h: 168 }, crop: { x: 0, y: 1, w: 166, h: 166 } },
      out: { oga: 'loneliness_out', frames: 13, cell: { w: 183, h: 183 }, crop: { x: 1, y: 1, w: 181, h: 181 } },
    },
  },
  zutto: {
    // The full cell, as the other Uralia clips, so raise/hover/cry share one ground.
    cry: { oga: 'hoverCry', frames: 23, crop: { x: 0, y: 0, w: 151, h: 180 } },
    portrait: {
      in: { oga: 'loneliness_in', frames: 21, cell: { w: 144, h: 144 }, crop: { x: 1, y: 1, w: 142, h: 142 } },
      loop: { oga: 'loneliness', frames: 56, cell: { w: 131, h: 132 }, crop: { x: 1, y: 1, w: 129, h: 129 } },
      out: { oga: 'loneliness_out', frames: 15, cell: { w: 152, h: 152 }, crop: { x: 9, y: 9, w: 142, h: 142 } },
    },
  },
});

export const PORTRAIT_STATES = Object.freeze(['in', 'loop', 'out']);

/** The cry clip's grid cell, crop and anchor for one look (null: no cry art). */
export function spiritCryBox(variant, look) {
  const cry = STREET_SPIRIT_LONELY_ART[variant]?.cry;
  const base = spiritCell(variant, look);
  if (!cry || !base || STREET_SPIRIT_ART[variant].looks[look] === undefined) return null;
  const crop = cry.crops?.[look] || cry.crop;
  if (!crop) return null;
  const ground = base.crop.y + base.crop.h;
  return {
    cell: base.cell,
    crop,
    anchor: { x: (base.cell.w / 2 - crop.x) / crop.w, y: (ground - crop.y) / crop.h },
  };
}

/** The look a variant's portrait is cut from (Firebog: always size_large). */
export function portraitLook(variant, look) {
  return STREET_SPIRIT_LONELY_ART[variant]?.portraitLook || look;
}

/** One portrait state's grid cell and crop. */
export function portraitBox(variant, look, state) {
  const p = STREET_SPIRIT_LONELY_ART[variant]?.portrait?.[state];
  const l = portraitLook(variant, look);
  if (!p || STREET_SPIRIT_ART[variant]?.looks[l] === undefined) return null;
  const cell = p.cells?.[l] || p.cell;
  const crop = p.crops?.[l] || p.crop;
  return cell && crop ? { cell, crop } : null;
}

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

/** G185: the cry clip's strip (`<variant>_<look>_cry.webp`), with the anchor that keeps the ground line. */
export function spiritCrySheet(variant, look) {
  const cry = STREET_SPIRIT_LONELY_ART[variant]?.cry;
  const box = spiritCryBox(variant, look);
  if (!cry || !box) return null;
  return {
    path: `${SPIRIT_ART_DIR}${spiritSheetName(variant, look, 'cry')}`,
    fw: box.crop.w,
    fh: box.crop.h,
    cols: STRIP_COLS,
    frames: cry.frames,
    fps: 30,
    once: false,
    anchor: box.anchor,
  };
}

/** G185: one portrait state's strip (`<variant>_<look>_lonely_<state>.webp`), drawn centred. */
export function portraitSheet(variant, look, state) {
  const p = STREET_SPIRIT_LONELY_ART[variant]?.portrait?.[state];
  const box = portraitBox(variant, look, state);
  if (!p || !box) return null;
  return {
    path: `${SPIRIT_ART_DIR}${spiritSheetName(variant, portraitLook(variant, look), `lonely_${state}`)}`,
    fw: box.crop.w,
    fh: box.crop.h,
    cols: STRIP_COLS,
    frames: p.frames,
    fps: 30,
    once: state !== 'loop',
  };
}

/** The portrait's largest crop: the invite scales it to the class's loneliness_size (ItemIconView fits wh). */
export function portraitFit(variant, look) {
  return Math.max(0, ...PORTRAIT_STATES.map((s) => portraitBox(variant, look, s)).filter(Boolean).flatMap((b) => [b.crop.w, b.crop.h]));
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
  // The street's hub is its own location object's (index.json since G184,
  // build-street-names.mjs), so the hub rule needs no per-street overrides.
  const variant = STREET_SPIRIT_VARIANTS[forced] ? forced : spiritVariantForHub(street.hubId);
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
