/**
 * The Quarter: a shared street of player house lots (register G1186, Austin 2026-11-23: option A
 * of research/coverage/neighbourhoods-2026-11-23.md). Pure rules and the street builder (no Pixi,
 * no DOM); tools/build-rebuilt-rooms.mjs writes the street JSON and the QUARTER signpost on the
 * parent street, features/quarter-feature.js draws the lots, and the claims are the site's
 * (groddle-afternoon-site src/Quarter.php) and the realtime server's (quarter.go).
 *
 * What survives of Glitch's quarters (GameServerJS, CC0):
 * - groups/quarter.js: a quarter is a grid of block streets off one parent street. A block is
 *   named "<Name> Quarter, <x><y>00 block" (generate_label 444-460) and its houses
 *   "<x><y>## <Name> Quarter" (generate_pol_label 462-476), ## the lot's number on the template.
 * - locations/quarter.js create_pols_from_markers 91: each lot_marker on the block's template
 *   becomes a numbered house; its signposts all lead back to the quarter's exit
 *   (get_exit_position 63-84).
 * - The parent street's QUARTER signpost: glitch-client SignpostView.as render 211-238 (the
 *   signpost_quarter_arm board, 85 tall and at least 150 wide, with the quarter's name and the
 *   signpost_quarter_grid on it), QuarterInfo.as (style, label, rows, cols).
 * - locations/inc_pols.js pols_canBuy 15-63 (one house per player: has_other) and
 *   players/inc_houses.js houses_familiar_no_owner 318-361 (the familiar's "This location is for
 *   sale!" at a house with no owner).
 * - The lot numbers: a block of ten numbered x5 (Koita Clutter Quarter, 3300 block, houses 3305
 *   to 3395: reference video zOpNCk8f-fs).
 *
 * What does not survive: every live quarter street (they were made at run time and deleted in
 * 2012) and 54 of the 55 templates. So each of Marylpole Mount Quarter's blocks is laid on one of the twelve archived meadow lot
 * streets of hub 28 Old Groddle Forest (tinyspeck/glitch-locations, CC0): its sky, hills, trees and
 * ground as they are, its meadow house decos as the lots' For Sale houses, in its own order. The
 * 1100 block is Whipping Cross Crossing (GLI11TJJ7871GF3), the 1200 block Herring Bone Hatch
 * (GLI12LNGM871KU0): of the other eleven, the floor that sits flattest under ten lots 565 px
 * apart with nothing raised over it (four are too short; Lapulapu Caverns, Chadwick Mews, Pants
 * Place and both Maharlikas have ledges over the floor; Curlingwood and Chad Gallows tilt more)
 * (QUARTER_BLOCKS).
 * The lots are spaced wider (565 px) because a player's house (G796, js/home-house.js) is up to
 * 562 px wide.
 *
 * Mien Evoke Quarter's block (Bortola) has no such street to lay it on: it is composed from Mien
 * Evoke's own art made flat (composeBlockBase; inventions: bortola-quarter-block).
 *
 * The remake's own (inventions: shared-quarter-lots):
 * - Marylpole Mount Quarter, 1100 and 1200 blocks: Marylpole Mount (Groddle Meadow) had a quarter
 *   (a player's snap of its 3400 block), so the remake's quarter hangs off the same street; the
 *   blocks are the grid's (1,1) and (1,2), and its QUARTER signpost offers both (the grid of
 *   LocationSelectorDialog.as showQuarters, as a menu of blocks).
 * - The home street's quarter arm: the owner's lot on the top row of their signpost, pointing
 *   right, opposite Back to Ur (inventions: home-quarter-arm).
 * - A lot shows the house its owner chose for their home street (G796) and leads there through
 *   the visit (G328): no second house, no interior. Claiming is free (G208 dropped papers and
 *   currants for the free home street), one lot per player, and giving one up puts it back on
 *   sale (Glitch sold it back at 80%, pols_sellHouse 126).
 * - Mien Evoke Quarter, 1100 block (Austin 2026-11-28: players asked for a place in Bortola): its
 *   QUARTER signpost on Mien Evoke, the same claim rules.
 * - One lot per player across every block of every quarter (pols_canBuy has_other), first come
 *   first served. Both quarters have an 1100 block, so a lot is its street and its number.
 * - Solo: your own lot and the For Sale houses, no made-up neighbours.
 */

/**
 * The quarters (G1186; Marylpole Mount Quarter 2026-11-23, its 1200 block 2026-11-27, Mien Evoke
 * Quarter in Bortola 2026-11-28). One entry per quarter: its id (the tsid's letters), its name and
 * style (groups/quarter.js init), the parent street its QUARTER signpost stands on (tsid, name, hub)
 * and that signpost's world x, and its blocks. A block: a remake tsid (no quarter street survives),
 * the grid cell (groups/quarter.js: x the column, y the row, as generate_label writes
 * "<x><y>00 block"), what it is laid on (`template`: an archived lot street, its CC0 geometry and
 * decos; or `compose`: a street of the quarter's own region made flat, composeBlockBase), the first
 * lot's foot and the block's signpost back to the parent (world x). The next block or quarter is
 * one more entry here and `node tools/build-rebuilt-rooms.mjs` (then the realtime server's
 * tools/build-realtime-quarters.mjs): the street, its lots, the QUARTER signpost and its grid, the
 * claims on the server and the site all follow from this list. Nothing opens a block by itself when
 * one fills (Austin: blocks open by hand).
 * Marylpole Mount Quarter (Groddle Meadow):
 * - 1100: Whipping Cross Crossing (GLI11TJJ7871GF3), one flat floor at y -84.
 * - 1200: Herring Bone Hatch (GLI12LNGM871KU0), 8000 px of one rolling floor from end to end; the
 *   lots start where the ten tilt least (at most 20 px across a house's middle 360 px). Its nine
 *   meadow houses, the first again for the tenth.
 * Mien Evoke Quarter (Bortola, hub 75): players asked for a place in Bortola. Bortola had six quarter
 * templates (inc_data_pols_prod.js), all lost; snaps name Vuos Bosca Quarter (a house's cave
 * interior, 5229) and Mien Evoke Quarter (a whole-street picture on the Glitch Forever wiki and its
 * 1400 block: a row of meadow houses on flat grass under Bortola's pines and teal sky). So the quarter
 * hangs off Mien Evoke, and its block is Mien Evoke's own look made flat (composeBlockBase):
 * - 1100: Mien Evoke's sky, hills, pines, filters and ground decos, the raised mounds left out and
 *   the rest set on one flat floor, widened to 6000 px by repeating a stretch of each layer; ten
 *   meadow house decos as the For Sale houses (the wiki's 1400 block shows the same meadow houses).
 */
export const QUARTERS = Object.freeze([
  Object.freeze({
    id: 'MM',
    name: 'Marylpole Mount Quarter',
    style: 'normal',
    parent: 'GLI32HBOUTD1GQV',
    parentLabel: 'Marylpole Mount',
    hubId: '58',
    hubName: 'Groddle Meadow',
    had: "Marylpole Mount had a quarter (a player's snap of its 3400 block)",
    // On Marylpole Mount's flat left end, clear of signpost_2 at -2865.
    parentSignX: -2300,
    blocks: Object.freeze([
      Object.freeze({ tsid: 'GQRMM1100BLOCK1', quarter: 'MM', x: 1, y: 1, template: 'GLI11TJJ7871GF3', lotX0: -2400, signX: -2750 }),
      Object.freeze({ tsid: 'GQRMM1200BLOCK1', quarter: 'MM', x: 1, y: 2, template: 'GLI12LNGM871KU0', lotX0: -2970, signX: -3680 }),
    ]),
  }),
  Object.freeze({
    id: 'ME',
    name: 'Mien Evoke Quarter',
    style: 'normal',
    parent: 'GHVLCNLR783251B',
    parentLabel: 'Mien Evoke',
    hubId: '75',
    hubName: 'Bortola',
    had: "Mien Evoke had a quarter (the Glitch Forever wiki's picture of the whole street and a player's snap of its 1400 block)",
    // On Mien Evoke's open right half (its floor -122 to -130 from 1400 to 1700, nothing raised over it).
    parentSignX: 1500,
    blocks: Object.freeze([
      Object.freeze({
        tsid: 'GQRME1100BLOCK1',
        quarter: 'ME',
        x: 1,
        y: 1,
        compose: Object.freeze({
          base: 'GHVLCNLR783251B',
          width: 6000,
          floorY: -120,
          // The stretch repeated to widen each layer ends here (base world x; a layer's own x in proportion).
          cutX: 1600,
          // Mien Evoke's raised dirt mounds and their mossy tops (the platforms over its floor) and the low hills.
          drop: Object.freeze(['mound_dirt_3', 'mound_dirt_4', 'ground_forest_terrain_plat_01', 'ground_forest_terrain_plat_02', 'ground_forest_terrain_plattop_02', 'heights_mound_3']),
          // Its ground band, laid again end to end along the flat floor: [sprite, foot below the floor, z], as
          // Mien Evoke lays them where its floor is flat (x 160 and 1260: the horizon 15 px under the floor,
          // the two dirt strips 39 and 91, the cross-section 188). The base's own band pieces are left out.
          ground: Object.freeze([['dirt_horizon', 15, 7], ['dirt_platform_long', 91, 8], ['dirt_platform_long', 39, 9], ['dirt_crosssection_long', 188, 54], ['dirt_crosssection_long_curvy', 188, 55]]),
          band: Object.freeze(['dirt_horizon', 'dirt_platform_long', 'dirt_mound_1', 'dirt_crosssection_long', 'dirt_crosssection_long_curvy', 'dirt_crosssection_short_1', 'dirt_crosssection_short_3']),
          // Ten of Tiny Speck's fifteen meadow house decos (pol_ext_meadow, CC0), small, medium and large mixed as on the wiki's picture.
          houses: Object.freeze(['door_asset_house_medium_04', 'door_asset_house_small_05', 'door_asset_house_large_02', 'door_asset_house_small_02', 'door_asset_house_medium_01', 'door_asset_house_large_03', 'door_asset_house_small_04', 'door_asset_house_medium_03', 'door_asset_house_small_01', 'door_asset_house_large_05']),
        }),
        lotX0: -2400,
        signX: -2750,
      }),
    ]),
  }),
]);

/** Every block of every quarter, in the list's order (the server and site name none). */
export const QUARTER_BLOCKS = Object.freeze(QUARTERS.flatMap((q) => q.blocks));

/** A quarter by its id, or null. */
export function quarterById(id) {
  return QUARTERS.find((q) => q.id === id) || null;
}

/** The quarter a block belongs to. */
export function quarterOfBlock(block) {
  return quarterById(block?.quarter) || null;
}

/** groups/quarter.js init: a quarter's name and style; its grid holds every block it has. */
export function quarterGrid(q = QUARTERS[0]) {
  return Object.freeze({
    name: q.name,
    style: q.style,
    cols: Math.max(...q.blocks.map((b) => b.x)),
    rows: Math.max(...q.blocks.map((b) => b.y)),
    block: Object.freeze({ x: q.blocks[0].x, y: q.blocks[0].y }),
  });
}

/** The first quarter, Marylpole Mount's, as the one-quarter code named it. */
export const QUARTER = quarterGrid(QUARTERS[0]);
/** The parent street of the first quarter: Marylpole Mount, Groddle Meadow. */
export const QUARTER_PARENT_TSID = QUARTERS[0].parent;

/** The first block (1100), as the one-block code named it. */
export const QUARTER_TSID = QUARTER_BLOCKS[0].tsid;
/** The archived lot street the first block is laid on. */
export const QUARTER_TEMPLATE_TSID = QUARTER_BLOCKS[0].template;

/** The template's lot numbers (##): ten, x5 as on Koita Clutter Quarter's 3300 block. */
export const QUARTER_LOT_NUMBERS = Object.freeze([5, 15, 25, 35, 45, 55, 65, 75, 85, 95]);

/** The first block's ground (Whipping Cross Crossing's one platform, y -84). */
export const QUARTER_GROUND_Y = -84;
/**
 * The first block's first lot and the step between lots: a house reaches at most 282 px either
 * side of its foot (the Shipwreck, home-house.js houseLot), so two never touch whichever way they face.
 */
export const QUARTER_LOT_X0 = QUARTER_BLOCKS[0].lotX0;
export const QUARTER_LOT_STEP = 565;
/** The first block's signpost back to Marylpole Mount (its left end, as the template's signpost_2). */
export const QUARTER_SIGN_X = QUARTER_BLOCKS[0].signX;
/** Marylpole Mount's QUARTER signpost (each quarter's is its parentSignX). */
export const QUARTER_PARENT_SIGN_X = QUARTERS[0].parentSignX;
export const QUARTER_PARENT_SIGN_ID = 'signpost_quarter';
export const QUARTER_BLOCK_SIGN_ID = 'signpost_quarter_exit';

/**
 * Glitch's words, and the remake's where Glitch had none.
 */
export const QUARTER_TEXT = Object.freeze({
  forSale: 'This location is for sale!', // inc_houses.js:336
  // inc_houses.js:344, "sell" and "buy" as "give up" and "claim": a lot is free here.
  hasOther: "This location is for sale. You already own a location, which you'll need to give up before you can claim a new one.",
  noHome: 'You need a home street first.', // ours (groddle-afternoon-site Neighbours TEXT_NO_HOME)
  newxp: "You can't do that until you finish the tutorial.", // inc_houses.js admin_houses_visit 'newxp_us'
  taken: 'Someone else has just claimed that lot.', // ours
  none: "You don't have a lot in the Quarter.", // ours
  off: 'The Quarter can not be reached right now.', // ours
  busy: 'Wait a moment, the Quarter is still answering.', // ours
  claimed: (label) => `${label} is yours! Its front leads to your home street.`, // ours
  released: (label) => `You gave up ${label}. It is for sale again.`, // ours
  owned: (name) => `Owned by ${name}`, // doors.js doorTooltip: "Owned by <owner_label>"
  claimVerb: 'Claim this lot', // ours (Glitch: "Purchase location for N currants")
  claimTip: 'This location is for sale! It is free, one lot per player.', // ours
  giveUpVerb: 'Give up this lot', // ours
  homeVerb: 'Go to your home street', // ours
  // The home street's quarter arm (ours): its verb and tip, the arm's words being the lot's label.
  armVerb: (label) => `Go to ${label}`, // ours
  armTip: (name, label) => `${name}'s lot, ${label}`, // ours
});

const pad2 = (n) => String(Math.max(0, Math.floor(Number(n) || 0))).padStart(2, '0');

/** generate_label: "<Name> Quarter, <x><y>00 block". */
export function blockLabel(name = QUARTER.name, x = QUARTER.block.x, y = QUARTER.block.y) {
  return `${name}, ${x}${y}00 block`;
}

/** generate_pol_floor + the template number: the number on the door (1105). */
export function lotNumber(num, x = QUARTER.block.x, y = QUARTER.block.y) {
  return Number(`${x}${y}${pad2(num)}`);
}

/** generate_pol_label with ## filled: "1105 Marylpole Mount Quarter". */
export function lotLabel(lot, name = QUARTER.name) {
  return `${lot} ${name}`;
}

/** The first block's lot numbers on its doors: 1105 .. 1195. */
export const QUARTER_LOTS = Object.freeze(QUARTER_LOT_NUMBERS.map((n) => lotNumber(n)));

/** A block's lot numbers (1205 .. 1295 for the 1200 block). */
export function blockLots(block) {
  return QUARTER_LOT_NUMBERS.map((n) => lotNumber(n, block.x, block.y));
}

/**
 * Every lot number some block has, each once. Within a quarter no two blocks share one (<x><y>##,
 * x and y 1 to 9); two quarters do (both have an 1100 block, as Glitch's quarters all did), so a
 * lot is its street and its number (the site's key is the street and the lot).
 */
export const QUARTER_ALL_LOTS = Object.freeze([...new Set(QUARTER_BLOCKS.flatMap((b) => blockLots(b)))]);

/** A lot number some block has (or one of `lots`). */
export function isQuarterLot(lot, lots = QUARTER_ALL_LOTS) {
  return Number.isInteger(lot) && lots.includes(lot);
}

/** The block a street is (either tsid prefix), or null. */
export function blockOf(tsid) {
  const s = String(tsid || '');
  if (s.length < 2) return null;
  return QUARTER_BLOCKS.find((b) => b.tsid.slice(1) === s.slice(1)) || null;
}

/**
 * The block a lot is on: on `street` when it is given (null when that block has no such lot), else
 * the first block in the list with that number (Marylpole Mount's: what a lot with no street meant
 * before there were two quarters, as an old solo save holds it).
 */
export function blockOfLot(lot, street = null) {
  if (street != null) {
    const block = blockOf(street);
    return block && blockLots(block).includes(lot) ? block : null;
  }
  return QUARTER_BLOCKS.find((b) => blockLots(b).includes(lot)) || null;
}

/** True for any block's street under either tsid prefix. */
export function isQuarterTsid(tsid) {
  return blockOf(tsid) != null;
}

/** The quarter a block street is in (either tsid prefix), or null. */
export function quarterOfStreet(tsid) {
  return quarterOfBlock(blockOf(tsid));
}

/** A lot's name on its street: "1105 Mien Evoke Quarter" (generate_pol_label with ## filled). */
export function lotName(lot, street) {
  return lotLabel(lot, (quarterOfStreet(street) || QUARTERS[0]).name);
}

/**
 * The lots as the site or server lists them ({ lot, owner: { id, name } | null, house, style }),
 * as a Map lot -> { owner, house, style } of the claimed ones on this block. Rows for lots the
 * block does not have, or with no owner, are dropped.
 */
export function normalizeLots(rows, lots = QUARTER_ALL_LOTS) {
  const out = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const lot = Number(row?.lot);
    const id = Number(row?.owner?.id);
    if (!isQuarterLot(lot, lots) || !Number.isInteger(id) || id <= 0 || out.has(lot)) continue;
    const name = typeof row.owner.name === 'string' && row.owner.name ? row.owner.name.slice(0, 32) : 'Someone';
    const house = row.house && typeof row.house === 'object' && typeof row.house.chassis === 'string' ? row.house : null;
    const style = typeof row.style === 'string' ? row.style : 'meadow';
    out.set(lot, { owner: { id, name }, house, style });
  }
  return out;
}

/** The lot `me` holds, or 0. */
export function lotOf(lots, me) {
  for (const [lot, row] of lots || []) if (row?.owner?.id === me) return lot;
  return 0;
}

/** Owners per lot, for telling whether two tables differ ("1105:7,1115:9"). */
export function lotsKey(lots) {
  return [...(lots || new Map())].sort((a, b) => a[0] - b[0]).map(([lot, r]) => `${lot}:${r.owner.id}`).join(',');
}

const sameTsid = (a, b) => String(a || '').slice(1) === String(b || '').slice(1);

/**
 * pols_canBuy for a lot here (the site and the server check the same): null when `me` may claim
 * it, else why: 'lot' (no such lot), 'taken' (owned, inc_pols.js 24-29), 'have' (has_other, 31-36:
 * one lot across every block of every quarter; `mine` is the lot `me` holds anywhere, as
 * { street, lot } (or a bare number on this street), 0 or null for none; `street` this block),
 * 'no_home' (the front leads to a home street: none yet), 'newxp' (still in the tutorial).
 */
export function judgeClaim({ lots, me, lot, mine = 0, street = null, hasHome = true, tutorial = false, all = QUARTER_ALL_LOTS } = {}) {
  if (!isQuarterLot(lot, all)) return 'lot';
  const held = lots?.get?.(lot);
  if (held && held.owner?.id !== me) return 'taken';
  if (held) return null; // already yours: asking again answers the same
  const mineLot = Number(mine && typeof mine === 'object' ? mine.lot : mine) || 0;
  // 1105 on Marylpole Mount Quarter is not 1105 on Mien Evoke Quarter.
  const here = !(mine && typeof mine === 'object' && mine.street && street) || sameTsid(mine.street, street);
  if (lotOf(lots, me) || (mineLot && !(here && mineLot === lot))) return 'have';
  if (tutorial) return 'newxp';
  if (!hasHome) return 'no_home';
  return null;
}

/** The words for a refusal. */
export function refusalText(why) {
  return {
    taken: QUARTER_TEXT.taken,
    have: QUARTER_TEXT.hasOther,
    no_home: QUARTER_TEXT.noHome,
    newxp: QUARTER_TEXT.newxp,
    none: QUARTER_TEXT.none,
    busy: QUARTER_TEXT.busy,
  }[why] || QUARTER_TEXT.off;
}

/**
 * The lot a player holds as the site says it ({ street, lot }, src/Quarter.php held), checked
 * against the blocks: { street, lot } or null. A row with no street is read as blockOfLot does.
 */
export function normalizeHeld(row) {
  const lot = Number(row?.lot);
  if (!Number.isInteger(lot)) return null;
  const block = blockOfLot(lot, row?.street ?? null);
  return block ? { street: block.tsid, lot } : null;
}

/**
 * The solo slice: the lot you hold ({ street, lot }; lot 0: none). A save from before the second
 * quarter holds only { lot }: that lot is Marylpole Mount Quarter's (blockOfLot).
 */
export function normalizeQuarterSlice(slice) {
  const held = slice?.lot ? normalizeHeld(slice) : null;
  return held ? { street: held.street, lot: held.lot } : { street: '', lot: 0 };
}

/* ------------------------------------------------------------------ */
/* The street                                                          */
/* ------------------------------------------------------------------ */

const clone = (v) => JSON.parse(JSON.stringify(v));
const COUNT_WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
const countWord = (n) => COUNT_WORDS[n] || String(n);

/**
 * The floor at world x: the lowest platform under it (the archived lot streets' ground is one
 * line of platforms end to end), rounded, or null.
 */
export function groundYAt(platforms, x) {
  let best = null;
  for (const p of platforms || []) {
    const a = Math.min(p.x1, p.x2);
    const b = Math.max(p.x1, p.x2);
    if (x < a || x > b) continue;
    const y = b === a ? (p.y1 + p.y2) / 2 : p.y1 + ((x - p.x1) / (p.x2 - p.x1)) * (p.y2 - p.y1);
    if (best == null || y > best) best = y;
  }
  return best == null ? null : Math.round(best);
}

/**
 * Tiny Speck's fifteen meadow house decos (pol_ext_meadow, CC0) at the size the archived lot
 * streets draw them, for a block with no lot street of its own (composeBlockBase).
 */
export const MEADOW_HOUSES = Object.freeze({
  door_asset_house_large_01: [415, 334], door_asset_house_large_02: [415, 334], door_asset_house_large_03: [393, 343],
  door_asset_house_large_04: [415, 334], door_asset_house_large_05: [415, 334],
  door_asset_house_medium_01: [382, 293], door_asset_house_medium_02: [383, 310], door_asset_house_medium_03: [382, 293],
  door_asset_house_medium_04: [371, 301], door_asset_house_medium_05: [382, 293],
  door_asset_house_small_01: [342, 285], door_asset_house_small_02: [339, 251], door_asset_house_small_03: [341, 234],
  door_asset_house_small_04: [341, 234], door_asset_house_small_05: [341, 234],
});

/**
 * A block with no archived lot street to lay it on (block.compose: Mien Evoke Quarter's), made from
 * a street of its quarter's own region (the base, Tiny Speck's, CC0), as a template quarterStreet
 * takes (ours: no Bortola quarter template survives):
 * - the base's sky gradient, layers, filters and decos; in the middleground less the `drop` sprites
 *   (its raised mounds and the like, whose platforms are not kept) and its ground band (`band`);
 * - every other middleground deco moved up or down by the base's floor under it, so it stands on
 *   one flat floor at floorY, and the band laid again along that floor (`ground`: each piece at its
 *   foot under the floor, repeated end to end at nine tenths of its width);
 * - widened to `width`: each layer repeats the stretch just before cutX (a parallax layer its own
 *   stretch, in proportion, and grows in proportion), so its art reads on without a seam;
 * - one platform, the floor, end to end; none of the base's signposts, doors, ladders or walls;
 * - `doors`: the `houses` (MEADOW_HOUSES), one per lot in order, for quarterLots.
 */
export function composeBlockBase(base, block) {
  const c = block.compose;
  const W0 = base.bounds.r - base.bounds.l;
  const W = c.width;
  const grow = W - W0;
  const drop = new Set([...(c.drop || []), ...(c.band || [])]);
  const floorAt = (x) => groundYAt(base.platforms, Math.min(base.bounds.r - 1, Math.max(base.bounds.l + 1, x))) ?? c.floorY;
  const layers = clone(base.layers).map((layer) => {
    const mid = layer.id === 'middleground' || layer.name === 'middleground';
    const kept = (layer.decos || []).filter((d) => !mid || !drop.has(d.sprite));
    if (mid) for (const d of kept) d.y = Math.round(d.y + c.floorY - floorAt(d.x));
    // Middleground x is the street's (centred on 0); a parallax layer's runs 0..w from its left end.
    const w = mid ? W0 : Number(layer.w) || W0;
    const add = mid ? grow : Math.round((w * W) / W0) - w;
    const cut = mid ? c.cutX : Math.round(((c.cutX - base.bounds.l) / W0) * w);
    const shift = mid ? -grow / 2 : 0;
    const decos = [];
    for (const d of kept) {
      decos.push({ ...d, x: Math.round(d.x + shift + (d.x >= cut ? add : 0)) });
      if (d.x >= cut - add && d.x < cut) decos.push({ ...d, x: Math.round(d.x + shift + add) });
    }
    if (mid) {
      for (const [sprite, foot, z] of c.ground || []) {
        const like = (layer.decos || []).find((d) => d.sprite === sprite);
        if (!like) throw new Error(`${base.label} has no ${sprite} to lay its ground with`);
        const step = Math.floor(like.w * 0.9);
        for (let x = -W / 2 - step / 2; x < W / 2 + like.w / 2; x += step) {
          decos.push({ sprite, x: Math.round(x), y: c.floorY + foot, w: like.w, h: like.h, z, r: 0 });
        }
      }
    }
    decos.sort((a, b) => (a.z ?? 0) - (b.z ?? 0) || a.x - b.x);
    const out = { ...layer, decos };
    if (!mid || layer.w != null) out.w = mid ? W : w + add;
    return out;
  });
  return {
    label: base.label,
    tsid: base.tsid,
    hubId: base.hubId,
    swf_file: base.swf_file,
    bounds: { l: -W / 2, r: W / 2, t: base.bounds.t, b: base.bounds.b },
    gradient: { ...base.gradient },
    platforms: [{ id: 'plat_quarter_floor', x1: -W / 2, y1: c.floorY, x2: W / 2, y2: c.floorY, pc_perm: -1, item_perm: -1 }],
    layers,
    doors: c.houses.map((sprite, i) => {
      const size = MEADOW_HOUSES[sprite];
      if (!size) throw new Error(`${sprite} is not a meadow house deco`);
      return { sprite, w: size[0], h: size[1], x: i };
    }),
    composed: { grow, floorY: c.floorY, dropped: [...(c.drop || [])] },
  };
}

/**
 * A block's ten lots: number, foot (on the floor) and the template's meadow house deco (its For
 * Sale art), in the template's order; a template with fewer houses than lots starts again from its
 * first (Herring Bone Hatch has nine).
 */
export function quarterLots(template, block = QUARTER_BLOCKS[0]) {
  const doors = [...(template.doors || [])].sort((a, b) => a.x - b.x);
  if (!doors.length) throw new Error(`${template.label} has no house lots`);
  return blockLots(block).map((lot, i) => {
    const x = block.lotX0 + i * QUARTER_LOT_STEP;
    const y = groundYAt(template.platforms, x);
    if (y == null) throw new Error(`${template.label} has no floor under lot ${lot}`);
    const door = doors[i % doors.length];
    return { lot, x, y, sprite: door.sprite, w: door.w, h: door.h };
  });
}

/** QuarterInfo as a signpost carries it (style, label, cols, rows), for a quarter (Marylpole Mount's by default). */
export function quarterInfo(q = QUARTERS[0]) {
  const g = quarterGrid(q);
  return { style: g.style, label: g.name, cols: g.cols, rows: g.rows };
}

/**
 * A block street: its template's layers and ground (or composeBlockBase's), no doors (the lots
 * are features/quarter-feature.js's), one signpost back to its quarter's parent street.
 * @param {object} template the archived lot street's JSON (block.template), or composeBlockBase's
 *   street for a block.compose
 * @param {{ parentArrive: { x: number, y: number }, block?: object }} at where the way out lands
 *   (the parent street's screen space) and the block (QUARTER_BLOCKS)
 */
export function quarterStreet(template, { parentArrive, block = QUARTER_BLOCKS[0] }) {
  const q = quarterOfBlock(block) || QUARTERS[0];
  const composed = Boolean(block.compose && template.composed);
  const layers = clone(template.layers);
  const platforms = clone(template.platforms);
  const lots = quarterLots(template, block);
  const label = blockLabel(q.name, block.x, block.y);
  const houses = (template.doors || []).length;
  const n = countWord(houses);
  const again = houses < lots.length ? ` (the first again for the ${countWord(lots.length) === 'ten' ? 'tenth' : `${lots.length}th`})` : '';
  const flat = lots.every((l) => l.y === lots[0].y);
  const signY = groundYAt(template.platforms, block.signX);
  if (signY == null) throw new Error(`${template.label} has no floor under the block's signpost`);
  const first = block === q.blocks[0];
  const W = template.bounds.r - template.bounds.l;
  return {
    source: composed
      ? `reconstruction: ${label} (not in tinyspeck/glitch-locations: quarters were made at run time, and ${q.hubName}'s quarter templates are lost); composed from ${template.label}'s sky, layers, filters and decos (${block.compose.base}, tinyspeck/glitch-locations locations-xml.zip, CC0) on one flat floor, its raised mounds left out and widened to ${W} px, with ${n} meadow house decos (pol_ext_meadow, CC0) as the lots`
      : `reconstruction: ${label} (not in tinyspeck/glitch-locations: quarters were made at run time); ${template.label}'s geometry and decos (${block.template}, tinyspeck/glitch-locations locations-xml.zip, CC0) with its ${n} meadow house decos as the lots${again}`,
    reconstructed: true,
    tsid: block.tsid,
    label,
    hubId: q.hubId,
    hubName: q.hubName,
    swf_file: template.swf_file,
    bounds: { ...template.bounds },
    gradient: { ...template.gradient },
    platforms,
    layers,
    signposts: [{
      id: QUARTER_BLOCK_SIGN_ID,
      x: block.signX,
      y: signY,
      w: 150,
      h: 200,
      connects: [{ tsid: `L${q.parent.slice(1)}`, label: q.parentLabel, hub_id: q.hubId, arrive: { ...parentArrive } }],
    }],
    quarter: { ...quarterInfo(q), block: { x: block.x, y: block.y }, parent: q.parent, lots },
    stats: {
      platformCount: platforms.length,
      layerCount: layers.length,
      decoCount: layers.reduce((k, l) => k + (l.decos?.length || 0), 0),
      signpostCount: 1,
      doorCount: 0,
      ladderCount: 0,
      barrierCount: 0,
    },
    why: {
      street: composed
        ? `groups/quarter.js and locations/quarter.js: quarter blocks were cloned from templates at run time; none was archived, and ${q.hubName}'s quarter templates (inc_data_pols_prod.js) are among the 54 of 55 lost.`
        : 'groups/quarter.js and locations/quarter.js: quarter blocks were cloned from templates at run time; none was archived, and 54 of the 55 templates are lost.',
      geometry: composed
        ? `${template.label} (hub ${template.hubId}, ${q.hubName}), the parent street: its sky gradient, hills, pines, filters and ground decos, its raised dirt mounds (${template.composed.dropped.join(', ')}) left out and the rest set on one flat floor at y ${template.composed.floorY}, a stretch of each layer repeated to make it ${W} px wide (ours).`
        : `${template.label} (hub 28), an archived meadow street of ${n} numbered house lots: its sky, hills, trees and ${flat ? 'flat' : 'rolling'} ground as they are.`,
      lots: composed
        ? `${n[0].toUpperCase()}${n.slice(1)} of Tiny Speck's meadow house decos (pol_ext_meadow), as the wiki's picture of ${q.name} shows the same houses, as the For Sale houses; spaced 565 px apart for the players' houses (G796). Numbers x5 as on Koita Clutter Quarter, 3300 block (video zOpNCk8f-fs).`
        : `Its ${n} meadow house decos, in order${again}, as the For Sale houses; spaced 565 px apart for the players' houses (G796). Numbers x5 as on Koita Clutter Quarter, 3300 block (video zOpNCk8f-fs).`,
      name: `generate_label: '<Name> Quarter, <x><y>00 block'. ${q.had}; this is the grid's ${first ? 'first block' : `block at column ${block.x}, row ${block.y}`}.`,
      wayOut: `get_exit_position: every signpost on a block leads to the quarter exit, here ${q.parentLabel} beside its QUARTER signpost.`,
    },
  };
}

/**
 * A quarter's QUARTER signpost on its parent street (Marylpole Mount's by default): one connect per
 * block, in the list's order (the board opens the grid of blocks, LocationSelectorDialog.as
 * showQuarters: a button per block, laid out by its column and row). `arrives[i]` is where block
 * i's arrival lands (its screen space).
 */
export function quarterSignpost({ y, arrives, quarter = QUARTERS[0] }) {
  return {
    id: QUARTER_PARENT_SIGN_ID,
    x: quarter.parentSignX,
    y,
    w: 150,
    h: 200,
    quarter: quarterInfo(quarter),
    connects: quarter.blocks.map((b, i) => ({ tsid: `L${b.tsid.slice(1)}`, label: blockLabel(quarter.name, b.x, b.y), hub_id: quarter.hubId, arrive: { ...arrives[i] } })),
  };
}

/**
 * LocationSelectorDialog.as showQuarters: a block's button reads the number from its label
 * ("Marylpole Mount Quarter, 1200 block" -> "1200 block"), at the block's column and row.
 * Null for a connect that is no block.
 */
export function blockChoice(connect) {
  const block = blockOf(connect?.tsid);
  if (!block) return null;
  return { tsid: block.tsid, label: `${block.x}${block.y}00 block`, col: block.x, row: block.y };
}

/** Where a lot's arrival stands on its block (screen space, on the floor): { tsid, spawnX, spawnY } or null. */
export function lotArrival(street, lot) {
  const spot = (street?.quarter?.lots || []).find((l) => l.lot === lot);
  if (!spot || !street.bounds) return null;
  return { tsid: street.tsid, spawnX: Math.round(spot.x - street.bounds.l), spawnY: Math.round(spot.y - street.bounds.t) };
}

/**
 * The home street's quarter arm (ours, Austin 2026-11-27): for the owner's lot ({ street, lot },
 * normalizeHeld), its words ("1105 Marylpole Mount Quarter" or "1105 Mien Evoke Quarter", the
 * quarter the lot is in: generate_pol_label) and where it leads.
 */
export function homeArm(held) {
  const h = normalizeHeld(held);
  if (!h) return null;
  return { label: lotName(h.lot, h.street), tsid: h.street, lot: h.lot };
}

export const quarterIndexEntry = (street) => ({
  label: street.label,
  file: `assets/streets/${street.tsid}.json`,
  hubId: street.hubId,
  hubName: street.hubName,
  platforms: street.platforms.length,
  decos: street.stats.decoCount,
  reconstructed: true,
});
