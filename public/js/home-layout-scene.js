/**
 * The home street's layout read off the Pixi stage (js/home-layout.js has the
 * manifest and its rules): what the renderer draws inside the location view,
 * the picture's own crop, back to front. Every Sprite whose texture came from
 * one of the game's art files becomes an image at its drawn box; the sky and
 * the field's flat bands come from their tags (homes-feature drawLandscape:
 * `homeLayoutSky`, `homeLayoutFills`); the avatar becomes the owner's own
 * still (the site has it: Profiles avatar); text, vector avatars and effects
 * are left out. A display object that is a registered target (engine.register)
 * or carries a `homeLayout` description owns the art under it: that is a spot.
 *
 * `walkHomeScene` takes the stage through a small adapter so tests can feed it
 * plain objects; `collectHomeLayout(engine)` is the game's call.
 */
import { AVATAR_STILL } from './profiles.js?v=054ca723';
import { buildHomeLayout, describeHomeThing, splitFrameToSheet } from './home-layout.js?v=ca0e9d8e';

/** The URL a texture source was loaded from (js/textures.js labels sources with it), or ''. */
function sourceUrl(source) {
  const url = source?.groddleUrl || source?.label;
  return typeof url === 'string' ? url : '';
}

/**
 * PURE (given the adapter): the draw records and spots of a display tree.
 *
 * @param {any} root the container to walk (the camera's world)
 * @param {{
 *   toStage: (node: any, points: {x: number, y: number}[]) => {x: number, y: number}[],
 *   isSprite: (node: any) => boolean,
 *   localBounds: (node: any) => { x: number, y: number, width: number, height: number } | null,
 *   targets: Map<any, any>,
 *   player?: any,
 *   skip?: Set<any>,
 * }} io
 */
export function walkHomeScene(root, io) {
  const draw = [];
  const spots = [];
  const quad = (r) => [{ x: r.x, y: r.y }, { x: r.x + r.width, y: r.y }, { x: r.x + r.width, y: r.y + r.height }, { x: r.x, y: r.y + r.height }];
  const aabbOf = (points) => [Math.min(...points.map((p) => p.x)), Math.min(...points.map((p) => p.y)), Math.max(...points.map((p) => p.x)), Math.max(...points.map((p) => p.y))];
  const spotIndex = new Map();
  /** The spot a display object is (made once, whichever of it and its parts is drawn first), or null. */
  const spotOf = (node) => {
    if (spotIndex.has(node)) return spotIndex.get(node);
    const target = io.targets.get(node);
    const desc = target || node.homeLayout ? describeHomeThing({ classId: target?.classId, state: target?.state, tag: node.homeLayout }) : null;
    let index = null;
    if (desc) {
      const bounds = io.localBounds(node);
      spots.push({ desc, aabb: bounds && bounds.width > 0 && bounds.height > 0 ? aabbOf(io.toStage(node, quad(bounds))) : null });
      index = spots.length - 1;
    }
    spotIndex.set(node, index);
    return index;
  };
  const visit = (node, alpha, owner, par = 1) => {
    if (!node || node.destroyed || node.visible === false || node.renderable === false) return;
    // A parallax layer (homes-feature drawLandscape lc.parallaxF): everything under it scrolls at f.
    if (Number.isFinite(node.parallaxF)) par = node.parallaxF;
    if (io.skip?.has(node)) return;
    const a = alpha * (node.alpha == null ? 1 : Number(node.alpha));
    if (!(a > 0.01)) return;
    if (node === io.player) {
      avatar(node, a);
      return;
    }
    // A spot: a target the game registered, or art that says what it is; or art drawn apart
    // from its thing (a garden's bed beside the garden's foot: homeLayoutPartOf).
    if (node.homeLayoutPartOf) {
      const of = spotOf(node.homeLayoutPartOf);
      if (of != null) owner = of;
    } else {
      const own = spotOf(node);
      if (own != null) owner = own;
    }
    if (Array.isArray(node.homeLayoutSky)) {
      const b = io.localBounds(node);
      if (b) {
        const box = aabbOf(io.toStage(node, quad(b)));
        draw.push({ sky: node.homeLayoutSky, rect: [box[0], box[1], box[2] - box[0], box[3] - box[1]], f: 0 });
      }
      return;
    }
    if (typeof node.homeLayoutText === 'string') {
      const b = io.localBounds(node);
      if (b && b.width > 0 && b.height > 0) draw.push({ txt: node.homeLayoutText, corners: io.toStage(node, quad(b)), f: par, ...(owner != null ? { spot: owner } : {}) });
      return;
    }
    if (Array.isArray(node.homeLayoutFills)) {
      for (const [x, y, w, h, col, o = 1] of node.homeLayoutFills) {
        const box = aabbOf(io.toStage(node, quad({ x, y, width: w, height: h })));
        draw.push({ col, rect: [box[0], box[1], box[2] - box[0], box[3] - box[1]], alpha: a * o, f: par });
      }
    } else if (io.isSprite(node)) {
      image(node, a, owner, par);
    }
    const kids = node.children || [];
    const ordered = node.sortableChildren ? kids.map((c, i) => [c, i]).sort((p, q) => (p[0].zIndex || 0) - (q[0].zIndex || 0) || p[1] - q[1]).map((p) => p[0]) : kids;
    for (const child of ordered) visit(child, a, owner, par);
  };
  const image = (node, a, owner, par) => {
    const tex = node.texture;
    const source = tex?.source;
    let url = sourceUrl(source);
    if (!url) return;
    let frame = tex.frame ? { x: tex.frame.x, y: tex.frame.y, width: tex.frame.width, height: tex.frame.height } : null;
    let sheet = source ? { width: source.width, height: source.height } : null;
    // A split 3x part (js/sprite-hires.js): the frame on its 1x sheet.
    const moved = splitFrameToSheet(url, frame);
    if (moved) {
      url = moved.sheet;
      frame = moved.frame;
      sheet = null;
    }
    const bounds = io.localBounds(node);
    if (!bounds || !(bounds.width > 0 && bounds.height > 0)) return;
    const rec = { art: url, corners: io.toStage(node, quad(bounds)), frame, sheet, alpha: a, f: par };
    if (node.tint != null && node.tint !== 0xffffff) rec.tint = node.tint;
    if (owner != null) rec.spot = owner;
    draw.push(rec);
  };
  // The avatar: the owner's profile still (172 x 248, scale 1.76, feet 4 px above its foot; js/profiles.js) where it stands.
  const avatar = (node, a) => {
    const foot = io.toStage(node.parent || node, [{ x: node.x, y: node.y }])[0];
    const s = Math.abs(Number(node.scale?.y) || 1) * (io.parentScale ? io.parentScale(node) : 1);
    const k = s / AVATAR_STILL.scale;
    const w = AVATAR_STILL.w * k;
    const h = AVATAR_STILL.h * k;
    const box = [foot.x - w / 2, foot.y - h + 4 * k, foot.x + w / 2, foot.y + 4 * k];
    // The still faces left (PNGUtil.as 100); facing right is the still mirrored.
    const desc = { k: 'avatar', ...(node.facing === 'right' ? { f: 1 } : {}) };
    spots.push({ desc, aabb: box });
    draw.push({ avatar: true, rect: [box[0], box[1], w, h], mirrored: desc.f === 1, alpha: a, spot: spots.length - 1, f: 1 });
  };
  visit(root, 1, null);
  return { draw, spots };
}

/**
 * The manifest of the home street (null before the renderer starts): version
 * 1, the location view's crop as engine.snapshotView draws the picture; or,
 * with `street`, version 2, the whole street (engine.worldW) with the view the
 * player has now as its starting frame, every layer in its own coordinates.
 */
export function collectHomeLayout(engine, { street = false } = {}) {
  const PIXI = engine?.PIXI;
  const stage = engine?.stage;
  const world = engine?.entityLayer?.parent;
  const cam = engine?.camera;
  if (!PIXI || !stage || !world || !cam) return null;
  const stageInverse = stage.getGlobalTransform(new PIXI.Matrix(), false).clone().invert();
  const matrices = new Map();
  const matrixOf = (node) => {
    let m = matrices.get(node);
    if (!m) {
      m = node.getGlobalTransform(new PIXI.Matrix(), false).clone().prepend(stageInverse);
      matrices.set(node, m);
    }
    return m;
  };
  const targets = new Map();
  for (const t of engine.interactables || []) {
    if (t?.sprite && !t.sprite.destroyed && !targets.has(t.sprite)) targets.set(t.sprite, t);
  }
  const { draw, spots } = walkHomeScene(world, {
    targets,
    player: engine.player,
    skip: new Set([engine.fxLayer].filter(Boolean)),
    isSprite: (node) => node instanceof PIXI.Sprite,
    localBounds: (node) => {
      try {
        const b = node.getLocalBounds();
        return { x: b.x, y: b.y, width: b.width, height: b.height };
      } catch {
        return null;
      }
    },
    toStage: (node, points) => {
      const m = matrixOf(node);
      return points.map((p) => m.apply(p, new PIXI.Point()));
    },
  });
  return buildHomeLayout({ w: cam.w, h: cam.h, draw, spots, street: street ? { sw: Number(engine.worldW) || cam.w, camX: cam.x } : null });
}
