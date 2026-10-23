/**
 * QA for the location loading card (G89): travels through the real
 * enterStreetWithTransition path so the card can be screenshotted.
 *
 *   ?autostart=1&fresh=1&resetgame=1&questoffer=off&loadcarddemo=<tsid>[,<tsid>...]
 *     &loadcardvisits=N    seed N earlier visits to the first destination
 *     &loadcardago=MINS    ... the last of them MINS minutes ago
 *     &loadcardhold=MS     hold each card this long (screen-fx reads it)
 *
 * #screen-transition data: st-visit, st-home-to, st-status, st-split.
 * Canvas: data-load-card-demo (running|done), data-load-card-step.
 */
import { STREET_VISITS_SLOT } from './exploration.js';

export function runLoadingCardDemo({ engine, travel, params }) {
  const stops = String(params.get('loadcarddemo') || '').split(',').map((s) => s.trim()).filter(Boolean);
  const seedVisits = Math.max(0, Number(params.get('loadcardvisits')) || 0);
  const agoMins = Math.max(0, Number(params.get('loadcardago')) || 0);
  if (!stops.length) return;
  const wait = setInterval(async () => {
    if (!engine.started || !engine.player || !engine.street || engine.busy?.()) return;
    clearInterval(wait);
    if (seedVisits) {
      const slot = engine.streetSlot(STREET_VISITS_SLOT, stops[0]);
      slot.visits = seedVisits;
      slot.lastAt = agoMins ? Date.now() - agoMins * 60000 : 0;
    }
    engine.setData('loadCardDemo', 'running');
    for (let i = 0; i < stops.length; i += 1) {
      engine.setData('loadCardStep', String(i));
      await travel(stops[i]);
      await new Promise((r) => setTimeout(r, 1500));
    }
    engine.setData('loadCardDemo', 'done');
  }, 500);
}
