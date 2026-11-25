/**
 * #660 (root R25): on an iPad, minimizing the browser until the game's audio stops and coming back
 * made the street music play faster (more so some times, normal other times). The resume path
 * played the same <audio> element and MediaElementSource again; it now rebuilds the voice (a new
 * element and node at the same place in the track) when the page comes back from a background in
 * which its audio stopped, and leaves music that played on through the background (Android, a
 * desktop tab) alone. The WebKit rate fault itself needs iOS's audio session (Linux WebKit has
 * none); this checks the path the player took.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { audioResumePlan, createAudioResumer } from '../public/js/audio-resume.js?v=d5628e7b';

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

function ctxIn(state, { fail = false } = {}) {
  const ctx = Object.assign(target(), {
    state,
    resumes: 0,
    fail,
    async resume() { ctx.resumes += 1; if (ctx.fail) throw new Error('InvalidStateError'); ctx.set('running'); },
    set(next) { ctx.state = next; ctx.fire('statechange'); },
  });
  return ctx;
}

/** The page, its window, a running context and a streaming voice, wired to a resumer that counts rebuilds. */
function page() {
  const doc = Object.assign(target(), { visibilityState: 'visible' });
  const win = target();
  const ctx = ctxIn('running');
  const voice = { url: 'firebog.mp3', el: { paused: false, ended: false }, stopped: false, looper: null, plays: 0, play() { voice.plays += 1; voice.el.paused = false; } };
  const rebuilt = [];
  const heard = [];
  createAudioResumer({ getCtx: () => ctx, getVoice: () => voice, isMuted: () => false, rebuildVoice: (v) => rebuilt.push(v), doc, win, onResume: (why, plan) => heard.push([why, plan]) });
  const hide = () => { doc.visibilityState = 'hidden'; doc.fire('visibilitychange'); };
  const show = () => { doc.visibilityState = 'visible'; doc.fire('visibilitychange'); };
  return { doc, win, ctx, voice, rebuilt, heard, hide, show };
}

describe('#660 music after the browser was minimized', () => {
  it('the plan rebuilds a live voice when the page comes back from a background where its audio stopped', () => {
    const voice = { el: { paused: true, ended: false } };
    assert.deepEqual(audioResumePlan({ ctxState: 'interrupted', voice, back: true }), { ctx: true, el: false, rebuild: true });
    assert.deepEqual(audioResumePlan({ ctxState: 'running', voice: { el: { paused: false } }, back: true, stopped: true }), { ctx: false, el: false, rebuild: true }, 'the system stopped it and started it again');
    assert.deepEqual(audioResumePlan({ ctxState: 'running', voice: { el: { paused: false } }, back: true }), { ctx: false, el: false }, 'played on through the background');
    assert.deepEqual(audioResumePlan({ ctxState: 'interrupted', voice, back: false }), { ctx: true, el: true }, 'no background: the old path');
    assert.equal(audioResumePlan({ ctxState: 'interrupted', voice: { ...voice, stopped: true }, back: true }).rebuild, undefined);
    assert.deepEqual(audioResumePlan({ ctxState: 'interrupted', voice, back: true, hidden: true }), { ctx: false, el: false });
  });

  it('iPad: minimized until the audio stops, then back: the music is made again, once, not played on', async () => {
    const p = page();
    p.hide();
    p.ctx.set('interrupted'); // the system stops the game's audio
    p.voice.el.paused = true;
    await tick();
    assert.equal(p.rebuilt.length, 0, 'nothing while hidden');
    p.show();
    await tick();
    assert.equal(p.ctx.state, 'running');
    assert.deepEqual(p.rebuilt, [p.voice], 'the voice is rebuilt at its place');
    assert.equal(p.voice.plays, 0, 'the old element is not played again');
    p.win.fire('focus');
    p.win.fire('touchend');
    await tick();
    assert.equal(p.rebuilt.length, 1, 'once per return');
  });

  it('iPad: the system had already started the audio again by the time the page shows: still rebuilt', async () => {
    const p = page();
    p.hide();
    p.ctx.set('interrupted');
    p.ctx.set('running');
    p.show();
    await tick();
    assert.equal(p.rebuilt.length, 1);
  });

  it('still interrupted when the page shows: rebuilt after the tap that resumes the context', async () => {
    const p = page();
    p.hide();
    p.ctx.fail = true;
    p.ctx.set('interrupted');
    p.voice.el.paused = true;
    p.show();
    await tick();
    assert.equal(p.ctx.state, 'interrupted');
    assert.equal(p.rebuilt.length, 0, 'a new element would start on a stopped graph');
    p.ctx.fail = false;
    p.win.fire('touchend');
    await tick();
    assert.equal(p.ctx.state, 'running');
    assert.equal(p.rebuilt.length, 1);
    assert.equal(p.voice.plays, 0);
  });

  it('Android or a desktop tab: the music played on through the background, so nothing is rebuilt', async () => {
    const p = page();
    p.hide();
    p.win.fire('focus');
    p.show();
    await tick();
    assert.equal(p.rebuilt.length, 0);
    assert.equal(p.voice.plays, 0);
    // A later interruption with the page in view takes the old path (resume, play the element).
    p.ctx.set('interrupted');
    p.voice.el.paused = true;
    p.win.fire('pointerdown');
    await tick();
    assert.equal(p.rebuilt.length, 0);
    assert.equal(p.voice.plays, 1);
  });

  it('game.js rebuilds the street track at the place it had reached', () => {
    const game = readFileSync(join(root, 'public/game.js'), 'utf8');
    assert.match(game, /createAudioResumer\(\{[^}]*rebuildVoice: rebuildStreetMusic,/);
    const body = game.slice(game.indexOf('function rebuildStreetMusic('), game.indexOf('function syncMuteButton('));
    assert.match(body, /audio\.musicResume = \{ url: voice\.url, time: voice\.time\(\) \}/);
    assert.match(body, /voice\.stop\(0\)/);
    assert.match(body, /startStreetTrack\(voice\.url,/);
  });
});
