export function t1(PIXI, flag) {
  const g = new PIXI.Graphics();
  const x1 = 0, x2 = flag ? 500 : 100, y = 0;
  g.beginFill(0xffffff, 0.96).drawRect(x1 - 2, y - 5, x2 - x1 + 4, 8).endFill();
  g.lineStyle(1, 0x7d8791, 0.9).moveTo(x1, y + 28).lineTo(x2, y + 28);
  for (let x = x1 + 150; x < x2 - 40; x += 170) {
    g.lineStyle(1, 0xa7b0ba, 0.9).moveTo(x, y + 3).lineTo(x, y + 28);
  }
  g.lineStyle(0);
  for (let x = x1 + 40; x < x2 - 60; x += 210) {
    g.beginFill(0xffffff, 0.35).drawPolygon([x, y + 4, x + 26, y + 4, x + 12, y + 20, x - 14, y + 20]).endFill();
  }
  return g;
}
export function t2(PIXI, flag) {
  const b = new PIXI.Graphics();
  const r = 38, frac = flag ? 0.5 : 0;
  b.lineStyle(9, 0xd8d0d6, 1).arc(0, 0, r - 1, 0, Math.PI);
  if (frac > 0) b.lineStyle(9, 0xb0132f, 1).arc(0, 0, r - 1, Math.PI - Math.PI * frac, Math.PI);
  b.lineStyle(0);
  return b;
}
