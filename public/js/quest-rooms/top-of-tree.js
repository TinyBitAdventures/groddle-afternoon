/**
 * The High Jumper (quests/high_jump.js): the Magic Rock's memory-place tree.
 *
 * Source: onStarted creates instance `top_of_tree` from template
 * LLI19Q27KMF175V (dev LHH37ET29CT1CBO) at -315,-53 with exit_delay 2*60.
 * players/inc_announcements.js overlay_script_top_of_tree adds 50 energy and
 * the rock says "Trial and error, baby. Just get started…"; if no Spinach has
 * been activated it nags at 30 s ("Sigh. Activate a spinach then jump.") and
 * 45 s ("Oy! Activate a spinach. Then jump. It’s easy!!"). The location sets
 * ignore_quoin_limit and its quoins never respawn (items/quoin.js). The only
 * requirement is the `top_of_tree` flag; onComplete_custom then prompts "Just
 * jump off the tree to go back to where you were…".
 *
 * The template geometry is lost. The supplied recording (cY1G2GIoJ94) shows a
 * white memory space, one tall straight trunk and needle-fan branches that
 * alternate sides, too far apart for an ordinary jump: Spinach (buffs.js
 * high_jumper, 1.5x jump) closes each gap. Branch art is the recovered
 * platform_branch_* deco family; the walking line sits on the needle tops.
 * The look follows a player's Snap (research/wayback/raw/snaps/top_of_tree/,
 * reference only): pure white with no floor band, a straight bark trunk on a
 * flared root base, and the place's own name.
 */

import { metabolicGain } from '../metabolics.js';

export const TREE_W = 1400;
export const TREE_H = 2320;
export const GROUND = 2160;
export const TRUNK_X = 700;
export const CROWN_Y = 380;
export const CLIMB_MS = 2 * 60 * 1000;
export const NAG = Object.freeze([
  { atMs: 30_000, text: 'Sigh. Activate a spinach then jump.' },
  { atMs: 45_000, text: 'Oy! Activate a spinach. Then jump. It’s easy!!' },
]);
export const PLACE_NAME = 'The Gold Hatted, Bouncing, High Jumping Memory Place';
export const ROCK_LINE = 'Trial and error, baby. Just get started…';
export const JUMP_OFF_LINE = 'Just jump off the tree to go back to where you were…';

/** Branch art: [deco, width, height, side the trunk end is on]. */
const LEFT_ART = [['platform_branch_4', 602, 206], ['platform_branch_a02', 664, 186], ['platform_branch_a04', 730, 208]];
const RIGHT_ART = [['platform_branch_a01', 520, 230], ['platform_branch_a03', 300, 108]];

/** Alternating branches 200 px apart: one ordinary jump (about 110 px) short, one Spinach jump (about 296 px) clear. */
export function treeBranches() {
  const rows = [
    [1960, 'R'], [1760, 'L'], [1560, 'R'], [1360, 'L'], [1160, 'R'], [960, 'L'], [760, 'R'], [560, 'L'],
  ];
  return rows.map(([y, side], i) => ({
    id: `branch_${i}`,
    side,
    y,
    x1: side === 'L' ? TRUNK_X - 300 : TRUNK_X + 6,
    x2: side === 'L' ? TRUNK_X - 6 : TRUNK_X + 300,
  }));
}

export function treePlatforms(kit) {
  const out = [kit.plat(0, GROUND, TREE_W, GROUND, 'invisible', { id: 'tree_ground' })];
  for (const b of treeBranches()) out.push(kit.plat(b.x1, b.y, b.x2, b.y, 'invisible', { id: b.id }));
  out.push(kit.plat(TRUNK_X - 170, CROWN_Y, TRUNK_X + 170, CROWN_Y, 'invisible', { id: 'tree_crown' }));
  return out;
}

/** Spinach on the ground (three) and on three branches. */
export function spinachSpots() {
  const b = treeBranches();
  return [
    { id: 'ground', x: 1010, y: GROUND, count: 3, refill: true },
    { id: 'b2', x: b[2].x2 - 70, y: b[2].y, count: 1 },
    { id: 'b4', x: b[4].x2 - 60, y: b[4].y, count: 1 },
    { id: 'b6', x: b[6].x2 - 60, y: b[6].y, count: 1 },
  ];
}

/** The crown's quoins (ignore_quoin_limit): a ring of mixed quoins, two of them time. */
export function crownQuoins() {
  const types = ['xp', 'mood', 'currants', 'energy', 'time', 'xp', 'mood', 'currants', 'time', 'xp'];
  return types.map((type, i) => {
    const a = Math.PI * (0.08 + (0.84 * i) / (types.length - 1));
    return { id: `q${i}`, type, x: Math.round(TRUNK_X - Math.cos(a) * 250), y: Math.round(CROWN_Y - 40 - Math.sin(a) * 150) };
  });
}

/**
 * The trunk as players' Snap PIF3L2MLDT53HEF_52894 shows it: a straight bark trunk (the CC0
 * tree_stack_trunk deco, 88 x 700 stage, stacked) about 0.7 of an avatar wide, on a flared root
 * base with claw-like roots (vector, in the deco's own bark tones), standing on nothing:
 * the memory is pure white.
 */
export const TRUNK_W = 90;
// Bark tones sampled from the tree_stack_trunk render (left lit edge, middle, shaded right).
const BARK = Object.freeze({ left: 0x563b15, mid: 0x49320e, right: 0x3d2a0a, light: 0x76552a });

function drawTrunk(PIXI, kit) {
  const c = new PIXI.Container();
  const top = CROWN_Y - 30;
  const seg = TRUNK_W * (700 / 88);
  for (let y = GROUND + 10; y > top; y -= seg * 0.97) {
    const spr = kit.deco(PIXI, 'tree_stack_trunk', TRUNK_X, y, {});
    spr.width = TRUNK_W;
    spr.height = seg;
    c.addChild(spr);
  }
  // The tip tapers into the crown fans.
  const tip = new PIXI.Graphics();
  tip.moveTo(TRUNK_X - TRUNK_W / 2, top + 30);
  tip.quadraticCurveTo(TRUNK_X - 20, top - 30, TRUNK_X - 4, top - 70);
  tip.lineTo(TRUNK_X + 6, top - 70);
  tip.quadraticCurveTo(TRUNK_X + 22, top - 30, TRUNK_X + TRUNK_W / 2, top + 30);
  tip.closePath();
  tip.fill(BARK.mid);
  c.addChild(tip);
  // The flared base: two wings widen off the trunk's edges over its last ~130 px into root
  // claws, with smaller claws in front; the bark texture stays visible down the middle.
  const half = TRUNK_W / 2;
  const L = TRUNK_X - half;
  const R = TRUNK_X + half;
  const base = new PIXI.Graphics();
  base.moveTo(L + 6, GROUND - 140);
  base.bezierCurveTo(L + 2, GROUND - 60, L - 34, GROUND - 16, L - 76, GROUND + 6);
  base.lineTo(L - 40, GROUND + 4);
  base.lineTo(L - 22, GROUND + 14);
  base.bezierCurveTo(L - 4, GROUND - 4, L + 14, GROUND - 40, L + 22, GROUND - 90);
  base.closePath();
  base.fill(BARK.left);
  base.moveTo(R - 6, GROUND - 140);
  base.bezierCurveTo(R - 2, GROUND - 60, R + 34, GROUND - 16, R + 72, GROUND + 6);
  base.lineTo(R + 36, GROUND + 10);
  base.lineTo(R + 14, GROUND + 4);
  base.bezierCurveTo(R - 2, GROUND - 6, R - 14, GROUND - 40, R - 22, GROUND - 90);
  base.closePath();
  base.fill(BARK.right);
  // Front claws.
  for (const [x, dx, col] of [[TRUNK_X - 18, -26, BARK.left], [TRUNK_X + 4, 6, BARK.mid], [TRUNK_X + 24, 30, BARK.right]]) {
    base.moveTo(x - 14, GROUND - 40);
    base.quadraticCurveTo(x - 10, GROUND - 6, x + dx, GROUND + 14);
    base.quadraticCurveTo(x + 6, GROUND - 4, x + 14, GROUND - 40);
    base.closePath();
    base.fill(col);
  }
  // Ridges running into each claw.
  for (const [x0, x1] of [[L + 10, L - 60], [L + 30, L - 26], [TRUNK_X + 4, TRUNK_X + 10], [R - 26, R + 30], [R - 10, R + 58]]) {
    base.moveTo(x0, GROUND - 120);
    base.quadraticCurveTo(x0 + (x1 - x0) * 0.15, GROUND - 30, x1, GROUND + 4);
  }
  base.stroke({ width: 2.5, color: BARK.light, alpha: 0.45 });
  c.addChild(base);
  return c;
}

export const room = {
  id: 'top_of_tree',
  /** Keeps its own white memory-place light: the world-only Dametime tint stays off (G99). */
  ownLight: true,
  title: 'The High Jumper',
  kicker: 'The Magic Rock’s memory-place',
  icon: 'assets/sprites/icons/spinach.png',
  theme: 'memory',
  hubName: 'A memory-place',
  durationMs: CLIMB_MS,
  doneLabel: 'Go back',
  leaveText: 'Leave the memory-place? You can try the climb again later.',

  build(ctx) {
    const { PIXI, kit } = ctx;
    const root = kit.sceneRoot(PIXI, TREE_W, TREE_H);
    const sky = root.layer(0, 0);
    // Pure white, as in the Snap: no clouds, no floor band.
    sky.addChild(kit.gradient(PIXI, [[0, '#ffffff'], [1, '#ffffff']], 960, 640));
    const world = root.layer(1, 2);
    // Only a faint contact shadow where the roots meet the white.
    const shade = new PIXI.Graphics();
    shade.ellipse(TRUNK_X + 4, GROUND + 10, 150, 9).fill({ color: 0xe6e8ec, alpha: 0.7 });
    world.addChild(shade);
    world.addChild(drawTrunk(PIXI, kit));
    // Branches: the needle tops sit on the walking line (about 26% down each sprite).
    treeBranches().forEach((b, i) => {
      if (b.side === 'L') {
        const [name, w, h] = LEFT_ART[i % LEFT_ART.length];
        const s = 330 / w;
        world.addChild(kit.deco(PIXI, name, TRUNK_X + 14, b.y - h * s * 0.26, { ax: 1, ay: 0, scale: s }));
      } else {
        const [name, w, h] = RIGHT_ART[i % RIGHT_ART.length];
        const s = 330 / w;
        world.addChild(kit.deco(PIXI, name, TRUNK_X - 14, b.y - h * s * 0.26, { ax: 0, ay: 0, scale: s }));
      }
    });
    // The crown: two fans either side of the tip and a tuft above.
    world.addChild(kit.deco(PIXI, 'platform_branch_4', TRUNK_X + 18, CROWN_Y - 34, { ax: 1, ay: 0, scale: 0.36 }));
    world.addChild(kit.deco(PIXI, 'platform_branch_a01', TRUNK_X - 18, CROWN_Y - 40, { ax: 0, ay: 0, scale: 0.42 }));
    world.addChild(kit.deco(PIXI, 'bling_branch_pinecone_1', TRUNK_X + 40, CROWN_Y - 20, { ax: 0.15, ay: 1, scale: 0.22, rotation: -1.15 }));
    return {
      // The place's own name (GSJS inc_data_maps_prod.js, template LLI19Q27KMF175V, the one
      // quests/high_jump.js instances); the Snap's Location block prints it too.
      label: PLACE_NAME,
      width: TREE_W,
      height: TREE_H,
      background: root,
      platforms: treePlatforms(kit),
      spawn: { x: 420, y: GROUND },
    };
  },

  start(ctx) {
    const pc = ctx.engine.pc;
    // inc_announcements.js 380: metabolics_add_energy(50), refused while dead
    // or Super Pooped (inc_metabolics.js 40-53).
    if (metabolicGain('energy').ok) pc.energy = Math.min((Number(pc.energyMax) || 100), (Number(pc.energy) || 0) + 50);
    ctx.data.enteredAt = Date.now();
    ctx.data.spinachActivated = false;
    ctx.data.nagged = 0;
    ctx.data.highest = GROUND;
  },

  enter(ctx) {
    const { PIXI, kit } = ctx;
    ctx.data.spinach = spinachSpots().map((s) => {
      const spr = ctx.add(kit.icon(PIXI, 'spinach', s.x, s.y - 2, { scale: 0.75 }), 26);
      return { ...s, spr, left: s.count };
    });
    ctx.data.quoins = crownQuoins().map((q) => ({ ...q, spr: ctx.add(ctx.quoinSprite(q.type, q.x, q.y, 0.75), 32), taken: false }));
    ctx.engine.updateHud();
    // inc_announcements.js 378-416 overlay_script_top_of_tree: the pet_rock_rays
    // overlay and a 500 px bubble_familiar under it (G220), not a prompt.
    ctx.converse({ title: 'The High Jumper', kicker: 'Magic Rock', text: ROCK_LINE, choices: [{ label: 'OK', value: 'ok' }], look: 'vog', width: 500 });
  },

  onEvent(ctx, counter) {
    if (counter === 'spinach:use' || counter === 'spinach:activate') ctx.data.spinachActivated = true;
  },

  tick(ctx) {
    const p = ctx.player;
    if (!p) return;
    const t = Date.now() / 1000;
    ctx.data.highest = Math.min(ctx.data.highest, p.y);
    // Spinach pickups (collision, like the dropped stacks).
    for (const s of ctx.data.spinach || []) {
      if (!s.spr || s.spr.destroyed) continue;
      if (s.left <= 0) {
        if (s.refill && ctx.count('spinach') === 0 && !ctx.hasProgress('top_of_tree')) {
          s.left = 1;
          s.spr.visible = true;
        } else continue;
      }
      if (Math.abs(p.x - s.x) < 40 && Math.abs(p.y - s.y) < 30) {
        const n = s.left;
        s.left = 0;
        s.spr.visible = false;
        ctx.give('spinach', n);
        ctx.sound('PICKUP', { volume: 0.5 });
        ctx.floatText(s.x, s.y - 40, `+${n} Spinach`, '#5a9a2f');
        ctx.activity(`You picked up ${n} Spinach. Activate it in your pack to jump so high.`);
      }
    }
    // Crown quoins: ignore_quoin_limit; time quoins add 20 seconds to the climb.
    for (const q of ctx.data.quoins || []) {
      if (q.taken || !q.spr || q.spr.destroyed) continue;
      q.spr.y = q.y + Math.sin(t * 2.6 + q.x / 60) * 6;
      if (Math.abs(p.x - q.x) < 34 && p.y - 70 < q.y + 18 && p.y + 6 > q.y - 18) {
        q.taken = true;
        q.spr.visible = false;
        if (q.type === 'time') {
          ctx.extend(20_000);
          ctx.floatText(q.x, q.y - 16, '+20 seconds', '#ffffff');
          ctx.sound('QUOIN_TIME', { volume: 0.5 });
        } else {
          ctx.collectQuoin(q.type, q.x, q.y, { ignoreLimit: true });
        }
      }
    }
    // The rock nags if no Spinach has been activated yet.
    const since = Date.now() - (ctx.data.enteredAt || Date.now());
    const nag = NAG[ctx.data.nagged];
    if (nag && since >= nag.atMs && !ctx.data.spinachActivated && !ctx.dialogOpen() && !ctx.hasProgress('top_of_tree')) {
      ctx.data.nagged += 1;
      // inc_announcements.js 363-375 activate_spinach_prompt: a prompts_add prompt, timeout 10,
      // timeout_value '' (G304: the bottom-right prompt stack, not a card).
      ctx.prompt({ text: nag.text, choices: [{ label: 'Ok', value: '' }], timeout: 10, timeoutValue: '' });
    } else if (nag && ctx.data.spinachActivated) {
      ctx.data.nagged = NAG.length;
    }
    // The crown sets the flag; the quest turns in right there.
    if (!ctx.data.topped && p.onGround && p.y <= CROWN_Y + 4 && Math.abs(p.x - TRUNK_X) <= 175) {
      ctx.data.topped = true;
      ctx.progress('top_of_tree');
      ctx.solve();
      ctx.sound('ACHIEVEMENT_UNLOCKED', { volume: 0.5 });
      ctx.turnIn().then(() => {
        ctx.data.jumpOff = true;
        // locations/location.js 366-374: prompts_add_delayed timeout 10, timeout_value '' (G198;
        // G304: the prompt stack).
        return ctx.prompt({ text: JUMP_OFF_LINE, choices: [{ label: 'Ok', value: '' }], timeout: 10, timeoutValue: '' });
      });
    }
    // Jumping off the tree (landing on the ground once you have topped it) goes back.
    if (ctx.data.jumpOff && !ctx.data.leaving && p.onGround && p.y >= GROUND - 2) {
      ctx.data.leaving = true;
      ctx.leave();
    }
  },

  objective(ctx) {
    const top = ctx.data.topped;
    const branch = treeBranches().filter((b) => (ctx.data.highest ?? GROUND) <= b.y + 2).length;
    return {
      text: top
        ? JUMP_OFF_LINE
        : ctx.data.spinachActivated
          ? 'Jump from branch to branch to the top of the tree.'
          : 'Pick up Spinach, Activate it in your pack, then jump.',
      stats: [
        ['branches', `${top ? 8 : branch}/8`],
        ['spinach', String(ctx.count('spinach'))],
      ],
    };
  },

  publish(ctx) {
    ctx.setData('treeTopped', ctx.data.topped ? '1' : '0');
    ctx.setData('treeSpinach', String(ctx.count('spinach')));
    ctx.setData('treeSpinachActivated', ctx.data.spinachActivated ? '1' : '0');
    ctx.setData('treeHighest', String(Math.round(ctx.data.highest ?? GROUND)));
    ctx.setData('treeNagged', String(ctx.data.nagged || 0));
    ctx.setData('treeQuoins', String((ctx.data.quoins || []).filter((q) => q.taken).length));
  },

  async autoplay(ctx, mode) {
    await ctx.wait(500);
    while (ctx.dialogOpen()) {
      ctx.advanceDialog();
      await ctx.wait(250);
    }
    // Pick up the ground Spinach and activate one through the pack (shift-click quick use).
    const ground = ctx.data.spinach.find((s) => s.id === 'ground');
    ctx.place(ground.x, GROUND - 10);
    for (let i = 0; i < 30 && ground.left > 0; i++) await ctx.wait(100);
    const slot = typeof document !== 'undefined' && document.querySelector('.pack-slot[data-tsid="spinach"]');
    if (slot) slot.dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey: true }));
    for (let i = 0; i < 20 && !ctx.data.spinachActivated; i++) await ctx.wait(100);
    if (mode === 'spinach') return 'spinach';
    // Climb branch by branch (placed: headless frames are too slow to steer jumps).
    for (const b of treeBranches()) {
      ctx.place((b.x1 + b.x2) / 2, b.y - 4);
      await ctx.wait(350);
    }
    if (mode === 'branch') return 'branch';
    ctx.place(TRUNK_X - 40, CROWN_Y - 6);
    for (let i = 0; i < 40 && !ctx.data.topped; i++) await ctx.wait(100);
    if (mode === 'top') return 'top';
    // Sweep the crown quoins, then the award and the jump-off prompt.
    for (const q of ctx.data.quoins) {
      ctx.place(q.x, q.y + 30);
      for (let i = 0; i < 10 && !q.taken; i++) await ctx.wait(100);
    }
    for (let i = 0; i < 60 && !ctx.data.jumpOff; i++) {
      if (!ctx.dialogOpen()) {
        const next = typeof document !== 'undefined' && document.querySelector('#award-screen [data-award-next]');
        if (next && !next.hidden && next.offsetParent) next.click();
      }
      await ctx.wait(250);
    }
    if (mode === 'award') return 'award';
    while (ctx.dialogOpen()) {
      ctx.advanceDialog();
      await ctx.wait(250);
    }
    ctx.place(TRUNK_X + 380, GROUND - 40);
    for (let i = 0; i < 40 && ctx.run; i++) await ctx.wait(150);
    return 'complete';
  },
};
