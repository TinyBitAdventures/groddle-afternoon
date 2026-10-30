/**
 * The hidden floors (register rows G92, G105; data in js/hidden-floors.js).
 *
 * - Collision-triggered Teleporters (items/teleporter.js onPlayerCollision:
 *   pc.teleportToLocation to the target, no sound): Goorsh Gam's top-left
 *   treetop -> the lost floor, and the corner past its EXIT back; Odena
 *   Odes' ceiling pocket over the right end of the cave chamber (a plain
 *   jump falls short: triple jump, spinach or levitation) -> the forgotten
 *   floor, and the corner past its EXIT back; Ilmenskie's top-right ledge
 *   (a running Triple Jump off the mushroom caps) -> the missing floor, and
 *   its right end back. The avatar's feet must enter the box; travelGate is
 *   asked first (Hell, Pooped).
 * - The painted "EXIT" on both floors: the forgotten floor's archived
 *   sign_txt and, on the lost floor, the word read off the footage.
 * - Goorsh Gam's canopy and Ilmenskie's cave mouth: there the avatar walks
 *   and jumps with the client's numbers (the puzzle streets' SOURCE_PHYSICS),
 *   as the 2011-12-15 routes need (CANOPY_PHYSICS, clientPhysicsZone).
 * - Ilmenskie's three 2011-12-15 ceilings (platform_pc_perm 1) are taken out
 *   of the walkable platforms (prepareStreet) and stop a rising head instead.
 * - Ecology: the lost and missing floors show no animals, trees, vendor or shrine.
 *
 * QA: ?autostart=1&questoffer=off&streetdemo=GIF16GDJ89724E3&streetx=140&streety=126
 *   (Goorsh Gam's top-left treetop: jump), streetdemo=GA9KL9UE1D82RFO&streetx=2716&streety=1440
 *   (under Odena Odes' pocket: triple jump), streetdemo=GA9QUBPI49J2MOB (the lost floor),
 *   streetdemo=GIF102FDNU11314&streetx=5470&streety=531&jumpdemo=big (Ilmenskie's
 *   mushroom cap: run right and triple jump), streetdemo=GUV1CSSE49J2P2C (the missing floor).
 *   &hiddenfloordemo=<teleporter id> drops the avatar into that box on the
 *   street that has it (goorsh_to_lost, lost_to_goorsh, odena_to_forgotten,
 *   forgotten_to_odena, ilmenskie_to_missing, missing_to_ilmenskie). Canvas
 *   data: hiddenFloorBoxes, hiddenFloorSign, hiddenFloorLast,
 *   hiddenFloorTeleports, hiddenFloorFeet (feet height over the street's
 *   lowest box bottom, for jump QA), hiddenFloorCanopy (client physics on),
 *   hiddenFloorBumps (ceiling bumps on this street).
 */

import {
  CANOPY_PHYSICS,
  ILMENSKIE_CEILINGS,
  LOST_FLOOR_LABEL,
  LOST_FLOOR_SOURCE_TSID,
  MISSING_FLOOR_LABEL,
  MISSING_FLOOR_SOURCE_TSID,
  bumpCeiling,
  ceilingsScreen,
  clientPhysicsZone,
  exitSignOn,
  inTeleporter,
  isIlmenskieTsid,
  isLostFloorTsid,
  isMissingFloorTsid,
  teleportersOn,
} from '../hidden-floors.js?v=g478-1';

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
let zone = null; // { minX, maxY } screen space where the client's walk and jump apply
let ceilings = []; // Ilmenskie's pc_perm 1 lines, screen space
let bumps = 0;
let prev = null; // last tick's feet, for ceiling crossings

function clear() {
  for (const v of views) {
    if (v.parent) v.parent.removeChild(v);
    if (!v.destroyed) v.destroy();
  }
  views = [];
  boxes = [];
  sign = '';
  demo = null;
  zone = null;
  ceilings = [];
  bumps = 0;
  prev = null;
}

const inZone = (p) => !!(zone && p && p.x >= zone.minX && p.y <= zone.maxY);

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
  engine.setData('hiddenFloorCanopy', inZone(p) ? 1 : 0);
  engine.setData('hiddenFloorBumps', bumps);
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

  /** The video and the Snaps show no animals, trees, rocks, vendor, shrine or quoins on the lost and missing floors. */
  ecologyOverride(street) {
    if (isLostFloorTsid(street?.tsid)) return { label: LOST_FLOOR_LABEL, sourceTsid: LOST_FLOOR_SOURCE_TSID, counts: {}, empty: true };
    if (isMissingFloorTsid(street?.tsid)) return { label: MISSING_FLOOR_LABEL, sourceTsid: MISSING_FLOOR_SOURCE_TSID, counts: {}, empty: true };
    return null;
  },

  /** Ilmenskie's ceilings are solid only from below (PlatformLine.as): not floors to land on. */
  prepareStreet(street) {
    if (!isIlmenskieTsid(street?.tsid) || !Array.isArray(street.platforms)) return;
    const out = street.platforms.filter((p) => ILMENSKIE_CEILINGS.includes(p?.id) && Number(p.pc_perm) === 1);
    if (!out.length) return;
    street._hiddenFloorCeilings = [...(street._hiddenFloorCeilings || []), ...out];
    street.platforms = street.platforms.filter((p) => !out.includes(p));
  },

  onStreetEnter(street, engine) {
    clear();
    enteredAt = Date.now();
    if (!street || engine.transientInstance?.() || engine.homeContext?.().inHome) {
      publish(engine, enteredAt, true);
      return;
    }
    boxes = teleportersOn(street.tsid);
    zone = clientPhysicsZone(street);
    if (isIlmenskieTsid(street.tsid)) ceilings = ceilingsScreen(street);
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
    if (ceilings.length) {
      const p = engine.player;
      const y = prev ? bumpCeiling(ceilings, prev.x, prev.y, p.x, p.y) : null;
      if (y !== null) {
        p.y = y;
        if (p.vy < 0) p.vy = 0;
        bumps += 1;
      }
      prev = { x: p.x, y: p.y };
    }
    publish(engine, t);
    if (!boxes.length || teleporting || t - lastCheck < CHECK_MS) return;
    lastCheck = t;
    if (t - enteredAt < ARRIVAL_GRACE_MS || engine.acting?.() || engine.questDialogueOpen?.()) return;
    const row = boxes.find((r) => inTeleporter(r, engine.player.x, engine.player.y));
    if (row) teleport(engine, row);
  },

  /** Up in Goorsh Gam's treetops and Ilmenskie's cave mouth the avatar walks and jumps as in the client (see CANOPY_PHYSICS). */
  physics(engine) {
    if (!inZone(engine.player) || engine.transientInstance?.()) return null;
    return { ...CANOPY_PHYSICS };
  },

  /** QA / tests. */
  _state() {
    return { boxes: boxes.map((b) => b.id), teleports, last, sign, ceilings: ceilings.map((c) => c.id), bumps };
  },
};
