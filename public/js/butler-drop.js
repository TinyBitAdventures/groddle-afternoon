/**
 * G972: a pack stack dragged onto another player's Butler leaves it as a package, as in Glitch.
 *
 * The Butler's leave_package verb was a drop target (items/bag_butler.js 991-1020: is_drop_target,
 * drop_tip "Leave a package with the Butler", drop_ok_code). The server listed the things a dragged
 * stack could go to (main.js 5452-5500): a verb whose drop_ok_code said no, or whose conditions
 * answered state null (leave_package for the Butler's own owner), was no target at all; one whose
 * conditions were disabled (the Butler full, or talking to somebody else) was a target that showed
 * its reason in red. Letting go opened the verb with the stack (LocationInputHandler.as 600-631,
 * startItemstackMenuWithVerbAndTargetItem): the count chooser for a stack (requires_target_item_count,
 * limited to the class's stackmax, main.js 5420-5425), then the Butler's "Do you want to give..."
 * conversation and the message (bag_butler.js 1068-1114).
 *
 * Here the Butler is a target of the drop registry (js/drop-targets.js, R9 G967), for the mouse and
 * the touch lift alike, asked after a player and a garden's plots and before the street's other
 * things (DragVO.as findDragTargetForStack 122-198: the Butler is one of the location's itemstacks).
 * The visited home's feature (features/neighbours-mp-feature.js) says which Butler stands under a
 * point and opens the same leave-a-package flow the Butler's menu has.
 *
 * QA: <html data-drop-over / data-drop-last> (butler:ok|no), canvas data butlerDrag
 * (none | over:ok | over:no), butlerDropLast (left:<class>:<count> | refused).
 */

import { ITEM_CATALOG } from './inventory.js?v=3be7988a';
import { registerDropTarget } from './drop-targets.js?v=59e6edb4';
import { draggedStack } from './drag-stack.js?v=e0138d76';
import { showWorldDropTip } from './features/world-drop-feature.js?v=fa38c659';
import { VISITOR_BUTLER_TEXT } from './neighbours-mp.js?v=83f2fdf4';

/** leave_package's drop_tip (bag_butler.js 1003). */
export const BUTLER_DROP_TIP = 'Leave a package with the Butler';
/** give's drop_tip, the owner's own Butler (bag_butler.js 632). */
export const BUTLER_GIVE_TIP = 'Ask the Butler to give this to visitors';

const GIFT_WRAPPED = 'bag_gift_box_wrapped';

/**
 * leave_package's drop_ok_code and valid_items (bag_butler.js 1004-1020, 1046-1066): not a trophy,
 * furniture, a bag, or no_trade (a wrapped Gift Box goes, bag_butler.js 1013); ours also keeps quest
 * items and what cannot be dropped (takeable_drop_conditions).
 */
export function butlerCarries(cls) {
  if (!cls) return false;
  if (cls === GIFT_WRAPPED) return true;
  const tags = ITEM_CATALOG[cls]?.tags || [];
  if (tags.includes('no_trade') || tags.includes('quest-item') || tags.includes('no_drop')) return false;
  return !/^(bag_|furniture_|trophy_)/.test(cls);
}

/**
 * PURE: what the Butler under a dragged stack does with it. `butler` is null (none there) or
 * { mine, busy, full }; `takes(cls)` is whether the pack holds that class for a package.
 * Returns null (not a target) or { ok, tip }.
 */
export function butlerDropAnswer(stack, butler, takes = butlerCarries) {
  if (!butler) return null;
  // leave_package: state null for the owner (bag_butler.js 1024, 1046); the owner's drop is give
  // (bag_butler.js 608-660: is_drop_target, drop_tip, conditions enabled for the owner only), asked
  // only where the owner's own Butler says `give: true`.
  if (butler.mine && !butler.give) return null;
  if (!butler.mine && butler.give) return null;
  if (!stack || stack.from !== 'pack' || !stack.cls || stack.bag) return null;
  if (!takes(stack.cls)) return null; // drop_ok_code false: not a target
  if (butler.busy) return { ok: false, tip: VISITOR_BUTLER_TEXT.interactFail };
  if (butler.mine) return { ok: true, tip: BUTLER_GIVE_TIP };
  if (butler.full) return { ok: false, tip: String(butler.full) };
  return { ok: true, tip: BUTLER_DROP_TIP };
}

/**
 * Registers the Butler as a drop target. `butlerAt(x, y)` -> null | { target, mine, busy, full } at a
 * client point; `takes(cls)`; `leave({ cls, count, copy, ds })` opens the leave-a-package flow (ds: the
 * dragged stack, js/drag-stack.js).
 * Returns the unregister.
 */
export function registerButlerDrop({ engine, scope, butlerAt, takes = butlerCarries, leave }) {
  return registerDropTarget({ id: 'butler', order: 55, ...butlerTarget({ engine, scope, butlerAt, takes, leave }) });
}

/**
 * The owner's own Butler (bag_butler.js give, 608-660): a stack dropped on it opens the "give"
 * flow that leaves a gift for visitors, with that stack chosen. `butlerAt` answers
 * { target, mine: true, give: true, busy } over the Butler; `give({ cls, count })` opens the flow.
 */
export function registerOwnButlerDrop({ engine, scope, butlerAt, takes = butlerCarries, give }) {
  return registerDropTarget({ id: 'butler-own', order: 56, ...butlerTarget({ engine, scope, butlerAt, takes, leave: give }) });
}

function butlerTarget({ engine, scope, butlerAt, takes, leave }) {
  let lit = null;
  const light = (t) => {
    if (lit === t) return;
    lit = t || null;
    engine?.setHoverTarget?.(lit);
  };
  const clear = () => {
    showWorldDropTip('');
    light(null);
  };
  const answer = (d, at) => {
    const b = butlerAt(at.x, at.y);
    const res = butlerDropAnswer(d.stack, b, takes);
    return res ? { b, res } : null;
  };
  return {
    scope,
    over(d, at) {
      const hit = answer(d, at);
      if (!hit) {
        if (lit) clear();
        engine?.setData?.('butlerDrag', 'none');
        return null;
      }
      engine?.setData?.('butlerDrag', `over:${hit.res.ok ? 'ok' : 'no'}`);
      showWorldDropTip(hit.res.tip, !hit.res.ok, at.x, at.y);
      light(hit.b.target || null);
      return { ok: hit.res.ok };
    },
    leave: clear,
    drop(d, at) {
      const hit = answer(d, at);
      clear();
      engine?.setData?.('butlerDrag', 'none');
      if (!hit) return;
      if (!hit.res.ok) {
        engine?.setData?.('butlerDropLast', 'refused');
        engine?.playSound?.('CLICK_FAILURE', { volume: 0.4 });
        engine?.toast?.(hit.res.tip, 2400);
        return;
      }
      // Report #168: the Butler's window opens over the tray the stack came from, so the tray closes.
      engine?.closePackTray?.();
      const { cls, count, copy } = d.stack;
      engine?.setData?.('butlerDropLast', `left:${cls}:${count}`);
      // #515: `ds` is the stack dragged (js/drag-stack.js): it is the one that leaves, not the first of
      // its class (LocationInputHandler.as 619 opened the verb with the dragged itemstack's tsid).
      leave({ cls, count: Math.max(1, Math.floor(Number(count) || 1)), copy: Number.isInteger(copy) ? copy : null, ds: draggedStack(engine, d.stack) });
    },
    end() {
      if (lit) clear();
      engine?.setData?.('butlerDrag', 'none');
    },
  };
}
