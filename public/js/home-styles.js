/**
 * Home street styles and the style switch (register G204).
 *
 * Sources:
 * - GameServerJS inc_data_homes_prod.js: 37 exterior (street) and 37 interior
 *   (back yard) styles, 48 of them is_subscriber (js/home-styles-data.js,
 *   built by tools/home-styles/build.mjs).
 * - players/inc_houses.js 1603-1667: houses_style_choices only at home;
 *   house_style_switch_cost = level x 10, at least 40 iMG; houses_style_set
 *   takes the iMG (error not_enough_img) and calls homes_set_style.
 * - locations/inc_homes.js 106-130 homes_set_style / 2861-2908
 *   homes_rebuild_exterior: the street's geometry is re-cloned from the new
 *   style's template while its doors, items (furniture and cultivations, whose
 *   plats are reset), yard expansions and neighbour signpost stay.
 * - client HouseStylesDialog.as / HouseSignDialog.as: the "Change Style"
 *   button, the "Change your street style" dialog, "Change for Ni" and the
 *   "Are you sure you want to change your street style for Ni?" confirm.
 *
 * The remake drops the subscriber gate (there is no subscription) and offers
 * every exterior style whose art survives as CC0 decos. The house stays the
 * one you bought (the source's chassis is its own furniture item, swapped by
 * "Change House", not by the style).
 *
 * Back-yard styles (G135 / G223): inside the house the same switch changes the
 * yard left of the house (homes_set_style 106-118 re-clones the interior
 * template; homes_rebuild_rooms keeps the rooms, furniture and yard size).
 * Every interior template is "house-right" with the groddle frame, so only the
 * landscape differs; each yard draws the look of the street style from its
 * template family (tools/home-styles/recipes.mjs YARD_LOOKS). New houses start
 * on the tutorial choice's yard (G263, magic_rock.js 594-605: Plush Pasture,
 * Easy Ash or Turquoise Florana), else START_INT_TEMPLATE (config_base.js 235,
 * Plush Pasture). HouseStylesDialog
 * titles it "Change your yard style"; its confirm line always said "street
 * style" (it computed is_external_street and never used it), so the yard
 * confirm says "yard".
 */

import { EXTERIOR_STYLES, INTERIOR_STYLES, PURCHASE_STREET_STYLE, PURCHASE_YARD_STYLE } from './home-styles-data.js?v=db6fa613';

export { EXTERIOR_STYLES, INTERIOR_STYLES, PURCHASE_STREET_STYLE, PURCHASE_YARD_STYLE };

/** config_base.js home_limits.START_EXT_TEMPLATE. */
export const START_STREET_STYLE = 'meadow_ext_default_high';
/** config_base.js home_limits.START_INT_TEMPLATE (homes_init_config). */
export const START_YARD_STYLE = 'meadows_int_default__high';

/** HouseStylesDialog.as / HouseSignDialog.as wording. */
export const STYLE_TEXT = Object.freeze({
  button: 'Change Style',
  title: 'Change your street style',
  confirmTitle: 'Change your street style?',
  change: 'Change',
  cancel: 'Cancel',
  yes: 'Yes. Change it!',
  no: 'Nevermind',
  needImg: 'You need more imagination',
  notAtHome: 'You can only change your style at home.',
});

/** HouseStylesDialog.as inside the house (is_external_street false). */
export const YARD_STYLE_TEXT = Object.freeze({
  ...STYLE_TEXT,
  title: 'Change your yard style',
  confirmTitle: 'Change your yard style?',
});

export const STREET_STYLE_BY_KEY = Object.freeze(Object.fromEntries(EXTERIOR_STYLES.map((row) => [row.key, row])));
export const YARD_STYLE_BY_KEY = Object.freeze(Object.fromEntries(INTERIOR_STYLES.map((row) => [row.key, row])));

/** players/inc_houses.js house_style_switch_cost: level x 10, never under 40. */
export function styleSwitchCost(level) {
  const lv = Math.max(1, Math.floor(Number(level) || 1));
  return Math.max(40, lv * 10);
}

export function changeForLabel(cost) {
  return `Change for ${Number(cost).toLocaleString('en-US')}i`;
}

export function confirmText(cost, what = 'street') {
  return `Are you sure you want to change your ${what} style for ${Number(cost).toLocaleString('en-US')}i?`;
}

/** A saved street style, or the one the purchase look starts on. */
export function streetStyleFor(saved, purchaseStyle = 'meadow') {
  if (STREET_STYLE_BY_KEY[saved]?.built) return saved;
  const start = PURCHASE_STREET_STYLE[purchaseStyle] || START_STREET_STYLE;
  return STREET_STYLE_BY_KEY[start]?.built ? start : START_STREET_STYLE;
}

export function streetLook(key) {
  return STREET_STYLE_BY_KEY[key]?.built ? STREET_STYLE_BY_KEY[key].look : STREET_STYLE_BY_KEY[START_STREET_STYLE].look;
}

/**
 * houses_style_choices: every offered street style with is_current, plus the
 * cost. Styles whose art is lost are left out (`missing` lists them).
 */
export function styleChoices(current, level) {
  const cost = styleSwitchCost(level);
  return {
    cost,
    choices: EXTERIOR_STYLES.filter((row) => row.built).map((row) => ({
      key: row.key,
      label: row.label,
      isCurrent: row.key === current,
      look: row.look,
    })),
    missing: EXTERIOR_STYLES.filter((row) => !row.built).map((row) => ({ key: row.key, label: row.label, reason: row.reason })),
  };
}

/** houses_style_set: check and charge; the caller stores the new style and rebuilds the street (or yard). */
export function quoteStyleSwitch({ atHome = true, current, key, imagination = 0, level = 1, yard = false } = {}) {
  const cost = styleSwitchCost(level);
  if (!atHome) return { ok: false, error: 'not_at_home', cost, msg: STYLE_TEXT.notAtHome };
  const row = (yard ? YARD_STYLE_BY_KEY : STREET_STYLE_BY_KEY)[key];
  if (!row || !row.built) return { ok: false, error: 'style_not_found', cost, msg: 'That style is not available.' };
  if (key === current) return { ok: false, error: 'is_current', cost, msg: `That is already your ${yard ? 'yard' : 'street'} style.` };
  if (Math.floor(Number(imagination) || 0) < cost) return { ok: false, error: 'not_enough_img', cost, msg: STYLE_TEXT.needImg };
  return { ok: true, cost, key, label: row.label };
}

export function switchStreetStyle(state, pc, key, opts = {}) {
  const quote = quoteStyleSwitch({ ...opts, current: state.streetStyle, key, imagination: pc?.imagination, level: pc?.level });
  if (!quote.ok) return quote;
  pc.imagination = Math.floor(Number(pc.imagination) || 0) - quote.cost;
  const from = state.streetStyle;
  state.streetStyle = key;
  return { ...quote, from };
}

/**
 * A saved yard style, or the one the purchase look starts on (G263:
 * magic_rock.js 594-605). A home whose yard was never changed saves none,
 * so it follows the purchase look; without one, START_YARD_STYLE.
 */
export function yardStyleFor(saved, purchaseStyle = null) {
  if (YARD_STYLE_BY_KEY[saved]?.built) return saved;
  const start = (purchaseStyle && PURCHASE_YARD_STYLE[purchaseStyle]) || START_YARD_STYLE;
  return YARD_STYLE_BY_KEY[start]?.built ? start : START_YARD_STYLE;
}

/** The yard's look: the street style it pairs with (its `lookOf`). */
export function yardLook(key) {
  const row = YARD_STYLE_BY_KEY[key]?.built ? YARD_STYLE_BY_KEY[key] : YARD_STYLE_BY_KEY[START_YARD_STYLE];
  return streetLook(row.lookOf);
}

/** houses_style_choices inside the house: every yard style whose look is built. */
export function yardStyleChoices(current, level) {
  const cost = styleSwitchCost(level);
  return {
    cost,
    choices: INTERIOR_STYLES.filter((row) => row.built).map((row) => ({
      key: row.key,
      label: row.label,
      isCurrent: row.key === current,
      look: streetLook(row.lookOf),
    })),
    missing: INTERIOR_STYLES.filter((row) => !row.built).map((row) => ({ key: row.key, label: row.label, reason: row.reason })),
  };
}

export function switchYardStyle(state, pc, key, opts = {}) {
  const quote = quoteStyleSwitch({ ...opts, yard: true, current: state.yardStyle, key, imagination: pc?.imagination, level: pc?.level });
  if (!quote.ok) return quote;
  pc.imagination = Math.floor(Number(pc.imagination) || 0) - quote.cost;
  const from = state.yardStyle;
  state.yardStyle = key;
  return { ...quote, from };
}
