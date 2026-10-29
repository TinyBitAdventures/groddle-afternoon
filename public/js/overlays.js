/**
 * More of Tiny Speck's overlay animations (register G372-G396), drawn from the
 * CC0 glitch-overlays FLAs by tools/overlays/build.mjs into WebP sheets listed
 * in assets/sprites/overlays/overlays-more.json (the same row shape as
 * overlays.json, so js/overlay-art.js's placement, timing and texture helpers
 * read them).
 *
 * Two players:
 *  - playOverlay: a sheet in the street (pc_overlay, itemstack_overlay,
 *    location_overlay), a Pixi sprite standing on its point (registration
 *    center_bottom, InLocationAnnouncementOverlay.as 448), fitted to `wh`
 *    (ArbitrarySWFView.as 312-343: 0 shows the stage at 1:1).
 *  - playWindowOverlay: a sheet over the location viewport (vp_overlay),
 *    centred on x and its top edge at topY (InWindowAnnouncementOverlay.as
 *    286-295), drawn into a 2D canvas.
 * G441: a row with `vector` (its SVG frames, <key>.frames.json) is drawn from
 * them on a dense screen, at the screen's own density, into one canvas the
 * sprite shows (the 1.25x rainbow sheet was stretched about 3x on a Retina
 * window); the sheet stays for 1x screens and as the fallback.
 * Both fade in over 0.2 s and out over 0.4 s (overlayAlpha), loop the
 * timeline unless the SWF stop()s (loop: false holds the last frame), and
 * join overlay-art's cancel at a street change (trackOverlay, G309).
 *
 * OVERLAY_USES records where the source showed each one (tests hold them to
 * the cited GSJS lines). Not every row is wired: see the register for the
 * ones that wait on a verb, a multiplayer message or Austin.
 */

import {
  OVERLAY_BASE,
  OVERLAY_FADE,
  overlayAlpha,
  overlayFrameAt,
  overlayLifeMs,
  sheetTexture,
  standPlacement,
  stateFrameAt,
  trackOverlay,
} from './overlay-art.js?v=g311-1';

export const MORE_MANIFEST_URL = `${OVERLAY_BASE}overlays-more.json?v=g441-1`;

/** show_rainbow (players/player.js 3014-3029): pc_overlay, 400 x 400 at the avatar, delta 0, 4 s. */
export const RAINBOW = Object.freeze({ wh: 400, durationMs: 4000 });

/**
 * Where the source shows each overlay: type (pc / itemstack / location / vp),
 * wh (the larger of width and height; 0 = 1:1), duration, delta x / y, delay,
 * whether the timeline loops, and the GSJS line.
 */
export const OVERLAY_USES = Object.freeze({
  // G374 players/inc_stats.js 686-699 stats_add_quoins_today (no rainbow in a Paradise location).
  rainbow_100coinstoday: { type: 'pc', ...RAINBOW, dx: 0, dy: 0, loop: false, sound: 'RAINBOW_100COINSTODAY', src: 'players/inc_stats.js 697' },
  rainbow_150coinstoday: { type: 'pc', ...RAINBOW, dx: 0, dy: 0, loop: false, src: 'players/inc_stats.js 695' },
  // G375 items/focusing_orb.js (a full meditation) and the super harvests, 1 s late.
  rainbow_maxrelax: { type: 'pc', ...RAINBOW, dx: 0, dy: 0, loop: false, sound: 'RAINBOW_MAXRELAX', src: 'items/focusing_orb.js 781, 938, 1142, 1302' },
  rainbow_superharvest: { type: 'pc', ...RAINBOW, dx: 0, dy: 0, delayMs: 1000, loop: false, sound: 'RAINBOW_SUPERHARVEST', src: 'items/include/trants.js 293, include/garden.js 501, npc_piggy.js 1604' },
  // G376.
  rainbow_spindoctor: { type: 'pc', ...RAINBOW, dx: 0, dy: 0, loop: false, sound: 'RAINBOW_SPINDOCTOR', src: 'items/npc_spinning_wheel.js 263, 270' },
  rainbow_superdonation: { type: 'pc', ...RAINBOW, dx: 0, dy: 0, loop: false, src: 'items/include/shrines.js 460-461' },
  // G373 items/catalog_buffs.js 412-419 (show_rainbow) and items/fox_bait.js 127-138.
  charades_gameover: { type: 'pc', ...RAINBOW, dx: 0, dy: 0, loop: false, src: 'items/catalog_buffs.js 419' },
  fox_bait_ignite: { type: 'pc', wh: 150, durationMs: 4000, dx: 60, dy: -80, faceDx: true, loop: false, locking: true, src: 'items/fox_bait.js 127-138' },
  // G394 groups/shared_instance_manager.js 672-683, locations/inc_race.js 200-211: vp_overlay x 50%, top_y 50%.
  '321_countdown': { type: 'vp', wh: 350, durationMs: 4000, x: 0.5, topY: 0.5, loop: false, sound: 'COUNT_DOWN', src: 'groups/shared_instance_manager.js 672-683' },
  // G377 locations/inc_rook.js 746-755 (at the attacker, y - 220, 1 s late) and items/include/shrines.js 1078-1087 (y - 200).
  rook_feathers_falling: { type: 'location', wh: 0, durationMs: 3000, dy: -220, delayMs: 1000, loop: false, src: 'locations/inc_rook.js 746-755' },
  // G377 items/dice.js 114-169: two pc_overlays, state spin, 56 px, 6 s, delta_x -20 (left) and 20
  // (right), delta_y -120; overlay_state roll<n> lands on the left die at 1 s and the right at 2 s.
  dice_overlay: { type: 'pc', wh: 56, durationMs: 6000, dx: -20, dy: -120, state: 'spin', rollAfterMs: [1000, 2000], src: 'items/dice.js 114-160' },
  // items/dice_12sided.js 162-229: one 56 px pc_overlay at delta_y -120; roll_<giant> (or roll_rook) at 2 s.
  twelve_sided_die: { type: 'pc', wh: 56, durationMs: 6000, dx: 0, dy: -120, state: 'spin', rollAfterMs: [2000], src: 'items/dice_12sided.js 162-229' },
  // G378 items/musicblock_b_brown_01.js 139-151: 180 x 180 at delta 140, -100, for the block's duration.
  musicblock_notes: { type: 'pc', wh: 180, durationMs: 0, dx: 140, dy: -100, loop: true, src: 'items/musicblock_b_brown_01.js 139-151' },
  // G379 items/petrified_rock_small.js 174-199: pc_overlay, 2 s, locking, delta_y -115 (1:1).
  petrified_rock_open_overlay: { type: 'pc', wh: 0, durationMs: 2000, dx: 0, dy: -115, loop: false, locking: true, src: 'items/petrified_rock_small.js 174-186' },
  // G380 items/fertilidust.js 283-294 and items/fertilidust_lite.js 279-290: on the tree, 300 px, 2 s late.
  target_effect_powder_extreme: { type: 'itemstack', wh: 300, durationMs: 5400, dx: 25, dy: 200, delayMs: 2000, loop: false, src: 'items/fertilidust.js 283-294' },
  target_effect_powder_mild: { type: 'itemstack', wh: 300, durationMs: 4300, dx: 75, dy: 200, delayMs: 2000, loop: false, src: 'items/fertilidust_lite.js 279-290' },
  // G382 items/include/shrines.js 795-817 (click_to_donate on the shrine's top) and 907-924.
  click_to_donate: { type: 'itemstack', wh: 0, durationMs: 0, dx: 0, dy: 0, loop: true, src: 'items/include/shrines.js 795-817' },
  shrine_power_up: { type: 'itemstack', wh: 0, durationMs: 10000, dx: -40, dy: 10, delayMs: 1000, state: 'charge', src: 'items/include/shrines.js 907-924' },
  // G390 locations/inc_rook.js 416-451 sendGlowMsg: at the avatar's feet for the rest of the 15 s orb window.
  avatar_power_up: { type: 'pc', wh: 0, durationMs: 15000, dx: 0, dy: 0, state: 'charge', src: 'locations/inc_rook.js 432-451' },
  // G391 quests/hell_hole.js 104-113: a 75 px right_arrow under the hint, no duration.
  right_arrow: { type: 'vp', wh: 75, durationMs: 0, x: 0.5, topY: 0.15, loop: true, src: 'quests/hell_hole.js 100-113' },
  // G396 players/inc_games.js 872-893 and groups/shared_instance_manager.js 247-257.
  crown_game_indicator_you: { type: 'vp', wh: 140, durationMs: 0, xPx: 70, y: 0.88, loop: false, src: 'players/inc_games.js 873-882' },
  crown_game_indicator_someone_else: { type: 'vp', wh: 100, durationMs: 0, x: 0.94, y: 0.91, loop: false, src: 'players/inc_games.js 884-893' },
  game_of_crowns_throbber: { type: 'vp', wh: 200, durationMs: 0, x: 0.5, y: 0.5, loop: true, src: 'groups/shared_instance_manager.js 247-257' },
});

let manifestPromise = null;

/** overlays-more.json, once (a failed fetch is retried next time). */
export function loadMoreOverlays() {
  manifestPromise ||= fetch(MORE_MANIFEST_URL)
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`overlays-more.json ${r.status}`))))
    .catch((err) => {
      manifestPromise = null;
      throw err;
    });
  return manifestPromise;
}

/** Test seam: use this manifest instead of fetching. */
export function setMoreOverlays(manifest) {
  manifestPromise = manifest ? Promise.resolve(manifest) : null;
}

/** The timeline frame `ms` into an overlay (a state's own frames when it has one). */
export function moreFrameAt(meta, ms, { state = null, loop = true } = {}) {
  return state && meta?.states?.[state] ? stateFrameAt(meta, state, ms) : overlayFrameAt(meta, ms, { loop });
}

/**
 * How long one pass of the timeline lasts (ms), for overlays the source left
 * up for their whole length (duration 0 holds until cancelled; these are
 * given their own length instead).
 */
export function timelineMs(meta) {
  return Math.round(((meta?.frames || 1) * 1000) / (meta?.fps || 30));
}

/**
 * G441: an overlay with SVG frames draws them once the screen asks for more
 * than this many device px per sheet texel (meta.scale texels per stage px).
 */
export const VECTOR_OVER_SHEET = 1.2;
/** The longest side of a vector overlay's canvas (device px). */
export const VECTOR_MAX_SIDE = 2048;

/**
 * Device px per stage px where a street overlay is drawn: its fit to `wh`
 * (0: 1:1) times the renderer's resolution and the layer's own scale.
 */
export function overlayDensity(meta, { wh = 0, resolution = 1, layerScale = 1 } = {}) {
  const [sw, sh] = meta?.stage || [1, 1];
  return (wh > 0 ? wh / Math.max(sw, sh) : 1) * (Number(resolution) > 0 ? Number(resolution) : 1) * (Number(layerScale) > 0 ? Number(layerScale) : 1);
}

/**
 * The density (device px per stage px, in quarter steps, the canvas capped
 * at VECTOR_MAX_SIDE) to draw an overlay's SVG frames at, or 0 when the
 * sheet is sharp enough there (or there are no SVG frames).
 */
export function vectorDensity(meta, density) {
  if (!meta?.vector || !(density > (meta.scale || 1) * VECTOR_OVER_SHEET)) return 0;
  const [, , bw, bh] = meta.box;
  return Math.max(0.25, Math.min(Math.ceil(density * 4), Math.floor((VECTOR_MAX_SIDE / Math.max(bw, bh)) * 4)) / 4);
}

/**
 * The frames of a <key>.frames.json as whole SVGs, each carrying only the
 * shared outlines and ramps it uses (and the ones those use), its root
 * sized w x h so the browser draws it at that size.
 */
export function vectorFrameSvgs(data, w, h) {
  const defs = new Map();
  for (const m of String(data?.defs || '').matchAll(/<(path|linearGradient|radialGradient)\b[^>]*? id="([^"]+)"[^>]*?(?:\/>|>[\s\S]*?<\/\1>)/g)) defs.set(m[2], m[0]);
  const refs = (text) => [...text.matchAll(/#(_[a-z]+\d+)/g)].map((m) => m[1]);
  return (data?.frames || []).map((frame) => {
    const used = new Set();
    const todo = refs(frame);
    while (todo.length) {
      const id = todo.pop();
      if (used.has(id) || !defs.has(id)) continue;
      used.add(id);
      todo.push(...refs(defs.get(id)));
    }
    const own = [...used].map((id) => defs.get(id)).join('');
    const svg = frame.includes('<defs>') ? frame.replace('<defs>', `<defs>${own}`) : frame.replace(/^(<svg[^>]*>)/, `$1<defs>${own}</defs>`);
    return svg.replace(/^<svg([^>]*?) width="[^"]*" height="[^"]*"/, `<svg$1 width="${w}" height="${h}"`);
  });
}

const vectorArt = new Map(); // `${key}@${density}` -> Promise<{ imgs, w, h, density }>

/** An overlay's SVG frames as decoded images sized for `density`, once per density. */
export function loadVectorArt(key, meta, density) {
  const id = `${key}@${density}`;
  let p = vectorArt.get(id);
  if (!p) {
    p = (async () => {
      const res = await fetch(`${OVERLAY_BASE}${meta.vector.file}?v=${meta.vector.sha256.slice(0, 8)}`);
      if (!res.ok) throw new Error(`${meta.vector.file} ${res.status}`);
      const [, , bw, bh] = meta.box;
      const w = Math.max(1, Math.round(bw * density));
      const h = Math.max(1, Math.round(bh * density));
      const imgs = await Promise.all(vectorFrameSvgs(await res.json(), w, h).map(async (svg) => {
        const img = new Image();
        img.decoding = 'async';
        img.src = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
        try {
          await img.decode();
        } catch {
          /* drawn when it arrives */
        }
        return img;
      }));
      return { imgs, w, h, density };
    })();
    p.catch(() => vectorArt.delete(id));
    vectorArt.set(id, p);
  }
  return p;
}

/**
 * A canvas texture the vector frames are drawn into (logical size = the box,
 * resolution = density, so the sprite keeps the sheet's sizes). Returns
 * { texture, draw(cell), destroy() } or null without a DOM or CanvasSource.
 */
function vectorTexture(PIXI, art) {
  const doc = globalThis.document;
  if (!doc?.createElement || !PIXI?.CanvasSource || !PIXI?.Texture) return null;
  const canvas = doc.createElement('canvas');
  canvas.width = art.w;
  canvas.height = art.h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const source = new PIXI.CanvasSource({ resource: canvas, resolution: art.density, scaleMode: 'linear' });
  const texture = new PIXI.Texture({ source });
  let shown = -1;
  return {
    texture,
    draw(cell) {
      const img = art.imgs[cell];
      if (cell === shown || !img?.complete) return;
      shown = cell;
      ctx.clearRect(0, 0, art.w, art.h);
      ctx.drawImage(img, 0, 0, art.w, art.h);
      source.update();
    },
    destroy() {
      texture.destroy(true);
    },
  };
}

/**
 * Play a sheet in the street. `at()` gives the point it stands on (world px,
 * read every frame so it follows an avatar or a stack); `wh` fits the stage
 * (0: 1:1); `durationMs` 0 plays until stop() (or `alive()` turns false).
 * `holdMs` freezes it at that moment for screenshots. `resolution` (the
 * renderer's, device px per world px) lets a row with SVG frames draw them
 * on a dense screen (vectorDensity; handle.art says which: 'sheet' or
 * 'vector'). Returns { sprite, stop(), setState(name), done, cancelled, art }.
 */
export function playOverlay(PIXI, key, { layer, at, wh = 0, durationMs = 2000, loop = true, delayMs = 0, holdMs = null, zIndex = 100000, state = null, alive = null, onFrame = null, resolution = 1 } = {}) {
  const handle = {
    key,
    sprite: null,
    stopped: false,
    cancelled: false,
    done: null,
    art: null,
    state,
    stateAt: null,
    stop() { handle.stopped = true; },
    setState(name) {
      if (name === handle.state) return;
      handle.state = name;
      handle.stateAt = null;
    },
  };
  const raf = globalThis.requestAnimationFrame;
  if (!PIXI?.Sprite || !layer || typeof at !== 'function' || typeof raf !== 'function') {
    handle.done = Promise.resolve(false);
    return handle;
  }
  const release = trackOverlay(() => {
    handle.cancelled = true;
    if (handle.sprite && !handle.sprite.destroyed) handle.sprite.visible = false;
  });
  const clock = () => globalThis.performance?.now?.() ?? Date.now();
  const startAt = clock() + Math.max(0, Number(delayMs) || 0);
  handle.done = loadMoreOverlays().then(async (manifest) => {
    const meta = manifest?.[key];
    const layerScale = Math.hypot(layer?.worldTransform?.a ?? 1, layer?.worldTransform?.b ?? 0) || 1;
    const density = meta ? vectorDensity(meta, overlayDensity(meta, { wh, resolution, layerScale })) : 0;
    let vector = null;
    if (density > 0 && typeof Image === 'function') {
      vector = await loadVectorArt(key, meta, density).then((art) => vectorTexture(PIXI, art), () => null);
    }
    return { meta, vector };
  }).then(({ meta, vector }) => new Promise((resolve) => {
    if (!meta || handle.stopped || handle.cancelled || layer.destroyed) {
      vector?.destroy();
      resolve(false);
      return;
    }
    handle.art = vector ? 'vector' : 'sheet';
    // The SVG frames are numbered on their own (identical frames kept once, meta.vector.order).
    const cellOf = (frame) => (vector ? meta.vector.order : meta.order)[Math.min(meta.order.length - 1, frame)];
    if (vector) vector.draw(cellOf(0));
    const sprite = new PIXI.Sprite(vector ? vector.texture : sheetTexture(PIXI, key, meta, meta.order[0]));
    sprite.eventMode = 'none';
    sprite.zIndex = zIndex;
    sprite.alpha = 0;
    sprite.visible = false;
    sprite.label = `overlay:${key}`;
    layer.addChild(sprite);
    handle.sprite = sprite;
    const forever = !(Number(durationMs) > 0);
    const life = forever ? Infinity : overlayLifeMs(durationMs);
    const finish = (ok) => {
      if (!sprite.destroyed) sprite.destroy();
      vector?.destroy();
      resolve(ok);
    };
    const step = () => {
      if (sprite.destroyed || handle.stopped || handle.cancelled || (alive && !alive())) {
        finish(false);
        return;
      }
      const ms = holdMs != null ? holdMs : clock() - startAt;
      if (holdMs == null && ms >= life) {
        finish(true);
        return;
      }
      if (ms >= 0) {
        if (handle.stateAt == null) handle.stateAt = ms;
        const frame = moreFrameAt(meta, holdMs != null ? holdMs : ms - handle.stateAt, { state: handle.state, loop });
        if (vector) vector.draw(cellOf(frame));
        else sprite.texture = sheetTexture(PIXI, key, meta, cellOf(frame));
        const p = at();
        const place = standPlacement(meta, p.x, p.y, wh);
        sprite.x = place.left;
        sprite.y = place.top;
        sprite.width = place.width;
        sprite.height = place.height;
        sprite.alpha = holdMs != null || forever ? Math.min(1, ms / OVERLAY_FADE.inMs) : overlayAlpha(ms, durationMs);
        sprite.visible = true;
        onFrame?.(frame);
      }
      raf(step);
    };
    raf(step);
  })).catch(() => false);
  handle.done.then(() => release());
  return handle;
}

/**
 * show_rainbow(key, delay) at an avatar: the 400 x 400 pc_overlay for 4 s,
 * held on its last frame (the rainbow SWFs stop() on frame 115).
 */
export function showRainbow(PIXI, key, { layer, at, delayMs = null, holdMs = null, resolution = 1 } = {}) {
  const use = OVERLAY_USES[key] || RAINBOW;
  return playOverlay(PIXI, key, { layer, at, wh: RAINBOW.wh, durationMs: RAINBOW.durationMs, loop: false, delayMs: delayMs ?? use.delayMs ?? 0, holdMs, resolution });
}

/** The sound a rainbow plays (players/player.js 3038-3065), or null. */
export function rainbowSound(key) {
  return OVERLAY_USES[key]?.sound || null;
}

/** The location viewport inside #game-root in CSS px ({ left, top, width, height, scale } scale = CSS px per game px). */
export function locationRect(doc = globalThis.document, viewW = 960, locH = 0.72) {
  const root = doc?.getElementById?.('game-root');
  if (!root) return null;
  const canvases = [...root.querySelectorAll('canvas')].filter((c) => c.width > 300);
  const canvas = canvases.sort((a, b) => b.clientWidth - a.clientWidth)[0];
  if (!canvas) return null;
  const r = root.getBoundingClientRect();
  const c = canvas.getBoundingClientRect();
  const pack = doc.getElementById('pack-bar')?.getBoundingClientRect();
  const bottom = pack && pack.height > 0 && pack.top > c.top && pack.top < c.bottom ? pack.top : c.top + c.height * locH;
  return { left: c.left - r.left - root.clientLeft, top: c.top - r.top - root.clientTop, width: c.width, height: bottom - c.top, scale: c.width / viewW };
}

const sheetImages = new Map();

function sheetImage(meta) {
  const url = `${OVERLAY_BASE}${meta.file}?v=${meta.fla.slice(0, 8)}`;
  let p = sheetImages.get(url);
  if (!p) {
    p = new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(url));
      img.src = url;
    });
    p.catch(() => sheetImages.delete(url));
    sheetImages.set(url, p);
  }
  return p;
}

/**
 * Where a window overlay's art lands in the rect (CSS px): the stage fitted to
 * wh game px (0: 1:1) times rect.scale, centred on x, its top edge at topY
 * (fractions of the rect; topY null centres it on y).
 */
export function windowPlacement(meta, rect, { wh = 0, x = 0.5, y = 0.5, topY = null } = {}) {
  const [sw, sh] = meta.stage;
  const [bx, by, bw, bh] = meta.box;
  const scale = (wh > 0 ? wh / Math.max(sw, sh) : 1) * (rect.scale || 1);
  const cx = rect.width * x;
  const cy = topY == null ? rect.height * y : rect.height * topY + (sh * scale) / 2;
  const left = cx - (sw * scale) / 2;
  const top = cy - (sh * scale) / 2;
  return { left: left + bx * scale, top: top + by * scale, width: bw * scale, height: bh * scale, scale };
}

/**
 * Play a sheet over the location viewport (vp_overlay) inside `host` (an
 * element positioned over the view; default #game-root with locationRect()).
 * `place(meta, rect)` may return its own { left, top, width, height } (CSS px
 * in the host). durationMs 0 plays until stop(). Returns { canvas, stop(),
 * setState(), done } (done: true once played, false when stopped or the art
 * is missing, null when a street change cancelled it).
 */
export function playWindowOverlay(key, { host = null, rect = null, place = null, wh = 0, x = 0.5, y = 0.5, topY = null, durationMs = 2000, loop = true, state = null, holdMs = null, zIndex = 86, className = 'overlay-more' } = {}) {
  const handle = { key, canvas: null, stopped: false, cancelled: false, state, stateAt: null, done: null,
    stop() { handle.stopped = true; },
    setState(name) { if (name !== handle.state) { handle.state = name; handle.stateAt = null; } } };
  const doc = globalThis.document;
  const raf = globalThis.requestAnimationFrame;
  const root = host || doc?.getElementById?.('game-root');
  if (!root || typeof raf !== 'function') {
    handle.done = Promise.resolve(false);
    return handle;
  }
  const release = trackOverlay(() => { handle.cancelled = true; handle.canvas?.remove(); });
  handle.done = loadMoreOverlays().then(async (manifest) => {
    const meta = manifest?.[key];
    if (!meta) return false;
    const img = await sheetImage(meta);
    if (handle.stopped) return false;
    if (handle.cancelled) return null;
    const r = rect || (host ? { left: 0, top: 0, width: host.clientWidth, height: host.clientHeight, scale: locationRect(doc)?.scale || 1 } : locationRect(doc));
    if (!r) return false;
    const at = place ? place(meta, r) : windowPlacement(meta, r, { wh, x, y, topY });
    const dpr = Math.min(2, globalThis.devicePixelRatio || 1);
    const canvas = doc.createElement('canvas');
    canvas.className = className;
    canvas.dataset.overlay = key;
    canvas.width = Math.max(1, Math.round(at.width * dpr));
    canvas.height = Math.max(1, Math.round(at.height * dpr));
    Object.assign(canvas.style, { position: 'absolute', left: `${(host ? 0 : r.left) + at.left}px`, top: `${(host ? 0 : r.top) + at.top}px`, pointerEvents: 'none', zIndex: String(zIndex), opacity: '0' });
    canvas.style.setProperty('width', `${at.width}px`, 'important');
    canvas.style.setProperty('height', `${at.height}px`, 'important');
    canvas.style.setProperty('display', 'block', 'important');
    root.appendChild(canvas);
    handle.canvas = canvas;
    const ctx = canvas.getContext('2d');
    const forever = !(Number(durationMs) > 0);
    const life = forever ? Infinity : overlayLifeMs(durationMs);
    const t0 = globalThis.performance?.now?.() ?? Date.now();
    let shown = -1;
    const cellW = meta.cell[0];
    const cellH = meta.cell[1];
    return new Promise((resolve) => {
      const step = () => {
        const ms = holdMs != null ? holdMs : (globalThis.performance?.now?.() ?? Date.now()) - t0;
        if (handle.stopped || handle.cancelled || !canvas.isConnected || (holdMs == null && ms >= life)) {
          canvas.remove();
          resolve(handle.cancelled ? null : !handle.stopped);
          return;
        }
        if (handle.stateAt == null) handle.stateAt = holdMs != null ? 0 : ms;
        const frame = moreFrameAt(meta, ms - handle.stateAt, { state: handle.state, loop });
        const cell = meta.order[Math.min(meta.order.length - 1, frame)];
        if (cell !== shown) {
          shown = cell;
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, (cell % meta.cols) * cellW, Math.floor(cell / meta.cols) * cellH, cellW, cellH, 0, 0, canvas.width, canvas.height);
        }
        canvas.dataset.overlayFrame = String(frame);
        canvas.style.opacity = String(holdMs != null || forever ? Math.min(1, ms / OVERLAY_FADE.inMs) : overlayAlpha(ms, durationMs));
        raf(step);
      };
      raf(step);
    });
  }).catch(() => false);
  handle.done.then(() => release());
  return handle;
}

/** How long after the countdown picture ends the box's words come back (ms). */
export const COUNTDOWN_WORDS_BACK_MS = 700;

/**
 * G394: the 321_countdown picture over a game's READY/3/2/1/GO box (the
 * .hog-haul-countdown element the races, the Hog Haul and Game of Crowns
 * share). The words stay in the box for screen readers; `has-art` hides
 * them while the picture plays (style.css), and the picture is the
 * vp_overlay's 350 px centred in the view (startCountdown,
 * shared_instance_manager.js 672-683; race_start_countdown, inc_race.js
 * 200-211). Returns the window overlay handle (or null without an element).
 */
export function playCountdownArt(el, { holdMs = null } = {}) {
  if (!el?.parentElement) return null;
  const use = OVERLAY_USES['321_countdown'];
  // Beside the box, not in it: the games rewrite its text every frame.
  for (const old of el.parentElement.querySelectorAll(':scope > canvas[data-overlay="321_countdown"]')) old.remove();
  el.classList.add('has-art');
  const h = playWindowOverlay('321_countdown', {
    host: el.parentElement,
    place: (meta, r) => {
      // The location viewport when the games' HUD sits in #game-root (the view is above the pack).
      const view = el.parentElement.id === 'game-root' ? locationRect(el.ownerDocument) : null;
      const box = view || { left: el.offsetLeft, top: el.offsetTop, width: el.offsetWidth, height: el.offsetHeight, scale: r.scale };
      const at = windowPlacement(meta, box, { wh: use.wh, x: use.x, topY: use.topY });
      return { ...at, left: at.left + box.left, top: at.top + box.top };
    },
    durationMs: use.durationMs,
    loop: false,
    holdMs,
    zIndex: 81,
  });
  // Back to words once it is gone. GO! is in the picture, so the box's own GO! (shown for 650 ms at
  // the start) stays hidden until it closes too.
  h.done.then(() => setTimeout(() => el.classList.remove('has-art'), COUNTDOWN_WORDS_BACK_MS));
  return h;
}

/**
 * G377: the dice (items/dice.js 114-169): two dice_overlay pc_overlays over
 * the avatar, 56 px, state spin, at delta_x -20 and 20, delta_y -120, for
 * 6 s; overlay_state roll<n> lands on the left die at 1 s and on the right
 * at 2 s (onDiceRollCompleteLeft / Right). A 12-sided die (dice_12sided.js
 * 162-229) is one twelve_sided_die overlay, spin, then roll_<giant> (alph,
 * cosma, friendly, grendaline, humbaba, lem, mab, pot, spriggan, ti, zille)
 * or roll_rook at 2 s. `values`: [left, right] (1-6) for the pair, or the
 * giant id / 'rook' for the 12-sided die. `rollAfterMs` [ms per die]
 * overrides the source's timers. Returns the handles (left first).
 */
export function playDice(PIXI, { layer, at, values, twelve = false, rollAfterMs = null, holdMs = null } = {}) {
  const key = twelve ? 'twelve_sided_die' : 'dice_overlay';
  const use = OVERLAY_USES[key];
  const pc = typeof at === 'function' ? at : () => at;
  const offsets = twelve ? [0] : [use.dx, -use.dx];
  const rolls = twelve
    ? [`roll_${String(Array.isArray(values) ? values[0] : values).toLowerCase()}`]
    : (Array.isArray(values) ? values : []).map((v) => `roll${Math.max(1, Math.min(6, Math.floor(Number(v) || 1)))}`);
  const timers = rollAfterMs || use.rollAfterMs;
  return offsets.map((dx, i) => {
    const h = playOverlay(PIXI, key, {
      layer,
      at: () => { const p = pc(); return { x: p.x + dx, y: p.y + use.dy }; },
      wh: use.wh,
      durationMs: use.durationMs,
      state: use.state,
      holdMs,
    });
    if (rolls[i]) {
      if (holdMs != null && holdMs >= (timers[i] || 0)) h.setState(rolls[i]);
      else setTimeout(() => h.setState(rolls[i]), Math.max(0, Number(timers[i]) || 0));
    }
    return h;
  });
}
