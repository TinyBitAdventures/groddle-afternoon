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
 * Builds the stick and the Jump button into `root` (the game's wrap) and wires them.
 * press(key) / release(key): the held keys (game.js `keys`); jump(): a jump's edge.
 * Returns { el, releaseAll, destroy }.
 */
export function installTouchControls({ root, press, release, jump, doc = globalThis.document, win = globalThis.window } = {}) {
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
    if (stickId != null) return;
    e.preventDefault();
    stickId = e.pointerId;
    origin = { x: e.clientX, y: e.clientY };
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
    hold(stickKeys(dx, dy));
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    zone.addEventListener(type, (e) => { if (e.pointerId === stickId) endStick(); });
  }

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
  };
  win.addEventListener('blur', releaseAll);
  return {
    el,
    releaseAll,
    destroy() {
      releaseAll();
      win.removeEventListener('blur', releaseAll);
      el.remove();
      doc.documentElement.classList.remove('touch-phone');
    },
  };
}
