/**
 * The falling room: where the Fireflex 3000 Lab's teleporter really takes you.
 *
 * Source:
 *  - locations/location.js 'teleporter' (firefly_whistle instance): with the
 *    beam on, pc.goToFallingLevel(pc.instances_get_exit('firefly_whistle')).
 *  - players/player.js goToFallingLevel(exit): instances_create('falling',
 *    LLI12DVTLA01HT5 (dev LHH12F9DO801RUL), { instance_label: 'You Feel
 *    Woooooozy...', no_auto_return: true }); the entrance's last 'teleporter'
 *    item gets target_tsid / target_x / target_y = the exit; then
 *    instances_enter('falling', 0, -10000).
 *  - groups/instance.js clone_location: the instance_label is the copy's
 *    location label (what the location bar shows).
 *  - items/teleporter.js: a hidden Collision-triggered Teleporter; touching it
 *    teleports you to its target.
 *
 * Here it is a second stage of the Firefly Whistle room (`falling`), so the
 * quest's run, its return point and its outcome carry through: the lab's pad
 * calls ctx.gotoStage('falling'), and the teleporter at the bottom leaves the
 * room to the run's return point (the quest exit). withFallingRoom() wraps the
 * lab's room module with the stage. The room's look and layout:
 * falling-room-scene.js.
 *
 * QA: &questdemo=firefly_whistle&ffwstart=falling starts in the fall;
 * &fallat=<source y> puts you at that height on entry; &questautoplay=fall
 * waits out the fall (the lab's own autoplay continues into it).
 * Canvas data: fallState (arrived, tongue, falling, landed, beamed), fallY,
 * fallX, fallNumber (the last number passed), fallLabel, fallMaxVy.
 */

import { ARRIVAL, FLOOR, FLOOR_Y, H, TELEPORTER, VY_MAX, W, buildFall, fallPlatforms, numberAt, sx, sy } from './falling-room-scene.js?v=fall-1';

export const STAGE = 'falling';
export const TEMPLATE = Object.freeze({ prod: 'LLI12DVTLA01HT5', dev: 'LHH12F9DO801RUL' });
export const INSTANCE_ID = 'falling';
export const INSTANCE_LABEL = 'You Feel Woooooozy...';
/** The loading card into the fall, read off video 2Z76dO4DlJ4 t120 (not in GSJS; Austin 2026-10-24). */
export const LOADING_LABEL = 'Back to life, back to the present time';
export const ENTRY = ARRIVAL;
export const PHYSICS = Object.freeze({ vyMax: VY_MAX });
/** The location bar's hub line in the fall (the quest-room runtime's default). */
export const FALL_HUB = 'A quiet place beyond Ur';

/** Source y of the avatar's feet. */
const srcY = (p) => Math.round(p.y + (FLOOR_Y - FLOOR));
const srcX = (p) => Math.round(p.x - sx(0));

/** The teleporter's box (bottom-centre) in room px. */
export function teleporterBox() {
  return { x: sx(TELEPORTER.x), y: sy(TELEPORTER.y), w: TELEPORTER.w, h: TELEPORTER.h };
}

export function onTeleporter(p) {
  const b = teleporterBox();
  return Boolean(p) && Math.abs(p.x - b.x) <= b.w / 2 && p.y <= b.y + 4 && p.y >= b.y - b.h;
}

function qaParam(name) {
  try {
    return new URLSearchParams(globalThis.location?.search || '').get(name);
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* The stage                                                            */
/* ------------------------------------------------------------------ */

export const falling = {
  label: INSTANCE_LABEL,

  build(ctx) {
    const { root } = buildFall(ctx.PIXI, ctx.kit);
    const at = Number(ctx.param('fallat'));
    const y = Number.isFinite(at) && ctx.param('fallat') != null && at < FLOOR_Y ? at : ENTRY.y;
    return {
      label: INSTANCE_LABEL,
      // Hub 45 has no public name (config_prod.js hubs); the remake's line for rooms beyond the map.
      hubName: FALL_HUB,
      width: W,
      height: H,
      background: root,
      platforms: fallPlatforms(ctx.kit),
      spawn: { x: sx(ENTRY.x), y: sy(y) },
      ownLight: true,
    };
  },

  enter(ctx) {
    const d = (ctx.data.fall = { state: 'arrived', maxVy: 0, landedAt: 0, beamed: false, at: Date.now() });
    if (ctx.player) {
      ctx.player.onGround = false;
      ctx.player.vy = 0;
    }
    return d;
  },

  tick(ctx, dtMs, now = Date.now()) {
    const d = ctx.data.fall;
    const p = ctx.player;
    if (!d || !p || d.beamed) return;
    d.maxVy = Math.max(d.maxVy, p.vy || 0);
    const y = srcY(p);
    if (p.onGround && y < -9000) d.state = 'tongue';
    else if (!p.onGround) d.state = 'falling';
    else if (Math.abs(p.y - FLOOR) < 6) {
      if (d.state !== 'landed') d.landedAt = now;
      d.state = 'landed';
    }
    // The hidden Collision-triggered Teleporter: its target is the quest exit.
    if (onTeleporter(p) && !ctx.engine.acting?.()) {
      d.beamed = true;
      d.state = 'beamed';
      ctx.leave({ transition: ctx.fx() });
    }
  },

  physics() {
    return { ...PHYSICS };
  },

  objective() {
    return { text: '', stats: [] };
  },

  publish(ctx) {
    const d = ctx.data.fall || {};
    const p = ctx.player;
    ctx.setData('fallState', d.state || '');
    ctx.setData('fallLabel', INSTANCE_LABEL);
    if (p) {
      ctx.setData('fallY', String(srcY(p)));
      ctx.setData('fallX', String(srcX(p)));
      ctx.setData('fallNumber', String(numberAt(srcY(p))));
    }
    ctx.setData('fallMaxVy', String(Math.round((d.maxVy || 0) * 100) / 100));
  },

  /** QA: walk off the tongue (if on it), then wait out the fall and the teleporter. */
  async autoplay(ctx) {
    const d = () => ctx.data.fall || {};
    const until = async (fn, ms) => {
      const end = Date.now() + ms;
      while (!fn() && Date.now() < end && ctx.run) await ctx.wait(150);
      return fn();
    };
    await until(() => d().state === 'tongue' || d().state === 'falling', 4000);
    if (d().state === 'tongue' && ctx.player) {
      // Off the bubble end, as the player in the video does.
      ctx.place(sx(700), ctx.player.y - 40);
    }
    await until(() => d().state === 'landed' || d().beamed, 60000);
    if (!d().beamed && ctx.player) ctx.place(teleporterBox().x, FLOOR);
    await until(() => !ctx.run, 8000);
    return ctx.run ? 'stuck' : 'complete';
  },
};

/* ------------------------------------------------------------------ */
/* The lab's room with the falling stage                                */
/* ------------------------------------------------------------------ */

const DELEGATED = ['build', 'enter', 'tick', 'verbs', 'runVerb', 'objective', 'publish'];
/** Run on either stage: the lab's own cleanup (its code box, its overlay line) still applies. */
const CLEANUP = ['onLeave', 'clear'];

/**
 * Wrap a room module so its `falling` stage is this room. Every hook the lab
 * has keeps running on its own stage; the room card (HUD) steps aside in the
 * fall, as the instance had none.
 */
export function withFallingRoom(lab) {
  let live = null; // the room ctx, for the getters below
  // Before any hook has run (a QA start in the fall) the stage comes from the URL.
  const inFall = () => (live ? live.run?.stage === STAGE : qaParam('ffwstart') === STAGE);
  const out = { ...lab };
  for (const name of DELEGATED) {
    out[name] = (ctx, ...args) => {
      live = ctx;
      if (ctx?.stage === STAGE) return falling[name]?.(ctx, ...args);
      return lab[name]?.(ctx, ...args);
    };
  }
  for (const name of CLEANUP) {
    out[name] = (ctx, ...args) => {
      live = ctx;
      return lab[name]?.(ctx, ...args);
    };
  }
  out.firstStage = () => (qaParam('ffwstart') === STAGE ? STAGE : 'main');
  out.stageLabel = (stage) => (stage === STAGE ? INSTANCE_LABEL : '');
  out.loadingLabel = (stage, ctx) => (stage === STAGE ? LOADING_LABEL : lab.loadingLabel?.(stage, ctx) || '');
  out.physics = (ctx) => {
    live = ctx;
    return ctx?.stage === STAGE ? falling.physics(ctx) : lab.physics?.(ctx) ?? null;
  };
  out.autoplay = async (ctx, mode) => {
    live = ctx;
    if (ctx.stage === STAGE || mode === 'fall') return falling.autoplay(ctx);
    const result = await lab.autoplay?.(ctx, mode);
    // The lab's run ends on the pad: carry on through the fall.
    if (ctx.run && ctx.stage === STAGE) return falling.autoplay(ctx);
    return result;
  };
  Object.defineProperties(out, {
    hud: { enumerable: true, get: () => (inFall() ? false : lab.hud) },
    theme: { enumerable: true, get: () => (inFall() ? 'warm' : lab.theme) },
    hubName: { enumerable: true, get: () => (inFall() ? FALL_HUB : lab.hubName) },
  });
  return out;
}

/** The lab's teleporter hand-off (location.js 'teleporter' -> goToFallingLevel). */
export function goToFallingLevel(ctx) {
  return ctx.gotoStage(STAGE, { transition: ctx.fx() });
}
