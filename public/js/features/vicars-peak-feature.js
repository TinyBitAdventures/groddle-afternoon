/**
 * Vicar's Peak (register row G93; street data in js/vicars-peak.js, built by
 * tools/build-vicars-peak.mjs).
 *
 * - Ecology: the beta loading card's "Home to: 11 Piggies, 7 Chickens, and
 *   1 Metal Rock for mining" (video WZqTdcjhPII t0520). The archive has no
 *   location file for the street, so the row comes from here, with the
 *   rendering caps lifted to the card's own counts.
 * - QA data while on the street: vicarsPeakTier (the ledge tier the feet
 *   stand on, t0 ground .. t6 the door ledge, '' while climbing or in the
 *   air) and vicarsPeakTop (the highest tier reached this visit).
 *
 * QA: ?autostart=1&questoffer=off&streetdemo=GCR1516SFHM122V&streetx=1300&streety=1895
 *   (the ground by the bottom door), or doordemo=GCR12NU45AM12BB&doorkey=1&doorautoplay=1
 *   (through Thornfad Layers' locked door).
 */

import { TIERS, VICARS_PEAK_BOUNDS, isVicarsPeakTsid, vicarsPeakEcology } from '../vicars-peak.js?v=g93-1';

export const VICARS_PEAK_FEATURE_ID = 'vicars-peak';
const DATA_MS = 250;

let active = false;
let top = -1;
let lastData = 0;

function tierAt(engine) {
  const p = engine.player;
  if (!p) return -1;
  const wy = p.y + VICARS_PEAK_BOUNDS.t;
  const wx = p.x + VICARS_PEAK_BOUNDS.l;
  return TIERS.findIndex((t) => Math.abs(wy - t.y) <= 14 && t.segs.some(([a, b]) => wx >= a - 4 && wx <= b + 4));
}

function publish(engine, force = false) {
  const now = Date.now();
  if (!force && now - lastData < DATA_MS) return;
  lastData = now;
  if (!active) {
    engine.setData('vicarsPeakTier', '');
    engine.setData('vicarsPeakTop', '');
    return;
  }
  const i = tierAt(engine);
  if (i > top) top = i;
  engine.setData('vicarsPeakTier', i >= 0 ? TIERS[i].id : '');
  engine.setData('vicarsPeakTop', top >= 0 ? TIERS[top].id : '');
}

export const vicarsPeakFeature = {
  id: VICARS_PEAK_FEATURE_ID,

  ecologyOverride(street) {
    return isVicarsPeakTsid(street?.tsid) ? vicarsPeakEcology() : null;
  },

  onStreetEnter(street, engine) {
    active = isVicarsPeakTsid(street?.tsid) && !engine.transientInstance?.() && !engine.homeContext?.().inHome;
    top = -1;
    publish(engine, true);
  },

  onStreetClear(engine) {
    active = false;
    publish(engine, true);
  },

  onTick(_dtMs, _now, engine) {
    if (active) publish(engine);
  },
};
