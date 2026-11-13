/**
 * Camera Mode: press C to look around the street without moving.
 *
 * Source: players/player.js getCameraAbilities. Every Glitch could enter
 * Camera Mode; the view moved up to 400 px from the avatar in x and y, or
 * across the whole location with Eyeballery (eyeballery_1, inc_skills.js
 * camera_skills). Taking snapshots needed the Snapshottery upgrade, a feature
 * retired before shutdown (the snapshot quests are removed_feature), so this
 * is the looking part only.
 *
 * Arrows / WASD pan while the avatar stays put; C or Esc returns. The engine
 * keeps the view inside the street (engine.setCameraLook). Quest rooms are
 * skipped: Vision Quest runs its own Camera Mode.
 *
 * Multiplayer (G332, features/snaps-feature.js): Snapshottery itself was live
 * at shutdown (glitchlog 2012-09-19: "you just need the upgrade"; it was the
 * snapshot quests that went), so with the card Enter takes a Snap there:
 * this feature asks `cameraSnap` (engine, { end }) on Enter and
 * `cameraSnapHint` (engine, range) for the line under "Camera Mode". Solo
 * answers neither and stays the looking part only.
 *
 * G387 (main.js doCameraModeStarted 6853-6868, doCameraModeEnded 6896-6899):
 * everyone else on the street sees Tiny Speck's eyeballing bubble over a
 * Glitch in Camera Mode (pc_overlay, 50 x 50, 110 px up, until it ends; never
 * to the one looking). Online, entering and leaving send the words
 * 'eyeballing' / 'eyeballing_done' on the emote message (js/realtime-client.js
 * OVERLAY_EMOTES), and each other client draws or drops the bubble over that
 * player (realtime-feature remoteAvatar). Solo has nobody else to see it.
 *
 * #271 (Friendly, iPhone, 2026-11-13: "Is there a way to enter camera mode without a keyboard?"):
 * on a phone (window.GRODDLE_DEVICE === 'phone') the Menu's World group has a Camera Mode row
 * (#menu-camera-btn, js/ui/topbar.js MENU_ROWS) that turns it on. While it is on, one finger
 * dragged on the street moves the look (dragLook: the street follows the finger, within the same
 * range), two fingers still pinch the zoom (js/touch-pinch.js), and a Done button under the label
 * ends it. The stick and Jump step aside meanwhile (html.camera-mode-on, style.css): they hold the
 * game's own keys, which would climb a ladder while the view is away. The client's Camera Mode was
 * keyboard only (C, TSFrontController.as maybeStartCameraManUserMode); the touch way in is ours.
 * Computers are unchanged.
 *
 * QA: ?autostart=1&camerademo=1 opens it (&cameraskill=1 grants Eyeballery,
 * &cameralook=x,y pans; &eyeballdemo=1 also draws the bubble over your own
 * Glitch, as the others would see it). Canvas data: cameraMode, cameraLookX,
 * cameraLookY, cameraRange, cameraEyeballing (players drawn with the bubble),
 * cameraEyeballSent.
 */

import { textureFromUrl } from '../textures.js?v=814d7926';
import { OVERLAY_BUBBLE_URL, OVERLAY_USES, overlayBubbleBox, playOverlay } from '../overlays.js?v=8ebf1499';
import { SPEECH_BUBBLE_Z } from '../fx-z.js?v=18dda7e3';
import { isPhoneDevice } from '../touch-controls.js?v=b6071ea4';

export const CAMERA_FEATURE_ID = 'camera-mode';
/** getCameraAbilities: range without Eyeballery, px from the avatar. */
export const CAMERA_RANGE = 400;
export const EYEBALLERY_SKILL = 'eyeballery_1';
/** Pan speed, px per ms (a street-width sweep in a few seconds). */
const PAN_SPEED = 0.6;

const PAN_KEYS = {
  arrowleft: [-1, 0], a: [-1, 0],
  arrowright: [1, 0], d: [1, 0],
  arrowup: [0, -1], w: [0, -1],
  arrowdown: [0, 1], s: [0, 1],
};

/** The pan limit for a player: 400 px, or unlimited with Eyeballery. */
export function cameraRange(learned = []) {
  return Array.isArray(learned) && learned.includes(EYEBALLERY_SKILL) ? Infinity : CAMERA_RANGE;
}

/** #271: the phone's words under "Camera Mode" (no keys there: a drag looks, Done returns). */
export const CAMERA_PHONE_COPY = Object.freeze({
  row: 'Camera Mode',
  done: 'Done',
  doneLabel: 'Leave Camera Mode',
  hint: 'Drag to look',
  hintRange: 'Drag to look · Eyeballery lets you look across the whole street',
});

/** The phone Menu's row (#271). */
export const CAMERA_MENU_ID = 'menu-camera-btn';

/**
 * PURE (#271): a one-finger drag on a phone. The street follows the finger, so the look moves the
 * other way: dx, dy are CSS px the finger moved, scale the world px per CSS px (the view's width
 * over the canvas's), held within the range as the keys are.
 */
export function dragLook(look, dx, dy, scale, range) {
  const k = Number(scale) > 0 ? Number(scale) : 1;
  const clampTo = (v) => Math.max(-range, Math.min(range, v));
  return { x: clampTo(look.x - (Number(dx) || 0) * k), y: clampTo(look.y - (Number(dy) || 0) * k) };
}

/** Step a look offset by held directions over dtMs, within the range. */
export function stepLook(look, dirs, dtMs, range) {
  const step = PAN_SPEED * Math.max(0, Math.min(100, dtMs));
  const clampTo = (v) => Math.max(-range, Math.min(range, v));
  return { x: clampTo(look.x + dirs.x * step), y: clampTo(look.y + dirs.y * step) };
}

const held = new Set();
let active = false;
/** G387: eyeballing bubbles drawn over other players (id -> overlay handle), and the client listened to. */
const eyeballs = new Map();
let eyeballClient = null;
let eyeballOff = null;
let selfEyeball = null;

/**
 * Draw the eyeballing bubble over a Glitch whose feet `at()` gives (main.js 6855-6866: 50 px,
 * delta_y -110, bubble: true): Tiny Speck's thought bubble standing on that point, the eyes
 * centred in its top (overlays.js overlayBubbleBox). Returns the overlay's handle; stop() takes
 * both down.
 */
export function playEyeballing(engine, at, alive = null) {
  const use = OVERLAY_USES.eyeballing;
  const { PIXI } = engine;
  // eyeballing.fla's stage is 50.4 x 27.15, fitted to 50 px (InLocationAnnouncementOverlay.as 425).
  const k = use.wh / 50.4;
  const box = overlayBubbleBox(50.4 * k, 27.15 * k);
  const point = () => { const p = at(); return { x: p.x + use.dx, y: p.y + use.dy }; };
  let bubble = null;
  if (PIXI?.Sprite) {
    bubble = new PIXI.Sprite(textureFromUrl(OVERLAY_BUBBLE_URL, { scale: 4, resolution: 4 }));
    bubble.anchor.set(0.5, 1);
    bubble.width = box.w;
    bubble.height = box.h;
    bubble.alpha = 0;
    bubble.eventMode = 'none';
    bubble.zIndex = SPEECH_BUBBLE_Z;
    bubble.label = 'overlay:eyeballing-bubble';
    engine.fxLayer?.addChild(bubble);
  }
  const place = () => {
    if (!bubble || bubble.destroyed) return;
    const p = point();
    bubble.x = p.x;
    bubble.y = p.y;
  };
  place();
  const handle = playOverlay(PIXI, 'eyeballing', {
    layer: engine.fxLayer,
    at: () => { const p = point(); return { x: p.x, y: p.y - box.artBottom }; },
    wh: use.wh,
    durationMs: use.durationMs,
    loop: use.loop,
    alive,
    onFrame: () => {
      place();
      if (bubble && !bubble.destroyed && handle.sprite) bubble.alpha = handle.sprite.alpha;
    },
  });
  handle.done?.then(() => { if (bubble && !bubble.destroyed) bubble.destroy(); });
  return handle;
}

function dropEyeball(id) {
  eyeballs.get(id)?.stop();
  eyeballs.delete(id);
}

/** Another player entered or left Camera Mode (the client's 'overlay' event). */
export function onEyeballing(engine, { id, e }) {
  if (e === 'eyeballing_done') {
    dropEyeball(id);
  } else if (e === 'eyeballing' && !eyeballs.has(id)) {
    const root = () => engine.query?.('remoteAvatar', id);
    if (!root()) return;
    const h = playEyeballing(engine, () => { const r = root(); return r ? { x: r.x, y: r.y } : { x: 0, y: 0 }; }, () => Boolean(root()));
    eyeballs.set(id, h);
    h.done?.then(() => { if (eyeballs.get(id) === h) eyeballs.delete(id); });
  }
  engine.setData?.('cameraEyeballing', String(eyeballs.size));
}

/** Listen to the realtime client once it exists (and again if it changes). */
function watchEyeballing(engine) {
  const client = engine.mode === 'multiplayer' ? engine.query?.('realtimeClient') : null;
  if (client === eyeballClient) return;
  eyeballOff?.();
  eyeballOff = null;
  for (const id of [...eyeballs.keys()]) dropEyeball(id);
  eyeballClient = client;
  if (client?.on) eyeballOff = client.on('overlay', (msg) => onEyeballing(engine, msg));
}

/** Tell the street (online) that this player started or stopped looking. */
function sendEyeballing(engine, on) {
  const client = engine.mode === 'multiplayer' ? engine.query?.('realtimeClient') : null;
  const sent = Boolean(client?.emote?.(on ? 'eyeballing' : 'eyeballing_done'));
  if (sent) engine.setData('cameraEyeballSent', on ? 'eyeballing' : 'eyeballing_done');
  // QA: &eyeballdemo=1 shows your own bubble, as the others see it.
  if (engine.param?.('eyeballdemo') === '1') {
    selfEyeball?.stop();
    selfEyeball = on ? playEyeballing(engine, () => ({ x: engine.player?.x || 0, y: engine.player?.y || 0 })) : null;
  }
}
let look = { x: 0, y: 0 };
let listeners = null;
let overlay = null;
/** #271: Done on the phone's overlay ends Camera Mode (set by attach). */
let onDone = null;

/**
 * The client refused Camera Mode only with no location or a location flagged no_camera_mode
 * (TSFrontController.as maybeStartCameraManUserMode 2064-2078), so quest instances and the rebuilt
 * rooms such as Winter Walk allow it (Austin 2026-10-30). Every archived street that sets the flag
 * sets it false. An instance's arrival or exit still holds it, like any input.
 */
function blocked(engine) {
  return engine.busy({ ignoreHome: true, ignoreInstance: true }) || engine.acting() || Boolean(engine.instanceHold) || Boolean(engine.street?.noCameraMode);
}

/** G231: a house edit mode is open (homes-feature homeEditMode: cultivate or decorate). */
export function homeEditing(engine) {
  return Boolean(engine?.query?.('homeEditMode', engine));
}

function showOverlay(on, range, snapHint = null) {
  if (typeof document === 'undefined') return;
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.className = 'camera-mode';
    overlay.setAttribute('role', 'status');
    overlay.innerHTML = `
      <div class="camera-mode-frame" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
      <span class="camera-mode-reticle" aria-hidden="true"></span>
      <p class="camera-mode-label"><b>Camera Mode</b> <span data-camera-hint></span></p>
      <button type="button" class="camera-mode-done" data-camera-done hidden></button>`;
    const done = overlay.querySelector('[data-camera-done]');
    done.textContent = CAMERA_PHONE_COPY.done;
    done.setAttribute('aria-label', CAMERA_PHONE_COPY.doneLabel);
    done.addEventListener('click', (e) => {
      e.preventDefault();
      onDone?.();
    });
    (document.getElementById('game-root') || document.body).appendChild(overlay);
  }
  overlay.hidden = !on;
  const phone = isPhoneDevice();
  overlay.querySelector('[data-camera-done]').hidden = !phone;
  document.documentElement.classList.toggle('camera-mode-on', Boolean(on && phone));
  const hint = overlay.querySelector('[data-camera-hint]');
  if (hint && phone) {
    // #271: no keys on a phone (a Snap needs Enter, so the snap line waits for a keyboard).
    hint.textContent = Number.isFinite(range) ? CAMERA_PHONE_COPY.hintRange : CAMERA_PHONE_COPY.hint;
  } else if (hint && typeof snapHint === 'string' && snapHint) {
    hint.textContent = snapHint;
  } else if (hint) {
    hint.textContent = Number.isFinite(range)
      ? 'Arrows to look · C to return · Eyeballery lets you look across the whole street'
      : 'Arrows to look · C to return';
  }
}

function setActive(engine, on) {
  if (on === active) return;
  active = on;
  held.clear();
  if (!on) {
    look = { x: 0, y: 0 };
    engine.setCameraLook(0, 0);
  }
  const range = cameraRange(engine.learnedSkills);
  showOverlay(on, range, on ? engine.query?.('cameraSnapHint', engine, range) : null);
  sendEyeballing(engine, on);
  engine.playSound(on ? 'CAMERA_MODE_ON' : 'CAMERA_MODE_OFF', { volume: 0.4 });
  publish(engine);
}

function publish(engine) {
  engine.setData('cameraMode', active ? '1' : '0');
  engine.setData('cameraLookX', String(Math.round(look.x)));
  engine.setData('cameraLookY', String(Math.round(look.y)));
  const range = cameraRange(engine.learnedSkills);
  engine.setData('cameraRange', Number.isFinite(range) ? String(range) : 'street');
}

function attach(engine) {
  if (listeners || typeof window === 'undefined') return;
  const down = (e) => {
    if (e.target?.matches?.('input, textarea, select, [contenteditable="true"]')) return;
    const k = String(e.key || '').toLowerCase();
    // KeyBeacon.as 288-295: with shift held the client fires SHIFT_PLUS_ C, which is
    // cultivation (TSMainView.as 647, 816), not Camera Mode's plain C (G226).
    if (k === 'c' && !e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey) {
      // TSMainView.as cKeyHandler 790-800: in decorator, chassis or cult mode
      // plain C does nothing at all (G231), so it opens neither Camera Mode nor Making.
      if (!active && homeEditing(engine)) {
        e.preventDefault();
        e.stopImmediatePropagation();
        return;
      }
      if (!active && blocked(engine)) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      setActive(engine, !active);
      return;
    }
    if (!active) return;
    // G332: Enter snaps in multiplayer with Snapshottery (CameraManView.as 189, CameraMan.as snap).
    if (k === 'enter' && !e.metaKey && !e.ctrlKey && !e.altKey && engine.query?.('cameraSnap', engine, { end: () => setActive(engine, false) }) === true) {
      e.preventDefault();
      e.stopImmediatePropagation();
      return;
    }
    if (k === 'escape') {
      e.preventDefault();
      e.stopImmediatePropagation();
      setActive(engine, false);
      return;
    }
    // While looking, movement keys pan the view instead of walking.
    if (PAN_KEYS[k] || k === ' ') {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (PAN_KEYS[k]) held.add(k);
    }
  };
  const up = (e) => held.delete(String(e.key || '').toLowerCase());
  const blur = () => held.clear();
  window.addEventListener('keydown', down, true);
  window.addEventListener('keyup', up, true);
  window.addEventListener('blur', blur);
  listeners = { down, up, blur };
  onDone = () => setActive(engine, false);
  if (isPhoneDevice()) attachTouch(engine);
}

/**
 * #271: a phone's way in (the Menu row) and its drag. The row is made once #more-list is there
 * (the bar may come after the feature) and clicks like the Menu's other rows: the Menu closes,
 * then Camera Mode starts where C would start it.
 */
function placeMenuRow(engine) {
  if (typeof document === 'undefined' || document.getElementById(CAMERA_MENU_ID)) return;
  const list = document.getElementById('more-list');
  if (!list) return;
  const row = document.createElement('button');
  row.type = 'button';
  row.id = CAMERA_MENU_ID;
  row.className = 'chrome-btn';
  row.textContent = CAMERA_PHONE_COPY.row;
  row.addEventListener('click', () => {
    const more = document.getElementById('more-btn');
    if (more && !list.hidden) more.click();
    // After the Menu has closed (it holds the avatar while open).
    setTimeout(() => {
      if (!active && !homeEditing(engine) && !blocked(engine)) setActive(engine, true);
      engine.setData?.('cameraMenuRow', active ? 'on' : 'blocked');
    }, 0);
  });
  list.append(row);
}

function attachTouch(engine) {
  placeMenuRow(engine);
  const fingers = new Map();
  const onStreet = (e) => e.pointerType === 'touch' && e.target === engine.canvas;
  window.addEventListener('pointerdown', (e) => {
    if (!onStreet(e)) return;
    fingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  }, true);
  window.addEventListener('pointermove', (e) => {
    const f = fingers.get(e.pointerId);
    if (!f) return;
    const dx = e.clientX - f.x;
    const dy = e.clientY - f.y;
    f.x = e.clientX;
    f.y = e.clientY;
    // One finger looks; two are the pinch's zoom (js/touch-pinch.js).
    if (!active || fingers.size !== 1 || (!dx && !dy)) return;
    const rect = engine.canvas?.getBoundingClientRect?.();
    const cam = engine.camera;
    const scale = rect?.width > 0 && cam?.w > 0 ? cam.w / rect.width : 1;
    const range = cameraRange(engine.learnedSkills);
    const next = dragLook(look, dx, dy, scale, range);
    // As the keys do: the look stops growing once the street's edge holds the view.
    if (next.x < look.x && cam.x <= 0) next.x = look.x;
    if (next.x > look.x && cam.x + cam.w >= engine.worldW) next.x = look.x;
    look = next;
    engine.setCameraLook(look.x, look.y);
    publish(engine);
  }, true);
  const lift = (e) => fingers.delete(e.pointerId);
  window.addEventListener('pointerup', lift, true);
  window.addEventListener('pointercancel', lift, true);
}

export const cameraModeFeature = {
  id: CAMERA_FEATURE_ID,

  init(engine) {
    attach(engine);
    publish(engine);
  },

  onStreetEnter(street, engine) {
    if (active) setActive(engine, false);
    if (isPhoneDevice()) placeMenuRow(engine);
    if (engine.param('camerademo')) {
      if (engine.param('cameraskill') === '1') engine.grantSkill?.(EYEBALLERY_SKILL);
      setTimeout(() => {
        setActive(engine, true);
        const [x, y] = String(engine.param('cameralook') || '').split(',').map(Number);
        if (Number.isFinite(x) || Number.isFinite(y)) {
          const range = cameraRange(engine.learnedSkills);
          look = stepLook({ x: 0, y: 0 }, { x: 0, y: 0 }, 0, range);
          look = { x: Math.max(-range, Math.min(range, x || 0)), y: Math.max(-range, Math.min(range, y || 0)) };
          engine.setCameraLook(look.x, look.y);
          publish(engine);
        }
      }, 600);
    }
  },

  onStreetClear(engine) {
    if (active) setActive(engine, false);
    // The street's other players go with it (their bubbles are cancelled with the street's overlays too).
    for (const id of [...eyeballs.keys()]) dropEyeball(id);
  },

  physics() {
    return active ? { speed: 0, jump: 0 } : null;
  },

  /** MINIMAP (G370): the street map stays out of Camera Mode's picture. */
  cameraModeActive() {
    return active ? true : null;
  },

  onTick(dtMs, now, engine) {
    watchEyeballing(engine);
    if (!active) return;
    // Anything that takes over the screen ends Camera Mode.
    if (engine.busy({ ignoreHome: true, ignoreInstance: true }) || engine.acting()) {
      setActive(engine, false);
      return;
    }
    const dirs = { x: 0, y: 0 };
    for (const k of held) {
      dirs.x += PAN_KEYS[k][0];
      dirs.y += PAN_KEYS[k][1];
    }
    if (!dirs.x && !dirs.y) return;
    dirs.x = Math.sign(dirs.x);
    dirs.y = Math.sign(dirs.y);
    const range = cameraRange(engine.learnedSkills);
    const next = stepLook(look, dirs, dtMs, range);
    // Stop accumulating once the street edge holds the view still.
    const cam = engine.camera;
    if (dirs.x < 0 && cam.x <= 0) next.x = look.x;
    if (dirs.x > 0 && cam.x + cam.w >= engine.worldW) next.x = look.x;
    look = next;
    engine.setCameraLook(look.x, look.y);
    publish(engine);
  },
};
