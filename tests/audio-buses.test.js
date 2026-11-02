/**
 * MUTE (player report 2026-11-01, Modern HUD on /play/online/): muted with Music at 0, the
 * street song came back at about 1% after a trip to another hub. The street crossfade made a
 * gain of its own straight to the speakers with a 0.001 floor (linearRampToValueAtTime
 * (Math.max(0.001, 0))), so a new track never went silent. js/audio-buses.js is now the only
 * way out: source -> its gain -> music or effects bus -> master -> speakers, Mute holds the
 * master at exactly 0 and Music 0 the music bus (SoundMaster.as muteAllSounds 315-324,
 * playSound 233-238). Browser proof: scratchpad mute/repro.mjs (analyser on the destination).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAudioBuses, fadeGain, holdGain } from '../public/js/audio-buses.js?v=af167b54';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC = join(__dirname, '../public');

/** An AudioParam timeline good enough to read a gain at any time (set, linear ramp, target). */
class FakeParam {
  constructor(ctx, value) {
    this.ctx = ctx;
    this.base = value;
    this.events = [];
  }
  get value() { return this.at(this.ctx.currentTime); }
  set value(v) { this.setValueAtTime(v, this.ctx.currentTime); }
  add(e) {
    this.events.push(e);
    this.events.sort((a, b) => a.t - b.t);
    return this;
  }
  setValueAtTime(v, t) { return this.add({ type: 'set', v, t }); }
  linearRampToValueAtTime(v, t) { return this.add({ type: 'linear', v, t }); }
  exponentialRampToValueAtTime(v, t) { return this.add({ type: 'exp', v, t }); }
  setTargetAtTime(v, t, tc) { return this.add({ type: 'target', v, t, tc }); }
  cancelScheduledValues(t) { this.events = this.events.filter((e) => e.t < t); return this; }
  at(time) {
    let v = this.base;
    let t0 = 0;
    let target = null;
    for (const e of this.events) {
      if (target) {
        const end = Math.min(e.t, time);
        v = target.v + (v - target.v) * Math.exp(-(end - target.t) / target.tc);
        if (e.t > time) return v;
        target = null;
      }
      if (e.t > time) {
        if (e.type === 'linear') return v + (e.v - v) * ((time - t0) / (e.t - t0));
        if (e.type === 'exp') return v * (e.v / v) ** ((time - t0) / (e.t - t0));
        return v;
      }
      if (e.type === 'target') {
        target = { ...e };
        t0 = e.t;
        continue;
      }
      v = e.v;
      t0 = e.t;
    }
    if (target) v = target.v + (v - target.v) * Math.exp(-(time - target.t) / target.tc);
    return v;
  }
}

class FakeNode {
  constructor(ctx, kind) {
    this.ctx = ctx;
    this.kind = kind;
    this.outputs = [];
    if (kind === 'gain') this.gain = new FakeParam(ctx, 1);
  }
  connect(node) {
    this.outputs.push(node);
    return node;
  }
}

class FakeContext {
  constructor() {
    this.currentTime = 0;
    this.destination = new FakeNode(this, 'destination');
    this.nodes = [];
  }
  createGain() {
    const n = new FakeNode(this, 'gain');
    this.nodes.push(n);
    return n;
  }
}

/** What reaches the speakers from `node` at `time`: the product of the gains on every path. */
function heard(node, ctx, time) {
  if (node === ctx.destination) return 1;
  const g = node.gain ? node.gain.at(time) : 1;
  return node.outputs.reduce((sum, out) => sum + g * heard(out, ctx, time), 0);
}

describe('audio buses (MUTE)', () => {
  it('only the master reaches the speakers; the music and effects buses feed it', () => {
    const ctx = new FakeContext();
    const buses = createAudioBuses(ctx, { muted: false, music: 1, effects: 1 });
    const toSpeakers = ctx.nodes.filter((n) => n.outputs.includes(ctx.destination));
    assert.deepEqual(toSpeakers, [buses.master]);
    assert.deepEqual(buses.music.outputs, [buses.master]);
    assert.deepEqual(buses.sfx.outputs, [buses.master]);
    assert.deepEqual(buses.musicVoice().outputs, [buses.music]);
    assert.deepEqual(buses.sfxVoice().outputs, [buses.sfx]);
  });

  it('Mute holds the master at exactly 0, even over a ramp already scheduled on it', () => {
    const ctx = new FakeContext();
    const buses = createAudioBuses(ctx, { muted: false });
    buses.master.gain.linearRampToValueAtTime(1, 5);
    ctx.currentTime = 1;
    buses.set({ muted: true });
    for (const t of [1, 2, 5, 60, 600]) assert.equal(buses.master.gain.at(t), 0, `master at ${t}s`);
    buses.set({ muted: false });
    assert.equal(buses.master.gain.at(2), 1);
  });

  it('a street track fading in while muted, or at Music 0, is never heard (the old 0.001 floor was)', () => {
    for (const settings of [{ muted: true, music: 1 }, { muted: false, music: 0 }, { muted: true, music: 0 }]) {
      const ctx = new FakeContext();
      const buses = createAudioBuses(ctx, settings);
      // setAmbientForStreet: a new track's gain, faded in on the music bus.
      ctx.currentTime = 30;
      const track = buses.musicVoice(0);
      fadeGain(track.gain, 0.26, 0.85, ctx);
      for (const t of [30, 30.4, 30.85, 90, 300]) assert.equal(heard(track, ctx, t), 0, `${JSON.stringify(settings)} at ${t}s`);
    }
    // The old route for contrast: its own gain straight to the speakers, ramped to max(0.001, 0).
    const ctx = new FakeContext();
    const old = ctx.createGain();
    old.connect(ctx.destination);
    old.gain.value = 0.001;
    old.gain.linearRampToValueAtTime(Math.max(0.001, 0), 0.85);
    assert.ok(heard(old, ctx, 300) > 0);
  });

  it('Music 0 silences music only; Effects keep their level, and unmute brings both back', () => {
    const ctx = new FakeContext();
    const buses = createAudioBuses(ctx, { muted: false, music: 0, effects: 0.8 });
    const track = buses.musicVoice(0.26);
    const fx = buses.sfxVoice(0.72);
    assert.equal(heard(track, ctx, 10), 0);
    assert.ok(Math.abs(heard(fx, ctx, 10) - 0.72 * 0.8) < 1e-9);
    buses.set({ music: 0.5 });
    assert.ok(Math.abs(heard(track, ctx, 10) - 0.13) < 1e-9);
    buses.set({ muted: true });
    assert.equal(heard(track, ctx, 10), 0);
    assert.equal(heard(fx, ctx, 10), 0);
    buses.set({ muted: false });
    assert.ok(heard(fx, ctx, 10) > 0);
    assert.deepEqual(buses.settings, { muted: false, music: 0.5, effects: 0.8 });
  });

  it('fades are linear and land on exactly 0; holdGain drops every scheduled ramp', () => {
    const ctx = new FakeContext();
    const g = ctx.createGain();
    g.gain.value = 0.26;
    ctx.currentTime = 2;
    fadeGain(g.gain, 0, 0.85, ctx);
    assert.equal(g.gain.at(2.85), 0);
    assert.equal(g.gain.at(100), 0);
    g.gain.setTargetAtTime(0.5, 3, 0.05);
    holdGain(g.gain, 0, ctx);
    assert.equal(g.gain.at(10), 0);
    assert.equal(g.gain.events.every((e) => e.type === 'set'), true);
  });
});

/** Every game script (public/game.js and public/js, not the vendored libraries). */
function gameScripts() {
  const out = [join(PUBLIC, 'game.js')];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (name.endsWith('.js')) out.push(p);
    }
  };
  walk(join(PUBLIC, 'js'));
  return out;
}

describe('one route to the speakers (MUTE source scan)', () => {
  const files = gameScripts().map((p) => ({ rel: relative(PUBLIC, p), text: readFileSync(p, 'utf8') }));

  it('only js/audio-buses.js connects to the AudioContext destination', () => {
    const hits = files.filter((f) => /\b(ctx|context|audioCtx|audioContext)\??\.destination\b/.test(f.text)).map((f) => f.rel);
    assert.deepEqual(hits, ['js/audio-buses.js']);
  });

  it('no game script plays sound outside Web Audio (new Audio, <audio>, <video>)', () => {
    const hits = files.filter((f) => /new Audio\(|createElement\(['"](audio|video)['"]\)/.test(f.text)).map((f) => f.rel);
    assert.deepEqual(hits, []);
  });

  it('no exponential ramp on a gain (it can never reach 0) outside the synth one-shots, which stop', () => {
    const hits = files.filter((f) => f.rel !== 'js/synth-sfx.js' && /exponentialRampToValueAtTime/.test(f.text)).map((f) => f.rel);
    assert.deepEqual(hits, []);
    // js/synth-sfx.js envelope(): a short voice whose source stops 50 ms after the 0.0001 tail.
    const synth = files.find((f) => f.rel === 'js/synth-sfx.js').text;
    assert.equal((synth.match(/gain\.exponentialRampToValueAtTime/g) || []).length, 2);
    assert.match(synth, /osc\.stop\(t \+ attack \+ hold \+ decay \+ 0\.05\);/);
  });

  it('game.js builds every music and effects gain on the buses and applies the settings to them', () => {
    const game = files.find((f) => f.rel === 'game.js').text;
    assert.match(game, /audio\.buses = createAudioBuses\(audio\.ctx, audioSettings\(\)\);/);
    assert.match(game, /const audioSettings = \(\) => \(\{ muted: state\.muted, music: musicLevel\(\), effects: sfxLevel\(\) \}\);/);
    assert.match(game, /function applyMute\([^)]*\) \{\n  syncMuteButton\(\);\n  if \(!audio\.buses\) return;\n  audio\.buses\.set\(audioSettings\(\)\);/);
    // The street track, cues and Musicblocks: no gain of their own outside the buses.
    assert.equal((game.match(/audio\.ctx\.createGain\(\)/g) || []).length, 0);
    assert.match(game, /const g = audio\.buses\.musicVoice\(0\);/);
    assert.match(game, /const gain = effect \? audio\.buses\.sfxVoice\(volume\) : audio\.buses\.musicVoice\(volume\);/);
    assert.match(game, /const gain = audio\.buses\.sfxVoice\(MUSICBLOCK_PLAYBACK\.gain\);/);
    assert.doesNotMatch(game, /Math\.max\(0\.001/);
  });
});
