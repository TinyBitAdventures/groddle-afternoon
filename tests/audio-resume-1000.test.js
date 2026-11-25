/**
 * G1000 (root R25): music and sounds stopped after AFK or a system interruption and did not come
 * back: the AudioContext was resumed only from "suspended" (never Safari's "interrupted") and the
 * street music element had no handler at all. js/audio-resume.js is the one path.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { RESUME_EVENTS, audioResumePlan, contextNeedsResume, createAudioResumer } from '../public/js/audio-resume.js?v=d5628e7b';
import { createMusicVoice } from '../public/js/music-voice.js?v=75c8cf57';

const root = join(import.meta.dirname, '..');

function target() {
  const l = {};
  return {
    l,
    addEventListener(type, fn) { (l[type] ||= []).push(fn); },
    removeEventListener(type, fn) { l[type] = (l[type] || []).filter((f) => f !== fn); },
    fire(type) { for (const fn of l[type] || []) fn(); },
  };
}

function ctxIn(state) {
  const ctx = { state, resumes: 0, async resume() { ctx.resumes += 1; ctx.state = 'running'; } };
  return ctx;
}

const tick = () => new Promise((r) => setTimeout(r, 0));

describe('G1000 the audio resume state machine', () => {
  it('resumes a suspended or interrupted context, never a running or closed one', () => {
    assert.equal(contextNeedsResume('suspended'), true);
    assert.equal(contextNeedsResume('interrupted'), true, "Safari's state after a call or Siri");
    assert.equal(contextNeedsResume('running'), false);
    assert.equal(contextNeedsResume('closed'), false);
    assert.equal(contextNeedsResume(undefined), false);
  });

  it('plays a paused streaming element, but not a stopped, ended or handed-over one, and nothing muted or hidden', () => {
    const el = (o = {}) => ({ paused: true, ended: false, ...o });
    assert.deepEqual(audioResumePlan({ ctxState: 'interrupted', voice: { el: el() } }), { ctx: true, el: true });
    assert.deepEqual(audioResumePlan({ ctxState: 'running', voice: { el: el({ paused: false }) } }), { ctx: false, el: false });
    assert.equal(audioResumePlan({ voice: { el: el(), stopped: true } }).el, false);
    assert.equal(audioResumePlan({ voice: { el: el({ ended: true }) } }).el, false, 'the ended handler plays the next track');
    assert.equal(audioResumePlan({ voice: { el: el(), looper: {} } }).el, false, '#504: its buffer plays, on the context');
    assert.deepEqual(audioResumePlan({ ctxState: 'suspended', muted: true, voice: { el: el() } }), { ctx: false, el: false });
    assert.deepEqual(audioResumePlan({ ctxState: 'suspended', hidden: true, voice: { el: el() } }), { ctx: false, el: false });
  });

  it('listens for the page coming back and for gestures', () => {
    assert.deepEqual([...RESUME_EVENTS.doc], ['visibilitychange']);
    assert.deepEqual([...RESUME_EVENTS.win], ['focus', 'pageshow', 'pointerdown', 'keydown', 'touchend']);
  });

  it('after an interruption, coming back to the page brings back both the context and the paused music', async () => {
    const doc = Object.assign(target(), { visibilityState: 'hidden' });
    const win = target();
    const ctx = ctxIn('interrupted');
    const plays = [];
    const voice = { el: { paused: true, ended: false }, stopped: false, looper: null, play() { plays.push(1); this.el.paused = false; } };
    let muted = false;
    const heard = [];
    const r = createAudioResumer({ getCtx: () => ctx, getVoice: () => voice, isMuted: () => muted, doc, win, onResume: (why) => heard.push(why) });
    doc.fire('visibilitychange'); // still hidden: nothing
    await tick();
    assert.equal(ctx.resumes, 0);
    doc.visibilityState = 'visible';
    doc.fire('visibilitychange');
    await tick();
    assert.equal(ctx.state, 'running');
    assert.equal(plays.length, 1);
    assert.deepEqual(heard, ['visibilitychange']);
    win.fire('focus'); // already back: nothing more
    await tick();
    assert.equal(ctx.resumes, 1);
    assert.equal(plays.length, 1);
    // Suspended again (a long background on Chrome), but muted: left alone until unmuted and a tap.
    ctx.state = 'suspended';
    muted = true;
    win.fire('pageshow');
    await tick();
    assert.equal(ctx.resumes, 1);
    muted = false;
    win.fire('touchend');
    await tick();
    assert.equal(ctx.resumes, 2);
    r.dispose();
    ctx.state = 'suspended';
    win.fire('pointerdown');
    await tick();
    assert.equal(ctx.resumes, 2, 'disposed');
  });

  it('a still-interrupted context (resume rejects) is tried again on the next event', async () => {
    const doc = Object.assign(target(), { visibilityState: 'visible' });
    const win = target();
    let fail = true;
    const ctx = { state: 'interrupted', tries: 0, async resume() { ctx.tries += 1; if (fail) throw new Error('InvalidStateError'); ctx.state = 'running'; } };
    createAudioResumer({ getCtx: () => ctx, getVoice: () => null, isMuted: () => false, doc, win });
    win.fire('focus');
    await tick();
    assert.equal(ctx.state, 'interrupted');
    fail = false;
    win.fire('pointerdown');
    await tick();
    assert.equal(ctx.state, 'running');
    assert.equal(ctx.tries, 2);
  });

  it('#504: a voice whose loop runs from its buffer is never played as an element by the resume path', async () => {
    const doc = Object.assign(target(), { visibilityState: 'visible' });
    const win = target();
    const ctx = Object.assign(ctxIn('interrupted'), {
      currentTime: 10,
      createBufferSource: () => ({ connect() {}, start() {}, stop() {} }),
    });
    let elPlays = 0;
    const el = { paused: true, ended: false, currentTime: 1, play() { elPlays += 1; this.paused = false; return Promise.resolve(); }, pause() { this.paused = true; }, removeAttribute() {}, load() {} };
    const voice = createMusicVoice({ url: 'rook.mp3', el, node: { disconnect() {} }, gain: { disconnect() {} }, ctx, win });
    voice.play();
    voice.handOver({ duration: 9 });
    el.paused = true; // Safari paused it with the interruption
    createAudioResumer({ getCtx: () => ctx, getVoice: () => voice, isMuted: () => false, doc, win });
    win.fire('focus');
    await tick();
    assert.equal(ctx.state, 'running', 'the context resumes: the buffer plays again');
    assert.equal(elPlays, 1, 'only the first play, before the hand-over');
  });

  it('game.js wires the one path and checks both states everywhere it resumes', () => {
    const game = readFileSync(join(root, 'public/game.js'), 'utf8');
    assert.match(game, /createAudioResumer\(\{\n    getCtx: \(\) => audio\.ctx,\n    getVoice: \(\) => audio\.music,\n    isMuted: \(\) => state\.muted,/);
    assert.doesNotMatch(game, /audio\.ctx\?\.state [!=]== 'suspended'/, 'every resume goes through contextNeedsResume');
    assert.doesNotMatch(game, /resumeAudioOnGesture/);
  });
});
