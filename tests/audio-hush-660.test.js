/**
 * #660 (root R25): on Android the game's music kept playing after the player left the browser.
 * js/audio-resume.js now hushes the page while it is hidden (visibilitychange to hidden, pagehide):
 * the AudioContext is suspended (every buffer sound: musicblocks, cues, effects, a short loop
 * that runs from its buffer) and a streaming street music element is paused at its place. Showing
 * the page again resumes the context and rebuilds the street track at the same point (the iPad
 * path from ed80947fd66, never the old element played on). A muted player stays muted.
 * The Flash client kept its sound on deactivate (StageBeacon.onDeactivate only throttled frames).
 *
 * #693 (Austin 2026-11-25): the hush now follows "Keep playing sound in the background"
 * (js/background-sound.js): off by default on a phone or tablet, where every hush below still holds;
 * on by default on a computer, where nothing hushes (as Glitch kept playing). These pages are phones
 * unless they say otherwise; tests/background-sound-693.test.js covers the computer and the switch.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { HUSH_EVENTS, RESUME_EVENTS, audioHushPlan, createAudioResumer } from '../public/js/audio-resume.js?v=440d0096';
import { createMusicVoice } from '../public/js/music-voice.js?v=75c8cf57';
import { createBackgroundSound } from '../public/js/background-sound.js?v=d40d26b7';

const root = join(import.meta.dirname, '..');
const tick = () => new Promise((r) => setTimeout(r, 0));

function target() {
  const l = {};
  return {
    l,
    addEventListener(type, fn) { (l[type] ||= []).push(fn); },
    removeEventListener(type, fn) { l[type] = (l[type] || []).filter((f) => f !== fn); },
    fire(type) { for (const fn of [...(l[type] || [])]) fn(); },
  };
}

/** A context whose clock runs only while it is "running" (as a real one's does). */
function context() {
  const ctx = Object.assign(target(), {
    state: 'running',
    currentTime: 0,
    suspends: 0,
    resumes: 0,
    slowSuspend: false,
    set(next) { ctx.state = next; ctx.fire('statechange'); },
    advance(sec) { if (ctx.state === 'running') ctx.currentTime += sec; },
    async suspend() {
      ctx.suspends += 1;
      if (ctx.slowSuspend) await new Promise((r) => setTimeout(r, 20));
      ctx.set('suspended');
    },
    async resume() { ctx.resumes += 1; ctx.set('running'); },
    createBufferSource: () => ({ connect() {}, start() {}, stop() {} }),
  });
  return ctx;
}

/** A streaming <audio> element whose time runs only while it plays. */
function element(at = 0) {
  const el = {
    paused: true,
    ended: false,
    currentTime: at,
    plays: 0,
    play() { el.plays += 1; el.paused = false; return Promise.resolve(); },
    pause() { el.paused = true; },
    advance(sec) { if (!el.paused) el.currentTime += sec; },
    removeAttribute() {},
    load() {},
  };
  return el;
}

/** The page with street music playing, wired as game.js wires it (hushWhenHidden from the #693 setting, rebuildVoice). */
function page({ muted = false, looped = false, device = 'phone' } = {}) {
  const doc = Object.assign(target(), { visibilityState: 'visible' });
  const win = target();
  const ctx = context();
  const el = element(42);
  const voice = createMusicVoice({ url: 'groddle.mp3', el, node: { disconnect() {} }, gain: { disconnect() {} }, ctx, win });
  const state = { muted };
  if (!state.muted) voice.play();
  if (looped) voice.handOver({ duration: 120 }); // the Vine Radio or a short street loop from its buffer
  const rebuilt = [];
  const background = createBackgroundSound({ win: {}, device: () => device, load: () => null, save: () => {} });
  const resumer = createAudioResumer({
    getCtx: () => ctx,
    getVoice: () => voice,
    isMuted: () => state.muted,
    rebuildVoice: (v) => rebuilt.push({ url: v.url, time: v.time() }),
    hushWhenHidden: () => !background.get(),
    doc,
    win,
  });
  const pass = (sec) => { ctx.advance(sec); el.advance(sec); };
  const hide = () => { doc.visibilityState = 'hidden'; doc.fire('visibilitychange'); };
  const show = () => { doc.visibilityState = 'visible'; doc.fire('visibilitychange'); };
  return { doc, win, ctx, el, voice, state, rebuilt, resumer, pass, hide, show };
}

describe('#660 every sound pauses while the page is hidden (a phone or tablet, #693)', () => {
  it('the hush plan suspends a running context and pauses only a streaming element that plays', () => {
    const el = (o = {}) => ({ paused: false, ended: false, ...o });
    assert.deepEqual(audioHushPlan({ ctxState: 'running', voice: { el: el() } }), { ctx: true, el: true });
    assert.deepEqual(audioHushPlan({ ctxState: 'suspended', voice: { el: el({ paused: true }) } }), { ctx: false, el: false });
    assert.equal(audioHushPlan({ ctxState: 'running', voice: { el: el(), looper: {} } }).el, false, 'a buffer loop stops with the context');
    assert.equal(audioHushPlan({ ctxState: 'running', voice: { el: el(), stopped: true } }).el, false);
    assert.equal(audioHushPlan({ ctxState: 'interrupted' }).ctx, false);
    assert.deepEqual([...HUSH_EVENTS.win], ['pagehide']);
    assert.deepEqual([...RESUME_EVENTS.doc], ['visibilitychange']);
  });

  it('hidden: the context (musicblocks, cues, effects) is suspended and the street music paused at its place', async () => {
    const p = page();
    p.pass(5);
    assert.equal(p.el.currentTime, 47);
    p.hide();
    await tick();
    assert.equal(p.ctx.state, 'suspended');
    assert.equal(p.el.paused, true);
    assert.equal(p.resumer.hushed(), true, 'the game starts no new sound meanwhile');
    p.pass(600); // ten minutes in another app
    assert.equal(p.el.currentTime, 47, 'the music did not go on in the background');
    assert.equal(p.rebuilt.length, 0, 'nothing is rebuilt while hidden');
  });

  it('visible again: the context resumes and the music carries on from the same point, made again (no iPad speed fault)', async () => {
    const p = page();
    p.pass(5);
    p.hide();
    await tick();
    p.pass(600);
    p.show();
    await tick();
    assert.equal(p.ctx.state, 'running');
    assert.equal(p.resumer.hushed(), false);
    assert.deepEqual(p.rebuilt, [{ url: 'groddle.mp3', time: 47 }]);
    assert.equal(p.el.plays, 1, 'the old element is not played on (#660 iPad rebuild path)');
    p.win.fire('focus');
    p.win.fire('touchend');
    await tick();
    assert.equal(p.rebuilt.length, 1, 'once per return');
  });

  it('a loop running from its buffer (the Vine Radio, a short street loop) keeps its place across the hidden time', async () => {
    const p = page({ looped: true });
    p.pass(10);
    assert.equal(p.voice.time(), 52);
    p.hide();
    await tick();
    p.pass(300);
    assert.equal(p.voice.time(), 52, 'the suspended context holds the loop where it was');
    p.show();
    await tick();
    assert.deepEqual(p.rebuilt, [{ url: 'groddle.mp3', time: 52 }]);
  });

  it('pagehide hushes too (a page put into the back-forward cache), and pageshow brings it back', async () => {
    const p = page();
    p.win.fire('pagehide');
    await tick();
    assert.equal(p.ctx.state, 'suspended');
    assert.equal(p.el.paused, true);
    p.win.fire('pageshow');
    await tick();
    assert.equal(p.ctx.state, 'running');
    assert.equal(p.rebuilt.length, 1);
  });

  it('muted: still muted after the page comes back (nothing resumed, rebuilt or played)', async () => {
    const p = page({ muted: true });
    p.hide();
    await tick();
    p.show();
    p.win.fire('focus');
    p.win.fire('pointerdown');
    await tick();
    assert.equal(p.state.muted, true);
    assert.equal(p.ctx.state, 'suspended');
    assert.equal(p.ctx.resumes, 0);
    assert.equal(p.rebuilt.length, 0);
    assert.equal(p.el.plays, 0);
  });

  it('back before the suspend settled: the resume waits for it, so the page is not left silent', async () => {
    const p = page();
    p.ctx.slowSuspend = true;
    p.hide();
    p.show();
    await new Promise((r) => setTimeout(r, 40));
    assert.equal(p.ctx.state, 'running');
    assert.equal(p.rebuilt.length, 1);
  });

  it('a tablet (an iPad) hushes as a phone does; a computer pauses nothing (#693)', async () => {
    const pad = page({ device: 'tablet' });
    pad.hide();
    await tick();
    assert.equal(pad.ctx.state, 'suspended');
    assert.equal(pad.el.paused, true);
    const desk = page({ device: 'computer' });
    desk.pass(5);
    desk.hide();
    desk.win.fire('pagehide');
    await tick();
    desk.pass(30);
    assert.equal(desk.ctx.state, 'running');
    assert.equal(desk.el.paused, false);
    assert.equal(desk.el.currentTime, 77, 'the music played on in the background');
    assert.equal(desk.resumer.hushed(), false);
  });

  it('without hushWhenHidden the resumer keeps its old contract (nothing paused on hide)', async () => {
    const doc = Object.assign(target(), { visibilityState: 'visible' });
    const ctx = context();
    createAudioResumer({ getCtx: () => ctx, getVoice: () => null, isMuted: () => false, doc, win: target() });
    doc.visibilityState = 'hidden';
    doc.fire('visibilitychange');
    await tick();
    assert.equal(ctx.suspends, 0);
  });

  it('game.js hushes when hidden (unless the #693 setting keeps sound on) and starts no sound while hushed', () => {
    const game = readFileSync(join(root, 'public/game.js'), 'utf8');
    assert.match(game, /audioResumer = createAudioResumer\(\{[^}]*rebuildVoice: rebuildStreetMusic,\n    hushWhenHidden: \(\) => !backgroundSoundOn\(\),/);
    assert.match(game, /const audioHushed = \(\) => Boolean\(audioResumer\?\.hushed\(\)\);/);
    assert.match(game, /function playSound\(key, opts = \{\}\) \{\n  if \(state\.muted \|\| audioHushed\(\) \|\| !audio\.board\) return null;/);
    assert.match(game, /isMuted: \(\) => state\.muted \|\| audioHushed\(\),/, 'the sound board skips late files while hushed');
    assert.match(game, /token !== musicblockPlayToken \|\| state\.muted \|\| audioHushed\(\)/, 'musicblocks');
    assert.match(game, /if \(audioHushed\(\)\) return \(\) => \{\};/, 'music cues');
    assert.match(game, /if \(!audioHushed\(\)\) voice\.play\(\);/, 'a street track (or the next radio tune) started while hidden waits');
  });
});
