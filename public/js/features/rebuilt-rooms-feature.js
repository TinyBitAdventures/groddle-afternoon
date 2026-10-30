/**
 * The rooms rebuilt from players' pictures (register rows G157 Snowed In and
 * Growing Stuff, G158 Martleby Hare, G159 Ethereal Endeavour; street data in
 * js/rebuilt-rooms.js, written by tools/build-rebuilt-rooms.mjs).
 *
 * - Ecology: none of the four has location XML, so build-street-ecology.mjs
 *   has no row and the fallback would put piggies, a vendor and a shrine in
 *   them. Snowed In, Growing Stuff and Ethereal Endeavour are rooms (nothing spawned;
 *   Ethereal Endeavour keeps the quoins its snap shows); Martleby Hare is the
 *   bare cliff Zog's Glitchy Tools lists nothing on.
 * - QA data while in one: rebuiltRoom (its TSID, '' elsewhere).
 * - Winter Walk's caption line (G352, js/winter-walk-streets.js WINTER_WALK_CAPTION; Austin
 *   2026-10-28: one-off approval), placed in the street like the source's deco sign text.
 *   QA data: winterCaption ('1' while drawn).
 *
 * QA: ?autostart=1&questoffer=off&doordemo=GA9R6BM705F3L3N&doorautoplay=1 (Snowed In),
 *   doordemo=GA94GCF7H3D30IM&doorkey=1&doorautoplay=1 (Ethereal Endeavour),
 *   doordemo=GCR169OSLQL13JR&doorkey=2&doorautoplay=1 (Martleby Hare),
 *   doordemo=GA9R4OR505F3PSL&doorautoplay=1 (Growing Stuff).
 */

import { isRebuiltRoomTsid, rebuiltRoomEcology } from '../rebuilt-rooms.js?v=95ca6839';
import { WINTER_WALK_BOUNDS, WINTER_WALK_CAPTION, WINTER_WALK_TSID, winterStreetEcology } from '../winter-walk-streets.js?v=615549da';

export const REBUILT_ROOMS_FEATURE_ID = 'rebuilt-rooms';

const isRoom = (tsid) => isRebuiltRoomTsid(tsid);

let caption = null;

function clearCaption(engine) {
  if (caption && !caption.destroyed) {
    caption.parent?.removeChild(caption);
    caption.destroy();
  }
  caption = null;
  engine?.setData?.('winterCaption', '');
}

/** Winter Walk's placed caption (street-screen space: world minus the street's top-left). */
function drawCaption(engine) {
  const PIXI = engine.PIXI;
  // Over the world. The background trunks scroll behind the text as you walk (parallax), so a soft
  // snow-coloured edge keeps the dark letters readable where a trunk passes (ours: the snaps show
  // the text over thin branches only).
  const layer = engine.fxLayer || engine.entityLayer;
  if (!PIXI || !layer) return;
  const c = WINTER_WALK_CAPTION;
  const t = new PIXI.Text({ text: c.lines.join('\n'), style: {
    fontFamily: 'Nunito, "Trebuchet MS", sans-serif',
    fontSize: 17,
    fontWeight: '800',
    fill: c.fill,
    align: 'center',
    lineHeight: 21,
    stroke: { color: 0xf3f5f7, width: 4, join: 'round' },
  } });
  t.resolution = 3;
  t.anchor.set(0.5, 0.5);
  t.x = c.x - WINTER_WALK_BOUNDS.l;
  t.y = c.y - WINTER_WALK_BOUNDS.t;
  t.zIndex = 1;
  t.eventMode = 'none';
  layer.addChild(t);
  caption = t;
  engine.setData('winterCaption', '1');
}

export const rebuiltRoomsFeature = {
  id: REBUILT_ROOMS_FEATURE_ID,

  ecologyOverride(street) {
    // Winter Walk and Winter Haven (js/winter-walk-streets.js) are empty too: the route clears them.
    return rebuiltRoomEcology(street?.tsid) || winterStreetEcology(street?.tsid);
  },

  onStreetEnter(street, engine) {
    engine.setData('rebuiltRoom', isRoom(street?.tsid) ? String(street.tsid) : '');
    clearCaption(engine);
    if (street?.tsid === WINTER_WALK_TSID) drawCaption(engine);
  },

  onStreetClear(engine) {
    engine.setData('rebuiltRoom', '');
    clearCaption(engine);
  },

  /** The walk's stages clear the world after the street is entered (game.js setupWinterWalkStage): put it back. */
  onTick(dtMs, now, engine) {
    if (engine.streetTsid !== WINTER_WALK_TSID) return;
    if (!caption || caption.destroyed || !caption.parent) {
      clearCaption(engine);
      drawCaption(engine);
    }
  },
};
