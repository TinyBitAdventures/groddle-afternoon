/**
 * The Interrogation room (G352, js/interrogation-room.js): the moderators'
 * room an administrator opens from the console (groddle-afternoon-site
 * src/AdminConsole.php admin/interrogation, the realtime server's teleport).
 *
 * - Ecology: none (no location XML): an empty room, no piggies, vendor or shrine.
 * - The way back: when anyone enters the room from a real street (enterGate runs
 *   before the street changes, so the street and spot they stand on are still
 *   theirs), that street and spot are kept, and saved with the game, so a reload
 *   in the room still knows it. The door at the left (verb Leave) takes them
 *   there; with none kept (a QA look, a home, a private place), to the fresh
 *   start, Hechey Track.
 * - The look: the chair (the hall's waiting chair, tools/interrogation/build-chair.mjs)
 *   stands in the booth behind the avatars, and a fixed pool of light round the
 *   bulb fades the room to black over everything on the street (the render is
 *   black past the booth); speech and the interaction hint stay on top.
 *
 * QA: ?autostart=1&questoffer=off&streetdemo=GIFLFPPBUUT11SP&streetx=585&streety=970
 *   (&interrogationautoplay=leave walks out through the door after a moment).
 *   Canvas data: interrogation ('1' in the room), interrogationBack (tsid@x,y or ''),
 *   interrogationLast (entered | left:<tsid> | fallback:<tsid>).
 */

import {
  INTERROGATION_BOUNDS,
  INTERROGATION_CHAIR,
  INTERROGATION_DOOR,
  INTERROGATION_LIGHT,
  INTERROGATION_TEXT,
  doorDestinationFor,
  interrogationEcology,
  isInterrogationTsid,
  normalizeWayBack,
  wayBackFrom,
} from '../interrogation-room.js?v=c6a73859';
import { textureFromUrl } from '../textures.js?v=814d7926';

export const INTERROGATION_FEATURE_ID = 'interrogation-room';
export const INTERROGATION_DOOR_CLASS = 'interrogation_door';

/**
 * The darkness, as canvas gradient stops: [offset 0..1 of the radius, alpha]. The render is black
 * past the booth; ours stops short of it (EDGE_ALPHA) so a visitor still sees themselves at the door.
 */
export const INTERROGATION_DARK_STOPS = Object.freeze([
  [0, 0],
  [0.3, 0.08],
  [0.6, 0.5],
  [0.85, 0.78],
  [1, 0.88],
]);
const EDGE_ALPHA = INTERROGATION_DARK_STOPS.at(-1)[1];
/** The darkness canvas is drawn at a quarter of the street's size and scaled up (it is a soft blur). */
const DARK_SCALE = 4;

let wayBack = null;
let last = '';
let views = [];
let door = null;
let autoplayDone = false;

function publish(engine) {
  const here = isInterrogationTsid(engine.streetTsid);
  engine.setData?.('interrogation', here ? '1' : '');
  engine.setData?.('interrogationBack', wayBack ? `${wayBack.tsid}@${wayBack.x ?? ''},${wayBack.y ?? ''}` : '');
  engine.setData?.('interrogationLast', last);
}

function screen(x, y) {
  return { x: x - INTERROGATION_BOUNDS.l, y: y - INTERROGATION_BOUNDS.t };
}

function drawChair(engine) {
  const { PIXI } = engine;
  const c = INTERROGATION_CHAIR;
  const spr = new PIXI.Sprite(textureFromUrl(c.url));
  spr.anchor.set(0.5, 1);
  const at = screen(c.x, c.y);
  spr.x = at.x;
  spr.y = at.y;
  spr.width = c.w;
  spr.height = c.h;
  spr.zIndex = -60;
  spr.eventMode = 'none';
  spr.label = 'interrogation-chair';
  engine.entityLayer.addChild(spr);
  views.push(spr);
}

/** The pool of light: black all round, clear under the bulb. */
function drawDarkness(engine) {
  const { PIXI } = engine;
  if (typeof document === 'undefined' || !engine.fxLayer) return;
  const B = INTERROGATION_BOUNDS;
  const w = Math.ceil((B.r - B.l) / DARK_SCALE);
  const h = Math.ceil((B.b - B.t) / DARK_SCALE);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  const L = INTERROGATION_LIGHT;
  const c = screen(L.x, L.y);
  const cx = c.x / DARK_SCALE;
  const cy = c.y / DARK_SCALE;
  const r = L.rx / DARK_SCALE;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(1, L.ry / L.rx);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
  for (const [at, alpha] of INTERROGATION_DARK_STOPS) g.addColorStop(at, `rgba(6, 5, 3, ${alpha})`);
  ctx.fillStyle = g;
  ctx.fillRect(-cx, (-cy * L.rx) / L.ry, w, (h * L.rx) / L.ry);
  ctx.restore();
  const spr = new PIXI.Sprite(PIXI.Texture.from(canvas));
  spr.scale.set(DARK_SCALE);
  // Past the street's edges too (the camera's skirt below the floor, a wide window).
  spr.x = 0;
  spr.y = 0;
  spr.eventMode = 'none';
  spr.label = 'interrogation-darkness';
  spr._ownTexture = true;
  engine.fxLayer.addChildAt(spr, 0);
  views.push(spr);
  // Beyond the street (wide windows, the ground skirt): plain dark.
  const edge = new PIXI.Graphics()
    .rect(-4000, -4000, 8000 + (B.r - B.l), 4000).fill({ color: 0x060503, alpha: EDGE_ALPHA })
    .rect(-4000, B.b - B.t, 8000 + (B.r - B.l), 4000).fill({ color: 0x060503, alpha: EDGE_ALPHA })
    .rect(-4000, 0, 4000, B.b - B.t).fill({ color: 0x060503, alpha: EDGE_ALPHA })
    .rect(B.r - B.l, 0, 4000, B.b - B.t).fill({ color: 0x060503, alpha: EDGE_ALPHA });
  edge.eventMode = 'none';
  edge.label = 'interrogation-darkness-edge';
  engine.fxLayer.addChildAt(edge, 1);
  views.push(edge);
}

function spawnDoor(engine) {
  const { PIXI } = engine;
  const D = INTERROGATION_DOOR;
  const at = screen(D.x, D.y);
  // The picture is the street's own deco (door_asset_bureaucratic_hall_int); this is its click area.
  const spr = new PIXI.Container();
  spr.x = at.x;
  spr.y = at.y;
  spr._worldHitW = D.w;
  spr._worldHitH = D.h;
  spr.hitArea = new PIXI.Rectangle(-D.w / 2, -D.h, D.w, D.h);
  spr.eventMode = 'static';
  spr.cursor = 'pointer';
  engine.entityLayer.addChild(spr);
  views.push(spr);
  door = engine.register({
    classId: INTERROGATION_DOOR_CLASS,
    featureId: INTERROGATION_FEATURE_ID,
    label: INTERROGATION_TEXT.door,
    subtitle: INTERROGATION_TEXT.doorSub,
    sprite: spr,
  });
}

/** Out through the door: back where they came from, else the fresh start. */
export async function leaveInterrogation(engine) {
  if (!isInterrogationTsid(engine.streetTsid)) return false;
  const dest = doorDestinationFor(wayBack);
  last = `${wayBack ? 'left' : 'fallback'}:${dest.tsid}`;
  wayBack = null;
  engine.playSound?.('DOOR_OPEN');
  engine.save?.();
  publish(engine);
  const spot = Number.isFinite(dest.x) && Number.isFinite(dest.y) ? { spawnX: dest.x, spawnY: dest.y } : {};
  await engine.enter(dest.tsid, spot);
  return true;
}

function autoplay(engine) {
  if (autoplayDone || engine.param?.('interrogationautoplay') !== 'leave') return;
  autoplayDone = true;
  setTimeout(() => { leaveInterrogation(engine); }, 1200);
}

function clearViews(engine) {
  if (door) engine.unregister?.(door);
  door = null;
  for (const v of views) {
    if (v.destroyed) continue;
    v.parent?.removeChild(v);
    v.destroy(v._ownTexture ? { texture: true, textureSource: true } : undefined);
  }
  views = [];
}

export const interrogationRoomFeature = {
  id: INTERROGATION_FEATURE_ID,

  ecologyOverride(street) {
    return interrogationEcology(street?.tsid);
  },

  enterGate(tsid, engine) {
    // Before the street changes: keep where they are now as the way back.
    if (!isInterrogationTsid(tsid) || isInterrogationTsid(engine.streetTsid)) return null;
    // The game's first street (a load or reload that starts in the room): no street is loaded yet,
    // streetTsid is only the index default, and the way back is the one the save restored.
    if (!engine.street) return null;
    const here = engine.streetTsid;
    if (!here || engine.streetExists?.(here) === false || engine.inScene?.()) {
      wayBack = null;
      return null;
    }
    wayBack = wayBackFrom({ tsid: here, label: engine.street?.label, x: engine.player?.x, y: engine.player?.y });
    return null;
  },

  onStreetEnter(street, engine) {
    if (isInterrogationTsid(street?.tsid)) {
      drawChair(engine);
      drawDarkness(engine);
      spawnDoor(engine);
      last = 'entered';
      engine.pushActivity?.(INTERROGATION_TEXT.arrived);
      autoplay(engine);
    }
    publish(engine);
  },

  onStreetClear(engine) {
    clearViews(engine);
  },

  verbsFor(t) {
    if (t?.classId !== INTERROGATION_DOOR_CLASS) return [];
    return [{ id: 'leave', label: INTERROGATION_TEXT.leave, sort: 50, enabled: true, tooltip: INTERROGATION_TEXT.leaveTip, durationMs: 0 }];
  },

  runVerb(t, verbId, engine) {
    if (t?.classId !== INTERROGATION_DOOR_CLASS || verbId !== 'leave') return false;
    leaveInterrogation(engine);
    return true;
  },

  save() {
    return wayBack ? { wayBack } : {};
  },

  restore(slice) {
    wayBack = normalizeWayBack(slice?.wayBack);
  },
};

/** Tests: the kept way back. */
export const interrogationWayBack = () => wayBack;
