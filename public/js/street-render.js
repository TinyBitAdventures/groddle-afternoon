/**
 * Build a multi-layer Pixi street view from original street JSON + CoU deco PNGs.
 */

import {
  worldToScreen,
  streetWidth,
  streetHeight,
  platformsScreen,
  signpostNear,
  pickConnection,
} from './street-model.js';
import { availableStreetTsids } from './street-loader.js';

const DECO_BASE = 'assets/decos/groddle/';
const PLACEHOLDER = 0x5a7a4a;
/** Original engine art from TSEngineAssets (SignpostView.as). */
const SIGNPOST = {
  post: 'assets/ui/signpost/signpost_post.png',
  arm: 'assets/ui/signpost/signpost_arm.png',
  shadow: 'assets/ui/signpost/signpost_shadow.png',
  /** Original holder.scale = 0.8 */
  scale: 0.8,
};

/** @type {Set<string>|null} */
let decoManifest = null;
/** @type {Record<string, import('pixi.js').Texture>|null} */
let signTextures = null;

/**
 * Preload original signpost PNGs (post / arm / shadow).
 * @param {typeof PIXI} PIXI
 */
export async function loadSignpostTextures(PIXI) {
  if (signTextures) return signTextures;
  signTextures = {};
  await Promise.all(
    Object.entries(SIGNPOST)
      .filter(([k]) => k !== 'scale')
      .map(
        ([key, url]) =>
          new Promise((resolve) => {
            const tex = PIXI.Texture.from(url);
            const done = () => {
              signTextures[key] = tex;
              resolve();
            };
            if (tex.baseTexture?.valid) done();
            else {
              tex.baseTexture?.once?.('loaded', done);
              tex.baseTexture?.once?.('error', done);
              // safety
              setTimeout(done, 2000);
            }
          })
      )
  );
  return signTextures;
}

/**
 * Build a SignpostView-style post with alternating wooden arms + labels.
 * Mirrors SignpostView.as (post, shadow, arms left/right at ±5.5°, scale 0.8).
 * @param {typeof PIXI} PIXI
 * @param {object} signpost
 * @param {{ x: number, y: number }} pos screen
 */
function buildSignpostSprite(PIXI, signpost, pos) {
  const g = new PIXI.Container();
  g.x = pos.x;
  g.y = pos.y;
  g.zIndex = 8000;
  g.eventMode = 'none';
  /** @type {{ arms: any[], labels: any[], baseLabelFills: number[] }} */
  g.signHoverParts = { arms: [], labels: [], baseLabelFills: [] };
  g.signBoards = [];
  g.signScale = SIGNPOST.scale;

  const holder = new PIXI.Container();
  holder.scale.set(SIGNPOST.scale);
  g.addChild(holder);

  const tex = signTextures || {};
  // Shadow
  if (tex.shadow && !tex.shadow.baseTexture?.destroyed) {
    const shadow = new PIXI.Sprite(tex.shadow);
    shadow.anchor.set(0.5, 1);
    shadow.y = 6;
    shadow.alpha = 0.75;
    shadow.name = 'sign-shadow';
    holder.addChild(shadow);
  }
  // Post (not brightened on hover — only arms + text)
  let postH = 200;
  if (tex.post && !tex.post.baseTexture?.destroyed) {
    const post = new PIXI.Sprite(tex.post);
    post.anchor.set(0.5, 1);
    post.y = 0;
    post.name = 'sign-post';
    holder.addChild(post);
    postH = post.height || 200;
  } else {
    const post = new PIXI.Graphics();
    post.beginFill(0x5a3a22);
    post.drawRoundedRect(-8, -200, 16, 200, 3);
    post.beginFill(0x6b4423);
    post.drawRoundedRect(-10, -12, 20, 14, 3);
    post.endFill();
    post.name = 'sign-post';
    holder.addChild(post);
    postH = 200;
  }

  // Collect visible connections (all, with preferred loaded one first for label emphasis)
  const connects = (signpost.connects || []).filter((c) => c && (c.label || c.tsid));
  const available = availableStreetTsids();
  // Show up to 4 arms like typical posts
  const shown = connects.slice(0, 4);
  shown.forEach((conn, visibleI) => {
    const leftSide = Boolean(visibleI % 2);
    const armHolder = new PIXI.Container();
    const armY = -postH + visibleI * 28 + 32;
    armHolder.y = armY;
    armHolder.rotation = ((leftSide ? 5.5 : -5.5) * Math.PI) / 180;
    armHolder.x = leftSide ? -2 : 2;
    armHolder.name = 'sign-arm-holder';

    const labelText = conn.label || conn.tsid || 'Somewhere';
    let armW = 120;
    let armSprite = null;
    if (tex.arm && !tex.arm.baseTexture?.destroyed) {
      const arm = new PIXI.Sprite(tex.arm);
      arm.anchor.set(0, 0.5);
      // stretch arm to fit text roughly
      const approx = Math.max(100, Math.min(220, 18 + labelText.length * 9));
      arm.width = approx;
      arm.height = Math.max(22, (tex.arm.height || 30) * (approx / (tex.arm.width || 260)));
      if (leftSide) {
        arm.scale.x *= -1;
        arm.x = 0;
      }
      armW = Math.abs(arm.width);
      arm.name = 'sign-arm';
      armSprite = arm;
      holder.addChild(armHolder);
      armHolder.addChild(arm);
    } else {
      const arm = new PIXI.Graphics();
      arm.beginFill(0xd4b896);
      arm.lineStyle(1, 0x8a6a40, 0.8);
      const armLen = Math.max(100, Math.min(200, 20 + labelText.length * 8));
      arm.drawRoundedRect(leftSide ? -armLen : 0, -12, armLen, 24, 3);
      arm.endFill();
      armW = armLen;
      arm.name = 'sign-arm';
      armSprite = arm;
      holder.addChild(armHolder);
      armHolder.addChild(arm);
    }
    if (armSprite) g.signHoverParts.arms.push(armSprite);

    const isLoaded = (() => {
      try {
        return !!pickConnection({ connects: [conn] }, available);
      } catch {
        return false;
      }
    })();

    const baseFill = isLoaded ? 0x2a1a08 : 0x4a3a28;
    const label = new PIXI.Text(labelText, {
      fontFamily: 'Trebuchet MS, Georgia, serif',
      fontSize: 13,
      fill: baseFill,
      fontWeight: '700',
      dropShadow: true,
      dropShadowColor: 0xfff8e8,
      dropShadowBlur: 0,
      dropShadowDistance: 1,
      dropShadowAlpha: 0.85,
    });
    label.anchor.set(0.5, 0.5);
    // Center on arm
    if (leftSide) label.x = -armW * 0.5;
    else label.x = armW * 0.5;
    label.y = -1;
    label.name = 'sign-label';
    label._baseFill = baseFill;
    armHolder.addChild(label);
    g.signHoverParts.labels.push(label);
    g.signHoverParts.baseLabelFills.push(baseFill);
    g.signBoards.push({
      index: visibleI,
      connection: conn,
      arm: armSprite,
      label,
      baseFill,
      x: armHolder.x,
      y: armHolder.y,
      rotation: armHolder.rotation,
      hitArea: {
        x: leftSide ? -armW : 0,
        y: -15,
        width: armW,
        height: 30,
      },
    });
  });

  if (!shown.length) {
    const empty = new PIXI.Text('Signpost', {
      fontFamily: 'Trebuchet MS, sans-serif',
      fontSize: 12,
      fill: 0x3a2a18,
      fontWeight: '700',
    });
    empty.anchor.set(0.5, 1);
    empty.y = -postH - 8;
    empty.name = 'sign-label';
    empty._baseFill = 0x3a2a18;
    holder.addChild(empty);
    g.signHoverParts.labels.push(empty);
    g.signHoverParts.baseLabelFills.push(0x3a2a18);
  }

  g.signpost = signpost;
  return g;
}

/**
 * Brighten only sign arms + destination text (not post/shadow).
 * @param {PIXI.Container} g  signpost container from buildSignpostSprite
 * @param {boolean} on
 * @param {number|null} [boardIndex] individual arm index; null affects every arm
 */
export function setSignpostHover(g, on, boardIndex = null) {
  if (!g || g.destroyed) return;
  const boards = g.signBoards || [];
  for (const board of boards) {
    const active = Boolean(on && (boardIndex == null || board.index === boardIndex));
    const arm = board.arm;
    if (!arm || arm.destroyed) continue;
    if (arm.tint !== undefined) arm.tint = active ? 0xfff0c8 : 0xffffff;
    // Graphics arms: slight alpha bump
    if (arm.geometry) arm.alpha = 1;
    const label = board.label;
    if (!label || label.destroyed || !label.style) continue;
    const base = board.baseFill ?? label._baseFill ?? 0x2a1a08;
    if (active) {
      // Brighter cream lettering
      label.style.fill = 0xfff8e0;
      label.style.dropShadow = true;
      label.style.dropShadowColor = 0x5a4010;
      label.style.dropShadowBlur = 2;
      label.style.dropShadowDistance = 1;
      label.style.dropShadowAlpha = 0.55;
    } else {
      label.style.fill = base;
      label.style.dropShadowColor = 0xfff8e8;
      label.style.dropShadowBlur = 0;
      label.style.dropShadowDistance = 1;
      label.style.dropShadowAlpha = 0.85;
    }
  }
}

/**
 * Hit-test one destination board in world/Pixi coordinates. The post and other
 * arms deliberately do not count, matching the original per-destination UI.
 * @param {any[]} signViews
 * @param {number} worldX
 * @param {number} worldY
 */
export function signpostBoardAt(signViews, worldX, worldY) {
  for (const view of [...(signViews || [])].reverse()) {
    if (!view || view.destroyed) continue;
    const scale = Number(view.signScale) || 1;
    const holderX = (Number(worldX) - (Number(view.x) || 0)) / scale;
    const holderY = (Number(worldY) - (Number(view.y) || 0)) / scale;
    for (const board of [...(view.signBoards || [])].reverse()) {
      const dx = holderX - (Number(board.x) || 0);
      const dy = holderY - (Number(board.y) || 0);
      const rotation = Number(board.rotation) || 0;
      const cos = Math.cos(rotation);
      const sin = Math.sin(rotation);
      const localX = dx * cos + dy * sin;
      const localY = -dx * sin + dy * cos;
      const hit = board.hitArea;
      if (
        hit &&
        localX >= hit.x &&
        localX <= hit.x + hit.width &&
        localY >= hit.y &&
        localY <= hit.y + hit.height
      ) {
        return {
          view,
          board,
          index: board.index,
          connection: board.connection,
        };
      }
    }
  }
  return null;
}

/** Load list of available deco basenames (no .png). */
export async function loadDecoManifest() {
  if (decoManifest) return decoManifest;
  try {
    const res = await fetch('assets/decos/manifest.json?v=greedy-story-2');
    if (res.ok) {
      const list = await res.json();
      decoManifest = new Set(list);
      return decoManifest;
    }
  } catch { /* */ }
  decoManifest = new Set();
  return decoManifest;
}

function makePlaceholder(PIXI, deco, pos) {
  const g = new PIXI.Graphics();
  const w = deco.w || 48;
  const h = deco.h || 32;
  g.beginFill(PLACEHOLDER, 0.45);
  g.drawRoundedRect(-w / 2, -h, w, h, 3);
  g.endFill();
  g.x = pos.x;
  g.y = pos.y;
  g.zIndex = deco.z || 0;
  return g;
}

/**
 * @param {import('./street-model.js').StreetData} street
 * @param {typeof PIXI} PIXI
 * @param {{
 *   decoBase?: string,
 *   available?: Set<string>,
 *   debugPlatforms?: boolean,
 *   cameraBottomPadding?: number
 * }} [opts]
 */
export function buildStreetView(street, PIXI, opts = {}) {
  const decoBase = opts.decoBase || DECO_BASE;
  const available = opts.available || decoManifest || new Set();
  const root = new PIXI.Container();
  root.sortableChildren = true;

  const W = streetWidth(street);
  const sourceH = streetHeight(street);
  const plats = platformsScreen(street);
  const deepestPlatformY = plats.reduce(
    (deepest, platform) => Math.max(deepest, platform.y1, platform.y2),
    sourceH
  );
  const cameraBottomPadding = Math.max(0, Number(opts.cameraBottomPadding) || 0);
  const H = Math.ceil(Math.max(sourceH, deepestPlatformY + cameraBottomPadding));

  // Sky / depth backdrop (not solid ground strip alone)
  const sky = new PIXI.Graphics();
  const themeTop = 0x8eb8d8;
  const themeMid = 0xb5d4a0;
  const themeBot = 0x6b8f3c;
  sky.beginFill(themeTop);
  sky.drawRect(0, 0, W, sourceH * 0.45);
  sky.beginFill(themeMid);
  sky.drawRect(0, sourceH * 0.4, W, sourceH * 0.35);
  sky.beginFill(themeBot);
  sky.drawRect(0, sourceH * 0.7, W, Math.max(sourceH * 0.35, H - sourceH * 0.7));
  sky.endFill();
  sky.zIndex = -1000;
  root.addChild(sky);

  // Soft horizon clouds
  const clouds = new PIXI.Graphics();
  for (let i = 0; i < 20; i++) {
    const x = 80 + i * (W / 18);
    const y = 40 + (i * 41) % 90;
    const r = 50 + (i * 17) % 40;
    clouds.beginFill(0xffffff, 0.55);
    clouds.drawEllipse(x, y, r, r * 0.45);
    clouds.endFill();
  }
  clouds.zIndex = -900;
  root.addChild(clouds);

  const layerContainers = [];
  const decoViews = new Map();
  const missingSprites = new Set();
  let drawn = 0;

  for (let li = 0; li < (street.layers || []).length; li++) {
    const layer = street.layers[li];
    const lc = new PIXI.Container();
    lc.sortableChildren = true;
    lc.zIndex = (layer.z ?? li) * 10;
    lc.label = layer.id;

    for (const deco of layer.decos || []) {
      // Archived `middleground` decos use location/world coordinates, while
      // authored depth layers (`T_<timestamp>`) store registration points in
      // the layer's already-normalized 0..width / 0..height canvas space.
      // Applying worldToScreen twice pushed entire underground race layers
      // one street-width down/right, leaving only collision debug lines.
      const pos = /^T_/.test(String(layer.id || ''))
        ? { x: deco.x, y: deco.y }
        : worldToScreen(street, deco.x, deco.y);
      if (!available.has(deco.sprite)) {
        missingSprites.add(deco.sprite);
        // skip tiny missing decorations to reduce noise; keep platform-like names as placeholders
        if (/platform|dirt|mound|crosssection|patch|trunk|ladder/i.test(deco.sprite)) {
          lc.addChild(makePlaceholder(PIXI, deco, pos));
        }
        continue;
      }
      const url = `${decoBase}${deco.sprite}.png`;
      const tex = PIXI.Texture.from(url);
      const spr = new PIXI.Sprite(tex);
      spr.anchor.set(0.5, 1);
      if (deco.w > 0) spr.width = deco.w;
      if (deco.h > 0) spr.height = deco.h;
      if (!tex.valid) {
        tex.baseTexture.once('loaded', () => {
          if (deco.w > 0) spr.width = deco.w;
          if (deco.h > 0) spr.height = deco.h;
        });
      }
      spr.x = pos.x;
      spr.y = pos.y;
      spr.zIndex = deco.z || 0;
      if (deco.r) spr.angle = deco.r;
      spr.glitchDecoId = deco.id || '';
      spr.glitchDecoName = deco.name || '';
      if (spr.glitchDecoId) decoViews.set(spr.glitchDecoId, spr);
      lc.addChild(spr);
      drawn += 1;
    }
    root.addChild(lc);
    layerContainers.push(lc);
  }
  root.decoDrawn = drawn;
  root.decoViews = decoViews;

  // Collision geometry is normally invisible, as it was in the original
  // client. Keep an explicit opt-in overlay for geometry troubleshooting.
  if (opts.debugPlatforms === true) {
    const platG = new PIXI.Graphics();
    platG.zIndex = 5000;
    for (const p of plats) {
      platG.lineStyle(2, 0x3d2a14, 0.35);
      platG.moveTo(p.x1, p.y1);
      platG.lineTo(p.x2, p.y2);
    }
    root.addChild(platG);
  }

  // Signposts — original post/arm/shadow art (TSEngineAssets → SignpostView.as)
  const signViews = [];
  for (const s of street.signposts || []) {
    const pos = worldToScreen(street, s.x, s.y);
    const g = buildSignpostSprite(PIXI, s, pos);
    g.nav = pickConnection(s, availableStreetTsids());
    root.addChild(g);
    signViews.push(g);
  }

  root.street = street;
  root.platformsScreen = plats;
  root.signViews = signViews;
  root.worldW = W;
  root.worldH = H;
  root.sourceWorldH = sourceH;
  root.cameraBottomPadding = cameraBottomPadding;
  root.missingSprites = missingSprites;
  return root;
}

export { signpostNear, pickConnection, platformsScreen, worldToScreen };
