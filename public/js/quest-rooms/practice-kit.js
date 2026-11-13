/**
 * What the two rebuilt skill-quest practice streets share (js/practice-streets.js, G682):
 * the Welcoming Flamingo's hello and flight (locations/skillquest_ezc_v2.js and skillquest_sa.js
 * eventScriptStep: flamingo_1_talk*, flamingo_fly1), the street items waiting to be picked up
 * (createItemStack in reset()), and the exit's box that sets the quest's "Do it all!" flag.
 * Used by js/quest-rooms/ez-cookin.js and soil-appreciation.js.
 */

import { inPracticeBox, practiceScreen } from '../practice-streets.js?v=108f80a3';

const FLAMINGO_ART = 'assets/sprites/newxp/';
/** features/newxp-feature.js SHEETS.flamingo: the npc_flamingo x1 sheets. */
const FLAMINGO = Object.freeze({
  scale: 0.85,
  idle: ['flamingo_idle', 1, 1, 1],
  talk: ['flamingo_talk_tall', 13, 7, 89],
  short: ['flamingo_talk_short', 13, 7, 89],
  fly: ['flamingo_flying', 3, 4, 12],
});
/** eventScriptStep timer_1 (1 s rooted) and flamingo_1_talk1's 1.5 s before it talks. */
export const FLAMINGO_TALK_AFTER_MS = 2500;
/** flamingo_fly1: unrootPlayer 2 s after the flight starts; the flight itself. */
export const FLAMINGO_FLY_MS = 2600;

function sheet(ctx, mode) {
  const [file, cols, rows, count] = FLAMINGO[mode];
  return ctx.kit.sheetFrames(ctx.PIXI, `${FLAMINGO_ART}${file}.webp`, cols, rows, count);
}

function setMode(ctx, mode) {
  const fl = ctx.data.flamingo;
  if (!fl || fl.destroyed) return;
  ctx.data.flamingoMode = mode;
  const frames = sheet(ctx, mode).frames;
  ctx.data.flamingoDrawn = frames.length > 0;
  if (!frames.length) return;
  fl.textures = frames;
  fl.animationSpeed = mode === 'fly' ? 0.3 : 0.4;
  fl.loop = true;
  fl.play();
}

/** flamingo_1_talk1: the flamingo at initial_flamingo, facing left (world x, y). */
export function addFlamingo(ctx, tsid, at) {
  const { PIXI } = ctx;
  const p = practiceScreen(tsid, at.x, at.y);
  const fl = new PIXI.AnimatedSprite([PIXI.Texture.EMPTY]);
  fl.anchor.set(0.5, 0.97);
  fl.scale.set(-FLAMINGO.scale, FLAMINGO.scale);
  fl.x = p.x;
  fl.y = p.y + 2;
  ctx.add(fl, 30);
  ctx.data.flamingo = fl;
  ctx.data.flamingoStep = 'wait';
  ctx.data.flamingoAt = 0;
  setMode(ctx, 'idle');
  ctx.data.flamingoTarget = ctx.register({ classId: 'npc_flamingo', label: 'Welcoming Flamingo', subtitle: 'Says hello', sprite: fl });
  return fl;
}

/**
 * The hello: once the avatar has landed, the flamingo talks (each line with its own button, as
 * flamingo.talk did), then flies off to the right (initial_flamingo_2) and goes.
 */
export async function flamingoHello(ctx, lines, tsid, away) {
  if (ctx.data.flamingoStep !== 'wait') return;
  ctx.data.flamingoStep = 'talk';
  for (const line of lines) {
    setMode(ctx, line.head === 'short' ? 'short' : 'talk');
    await ctx.converse({ kicker: 'Welcoming Flamingo', title: 'Welcoming Flamingo', beats: [{ text: line.text, response: line.reply }] });
  }
  ctx.data.flamingoStep = 'fly';
  setMode(ctx, 'fly');
  const fl = ctx.data.flamingo;
  if (fl && !fl.destroyed) {
    fl.scale.x = Math.abs(fl.scale.x);
    const from = { x: fl.x, y: fl.y };
    const to = practiceScreen(tsid, away.x, away.y - 260);
    const start = ctx.now();
    ctx.data.flight = { from, to, start };
  }
}

/** Per frame: the hello once the avatar stands, and the flight. */
export function tickFlamingo(ctx, lines, tsid, away) {
  const p = ctx.player;
  if (ctx.data.flamingoStep === 'wait' && p?.onGround) {
    ctx.data.flamingoAt ||= ctx.now();
    if (ctx.now() - ctx.data.flamingoAt >= FLAMINGO_TALK_AFTER_MS && !ctx.dialogOpen()) flamingoHello(ctx, lines, tsid, away);
  }
  const fl = ctx.data.flamingo;
  // A sheet still loading when its mode was set: put it on once it is in.
  if (fl && !fl.destroyed && !ctx.data.flamingoDrawn && ctx.data.flamingoMode) setMode(ctx, ctx.data.flamingoMode);
  const f = ctx.data.flight;
  if (f && fl && !fl.destroyed) {
    const t = Math.min(1, (ctx.now() - f.start) / FLAMINGO_FLY_MS);
    fl.x = f.from.x + (f.to.x - f.from.x) * t;
    fl.y = f.from.y + (f.to.y - f.from.y) * t * t;
    if (t >= 1) {
      fl.visible = false;
      ctx.data.flight = null;
      ctx.data.flamingoStep = 'gone';
      // Unregistering destroys the sprite, so the target goes only once the flight is over.
      if (ctx.data.flamingoTarget) ctx.unregister(ctx.data.flamingoTarget);
      ctx.data.flamingoTarget = null;
    }
  } else if (f) {
    ctx.data.flight = null;
    ctx.data.flamingoStep = 'gone';
  }
}

/** A street item waiting to be picked up (createItemStack): its icon on the ground or a table. */
export function addPickup(ctx, tsid, row, { scale = 0.7 } = {}) {
  const p = practiceScreen(tsid, row.x, row.y);
  const spr = ctx.kit.icon(ctx.PIXI, row.classTsid, p.x, p.y + 1, { scale });
  ctx.add(spr, 26);
  const label = row.label || row.classTsid.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  const target = ctx.register({ classId: row.classTsid, label: row.count > 1 ? `${label} ×${row.count}` : label, subtitle: 'Pick it up', sprite: spr });
  target.practicePickup = row.id;
  (ctx.data.pickups ||= {})[row.id] = { row, target, spr, taken: false };
  return target;
}

/** Pick one up: into the pack (pc.createItemFromSource), its icon gone. */
export function takePickup(ctx, id) {
  const pick = ctx.data.pickups?.[id];
  if (!pick || pick.taken) return false;
  pick.taken = true;
  ctx.give(pick.row.classTsid, pick.row.count);
  ctx.unregister(pick.target);
  if (pick.spr && !pick.spr.destroyed) pick.spr.visible = false;
  ctx.sound('ITEM_PICKUP', { volume: 0.5 });
  ctx.activity(`You picked up ${pick.row.count > 1 ? `${pick.row.count} x ` : 'a '}${pick.target.label.replace(/ ×\d+$/, '')}.`);
  return true;
}

export const pickupVerbs = (ctx, target) => {
  const pick = ctx.data.pickups?.[target.practicePickup];
  return pick && !pick.taken ? [{ id: 'pick_up', label: 'Pick up', enabled: true, tooltip: 'Into your pack' }] : [];
};

/**
 * The exit's box: the quest's "Do it all!" flag, then out (the archived practice streets' box_7
 * quest:flag:finish_*; inc_skillquest.js setupTeleporter takes you back).
 */
export function tickExit(ctx, box, flag) {
  const p = ctx.player;
  if (!p || ctx.data.exiting || !inPracticeBox(box, p.x, p.y)) return false;
  ctx.data.exiting = true;
  ctx.progress(flag);
  ctx.solve();
  ctx.leave({ transition: ctx.fx() });
  return true;
}

export function taken(ctx, id) {
  return Boolean(ctx.data.pickups?.[id]?.taken);
}

/** QA: advance an open dialogue until none is open. */
export async function clearDialogs(ctx, tries = 30) {
  for (let i = 0; i < tries; i++) {
    if (!ctx.dialogOpen()) {
      await ctx.wait(200);
      if (!ctx.dialogOpen()) return;
    }
    ctx.advanceDialog();
    await ctx.wait(250);
  }
}
