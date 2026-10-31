/**
 * LEVEL BUILDER render page (spec 8.5): draws one street with the game's own renderer
 * (street-render.js buildStreetView, set up as game.js and the editor set Pixi up) and the editor's
 * overlays (js/builder/overlays.js), then hands back a PNG from renderer.extract. So an agent sees
 * what a player sees: filters, blur, parallax and the sky gradient.
 *
 * Called by tools/builder/render.mjs (the builder worker and the CLI) through Playwright:
 *
 *   await window.groddleRender({ street, assets, params, reach, findings, populations })
 *     -> { png: <base64>, width, height, scale }
 *
 * street: the street JSON; assets: the zone's assets{} (gz_ art is served at /builder-art/<sha256>
 * by the caller); params: { view: 'full' | 'camera', x, y (camera: the world point at the view's
 * centre), w, h (the camera view, default 960 x 540), scale (0.05..1), overlay: [...], layers: [...] };
 * reach: the validator's reach map for this street; findings: the street's findings (rule ids are
 * drawn at their `where`); populations: [{ key, x, y }] the planner's spots (screen space).
 * `full` draws every layer at the parallax offset of a Wide view at the street's centre, with the
 * sky over the whole street. A zone street's effects (js/street-effects.js) are drawn as a still
 * with every emitter puffing (2.2 s in); the `effects` overlay marks each emitter (its id, kind and
 * plume height) and names the rumble. The output is at most 4096 px a side (the scale shrinks to fit).
 */
import { buildStreetView, loadDecoManifest, loadSignpostTextures } from '../js/street-render.js?v=3f8384af';
import { navigableSignposts, streetWidth, streetHeight, worldToScreen } from '../js/street-model.js?v=23b926e5';
import * as textureUrls from '../js/textures.js?v=db2ce452';
import { installPixiFixes } from '../js/pixi-fixes.js?v=173fb649';
import { installHiresDecos } from '../js/deco-hires.js?v=cc8506f6';
import { installNewArt, withNewArt } from '../js/builder/new-art.js?v=29f0b13e';
import { spotGroup } from '../js/builder/editor-zone.js?v=36e4d449';
import { drawGeometryOverlay, drawReachOverlay, drawArrivals, OVERLAY_COLOURS } from '../js/builder/overlays.js?v=7dd09d5a';
import { createStreetEffects, normaliseEmitter, emitterAnchor, EFFECT_WORDS } from '../js/street-effects.js?v=e427650f';

export const MAX_SIDE = 4096;
export const WIDE = Object.freeze({ w: 960, h: 408 });

/** PURE: the camera and output size for a render (spec 8.5). */
export function renderFrame(street, params = {}) {
  const W = streetWidth(street);
  const H = streetHeight(street);
  let scale = Math.min(1, Math.max(0.05, Number(params.scale) || 0.25));
  if (params.view === 'camera') {
    const vw = Math.min(W, Math.max(100, Number(params.w) || 960));
    const vh = Math.min(H, Math.max(100, Number(params.h) || 540));
    const centre = Number.isFinite(params.x) && Number.isFinite(params.y)
      ? { x: params.x - street.bounds.l, y: params.y - street.bounds.t }
      : { x: W / 2, y: H - vh / 2 };
    const cam = {
      x: Math.max(0, Math.min(W - vw, centre.x - vw / 2)),
      y: Math.max(0, Math.min(H - vh, centre.y - vh / 2)),
    };
    scale = Math.min(scale, MAX_SIDE / vw, MAX_SIDE / vh);
    return { view: 'camera', W, H, cam, vw, vh, parallax: { x: cam.x, y: cam.y, w: vw, h: vh }, scale, width: Math.round(vw * scale), height: Math.round(vh * scale) };
  }
  // Full: the whole street, every layer where a Wide view centred on the street puts it.
  const f = WIDE;
  const px = Math.max(0, Math.min(Math.max(0, W - f.w), W / 2 - f.w / 2));
  const py = Math.max(0, Math.min(Math.max(0, H - f.h), H / 2 - f.h / 2));
  scale = Math.min(scale, MAX_SIDE / W, MAX_SIDE / H);
  return { view: 'full', W, H, cam: { x: 0, y: 0 }, vw: W, vh: H, parallax: { x: px, y: py, w: f.w, h: f.h }, scale, width: Math.round(W * scale), height: Math.round(H * scale) };
}

/** PURE: the grid's lines and labels: every 100 world px, labelled where labels have room. */
export function gridLines(street, frame) {
  const step = 100;
  const every = [100, 200, 500, 1000, 2000].find((n) => n * frame.scale >= 56) || 2000;
  const { l, t } = street.bounds;
  const xs = [];
  const ys = [];
  const x0 = Math.ceil((l + frame.cam.x) / step) * step;
  for (let x = x0; x <= l + frame.cam.x + frame.vw; x += step) xs.push({ at: x - l, value: x, label: x % every === 0 });
  const y0 = Math.ceil((t + frame.cam.y) / step) * step;
  for (let y = y0; y <= t + frame.cam.y + frame.vh; y += step) ys.push({ at: y - t, value: y, label: y % every === 0 });
  return { xs, ys, every };
}

let ready = null;
let currentAssets = null;
let app = null;
let available = null;

async function setup() {
  const PIXI = globalThis.PIXI;
  PIXI.Filter.defaultOptions.resolution = 'inherit';
  installPixiFixes(PIXI);
  app = new PIXI.Application();
  installHiresDecos(textureUrls, { renderer: () => app?.renderer });
  installNewArt(textureUrls, () => currentAssets);
  await app.init({ width: 64, height: 64, background: 0x8ec8e8, antialias: false, resolution: 1, autoDensity: false, preference: 'webgl' });
  document.body.append(app.canvas);
  [available] = await Promise.all([loadDecoManifest(), loadSignpostTextures(PIXI)]);
}

/** Waits until every deco texture the view uses has loaded or failed (up to `ms`), then a few frames for baked tiles. */
async function settle(view, ms = 20000) {
  const t0 = performance.now();
  let pending = 0;
  for (;;) {
    pending = 0;
    for (const spr of view.decoViews?.values?.() || []) {
      const tex = spr?.texture;
      if (tex && !textureUrls.isLoaded(tex) && !textureUrls.isFailed(tex)) pending += 1;
    }
    if (!pending || performance.now() - t0 > ms) break;
    await new Promise((r) => setTimeout(r, 80));
  }
  for (let i = 0; i < 4; i += 1) {
    app.renderer.render(app.stage);
    await new Promise((r) => requestAnimationFrame(() => r()));
  }
  await new Promise((r) => setTimeout(r, 250));
  return pending;
}

function label(PIXI, text, x, y, { size = 12, colour = 0xffffff, bg = 0x000000 } = {}) {
  const c = new PIXI.Container();
  const t = new PIXI.Text({ text, style: { fontFamily: 'Arial, Helvetica, sans-serif', fontSize: size, fill: colour, fontWeight: '700' } });
  const g = new PIXI.Graphics().rect(-3, -1, t.width + 6, t.height + 2).fill({ color: bg, alpha: 0.7 });
  c.addChild(g, t);
  c.position.set(Math.round(x), Math.round(y));
  return c;
}

async function render({ street, assets = null, params = {}, reach = null, findings = [], populations = [] }) {
  if (!ready) ready = setup();
  await ready;
  const PIXI = globalThis.PIXI;
  currentAssets = assets;
  const overlay = new Set(params.overlay || []);
  const only = new Set(params.layers || []);
  const data = { ...street, signposts: navigableSignposts(street.signposts) };
  if (only.size) data.layers = street.layers.map((l) => (only.has(l.id) || only.has(l.name) ? l : { ...l, hidden: true }));
  const frame = renderFrame(street, params);
  app.renderer.resize(frame.width, frame.height);
  app.stage.removeChildren().forEach((c) => c.destroy({ children: true }));
  const world = new PIXI.Container();
  world.scale.set(frame.scale);
  world.position.set(-frame.cam.x * frame.scale, -frame.cam.y * frame.scale);
  const view = buildStreetView(data, PIXI, { renderer: app.renderer, available: withNewArt(available, assets) });
  // `layers` shows those layers only: the middleground too (the renderer always builds it).
  if (only.size) for (const lc of view.layerContainers || []) if (!only.has(lc.label)) lc.visible = false;
  view.updateParallax(frame.parallax.x, frame.parallax.y, frame.parallax.w, frame.parallax.h, frame.parallax.h);
  if (view.skyView) {
    view.skyView.x = frame.cam.x;
    view.skyView.y = frame.cam.y;
    view.skyView.width = frame.vw;
    view.skyView.height = frame.vh;
  }
  world.addChild(view);
  if (view.frontView) world.addChild(view.frontView);
  const fx = data.emitters?.length ? createStreetEffects(data, PIXI, view, { available: withNewArt(available, assets), reduced: false, always: true }) : null;
  fx?.simulate(2.2);
  const g = new PIXI.Graphics();
  const px = (n) => n / frame.scale;
  world.addChild(g);
  const labels = new PIXI.Container();
  app.stage.addChild(world, labels);
  const toOut = (p) => ({ x: (p.x - frame.cam.x) * frame.scale, y: (p.y - frame.cam.y) * frame.scale });

  if (overlay.has('grid')) {
    const grid = gridLines(street, frame);
    for (const x of grid.xs) g.moveTo(x.at, frame.cam.y).lineTo(x.at, frame.cam.y + frame.vh);
    for (const y of grid.ys) g.moveTo(frame.cam.x, y.at).lineTo(frame.cam.x + frame.vw, y.at);
    g.stroke({ width: px(1), color: 0xffffff, alpha: 0.35 });
    for (const x of grid.xs.filter((v) => v.label)) {
      const o = toOut({ x: x.at, y: frame.cam.y });
      labels.addChild(label(PIXI, `x ${x.value}`, o.x + 3, 2, { size: 11 }));
    }
    for (const y of grid.ys.filter((v) => v.label)) {
      const o = toOut({ x: frame.cam.x, y: y.at });
      labels.addChild(label(PIXI, `y ${y.value}`, 3, o.y + 2, { size: 11 }));
    }
  }
  if (overlay.has('reach') && reach) drawReachOverlay(g, reach, { px, arrivals: false });
  if (overlay.has('geometry')) drawGeometryOverlay(g, street, { px });
  if ((overlay.has('arrivals') || overlay.has('reach')) && reach) drawArrivals(g, reach.arrivals, { px });
  if (overlay.has('populations')) {
    // The editor's populations overlay: a dot per thing, coloured by kind (editor-zone.js SPOT_GROUPS).
    for (const p of populations || []) {
      const group = spotGroup(p.key);
      g.circle(p.x, p.y - px(9), px(group.id === 'player' ? 9 : 7)).fill({ color: group.colour, alpha: 0.9 }).stroke({ width: px(2), color: 0x000000, alpha: 0.6 });
      const o = toOut({ x: p.x, y: p.y });
      if (frame.scale >= 0.2) labels.addChild(label(PIXI, p.key, o.x + 8, o.y - 26, { size: 10, colour: group.colour }));
    }
  }
  if (overlay.has('effects')) {
    // Each emitter: a ring at its mouth, a line up to its plume's height, and its id and kind.
    const colour = { steam: 0xe5e7eb, lava: 0xff7a1a, embers: 0xffd34d };
    for (const e of street.emitters || []) {
      const n = normaliseEmitter(e);
      const lc = (view.layerContainers || []).find((c) => c.label === n.layer);
      const a = emitterAnchor(street, n);
      const p = { x: a.x + (lc?.x || 0), y: a.y + (lc?.y || 0) };
      g.circle(p.x, p.y, px(9)).stroke({ width: px(3), color: colour[n.kind] || 0xffffff }).circle(p.x, p.y, px(9)).stroke({ width: px(1), color: 0x000000 });
      g.moveTo(p.x, p.y - px(9)).lineTo(p.x, p.y - n.height).stroke({ width: px(2), color: colour[n.kind] || 0xffffff, alpha: 0.8 });
      const o = toOut(p);
      labels.addChild(label(PIXI, `${e.id} ${EFFECT_WORDS[n.kind].toLowerCase()}${n.layer === 'middleground' ? '' : ` (${n.layer})`}${e.hidden ? ', hidden' : ''}`, o.x + 11, o.y - 8, { size: 11, bg: 0x3b1d0e }));
    }
    if (street.rumble) {
      const r = street.rumble;
      labels.addChild(label(PIXI, `Rumble: ${r.duration} s every ${(r.every || []).join(' to ')} s, ${r.strength} px${r.sound === false ? ', silent' : ''}`, 6, frame.height - 22, { size: 12, bg: 0x7c2d12 }));
    }
  }
  if (overlay.has('findings')) {
    const SEV = { fatal: 0xb91c1c, error: OVERLAY_COLOURS.unreached, warn: OVERLAY_COLOURS.Roof, info: OVERLAY_COLOURS.arrival };
    const seen = new Map();
    for (const f of findings || []) {
      if (!f.where || !Number.isFinite(f.where.x)) continue;
      const p = f.where.space === 'world' ? worldToScreen(street, f.where.x, f.where.y) : { x: f.where.x, y: f.where.y };
      const o = toOut(p);
      const n = seen.get(`${Math.round(o.x / 20)}:${Math.round(o.y / 20)}`) || 0;
      seen.set(`${Math.round(o.x / 20)}:${Math.round(o.y / 20)}`, n + 1);
      g.circle(p.x, p.y, px(7)).fill({ color: SEV[f.severity] || 0xffffff }).stroke({ width: px(2), color: 0x000000 });
      labels.addChild(label(PIXI, f.rule, o.x + 9, o.y - 8 + n * 16, { size: 12, bg: SEV[f.severity] || 0x000000 }));
    }
  }
  view.cullDecos?.(frame.cam.x, frame.cam.y, frame.vw, frame.vh, true);
  const missing = await settle(view);
  for (let i = 0; fx && fx.pending() && i < 40; i += 1) await new Promise((r) => setTimeout(r, 80));
  if (fx) app.renderer.render(app.stage);
  const rect = new PIXI.Rectangle(0, 0, frame.width, frame.height);
  const dataUrl = await app.renderer.extract.base64({ target: app.stage, frame: rect, resolution: 1, format: 'png' });
  fx?.destroy();
  view.destroy({ children: true });
  return { png: String(dataUrl).replace(/^data:image\/png;base64,/, ''), width: frame.width, height: frame.height, scale: frame.scale, view: frame.view, missing };
}

if (typeof window !== 'undefined' && document.querySelector('[data-builder-render]')) {
  window.groddleRender = render;
  window.groddleRenderReady = (ready = setup()).then(() => true);
}
