/**
 * RIGHTCLICK (Austin 2026-11-03, right-click audit item 1; decision 1: a right-click on the world
 * may open the verb menu, because a menu is not an act): what a right-click on the world does.
 * game.js runs the answer (openVerbMenu, the signpost's arms menu).
 *
 * - A thing in the world (a tree, an animal, an NPC, a shrine, an item on the ground, another
 *   player): the same verb menu a left click opens, anchored to the thing with its tail, under
 *   the same guards (a menu already open, the Map, a screen effect, Camera Mode, Decorate and
 *   Cultivate) and the same reach rule (behind a floor: the client's line, never a walk).
 * - A one-click thing, where a left click acts at once (the mailbox's Check Mail, a scene
 *   signpost's arm, which runs its verb): the full menu instead. Glitch's Shift+click rule:
 *   control/TSFrontController.as tryAOneClickActionOnALIS 3703-3790 ran an item's oneclick_verb
 *   on a click and opened the menu on Shift+click.
 * - An arm of an ordinary signpost, where a left click travels: the post's arms as a menu (the
 *   client's location chooser for a post of several arms, view/geo/SignpostView.as 382-418), the
 *   arm clicked focused; picking one travels as a click on it would.
 * - Nothing there (the sky, the ground): nothing opens (the browser's menu is stopped,
 *   js/ui/context-guard.js).
 *
 * A right-click never walks, never runs a verb and never cancels the one running (with a verb
 * running nothing opens, as for a left click: openVerbMenu returns). The press that closed a menu
 * does nothing else (game.js verbMenuClosedByPointerAt). Player report 23's rule stands for acting:
 * only the main button acts on the world.
 */

/** One-click things: a left click runs this verb at once; a right-click opens their full menu. */
export const ONE_CLICK_VERBS = Object.freeze({ npc_mailbox: 'view_inbox' });

/** PURE: does a left click on `thing` act at once (no menu)? */
export function isOneClick(thing) {
  return Boolean(thing && Object.prototype.hasOwnProperty.call(ONE_CLICK_VERBS, String(thing.classId || '')));
}

/**
 * PURE: what a right-click on the world does.
 * @param {{ blocked?: string, board?: { scene?: boolean }|null, thing?: object|null, outOfReach?: boolean }} o
 *   blocked: why nothing may open now ('' when it may: game.js checks the guards);
 *   board: the signpost arm under the pointer; thing: the thing under it (pickInteractableAt);
 *   outOfReach: the thing is behind a floor and no walk-over reaches it.
 * @returns {{ kind: 'none'|'arms'|'scene-arm'|'menu'|'out-of-reach', why?: string }}
 */
export function worldContextAction({ blocked = '', board = null, thing = null, outOfReach = false } = {}) {
  if (blocked) return { kind: 'none', why: blocked };
  if (board) return { kind: board.scene ? 'scene-arm' : 'arms' };
  if (!thing) return { kind: 'none', why: 'nothing' };
  if (outOfReach && !/^pc_/.test(String(thing.classId || ''))) return { kind: 'out-of-reach' };
  return { kind: 'menu' };
}

/**
 * PURE: a post's arms as menu rows, top first (their numbers): each row takes its road.
 * `boards`: [{ board }]; `inGame(board)`: the road leads to a street in the game; `label(board)`.
 * `notInGame`: the reason a road that leads nowhere in the game shows.
 * @returns {{ id: string, label: string, tip: string, disabled: boolean, reason: string }[]}
 */
export function signpostArmRows(boards, { inGame = () => true, label = (b) => b?.label?.text || '', notInGame = '' } = {}) {
  const ordered = [...(boards || [])].sort((a, b) => (Number(a.board?.key) || 99) - (Number(b.board?.key) || 99) || (a.board?.index || 0) - (b.board?.index || 0));
  return ordered.map(({ board }, i) => {
    const ok = inGame(board);
    const name = label(board) || 'This road';
    return { id: String(i), label: name, tip: `Take this road to ${name}`, disabled: !ok, reason: ok ? '' : notInGame, board };
  });
}
