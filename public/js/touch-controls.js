/**
 * TOUCH: the controls of a phone that took the full game (window.GRODDLE_DEVICE === 'phone', the
 * phone gate on /play/; Austin 2026-11-12 on his iPhone: "Can't move yet."). Computers and tablets
 * never see them.
 *
 * - A stick at the bottom left: hold it left or right to walk, up or down to climb a ladder (it
 *   holds the arrow keys in game.js's held keys, so walking, ladders and every street rule are
 *   the keyboard's own). The stick starts where the thumb lands in its corner.
 * - Jump at the bottom right: a tap jumps (the Space key's edge, game.js queueJump), a hold
 *   holds Space (the Paradise courses that float while it is held).
 * - A tap on the street (game.js, the canvas's pointerdown) opens the thing's verb menu as a
 *   click does, walks to empty ground (js/user-path.js, the street map's walk) and climbs a
 *   tapped ladder to where it was tapped.
 * Both sit under every panel (z-hud), outside the safe area, and take only their own touches, so
 * a panel's scrolling and a tap on the world never reach them.
 */

/** How far (CSS px) the knob travels from where the thumb landed. */
export const STICK_RADIUS = 46;
/** A thumb this close to where it landed holds nothing. */
export const STICK_DEAD = 12;
/** Past this ratio of one axis to the other, the stick holds that axis alone (a ladder climb never hops off). */
export const STICK_AXIS_LOCK = 1.7;

/**
 * game.js sends this window event on each Jump press, so a rule that reads the Space key's edge
 * in the air (the levitation lift, js/features/meditation-feature.js) hears Jump too.
 */
export const TOUCH_JUMP_EVENT = 'groddle:touch-jump';

/** The phone gate's device (play/index.html): only a phone gets the touch controls. */
export function isPhoneDevice(win = globalThis) {
  return win?.GRODDLE_DEVICE === 'phone';
}

/**
 * PURE: the arrow keys a stick offset holds (dx right, dy down, CSS px from where the thumb
 * landed). Nothing inside STICK_DEAD; mostly sideways holds Left or Right alone, mostly up or
 * down holds Up or Down alone, a diagonal holds both.
 * @returns {string[]}
 */
export function stickKeys(dx, dy, { dead = STICK_DEAD, lock = STICK_AXIS_LOCK } = {}) {
  const x = Number(dx) || 0;
  const y = Number(dy) || 0;
  if (Math.hypot(x, y) < dead) return [];
  const ax = Math.abs(x);
  const ay = Math.abs(y);
  const out = [];
  if (ax >= dead && ax * lock >= ay) out.push(x < 0 ? 'ArrowLeft' : 'ArrowRight');
  if (ay >= dead && ay * lock >= ax) out.push(y < 0 ? 'ArrowUp' : 'ArrowDown');
  return out;
}

/** A tap on the stick's corner shorter than this (ms) that never moved it goes to the street behind. */
export const STICK_TAP_MS = 300;

/** PURE: whether a press on the stick was a tap meant for the street behind it. */
export function isTapThrough({ moved, ms, dx = 0, dy = 0 }, { dead = STICK_DEAD, tapMs = STICK_TAP_MS } = {}) {
  return !moved && Number(ms) >= 0 && Number(ms) < tapMs && Math.hypot(Number(dx) || 0, Number(dy) || 0) < dead;
}

/** PURE: the knob's offset, held inside STICK_RADIUS. */
export function knobOffset(dx, dy, radius = STICK_RADIUS) {
  const x = Number(dx) || 0;
  const y = Number(dy) || 0;
  const d = Math.hypot(x, y);
  if (d <= radius || d === 0) return { x, y };
  return { x: (x / d) * radius, y: (y / d) * radius };
}

/**
 * PURE: what a tap on the street does on a phone, after the verb pick found nothing there.
 * `ladder` is street-model findClimbWallNear's hit for the tap (or null): a ladder climbs to the
 * tapped height (held inside the ladder, a little past either end so the climb gets off there);
 * anything else walks to the tapped x.
 * @returns {{ kind: 'ladder', x: number, goalY: number } | { kind: 'point', x: number, y: number }}
 */
export function touchTapPlan(x, y, ladder = null) {
  if (ladder && Number.isFinite(ladder.x)) {
    const goalY = Math.min(ladder.yBot + 4, Math.max(ladder.yTop - 8, Number(y) || 0));
    return { kind: 'ladder', x: ladder.x, goalY };
  }
  return { kind: 'point', x: Number(x) || 0, y: Number(y) || 0 };
}

/**
 * PURE: the climb's Up or Down toward a tapped ladder height: 'up', 'down' or '' (there, or the
 * player took over with the stick or a key, which drops the goal).
 */
export function climbGoalStep(goalY, playerY, { held = false, near = 6 } = {}) {
  if (held || !Number.isFinite(goalY) || !Number.isFinite(playerY)) return '';
  const dy = goalY - playerY;
  if (Math.abs(dy) <= near) return '';
  return dy < 0 ? 'up' : 'down';
}

/**
 * PURE: a world hint chip ({ key, label, x, y }, game.js settlePrompt) in a phone's words: Enter
 * (open the thing) and Up (get on the ladder) are a tap, a ladder climb is the stick and Jump.
 * Any other chip (a signpost's number, G for the map) passes through.
 */
export function touchPrompt(want) {
  if (!want) return want;
  if (want.key === 'Enter') return { ...want, key: 'Tap' };
  if (want.key === '↑') return { ...want, key: 'Tap' };
  if (want.key === '↑↓') return { ...want, key: '', label: 'Stick climbs · Jump' };
  return want;
}

/**
 * PURE: an advance or prompt line in a phone's words: "Click anywhere" (the VOG lines, the tutorial's
 * overlays, the Hall of Rejected Concepts) is a tap there. `touch` false returns the text as given.
 */
export function touchWords(text, touch = isPhoneDevice()) {
  const s = String(text ?? '');
  return touch ? s.replace(/\bClick anywhere/g, 'Tap anywhere').replace(/\bclick anywhere/g, 'tap anywhere') : s;
}

/**
 * Builds the stick and the Jump button into `root` (the game's wrap) and wires them.
 * press(key) / release(key): the held keys (game.js `keys`); jump(): a jump's edge.
 * Returns { el, releaseAll, destroy }.
 */
export function installTouchControls({ root, press, release, jump, tapThrough = null, doc = globalThis.document, win = globalThis.window } = {}) {
  if (!root || !doc) return null;
  const el = doc.createElement('div');
  el.id = 'touch-controls';
  el.className = 'touch-controls';
  el.innerHTML = `
    <div class="touch-stick" data-touch-stick aria-hidden="true"><span class="touch-stick-base"><span class="touch-stick-knob"></span></span></div>
    <button type="button" class="touch-jump" data-touch-jump aria-label="Jump">Jump</button>`;
  root.appendChild(el);
  doc.documentElement.classList.add('touch-phone');
  const zone = el.querySelector('[data-touch-stick]');
  const base = el.querySelector('.touch-stick-base');
  const knob = el.querySelector('.touch-stick-knob');
  const jumpBtn = el.querySelector('[data-touch-jump]');

  let stickId = null;
  let origin = null;
  let held = [];
  let frame = 0;
  // A short tap that never moved the stick: whether it held a key, and when it landed.
  let moved = false;
  let downAt = 0;
  // G674: the stick follows only the finger that started it. Other fingers that land on its corner
  // while it is held (a thumb on its way to Jump, a pinch) are kept here and never move or reset it;
  // a press that had one is never a tap on the street. tapReady: the stick's own quick tap, for the
  // click that follows it.
  const others = new Set();
  let multi = false;
  let tapReady = false;
  const hold = (next) => {
    for (const k of held) if (!next.includes(k)) release(k);
    for (const k of next) press(k);
    held = next;
    el.dataset.stick = next.join(' ');
  };
  // A menu or the window's blur lets go of every held key (js/held-keys.js); a thumb still down
  // takes them back each frame, so the walk goes on when the menu closes.
  const keepHeld = () => {
    if (stickId == null) return;
    for (const k of held) press(k);
    frame = win.requestAnimationFrame(keepHeld);
  };
  const placeBase = (x, y) => {
    const r = zone.getBoundingClientRect();
    base.style.left = `${x - r.left}px`;
    base.style.top = `${y - r.top}px`;
  };
  const endStick = () => {
    stickId = null;
    origin = null;
    hold([]);
    knob.style.transform = '';
    base.style.left = '';
    base.style.top = '';
    zone.classList.remove('is-held');
    if (frame) win.cancelAnimationFrame(frame);
    frame = 0;
  };
  zone.addEventListener('pointerdown', (e) => {
    if (stickId != null) {
      if (e.pointerId !== stickId) {
        e.preventDefault();
        e.stopPropagation();
        others.add(e.pointerId);
        multi = true;
      }
      return;
    }
    if (others.has(e.pointerId)) return;
    e.preventDefault();
    stickId = e.pointerId;
    origin = { x: e.clientX, y: e.clientY };
    moved = false;
    multi = others.size > 0;
    tapReady = false;
    downAt = e.timeStamp;
    try { zone.setPointerCapture(e.pointerId); } catch { /* a synthetic pointer */ }
    zone.classList.add('is-held');
    placeBase(e.clientX, e.clientY);
    frame = win.requestAnimationFrame(keepHeld);
  });
  zone.addEventListener('pointermove', (e) => {
    if (e.pointerId !== stickId || !origin) return;
    e.preventDefault();
    const dx = e.clientX - origin.x;
    const dy = e.clientY - origin.y;
    const k = knobOffset(dx, dy);
    knob.style.transform = `translate(${k.x.toFixed(1)}px, ${k.y.toFixed(1)}px)`;
    const next = stickKeys(dx, dy);
    if (next.length) moved = true;
    hold(next);
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    zone.addEventListener(type, (e) => {
      if (e.pointerId !== stickId) {
        others.delete(e.pointerId);
        return;
      }
      if (type === 'pointerup' && origin) {
        tapReady = !multi && isTapThrough({ moved, ms: e.timeStamp - downAt, dx: e.clientX - origin.x, dy: e.clientY - origin.y });
      }
      endStick();
    });
  }
  // The mobile QA (2026-11-12): a chicken under the stick's corner could not be tapped. A quick tap
  // that never moved the stick (the browser's click: a tap, never a drag) is a tap on the street behind;
  // a second finger's click, or a press a second finger joined, is not (G674).
  zone.addEventListener('click', (e) => {
    const ready = tapReady && stickId == null && !others.size && isTapThrough({ moved, ms: e.timeStamp - downAt });
    tapReady = false;
    if (ready) tapThrough?.(e.clientX, e.clientY);
  });

  let jumpId = null;
  const endJump = () => {
    if (jumpId == null) return;
    jumpId = null;
    release(' ');
    jumpBtn.classList.remove('is-held');
  };
  jumpBtn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    jumpId = e.pointerId;
    try { jumpBtn.setPointerCapture(e.pointerId); } catch { /* a synthetic pointer */ }
    jumpBtn.classList.add('is-held');
    press(' ');
    jump();
    try { win.navigator?.vibrate?.(8); } catch { /* no haptics */ }
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    jumpBtn.addEventListener(type, (e) => { if (e.pointerId === jumpId) endJump(); });
  }
  // The button never takes focus or a click of its own (Space on a focused button would press it).
  jumpBtn.addEventListener('click', (e) => e.preventDefault());
  // iOS: no long-press callout or text selection on the controls.
  el.addEventListener('contextmenu', (e) => e.preventDefault());

  const releaseAll = () => {
    endStick();
    endJump();
    others.clear();
    tapReady = false;
  };
  win.addEventListener('blur', releaseAll);
  const keyboard = watchPhoneKeyboard({ doc, win });
  return {
    el,
    releaseAll,
    destroy() {
      releaseAll();
      win.removeEventListener('blur', releaseAll);
      keyboard.destroy();
      el.remove();
      doc.documentElement.classList.remove('touch-phone');
    },
  };
}

/** A field the on-screen keyboard opens for. */
export function isTypingField(node) {
  const tag = String(node?.tagName || '').toLowerCase();
  if (tag === 'textarea' || node?.isContentEditable) return true;
  if (tag !== 'input') return false;
  return !/^(button|submit|reset|checkbox|radio|range|color|file|image|hidden)$/i.test(String(node.type || 'text'));
}

/**
 * PURE: whether the on-screen keyboard is up: a typing field has focus and the screen it leaves is
 * under three quarters of the height the page had without it (Android shrinks the window, iOS the
 * visual viewport).
 */
export function keyboardUp({ typing, height, visualHeight, baseHeight }) {
  const base = Number(baseHeight) || 0;
  if (!typing || base <= 0) return false;
  const seen = Math.min(Number(height) || base, Number(visualHeight) || base);
  return seen < base * 0.75;
}

/**
 * The on-screen keyboard on a phone (the mobile QA, 2026-11-12: with chat open the window shrank,
 * and the pack row jumped up to the middle of the screen with the stick and Jump beside it).
 * While it is up, html.kbd-up (style.css TOUCH) puts away the pack row (unless you type in its
 * search) and the stick and Jump; when it goes, iOS's leftover page scroll is put back to the top.
 */
export function watchPhoneKeyboard({ doc = globalThis.document, win = globalThis.window } = {}) {
  const html = doc?.documentElement;
  if (!html || !win) return { destroy() {} };
  const vv = win.visualViewport || null;
  let base = Number(win.innerHeight) || 0;
  const typing = () => isTypingField(doc.activeElement);
  const sync = () => {
    const h = Number(win.innerHeight) || 0;
    if (!typing()) base = Math.max(h, Number(vv?.height) || 0);
    const up = keyboardUp({ typing: typing(), height: h, visualHeight: vv?.height, baseHeight: base });
    if (html.classList.contains('kbd-up') !== up) html.classList.toggle('kbd-up', up);
  };
  const settle = () => {
    // After the field lets go: the keyboard closes and iOS can leave the page scrolled up.
    win.setTimeout(() => {
      sync();
      if (!typing() && (win.scrollY || win.pageYOffset)) win.scrollTo(0, 0);
    }, 120);
  };
  const onFocusIn = () => win.setTimeout(sync, 300);
  win.addEventListener('resize', sync);
  vv?.addEventListener?.('resize', sync);
  doc.addEventListener('focusin', onFocusIn);
  doc.addEventListener('focusout', settle);
  return {
    sync,
    destroy() {
      win.removeEventListener('resize', sync);
      vv?.removeEventListener?.('resize', sync);
      doc.removeEventListener('focusin', onFocusIn);
      doc.removeEventListener('focusout', settle);
      html.classList.remove('kbd-up');
    },
  };
}


let insetProbe = null;
/** The screen's safe-area insets in CSS px (env(safe-area-inset-*); 0 where there are none). */
export function safeAreaInsets(doc = globalThis.document) {
  const zero = { top: 0, right: 0, bottom: 0, left: 0 };
  if (!doc?.body) return zero;
  if (!insetProbe || !insetProbe.isConnected) {
    insetProbe = doc.createElement('div');
    insetProbe.setAttribute('aria-hidden', 'true');
    insetProbe.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;'
      + 'padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)';
    doc.body.appendChild(insetProbe);
  }
  const cs = doc.defaultView?.getComputedStyle?.(insetProbe);
  if (!cs) return zero;
  const px = (v) => Number.parseFloat(v) || 0;
  return { top: px(cs.paddingTop), right: px(cs.paddingRight), bottom: px(cs.paddingBottom), left: px(cs.paddingLeft) };
}

/**
 * PURE: the box a phone's screen-anchored pills (the tutorial's "Tutorial · <stage>") measure from:
 * the screen inside its safe area, never the stage's letterboxed top.
 */
export function phoneScreenFrame(width, height, safe = {}) {
  const l = Number(safe.left) || 0;
  const t = Number(safe.top) || 0;
  const r = Number(safe.right) || 0;
  const b = Number(safe.bottom) || 0;
  return { left: l, top: t, width: Math.max(0, width - l - r), height: Math.max(0, height - t - b) };
}
