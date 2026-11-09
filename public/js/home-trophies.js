/**
 * Trophies on show at home, through Decorate (report 99).
 *
 * In the original a trophy never sits in the pack: bag.js 98-104 and 437 keep it out, it lives in a
 * hidden container and players/inc_furniture.js furniture_migrate_trophies (176-198) copies it into
 * the furniture bag, where DecorateModel.as furniture_panesA gives trophy_ classes their own filter.
 * From there it is set down in your own house (trophy_base canDrop, verbs.drop 72-100) and comes
 * back to the bag (HandOfDecorator.as dropTrophyFromLocationInFurnitureBag, onPickup). Trophies
 * are no furniture_base: no price, no style, no flip, and no box or cabinet takes them
 * (bag_furniture_sdb.js 631, bag_furniture_cabinet.js 440).
 *
 * The remake's furniture bag is the Decorate tray: js/home-decor.js furnitureDef reads this table
 * as well as the furniture catalog, so a trophy held in the pack count (no slot, pack-slots-data.js
 * NO_SLOT_CLASSES) shows in the tray of any save, and a placed one goes to furniture storage when
 * picked up. Art: the class's own world frame, tools/world-art/render.py from tinyspeck/glitch-items
 * (CC0), logical size at 1x (textures.js reads @3x from the file name).
 */
import { COLLECTION_TROPHIES } from './collection-trophies.js?v=69205984';

const SIZES = Object.freeze({
  trophy_bubble: [47, 50],
  trophy_cubimal: [34, 39],
  trophy_cubimal_2: [34, 39],
  trophy_egghunt: [36, 62],
  trophy_emblems: [39, 60],
  trophy_fruit: [50, 50],
  trophy_gas: [36, 50],
  trophy_gem: [36, 50],
  trophy_music_b_brown: [48, 49],
  trophy_music_d_blue: [48, 49],
  trophy_music_d_green: [48, 49],
  trophy_music_d_red: [48, 49],
  trophy_music_x_shiny: [48, 49],
  trophy_spice: [49, 50],
  trophy_street_creator_dirt: [69, 68],
  trophy_street_creator_earth: [69, 67],
  trophy_street_creator_rock: [69, 65],
  trophy_street_creator_wood: [69, 68],
});

/** Badge -> the trophy it gives, for the five COLLECTION_TROPHIES does not settle (js/seasons.js, js/street-jobs.js). */
const OTHER_TROPHIES = Object.freeze({
  collection_egg_hunter: { trophy: 'trophy_egghunt', label: 'Egg Hunter Trophy', desc: 'This trophy is awarded to the eager egg hunter who collects all five chocolate eggs.' },
  collection_street_creator_dirt: { trophy: 'trophy_street_creator_dirt', label: 'Street Creator Dirt Trophy', desc: 'This Trophy, artfully depicting a master of dirt, marks a street-building career so great that the holder collected\u2026 well, all five parts of this trophy.' },
  collection_street_creator_earth: { trophy: 'trophy_street_creator_earth', label: 'Street Creator Earth Trophy', desc: 'This stunning bauble marks a remarkable amount of street-building by the holder. Enough to collect all five parts of this fine Earth Trophy, at least.' },
  collection_street_creator_rock: { trophy: 'trophy_street_creator_rock', label: 'Street Creator Rock Trophy', desc: 'The holder of this tchotchke has earned their reputation as a rock of the street-creation community. They also earned a patched-up trophy.' },
  collection_street_creator_wood: { trophy: 'trophy_street_creator_wood', label: 'Street Creator Wood Trophy', desc: "The holder of this trophy hard-earned each of its five fragments through assiduous street-creation activity. Hopefully it won't give splinters." },
});

const BY_BADGE = Object.freeze({ ...COLLECTION_TROPHIES, ...OTHER_TROPHIES });

/** Decor rows, the furniture catalog's shape: stands on the floor or on a piece's surface under it. */
export const TROPHY_DECOR = Object.freeze(Object.fromEntries(Object.values(BY_BADGE).map(({ trophy, label, desc }) => {
  const [w, h] = SIZES[trophy];
  return [trophy, Object.freeze({
    classTsid: trophy,
    label,
    desc,
    baseCost: 0,
    placementSet: [],
    slot: 'floor',
    tabletop: true,
    canFlip: false,
    art: Object.freeze({ path: `assets/sprites/world/${trophy}/1@3x.webp`, w, h }),
    source: `items/${trophy}.js`,
  })];
})));

export function isTrophyDecor(classTsid) {
  return Object.prototype.hasOwnProperty.call(TROPHY_DECOR, String(classTsid || ''));
}

/** The trophy a badge gives, or null. */
export function trophyOfBadge(badge) {
  return Object.prototype.hasOwnProperty.call(BY_BADGE, String(badge || '')) ? BY_BADGE[badge].trophy : null;
}

/** The Badges window's line on a badge whose trophy is earned (ours: the original's window said nothing). */
export const TROPHY_FIND_TEXT = 'Display its trophy from the Furniture tab when you Decorate your house.';

/** Rows of the decor states ({ placed: [...] }) that are trophies. */
export function placedTrophies(decors = []) {
  let n = 0;
  for (const decor of decors) {
    for (const row of Array.isArray(decor?.placed) ? decor.placed : []) if (isTrophyDecor(row?.classTsid)) n += 1;
  }
  return n;
}

/**
 * What the line giving a trophy adds (ours; a player's report 2026-11-08 could not find one in the
 * pack). A trophy never shows in the pack, as in the original (bag.js 98-104 and 437 keep it out;
 * players/inc_furniture.js furniture_migrate_trophies 176-198 puts it in the furniture bag), and the
 * original said nothing about where it went.
 */
export const TROPHY_WHERE_TEXT = 'It waits with your furniture, not in your pack: display it from the Furniture tab when you Decorate your house.';

/** The line for a trophy given: `lead` ("You got the Gem Trophy!") and where it went. */
export function trophyGotText(lead) {
  return `${String(lead || '').trim()} ${TROPHY_WHERE_TEXT}`;
}
