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
 * Lost: the location (no XML) and whatever set `convo_end`: no GSJS item or
 * location script names it, so it came from the template's own placed
 * conversation.
 * Picture: Arthur DentUre's snap "Ever feel like you're Being Watched?"
 * (Flickr 8270858639, 2012-12-13; research/flickr-2026-10-27/raw/
 * being-watched, reference only, nothing of it ships): an all-black room, a
 * television hung from the ceiling on a short stalk at the upper right, its
 * pale screen glowing, and the avatar alone in a dim pool of light, in its
 * own colours. The TV is Tiny Speck's bureaucratic_hall_tv_1 (the
 * Bureaucratic Hall's, where the cup of water comes from), so the room is
 * rebuilt dark: ceiling TVs along the room that turn to face you, a pool of
 * light that follows you, and the veil the source names ("Peek Behind the
 * Veil") on a dais at the far end. The picture's caption line is not used
 * (no source text). Peeking behind the veil finds the Bureaucrats'
 * observation booth; their short exchange (marked below, no source text
 * survives) sets `convo_end`, and you wake up, which sets `leave` and turns
 * the quest in with the source completion text.
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
 * Behind the veil. Remake copy (G318: no source text for this moment): the
 * source conversation is lost; the lines keep the npc_bureaucrat "sss" voice
 * (npc_bureaucrat.js 887, 897) and the quest's class name.
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
/**
 * Ceiling TVs (bureaucratic_hall_tv_1, 266 x 282, its stalk at the top): x,
 * the bottom of the set (world), scale. The snap: the set hangs at the upper
 * right of the avatar, its foot about 180 px above the floor. The first is
 * far enough along to show right of the room card when you wake.
 */
export const MONITORS = Object.freeze([
  { x: 860, y: FLOOR - 170, s: 0.46 },
  { x: 1200, y: FLOOR - 190, s: 0.42 },
  { x: 1520, y: FLOOR - 172, s: 0.44 },
]);
export const TV = Object.freeze({ sprite: 'bureaucratic_hall_tv_1', w: 266, h: 282 });
/** A set watches you while it faces you and you are this near. */
export const WATCH_RANGE = 760;

export function napPlatforms(kit) {
  return [
    kit.plat(0, FLOOR, W, FLOOR, 'invisible', { id: 'bw_floor' }),
    kit.plat(DAIS.x1, DAIS.y, DAIS.x2, DAIS.y, 'invisible', { id: 'bw_dais' }),
  ];
}

/**
 * Which way a set turns: its art faces left (screen to the lower left), so it
 * stays as drawn (1) for you on its left and turns round (-1) for you on its
 * right. A few px of dead zone stop it flapping under the set.
 */
export function facing(monitor, px, current = 1) {
  const dx = px - monitor.x;
  if (Math.abs(dx) < 12) return current;
  return dx < 0 ? 1 : -1;
}

/** True while a set faces you from within range. */
export function watching(monitor, px, dir = facing(monitor, px)) {
  const dx = px - monitor.x;
  return Math.abs(dx) <= WATCH_RANGE && (dx < 0 ? dir > 0 : dir < 0);
}

/** Peeking needs the avatar up by the veil. */
export function canPeek(px, py) {
  return Math.abs(px - VEIL_X) <= PEEK_RANGE && py <= DAIS.y + 4;
}

/* ------------------------------------------------------------------ */
/* Drawing                                                              */
/* ------------------------------------------------------------------ */

function drawDark(ctx) {
  const { PIXI, kit } = ctx;
  const root = kit.sceneRoot(PIXI, W, H);
  const sky = root.layer(0, 0);
  // The snap: black all round.
  sky.addChild(kit.gradient(PIXI, [[0, '#020203'], [0.7, '#060607'], [1, '#0b0b0d']], 960, 640));
  const world = root.layer(1, 3);
  const g = new PIXI.Graphics();
  // A floor you barely see.
  g.rect(-600, FLOOR, W + 1200, 340).fill(0x0a0a0c);
  g.rect(-600, FLOOR, W + 1200, 3).fill({ color: 0x2a2a30, alpha: 0.6 });
  // The dais, dark.
  g.roundRect(DAIS.x1, DAIS.y, DAIS.x2 - DAIS.x1, FLOOR - DAIS.y + 8, 10).fill(0x16161a);
  g.roundRect(DAIS.x1, DAIS.y - 4, DAIS.x2 - DAIS.x1, 8, 4).fill({ color: 0x3a3a42, alpha: 0.8 });
  world.addChild(g);
  // Ceiling TVs, each hung from the dark on a rod above its own stalk.
  const sets = MONITORS.map((m, i) => {
    const c = new PIXI.Container();
    c.x = m.x;
    c.y = m.y;
    const h = TV.h * m.s;
    const rod = new PIXI.Graphics();
    rod.rect(-3, -h - 600, 6, 600 + 8).fill(0x1c1c20);
    // The screen's soft glow (light_spot, a CC0 radial light).
    const halo = kit.deco(PIXI, 'light_spot', -6, -h * 0.45, { ay: 0.5, scale: (TV.w * m.s * 2.2) / 848, alpha: 0.32, tint: 0xeef2f6 });
    const tv = kit.deco(PIXI, TV.sprite, 0, 0, { scale: m.s });
    c.addChild(halo, rod, tv);
    world.addChild(c);
    return { ...m, c, tv, dir: 1, turn: 1, phase: kit.hash01(`tv${i}`) * 6 };
  });
  return { root, sets };
}

/** The dim pool of light round the avatar (the snap: a soft patch on the floor at the feet). */
function drawPool(ctx) {
  const { PIXI, kit } = ctx;
  const c = new PIXI.Container();
  // A faint light round you, and a soft patch on the floor at your feet (CC0 light_spot, groddle_light_pool).
  c.addChild(kit.deco(PIXI, 'light_spot', 0, -50, { ay: 0.5, scale: 300 / 848, alpha: 0.16, tint: 0xffffff }));
  c.addChild(kit.deco(PIXI, 'groddle_light_pool', 16, 10, { scale: 220 / 638, alpha: 0.5, tint: 0xffffff }));
  return c;
}

function drawBooth(ctx) {
  const { PIXI, kit } = ctx;
  const c = new PIXI.Container();
  const top = DAIS.y - 185;
  const g = new PIXI.Graphics();
  g.roundRect(VEIL_X - 120, top, 240, 185, 8).fill(0x1d1d22);
  g.rect(VEIL_X - 110, DAIS.y - 54, 220, 16).fill(0x3a3128);
  g.rect(VEIL_X - 100, DAIS.y - 38, 14, 38).rect(VEIL_X + 86, DAIS.y - 38, 14, 38).fill(0x2e271f);
  c.addChild(g);
  // Monitors showing a small you.
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
  rod.roundRect(VEIL_X - 140, top - 8, 280, 10, 5).fill(0x3a3a40);
  rod.circle(VEIL_X - 142, top - 3, 9).circle(VEIL_X + 142, top - 3, 9).fill(0x55555c);
  const half = (side) => {
    const h = new PIXI.Graphics();
    // A heavy dark curtain, its folds caught by the screens' light.
    h.rect(0, 0, 130, 195).fill(0x2a1c22);
    for (let i = 0; i < 5; i++) h.rect(6 + i * 25, 0, 12, 195).fill({ color: i % 2 ? 0x3d2a31 : 0x22161b, alpha: 0.9 });
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
  theme: 'dark',
  // G315: template in hub 61 'Simple Level Quests' (inc_data_maps_prod.js 245), a dev label; plain remake wording.
  hubName: 'Quest',
  durationMs: NAP_MS,
  leaveText: 'Wake up now? You have not ridden it out yet.',
  travelText: 'You are fast asleep.',
  expireText: 'You wake up with a start.',
  doneLabel: 'Wake up',

  build(ctx) {
    const { root, sets } = drawDark(ctx);
    ctx.data.sets = sets;
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
    const pool = drawPool(ctx);
    if (ctx.player) pool.position.set(ctx.player.x, ctx.player.y);
    ctx.add(pool, 11);
    ctx.data.pool = pool;
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

  clear() {},

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
    // Sleep-heavy limbs, floaty falls.
    return { speed: 0.9, gravity: 0.85 };
  },

  tick(ctx, dtMs, now) {
    const p = ctx.player;
    if (!p) return;
    const t = now / 1000;
    let on = 0;
    for (const set of ctx.data.sets || []) {
      // Each set turns round to keep its screen on you (scale.x through 0, like a slow swivel).
      set.dir = facing(set, p.x, set.dir);
      set.turn += (set.dir - set.turn) * 0.06;
      set.tv.scale.x = set.s * set.turn;
      set.c.rotation = Math.sin(t * 0.8 + set.phase) * 0.012;
      if (watching(set, p.x, set.dir) && Math.abs(set.turn - set.dir) < 0.4) on += 1;
    }
    ctx.data.watching = on;
    if (ctx.data.pool) ctx.data.pool.position.set(p.x, p.y);
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
    // The quest's desc (quests/stale_but_necessary.js 2), then requirement r523's desc (37).
    let text = "You drank water from a questionable source and you don't look well. You need to ride it out.";
    if (ctx.data.peeked) text = 'Waking up…';
    else if (ctx.data.peeking) text = 'Peeking behind the veil.';
    else if (p && canPeek(p.x, p.y)) text = 'Peek Behind the Veil';
    return { text, stats: [['screens on you', ctx.data.watching ?? 0]] };
  },

  onLeave() {
    return {};
  },

  publish(ctx) {
    ctx.setData('bwPeeked', ctx.data.peeked ? '1' : '0');
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
