export function t1(PIXI, flag) {
  const root = new PIXI.Container();
  const nest = new PIXI.Graphics();
  nest.lineStyle(6, 0x241a12, 1);
  for (let i = 0; i < 3; i += 1) {
    nest.moveTo(i, 0);
    nest.lineTo(i + 5, 5);
  }
  root.addChild(nest);
  const birds = new PIXI.Graphics();
  birds.lineStyle(3, 0x0d110e, 0.52);
  birds.moveTo(0, 0).lineTo(4, 4);
  root.addChild(birds);
  root.signViews = [];
  if (flag) return nest;
  const frame = new PIXI.Graphics();
  frame.lineStyle(2, 0xe5cc82, 0.72);
  frame.drawRoundedRect(0, 0, 10, 10, 2);
  frame.zIndex = 4;
  return [nest, birds, frame];
}
