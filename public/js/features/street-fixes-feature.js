/**
 * Street art fixes (js/street-fixes.js): a street's listed decos join its middleground before the
 * street is built, in solo and multiplayer alike. No state, no verbs.
 *
 * QA: ?autostart=1&questoffer=off&streetdemo=GTJ102GGGJK1VDO&streetx=868&streety=643 (Harbinger
 * Heath's leftmost ladder, the spot of report #161). Canvas data: streetFixes (decos added here).
 */
import { applyStreetFixes } from '../street-fixes.js?v=536481c5';

export const STREET_FIXES_FEATURE_ID = 'street-fixes';

let addedHere = 0;

export const streetFixesFeature = {
  id: STREET_FIXES_FEATURE_ID,

  prepareStreet(street) {
    addedHere = applyStreetFixes(street);
  },

  onStreetEnter(street, engine) {
    engine.setData('streetFixes', String(addedHere));
  },
};
