/**
 * The abandoned towers' upper floors (register row G144; street data in
 * js/tower-floors.js, written by tools/build-tower-floors.mjs).
 *
 * - Ecology: no floor has location XML, so build-street-ecology.mjs has no
 *   row; each is an empty room indoors, like its lobby.
 * - The lift's plate shows the floor's number, as the panorama of Hauki Seeks
 *   Manor, floor 3 shows a 3 (the plate is signpost_asset_elevator's own,
 *   drawn blank in the art; the original wrote the floor on it).
 * - QA data while on one: abandonedFloor (`<tower>:<floor>`, '' elsewhere) and
 *   abandonedFloorLayout ('panorama' or 'default').
 *
 * QA: ?autostart=1&questoffer=off&streetdemo=GHF9DOUO7K03OUA&streetx=1686&streety=535
 *   (Hauki Seeks Manor, floor 3, at the lift); a lobby's lift arms lead to each floor.
 */

import { TOWER_FLOOR_BOUNDS, TOWER_LIFT, TOWER_LIFT_PLATE, towerFloorEcology, towerFloorFor, towerFloorLayout } from '../tower-floors.js?v=3d1ad8b7';

export const TOWER_FLOORS_FEATURE_ID = 'tower-floors';

let plate = null;

function clearPlate(engine) {
  if (plate && !plate.destroyed) {
    plate.parent?.removeChild(plate);
    plate.destroy();
  }
  plate = null;
  engine?.setData?.('abandonedFloor', '');
  engine?.setData?.('abandonedFloorLayout', '');
}

function drawPlate(engine, floor, street) {
  const PIXI = engine.PIXI;
  const layer = engine.entityLayer;
  if (!PIXI || !layer) return;
  const t = new PIXI.Text({
    text: String(floor.n),
    style: {
      fontFamily: 'Nunito, "Trebuchet MS", sans-serif',
      fontSize: 26,
      fontWeight: '800',
      fill: 0xe9cf86,
    },
  });
  t.resolution = 3;
  t.anchor.set(0.5, 0.5);
  t.x = TOWER_LIFT.x + TOWER_LIFT_PLATE.dx - TOWER_FLOOR_BOUNDS.l;
  t.y = floor.arrive.y - TOWER_LIFT.art - TOWER_LIFT_PLATE.dy - TOWER_FLOOR_BOUNDS.t;
  // On the wall art, behind the avatar and the signpost's arms.
  t.zIndex = -20;
  t.eventMode = 'none';
  t.label = 'tower-lift-plate';
  layer.addChild(t);
  plate = t;
  engine.setData('abandonedFloor', `${floor.tower.id}:${floor.n}`);
  engine.setData('abandonedFloorLayout', towerFloorLayout(floor)?.status || '');
}

export const towerFloorsFeature = {
  id: TOWER_FLOORS_FEATURE_ID,

  ecologyOverride(street) {
    return towerFloorEcology(street?.tsid);
  },

  onStreetEnter(street, engine) {
    clearPlate(engine);
    const floor = towerFloorFor(street?.tsid);
    if (floor) drawPlate(engine, floor, street);
  },

  onStreetClear(engine) {
    clearPlate(engine);
  },
};
