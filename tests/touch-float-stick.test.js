/**
 * FLOAT STICK (Friendly's idea; Austin 2026-11-13: an option, off by default, on a phone either way up):
 * "Stick follows your thumb" in the Menu's Settings group, kept on this device. On, the stick's corner
 * grows to the lower left of the street: a thumb anywhere there places the stick and drags from it, and
 * a quick tap there acts on the street (the thing under it, or a walk), as a tap anywhere else does.
 * Run: node --test tests/touch-float-stick.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  FLOAT_STICK_DEFAULT,
  FLOAT_STICK_LABEL,
  FLOAT_STICK_STORAGE_KEY,
  createFloatStick,
  parseFloatStick,
} from '../public/js/touch-controls.js?v=d65f8c10';
import { fakeControls, fakeEl } from './touch-fake-dom.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const css = readFileSync(join(root, 'public/style.css'), 'utf8');
const game = readFileSync(join(root, 'public/game.js'), 'utf8');

function fakeStorage(init = {}) {
  const m = new Map(Object.entries(init));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), map: m };
}

describe('the setting', () => {
  it('is off by default, and only "on" (or its kin) turns it on', () => {
    assert.equal(FLOAT_STICK_DEFAULT, false);
    assert.equal(parseFloatStick(null), false);
    assert.equal(parseFloatStick('garbage'), false);
    assert.equal(parseFloatStick('on'), true);
    assert.equal(parseFloatStick('off'), false);
  });
  it('is kept per device in localStorage, read back on the next visit, and tells its listeners', () => {
    const storage = fakeStorage();
    const s = createFloatStick({ win: {}, storage });
    assert.equal(s.get(), false);
    const seen = [];
    s.onChange((on) => seen.push(on));
    s.set(true);
    assert.equal(storage.map.get(FLOAT_STICK_STORAGE_KEY), 'on');
    assert.deepEqual(seen, [true]);
    assert.equal(createFloatStick({ win: {}, storage }).get(), true);
    s.set(false);
    assert.equal(storage.map.get(FLOAT_STICK_STORAGE_KEY), 'off');
  });
  it('survives a storage that throws (a private window)', () => {
    const bad = { getItem() { throw new Error('no'); }, setItem() { throw new Error('no'); } };
    const s = createFloatStick({ win: {}, storage: bad });
    assert.equal(s.get(), false);
    assert.equal(s.set(true), true);
  });
});

describe('the controls with the setting', () => {
  it('mark the controls data-float while it is on, and follow a change', () => {
    const setting = createFloatStick({ win: {}, storage: fakeStorage() });
    const { wrap } = fakeControls({ install: { floatStick: setting } });
    assert.equal(wrap.dataset.float, undefined);
    setting.set(true);
    assert.equal(wrap.dataset.float, 'on');
    setting.set(false);
    assert.equal(wrap.dataset.float, undefined);
  });
  it('a quick tap in the wide corner reaches the street as a float tap (a walk on empty ground)', () => {
    const setting = createFloatStick({ win: {}, storage: fakeStorage({ [FLOAT_STICK_STORAGE_KEY]: 'on' }) });
    const { zone, taps } = fakeControls({ install: { floatStick: setting } });
    zone.fire('pointerdown', { pointerId: 1, clientX: 250, clientY: 40, timeStamp: 0 });
    // WebKit can cancel a tap before its pointerup; the click says it was one.
    zone.fire('pointercancel', { pointerId: 1, clientX: 0, clientY: 0, timeStamp: 90 });
    zone.fire('click', { clientX: 250, clientY: 40, timeStamp: 95 });
    assert.deepEqual(taps, [{ x: 250, y: 40, float: true }]);
  });
  it('a thumb far up the wide corner places the stick there and walks', () => {
    const setting = createFloatStick({ win: {}, storage: fakeStorage({ [FLOAT_STICK_STORAGE_KEY]: 'on' }) });
    const { zone, base, keys } = fakeControls({ install: { floatStick: setting }, zoneRect: { left: 8, top: 0, width: 360, height: 190 } });
    zone.fire('pointerdown', { pointerId: 1, clientX: 338, clientY: 24 });
    assert.equal(base.style.left, '330px');
    assert.equal(base.style.top, '24px');
    zone.fire('pointermove', { pointerId: 1, clientX: 382, clientY: 24 });
    assert.deepEqual([...keys], ['ArrowRight']);
    zone.fire('pointermove', { pointerId: 1, clientX: 338, clientY: -30 });
    assert.deepEqual([...keys], ['ArrowUp'], 'Up on the stick climbs a ladder as before');
  });
  it('puts its switch at the foot of the Menu\'s Settings group', () => {
    const settings = fakeEl();
    settings.hidden = true;
    const appended = [];
    settings.append = (n) => appended.push(n);
    const made = [];
    const mk = () => {
      const n = fakeEl();
      n.append = (...kids) => { n.kids = kids; };
      n.setAttribute = (k, v) => { n[`@${k}`] = v; };
      made.push(n);
      return n;
    };
    const setting = createFloatStick({ win: {}, storage: fakeStorage() });
    const parts = { '[data-touch-stick]': fakeEl(), '.touch-stick-base': fakeEl(), '.touch-stick-knob': fakeEl(), '[data-touch-jump]': fakeEl() };
    const wrap = fakeEl();
    wrap.querySelector = (sel) => parts[sel] || null;
    let first = true;
    fakeControls({
      install: { floatStick: setting },
      doc: {
        querySelector: (sel) => (sel === '#more-list [data-menu-group="settings"]' ? settings : null),
        createElement: () => {
          if (first) { first = false; return wrap; }
          return mk();
        },
      },
    });
    assert.equal(appended.length, 1);
    const row = appended[0];
    assert.equal(row.dataset.menuControl, 'float-stick');
    assert.equal(settings.hidden, false);
    const [input, words] = row.kids;
    assert.equal(input.type, 'checkbox');
    assert.equal(input.checked, false, 'off by default');
    assert.equal(words.textContent, FLOAT_STICK_LABEL);
    input.checked = true;
    input.fire('change');
    assert.equal(setting.get(), true);
  });
});

describe('the wide corner and game.js', () => {
  const at = css.indexOf('/* FLOAT STICK (');
  const rule = css.slice(at, css.indexOf('/* === end LANDSCAPE-PANELS === */', at));
  it('style.css grows the corner only with data-float on: under half the width, up to 300 px tall', () => {
    assert.ok(at > 0);
    assert.match(rule, /\.touch-controls\[data-float="on"\] \.touch-stick \{\s*width: min\(45%, 360px\);\s*height: clamp\(132px, 100dvh - var\(--pack-live-height, 72px\) - var\(--hud-h\) - 96px, 300px\);/);
    assert.match(rule, /\.touch-controls\[data-float="on"\] \.touch-stick-base \{ left: 66px; top: calc\(100% - 66px\); \}/);
  });
  it('game.js gives the controls the setting, and a float tap on empty street walks', () => {
    assert.match(game, /floatStick: createFloatStick\(\{ win: window \}\),/);
    assert.match(game, /tapThrough: \(x, y, how = \{\}\) => \{/);
    assert.match(game, /if \(!hit && !how\.float\) return;/);
  });
});
