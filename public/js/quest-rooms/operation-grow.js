/**
 * Operation: Grow (quests/where_the_blue_grew.js).
 *
 * Source: players/inc_quests.js quests_login and the four Firebog completist
 * badges (shimla_mirch, chakra_phool, jethimadh, kalavana: on_apply) offer it
 * through the familiar; onStarted makes a private copy of LIFI8QG9A093USI
 * ("Operation Grow", hub 135 beside Mental Block and Radiant Glare; dev clone
 * LRO15T6GC593RL7) at -957,-138 with a 5 * 60 second exit delay. The
 * requirements are the `solved_puzzle` flag ("Solved Puzzle") and `leave`
 * ("Complete the Journey"), which onExitLocation sets on the way out (and
 * fails the quest if the puzzle is not solved). Rewards: 500 iMG, 400
 * currants, 200 Mab favor.
 *
 * Lost: the template, its puzzle items and their event scripts, and no
 * recording has turned up, so the puzzle is designed from the quest text
 * ("Solve the puzzle to brighten up the gloomy, forgotten bog fields. I bet
 * Mab left a hint somewhere to help you out."): seven gloomy stalks in a
 * row, where tending one stirs it and its two neighbours between gloom and
 * bloom (a lights-out row, the kind of toggle the source's
 * clickable_broadcaster + deco_show/hide events built). Mab's hint is her
 * card on a plank up on the banks left of the start: a row of seven dots with
 * the first, middle and last picked out. Solving locks the field in bloom.
 *
 * The look and layout come from four player Snaps (research/wayback/raw/
 * snaps/where_the_blue_grew/, reference only; G67 palette, G109 layout):
 * two tiers. The surface field of Firebog `plants1` stalks (gloomy patches
 * are the green stalk, tending blooms them teal with glowing cyan orbs)
 * runs between bottletree huts; Mab's card is the small sign by the big hut
 * on the right. Under it a root tunnel, reached by a Firebog ladder through
 * the field's left end, has a pot hanging under each patch (teal once it
 * blooms), tangled grey roots, and the way out: the narrow door at its right
 * end beside the painted EXIT (or Leave). js/operation-grow-scene.js builds it.
 */

import { JUMP_GAP, JUMP_RISE } from './puzzle-kit.js?v=cu-1';
import { textureFromUrl } from '../textures.js';
import { buildGrowBackground, makeStalk } from '../operation-grow-scene.js?v=g109-1';

export const W = 2500;
export const H = 960;
/** The surface field. */
export const FLOOR = 590;
/** The root tunnel under it: ceiling (the slab's underside) and floor. */
export const CEILING = 650;
export const TUNNEL = 880;
export const TUNNEL_X1 = 120;
export const TUNNEL_X2 = 2420;
export const EXIT_MS = 5 * 60 * 1000; // source: questInstanceLocation(..., 5*60)
export const PATCHES = 7;
export const PATCH_X0 = 660;
export const PATCH_DX = 185;
/** Source arrival -957,-138 is near the street's left end: the remake starts on the field's left. */
export const SPAWN = { x: 420, y: FLOOR };
/** The way down: a ladder through the slab at the field's left end. */
export const LADDER = Object.freeze({ x: 250, top: FLOOR - 24, bottom: TUNNEL });
/** The big hut on the right of the field; Mab's card is the small sign beside it. */
export const HUT_X = 2060;
export const HINT = { x: 2310, y: FLOOR };
/** The door at the tunnel's right end, beside the painted EXIT. */
export const EXIT = { x: 2370, y: TUNNEL };
/** The patches Mab's card picks out (tests: the unique answer from all gloom). */
export const HINT_PATCHES = Object.freeze([0, 3, 6]);
export const HINT_TEXT = 'Seven patches in a row, and every one you tend stirs the two beside it. '
  + 'Tend the first, the one in the very middle, and the last, and the bog will remember how to bloom. '
  + 'Mab';

export const patchX = (i) => PATCH_X0 + i * PATCH_DX;

/** Tend patch i: it and its neighbours flip between gloom (false) and bloom (true). */
export function tend(state, i) {
  const next = [...state];
  for (const j of [i - 1, i, i + 1]) if (j >= 0 && j < next.length) next[j] = !next[j];
  return next;
}

export const startState = () => Array(PATCHES).fill(false);
export const solved = (state) => state.every(Boolean);
export const bloomFraction = (state) => state.filter(Boolean).length / state.length;

/** Fewest tends to full bloom (brute force over the 2^n press sets). */
export function fewestTends(state = startState()) {
  let best = null;
  for (let m = 0; m < 1 << state.length; m++) {
    let s = state;
    const picks = [];
    for (let i = 0; i < state.length; i++) {
      if (m & (1 << i)) {
        s = tend(s, i);
        picks.push(i);
      }
    }
    if (solved(s) && (!best || picks.length < best.length)) best = picks;
  }
  return best;
}

export const PATCH_XS = Object.freeze(Array.from({ length: PATCHES }, (_, i) => patchX(i)));

export function growPlatforms() {
  return [
    { id: 'og_floor', x1: 0, y1: FLOOR, x2: W, y2: FLOOR, style: 'invisible' },
    { id: 'og_tunnel', x1: TUNNEL_X1, y1: TUNNEL, x2: TUNNEL_X2, y2: TUNNEL, style: 'invisible' },
  ];
}

/** enterScene `walls`: the ladder (climbable through the field's one-way floor). */
export function growWalls() {
  return [{ x: LADDER.x, yTop: LADDER.top, yBot: LADDER.bottom }];
}

/** The tunnel's end walls (the surface walk is unaffected: they span ceiling to floor). */
export function growBarriers() {
  return [
    { id: 'og_tunnel_l', x: TUNNEL_X1, y: CEILING, h: TUNNEL - CEILING, pc_perm: null },
    { id: 'og_tunnel_r', x: TUNNEL_X2, y: CEILING, h: TUNNEL - CEILING, pc_perm: null },
  ];
}

/* ------------------------------------------------------------------ */
/* Drawing                                                              */
/* ------------------------------------------------------------------ */

/** Mab's card: her icon on a plank with seven dots, three of them lit. */
function drawHint(PIXI, kit) {
  const c = new PIXI.Container();
  const post = new PIXI.Graphics();
  post.rect(-5, -70, 10, 70).fill(0x5a3d22);
  c.addChild(post);
  c.addChild(kit.deco(PIXI, 'firebog_sign_blank_plank', 0, -56, { scale: 0.4 }));
  const dots = new PIXI.Graphics();
  for (let i = 0; i < PATCHES; i++) {
    const lit = HINT_PATCHES.includes(i);
    dots.circle(-66 + i * 22, -88, lit ? 7 : 4.5).fill({ color: lit ? 0x8fd9ff : 0x3b2f22, alpha: lit ? 1 : 0.8 });
  }
  c.addChild(dots);
  const mab = new PIXI.Sprite(textureFromUrl('assets/sprites/icons/icon_mab@3x.png'));
  mab.anchor.set(0.5, 1);
  mab.scale.set(0.42);
  mab.x = -60;
  mab.y = -112;
  c.addChild(mab);
  c.x = HINT.x;
  c.y = HINT.y;
  return c;
}

/** One patch: a stalk in its gravel ring, green while gloomy, blue with lit orbs in bloom. */
function makePatch(ctx, i) {
  const { PIXI, kit } = ctx;
  const stalk = makeStalk(PIXI, kit, i);
  const c = stalk.container;
  c.x = patchX(i);
  c.y = FLOOR;
  const target = ctx.register({ classId: 'bog_patch', label: 'Gloomy Patch', subtitle: 'Tend it', sprite: c, ogPatch: i });
  return { i, target, stalk, shown: 0 };
}

export const room = {
  id: 'operation_grow',
  title: 'Operation: Grow',
  kicker: 'Brighten the bog fields',
  icon: 'assets/sprites/icons/icon_mab@3x.png',
  theme: 'dark',
  hubName: 'The forgotten bog fields',
  durationMs: EXIT_MS,
  leaveText: 'Leave the bog fields still gloomy? The quest will fail.',
  travelText: 'Brighten the field, then climb down to the root tunnel and its EXIT.',

  build(ctx) {
    const { PIXI, kit } = ctx;
    ctx.data.state = startState();
    const root = buildGrowBackground(PIXI, kit, {
      W, H, FLOOR, CEILING, TUNNEL, TUNNEL_X1, TUNNEL_X2, LADDER, EXIT, HUT_X, HINT, PATCH_XS,
    });
    // The way out lights up once the field blooms.
    ctx.data.exitBeam = root.exitBeam;
    ctx.data.pots = root.pots;
    // The gloom: a dusk wash over everything, lifted as the patches bloom.
    const gloom = new PIXI.Graphics();
    gloom.rect(-200, -200, W + 400, H + 400).fill(0x12101c);
    gloom.alpha = 0.38;
    gloom.zIndex = 4;
    root.addChild(gloom);
    ctx.data.gloom = gloom;
    ctx.data.fireflies = [];
    const flies = root.layer(1, 5);
    for (let i = 0; i < 18; i++) {
      const f = kit.glow(PIXI, 560 + i * 105 + (i % 3) * 23, FLOOR - 90 - ((i * 37) % 150), 0x9ff6ff, 5);
      f.alpha = 0;
      flies.addChild(f);
      ctx.data.fireflies.push(f);
    }
    return {
      label: 'Operation: Grow',
      width: W,
      height: H,
      background: root,
      platforms: growPlatforms(),
      walls: growWalls(),
      barriers: growBarriers(),
      spawn: SPAWN,
    };
  },

  enter(ctx) {
    ctx.data.patches = Array.from({ length: PATCHES }, (_, i) => makePatch(ctx, i));
    // Mab's note sits above the gloom so it can be found in the dark.
    ctx.add(drawHint(ctx.PIXI, ctx.kit), 12);
    const hint = new ctx.PIXI.Graphics();
    hint.rect(-70, -150, 140, 150).fill({ color: 0xffffff, alpha: 0.001 });
    hint.x = HINT.x;
    hint.y = HINT.y;
    ctx.data.hint = ctx.register({ classId: 'mab_hint', label: "Mab's Note", subtitle: 'Read it', sprite: hint });
    const exitHit = new ctx.PIXI.Graphics();
    exitHit.rect(-60, -180, 120, 180).fill({ color: 0xffffff, alpha: 0.001 });
    exitHit.x = EXIT.x;
    exitHit.y = EXIT.y;
    ctx.data.exit = ctx.register({ classId: 'bog_way_back', label: 'Exit', subtitle: 'Complete the journey', sprite: exitHit });
    ctx.data.tends = [];
    ctx.data.phase = 'play';
    // QA framing: &growstate=0101010 previews bloom states (no progress), &growx=<world x> places the
    // avatar on the field (&growtier=tunnel: in the tunnel).
    const qs = String(ctx.engine.param?.('growstate') || '');
    if (/^[01]{7}$/.test(qs)) ctx.data.state = [...qs].map((ch) => ch === '1');
    const qx = Number(ctx.engine.param?.('growx'));
    const tunnel = ctx.engine.param?.('growtier') === 'tunnel';
    if (qx > 0) {
      const x = tunnel ? Math.max(TUNNEL_X1 + 30, Math.min(TUNNEL_X2 - 30, qx)) : Math.min(W - 40, qx);
      setTimeout(() => ctx.place(x, tunnel ? TUNNEL : FLOOR), 400);
    }
  },

  tick(ctx, dtMs = 16) {
    const frac = bloomFraction(ctx.data.state || []);
    const k = Math.min(1, (dtMs || 16) / 180);
    if (ctx.data.gloom && !ctx.data.gloom.destroyed) {
      const want = ctx.data.phase === 'solved' ? 0 : 0.38 * (1 - frac * 0.7);
      ctx.data.gloom.alpha += (want - ctx.data.gloom.alpha) * k;
    }
    const t = Date.now() / 1000;
    for (const f of ctx.data.fireflies || []) {
      if (f.destroyed) continue;
      f.alpha += ((ctx.data.phase === 'solved' ? 0.9 : frac * 0.4) - f.alpha) * k;
      f.y += Math.sin(t * 1.3 + f.x / 90) * 0.25;
    }
    if (ctx.data.exitBeam && !ctx.data.exitBeam.destroyed) {
      ctx.data.exitBeam.alpha += ((ctx.data.phase === 'solved' ? 0.75 : 0.15) - ctx.data.exitBeam.alpha) * k;
    }
    for (const p of ctx.data.patches || []) {
      const want = ctx.data.state[p.i] ? 1 : 0;
      p.shown += (want - p.shown) * Math.min(1, k * 1.6);
      p.stalk.setBloom(p.shown, t);
      const pot = ctx.data.pots?.[p.i];
      if (pot && !pot.sprite.destroyed) pot.setBloom(p.shown, t);
    }
  },

  verbs(ctx, target) {
    if (target.ogPatch != null) {
      const locked = ctx.data.phase === 'solved';
      return [{ id: 'tend', label: 'Tend', enabled: !locked, reason: locked ? 'The field is in bloom.' : '', tooltip: 'Tend this patch (its neighbours stir too)' }];
    }
    if (target === ctx.data.hint) return [{ id: 'read', label: 'Read', enabled: true, tooltip: "Read Mab's note" }];
    if (target === ctx.data.exit) return [{ id: 'leave', label: 'Leave', enabled: true, tooltip: 'Out through the EXIT, back to Ur' }];
    return [];
  },

  runVerb(ctx, target, verbId) {
    if (target.ogPatch != null && verbId === 'tend') {
      tendPatch(ctx, target.ogPatch);
      return true;
    }
    if (target === ctx.data.hint && verbId === 'read') {
      ctx.data.readHint = true;
      ctx.converse({ title: "Mab's Note", kicker: 'Tucked behind a plank', text: HINT_TEXT, choices: [{ label: 'Got it', value: 'ok' }] });
      return true;
    }
    if (target === ctx.data.exit && verbId === 'leave') {
      wayBack(ctx);
      return true;
    }
    return false;
  },

  objective(ctx) {
    const lit = (ctx.data.state || []).filter(Boolean).length;
    const text = ctx.data.phase === 'solved'
      ? 'The bog is blooming. Head back to Ur.'
      : 'Tend the gloomy patches. Each one you tend stirs its neighbours too.';
    return { text, stats: [['blooming', `${lit}/${PATCHES}`], ['tended', ctx.data.tends?.length || 0]] };
  },

  onLeave() {
    // onExitLocation sets `leave` every time; only a solved run completes.
    return { leaveFlag: 'leave' };
  },

  publish(ctx) {
    ctx.setData('ogState', (ctx.data.state || []).map((b) => (b ? '1' : '0')).join(''));
    ctx.setData('ogPhase', ctx.data.phase || '');
    ctx.setData('ogTends', (ctx.data.tends || []).join(','));
    ctx.setData('ogHint', ctx.data.readHint ? '1' : '0');
  },

  async autoplay(ctx, mode) {
    const go = async (x, y = FLOOR) => {
      ctx.place(x, y);
      await ctx.wait(350);
    };
    await ctx.wait(500);
    await go(HINT.x - 30, HINT.y);
    room.runVerb(ctx, ctx.data.hint, 'read');
    await ctx.wait(400);
    ctx.advanceDialog();
    if (mode === 'hint') return 'hint';
    const order = mode === 'wrong' ? [1, 2] : HINT_PATCHES;
    for (const i of order) {
      await go(patchX(i) - 40);
      room.runVerb(ctx, ctx.data.patches[i].target, 'tend');
      await ctx.wait(400);
    }
    if (mode === 'wrong' || mode === 'solved') return ctx.data.phase;
    await ctx.wait(900);
    await go(EXIT.x - 20, TUNNEL);
    room.runVerb(ctx, ctx.data.exit, 'leave');
    return 'left';
  },
};

function tendPatch(ctx, i) {
  if (ctx.data.phase === 'solved') return;
  if (!ctx.near(patchX(i), FLOOR, 140)) {
    ctx.toast('Walk up to the patch first.', 1600);
    return;
  }
  ctx.data.state = tend(ctx.data.state, i);
  ctx.data.tends.push(i);
  for (const p of ctx.data.patches) p.target.label = ctx.data.state[p.i] ? 'Blooming Patch' : 'Gloomy Patch';
  ctx.sound('CLICK_SUCCESS', { volume: 0.4 });
  if (solved(ctx.data.state)) {
    ctx.data.phase = 'solved';
    ctx.progress('solved_puzzle');
    ctx.solve();
    ctx.engine.playEmotion?.('happy');
    ctx.sound('ACHIEVEMENT_UNLOCKED', { volume: 0.5 });
    ctx.floatText(patchX(3), FLOOR - 170, 'The bog remembers how to bloom!', '#bfeaff');
  }
}

async function wayBack(ctx) {
  if (!ctx.near(EXIT.x, EXIT.y, 150)) {
    ctx.toast('Walk over to the way back first.', 1800);
    return;
  }
  if (ctx.data.phase !== 'solved') {
    const choice = await ctx.converse({
      title: 'Operation: Grow',
      kicker: 'Leave the bog fields?',
      text: 'The fields are still gloomy. Leave anyway? The quest will fail.',
      choices: [{ label: 'Stay', value: 'stay' }, { label: 'Leave', value: 'leave' }],
    });
    if (choice !== 'leave') return;
  }
  ctx.leave({ transition: ctx.fx() });
}

export const GROW_FACTS = Object.freeze({ W, H, FLOOR, CEILING, TUNNEL, JUMP_RISE, JUMP_GAP });
