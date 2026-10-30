/**
 * Help digging (G329): digging a Dirt Pile together, between real players in
 * multiplayer. The rules are GameServerJS items/dirt_pile.js, and the
 * realtime server keeps the crew (groddle-afternoon-server objects.go
 * digHelp, obj_dig):
 *   - getVerbLabel 273-281: the verb reads "Help dig" while anyone else digs
 *     the pile.
 *   - addDigger 153-166: a digger's helpers are everyone who starts digging
 *     while that dig runs, each once; removeDigger 497-521 takes a cancelled
 *     dig off every list.
 *   - onDigComplete 293-485: past 0 helpers 1 more item, past 2 two, past 5
 *     three; past 1 a 5% chance (15% past 5) the yield is Loam; the bonus
 *     items are Loam when either Loam came, and the line "You got N
 *     additional <items> thanks to the help you got from <names>." (459);
 *     a dig that had helpers counts helped_dig (481-483), which It Takes Two
 *     (quests/soilappreciation_help_digging.js r277) asks three of.
 * Pure: no DOM, no engine (tests/help-dig-mp.test.js).
 */

import { helpString } from './help-mine.js?v=27f9d276';

/** quests/soilappreciation_help_digging.js r277: the counter It Takes Two reads. */
export const HELP_DIG_COUNTER = 'helped_dig';

/** dirt_pile.js getVerbLabel 278. */
export const HELP_DIG_LABEL = 'Help dig';

/** The item names the line uses (earth.js, loam.js name_single / name_plural). */
const DIG_ITEM_NAMES = Object.freeze({
  earth: Object.freeze(['Lump of Earth', 'Lumps of Earth']),
  loam: Object.freeze(['Lump of Loam', 'Lumps of Loam']),
});

/** The server's help for one landed dig, cleaned: { n, items, classTsid, loam, by }, or null. */
export function digHelpFrom(help) {
  if (!help || typeof help !== 'object') return null;
  const whole = (v, hi) => Math.max(0, Math.min(hi, Math.floor(Number(v) || 0)));
  const n = whole(help.n, 64);
  if (!n) return null;
  const classTsid = help.class === 'loam' ? 'loam' : 'earth';
  const by = (Array.isArray(help.by) ? help.by : []).map(String).filter(Boolean).slice(0, 64);
  return { n, items: whole(help.items, 3), classTsid, loam: help.loam === true, by };
}

/** dirt_pile.js 459: the bonus line. */
export function helpDigMessage(count, classTsid, names = []) {
  const [single, plural] = DIG_ITEM_NAMES[classTsid] || DIG_ITEM_NAMES.earth;
  return `You got ${count} additional ${count > 1 ? plural : single} thanks to the help you got from ${helpString(names)}.`;
}

/** Others digging the pile (the server's diggers less you): the verb reads "Help dig". */
export function othersDigging(diggers, me) {
  const mine = Number(me) || 0;
  return (Array.isArray(diggers) ? diggers : []).map(Number).filter((id) => id > 0 && id !== mine);
}
