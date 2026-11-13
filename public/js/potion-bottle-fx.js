/**
 * Plays a potion's bottle pouring, where the original put it (rules, source lines and the
 * measured sheets: js/potion-bottles.js; the drawing: js/item-overlay.js). Used by the Cauldron's
 * quaffs and pours (features/potions-feature.js), the Master Gardener potions
 * (master-garden-feature.js), Tree Poison and its Antidote (tree-death-feature.js) and the Rook
 * Balm (rook-attack-feature.js).
 *
 * QA: &potionbottlehold=<ms> freezes every bottle at that moment of its pour (screenshots).
 * Canvas: potionBottle (<class>:<frame>:<self|target>, the frame last drawn).
 */

import { displayTopOf, itemstackOverlayPoint } from './overlay-art.js?v=92383208';
import { pcOverlayPoint, playItemOverlay } from './item-overlay.js?v=445d35d7';
import { POTION_POUR_MS, POTION_SELF_OVERLAY, POTION_TARGET_OVERLAY, potionBottleSheet, potionPourSide } from './potion-bottles.js?v=17925871';

/** A garden's display top is 35 px over its art (LocationItemstackView.as 640-642). */
export const GARDEN_TOP = 35;

/**
 * The bottle over `target` (an interactable with a sprite: the pour's itemstack_overlay), or
 * over the avatar when there is none (the quaff's pc_overlay). Returns the overlay's handle
 * ({ stop(), done, sprite, frame }), or null when the potion has no sheet (the caller keeps its
 * own stand-in).
 */
export function playPotionBottle(engine, classTsid, target = null, { durationMs = POTION_POUR_MS } = {}) {
  const def = potionBottleSheet(classTsid);
  const layer = engine?.fxLayer || engine?.entityLayer;
  if (!def || !engine?.PIXI || !layer) return null;
  const hold = Number(engine.param?.('potionbottlehold'));
  const holdMs = Number.isFinite(hold) && hold > 0 ? hold : null;
  const spr = target?.sprite && !target.sprite.destroyed ? target.sprite : null;
  const where = spr ? 'target' : 'self';
  const onFrame = (frame) => engine.setData?.('potionBottle', `${classTsid}:${frame}:${where}`);
  if (spr) {
    const side = potionPourSide(spr.x, engine.player?.x);
    // The top of the target's art, 35 px higher for a garden (LocationItemstackView.as 632-651 getYAboveDisplay).
    const topOf = () => displayTopOf(spr) - (target.classId === 'garden_new' ? GARDEN_TOP : 0);
    let last = { x: spr.x, y: topOf() };
    return playItemOverlay(engine.PIXI, def, {
      layer,
      flipped: side.flipped,
      durationMs,
      holdMs,
      onFrame,
      label: `potion-bottle:${classTsid}`,
      at: () => {
        // A target that goes mid-pour (a tree replaced, an animal babified) leaves the bottle where it was.
        if (!spr.destroyed) last = { x: spr.x, y: topOf() };
        return itemstackOverlayPoint(last.x, last.y, { dx: side.deltaX, dy: POTION_TARGET_OVERLAY.deltaY });
      },
    });
  }
  return playItemOverlay(engine.PIXI, def, {
    layer,
    wh: POTION_SELF_OVERLAY.wh,
    durationMs,
    holdMs,
    onFrame,
    label: `potion-bottle:${classTsid}`,
    at: () => pcOverlayPoint(engine.player, { dy: POTION_SELF_OVERLAY.deltaY }),
  });
}
