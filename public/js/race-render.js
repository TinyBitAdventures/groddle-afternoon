/**
 * Pixi drawing for the reconstructed race courses (js/race-courses.js).
 *
 * Everything here is clean vector work or recovered CC0 decos from
 * assets/decos/groddle; nothing is traced from the reference recordings.
 * renderRaceCourse returns the scene background container that
 * engine.enterScene installs as the street layer: worldH for the camera and
 * updateParallax(camX, camY) for the far layers.
 */

const DECO_DIR = 'assets/decos/groddle/';

/** Loading-screen colours per theme (top, bottom). */
export const RACE_THEME_LOADING = Object.freeze({
  space: ['#05050a', '#26263a'],
  crystal: ['#3a2a8c', '#d9d3f2'],
  amazing: ['#4a3626', '#7fd3f2'],
  warp: ['#21123d', '#8e1fc0'],
  star: ['#120a24', '#7d2ec2'],
  canyon: ['#5fb7c9', '#e8d79a'],
  lava: ['#170606', '#7a1410'],
});

export function raceLoadingColors(course) {
  return RACE_THEME_LOADING[course?.theme] || ['#14141c', '#2a2433'];
}

function seeded(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function hashString(text) {
  let h = 2166136261;
  for (const ch of String(text)) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Vertical gradient sprite from [[0..1, '#rrggbb'], ...] stops. */
export function gradientSprite(PIXI, stops, width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = 4;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 0, 256);
  for (const [at, color] of stops) grad.addColorStop(at, color);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 4, 256);
  const sprite = new PIXI.Sprite(PIXI.Texture.from(canvas));
  sprite.width = width;
  sprite.height = height;
  return sprite;
}

function parallaxLayer(factor) {
  return { factor };
}

/* ------------------------------------------------------------------ */
/* Platform styles                                                     */
/* ------------------------------------------------------------------ */

function drawGlass(g, p) {
  const { x1, x2, y1 } = p;
  const y = y1;
  g.beginFill(0x9aa3ad).drawRect(x1, y + 4, x2 - x1, 24).endFill();
  g.beginFill(0xc9d0d8).drawRect(x1, y + 2, x2 - x1, 18).endFill();
  g.beginFill(0xffffff, 0.96).drawRect(x1 - 2, y - 5, x2 - x1 + 4, 8).endFill();
  g.lineStyle(1, 0x7d8791, 0.9).moveTo(x1, y + 28).lineTo(x2, y + 28);
  for (let x = x1 + 150; x < x2 - 40; x += 170) {
    g.lineStyle(1, 0xa7b0ba, 0.9).moveTo(x, y + 3).lineTo(x, y + 28);
  }
  g.lineStyle(0);
  for (let x = x1 + 40; x < x2 - 60; x += 210) {
    g.beginFill(0xffffff, 0.35).drawPolygon([x, y + 4, x + 26, y + 4, x + 12, y + 20, x - 14, y + 20]).endFill();
  }
}

function drawSlab(g, p) {
  const { x1, x2, y1: y } = p;
  g.beginFill(0x8e98a3).drawPolygon([x1, y, x2, y, x2 - 10, y + 16, x1 + 10, y + 16]).endFill();
  g.beginFill(0xf4f6f8).drawPolygon([x1 + 12, y - 12, x2 - 12, y - 12, x2, y, x1, y]).endFill();
  g.lineStyle(1, 0xffffff, 0.9).moveTo(x1 + 12, y - 12).lineTo(x2 - 12, y - 12).lineStyle(0);
  g.beginFill(0xffffff, 0.5).drawPolygon([x1 + 40, y - 10, x1 + 70, y - 10, x1 + 58, y - 2, x1 + 28, y - 2]).endFill();
}

function drawGlassStairs(g, p) {
  const steps = Math.max(3, Math.round(Math.abs(p.x2 - p.x1) / 24));
  const w = (p.x2 - p.x1) / steps;
  const bottom = Math.max(p.y1, p.y2) + 26;
  for (let i = 0; i < steps; i += 1) {
    const sx = p.x1 + i * w;
    const t = (i + 0.5) / steps;
    const sy = p.y1 + (p.y2 - p.y1) * t;
    g.beginFill(0xc5ccd4).drawRect(sx, sy, w + 0.5, bottom - sy).endFill();
    g.beginFill(0xffffff, 0.95).drawRect(sx, sy - 3, w + 0.5, 5).endFill();
    g.lineStyle(1, 0x8f99a4, 0.7).moveTo(sx, sy + 2).lineTo(sx, bottom).lineStyle(0);
  }
}

function drawCube(g, p) {
  const depth = p.depth || 110;
  const cell = 104;
  const w = p.x2 - p.x1;
  const cols = Math.max(1, Math.round(w / cell));
  const cw = w / cols;
  const rows = Math.max(1, Math.round(depth / cell));
  const ch = depth / rows;
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const x = p.x1 + c * cw;
      const y = p.y1 + r * ch;
      g.beginFill(0xe6f6ff, 0.26).lineStyle(2, 0xffffff, 0.85).drawRect(x, y, cw, ch).endFill();
      g.lineStyle(1, 0xffffff, 0.35).moveTo(x + 8, y + ch - 8).lineTo(x + cw - 8, y + 8);
      g.lineStyle(0).beginFill(0x9ecbe6, 0.22).drawRect(x + cw * 0.62, y + 3, cw * 0.32, ch - 6).endFill();
    }
  }
  g.lineStyle(0).beginFill(0xffffff, 0.95).drawRect(p.x1 - 2, p.y1 - 4, w + 4, 6).endFill();
}

const PLATFORM_STYLES = {
  glass: drawGlass,
  slab: drawSlab,
  glassStairs: drawGlassStairs,
  cube: drawCube,
};

/* ------------------------------------------------------------------ */
/* Props                                                              */
/* ------------------------------------------------------------------ */

const DOME_COLORS = {
  pink: [0xff6fd2, 0xffc2f0],
  blue: [0x63c8ff, 0xc5ecff],
  yellow: [0xffd75a, 0xfff1b8],
};

function drawDome(PIXI, prop) {
  const g = new PIXI.Graphics();
  const r = prop.r || 70;
  const [main, light] = DOME_COLORS[prop.color] || DOME_COLORS.pink;
  // Plant inside: a stem and two seed-pod leaves.
  g.beginFill(0xd84b8a).drawRoundedRect(-r * 0.12, -r * 0.82, r * 0.24, r * 0.82, 6).endFill();
  g.beginFill(0xffd24a).drawEllipse(-r * 0.42, -r * 0.34, r * 0.28, r * 0.13).endFill();
  g.beginFill(0x8fe05a).drawEllipse(r * 0.4, -r * 0.5, r * 0.26, r * 0.12).endFill();
  g.beginFill(0xff8a3d).drawEllipse(r * 0.05, -r * 0.9, r * 0.16, r * 0.1).endFill();
  // Glass bubble.
  g.beginFill(main, 0.42).lineStyle(2, light, 0.9).arc(0, 0, r, Math.PI, 0).closePath().endFill();
  g.lineStyle(0).beginFill(0xffffff, 0.45).drawEllipse(-r * 0.45, -r * 0.62, r * 0.18, r * 0.09).endFill();
  g.lineStyle(4, 0xffffff, 0.35).arc(0, 0, r * 0.82, Math.PI * 1.08, Math.PI * 1.38);
  g.lineStyle(0).beginFill(0xd5dbe2).drawRect(-r - 6, -6, r * 2 + 12, 8).endFill();
  g.x = prop.x;
  g.y = prop.y;
  return g;
}

function drawCubeStack(PIXI, prop) {
  const g = new PIXI.Graphics();
  const size = 96;
  const cols = prop.cols || 2;
  const rows = prop.rows || 2;
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols - (r % 2); c += 1) {
      const x = -((cols * size) / 2) + c * size + (r % 2) * (size / 2);
      const y = -(r + 1) * size;
      g.beginFill(0xe6f6ff, 0.22).lineStyle(2, 0xffffff, 0.8).drawRect(x, y, size, size).endFill();
      g.lineStyle(1, 0xffffff, 0.3).moveTo(x + 8, y + size - 8).lineTo(x + size - 8, y + 8);
    }
  }
  g.x = prop.x;
  g.y = prop.y;
  g.alpha = 0.85;
  return g;
}

const PROP_DRAWERS = {
  dome: drawDome,
  cubeStack: drawCubeStack,
};

/* ------------------------------------------------------------------ */
/* Themes                                                             */
/* ------------------------------------------------------------------ */

function starField(PIXI, course, count, minR, maxR, alpha, seed) {
  const rand = seeded(seed);
  const g = new PIXI.Graphics();
  for (let i = 0; i < count; i += 1) {
    const x = rand() * course.width;
    const y = rand() * course.height;
    const r = minR + rand() * (maxR - minR);
    if (r > 1.6) g.beginFill(0xffffff, alpha * 0.1).drawCircle(x, y, r * 2).endFill();
    g.beginFill(0xffffff, alpha * (0.5 + rand() * 0.5)).drawCircle(x, y, r).endFill();
  }
  return g;
}

function paintSpace(PIXI, root, course) {
  const sky = new PIXI.Graphics();
  sky.beginFill(0x000000).drawRect(-200, -200, course.width + 400, course.height + 400).endFill();
  root.addChild(sky);
  const area = (course.width * course.height) / 1e6;
  const far = starField(PIXI, course, Math.round(area * 260), 0.6, 1.4, 0.75, hashString(`${course.id}:far`));
  far.parallax = 0.3;
  const near = starField(PIXI, course, Math.round(area * 46), 1.4, 2.6, 0.95, hashString(`${course.id}:near`));
  near.parallax = 0.65;
  root.addChild(far, near);
}

const THEMES = {
  space: paintSpace,
};

/* ------------------------------------------------------------------ */
/* Course                                                             */
/* ------------------------------------------------------------------ */

export function renderRaceCourse(PIXI, course) {
  const root = new PIXI.Container();
  root.sortableChildren = false;
  (THEMES[course.theme] || paintSpace)(PIXI, root, course);

  const back = new PIXI.Container();
  const front = new PIXI.Container();
  for (const deco of course.decor || []) {
    const sprite = PIXI.Sprite.from(`${DECO_DIR}${deco.name}.png`);
    sprite.anchor.set(deco.ax ?? 0.5, deco.ay ?? 1);
    sprite.x = deco.x;
    sprite.y = deco.y;
    const scale = deco.scale || 1;
    sprite.scale.set(deco.flip ? -scale : scale, scale);
    if (deco.tint != null) sprite.tint = deco.tint;
    if (deco.alpha != null) sprite.alpha = deco.alpha;
    if (deco.rotation) sprite.rotation = deco.rotation;
    if (deco.parallax) {
      sprite.parallax = deco.parallax;
      root.addChild(sprite);
    } else (deco.front ? front : back).addChild(sprite);
  }
  for (const prop of course.props || []) {
    const draw = PROP_DRAWERS[prop.kind];
    if (!draw) continue;
    const node = draw(PIXI, prop);
    (prop.front ? front : back).addChild(node);
  }
  root.addChild(back);

  const g = new PIXI.Graphics();
  for (const p of course.platforms) {
    const draw = PLATFORM_STYLES[p.style];
    if (draw) draw(g, p);
  }
  root.addChild(g);
  root.addChild(front);

  root.worldH = course.height;
  const layers = root.children.filter((child) => child.parallax);
  for (const layer of layers) {
    layer.baseX = layer.x;
    layer.baseY = layer.y;
  }
  root.updateParallax = (camX, camY) => {
    for (const layer of layers) {
      layer.x = layer.baseX + camX * (1 - layer.parallax);
      layer.y = layer.baseY + camY * (1 - layer.parallax);
    }
  };
  return root;
}

/** Striped finish posts with a red-and-white ribbon (race_end_position). */
export function drawFinishPosts(PIXI, finish) {
  const g = new PIXI.Graphics();
  const h = 124;
  for (const side of [-36, 36]) {
    g.beginFill(0x202020).drawRect(side - 5, -h, 10, h).endFill();
    for (let y = -h; y < 0; y += 16) g.beginFill(0xf5f5f5).drawRect(side - 5, y, 10, 8).endFill();
    g.beginFill(0x202020).drawCircle(side, -h - 2, 6).endFill();
  }
  const ry = -h * 0.55;
  g.beginFill(0xffffff).drawPolygon([-31, ry - 5, 31, ry - 9, 31, ry + 1, -31, ry + 5]).endFill();
  for (let i = 0; i < 6; i += 1) {
    const x = -31 + i * 11;
    g.beginFill(0xe2302d).drawPolygon([x, ry - 5 - i * 0.6, x + 6, ry - 5.5 - i * 0.6, x + 6, ry + 4.5 - i * 0.6, x, ry + 5 - i * 0.6]).endFill();
  }
  g.x = finish.x;
  g.y = finish.y + 2;
  return g;
}

/** Small checkpoint pennant; setPassed(true) turns it green. */
export function drawCheckpointFlag(PIXI, cp) {
  const g = new PIXI.Graphics();
  const paint = (passed) => {
    g.clear();
    g.beginFill(0xe8e8e8).drawRect(-2, -72, 4, 72).endFill();
    g.beginFill(passed ? 0x7fd44a : 0xffffff, 0.95).drawPolygon([2, -72, 34, -62, 2, -52]).endFill();
    g.lineStyle(1.5, passed ? 0x3d7d22 : 0x9a9a9a).drawPolygon([2, -72, 34, -62, 2, -52]).lineStyle(0);
    g.beginFill(0x5a5a5a).drawEllipse(0, 0, 8, 3).endFill();
  };
  paint(false);
  g.setPassed = paint;
  g.x = cp.x;
  g.y = cp.y + 1;
  return g;
}

/** The rainbow_winner arc over the champion. */
export function drawWinnerRainbow(PIXI) {
  const c = new PIXI.Container();
  const g = new PIXI.Graphics();
  const colors = [0xff4b4b, 0xff9d3b, 0xffe35b, 0x7fd44a, 0x4fb5ff, 0x9a6bff];
  colors.forEach((color, i) => {
    g.lineStyle(9, color, 0.9).arc(0, 0, 110 - i * 9, Math.PI * 1.02, Math.PI * 1.98);
  });
  c.addChild(g);
  const text = new PIXI.Text('Winner', {
    fontFamily: 'Arial',
    fontSize: 26,
    fontWeight: '900',
    fill: 0xffffff,
    stroke: 0x6b3fa0,
    strokeThickness: 5,
  });
  text.anchor.set(0.5, 1);
  text.y = -112;
  c.addChild(text);
  return c;
}
