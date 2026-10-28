/**
 * An overlay from Tiny Speck's glitch-overlays with a plain stand-in while
 * that overlay is not rendered yet (the letter_*_overlay indicators). It
 * tries overlays-more.json (js/overlays.js playOverlay: dice_overlay and
 * twelve_sided_die, G377), then overlays.json (js/overlay-art.js
 * playSheetOverlay); once a key is in either, the real art plays and the
 * stand-in is never drawn: nothing else changes.
 *
 * The stand-in is a rounded card with a word or letter on it, placed where
 * the overlay would stand (its bottom centre on `at()`), so a placeholder
 * reads as a placeholder.
 *
 * Call tick() every frame (a feature's onTick) to move or end the stand-in.
 */

import { playSheetOverlay } from './overlay-art.js?v=g311-1';
import { playOverlay } from './overlays.js?v=g392-1';

const STYLE = Object.freeze({ fill: 0xfffaf0, line: 0x6b5a48, text: 0x3b3128 });

function drawCard(PIXI, wh, label) {
  const box = new PIXI.Container();
  box.eventMode = 'none';
  const g = new PIXI.Graphics();
  const w = wh;
  const h = wh;
  g.roundRect(-w / 2, -h, w, h, Math.max(6, wh / 6)).fill({ color: STYLE.fill, alpha: 0.95 }).stroke({ color: STYLE.line, width: 2 });
  box.addChild(g);
  const text = new PIXI.Text({ text: String(label ?? ''), style: { fontFamily: 'Trebuchet MS, sans-serif', fontSize: Math.round(wh * 0.42), fontWeight: '700', fill: STYLE.text, align: 'center' } });
  text.anchor.set(0.5, 0.5);
  text.y = -h / 2;
  box.addChild(text);
  box.setLabel = (next) => {
    const s = String(next ?? '');
    text.text = s;
    const max = w - 8;
    text.scale.set(1);
    if (text.width > max) text.scale.set(max / text.width);
  };
  box.setLabel(label);
  return box;
}

/**
 * @param {object} engine the feature engine (PIXI, fxLayer / entityLayer)
 * @param {string} key the overlay key (overlays.json)
 * @param {{ at: () => {x:number,y:number}, wh?: number, durationMs?: number, state?: string|null,
 *   zIndex?: number, label?: string }} opts `label` is what the stand-in shows first
 */
export function overlayOrStandIn(engine, key, { at, wh = 56, durationMs = 2000, state = null, zIndex = 950, label = '' } = {}) {
  const PIXI = engine?.PIXI;
  const layer = engine?.fxLayer || engine?.entityLayer;
  const startedAt = Date.now();
  const handle = {
    key,
    art: null,
    standIn: null,
    label,
    stopped: false,
    usingArt: null,
    setState(name, nextLabel) {
      handle.art?.setState?.(name);
      if (nextLabel != null) {
        handle.label = nextLabel;
        handle.standIn?.setLabel?.(nextLabel);
      }
    },
    stop() {
      handle.stopped = true;
      handle.art?.stop?.();
      if (handle.standIn && !handle.standIn.destroyed) {
        handle.standIn.parent?.removeChild(handle.standIn);
        handle.standIn.destroy({ children: true });
      }
      handle.standIn = null;
    },
    /** Move the stand-in; ends it after durationMs. Returns false once over. */
    tick() {
      if (handle.stopped) return false;
      if (Number.isFinite(durationMs) && Date.now() - startedAt >= durationMs) {
        handle.stop();
        return false;
      }
      const s = handle.standIn;
      if (s && !s.destroyed && typeof at === 'function') {
        const p = at();
        s.x = p.x;
        s.y = p.y;
      }
      return true;
    },
  };
  if (!PIXI || !layer || typeof at !== 'function') return handle;
  const left = () => (Number.isFinite(durationMs) ? Math.max(1, durationMs - (Date.now() - startedAt)) : 0);
  const withState = (art) => {
    // A state set while the manifest loaded carries over.
    if (handle.state && art?.setState) art.setState(handle.state);
    return art;
  };
  handle.state = state;
  const setState = handle.setState;
  handle.setState = (name, nextLabel) => {
    handle.state = name;
    setState(name, nextLabel);
  };
  // overlays-more.json first (durationMs 0 there means until stop()).
  handle.art = playOverlay(PIXI, key, { layer, at, wh, durationMs: Number.isFinite(durationMs) ? durationMs : 0, state, zIndex, loop: true });
  handle.art.done.then((played) => {
    if (played || handle.stopped || handle.art?.sprite || layer.destroyed) return false;
    handle.art = withState(playSheetOverlay(PIXI, key, { layer, at, wh, durationMs: Number.isFinite(durationMs) ? left() : Infinity, state: handle.state, zIndex, loop: true }));
    return handle.art.done;
  }).then((played) => {
    // No sheet for this key in either manifest: the stand-in takes its place for what is left.
    if (played || handle.stopped || handle.art?.sprite || !PIXI.Container || layer.destroyed) return;
    handle.usingArt = false;
    const card = drawCard(PIXI, wh, handle.label);
    card.zIndex = zIndex;
    layer.addChild(card);
    handle.standIn = card;
    handle.tick();
  });
  return handle;
}
