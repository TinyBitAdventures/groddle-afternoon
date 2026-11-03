/**
 * RIGHTCLICK (Austin 2026-11-03, right-click audit later batch item 1): another player's menu
 * "from a list": a chat name, a buddy row, a Chats row, a minimap dot. Glitch built it from the
 * player's id and name wherever the player was (control/InteractionMenuController.as
 * startPcMenuFromList 664-693; the menu itself 496-662), and dropped or greyed the rows that need
 * you on the same street ("You must be in the same location!": Give 537-545, Offer to Trade
 * 549-557, Follow 609-619).
 *
 * - The player is on your street (their Glitch is drawn: the party feature's pc_remote target):
 *   the full world player menu, the same rows a click on their Glitch gives (Give, Offer to Trade,
 *   Follow, the pack emotes too).
 * - Anywhere else: the rows that work at a distance, as Glitch's list menu kept them: Open Profile
 *   Page, Invite to Party, IM, Visit Home Street, Add to / Remove from Friends, Block / Un-Block.
 *   The rows are the features' own (engine.targetVerbs on a target built from the id and the name),
 *   so their labels, tips and reasons are the world menu's.
 * - Your own name: no menu (ContactElement.as 269 skipped yourself).
 *
 * The menu is the shared one (js/ui/context-menu.js): at the pointer for a click or a right-click,
 * beside the name or the row for the keys; game.js openPlayerListMenu opens it (engine.openPlayerMenu
 * for the features). QA: canvas data contextMenu "player:<id>", playerMenu here|list.
 */

import { PROFILE_PAGE_VERB } from '../profiles.js?v=06d5732b';
import { IM_VERB_ID } from '../player-im.js?v=f8834d6d';
import { BUDDY_VERBS } from '../buddies.js?v=df41a3bb';
import { VISIT_VERB } from '../neighbours-mp.js?v=a8d5544e';

/** The feature that draws other players and owns their targets (features/party-feature.js PARTY_FEATURE_ID). */
export const PLAYER_TARGET_FEATURE = 'party';

/** The rows that work with the player anywhere (Glitch's list menu without the same-location ones). */
export const FROM_LIST_VERBS = Object.freeze([
  PROFILE_PAGE_VERB,
  'party_invite',
  IM_VERB_ID,
  VISIT_VERB.id,
  BUDDY_VERBS.add,
  BUDDY_VERBS.remove,
  BUDDY_VERBS.ignore,
  BUDDY_VERBS.unignore,
]);

const n0 = (v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Math.floor(Number(v)) : 0);

/** PURE: the target a player from a list stands for: their id and name, nothing on the street. */
export function listPlayerTarget({ id, name = '' } = {}) {
  const playerId = n0(id);
  const label = String(name || '').trim() || 'A Glitch';
  return { featureId: PLAYER_TARGET_FEATURE, classId: 'pc_remote', playerId, label, name: label, fromList: true };
}

/** PURE: whether a name or a row may open the player menu: another player (never you, never nobody). */
export function opensPlayerMenu(id, me = 0) {
  const pid = n0(id);
  return pid > 0 && pid !== n0(me);
}

/**
 * PURE: the menu's rows from the player's verbs (engine.targetVerbs). `here`: they are on your
 * street, so every row; else only FROM_LIST_VERBS. `omit`: verb ids a surface already shows as its
 * own first row (a Chats row's Open is the IM itself).
 * @returns {{ id: string, label: string, tip: string, disabled: boolean, reason: string }[]}
 */
export function playerMenuRows(verbs, { here = false, omit = [] } = {}) {
  const skip = new Set(omit || []);
  return (verbs || [])
    .filter((v) => v && v.id && !skip.has(v.id) && (here || FROM_LIST_VERBS.includes(v.id)))
    .map((v) => ({ id: String(v.id), label: String(v.label || v.id), tip: v.tooltip || '', disabled: v.enabled === false, reason: v.enabled === false ? v.reason || '' : '' }));
}
