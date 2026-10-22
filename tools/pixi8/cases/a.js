const SKETCH = {
  moon(g) { poly(g, [[0, 0], [5, 5], [9, 1]], true); star(g, 3, 3, 1); g.drawCircle(1, 1, 2); },
};
function poly(g, pts, close = false) {
  g.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
  if (close) g.lineTo(pts[0][0], pts[0][1]);
}
function star(g, x, y, s) { g.moveTo(x - s, y); g.lineTo(x + s, y); g.moveTo(x, y - s); g.lineTo(x, y + s); }
export function t1(PIXI) {
  const g = new PIXI.Graphics();
  const passes = [{ width: 7, color: 0xfff1b8, alpha: 0.35 }, { width: 3, color: 0xffffff, alpha: 1 }];
  for (const pass of passes) {
    g.lineStyle({ ...pass, width: pass.width / 2, cap: PIXI.LINE_CAP.ROUND, join: PIXI.LINE_JOIN.ROUND });
    SKETCH.moon(g);
  }
  g.lineStyle(0);
  return g;
}
export function t2(PIXI) {
  const room = new PIXI.Graphics();
  room.beginFill(0xf7f0d9);
  room.drawRect(0, 0, 1150, 620);
  room.endFill();
  const colors = [0x72c8c8, 0xeba75f, 0xcf6179];
  for (let x = -70, i = 0; x < 300; x += 165, i += 1) {
    const color = colors[i % colors.length];
    room.beginFill(color, 0.9);
    room.drawRoundedRect(x, 40 + (i % 2) * 20, 96, 72, 30);
    room.drawCircle(x + 26, 35 + (i % 2) * 20, 23);
    room.endFill();
  }
  for (const x of [95, 850]) {
    room.lineStyle(8, 0xffffff, 0.9);
    room.beginFill(0x9fe1e7);
    room.drawRoundedRect(x, 155, 190, 340, 8);
    room.endFill();
    room.lineStyle(5, 0xffffff, 0.85);
    room.moveTo(x + 95, 160);
    room.lineTo(x + 95, 490);
    room.moveTo(x + 5, 325);
    room.lineTo(x + 185, 325);
  }
  room.lineStyle(0);
  room.beginFill(0x8b5f42);
  room.drawRect(0, 620, 1150, 140);
  room.endFill();
  room.lineStyle(2, 0xb88962, 0.45);
  for (let y = 646; y < 760; y += 28) {
    room.moveTo(0, y);
    room.lineTo(1150, y);
  }
  room.lineStyle(0);
  room.beginFill(0xcd4f68);
  room.drawCircle(882, 438, 13);
  room.beginFill(0x79b8c7);
  room.drawCircle(1010, 438, 13);
  room.endFill();
  return room;
}
export function t3(PIXI) {
  const g = new PIXI.Graphics();
  const black = 1;
  const fillPoly = (pts) => {
    g.beginFill(black);
    g.drawPolygon(pts.flat());
    g.endFill();
  };
  fillPoly([[0, 0], [10, 0], [10, 10]]);
  g.beginFill(black);
  const tufts = (x1, x2) => {
    for (let d = 6; d < x2 - x1; d += 9) {
      g.moveTo(x1 + d - 3, 1);
      g.lineTo(x1 + d, -4);
      g.lineTo(x1 + d + 3, 1);
    }
  };
  tufts(0, 40);
  tufts(100, 140);
  g.endFill();
  return g;
}
export function t4(PIXI, lit) {
  const b = new PIXI.Graphics();
  b.beginFill(0x2e2116, 0.35);
  b.drawRoundedRect(3, 4, 30, 20, 4);
  b.endFill();
  b.lineStyle(1, lit ? 0x5b432b : 0xae8350, 0.6);
  for (let i = 0; i < 3; i++) {
    b.moveTo(i * 5, 0);
    b.lineTo(i * 5, 10);
  }
  b.lineStyle(0);
  b.beginFill(0xa9adb2);
  b.drawCircle(0, -1, 3);
  b.endFill();
  b.lineStyle(3, 0x4e301e, 0.9);
  b.beginFill(0x9b744c);
  b.drawRoundedRect(-31, -96, 62, 72, 14);
  b.drawRoundedRect(-38, -144, 76, 54, 18);
  b.beginFill(0xead6a5);
  b.drawCircle(-13, -119, 7);
  b.drawCircle(13, -119, 7);
  b.endFill();
  const ant = new PIXI.Graphics();
  ant.lineStyle(3, 0x765238, 1);
  ant.moveTo(0, -145);
  ant.lineTo(0, -164);
  ant.beginFill(0xe0b85e);
  ant.drawCircle(0, -168, 6);
  ant.endFill();
  return [b, ant];
}
export function t5(PIXI) {
  const rainbow = new PIXI.Graphics();
  const colors = [1, 2, 3];
  colors.forEach((color, index) => {
    rainbow.lineStyle(4, color, 0.92);
    rainbow.moveTo(-112, 29 + index * 3);
    rainbow.bezierCurveTo(-58, -30 + index * 2, 58, -30 + index * 2, 112, 29 + index * 3);
  });
  const x = new PIXI.Graphics().beginFill(0xff0000).drawRect(0, 0, 5, 5).endFill();
  const y = new PIXI.Graphics().lineStyle(2, 3).drawCircle(0, 0, 5);
  return [rainbow, x, y];
}
function drawTube(PIXI, g, w0 = 36) {
  const layers = [[w0, 1, 1], [w0 - 10, 2, 1], [w0 * 0.32, 3, 0.9]];
  for (const [w, color, alpha] of layers) {
    g.lineStyle({ width: w, color, alpha, cap: PIXI.LINE_CAP.ROUND, join: PIXI.LINE_JOIN.ROUND });
    g.moveTo(0, w);
    g.quadraticCurveTo(5, 5, 10, w);
  }
  g.lineStyle(0);
}
export function t6(PIXI) {
  const g = new PIXI.Graphics();
  g.beginFill(0x111111);
  g.drawRect(0, 0, 10, 10);
  g.endFill();
  drawTube(PIXI, g);
  g.beginFill(0x222222, 0.5).drawEllipse(0, 0, 3, 3).endFill();
  return g;
}
function rect(g, x, y, w, h, color, alpha) {
  g.beginFill(color, alpha);
  g.drawRect(x, y, w, h);
  g.endFill();
}
export function t7(PIXI, cond) {
  const g = new PIXI.Graphics();
  rect(g, 0, 0, 1, 1, 0x123456);
  rect(g, 0, 0, 2, 2, 0x123456, 0.5);
  g.lineStyle(2, 0x000000);
  if (cond) g.drawCircle(0, 0, 4);
  else g.drawCircle(1, 1, 4);
  g.lineStyle(0);
  for (let i = 0; i < 4; i++) {
    if (i === 2) continue;
    g.beginFill(i * 10);
    g.drawRect(i, i, 1, 1);
    g.endFill();
  }
  g.clear();
  g.beginFill(9).drawRect(1, 1, 1, 1);
  return g;
}
export function t8(PIXI) {
  const sky = new PIXI.Graphics();
  for (let index = 0; index < 3; index++) {
    const color = index * 100;
    sky.beginFill(color);
    sky.drawRect(0, index, 10, 1);
  }
  sky.endFill();
  const stars = new PIXI.Graphics();
  for (let index = 0; index < 3; index++) {
    stars.beginFill(0xe7f7ff, 0.28 + (index % 5) * 0.08);
    stars.drawCircle(index, index, 1);
  }
  stars.endFill();
  const hat = new PIXI.Graphics();
  hat.beginFill(0x7a58c4);
  hat.drawEllipse(1, 1, 17, 4.5);
  hat.endFill();
  hat.lineStyle(2, 0x111111, 1);
  hat.moveTo(0, 0);
  hat.lineTo(5, 5);
  hat.arc(5, 5, 3, 0, Math.PI);
  hat.closePath();
  hat.beginFill(0x00ff00);
  hat.moveTo(0, 0);
  hat.lineTo(5, 0);
  hat.lineTo(5, 5);
  hat.closePath();
  hat.moveTo(10, 0);
  hat.lineTo(15, 0);
  hat.lineTo(15, 5);
  hat.endFill();
  return [sky, stars, hat];
}
