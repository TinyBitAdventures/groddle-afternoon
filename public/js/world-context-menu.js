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
 *   signpost's arm, which runs its verb, and Glitch's one-click items, G661: GLITCH_ONE_CLICK):
 *   the full menu instead. Glitch's Shift+click rule:
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

/**
 * G661: Glitch's one-click items. 24 item classes carried an `itemDef.oneclick_verb` (GSJS items/*.js,
 * e.g. magic_rock.js 1429, note_pole.js 479, wall_switch.js 190), and the client ran it on a click
 * instead of opening the verb menu: control/TSFrontController.as tryAOneClickActionOnALIS 3703-3760
 * (outside decorating, 3736; when the item has a oneclick_verb and you are there or it works from anywhere, 3737)
 * asked for the stack's verbs, then sent that verb if it was enabled (3745-3753: one that wants a
 * target item opened the menu at it, 3748), and otherwise opened the full menu (3755-3758,
 * StateModel.as 30 open_menu_when_one_click_is_disabled = true). LocationInputHandler.as 347 runs it for
 * a click; the keyboard's interaction went the same way (TSFrontController.as 3686). Ours: a click or a
 * tap acts (game.js pointerdown); Enter keeps opening the menu, the keyboard's one way to the other verbs
 * (Shift+F10 and the Menu key are Enter), as do a right-click and a long press.
 *
 * The ones the game has, by item class: the verb as our menu names it, and Glitch's verb id.
 * visitorsOnly: note_pole.js 494 hides read_oneclick from the owner at home (their menu has read and more).
 */
export const GLITCH_ONE_CLICK = Object.freeze({
  bag_furniture_cabinet: Object.freeze({ verb: 'cabinet_open', glitch: 'open' }),
  bag_furniture_smallcabinet: Object.freeze({ verb: 'cabinet_open', glitch: 'open' }),
  bag_furniture_wallcabinet: Object.freeze({ verb: 'cabinet_open', glitch: 'open' }),
  esquibeth_button: Object.freeze({ verb: 'press', glitch: 'press' }),
  letter_block: Object.freeze({ verb: 'spin', glitch: 'spin' }),
  magic_rock: Object.freeze({ verb: 'talk_to', glitch: 'talk_to' }),
  note_pole: Object.freeze({ verb: 'pole_read', glitch: 'read_oneclick', visitorsOnly: true }),
  npc_spinning_wheel: Object.freeze({ verb: 'spin', glitch: 'spin' }),
  pile_of_currants: Object.freeze({ verb: 'pile_collect', glitch: 'collect' }),
  wall_button: Object.freeze({ verb: 'press', glitch: 'press' }),
  wall_switch: Object.freeze({ verb: 'press', glitch: 'press' }),
});

/**
 * G661: the other 13 of the 24, and why none is in GLITCH_ONE_CLICK. newxp_chain already pulls on a
 * click (its own hit area, features/newxp-feature.js), so it never had a menu to skip.
 */
export const GLITCH_ONE_CLICK_ABSENT = Object.freeze({
  bag_sdb: 'not in the game',
  clickable_broadcaster: 'not in the game (Operation Grow\'s bog patches were designed in its place)',
  esquibeth_note_1: 'not a thing in the game (the notes are set into the glyph, quest-rooms/esquibeth.js)',
  esquibeth_note_2: 'not a thing in the game',
  esquibeth_note_3: 'not a thing in the game',
  esquibeth_note_4: 'not a thing in the game',
  esquibeth_note_5: 'not a thing in the game',
  gol_sign: 'not in the game',
  home_sign: 'not in the game (the Magic Rock replaced it, features/homes-feature.js 1252)',
  mountain_lantern: 'not in the game',
  newxp_chain: 'already pulls on a click (features/newxp-feature.js)',
  newxp_door: 'not in the game',
  switch_simple: 'not in the game',
});

/**
 * Things whose classId is not the item's own, and the item each is: the home street's pole and pile
 * (features/home-street-mp-feature.js), the Greedy Street story button (game.js, "a wall_button item"),
 * the Clubhouse's ENTER button (quest-rooms/clubhouse.js, items/wall_button.js). Home storage says its
 * item in state.itemClass (a cabinet's, never a Storage Display Box's: those lost their one-click verb,
 * TSFrontController.as 3760).
 */
export const ONE_CLICK_ITEM_OF = Object.freeze({
  mp_note_pole: 'note_pole',
  mp_currant_pile: 'pile_of_currants',
  greedy_story_button: 'wall_button',
  clubhouse_wall_button: 'wall_button',
});

/** PURE: the Glitch item a thing is, for the one-click list. */
export function oneClickItem(thing) {
  const cls = String(thing?.classId || '');
  return String(thing?.state?.itemClass || ONE_CLICK_ITEM_OF[cls] || cls);
}

/** PURE: the verb a left click on `thing` runs at once, or '' (the menu opens). */
export function oneClickVerbId(thing) {
  if (!thing) return '';
  const cls = String(thing.classId || '');
  if (Object.prototype.hasOwnProperty.call(ONE_CLICK_VERBS, cls)) return ONE_CLICK_VERBS[cls];
  const item = oneClickItem(thing);
  return Object.prototype.hasOwnProperty.call(GLITCH_ONE_CLICK, item) ? GLITCH_ONE_CLICK[item].verb : '';
}

/** PURE: does a left click on `thing` act at once (no menu)? */
export function isOneClick(thing) {
  return Boolean(oneClickVerbId(thing));
}

/**
 * PURE (G661): what a left click on a Glitch one-click thing does, given the menu's verbs for it now:
 * { kind: 'run', verb } when its verb is there and enabled (and needs no pick from the pack: a verb
 * that asks for one opens the menu, as the client opened it at the target item); else { kind: 'menu' }
 * (open_menu_when_one_click_is_disabled); null for a thing that is not one (the menu as ever).
 * `verbs`: the list, or a function that gives it (asked only for a thing on the list).
 */
export function oneClickChoice(thing, verbs = []) {
  const item = oneClickItem(thing);
  const entry = Object.prototype.hasOwnProperty.call(GLITCH_ONE_CLICK, item) ? GLITCH_ONE_CLICK[item] : null;
  if (!entry) return null;
  if (entry.visitorsOnly && thing?.state?.owner) return { kind: 'menu' };
  const list = typeof verbs === 'function' ? verbs() : verbs;
  const verb = (list || []).find((v) => v?.id === entry.verb);
  if (!verb || verb.enabled === false || verb.picker || verb.id === 'feed') return { kind: 'menu' };
  return { kind: 'run', verb };
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
