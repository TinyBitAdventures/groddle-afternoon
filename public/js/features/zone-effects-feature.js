/**
 * Zone ambient effects in the game (level builder spec 4, 15 Q12; the effects are js/street-effects.js):
 * a zone street's steam vents, lava squirts and embers, and its earthquake rumble.
 *
 * - On entering a street that carries `emitters` or a `rumble`, builds the pooled effects into the
 *   street view (engine.streetView); on leaving, drops them.
 * - Every frame: moves them on (emitters off screen stop), and during a rumble shakes the camera
 *   through the engine's per-frame offset (engine.nudgeCamera, as the Rook's attack does) and plays
 *   Tiny Speck's ROCKS_DISAPPEAR as each rumble starts. Under prefers-reduced-motion nothing shakes
 *   and the emitters run calmer.
 * - Zone streets only (GZ tsids, js/zone-streets.js), and solo only: no shipped street has effects,
 *   and a multiplayer page never shows a zone (spec 15 Q6), so it never builds anything there.
 *
 * Canvas data: zoneFx (emitters,live,pooled) and zoneRumble (on|off) for QA.
 */
import { createStreetEffects, RUMBLE_SOUND } from '../street-effects.js?v=e427650f';
import { isZoneTsid } from '../zone-streets.js?v=b40010d5';
import { isSolo, resolveGameMode } from '../game-mode.js?v=1ecf2899';

export const ZONE_EFFECTS_FEATURE_ID = 'zone-effects';

let fx = null;
let lastData = 0;

function drop() {
  fx?.destroy();
  fx = null;
}

export const zoneEffectsFeature = {
  id: ZONE_EFFECTS_FEATURE_ID,

  onStreetEnter(street, engine) {
    drop();
    if (!street || !(street.emitters?.length || street.rumble)) return;
    if (!isZoneTsid(street.tsid) || !isSolo(resolveGameMode())) return;
    const view = engine.streetView;
    const PIXI = engine.PIXI || globalThis.PIXI;
    if (!view || !PIXI) return;
    fx = createStreetEffects(street, PIXI, view, { available: engine.decoAvailable || null });
    engine.setData?.('zoneRumble', fx.rumble ? 'on' : 'off');
  },

  onStreetClear() {
    drop();
  },

  onTick(dtMs, now, engine) {
    if (!fx) return;
    const r = fx.update(dtMs, engine.camera);
    if (r) {
      if (r.started && fx.rumble.rumble.sound) engine.playSound?.(RUMBLE_SOUND, { volume: 0.55 });
      if (r.dx || r.dy) engine.nudgeCamera?.(r.dx, r.dy);
    }
    if (now - lastData > 500) {
      lastData = now;
      const s = fx.stats();
      engine.setData?.('zoneFx', `${s.emitters},${s.live},${s.pooled}`);
      engine.setData?.('zoneRumble', r?.active ? 'shaking' : fx.rumble ? 'on' : 'off');
    }
  },
};
