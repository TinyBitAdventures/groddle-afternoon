/**
 * The multiplayer games' splash screen (register row G299): the end of a
 * ticket race and of The Great Hog Haul.
 *
 * What the source does (tinyspeck/glitch-GameServerJS and glitch-client, CC0):
 * - players/inc_games.js games_end_race 1330-1390: a game_splash_screen,
 *   tsid 'race', graphic race_winner at scale 1, frame_label you_winner (with
 *   show_rays) for the winner, or other_winner with the winner's name as the
 *   graphic's text (text_delta_y 55); one button, "Leave the Game" (w 150,
 *   does_close, games_leave_instance_overlay 'leave'), 20 px below.
 *   games_end_hogtie_piggy 2088-2183: the same with thegreathoghaul_winner
 *   (text_delta_y -10); games_end_quoin_grab 1529-1600 with grabemgood_winner
 *   (text_delta_y 0).
 * - view/gameoverlay/GameSplashScreenView.as:
 *   - show 94-146: the name centred on the graphic plus text_delta_y (120-124),
 *     the buttons centred under it plus delta_y (131-135); draw 272-282
 *     centres the whole block in the location view.
 *   - animate 249-261 / BaseSplashScreenView animate: fades in over 0.4 s,
 *     the rays fade in over 0.5 s after 1 s; onAnimateComplete 263-269 then
 *     plays the graphic's label (it waits on the label's first frame until
 *     then, loadGraphic 303-309).
 *   - onButtonClick 348-360: a does_close button hides the splash and sends
 *     its payload. onDoneClick 362-391 (Enter or Escape, once faded in): the
 *     first does_close button's payload, else CLICK_FAILURE.
 *   - BaseSplashScreenView hide: fades out over 0.3 s.
 * The art is Tiny Speck's own FLA (glitch-overlays/race_winner.fla,
 * thegreathoghaul_winner.fla, game_of_crowns_winner.fla), drawn by
 * tools/overlay-art/build.mjs into sheets with the two labels as states.
 * G304:
 * - Game of Crowns ends here too (games_end_it_game 613-730: tsid it_game,
 *   game_of_crowns_winner, text_delta_y 25, Play Again and Leave the Game).
 * - The rays are the client's own (GameSplashScreenView.as 37, 91 new
 *   Rays('combinedSlow'); Rays.as: TSEngineAssets/level_up_rays.fla, scene
 *   combinedSlow, scale 1.5), two fans drawn by tools/overlay-art (kind
 *   "spin") turning at their tweens' rates; placeGraphic 340-342 centres
 *   them on the graphic (rays.x = width/2 - 413, the 1.5x stage's middle).
 * - The name's place is the client's (splashTextY): the graphic sits in
 *   ArbitrarySWFView's square of the larger stage side, bottom aligned
 *   (scale 312-340), and onSWFComplete 316-324 lifts it by the clip's y, so
 *   the middle of the holder is stage y h - max(w, h) / 2; text_delta_y adds
 *   to that. The Game of Crowns recording (PUUVxH_h_cQ, 4:06, reference
 *   only) puts the name 5 px from that, in the crown above its plate; on
 *   race_winner it lands in the orb, not on the plate.
 * - Every splash button is type 'minor' (inc_games.js 1352-1356 and the
 *   rest), the light button the recording shows.
 * Not recovered: client.css's game_splash_<tsid> styles (searched: no
 * client stylesheet in glitch-client, Wayback's c1.glitch.bz/css index has
 * only the website's), so the name keeps the outlined label look; the
 * recording shows no shade behind the splash (the street stays full
 * strength), which is what the remake draws.
 */

import { OVERLAY_BASE, loadOverlayManifest, sheetCell, stateFrameAt } from './overlay-art.js?v=g448-1';

/** An art URL with its content key (js/data-urls.js groddleDataUrl); as it is in Node and on a page without the map. */
const keyedArt = (url) => (typeof globalThis.groddleDataUrl === 'function' ? globalThis.groddleDataUrl(url) : url);

/** GameSplashScreenView.as 37 RAYS_SCENE, drawn as overlays.json level_up_rays. */
export const SPLASH_RAYS_KEY = 'level_up_rays';

export const SPLASH_FADE_IN_MS = 400; // BaseSplashScreenView animate
export const SPLASH_FADE_OUT_MS = 300; // BaseSplashScreenView hide
export const SPLASH_RAYS_DELAY_MS = 1000; // GameSplashScreenView animate 259
export const SPLASH_RAYS_FADE_MS = 500;
export const SPLASH_BUTTON_GAP = 20; // buttons.delta_y

/** games_end_race 1336-1360 and games_end_hogtie_piggy 2104-2127. */
export const RACE_SPLASH = Object.freeze({ key: 'race_winner', textDeltaY: 55, leaveLabel: 'Leave the Game', buttonW: 150 });
export const HOG_HAUL_SPLASH = Object.freeze({ key: 'thegreathoghaul_winner', textDeltaY: -10, leaveLabel: 'Leave the Game', buttonW: 0 });
/** games_end_quoin_grab 1543-1586 (Grab 'Em Good, the remake's quoin races). */
export const QUOIN_GRAB_SPLASH = Object.freeze({ key: 'grabemgood_winner', textDeltaY: 0, leaveLabel: 'Leave the Game', buttonW: 0 });
/** G304: games_end_it_game 633-660, 692-694: both buttons w 150; Play Again first. */
export const CROWNS_SPLASH = Object.freeze({ key: 'game_of_crowns_winner', textDeltaY: 25, againLabel: 'Play Again', leaveLabel: 'Leave the Game', buttonW: 150 });

/** The frame label a player sees: you_winner (with rays) or other_winner (with the winner's name). */
export function splashFor(won, winnerName = '') {
  return won
    ? { label: 'you_winner', rays: true, text: '' }
    : { label: 'other_winner', rays: false, text: String(winnerName || '') };
}

/**
 * Where the graphic's text centres, in the art box's px (show 122-123:
 * the holder's y plus half its height plus text_delta_y). The holder is
 * ArbitrarySWFView's square of the larger stage side with the stage at its
 * bottom (scale 312-340: mc.y = wh - h), lifted by mc.y (onSWFComplete
 * 316-324), so its middle is stage y h - wh / 2. Without a stage (old
 * manifests) the box's middle. `nameY` (box px) overrides it.
 */
export function splashTextY(meta, textDeltaY = 0, nameY = null) {
  if (Number.isFinite(nameY)) return nameY;
  const [, by, , bh] = meta.box;
  const delta = Number(textDeltaY) || 0;
  if (!Array.isArray(meta.stage)) return bh / 2 + delta;
  // contentLoaderInfo.width / height are whole pixels.
  const [sw, sh] = meta.stage.map((v) => Math.round(Number(v) || 0));
  return sh - Math.max(sw, sh) / 2 + delta - by;
}

/** The graphic's middle across, in box px: the stage's (show 120, draw 286). */
export function splashTextX(meta) {
  const [bx, , bw] = meta.box;
  return Array.isArray(meta.stage) ? Number(meta.stage[0]) / 2 - bx : bw / 2;
}

/**
 * The rays (Rays.as, placeGraphic 340-342): the fans' square (box px of the
 * graphic: its centre on the graphic's stage middle; its side the drawn
 * square at Rays' 1.5) and each fan's turn in seconds per full circle.
 */
export function splashRays(graphicMeta, raysMeta) {
  if (!graphicMeta || !raysMeta?.layers?.length) return null;
  const [gx, gy] = graphicMeta.box;
  const [sw, sh] = Array.isArray(graphicMeta.stage) ? graphicMeta.stage : [graphicMeta.box[2], graphicMeta.box[3]];
  const side = raysMeta.box[2] * (Number(raysMeta.scale) || 1);
  const fps = Number(raysMeta.fps) || 30;
  return {
    cx: sw / 2 - gx,
    cy: sh / 2 - gy,
    side,
    layers: raysMeta.layers.map((l) => ({
      file: l.file,
      // degPerFrame at the clip's fps; 0 holds still.
      turnSec: l.degPerFrame ? Math.round((360 / (Math.abs(l.degPerFrame) * fps)) * 100) / 100 : 0,
      reverse: l.degPerFrame < 0,
    })),
  };
}

/** onDoneClick 362-391: the first does_close button, or null (then CLICK_FAILURE). */
export function splashDoneButton(buttons) {
  return (buttons || []).find((b) => b && b.doesClose !== false) || null;
}

const CSS = `
.game-splash { position: absolute; z-index: 520; pointer-events: none; opacity: 0; transition: opacity ${SPLASH_FADE_IN_MS}ms linear; }
.game-splash.is-in { opacity: 1; }
.game-splash.is-out { opacity: 0; visibility: hidden; transition: opacity ${SPLASH_FADE_OUT_MS}ms linear, visibility 0s linear ${SPLASH_FADE_OUT_MS}ms; }
.game-splash.is-out .game-splash-buttons { pointer-events: none; }
html[data-street-cards] .game-splash { visibility: hidden; }
.game-splash-block { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); display: flex; flex-direction: column; align-items: center; }
.game-splash-graphic { position: relative; }
.game-splash-art { position: relative; background-repeat: no-repeat; }
.game-splash-rays { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); pointer-events: none;
  opacity: 0; transition: opacity ${SPLASH_RAYS_FADE_MS}ms linear ${SPLASH_RAYS_DELAY_MS}ms; }
.game-splash-rays img { position: absolute; inset: 0; width: 100%; height: 100%; animation: gameSplashTurn linear infinite; }
.game-splash-rays.is-standin { width: 200%; aspect-ratio: 826 / 586; border-radius: 50%;
  background: repeating-conic-gradient(rgba(255, 255, 255, .22) 0deg 10deg, transparent 10deg 20deg);
  -webkit-mask-image: radial-gradient(closest-side, #000 35%, transparent 100%); mask-image: radial-gradient(closest-side, #000 35%, transparent 100%); }
@keyframes gameSplashTurn { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .game-splash-rays img { animation: none; } }
.game-splash.is-in .game-splash-rays.is-on { opacity: 1; }
.game-splash-name { position: absolute; left: 50%; margin: 0; transform: translate(-50%, -50%); text-align: center; white-space: nowrap;
  color: #fff; font: 900 var(--splash-name-size, 26px)/1 Nunito, 'Trebuchet MS', sans-serif; letter-spacing: .02em;
  text-shadow: 0 0 2px #3b2a20, 0 0 3px #3b2a20, 0 2px 0 #3b2a20, 0 3px 6px rgba(0,0,0,.35); }
.game-splash-name:empty { display: none; }
.game-splash-buttons { display: flex; gap: 10px; margin-top: ${SPLASH_BUTTON_GAP}px; pointer-events: auto; }
.game-splash-buttons button { min-width: 0; }
/* Button type 'minor' (client.css .button_minor_*, not recovered): light, as recorded. */
.game-splash-buttons .game-splash-minor { min-height: 28px; padding: 4px 14px; border: 1px solid #c9c4b8; border-radius: 6px; cursor: pointer;
  color: #4d4a40; background: linear-gradient(#ffffff, #e9e6df); font: 700 13px/1.2 Nunito, 'Trebuchet MS', sans-serif;
  box-shadow: 0 1px 2px rgba(0,0,0,.25); }
.game-splash-buttons .game-splash-minor:hover { background: linear-gradient(#ffffff, #f3f1ec); }
.game-splash-buttons .game-splash-minor:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }
`;

/**
 * createGameSplash({ document, mount() -> host, rect() -> { left, top, width,
 * height } (the location view in the host), viewWidth (the location view's
 * game px, so the art keeps its size against the street), playSound(key),
 * setData(key, value), manifest() -> Promise (overlays.json) })
 * -> { show(opts) -> Promise<boolean>, hide(), isOpen(), done() }
 *
 * show({ key, label, text, textDeltaY, rays, buttons: [{ label, w, doesClose, onClick }] })
 */
export function createGameSplash(opts = {}) {
  const doc = opts.document;
  const win = opts.win || doc.defaultView;
  const setData = opts.setData || (() => {});
  const playSound = opts.playSound || (() => {});
  const manifest = opts.manifest || loadOverlayManifest;
  let root = null;
  let current = null;
  let token = 0;

  function ensureStyle() {
    if (doc.getElementById('game-splash-style')) return;
    const style = doc.createElement('style');
    style.id = 'game-splash-style';
    style.textContent = CSS;
    doc.head.appendChild(style);
  }

  function place() {
    if (!root) return;
    const r = opts.rect?.();
    if (r) Object.assign(root.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
    else Object.assign(root.style, { left: '0px', top: '0px', width: '100%', height: '100%' });
  }

  function viewScale() {
    const r = opts.rect?.();
    const w = Number(opts.viewWidth) || 0;
    return r && w > 0 ? Math.max(0.4, Math.min(2, r.width / w)) : 1;
  }

  function onKey(e) {
    if (!current || (e.key !== 'Enter' && e.key !== 'Escape')) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (!e.repeat) done();
  }

  /** onDoneClick 362-391. */
  function done() {
    if (!current?.ready) return false;
    const button = splashDoneButton(current.buttons);
    if (!button) {
      playSound('CLICK_FAILURE');
      return false;
    }
    press(button);
    return true;
  }

  function press(button) {
    if (!current) return;
    if (button.doesClose !== false) hide();
    setData('gameSplashChoice', button.value || button.label);
    button.onClick?.();
  }

  function hide() {
    if (!current) return;
    const mine = current;
    current = null;
    token += 1;
    win.cancelAnimationFrame?.(mine.raf);
    win.removeEventListener('keydown', onKey, true);
    win.removeEventListener('resize', place);
    mine.el.classList.add('is-out');
    mine.el.classList.remove('is-in');
    win.setTimeout(() => mine.el.remove(), SPLASH_FADE_OUT_MS);
    setData('gameSplash', '');
  }

  async function show({ key, label, text = '', textDeltaY = 0, nameY = null, rays = false, buttons = [] } = {}) {
    hide();
    const mine = ++token;
    let meta = null;
    let raysMeta = null;
    try {
      const all = await manifest();
      meta = all?.[key] || null;
      raysMeta = all?.[SPLASH_RAYS_KEY] || null;
    } catch {
      meta = null;
    }
    if (mine !== token) return false;
    ensureStyle();
    root = doc.createElement('div');
    root.className = 'game-splash';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-label', text ? `${text} is the winner` : 'You are the winner');
    (opts.mount?.() || doc.body).appendChild(root);
    place();
    const scale = viewScale();
    const block = doc.createElement('div');
    block.className = 'game-splash-block';
    const graphic = doc.createElement('div');
    graphic.className = 'game-splash-graphic';
    const raysEl = doc.createElement('div');
    raysEl.className = `game-splash-rays${rays ? ' is-on' : ''}`;
    raysEl.hidden = !rays;
    const raysPlan = rays ? splashRays(meta, raysMeta) : null;
    if (raysPlan) {
      Object.assign(raysEl.style, {
        left: `${raysPlan.cx * scale}px`,
        top: `${raysPlan.cy * scale}px`,
        width: `${raysPlan.side * scale}px`,
        height: `${raysPlan.side * scale}px`,
      });
      for (const layer of raysPlan.layers) {
        const img = doc.createElement('img');
        img.src = `${OVERLAY_BASE}${layer.file}`;
        img.alt = '';
        img.decoding = 'async';
        img.style.animationDuration = layer.turnSec ? `${layer.turnSec}s` : '0s';
        if (layer.reverse) img.style.animationDirection = 'reverse';
        raysEl.appendChild(img);
      }
      setData('gameSplashRays', raysPlan.layers.map((l) => l.turnSec).join(','));
    } else if (rays) {
      raysEl.className += ' is-standin'; // the art failed: the CSS stand-in
      setData('gameSplashRays', 'standin');
    } else setData('gameSplashRays', '');
    const art = doc.createElement('div');
    art.className = 'game-splash-art';
    const name = doc.createElement('p');
    name.className = 'game-splash-name';
    name.textContent = text;
    if (meta) {
      const [, , bw, bh] = meta.box;
      const cellW = meta.cell[0] / meta.scale;
      const cellH = meta.cell[1] / meta.scale;
      const rows = Math.ceil((Math.max(...meta.order) + 1) / meta.cols);
      Object.assign(art.style, {
        width: `${bw * scale}px`,
        height: `${bh * scale}px`,
        backgroundImage: `url("${keyedArt(`${OVERLAY_BASE}${meta.file}`)}")`,
        backgroundSize: `${meta.cols * cellW * scale}px ${rows * cellH * scale}px`,
      });
      name.style.top = `${splashTextY(meta, textDeltaY, nameY) * scale}px`;
      name.style.left = `${splashTextX(meta) * scale}px`;
      name.style.setProperty('--splash-name-size', `${Math.round(26 * scale)}px`);
    } else {
      // No art (the manifest failed): the label's words, so the result still reads.
      art.textContent = label === 'you_winner' ? 'YOU ARE THE WINNER' : 'IS THE WINNER';
      Object.assign(art.style, { padding: '60px 20px 20px', color: '#fff', font: "900 28px/1.2 Nunito, 'Trebuchet MS', sans-serif" });
      name.style.top = '28px';
    }
    graphic.append(raysEl, art, name);
    const row = doc.createElement('div');
    row.className = 'game-splash-buttons';
    for (const b of buttons) {
      const bt = doc.createElement('button');
      bt.type = 'button';
      // inc_games.js: every splash button is size 'default', type 'minor'.
      bt.className = b.type === 'primary' ? 'btn-glitch-primary' : 'game-splash-minor';
      bt.textContent = b.label;
      if (b.w) bt.style.width = `${b.w}px`;
      bt.addEventListener('click', () => press(b));
      row.appendChild(bt);
    }
    block.append(graphic, row);
    root.appendChild(block);
    current = { el: root, buttons, ready: false, raf: 0 };
    const cur = current;
    const drawFrame = (frame) => {
      if (!meta) return;
      const c = sheetCell(meta, frame);
      art.style.backgroundPosition = `${-c.x * scale}px ${-c.y * scale}px`;
      setData('gameSplashFrame', String(frame));
    };
    // Waits on the label's first frame (loadGraphic 303-309) until faded in.
    drawFrame(stateFrameAt(meta || {}, label, 0, { loop: false }));
    setData('gameSplash', `${key}:${label}`);
    win.addEventListener('keydown', onKey, true);
    win.addEventListener('resize', place);
    win.requestAnimationFrame?.(() => root?.classList.add('is-in'));
    win.setTimeout(() => {
      if (current !== cur) return;
      cur.ready = true;
      setData('gameSplash', `${key}:${label}:ready`);
      row.querySelector('button')?.focus?.({ preventScroll: true });
      const start = win.performance?.now?.() ?? Date.now();
      const tick = (t) => {
        if (current !== cur) return;
        drawFrame(stateFrameAt(meta || {}, label, (t ?? Date.now()) - start, { loop: false }));
        const st = meta?.states?.[label];
        const at = (t ?? Date.now()) - start;
        if (st && at < (st.frames / meta.fps) * 1000 + 50) cur.raf = win.requestAnimationFrame(tick);
      };
      cur.raf = win.requestAnimationFrame(tick);
    }, SPLASH_FADE_IN_MS);
    return true;
  }

  return { show, hide, done, isOpen: () => Boolean(current) };
}
