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
 * QA: ?autostart=1&camerademo=1 opens it (&cameraskill=1 grants Eyeballery,
 * &cameralook=x,y pans). Canvas data: cameraMode, cameraLookX, cameraLookY,
 * cameraRange.
 */

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

/** Step a look offset by held directions over dtMs, within the range. */
export function stepLook(look, dirs, dtMs, range) {
  const step = PAN_SPEED * Math.max(0, Math.min(100, dtMs));
  const clampTo = (v) => Math.max(-range, Math.min(range, v));
  return { x: clampTo(look.x + dirs.x * step), y: clampTo(look.y + dirs.y * step) };
}

const held = new Set();
let active = false;
let look = { x: 0, y: 0 };
let listeners = null;
let overlay = null;

function blocked(engine) {
  return engine.busy() || engine.acting() || engine.inScene() || Boolean(engine.instanceHold) || engine.transientInstance?.();
}

function showOverlay(on, range) {
  if (typeof document === 'undefined') return;
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.className = 'camera-mode';
    overlay.setAttribute('role', 'status');
    overlay.innerHTML = `
      <div class="camera-mode-frame" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
      <span class="camera-mode-reticle" aria-hidden="true"></span>
      <p class="camera-mode-label"><b>Camera Mode</b> <span data-camera-hint></span></p>`;
    (document.getElementById('game-root') || document.body).appendChild(overlay);
  }
  overlay.hidden = !on;
  const hint = overlay.querySelector('[data-camera-hint]');
  if (hint) {
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
  showOverlay(on, cameraRange(engine.learnedSkills));
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
    if (k === 'c' && !e.metaKey && !e.ctrlKey && !e.altKey) {
      if (!active && blocked(engine)) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      setActive(engine, !active);
      return;
    }
    if (!active) return;
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
}

export const cameraModeFeature = {
  id: CAMERA_FEATURE_ID,

  init(engine) {
    attach(engine);
    publish(engine);
  },

  onStreetEnter(street, engine) {
    if (active) setActive(engine, false);
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
  },

  physics() {
    return active ? { speed: 0, jump: 0 } : null;
  },

  onTick(dtMs, now, engine) {
    if (!active) return;
    // Anything that takes over the screen ends Camera Mode.
    if (engine.busy() || engine.acting()) {
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
