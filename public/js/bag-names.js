/**
 * Bag names: the original's Rename verb on a bag (rules only, no DOM).
 * Live Help 2026-11-02: "any chance we'll be able to Name (and rename) our Bags?"
 *
 * Source (glitch-GameServerJS, CC0):
 *  - items/bag_bigger.js verbs.rename 475-520: "rename", tooltip "Give me a
 *    new name", sort_on 67, ok_states in_location and in_pack. Conditions
 *    (486-500): always enabled, except on the ground when another player
 *    dropped it and stands within 100 px: "You are not allowed to rename
 *    this." The handler (501-519) asks "Name Me!" with "My new name:", at
 *    most 32 characters, typing restricted to 'A-Z a-z 0-9', the current
 *    user_name filled in.
 *  - onInputBoxResponse 605-611: the answer cut to 32, everything but
 *    letters, digits and spaces removed; only a non-empty answer becomes
 *    this.user_name (an empty one keeps the old name).
 *  - getLabel 592-598: user_name when set, else the class label. That label
 *    is the item's label everywhere the client shows one (common.js
 *    make_item_simple 546): the open bag's header (glitch-client
 *    PackDisplayManager.as:1117 new PackContainerView(itemstack.slots,
 *    itemstack.label)), the drag tips "Put in <b>label</b>" / "Move to"
 *    (:725-727, main.js 5387-5444), the slot's tooltip.
 *  - The same verb, word for word, is on every bag that has it:
 *    `grep -ln "verbs.rename" items/bag*.js` gives bag_generic (and _blue,
 *    _gray, _green, _pink), bag_bigger (and _blue, _gray, _green, _pink),
 *    bag_toolbox_red, _green and _chrome (defined by bag_bigger),
 *    bag_spicerack, bag_alchemistry_kit, bag_cubimal_case,
 *    bag_elemental_pouch (538-585, 715-729), bag_gift_box,
 *    bag_gift_box_wrapped and bag_test_item (defined by bag_generic). The
 *    furniture cabinets, trophy cases, the safe deposit box, bag_butler,
 *    bag_escrow, bag_moving_box, bag_notice_board, bag_private,
 *    bag_greeter_badge and the base bag.js have no Rename.
 *
 * Remake: every bag in the pack's BAG_DEFS (js/pack-slots.js) is on that list
 * and has Rename. The Gift Box is a pack item here, not a bag the pack opens
 * (features/gifts-feature.js), and the test bag is not in the game, so those
 * two keep no name. On the ground only the player's own dropped bags (js/world-items.js
 * records) can be renamed: a stack shared on a public street online carries
 * no name (groddle-afternoon-server drops.go), so it has no Rename, and the
 * conditions' "another player dropped it" case never comes up. Ours: an answer of only spaces counts as empty (the
 * source would have kept a name that shows as nothing), and the ends are
 * trimmed.
 */

import { filterText } from './word-filter.js?v=9a7a7ebb';

/** Every bag class in the source with verbs.rename (the grep above). */
export const SOURCE_RENAMABLE_BAGS = Object.freeze([
  'bag_alchemistry_kit',
  'bag_bigger', 'bag_bigger_blue', 'bag_bigger_gray', 'bag_bigger_green', 'bag_bigger_pink',
  'bag_cubimal_case',
  'bag_elemental_pouch',
  'bag_generic', 'bag_generic_blue', 'bag_generic_gray', 'bag_generic_green', 'bag_generic_pink',
  'bag_gift_box', 'bag_gift_box_wrapped',
  'bag_spicerack',
  'bag_test_item',
  'bag_toolbox_chrome', 'bag_toolbox_green', 'bag_toolbox_red',
]);

/** The ones a player can carry as a bag here (all of BAG_DEFS). */
export const RENAMABLE_BAGS = Object.freeze(SOURCE_RENAMABLE_BAGS.filter((c) => !['bag_gift_box', 'bag_gift_box_wrapped', 'bag_test_item'].includes(c)));
const RENAMABLE = new Set(RENAMABLE_BAGS);

/** verbs.rename handler 509: input_max_chars. */
export const BAG_NAME_MAX = 32;

/** The verb's words (verbs.rename 476-485, 501-519). */
export const BAG_RENAME_COPY = Object.freeze({
  label: 'Rename',
  tooltip: 'Give me a new name',
  title: 'Name Me!',
  input: 'My new name:',
  sortOn: 67,
});

export function canRenameBag(cls) {
  return RENAMABLE.has(String(cls || ''));
}

/** onInputBoxResponse 606: first 32 characters, then letters, digits and spaces only (ours: the ends trimmed). */
export function cleanBagName(value) {
  if (value == null) return '';
  return String(value).substr(0, BAG_NAME_MAX).replace(/[^a-z0-9 ]/gi, '').trim();
}

/** onInputBoxResponse 608-610: a non-empty answer is the new name, an empty one keeps the old. */
export function renamedTo(oldName, value) {
  const next = cleanBagName(value);
  return next || cleanBagName(oldName);
}

/**
 * getLabel 592-598: the player's name for it, else the class label. The name
 * is kept as typed (the rename's letters, digits and spaces) and shown through
 * the word filter (the remake's own addition, js/word-filter.js), so a bad
 * word shows as a grawlix wherever the name shows, saves made before the
 * filter too.
 */
export function bagLabel(name, classLabel) {
  return filterText(cleanBagName(name)) || String(classLabel || '');
}

