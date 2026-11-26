/**
 * #515 (R18 part 2, R9): a drop acts on the stack that was dragged, not the first of its class.
 *
 * In Glitch the drag carried the itemstack itself: the pack set dragVO.dragged_itemstack to the
 * stack under the mouse (PackContainerView.as 329, DragVO.as 31) and every target sent that stack's
 * tsid: Decoration Mode set down that stack (HandOfDecorator.as 527 and 540,
 * startWithItemFromPack(dragged_itemstack.tsid) 1639-1653), a drop on a thing opened its verb with
 * it (LocationInputHandler.as 619, NetOutgoingItemstackVerbMenuVO(target, false, dragged tsid);
 * HandOfDecorator.as 1359), a cabinet moved it (CabinetDialog.as 434), a trade added it
 * (TradeDialog.as 1088, clientAddItem(dragged tsid, its count)), and the server asked which things
 * took it by its tsid (DragVO.as 56 and 100). Each itemstack kept its own state (a tool's wear, a
 * jar's Fireflies, a Cubimal's name), so the stack dragged was the one that went.
 *
 * Here the pack is one count per class, its stacks laid out in slots (js/pack-slots.js) and each
 * copy's state beside them in pack order (js/tools.js copies). The drag carries the slot (container,
 * index) and the copy's place (game.js packStackOf); a target that knew only the class took the
 * first stack in slot order and the last copy's state. A target now takes the dragged stack at drag
 * start (draggedStack) and, when the count goes down, says it is that one:
 *  - takeDragged: the removal is now (a box deposit, a set down, a pour): that slot gives the units
 *    (features/bags-feature.js packTakeFrom / packTakeUnit) and that copy's state goes with them
 *    (js/copy-picks.js takeCopies, found again by what it holds if the pack moved meanwhile).
 *  - markDragged: the removal comes later (a verb after a walk, a server's answer): the slot is
 *    marked for `wait` ms. Only for a class without copies; a class with copies goes through the
 *    receiver's own copy pick (Give, the Butler), since a slot emptied without its copy moving
 *    would leave the other slot showing the dragged one's state.
 * A stack that is gone (used up, moved away) marks nothing: the class's usual order decides.
 */
import { TOOL_CONDITION_CATALOG, copyTags, takeToolCopy, toolCopies } from './tools.js?v=4156bba8';
import { markLeaving, takeCopies } from './copy-picks.js?v=b368fd49';
import { unitRankAt } from './pack-slots.js?v=38e4aea5';
import { answerWaitMs } from './online-request.js?v=dac938db';

/** A removal made now waits for the pack's next look (a HUD tick), then lapses; one fully taken ends at once. */
export const DRAG_TAKE_SOON_MS = 5000;

const whole = (v, min = 0) => {
  const n = Number(v);
  return Number.isFinite(n) && Math.floor(n) === n && n >= min ? n : null;
};

function layoutOf(engine) {
  return engine?.query?.('packLayout', engine) || null;
}

function slotIn(layout, place) {
  const box = place?.container === 'pack' ? layout?.pack : layout?.bags?.[place?.container];
  const s = box?.slots?.[place?.index];
  return s?.kind === 'stack' ? s : null;
}

/**
 * At drag start: the dragged pack stack, enough to find it again at the drop.
 * Returns { cls, count, place: { cls, container, index } | null, pick: { copy, copies, r, t } | null }
 * or null for anything but a pack stack. `pick` is set for a class whose copies keep their own state.
 */
export function draggedStack(engine, stack) {
  if (!stack || stack.from !== 'pack' || !stack.cls) return null;
  const cls = String(stack.cls);
  const count = Math.max(1, Math.floor(Number(stack.count) || 1));
  const index = whole(stack.index);
  const place = stack.container != null && stack.container !== '' && index != null ? { cls, container: String(stack.container), index } : null;
  let pick = null;
  const state = engine?.toolState;
  if (TOOL_CONDITION_CATALOG[cls] && state) {
    let copy = whole(stack.copy);
    if (copy == null && place) {
      const r = unitRankAt(layoutOf(engine), cls, place.container, place.index);
      copy = r >= 0 ? r : null;
    }
    const copies = toolCopies(state, cls);
    if (copy != null && copy < copies.length) {
      const tags = TOOL_CONDITION_CATALOG[cls].tags ? copyTags(state, cls) : [];
      pick = { copy, copies: [copy], r: copies[copy].remaining, t: tags[copy] ?? null };
    }
  }
  return { cls, count, place, pick };
}

/** How many the dragged stack holds now at its place (0: it is gone or something else is there). */
export function draggedHere(engine, ds) {
  if (!ds?.place) return 0;
  const s = slotIn(layoutOf(engine), ds.place);
  return s?.cls === ds.cls ? Math.max(0, Math.floor(Number(s.count) || 0)) : 0;
}

/**
 * The count a drop of the dragged stack moves: the stack's own count, no more than it holds now
 * (Glitch moved the itemstack dragged, TradeDialog.as 1088, HandOfDecorator.as 1342), else, the
 * stack gone, the dragged count of the class as before.
 */
export function draggedCount(engine, ds) {
  if (!ds) return 0;
  const here = draggedHere(engine, ds);
  return here ? Math.min(ds.count, here) : ds.count;
}

/**
 * `n` of the dragged stack leave the pack now (call it just before the count goes down): its slot
 * gives them and its copy's own state goes with them. Returns 'copy', 'stack', or '' when the
 * stack is gone (the class's usual order decides).
 */
export function takeDragged(engine, ds, n = 1, { wait = DRAG_TAKE_SOON_MS } = {}) {
  if (!ds || !engine) return '';
  const k = Math.max(1, Math.floor(Number(n) || 1));
  const state = engine.toolState;
  if (TOOL_CONDITION_CATALOG[ds.cls] && state) {
    // The copy dragged, found again by its own state (js/copy-picks.js): its slot empties and its wear goes.
    if (ds.pick && markLeaving(engine, ds.cls, ds.pick, k, wait) > 0) {
      takeCopies(state, ds.cls, ds.pick, k);
      return 'copy';
    }
    // Its state changed meanwhile: the copy now at the dragged slot goes.
    if (draggedHere(engine, ds)) {
      const rank = unitRankAt(layoutOf(engine), ds.cls, ds.place.container, ds.place.index);
      if (rank >= 0 && engine.query?.('packTakeUnit', ds.cls, rank, k, engine, { wait })) {
        takeToolCopy(state, ds.cls, { copy: rank });
        return 'copy';
      }
    }
    return '';
  }
  if (!draggedHere(engine, ds)) return '';
  return engine.query?.('packTakeFrom', ds.cls, k, engine, { place: ds.place, wait }) ? 'stack' : '';
}

/**
 * The dragged stack gives the next `n` of its class that leave within `wait` ms (a verb run after
 * a walk into reach, a server's answer). The wait is the server's answer wait (R26:
 * js/online-request.js answerWaitMs of the realtime client, its fallback in solo); bags-feature caps
 * it at its own TAKE_WAIT_MS. A class with copies is not marked (false): its receiver names the
 * copy itself. Returns whether the slot was marked.
 */
export function markDragged(engine, ds, n = 1, { wait = null } = {}) {
  if (!ds || !engine || TOOL_CONDITION_CATALOG[ds.cls]) return false;
  if (wait == null) wait = answerWaitMs(engine.query?.('realtimeClient'));
  if (!draggedHere(engine, ds)) return false;
  return Boolean(engine.query?.('packTakeFrom', ds.cls, Math.max(1, Math.floor(Number(n) || 1)), engine, { place: ds.place, wait }));
}
