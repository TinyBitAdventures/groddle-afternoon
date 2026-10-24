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
 * that." The course (a night meadow of statues, slimy columns, pink islands,
 * a rainbow slide and a sliced planet, from the players' Snaps) lives in
 * rainbow-run-scene.js; it holds well over 30 coins on the meadow alone,
 * with more up the slide and in the planet.
 */

import { FLOOR, H, W, buildRainbowScene, rainbowCoins, rainbowPlatforms } from './rainbow-run-scene.js';

export { rainbowCoins, rainbowPlatforms };
export const RUN_MS = 30_000;
export const COINS_NEEDED = 30;
/** Where the run starts: on the meadow by the slide's flower. */
export const SPAWN_X = 110;

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
    return {
      label: 'Rainbow Run',
      width: W,
      height: H,
      background: buildRainbowScene(PIXI, kit),
      platforms: rainbowPlatforms(kit),
      spawn: { x: SPAWN_X, y: FLOOR },
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
    // inc_quests.js rainbow run: show_rainbow + playEmotionAnimation('happy').
    ctx.engine.playEmotion?.('happy');
    ctx.sound('ACHIEVEMENT_UNLOCKED', { volume: 0.5 });
    await ctx.wait(1200);
  }
  await ctx.card(won
    ? { kicker: 'Rainbow Run', title: 'Success!', detail: 'You got them coins but good.', button: 'OK', icon: 'assets/sprites/quest-rooms/rainbow_run/coin.png' }
    : { kicker: 'Rainbow Run', title: 'Failure!', detail: 'How embarrassing.', button: 'OK', loss: true });
  ctx.leave({ transition: ctx.fx() });
}
