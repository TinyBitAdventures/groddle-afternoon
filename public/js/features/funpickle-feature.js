/**
 * Señor Funpickle, the Special Item That Only Beta Testers Get (register G209),
 * in the world. Rules and copy: js/funpickle.js
 * (items/special_item_that_only_beta_testers_get.js).
 *
 * - The street find: from level 30 about one public street in 40 holds it,
 *   lying on the ground in its in-location state (Tiny Speck's x1_1 sheet).
 *   Pick up puts it in the pack; it never turns up again. A rare late-game
 *   find in place of the beta testers' gift (Austin 2026-10-25, desk
 *   FUNPICKLE), like Goodnight Groddle (js/musicblocks.js).
 * - Pack: Procrastinate, Ignore, Begrudge, Respect, Enjoy, Infer, Admire
 *   (deployItem): Too Much Fun for 5 minutes, the item hops out 75 px in front
 *   of you, bounces after 1 s with its own sound (the x1_bounce2 sheet, 160
 *   frames at 30 fps) and uses a power after 6 s, then goes back in the pack.
 *   While it bounces it cannot be picked up (canPickup). Leave the street and
 *   it just comes back (tryAddToPack).
 * - Powers (usePower 536-591): Moonwalk, Comedian (your next chat line makes
 *   everyone laugh), Sneezing Fit (a sneeze every 3 s for 30 s: two Beans, the
 *   ah-choo overlay, -3 mood), Scream (Wilhelm, two black flashes, -5 mood),
 *   Broken Teleporter (a black wash, two lines to click through, then a
 *   random public street) and Pack Exploder (up to five cheap things fly out
 *   of your pack onto the street). Seeing all six sends Musicblock GNG once.
 * - Solo: there are no other players, so the mood the source gave everyone
 *   else on the street shows over your local companions; Give (to another
 *   player) is not offered.
 *
 * QA: ?autostart=1&funpickledemo=pack puts it in your pack (no cooldown);
 * &funpickledemo=find lays it on this street beside you. &funpicklepower=
 * moonwalk|comedian|sneezingFit|scream|brokenTeleporter|packExploder forces
 * the power; &funpickleseen=<n> marks the first n powers seen (5 then shows
 * the award); &funpickleautoplay=1 picks it up if it lies here and admires it.
 * &funpickledest=<tsid> makes the Broken Teleporter land on that street.
 * Canvas data: funpickleOwned, funpicklePlaced, funpicklePhase, funpickleLast,
 * funpicklePowers, funpickleAward, funpickleSneezes, funpickleOverlay.
 */

import { ITEM_CATALOG, addItem, countItem, ensureItem, removeItem } from '../inventory.js?v=catalog-unified-7';
import { ITEM_BASE_COSTS } from '../store-catalog.js';
import { shiftMetabolic } from '../metabolics.js';
import { createSheetLoader, pixiSpeed } from '../sprite-sheets.js?v=g430-1';
import { frameTexture, sourceFromUrl, textureFromUrl } from '../textures.js';
import { landingY, nearestSurfaceY } from '../walk-surface.js';
import { STREET_INDEX } from '../street-loader.js';
import { GENTLE_ISLAND_TSIDS, isNewxpSceneTsid } from '../newxp.js?v=newxp-4';
import { OVERLAY_BASE, cellRect, loadOverlayManifest, overlayAlpha, overlayFrameAt, standPlacement, trackOverlay } from '../overlay-art.js?v=g311-1';
import {
  AWARD_ITEM,
  AWARD_LINE,
  BOUNCE_MS,
  BOUNCE_SOUND,
  COMEDIAN_LINE,
  COMEDIAN_OTHERS_MOOD,
  COMEDIAN_SOUND,
  COOLDOWN_BUFF,
  DEPLOY_OFFSET,
  FUNPICKLE,
  FUNPICKLE_ITEM,
  IN_USE_REASON,
  INVOKE_LINE,
  PACK_EXPLODER_NOTHING,
  PICKUP_TOOLTIP,
  POWERS,
  POWER_LINES,
  POWER_MS,
  PUBLIC_HUBS,
  SCREAM_LINES,
  SCREAM_MOOD,
  SCREAM_STEPS,
  SNEEZE_BEANS,
  SNEEZE_END_LINE,
  SNEEZE_EVERY_MS,
  SNEEZE_LINES,
  SNEEZE_MOOD,
  SNEEZE_OTHERS_MOOD,
  SNEEZE_OVERLAY,
  SNEEZE_SOUND,
  TELEPORTER_WASH,
  brokenTeleporterLines,
  choosePower,
  funpickleVerbButtons,
  isFunpickleVerb,
  normalizeFunpickleState,
  packExploderLine,
  packExploderPicks,
  packExploderX,
  pickRandomTeleport,
  recordPower,
  shouldPlaceFind,
} from '../funpickle.js';

export const FUNPICKLE_FEATURE_ID = 'funpickle';

const FIND_GROUP = 'funpickleFind';
const ART = 'assets/sprites/small-items/';
/** OGA special_item_that_only_beta_testers_get__x1_1: 125 x 227, the item's registration at (48, 214). */
const STILL = Object.freeze({ path: `${ART}funpickle_1.png`, w: 125, h: 227, ax: 48 / 125, ay: 214 / 227 });
/** OGA __x1_bounce2: 32 x 5 cells of 125 x 227, 160 frames (SWF sprite 4 frames 123-282), 30 fps. */
const BOUNCE_SHEET = Object.freeze({ path: `${ART}funpickle_bounce2.webp`, fw: 125, fh: 227, cols: 32, frames: 160 });
/** The source's last sneeze line is on the tenth ("Wait, it feels like this is the last one."). */
const MAX_SNEEZES = 10;

let st = normalizeFunpickleState();
let engineRef = null;
let loader = null;
let findView = null; // { sprite, glow, target }
let deployment = null; // { tsid, at, x, y, bounced, sprite, target }
let overlay = null; // { sprite, at, release }
let sneezeArt = null;
let sneezeArtFailed = false;
const sneezeFrames = new Map();
let washEl = null;
let last = '';
let demoDone = false;
let autoplayAt = 0;
let chatBound = false;

const now = () => Date.now();

/* ------------------------------------------------------------------ */
/* Helpers                                                              */
/* ------------------------------------------------------------------ */

function ensureItems() {
  ensureItem(FUNPICKLE, { ...FUNPICKLE_ITEM, tags: [...FUNPICKLE_ITEM.tags] });
}

function owned(engine) {
  return countItem(engine.inv, FUNPICKLE) > 0;
}

function playerName(engine) {
  return engine.whoIsHere?.()[0] || 'Ur';
}

function introDone(engine) {
  // has_done_intro: false only in the new player experience (the clouds, training and Gentle Island).
  const tsid = String(engine.streetTsid || '');
  return !(isNewxpSceneTsid(tsid) || GENTLE_ISLAND_TSIDS.includes(tsid));
}

function verbCtx(engine) {
  return { cooldown: engine.hasBuff(COOLDOWN_BUFF), introDone: introDone(engine), inUse: Boolean(deployment) };
}

function surfaceY(engine, x, refY) {
  const y = nearestSurfaceY(engine.platforms, x, refY);
  return Number.isFinite(y) ? y : refY;
}

function clampX(engine, x) {
  const w = Number(engine.worldW) || 0;
  return w > 48 ? Math.max(24, Math.min(w - 24, x)) : x;
}

function isPublicStreet(tsid) {
  const hub = STREET_INDEX.streets?.[tsid]?.hubId;
  return hub != null && PUBLIC_HUBS.includes(String(hub));
}

function eligible(engine, tsid) {
  return isPublicStreet(tsid) && !engine.transientInstance?.();
}

/** metabolics_lose_mood / metabolics_add_mood on you. */
function changeMood(engine, delta) {
  const pc = engine.pc;
  if (!pc) return 0;
  // G300: through the doors (js/metabolics.js shiftMetabolic).
  const changed = shiftMetabolic(pc, 'mood', delta);
  engine.updateHud?.();
  return changed;
}

/** The mood the source gave every other player on the street, over your companions. */
function cheerCompanions(engine, mood, emotion = null) {
  for (const actor of engine.localCompanions || []) {
    const s = actor?.sprite;
    if (!s || s.destroyed) continue;
    engine.floatText?.(s.x, s.y - 90, `+${mood} mood`, 0xf6c35b);
    // catalog_buffs.js 470-472: the others playEmotionAnimation('happy') (a vector companion's emote).
    if (emotion) actor.body?.npc?.emote?.(emotion);
  }
}

function say(engine, line, ms = 3600) {
  engine.pushActivity?.(line);
  engine.toast?.(line, ms);
}

function publish(engine) {
  if (!engine?.setData) return;
  engine.setData('funpickleOwned', owned(engine) ? '1' : '0');
  engine.setData('funpicklePlaced', st.placed ? st.placed.tsid : '');
  engine.setData('funpicklePhase', deployment ? (deployment.bounced ? 'bounce' : 'still') : 'idle');
  engine.setData('funpickleLast', last);
  engine.setData('funpicklePowers', Object.keys(st.powersUsed).join(','));
  engine.setData('funpickleAward', st.givenAward ? '1' : '0');
  engine.setData('funpickleSneezes', String(st.sneezes || 0));
}

/* ------------------------------------------------------------------ */
/* World sprites                                                        */
/* ------------------------------------------------------------------ */

function stillSprite(engine, x, y) {
  const { PIXI } = engine;
  const sprite = new PIXI.AnimatedSprite([textureFromUrl(STILL.path)]);
  sprite.anchor.set(STILL.ax, STILL.ay);
  sprite.x = x;
  sprite.y = y;
  sprite.zIndex = 27;
  sprite.eventMode = 'static';
  sprite.cursor = 'pointer';
  engine.entityLayer.addChild(sprite);
  return sprite;
}

function clearFind(engine) {
  if (!findView) return;
  engine?.unregister?.(findView.target);
  if (findView.sprite && !findView.sprite.destroyed) findView.sprite.destroy();
  if (findView.glow && !findView.glow.destroyed) findView.glow.destroy();
  findView = null;
}

function spawnFind(engine) {
  clearFind(engine);
  const p = st.placed;
  if (!p || !engine.PIXI || !engine.entityLayer) return;
  const y = surfaceY(engine, p.x, p.y);
  // No drawn glow round it (Austin, desk FUNTUNE): the original never marked items on the ground.
  const glow = null;
  const sprite = stillSprite(engine, p.x, y);
  const target = engine.register({
    classId: FUNPICKLE,
    featureId: FUNPICKLE_FEATURE_ID,
    label: FUNPICKLE_ITEM.label,
    subtitle: 'A rare find',
    sprite,
    state: { kind: 'find' },
  });
  findView = { sprite, glow, target };
}

function clearDeploySprite(engine) {
  if (!deployment) return;
  if (deployment.target) engine?.unregister?.(deployment.target);
  if (deployment.sprite && !deployment.sprite.destroyed) deployment.sprite.destroy();
  deployment.sprite = null;
  deployment.target = null;
}

function spawnDeploySprite(engine) {
  if (!deployment || !engine.PIXI || !engine.entityLayer) return;
  const sprite = stillSprite(engine, deployment.x, deployment.y);
  sprite.zIndex = 44;
  deployment.sprite = sprite;
  deployment.target = engine.register({
    classId: FUNPICKLE,
    featureId: FUNPICKLE_FEATURE_ID,
    label: FUNPICKLE_ITEM.label,
    subtitle: 'Moving around',
    sprite,
    state: { kind: 'deployed' },
  });
}

/** bounce 296-301: state bounce2 and the item's sound. */
function startBounce(engine) {
  deployment.bounced = true;
  engine.playSound?.(BOUNCE_SOUND, { volume: 0.7 });
  const sprite = deployment.sprite;
  if (!sprite || sprite.destroyed) return;
  loader ||= createSheetLoader(engine.PIXI);
  loader.load(BOUNCE_SHEET).then(() => {
    if (!deployment || deployment.sprite !== sprite || sprite.destroyed) return;
    const frames = loader.frames(BOUNCE_SHEET);
    if (!frames.length) return;
    sprite.textures = frames;
    sprite.animationSpeed = pixiSpeed(30);
    sprite.loop = true;
    sprite.play();
  });
}

/* ------------------------------------------------------------------ */
/* The street find                                                      */
/* ------------------------------------------------------------------ */

function pickUpFind(engine) {
  if (!st.placed) return false;
  addItem(engine.inv, FUNPICKLE, 1);
  st.found = true;
  st.placed = null;
  const x = findView?.sprite?.x ?? engine.player?.x ?? 0;
  const y = findView?.sprite?.y ?? engine.player?.y ?? 0;
  clearFind(engine);
  const line = `You picked up 1× ${FUNPICKLE_ITEM.label}.`;
  say(engine, line);
  engine.floatText?.(x, y - 55, `+1 ${FUNPICKLE_ITEM.label}`, 0x7dcea0);
  engine.playSound?.('ITEM_PICKUP', { volume: 0.65 });
  engine.achievement?.(`in_inventory:${FUNPICKLE}`, 1);
  last = 'pickup';
  engine.refreshPack?.();
  engine.save?.();
  publish(engine);
  return true;
}

/* ------------------------------------------------------------------ */
/* Deploy and powers                                                    */
/* ------------------------------------------------------------------ */

/** deployItem 349-370. */
function deploy(engine, verbId) {
  const button = funpickleVerbButtons(verbCtx(engine))[0];
  if (!button.enabled) {
    engine.toast?.(button.reason, 3000);
    return true;
  }
  if (!owned(engine) || !engine.player) return true;
  removeItem(engine.inv, FUNPICKLE, 1);
  st.out = true;
  engine.applyBuff('beta_item_cooldown');
  const p = engine.player;
  const facing = p.facing === 'left' ? -1 : 1;
  const x = clampX(engine, p.x + facing * DEPLOY_OFFSET);
  deployment = { tsid: engine.streetTsid, at: now(), x, y: surfaceY(engine, x, p.y), bounced: false, sprite: null, target: null, verb: verbId };
  spawnDeploySprite(engine);
  engine.pushActivity?.(INVOKE_LINE);
  last = `deploy:${verbId}`;
  engine.refreshPack?.();
  engine.save?.();
  publish(engine);
  return true;
}

/** tryAddToPack / the end of usePower: back in the pack. */
function returnToPack(engine) {
  st.out = false;
  if (!owned(engine)) addItem(engine.inv, FUNPICKLE, 1);
  engine.refreshPack?.();
  engine.save?.();
}

function forcedPower(engine) {
  const p = engine.param?.('funpicklepower');
  return POWERS.includes(p) ? p : null;
}

/** usePower 536-591. */
function usePower(engine) {
  const d = deployment;
  clearDeploySprite(engine);
  deployment = null;
  if (!d || engine.streetTsid !== d.tsid) {
    last = 'returned';
    returnToPack(engine);
    publish(engine);
    return;
  }
  const power = forcedPower(engine) || choosePower(st);
  if (recordPower(st, power)) {
    // giveAward: createItemFromGround('musicblock_goodnight_groddle').
    engine.pushActivity?.(AWARD_LINE);
    engine.toast?.(AWARD_LINE, 6000);
    addItem(engine.inv, AWARD_ITEM, 1);
    engine.achievement?.(`in_inventory:${AWARD_ITEM}`, 1);
  }
  last = power;
  POWER_RUN[power]?.(engine);
  returnToPack(engine);
  publish(engine);
}

function moonwalk(engine) {
  say(engine, POWER_LINES.moonwalk);
  // buffs_apply restarts a running buff.
  if (engine.hasBuff('moonwalk')) engine.removeBuff('moonwalk');
  engine.applyBuff('moonwalk');
  // catalog_buffs.js moonwalk on_apply: announce_sound_to_all('MOONWALK').
  engine.playSound?.('MOONWALK', { volume: 0.6 });
}

function comedian(engine) {
  say(engine, POWER_LINES.comedian);
  if (engine.hasBuff('comedian')) engine.removeBuff('comedian');
  engine.applyBuff('comedian');
}

function sneezingFit(engine) {
  say(engine, POWER_LINES.sneezingFit);
  if (engine.hasBuff('sneezing_fit')) engine.removeBuff('sneezing_fit');
  engine.applyBuff('sneezing_fit');
  st.sneezes = 0;
}

function scream(engine) {
  say(engine, SCREAM_LINES[Math.floor(Math.random() * SCREAM_LINES.length)]);
  engine.playSound?.('WILHELM_SCREAM', { volume: 0.8 });
  canvasSteps(SCREAM_STEPS, { remove: true });
  changeMood(engine, -SCREAM_MOOD);
}

function brokenTeleporter(engine) {
  canvasSteps([{ alpha: 0, secs: 0 }, TELEPORTER_WASH], { remove: false });
  const lines = brokenTeleporterLines(playerName(engine));
  const finish = () => {
    clearWash();
    // QA &funpickledest=<tsid> picks the street the random teleport lands on.
    const dest = String(engine.param?.('funpickledest') || '');
    const tsid = STREET_INDEX.streets?.[dest] ? dest : pickRandomTeleport(STREET_INDEX.streets, Math.random, (t) =>
      t !== engine.streetTsid && engine.streetExists?.(t) && engine.travelGate?.(t)?.ok !== false);
    last = `brokenTeleporter:${tsid || 'none'}`;
    publish(engine);
    if (tsid) engine.travel?.(tsid, { via: 'teleport' });
  };
  // vp_overlay delay_ms 500, width 400, click_to_advance; the wash is the vp_canvas.
  setTimeout(() => {
    if (engine.vog) engine.vog({ lines, width: 400, fadeAlpha: 0, onComplete: finish });
    else finish();
  }, 500);
}

function packExploder(engine) {
  const picks = packExploderPicks(engine.inv, {
    baseCost: (id) => ITEM_CATALOG[id]?.baseCost ?? ITEM_BASE_COSTS[id] ?? 0,
    tags: (id) => ITEM_CATALOG[id]?.tags || [],
  });
  if (!picks.length) {
    // The source also sent the "fool and their money" line with an empty list; only this one reads.
    say(engine, PACK_EXPLODER_NOTHING);
    return;
  }
  const p = engine.player;
  const names = [];
  for (const id of picks) {
    if (!removeItem(engine.inv, id, 1)) continue;
    names.push(ITEM_CATALOG[id]?.label || id.replace(/_/g, ' '));
    const x = clampX(engine, packExploderX(p.x));
    const below = landingY(engine.platforms, x, p.y - 50);
    const y = Number.isFinite(below) ? below : surfaceY(engine, x, p.y);
    engine.dropWorldStack?.(id, 1, x, y);
  }
  say(engine, packExploderLine(names), 6000);
  engine.refreshPack?.();
}

const POWER_RUN = Object.freeze({ moonwalk, comedian, sneezingFit, scream, brokenTeleporter, packExploder });

/* ------------------------------------------------------------------ */
/* Comedian: your next chat line                                        */
/* ------------------------------------------------------------------ */

/** main.js 1712-1715: any local chat line (not a /command) ends Comedian; on_remove does the rest. */
function onChatSubmit(event) {
  const engine = engineRef;
  if (!engine?.started || event?.target?.id !== 'local-chat-form') return;
  const text = String(document.getElementById('local-chat-input')?.value || '').trim();
  if (!text || text.startsWith('/') || !engine.hasBuff('comedian')) return;
  // After the game has posted your line.
  setTimeout(() => endComedian(engine), 0);
}

export function endComedian(engine) {
  if (!engine.hasBuff('comedian')) return false;
  engine.removeBuff('comedian');
  engine.playSound?.(COMEDIAN_SOUND, { volume: 0.7 });
  say(engine, COMEDIAN_LINE);
  cheerCompanions(engine, COMEDIAN_OTHERS_MOOD, 'happy');
  last = 'comedian:laugh';
  publish(engine);
  return true;
}

/* ------------------------------------------------------------------ */
/* Sneezing Fit                                                         */
/* ------------------------------------------------------------------ */

function tickSneezes(engine, t) {
  const row = engine.buffRow?.('sneezing_fit');
  if (!row) {
    if (st.sneezes > 0) {
      // on_remove.
      say(engine, SNEEZE_END_LINE, 5000);
      st.sneezes = 0;
      engine.save?.();
      publish(engine);
    }
    return;
  }
  const due = Math.min(MAX_SNEEZES, Math.floor((t - (row.appliedAt || t)) / SNEEZE_EVERY_MS));
  // A reload in the middle catches up to now with one sneeze, not a burst.
  if (due > (st.sneezes || 0)) {
    st.sneezes = due;
    sneeze(engine, due);
  }
}

/** sneezing_fit on_tick. */
function sneeze(engine, count) {
  const p = engine.player;
  engine.playSound?.(SNEEZE_SOUND, { volume: 0.7 });
  showSneezeOverlay(engine);
  cheerCompanions(engine, SNEEZE_OTHERS_MOOD);
  changeMood(engine, -SNEEZE_MOOD);
  if (p) engine.dropWorldStack?.('bean_plain', SNEEZE_BEANS, clampX(engine, p.x), surfaceY(engine, p.x, p.y));
  if (SNEEZE_LINES[count]) engine.pushActivity?.(SNEEZE_LINES[count]);
  last = `sneeze:${count}`;
  engine.save?.();
  publish(engine);
}

function sneezeTexture(cellIndex) {
  let t = sneezeFrames.get(cellIndex);
  if (!t) {
    const c = cellRect(sneezeArt, cellIndex);
    t = frameTexture(sourceFromUrl(`${OVERLAY_BASE}${sneezeArt.file}`), new globalThis.PIXI.Rectangle(c.x, c.y, c.w, c.h));
    sneezeFrames.set(cellIndex, t);
  }
  return t;
}

function clearOverlay() {
  overlay?.release?.();
  if (overlay?.sprite && !overlay.sprite.destroyed) overlay.sprite.destroy();
  overlay = null;
}

/** pc_overlay overlay_sneezing_powder: 300 x 300 at delta_y -110 for 2 s. */
function showSneezeOverlay(engine) {
  clearOverlay();
  const layer = engine.fxLayer || engine.entityLayer;
  if (!engine.PIXI || !layer) return;
  if (!sneezeArt) {
    if (!sneezeArtFailed) {
      loadOverlayManifest()
        .then((m) => {
          if (!m?.[SNEEZE_OVERLAY.key]) throw new Error('no sneeze overlay');
          sneezeArt = m[SNEEZE_OVERLAY.key];
        })
        .catch(() => { sneezeArtFailed = true; });
    }
    return;
  }
  const sprite = new engine.PIXI.Sprite(sneezeTexture(sneezeArt.order[0]));
  sprite.zIndex = 60;
  sprite.eventMode = 'none';
  layer.addChild(sprite);
  overlay = { sprite, at: now(), release: null };
  // G311: a pc_overlay, so a move takes it down (cancelAllOverlaysWeCan 193-215); the fit's
  // own timer goes on (the buff's on_tick), and the next sneeze shows on the new street.
  const mine = overlay;
  mine.release = trackOverlay(() => {
    mine.release = null;
    if (overlay === mine) clearOverlay();
    engine.setData?.('funpickleOverlay', 'cancelled');
  });
  engine.setData?.('funpickleOverlay', SNEEZE_OVERLAY.key);
}

function tickOverlay(engine, t) {
  if (!overlay?.sprite || overlay.sprite.destroyed || !sneezeArt) return;
  const p = engine.player;
  const ms = t - overlay.at;
  if (!p || ms > SNEEZE_OVERLAY.durationMs + 400) {
    clearOverlay();
    return;
  }
  const frame = overlayFrameAt(sneezeArt, ms, { loop: false });
  overlay.sprite.texture = sneezeTexture(sneezeArt.order[frame]);
  // The stage fits the 300 x 300 box (ArbitrarySWFView) and stands 110 px above
  // your feet (a pc_overlay's registration is center_bottom, G251).
  const at = standPlacement(sneezeArt, p.x, p.y + SNEEZE_OVERLAY.dy, Math.max(SNEEZE_OVERLAY.width, SNEEZE_OVERLAY.height));
  overlay.sprite.x = at.left;
  overlay.sprite.y = at.top;
  overlay.sprite.width = at.width;
  overlay.sprite.height = at.height;
  overlay.sprite.alpha = overlayAlpha(ms, SNEEZE_OVERLAY.durationMs);
}

/* ------------------------------------------------------------------ */
/* vp_canvas: a black wash over the street                              */
/* ------------------------------------------------------------------ */

function viewHost() {
  if (typeof document === 'undefined') return null;
  return document.getElementById('game-root') || document.body;
}

function clearWash() {
  washEl?.remove();
  washEl = null;
}

/** Tween the wash through {alpha, secs} steps (each step eases from the last alpha). */
function canvasSteps(steps, { remove = true } = {}) {
  const host = viewHost();
  if (!host) return;
  clearWash();
  const el = document.createElement('div');
  el.className = 'funpickle-canvas';
  el.style.cssText = 'position:absolute;inset:0;z-index:86;pointer-events:none;background:#000;opacity:0';
  host.appendChild(el);
  washEl = el;
  const total = steps.reduce((a, s) => a + s.secs, 0);
  if (typeof el.animate !== 'function' || total <= 0) {
    el.style.opacity = String(steps[steps.length - 1]?.alpha ?? 0);
    return;
  }
  let t = 0;
  const frames = [{ opacity: 0, offset: 0 }];
  for (const s of steps) {
    t += s.secs;
    frames.push({ opacity: s.alpha, offset: Math.min(1, t / total) });
  }
  const anim = el.animate(frames, { duration: total * 1000, fill: 'forwards' });
  if (remove) anim.onfinish = () => { if (washEl === el) clearWash(); else el.remove(); };
}

/* ------------------------------------------------------------------ */
/* QA                                                                   */
/* ------------------------------------------------------------------ */

function setupDemo(engine) {
  const demo = engine.param?.('funpickledemo');
  if (demoDone || !demo) return;
  demoDone = true;
  const seen = Math.max(0, Math.min(POWERS.length, Math.floor(Number(engine.param('funpickleseen')) || 0)));
  for (const id of POWERS.slice(0, seen)) st.powersUsed[id] = 1;
  if (engine.hasBuff(COOLDOWN_BUFF)) engine.removeBuff(COOLDOWN_BUFF);
  if (demo === 'find') {
    if (!owned(engine) && engine.player) {
      st.found = false;
      const x = clampX(engine, engine.player.x + 160);
      st.placed = { tsid: engine.streetTsid, x, y: surfaceY(engine, x, engine.player.y) };
      spawnFind(engine);
    }
  } else if (!owned(engine)) {
    addItem(engine.inv, FUNPICKLE, 1);
    st.found = true;
    st.placed = null;
    clearFind(engine);
    engine.refreshPack?.();
  }
  if (engine.param('funpickleautoplay') === '1') autoplayAt = now() + 2500;
  publish(engine);
}

function tickAutoplay(engine, t) {
  if (!autoplayAt || t < autoplayAt) return;
  autoplayAt = 0;
  if (st.placed?.tsid === engine.streetTsid) pickUpFind(engine);
  if (owned(engine)) deploy(engine, 'admire');
}

/* ------------------------------------------------------------------ */
/* Feature                                                              */
/* ------------------------------------------------------------------ */

export const funpickleFeature = {
  id: FUNPICKLE_FEATURE_ID,

  init(engine) {
    engineRef = engine;
    ensureItems();
    if (!chatBound && typeof document !== 'undefined') {
      document.addEventListener('submit', onChatSubmit, true);
      chatBound = true;
    }
  },

  placementGroups(population, street) {
    const engine = engineRef;
    if (!engine || !street?.tsid) return [];
    const place = shouldPlaceFind(st, {
      tsid: street.tsid,
      level: engine.pc?.level,
      owned: owned(engine),
      eligible: isPublicStreet(street.tsid),
    });
    return place ? [{ key: FIND_GROUP, count: 1, clearance: 70 }] : [];
  },

  onStreetEnter(street, engine) {
    ensureItems();
    clearFind(engine);
    const tsid = street?.tsid || engine.streetTsid;
    if (shouldPlaceFind(st, { tsid, level: engine.pc?.level, owned: owned(engine), eligible: eligible(engine, tsid) })) {
      const point = engine.placement(FIND_GROUP)[0];
      const x = clampX(engine, point?.x ?? (engine.player?.x ?? 0) + 220);
      const y = point?.y ?? engine.player?.y ?? 0;
      st.placed = { tsid, x, y };
      last = 'placed';
      engine.save?.();
    }
    if (st.placed?.tsid === tsid) spawnFind(engine);
    setupDemo(engine);
    publish(engine);
  },

  onStreetClear(engine) {
    clearFind(engine);
    clearDeploySprite(engine);
    clearOverlay();
    clearWash();
  },

  onTick(dtMs, t, engine) {
    const time = now();
    if (st.out && !deployment) returnToPack(engine);
    if (deployment) {
      const age = time - deployment.at;
      if (!deployment.bounced && age >= BOUNCE_MS && engine.streetTsid === deployment.tsid) startBounce(engine);
      if (age >= POWER_MS) usePower(engine);
    }
    tickSneezes(engine, time);
    tickOverlay(engine, time);
    tickAutoplay(engine, time);
    if (findView?.glow && !findView.glow.destroyed) findView.glow.alpha = 0.75 + Math.sin(time / 420) * 0.25;
  },

  verbsFor(target, engine) {
    if (target?.featureId !== FUNPICKLE_FEATURE_ID) return null;
    if (target.state?.kind === 'deployed') {
      return [{ id: 'pickup', label: 'Pick up', tooltip: PICKUP_TOOLTIP, enabled: false, reason: IN_USE_REASON }];
    }
    return [{ id: 'pickup', label: 'Pick up', tooltip: PICKUP_TOOLTIP, enabled: true }];
  },

  runVerb(target, verbId, engine) {
    if (target?.featureId !== FUNPICKLE_FEATURE_ID) return false;
    if (target.state?.kind === 'deployed') {
      engine.toast?.(IN_USE_REASON, 2600);
      return true;
    }
    if (verbId === 'pickup') pickUpFind(engine);
    return true;
  },

  packVerbs(classTsid, engine) {
    if (classTsid !== FUNPICKLE || !owned(engine)) return [];
    return funpickleVerbButtons(verbCtx(engine));
  },

  runPackVerb(classTsid, verbId, engine) {
    if (classTsid !== FUNPICKLE || !isFunpickleVerb(verbId)) return false;
    return deploy(engine, verbId);
  },

  save() {
    return { ...st, out: st.out || Boolean(deployment), sneezes: st.sneezes || 0 };
  },

  restore(slice) {
    st = normalizeFunpickleState(slice);
    st.sneezes = Math.max(0, Math.min(MAX_SNEEZES, Math.floor(Number(slice?.sneezes) || 0)));
    deployment = null;
  },

  /** Tests. */
  _state() {
    return { st: JSON.parse(JSON.stringify(st)), deployment: deployment ? { ...deployment, sprite: null, target: null } : null, last };
  },
  _reset() {
    st = normalizeFunpickleState();
    deployment = null;
    findView = null;
    overlay = null;
    last = '';
    demoDone = false;
    autoplayAt = 0;
  },
  _usePower: (engine) => usePower(engine),
};
