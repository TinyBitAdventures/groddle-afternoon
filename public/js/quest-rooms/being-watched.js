/**
 * Being Watched (quests/stale_but_necessary.js).
 *
 * Source:
 *  - items/cup_of_water.js drink: "Ewww. That water tastes really …
 *    bureaucratic-y." (-5 mood), then quests_offer('stale_but_necessary',
 *    true). The cup came from the Bureaucratic Hall's water_cooler.js ("Were
 *    it possible for water to be beige, beige this water would be."). The
 *    quest is an emergency familiar offer: "you look really, well … plain,
 *    boring, without character", button "Take nap".
 *  - onStarted: questInstanceLocation(pc, 'being_watched', marker_teleport,
 *    5*60) into LIFHAO6QB4A34MO "Being Watched" (hub 61, the instance
 *    templates).
 *  - Requirements: flag `leave` "Ride It Out" (onExitLocation sets it) and
 *    flag `convo_end` "Peek Behind the Veil". onExitLocation fails the quest
 *    when it is not complete, so leaving or timing out before the peek fails.
 *  - Completion (familiar): "You passed out. Hard. Rolled around in your
 *    sleep, embarrassed yourself a bit, then woke up." / "You were
 *    watching?" / "Oh ho, yes." Rewards 750 xp, 100 mood, 100 energy.
 * Lost: the location (no XML, no recording found) and whatever set
 * `convo_end`: no GSJS item or location script names it, so it came from the
 * template's own placed conversation. Reconstructed: a beige dream (the cup's
 * beige water; the avatar drained of colour while it lasts), eyes in the
 * walls that follow you, and a veil on a dais. Peeking behind it finds the
 * Bureaucrats' observation booth; their short exchange (marked below, no
 * source text survives) sets `convo_end`, and you wake up, which sets
 * `leave` and turns the quest in with the source completion text.
 */

import { onLoaded } from '../textures.js';

export const QUEST = 'stale_but_necessary';
/** source: questInstanceLocation(..., 5*60). */
export const NAP_MS = 5 * 60 * 1000;
export const FLAGS = Object.freeze({ peek: 'convo_end', leave: 'leave' });
/** source: cup_of_water.js drink. */
export const DRINK_TEXT = 'Ewww. That water tastes really … bureaucratic-y.';
const LEGALIZE = 'assets/sprites/quests/legalize/';
const B_IDLE = `${LEGALIZE}npc_bureaucrat_arms_03_glasses_none_hair_04_legs_03_necklace_01_tie_none_torso_03_x1_idle1_png_1354833012.png`;
const B_TALK = `${LEGALIZE}npc_bureaucrat_arms_03_glasses_none_hair_04_legs_03_necklace_01_tie_none_torso_03_x1_talk_png_1354833010.png`;

/**
 * Behind the veil. Reconstruction: the source conversation is lost; the lines
 * keep the npc_bureaucrat "sss" voice and the quest's class name.
 */
export const VEIL_TALK = Object.freeze([
  { text: 'Oh! Er. Thisss is a ssstandard observation booth. Nothing to sssee here.', response: 'Are you watching me?' },
  { text: 'Ssstandard procedure. Anyone who drinks from the cooler gets observed until the beige wears off.', response: 'Is that necessary?' },
  { text: 'The water is ssstale, but necessary. Ssso is the procedure. Now kindly close the curtain and wake up.', response: 'OK' },
]);

export const W = 2000;
export const FLOOR = 640;
const H = FLOOR + 140;
export const SPAWN = Object.freeze({ x: 160, y: FLOOR });
/** The dais the veil hangs on (one ordinary hop up). */
export const DAIS = Object.freeze({ x1: 1620, x2: 1980, y: FLOOR - 90 });
export const VEIL_X = 1830;
export const PEEK_RANGE = 200;
/** Pillow clouds over the floor: a little play on the way. */
export const PILLOWS = Object.freeze([
  { x1: 460, x2: 640, y: FLOOR - 90 },
  { x1: 720, x2: 880, y: FLOOR - 180 },
  { x1: 960, x2: 1140, y: FLOOR - 95 },
  { x1: 1240, x2: 1400, y: FLOOR - 160 },
]);
/** Eyes in the walls: x, y (world, on the 0.6 parallax layer), radius. */
export const EYES = Object.freeze([
  { x: 220, y: FLOOR - 250, r: 26 }, { x: 520, y: FLOOR - 330, r: 18 }, { x: 760, y: FLOOR - 260, r: 34 },
  { x: 1010, y: FLOOR - 340, r: 22 }, { x: 1240, y: FLOOR - 270, r: 30 }, { x: 1480, y: FLOOR - 330, r: 20 },
  { x: 1700, y: FLOOR - 260, r: 24 },
]);

export function napPlatforms(kit) {
  return [
    kit.plat(0, FLOOR, W, FLOOR, 'invisible', { id: 'bw_floor' }),
    kit.plat(DAIS.x1, DAIS.y, DAIS.x2, DAIS.y, 'invisible', { id: 'bw_dais' }),
    ...PILLOWS.map((p, i) => kit.plat(p.x1, p.y, p.x2, p.y, 'invisible', { id: `bw_pillow${i}` })),
  ];
}

/** Pupil offset toward a point, kept inside the eye. */
export function pupilOffset(eye, px, py) {
  const dx = px - eye.x;
  const dy = py - 40 - eye.y;
  const d = Math.hypot(dx, dy) || 1;
  const reach = eye.r * 0.45;
  return { x: (dx / d) * reach, y: (dy / d) * reach };
}

/** Peeking needs the avatar up by the veil. */
export function canPeek(px, py) {
  return Math.abs(px - VEIL_X) <= PEEK_RANGE && py <= DAIS.y + 4;
}

/* ------------------------------------------------------------------ */
/* Drawing                                                              */
/* ------------------------------------------------------------------ */

function drawDream(ctx) {
  const { PIXI, kit } = ctx;
  const root = kit.sceneRoot(PIXI, W, H);
  const sky = root.layer(0, 0);
  sky.addChild(kit.gradient(PIXI, [[0, '#f3ead6'], [0.6, '#e4d4b0'], [1, '#cdb88d']], 960, 640));
  const far = root.layer(0.25, 1);
  for (let i = 0; i < 7; i++) {
    far.addChild(kit.deco(PIXI, i % 2 ? 'cloud_fluffy_2' : 'cloud_fluffy_1', 120 + i * 330, FLOOR - 220 + (i % 3) * 40, { scale: 0.55, alpha: 0.7, tint: 0xefe2c4 }));
  }
  const walls = root.layer(0.6, 2);
  // Soft beige drapery folds behind everything.
  const folds = new PIXI.Graphics();
  for (let x = -200; x < W + 400; x += 140) {
    folds.roundRect(x, -40, 70, FLOOR + 120, 35).fill({ color: 0xd8c59d, alpha: 0.35 });
  }
  walls.addChild(folds);
  const eyes = EYES.map((e) => {
    const c = new PIXI.Container();
    c.x = e.x;
    c.y = e.y;
    const white = new PIXI.Graphics();
    white.ellipse(0, 0, e.r * 1.35, e.r * 0.95).fill(0xc8b48a);
    white.ellipse(0, 0, e.r * 1.15, e.r * 0.78).fill(0xfffbf0);
    const pupil = new PIXI.Graphics();
    pupil.circle(0, 0, e.r * 0.42).fill(0x6b5a3e);
    pupil.circle(0, 0, e.r * 0.22).fill(0x2a2117);
    pupil.circle(-e.r * 0.12, -e.r * 0.14, e.r * 0.08).fill({ color: 0xffffff, alpha: 0.8 });
    const lid = new PIXI.Graphics();
    lid.ellipse(0, 0, e.r * 1.2, e.r * 0.82).fill(0xd2bd93);
    lid.scale.y = 0;
    c.addChild(white, pupil, lid);
    walls.addChild(c);
    return { ...e, c, pupil, lid, blinkAt: 0, phase: kit.hash01(`${e.x}`) * 6 };
  });
  const world = root.layer(1, 3);
  const g = new PIXI.Graphics();
  // A quilted floor.
  g.rect(-600, FLOOR, W + 1200, 340).fill(0xc7ae7f);
  g.rect(-600, FLOOR, W + 1200, 10).fill(0xe2cfa6);
  for (let x = -600; x < W + 600; x += 80) g.moveTo(x, FLOOR + 12).lineTo(x + 40, FLOOR + 140);
  g.stroke({ width: 2, color: 0xb39a6b, alpha: 0.6 });
  // The dais.
  g.roundRect(DAIS.x1, DAIS.y, DAIS.x2 - DAIS.x1, FLOOR - DAIS.y + 8, 10).fill(0xb59a69);
  g.roundRect(DAIS.x1, DAIS.y - 4, DAIS.x2 - DAIS.x1, 12, 6).fill(0xe7d5ae);
  world.addChild(g);
  // Pillow clouds (recovered block_cloud01, flat top on the line, beige).
  for (const p of PILLOWS) {
    const w = p.x2 - p.x1 + 50;
    const c = kit.deco(PIXI, 'block_cloud01', (p.x1 + p.x2) / 2, p.y - 16, { ay: 0, scale: w / 850, sy: (w / 850) * 0.55 });
    c.tint = 0xf0e3c6;
    world.addChild(c);
  }
  return { root, eyes };
}

function drawBooth(ctx) {
  const { PIXI, kit } = ctx;
  const c = new PIXI.Container();
  const top = DAIS.y - 185;
  const g = new PIXI.Graphics();
  g.roundRect(VEIL_X - 120, top, 240, 185, 8).fill(0x3b3528);
  g.rect(VEIL_X - 110, DAIS.y - 54, 220, 16).fill(0x6f5a3a);
  g.rect(VEIL_X - 100, DAIS.y - 38, 14, 38).rect(VEIL_X + 86, DAIS.y - 38, 14, 38).fill(0x5a482d);
  c.addChild(g);
  // Monitors showing a small, beige you.
  for (const [dx, s] of [[-62, 0.3], [40, 0.34]]) {
    const tv = kit.deco(PIXI, 'bureaucratic_hall_tv_1', VEIL_X + dx, top + 10, { ay: 0, scale: s });
    c.addChild(tv);
    const fig = new PIXI.Graphics();
    const fx = VEIL_X + dx + 4;
    const fy = top + 10 + 282 * s * 0.62;
    fig.circle(fx, fy - 12, 6).roundRect(fx - 5, fy - 6, 10, 14, 3).fill(0xd9c9a3);
    c.addChild(fig);
  }
  return c;
}

function drawVeil(ctx) {
  const { PIXI } = ctx;
  const c = new PIXI.Container();
  const top = DAIS.y - 195;
  const rod = new PIXI.Graphics();
  rod.roundRect(VEIL_X - 140, top - 8, 280, 10, 5).fill(0x8a6d43);
  rod.circle(VEIL_X - 142, top - 3, 9).circle(VEIL_X + 142, top - 3, 9).fill(0xa98852);
  const half = (side) => {
    const h = new PIXI.Graphics();
    h.rect(0, 0, 130, 195).fill(0x9d7f55);
    for (let i = 0; i < 5; i++) h.rect(6 + i * 25, 0, 12, 195).fill({ color: i % 2 ? 0xb39466 : 0x8c6f48, alpha: 0.85 });
    h.pivot.x = side < 0 ? 0 : 130;
    h.x = VEIL_X + side * 132;
    h.y = top;
    return h;
  };
  const left = half(-1);
  const right = half(1);
  c.addChild(left, right, rod);
  // A clickable area over the closed veil.
  const hit = new PIXI.Graphics();
  hit.rect(VEIL_X - 135, top, 270, 195).fill({ color: 0xffffff, alpha: 0.001 });
  c.addChild(hit);
  // Targets read their spot from the sprite position: anchor the veil at its foot.
  c.pivot.set(VEIL_X, DAIS.y);
  c.position.set(VEIL_X, DAIS.y);
  return { c, left, right };
}

/* ------------------------------------------------------------------ */
/* Behaviour                                                            */
/* ------------------------------------------------------------------ */

function setPlain(ctx, on) {
  const p = ctx.engine.player;
  if (!p) return;
  if (on) {
    if (ctx.data.plain) return;
    const cm = new ctx.PIXI.ColorMatrixFilter();
    cm.desaturate();
    cm.tint(0xead6a8, true);
    ctx.data.plain = { filters: p.filters || null, cm };
    p.filters = [...(p.filters || []), cm];
    return;
  }
  if (!ctx.data.plain) return;
  p.filters = ctx.data.plain.filters;
  p.tint = 0xffffff;
  ctx.data.plain = null;
}

async function peek(ctx) {
  if (ctx.data.peeking || ctx.data.peeked) return;
  ctx.data.peeking = true;
  ctx.data.openAt = Date.now();
  ctx.sound('CRAFTYBOT_PEEK', { volume: 0.5 });
  await ctx.wait(900);
  const spr = ctx.data.watcher;
  const talk = () => {
    if (spr && !spr.destroyed && ctx.data.bTalk.frames.length) {
      spr.textures = ctx.data.bTalk.frames;
      spr.animationSpeed = 0.24;
      spr.play();
    }
  };
  talk();
  await ctx.converse({ title: 'Behind the Veil', kicker: 'Being Watched', beats: VEIL_TALK });
  ctx.data.peeked = true;
  ctx.progress(FLAGS.peek);
  ctx.solve();
  ctx.activity('You wake up.');
  await ctx.wait(700);
  ctx.leave({ transition: ctx.fx() });
}

export const room = {
  id: 'being_watched',
  title: 'Being Watched',
  kicker: 'Take a nap',
  icon: 'assets/sprites/quest-rooms/being_watched/cup_of_water.png',
  theme: 'warm',
  // G315: template in hub 61 'Simple Level Quests' (inc_data_maps_prod.js 245), a dev label; plain remake wording.
  hubName: 'Quest',
  durationMs: NAP_MS,
  leaveText: 'Wake up now? You have not ridden it out yet.',
  travelText: 'You are fast asleep.',
  expireText: 'You wake up with a start.',
  doneLabel: 'Wake up',

  build(ctx) {
    const { root, eyes } = drawDream(ctx);
    ctx.data.eyes = eyes;
    return {
      label: 'Being Watched',
      width: W,
      height: H,
      background: root,
      platforms: napPlatforms(ctx.kit),
      spawn: { ...SPAWN },
    };
  },

  enter(ctx) {
    const { PIXI, kit } = ctx;
    setPlain(ctx, true);
    ctx.add(drawBooth(ctx), 12);
    ctx.data.bIdle = kit.sheetFrames(PIXI, B_IDLE, 10, 6, 57);
    ctx.data.bTalk = kit.sheetFrames(PIXI, B_TALK, 9, 3, 26);
    const watcher = new PIXI.AnimatedSprite([PIXI.Texture.EMPTY]);
    watcher.anchor.set(0.5, 1);
    watcher.scale.set(-0.8, 0.8);
    watcher.x = VEIL_X + 62;
    watcher.y = DAIS.y - 44;
    const idle = () => {
      if (watcher.destroyed || !ctx.data.bIdle.frames.length) return;
      watcher.textures = ctx.data.bIdle.frames;
      watcher.animationSpeed = 0.12;
      watcher.play();
    };
    if (ctx.data.bIdle.frames.length) idle();
    else onLoaded(ctx.data.bIdle.base, () => setTimeout(idle, 0));
    ctx.add(watcher, 13);
    ctx.data.watcher = watcher;
    const veil = drawVeil(ctx);
    ctx.add(veil.c, 14);
    ctx.data.veil = veil;
    ctx.data.veilTarget = ctx.register({ classId: 'quest_veil', label: 'The Veil', subtitle: 'Something is behind it', sprite: veil.c });
  },

  clear(ctx) {
    setPlain(ctx, false);
  },

  verbs(ctx, target) {
    if (target !== ctx.data.veilTarget) return [];
    const p = ctx.player;
    const near = p && canPeek(p.x, p.y);
    return [{
      id: 'peek',
      label: 'Peek behind',
      enabled: Boolean(near) && !ctx.data.peeking,
      reason: near ? '' : 'Climb up to the veil first',
      tooltip: 'Peek behind the veil',
      durationMs: 0,
    }];
  },

  runVerb(ctx, target, verbId) {
    if (target !== ctx.data.veilTarget || verbId !== 'peek') return false;
    peek(ctx);
    return true;
  },

  physics() {
    // Dream-heavy limbs, floaty falls.
    return { speed: 0.9, gravity: 0.85 };
  },

  tick(ctx, dtMs, now) {
    const p = ctx.player;
    if (!p) return;
    const t = now / 1000;
    let open = 0;
    for (const e of ctx.data.eyes || []) {
      const off = pupilOffset(e, p.x, p.y);
      e.pupil.x += (off.x - e.pupil.x) * 0.15;
      e.pupil.y += (off.y - e.pupil.y) * 0.15;
      // A blink every few seconds, out of step.
      const cycle = (t + e.phase) % 4.2;
      e.lid.scale.y = cycle < 0.16 ? Math.sin((cycle / 0.16) * Math.PI) : 0;
      if (e.lid.scale.y < 0.5) open += 1;
    }
    ctx.data.watching = open;
    // The dream sways a little.
    ctx.engine.nudgeCamera(Math.sin(t * 0.9) * 3, Math.cos(t * 0.7) * 2);
    if (ctx.data.openAt && ctx.data.veil) {
      const k = Math.min(1, (Date.now() - ctx.data.openAt) / 900);
      ctx.data.veil.left.scale.x = 1 - 0.75 * k;
      ctx.data.veil.right.scale.x = 1 - 0.75 * k;
    }
  },

  objective(ctx) {
    const p = ctx.player;
    let text = 'Ride it out. Something is watching you.';
    if (ctx.data.peeked) text = 'Waking up…';
    else if (ctx.data.peeking) text = 'Peeking behind the veil.';
    else if (p && canPeek(p.x, p.y)) text = 'Peek behind the veil.';
    return { text, stats: [['eyes on you', ctx.data.watching ?? EYES.length]] };
  },

  onLeave(ctx) {
    setPlain(ctx, false);
    return {};
  },

  publish(ctx) {
    ctx.setData('bwPeeked', ctx.data.peeked ? '1' : '0');
    ctx.setData('bwPlain', ctx.data.plain ? '1' : '0');
    ctx.setData('bwWatching', String(ctx.data.watching ?? ''));
  },

  async autoplay(ctx, mode) {
    for (let i = 0; i < 40 && !ctx.data.veilTarget; i++) await ctx.wait(150);
    if (mode === 'leave') {
      ctx.leave({ transition: false });
      return 'left';
    }
    ctx.place(VEIL_X - 60, DAIS.y);
    await ctx.wait(600);
    if (mode === 'veil') return 'veil';
    peek(ctx);
    for (let i = 0; i < 40 && !ctx.dialogOpen(); i++) await ctx.wait(150);
    if (mode === 'talk') return 'talk';
    while (ctx.dialogOpen()) {
      ctx.advanceDialog();
      await ctx.wait(300);
    }
    for (let i = 0; i < 40; i++) {
      ctx.advanceAward();
      await ctx.wait(300);
    }
    return 'complete';
  },
};
