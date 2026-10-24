/**
 * The hidden floors (register row G92; data in js/hidden-floors.js).
 *
 * - Collision-triggered Teleporters (items/teleporter.js onPlayerCollision:
 *   pc.teleportToLocation to the target, no sound): Goorsh Gam's top-left
 *   treetop -> the lost floor, and the corner past its EXIT back; Odena
 *   Odes' ceiling pocket over the right end of the cave chamber (a plain
 *   jump falls short: triple jump, spinach or levitation) -> the forgotten
 *   floor, and the corner past its EXIT back. The avatar's feet must enter
 *   the box; travelGate is asked first (Hell, Pooped).
 * - The painted "EXIT" on both floors: the forgotten floor's archived
 *   sign_txt and, on the lost floor, the word read off the footage.
 * - Goorsh Gam's canopy: above the forest floor the avatar walks and jumps
 *   with the client's numbers (the puzzle streets' SOURCE_PHYSICS), as the
 *   2011-12-15 treetop route needs (CANOPY_PHYSICS in hidden-floors.js).
 * - Ecology: the lost floor shows no animals, trees, vendor or shrine.
 *
 * QA: ?autostart=1&questoffer=off&streetdemo=GIF16GDJ89724E3&streetx=140&streety=126
 *   (Goorsh Gam's top-left treetop: jump), streetdemo=GA9KL9UE1D82RFO&streetx=2716&streety=1440
 *   (under Odena Odes' pocket: triple jump), streetdemo=GA9QUBPI49J2MOB (the lost floor).
 *   &hiddenfloordemo=<teleporter id> drops the avatar into that box on the
 *   street that has it (goorsh_to_lost, lost_to_goorsh, odena_to_forgotten,
 *   forgotten_to_odena). Canvas data: hiddenFloorBoxes, hiddenFloorSign,
 *   hiddenFloorLast, hiddenFloorTeleports, hiddenFloorFeet (feet height over
 *   the street's lowest box bottom, for jump QA).
 */

import {
  CANOPY_PHYSICS,
  CANOPY_Y,
  LOST_FLOOR_LABEL,
  LOST_FLOOR_SOURCE_TSID,
  exitSignOn,
  inTeleporter,
  isGoorshGamTsid,
  isLostFloorTsid,
  teleportersOn,
} from '../hidden-floors.js?v=g92-1';

export const HIDDEN_FLOORS_FEATURE_ID = 'hidden-floors';
const CHECK_MS = 60;
const ARRIVAL_GRACE_MS = 800;
const DATA_MS = 250;

let boxes = [];
let views = [];
let teleporting = false;
let enteredAt = 0;
let lastCheck = 0;
let lastData = 0;
let teleports = 0;
let last = '';
let sign = '';
let demo = null;
let canopyTop = null; // Goorsh Gam: screen y under which the canopy physics applies

function clear() {
  for (const v of views) {
    if (v.parent) v.parent.removeChild(v);
    if (!v.destroyed) v.destroy();
  }
  views = [];
  boxes = [];
  sign = '';
  demo = null;
  canopyTop = null;
}

function publish(engine, now = Date.now(), force = false) {
  if (!force && now - lastData < DATA_MS) return;
  lastData = now;
  engine.setData('hiddenFloorBoxes', boxes.map((b) => b.id).join(','));
  engine.setData('hiddenFloorSign', sign);
  engine.setData('hiddenFloorLast', last);
  engine.setData('hiddenFloorTeleports', teleports);
  const p = engine.player;
  const low = boxes.length ? Math.max(...boxes.map((b) => b.box.y)) : null;
  engine.setData('hiddenFloorFeet', p && low !== null ? Math.round(low - p.y) : '');
  engine.setData('hiddenFloorCanopy', canopyTop !== null && p && p.y <= canopyTop ? 1 : 0);
}

/** The painted word: pale, a little worn, centred on its sign (screen space). */
function drawSign(engine, row) {
  const t = new engine.PIXI.Text({
    text: row.text,
    style: {
      fontFamily: '"Trebuchet MS", sans-serif',
      fontSize: 30,
      fontWeight: '700',
      fill: 0xf4ead6,
      letterSpacing: 2,
      align: 'center',
    },
  });
  t.resolution = 2;
  t.anchor.set(0.5, 0.5);
  t.x = row.x;
  t.y = row.y;
  t.alpha = row.alpha ?? 0.7;
  t.zIndex = 1;
  t.eventMode = 'none';
  engine.entityLayer.addChild(t);
  views.push(t);
  sign = row.text;
}

async function teleport(engine, row) {
  const gate = engine.travelGate(row.to, { via: 'teleporter' });
  if (gate && gate.ok === false) {
    if (gate.msg) engine.toast(gate.msg);
    return;
  }
  teleporting = true;
  try {
    teleports += 1;
    last = row.id;
    publish(engine, Date.now(), true);
    await engine.enter(row.to, { spawnX: row.arrive.x, spawnY: row.arrive.y });
    engine.save?.();
  } finally {
    teleporting = false;
  }
}

export const hiddenFloorsFeature = {
  id: HIDDEN_FLOORS_FEATURE_ID,

  /** The video shows no animals, trees, rocks, vendor, shrine or quoins on the lost floor. */
  ecologyOverride(street) {
    if (!isLostFloorTsid(street?.tsid)) return null;
    return { label: LOST_FLOOR_LABEL, sourceTsid: LOST_FLOOR_SOURCE_TSID, counts: {}, empty: true };
  },

  onStreetEnter(street, engine) {
    clear();
    enteredAt = Date.now();
    if (!street || engine.transientInstance?.() || engine.homeContext?.().inHome) {
      publish(engine, enteredAt, true);
      return;
    }
    boxes = teleportersOn(street.tsid);
    if (isGoorshGamTsid(street.tsid) && street.bounds) canopyTop = CANOPY_Y - street.bounds.t;
    const row = exitSignOn(street.tsid);
    if (row) drawSign(engine, row);
    const want = engine.param('hiddenfloordemo');
    const target = want && boxes.find((b) => b.id === want);
    if (target) demo = { row: target, at: enteredAt + 1200 };
    publish(engine, enteredAt, true);
  },

  onStreetClear() {
    clear();
  },

  onTick(_dtMs, now, engine) {
    if (!engine.started || !engine.player) return;
    const t = Date.now();
    if (demo && t >= demo.at) {
      const { box } = demo.row;
      engine.player.x = box.x;
      engine.player.y = box.y - Math.min(20, box.h / 2);
      engine.player.vx = 0;
      engine.player.vy = 0;
      demo = null;
    }
    publish(engine, t);
    if (!boxes.length || teleporting || t - lastCheck < CHECK_MS) return;
    lastCheck = t;
    if (t - enteredAt < ARRIVAL_GRACE_MS || engine.acting?.() || engine.questDialogueOpen?.()) return;
    const row = boxes.find((r) => inTeleporter(r, engine.player.x, engine.player.y));
    if (row) teleport(engine, row);
  },

  /** Up in Goorsh Gam's treetops the avatar walks and jumps as in the client (see CANOPY_PHYSICS). */
  physics(engine) {
    const p = engine.player;
    if (canopyTop === null || !p || p.y > canopyTop || engine.transientInstance?.()) return null;
    return { ...CANOPY_PHYSICS };
  },

  /** QA / tests. */
  _state() {
    return { boxes: boxes.map((b) => b.id), teleports, last, sign };
  },
};
