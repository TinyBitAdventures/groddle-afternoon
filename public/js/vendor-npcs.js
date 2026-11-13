/**
 * The original's vendor NPCs (register G121): the Gardening Tools Vendor
 * (scarecrow), the Meal Vendor (Monsieur de Nomdenoms), the Tool Vendor,
 * Uncle Friendly, Helga and the Sno Cone Vending Machine. GameServerJS
 * items/npc_gardening_vendor.js, npc_cooking_vendor.js, npc_tool_vendor.js,
 * npc_jabba1.js, npc_jabba2.js, npc_sno_cone_vending_machine.js: each is an
 * `npc-vendor` whose buy/sell verb opens its own store (store_id 12, 16, 11,
 * 13, 15, 5 in catalog_stores.js, already in
 * store-catalog.js). Each starts where the archive put it and walks its
 * floor as the original did (G680, js/vendor-walk.js); the scarecrow stands.
 *
 * Placement: the archived late-game location objects (objref labels in
 * streets/mnt/stos/location_data/L*.xml) put them on 11 imported streets;
 * build-street-ecology.mjs writes them to street-ecology.json `vendors`.
 * Item coordinates are not in the dump, so the shared planner places them.
 *
 * Pure data and helpers; the world side is features/vendor-npcs-feature.js.
 */

/** objref label -> class (build-street-ecology.mjs VENDOR_LABEL_TO_CLASS). */
export const VENDOR_NPC_LABELS = Object.freeze({
  'Gardening Tools Vendor': 'npc_gardening_vendor',
  'Meal Vendor': 'npc_cooking_vendor',
  'Tool Vendor': 'npc_tool_vendor',
  'Uncle Friendly': 'npc_jabba1',
  Helga: 'npc_jabba2',
  'Sno Cone Vending Machine': 'npc_sno_cone_vending_machine',
});

/**
 * Per class: GSJS label, store_id, the buy_sell tooltip, the item
 * description (shown as the shop's blurb), the quest verb (npc_jabba1's
 * make_eye_contact; the others answer quests on talk), and the one spoken
 * line any of them has (npc_gardening_vendor.js attract()).
 */
export const VENDOR_NPCS = Object.freeze({
  npc_gardening_vendor: {
    label: 'Gardening Tools Vendor',
    storeId: 12,
    buyTooltip: 'Buy gardening tools. Or sell anything (via "sell" tab)',
    desc: 'A mysterious leftover from another age, the scarecrow has always been a dependable source of gardening tools, keeping, as he does, an infinite number of hoes in his surprisingly capacious bag.',
    questVerb: { id: 'talk_to', label: 'talk to', tooltip: '' },
    attract: (name) => `Hey, ${name}! If you need gardening tools, I have plenty.`,
  },
  npc_cooking_vendor: {
    label: 'Meal Vendor',
    storeId: 16,
    buyTooltip: 'Buy ready-made meals. Or sell anything (via "sell" tab)',
    desc: 'A friend indeed to a miner in need, Monsieur de Nomdenoms is a purveyor of high-end food for those in the deeps who need energy fast - and are willing to pay handsomely for it.',
    questVerb: { id: 'talk_to', label: 'talk to', tooltip: '' },
    attract: null,
  },
  npc_tool_vendor: {
    label: 'Tool Vendor',
    storeId: 11,
    buyTooltip: 'Buy tools. Or sell anything (via "sell" tab)',
    desc: "Ever find yourself deep down in the Caverns, chipping away at a rich seam when your Fancy Pick breaks and you find yourself with no tinkertool to correct the problem? The Tool Vendor - widely suspected to be a bureaucroc gone rogue - will help you out. If it's the kind of thing you might need to fix, or the kind of thing you might need to fix it, it's probably here.",
    questVerb: { id: 'talk_to', label: 'talk to', tooltip: '' },
    attract: null,
  },
  npc_jabba1: {
    label: 'Uncle Friendly',
    storeId: 13,
    buyTooltip: 'Buy groceries. Or sell anything (via "sell" tab)',
    desc: "An old-school corner store with a small stock of groceries and fresh (-ish) produce. It's a handy little place to shop, if you don't mind that Uncle Friendly isn't friendly (especially if you ask him about his centuries-old tempestuous relationship with Helga), or that everything you buy to eat there looks like the best-before date has been amended with a crayon.",
    questVerb: { id: 'make_eye_contact', label: 'make eye contact', tooltip: 'Are you sure? He looks shifty' },
    attract: null,
  },
  npc_jabba2: {
    label: 'Helga',
    storeId: 15,
    buyTooltip: 'Buy drinks and liquor. Or sell anything (via "sell" tab)',
    desc: 'Reticent about discussing her past, it is thought that Helga may remember the Age of Friendly (if there was ever such a time), given that she is, and always has been, the source of many fine beverages.',
    // make_eye_contact conditions: `if (this.class_tsid == 'npc_jabba2') return {state:null};`
    questVerb: null,
    attract: null,
  },
  npc_sno_cone_vending_machine: {
    label: 'Sno Cone Vending Machine',
    storeId: 5,
    buyTooltip: 'Buy Sno Cones. Or sell anything (via "sell" tab)',
    desc: 'An automatic, systematic, hydromatic snowcone vending machine, for the exclusive purchase of snowcones. An acquired taste (in that you have to acquire them before you taste them), some of the more expensive snocones are only suitable for a refined palate - you have to be a certain level to eat them.',
    questVerb: null,
    attract: null,
    // talk_to + onConversation: "Hot enough for ya?" Yes leads to the store.
    talk: {
      tooltip: "See what's up with the bear",
      ask: (name) => `Hot enough for ya, ${name}?`,
      yes: 'Yes',
      no: 'No',
      offer: 'How about a Sno Cone, then?',
      offerYes: 'Yes, please!',
      offerNo: 'No, thank you.',
    },
  },
});

/** Classes whose quest turn-ins wait for a talk with them (quest-offers-feature). */
export const VENDOR_NPC_CLASSES = Object.freeze(Object.keys(VENDOR_NPCS));

/** npc_quests.js got_quest_text, shown when there is more than one choice. */
export const GOT_QUEST_TEXT = "I've got something for you...";

/**
 * Sheets from the CC0 OGA dump (tools/vendor-npc-art.mjs): x1 grid cell,
 * the frames kept (from `first`), and the union crop each strip was cut to.
 * The idle_stand recordings run 180-357 frames of holds and gestures; each
 * keeps one run that ends on its first pose, so it loops without a seam
 * (the Tool Vendor's is two periods of its 18-frame fidget, frames 117-152). Strips are
 * 8 columns of crop-sized cells at assets/sprites/vendors/<class>_<state>.webp.
 */
export const VENDOR_NPC_ART = Object.freeze({
  npc_gardening_vendor: {
    cell: { w: 178, h: 198 },
    states: {
      idle: { oga: 'idle_stand', frames: 110, crop: { x: 15, y: 15, w: 155, h: 183 } },
      talk: { oga: 'talk', frames: 26, crop: { x: 15, y: 15, w: 155, h: 183 } },
    },
  },
  npc_cooking_vendor: {
    cell: { w: 189, h: 230 },
    states: {
      idle: { oga: 'idle_stand_part1', frames: 193, crop: { x: 5, y: 17, w: 179, h: 212 } },
      talk: { oga: 'talk', frames: 36, crop: { x: 5, y: 17, w: 179, h: 212 } },
    },
  },
  npc_tool_vendor: {
    cell: { w: 185, h: 250 },
    states: {
      idle: { oga: 'idle_stand', first: 117, frames: 36, crop: { x: 13, y: 20, w: 172, h: 228 } },
      talk: { oga: 'talk', frames: 26, crop: { x: 13, y: 20, w: 172, h: 228 } },
    },
  },
  npc_jabba1: {
    cell: { w: 439, h: 201 },
    states: {
      idle: { oga: 'idle_stand_part1', frames: 48, crop: { x: 87, y: 9, w: 242, h: 191 } },
      talk: { oga: 'talk', frames: 53, crop: { x: 87, y: 9, w: 242, h: 191 } },
    },
  },
  npc_sno_cone_vending_machine: {
    cell: { w: 188, h: 221 },
    states: {
      idle: { oga: 'idle_stand', frames: 62, crop: { x: 15, y: 28, w: 167, h: 193 } },
      talk: { oga: 'talk', frames: 20, crop: { x: 15, y: 28, w: 167, h: 193 } },
    },
  },
  npc_jabba2: {
    cell: { w: 438, h: 194 },
    states: {
      idle: { oga: 'idle_stand_part1', frames: 185, crop: { x: 121, y: 0, w: 195, h: 193 } },
      talk: { oga: 'talk', frames: 72, crop: { x: 121, y: 0, w: 195, h: 193 } },
    },
  },
});

/**
 * Their walks (register G680, js/vendor-walk.js): the walk, turn, stop and impatient strips from the
 * same CC0 dump, cut the same way (tools/vendor-npc-art.mjs), on the class's cell grid. Each strip
 * keeps every frame of its sheet (the cells after the last are empty) and its own union crop; the
 * feet stay on the idle strip's lowest row (vendorAnchor). Like the idle and talk strips, each swaps
 * to a 3x render of the SWF on a sharp screen (js/sprite-hires.js; tools/vector-sprites/characters.json
 * `<vendor>-motion` jobs, their own group so a poor match never costs the idle and talk 3x). A
 * phone draws at 1 and keeps these 1x strips.
 */
export const VENDOR_NPC_MOTION_ART = Object.freeze({
  npc_tool_vendor: {
    walk: { oga: 'walk', frames: 24, crop: { x: 23, y: 22, w: 129, h: 226 } },
    walk_left: { oga: 'walk_left', frames: 25, crop: { x: 43, y: 20, w: 129, h: 226 } },
    turn_left: { oga: 'turn_left', frames: 10, crop: { x: 11, y: 23, w: 174, h: 227 } },
    turn_right: { oga: 'turn_right', frames: 11, crop: { x: 17, y: 23, w: 167, h: 225 } },
  },
  npc_cooking_vendor: {
    walk_left: { oga: 'walk_left', frames: 16, crop: { x: 5, y: 18, w: 159, h: 211 } },
    walk_right: { oga: 'walk_right', frames: 16, crop: { x: 9, y: 18, w: 155, h: 211 } },
    walk_left_end: { oga: 'walk_left_end', frames: 16, crop: { x: 0, y: 17, w: 186, h: 212 } },
    walk_right_end: { oga: 'walk_right_end', frames: 14, crop: { x: 5, y: 17, w: 181, h: 212 } },
  },
  npc_jabba1: {
    walk: { oga: 'walk', frames: 14, crop: { x: 0, y: 10, w: 337, h: 191 } },
    turn: { oga: 'turn', frames: 7, crop: { x: 88, y: 10, w: 293, h: 190 } },
    walk_end: { oga: 'walk_end', frames: 10, crop: { x: 30, y: 11, w: 301, h: 190 } },
    impatient: { oga: 'impatient', frames: 86, crop: { x: 85, y: 0, w: 251, h: 200 } },
  },
  npc_jabba2: {
    walk: { oga: 'walk', frames: 16, crop: { x: 0, y: 7, w: 319, h: 185 } },
    turn: { oga: 'turn', frames: 18, crop: { x: 105, y: 7, w: 232, h: 187 } },
    walk_end: { oga: 'walk_end', frames: 15, crop: { x: 3, y: 7, w: 316, h: 185 } },
    impatient: { oga: 'impatient', frames: 98, crop: { x: 124, y: 7, w: 313, h: 185 } },
  },
  npc_sno_cone_vending_machine: {
    walk_left: { oga: 'walk_left', frames: 7, crop: { x: 0, y: 25, w: 164, h: 194 } },
    walk_right: { oga: 'walk_right', frames: 7, crop: { x: 0, y: 25, w: 164, h: 194 } },
    walk_end: { oga: 'walk_end', frames: 14, crop: { x: 0, y: 24, w: 188, h: 197 } },
    attract: { oga: 'attract', frames: 34, crop: { x: 2, y: 0, w: 185, h: 221 } },
  },
  npc_gardening_vendor: {
    attract: { oga: 'attract', frames: 30, crop: { x: 13, y: 1, w: 165, h: 197 } },
  },
});

export const VENDOR_ART_DIR = 'assets/sprites/vendors/';
const STRIP_COLS = 8;

/** A state's strip def (VENDOR_NPC_ART idle/talk, else VENDOR_NPC_MOTION_ART). */
export function vendorStrip(classTsid, state) {
  return VENDOR_NPC_ART[classTsid]?.states?.[state] || VENDOR_NPC_MOTION_ART[classTsid]?.[state] || null;
}

/** Every state a class has a strip for. */
export function vendorStates(classTsid) {
  return [...Object.keys(VENDOR_NPC_ART[classTsid]?.states || {}), ...Object.keys(VENDOR_NPC_MOTION_ART[classTsid] || {})];
}

/** sprite-sheets.js sheet def for one state's strip. */
export function vendorSheet(classTsid, state) {
  const sheet = vendorStrip(classTsid, state);
  if (!sheet) return null;
  return {
    path: `${VENDOR_ART_DIR}${classTsid}_${state}.webp`,
    fw: sheet.crop.w,
    fh: sheet.crop.h,
    cols: STRIP_COLS,
    frames: sheet.frames,
  };
}

/**
 * Sprite anchor that keeps the source cell's centre over the platform point,
 * with the idle strip's lowest pixel (feet and shadow) on the ground: every
 * state of a class shares that cell row, so a walk stands where the idle did.
 * Flipping the sprite (scale.x -1) mirrors it about the cell's centre.
 */
export function vendorAnchor(classTsid, state = 'idle') {
  const art = VENDOR_NPC_ART[classTsid];
  const crop = vendorStrip(classTsid, state)?.crop;
  if (!art || !crop) return { x: 0.5, y: 1 };
  const idle = art.states.idle.crop;
  const feet = idle.y + idle.h;
  return { x: (art.cell.w / 2 - crop.x) / crop.w, y: (feet - crop.y) / crop.h };
}

/** street-ecology.json `vendors` row for a street (G/L alias aware), or null. */
export function vendorNpcsFor(catalog, tsid) {
  const map = catalog?.vendors || {};
  const id = String(tsid || '');
  const aliases = [id];
  if (id.startsWith('G')) aliases.push(`L${id.slice(1)}`);
  if (id.startsWith('L')) aliases.push(`G${id.slice(1)}`);
  for (const alias of aliases) if (map[alias]) return map[alias];
  return null;
}

/**
 * The streets where any of these NPC classes stands (street-ecology.json `vendors`), in the
 * catalog's order: where a quest held for a talk turn-in (quest-offers.js heldForNpcTurnIn) can
 * be handed in, and the destinations its map route goes to (the nearest one wins).
 * @param {{ vendors?: Record<string, Record<string, number>> }} catalog
 * @param {string[]} classes
 */
export function vendorStreetsFor(catalog, classes) {
  const want = new Set(classes || []);
  return Object.entries(catalog?.vendors || {})
    .filter(([, row]) => Object.keys(row || {}).some((c) => want.has(c) && Number(row[c]) > 0))
    .map(([tsid]) => tsid);
}

/** The classes on a row, in a stable order, one entry per archived object. */
export function vendorNpcList(row) {
  const out = [];
  for (const classTsid of VENDOR_NPC_CLASSES) {
    const n = Math.max(0, Math.min(3, Math.floor(Number(row?.[classTsid]) || 0)));
    for (let i = 0; i < n; i += 1) out.push(classTsid);
  }
  return out;
}

export const VENDOR_PLACEMENT_KEY = 'vendor-npcs';

/** Planner group for the shared street placement (features placementGroups hook). */
export function vendorNpcPlacementGroups(row) {
  const count = vendorNpcList(row).length;
  return count ? [{ key: VENDOR_PLACEMENT_KEY, count, clearance: 140 }] : [];
}

/**
 * The shop the NPC's buy_sell verb opens: its own catalog_stores.js store,
 * with the item description as the shop blurb.
 * @param {string} classTsid
 * @param {Record<string, any>} profiles vendor.js VENDOR_PROFILES
 */
export function vendorNpcStoreProfile(classTsid, profiles) {
  const def = VENDOR_NPCS[classTsid];
  if (!def) return null;
  const store = Object.values(profiles || {}).find((p) => p.storeId === def.storeId);
  if (!store) return null;
  return { ...store, desc: def.desc, npc: classTsid };
}
