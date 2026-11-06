/**
 * Collections counted from what the pack holds, and their trophies. The original checks a collection
 * badge whenever an item arrives: players/inc_items.js items_added 593-597 asks
 * achievements_check_in_inventory (inc_achievements.js 520-544), which wants countItemClass(label)
 * >= value for every condition, so a collection is whatever you hold at once, however it arrived.
 * Each badge's onComplete then makes its one trophy (achievements/collection_*.js,
 * pc.createItemFromFamiliar). These are collection_type 1: you keep the items
 * (inc_achievements.js 392-401 only destroys them for type 2, the Egg Hunter's eggs and the Street
 * Creator pieces, which js/seasons.js and js/street-jobs.js handle).
 */

/**
 * Badges counted by holding: each condition's counter follows the pack up and down, so the Badges
 * panel shows what you hold now and the badge comes with the last one in hand.
 */
export const HELD_AT_ONCE = Object.freeze(['collection_gems', 'collection_fruits', 'collection_gasses', 'collection_bubbles', 'collection_spices', 'collection_all_emblems']);

/**
 * Cubimal figures reach the pack by trade, gift and mail too, not only from a box (game.js), so
 * each is counted when it first shows up. These counters, and the Musicblocks' (game.js,
 * features/musicblocks-feature.js), were never taken back when a figure or block left the pack:
 * kept so, which is kinder than the original's held at once.
 */
export const COUNTED_ON_ARRIVAL = Object.freeze(['collection_cubimals', 'collection_cubimals_2']);

/** Badge -> the trophy it gives, with the item's name_single and description (items/trophy_*.js). */
export const COLLECTION_TROPHIES = Object.freeze({
  collection_all_emblems: { trophy: 'trophy_emblems', label: 'Emblem Trophy', desc: 'This trophy is awarded for collecting all 11 Giant Emblems. Giantdamn, you are good at Glitch!' },
  collection_bubbles: { trophy: 'trophy_bubble', label: 'Bubble Trophy', desc: 'This trophy is awarded for the plucky collection of all 4 bubbles.' },
  collection_cubimals: { trophy: 'trophy_cubimal', label: 'Cubimal Series 1 Trophy', desc: 'This trophy is awarded for the cubular collection of all 23 cubimals of Cubimal Series 1.' },
  collection_cubimals_2: { trophy: 'trophy_cubimal_2', label: 'Cubimal Series 2 Trophy', desc: 'This trophy is awarded for the cubuliscious collection of all 20 Cubimals of Cubimal Series 2.' },
  collection_fruits: { trophy: 'trophy_fruit', label: 'Fruit Trophy', desc: 'This cup is awarded for superior efforts in the fruit collecting sciences.' },
  collection_gasses: { trophy: 'trophy_gas', label: 'Gas Trophy', desc: 'This trophy is awarded to those who demonstrate noble dedication to gas collecting.' },
  collection_gems: { trophy: 'trophy_gem', label: 'Gem Trophy', desc: "This trophy is awarded for a nigh-unnatural love of shiny things that doesn't involve putting them in one's mouth." },
  collection_musicblocks_bb: { trophy: 'trophy_music_b_brown', label: 'BB Music Trophy', desc: 'Brilliantly Bodacious are two words often used to describe the bearer of the BB Music Trophy. Also, "Brutally Beardy", or "Big and Bouncy". Anything celebrating the finding of all five BB Music Blocks, basically.' },
  collection_musicblocks_db: { trophy: 'trophy_music_d_blue', label: 'DB Music Trophy', desc: 'This plaque entitles the winner to bragging rights for collecting all five DB Music Blocks.' },
  collection_musicblocks_dg: { trophy: 'trophy_music_d_green', label: 'DG Music Trophy', desc: 'This plaque shouts out "Look at me world! I collected all five DG Music Blocks!" Metaphorically, that is.' },
  collection_musicblocks_dr: { trophy: 'trophy_music_d_red', label: 'DR Music Trophy', desc: 'Let it be known that this here plaque award thingummy honors the finding and collecting of all 5 DR Music Blocks.' },
  collection_musicblocks_xs: { trophy: 'trophy_music_x_shiny', label: 'XS Music Trophy', desc: 'As shiny as the soul of its bearer, this plaque recognizes the meritorious Music Block collection skills of said bearer.' },
  collection_spices: { trophy: 'trophy_spice', label: 'Spice Trophy', desc: 'The paws of the individual holding this award are deserving of your praise, if you consider the collection of all 16 spices praiseworthy. Which you should.' },
});

/** The classes a badge's in_inventory conditions name. */
export function collectionClasses(def) {
  return (def?.conditions || []).filter((c) => c.group === 'in_inventory').map((c) => c.name);
}

/**
 * What changed since the last look. `before` is the set held then, or null at a save's first look:
 * every class held counts as gained and every other one as lost, so a saved counter never outlives
 * the item it counted.
 */
export function heldChanges(before, classes, countOf) {
  const gained = [];
  const lost = [];
  const held = new Set();
  for (const cls of classes) {
    if ((Number(countOf(cls)) || 0) > 0) {
      held.add(cls);
      if (!before?.has(cls)) gained.push(cls);
    } else if (!before || before.has(cls)) lost.push(cls);
  }
  return { gained, lost, held };
}

/**
 * The trophies owed: an unlocked badge whose trophy was never settled, on any save, however long ago
 * the badge came (the remake paid the badge and no trophy until now). One a badge, ever: `given`
 * remembers it wherever the trophy goes afterwards; a trophy already in the pack is settled without
 * a second. Returns [{ badge, trophy, give }].
 */
export function planCollectionTrophies(given, unlocked, countOf) {
  const out = [];
  for (const [badge, row] of Object.entries(COLLECTION_TROPHIES)) {
    if (!(unlocked || []).includes(badge) || (given || []).includes(badge)) continue;
    out.push({ badge, trophy: row.trophy, give: !((Number(countOf(row.trophy)) || 0) > 0) });
  }
  return out;
}
