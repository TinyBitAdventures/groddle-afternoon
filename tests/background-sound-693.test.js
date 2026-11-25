/**
 * #693 (desktop): "If the tab that Groddle Afternoon loses focus, it stops playing audio!" G1266
 * (#660) hushed every sound while the page was hidden, on every device. Glitch's Flash client kept
 * playing in a background tab (StageBeacon.onDeactivate only throttled the frame rate; SoundMaster
 * had no focus handling). Austin 2026-11-25: keep sound playing in the background on a computer,
 * hush it on a phone or tablet, and let the player choose: "Keep playing sound in the background"
 * (js/background-sound.js) in the Sound popover and Preferences, on by default on a computer, off
 * on a phone or tablet. On, nothing hushes; off, G1266's hush. Coming back still rebuilds music the
 * system stopped (the iPad path, ed80947fd66). Mute stays mute either way.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createAudioResumer } from '../public/js/audio-resume.js?v=63a617ad';
import { createMusicVoice } from '../public/js/music-voice.js?v=75c8cf57';
import { BACKGROUND_SOUND_LABEL, backgroundSoundDefault, createBackgroundSound } from '../public/js/background-sound.js?v=00000000';
import { BACKGROUND_SOUND_KEY, loadBackgroundSound, saveBackgroundSound } from '../public/js/audio-pref.js?v=80d433c3';
import { backgroundSoundToggle } from '../public/js/ui/topbar.js?v=42e72cdd';

const root = join(import.meta.dirname, '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');
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

function memoryStorage() {
  const data = new Map();
  return { data, getItem: (k) => (data.has(k) ? data.get(k) : null), setItem: (k, v) => data.set(k, String(v)) };
}

/** A context whose clock runs only while it is "running". */
function context() {
  const ctx = Object.assign(target(), {
    state: 'running',
    currentTime: 0,
    suspends: 0,
    resumes: 0,
    set(next) { ctx.state = next; ctx.fire('statechange'); },
    advance(sec) { if (ctx.state === 'running') ctx.currentTime += sec; },
    async suspend() { ctx.suspends += 1; ctx.set('suspended'); },
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

/** The game page with street music playing, wired as game.js wires it. */
function page({ device = 'computer', muted = false, storage = memoryStorage() } = {}) {
  const doc = Object.assign(target(), { visibilityState: 'visible' });
  const win = target();
  const ctx = context();
  const el = element(42);
  const voice = createMusicVoice({ url: 'groddle.mp3', el, node: { disconnect() {} }, gain: { disconnect() {} }, ctx, win });
  const state = { muted };
  if (!muted) voice.play();
  const setting = createBackgroundSound({ win: {}, device: () => device, load: () => loadBackgroundSound(storage), save: (on) => saveBackgroundSound(on, storage) });
  const rebuilt = [];
  const resumer = createAudioResumer({
    getCtx: () => ctx,
    getVoice: () => voice,
    isMuted: () => state.muted,
    rebuildVoice: (v) => rebuilt.push({ url: v.url, time: v.time() }),
    hushWhenHidden: () => !setting.get(),
    doc,
    win,
  });
  const pass = (sec) => { ctx.advance(sec); el.advance(sec); };
  const hide = () => { doc.visibilityState = 'hidden'; doc.fire('visibilitychange'); win.fire('pagehide'); };
  const show = () => { doc.visibilityState = 'visible'; doc.fire('visibilitychange'); win.fire('focus'); };
  return { ctx, el, voice, state, setting, rebuilt, resumer, pass, hide, show, storage };
}

describe('#693 the background sound setting', () => {
  it('defaults: on for a computer, off for a phone or a tablet (an iPad counts as a phone)', () => {
    assert.equal(backgroundSoundDefault('computer'), true);
    assert.equal(backgroundSoundDefault(undefined), true, 'a page the phone gate did not name is a computer');
    assert.equal(backgroundSoundDefault('phone'), false);
    assert.equal(backgroundSoundDefault('tablet'), false);
    assert.equal(BACKGROUND_SOUND_LABEL, 'Keep playing sound in the background');
  });

  it('a computer keeps playing while the tab is hidden (the report)', async () => {
    const p = page();
    p.pass(5);
    p.hide();
    await tick();
    p.pass(60); // a minute in another tab
    assert.equal(p.ctx.state, 'running', 'effects, cues and musicblocks go on');
    assert.equal(p.ctx.suspends, 0);
    assert.equal(p.el.paused, false);
    assert.equal(p.el.currentTime, 107, 'the street music played on');
    assert.equal(p.resumer.hushed(), false, 'new sounds still start');
    p.show();
    await tick();
    assert.equal(p.rebuilt.length, 0, 'music that played on through the background is left as it is');
    assert.equal(p.el.plays, 1);
  });

  it('a phone hushes while hidden by default, and comes back rebuilt at the same point', async () => {
    const p = page({ device: 'phone' });
    p.pass(5);
    p.hide();
    await tick();
    p.pass(60);
    assert.equal(p.ctx.state, 'suspended');
    assert.equal(p.el.paused, true);
    assert.equal(p.resumer.hushed(), true);
    p.show();
    await tick();
    assert.deepEqual(p.rebuilt, [{ url: 'groddle.mp3', time: 47 }]);
  });

  it('turning it on or off applies live, from the next time the page hides, and is remembered', async () => {
    const p = page();
    p.setting.set(false);
    assert.equal(p.storage.data.get(BACKGROUND_SOUND_KEY), '0');
    p.hide();
    await tick();
    assert.equal(p.ctx.state, 'suspended', 'off on a computer: hushed as on a phone');
    p.show();
    await tick();
    assert.equal(p.ctx.state, 'running');
    p.setting.set(true);
    assert.equal(p.storage.data.get(BACKGROUND_SOUND_KEY), '1');
    const suspends = p.ctx.suspends;
    p.hide();
    await tick();
    assert.equal(p.ctx.suspends, suspends, 'on again: nothing hushes');
    assert.equal(p.resumer.hushed(), false);
    // A phone that turned it on keeps playing; the stored choice outranks the device's default.
    const phone = page({ device: 'phone', storage: p.storage });
    assert.equal(phone.setting.get(), true);
    phone.hide();
    await tick();
    assert.equal(phone.ctx.state, 'running');
  });

  it('on: music the system stopped while away is rebuilt at the same point on return (the iPad path)', async () => {
    const p = page({ device: 'tablet', storage: (() => { const s = memoryStorage(); saveBackgroundSound(true, s); return s; })() });
    p.pass(5);
    p.hide();
    await tick();
    p.pass(10);
    // The system takes the audio session (a call, another app): the context stops and the element pauses.
    p.ctx.set('interrupted');
    p.el.pause();
    p.pass(300);
    p.show();
    await tick();
    assert.equal(p.ctx.state, 'running');
    assert.deepEqual(p.rebuilt, [{ url: 'groddle.mp3', time: 57 }]);
    assert.equal(p.el.plays, 1, 'the old element is not played on (#660)');
  });

  it('muted stays muted with the setting on', async () => {
    const p = page({ muted: true });
    p.hide();
    await tick();
    p.show();
    await tick();
    assert.equal(p.state.muted, true);
    assert.equal(p.el.plays, 0);
    assert.equal(p.rebuilt.length, 0);
  });

  it('game.js reads the setting each time the page hides, and gives the Sound popover its switch', () => {
    const game = read('public/game.js');
    assert.match(game, /import \{ backgroundSound, backgroundSoundOn \} from '\.\/js\/background-sound\.js\?v=[0-9a-f]+';/);
    assert.match(game, /hushWhenHidden: \(\) => !backgroundSoundOn\(\),/);
    assert.match(game, /otherMusic: \{ get: \(\) => otherMusic, set: setOtherMusic \}, background: backgroundSound \}/);
    // The default follows the phone gate's device (window.GRODDLE_DEVICE), as touch-controls.js does.
    assert.match(read('public/js/background-sound.js'), /device = \(\) => win\?\.GRODDLE_DEVICE/);
    assert.match(read('public/play/index.html'), /w\.GRODDLE_DEVICE = phone \|\| small \? 'phone' : tablet \? 'tablet' : 'computer';/);
  });

  it('the Sound popover (Modern and Classic) has the switch above Mute', () => {
    const doc = fakeDoc();
    let on = true;
    const { row, input } = backgroundSoundToggle(doc, { get: () => on, set: (v) => { on = v; } }, { id: 'sound-background' });
    assert.equal(row.dataset.backgroundSoundControl, 'sound');
    assert.equal(row.children[1].textContent, BACKGROUND_SOUND_LABEL);
    assert.equal(input.getAttribute('role'), 'switch');
    assert.equal(input.getAttribute('aria-checked'), 'true');
    input.click();
    assert.equal(on, false);
    assert.equal(input.getAttribute('aria-checked'), 'false');
    const topbar = read('public/js/ui/topbar.js');
    assert.match(topbar, /backgroundSoundToggle\(doc, audio\.background, \{ id: 'sound-background' \}\)/);
    assert.match(topbar, /if \(mute\) mute\.before\(background\.row\);/);
    // Classic restyles the same popover row.
    assert.match(read('public/css/classic.css'), /:root\[data-ui="classic"\] \.top-bar #sound-pop \.sound-background \{/);
  });

  it('Preferences (`,`, both skins) has the same switch', () => {
    const prefs = read('public/js/classic/classic-prefs.js');
    assert.match(prefs, /import \{ BACKGROUND_SOUND_HINT, BACKGROUND_SOUND_LABEL, backgroundSoundOn, onBackgroundSoundChange, setBackgroundSound \} from '\.\.\/background-sound\.js\?v=[0-9a-f]+';/);
    assert.match(prefs, /parts\.background\.addEventListener\('change', \(\) => setBackgroundSound\(parts\.background\.checked\)\);/);
    assert.match(prefs, /parts\.background\.checked = backgroundSoundOn\(\);/);
    assert.match(prefs, /win\.append\([^)]*mapRow, bgRow, foot\);/);
    assert.match(prefs, /onBackgroundSoundChange\(sync\);/);
  });
});

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
