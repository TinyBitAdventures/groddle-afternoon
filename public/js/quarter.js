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
 * 2012) and 54 of the 55 templates. So each block is laid on one of the twelve archived meadow lot
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
 * - One lot per player across every block (pols_canBuy has_other), first come first served.
 * - Solo: your own lot and the For Sale houses, no made-up neighbours.
 */

/** The parent street: Marylpole Mount, Groddle Meadow. */
export const QUARTER_PARENT_TSID = 'GLI32HBOUTD1GQV';

/**
 * The blocks (G1186; the 1200 block, Austin 2026-11-27). One entry each: a remake tsid (no quarter
 * street survives), the grid cell (groups/quarter.js: x the column, y the row, as generate_label
 * writes "<x><y>00 block"), the archived lot street it is laid on (CC0 geometry and decos), the
 * first lot's foot and the block's signpost back to Marylpole Mount (world x). The next block is one
 * more entry here and `node tools/build-rebuilt-rooms.mjs` (then the realtime server's
 * tools/build-realtime-quarters.mjs): the street, its lots, the QUARTER signpost's grid, the claims
 * on the server and the site all follow from this list. Nothing opens a block by itself when one
 * fills (Austin has not decided that).
 * - 1100: Whipping Cross Crossing (GLI11TJJ7871GF3), one flat floor at y -84.
 * - 1200: Herring Bone Hatch (GLI12LNGM871KU0), 8000 px of one rolling floor from end to end; the
 *   lots start where the ten tilt least (at most 20 px across a house's middle 360 px). Its nine
 *   meadow houses, the first again for the tenth.
 */
export const QUARTER_BLOCKS = Object.freeze([
  Object.freeze({ tsid: 'GQRMM1100BLOCK1', x: 1, y: 1, template: 'GLI11TJJ7871GF3', lotX0: -2400, signX: -2750 }),
  Object.freeze({ tsid: 'GQRMM1200BLOCK1', x: 1, y: 2, template: 'GLI12LNGM871KU0', lotX0: -2970, signX: -3680 }),
]);

/** The first block (1100), as the one-block code named it. */
export const QUARTER_TSID = QUARTER_BLOCKS[0].tsid;
/** The archived lot street the first block is laid on. */
export const QUARTER_TEMPLATE_TSID = QUARTER_BLOCKS[0].template;

/** groups/quarter.js init: the quarter's name and style; its grid holds every block. */
export const QUARTER = Object.freeze({
  name: 'Marylpole Mount Quarter',
  style: 'normal',
  cols: Math.max(...QUARTER_BLOCKS.map((b) => b.x)),
  rows: Math.max(...QUARTER_BLOCKS.map((b) => b.y)),
  block: Object.freeze({ x: QUARTER_BLOCKS[0].x, y: QUARTER_BLOCKS[0].y }),
});

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
/** Marylpole Mount's QUARTER signpost: on its flat left end, clear of signpost_2 at -2865. */
export const QUARTER_PARENT_SIGN_X = -2300;
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

/** Every block's lots: unique across blocks, as <x><y>## is (x and y 1 to 9). */
export const QUARTER_ALL_LOTS = Object.freeze(QUARTER_BLOCKS.flatMap((b) => blockLots(b)));

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

/** The block a lot is on, or null. */
export function blockOfLot(lot) {
  return QUARTER_BLOCKS.find((b) => blockLots(b).includes(lot)) || null;
}

/** True for any block's street under either tsid prefix. */
export function isQuarterTsid(tsid) {
  return blockOf(tsid) != null;
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

/**
 * pols_canBuy for a lot here (the site and the server check the same): null when `me` may claim
 * it, else why: 'lot' (no such lot), 'taken' (owned, inc_pols.js 24-29), 'have' (has_other, 31-36:
 * one lot across every block; `mine` is the lot `me` holds on any block, 0 for none),
 * 'no_home' (the front leads to a home street: none yet), 'newxp' (still in the tutorial).
 */
export function judgeClaim({ lots, me, lot, mine = 0, hasHome = true, tutorial = false, all = QUARTER_ALL_LOTS } = {}) {
  if (!isQuarterLot(lot, all)) return 'lot';
  const held = lots?.get?.(lot);
  if (held && held.owner?.id !== me) return 'taken';
  if (held) return null; // already yours: asking again answers the same
  if (lotOf(lots, me) || (mine && mine !== lot)) return 'have';
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
 * against the blocks: { street, lot } or null.
 */
export function normalizeHeld(row) {
  const lot = Number(row?.lot);
  const block = blockOfLot(lot);
  if (!block || !isQuarterLot(lot)) return null;
  if (row?.street != null && blockOf(row.street) !== block) return null;
  return { street: block.tsid, lot };
}

/** The solo slice: the lot you hold (0: none). */
export function normalizeQuarterSlice(slice) {
  const lot = Number(slice?.lot);
  return { lot: isQuarterLot(lot) ? lot : 0 };
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

/** QuarterInfo as a signpost carries it (style, label, cols, rows). */
export function quarterInfo() {
  return { style: QUARTER.style, label: QUARTER.name, cols: QUARTER.cols, rows: QUARTER.rows };
}

/**
 * A block street: its template's layers and ground, no doors (the lots are
 * features/quarter-feature.js's), one signpost back to Marylpole Mount.
 * @param {object} template the archived lot street's JSON (block.template)
 * @param {{ parentArrive: { x: number, y: number }, block?: object }} at where the way out lands
 *   (Marylpole Mount's screen space) and the block (QUARTER_BLOCKS)
 */
export function quarterStreet(template, { parentArrive, block = QUARTER_BLOCKS[0] }) {
  const layers = clone(template.layers);
  const platforms = clone(template.platforms);
  const lots = quarterLots(template, block);
  const label = blockLabel(QUARTER.name, block.x, block.y);
  const houses = (template.doors || []).length;
  const n = countWord(houses);
  const again = houses < lots.length ? ` (the first again for the ${countWord(lots.length) === 'ten' ? 'tenth' : `${lots.length}th`})` : '';
  const flat = lots.every((l) => l.y === lots[0].y);
  const signY = groundYAt(template.platforms, block.signX);
  if (signY == null) throw new Error(`${template.label} has no floor under the block's signpost`);
  const first = block === QUARTER_BLOCKS[0];
  return {
    source: `reconstruction: ${label} (not in tinyspeck/glitch-locations: quarters were made at run time); ${template.label}'s geometry and decos (${block.template}, tinyspeck/glitch-locations locations-xml.zip, CC0) with its ${n} meadow house decos as the lots${again}`,
    reconstructed: true,
    tsid: block.tsid,
    label,
    hubId: '58',
    hubName: 'Groddle Meadow',
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
      connects: [{ tsid: `L${QUARTER_PARENT_TSID.slice(1)}`, label: 'Marylpole Mount', hub_id: '58', arrive: { ...parentArrive } }],
    }],
    quarter: { ...quarterInfo(), block: { x: block.x, y: block.y }, parent: QUARTER_PARENT_TSID, lots },
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
      street: 'groups/quarter.js and locations/quarter.js: quarter blocks were cloned from templates at run time; none was archived, and 54 of the 55 templates are lost.',
      geometry: `${template.label} (hub 28), an archived meadow street of ${n} numbered house lots: its sky, hills, trees and ${flat ? 'flat' : 'rolling'} ground as they are.`,
      lots: `Its ${n} meadow house decos, in order${again}, as the For Sale houses; spaced 565 px apart for the players' houses (G796). Numbers x5 as on Koita Clutter Quarter, 3300 block (video zOpNCk8f-fs).`,
      name: `generate_label: '<Name> Quarter, <x><y>00 block'. Marylpole Mount had a quarter (a player's snap of its 3400 block); this is the grid's ${first ? 'first block' : `block at column ${block.x}, row ${block.y}`}.`,
      wayOut: 'get_exit_position: every signpost on a block leads to the quarter exit, here Marylpole Mount beside its QUARTER signpost.',
    },
  };
}

/**
 * The parent's QUARTER signpost: one connect per block, in the list's order (the board opens the
 * grid of blocks, LocationSelectorDialog.as showQuarters: a button per block, laid out by its column
 * and row). `arrives[i]` is where block i's arrival lands (its screen space).
 */
export function quarterSignpost({ y, arrives }) {
  return {
    id: QUARTER_PARENT_SIGN_ID,
    x: QUARTER_PARENT_SIGN_X,
    y,
    w: 150,
    h: 200,
    quarter: quarterInfo(),
    connects: QUARTER_BLOCKS.map((b, i) => ({ tsid: `L${b.tsid.slice(1)}`, label: blockLabel(QUARTER.name, b.x, b.y), hub_id: '58', arrive: { ...arrives[i] } })),
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
 * normalizeHeld), its words ("1105 Marylpole Mount Quarter", generate_pol_label) and where it leads.
 */
export function homeArm(held) {
  const h = normalizeHeld(held);
  if (!h) return null;
  return { label: lotLabel(h.lot), tsid: h.street, lot: h.lot };
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
