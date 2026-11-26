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
 * - Act beside Jump (#327, G756): the Enter key's press (game.js act: the menu of the thing in
 *   reach, or the chooser when several are), for a sign or an animal that scenery or the HUD hides.
 * - A tap on the street (game.js, the canvas's pointerdown) opens the thing's verb menu as a
 *   click does, walks to empty ground (js/user-path.js, the street map's walk) and climbs a
 *   tapped ladder to where it was tapped.
 * Both sit under every panel (z-hud), outside the safe area, and take only their own touches, so
 * a panel's scrolling and a tap on the world never reach them.
 * - FLOAT STICK (Friendly's idea; Austin 2026-11-13: an option, off by default): "Stick follows your
 *   thumb" in the Menu's Settings group, kept on this device. On, the stick's corner grows to the
 *   lower left of the street (style.css LANDSCAPE-PANELS, data-float on #touch-controls): a thumb
 *   anywhere there places the stick and drags from it, and a quick tap there acts on the street as a
 *   tap anywhere else does (the thing under it, or a walk to that spot). No stick rests in the corner
 *   while it is on: the ring shows where the thumb lands and goes on release (style.css, not .is-held).
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

/** FLOAT STICK: where the choice is kept (this device only, like the zoom), and its words. */
export const FLOAT_STICK_STORAGE_KEY = 'groddle.floatStick';
export const FLOAT_STICK_EVENT = 'groddle:float-stick';
export const FLOAT_STICK_DEFAULT = false;
export const FLOAT_STICK_LABEL = 'Stick follows your thumb';
export const FLOAT_STICK_HINT = 'Put your thumb down anywhere low on the left to walk from there.';

/** PURE: the stored words as on (true) or off (false); anything else is the default (off). */
export function parseFloatStick(v) {
  if (v === 'on' || v === true || v === '1' || v === 'true') return true;
  if (v === 'off' || v === false || v === '0' || v === 'false') return false;
  return FLOAT_STICK_DEFAULT;
}

/**
 * FLOAT STICK: the setting for one window: { get, set, onChange }. set() stores it (try/catch: a
 * private window), tells the listeners and sends groddle:float-stick.
 */
export function createFloatStick({ win = globalThis, storage } = {}) {
  const store = storage !== undefined ? storage : (() => { try { return win?.localStorage; } catch { return null; } })();
  let on = FLOAT_STICK_DEFAULT;
  try { on = parseFloatStick(store?.getItem?.(FLOAT_STICK_STORAGE_KEY) ?? null); } catch { /* the default */ }
  const listeners = new Set();
  return {
    get: () => on,
    set(v) {
      const next = Boolean(v);
      if (next === on) return on;
      on = next;
      try { store?.setItem?.(FLOAT_STICK_STORAGE_KEY, on ? 'on' : 'off'); } catch { /* not remembered */ }
      for (const fn of [...listeners]) {
        try { fn(on); } catch (err) { console.error(err); }
      }
      try {
        if (typeof win?.CustomEvent === 'function') win.dispatchEvent(new win.CustomEvent(FLOAT_STICK_EVENT, { detail: { on } }));
      } catch { /* no window events (tests) */ }
      return on;
    },
    onChange(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}

/**
 * FLOAT STICK: its switch, at the foot of the Menu's Settings group (after Zoom, Night tint and Street
 * map, which the top bar puts after Zoom). Returns the row, or null when there is no Menu.
 */
export function installFloatStickSwitch(doc, setting) {
  const settings = doc?.querySelector?.('#more-list [data-menu-group="settings"]');
  if (!settings || !setting || doc.getElementById?.('menu-float-stick')) return null;
  const id = 'menu-float-stick';
  const row = doc.createElement('label');
  row.className = 'hud-toggle menu-float-stick';
  row.htmlFor = id;
  row.dataset.menuControl = 'float-stick';
  const input = doc.createElement('input');
  Object.assign(input, { id, type: 'checkbox' });
  input.setAttribute('role', 'switch');
  input.setAttribute('aria-describedby', `${id}-hint`);
  const words = doc.createElement('span');
  words.textContent = FLOAT_STICK_LABEL;
  const hint = doc.createElement('small');
  hint.id = `${id}-hint`;
  hint.textContent = FLOAT_STICK_HINT;
  row.append(input, words, hint);
  const draw = () => {
    const on = Boolean(setting.get?.());
    input.checked = on;
    input.setAttribute('aria-checked', on ? 'true' : 'false');
  };
  input.addEventListener('change', () => {
    setting.set?.(input.checked);
    draw();
  });
  setting.onChange?.(draw);
  draw();
  settings.append(row);
  settings.hidden = false;
  return row;
}

/**
 * FLOAT STICK (Austin's iPhone, 2026-11-13: "Under settings I just see zoom and Night tint"): the switch
 * went in once, when the controls were built, and gave up when the Menu's Settings group was not there
 * yet. This keeps it there however the Menu is built or rebuilt: it goes in now if it can, when the
 * Settings group appears or is rebuilt (a watch on the page), and again as the Menu opens. One row only
 * (installFloatStickSwitch checks its id). Returns { row(), ensure(), destroy() }.
 */
export function keepFloatStickSwitch(doc, setting, { win = globalThis.window } = {}) {
  if (!doc || !setting) return { row: () => null, ensure: () => null, destroy() {} };
  let row = null;
  // The switch's input holds the id; the row is its label.
  const current = () => {
    const input = doc.getElementById?.('menu-float-stick');
    return input ? input.closest?.('.menu-float-stick') || input : null;
  };
  const ensure = () => {
    const there = current();
    // A rebuilt Settings group dropped the old row (or it never went in): put it back.
    if (there && there.isConnected !== false) return (row = there);
    row = installFloatStickSwitch(doc, setting) || null;
    return row;
  };
  ensure();
  // The watch: the Menu's list once it is there (the page's own changes never wake it), the page until then.
  let watch = null;
  let watching = null;
  const Observer = win?.MutationObserver || globalThis.MutationObserver;
  const look = () => {
    const list = doc.getElementById?.('more-list') || null;
    const settings = doc.querySelector?.('#more-list [data-menu-group="settings"]');
    if (settings && !settings.querySelector?.('#menu-float-stick')) ensure();
    const target = list || doc.body || doc.documentElement;
    if (watch && target && target !== watching) {
      watch.disconnect();
      watch.observe(target, { childList: true, subtree: true });
      watching = target;
    }
  };
  if (typeof Observer === 'function') {
    watch = new Observer(look);
    look();
  }
  // The Menu opening: the last chance before a player looks (capture, ahead of the Menu's own click).
  const onOpen = (e) => {
    if (!e?.target?.closest?.('#more-btn')) return;
    ensure();
    if (watch) look();
  };
  doc.addEventListener?.('click', onOpen, true);
  return {
    row: () => row,
    ensure,
    destroy() {
      watch?.disconnect?.();
      doc.removeEventListener?.('click', onOpen, true);
      (current() || row)?.remove?.();
      row = null;
    },
  };
}

/**
 * ACTPRESS (Austin 2026-11-15): a drag on Act moves a menu's highlight one row per this many CSS px
 * up or down (a little under the 40 px a verb row stands on a phone, so a thumb walks the rows as it
 * passes them).
 */
export const ACT_DRAG_STEP = 32;
/** Sideways this far (CSS px) from where Act was pressed lets go without choosing. */
export const ACT_CANCEL_X = 90;
/** Act's words while a menu is open (the cue that a tap there chooses). */
export const ACT_CHOOSE_LABEL = 'Choose';
/** How often (ms) Act looks whether a menu is open, for its words. */
export const ACT_MENU_WATCH_MS = 150;

/**
 * PURE: what a drag on Act means, from where it was pressed (dx right, dy down, CSS px): the rows it
 * has stepped (down positive, toward zero, so a thumb must pass a whole step), or a cancel.
 * @returns {{ steps: number, cancel: boolean }}
 */
export function actDragPlan(dx, dy, { step = ACT_DRAG_STEP, cancelX = ACT_CANCEL_X } = {}) {
  const x = Number(dx) || 0;
  const y = Number(dy) || 0;
  if (Math.abs(x) >= cancelX) return { steps: 0, cancel: true };
  return { steps: Math.trunc(y / step) || 0, cancel: false };
}

/** Whether `el` holds the capture of pointer `id` (undefined where the browser cannot say). */
function hasCapture(el, id) {
  try { return typeof el?.hasPointerCapture === 'function' ? el.hasPointerCapture(id) : undefined; } catch { return undefined; }
}

/**
 * #679: whether a control's press (pointer `heldId`) is over when a new press `e` lands on it, though
 * its lift was never heard: its own pointer id went down again, the new press is the primary one (a
 * touch is primary only when no other finger is down; a mouse or pen has one pointer), or the capture
 * the press took (`captured`) has gone from `el`.
 */
export function pressIsOver(e, heldId, captured = false, el = null) {
  if (heldId == null) return true;
  if (e?.pointerId === heldId) return true;
  if (e?.isPrimary === true) return true;
  return Boolean(captured) && hasCapture(el, heldId) === false;
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
 * Builds the stick and the Jump and Act buttons into `root` (the game's wrap) and wires them.
 * press(key) / release(key): the held keys (game.js `keys`); jump(): a jump's edge; act(): Enter;
 * actMenu(): the open menu Act drives ({ step(n), choose() }), or null (ACTPRESS).
 * Returns { el, releaseAll, releaseStick, destroy }.
 */
export function installTouchControls({ root, press, release, jump, act = null, actMenu = null, tapThrough = null, floatStick = null, doc = globalThis.document, win = globalThis.window } = {}) {
  if (!root || !doc) return null;
  const el = doc.createElement('div');
  el.id = 'touch-controls';
  el.className = 'touch-controls';
  el.innerHTML = `
    <div class="touch-stick" data-touch-stick aria-hidden="true"><span class="touch-stick-base"><span class="touch-stick-knob"></span></span></div>
    <button type="button" class="touch-act" data-touch-act aria-label="Act on what is nearby">Act</button>
    <button type="button" class="touch-jump" data-touch-jump aria-label="Jump">Jump</button>`;
  root.appendChild(el);
  doc.documentElement.classList.add('touch-phone');
  // #653: the iOS Home Screen app (navigator.standalone is iOS only) clears the system's top fade (style.css --safe-t).
  if (win?.navigator?.standalone === true) doc.documentElement.classList.add('ios-home-app');
  const zone = el.querySelector('[data-touch-stick]');
  const base = el.querySelector('.touch-stick-base');
  const knob = el.querySelector('.touch-stick-knob');
  const jumpBtn = el.querySelector('[data-touch-jump]');
  const actBtn = el.querySelector('[data-touch-act]');
  // FLOAT STICK: the corner grows while the setting is on (style.css, data-float).
  const drawFloat = () => {
    if (floatStick?.get?.()) el.dataset.float = 'on';
    else delete el.dataset.float;
  };
  drawFloat();
  const offFloat = floatStick?.onChange?.(drawFloat);
  const floatSwitch = keepFloatStickSwitch(doc, floatStick, { win });

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
  // #679: whether the stick took its finger's capture, so a capture gone with no lift heard says the press is over.
  let stickCaptured = false;
  zone.addEventListener('pointerdown', (e) => {
    if (stickId != null) {
      // #679 (iPhone, the loading card): the press before ended where nothing heard its lift, and a stick
      // still "held" took every new press for a second finger. A press is over when its own pointer id
      // goes down again, when the new press is the primary one (no other finger is down), or when the
      // capture it took has gone; then the new press takes the stick.
      if (pressIsOver(e, stickId, stickCaptured, zone)) {
        endStick();
        others.clear();
      } else {
        if (e.pointerId !== stickId) {
          e.preventDefault();
          e.stopPropagation();
          others.add(e.pointerId);
          multi = true;
        }
        return;
      }
    }
    // A primary press: no other finger is down, so any kept as "others" lifted where nothing heard it.
    if (e.isPrimary === true) others.clear();
    if (others.has(e.pointerId)) return;
    e.preventDefault();
    stickId = e.pointerId;
    origin = { x: e.clientX, y: e.clientY };
    moved = false;
    multi = others.size > 0;
    tapReady = false;
    downAt = e.timeStamp;
    try { zone.setPointerCapture(e.pointerId); } catch { /* a synthetic pointer */ }
    stickCaptured = hasCapture(zone, e.pointerId) === true;
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
      // Whichever ends the press first (WebKit can send pointercancel before pointerup on a tap; the
      // click that follows says it was one): a quick press that never steered, with no second finger.
      if (origin) tapReady = !multi && isTapThrough({ moved, ms: e.timeStamp - downAt });
      endStick();
    });
  }
  // The mobile QA (2026-11-12): a chicken under the stick's corner could not be tapped. A quick tap
  // that never moved the stick (the browser's click: a tap, never a drag) is a tap on the street behind;
  // a second finger's click, or a press a second finger joined, is not (G674).
  zone.addEventListener('click', (e) => {
    const ready = tapReady && stickId == null && !others.size && isTapThrough({ moved, ms: e.timeStamp - downAt });
    tapReady = false;
    if (ready) tapThrough?.(e.clientX, e.clientY, { float: el.dataset.float === 'on' });
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
  // Act: one press is one Enter (a held thumb does not repeat it). ACTPRESS: with a menu open, Act
  // drives it (actMenu: the open menu's { step(n), choose() }, or null): a tap chooses the lit row,
  // a drag up or down steps it a row per ACT_DRAG_STEP, and the lift after a drag chooses. A press
  // with no menu opens one as before, and the same finger can drag on into it. Sideways a long way
  // (ACT_CANCEL_X), a second finger or the browser's cancel lets go without choosing.
  let actPress = null;
  const actMenuNow = () => { try { return actMenu?.() || null; } catch (err) { console.error(err); return null; } };
  const drawActMenu = () => {
    if (!actBtn) return;
    const open = Boolean(actMenuNow());
    if ((actBtn.dataset.menu === 'open') === open) return;
    if (open) actBtn.dataset.menu = 'open';
    else delete actBtn.dataset.menu;
    actBtn.textContent = open ? ACT_CHOOSE_LABEL : 'Act';
    actBtn.setAttribute('aria-label', open ? 'Choose the lit row; drag up or down to move it' : 'Act on what is nearby');
  };
  const endAct = (choose) => {
    const p = actPress;
    actPress = null;
    actBtn?.classList.remove('is-held');
    if (p) try { actBtn.releasePointerCapture?.(p.id); } catch { /* already let go */ }
    if (choose && p && !p.cancelled && (p.steps !== 0 || p.dragged || !p.opened)) actMenuNow()?.choose?.();
    drawActMenu();
  };
  actBtn?.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    // A WebKit cancel whose click never came: that press is over.
    if (actPress?.cancelPending) endAct(false);
    // #679: a press whose lift nothing heard (the stick's note above) is over too.
    if (actPress && pressIsOver(e, actPress.id, actPress.captured, actBtn)) endAct(false);
    if (actPress) {
      // A second finger on Act: the press lets go without choosing.
      if (e.pointerId !== actPress.id) actPress.cancelled = true;
      return;
    }
    actBtn.classList.add('is-held');
    const had = actMenuNow();
    const press = { id: e.pointerId, x: e.clientX, y: e.clientY, steps: 0, dragged: false, opened: !had, ready: Boolean(had), cancelled: false, cancelPending: false };
    actPress = press;
    try { actBtn.setPointerCapture(e.pointerId); } catch { /* a synthetic pointer */ }
    press.captured = hasCapture(actBtn, e.pointerId) === true;
    if (!had) {
      act?.();
      // A menu this press opened lights its first row on the next frame (game.js openVerbMenu, the
      // chooser's show): the drag steps from there, so it waits for that frame (asked for after it).
      win.requestAnimationFrame?.(() => { press.ready = true; });
    }
    drawActMenu();
    try { win.navigator?.vibrate?.(8); } catch { /* no haptics */ }
  });
  actBtn?.addEventListener('pointermove', (e) => {
    const p = actPress;
    if (!p || e.pointerId !== p.id || p.cancelled) return;
    e.preventDefault();
    const plan = actDragPlan(e.clientX - p.x, e.clientY - p.y);
    if (plan.cancel) {
      p.cancelled = true;
      actBtn.classList.remove('is-held');
      return;
    }
    if (plan.steps === p.steps || !p.ready) return;
    const menu = actMenuNow();
    if (!menu) return;
    menu.step?.(plan.steps - p.steps);
    p.steps = plan.steps;
    p.dragged = true;
    try { win.navigator?.vibrate?.(4); } catch { /* no haptics */ }
  });
  actBtn?.addEventListener('pointerup', (e) => { if (actPress && e.pointerId === actPress.id) endAct(true); });
  // WebKit can end a tap with pointercancel before its click (the stick's note above): a still press
  // waits for that click; anything else is a cancel.
  actBtn?.addEventListener('pointercancel', (e) => {
    const p = actPress;
    if (!p || e.pointerId !== p.id) return;
    if (!p.cancelled && !p.dragged && !p.opened) p.cancelPending = true;
    else endAct(false);
  });
  actBtn?.addEventListener('lostpointercapture', (e) => {
    const p = actPress;
    if (p && e.pointerId === p.id && !p.cancelPending) endAct(false);
  });
  actBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    if (actPress?.cancelPending) endAct(true);
  });
  // A second finger anywhere else (a pinch, a tap on the street) while Act drags: no choice.
  const onOtherFinger = (e) => {
    if (actPress && e.pointerId !== actPress.id && e.target !== actBtn) actPress.cancelled = true;
  };
  doc.addEventListener?.('pointerdown', onOtherFinger, true);
  // The cue (Act reads Choose while a menu is open) follows menus that open and close by other ways.
  let actMenuWatch = 0;
  const watchActMenu = () => {
    drawActMenu();
    actMenuWatch = win.setTimeout?.(watchActMenu, ACT_MENU_WATCH_MS) || 0;
  };
  if (actBtn && actMenu) watchActMenu();
  // iOS: no long-press callout or text selection on the controls.
  el.addEventListener('contextmenu', (e) => e.preventDefault());

  const releaseAll = () => {
    endStick();
    endJump();
    if (actPress) endAct(false);
    others.clear();
    tapReady = false;
  };
  // #679: a lift or cancel heard anywhere on the page ends the press it belongs to (bubbling, so the
  // control's own listener, which knows a tap, runs first; a WebKit cancel waiting for its click waits).
  const onLiftAnywhere = (e) => {
    if (stickId != null && e.pointerId === stickId) {
      tapReady = false;
      endStick();
    }
    if (actPress && e.pointerId === actPress.id && !actPress.cancelPending) endAct(false);
  };
  doc.addEventListener?.('pointerup', onLiftAnywhere);
  doc.addEventListener?.('pointercancel', onLiftAnywhere);
  // #679: the page hidden or left (the phone locked, the app switched) lets go, as the window's blur does.
  const onHidden = () => { if (doc.visibilityState === 'hidden') releaseAll(); };
  doc.addEventListener?.('visibilitychange', onHidden);
  win.addEventListener('pagehide', releaseAll);
  win.addEventListener('blur', releaseAll);
  const keyboard = watchPhoneKeyboard({ doc, win });
  return {
    el,
    releaseAll,
    /**
     * #679 (Austin 2026-11-25): a held stick stops at a new street. Its keys let go and the finger still
     * down holds nothing more; walking again takes a new press.
     */
    releaseStick() {
      tapReady = false;
      endStick();
    },
    destroy() {
      releaseAll();
      win.removeEventListener('blur', releaseAll);
      win.removeEventListener('pagehide', releaseAll);
      doc.removeEventListener?.('visibilitychange', onHidden);
      doc.removeEventListener?.('pointerup', onLiftAnywhere);
      doc.removeEventListener?.('pointercancel', onLiftAnywhere);
      doc.removeEventListener?.('pointerdown', onOtherFinger, true);
      if (actMenuWatch) win.clearTimeout?.(actMenuWatch);
      keyboard.destroy();
      if (typeof offFloat === 'function') offFloat();
      floatSwitch?.destroy?.();
      el.remove();
      doc.documentElement.classList.remove('touch-phone', 'ios-home-app');
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
 * PURE: the box the screen leaves above the on-screen keyboard, in the game root's px (landscape audit
 * #5): `top` and `height` are the visual viewport's (iOS keeps the window and shrinks it; Android
 * shrinks the window too), `top` its page top (visualViewport.pageTop), `rootTop` the game root's
 * page top (its box's top plus the page's scroll; #368), `gap` the margin kept all round.
 * @returns {{ top: number, height: number }}
 */
export function keyboardBox({ top = 0, height = 0, innerHeight = 0, rootTop = 0, gap = 4 } = {}) {
  const h = Math.min(Number(height) || 0, Number(innerHeight) || Number(height) || 0);
  return {
    top: Math.round(Math.max(0, Number(top) || 0) - (Number(rootTop) || 0) + gap),
    height: Math.round(Math.max(0, h - 2 * gap)),
  };
}

/**
 * The on-screen keyboard on a phone (the mobile QA, 2026-11-12: with chat open the window shrank,
 * and the pack row jumped up to the middle of the screen with the stick and Jump beside it).
 * While it is up, html.kbd-up (style.css TOUCH) puts away the pack row (unless you type in its
 * search) and the stick and Jump; when it goes, iOS's leftover page scroll is put back to the top.
 * Landscape audit #5: the Social drawer kept its 220 px and its chat box sat under the keyboard. While
 * it is up, --kbd-top and --kbd-h on html are the box above it (keyboardBox, from the visual viewport,
 * kept on its resize and scroll), and the drawer you type in fits that box (style.css LANDSCAPE-PANELS).
 */
export function watchPhoneKeyboard({ doc = globalThis.document, win = globalThis.window } = {}) {
  const html = doc?.documentElement;
  if (!html || !win) return { destroy() {} };
  const vv = win.visualViewport || null;
  let base = Number(win.innerHeight) || 0;
  const typing = () => isTypingField(doc.activeElement);
  const pin = (up) => {
    const style = html.style;
    if (!style?.setProperty) return;
    if (!up) {
      style.removeProperty('--kbd-top');
      style.removeProperty('--kbd-h');
      return;
    }
    // #368/#370: both in page px. Safari measures the root from the view it has scrolled to show the
    // field, so the root's own top already holds that scroll, and adding the view's offsetTop to it
    // counted the scroll twice (the window sat a scroll's height too low, under the keyboard).
    const scrolled = Number(win.scrollY ?? win.pageYOffset) || 0;
    const rootTop = (Number(doc.getElementById?.('game-root')?.getBoundingClientRect?.().top) || 0) + scrolled;
    const pageTop = Number.isFinite(vv?.pageTop) ? vv.pageTop : (Number(vv?.offsetTop) || 0) + scrolled;
    const box = keyboardBox({ top: pageTop, height: vv?.height ?? win.innerHeight, innerHeight: win.innerHeight, rootTop });
    style.setProperty('--kbd-top', `${box.top}px`);
    style.setProperty('--kbd-h', `${box.height}px`);
  };
  const sync = () => {
    const h = Number(win.innerHeight) || 0;
    if (!typing()) base = Math.max(h, Number(vv?.height) || 0);
    const up = keyboardUp({ typing: typing(), height: h, visualHeight: vv?.height, baseHeight: base });
    if (html.classList.contains('kbd-up') !== up) html.classList.toggle('kbd-up', up);
    pin(up);
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
  vv?.addEventListener?.('scroll', sync);
  doc.addEventListener('focusin', onFocusIn);
  doc.addEventListener('focusout', settle);
  return {
    sync,
    destroy() {
      win.removeEventListener('resize', sync);
      vv?.removeEventListener?.('resize', sync);
      vv?.removeEventListener?.('scroll', sync);
      doc.removeEventListener('focusin', onFocusIn);
      doc.removeEventListener('focusout', settle);
      html.classList.remove('kbd-up');
      pin(false);
    },
  };
}


let insetProbe = null;
/**
 * The screen's safe area in CSS px as the layout keeps it (style.css LANDSCAPE-HUD --safe-*: the
 * env(safe-area-inset-*) insets, and upright on a phone the status bar's fade too); 0 where there are none.
 */
export function safeAreaInsets(doc = globalThis.document) {
  const zero = { top: 0, right: 0, bottom: 0, left: 0 };
  if (!doc?.body) return zero;
  if (!insetProbe || !insetProbe.isConnected) {
    insetProbe = doc.createElement('div');
    insetProbe.setAttribute('aria-hidden', 'true');
    insetProbe.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;'
      + 'padding:var(--safe-t,0px) var(--safe-r,0px) var(--safe-b,0px) var(--safe-l,0px)';
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
