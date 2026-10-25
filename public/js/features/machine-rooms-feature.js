/**
 * Community machine rooms (register row G156), as a feature module (see
 * js/feature-host.js).
 *
 * The Meadow and Besara rooms are archived, so street-ecology.json already
 * keeps them indoors (interior: no fallback piggies, trees, vendor or shrine,
 * no quoins). The Forest Community Machine Room (js/forest-machine-room.js,
 * tools/build-forest-machine-room.mjs) has no location XML, so
 * build-street-ecology.mjs cannot write its row: this feature answers it
 * through ecologyOverride, the same row the archived rooms carry.
 *
 * QA: ?autostart=1&questoffer=off&doordemo=GLI23FELDHD1O3C&doorindex=0&doorautoplay=1
 *     (Middle Valley Clearing's door in; the room's door out lands back in
 *     front of it). Canvas data: machineRoom (the room's tsid, or '').
 */

import { forestMachineRoomEcology, isForestMachineRoomTsid } from '../forest-machine-room.js';

export const MACHINE_ROOMS_FEATURE_ID = 'machine-rooms';

export const machineRoomsFeature = {
  id: MACHINE_ROOMS_FEATURE_ID,

  ecologyOverride(street) {
    return isForestMachineRoomTsid(street?.tsid) ? forestMachineRoomEcology() : null;
  },

  onStreetEnter(street, engine) {
    engine.setData?.('machineRoom', isForestMachineRoomTsid(street?.tsid) ? street.tsid : '');
  },
};
