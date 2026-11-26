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
 *   asked first (Hell, Pooped). Mada Tamaha's pit (js/hell.js
 *   NARAKA_TELEPORTERS; player report 2026-11-01): a teleporter at each end
 *   of the pit floor puts you back up on that side's floor, on the same
 *   street (no loading, no travel gate: the dead walk Naraka). Northwest
 *   Passage's wintry portal (js/wintry-portal.js; Austin 2026-11-01): a jump
 *   into the snowy oval takes you to Wintry Place, its secret entrance. Level 3
 *   West's pit (js/cave-pit.js, G527): our own stand-in for its lost teleporter,
 *   each end of the pit floor back up to that end's signpost island.
 *   Oppidan Avenue's four (js/seam-teleporters.js, G620): each cave's beam to that end of the
 *   city, each end of the city to that side's cave, as the footage shows.
 *   Yellow Yawning's right end back to Shim Shiri (js/collision-teleporters.js, G681, with the
 *   census of every street's Collision-triggered Teleporters), and the Vortex of Random's back
 *   doors there: Ain't That Dry and Chiti Tiga to each other, Harrisa Hara to Snowed In and back
 *   (reports #707, #708), and Koulato Cluster's hidden-ladder wormhole to Ruta Asuncion (#710).
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
 *   forgotten_to_odena, ilmenskie_to_missing, missing_to_ilmenskie,
 *   level3west_pit_left, level3west_pit_right, aint_that_dry_to_chiti_tiga,
 *   chiti_tiga_to_aint_that_dry, harrisa_hara_to_snowed_in, snowed_in_to_harrisa_hara,
 *   koulato_cluster_to_ruta_asuncion). Canvas
 *   data: hiddenFloorBoxes, hiddenFloorSign, hiddenFloorLast,
 *   hiddenFloorTeleports, hiddenFloorFeet (feet height over the street's
 *   lowest box bottom, for jump QA), hiddenFloorCanopy (client physics on),
 *   hiddenFloorBumps (ceiling bumps on this street).
 */

import {
  CANOPY_PHYSICS,
  ILMENSKIE_CEILINGS,
  LOST_FLOOR_LABEL,
  TELEPORTERS,
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
} from '../hidden-floors.js?v=17a8b20b';
import { narakaTeleportersOn } from '../hell.js?v=d77f15ef';
import { wintryPortalTeleportersOn } from '../wintry-portal.js?v=1437deda';
import { cavePitTeleportersOn } from '../cave-pit.js?v=81e62950';
import { seamTeleportersOn } from '../seam-teleporters.js?v=09d11340';
import { WIRED_TELEPORTERS, collisionTeleportersOn } from '../collision-teleporters.js?v=73c97f41';
import { WORLD_FONT_FAMILY } from '../world-text.js?v=6b49f88c';

export const HIDDEN_FLOORS_FEATURE_ID = 'hidden-floors';

/** Every walk-in teleporter wired on a street (the boxes this feature runs there). */
export function walkInTeleportersOn(tsid) {
  return [...teleportersOn(tsid), ...narakaTeleportersOn(tsid), ...wintryPortalTeleportersOn(tsid), ...cavePitTeleportersOn(tsid), ...seamTeleportersOn(tsid), ...collisionTeleportersOn(tsid)];
}

/** No boxes in a home or an instance (onStreetEnter). */
const noTeleporters = (street, engine) => !street || engine?.transientInstance?.() || engine?.homeContext?.().inHome;
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
      fontFamily: WORLD_FONT_FAMILY,
      fontSize: row.fontSize ?? 30,
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
  // On its own street (pc.teleportToLocation to the street it is on): stand at the target.
  if (row.same) {
    const p = engine.player;
    p.x = row.arrive.x;
    p.y = row.arrive.y;
    p.vx = 0;
    p.vy = 0;
    p.onGround = false;
    engine.snapCamera?.();
    teleports += 1;
    last = row.id;
    publish(engine, Date.now(), true);
    engine.save?.();
    return;
  }
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
    // R46: a trip that failed (it said so) took you nowhere, so it does not count.
    if ((await engine.enter(row.to, { spawnX: row.arrive.x, spawnY: row.arrive.y })) === false) {
      teleports = Math.max(0, teleports - 1);
      publish(engine, Date.now(), true);
      return;
    }
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

  /**
   * G888: the floors' teleporters are their roads back (the forgotten floor past its EXIT to Odena
   * Odes, the lost floor to Goorsh Gam, the missing floor to Ilmenskie): no dead-end exit there
   * (features/dead-ends-feature.js).
   */
  urRoads() {
    return [...TELEPORTERS, ...WIRED_TELEPORTERS].map((t) => ({ from: t.from, to: t.to }));
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
    if (noTeleporters(street, engine)) {
      publish(engine, enteredAt, true);
      return;
    }
    boxes = walkInTeleportersOn(street.tsid);
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

  /** #645 (Austin 2026-11-26): the street's teleporters, for the street map's portal buttons (ui/street-minimap.js teleporterMarks). */
  minimapTeleporters(street, engine) {
    if (noTeleporters(street, engine)) return null;
    const rows = walkInTeleportersOn(street.tsid);
    return rows.length ? rows : null;
  },

  /** #645: a portal button's click travels where walking into its box does (the same teleport, travelGate first). */
  teleportFromMap(id, engine) {
    const row = boxes.find((b) => b.id === id);
    if (!row || teleporting) return null;
    teleport(engine, row);
    return true;
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
