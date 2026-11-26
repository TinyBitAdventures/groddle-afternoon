/**
 * #658/#660 (root R25): iPad, "Keep playing sound in the background" off. Minimizing the browser
 * stopped the music (as it should), but on coming back every sound stayed silent, through taps and
 * new streets, until a reload. js/audio-resume.js awaited WebKit's suspend() or resume() promise
 * while holding busy; iOS can leave that promise pending (the context "interrupted"), and every
 * later event, taps included, returned at the busy check. Now no wait under busy lasts longer than
 * SETTLE_MS, and every gesture calls ctx.resume() inside the gesture whenever the context is not
 * running, then the street music is made again as the resume path does.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { GESTURE_EVENTS, SETTLE_MS, createAudioResumer, settleWithin } from '../public/js/audio-resume.js?v=440d0096';

const wait = (ms = 10) => new Promise((r) => setTimeout(r, ms));
const never = () => new Promise(() => {});

function target() {
  const l = {};
  return {
    addEventListener(type, fn) { (l[type] ||= []).push(fn); },
    removeEventListener(type, fn) { l[type] = (l[type] || []).filter((f) => f !== fn); },
    fire(type) { for (const fn of [...(l[type] || [])]) fn(); },
  };
}

/**
 * The page with street music playing and the setting off (hushWhenHidden), as game.js wires it.
 * ctx options: resumeHangsOnce (the first resume() never settles), suspendHangs (the hush's
 * suspend() never settles), gestureOnly (iOS: a resume() outside a gesture never settles).
 */
function page({ resumeHangsOnce = false, suspendHangs = false, gestureOnly = false, keepPlaying = false, muted = false } = {}) {
  const doc = Object.assign(target(), { visibilityState: 'visible' });
  const win = target();
  let inGesture = false;
  let hung = false;
  const ctx = Object.assign(target(), {
    state: 'running',
    suspends: 0,
    resumes: 0,
    set(next) { ctx.state = next; ctx.fire('statechange'); },
    suspend() { ctx.suspends += 1; ctx.set('suspended'); return suspendHangs ? never() : Promise.resolve(); },
    resume() {
      ctx.resumes += 1;
      if (resumeHangsOnce && !hung) { hung = true; return never(); }
      if (gestureOnly && !inGesture) return never();
      ctx.set('running');
      return Promise.resolve();
    },
  });
  const el = { paused: false, ended: false, pause() { el.paused = true; } };
  const voice = { el, stopped: false, looper: false, plays: 0, play() { voice.plays += 1; el.paused = false; } };
  const state = { muted, voice };
  const rebuilt = [];
  const resumer = createAudioResumer({
    getCtx: () => ctx,
    getVoice: () => state.voice,
    isMuted: () => state.muted,
    // As game.js's rebuildStreetMusic: the old voice stops, a new one plays at the same place.
    rebuildVoice: (v) => {
      rebuilt.push(v);
      v.stopped = true;
      state.voice = { el: { paused: false, ended: false, pause() { this.paused = true; } }, stopped: false, looper: false, play() {} };
    },
    hushWhenHidden: () => !keepPlaying,
    doc,
    win,
  });
  const hide = () => { doc.visibilityState = 'hidden'; doc.fire('visibilitychange'); win.fire('pagehide'); };
  const show = () => { doc.visibilityState = 'visible'; doc.fire('visibilitychange'); win.fire('focus'); win.fire('pageshow'); };
  const gesture = (type) => { inGesture = true; try { win.fire(type); } finally { inGesture = false; } };
  return { doc, win, ctx, state, rebuilt, resumer, hide, show, gesture };
}

describe('#658 audio comes back after the iPad browser was minimized (setting off)', () => {
  it('the first resume() never settles: a tap brings the music back, made again once', async () => {
    const p = page({ resumeHangsOnce: true });
    p.hide();
    await wait();
    assert.equal(p.ctx.state, 'suspended');
    p.show();
    await wait();
    assert.equal(p.ctx.state, 'suspended', 'the system holds the audio');
    p.gesture('pointerdown');
    await wait(SETTLE_MS + 60);
    assert.equal(p.ctx.state, 'running', 'the tap resumed the context');
    assert.equal(p.rebuilt.length, 1, 'the street music was made again, once');
    assert.equal(p.resumer.hushed(), false);
  });

  it("the hush's suspend() never settles: coming back is not held for ever", async () => {
    const p = page({ suspendHangs: true });
    p.hide();
    await wait();
    p.show();
    await wait(SETTLE_MS + 60);
    assert.equal(p.ctx.state, 'running', 'back after the wait ran out, no tap needed');
    assert.equal(p.rebuilt.length, 1);
  });

  it("the hush's suspend() never settles: a tap at once resumes the context in the gesture", async () => {
    const p = page({ suspendHangs: true, gestureOnly: true });
    p.hide();
    await wait();
    p.show();
    await wait();
    p.gesture('touchend');
    await wait(SETTLE_MS + 60);
    assert.equal(p.ctx.state, 'running');
    assert.equal(p.rebuilt.length, 1);
  });

  for (const type of GESTURE_EVENTS) {
    it(`iOS "interrupted", resume() only in a gesture: ${type} brings it back`, async () => {
      const p = page({ gestureOnly: true });
      p.hide();
      await wait();
      p.ctx.set('interrupted'); // the system takes the audio session while minimized
      p.show();
      await wait(SETTLE_MS + 60);
      assert.equal(p.ctx.state, 'interrupted', 'no gesture yet');
      assert.equal(p.rebuilt.length, 0, 'a new element would start on a stopped graph');
      const before = p.ctx.resumes;
      p.gesture(type);
      assert.ok(p.ctx.resumes > before, 'resume() is called inside the gesture, not after an await');
      assert.equal(p.ctx.state, 'running');
      await wait();
      assert.equal(p.rebuilt.length, 1);
    });
  }

  it('a resume() that answers late, after the wait ran out, still brings the music back', async () => {
    const p = page();
    p.hide();
    await wait();
    p.ctx.resume = () => never(); // pending: the context runs again on its own later
    p.show();
    await wait(SETTLE_MS + 60);
    assert.equal(p.rebuilt.length, 0);
    p.ctx.set('running');
    await wait();
    assert.equal(p.rebuilt.length, 1);
  });

  it('a muted game stays silent: a tap resumes nothing', async () => {
    const p = page({ muted: true, gestureOnly: true });
    p.hide();
    await wait();
    p.show();
    const before = p.ctx.resumes;
    p.gesture('pointerdown');
    await wait();
    assert.equal(p.ctx.resumes, before);
  });

  it('setting on: the game never suspends the context, and music the system stopped comes back as before', async () => {
    const p = page({ keepPlaying: true });
    p.hide();
    await wait();
    assert.equal(p.ctx.suspends, 0);
    assert.equal(p.resumer.hushed(), false);
    p.ctx.set('interrupted');
    p.state.voice.el.pause();
    p.show();
    await wait();
    assert.equal(p.ctx.state, 'running');
    assert.equal(p.rebuilt.length, 1);
  });

  it('settleWithin: a pending promise gives way after the time, a settled one at once, a rejection quietly', async () => {
    const t0 = Date.now();
    await settleWithin(never(), 40);
    assert.ok(Date.now() - t0 >= 35);
    assert.equal(await settleWithin(Promise.resolve(7), 1000), 7);
    assert.equal(await settleWithin(Promise.reject(new Error('x')), 1000), undefined);
  });
});
