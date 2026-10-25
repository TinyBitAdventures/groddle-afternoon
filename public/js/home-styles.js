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
 */

import { EXTERIOR_STYLES, INTERIOR_STYLES, PURCHASE_STREET_STYLE } from './home-styles-data.js?v=g204-1';

export { EXTERIOR_STYLES, INTERIOR_STYLES, PURCHASE_STREET_STYLE };

/** config_base.js home_limits.START_EXT_TEMPLATE. */
export const START_STREET_STYLE = 'meadow_ext_default_high';

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

export const STREET_STYLE_BY_KEY = Object.freeze(Object.fromEntries(EXTERIOR_STYLES.map((row) => [row.key, row])));

/** players/inc_houses.js house_style_switch_cost: level x 10, never under 40. */
export function styleSwitchCost(level) {
  const lv = Math.max(1, Math.floor(Number(level) || 1));
  return Math.max(40, lv * 10);
}

export function changeForLabel(cost) {
  return `Change for ${Number(cost).toLocaleString('en-US')}i`;
}

export function confirmText(cost) {
  return `Are you sure you want to change your street style for ${Number(cost).toLocaleString('en-US')}i?`;
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

/** houses_style_set: check and charge; the caller stores the new style and rebuilds the street. */
export function quoteStyleSwitch({ atHome = true, current, key, imagination = 0, level = 1 } = {}) {
  const cost = styleSwitchCost(level);
  if (!atHome) return { ok: false, error: 'not_at_home', cost, msg: STYLE_TEXT.notAtHome };
  const row = STREET_STYLE_BY_KEY[key];
  if (!row || !row.built) return { ok: false, error: 'style_not_found', cost, msg: 'That style is not available.' };
  if (key === current) return { ok: false, error: 'is_current', cost, msg: 'That is already your street style.' };
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
