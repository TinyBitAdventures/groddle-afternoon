/**
 * The whole home location drawn to one picture (G1284; the rules and what Glitch did are in
 * js/home-shot.js). Reusable: the camera's "Snap the whole house" (features/snaps-feature.js) and
 * any automatic picture of a home (saveHomeImg's kind: a set width, no camera) call the same
 * function, and nothing here reads Camera Mode's look or the player's view.
 *
 *   renderHomeLocation(engine, { kind, resolution, width, maxW, maxH })
 *     -> Promise<{ canvas, w, h, scale, kind, floors, placeW, placeH } | null>
 *
 *   kind        'house' | 'tower' | 'street', or omitted for where the player stands
 *   resolution  pixels per world px (a Snap: the renderer's own), capped to fit maxW x maxH
 *   width       a set picture width instead (an automatic upload: 720 as homes.setImage took)
 *   public      a picture that can be shown publicly (G1283: an upload for the site's pages):
 *               the live scene is drawn without players or anything over them (bubbles, name
 *               plates, the hint; js/public-picture.js), as Glitch's saveHomeImg left every PC
 *               and overlay out. The camera's whole-house Snap leaves it off and keeps the screen.
 *
 * The place comes from features/homes-feature.js (engine.query('homeShotSource', engine, kind)):
 * the house or Tower as its floors, ground floor first, each { index, top, bottom, bound, pitch,
 * x0 } with `live: true` for the floor the player stands on (drawn from the scene itself, the
 * players, NPCs and stacks as drawn) or `build()` for one they are not on (a container drawn from
 * what the home keeps, destroyed here after); the street as { frame }, the whole street.
 *
 * R37 (a whole-street picture taken from the camera's partial state): everything is drawn from
 * the full scene, never the camera's. The live scene is drawn with the camera moved over the whole
 * place (engine.viewAt: parallax set and decos culled for that frame, then put back; HOMESHOT's
 * path) and every texture under it is waited for first, so nothing still loading comes out blank.
 */
import { readbackCanvas } from './render-probe.js?v=519c86ef';
import { isLoaded, whenLoaded } from './textures.js?v=b8e38103';
import { homeShotBands, homeShotRows, homeShotScale, homeShotSize } from './home-shot.js?v=8198618a';
import { homeFrameFor } from './home-layout-scene.js?v=35c21dc7';
import { withPublicView } from './public-picture.js?v=1a0b03fa';

/** How long a texture still loading is waited for before the picture is drawn anyway (ms). */
export const HOME_SHOT_WAIT_MS = 4000;

/** The textures still loading under `root` (visible nodes only). */
export function pendingTextures(root) {
  const out = new Set();
  const visit = (node) => {
    if (!node || node.destroyed || node.visible === false || node.renderable === false) return;
    const tex = node.texture;
    if (tex && !isLoaded(tex)) out.add(tex);
    for (const child of node.children || []) visit(child);
  };
  visit(root);
  return [...out];
}

async function settle(textures, timeoutMs) {
  if (!textures.length) return;
  await Promise.race([
    Promise.allSettled(textures.map((t) => whenLoaded(t))),
    new Promise((r) => setTimeout(r, timeoutMs)),
  ]);
}

function defaultIo(engine) {
  const { PIXI } = engine;
  return {
    read(container, { width, height, resolution, x, y }) {
      const transform = new PIXI.Matrix(1, 0, 0, 1, -x, -y);
      return readbackCanvas(PIXI, engine.renderer, { width, height, resolution, passes: [{ container, transform }] });
    },
    canvas(w, h) {
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      return c;
    },
  };
}

/**
 * The whole home street as one frame: HOMESHOT's frame (home-layout-scene homeFrameFor: a
 * computer's view height, its foot on the scene's foot, whatever this device's window) stretched
 * over the street's whole width, or null where the camera cannot move.
 */
export function wholeStreetFrame(engine) {
  const f = homeFrameFor(engine);
  const sw = Math.round(Number(engine?.worldW) || 0);
  if (!f || !(sw > 0)) return null;
  return { x: 0, y: f.y, w: sw, h: f.h };
}

/** The world container the scene is drawn in (the camera's), or null. */
function worldOf(engine) {
  return engine?.entityLayer?.parent || null;
}

/**
 * One live frame of the scene: the camera over it (engine.viewAt), textures waited for, drawn, put
 * back. `isPublic`: drawn with players and everything over them hidden (withPublicView).
 */
async function liveFrame(engine, io, frame, resolution, timeoutMs, isPublic = false) {
  const world = worldOf(engine);
  if (!world || typeof engine.viewAt !== 'function') return null;
  await settle(engine.viewAt(frame, () => pendingTextures(world)), timeoutMs);
  const read = () => io.read(world, { width: frame.w, height: frame.h, resolution, x: frame.x, y: frame.y });
  return engine.viewAt(frame, () => (isPublic ? withPublicView(engine, read) : read()));
}

/**
 * PURE (given `io`): the place `source` describes drawn to one canvas. `opts.io` replaces the
 * renderer for tests: { read(container, { width, height, resolution, x, y }), canvas(w, h) }.
 */
export async function renderHomeShot(engine, source, opts = {}) {
  if (!source) return null;
  // engine.homeShotIo: a test's renderer (tests/g1284-whole-house-snap.test.js), never set by the game.
  const io = opts.io || engine?.homeShotIo || defaultIo(engine);
  const timeoutMs = Number.isFinite(opts.timeoutMs) ? opts.timeoutMs : HOME_SHOT_WAIT_MS;
  const fit = { resolution: opts.resolution, width: opts.width, ...(opts.maxW ? { maxW: opts.maxW } : {}), ...(opts.maxH ? { maxH: opts.maxH } : {}) };
  if (source.kind === 'street') {
    const f = source.frame || wholeStreetFrame(engine);
    if (!f || !(f.w > 0) || !(f.h > 0)) return null;
    const scale = homeShotScale({ w: f.w, h: f.h, ...fit });
    const canvas = await liveFrame(engine, io, f, scale, timeoutMs, opts.public === true);
    if (!canvas?.width) return null;
    return { canvas, w: canvas.width, h: canvas.height, scale, kind: 'street', floors: 1, placeW: f.w, placeH: f.h };
  }
  const plan = homeShotBands(source.floors);
  const width = Number(source.width);
  if (!plan || !(width > 0)) return null;
  const scale = homeShotScale({ w: width, h: plan.h, ...fit });
  const size = homeShotSize(width, plan.h, scale);
  const rows = homeShotRows(plan.bands, scale);
  const out = io.canvas(size.w, size.h);
  const ctx = out.getContext('2d');
  ctx.fillStyle = '#3b2a1e';
  ctx.fillRect(0, 0, size.w, size.h);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  const byIndex = new Map(source.floors.map((f, i) => [f.index ?? i, f]));
  let drawn = 0;
  for (let i = 0; i < plan.bands.length; i += 1) {
    const band = plan.bands[i];
    const floor = byIndex.get(band.index);
    const frame = { x: Number(floor.x0) || 0, y: band.y0, w: width, h: band.y1 - band.y0 };
    let piece = null;
    if (floor.live) {
      piece = await liveFrame(engine, io, frame, scale, timeoutMs, opts.public === true);
    } else if (typeof floor.build === 'function') {
      const container = floor.build();
      try {
        await settle(pendingTextures(container), timeoutMs);
        piece = io.read(container, { width: frame.w, height: frame.h, resolution: scale, x: frame.x, y: frame.y });
      } finally {
        container?.destroy?.({ children: true });
      }
    }
    if (!piece?.width) continue;
    ctx.drawImage(piece, 0, rows[i].y, size.w, rows[i].h);
    drawn += 1;
    // A floor's canvas is let go at once (several at 2x add up on a phone).
    piece.width = 0;
    piece.height = 0;
  }
  if (!drawn) return null;
  return { canvas: out, w: size.w, h: size.h, scale, kind: source.kind, floors: plan.bands.length, placeW: width, placeH: plan.h };
}

/** The whole home location where the player stands (or `opts.kind`), drawn (renderHomeShot); null when there is none. */
export async function renderHomeLocation(engine, opts = {}) {
  const source = engine?.query?.('homeShotSource', engine, opts.kind || null);
  if (!source) return null;
  return renderHomeShot(engine, source, opts);
}
