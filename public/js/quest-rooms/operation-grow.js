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
 * recording has turned up. The room is rebuilt from the quest text alone
 * ("Solve the puzzle to brighten up the gloomy, forgotten bog fields. I bet
 * Mab left a hint somewhere to help you out."): seven gloomy bog patches in a
 * row, where tending one stirs it and its two neighbours between gloom and
 * bloom (a lights-out row, the kind of toggle the source's
 * clickable_broadcaster + deco_show/hide events built). The field brightens
 * as patches bloom. Mab's hint is her card on a plank up on the mossy banks
 * left of the start: a row of seven dots with the first, middle and last
 * picked out. Solving locks the field in bloom; the way back sits at the far
 * end (or Leave). Art: recovered soil patches, Firebog decos (bogwillow,
 * cattails, aqua mushrooms, blue wildflowers, plank sign; drawn firefly glows) and
 * the Mab icon.
 */

import { JUMP_GAP, JUMP_RISE } from './puzzle-kit.js?v=cu-1';
import { textureFromUrl } from '../textures.js';

export const W = 2500;
export const H = 960;
export const FLOOR = 820;
export const EXIT_MS = 5 * 60 * 1000; // source: questInstanceLocation(..., 5*60)
export const PATCHES = 7;
export const PATCH_X0 = 700;
export const PATCH_DX = 220;
export const SPAWN = { x: 520, y: FLOOR };
export const BANKS = Object.freeze([
  { id: 'og_bank1', x1: 300, x2: 420, y: FLOOR - 95 },
  { id: 'og_bank2', x1: 140, x2: 300, y: FLOOR - 190 },
]);
export const HINT = { x: 180, y: FLOOR - 190 };
export const EXIT = { x: 2330, y: FLOOR };
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

export function growPlatforms() {
  const p = [{ id: 'og_floor', x1: 0, y1: FLOOR, x2: W, y2: FLOOR, style: 'invisible' }];
  for (const b of BANKS) p.push({ id: b.id, x1: b.x1, y1: b.y, x2: b.x2, y2: b.y, style: 'invisible' });
  return p;
}

/* ------------------------------------------------------------------ */
/* Drawing                                                              */
/* ------------------------------------------------------------------ */

function drawBank(g, b) {
  g.roundRect(b.x1, b.y, b.x2 - b.x1, FLOOR - b.y, 10).fill(0x3e3326);
  g.roundRect(b.x1 - 4, b.y - 4, b.x2 - b.x1 + 8, 14, 7).fill(0x5c7a3a);
}

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

/** One patch: soil, a wilted sprout or blue blooms, and a glow while blooming. */
function makePatch(ctx, i) {
  const { PIXI, kit } = ctx;
  const c = new PIXI.Container();
  const glow = kit.glow(PIXI, 0, -26, 0x7fd4ff, 24);
  glow.alpha = 0;
  c.addChild(glow);
  const soil = new PIXI.Sprite(textureFromUrl('assets/sprites/soil/patch-dark-dirty.png'));
  soil.anchor.set(0.5, 0.75);
  soil.scale.set(1.2);
  c.addChild(soil);
  const wilt = new PIXI.Sprite(textureFromUrl('assets/sprites/soil/patch-seedling.png'));
  wilt.anchor.set(0.5, 1);
  wilt.scale.set(0.9);
  wilt.y = -4;
  wilt.tint = 0x6f6a5e;
  c.addChild(wilt);
  const bloom = new PIXI.Container();
  bloom.addChild(kit.deco(PIXI, 'bling_branchflowerbrush_blue_1', 0, -2, { scale: 0.62 }));
  bloom.addChild(kit.deco(PIXI, i % 2 ? 'mushroom_aqua_1' : 'mushroom_aqua_2', i % 2 ? -34 : 36, 0, { scale: i % 2 ? 0.42 : 0.3 }));
  bloom.addChild(kit.deco(PIXI, 'wildflowers_blue_1', 0, 4, { scale: 0.8 }));
  bloom.alpha = 0;
  c.addChild(bloom);
  c.x = patchX(i);
  c.y = FLOOR;
  const target = ctx.register({ classId: 'bog_patch', label: 'Gloomy Patch', subtitle: 'Tend it', sprite: c, ogPatch: i });
  return { i, target, glow, wilt, bloom, soil, shown: 0 };
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
  travelText: 'Brighten the field, then take the way back.',

  build(ctx) {
    const { PIXI, kit } = ctx;
    ctx.data.state = startState();
    const root = kit.sceneRoot(PIXI, W, H);
    const sky = root.layer(0, 0);
    sky.addChild(kit.gradient(PIXI, [[0, '#4a4f6b'], [0.55, '#7f8f8a'], [1, '#c7d6b5']], 960, 640));
    const far = root.layer(0.3, 1);
    for (let i = 0; i < 9; i++) {
      far.addChild(kit.deco(PIXI, 'underground_bogwillow', 120 + i * 320, 700 + (i % 2) * 30, { scale: 0.9 + (i % 3) * 0.15, alpha: 0.55, tint: 0x6f8a70 }));
    }
    const mid = root.layer(0.6, 2);
    for (let i = 0; i < 14; i++) {
      mid.addChild(kit.deco(PIXI, i % 2 ? 'cattail_1' : 'cattail_2', 80 + i * 190, 830, { scale: 0.32 + (i % 3) * 0.05, alpha: 0.75 }));
    }
    const world = root.layer(1, 3);
    const g = new PIXI.Graphics();
    g.rect(-400, FLOOR, W + 800, H - FLOOR + 400).fill(0x3a2f24);
    g.rect(-400, FLOOR - 6, W + 800, 14).fill(0x4f6a35);
    for (const b of BANKS) drawBank(g, b);
    world.addChild(g);
    for (let i = 0; i < PATCHES - 1; i++) {
      world.addChild(kit.deco(PIXI, 'firebog_puddle_1', patchX(i) + PATCH_DX / 2, FLOOR + 14, { scale: 0.16, alpha: 0.8 }));
    }
    for (const x of [60, 980, 1640, 2200, 2460]) world.addChild(kit.deco(PIXI, 'underground_bogwillow_1', x, FLOOR + 4, { scale: 0.7 }));
    // The way back: a blue light shaft over a plank.
    ctx.data.exitBeam = kit.deco(PIXI, 'light_shafts_blue', EXIT.x, FLOOR + 10, { scale: 0.22, alpha: 0.15 });
    world.addChild(ctx.data.exitBeam);
    world.addChild(kit.deco(PIXI, 'firebog_sign_blank_plank', EXIT.x + 70, FLOOR - 60, { scale: 0.3 }));
    world.addChild(kit.label(PIXI, 'Back to Ur', EXIT.x + 70, FLOOR - 82, { size: 15, fill: 0xf7e7c4 }));
    // The gloom: a dusk wash over everything, lifted as the patches bloom.
    const gloom = new PIXI.Graphics();
    gloom.rect(-200, -200, W + 400, H + 400).fill(0x12101c);
    gloom.alpha = 0.55;
    gloom.zIndex = 4;
    root.addChild(gloom);
    ctx.data.gloom = gloom;
    ctx.data.fireflies = [];
    const flies = root.layer(1, 5);
    for (let i = 0; i < 18; i++) {
      const f = kit.glow(PIXI, 560 + i * 105 + (i % 3) * 23, FLOOR - 90 - ((i * 37) % 150), 0xe8ff8a, 5);
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
    ctx.data.exit = ctx.register({ classId: 'bog_way_back', label: 'Back to Ur', subtitle: 'Complete the journey', sprite: exitHit });
    ctx.data.tends = [];
    ctx.data.phase = 'play';
  },

  tick(ctx, dtMs = 16) {
    const frac = bloomFraction(ctx.data.state || []);
    const k = Math.min(1, (dtMs || 16) / 180);
    if (ctx.data.gloom && !ctx.data.gloom.destroyed) {
      const want = ctx.data.phase === 'solved' ? 0 : 0.55 * (1 - frac * 0.7);
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
      p.bloom.alpha = p.shown;
      p.bloom.scale.set(0.6 + 0.4 * p.shown);
      p.wilt.alpha = 1 - p.shown;
      p.glow.alpha = p.shown * (0.75 + 0.25 * Math.sin(t * 2 + p.i));
    }
  },

  verbs(ctx, target) {
    if (target.ogPatch != null) {
      const locked = ctx.data.phase === 'solved';
      return [{ id: 'tend', label: 'Tend', enabled: !locked, reason: locked ? 'The field is in bloom.' : '', tooltip: 'Tend this patch (its neighbours stir too)' }];
    }
    if (target === ctx.data.hint) return [{ id: 'read', label: 'Read', enabled: true, tooltip: "Read Mab's note" }];
    if (target === ctx.data.exit) return [{ id: 'leave', label: 'Leave', enabled: true, tooltip: 'Back to Ur' }];
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
    await go(HINT.x + 20, HINT.y);
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
    await go(EXIT.x - 20);
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

export const GROW_FACTS = Object.freeze({ W, H, FLOOR, JUMP_RISE, JUMP_GAP });
