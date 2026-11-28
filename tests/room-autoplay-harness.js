/**
 * Run a quest room's QA autoplay in Node (G971): the room's real build, enter
 * and tick on a fake Pixi, a fake clock that wait() advances while it ticks
 * the room, and place() that moves the avatar the way the game's does. The
 * room's autoplay steps are logged through js/autoplay-log.js, so a test can
 * assert what was played, not just the final word.
 */
import { Display, FakeEl, fakePixi } from './fake-scene.js';

class FakeSource { constructor() { this.destroyed = false; } emit() {} on() {} once() {} resize() { return true; } update() {} }
class FakeTexture {
  constructor(o = {}) { this.source = o.source; this.destroyed = false; this.width = 64; this.height = 64; }
  static from() { return new FakeTexture({ source: new FakeSource() }); }
}
export const testPixi = new Proxy({ ImageSource: FakeSource, Texture: FakeTexture, Rectangle: class { constructor(x, y, w, h) { Object.assign(this, { x, y, w, h }); } } }, {
  get: (t, k) => (k in t ? t[k] : fakePixi[k]),
});

globalThis.PIXI ||= testPixi;
globalThis.document ||= { createElement: (tag) => new FakeEl(tag), querySelector: () => null, querySelectorAll: () => [], body: new FakeEl('body') };

const kit = await import('../public/js/quest-rooms/kit.js?v=3f5f3b56');

/** A fake clock: Date.now() reads it while installed. */
export function fakeClock(start = 1_700_000_000_000) {
  const real = Date.now;
  let now = start;
  return {
    install() { Date.now = () => now; return this; },
    restore() { Date.now = real; },
    advance(ms) { now += ms; },
    get now() { return now; },
  };
}

/**
 * A quest-room context. wait(ms) advances the clock in 16 ms frames and runs
 * room.tick between them (the room sees time pass); place() moves the avatar.
 */
export function fakeRoomCtx(room, { clock, params = {}, stage = null, tickMs = 16 } = {}) {
  const log = { progress: [], solved: 0, left: 0, toasts: [], data: {} };
  const ctx = {
    PIXI: testPixi,
    kit,
    data: {},
    log,
    stage,
    player: { x: 0, y: 0, vx: 0, vy: 0 },
    engine: { platforms: [], street: null, param: (k) => params[k] ?? null, playEmotion() {}, snapCamera() {} },
    param: (k) => params[k] ?? null,
    add: (spr) => spr,
    quoinSprite: () => new Display(),
    collectQuoin: () => ({}),
    register: (t) => t,
    unregister: () => {},
    place(x, y) { ctx.player.x = x; ctx.player.y = y; ctx.player.vx = 0; ctx.player.vy = 0; },
    async wait(ms) {
      const frames = Math.max(1, Math.round(ms / tickMs));
      for (let i = 0; i < frames; i++) {
        clock?.advance(tickMs);
        room.tick?.(ctx, tickMs, Date.now());
      }
    },
    now: () => Date.now(),
    sound: () => {},
    toast: (t) => log.toasts.push(t),
    floatText: () => {},
    prompt: () => {},
    cardOpen: () => false,
    dialogOpen: () => false,
    setData: (k, v) => { log.data[k] = v; },
    near: (x, y, r = 60) => Math.hypot(ctx.player.x - x, ctx.player.y - y) <= r,
    progress: (flag) => log.progress.push(flag),
    // The run as js/quest-instance.js moves it: solved, then left with its outcome.
    run: { status: 'active' },
    solve: () => { log.solved += 1; if (ctx.run.status === 'active') ctx.run.status = 'solved'; },
    leave: () => {
      log.left += 1;
      if (ctx.run.status === 'left') return;
      ctx.run.outcome = ctx.run.status === 'solved' ? 'complete' : 'abandoned';
      ctx.run.status = 'left';
    },
    step: (name, ok = true) => Boolean(ok),
    fx: () => null,
    stuckPromptMs: (ms) => ms,
  };
  return ctx;
}
