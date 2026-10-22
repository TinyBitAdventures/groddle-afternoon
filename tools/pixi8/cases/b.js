export function t1(PIXI, flag) {
  const g = new PIXI.Graphics();
  g.lineStyle(2, 0x111111);
  g.moveTo(0, 0);
  g.lineTo(10, 0);
  g.lineStyle(4, 0x222222);
  g.lineTo(10, 10);
  g.lineTo(0, 10);
  g.lineStyle(0);
  if (flag) {
    g.beginFill(0x333333);
    g.drawRect(0, 0, 3, 3);
    g.endFill();
    return g;
  }
  g.beginFill(0x444444);
  g.drawRect(1, 1, 3, 3);
  return g;
}
class Bar {
  constructor(PIXI) { this.g = new PIXI.Graphics(); }
  draw(v) {
    this.g.clear();
    this.g.beginFill(0x000000, 0.5);
    this.g.drawRoundedRect(0, 0, 100, 10, 4);
    this.g.endFill();
    this.g.beginFill(v > 0.5 ? 0x00ff00 : 0xff0000);
    this.g.drawRoundedRect(0, 0, 100 * v, 10, 4);
    this.g.endFill();
    this.g.lineStyle(1, 0xffffff, 0.8);
    this.g.drawRoundedRect(0, 0, 100, 10, 4);
  }
}
export function t2(PIXI, flag) {
  const b = new Bar(PIXI);
  b.draw(flag ? 0.7 : 0.2);
  b.draw(0.4);
  return b.g;
}
export function t3(PIXI, flag) {
  const g = new PIXI.Graphics();
  switch (flag ? 'a' : 'b') {
    case 'a':
      g.beginFill(1);
      g.drawCircle(0, 0, 1);
      g.endFill();
      break;
    default:
      g.lineStyle(1, 2);
      g.drawCircle(0, 0, 2);
      g.lineStyle(0);
  }
  const parts = [[0, 0], [1, 1]].map(([x, y]) => {
    const p = new PIXI.Graphics();
    p.beginFill(0x00ff00);
    p.drawCircle(x, y, 2);
    p.endFill();
    return p;
  });
  return [g, ...parts];
}
function glyph(g, symbol, color, width = 5, alpha = 1) {
  g.lineStyle({ width, color, alpha, cap: 'round', join: 'round' });
  if (symbol === 'a') {
    g.moveTo(-34, -40);
    g.quadraticCurveTo(-46, 6, -18, 34);
  } else {
    g.moveTo(-46, 6);
    g.quadraticCurveTo(0, -42, 46, 6);
    g.drawCircle(0, 6, 11);
    for (const [x1, y1, x2, y2] of [[-30, -26, -40, -42], [0, -34, 0, -52]]) {
      g.moveTo(x1, y1);
      g.lineTo(x2, y2);
    }
  }
  g.lineStyle(0);
}
export function t4(PIXI, flag) {
  const g = new PIXI.Graphics();
  glyph(g, flag ? 'a' : 'b', 0x123456);
  glyph(g, 'b', 0x654321, 3, 0.5);
  const h = new PIXI.Graphics();
  h.lineStyle(2, 0x000000, 1).beginFill(0xffffff, 1).drawPolygon([0, 0, 5, 0, 5, 5]).endFill();
  h.beginFill(0x2f9fdc, 0).drawRect(0, 0, 1, 1).endFill();
  return [g, h];
}
export function t5(PIXI, flag) {
  const g = new PIXI.Graphics();
  g.beginFill(0xff0000);
  g.lineStyle(3, 0x00ff00);
  g.moveTo(0, 0);
  g.lineTo(10, 0);
  g.lineTo(10, 10);
  g.closePath();
  g.moveTo(20, 0);
  g.lineTo(30, 0);
  g.lineTo(30, 10);
  g.drawCircle(50, 50, 5);
  g.endFill();
  g.lineStyle(0);
  const pts = [];
  for (let i = 0; i < 5; i++) pts.push(i, i * 2);
  g.beginFill(0x0000ff, flag ? 0.5 : 1);
  g.drawPolygon(pts);
  g.endFill();
  return g;
}
