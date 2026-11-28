/**
 * #748: an item used where it lies, never entering the pack (a Thanksgiving Day feast pile's bite,
 * js/features/feast-day-feature.js), is used with its own pack verb, as Glitch named it, so the pile
 * says what the item says in the pack and does what it does there:
 *  - a feature's own verb first (features' stockVerb hook): a Sno Cone's Eat (sno_cone_base
 *    verbs.eat: iMG, never energy), Gandlevery's Munch (herb_base verbs.munch);
 *  - a buff item's verb (js/buffs.js BUFF_ITEM_CATALOG): the other herbs' Munch (herb_base
 *    verbs.munch; include/food.js 8-11 hides a herb's Eat), Spinach's Activate;
 *  - a drink's Drink (include/drink.js verbs.drink, #723), a food's Eat (include/food.js).
 * The order is the pack's own (game.js usePackItem: a buff item activates before the food Eat).
 */

import { getItemUseInfo } from './inventory.js?v=3be7988a';
import { getBuffItemInfo } from './buffs.js?v=3853dc19';

/**
 * `query(hook, classTsid)` asks the features (game.js: features.query(hook, classTsid, engine)).
 * Returns { id, label, kind: 'feature' | 'buff' | 'drink' | 'food', tooltip? } or null when the
 * item has nothing to be used for.
 */
export function stockUseVerb(classTsid, query = null) {
  const cls = String(classTsid || '');
  if (!cls) return null;
  const own = typeof query === 'function' ? query('stockVerb', cls) : null;
  if (own?.id) return { ...own, kind: 'feature' };
  const buff = getBuffItemInfo(cls);
  if (buff?.def) return { id: String(buff.verb || 'Use').toLowerCase(), label: buff.verb || 'Use', kind: 'buff' };
  const info = getItemUseInfo(cls);
  if (!info?.usable) return null;
  if (info.kind === 'drink') return { id: 'drink', label: info.verb || 'Drink', kind: 'drink' };
  return info.effects?.energy ? { id: 'eat', label: info.verb || 'Eat', kind: 'food' } : null;
}
