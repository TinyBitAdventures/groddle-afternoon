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

/* Shared helpers for the earthy themes. */

function floorBottom(p, ctx) {
  const floorY = ctx.course.floor?.y ?? ctx.course.height;
  return Math.max(p.y1, p.y2) + (p.depth || Math.max(60, floorY - Math.max(p.y1, p.y2) + 40));
}

function jaggedBottom(x1, x2, y, rand, depth = 18, step = 26) {
  const pts = [];
  for (let x = x2; x >= x1; x -= step) pts.push(x, y + rand() * depth);
  pts.push(x1, y);
  return pts;
}

function drawRockMass(g, p, ctx, palette, opts = {}) {
  const rand = seeded(hashString(p.id));
  const bottom = opts.bottom ?? floorBottom(p, ctx);
  const inset = opts.inset ?? 0;
  const pts = [p.x1, p.y1, p.x2, p.y2, p.x2 - inset, bottom];
  pts.push(...jaggedBottom(p.x1 + inset, p.x2 - inset, bottom, rand, opts.jag ?? 0).slice(2));
  g.beginFill(palette.body).drawPolygon(pts).endFill();
  // Strata and boulder shading.
  const h = bottom - Math.min(p.y1, p.y2);
  for (let i = 0; i < Math.min(14, Math.floor(h / 70)); i += 1) {
    const t = (i + 1) / (Math.floor(h / 70) + 1);
    const y = Math.min(p.y1, p.y2) + h * t;
    g.lineStyle(3, palette.line, 0.35).moveTo(p.x1 + inset * t + 8, y).lineTo(p.x2 - inset * t - 8, y + (rand() - 0.5) * 10);
  }
  g.lineStyle(0);
  for (let i = 0; i < Math.max(2, Math.floor((p.x2 - p.x1) / 90)); i += 1) {
    const bx = p.x1 + 20 + rand() * (p.x2 - p.x1 - 40);
    const by = Math.min(p.y1, p.y2) + 30 + rand() * Math.min(160, h - 40);
    g.beginFill(palette.shade, 0.45).drawEllipse(bx, by, 14 + rand() * 22, 8 + rand() * 12).endFill();
  }
  // Lit top lip.
  g.beginFill(palette.top).drawPolygon([p.x1 - 4, p.y1 - 4, p.x2 + 4, p.y2 - 4, p.x2 + 2, p.y2 + 9, p.x1 - 2, p.y1 + 9]).endFill();
  if (palette.grass) {
    g.beginFill(palette.grass).drawPolygon([p.x1 - 4, p.y1 - 5, p.x2 + 4, p.y2 - 5, p.x2 + 2, p.y2 + 3, p.x1 - 2, p.y1 + 3]).endFill();
    for (let x = p.x1 + 6; x < p.x2 - 6; x += 18 + rand() * 20) {
      const y = p.y1 + ((x - p.x1) / (p.x2 - p.x1 || 1)) * (p.y2 - p.y1);
      g.beginFill(palette.grassDark).drawPolygon([x - 4, y - 2, x, y - 10 - rand() * 6, x + 4, y - 2]).endFill();
    }
  }
}

const ROCK = { body: 0x7b5a3e, line: 0x4c3524, shade: 0x5b412c, top: 0xb0906a };
const LAVA_ROCK = { body: 0x5e3b2a, line: 0x2e1a12, shade: 0x3c2418, top: 0x9c6b4c };
const MESA = { body: 0xa2683f, line: 0x6d4026, shade: 0x8a5634, top: 0xd39b67 };
const DIRT = { body: 0x6f5134, line: 0x4a3420, shade: 0x5a4029, top: 0x8e6c47, grass: 0x6f9a3a, grassDark: 0x4f7a26 };
const HILL = { body: 0x8ee000, line: 0x6fb800, shade: 0x7ccc00, top: 0x2f6b00, grass: 0xa6f21a, grassDark: 0x5fa800 };

function drawRockLedge(g, p, ctx) {
  const vertical = ctx.course.floor?.kind === 'ground';
  drawRockMass(g, p, ctx, ctx.course.theme === 'lava' ? LAVA_ROCK : ROCK, vertical ? { bottom: Math.max(p.y1, p.y2) + 54, jag: 22, inset: 10 } : {});
}

function drawPillar(g, p, ctx) {
  const rand = seeded(hashString(p.id));
  const bottom = floorBottom(p, ctx);
  const w = p.x2 - p.x1;
  const mid = (p.x1 + p.x2) / 2;
  const neck = w * 0.32;
  g.beginFill(LAVA_ROCK.body).drawPolygon([
    p.x1 + 6, p.y1 + 14, p.x2 - 6, p.y2 + 14, mid + neck + 6, p.y1 + 70, mid + neck - 2, bottom - 30, mid + neck + 18, bottom,
    mid - neck - 18, bottom, mid - neck + 2, bottom - 30, mid - neck - 6, p.y1 + 70,
  ]).endFill();
  g.beginFill(LAVA_ROCK.shade, 0.55).drawPolygon([mid + 4, p.y1 + 20, mid + neck + 4, p.y1 + 70, mid + neck, bottom, mid + 6, bottom]).endFill();
  for (let y = p.y1 + 90; y < bottom - 20; y += 60 + rand() * 30) {
    g.lineStyle(2, LAVA_ROCK.line, 0.5).moveTo(mid - neck + 4, y).lineTo(mid + neck - 4, y + (rand() - 0.5) * 8).lineStyle(0);
  }
  g.beginFill(0x7d5038).drawEllipse(mid, p.y1 + 8, w / 2 + 8, 14).endFill();
  g.beginFill(LAVA_ROCK.top).drawEllipse(mid, p.y1 + 1, w / 2 + 4, 8).endFill();
  g.beginFill(0xff6a2a, 0.35).drawEllipse(mid, bottom - 6, neck + 30, 10).endFill();
}

function drawMesa(g, p, ctx) {
  drawRockMass(g, p, ctx, MESA, { inset: -26 });
  const rand = seeded(hashString(`${p.id}:streaks`));
  const bottom = floorBottom(p, ctx);
  for (let x = p.x1 + 24; x < p.x2 - 16; x += 34 + rand() * 40) {
    g.lineStyle(2, 0x8a5634, 0.5).moveTo(x, Math.min(p.y1, p.y2) + 16).lineTo(x + (rand() - 0.5) * 20, bottom - 30).lineStyle(0);
  }
}

function drawDirt(g, p, ctx) {
  drawRockMass(g, p, ctx, DIRT);
}

function drawDirtRock(g, p, ctx) {
  drawRockMass(g, p, ctx, { ...MESA, body: 0x8c6a4a, top: 0xb89770 });
}

function drawCave(g, p, ctx) {
  drawRockMass(g, p, ctx, MESA);
  const rand = seeded(hashString(`${p.id}:roof`));
  const roof = Math.min(p.y1, p.y2) - (p.ceiling || 200);
  const pts = [p.x1 - 60, roof - 1600, p.x2 + 60, roof - 1600];
  for (let x = p.x2 + 60; x >= p.x1 - 60; x -= 40) pts.push(x, roof + rand() * 26 - (x < p.x1 || x > p.x2 ? 60 : 0));
  g.beginFill(0x8d5a36).drawPolygon(pts).endFill();
  g.beginFill(0x7a4c2d, 0.5).drawRect(p.x1 - 60, roof - 1600, 40, 1600).drawRect(p.x2 + 20, roof - 1600, 40, 1600).endFill();
  for (let x = p.x1 + 30; x < p.x2 - 30; x += 70 + rand() * 50) {
    g.beginFill(0x7a4c2d).drawPolygon([x - 12, roof + 4, x + 12, roof + 4, x, roof + 34 + rand() * 30]).endFill();
  }
}

function drawSpire(g, p, ctx) {
  const bottom = floorBottom(p, ctx);
  const mid = (p.x1 + p.x2) / 2;
  const w = p.x2 - p.x1;
  g.beginFill(0x8a6a4c).drawPolygon([p.x1 - 4, p.y1, p.x2 + 4, p.y2, mid + w * 0.9, bottom, mid - w * 0.9, bottom]).endFill();
  g.beginFill(0x6e5139, 0.6).drawPolygon([mid + 4, p.y1 + 10, p.x2 + 4, p.y2, mid + w * 0.9, bottom, mid + 10, bottom]).endFill();
  g.beginFill(0xb8946c).drawRoundedRect(p.x1 - 6, p.y1 - 5, w + 12, 14, 6).endFill();
}

function drawFloatRock(g, p, ctx) {
  const rand = seeded(hashString(p.id));
  const w = p.x2 - p.x1;
  const depth = Math.min(150, 50 + w * 0.45);
  const pts = [p.x1 - 6, p.y1 + 4, p.x2 + 6, p.y2 + 4];
  const n = Math.max(3, Math.round(w / 40));
  for (let i = n; i >= 0; i -= 1) {
    const x = p.x1 + (w * i) / n;
    const edge = i === 0 || i === n;
    pts.push(x, p.y1 + (edge ? 26 : 30 + rand() * depth * (1 - Math.abs(i / n - 0.5))));
  }
  const theme = ctx.course.theme;
  const body = theme === 'amazing' ? 0x8a6448 : 0x9b7150;
  g.beginFill(body).drawPolygon(pts).endFill();
  g.beginFill(0x6a4a33, 0.5).drawPolygon([p.x1 + w * 0.55, p.y1 + 10, p.x2 + 6, p.y2 + 4, p.x2 - w * 0.2, p.y1 + depth * 0.6]).endFill();
  g.beginFill(theme === 'amazing' ? 0x7d9a45 : 0xc39a72).drawRoundedRect(p.x1 - 8, p.y1 - 6, w + 16, 14, 7).endFill();
}

function drawLog(g, p) {
  const angle = Math.atan2(p.y2 - p.y1, p.x2 - p.x1);
  const len = Math.hypot(p.x2 - p.x1, p.y2 - p.y1);
  const cx = (p.x1 + p.x2) / 2;
  const cy = (p.y1 + p.y2) / 2 + 13;
  const pts = [];
  for (const [lx, ly] of [[-len / 2 - 8, -14], [len / 2 + 8, -14], [len / 2 + 8, 14], [-len / 2 - 8, 14]]) {
    pts.push(cx + lx * Math.cos(angle) - ly * Math.sin(angle), cy + lx * Math.sin(angle) + ly * Math.cos(angle));
  }
  g.beginFill(0x5a3d22).drawPolygon(pts).endFill();
  g.lineStyle(2, 0x3c2614, 0.7).moveTo(pts[0], pts[1] + 8).lineTo(pts[2], pts[3] + 8).lineStyle(0);
  g.beginFill(0xa77d4e).drawEllipse(pts[2] - 2, (pts[3] + pts[5]) / 2, 7, 14).endFill();
}

function drawHill(g, p, ctx) {
  // A rounded Arbito hill: flat-topped, shoulders curving out to the floor.
  const bottom = ctx.course.height + 200;
  const top = Math.min(p.y1, p.y2);
  const spread = Math.min(260, (bottom - top) * 0.35);
  g.lineStyle(5, 0x1d3a00, 0.95).beginFill(0x8ee000);
  g.moveTo(p.x1 - spread, bottom);
  g.bezierCurveTo(p.x1 - spread * 0.7, top + 40, p.x1 - 30, p.y1 - 4, p.x1 + 10, p.y1 - 4);
  g.lineTo(p.x2 - 10, p.y2 - 4);
  g.bezierCurveTo(p.x2 + 30, p.y2 - 4, p.x2 + spread * 0.7, top + 40, p.x2 + spread, bottom);
  g.closePath().endFill().lineStyle(0);
  const rand = seeded(hashString(p.id));
  g.beginFill(0x7ccc00, 0.7).drawEllipse((p.x1 + p.x2) / 2, top + 120, (p.x2 - p.x1) * 0.35, 40).endFill();
  for (let x = p.x1 + 20; x < p.x2 - 20; x += 40 + rand() * 60) {
    g.lineStyle(2, 0x1d3a00, 0.8).moveTo(x - 5, p.y1 + 2).lineTo(x - 2, p.y1 - 6).moveTo(x + 1, p.y1 + 2).lineTo(x + 4, p.y1 - 7).lineStyle(0);
  }
}

function drawIsland(g, p, ctx) {
  const art = p.art || 'cloud_rock_1';
  const sprite = ctx.PIXI.Sprite.from(`${DECO_DIR}${art}.png`);
  const w = p.x2 - p.x1;
  // cloud_rock_* tops sit ~11% down the sprite; scale the lilac top to the ledge.
  const nominal = { cloud_rock_1: 534, cloud_rock_2: 454, cloud_rock_3: 490, cloud_rock_4: 514 }[art] || 500;
  const scale = (w + 30) / (nominal * 0.94);
  sprite.anchor.set(0.5, 0.11);
  sprite.scale.set(scale);
  sprite.x = (p.x1 + p.x2) / 2;
  sprite.y = p.y1;
  ctx.under.addChild(sprite);
}

function drawRibbon(g, p) {
  const n = Math.max(6, Math.round((p.x2 - p.x1) / 24));
  for (let i = 0; i < n; i += 1) {
    const t0 = i / n;
    const t1 = (i + 1) / n;
    const x0 = p.x1 + (p.x2 - p.x1) * t0;
    const x1 = p.x1 + (p.x2 - p.x1) * t1;
    const y0 = p.y1 + (p.y2 - p.y1) * t0;
    const y1 = p.y1 + (p.y2 - p.y1) * t1;
    const w0 = Math.sin(t0 * Math.PI * 3) * (p.wave || 16);
    const w1 = Math.sin(t1 * Math.PI * 3) * (p.wave || 16);
    for (let row = 0; row < 2; row += 1) {
      const top = row * 13;
      const color = (i + row) % 2 ? 0x2f8de4 : 0xffffff;
      g.beginFill(color).drawPolygon([x0, y0 + top + w0 * row * 0.4, x1, y1 + top + w1 * row * 0.4, x1, y1 + top + 13 + w1 * (row + 1) * 0.4, x0, y0 + top + 13 + w0 * (row + 1) * 0.4]).endFill();
    }
  }
  g.lineStyle(2, 0x1d4f8a, 0.8).moveTo(p.x1, p.y1).lineTo(p.x2, p.y2).lineStyle(0);
}

function drawStoneSlab(g, p) {
  const { x1, x2, y1: y } = p;
  const w = x2 - x1;
  g.lineStyle(3, 0x1a1a1a);
  g.beginFill(0xa9b7c4).drawPolygon([x1, y + 4, x2, y + 4, x2 - 6, y + 24, x1 + 6, y + 24]).endFill();
  g.beginFill(0xdde6ee).drawPolygon([x1 + 8, y - 8, x2 - 4, y - 8, x2, y + 4, x1, y + 4]).endFill();
  g.lineStyle(2, 0x1a1a1a, 0.75);
  for (let x = x1 + 50; x < x2 - 30; x += 70) g.moveTo(x, y - 6).lineTo(x - 8, y + 2).lineTo(x - 2, y + 4);
  g.lineStyle(0);
  const rand = seeded(hashString(p.id));
  for (let i = 0; i < Math.max(1, Math.floor(w / 110)); i += 1) {
    const x = x1 + 20 + rand() * (w - 40);
    g.lineStyle(2, 0x1d4a00).beginFill(0x58c51c).drawEllipse(x, y + 3, 16, 6).endFill();
    g.drawRoundedRect(x - 4, y + 3, 8, 16 + rand() * 18, 4);
    g.lineStyle(0);
  }
}

function drawColumn(g, p, ctx) {
  const sprite = ctx.PIXI.Sprite.from(`${DECO_DIR}pillar_1.png`);
  const w = p.x2 - p.x1;
  sprite.anchor.set(0.5, 0.012);
  sprite.scale.set((w + 24) / 310);
  sprite.x = (p.x1 + p.x2) / 2;
  sprite.y = p.y1 - 4;
  ctx.under.addChild(sprite);
}

function drawPinkStairs(g, p) {
  const steps = Math.max(2, Math.round(Math.abs(p.x2 - p.x1) / 26));
  const w = (p.x2 - p.x1) / steps;
  for (let i = 0; i < steps; i += 1) {
    const sx = p.x1 + i * w;
    const sy = p.y1 + ((p.y2 - p.y1) * (i + 0.5)) / steps;
    g.lineStyle(2, 0x1a1a1a).beginFill(0xff4f86).drawRect(sx, sy, w + 0.5, 26).endFill();
    g.lineStyle(0).beginFill(0xffa64a).drawRect(sx + 1, sy + 14, w - 1, 11).endFill();
    g.beginFill(0x7fe04a).drawCircle(sx + w / 2, sy + 19, 3.2).endFill();
  }
}

function drawRainbow(g, p) {
  const colors = [0xff4b4b, 0xff9d3b, 0xffe35b, 0x7fd44a, 0x4fb5ff];
  colors.forEach((color, i) => {
    g.beginFill(color).drawPolygon([p.x1, p.y1 + i * 9, p.x2, p.y2 + i * 9, p.x2, p.y2 + i * 9 + 10, p.x1, p.y1 + i * 9 + 10]).endFill();
  });
}

function drawGlassDeco(g, p) {
  const { x1, x2, y1: y } = p;
  g.beginFill(0x7f97ad, 0.85).drawPolygon([x1, y, x2, y, x2 - 10, y + 14, x1 + 10, y + 14]).endFill();
  g.beginFill(0xeaf4fb, 0.95).drawPolygon([x1 + 12, y - 12, x2 - 12, y - 12, x2, y, x1, y]).endFill();
  for (let x = x1 + 30; x < x2 - 40; x += 46) {
    g.beginFill(0xa9cde6, 0.55).drawPolygon([x, y - 11, x + 14, y - 11, x + 6, y - 1, x - 8, y - 1]).endFill();
  }
  g.lineStyle(1, 0xffffff).moveTo(x1 + 12, y - 12).lineTo(x2 - 12, y - 12).lineStyle(0);
}

function drawWhiteBlock(g, p) {
  const { x1, x2, y1: y } = p;
  g.beginFill(0xd9dde2).drawRect(x1, y, x2 - x1, 44).endFill();
  g.beginFill(0xffffff).drawPolygon([x1 + 10, y - 10, x2 - 10, y - 10, x2, y, x1, y]).endFill();
  g.beginFill(0xc2c8cf).drawRect(x2 - 18, y, 18, 44).endFill();
}

function drawCloudTop(g, p) {
  const rand = seeded(hashString(p.id));
  const w = p.x2 - p.x1;
  for (let x = p.x1 - 20; x <= p.x2 + 20; x += 46) {
    g.beginFill(0xffffff, 0.95).drawCircle(x, p.y1 + 30 + rand() * 18, 34 + rand() * 20).endFill();
  }
  g.beginFill(0xffffff).drawRoundedRect(p.x1 - 10, p.y1 - 8, w + 20, 40, 18).endFill();
}

function drawSummit(g, p, ctx) {
  drawRockMass(g, p, ctx, { ...ROCK, grass: 0x7fae3e, grassDark: 0x5a8a2a }, { bottom: p.y1 + 220, jag: 70, inset: 60 });
}

function drawGroundFloor(g, p, ctx) {
  const theme = ctx.course.theme;
  if (theme === 'crystal') {
    g.beginFill(0xf1eefb).drawRect(p.x1, p.y1, p.x2 - p.x1, ctx.course.height - p.y1 + 200).endFill();
    g.beginFill(0xffffff).drawRect(p.x1, p.y1 - 6, p.x2 - p.x1, 8).endFill();
  } else if (theme === 'star') {
    drawRockMass(g, p, ctx, HILL, { bottom: ctx.course.height + 200 });
  } else {
    drawRockMass(g, p, ctx, { ...ROCK, body: 0x5e4330, top: 0x8b6a4c }, { bottom: ctx.course.height + 200 });
  }
}

function drawLavaFloor(g, p, ctx) {
  const top = p.y1 - 14;
  const bottom = ctx.course.height + 300;
  g.beginFill(0xc8220f).drawRect(p.x1 - 200, top, p.x2 - p.x1 + 400, bottom - top).endFill();
  g.beginFill(0xff5a1f).drawRect(p.x1 - 200, top, p.x2 - p.x1 + 400, 22).endFill();
  const rand = seeded(hashString(p.id));
  for (let x = p.x1 - 200; x < p.x2 + 200; x += 36 + rand() * 30) {
    const w = 18 + rand() * 40;
    g.beginFill(0xffb347, 0.85).drawEllipse(x, top + 6 + rand() * 30, w, 4 + rand() * 4).endFill();
    g.beginFill(0x8e140a, 0.6).drawEllipse(x + 30, top + 40 + rand() * 50, w * 0.8, 6).endFill();
  }
}

const PLATFORM_STYLES = {
  glass: drawGlass,
  slab: drawSlab,
  glassStairs: drawGlassStairs,
  cube: drawCube,
  rockLedge: drawRockLedge,
  rockSlope: drawRockLedge,
  pillar: drawPillar,
  mesa: drawMesa,
  dirt: drawDirt,
  dirtRock: drawDirtRock,
  cave: drawCave,
  spire: drawSpire,
  floatRock: drawFloatRock,
  log: drawLog,
  hill: drawHill,
  island: drawIsland,
  ribbon: drawRibbon,
  stoneSlab: drawStoneSlab,
  column: drawColumn,
  pinkStairs: drawPinkStairs,
  rainbow: drawRainbow,
  glassDeco: drawGlassDeco,
  whiteBlock: drawWhiteBlock,
  cloudTop: drawCloudTop,
  summit: drawSummit,
  'floor-ground': drawGroundFloor,
  'floor-lava': drawLavaFloor,
};

/* Climbable walls. */

function drawRockFace(g, w, ctx) {
  const rand = seeded(hashString(w.id));
  g.beginFill(0x7b5a3e).drawRoundedRect(w.x - 34, w.yTop - 6, 68, w.yBot - w.yTop + 12, 14).endFill();
  g.beginFill(0x5b412c, 0.5).drawRect(w.x + 8, w.yTop, 22, w.yBot - w.yTop).endFill();
  for (let y = w.yTop + 20; y < w.yBot - 10; y += 34) {
    g.beginFill(0xb0906a).drawEllipse(w.x - 12 + rand() * 24, y, 9, 5).endFill();
  }
  for (let y = w.yBot - 70; y > w.yTop + 30; y -= 120) {
    g.lineStyle(4, 0xffffff, 0.75).moveTo(w.x - 10, y + 8).lineTo(w.x, y - 4).lineTo(w.x + 10, y + 8);
    g.moveTo(w.x - 10, y + 22).lineTo(w.x, y + 10).lineTo(w.x + 10, y + 22).lineStyle(0);
  }
}

function drawSlimeLadder(g, w, ctx) {
  let i = 0;
  for (let y = w.yBot; y > w.yTop - 10; y -= 58) {
    const sprite = ctx.PIXI.Sprite.from(`${DECO_DIR}arbito_ladder_tile_center_0${(i % 3) + 1}_stone.png`);
    sprite.anchor.set(0.5, 1);
    sprite.scale.set(0.6);
    sprite.x = w.x;
    sprite.y = y + 6;
    ctx.under.addChild(sprite);
    i += 1;
  }
}

const WALL_STYLES = {
  rockFace: drawRockFace,
  slimeLadder: drawSlimeLadder,
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

function drawPlanet(PIXI, prop) {
  const g = new PIXI.Graphics();
  const r = prop.r || 200;
  // Rainbow slide spilling out of the planet's door (Star Sprint landmark).
  const colors = [0xff4b4b, 0xff9d3b, 0xffe35b];
  colors.forEach((color, i) => {
    g.lineStyle(16, color).moveTo(r * 0.1, r * 0.25 + i * 15).bezierCurveTo(r * 0.9, r * 0.5 + i * 15, r * 1.2, r * 1.1 + i * 15, r * 1.9, r * 1.5 + i * 15);
  });
  g.lineStyle(4, 0x1a1a1a).beginFill(0x35c7e8).drawCircle(0, 0, r).endFill();
  g.lineStyle(0);
  for (let i = -3; i <= 3; i += 1) {
    const y = (i * r) / 3.6;
    const half = Math.sqrt(Math.max(0, r * r - y * y)) - 4;
    g.beginFill(0xff3fa8).drawPolygon([-half, y - 14, -half / 2, y - 26, 0, y - 12, half / 2, y - 26, half, y - 14, half, y + 4, half / 2, y - 8, 0, y + 6, -half / 2, y - 8, -half, y + 4]).endFill();
  }
  g.lineStyle(4, 0x1a1a1a).beginFill(0xff4f86).drawPolygon([0, -r * 0.1, r * 0.75, -r * 0.62, r * 0.75, r * 0.28, 0, r * 0.3]).endFill();
  g.lineStyle(3, 0x1a1a1a).beginFill(0xc8164f).drawRoundedRect(r * 0.18, -r * 0.42, r * 0.22, r * 0.5, r * 0.1).endFill();
  g.x = prop.x;
  g.y = prop.y;
  if (prop.flip) g.scale.x = -1;
  return g;
}

function drawCrystalFacet(PIXI, prop) {
  const g = new PIXI.Graphics();
  const w = prop.w || 400;
  const h = prop.h || 900;
  g.beginFill(prop.color || 0x6a4bd8, prop.alpha ?? 0.9).drawPolygon([-w / 2, 0, -w * 0.3, -h * 0.82, w * 0.05, -h, w / 2, -h * 0.7, w * 0.42, 0]).endFill();
  g.beginFill(0xffffff, 0.16).drawPolygon([-w * 0.3, -h * 0.82, w * 0.05, -h, w * 0.02, -h * 0.2, -w * 0.18, 0]).endFill();
  g.beginFill(0x000000, 0.12).drawPolygon([w * 0.05, -h, w / 2, -h * 0.7, w * 0.42, 0, w * 0.1, 0]).endFill();
  g.x = prop.x;
  g.y = prop.y;
  if (prop.flip) g.scale.x = -1;
  return g;
}

const PROP_DRAWERS = {
  dome: drawDome,
  cubeStack: drawCubeStack,
  planet: drawPlanet,
  crystal: drawCrystalFacet,
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

function addParallaxSprite(PIXI, root, name, x, y, opts = {}) {
  const sprite = PIXI.Sprite.from(`${DECO_DIR}${name}.png`);
  sprite.anchor.set(opts.ax ?? 0.5, opts.ay ?? 1);
  sprite.x = x;
  sprite.y = y;
  sprite.scale.set((opts.flip ? -1 : 1) * (opts.scale || 1), opts.scale || 1);
  if (opts.tint != null) sprite.tint = opts.tint;
  if (opts.alpha != null) sprite.alpha = opts.alpha;
  sprite.parallax = opts.parallax ?? 0.5;
  if (opts.parallaxY != null) sprite.parallaxY = opts.parallaxY;
  root.addChild(sprite);
  return sprite;
}

function paintLava(PIXI, root, course) {
  root.addChild(gradientSprite(PIXI, [[0, '#120303'], [0.45, '#3d0b09'], [1, '#8a1a12']], course.width, course.height + 200));
  const rand = seeded(hashString(`${course.id}:mesas`));
  for (let x = 0; x < course.width; x += 520 + rand() * 360) {
    addParallaxSprite(PIXI, root, rand() > 0.5 ? 'land_l6_mesa_2' : 'land_l5_mesa_1', x, course.floor.y - 20, {
      scale: 0.9 + rand() * 0.5,
      tint: 0x3a0f0b,
      alpha: 0.85,
      parallax: 0.45,
      parallaxY: 1,
    });
  }
  const embers = new PIXI.Graphics();
  for (let i = 0; i < course.width / 60; i += 1) {
    embers.beginFill(0xff8a3d, 0.25 + rand() * 0.4).drawCircle(rand() * course.width, rand() * course.floor.y, 1 + rand() * 2.2).endFill();
  }
  embers.parallax = 0.7;
  root.addChild(embers);
}

function paintCanyon(PIXI, root, course) {
  root.addChild(gradientSprite(PIXI, [[0, '#4fb2cc'], [0.55, '#bfe1c9'], [0.8, '#efe1a0'], [1, '#3a2717']], course.width, course.height + 200));
  const rand = seeded(hashString(`${course.id}:far`));
  for (let x = 0; x < course.width; x += 700 + rand() * 500) {
    addParallaxSprite(PIXI, root, 'cloud_fluffy_1', x, 260 + rand() * 260, { scale: 0.6 + rand() * 0.5, alpha: 0.8, parallax: 0.15, parallaxY: 0.3 });
  }
  // Far canyon wall: a soft banded silhouette on the horizon.
  const wall = new PIXI.Graphics();
  for (let band = 0; band < 3; band += 1) {
    const base = 1180 + band * 70;
    const pts = [-400, base + 400];
    for (let x = -400; x <= course.width + 400; x += 140) pts.push(x, base - 120 - band * 30 + rand() * 90);
    pts.push(course.width + 400, base + 400);
    wall.beginFill([0xd9c3a6, 0xc9a684, 0xb98a63][band], 0.85).drawPolygon(pts).endFill();
  }
  wall.parallax = 0.3;
  wall.parallaxY = 1;
  root.addChild(wall);
  for (let x = 200; x < course.width; x += 900 + rand() * 700) {
    addParallaxSprite(PIXI, root, rand() > 0.5 ? 'land_l5_mesa_1' : 'land_l6_mesa_2', x, 1240, { scale: 0.5 + rand() * 0.25, tint: 0xd8b49a, alpha: 0.75, parallax: 0.4, parallaxY: 1 });
  }
  const abyss = gradientSprite(PIXI, [[0, 'rgba(58,39,23,0)'], [0.45, 'rgba(26,16,9,0.95)'], [1, 'rgba(12,8,5,1)']], course.width + 400, course.height - course.floor.y + 600);
  abyss.x = -200;
  abyss.y = course.floor.y - 360;
  root.addChild(abyss);
}

function tileSkyHills(PIXI, root, course, y, parallax) {
  let i = 0;
  for (let x = -200; x < course.width + 800; x += 798) {
    const sprite = addParallaxSprite(PIXI, root, `sky_hills_${(i % 3) + 1}`, x, y, { ax: 0, ay: 0, parallax, parallaxY: 1 });
    sprite.width = 802;
    i += 1;
  }
}

function paintWarp(PIXI, root, course) {
  root.addChild(gradientSprite(PIXI, [[0, '#050308'], [0.5, '#2a1747'], [1, '#9a00c0']], course.width, course.height + 300));
  root.addChild(starField(PIXI, course, Math.round((course.width * 700) / 1e6 * 200), 0.6, 1.8, 0.7, hashString(`${course.id}:stars`)));
  tileSkyHills(PIXI, root, course, course.height - 1500, 0.4);
}

function paintStar(PIXI, root, course) {
  root.addChild(gradientSprite(PIXI, [[0, '#000000'], [0.45, '#0d0618'], [0.75, '#2d1650'], [1, '#9a00c0']], course.width, course.height + 300));
  tileSkyHills(PIXI, root, course, course.height - 1600, 0.6);
  const upper = { ...course, height: course.height * 0.62 };
  root.addChild(starField(PIXI, upper, Math.round((course.width * upper.height) / 1e6 * 160), 0.7, 2.2, 0.9, hashString(`${course.id}:stars`)));
}

function paintCrystal(PIXI, root, course) {
  root.addChild(gradientSprite(PIXI, [[0, '#ffffff'], [0.12, '#f4f0ff'], [0.32, '#ffd9f0'], [0.55, '#5b3dc8'], [0.8, '#3a2a8c'], [1, '#e8e4f7']], course.width, course.height + 200));
  const rand = seeded(hashString(`${course.id}:facets`));
  const colors = [0x6a4bd8, 0x4a6bff, 0xff8a3d, 0xff6fc8, 0x42d39a, 0x8f5bff, 0xffb84a];
  const facets = new PIXI.Container();
  for (let y = course.height - 100; y > 500; y -= 260 + rand() * 160) {
    for (const side of [0, 1]) {
      const x = side ? course.width - (rand() * course.width * 0.25) : rand() * course.width * 0.25;
      facets.addChild(drawCrystalFacet(PIXI, { x, y, w: 300 + rand() * 260, h: 700 + rand() * 500, color: colors[Math.floor(rand() * colors.length)], alpha: 0.95, flip: side === 1 }));
    }
    facets.addChild(drawCrystalFacet(PIXI, { x: course.width / 2 + (rand() - 0.5) * 300, y: y + 120, w: 260 + rand() * 200, h: 600 + rand() * 400, color: colors[Math.floor(rand() * colors.length)], alpha: 0.75 }));
  }
  facets.parallax = 0.85;
  facets.parallaxY = 1;
  root.addChild(facets);
  for (let x = 0; x < course.width; x += 360 + rand() * 300) {
    addParallaxSprite(PIXI, root, 'cloud_fluffy_2', x, 260 + rand() * 300, { scale: 0.7 + rand() * 0.4, alpha: 0.9, parallax: 0.9, parallaxY: 1 });
  }
}

function paintAmazing(PIXI, root, course) {
  const caveTop = course.floor.y - 1050;
  root.addChild(gradientSprite(PIXI, [[0, '#2f9fdc'], [0.5, '#7fd3f2'], [1, '#c8eefa']], course.width, caveTop + 200));
  const rand = seeded(hashString(`${course.id}:sky`));
  const peaks = new PIXI.Graphics();
  for (const [cx, h, w, color] of [[course.width * 0.3, 900, 900, 0xb9cbd8], [course.width * 0.62, 1150, 1100, 0xa7bccb], [course.width * 0.86, 760, 800, 0xc3d3de]]) {
    const base = caveTop + 160;
    peaks.beginFill(color).drawPolygon([cx - w / 2, base, cx - w * 0.08, base - h, cx + w * 0.05, base - h * 0.94, cx + w / 2, base]).endFill();
    peaks.beginFill(0xffffff).drawPolygon([cx - w * 0.11, base - h * 0.76, cx - w * 0.08, base - h, cx + w * 0.05, base - h * 0.94, cx + w * 0.09, base - h * 0.8, cx + w * 0.02, base - h * 0.84, cx - w * 0.04, base - h * 0.74]).endFill();
  }
  peaks.parallax = 0.6;
  peaks.parallaxY = 1;
  root.addChild(peaks);
  const clouds = new PIXI.Graphics();
  for (let y = 150; y < caveTop; y += 200 + rand() * 180) {
    const cx = rand() * course.width;
    const w = 160 + rand() * 180;
    for (let i = 0; i < 5; i += 1) clouds.beginFill(0xffffff, 0.92).drawEllipse(cx - w / 2 + (w * i) / 4, y - Math.sin((i / 4) * Math.PI) * 26, w * 0.22, 26 + Math.sin((i / 4) * Math.PI) * 14).endFill();
  }
  clouds.parallax = 0.8;
  clouds.parallaxY = 1;
  root.addChild(clouds);
  // The starting cave: layered rock walls behind the first climbs.
  const cave = new PIXI.Graphics();
  cave.beginFill(0x6a4a33).drawRect(-100, caveTop, course.width + 200, course.height - caveTop + 300).endFill();
  const pts = [-100, caveTop + 80];
  for (let x = -100; x <= course.width + 100; x += 60) pts.push(x, caveTop + 30 + rand() * 120);
  pts.push(course.width + 100, caveTop + 300, -100, caveTop + 300);
  cave.beginFill(0x6a4a33).drawPolygon(pts).endFill();
  for (let i = 0; i < 80; i += 1) {
    cave.beginFill(i % 2 ? 0x7d5a3f : 0x58402c, 0.55).drawEllipse(rand() * course.width, caveTop + 200 + rand() * (course.height - caveTop - 200), 30 + rand() * 60, 18 + rand() * 30).endFill();
  }
  // The cave mouth opening to the sky.
  cave.beginFill(0x2f9fdc, 0).drawRect(0, 0, 1, 1).endFill();
  root.addChild(cave);
}

const THEMES = {
  space: paintSpace,
  lava: paintLava,
  canyon: paintCanyon,
  warp: paintWarp,
  star: paintStar,
  crystal: paintCrystal,
  amazing: paintAmazing,
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

  const under = new PIXI.Container();
  const g = new PIXI.Graphics();
  const ctx = { PIXI, course, under };
  for (const w of course.walls || []) {
    const draw = WALL_STYLES[w.style];
    if (draw) draw(g, w, ctx);
  }
  for (const p of course.platforms) {
    const draw = PLATFORM_STYLES[p.style];
    if (draw) draw(g, p, ctx);
  }
  root.addChild(under, g);
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
      layer.y = layer.baseY + camY * (1 - (layer.parallaxY ?? layer.parallax));
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
