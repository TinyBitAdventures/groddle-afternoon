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
 * Like features/garden-guano-feature.js (Guano on a garden plot, which stays there) this only
 * listens to the pack's HTML drag: it never answers packDragStart, so a move into a bag and a gift
 * to a player (features/gifts-feature.js, which wins over a player) keep working. A thing that
 * has a rule for the stack but whose verb is unavailable shows the verb's reason in red and
 * refuses the drop. Both skins: the pack slots and the canvas are the same in Modern and Classic.
 *
 * QA: canvas data worldDrag (none | dragging:<class> | over:<target class>:<verb>:ok|no),
 * worldDropLast (ran|refused:<target class>:<verb>); window.groddleWorldDrop: over(x, y, cls)
 * (what a stack would do at a client point) and drop(x, y, cls) (the same drop a mouse does).
 */

import { ITEM_CATALOG } from '../inventory.js?v=60dfc9ca';
import { listAnimalFeedOptions } from '../animals.js?v=7e27e9d2';
import { isBagClass } from '../pack-slots.js?v=6b8393a1';
import { dropFor, dropTip } from '../world-drop.js?v=f162fb0e';

export const WORLD_DROP_FEATURE_ID = 'world-drop';

let wired = false;
let dragging = null; // { cls }
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

/** The world point under a client point (the canvas's view scaled to the entity layer). */
function worldPoint(engine, canvas, clientX, clientY) {
  const rect = canvas?.getBoundingClientRect?.();
  if (!rect?.width || !engine.entityLayer || !engine.PIXI) return null;
  const k = (engine.camera?.w || 960) / rect.width;
  return engine.entityLayer.toLocal(new engine.PIXI.Point((clientX - rect.left) * k, (clientY - rect.top) * k));
}

function ctxFor(engine, target) {
  const inv = engine.inv || {};
  return {
    feedable: (cls) => listAnimalFeedOptions(target?.classId, inv).some((o) => o.classTsid === cls),
    isBag: (cls) => isBagClass(cls) || /^bag_/.test(cls),
    hasTag: (cls, tag) => (ITEM_CATALOG[cls]?.tags || []).includes(tag),
  };
}

/** What the dragged class does at a client point: { target, drop, tip, ok } or null. */
export function overAt(engine, canvas, clientX, clientY, cls) {
  if (engine.query?.('homeEditMode', engine)) return null;
  // A player under the pointer is the gift's (features/gifts-feature.js).
  if (globalThis.groddleGifts?.playerAt?.(clientX, clientY)) return null;
  const p = worldPoint(engine, canvas, clientX, clientY);
  if (!p) return null;
  const target = engine.interactableAt?.(p.x, p.y);
  if (!target || target.classId === 'garden_plot') return null;
  const verbs = engine.targetVerbs?.(target) || [];
  const drop = dropFor(target.classId, cls, verbs, ctxFor(engine, target));
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

/** Run a drop: the target's own verb, through the menu's walk into reach. */
export function runDrop(engine, over, cls) {
  const { target, drop, ok } = over;
  const verb = drop.verb;
  engine.setData?.('worldDropLast', `${ok ? 'ran' : 'refused'}:${target.classId}:${verb.id}`);
  if (!ok) {
    engine.playSound?.('CLICK_FAILURE', { volume: 0.4 });
    if (verb.reason) engine.toast?.(verb.reason, 2400);
    return false;
  }
  engine.closeVerbMenu?.();
  if (drop.rule.use === 'pick') return engine.requestVerb?.(target, verb, { run: () => engine.openPicker?.(target, verb, cls) });
  if (drop.rule.use === 'donate') return engine.requestVerb?.(target, verb, { run: () => engine.openShrineDonate?.(target, cls) });
  return engine.requestVerb?.(target, verb);
}

function wire(engine) {
  if (wired || typeof document === 'undefined') return;
  const canvas = document.querySelector('#game-root > canvas');
  if (!canvas) return;
  wired = true;
  // After the pack slot's own dragstart: a drag it cancelled is no drag. A tool's slot drags too.
  document.addEventListener('dragstart', (event) => {
    const slot = event.target?.closest?.('.pack-slot');
    const cls = slot?.dataset?.tsid || '';
    dragging = !event.defaultPrevented && cls && !slot.dataset.packBag ? { cls } : null;
    if (dragging) engine.setData?.('worldDrag', `dragging:${cls}`);
  });
  document.addEventListener('dragend', () => { if (dragging) endDrag(engine); });
  canvas.addEventListener('dragover', (event) => {
    if (!dragging) return;
    const over = overAt(engine, canvas, event.clientX, event.clientY, dragging.cls);
    if (!over) {
      engine.setData?.('worldDrag', `dragging:${dragging.cls}`);
      showTip('');
      light(engine, null);
      return;
    }
    engine.setData?.('worldDrag', `over:${over.target.classId}:${over.drop.verb.id}:${over.ok ? 'ok' : 'no'}`);
    showTip(over.tip, !over.ok, event.clientX, event.clientY);
    light(engine, over.target);
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = over.ok ? 'move' : 'none';
  });
  canvas.addEventListener('dragleave', () => {
    if (!dragging) return;
    showTip('');
    light(engine, null);
  });
  canvas.addEventListener('drop', (event) => {
    if (!dragging) return;
    const cls = dragging.cls;
    const over = overAt(engine, canvas, event.clientX, event.clientY, cls);
    endDrag(engine);
    if (!over) return;
    event.preventDefault();
    runDrop(engine, over, cls);
  });
  globalThis.groddleWorldDrop = {
    over(x, y, cls) {
      const o = overAt(engine, canvas, x, y, cls);
      return o ? { target: o.target.classId, verb: o.drop.verb.id, rule: o.drop.rule.id, ok: o.ok, tip: o.tip } : null;
    },
    drop(x, y, cls) {
      const o = overAt(engine, canvas, x, y, cls);
      if (!o) return false;
      runDrop(engine, o, cls);
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
  };
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
