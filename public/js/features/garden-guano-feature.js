/**
 * Dragging Guano from the pack onto a garden plot (register G403). The plot's own verb is in
 * content.js (fertilize, the menu's way, as GardenView.as onPlotClick 521-528 fertilizes on a
 * click); the rules are js/garden.js fertilizeCheck and fertilizePlot. A drag asks the plot under
 * the cursor for its tip (GardenPlotView.as 152-168) and a drop runs that same verb through the
 * menu's path, so the avatar walks into reach and it takes its 2 seconds
 * (GardenPlotView.as handleDrop 217-222, GardenView.as onPlotDrop). A drop on a plot that can't
 * take it does nothing, as handleDrop's null action does.
 *
 * The drag belongs to whoever else wants it (a gift to a player, a move into a bag), so this only
 * listens: it never answers packDragStart. On a visit the plot's verbs come from the neighbours
 * feature: a key-holder's copy offers fertilize (the site keeps the act as 'guano', src/HomeTending.php), and
 * without a key the plot has none, so Guano can't go on it.
 *
 * #197: a seed dragged onto a plot plants that seed (GardenPlotView.as dragOver 166-176, handleDrop
 * 211-215): a seed of the bed's kind (herb seeds on an herb bed) on a clean plot runs the plot's
 * Plant with it (plant:<seed>, content.js), the menu's way; any other plot or seed shows the
 * original's tip in red and the drop does nothing.
 *
 * QA: canvas data guanoDrag (none | dragging | over:<plot>:ok | over:<plot>:no), guanoDropLast;
 * for a seed seedDrag (none | dragging:<seed> | over:<plot>:ok|no) and seedDropLast.
 * &guanodemo=1 (=herb for an herb bed) puts Guano in the pack and a bed by the avatar;
 * window.groddleGuano reads and sets its plots (plot, set, bed).
 */

import { FERTILIZE_TEXT, GARDEN_FERTILIZER, SEED_CATALOG, fertilizeCheck, seedDropCheck } from '../garden.js?v=489cda8f';
import { nearestPlotIndex } from '../garden-view.js?v=04fe8467';

export const GARDEN_GUANO_FEATURE_ID = 'garden-guano';
const VERB = 'fertilize';

/** The world box of a plot target (spawnGarden: bottom centre of the plot, _gardenHitW by _gardenHitH). */
export function plotHit(target, x, y) {
  const s = target?.sprite;
  if (!s || s.destroyed || !s._gardenHitW) return false;
  return x >= s.x - s._gardenHitW / 2 && x <= s.x + s._gardenHitW / 2 && y >= s.y - s._gardenHitH && y <= s.y;
}

/** What a plot says to a dragged Guano: the verb it would run, and the tip. */
export function guanoOver(target, verbs, now = Date.now()) {
  const check = fertilizeCheck(target?.state?.plot, now);
  const verb = check.ok ? (verbs || []).find((v) => v.id === VERB && v.enabled !== false) : null;
  if (check.ok && !verb) return { verb: null, tip: FERTILIZE_TEXT.tipNo };
  return { verb, tip: check.tip };
}

/**
 * #197: what a plot says to a dragged seed: the verb a drop runs (the plot's Plant with that seed,
 * plant:<seed>) or null, and the tip. A Plant the menu greys (too tired) refuses with its reason.
 */
export function seedOver(target, seedId, verbs) {
  const gType = target?.state?.garden?.gardenType === 'herb' ? 'herb' : 'default';
  const check = seedDropCheck(target?.state?.plot, seedId, gType);
  if (!check.ok) return { verb: null, tip: check.tip };
  const plant = (verbs || []).find((v) => v.id === 'plant');
  if (!plant) return { verb: null, tip: "This can't be planted here" };
  if (plant.enabled === false) return { verb: null, tip: plant.reason || check.tip };
  return { verb: { ...plant, id: `plant:${seedId}`, picker: undefined }, tip: check.tip };
}

/** The pack class a drag carries that a plot takes: Guano or a seed, else ''. */
export function plotDragClass(cls) {
  const c = String(cls || '');
  return c === GARDEN_FERTILIZER || SEED_CATALOG[c] ? c : '';
}

let wired = false;
/** The class being dragged (Guano or a seed), or ''. */
let dragging = '';
let tip = null;

function showTip(text, no, x, y) {
  if (typeof document === 'undefined') return;
  if (!tip) {
    tip = document.createElement('div');
    tip.className = 'guano-drag-tip';
    Object.assign(tip.style, {
      position: 'fixed', zIndex: 'calc(var(--z-dialog) + 6)', pointerEvents: 'none', transform: 'translate(14px, 10px)',
      padding: '0.2rem 0.55rem', borderRadius: 'var(--radius-sm)', background: 'var(--surface-card)', color: 'var(--text)',
      font: '600 var(--fs-sm)/var(--lh-snug) var(--font-system)', boxShadow: 'var(--shadow-2)',
    });
    document.body.appendChild(tip);
  }
  tip.hidden = !text;
  if (!text) return;
  tip.textContent = text;
  tip.style.color = no ? 'var(--c-red-53d)' : 'var(--text)';
  tip.style.left = `${x}px`;
  tip.style.top = `${y}px`;
}

function plotAt(engine, event) {
  const canvas = event.currentTarget;
  const rect = canvas?.getBoundingClientRect?.();
  if (!rect?.width || !engine.entityLayer) return null;
  const k = (engine.camera?.w || 960) / rect.width;
  const p = engine.entityLayer.toLocal(new engine.PIXI.Point((event.clientX - rect.left) * k, (event.clientY - rect.top) * k));
  // Report #204: the back row's reach overlaps the row in front; the plot whose base is under the pointer (js/garden-view.js).
  const plots = (engine.interactables || []).filter((t) => t.classId === 'garden_plot' && plotHit(t, p.x, p.y));
  return plots[nearestPlotIndex(plots.map((t) => t.sprite), p.x, p.y)] || null;
}

function endDrag(engine) {
  const seed = dragging && dragging !== GARDEN_FERTILIZER;
  dragging = '';
  showTip('');
  engine.setData?.(seed ? 'seedDrag' : 'guanoDrag', 'none');
}

/** What the plot does with the dragged class: { verb, tip } (Guano or a seed). */
function overPlot(engine, plot, cls) {
  const verbs = engine.targetVerbs?.(plot);
  return cls === GARDEN_FERTILIZER ? guanoOver(plot, verbs) : seedOver(plot, cls, verbs);
}

function wire(engine) {
  if (wired || typeof document === 'undefined') return;
  const canvas = document.querySelector('#game-root > canvas');
  if (!canvas) return;
  wired = true;
  // After the pack slot's own dragstart: a drag it cancelled is no drag.
  document.addEventListener('dragstart', (event) => {
    dragging = event.defaultPrevented ? '' : plotDragClass(event.target?.closest?.('.pack-slot')?.dataset?.tsid);
    if (dragging === GARDEN_FERTILIZER) engine.setData?.('guanoDrag', 'dragging');
    else if (dragging) engine.setData?.('seedDrag', `dragging:${dragging}`);
  });
  document.addEventListener('dragend', () => { if (dragging) endDrag(engine); });
  canvas.addEventListener('dragover', (event) => {
    if (!dragging) return;
    // Decorate and Cultivate have the room's own drops.
    const plot = engine.query?.('homeEditMode', engine) ? null : plotAt(engine, event);
    const key = dragging === GARDEN_FERTILIZER ? 'guanoDrag' : 'seedDrag';
    if (!plot) {
      engine.setData?.(key, dragging === GARDEN_FERTILIZER ? 'dragging' : `dragging:${dragging}`);
      showTip('');
      return;
    }
    const over = overPlot(engine, plot, dragging);
    engine.setData?.(key, `over:${plot.state?.plotKey}:${over.verb ? 'ok' : 'no'}`);
    showTip(over.tip, !over.verb, event.clientX, event.clientY);
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = over.verb ? 'move' : 'none';
  });
  canvas.addEventListener('dragleave', () => { if (dragging) showTip(''); });
  canvas.addEventListener('drop', (event) => {
    if (!dragging) return;
    const cls = dragging;
    const plot = engine.query?.('homeEditMode', engine) ? null : plotAt(engine, event);
    endDrag(engine);
    if (!plot) return;
    event.preventDefault();
    const { verb } = overPlot(engine, plot, cls);
    engine.setData?.(cls === GARDEN_FERTILIZER ? 'guanoDropLast' : 'seedDropLast', verb ? `ran:${plot.state?.plotKey}` : `refused:${plot.state?.plotKey}`);
    if (!verb) {
      engine.playSound?.('CLICK_FAILURE', { volume: 0.4 });
      return;
    }
    engine.requestVerb?.(plot, verb);
  });
}

/** QA: &guanodemo: Guano in the pack, a bed beside the avatar, its plots in reach of a script. */
function demo(engine) {
  const kind = engine.param?.('guanodemo');
  if (!kind) return;
  const herb = kind === 'herb';
  const beds = () => (engine.interactables || []).filter((t) => t.classId === 'garden_new' && (t.state?.garden?.gardenType === 'herb') === herb);
  engine.inv.guano = Math.max(5, Number(engine.inv.guano) || 0);
  if (!beds().length && engine.player) engine.spawnGarden?.({ x: engine.player.x + 160, y: engine.player.y + 2, gardenType: herb ? 'herb' : 'default' });
  engine.refreshPack?.();
  globalThis.groddleGuano = {
    bed: () => beds()[0]?.state?.garden || null,
    plot: (key) => beds()[0]?.state?.garden?.plots?.[key] || null,
    guano: () => Number(engine.inv.guano) || 0,
    set(key, patch) {
      Object.assign(beds()[0].state.garden.plots[key], patch);
      engine.refreshGarden?.(beds()[0]);
      engine.save?.();
    },
    stand() {
      const b = beds()[0];
      if (!b || !engine.player) return;
      engine.player.x = b.sprite.x - 40;
      engine.player.y = b.sprite.y - 4;
    },
    /** A plot's middle in client px. */
    point(key) {
      const t = beds()[0]?.state?.plotTargets?.find((p) => p.state?.plotKey === key);
      const rect = document.querySelector('#game-root > canvas')?.getBoundingClientRect();
      if (!t || !rect) return null;
      const g = engine.entityLayer.toGlobal(new engine.PIXI.Point(t.sprite.x, t.sprite.y - t.sprite._gardenHitH / 2));
      const k = rect.width / (engine.camera?.w || 960);
      return { x: rect.left + g.x * k, y: rect.top + g.y * k };
    },
  };
}

export const gardenGuanoFeature = {
  id: GARDEN_GUANO_FEATURE_ID,
  onStreetEnter(street, engine) {
    wire(engine);
    demo(engine);
  },
};
