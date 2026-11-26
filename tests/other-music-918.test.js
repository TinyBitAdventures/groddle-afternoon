/**
 * G918 (#447, iPhone): the game stopped the player's own music. The street music streams through an
 * <audio> element (game.js streetMusicVoice), which on iOS takes the audio session for playback, and it
 * was made and played even at Music 0 or muted (Mute only held the bus at 0). Now no element exists
 * while muted, at Music 0 or with "Let other apps' music keep playing" on (js/other-music.js), and that
 * setting asks Safari 17+ for an 'ambient' audio session (navigator.audioSession, feature-detected).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { OTHER_MUSIC_HINT, OTHER_MUSIC_LABEL, applyAudioSession, streetMusicWanted } from '../public/js/other-music.js?v=f58af5e6';
import { OTHER_MUSIC_KEY, loadOtherMusic, saveOtherMusic } from '../public/js/audio-pref.js?v=683f27c8';
import { otherMusicToggle } from '../public/js/ui/topbar.js?v=7c194020';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const game = readFileSync(join(root, 'public/game.js'), 'utf8');
const topbar = readFileSync(join(root, 'public/js/ui/topbar.js'), 'utf8');

function memoryStorage() {
  const data = new Map();
  return { getItem: (k) => (data.has(k) ? data.get(k) : null), setItem: (k, v) => data.set(k, String(v)) };
}

/** Just enough DOM for one switch row. */
function fakeDoc() {
  const make = (tag) => {
    const listeners = {};
    const node = {
      tagName: tag.toUpperCase(),
      children: [],
      dataset: {},
      attrs: {},
      textContent: '',
      checked: false,
      append(...kids) { node.children.push(...kids); },
      setAttribute(k, v) { node.attrs[k] = String(v); },
      getAttribute(k) { return node.attrs[k] ?? null; },
      addEventListener(type, fn) { (listeners[type] ||= []).push(fn); },
      fire(type, e = {}) { for (const fn of listeners[type] || []) fn({ preventDefault() {}, stopPropagation() {}, ...e }); },
      click() { node.checked = !node.checked; node.fire('change'); },
    };
    return node;
  };
  return { createElement: make };
}

describe('G918 street music only when it is wanted', () => {
  it('no music element while muted, at Music 0 or with other apps\' music let through', () => {
    assert.equal(streetMusicWanted({ muted: false, music: 100, otherMusic: false }), true);
    assert.equal(streetMusicWanted({ muted: false, music: 0.05 }), true);
    assert.equal(streetMusicWanted({ muted: true, music: 100 }), false);
    assert.equal(streetMusicWanted({ muted: false, music: 0 }), false);
    assert.equal(streetMusicWanted({ muted: false, music: 100, otherMusic: true }), false);
    assert.equal(streetMusicWanted({ music: Number.NaN }), false);
  });

  it('game.js makes the element only when allowed, and applyMute starts or drops it', () => {
    const start = game.slice(game.indexOf('function startStreetTrack('), game.indexOf('/** The Sound popover\'s Effects and Music levels'));
    assert.ok(start.indexOf('if (!streetMusicAllowed()) {') > 0);
    assert.ok(start.indexOf('if (!streetMusicAllowed()) {') < start.indexOf('streetMusicVoice(url, loop)'));
    assert.match(game, /const streetMusicAllowed = \(\) => streetMusicWanted\(\{ muted: state\.muted, music: audioLevels\.music, otherMusic \}\);/);
    // The setting turns the game's own music off on the bus too (music cues).
    assert.match(game, /const musicLevel = \(\) => \(otherMusic \? 0 : audioLevels\.music \/ 100\);/);
    const apply = game.slice(game.indexOf('function applyMute('), game.indexOf('// —— Textures ——'));
    assert.match(apply, /\n  syncStreetMusic\(\);\n\}/);
    const sync = game.slice(game.indexOf('function syncStreetMusic('), game.indexOf('function syncMuteButton('));
    assert.match(sync, /voice\.stop\(0\);\n    audio\.music = null;/);
    assert.match(sync, /startStreetTrack\(list\.tracks\[list\.index\], list\.loop, STREET_TRACK_FADE_SEC\);/);
  });

  it('a tap that ends (touchend, iPhone) still unlocks Web Audio and the music', () => {
    // G1000: the one resume path (js/audio-resume.js) listens for touchend with the other gestures.
    assert.match(game, /createAudioResumer\(\{/);
    assert.match(readFileSync(join(root, 'public/js/audio-resume.js'), 'utf8'), /'pointerdown', 'keydown', 'touchend'/);
    // #504: the autoplay retry lives with the voice (js/music-voice.js).
    const voice = readFileSync(join(root, 'public/js/music-voice.js'), 'utf8');
    assert.match(voice, /for \(const type of \['pointerdown', 'keydown', 'touchend'\]\) win\?\.addEventListener\?\.\(type, retry, \{ once: true, capture: true \}\);/);
  });
});

describe('G918 "Let other apps\' music keep playing"', () => {
  it('is remembered on this device like the other sound settings, off by default', () => {
    const storage = memoryStorage();
    assert.equal(loadOtherMusic(storage), false);
    saveOtherMusic(true, storage);
    assert.equal(storage.getItem(OTHER_MUSIC_KEY), '1');
    assert.equal(loadOtherMusic(storage), true);
    saveOtherMusic(false, storage);
    assert.equal(loadOtherMusic(storage), false);
    const blocked = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
    assert.equal(loadOtherMusic(blocked), false);
    assert.doesNotThrow(() => saveOtherMusic(true, blocked));
  });

  it('asks for an ambient audio session where the API exists, auto when off, nothing elsewhere', () => {
    const nav = { audioSession: { type: 'auto' } };
    assert.equal(applyAudioSession(true, nav), 'ambient');
    assert.equal(nav.audioSession.type, 'ambient');
    assert.equal(applyAudioSession(false, nav), 'auto');
    assert.equal(nav.audioSession.type, 'auto');
    assert.equal(applyAudioSession(true, {}), null);
    assert.equal(applyAudioSession(true, undefined), null);
    const broken = { audioSession: { get type() { return 'auto'; }, set type(_) { throw new Error('nope'); } } };
    assert.equal(applyAudioSession(true, broken), null);
  });

  it('game.js sets the session before the AudioContext and on every change', () => {
    const load = game.slice(game.indexOf('async function loadAudio()'), game.indexOf('/** Small recovered files worth warming'));
    assert.ok(load.indexOf('applyAudioSession(otherMusic);') < load.indexOf('audio.ctx = new'));
    const set = game.slice(game.indexOf('function setOtherMusic('), game.indexOf('function syncStreetMusic('));
    assert.match(set, /saveOtherMusic\(otherMusic\);\n  applyAudioSession\(otherMusic\);\n  applyMute\(\);/);
    assert.match(game, /otherMusic: \{ get: \(\) => otherMusic, set: setOtherMusic \}/);
  });

  it('the switch says what it does in plain words, including the iPhone silent switch', () => {
    assert.equal(OTHER_MUSIC_LABEL, "Let other apps' music keep playing");
    assert.match(OTHER_MUSIC_HINT, /effects still play/);
    assert.match(OTHER_MUSIC_HINT, /silent switch/);
    assert.doesNotMatch(OTHER_MUSIC_HINT + OTHER_MUSIC_LABEL, /—/);
    let on = false;
    const { row, input } = otherMusicToggle(fakeDoc(), { get: () => on, set: (v) => { on = v; } }, { id: 'sound-other-music' });
    assert.equal(row.dataset.otherMusicControl, 'sound');
    assert.equal(input.getAttribute('role'), 'switch');
    assert.equal(input.getAttribute('aria-checked'), 'false');
    input.click();
    assert.equal(on, true);
    assert.equal(input.getAttribute('aria-checked'), 'true');
    // It lives in the Sound popover both skins share, above Mute, and greys the Music row while on.
    assert.match(topbar, /if \(mute\) mute\.before\(other\.row\);/);
    assert.match(topbar, /input\.disabled = othersOn;/);
  });
});
