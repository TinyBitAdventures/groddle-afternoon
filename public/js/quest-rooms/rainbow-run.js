/**
 * Rainbow Run (The Numismatic Hustle, quests/numismatic_hustle.js).
 *
 * Source: onStarted creates instance `rainbow_run` from template
 * LIF9NRCLF273JBA with exit_delay 0. locations/location.js shows "Get ready
 * to grab those coins! (CLICK WHEN READY)"; players/inc_quests.js
 * rainbow_run_ready plays the 3-2-1 countdown, rainbow_run_start runs a
 * 30-second clock with the FUTURE_SWING_30 cue and a "Coins N/30 · Time 0:SS"
 * counter; every quoin collected meanwhile adds to the quest's
 * `quoins_collected` counter (items/quoin.js). At the end: "Success! You got
 * them coins but good." or "Failure! How embarrassing.", then the exit.
 * Leaving short of 30 fails the quest with "My Grandma has more Hustle than
 * that." The template geometry is lost, so the course is a bright rainbow
 * reconstruction sized so 30 of its 44 coins take a brisk, clean run.
 */

const W = 3600;
const H = 980;
const FLOOR = 840;
export const RUN_MS = 30_000;
export const COINS_NEEDED = 30;

const BANDS = [0xff6b6b, 0xffa94d, 0xffe066, 0x8ce99a, 0x74c0fc, 0x9775fa];

/** Walkable lines: the floor and three tiers of rainbow clouds. */
export function rainbowPlatforms(kit) {
  const p = [kit.plat(0, FLOOR, W, FLOOR, 'invisible', { id: 'rr_floor' })];
  // A rolling staircase of clouds: every ledge is one hop (<= 100 px) above
  // the floor or the ledge beside it.
  const tiers = [
    [380, 740, 600], [660, 640, 860], [920, 740, 1120], [1200, 650, 1420], [1480, 560, 1680],
    [1760, 660, 1960], [2040, 750, 2260], [2340, 650, 2540], [2620, 560, 2820], [2900, 660, 3100],
    [3180, 750, 3380],
  ];
  tiers.forEach(([x1, y, x2], i) => p.push(kit.plat(x1, y, x2, y, 'cloud', { id: `rr_c${i}` })));
  return p;
}

/** Coin spots: low arcs over the floor, rows on every cloud. */
export function rainbowCoins() {
  const out = [];
  const add = (x, y) => out.push({ id: `c${out.length}`, x: Math.round(x), y: Math.round(y) });
  for (let i = 0; i < 12; i++) add(260 + i * 270, FLOOR - 46 - (i % 3) * 18);
  const rows = [[420, 560, 2, 740], [690, 830, 3, 640], [960, 1080, 2, 740], [1240, 1380, 3, 650],
    [1520, 1640, 3, 560], [1800, 1920, 2, 660], [2080, 2220, 2, 750], [2380, 2500, 3, 650],
    [2660, 2780, 3, 560], [2940, 3060, 2, 660], [3220, 3340, 2, 750]];
  for (const [x1, x2, n, y] of rows) {
    for (let k = 0; k < n; k++) add(x1 + ((x2 - x1) * k) / Math.max(1, n - 1), y - 44);
  }
  // A last sweep along the far end.
  for (let i = 0; i < 4; i++) add(3420 + i * 45, FLOOR - 50 - (i % 2) * 40);
  return out;
}

function drawRainbow(PIXI, cx, cy, r, alpha = 0.55) {
  const g = new PIXI.Graphics();
  BANDS.forEach((c, i) => {
    g.lineStyle(26, c, alpha);
    g.arc(cx, cy, r - i * 24, Math.PI, 0);
  });
  return g;
}

export const room = {
  id: 'rainbow_run',
  title: 'Rainbow Run',
  kicker: 'Coins in 30 seconds',
  icon: 'assets/sprites/quest-rooms/rainbow_run/coin.png',
  theme: 'memory',
  hubName: 'The infamous Rainbow Run',
  durationMs: 0, // exit_delay 0: the 30-second clock ends it
  lowMs: 10_000,
  leaveText: 'Leave Rainbow Run? Your coins will not count.',
  doneLabel: 'Leave',

  build(ctx) {
    const { PIXI, kit } = ctx;
    const root = kit.sceneRoot(PIXI, W, H);
    const sky = root.layer(0, 0);
    sky.addChild(kit.gradient(PIXI, [[0, '#7fd3ff'], [0.55, '#c8f0ff'], [1, '#fff6d8']], 960, 640));
    const far = root.layer(0.2, 1);
    for (let i = 0; i < 3; i++) far.addChild(drawRainbow(PIXI, 520 + i * 1100, 760, 470, 0.32));
    for (let i = 0; i < 8; i++) {
      far.addChild(kit.deco(PIXI, 'cloud_fluffy_1', 160 + i * 420, 300 + (i % 3) * 60, { scale: 0.6, alpha: 0.85 }));
    }
    const mid = root.layer(0.55, 2);
    for (let i = 0; i < 8; i++) {
      mid.addChild(kit.deco(PIXI, i % 2 ? 'cloud_3' : 'cloud_5', 260 + i * 470, 560 + (i % 3) * 50, { scale: 1.1, alpha: 0.75, tint: 0xffffff }));
    }
    const world = root.layer(1, 3);
    const g = new PIXI.Graphics();
    // Striped rainbow floor.
    BANDS.forEach((c, i) => {
      g.beginFill(c);
      g.drawRect(0, FLOOR + i * 24, W, 24);
      g.endFill();
    });
    g.beginFill(0xffffff, 0.35);
    g.drawRect(0, FLOOR, W, 6);
    g.endFill();
    const platforms = rainbowPlatforms(kit);
    world.addChild(g);
    // Each cloud ledge is a recovered puffy block_cloud01 (850x416), its flat
    // top on the walking line.
    platforms.filter((p) => p.style === 'cloud').forEach((p, i) => {
      const w = p.x2 - p.x1 + 60;
      const c = kit.deco(PIXI, 'block_cloud01', (p.x1 + p.x2) / 2, p.y1 - 18, { ay: 0, scale: w / 850, sy: (w / 850) * 0.62 });
      c.tint = [0xfff5f5, 0xfffbe8, 0xf3fff2, 0xf0f8ff, 0xf8f2ff][i % 5];
      world.addChild(c);
    });
    // Start and finish flags.
    world.addChild(kit.label(PIXI, 'START', 120, FLOOR - 70, { size: 26, fill: 0xffffff, stroke: 0x5a7894, strokeThickness: 5 }));
    return {
      label: 'Rainbow Run',
      width: W,
      height: H,
      background: root,
      platforms,
      spawn: { x: 120, y: FLOOR },
    };
  },

  enter(ctx) {
    ctx.data.coins = [];
    ctx.data.got = 0;
    ctx.data.phase = ctx.data.phase || 'ready';
    for (const c of rainbowCoins()) {
      const spr = ctx.add(ctx.quoinSprite('currants', c.x, c.y, 0.85), 30);
      ctx.data.coins.push({ ...c, spr, taken: false });
    }
    if (ctx.data.phase === 'ready') ready(ctx);
  },

  clock(ctx) {
    if (ctx.data.phase === 'ready' || ctx.data.phase === 'countdown') return RUN_MS;
    if (ctx.data.phase !== 'running') return 0;
    return Math.max(0, ctx.data.endsAt - Date.now());
  },

  tick(ctx) {
    const t = Date.now() / 1000;
    for (const c of ctx.data.coins || []) {
      if (c.taken || !c.spr || c.spr.destroyed) continue;
      c.spr.y = c.y + Math.sin(t * 3 + c.x / 90) * 6;
    }
    if (ctx.data.phase !== 'running') return;
    const p = ctx.player;
    for (const c of ctx.data.coins) {
      if (c.taken) continue;
      if (Math.abs(p.x - c.x) < 34 && p.y - 70 < c.y + 18 && p.y + 6 > c.y - 18) {
        c.taken = true;
        c.spr.visible = false;
        ctx.data.got += 1;
        ctx.collectQuoin('currants', c.x, c.y);
        ctx.progress('quoins_collected', 1);
      }
    }
    if (Date.now() >= ctx.data.endsAt) finish(ctx);
  },

  objective(ctx) {
    const phase = ctx.data.phase;
    const text = phase === 'running'
      ? 'Grab those coins!'
      : phase === 'done'
        ? (ctx.data.got >= COINS_NEEDED ? 'You got them coins but good.' : 'How embarrassing.')
        : 'Get ready to grab those coins!';
    return { text, stats: [['coins', `${Math.min(ctx.data.got || 0, 99)}/${COINS_NEEDED}`]] };
  },

  physics(ctx) {
    // Frozen until GO, like the locking 3-2-1 overlay.
    return ctx.data.phase === 'ready' || ctx.data.phase === 'countdown' ? { speed: 0, jump: 0 } : null;
  },

  onLeave(ctx, outcome) {
    ctx.data.stopMusic?.();
    if (outcome !== 'complete') {
      ctx.activity('My Grandma has more Hustle than that. Ask the Magic Rock if you want to try again.');
    }
    return { leaveFlag: 'left_rainbow_run' };
  },

  publish(ctx) {
    ctx.setData('rainbowPhase', ctx.data.phase || '');
    ctx.setData('rainbowCoins', String(ctx.data.got || 0));
    ctx.setData('rainbowCoinSpots', String(ctx.data.coins?.length || 0));
  },

  async autoplay(ctx, mode) {
    // Click ready, then sweep the coins by placing the avatar on each in turn.
    await ctx.wait(600);
    while (ctx.cardOpen() || ctx.data.phase === 'ready') {
      ctx.clickCard();
      await ctx.wait(300);
      if (ctx.data.phase !== 'ready') break;
    }
    while (ctx.data.phase === 'countdown') await ctx.wait(200);
    if (mode === 'ready') return 'ready';
    const order = [...ctx.data.coins].sort((a, b) => a.x - b.x);
    for (const c of order) {
      if (ctx.data.phase !== 'running' || ctx.data.got >= (mode === 'fail' ? 12 : COINS_NEEDED + 2)) break;
      ctx.place(c.x, c.y + 30);
      for (let t = 0; t < 12 && !c.taken; t++) await ctx.wait(100);
    }
    if (mode === 'fail') ctx.data.endsAt = Date.now();
    while (ctx.data.phase === 'running') {
      ctx.data.endsAt = Math.min(ctx.data.endsAt, Date.now() + 300);
      await ctx.wait(200);
    }
    while (!ctx.cardOpen()) await ctx.wait(150);
    await ctx.wait(500);
    ctx.clickCard();
    return mode === 'fail' ? 'failed' : 'complete';
  },
};

async function ready(ctx) {
  await ctx.card({
    kicker: 'Rainbow Run',
    title: 'Get ready to grab those coins!',
    detail: '(CLICK WHEN READY)',
    button: 'Ready',
    icon: 'assets/sprites/quest-rooms/rainbow_run/coin.png',
  });
  ctx.data.phase = 'countdown';
  await ctx.countdown(['3', '2', '1', 'GO!'], 850);
  ctx.data.phase = 'running';
  ctx.data.endsAt = Date.now() + RUN_MS;
  ctx.sound('FUTURE_SWING_30', { volume: 0.6 });
}

async function finish(ctx) {
  if (ctx.data.phase !== 'running') return;
  ctx.data.phase = 'done';
  const won = ctx.data.got >= COINS_NEEDED;
  if (won) {
    ctx.solve();
    ctx.sound('ACHIEVEMENT_UNLOCKED', { volume: 0.5 });
    await ctx.wait(1200);
  }
  await ctx.card(won
    ? { kicker: 'Rainbow Run', title: 'Success!', detail: 'You got them coins but good.', button: 'OK', icon: 'assets/sprites/quest-rooms/rainbow_run/coin.png' }
    : { kicker: 'Rainbow Run', title: 'Failure!', detail: 'How embarrassing.', button: 'OK', loss: true });
  ctx.leave({ transition: ctx.fx() });
}
