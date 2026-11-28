/**
 * G892, G923: what other players see over a Glitch at work.
 *
 * players/inc_skill_packages.js runSkillPackage 207-314: when a package with a duration
 * runs with an overlay_id (pet, nibble, squeeze, milk, massage, harvest, scoop, revive) or a
 * tool_item, the actor gets their own overlay (the word progress bar, or the tool on the
 * thing: InLocationAnnouncementOverlay.as 441-442, js/word-progress.js, js/node-tools.js).
 * Everyone else on the street gets a pc_overlay over the actor (apiSendAnnouncementX,
 * 291-314 and 349-369): Tiny Speck's thought bubble (bubble: true), 40 x 40 (bubble_width
 * when given), delta_y -110, for the package's duration, holding the overlay (swf_url) or
 * the tool in its tool_animation (item_class, state '-tool_animation', mirrored, when the
 * thing is on the actor's left: 225-237). The actor's cancel takes it down for everyone
 * (main.js 4971-4972 overlay_dismiss of the '-all' uid).
 *
 * Making with a tool sent the same bubble (players/inc_making.js 465 and 663: the tool's
 * tool_animation for making.wait), which is how the smelter, spindles, grinders and the
 * Crystalmalizing Chamber's packages reach the others here (the Make panel runs them).
 *
 * Glitch sent the same kind of bubble for other things the actor sees drawn (G923 part C; the
 * research in lanes/sharefx/work/packages.md): a potion quaffed or poured (potion_*.js 399 and
 * 490: 2.5 s at delta_y -135), a powder shaken (fertilidust.js 473 and the rest: 3 s at -120), a
 * musicblock played (musicblock_*.js 153: its own art with no state, at -120), a Tinkertool
 * repair (tinkertool.js 489), a Wine of the Dead pour (wine_of_the_dead.js 249: mirrored as the
 * pour), a Paper Tree harvest (paper_tree.js 302) and a petrified rock cracked open
 * (petrified_rock_small.js 199).
 *
 * Online the actor sends one emote word (the server relays any [a-z0-9_]{1,24} word, hub.go
 * wordRe; every word here also fits the G892 client rule /^sp_[a-z_]{1,19}_\d{1,2}$/, so a
 * client from before G923 ignores the new ones):
 *   sp_<overlay>_<s>    an overlay (SKILL_BUBBLES), s whole seconds 1..99
 *   sp_i_<cc>_<s>       an item's art (BUBBLE_ITEMS[cc], cc two letters), sp_im_ mirrored
 *   sp_off_0            the actor stopped: down with it
 * and each other client draws the bubble over that player for those seconds. The overlay
 * art is the CC0 glitch-overlays FLAs (tools/overlays/build.mjs, overlays-more.json); the
 * items' art is Tiny Speck's own tool_animation sheets, already shipped for the actor.
 */

import { OVERLAY_BUBBLE_URL, loadMoreOverlays, overlayBubbleBox, playOverlay } from './overlays.js?v=c788d4ab';
import { loadTexture, textureFromUrl } from './textures.js?v=8bb43102';
import { SPEECH_BUBBLE_Z } from './fx-z.js?v=18dda7e3';
import { playItemOverlay } from './item-overlay.js?v=40335bc8';
import { jobWorkToolSheet } from './job-work-fx.js?v=a2dc6a5a';
import { MAKE_TOOL_SHEETS } from './make-tool-sheets.js?v=6f758e09';
import { ROCK_CATALOG } from './mining.js?v=7ecaa572';
import { PICK_SHEETS, nodeToolSheet } from './node-tools.js?v=47a93d54';
import { MUSICBLOCK_CATALOG } from './musicblocks.js?v=e4c81eb7';
import { PACKED_SHEETS } from './packed-sheets-data.js?v=192c6f15';
import { potionBottleClasses, potionBottleSheet } from './potion-bottles.js?v=17925871';
import { powderShakerSheet } from './powder-shakers.js?v=fcd18855';
import { WOTD_TOOL } from './wine-pour-fx.js?v=364e22d2';
import { firstWorkingTool } from './tools.js?v=4156bba8';
import { anchorBottomCentre } from './sprite-feet.js?v=1c6452d9';

/** inc_skill_packages.js 294-305: the bubble the others see. */
export const SKILL_BUBBLE = Object.freeze({ wh: 40, dy: -110, src: 'players/inc_skill_packages.js 294-314' });

/**
 * Each overlay, the verbs that play it ({ classId: [verb ids] }) and its GSJS call.
 * wh: the larger of bubble_width and the height 40 (InLocationAnnouncementOverlay.as 425).
 */
export const SKILL_BUBBLES = Object.freeze({
  butterfly_milk: { on: { npc_butterfly: ['milk'], npc_batterfly: ['milk'] }, wh: 40, src: 'items/npc_butterfly.js 736, npc_batterfly.js 862' },
  butterfly_massage: { on: { npc_butterfly: ['massage'], npc_batterfly: ['massage'] }, wh: 40, src: 'items/npc_butterfly.js 813, npc_batterfly.js 895' },
  pig_pet: { on: { npc_piggy: ['pet'], npc_kitty: ['pet'] }, wh: 40, src: 'items/npc_piggy.js 955, npc_kitty.js 432' },
  pig_nibble: { on: { npc_piggy: ['nibble'], npc_kitty: ['nibble'] }, wh: 40, src: 'items/npc_piggy.js 882, npc_kitty.js 503' },
  chicken_squeeze: { on: { npc_chicken: ['squeeze'], npc_kitty_chicken: ['squeeze'] }, wh: 40, src: 'items/npc_chicken.js 776, npc_kitty_chicken.js 942' },
  trant_pet: {
    on: Object.fromEntries(['trant_fruit', 'trant_egg', 'trant_bean', 'trant_bubble', 'trant_spice', 'trant_gas', 'wood_tree', 'paper_tree'].map((c) => [c, ['pet']])),
    wh: 40,
    src: 'items/include/trants.js 35, wood_tree.js 1060, paper_tree.js 642',
  },
  // paper_tree.js 302: a Paper Tree's harvest sends the same overlay to the others (G923), with no package.
  trant_harvest: { on: Object.fromEntries(['trant_fruit', 'trant_egg', 'trant_bean', 'trant_bubble', 'trant_spice', 'trant_gas', 'paper_tree'].map((c) => [c, ['harvest']])), wh: 40, src: 'items/include/trants.js 250, paper_tree.js 302' },
  // include/rook.js 128: bubble_width 75 for the longer word.
  rooked_revive: { on: { '*': ['rook_revive'] }, wh: 75, src: 'items/include/rook.js 128' },
  jellisac_scoop: { on: { jellisac: ['scoop'] }, wh: 40, src: 'items/jellisac.js 67' },
  // G923: petrified_rock_small.js 199 (and medium, large): the crack's overlay to the others, once through,
  // 2 s; no verb (features/artifacts-feature.js crackFx asks overlayBubbleStarted). The key fits the wire word.
  petrified_open: { on: {}, overlay: 'petrified_rock_open_overlay', loop: false, wh: 40, src: 'items/petrified_rock_small.js 199' },
});

/** The overlay a timed verb shows the others, or null. Verb ids may carry a ':' suffix (feed:cherry). */
export function skillBubbleFor(classId, verbId) {
  const verb = String(verbId || '').split(':')[0];
  for (const [key, row] of Object.entries(SKILL_BUBBLES)) {
    if ((row.on[classId] || row.on['*'] || []).includes(verb)) return key;
  }
  return null;
}

const TRANTS = Object.freeze(['trant_fruit', 'trant_egg', 'trant_bean', 'trant_bubble', 'trant_spice', 'trant_gas']);
const DEAD_TRANTS = Object.freeze(TRANTS.map((c) => `${c}_dead`));
const SHOVELS = Object.freeze(['ace_of_spades', 'shovel']);
const SCRAPERS = Object.freeze(['super_scraper', 'scraper']);
const WATERING_CANS = Object.freeze(['irrigator_9000', 'watering_can']);
const each = (classes, verbs) => Object.fromEntries(classes.map((c) => [c, verbs]));

/**
 * Each skill package that plays a tool for the others (args.tool_item, no overlay_id): the
 * remake verbs that run it ({ classId: [verb ids] }), the tools that can do it in the order
 * the remake looks for a working one, and the GSJS call. `pkgs` names every package the row
 * stands for. The making tools' packages (smelting, spinning, crystallizing, refining) run
 * from the Make panel: makingBubble below.
 */
export const SKILL_TOOL_PACKAGES = Object.freeze({
  mining: {
    pkgs: ['mining', 'mining_fancypick'],
    on: each(Object.keys(ROCK_CATALOG), ['mine']),
    // js/mining.js findWorkingPick: a Fancy Pick first (a Metal Rock takes only that).
    tools: ['fancy_pick', 'pick'],
    src: 'items/include/mining.js 227-230',
  },
  dig_dirt_pile: { pkgs: ['dig_dirt_pile'], on: { dirt_pile: ['dig'] }, tools: SHOVELS, src: 'items/dirt_pile.js 220' },
  peat_harvest: { pkgs: ['peat_harvest'], on: each(['peat_1', 'peat_2', 'peat_3'], ['harvest']), tools: SHOVELS, src: 'items/peat_1.js 367, peat_2.js 367, peat_3.js 367' },
  scraping: { pkgs: ['scraping'], on: { mortar_barnacle: ['scrape'] }, tools: SCRAPERS, src: 'items/mortar_barnacle.js 347' },
  ice_scraping: { pkgs: ['ice_scraping'], on: { ice_knob: ['scrape'] }, tools: SCRAPERS, src: 'items/ice_knob.js 375' },
  dig_patch: { pkgs: ['dig_patch'], on: each(['patch', 'patch_dark'], ['dig']), tools: SHOVELS, src: 'items/patch.js 196, patch_dark.js 196' },
  // patch.js 393-402: a High-Class Hoe first (js/tools.js HOE_TOOLS).
  soil_appreciation: { pkgs: ['soil_appreciation'], on: each(['patch', 'patch_dark'], ['tend']), tools: ['high_class_hoe', 'hoe'], src: 'items/patch.js 435, patch_dark.js 435' },
  dead_trant_clearing: { pkgs: ['dead_trant_clearing'], on: each(DEAD_TRANTS, ['clear']), tools: ['hatchet', 'class_axe'], src: 'items/trant_bean_dead.js 132 (and the other five)' },
  // js/woodcutting.js WOOD_TOOLS.
  wood_tree_harvest: { pkgs: ['wood_tree_harvest'], on: { wood_tree: ['harvest'] }, tools: ['hatchet', 'class_axe'], src: 'items/wood_tree.js 702' },
  // include/trants.js 117-121, paper_tree.js 645-656: an Irrigator 9000 first.
  watering: {
    pkgs: ['light_green_thumb_water', 'wood_tree_water', 'paper_tree_water'],
    on: each([...TRANTS, 'wood_tree', 'paper_tree'], ['water']),
    tools: WATERING_CANS,
    src: 'items/include/trants.js 130, wood_tree.js 1086, paper_tree.js 668',
  },
});

/**
 * Every package in items/catalog_skill_packages.js and whether the others see it: 'overlay'
 * (SKILL_BUBBLES), 'tool' (SKILL_TOOL_PACKAGES), 'making' (the Make panel's tool), or why not.
 * The research behind it: lanes/sharefx/work/packages.md (G923).
 */
export const GSJS_SKILL_PACKAGES = Object.freeze({
  ak_butterfly_massage: 'overlay', ak_butterfly_milk: 'overlay', ak_chicken_squeeze: 'overlay', ak_piggy_nibble: 'overlay', ak_piggy_pet: 'overlay',
  gardening_harvest: 'overlay', jellisac_scooping: 'overlay', light_green_thumb_pet: 'overlay', lgt_egg_plant_pet: 'overlay', wood_tree_pet: 'overlay',
  paper_tree_pet: 'overlay', rook_revive: 'overlay',
  mining: 'tool', mining_fancypick: 'tool', dig_dirt_pile: 'tool', peat_harvest: 'tool', scraping: 'tool', ice_scraping: 'tool', dig_patch: 'tool',
  soil_appreciation: 'tool', dead_trant_clearing: 'tool', wood_tree_harvest: 'tool', light_green_thumb_water: 'tool', wood_tree_water: 'tool',
  paper_tree_water: 'tool',
  smelting: 'making', spinning: 'making', crystallizing: 'making', refining: 'making', barnacle_refining: 'making',
  // Run with no tool_item and no overlay_id: runSkillPackage finishes at once and sends no bubble (inc_skill_packages.js 207).
  herbalism_extract_seeds: 'none: no tool or overlay (purple_flower.js 238 and the other herbs)',
  levitation: 'none: no tool or overlay (focusing_orb.js 361); the Orb sends its own bubble (G330 meditation)',
  focused_meditation: 'none: no tool or overlay (focusing_orb.js 1903); the Orb sends its own bubble (G330 meditation)',
  meditative_arts: 'none: no tool or overlay (focusing_orb.js 1968); the Orb sends its own bubble (G330 meditation)',
  transcendental_radiation: 'none: no tool or overlay (focusing_orb.js 2024); the Orb sends its own bubble (G330 meditation)',
  // no_timers: true (include/garden.js 142-619, master_garden.js 130-708); the garden sends its own bubble (garden.js 723, shared-gardens).
  croppery_clear: 'none: no_timers (garden)', croppery_fertilize: 'none: no_timers (garden)', croppery_harvest: 'none: no_timers (garden)',
  croppery_plant: 'none: no_timers (garden)', croppery_water: 'none: no_timers (garden)', herbalism_clear: 'none: no_timers (garden)',
  herbalism_fertilize: 'none: no_timers (garden)', herbalism_harvest: 'none: no_timers (garden)', herbalism_plant: 'none: no_timers (garden)',
  herbalism_water: 'none: no_timers (garden)', mg_croppery_clear: 'none: no_timers (garden)', mg_croppery_fertilize: 'none: no_timers (garden)',
  mg_croppery_harvest: 'none: no_timers (garden)', mg_croppery_plant: 'none: no_timers (garden)', mg_croppery_water: 'none: no_timers (garden)',
  mg_herbalism_clear: 'none: no_timers (garden)', mg_herbalism_fertilize: 'none: no_timers (garden)', mg_herbalism_harvest: 'none: no_timers (garden)',
  mg_herbalism_plant: 'none: no_timers (garden)', mg_herbalism_water: 'none: no_timers (garden)',
  fox_brushing: 'none: no duration (npc_fox.js 223)',
  // Read for their details only (getSkillPackageDetails / trySkillPackage), never run.
  tinkering: 'none: details only (tinkertool.js 250)', botany: 'none: details only', bubbletuning: 'none: never run', fruitchanging: 'none: never run',
  gasmogrification: 'none: never run', herdkeeping: 'none: details only', spicemilling: 'none: never run', myles_test: 'none: a test package',
});

/** The skill tool package a timed verb runs, or null. Verb ids may carry a ':' suffix. */
export function skillToolFor(classId, verbId) {
  const verb = String(verbId || '').split(':')[0];
  for (const [key, row] of Object.entries(SKILL_TOOL_PACKAGES)) {
    if ((row.on[classId] || []).includes(verb)) return key;
  }
  return null;
}

/** The tool the player will work with for a package: the first working one, else the first owned, else the first. */
export function skillToolClass(key, inv = null, toolState = null) {
  const row = SKILL_TOOL_PACKAGES[key];
  if (!row) return null;
  const pick = firstWorkingTool(toolState, inv || {}, row.tools);
  return pick.tool || pick.fallback || row.tools[row.tools.length - 1];
}

/*
 * The items another client can draw in a bubble, by wire code (two letters: the index in base
 * 26). Append only within a release, so two builds agree on a code; a build that does not know
 * a code draws nothing.
 */
const FIELD_TOOLS = Object.freeze(['pick', 'fancy_pick', 'shovel', 'ace_of_spades', 'hoe', 'high_class_hoe', 'scraper', 'super_scraper', 'hatchet', 'class_axe', 'watering_can', 'irrigator_9000', 'focusing_orb']);
const POWDERS = Object.freeze(Object.keys(PACKED_SHEETS.powders || {}).sort());
const MUSICBLOCKS = Object.freeze(Object.keys(MUSICBLOCK_CATALOG).sort());
export const BUBBLE_ITEMS = Object.freeze([...new Set([
  ...FIELD_TOOLS,
  ...Object.keys(MAKE_TOOL_SHEETS).sort(),
  // G923 part C.
  ...potionBottleClasses(),
  ...POWDERS,
  'wine_of_the_dead',
  ...MUSICBLOCKS,
])]);

const LETTERS = 'abcdefghijklmnopqrstuvwxyz';
const codeOf = (i) => LETTERS[Math.floor(i / 26)] + LETTERS[i % 26];
const indexOf = (cc) => LETTERS.indexOf(cc[0]) * 26 + LETTERS.indexOf(cc[1]);

/** The hoes' tool_animation sheets (as features/patches-feature.js TOOL_SHEETS cuts them). */
const HOE_SHEETS = Object.freeze({
  hoe: { url: 'assets/sprites/soil/hoe-tool.webp', fw: 86, fh: 58, cols: 10, frames: 30, fps: 30 },
  high_class_hoe: { url: 'assets/sprites/soil/high-class-hoe-tool.webp', fw: 89, fh: 55, cols: 10, frames: 30, fps: 30 },
});

/** A plain grid { url|path, fw, fh, cols, frames, fps } as a packed sheet row (js/packed-sheets.js), looping. */
function packedFromGrid(g) {
  return Object.freeze({ path: g.path || g.url, fw: g.fw, fh: g.fh, cols: g.cols, frames: g.frames, plays: g.frames, cell: Object.freeze([g.fw, g.fh]), at: Object.freeze([0, 0]), fps: g.fps || 30, loop: true });
}

/**
 * The art an item shows in a bubble: a packed sheet row of its tool_animation (the client
 * loops every tool_animation, SSCollection.as 116-131), or null when the remake has none.
 */
export function bubbleItemSheet(classTsid) {
  const id = String(classTsid || '');
  if (PICK_SHEETS[id]) return PICK_SHEETS[id];
  const potion = potionBottleSheet(id);
  if (potion) return potion;
  const powder = powderShakerSheet(id);
  if (powder) return powder;
  if (id === 'wine_of_the_dead') return packedFromGrid(WOTD_TOOL.sheet);
  const node = nodeToolSheet(id);
  if (node) return node;
  if (HOE_SHEETS[id]) return packedFromGrid(HOE_SHEETS[id]);
  const grid = jobWorkToolSheet(id);
  return grid ? packedFromGrid(grid) : null;
}

/**
 * A musicblock's bubble shows the block itself (musicblock_*.js 153: item_class and no state, its
 * first look): its pack icon, which is that art. Null for anything else.
 */
export function bubbleItemIcon(classTsid) {
  return MUSICBLOCK_CATALOG[classTsid] ? `assets/sprites/icons/${classTsid}.webp` : null;
}

/**
 * How the bubble stands over the actor: { wh, dy }. Always 40 x 40; 110 px up for a tool,
 * 135 for a potion (potion_*.js 399, 490), 120 for a powder (fertilidust.js 473) and a
 * musicblock (musicblock_*.js 153).
 */
export function bubbleItemPlace(classTsid) {
  const id = String(classTsid || '');
  if (potionBottleSheet(id)) return { wh: SKILL_BUBBLE.wh, dy: -135 };
  if (powderShakerSheet(id) || MUSICBLOCK_CATALOG[id]) return { wh: SKILL_BUBBLE.wh, dy: -120 };
  return { wh: SKILL_BUBBLE.wh, dy: SKILL_BUBBLE.dy };
}

const MAX_SECONDS = 99;
const secondsOf = (ms) => Math.max(1, Math.min(MAX_SECONDS, Math.round((Number(ms) || 0) / 1000)));

/** The word that takes the actor's bubble down. */
export const SKILL_BUBBLE_OFF = 'sp_off_0';

/** The emote word for an overlay shown for `ms` (whole seconds, 1..99), or null. */
export function skillBubbleWord(key, ms) {
  if (!SKILL_BUBBLES[key]) return null;
  return `sp_${key}_${secondsOf(ms)}`;
}

/** The emote word for an item's art in the bubble for `ms`, mirrored when `flipped`, or null. */
export function itemBubbleWord(classTsid, ms, { flipped = false } = {}) {
  const i = BUBBLE_ITEMS.indexOf(String(classTsid || ''));
  if (i < 0) return null;
  return `sp_${flipped ? 'im' : 'i'}_${codeOf(i)}_${secondsOf(ms)}`;
}

/**
 * What an emote word asks for: { key, durationMs } (an overlay), { item, flipped, durationMs }
 * (an item's art), { off: true }, or null for any other word.
 */
export function parseSkillBubbleWord(word) {
  const w = String(word || '');
  if (w === SKILL_BUBBLE_OFF) return { off: true };
  const item = /^sp_(im?)_([a-z]{2})_(\d{1,2})$/.exec(w);
  if (item) {
    const cls = BUBBLE_ITEMS[indexOf(item[2])];
    if (!cls || Number(item[3]) < 1) return null;
    return { item: cls, flipped: item[1] === 'im', durationMs: Number(item[3]) * 1000 };
  }
  const m = /^sp_([a-z_]+)_(\d{1,2})$/.exec(w);
  if (!m || !SKILL_BUBBLES[m[1]] || Number(m[2]) < 1) return null;
  return { key: m[1], durationMs: Number(m[2]) * 1000 };
}

/**
 * Draw an overlay in the thought bubble standing on the point `at()` gives (the avatar's
 * feet; the bubble's bottom sits SKILL_BUBBLE.dy above them), its art fitted to wh and
 * centred in the bubble's top (overlays.js overlayBubbleBox). Returns { stop(), done }.
 */
export function playSkillBubble(engine, key, at, { durationMs = 2000, alive = null, holdMs = null } = {}) {
  const row = SKILL_BUBBLES[key];
  const { PIXI } = engine || {};
  const layer = engine?.fxLayer;
  const handle = { key, stopped: false, overlay: null, bubble: null, done: null, stop() { handle.stopped = true; handle.overlay?.stop(); } };
  if (!row || !PIXI?.Sprite || !layer) {
    handle.done = Promise.resolve(false);
    return handle;
  }
  handle.done = loadMoreOverlays().then((manifest) => {
    const art = row.overlay || key;
    const meta = manifest?.[art];
    if (!meta || handle.stopped) return false;
    const [sw, sh] = meta.stage;
    const k = row.wh / Math.max(sw, sh);
    const box = overlayBubbleBox(sw * k, sh * k);
    const point = () => { const p = at(); return { x: p.x, y: p.y + SKILL_BUBBLE.dy }; };
    const bubble = new PIXI.Sprite(textureFromUrl(OVERLAY_BUBBLE_URL, { scale: 4, resolution: 4 }));
    anchorBottomCentre(bubble, 'held');
    bubble.width = box.w;
    bubble.height = box.h;
    bubble.alpha = 0;
    bubble.eventMode = 'none';
    bubble.zIndex = SPEECH_BUBBLE_Z;
    bubble.label = `overlay:${key}-bubble`;
    layer.addChild(bubble);
    handle.bubble = bubble;
    const place = () => {
      if (bubble.destroyed) return;
      const p = point();
      bubble.x = p.x;
      bubble.y = p.y;
    };
    place();
    const h = playOverlay(PIXI, art, {
      layer,
      at: () => { const p = point(); return { x: p.x, y: p.y - box.artBottom }; },
      wh: row.wh,
      durationMs,
      loop: row.loop !== false,
      alive,
      holdMs,
      zIndex: SPEECH_BUBBLE_Z + 1,
      // The word fades in and out in its own frames; the bubble keeps the overlay's fade.
      onFrame: () => {
        place();
        if (!bubble.destroyed && h.sprite) bubble.alpha = h.sprite.alpha;
      },
    });
    handle.overlay = h;
    if (handle.stopped) h.stop();
    return h.done.finally(() => { if (!bubble.destroyed) bubble.destroy(); });
  }).catch(() => false);
  return handle;
}

/**
 * An item's art in the thought bubble over the point `at()` gives (the avatar's feet), as the
 * client drew a bubbled pc_overlay with an item_class: the frame fitted so its longer side is
 * 40 (ItemIconView.as 311-349), standing centred in the bubble's top (overlayBubbleBox),
 * mirrored when `flipped` (Announcement.as 281-285), looping for `durationMs` with the
 * overlay's fades. `alive()` false ends it early (the player left). Returns { stop(), done }.
 */
export function playItemBubble(engine, classTsid, at, { durationMs = 2000, flipped = false, alive = null, holdMs = null } = {}) {
  const { PIXI } = engine || {};
  const layer = engine?.fxLayer;
  const sheet = bubbleItemSheet(classTsid);
  const icon = sheet ? null : bubbleItemIcon(classTsid);
  const handle = { item: classTsid, stopped: false, overlay: null, bubble: null, done: null, stop() { handle.stopped = true; handle.overlay?.stop(); } };
  if ((!sheet && !icon) || !PIXI?.Sprite || !layer) {
    handle.done = Promise.resolve(false);
    return handle;
  }
  // A musicblock's icon: one frame, its size read once it loads (the item overlay loads the same raw file).
  const ready = sheet
    ? Promise.resolve(sheet)
    : loadTexture(icon, { raw: true }).then((t) => packedFromGrid({ path: icon, fw: t.width, fh: t.height, cols: 1, frames: 1 }));
  handle.done = ready.then((def) => (handle.stopped ? false : drawItemBubble(engine, handle, def, at, { durationMs, flipped, alive, holdMs }))).catch(() => false);
  return handle;
}

function drawItemBubble(engine, handle, def, at, { durationMs, flipped, alive, holdMs }) {
  const { PIXI } = engine;
  const layer = engine.fxLayer;
  const classTsid = handle.item;
  const { wh, dy } = bubbleItemPlace(classTsid);
  const [cw, ch] = def.cell;
  const k = wh / Math.max(cw, ch);
  const box = overlayBubbleBox(cw * k, ch * k);
  const point = () => { const p = at(); return { x: p.x, y: p.y + dy }; };
  const bubble = new PIXI.Sprite(textureFromUrl(OVERLAY_BUBBLE_URL, { scale: 4, resolution: 4 }));
  anchorBottomCentre(bubble, 'held');
  bubble.width = box.w;
  bubble.height = box.h;
  bubble.alpha = 0;
  bubble.eventMode = 'none';
  bubble.zIndex = SPEECH_BUBBLE_Z;
  bubble.label = `item-bubble:${classTsid}`;
  layer.addChild(bubble);
  handle.bubble = bubble;
  const place = () => {
    if (bubble.destroyed) return;
    const p = point();
    bubble.x = p.x;
    bubble.y = p.y;
  };
  place();
  let gone = false;
  const h = playItemOverlay(PIXI, def, {
    layer,
    at: () => {
      if (!gone && alive && !alive()) {
        gone = true;
        h.stop();
      }
      const p = point();
      return { x: p.x, y: p.y - box.artBottom };
    },
    wh,
    flipped,
    durationMs,
    loop: true,
    holdMs,
    zIndex: SPEECH_BUBBLE_Z + 1,
    label: `item-bubble-art:${classTsid}`,
  });
  handle.overlay = h;
  if (handle.stopped) h.stop();
  // The bubble follows the art and takes its fade every frame.
  const raf = globalThis.requestAnimationFrame;
  const follow = () => {
    if (bubble.destroyed) return;
    place();
    if (h.sprite && !h.sprite.destroyed) bubble.alpha = h.sprite.alpha;
    raf?.(follow);
  };
  raf?.(follow);
  return h.done.finally(() => { if (!bubble.destroyed) bubble.destroy(); });
}
