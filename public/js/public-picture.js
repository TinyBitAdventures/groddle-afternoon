/**
 * Pictures that can be shown publicly (G1283: the home street picture and the Tower cutaway the
 * game uploads for the site's public pages) leave out every player and everything drawn over
 * players: speech and chat bubbles, emote and hi-sign bubbles, floating text, name plates, the
 * interaction hint. Player chat must never reach a public page.
 *
 * Glitch did the same for the home picture: saveHomeImg took
 * getSnapshot(CameraMan.SNAPSHOT_TYPE_NORMAL, mg.w) (TSFrontController.as 1524), and with
 * includeAlmostEverything false getSnapshot hid every PC, the owner's own avatar too
 * (MiddleGroundRenderer.hidePCsTemporarily), all overlays (AnnouncementController.hideAllOverlays),
 * the middleground's non-item children (hideVisibleNonItemstacks) and the items' chat bubbles and
 * action indicators (LocationItemstackView.adjustForSnapping(false)); LocationRenderer.as 594-660.
 * Camera Mode's own Snaps keep what is on screen (CameraMan's SNAPSHOT_TYPE_USER, and here the
 * whole-house Snap): they are private until their owner makes one public.
 *
 * What is hidden, for the length of one synchronous draw, then put back:
 * - the player's own Glitch (engine.player);
 * - the effects layer (engine.fxLayer: speech bubbles, hi-signs, emotes, floating text, tools);
 * - every stage layer but the camera's world (the hint chip, fades and cards over the street);
 * - every node in the entity layer marked `publicPicture = 'hide'` (another player's Glitch with
 *   its name plate: features/realtime-feature.js makeRemote).
 */

/** The mark a display object carries when a public picture leaves it out. */
export const PUBLIC_HIDE = 'hide';

/** PURE: the display objects a public picture hides on this engine's stage (visible ones only). */
export function publicHidden(engine) {
  const world = engine?.entityLayer?.parent || null;
  const out = [];
  const add = (node) => {
    if (node && !node.destroyed && node.visible !== false && !out.includes(node)) out.push(node);
  };
  add(engine?.player);
  add(engine?.fxLayer);
  for (const child of engine?.stage?.children || []) if (child !== world) add(child);
  for (const child of engine?.entityLayer?.children || []) if (child?.publicPicture === PUBLIC_HIDE) add(child);
  return out;
}

/** `fn()` with publicHidden(engine) hidden, then shown again, whatever `fn` does. Synchronous. */
export function withPublicView(engine, fn) {
  const hidden = publicHidden(engine);
  for (const node of hidden) node.visible = false;
  try {
    return fn();
  } finally {
    for (const node of hidden) if (!node.destroyed) node.visible = true;
  }
}
