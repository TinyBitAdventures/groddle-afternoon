/**
 * The rooms rebuilt from players' pictures (register rows G157 Snowed In,
 * G158 Martleby Hare, G159 Ethereal Endeavour; street data in
 * js/rebuilt-rooms.js, written by tools/build-rebuilt-rooms.mjs).
 *
 * - Ecology: none of the three has location XML, so build-street-ecology.mjs
 *   has no row and the fallback would put piggies, a vendor and a shrine in
 *   them. Snowed In and Ethereal Endeavour are rooms (nothing spawned;
 *   Ethereal Endeavour keeps the quoins its snap shows); Martleby Hare is the
 *   bare cliff Zog's Glitchy Tools lists nothing on.
 * - QA data while in one: rebuiltRoom (its TSID, '' elsewhere).
 *
 * QA: ?autostart=1&questoffer=off&doordemo=GA9R6BM705F3L3N&doorautoplay=1 (Snowed In),
 *   doordemo=GA94GCF7H3D30IM&doorkey=1&doorautoplay=1 (Ethereal Endeavour),
 *   doordemo=GCR169OSLQL13JR&doorkey=2&doorautoplay=1 (Martleby Hare).
 */

import { isEtherealTsid, isMartlebyTsid, isSnowedInTsid, rebuiltRoomEcology } from '../rebuilt-rooms.js?v=g157-1';

export const REBUILT_ROOMS_FEATURE_ID = 'rebuilt-rooms';

const isRoom = (tsid) => isSnowedInTsid(tsid) || isEtherealTsid(tsid) || isMartlebyTsid(tsid);

export const rebuiltRoomsFeature = {
  id: REBUILT_ROOMS_FEATURE_ID,

  ecologyOverride(street) {
    return rebuiltRoomEcology(street?.tsid);
  },

  onStreetEnter(street, engine) {
    engine.setData('rebuiltRoom', isRoom(street?.tsid) ? String(street.tsid) : '');
  },

  onStreetClear(engine) {
    engine.setData('rebuiltRoom', '');
  },
};
