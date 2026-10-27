/**
 * Award and new-day screens wait for the player (js/screen-fx.js), as the
 * client's BaseScreenView did:
 * glitch-client/com/tinyspeck/engine/view/gameoverlay/BaseScreenView.as
 *   33-34 fade_in_secs .4 / fade_out_secs .3, 99-121 ready_for_input after the
 *   fade-in, 171-173 onOkClick closes only when ready, 224-226 Enter and Escape
 *   call onOkClick; no timer closes the screen.
 * Run: node --test tests/award-screens.test.js
 */
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  AWARD_FADE_IN,
  AWARD_FADE_OUT,
  AWARD_QA_HOLD_MS,
  NEW_DAY_QA_HOLD_MS,
  AWARD_BUTTON_LABELS,
  AWARD_BUTTON_IN,
  awardAutoCloseMs,
  awardButtonLabel,
  awardScreenKind,
  holdScreenUntilDismissed,
  screenInput,
  showAwardScreen,
  showNewDayScreen,
} from '../public/js/screen-fx.js?v=g378-1';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = join(root, 'public');
const CLIENT = join(root, '..', 'glitch-client', 'com', 'tinyspeck', 'engine', 'view', 'gameoverlay');
const read = (p) => readFileSync(join(PUBLIC, p), 'utf8');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** A tiny event target: capture listeners run first, stopImmediatePropagation ends the walk. */
function target(extra = {}) {
  const listeners = [];
  return Object.assign({
    listeners,
    addEventListener(type, fn, opt) {
      listeners.push({ type, fn, capture: opt === true || Boolean(opt?.capture) });
    },
    removeEventListener(type, fn, opt) {
      const capture = opt === true || Boolean(opt?.capture);
      const i = listeners.findIndex((l) => l.type === type && l.fn === fn && l.capture === capture);
      if (i >= 0) listeners.splice(i, 1);
    },
    dispatch(type, init = {}) {
      const ev = {
        type, key: '', repeat: false, shiftKey: false, ctrlKey: false, altKey: false, metaKey: false, target: null,
        ...init,
        defaultPrevented: false,
        stopped: false,
        preventDefault() { this.defaultPrevented = true; },
        stopPropagation() { this.stopped = true; },
        stopImmediatePropagation() { this.stopped = true; },
      };
      const order = [...listeners.filter((l) => l.type === type && l.capture), ...listeners.filter((l) => l.type === type && !l.capture)];
      for (const l of order) {
        l.fn(ev);
        if (ev.stopped) break;
      }
      return ev;
    },
  }, extra);
}

function element(extra = {}) {
  const el = target({
    dataset: {},
    hidden: true,
    disabled: false,
    textContent: '',
    attrs: {},
    kids: [],
    style: { setProperty(k, v) { this[k] = v; } },
    classList: {
      set: new Set(),
      add(c) { this.set.add(c); },
      remove(c) { this.set.delete(c); },
      toggle(c, on) { if (on) this.set.add(c); else this.set.delete(c); },
      contains(c) { return this.set.has(c); },
    },
    setAttribute(k, v) { this.attrs[k] = v; },
    removeAttribute(k) { delete this.attrs[k]; },
    contains(x) { return x === el || el.kids.includes(x); },
    closest() { return null; },
    focus() { globalThis.document.activeElement = el; },
    blur() { if (globalThis.document.activeElement === el) globalThis.document.activeElement = null; },
    replaceChildren() {},
    ...extra,
  });
  return el;
}

/** The #award-screen parts showAwardScreen reads. */
function awardScreen() {
  const parts = {
    '[data-award-kicker]': element(),
    '[data-award-title]': element(),
    '[data-award-body]': element(),
    '[data-award-badge]': element(),
    '[data-award-glyph]': element(),
    '[data-award-img]': element(),
    '[data-award-sub]': element(),
    '[data-award-next]': element(),
    '[data-award-close]': element(),
  };
  const el = element({ querySelector: (sel) => parts[sel] || null });
  el.kids.push(...Object.values(parts));
  return { el, parts, next: parts['[data-award-next]'] };
}

let win;
let saved;
beforeEach(() => {
  saved = { window: globalThis.window, document: globalThis.document, raf: globalThis.requestAnimationFrame };
  win = target();
  globalThis.window = win;
  globalThis.document = { activeElement: null, documentElement: { dataset: {} } };
  globalThis.requestAnimationFrame = (cb) => setTimeout(cb, 0);
});
afterEach(() => {
  globalThis.window = saved.window;
  globalThis.document = saved.document;
  globalThis.requestAnimationFrame = saved.raf;
});

describe('award screen timings and buttons (BaseScreenView and its views)', () => {
  it('fades as BaseScreenView does and has no hold of its own', () => {
    assert.equal(AWARD_FADE_IN, 0.4);
    assert.equal(AWARD_FADE_OUT, 0.3);
    const base = readFileSync(join(CLIENT, 'BaseScreenView.as'), 'utf8');
    assert.match(base, /protected var fade_in_secs:Number = \.4;/);
    assert.match(base, /protected var fade_out_secs:Number = \.3;/);
    assert.match(base, /protected function onOkClick\(event:Event\):void \{\n\s+if\(!ready_for_input\) return;\n\s+done\(\);/);
    assert.match(base, /KEY_DOWN_\+Keyboard\.ESCAPE, onOkClick, false, 0, true\);\n\s+KeyBeacon\.instance\.addEventListener\(KeyBeacon\.KEY_DOWN_\+Keyboard\.ENTER, onOkClick/);
    const fx = read('js/screen-fx.js');
    assert.doesNotMatch(fx, /not dismissible/);
    assert.doesNotMatch(fx, /AWARD_HOLD_MS|NEW_DAY_HOLD_MS|payload\.holdMs/);
  });

  it('labels each OK button from its view', () => {
    const labels = {
      'AchievementView.as': 'OK, Good!',
      'LevelUpView.as': 'Sweet sweetness...',
      'CollectionCompleteView.as': 'Alllllright!',
      'NewDayView.as': 'Onwards and upwards!',
    };
    for (const [file, label] of Object.entries(labels)) {
      assert.match(readFileSync(join(CLIENT, file), 'utf8'), new RegExp(`label: '${label.replace(/[.]/g, '\\.')}'`), file);
    }
    assert.deepEqual({ ...AWARD_BUTTON_LABELS }, {
      achievement: 'OK, Good!',
      level: 'Sweet sweetness...',
      collection: 'Alllllright!',
      newDay: 'Onwards and upwards!',
    });
    assert.equal(awardButtonLabel({ kind: 'achievement', classTsid: 'gardener' }), 'OK, Good!');
    assert.equal(awardButtonLabel({ kind: 'achievement', title: 'Quoin Limit Reached!' }), 'OK, Good!');
    assert.equal(awardButtonLabel({ kind: 'level', title: 'Level 3' }), 'Sweet sweetness...');
    assert.equal(awardButtonLabel({ kind: 'achievement', screen: 'collection' }), 'Alllllright!');
    assert.equal(awardScreenKind({ kind: 'achievement', screen: 'collection' }), 'collection');
    // Screens the client never had keep their own label, else OK.
    assert.equal(awardButtonLabel({ kind: 'quest', primaryLabel: 'OK' }), 'OK');
    assert.equal(awardButtonLabel({ kind: 'feat', primaryLabel: 'OK' }), 'OK');
    assert.equal(awardButtonLabel({ kind: 'generic' }), 'OK');
    assert.equal(awardButtonLabel({ kind: 'badge' }), 'OK');
    // No share buttons (AchievementView.as 129-160 are left out).
    assert.doesNotMatch(read('play/index.html'), /Share this/);
  });

  it('animates the button in after input is already ready (AchievementView.as 511-517)', () => {
    assert.deepEqual({ ...AWARD_BUTTON_IN.achievement }, { delay: 1.5, time: 0.4, rise: 40 });
    assert.deepEqual({ ...AWARD_BUTTON_IN.level }, { delay: 1.2, time: 0.5, rise: 0 });
    assert.deepEqual({ ...AWARD_BUTTON_IN.collection }, { delay: 1.3, time: 0.4, rise: 40 });
    assert.deepEqual({ ...AWARD_BUTTON_IN.newDay }, { delay: 1.3, time: 0.4, rise: 40 });
    for (const anim of Object.values(AWARD_BUTTON_IN)) assert.ok(anim.delay > AWARD_FADE_IN);
    const ach = readFileSync(join(CLIENT, 'AchievementView.as'), 'utf8');
    assert.match(ach, /TSTweener\.addTween\(ok_bt, \{y:final_y, alpha:1, time:\.4, delay:1\.5, transition:'easeOutBounce'/);
    const css = read('style.css');
    assert.match(css, /animation: awardOkBounce var\(--award-ok-time, 0\.4s\) var\(--award-ok-delay, 1\.5s\) both;/);
    assert.match(css, /@keyframes awardOkBounce/);
  });

  it('auto-closes only for QA (awardautoclose, or an autoplay route)', () => {
    assert.equal(awardAutoCloseMs(''), null);
    assert.equal(awardAutoCloseMs('?achievementdemo=gardener&achievementremaining=1'), null);
    assert.equal(awardAutoCloseMs('?awardautoclose=1'), AWARD_QA_HOLD_MS);
    assert.equal(awardAutoCloseMs('?awardautoclose=1', { newDay: true }), NEW_DAY_QA_HOLD_MS);
    assert.equal(awardAutoCloseMs('?awardautoclose=2500'), 2500);
    assert.equal(awardAutoCloseMs('?awardautoclose=0'), null);
    assert.equal(awardAutoCloseMs('?jobautoplay=1'), AWARD_QA_HOLD_MS);
    assert.equal(awardAutoCloseMs('?jobautoplay=hold'), AWARD_QA_HOLD_MS);
    assert.equal(awardAutoCloseMs('?questautoplay=1', { newDay: true }), NEW_DAY_QA_HOLD_MS);
    assert.equal(awardAutoCloseMs('?jobautoplay=0'), null);
    assert.equal(awardAutoCloseMs('?jobautoplay=1&awardautoclose=0'), null);
  });
});

describe('screen input (BaseScreenView ready_for_input, focus)', () => {
  it('ignores Enter, Escape and the button before ready, then closes once', async () => {
    const el = element();
    const button = element();
    el.kids.push(button);
    const input = screenInput(el, { button });
    assert.equal(el.dataset.awardInput, 'waiting');
    win.dispatch('keydown', { key: 'Enter' });
    win.dispatch('keydown', { key: 'Escape' });
    el.dispatch('click', { target: button });
    let closedBy = '';
    input.done.then((how) => { closedBy = how; });
    await sleep(5);
    assert.equal(closedBy, '');
    input.ready();
    assert.equal(el.dataset.awardInput, 'ready');
    // A held Enter (repeat) and Shift+Enter are not KEY_DOWN_ENTER (KeyBeacon.as 289-302).
    win.dispatch('keydown', { key: 'Enter', repeat: true });
    win.dispatch('keydown', { key: 'Enter', shiftKey: true });
    // A click on the screen around the card does nothing.
    el.dispatch('click', { target: el });
    await sleep(5);
    assert.equal(closedBy, '');
    const ev = win.dispatch('keydown', { key: 'Enter' });
    assert.equal(ev.defaultPrevented, true);
    await sleep(5);
    assert.equal(closedBy, 'enter');
    assert.equal(input.close('escape'), false, 'once');
    input.release();
    assert.equal(win.listeners.length, 0);
    assert.equal(el.listeners.length, 0);
  });

  it('closes on Escape and on its button', async () => {
    for (const [how, press] of [
      ['escape', (el, button) => win.dispatch('keydown', { key: 'Escape' })],
      ['button', (el, button) => el.dispatch('click', { target: button })],
    ]) {
      const el = element();
      const button = element();
      el.kids.push(button);
      const input = screenInput(el, { button });
      input.ready();
      press(el, button);
      assert.equal(await input.done, how);
      input.release();
    }
  });

  it('keeps every key from the avatar, hotkeys and features while it is up (TSMainView.as blur 538-555)', () => {
    const seen = [];
    // The game's own key handler, registered at boot (game.js window keydown).
    win.addEventListener('keydown', (e) => seen.push(e.key));
    const el = element();
    const input = screenInput(el, { button: element() });
    for (const key of ['d', 'ArrowRight', ' ', 'b', 'e', 'Enter', 'Escape']) {
      const ev = win.dispatch('keydown', { key });
      if (key === ' ' || key === 'ArrowRight') assert.equal(ev.defaultPrevented, true, key);
    }
    assert.deepEqual(seen, []);
    // Key-ups pass, so a key held before the screen does not stick.
    const upSeen = [];
    win.addEventListener('keyup', (e) => upSeen.push(e.key));
    win.dispatch('keyup', { key: 'd' });
    assert.deepEqual(upSeen, ['d']);
    // The online chat box keeps its keys.
    const chat = { closest: (sel) => (sel.includes('input') ? chat : null) };
    win.dispatch('keydown', { key: 'h', target: chat });
    assert.deepEqual(seen, ['h']);
    input.release();
    win.dispatch('keydown', { key: 'd' });
    assert.deepEqual(seen, ['h', 'd']);
  });
});

describe('screens stay until dismissed', () => {
  it('stays until input: clicks and keys in the fade-in are ignored, Enter at ~0.5 s closes it', async () => {
    const el = element();
    const button = element();
    el.kids.push(button);
    const t0 = Date.now();
    let how = '';
    const shown = holdScreenUntilDismissed(el, { button }).then((h) => { how = h; });
    await sleep(200);
    // Mid fade-in: ignored.
    win.dispatch('keydown', { key: 'Enter' });
    el.dispatch('click', { target: button });
    await sleep(300);
    assert.equal(how, '');
    assert.equal(el.dataset.awardInput, 'ready');
    assert.equal(globalThis.document.activeElement, button, 'the OK button takes focus');
    win.dispatch('keydown', { key: 'Enter' });
    await shown;
    assert.equal(how, 'enter');
    const ms = Date.now() - t0;
    assert.ok(ms >= 500 + AWARD_FADE_OUT * 1000 && ms < 1500, `closed at ${ms} ms`);
    assert.equal(el.hidden, true);
    assert.equal(win.listeners.length, 0);
  });

  it('auto-closes after autoCloseMs for QA', async () => {
    const el = element();
    const how = await holdScreenUntilDismissed(el, { button: element(), autoCloseMs: 600 });
    assert.equal(how, 'auto');
  });

  it('shows a badge with OK, Good! and waits for it', async () => {
    const { el, next } = awardScreen();
    let dismissed = false;
    const shown = showAwardScreen(el, {
      kind: 'achievement',
      classTsid: 'gardener',
      title: 'Gardener',
      body: 'Grew a thing.',
      onDismiss: () => { dismissed = true; },
    });
    await sleep(700);
    assert.equal(next.textContent, 'OK, Good!');
    assert.equal(next.hidden, false);
    assert.equal(el.dataset.okin, 'true');
    assert.equal(el.dataset.screen, 'achievement');
    assert.equal(next.style['--award-ok-delay'], '1.5s');
    assert.equal(dismissed, false);
    el.dispatch('click', { target: next });
    await shown;
    assert.equal(dismissed, true);
    assert.equal(next.hidden, true);
    assert.equal(el.dataset.okin, undefined);
  });

  it('queues: the second screen shows after the first closes and waits for its own fade-in', async () => {
    const { el, next } = awardScreen();
    const order = [];
    let queue = Promise.resolve();
    queue = queue.then(() => showAwardScreen(el, { kind: 'level', title: 'Level 2', onDismiss: () => order.push('level') }));
    queue = queue.then(() => showAwardScreen(el, { kind: 'achievement', title: 'Quoin Limit Reached!', onDismiss: () => order.push('badge') }));
    await sleep(600);
    assert.equal(next.textContent, 'Sweet sweetness...');
    win.dispatch('keydown', { key: 'Escape' });
    // Fade-out (.3 s), then the second screen's fade-in starts: an early Enter is ignored.
    await sleep(450);
    assert.deepEqual(order, ['level']);
    assert.equal(next.textContent, 'OK, Good!');
    win.dispatch('keydown', { key: 'Enter' });
    await sleep(400);
    assert.deepEqual(order, ['level']);
    win.dispatch('keydown', { key: 'Enter' });
    await queue;
    assert.deepEqual(order, ['level', 'badge']);
  });

  it('a new day says Onwards and upwards! and closes on Enter', async () => {
    const el = element();
    const button = element({ disabled: true, textContent: 'A new day dawns' });
    el.kids.push(button);
    el.querySelector = (sel) => (sel === '[data-nd-ok]' ? button : null);
    const shown = showNewDayScreen(el, { autoCloseMs: null });
    await sleep(500);
    assert.equal(button.textContent, 'Onwards and upwards!');
    assert.equal(button.disabled, false);
    assert.equal(button.style['--award-ok-delay'], '1.3s');
    win.dispatch('keydown', { key: 'Enter' });
    assert.equal(await shown, 'enter');
  });
});

describe('the game wires the screens', () => {
  it('opens the new day through showNewDayScreen, trophies as collection screens, no timed holds', () => {
    const game = read('game.js');
    assert.match(game, /playSfx\('newDay', \{ volume: 0\.75 \}\);\n\s+await showNewDayScreen\(el\);/);
    assert.doesNotMatch(game, /A new day dawns/);
    assert.doesNotMatch(game, /NEW_DAY_HOLD_MS|holdMs: 1_800/);
    assert.match(game, /screen: update\.def\.category === 'trophies' \? 'collection' : undefined,/);
    // The serial queue (one screen after another) is unchanged.
    assert.match(game, /awardQueue = awardQueue\n[^\n]*\n\s*\.then\(\(\) => afterStreetCard\(\)\)\n\s*\.then\(async \(\) => \{\n\s*const el = document\.getElementById\('award-screen'\);[\s\S]{0,140}await showAwardScreen\(el, payload\);/);
    const html = read('play/index.html');
    assert.match(html, /<button type="button" class="new-day-btn" data-nd-ok>Onwards and upwards!<\/button>/);
    assert.match(html, /<button type="button" class="award-next" data-award-next hidden>OK<\/button>/);
  });
});
