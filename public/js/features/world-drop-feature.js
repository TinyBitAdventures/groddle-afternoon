/**
 * Dragging a pack item onto a thing in the world (register G588 left; rules in js/world-drop.js).
 * The original's verbs could be drop targets (is_drop_target, drop_ok_code, drop_tip in GSJS
 * items/*.js): while a stack hovers a thing that takes it, the client shows the verb's drop tip
 * and lights the thing; letting go runs that verb with the stack (the tutorial Dustbunny's
 * give_egg, npc_newxp_dustbunny.js 177-195: "Drag an EGG onto the Dustbunny"). Here a drop runs
 * the thing's own verb through the menu's path (engine.requestVerb), so the avatar walks into
 * reach first and the verb keeps its timing, costs and refusals; Feed opens its picker with the
 * dragged food chosen, and a shrine opens its donation window with it.
 *
 * Like features/garden-guano-feature.js (Guano on a garden plot, which stays there) this is a target
 * of the drop registry (js/drop-targets.js, R9), asked after the pack bar, a player (features/gifts-feature.js,
 * which wins over a player) and a plot, by the mouse and the touch lift alike. A thing that
 * has a rule for the stack but whose verb is unavailable shows the verb's reason in red and
 * refuses the drop. Both skins: the pack slots and the canvas are the same in Modern and Classic.
 *
 * QA: canvas data worldDrag (none | dragging:<class> | over:<target class>:<verb>:ok|no),
 * worldDropLast (ran|refused:<target class>:<verb>); window.groddleWorldDrop: over(x, y, cls)
 * (what a stack would do at a client point) and drop(x, y, cls) (the same drop a mouse does).
 */

import { ITEM_CATALOG } from '../inventory.js?v=3be7988a';
import { exposeQA } from '../qa-gate.js?v=f4e2cd82';
import { listAnimalFeedOptions } from '../animals.js?v=c2966739';
import { isBagClass } from '../pack-slots.js?v=38e4aea5';
import { dropFor, dropTip } from '../world-drop.js?v=a8956ae5';
import { canUseTool } from '../tools.js?v=4156bba8';
import { chooseTool } from '../tool-choice.js?v=e0dcb60e';
import { registerDropTarget } from '../drop-targets.js?v=3ae8ae5c';
import { draggedStack, markDragged } from '../drag-stack.js?v=9a24e5c4';

export const WORLD_DROP_FEATURE_ID = 'world-drop';

let wired = false;
/** LocationInputHandler.as 690: the tip over the street itself. */
export const WORLD_DROP_FEET = 'Drop at your feet';
let dragging = null; // { cls, copy, ds } (ds: the dragged stack, js/drag-stack.js)
let tip = null;
let lit = null;

function showTip(text, no, x, y) {
  if (typeof document === 'undefined') return;
  if (!tip) {
    tip = document.createElement('div');
    tip.className = 'world-drop-tip';
    tip.setAttribute('role', 'status');
    document.body.appendChild(tip);
  }
  tip.hidden = !text;
  if (!text) return;
  tip.textContent = text;
  tip.classList.toggle('is-no', Boolean(no));
  tip.style.left = `${x}px`;
  tip.style.top = `${y}px`;
  // By the window's right edge the tip goes to the pointer's left (the Dustbunny stands at the edge).
  const room = (globalThis.innerWidth || 0) - x - 24;
  tip.classList.toggle('is-left', room > 0 && tip.offsetWidth > room);
}

/** G972: the Butler's drop target (js/butler-drop.js) shows its tip in the same place. */
export { showTip as showWorldDropTip };

/** The world point under a client point (the canvas's view scaled to the entity layer). */
export function worldPoint(engine, canvas, clientX, clientY) {
  const rect = canvas?.getBoundingClientRect?.();
  if (!rect?.width || !engine.entityLayer || !engine.PIXI) return null;
  const k = (engine.camera?.w || 960) / rect.width;
  return engine.entityLayer.toLocal(new engine.PIXI.Point((clientX - rect.left) * k, (clientY - rect.top) * k));
}

function ctxFor(engine, target, copy = null) {
  const inv = engine.inv || {};
  return {
    // drop_ok_code's stack.isWorking(): the dragged unit itself (its place in pack order).
    working: (cls) => !engine.toolState || canUseTool(engine.toolState, cls, 1, Number.isInteger(copy) ? { copy } : {}).ok,
    feedable: (cls) => listAnimalFeedOptions(target?.classId, inv).some((o) => o.classTsid === cls),
    isBag: (cls) => isBagClass(cls) || /^bag_/.test(cls),
    hasTag: (cls, tag) => (ITEM_CATALOG[cls]?.tags || []).includes(tag),
    // #285: a Still on the ground takes what its hopper has room for (features/supply-feature.js).
    distillable: (cls) => engine.query?.('stillTakes', target, cls, engine) === true,
    // G982: a dish or a crop the Harvest Table takes (features/pot-luck-feast-feature.js).
    feastTakes: (cls) => engine.query?.('feastTakes', target, cls, engine) === true,
  };
}

/** The class a drop rule tests: a stack lying on the ground goes by `ground:<its class>`. */
function dropClassOf(target) {
  return target?.classId === 'dropped_item' ? `ground:${target.state?.classTsid || ''}` : target?.classId;
}

/** What the dragged class does at a client point: { target, drop, tip, ok } or null. */
export function overAt(engine, canvas, clientX, clientY, cls, copy = null) {
  if (engine.query?.('homeEditMode', engine)) return null;
  // A player under the pointer is the gift's (features/gifts-feature.js).
  if (globalThis.groddleGifts?.playerAt?.(clientX, clientY)) return null;
  const p = worldPoint(engine, canvas, clientX, clientY);
  if (!p) return null;
  // G982: a feature's own drop target under the point wins over whatever stands in front of it (the
  // Harvest Table over a street Piggy), as DragVO.as findDragTargetForStack asks the thing that takes the stack.
  const target = engine.query?.('dropTargetAt', p.x, p.y, cls, engine) || engine.interactableAt?.(p.x, p.y);
  if (!target || target.classId === 'garden_plot') return null;
  const verbs = engine.targetVerbs?.(target) || [];
  const drop = dropFor(dropClassOf(target), cls, verbs, ctxFor(engine, target, copy));
  if (!drop) return null;
  const def = ITEM_CATALOG[cls] || {};
  const ok = drop.verb.enabled !== false;
  const words = dropTip(drop.rule.tip, {
    count: Math.max(1, Number(engine.inv?.[cls]) || 1),
    stackName: def.label || cls,
    stackPlural: def.namePlural || '',
    itemName: target.label || ITEM_CATALOG[target.classId]?.label || '',
  });
  return { target, drop, ok, tip: ok ? words : drop.verb.reason || words };
}

function light(engine, target) {
  if (lit === target) return;
  lit = target || null;
  engine.setHoverTarget?.(lit);
}

function endDrag(engine) {
  dragging = null;
  showTip('');
  light(engine, null);
  engine.setData?.('worldDrag', 'none');
}

/**
 * Run a drop: the target's own verb, through the menu's walk into reach. `ds` (js/drag-stack.js):
 * the stack dragged, which gives what the verb uses (#515; LocationInputHandler.as 619 opened the
 * verb with the dragged itemstack's tsid), a tool its own copy (chooseTool), a shrine its own tool.
 */
export function runDrop(engine, over, cls, copy = null, ds = null) {
  const { target, drop, ok } = over;
  const verb = drop.verb;
  engine.setData?.('worldDropLast', `${ok ? 'ran' : 'refused'}:${target.classId}:${verb.id}`);
  if (!ok) {
    engine.playSound?.('CLICK_FAILURE', { volume: 0.4 });
    if (verb.reason) engine.toast?.(verb.reason, 2400);
    return false;
  }
  engine.closeVerbMenu?.();
  // A tool dragged onto a rock or a node is the one that works it (js/tool-choice.js); it stays in the pack.
  if (drop.rule.tool) chooseTool(target, cls, { copy });
  // What the verb uses up comes off the dragged stack when it does (a class with copies: its own pick).
  else markDragged(engine, ds, ds?.count || 1);
  if (drop.rule.use === 'pick') return engine.requestVerb?.(target, verb, { run: () => engine.openPicker?.(target, verb, cls) });
  if (drop.rule.use === 'donate') return engine.requestVerb?.(target, verb, { run: () => engine.openShrineDonate?.(target, cls, { copy: ds?.pick ? ds.pick.copy : null }) });
  return engine.requestVerb?.(target, verb);
}

function wire(engine) {
  if (wired || typeof document === 'undefined') return;
  const canvas = document.querySelector('#game-root > canvas');
  if (!canvas) return;
  wired = true;
  // R9 (G967): a thing on the street is a target of the drop registry (js/drop-targets.js), for the
  // mouse and the touch lift alike; it asks last (DragVO.as 157-196: the location's itemstacks after
  // players and plots). A tool's slot drags too; a bag does not.
  registerDropTarget({
    id: 'world',
    order: 60,
    scope: () => canvas,
    start(d) {
      const st = d.stack;
      dragging = st.from === 'pack' && st.cls && !st.bag ? { cls: st.cls, copy: Number.isInteger(st.copy) ? st.copy : null, ds: draggedStack(engine, st) } : null;
      if (dragging) engine.setData?.('worldDrag', `dragging:${dragging.cls}`);
    },
    over(d, at) {
      if (!dragging) return null;
      const over = overAt(engine, canvas, at.x, at.y, dragging.cls, dragging.copy);
      if (!over) {
        engine.setData?.('worldDrag', `dragging:${dragging.cls}`);
        showTip('');
        light(engine, null);
        return null;
      }
      engine.setData?.('worldDrag', `over:${over.target.classId}:${over.drop.verb.id}:${over.ok ? 'ok' : 'no'}`);
      showTip(over.tip, !over.ok, at.x, at.y);
      light(engine, over.target);
      return { ok: over.ok };
    },
    leave() {
      if (!dragging) return;
      showTip('');
      light(engine, null);
    },
    drop(d, at) {
      if (!dragging) return;
      const { cls, copy, ds } = dragging;
      const over = overAt(engine, canvas, at.x, at.y, cls, copy);
      endDrag(engine);
      if (over) runDrop(engine, over, cls, copy, ds);
    },
    end() { if (dragging) endDrag(engine); },
  });
  // G1192: a pack stack let go on the street where no thing takes it is dropped at your feet, as the
  // original's was (LocationInputHandler.as _packDragMoveHandler 686-690: the location itself is the
  // target when the stack is dropable, tip "Drop at your feet"; _packDragCompleteHandler 761-776 opens the
  // drop verb on the dragged stack, so one goes at once and more ask how many). Asked after every thing.
  let feet = null;
  registerDropTarget({
    id: 'street',
    order: 65,
    scope: () => canvas,
    start(d) {
      const st = d.stack;
      feet = st.from === 'pack' && st.cls && typeof engine.dropDraggedAtFeet === 'function' ? { ...st } : null;
    },
    over(d, at) {
      if (!feet) return null;
      const why = engine.packDropBlocked?.(feet.cls) || '';
      engine.setData?.('worldDrag', `feet:${feet.cls}:${why ? 'no' : 'ok'}`);
      showTip(why || WORLD_DROP_FEET, Boolean(why), at.x, at.y);
      return { ok: !why };
    },
    leave() {
      if (feet) showTip('');
    },
    drop(d, at, res) {
      const st = feet;
      feet = null;
      showTip('');
      if (!st || res?.ok === false) return;
      engine.setData?.('worldDropLast', `feet:${st.cls}`);
      engine.dropDraggedAtFeet(st);
    },
    end() {
      if (!feet) return;
      feet = null;
      showTip('');
    },
  });
  // G738: a QA lever (js/qa-gate.js): solo, or online on a local host only.
  exposeQA('groddleWorldDrop', {
    over(x, y, cls, copy = null) {
      const o = overAt(engine, canvas, x, y, cls, copy);
      return o ? { target: o.target.classId, verb: o.drop.verb.id, rule: o.drop.rule.id, ok: o.ok, tip: o.tip } : null;
    },
    drop(x, y, cls, copy = null) {
      const o = overAt(engine, canvas, x, y, cls, copy);
      if (!o) return false;
      runDrop(engine, o, cls, copy);
      return true;
    },
    /** A target's centre in client px, by class: the one on screen nearest the window's middle. */
    point(classId) {
      const rect = canvas.getBoundingClientRect();
      if (!rect.width) return null;
      const k = rect.width / (engine.camera?.w || 960);
      let best = null;
      for (const t of engine.interactables || []) {
        if (t.classId !== classId || !t.sprite || t.sprite.destroyed) continue;
        const h = Math.abs(t.sprite.height || 40);
        const g = engine.entityLayer.toGlobal(new engine.PIXI.Point(t.sprite.x, t.sprite.y - h / 2));
        const p = { x: rect.left + g.x * k, y: rect.top + g.y * k };
        if (p.x < rect.left + 20 || p.x > rect.right - 20 || p.y < rect.top + 60 || p.y > rect.bottom - 120) continue;
        const d = Math.abs(p.x - (rect.left + rect.right) / 2);
        if (!best || d < best.d) best = { ...p, d };
      }
      return best ? { x: best.x, y: best.y } : null;
    },
  });
}

export const worldDropFeature = {
  id: WORLD_DROP_FEATURE_ID,
  onStreetEnter(street, engine) {
    wire(engine);
  },
  onStreetClear(engine) {
    if (dragging) endDrag(engine);
    lit = null;
  },
};
